/**
 * Cartridge validation and auto-repair (docs/SPEC.md 8.3).
 * Browser-safe: no Node imports. Used by the server before saving and by the engine before loading.
 */
import {
  Cartridge,
  GRAVITY,
  MAX_DIALOGUE_CHARS,
  MAX_ENEMY_TYPES,
  RIG_SIZES,
  ROOM_MAX_COLS,
  ROOM_MIN_COLS,
  ROOM_ROWS,
  TILE,
  TILES,
  TILE_CHARS,
  TIER_BANDS,
  attackStat,
  tiersFitting,
  type PowerTier,
  type CharacterDef,
  type Rig,
  type Room,
} from "./schema";

// ---------------------------------------------------------------------------
// validateCartridge
// ---------------------------------------------------------------------------

/** Returns every problem found; an empty list means the cartridge is valid. */
export function validateCartridge(json: unknown): string[] {
  const parsed = Cartridge.safeParse(json);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  const cart = parsed.data;
  const problems: string[] = [];
  const { character, world } = cart;

  // Unique ids
  dupes(character.abilities.map((a) => a.id), "character.abilities", problems);
  dupes(world.enemies.map((e) => e.id), "world.enemies", problems);
  dupes(world.rooms.map((r) => r.id), "world.rooms", problems);

  // Abilities: one per slot, and per-mechanic required fields
  const slots = character.abilities.map((a) => a.slot).sort().join(",");
  if (slots !== "1,2,3,4") problems.push(`character.abilities: slots must be exactly 1,2,3,4 (got ${slots})`);
  character.abilities.forEach((a, i) => {
    if (a.mechanic === "projectile" && a.projectileSpeed === undefined) {
      problems.push(`character.abilities.${i}: projectile needs projectileSpeed`);
    }
    if (["melee", "projectile", "beam", "aoe", "teleport"].includes(a.mechanic) && a.range <= 0) {
      problems.push(`character.abilities.${i}: ${a.mechanic} needs range > 0`);
    }
    if (a.mechanic === "flight" && a.duration <= 0) problems.push(`character.abilities.${i}: flight needs duration > 0`);
    if (a.mechanic === "superJump" && a.ratio <= 1) problems.push(`character.abilities.${i}: superJump needs ratio > 1`);
  });

  // Power tiers: every fighter declares one and its stats must fit that tier's band
  checkTier(character, "character", problems);
  world.enemies.forEach((e, i) => checkTier(e, `world.enemies.${i} (${e.name})`, problems));
  checkTier(world.boss, `world.boss (${world.boss.name})`, problems);

  // Rigs fit their canvas
  checkRig(character.rig, "character.rig", problems);
  world.enemies.forEach((e, i) => checkRig(e.rig, `world.enemies.${i}.rig`, problems));
  checkRig(world.boss.rig, "world.boss.rig", problems);
  (world.npcs ?? []).forEach((n, i) => checkRig(n.rig, `world.npcs.${i}.rig`, problems));
  dupes((world.npcs ?? []).map((n) => n.id), "world.npcs", problems);

  // Props fit their canvas, and placements point at real props inside the room
  dupes((world.props ?? []).map((p) => p.id), "world.props", problems);
  (world.props ?? []).forEach((prop, i) => {
    for (const s of prop.shapes) {
      const [x0, y0, x1, y1] = s.type === "rect" ? [s.x, s.y, s.x + s.w, s.y + s.h] : [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
      if (x0 < -0.5 || y0 < -0.5 || x1 > prop.size.w + 0.5 || y1 > prop.size.h + 0.5) {
        problems.push(`world.props.${i} (${prop.id}): a shape goes outside its ${prop.size.w}x${prop.size.h} canvas`);
        break;
      }
    }
  });
  const propIds = new Set((world.props ?? []).map((p) => p.id));
  world.rooms.forEach((room, i) => {
    const cols = room.layout[0]?.length ?? 0;
    (room.props ?? []).forEach((pl, j) => {
      if (!propIds.has(pl.prop)) problems.push(`world.rooms.${i}.props.${j}: unknown prop "${pl.prop}"`);
      if (pl.col >= cols || pl.row >= ROOM_ROWS) problems.push(`world.rooms.${i}.props.${j}: (${pl.col}, ${pl.row}) is outside the room`);
    });
  });

  // Rooms
  const roomIds = new Set(world.rooms.map((r) => r.id));
  world.rooms.forEach((room, i) => {
    const p = `world.rooms.${i}`;
    const isLast = i === world.rooms.length - 1;
    if (room.isBossRoom !== isLast) problems.push(`${p}: ${isLast ? "the last room must be the boss room" : "only the last room may be the boss room"}`);
    checkLayout(room, p, world.enemies.length, world.npcs?.length ?? 0, problems);
    if (room.isBossRoom) {
      if (room.exit.toRoom !== "END") problems.push(`${p}.exit.toRoom: boss room must exit to "END"`);
    } else if (!roomIds.has(room.exit.toRoom) || room.exit.toRoom === room.id) {
      problems.push(`${p}.exit.toRoom: "${room.exit.toRoom}" is not another room in this world`);
    }
  });

  // Reachability for the default character (only if layouts are structurally fine)
  if (problems.length === 0) {
    world.rooms.forEach((room, i) => {
      const target = room.isBossRoom ? TILES.BOSS : TILES.EXIT;
      if (!canReach(room, character, target)) {
        problems.push(`world.rooms.${i}: ${character.name} cannot reach the ${room.isBossRoom ? "boss" : "exit"} from the spawn`);
      }
    });
  }

  return problems;
}

function dupes(ids: string[], path: string, problems: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${path}: duplicate id "${id}"`);
    seen.add(id);
  }
}

/** Written so the message can be sent straight back to the AI as a repair instruction. */
function checkTier(f: { name: string; powerTier?: PowerTier; stats: { HP: number; AD: number; AP: number } }, path: string, problems: string[]) {
  const fits = tiersFitting(f.stats);
  const hint = fits.length ? `its stats fit "${fits.join('" or "')}"` : "its stats fit no tier";
  if (!f.powerTier) {
    problems.push(`${path}: missing powerTier (${hint}); pick the tier that matches the source material, then set stats inside that tier's band`);
    return;
  }
  const b = TIER_BANDS[f.powerTier];
  const atk = attackStat(f.stats);
  const off: string[] = [];
  if (f.stats.HP < b.hp[0] || f.stats.HP > b.hp[1]) off.push(`HP ${f.stats.HP} not in ${b.hp[0]}-${b.hp[1]}`);
  if (atk < b.atk[0] || atk > b.atk[1]) off.push(`max(AD, AP) ${atk} not in ${b.atk[0]}-${b.atk[1]}`);
  if (off.length) {
    problems.push(`${path}: stats don't match powerTier "${f.powerTier}" (${off.join(", ")}; ${hint}). Keep the tier that fits the source and move the stats into its band`);
  }
}

function checkRig(rig: Rig, path: string, problems: string[]) {
  const { w, h } = RIG_SIZES[rig.sizeClass];
  const eps = 0.5;
  const all = [
    ...Object.entries(rig.parts)
      .filter(([k]) => k !== "extras")
      .flatMap(([k, shapes]) => (shapes as Rig["parts"]["head"]).map((s) => [k, s] as const)),
    ...rig.parts.extras.flatMap((e, i) => e.shapes.map((s) => [`extras.${i}`, s] as const)),
  ];
  for (const [part, s] of all) {
    const [x0, y0, x1, y1] = s.type === "rect" ? [s.x, s.y, s.x + s.w, s.y + s.h] : [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
    if (x0 < -eps || y0 < -eps || x1 > w + eps || y1 > h + eps) {
      problems.push(`${path}.parts.${part}: shape goes outside the ${rig.sizeClass} canvas (${w}x${h})`);
    }
  }
  for (const [name, [x, y]] of Object.entries(rig.pivots)) {
    if (x < 0 || y < 0 || x > w || y > h) problems.push(`${path}.pivots.${name}: outside the canvas`);
  }
}

function checkLayout(room: Room, p: string, enemyCount: number, npcCount: number, problems: string[]) {
  const width = room.layout[0]?.length ?? 0;
  if (width < ROOM_MIN_COLS || width > ROOM_MAX_COLS) problems.push(`${p}.layout: width ${width} must be ${ROOM_MIN_COLS}-${ROOM_MAX_COLS}`);
  room.layout.forEach((row, r) => {
    if (row.length !== width) problems.push(`${p}.layout.${r}: width ${row.length}, expected ${width}`);
    for (const ch of row) if (!TILE_CHARS.includes(ch)) problems.push(`${p}.layout.${r}: unknown tile "${ch}"`);
  });
  const all = room.layout.join("");
  const count = (ch: string) => all.split(ch).length - 1;
  if (count(TILES.SPAWN) !== 1) problems.push(`${p}: needs exactly one spawn "S" (found ${count(TILES.SPAWN)})`);
  if (room.isBossRoom) {
    if (count(TILES.BOSS) !== 1) problems.push(`${p}: boss room needs exactly one "B" (found ${count(TILES.BOSS)})`);
    if (count(TILES.EXIT) !== 0) problems.push(`${p}: boss room must not have an exit "E"`);
  } else {
    if (count(TILES.EXIT) !== 1) problems.push(`${p}: needs exactly one exit "E" (found ${count(TILES.EXIT)})`);
    if (count(TILES.BOSS) !== 0) problems.push(`${p}: only the boss room may have "B"`);
  }
  for (let n = 1; n <= MAX_ENEMY_TYPES; n++) {
    if (count(String(n)) > 0 && n > enemyCount) problems.push(`${p}: uses enemy "${n}" but the world has ${enemyCount} enemy type(s)`);
  }
  ["a", "b", "c"].forEach((ch, i) => {
    if (count(ch) > 0 && i >= npcCount) problems.push(`${p}: uses NPC "${ch}" but the world has ${npcCount} NPC(s)`);
  });
}

// ---------------------------------------------------------------------------
// Reachability: can the character get from S to the target on the tile grid?
// Approximation: walking, falling, and jumps within the character's jump arc.
// Destructible "X" counts as passable (any attack breaks it). Spikes hurt but don't block.
// ---------------------------------------------------------------------------

export function canReach(room: Room, ch: CharacterDef, target: string): boolean {
  const rows = room.layout.length;
  const cols = room.layout[0].length;
  const at = (c: number, r: number) => (r < 0 ? "." : r >= rows || c < 0 || c >= cols ? "#" : room.layout[r][c]);
  // Outside the room counts as solid, except below it (falling out = death, handled by land()).
  const solid = (c: number, r: number) => c < 0 || c >= cols || r < 0 || (r < rows && room.layout[r][c] === TILES.GROUND);
  const support = (c: number, r: number) => r + 1 < rows && "#=X".includes(at(c, r + 1));
  const bodyTiles = Math.max(1, Math.ceil(ch.collisionBox.h / TILE));
  const fits = (c: number, r: number) => {
    for (let k = 0; k < bodyTiles; k++) if (solid(c, r - k)) return false;
    return true;
  };

  const flies = ch.movement.canFly || ch.tags.includes("FLIGHT") || ch.abilities.some((a) => a.mechanic === "flight");
  if (flies) return true; // free movement: assume any open target is reachable

  const superJump = ch.abilities.find((a) => a.mechanic === "superJump");
  const v = ch.movement.jumpStrength * (superJump ? superJump.ratio : 1);
  const jumpTiles = Math.max(1, Math.floor((v * v) / (2 * GRAVITY) / TILE));
  const airTime = (2 * v) / GRAVITY;
  const reachTiles = Math.max(2, Math.floor((ch.movement.speed * airTime) / TILE));
  const teleport = ch.abilities.find((a) => a.mechanic === "teleport");
  const teleportTiles = teleport ? Math.floor(teleport.range / TILE) : 0;

  // Find the target and the spawn
  let spawn: [number, number] | null = null;
  const targets: [number, number][] = [];
  room.layout.forEach((row, r) =>
    [...row].forEach((t, c) => {
      if (t === TILES.SPAWN) spawn = [c, r];
      if (t === target) targets.push([c, r]);
    }),
  );
  if (!spawn || targets.length === 0) return false;

  // Drop from a position to the first standable cell below (null if it falls out of the room)
  const land = (c: number, r: number): [number, number] | null => {
    for (let y = r; y < rows; y++) {
      if (solid(c, y)) return null;
      if (support(c, y) && fits(c, y)) return [c, y];
    }
    return null;
  };

  const start = land(spawn[0], spawn[1]);
  if (!start) return false;
  const key = (c: number, r: number) => r * cols + c;
  const seen = new Set<number>([key(...start)]);
  const queue: [number, number][] = [start];

  const touches = (c: number, r: number) =>
    targets.some(([tc, tr]) => Math.abs(tc - c) <= 1 && tr <= r && tr >= r - Math.max(jumpTiles, bodyTiles));

  const visit = (c: number, r: number) => {
    const landed = land(c, r);
    if (!landed) return;
    const k = key(...landed);
    if (!seen.has(k)) {
      seen.add(k);
      queue.push(landed);
    }
  };

  while (queue.length) {
    const [c, r] = queue.shift()!;
    if (touches(c, r)) return true;

    // Walk (and fall off edges)
    for (const dc of [-1, 1]) if (fits(c + dc, r)) visit(c + dc, r);

    // Jump: how high can we actually go before hitting a ceiling?
    let peak = 0;
    while (peak < jumpTiles && fits(c, r - peak - 1)) peak++;
    // Rise to an apex row, travel sideways along it, then drop into the target column.
    // The whole path must be clear, so walls and ceilings block jumps.
    for (let dc = -reachTiles; dc <= reachTiles; dc++) {
      const tc = c + dc;
      if (tc < 0 || tc >= cols || dc === 0) continue;
      const step = Math.sign(dc);
      for (let apex = r - peak; apex <= r; apex++) {
        let clear = true;
        for (let x = c + step; clear && x !== tc + step; x += step) clear = fits(x, apex);
        if (clear) {
          visit(tc, apex); // land() drops from the apex to the floor below
          // Also allow landing on platforms between the apex and our current row
          for (let y = apex; y <= r && fits(tc, y); y++) if (support(tc, y)) visit(tc, y);
        }
      }
    }
    for (let apex = r - peak; apex < r; apex++) if (support(c, apex) && fits(c, apex)) visit(c, apex); // straight up onto a platform

    // Teleport to any open spot in range
    if (teleportTiles > 0) {
      for (let dy = -teleportTiles; dy <= teleportTiles; dy++) {
        for (let dc = -teleportTiles; dc <= teleportTiles; dc++) {
          const tc = c + dc;
          const tr = r + dy;
          if (tc >= 0 && tc < cols && tr >= 0 && tr < rows && fits(tc, tr)) visit(tc, tr);
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// autoFix: cheap, deterministic repairs before validation (SPEC 8.3).
// Takes raw AI output; returns a repaired deep copy. Never throws.
// ---------------------------------------------------------------------------

type AnyObj = Record<string, any>;

export function autoFix<T>(json: T): T {
  if (!json || typeof json !== "object") return json;
  const cart: AnyObj = JSON.parse(JSON.stringify(json));

  // Normalise tier spelling ("Peak Human" -> "peak-human"). Never invent a tier: a missing one stays missing.
  const fixTier = (f: AnyObj | undefined) => {
    if (f && typeof f.powerTier === "string") f.powerTier = kebab(f.powerTier);
  };
  fixTier(cart.character);
  if (cart.world && typeof cart.world === "object") {
    (Array.isArray(cart.world.enemies) ? cart.world.enemies : []).forEach(fixTier);
    fixTier(cart.world.boss);
  }

  const ch = cart.character;
  if (ch && typeof ch === "object") {
    if (ch.id) ch.id = kebab(ch.id);
    fixStats(ch.stats);
    if (ch.movement) {
      clamp(ch.movement, "speed", 60, 400);
      clamp(ch.movement, "jumpStrength", 200, 900);
      if (typeof ch.movement.canFly !== "boolean") ch.movement.canFly = false;
    }
    if (Array.isArray(ch.abilities)) {
      ch.abilities.forEach((a: AnyObj, i: number) => {
        if (!a || typeof a !== "object") return;
        if (a.id) a.id = kebab(a.id);
        a.slot = i + 1;
        clamp(a, "ratio", 0, 10);
        clamp(a, "range", 0, 1600);
        clamp(a, "cooldown", 0, 60);
        clamp(a, "duration", 0, 30);
        clamp(a, "knockback", -1000, 2000);
        if (a.mechanic === "projectile" && typeof a.projectileSpeed !== "number") a.projectileSpeed = 400;
        if (typeof a.projectileSpeed === "number") clamp(a, "projectileSpeed", 50, 2000);
        if (!Array.isArray(a.attackTags)) a.attackTags = [];
      });
    }
    if (!Array.isArray(ch.tags)) ch.tags = [];
  }

  const world = cart.world;
  if (world && typeof world === "object") {
    if (world.id) world.id = kebab(world.id);
    const fighters: AnyObj[] = [...(Array.isArray(world.enemies) ? world.enemies : []), world.boss].filter(Boolean);
    for (const e of fighters) {
      if (e.id) e.id = kebab(e.id);
      fixStats(e.stats);
      clamp(e, "speed", 0, 400);
      if (e.attack) {
        clamp(e.attack, "ratio", 0, 10);
        clamp(e.attack, "range", 0, 1600);
        clamp(e.attack, "cooldown", 0.2, 30);
        if (!Array.isArray(e.attack.attackTags)) e.attack.attackTags = [];
      }
      if (!Array.isArray(e.tags)) e.tags = [];
    }
    if (world.boss) clamp(world.boss, "phaseAt", 0, 1);
    if (!Array.isArray(world.npcs)) world.npcs = [];
    if (!Array.isArray(world.props)) world.props = [];
    for (const n of world.npcs) if (n?.id) n.id = kebab(n.id);
    for (const p of world.props) if (p?.id) p.id = kebab(p.id);

    if (Array.isArray(world.rooms)) {
      world.rooms.forEach((room: AnyObj, i: number) => {
        if (!room || typeof room !== "object") return;
        if (room.id) room.id = kebab(room.id);
        room.isBossRoom = i === world.rooms.length - 1;
        if (room.isBossRoom) room.exit = { toRoom: "END" };
        if (Array.isArray(room.layout)) room.layout = fixLayout(room.layout);
      });
      // Non-boss rooms exit to the next room
      world.rooms.forEach((room: AnyObj, i: number) => {
        if (room && !room.isBossRoom && world.rooms[i + 1]?.id) room.exit = { toRoom: world.rooms[i + 1].id };
      });
    }

    const d = world.dialogue;
    if (d && typeof d === "object") {
      const trimLines = (lines: unknown) =>
        Array.isArray(lines)
          ? lines.slice(0, 3).map((l: AnyObj) => ({ ...l, text: String(l?.text ?? "").slice(0, MAX_DIALOGUE_CHARS) }))
          : [];
      if (Array.isArray(d.roomIntro)) d.roomIntro = d.roomIntro.map(trimLines);
      d.bossIntro = trimLines(d.bossIntro);
      d.bossDefeated = trimLines(d.bossDefeated);
      d.playerDefeated = trimLines(d.playerDefeated);
    }
  }

  return cart as T;
}

function kebab(s: unknown): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

function clamp(obj: AnyObj, key: string, min: number, max: number) {
  if (obj && typeof obj[key] === "number" && Number.isFinite(obj[key])) {
    obj[key] = Math.min(max, Math.max(min, obj[key]));
  }
}

function fixStats(stats: AnyObj | undefined) {
  if (!stats || typeof stats !== "object") return;
  for (const k of ["AD", "AP", "ARM", "MR", "ARM_PEN", "MAGIC_PEN"]) {
    if (typeof stats[k] !== "number" || !Number.isFinite(stats[k])) stats[k] = 0;
    clamp(stats, k, 0, 1_000_000);
  }
  if (typeof stats.HP !== "number" || !Number.isFinite(stats.HP)) stats.HP = 1;
  clamp(stats, "HP", 1, 1_000_000);
}

/** Exactly ROOM_ROWS rows, all the same width within bounds. Pads ground rows with ground. */
function fixLayout(layout: unknown[]): string[] {
  let rows = layout.map((r) => String(r ?? ""));
  if (rows.length > ROOM_ROWS) rows = rows.slice(rows.length - ROOM_ROWS); // keep the floor
  while (rows.length < ROOM_ROWS) rows.unshift("");
  const widest = Math.max(...rows.map((r) => r.length));
  const width = Math.min(ROOM_MAX_COLS, Math.max(ROOM_MIN_COLS, widest));
  return rows.map((row) => {
    if (row.length > width) return row.slice(0, width);
    const last = row[row.length - 1];
    const pad = last === TILES.GROUND ? TILES.GROUND : TILES.EMPTY;
    return row + pad.repeat(width - row.length);
  });
}
