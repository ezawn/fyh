/** Player ability mechanics (SPEC 4.3). */
import type { Ability, CharacterDef, Mechanic } from "../../shared/schema";
import type { AbilityUseResult, RuntimeEntity } from "../types";
import type { CombatWorld } from "./world";
import { centerOf, rectOf } from "./geom";

export const IMPLEMENTED: readonly Mechanic[] = ["melee", "projectile", "beam", "dash", "superJump", "flight", "aoe", "teleport"];

function colorFor(a: Ability): number {
  if (a.attackTags.includes("SPACE_BYPASS") || a.attackTags.includes("NULLIFY")) return 0xb35cff;
  if (a.damageType === "magic") return 0x5cd6ff;
  if (a.damageType === "mixed") return 0xff7ad9;
  return 0xffe08a;
}

export function useAbility(w: CombatWorld, character: CharacterDef, slot: 1 | 2 | 3 | 4): AbilityUseResult {
  const p = w.player;
  const now = w.now();
  if (!p.alive) return "blocked";
  const ability = character.abilities.find((a) => a.slot === slot) ?? character.abilities[slot - 1];
  if (!ability || !IMPLEMENTED.includes(ability.mechanic)) return "unsupported";
  if (now < p.cooldownReadyAt[slot - 1]) return "cooldown";

  const res = perform(w, p, ability, now);
  if (res === "used") {
    p.cooldownReadyAt[slot - 1] = now + ability.cooldown * 1000;
    const anim = ability.mechanic === "beam" ? Math.max(250, ability.duration * 1000) : 220;
    p.attackAnim = { kind: ability.animation, angle: p.aimAngle, until: now + anim };
    const cx = Math.cos(p.aimAngle);
    if (Math.abs(cx) > 0.15) p.facing = cx < 0 ? -1 : 1;
  }
  return res;
}

function perform(w: CombatWorld, p: RuntimeEntity, a: Ability, now: number): AbilityUseResult {
  const ctx = w.ctx;
  const ang = p.aimAngle;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const c = centerOf(p);
  const r = rectOf(p);
  const color = colorFor(a);

  switch (a.mechanic) {
    case "melee": {
      const size = Math.max(12, a.range);
      // Distance from the body centre to its edge along the aim direction.
      const ax = Math.abs(dx) > 1e-3 ? r.w / 2 / Math.abs(dx) : Infinity;
      const ay = Math.abs(dy) > 1e-3 ? r.h / 2 / Math.abs(dy) : Infinity;
      const reach = Math.min(ax, ay) - 2; // slight overlap so point-blank targets are hit
      const mx = c.x + dx * (reach + size / 2);
      const my = c.y + dy * (reach + size / 2);
      const box = { x: mx - size / 2, y: my - size / 2, w: size, h: size };
      w.hitRect(p, a, box, c);
      w.fx.add({ kind: "rect", ...box, color, born: now, until: now + 110 });
      return "used";
    }
    case "projectile": {
      w.fireProjectile({
        owner: p,
        attack: a,
        x: c.x + dx * (r.w / 2 + 2),
        y: c.y + dy * (r.h / 4),
        angle: ang,
        speed: a.projectileSpeed ?? 400,
        range: a.range,
        radius: a.ratio >= 2 ? 4 : 3,
        color,
      });
      return "used";
    }
    case "beam": {
      w.fireBeam({ owner: p, attack: a, angle: ang, length: a.range, width: 5, durationMs: a.duration * 1000, color });
      return "used";
    }
    case "aoe": {
      const radius = Math.max(8, a.range);
      w.hitCircle(p, a, c.x, c.y, radius);
      w.fx.add({ kind: "ring", x: c.x, y: c.y, r: radius, color, born: now, until: now + Math.max(250, a.duration * 1000) });
      return "used";
    }
    case "dash": {
      const dur = Math.max(0.08, a.duration || 0.2);
      const speed = Math.max(60, a.range) / dur;
      const until = now + dur * 1000;
      p.dash = { until, vx: dx * speed, vy: dy * speed };
      p.invulnUntil = Math.max(p.invulnUntil, until);
      if (a.ratio > 0) w.sweep(p, a, until);
      w.fx.add({ kind: "ring", x: c.x, y: c.y, r: 6, color, born: now, until: now + 200 });
      return "used";
    }
    case "superJump": {
      p.superJumpMult = a.ratio > 0 ? Math.max(1, a.ratio) : 1.5;
      w.fx.add({ kind: "ring", x: c.x, y: r.y + r.h, r: 8, color, born: now, until: now + 250 });
      return "used";
    }
    case "flight": {
      const def = p.def as Partial<{ movement: { canFly: boolean } }>;
      if (!p.tags.includes("FLIGHT") && !def.movement?.canFly) return "blocked";
      p.flightUntil = now + Math.max(0.5, a.duration) * 1000;
      w.fx.add({ kind: "ring", x: c.x, y: c.y, r: 10, color, born: now, until: now + 300 });
      return "used";
    }
    case "teleport": {
      const ptr = ctx.pointerWorld();
      let tx = ptr.x - c.x;
      let ty = ptr.y - c.y;
      const d = Math.hypot(tx, ty);
      const range = Math.max(16, a.range);
      if (d > range) {
        tx = (tx / d) * range;
        ty = (ty / d) * range;
      }
      // Walk back toward the player until the body fits.
      const len = Math.hypot(tx, ty);
      for (let s = len; s >= 0; s -= 4) {
        const k = len > 0 ? s / len : 0;
        const nx = c.x + tx * k;
        const ny = c.y + ty * k;
        if (fits(w, nx, ny, r.w, r.h)) {
          if (s < 8) return "blocked";
          const go = p.body;
          const ox = go.x - c.x; // game object origin vs body centre
          const oy = go.y - c.y;
          p.body.body.reset(nx + ox, ny + oy);
          if (a.ratio > 0) w.hitCircle(p, a, nx, ny, 20);
          w.fx.add({ kind: "ring", x: c.x, y: c.y, r: 10, color, born: now, until: now + 250 });
          w.fx.add({ kind: "ring", x: nx, y: ny, r: 10, color, born: now, until: now + 250 });
          return "used";
        }
      }
      return "blocked";
    }
  }
  return "unsupported";
}

function fits(w: CombatWorld, cx: number, cy: number, bw: number, bh: number): boolean {
  const hw = bw / 2 - 1;
  const hh = bh / 2 - 1;
  const pts: [number, number][] = [
    [cx, cy],
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx - hw, cy + hh],
    [cx + hw, cy + hh],
    [cx - hw, cy],
    [cx + hw, cy],
    [cx, cy - hh],
    [cx, cy + hh],
  ];
  const b = w.ctx.scene.physics.world.bounds;
  if (cx - hw < b.x || cx + hw > b.right || cy - hh < b.y) return false;
  return pts.every(([x, y]) => !w.ctx.isSolidAt(x, y));
}
