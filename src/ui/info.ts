/** Display helpers: number formatting, tag explanations (SPEC 5.5), ability slot roles. */
import type { AttackTag, HaxTag } from "../shared/schema";

export function formatNumber(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** One-line explanations, straight from SPEC 5.5. Nothing else is promised. */
export const HAX_INFO: Record<HaxTag, string> = {
  INFINITY: "Takes 0 damage and 0 knockback; projectiles stop 1 tile away. Bypassed by SPACE_BYPASS or NULLIFY.",
  BULLETPROOF: "Takes 0 damage from BALLISTIC attacks. Bypassed by NULLIFY, or attacker ARM_PEN >= 2x target ARM.",
  INTANGIBLE: "Takes 0 damage from physical attacks. Bypassed by NULLIFY.",
  REGENERATION: "Heals 2% max HP per second after 2 s without being hit.",
  FLIGHT: "Can use flight-mechanic abilities.",
};

export const ATTACK_TAG_INFO: Record<AttackTag, string> = {
  BALLISTIC: "blocked by BULLETPROOF",
  PHYSICAL: "kinetic hit",
  ENERGY: "energy / ki blast",
  SPACE_BYPASS: "goes through INFINITY",
  NULLIFY: "ignores INFINITY, BULLETPROOF, INTANGIBLE",
};

export function haxInfo(tag: string): string {
  return (HAX_INFO as Record<string, string>)[tag] ?? "Not enforced by the engine (ignored).";
}

export const SLOT_ROLE: Record<number, string> = { 1: "basic", 2: "special", 3: "movement", 4: "ultimate" };

export const STAT_KEYS = ["HP", "AD", "AP", "ARM", "MR", "ARM_PEN", "MAGIC_PEN"] as const;
