/**
 * OFFLINE STUB DATA. Shown only when the server is unreachable or returns 5xx
 * (the UI then shows an "Offline" banner). Public-domain characters only:
 * Count Orlok (Nosferatu, 1922) and Alice (Alice in Wonderland, 1903 film / 1865 book).
 */
import { toCharacterSummary, toWorldSummary, type CharacterSummary, type SessionResponse, type WorldSummary } from "../shared/api";
import { RIG_SIZES, type Cartridge, type Rig, type SizeClass } from "../shared/schema";

// ---------- helpers ----------

/** A plain humanoid rig that fits its canvas, for stub enemies and bosses. */
function humanoid(sizeClass: SizeClass, c: { skin: string; body: string; limb: string; legs: string }): Rig {
  const { w, h } = RIG_SIZES[sizeClass];
  const cx = Math.floor(w / 2);
  const headH = Math.round(h * 0.25);
  const torsoH = Math.round(h * 0.4);
  const legH = h - headH - torsoH;
  const headW = Math.max(4, Math.round(w * 0.44));
  const torsoW = Math.max(4, Math.round(w * 0.5));
  const limbW = Math.max(1, Math.round(w * 0.14));
  const tx = cx - Math.floor(torsoW / 2);
  return {
    sizeClass,
    parts: {
      head: [{ type: "rect", x: cx - Math.floor(headW / 2), y: 0, w: headW, h: headH, color: c.skin }],
      torso: [{ type: "rect", x: tx, y: headH, w: torsoW, h: torsoH, color: c.body }],
      armBack: [{ type: "rect", x: tx - limbW, y: headH + 1, w: limbW, h: torsoH - 1, color: c.limb }],
      armFront: [{ type: "rect", x: tx + torsoW, y: headH + 1, w: limbW, h: torsoH - 1, color: c.limb }],
      legBack: [{ type: "rect", x: tx, y: headH + torsoH, w: limbW + 1, h: legH, color: c.legs }],
      legFront: [{ type: "rect", x: tx + torsoW - limbW - 1, y: headH + torsoH, w: limbW + 1, h: legH, color: c.legs }],
      extras: [],
    },
    pivots: { neck: [cx, headH], shoulder: [cx, headH + 1], hip: [cx, headH + torsoH] },
  };
}

/** A 14-row, flat-floored room layout (rows 12-13 ground, actors stand on row 11). */
function layout(o: {
  width?: number;
  spawn: number;
  exit?: number;
  boss?: number;
  enemies?: [number, string][];
  platforms?: [number, number, number][]; // [col, row, length]
  spikes?: number[];
}): string[] {
  const W = o.width ?? 40;
  const g: string[][] = Array.from({ length: 14 }, (_, r) => Array.from({ length: W }, () => (r >= 12 ? "#" : ".")));
  for (const [col, row, len] of o.platforms ?? []) for (let i = 0; i < len; i++) g[row][col + i] = "=";
  for (const col of o.spikes ?? []) g[11][col] = "^";
  for (const [col, ch] of o.enemies ?? []) g[11][col] = ch;
  g[11][o.spawn] = "S";
  if (o.exit !== undefined) g[11][o.exit] = "E";
  if (o.boss !== undefined) g[11][o.boss] = "B";
  return g.map((r) => r.join(""));
}

// ---------- Count Orlok / Nosferatu ----------

const ORLOK_RIG: Rig = {
  sizeClass: "tall", // 16x40
  parts: {
    head: [
      { type: "rect", x: 5, y: 1, w: 6, h: 8, color: "#d8d8c0" },
      { type: "rect", x: 4, y: 2, w: 1, h: 3, color: "#c4c4a8" },
      { type: "rect", x: 11, y: 2, w: 1, h: 3, color: "#c4c4a8" },
      { type: "rect", x: 6, y: 4, w: 1, h: 1, color: "#300000" },
      { type: "rect", x: 9, y: 4, w: 1, h: 1, color: "#300000" },
      { type: "rect", x: 7, y: 7, w: 2, h: 1, color: "#ffffff" },
    ],
    torso: [
      { type: "rect", x: 4, y: 9, w: 8, h: 17, color: "#1c1c24" },
      { type: "rect", x: 7, y: 12, w: 1, h: 1, color: "#70707a" },
      { type: "rect", x: 7, y: 16, w: 1, h: 1, color: "#70707a" },
      { type: "rect", x: 7, y: 20, w: 1, h: 1, color: "#70707a" },
    ],
    armBack: [
      { type: "rect", x: 3, y: 10, w: 2, h: 13, color: "#121218" },
      { type: "rect", x: 3, y: 23, w: 2, h: 3, color: "#c4c4a8" },
    ],
    armFront: [
      { type: "rect", x: 11, y: 10, w: 2, h: 13, color: "#26262e" },
      { type: "rect", x: 11, y: 23, w: 2, h: 4, color: "#d8d8c0" },
    ],
    legBack: [{ type: "rect", x: 5, y: 26, w: 3, h: 14, color: "#101016" }],
    legFront: [{ type: "rect", x: 8, y: 26, w: 3, h: 14, color: "#18181f" }],
    extras: [{ attachTo: "torso", shapes: [{ type: "rect", x: 4, y: 9, w: 8, h: 2, color: "#2e2e3a" }] }],
  },
  pivots: { neck: [8, 9], shoulder: [8, 10], hip: [8, 26] },
};

const RAT_RIG: Rig = {
  sizeClass: "tiny", // 12x16
  parts: {
    head: [
      { type: "rect", x: 8, y: 9, w: 3, h: 3, color: "#7a6e66" },
      { type: "rect", x: 10, y: 10, w: 1, h: 1, color: "#e04040" },
    ],
    torso: [{ type: "rect", x: 2, y: 10, w: 7, h: 4, color: "#5e544e" }],
    armBack: [],
    armFront: [],
    legBack: [{ type: "rect", x: 3, y: 14, w: 1, h: 2, color: "#3e3632" }],
    legFront: [{ type: "rect", x: 7, y: 14, w: 1, h: 2, color: "#3e3632" }],
    extras: [{ attachTo: "torso", shapes: [{ type: "rect", x: 0, y: 11, w: 2, h: 1, color: "#c09080" }] }],
  },
  pivots: { neck: [8, 11], shoulder: [7, 11], hip: [5, 14] },
};

const NOSFERATU: Cartridge = {
  id: "stub-nosferatu-orlok",
  schemaVersion: 1,
  status: "ready",
  source: { title: "Nosferatu", medium: "film", versionOrEpisode: "1922 silent film", requestedCharacter: "Count Orlok" },
  character: {
    id: "stub-count-orlok",
    name: "Count Orlok",
    source: "Nosferatu (1922)",
    versionOrEpisode: "Silent-film version",
    assumptions: [
      "Street-level super: overpowers grown men and commands rats and plague.",
      "Plague Swarm modelled as a projectile; the shadow glide as a dash.",
      "Sunlight weakness is not a hax tag, so the engine ignores it.",
    ],
    rig: ORLOK_RIG,
    collisionBox: { w: 10, h: 38 },
    movement: { speed: 110, jumpStrength: 420, canFly: false },
    stats: { HP: 900, AD: 120, AP: 220, ARM: 40, MR: 120, ARM_PEN: 0, MAGIC_PEN: 20 },
    tags: ["REGENERATION"],
    abilities: [
      { id: "claw-swipe", name: "Claw Swipe", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 28, cooldown: 0.5, duration: 0, knockback: 120, animation: "swing" },
      { id: "plague-swarm", name: "Plague Swarm", slot: 2, mechanic: "projectile", damageType: "magic", attackTags: [], ratio: 1.4, range: 320, cooldown: 2, duration: 0, projectileSpeed: 260, knockback: 40, animation: "cast" },
      { id: "shadow-glide", name: "Shadow Glide", slot: 3, mechanic: "dash", damageType: "physical", attackTags: [], ratio: 0, range: 120, cooldown: 3, duration: 0.3, knockback: 0, animation: "cast" },
      { id: "sunless-night", name: "Sunless Night", slot: 4, mechanic: "aoe", damageType: "magic", attackTags: ["ENERGY"], ratio: 3, range: 96, cooldown: 12, duration: 0.5, knockback: 300, animation: "cast" },
    ],
  },
  world: {
    id: "stub-wisborg-carpathians",
    name: "Road to the Carpathians",
    source: "Nosferatu (1922)",
    visualStyle: {
      palette: { sky: "#140c26", skyBottom: "#4a2e52", ground: "#2a2420", groundTop: "#5a5040", platform: "#6a5a48", accent: "#e8e0a0" },
      backdrop: "mountains",
    },
    enemies: [
      {
        id: "plague-rat",
        name: "Plague Rat",
        rig: RAT_RIG,
        collisionBox: { w: 10, h: 6 },
        stats: { HP: 10, AD: 4, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
        tags: [],
        behaviour: "walker",
        speed: 90,
        attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 12, cooldown: 1 },
      },
    ],
    boss: {
      id: "knock",
      name: "Knock the Estate Agent",
      rig: humanoid("human", { skin: "#d0b090", body: "#4a3a2a", limb: "#3a2c20", legs: "#2a2018" }),
      collisionBox: { w: 10, h: 30 },
      stats: { HP: 300, AD: 40, AP: 0, ARM: 10, MR: 5, ARM_PEN: 0, MAGIC_PEN: 0 },
      tags: [],
      behaviour: "jumper",
      speed: 120,
      attack: { damageType: "physical", ratio: 1.2, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.2 },
      pattern: ["charge", "jump"],
      phaseAt: 0.4,
    },
    rooms: [
      { id: "room-1", name: "Wisborg Harbour", objective: "Reach the coach road", layout: layout({ spawn: 2, exit: 37, enemies: [[14, "1"], [26, "1"]], platforms: [[10, 8, 5], [22, 7, 4]], spikes: [19] }), isBossRoom: false, exit: { toRoom: "room-2" } },
      { id: "room-2", name: "Carpathian Pass", objective: "Cross the pass", layout: layout({ spawn: 2, exit: 37, enemies: [[12, "1"], [20, "1"], [30, "1"]], platforms: [[8, 8, 4], [16, 6, 4], [27, 8, 5]], spikes: [24, 25] }), isBossRoom: false, exit: { toRoom: "room-3" } },
      { id: "room-3", name: "The Asylum Yard", objective: "Defeat Knock", layout: layout({ spawn: 3, boss: 32, platforms: [[12, 8, 6], [24, 8, 6]] }), isBossRoom: true, exit: { toRoom: "END" } },
    ],
    dialogue: {
      roomIntro: [
        [{ speaker: "Narrator", text: "Wisborg, 1838. A shadow falls over the harbour." }],
        [{ speaker: "Narrator", text: "Beyond the pass, the phantoms come to meet you." }],
        [{ speaker: "Knock", text: "The master is coming! The master is near!" }],
      ],
      bossIntro: [{ speaker: "Knock", text: "Blood is life!" }],
      bossDefeated: [{ speaker: "Narrator", text: "The estate agent's cackling finally stops." }],
      playerDefeated: [{ speaker: "Narrator", text: "The plague claims another traveller." }],
    },
  },
  notes: {
    sourceFacts: ["Count Orlok is the vampire of the 1922 film Nosferatu.", "Knock is Orlok's estate agent in Wisborg."],
    designChoices: ["Knock is the boss.", "Rats act as basic enemies."],
  },
  createdAt: "2026-11-21T00:00:00.000Z",
};

// ---------- Alice / Wonderland ----------

const ALICE_RIG: Rig = {
  sizeClass: "human", // 16x32
  parts: {
    head: [
      { type: "circle", x: 8, y: 6, r: 4, color: "#f4d6b8" },
      { type: "rect", x: 6, y: 6, w: 1, h: 1, color: "#1a3a8a" },
      { type: "rect", x: 9, y: 6, w: 1, h: 1, color: "#1a3a8a" },
    ],
    torso: [
      { type: "rect", x: 4, y: 10, w: 8, h: 12, color: "#3a6ad8" },
      { type: "rect", x: 5, y: 12, w: 6, h: 9, color: "#f4f4f4" },
    ],
    armBack: [
      { type: "rect", x: 3, y: 11, w: 2, h: 8, color: "#2e5ac0" },
      { type: "rect", x: 3, y: 19, w: 2, h: 2, color: "#e8c8a8" },
    ],
    armFront: [
      { type: "rect", x: 11, y: 11, w: 2, h: 8, color: "#4a7ae8" },
      { type: "rect", x: 11, y: 19, w: 2, h: 2, color: "#f4d6b8" },
    ],
    legBack: [
      { type: "rect", x: 5, y: 22, w: 2, h: 8, color: "#e0e0e0" },
      { type: "rect", x: 5, y: 30, w: 3, h: 2, color: "#1a1a1a" },
    ],
    legFront: [
      { type: "rect", x: 9, y: 22, w: 2, h: 8, color: "#ffffff" },
      { type: "rect", x: 9, y: 30, w: 3, h: 2, color: "#1a1a1a" },
    ],
    extras: [
      {
        attachTo: "head",
        shapes: [
          { type: "rect", x: 4, y: 1, w: 8, h: 3, color: "#f2d04a" },
          { type: "rect", x: 3, y: 3, w: 2, h: 8, color: "#f2d04a" },
          { type: "rect", x: 11, y: 3, w: 2, h: 8, color: "#f2d04a" },
          { type: "rect", x: 4, y: 2, w: 8, h: 1, color: "#1a1a1a" },
        ],
      },
    ],
  },
  pivots: { neck: [8, 10], shoulder: [8, 11], hip: [8, 22] },
};

const CARD_RIG: Rig = (() => {
  const r = humanoid("human", { skin: "#f4d6b8", body: "#f4f4f4", limb: "#d02030", legs: "#d02030" });
  r.parts.extras.push({ attachTo: "torso", shapes: [{ type: "circle", x: 8, y: 14, r: 2, color: "#d02030" }] });
  return r;
})();

const QUEEN_RIG: Rig = (() => {
  const r = humanoid("large", { skin: "#f0c8a0", body: "#c01828", limb: "#901020", legs: "#202020" });
  r.parts.extras.push({
    attachTo: "head",
    shapes: [
      { type: "rect", x: 19, y: 0, w: 10, h: 3, color: "#f0c020" },
      { type: "rect", x: 22, y: 6, w: 4, h: 2, color: "#600010" },
    ],
  });
  return r;
})();

const WONDERLAND: Cartridge = {
  id: "stub-wonderland-alice",
  schemaVersion: 1,
  status: "ready",
  source: { title: "Alice in Wonderland", medium: "film", versionOrEpisode: "1903 silent film", requestedCharacter: "Alice" },
  character: {
    id: "stub-alice",
    name: "Alice",
    source: "Alice in Wonderland (1903)",
    versionOrEpisode: "Book / 1903 film version",
    assumptions: [
      "Ordinary child, a little below the 'ordinary adult' tier.",
      "'Drink Me' growth modelled as a superJump.",
      "The 'curious shout' is an aoe with tiny damage and big knockback.",
    ],
    rig: ALICE_RIG,
    collisionBox: { w: 10, h: 30 },
    movement: { speed: 140, jumpStrength: 460, canFly: false },
    stats: { HP: 25, AD: 3, AP: 0, ARM: 0, MR: 5, ARM_PEN: 0, MAGIC_PEN: 0 },
    tags: [],
    abilities: [
      { id: "shove", name: "Shove", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 18, cooldown: 0.5, duration: 0, knockback: 160, animation: "punch" },
      { id: "teacup-toss", name: "Teacup Toss", slot: 2, mechanic: "projectile", damageType: "physical", attackTags: ["BALLISTIC"], ratio: 1.2, range: 240, cooldown: 1.5, duration: 0, projectileSpeed: 300, knockback: 60, animation: "shoot" },
      { id: "drink-me", name: "Drink Me", slot: 3, mechanic: "superJump", damageType: "physical", attackTags: [], ratio: 2, range: 0, cooldown: 4, duration: 0, knockback: 0, animation: "cast" },
      { id: "curious-shout", name: "Curiouser and Curiouser!", slot: 4, mechanic: "aoe", damageType: "physical", attackTags: [], ratio: 0.5, range: 64, cooldown: 10, duration: 0.3, knockback: 600, animation: "cast" },
    ],
  },
  world: {
    id: "stub-wonderland",
    name: "Wonderland",
    source: "Alice in Wonderland (1903)",
    visualStyle: {
      palette: { sky: "#6ac8f0", skyBottom: "#d8f0ff", ground: "#5a3a20", groundTop: "#48b048", platform: "#c07040", accent: "#f04080" },
      backdrop: "forest",
    },
    enemies: [
      {
        id: "card-soldier",
        name: "Card Soldier",
        rig: CARD_RIG,
        collisionBox: { w: 10, h: 30 },
        stats: { HP: 40, AD: 6, AP: 0, ARM: 3, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
        tags: [],
        behaviour: "walker",
        speed: 70,
        attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.2 },
      },
    ],
    boss: {
      id: "queen-of-hearts",
      name: "The Queen of Hearts",
      rig: QUEEN_RIG,
      collisionBox: { w: 30, h: 46 },
      stats: { HP: 150, AD: 12, AP: 0, ARM: 5, MR: 5, ARM_PEN: 0, MAGIC_PEN: 0 },
      tags: [],
      behaviour: "walker",
      speed: 60,
      attack: { damageType: "physical", ratio: 1.5, attackTags: ["PHYSICAL"], range: 32, cooldown: 1.5 },
      pattern: ["charge", "summon"],
      phaseAt: 0.5,
    },
    rooms: [
      { id: "room-1", name: "The Rabbit Hole", objective: "Follow the White Rabbit", layout: layout({ spawn: 2, exit: 37, enemies: [[18, "1"]], platforms: [[9, 8, 5], [24, 7, 5]] }), isBossRoom: false, exit: { toRoom: "room-2" } },
      { id: "room-2", name: "The Rose Garden", objective: "Get through the garden", layout: layout({ spawn: 2, exit: 37, enemies: [[13, "1"], [22, "1"], [31, "1"]], platforms: [[7, 8, 4], [17, 6, 5], [28, 8, 4]], spikes: [26] }), isBossRoom: false, exit: { toRoom: "room-3" } },
      { id: "room-3", name: "The Croquet Ground", objective: "Defeat the Queen of Hearts", layout: layout({ spawn: 3, boss: 32, platforms: [[14, 8, 5], [24, 8, 5]] }), isBossRoom: true, exit: { toRoom: "END" } },
    ],
    dialogue: {
      roomIntro: [
        [{ speaker: "Alice", text: "Down, down, down. Would the fall never come to an end?" }],
        [{ speaker: "Card Soldier", text: "Quick, paint the roses red before the Queen arrives!" }],
        [{ speaker: "Narrator", text: "The croquet game is about to begin." }],
      ],
      bossIntro: [{ speaker: "The Queen of Hearts", text: "Off with her head!" }],
      bossDefeated: [{ speaker: "Alice", text: "You're nothing but a pack of cards!" }],
      playerDefeated: [{ speaker: "The Queen of Hearts", text: "Next case!" }],
    },
  },
  notes: {
    sourceFacts: ["Alice follows the White Rabbit down the rabbit hole.", "The Queen of Hearts rules Wonderland."],
    designChoices: ["The Queen is the boss.", "Card soldiers are the basic enemies."],
  },
  createdAt: "2026-11-21T00:00:00.000Z",
};

// ---------- exports ----------

export const STUB_CARTRIDGES: Cartridge[] = [NOSFERATU, WONDERLAND];
export const STUB_CHARACTERS: CharacterSummary[] = STUB_CARTRIDGES.map(toCharacterSummary);
export const STUB_WORLDS: WorldSummary[] = STUB_CARTRIDGES.map(toWorldSummary);

export function isStubPair(characterId: string, worldId: string): boolean {
  return STUB_CARTRIDGES.some((c) => c.character.id === characterId) && STUB_CARTRIDGES.some((c) => c.world.id === worldId);
}

/** Local session for offline play: fresh copies, original dialogue. */
export function stubSession(characterId: string, worldId: string): SessionResponse | null {
  const ch = STUB_CARTRIDGES.find((c) => c.character.id === characterId)?.character;
  const w = STUB_CARTRIDGES.find((c) => c.world.id === worldId)?.world;
  if (!ch || !w) return null;
  const world = structuredClone(w);
  return { character: structuredClone(ch), world, dialogue: world.dialogue, dialogueSource: "original" };
}
