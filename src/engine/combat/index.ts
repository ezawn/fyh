/**
 * COMBAT agent owns this folder. Entry point CORE calls.
 * STUB (lead): no-op so CORE can build and run before COMBAT lands.
 */
import type { Mechanic } from "../../shared/schema";
import type { CombatSystem, EngineContext, RuntimeEntity } from "../types";

/** Static list (no side effects) re-exported by src/engine/index.ts for the UI. */
export const SUPPORTED_MECHANICS: readonly Mechanic[] = [];

export function createCombat(): CombatSystem {
  let ctx: EngineContext | null = null;
  return {
    supportedMechanics: [],
    initRoom(c) {
      ctx = c;
    },
    update() {},
    endRoom() {
      ctx = null;
    },
    useAbility() {
      return "unsupported";
    },
    hurt(target: RuntimeEntity, amount: number, kx: number, ky: number) {
      if (!ctx || ctx.now() < target.invulnUntil || !target.alive) return;
      target.hp = Math.max(0, target.hp - amount);
      target.invulnUntil = ctx.now() + 500;
      target.lastHitAt = ctx.now();
      target.body.body.setVelocity(kx, ky);
      if (target.hp <= 0 && target.kind === "player") ctx.onPlayerDied();
    },
    entities: () => [],
    boss: () => null,
    music: { toggleMute() {}, muted: false, stop() {} },
  };
}
