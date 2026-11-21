/**
 * COMBAT entry point CORE calls (contract: src/engine/types.ts CombatSystem).
 * Abilities, projectiles, beams, hits (via resolveHit), regen, enemies, boss, music.
 */
import type { Mechanic } from "../../shared/schema";
import { isStomp } from "../../shared/combat";
import type { CombatSystem, EngineContext, RuntimeEntity } from "../types";
import { BossBrain } from "../ai/boss";
import { createEnemyBrain } from "../ai/enemies";
import { Music } from "../audio/music";
import type { TrackName } from "../audio/tracks";
import { useAbility } from "./abilities";
import { CombatWorld } from "./world";

/** Static list (no side effects) re-exported by src/engine/index.ts for the UI. */
export const SUPPORTED_MECHANICS: readonly Mechanic[] = ["melee", "projectile", "beam", "dash", "superJump", "flight", "aoe", "teleport"];

const MAX_DT_S = 0.05;

/** Only one music player may exist, even if a combat system is ever recreated. */
let activeMusic: Music | null = null;

export function createCombat(): CombatSystem {
  let world: CombatWorld | null = null;
  activeMusic?.destroy();
  const music = new Music();
  activeMusic = music;
  const hookedGames = new WeakSet<object>();

  const system: CombatSystem = {
    supportedMechanics: SUPPORTED_MECHANICS,

    initRoom(ctx: EngineContext) {
      if (world) system.endRoom();
      const w = new CombatWorld(ctx);
      world = w;
      w.onHit = (h) => system.onHit?.(h);

      // Stop the music when the game goes away (Esc / back to select).
      const game = ctx.scene.game;
      if (!hookedGames.has(game)) {
        hookedGames.add(game);
        game.events.once("destroy", () => {
          music.destroy();
          if (activeMusic === music) activeMusic = null;
          if (world) system.endRoom();
        });
      }

      const worldDef = ctx.session.world;
      for (const s of ctx.spawns.enemies) {
        const def = worldDef.enemies[s.enemyIndex];
        if (!def) continue;
        const e = ctx.spawnEntity(def, "enemy", s.x, s.y);
        w.addNpc(e, createEnemyBrain(w, e, def));
      }
      if (ctx.room.isBossRoom && ctx.spawns.boss) {
        const e = ctx.spawnEntity(worldDef.boss, "boss", ctx.spawns.boss.x, ctx.spawns.boss.y);
        w.bossEntity = e;
        w.addNpc(e, new BossBrain(w, e, worldDef.boss, (se, sd) => createEnemyBrain(w, se, sd)));
      }

      let track: TrackName = "STAGE";
      if (ctx.room.isBossRoom) track = isStomp(ctx.session.character, worldDef.boss) ? "STOMP" : "BOSS";
      music.play(track);
    },

    update(_time: number, deltaMs: number) {
      const w = world;
      if (!w || w.disposed) return;
      const dt = Math.min(MAX_DT_S, Math.max(0, deltaMs / 1000));
      w.update(w.now(), dt);
      w.flush();
    },

    endRoom() {
      const w = world;
      world = null;
      w?.dispose();
    },

    useAbility(slot) {
      const w = world;
      if (!w || w.disposed) return "blocked";
      const res = useAbility(w, w.ctx.session.character, slot);
      w.flush();
      return res;
    },

    hurt(target: RuntimeEntity, amount: number, kx: number, ky: number) {
      const w = world;
      if (!w || w.disposed) return;
      w.rawHurt(target, amount, kx, ky);
      w.flush();
    },

    entities: () => (world ? world.npcs.filter((e) => e.alive) : []),
    boss: () => (world?.bossEntity?.alive ? world.bossEntity : null),

    music: {
      toggleMute: () => music.toggleMute(),
      get muted() {
        return music.muted;
      },
      stop: () => music.stop(),
    },
  };
  return system;
}
