/**
 * Runtime interface between the two engine agents. Lead-owned: agents must not
 * change this file; ask the lead instead.
 *
 *   CORE   (core/, render/, ui/)      builds the scene, tiles, bodies, rigs, movement,
 *                                     HUD, dialogue, room flow. Implements EngineContext.
 *   COMBAT (combat/, ai/, audio/)     abilities, projectiles, hits, enemies, boss, regen,
 *                                     music. Implements CombatSystem (combat/index.ts).
 *
 * Time is Phaser scene time in ms (scene.time.now). Speeds are px/s, positions px.
 * Every hit between entities goes through resolveHit() from src/shared/combat.ts.
 */
import type Phaser from "phaser";
import type { Ability, BossDef, CharacterDef, DialogueLine, EnemyDef, Mechanic, Room, Stats } from "../shared/schema";
import type { HaxTag } from "../shared/schema";
import type { Session } from "./session";

export type Team = "player" | "enemy";
export type EntityKind = "player" | "enemy" | "boss";
export type Facing = -1 | 1;

export type AnimName = "idle" | "run" | "jump" | "attack" | "hurt" | "death";

export type ArcadeSprite = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform & { body: Phaser.Physics.Arcade.Body };

/** One live thing that has HP. Created by CORE (ctx.spawnEntity), driven by COMBAT/AI. */
export interface RuntimeEntity {
  readonly id: string; // unique per room instance, e.g. "enemy-0-3"
  readonly kind: EntityKind;
  readonly team: Team;
  readonly def: CharacterDef | EnemyDef | BossDef;
  readonly name: string;
  /** Physics body = the def's collisionBox (never derived from the rig). */
  readonly body: ArcadeSprite;

  // Combat stats: resolveHit(entity, hit, other) works directly on these.
  stats: Stats;
  tags: HaxTag[];
  maxHP: number;
  hp: number;
  alive: boolean;

  facing: Facing; // which way the rig faces
  aimAngle: number; // radians, world space (player: toward mouse; AI: toward target)

  invulnUntil: number; // no damage while time < this (0.5 s after a hit, dash i-frames)
  lastHitAt: number; // for REGENERATION's 2 s delay
  stunUntil: number; // movement input ignored while knocked back

  /** Player only: time (ms) at which each slot is ready again. Index 0 = slot 1. */
  cooldownReadyAt: [number, number, number, number];

  // ---- Movement modifiers: set by COMBAT, honoured by CORE's movement code ----
  dash: { until: number; vx: number; vy: number } | null; // override velocity, ignore gravity
  flightUntil: number; // free WASD movement, no gravity, while time < this
  superJumpMult: number; // next jump velocity × this, then CORE resets it to 1

  // ---- Animation: set by either side, read by CORE's rig renderer ----
  anim: AnimName; // CORE sets idle/run/jump each frame unless an override below is active
  attackAnim: { kind: Ability["animation"]; angle: number; until: number } | null;
  hurtUntil: number; // white flash
}

/** Tile positions parsed from the room layout (px, centre of tile; spawns at feet = tile bottom). */
export interface RoomSpawns {
  player: { x: number; y: number };
  enemies: { enemyIndex: number; x: number; y: number }[]; // "1" → enemyIndex 0
  boss: { x: number; y: number } | null;
  checkpoints: { x: number; y: number }[];
}

/** What CORE gives COMBAT. One per room; recreated on room change/restart. */
export interface EngineContext {
  readonly scene: Phaser.Scene;
  readonly session: Session;
  readonly room: Room;
  readonly roomIndex: number;
  readonly spawns: RoomSpawns;
  readonly player: RuntimeEntity;

  /** Solid + destructible tiles (collide with entities and projectiles). */
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly oneWays: Phaser.Physics.Arcade.StaticGroup;

  now(): number;
  /** Mouse position in world px. */
  pointerWorld(): { x: number; y: number };
  /** True if (x, y) in world px is inside a solid or unbroken destructible tile. */
  isSolidAt(x: number, y: number): boolean;
  /** Break every destructible tile overlapping the rect (any attack breaks them). */
  breakTilesIn(rect: Phaser.Geom.Rectangle): void;

  /**
   * Create an entity with a physics body sized to def.collisionBox, a rig renderer,
   * colliders against solids/oneWays, feet at (x, y). CORE owns its visuals.
   * COMBAT calls this for enemies and the boss (and for "summon").
   */
  spawnEntity(def: EnemyDef | BossDef, kind: "enemy" | "boss", x: number, y: number): RuntimeEntity;
  /** Remove an entity's body and visuals (after its death animation if `animate`). */
  despawnEntity(e: RuntimeEntity, animate: boolean): void;

  /**
   * Screen-space HUD layer (v1.1: the world camera is zoomed ×3, so never use
   * setScrollFactor(0) on the world camera for UI). Objects added here are drawn
   * by a separate HUD camera in a 400×224 logical coordinate space (top-left 0,0),
   * and ignored by the world camera. Use for the boss health bar.
   */
  addToHud(obj: Phaser.GameObjects.GameObject): void;

  /** Bottom dialogue box; gameplay pauses until all lines are dismissed. */
  showDialogue(lines: DialogueLine[]): Promise<void>;
  readonly paused: boolean;

  /** Room flow. COMBAT calls these when HP hits 0. */
  onPlayerDied(): void;
  onBossDefeated(): void;
}

export type AbilityUseResult = "used" | "cooldown" | "unsupported" | "blocked";

export interface HitInfo {
  attacker: RuntimeEntity | null; // null = environment (spikes)
  target: RuntimeEntity;
  damage: number;
  blocked: boolean;
  reason?: string;
}

/** What COMBAT gives CORE. Created once per game (createCombat), init'd per room. */
export interface CombatSystem {
  /** Mechanics implemented so far; the UI marks the rest "not supported". */
  readonly supportedMechanics: readonly Mechanic[];

  /** Spawn enemies + boss from ctx.spawns, start the right music. */
  initRoom(ctx: EngineContext): void;
  /** Called every frame while not paused. Runs AI, projectiles, beams, regen, boss. */
  update(time: number, deltaMs: number): void;
  /** Tear down everything combat created for this room. */
  endRoom(): void;

  /** Player clicked with slot 1-4 selected; aim is player.aimAngle (CORE keeps it updated). */
  useAbility(slot: 1 | 2 | 3 | 4): AbilityUseResult;

  /** Raw damage that bypasses the formula (spikes: 20% max HP). Respects i-frames. */
  hurt(target: RuntimeEntity, amount: number, knockbackX: number, knockbackY: number): void;

  /** All live non-player entities (for CORE's renderer/camera if needed). */
  entities(): readonly RuntimeEntity[];
  /** Boss HP for the top bar (COMBAT draws it, CORE may ignore). */
  boss(): RuntimeEntity | null;

  /** Optional listener CORE can set (e.g. HUD shake). */
  onHit?: (hit: HitInfo) => void;

  readonly music: {
    toggleMute(): void;
    readonly muted: boolean;
    stop(): void;
  };
}
