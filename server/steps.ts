/**
 * SERVER LANE. Step-by-step generation for AI backends that can't enforce the
 * whole-cartridge schema in one call (Gemini's free tier). Each step has a small
 * schema the backend can enforce exactly and sees only its slice of the example
 * cartridge. The server stitches the pieces together; runGenerate then validates,
 * repairs (re-running only the steps whose part failed) and saves as usual.
 */
import { z } from "zod";
import {
  Ability,
  BossDef,
  Cartridge,
  CharacterDef,
  EnemyDef,
  MAX_ENEMY_TYPES,
  PowerTier,
  ROOMS_PER_WORLD,
  ROOM_ROWS,
  Rig,
  Room,
  WorldDef,
} from "../src/shared/schema";
import { cortexSafeSchema } from "./cortex-schema";
import { HONESTY_RULES, SCALE_RULES, SCHEMA_RULES, loadExample } from "./prompts";
import type { CompleteFn } from "./snowflake";

type AnyObj = Record<string, any>;

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;

// ---------- Step schemas ----------
const Overview = z.object({
  outcome: z.enum(["cartridge", "needs_clarification", "unknown_source"]),
  question: z.string().optional(), // when needs_clarification
  message: z.string().optional(), // when unknown_source
  source: Cartridge.shape.source.omit({ requestedCharacter: true }).optional(),
  notes: Cartridge.shape.notes.optional(),
  character: CharacterDef.omit({ rig: true, abilities: true }).extend({ powerTier: PowerTier }).optional(),
});

const Fighter = EnemyDef.omit({ rig: true }).extend({ powerTier: PowerTier });
const WorldPlan = z.object({
  world: WorldDef.pick({ id: true, name: true, source: true, visualStyle: true, dialogue: true }),
  enemies: z.array(Fighter).min(1).max(Math.min(3, MAX_ENEMY_TYPES)),
  boss: BossDef.omit({ rig: true }).extend({ powerTier: PowerTier }),
});

const Abilities = z.object({ abilities: z.array(Ability).length(4) });
const RigOut = z.object({ rig: Rig });
const Rooms = z.object({ rooms: z.array(Room.omit({ props: true })).length(ROOMS_PER_WORLD) });

// Rigs are unions of rect/circle shapes; flattening keeps the schema small enough to serve.
const SCHEMAS = {
  overview: jsonSchema(Overview),
  world: jsonSchema(WorldPlan),
  abilities: jsonSchema(Abilities),
  rig: cortexSafeSchema(jsonSchema(RigOut), { flattenUnions: true }),
  rooms: jsonSchema(Rooms),
};

// ---------- Example slices ----------
function exampleCartridge(): AnyObj | null {
  const raw = loadExample();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AnyObj;
    return (parsed.cartridge ?? parsed) as AnyObj;
  } catch {
    return null;
  }
}

function exampleSlices(ex: AnyObj | null) {
  if (!ex) return null;
  const { rig: _r, abilities: _a, ...characterCore } = ex.character ?? {};
  const stripRig = ({ rig: _rig, ...rest }: AnyObj) => rest;
  return {
    overview: { outcome: "cartridge", source: ex.source, notes: ex.notes, character: characterCore },
    world: {
      world: { id: ex.world?.id, name: ex.world?.name, source: ex.world?.source, visualStyle: ex.world?.visualStyle, dialogue: ex.world?.dialogue },
      enemies: (ex.world?.enemies ?? []).map(stripRig),
      boss: ex.world?.boss ? stripRig(ex.world.boss) : undefined,
    },
    abilities: { abilities: ex.character?.abilities },
    rig: { rig: ex.character?.rig },
    rooms: { rooms: (ex.world?.rooms ?? []).map(({ props: _p, ...room }: AnyObj) => room) },
  };
}

// ---------- Prompts ----------
type StepName = keyof typeof SCHEMAS;

function stepPrompt(o: {
  title: string;
  character: string;
  step: string;
  task: string;
  decided?: AnyObj;
  example?: unknown;
  current?: unknown;
  problems?: string[];
  honesty?: boolean;
}): string {
  return `You design cartridges for a retro 2D platformer engine. A cartridge is built in steps; this is the "${o.step}" step.
Title (as the user typed it): ${JSON.stringify(o.title)}
Main character (as the user typed it): ${JSON.stringify(o.character)}
The cartridge has ONE playable protagonist (the requested character) and ONE world of ${ROOMS_PER_WORLD} rooms from that film/episode, the last with a boss.
${o.honesty ? HONESTY_RULES : ""}${SCHEMA_RULES}${SCALE_RULES}
${o.decided ? `## Already decided in earlier steps (stay consistent with it)\n${JSON.stringify(o.decided)}\n` : ""}
${o.example ? `## Example answer for this step (a different source; copy its structure and level of detail, not its content)\n${JSON.stringify(o.example)}\n` : ""}
${o.current ? `## Your previous answer for this step\n${JSON.stringify(o.current)}\n` : ""}
${o.problems?.length ? `## Problems to fix (fix every one with the smallest change; keep everything else the same and never weaken or rebalance anyone)\n${o.problems.map((p) => `- ${p}`).join("\n")}\n` : ""}
## Your task
${o.task}
Return one JSON object matching the response schema.`;
}

// ---------- The steps ----------
type Figure = { key: string; name: string; sizeHint: string; brief: AnyObj };

export type Pieces = {
  overview: AnyObj;
  world: AnyObj;
  abilities: AnyObj[];
  rigs: Record<string, AnyObj>; // "character", "enemy-0", "enemy-1", ..., "boss"
  rooms: AnyObj[];
};

export type StepContext = {
  title: string;
  character: string;
  complete: CompleteFn;
  onStep: (detail: string) => void;
};

function figures(p: Pieces): Figure[] {
  const c = p.overview.character ?? {};
  return [
    { key: "character", name: c.name ?? "the character", sizeHint: "the protagonist", brief: { name: c.name, assumptions: c.assumptions, collisionBox: c.collisionBox, powerTier: c.powerTier } },
    ...(p.world.enemies ?? []).map((e: AnyObj, i: number) => ({
      key: `enemy-${i}`,
      name: e.name ?? `enemy ${i + 1}`,
      sizeHint: "an enemy",
      brief: { name: e.name, behaviour: e.behaviour, collisionBox: e.collisionBox, powerTier: e.powerTier },
    })),
    { key: "boss", name: p.world.boss?.name ?? "the boss", sizeHint: "the boss", brief: { name: p.world.boss?.name, pattern: p.world.boss?.pattern, collisionBox: p.world.boss?.collisionBox, powerTier: p.world.boss?.powerTier } },
  ];
}

async function runStep<T extends AnyObj>(ctx: StepContext, name: StepName, label: string, prompt: string, maxTokens: number): Promise<T> {
  ctx.onStep(label);
  const out = await ctx.complete<T>(prompt, SCHEMAS[name], { maxTokens, effort: name === "rig" ? "medium" : "high" });
  if (!out || typeof out !== "object") throw new Error(`the ${name} step returned no JSON object`);
  return out;
}

async function overviewStep(ctx: StepContext, ex: ReturnType<typeof exampleSlices>, current?: AnyObj, problems?: string[]) {
  return runStep<AnyObj>(ctx, "overview", "Step 1: source, notes and character stats", stepPrompt({
    ...ctx,
    step: "overview",
    honesty: true,
    task: `First decide honestly whether you know this source (see the honesty rules). If you do, return outcome "cartridge" with: source (title, medium film|tv|anime, versionOrEpisode = the specific film/episode), notes (sourceFacts vs designChoices), and the character WITHOUT rig and abilities: id, name, source, versionOrEpisode, assumptions, collisionBox, movement, powerTier, stats, tags. Otherwise return outcome "needs_clarification" with a question, or "unknown_source" with a message, and nothing else.`,
    example: ex?.overview,
    current,
    problems,
  }), 8000);
}

async function worldStep(ctx: StepContext, p: Pick<Pieces, "overview">, ex: ReturnType<typeof exampleSlices>, current?: AnyObj, problems?: string[]) {
  return runStep<AnyObj>(ctx, "world", "Step 2: world, enemies, boss and dialogue", stepPrompt({
    ...ctx,
    step: "world",
    decided: { source: p.overview.source, character: p.overview.character },
    task: `Design the world from the requested film/episode: world { id, name, source, visualStyle, dialogue } (dialogue.roomIntro has exactly ${ROOMS_PER_WORLD} lists), 1-3 enemy types and the boss, all WITHOUT rigs (rigs come in a later step). Every enemy and the boss need powerTier with stats inside that tier's band.`,
    example: ex?.world,
    current,
    problems,
  }), 12000);
}

async function abilitiesStep(ctx: StepContext, p: Pick<Pieces, "overview">, ex: ReturnType<typeof exampleSlices>, current?: AnyObj, problems?: string[]) {
  const out = await runStep<AnyObj>(ctx, "abilities", "Step 3: the character's 4 abilities", stepPrompt({
    ...ctx,
    step: "abilities",
    decided: { character: p.overview.character },
    task: `Give the character exactly 4 abilities in slot order (1 basic, 2 special, 3 movement, 4 ultimate), each using a supported mechanic. Ability ids are kebab-case and unique.`,
    example: ex?.abilities,
    current: current ? { abilities: current } : undefined,
    problems,
  }), 6000);
  return (out.abilities ?? []) as AnyObj[];
}

async function rigStep(ctx: StepContext, fig: Figure, ex: ReturnType<typeof exampleSlices>, current?: AnyObj, problems?: string[]) {
  const out = await runStep<AnyObj>(ctx, "rig", `Step 4: rig for ${fig.name}`, stepPrompt({
    ...ctx,
    step: `rig for ${fig.name}`,
    decided: fig.brief,
    task: `Draw the rig for ${fig.name} (${fig.sizeHint}): pick the sizeClass that fits, then build head, torso, armFront, armBack, legFront, legBack and extras from rect/circle shapes so it's simple but instantly recognisable. EVERY shape and pivot must lie inside the sizeClass canvas.`,
    example: ex?.rig,
    current: current ? { rig: current } : undefined,
    problems,
  }), 10000);
  return (out.rig ?? {}) as AnyObj;
}

async function roomsStep(ctx: StepContext, p: Pick<Pieces, "overview" | "world">, ex: ReturnType<typeof exampleSlices>, current?: AnyObj[], problems?: string[]) {
  const c = p.overview.character ?? {};
  const out = await runStep<AnyObj>(ctx, "rooms", "Step 5: the 3 room layouts", stepPrompt({
    ...ctx,
    step: "rooms",
    decided: {
      world: { name: p.world.world?.name, roomIntro: p.world.world?.dialogue?.roomIntro },
      enemies: (p.world.enemies ?? []).map((e: AnyObj, i: number) => ({ spawnTile: String(i + 1), name: e.name, behaviour: e.behaviour })),
      boss: p.world.boss?.name,
      characterMovement: c.movement,
    },
    task: `Lay out exactly ${ROOMS_PER_WORLD} rooms (ids room-1..room-${ROOMS_PER_WORLD}, the last is the boss room) following the room rules: ${ROOM_ROWS} rows of equal width, one S, one E per non-boss room, one B in the boss room, enemy spawns only for enemies that exist, and a path the character can actually walk and jump with its movement above.`,
    example: ex?.rooms,
    current: current ? { rooms: current } : undefined,
    problems,
  }), 12000);
  return (out.rooms ?? []) as AnyObj[];
}

/** Puts the pieces together as a cartridge body (server-owned fields are added by assemble()). */
export function stitch(p: Pieces, requestedCharacter: string): AnyObj {
  return {
    source: { ...(p.overview.source ?? {}), requestedCharacter },
    notes: p.overview.notes ?? { sourceFacts: [], designChoices: [] },
    character: { ...(p.overview.character ?? {}), rig: p.rigs.character, abilities: p.abilities },
    world: {
      ...(p.world.world ?? {}),
      enemies: (p.world.enemies ?? []).map((e: AnyObj, i: number) => ({ ...e, rig: p.rigs[`enemy-${i}`] })),
      boss: { ...(p.world.boss ?? {}), rig: p.rigs.boss },
      rooms: p.rooms,
    },
  };
}

/**
 * Runs every step. Returns either an honest non-cartridge outcome from step 1,
 * or { outcome: "cartridge", cartridge, pieces } for the normal pipeline.
 */
export async function generateInSteps(ctx: StepContext): Promise<AnyObj> {
  const ex = exampleSlices(exampleCartridge());
  const overview = await overviewStep(ctx, ex);
  if (overview.outcome !== "cartridge") return overview;
  if (!overview.character || !overview.source) throw new Error("the overview step returned no character or source");

  const world = await worldStep(ctx, { overview }, ex);
  const abilities = await abilitiesStep(ctx, { overview }, ex);
  const pieces: Pieces = { overview, world, abilities, rigs: {}, rooms: [] };
  for (const fig of figures(pieces)) pieces.rigs[fig.key] = await rigStep(ctx, fig, ex);
  pieces.rooms = await roomsStep(ctx, pieces, ex);
  return { outcome: "cartridge", cartridge: stitch(pieces, ctx.character), pieces };
}

/** Which step owns a validation problem (by its path prefix). */
export function stepFor(problem: string): string {
  let m: RegExpMatchArray | null;
  if (/^character\.rig\b/.test(problem)) return "rig:character";
  if ((m = problem.match(/^world\.enemies\.(\d+)(?: \([^)]*\))?\.rig\b/))) return `rig:enemy-${m[1]}`;
  if (/^world\.boss(?: \([^)]*\))?\.rig\b/.test(problem)) return "rig:boss";
  if (/^character\.abilities\b/.test(problem)) return "abilities";
  if (/^world\.rooms\b/.test(problem)) return "rooms";
  if (/^world\b/.test(problem)) return "world";
  return "overview";
}

/** The one repair: re-runs only the steps whose part failed, each with its own problems. */
export async function repairInSteps(ctx: StepContext, pieces: Pieces, problems: string[]): Promise<{ cartridge: AnyObj; pieces: Pieces }> {
  const ex = exampleSlices(exampleCartridge());
  const byStep = new Map<string, string[]>();
  for (const p of problems) byStep.set(stepFor(p), [...(byStep.get(stepFor(p)) ?? []), p]);
  const next: Pieces = { ...pieces, rigs: { ...pieces.rigs } };

  if (byStep.has("overview")) {
    const fixed = await overviewStep(ctx, ex, pieces.overview, byStep.get("overview"));
    if (fixed.outcome === "cartridge" && fixed.character) next.overview = fixed;
  }
  if (byStep.has("world")) next.world = await worldStep(ctx, next, ex, pieces.world, byStep.get("world"));
  if (byStep.has("abilities")) next.abilities = await abilitiesStep(ctx, next, ex, pieces.abilities, byStep.get("abilities"));
  for (const fig of figures(next)) {
    const own = byStep.get(`rig:${fig.key}`);
    // A figure with no rig yet (e.g. a new enemy from a re-run world step) always gets one.
    if (own || !next.rigs[fig.key]) next.rigs[fig.key] = await rigStep(ctx, fig, ex, next.rigs[fig.key], own);
  }
  if (byStep.has("rooms") || byStep.has("world")) next.rooms = await roomsStep(ctx, next, ex, pieces.rooms, byStep.get("rooms"));
  return { cartridge: stitch(next, ctx.character), pieces: next };
}
