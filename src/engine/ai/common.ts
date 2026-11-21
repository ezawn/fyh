/** Shared AI helpers: ground probing and the enemy basic attack. */
import type { EnemyAttack } from "../../shared/schema";
import type { RuntimeEntity } from "../types";
import type { AttackSpec, CombatWorld } from "../combat/world";
import { centerOf, distRectRect, rectOf } from "../combat/geom";

/** Ranges above this fire a projectile instead of swinging. */
export const RANGED_THRESHOLD = 64;
export const ENEMY_MELEE_KNOCKBACK = 180;
export const ENEMY_SHOT_KNOCKBACK = 120;
export const ENEMY_SHOT_SPEED = 220;

export function spec(a: EnemyAttack, knockback: number): AttackSpec {
  return { damageType: a.damageType, ratio: a.ratio, attackTags: a.attackTags, knockback };
}

export function shotColor(a: EnemyAttack): number {
  return a.damageType === "physical" ? 0xff6a3d : a.damageType === "magic" ? 0xc65cff : 0xff3d8b;
}

/** Solid ground or a one-way platform at (x, y). */
export function groundAt(w: CombatWorld, x: number, y: number): boolean {
  if (w.ctx.isSolidAt(x, y)) return true;
  for (const child of w.ctx.oneWays.getChildren()) {
    const b = (child as unknown as { body?: { x: number; y: number; width: number; height: number } }).body;
    if (!b) continue;
    if (x >= b.x && x <= b.x + b.width && y >= b.y - 2 && y <= b.y + b.height + 4) return true;
  }
  return false;
}

export function faceToward(e: RuntimeEntity, target: RuntimeEntity) {
  const a = centerOf(e);
  const b = centerOf(target);
  e.aimAngle = Math.atan2(b.y - a.y, b.x - a.x);
  if (Math.abs(b.x - a.x) > 2) e.facing = b.x < a.x ? -1 : 1;
}

/**
 * The enemy's def.attack on its cooldown: melee within range (through resolveHit),
 * or a projectile at the player for long-range attacks / shooters.
 * Returns the next time the attack is ready.
 */
export function tryBasicAttack(
  w: CombatWorld,
  e: RuntimeEntity,
  attack: EnemyAttack,
  nextReadyAt: number,
  now: number,
  forceRanged = false,
  speedMult = 1,
): number {
  const target = w.player;
  if (!target.alive || now < nextReadyAt) return nextReadyAt;
  const ranged = forceRanged || attack.range > RANGED_THRESHOLD;
  const a = centerOf(e);
  const b = centerOf(target);
  const cd = (attack.cooldown * 1000) / speedMult;

  if (!ranged) {
    if (distRectRect(rectOf(e), rectOf(target)) > attack.range) return nextReadyAt;
    faceToward(e, target);
    e.attackAnim = { kind: "punch", angle: e.aimAngle, until: now + 200 };
    w.applyHit(e, spec(attack, ENEMY_MELEE_KNOCKBACK), target, b.x - a.x, b.y - a.y);
    return now + cd;
  }

  const range = Math.max(attack.range, 48);
  if (Math.hypot(b.x - a.x, b.y - a.y) > range) return nextReadyAt;
  faceToward(e, target);
  e.attackAnim = { kind: "shoot", angle: e.aimAngle, until: now + 200 };
  const r = rectOf(e);
  w.fireProjectile({
    owner: e,
    attack: spec(attack, ENEMY_SHOT_KNOCKBACK),
    x: a.x + Math.cos(e.aimAngle) * (r.w / 2 + 2),
    y: a.y + Math.sin(e.aimAngle) * (r.h / 4),
    angle: e.aimAngle,
    speed: ENEMY_SHOT_SPEED * speedMult,
    range: range + 40,
    radius: 3,
    color: shotColor(attack),
  });
  return now + cd;
}
