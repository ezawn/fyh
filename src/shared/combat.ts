/**
 * Deterministic combat (docs/SPEC.md 5.2, 5.4, 5.5). Used by the engine for EVERY hit.
 * No randomness, no rebalancing, no network calls.
 */
import type { AttackTag, DamageType, HaxTag, Stats, CharacterDef, BossDef } from "./schema";

export type Combatant = { stats: Stats; tags: readonly HaxTag[] };
export type HitSource = { damageType: DamageType; ratio: number; attackTags: readonly AttackTag[] };

export type HitResult = {
  damage: number; // final rounded damage, ≥ 0
  blocked: boolean; // true when a hax tag stopped the hit entirely
  reason?: "INFINITY" | "BULLETPROOF" | "INTANGIBLE"; // which tag blocked it
  knockbackScale: number; // 0 when blocked by INFINITY, else 1
};

function physicalDamage(attacker: Stats, ratio: number, target: Stats): number {
  return (attacker.AD * ratio * 100) / (100 + Math.max(0, target.ARM - attacker.ARM_PEN));
}

function magicDamage(attacker: Stats, ratio: number, target: Stats): number {
  return (attacker.AP * ratio * 100) / (100 + Math.max(0, target.MR - attacker.MAGIC_PEN));
}

/** Hax check (5.5), then the damage formula (5.2). */
export function resolveHit(attacker: Combatant, hit: HitSource, target: Combatant): HitResult {
  const tags = hit.attackTags;
  const nullify = tags.includes("NULLIFY");

  if (target.tags.includes("INFINITY") && !tags.includes("SPACE_BYPASS") && !nullify) {
    return { damage: 0, blocked: true, reason: "INFINITY", knockbackScale: 0 };
  }

  if (
    target.tags.includes("BULLETPROOF") &&
    tags.includes("BALLISTIC") &&
    !nullify &&
    !(attacker.stats.ARM_PEN >= target.stats.ARM * 2)
  ) {
    return { damage: 0, blocked: true, reason: "BULLETPROOF", knockbackScale: 1 };
  }

  const intangible = target.tags.includes("INTANGIBLE") && !nullify;
  if (intangible && hit.damageType === "physical") {
    return { damage: 0, blocked: true, reason: "INTANGIBLE", knockbackScale: 1 };
  }

  let raw: number;
  switch (hit.damageType) {
    case "physical":
      raw = physicalDamage(attacker.stats, hit.ratio, target.stats);
      break;
    case "magic":
      raw = magicDamage(attacker.stats, hit.ratio, target.stats);
      break;
    case "mixed":
      // INTANGIBLE removes only the physical half of a mixed hit.
      raw =
        (intangible ? 0 : 0.5 * physicalDamage(attacker.stats, hit.ratio, target.stats)) +
        0.5 * magicDamage(attacker.stats, hit.ratio, target.stats);
      break;
  }
  return { damage: Math.round(Math.max(0, raw)), blocked: false, knockbackScale: 1 };
}

/** REGENERATION (5.5): HP healed per second while not hit for 2 s. */
export const REGEN_DELAY_S = 2;
export function regenPerSecond(target: Combatant): number {
  return target.tags.includes("REGENERATION") ? target.stats.HP * 0.02 : 0;
}

/** Biggest single hit the player can land on the boss with any of their abilities. */
export function maxHitOn(player: CharacterDef, boss: Combatant): number {
  return Math.max(0, ...player.abilities.map((a) => resolveHit(player, a, boss).damage));
}

/**
 * STOMP music rule (5.4): the player massively outclasses the boss.
 * player HP more than 10x the boss's, AND one hit can take the boss's full HP.
 */
export function isStomp(player: CharacterDef, boss: BossDef): boolean {
  return player.stats.HP / boss.stats.HP > 10 && maxHitOn(player, boss) >= boss.stats.HP;
}
