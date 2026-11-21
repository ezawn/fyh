/**
 * THE CONTRACT (docs/SPEC.md sections 4, 5.1, 5.5, 6.1).
 * Engine, server and UI all build against this file.
 * Owned by the Contract + Content lane. Change only after telling the whole team.
 */
import { z } from "zod";

// ---------- Shared constants ----------
export const SCHEMA_VERSION = 1 as const;
export const TILE = 16; // px
export const ROOM_ROWS = 14;
export const ROOM_MIN_COLS = 40;
export const ROOM_MAX_COLS = 100;
export const ROOMS_PER_WORLD = 3;
export const GRAVITY = 1200; // px/s², used by the engine and the reachability check
export const MAX_STAT = 1_000_000; // anything above this is treated as nonsense
export const MAX_DIALOGUE_CHARS = 120;

/** Tile legend (SPEC 4.5). */
export const TILES = {
  EMPTY: ".",
  GROUND: "#",
  ONE_WAY: "=",
  DESTRUCTIBLE: "X",
  SPIKES: "^",
  SPAWN: "S",
  EXIT: "E",
  CHECKPOINT: "C",
  BOSS: "B",
  ENEMY_1: "1",
  ENEMY_2: "2",
  ENEMY_3: "3",
} as const;
export const TILE_CHARS = Object.values(TILES).join("");

/** Rig canvas size per size class, in px (SPEC 6.1). */
export const RIG_SIZES = {
  tiny: { w: 12, h: 16 },
  small: { w: 16, h: 20 },
  human: { w: 16, h: 32 },
  tall: { w: 16, h: 40 },
  large: { w: 48, h: 48 },
  huge: { w: 96, h: 96 },
} as const;

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case");
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");
const Point = z.tuple([z.number(), z.number()]);
const Box = z.object({ w: z.number().min(4).max(96), h: z.number().min(4).max(96) });

// ---------- Stats (SPEC 5.1) ----------
const StatValue = z.number().min(0).max(MAX_STAT);
export const Stats = z.object({
  HP: z.number().min(1).max(MAX_STAT),
  AD: StatValue,
  AP: StatValue,
  ARM: StatValue,
  MR: StatValue,
  ARM_PEN: StatValue,
  MAGIC_PEN: StatValue,
});
export type Stats = z.infer<typeof Stats>;

// ---------- Hax (SPEC 5.5) ----------
export const HaxTag = z.enum(["INFINITY", "BULLETPROOF", "INTANGIBLE", "REGENERATION", "FLIGHT"]);
export type HaxTag = z.infer<typeof HaxTag>;
export const AttackTag = z.enum(["BALLISTIC", "PHYSICAL", "ENERGY", "SPACE_BYPASS", "NULLIFY"]);
export type AttackTag = z.infer<typeof AttackTag>;
export const DamageType = z.enum(["physical", "magic", "mixed"]);
export type DamageType = z.infer<typeof DamageType>;

// ---------- Rig (SPEC 6.1) ----------
export const Shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rect"), x: z.number(), y: z.number(), w: z.number().min(1), h: z.number().min(1), color: Hex }),
  z.object({ type: z.literal("circle"), x: z.number(), y: z.number(), r: z.number().min(0.5), color: Hex }),
]);
export type Shape = z.infer<typeof Shape>;

export const SizeClass = z.enum(["tiny", "small", "human", "tall", "large", "huge"]);
export type SizeClass = z.infer<typeof SizeClass>;

export const Rig = z.object({
  sizeClass: SizeClass,
  parts: z.object({
    head: z.array(Shape),
    torso: z.array(Shape),
    armFront: z.array(Shape),
    armBack: z.array(Shape),
    legFront: z.array(Shape),
    legBack: z.array(Shape),
    extras: z.array(z.object({ attachTo: z.enum(["head", "torso", "armFront"]), shapes: z.array(Shape) })).max(8),
  }),
  pivots: z.object({ neck: Point, shoulder: Point, hip: Point }),
});
export type Rig = z.infer<typeof Rig>;

// ---------- Abilities (SPEC 4.3) ----------
export const Mechanic = z.enum(["melee", "projectile", "beam", "aoe", "dash", "teleport", "flight", "superJump"]);
export type Mechanic = z.infer<typeof Mechanic>;

export const Ability = z.object({
  id: Id,
  name: z.string().min(1),
  slot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  mechanic: Mechanic,
  damageType: DamageType,
  attackTags: z.array(AttackTag).max(3),
  ratio: z.number().min(0).max(10),
  range: z.number().min(0).max(1600),
  cooldown: z.number().min(0).max(60),
  duration: z.number().min(0).max(30),
  projectileSpeed: z.number().min(50).max(2000).optional(),
  knockback: z.number().min(-1000).max(2000), // negative = pull
  animation: z.enum(["punch", "kick", "cast", "shoot", "swing", "beam"]),
});
export type Ability = z.infer<typeof Ability>;

// ---------- Character (SPEC 4.2) ----------
export const CharacterDef = z.object({
  id: Id,
  name: z.string().min(1),
  source: z.string().min(1),
  versionOrEpisode: z.string().min(1),
  assumptions: z.array(z.string()).min(1).max(8),
  rig: Rig,
  collisionBox: Box,
  movement: z.object({
    speed: z.number().min(60).max(400),
    jumpStrength: z.number().min(200).max(900),
    canFly: z.boolean(),
  }),
  stats: Stats,
  tags: z.array(HaxTag).max(5),
  abilities: z.array(Ability).length(4), // slots 1-4: basic, special, movement, ultimate
});
export type CharacterDef = z.infer<typeof CharacterDef>;

// ---------- World (SPEC 4.4, 4.5) ----------
export const DialogueLine = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1).max(MAX_DIALOGUE_CHARS),
});
export type DialogueLine = z.infer<typeof DialogueLine>;

export const EnemyAttack = z.object({
  damageType: DamageType,
  ratio: z.number().min(0).max(10),
  attackTags: z.array(AttackTag).max(3),
  range: z.number().min(0).max(1600),
  cooldown: z.number().min(0.2).max(30),
});
export type EnemyAttack = z.infer<typeof EnemyAttack>;

export const EnemyDef = z.object({
  id: Id,
  name: z.string().min(1),
  rig: Rig,
  collisionBox: Box,
  stats: Stats,
  tags: z.array(HaxTag).max(5),
  behaviour: z.enum(["walker", "jumper", "flyer", "shooter"]),
  speed: z.number().min(0).max(400),
  attack: EnemyAttack,
});
export type EnemyDef = z.infer<typeof EnemyDef>;

export const BossDef = EnemyDef.extend({
  pattern: z.array(z.enum(["charge", "jump", "shoot", "beam", "summon"])).min(1).max(3),
  phaseAt: z.number().min(0).max(1),
});
export type BossDef = z.infer<typeof BossDef>;

export const Room = z.object({
  id: Id,
  name: z.string().min(1),
  objective: z.string().min(1),
  layout: z.array(z.string()).length(ROOM_ROWS),
  isBossRoom: z.boolean(),
  exit: z.object({ toRoom: z.string() }), // a room id, or "END"
});
export type Room = z.infer<typeof Room>;

export const Backdrop = z.enum(["hills", "mountains", "forest", "city", "school", "interior", "void"]);
export type Backdrop = z.infer<typeof Backdrop>;

export const WorldDef = z.object({
  id: Id,
  name: z.string().min(1),
  source: z.string().min(1),
  visualStyle: z.object({
    palette: z.object({ sky: Hex, skyBottom: Hex, ground: Hex, groundTop: Hex, platform: Hex, accent: Hex }),
    backdrop: Backdrop,
  }),
  enemies: z.array(EnemyDef).min(1).max(3),
  boss: BossDef,
  rooms: z.array(Room).length(ROOMS_PER_WORLD),
  dialogue: z.object({
    roomIntro: z.array(z.array(DialogueLine).max(3)).length(ROOMS_PER_WORLD),
    bossIntro: z.array(DialogueLine).max(3),
    bossDefeated: z.array(DialogueLine).max(3),
    playerDefeated: z.array(DialogueLine).max(3),
  }),
});
export type WorldDef = z.infer<typeof WorldDef>;
export type WorldDialogue = WorldDef["dialogue"];

// ---------- Cartridge (SPEC 4.1) ----------
export const Cartridge = z.object({
  id: Id,
  schemaVersion: z.literal(SCHEMA_VERSION),
  status: z.enum(["ready", "failed"]),
  source: z.object({
    title: z.string().min(1),
    medium: z.enum(["film", "tv", "anime"]),
    versionOrEpisode: z.string().min(1),
    requestedCharacter: z.string().min(1),
  }),
  character: CharacterDef,
  world: WorldDef,
  notes: z.object({
    sourceFacts: z.array(z.string()),
    designChoices: z.array(z.string()),
  }),
  createdAt: z.string(),
});
export type Cartridge = z.infer<typeof Cartridge>;

/**
 * What Cortex must return for POST /api/generate (SPEC 8.2): a cartridge, or an
 * honest "I need clarification" / "I don't know this source".
 * The server fills in id, schemaVersion, status and createdAt itself.
 */
export const GenerationOutput = z.object({
  outcome: z.enum(["cartridge", "needs_clarification", "unknown_source"]),
  question: z.string().optional(), // when needs_clarification
  message: z.string().optional(), // when unknown_source
  cartridge: Cartridge.omit({ id: true, schemaVersion: true, status: true, createdAt: true }).optional(),
});
export type GenerationOutput = z.infer<typeof GenerationOutput>;

/** What Cortex must return for remix flavour lines (SPEC 5.6). */
export const RemixLines = WorldDef.shape.dialogue;
export type RemixLines = z.infer<typeof RemixLines>;

/** JSON Schemas for Cortex AI_COMPLETE response_format. */
export function generationJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(GenerationOutput, { target: "draft-7", io: "input" }) as Record<string, unknown>;
}
export function remixLinesJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(RemixLines, { target: "draft-7", io: "input" }) as Record<string, unknown>;
}
