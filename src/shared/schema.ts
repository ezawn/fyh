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
export const GRAVITY = 1200; // px/sÂ², used by the engine and the reachability check
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
  ENEMY_4: "4",
  ENEMY_5: "5",
  NPC_A: "a", // world.npcs[0]
  NPC_B: "b", // world.npcs[1]
  NPC_C: "c", // world.npcs[2]
} as const;
export const TILE_CHARS = Object.values(TILES).join("");
export const MAX_ENEMY_TYPES = 5;
export const MAX_NPCS = 3;

/**
 * Rigs and props are drawn at 2x detail: 1 rig pixel = RIG_SCALE world px.
 * So a "human" rig is 32x64 rig pixels but 16x32 world px (2 tiles tall),
 * the same size in the world as before, with twice the detail.
 */
export const RIG_SCALE = 0.5;

/** Rig canvas size per size class, in RIG pixels (SPEC 6.1). World size = this Ã— RIG_SCALE. */
export const RIG_SIZES = {
  tiny: { w: 24, h: 32 },
  small: { w: 32, h: 40 },
  human: { w: 32, h: 64 },
  tall: { w: 32, h: 80 },
  large: { w: 96, h: 96 },
  huge: { w: 192, h: 192 },
} as const;

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case");
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");
const Point = z.tuple([z.number(), z.number()]);
const Box = z.object({ w: z.number().min(4).max(96), h: z.number().min(4).max(96) }); // world px

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

/** A friendly character from the show who stands in the room and talks when the player is near (spawned at "a"-"c"). */
export const NpcDef = z.object({
  id: Id,
  name: z.string().min(1),
  rig: Rig,
  lines: z.array(DialogueLine).min(1).max(3),
});
export type NpcDef = z.infer<typeof NpcDef>;

/**
 * Non-colliding scenery (houses, trees, signs...) drawn behind or in front of the player.
 * Shapes are in rig pixels inside a size.w Ã— size.h canvas, drawn at RIG_SCALE.
 */
export const PropDef = z.object({
  id: Id,
  name: z.string().min(1),
  size: z.object({ w: z.number().min(2).max(384), h: z.number().min(2).max(384) }),
  shapes: z.array(Shape).min(1).max(120),
  layer: z.enum(["back", "front"]).default("back"),
});
export type PropDef = z.infer<typeof PropDef>;

/** A prop placed in a room: its bottom-left corner sits on the top-left of tile (col, row+1). */
export const PropPlacement = z.object({
  prop: Id,
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});
export type PropPlacement = z.infer<typeof PropPlacement>;

export const Room = z.object({
  id: Id,
  name: z.string().min(1), // the engine shows this as a banner at the top when the room starts
  objective: z.string().min(1),
  layout: z.array(z.string()).length(ROOM_ROWS),
  isBossRoom: z.boolean(),
  exit: z.object({ toRoom: z.string() }), // a room id, or "END"
  props: z.array(PropPlacement).max(40).optional(), // missing = no props
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
  enemies: z.array(EnemyDef).min(1).max(MAX_ENEMY_TYPES),
  boss: BossDef,
  npcs: z.array(NpcDef).max(MAX_NPCS).optional(), // missing = no NPCs
  props: z.array(PropDef).max(12).optional(), // missing = no props
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
