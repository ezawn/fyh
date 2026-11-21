/**
 * Normalised jumping. A character's raw movement.jumpStrength (200-900 px/s)
 * would give jumps from 1 to 21 tiles high, which breaks levels built for
 * someone else. The engine squashes every jump into a narrow band instead:
 * stronger jumpers still jump a little higher, but never absurdly so.
 *
 *   raw height  h = v² / 2g
 *   jump height = clamp(MIN + (h - MIN) × SQUASH, MIN, MAX)
 *
 * MIN matches the demo cartridges' "Peppa probe" (every room must be finishable
 * with a 3.4-tile jump), so any character can finish any demo world.
 * Pure: no Phaser import, so scripts can check levels with the same numbers.
 */
import { GRAVITY, TILE } from "../../shared/schema";

/** Lowest jump anyone gets: 3.5 tiles. */
export const MIN_JUMP_PX = 3.5 * TILE;
/** Highest normal jump: 5 tiles. */
export const MAX_JUMP_PX = 5 * TILE;
/** Highest super jump (superJump ability): 7 tiles. */
export const MAX_SUPER_JUMP_PX = 7 * TILE;
/** How much of the raw height difference survives. */
const SQUASH = 0.25;

const heightOf = (v: number) => (v * v) / (2 * GRAVITY);
const velocityFor = (h: number) => Math.sqrt(2 * GRAVITY * h);

/** Normalised jump height in px for a raw jumpStrength. */
export function jumpHeightPx(jumpStrength: number): number {
  const raw = heightOf(Math.max(0, jumpStrength));
  return Math.min(MAX_JUMP_PX, Math.max(MIN_JUMP_PX, MIN_JUMP_PX + (raw - MIN_JUMP_PX) * SQUASH));
}

/** Launch velocity (px/s, positive) for a jump, with an optional super-jump multiplier on velocity. */
export function jumpVelocity(jumpStrength: number, superJumpMult = 1): number {
  const h = jumpHeightPx(jumpStrength);
  const mult = Math.max(1, superJumpMult);
  // superJumpMult scales velocity, so height scales by its square; cap the result.
  const superH = Math.min(MAX_SUPER_JUMP_PX, h * mult * mult);
  return velocityFor(mult > 1 ? Math.max(h, superH) : h);
}
