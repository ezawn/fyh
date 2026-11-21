/**
 * SERVER LANE. Step-by-step generation for AI backends that can't enforce the
 * whole-cartridge schema in one call (Gemini's free tier). Each step has a small
 * schema the backend can enforce exactly and sees only its slice of the example
 * cartridge. The server stitches the pieces together; runGenerate then validates,
 * repairs (re-running only the steps whose part failed) and saves as usual.
 *
 * Two rounds, each fully parallel and all with low thinking (speed matters more than polish):
 *   1. character + stats, enemies + boss, world name + colours, abilities (all from title + character)
 *   2. one rig per figure, and the rooms
 * Answers are kept small: 1-2 enemy types, no world dialogue, few shapes per rig, ~40-column rooms.
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
  ROOM_MIN_COLS,
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

const MAX_ENEMIES = Math.min(2, MAX_ENEMY_TYPES);
const MAX_SHAPES_PER_PART = 3;
const MAX_EXTRAS = 2;
const ROOM_COLS = `${ROOM_MIN_COLS}-${ROOM_MIN_COLS + 8}`;

/** Generated worlds carry no scripted dialogue; session remix lines still fill it in at play time. */
const NO_DIALOGUE = {
  roomIntro: Array.from({ length: ROOMS_PER_WORLD }, () => []),
  bossIntro: [],
  bossDefeated: [],
  playerDefeated: [],
};

// ---------- Step schemas ----------
const Overview = z.object({
  outcome: z.enum(["cartridge", "needs_clarification", "unknown_source"]),
  question: z.string().optional(), // when needs_clarification
  message: z.string().optional(), // when unknown_source
  source: Cartridge.shape.source.omit({ requestedCharacter: true }).optional(),
  notes: Cartridge.shape.notes.optional(),
  character: CharacterDef.omit({ rig: true, abilities: true }).extend({ powerTier: PowerTier }).optional(),
});

const Fighters = z.object({
  enemies: z.array(EnemyDef.omit({ rig: true }).extend({ powerTier: PowerTier })).min(1).max(MAX_ENEMIES),
  boss: BossDef.omit({ rig: true }).extend({ powerTier: PowerTier }),
});
const Look = z.object({ world: WorldDef.pick({ id: true, name: true, source: true, visualStyle: true }) });
const Abilities = z.object({ abilities: z.array(Ability).length(4) });
const RigOut = z.object({ rig: Rig });
const Rooms = z.object({ rooms: z.array(Room.omit({ props: true })).length(ROOMS_PER_WORLD) });

// Rigs are unions of rect/circle shapes; flattening keeps the schema small enough to serve.
const SCHEMAS = {
  overview: jsonSchema(Overview),
  fighters: jsonSchema(Fighters),
  look: jsonSchema(Look),
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

/** The example rig cut down to the shape budget, so the example matches what we ask for. */
function smallRig(rig: AnyObj | undefined): AnyObj | undefined {
  if (!rig?.parts) return rig;
  const parts = Object.fromEntries(Object.entries(rig.parts as Record<string, unknown[]>).map(([k, v]) => [k, v.slice(0, MAX_SHAPES_PER_PART)]));
  const extras = (rig.extras ?? []).slice(0, MAX_EXTRAS).map((e: AnyObj) => ({ ...e, shapes: e.shapes.slice(0, MAX_SHAPES_PER_PART) }));
  return { ...rig, parts, extras };
}

function exampleSlices(ex: AnyObj | null) {
  if (!ex) return null;
  const { rig: _r, abilities: _a, ...characterCore } = ex.character ?? {};
  const stripRig = ({ rig: _rig, ...rest }: AnyObj) => rest;
  return {
    overview: { outcome: "cartridge", source: ex.source, notes: ex.notes, character: characterCore },
    fighters: { enemies: (ex.world?.enemies ?? []).slice(0, MAX_ENEMIES).map(stripRig), boss: ex.world?.boss ? stripRig(ex.world.boss) : undefined },
    look: { world: { id: ex.world?.id, name: ex.world?.name, source: ex.world?.source, visualStyle: ex.world?.visualStyle } },
    abilities: { abilities: ex.character?.abilities },
    rig: { rig: smallRig(ex.character?.rig) },
    rooms: { rooms: (ex.world?.rooms ?? []).map(({ props: _p, ...room }: AnyObj) => room) },
  };
}
type Examples = ReturnType<typeof exampleSlices>;

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
Other steps run at the same time, so use the source's best-known version of everything.
${o.honesty ? HONESTY_RULES : ""}${SCHEMA_RULES}${SCALE_RULES}
${o.decided ? `## Already decided in earlier steps (stay consistent with it)\n${JSON.stringify(o.decided)}\n` : ""}
${o.example ? `## Example answer for this step (a different source; copy its structure, not its content)\n${JSON.stringify(o.example)}\n` : ""}
${o.current ? `## Your previous answer for this step\n${JSON.stringify(o.current)}\n` : ""}
${o.problems?.length ? `## Problems to fix (fix every one with the smallest change; keep everything else the same and never weaken or rebalance anyone)\n${o.problems.map((p) => `- ${p}`).join("\n")}\n` : ""}
## Your task
${o.task}
Keep the answer short: no extra fields, no long text.
Return one JSON object matching the response schema.`;
}

// ---------- The steps ----------
type Figure = { key: string; name: string; sizeHint: string; brief: AnyObj };

export type Pieces = {
  overview: AnyObj;
  world: AnyObj; // { world: {id, name, source, visualStyle, dialogue}, enemies, boss }
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
  let out: T;
  try {
    out = await ctx.complete<T>(prompt, SCHEMAS[name], { maxTokens, effort: "low" });
  } catch (err) {
    // Thinking counts toward the output limit, so a long answer can get cut off: retry once with more room.
    if (!/cut off/i.test((err as Error)?.message ?? "")) throw err;
    out = await ctx.complete<T>(prompt, SCHEMAS[name], { maxTokens: maxTokens * 3, effort: "low" });
  }
  if (!out || typeof out !== "object") throw new Error(`the ${name} step returned no JSON object`);
  return out;
}

async function overviewStep(ctx: StepContext, ex: Examples, current?: AnyObj, problems?: string[]) {
  return runStep<AnyObj>(ctx, "overview", "Character and stats", stepPrompt({
    ...ctx,
    step: "overview",
    honesty: true,
    task: `First decide honestly whether you know this source (see the honesty rules). If you do, return outcome "cartridge" with: source (title, medium film|tv|anime, versionOrEpisode = the specific film/episode), notes (sourceFacts vs designChoices, 1-3 short items each), and the character WITHOUT rig and abilities: id, name, source, versionOrEpisode, assumptions (2-4 short items), collisionBox, movement, powerTier, stats, tags. Otherwise return outcome "needs_clarification" with a question, or "unknown_source" with a message, and nothing else.`,
    example: ex?.overview,
    current,
    problems,
  }), 16000);
}

async function fightersStep(ctx: StepContext, ex: Examples, current?: AnyObj, problems?: string[]) {
  return runStep<AnyObj>(ctx, "fighters", "Enemies and boss", stepPrompt({
    ...ctx,
    step: "fighters",
    task: `Pick the opponents from the requested film/episode: 1-${MAX_ENEMIES} enemy types and the boss, all WITHOUT rigs (rigs come in a later step). Every enemy and the boss need powerTier with stats inside that tier's band. Ids are kebab-case and unique.`,
    example: ex?.fighters,
    current,
    problems,
  }), 16000);
}

async function lookStep(ctx: StepContext, ex: Examples, current?: AnyObj, problems?: string[]) {
  return runStep<AnyObj>(ctx, "look", "World name and colours", stepPrompt({
    ...ctx,
    step: "look",
    task: `Name the world after the requested film/episode and pick its look: world { id (kebab-case), name, source, visualStyle { palette, backdrop } }. No dialogue.`,
    example: ex?.look,
    current,
    problems,
  }), 4000);
}

async function abilitiesStep(ctx: StepContext, ex: Examples, current?: AnyObj[], problems?: string[]) {
  const out = await runStep<AnyObj>(ctx, "abilities", "The character's 4 abilities", stepPrompt({
    ...ctx,
    step: "abilities",
    task: `Give the requested character exactly 4 abilities in slot order (1 basic, 2 special, 3 movement, 4 ultimate), each using a supported mechanic, matching their best-known powers. Ability ids are kebab-case and unique.`,
    example: ex?.abilities,
    current: current ? { abilities: current } : undefined,
    problems,
  }), 12000);
  return (out.abilities ?? []) as AnyObj[];
}

async function rigStep(ctx: StepContext, fig: Figure, ex: Examples, current?: AnyObj, problems?: string[]) {
  const out = await runStep<AnyObj>(ctx, "rig", `Drawing ${fig.name}`, stepPrompt({
    ...ctx,
    step: `rig for ${fig.name}`,
    decided: fig.brief,
    task: `Draw the rig for ${fig.name} (${fig.sizeHint}): pick the sizeClass that fits, then build head, torso, armFront, armBack, legFront, legBack from rect/circle shapes, at most ${MAX_SHAPES_PER_PART} shapes per part and at most ${MAX_EXTRAS} extras. Simple, but recognisable by colour and silhouette. EVERY shape and pivot must lie inside the sizeClass canvas.`,
    example: ex?.rig,
    current: current ? { rig: current } : undefined,
    problems,
  }), 12000);
  return (out.rig ?? {}) as AnyObj;
}

async function roomsStep(ctx: StepContext, p: Pick<Pieces, "overview" | "world">, ex: Examples, current?: AnyObj[], problems?: string[]) {
  const c = p.overview.character ?? {};
  const out = await runStep<AnyObj>(ctx, "rooms", "The 3 room layouts", stepPrompt({
    ...ctx,
    step: "rooms",
    decided: {
      world: p.world.world?.name,
      enemies: (p.world.enemies ?? []).map((e: AnyObj, i: number) => ({ spawnTile: String(i + 1), name: e.name, behaviour: e.behaviour })),
      boss: p.world.boss?.name,
      characterMovement: c.movement,
    },
    task: `Lay out exactly ${ROOMS_PER_WORLD} rooms (ids room-1..room-${ROOMS_PER_WORLD}, the last is the boss room) following the room rules: ${ROOM_ROWS} rows, all ${ROOM_COLS} columns wide (keep them short), one S, one E per non-boss room, one B in the boss room, enemy spawns only for enemies that exist, and a path the character can actually walk and jump with its movement above.`,
    example: ex?.rooms,
    current: current ? { rooms: current } : undefined,
    problems,
  }), 16000);
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

const worldPiece = (fighters: AnyObj, look: AnyObj): AnyObj => ({
  world: { ...(look.world ?? {}), dialogue: NO_DIALOGUE },
  enemies: fighters.enemies,
  boss: fighters.boss,
});

/** Rigs and rooms only need round 1, so they all go out at once. */
async function roundTwo(ctx: StepContext, pieces: Pieces, ex: Examples, redo: (fig: Figure) => Promise<AnyObj> | null, rooms: Promise<AnyObj[]> | null) {
  await Promise.all([
    ...figures(pieces).map((fig) => redo(fig)?.then((r) => (pieces.rigs[fig.key] = r))),
    rooms?.then((r) => (pieces.rooms = r)),
  ]);
}

/**
 * Runs every step. Returns either an honest non-cartridge outcome from step 1,
 * or { outcome: "cartridge", cartridge, pieces } for the normal pipeline.
 */
export async function generateInSteps(ctx: StepContext): Promise<AnyObj> {
  const ex = exampleSlices(exampleCartridge());
  // Round 1: everything that only needs the title and character. If the overview turns out to be an
  // honest "unknown source" / "which one?", the other answers are thrown away.
  const [overview, fighters, look, abilities] = await Promise.allSettled([
    overviewStep(ctx, ex),
    fightersStep(ctx, ex),
    lookStep(ctx, ex),
    abilitiesStep(ctx, ex),
  ]);
  if (overview.status === "rejected") throw overview.reason;
  if (overview.value.outcome !== "cartridge") return overview.value;
  if (!overview.value.character || !overview.value.source) throw new Error("the overview step returned no character or source");
  for (const r of [fighters, look, abilities]) if (r.status === "rejected") throw r.reason;
  const value = <T>(r: PromiseSettledResult<T>) => (r as PromiseFulfilledResult<T>).value;

  const pieces: Pieces = { overview: overview.value, world: worldPiece(value(fighters), value(look)), abilities: value(abilities), rigs: {}, rooms: [] };
  await roundTwo(ctx, pieces, ex, (fig) => rigStep(ctx, fig, ex), roomsStep(ctx, pieces, ex));
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
  if (/^world\.(enemies|boss)\b/.test(problem)) return "fighters";
  if (/^world\b/.test(problem)) return "look";
  return "overview";
}

/** The one repair: re-runs only the steps whose part failed, each with its own problems, in the same two rounds. */
export async function repairInSteps(ctx: StepContext, pieces: Pieces, problems: string[]): Promise<{ cartridge: AnyObj; pieces: Pieces }> {
  const ex = exampleSlices(exampleCartridge());
  const byStep = new Map<string, string[]>();
  for (const p of problems) byStep.set(stepFor(p), [...(byStep.get(stepFor(p)) ?? []), p]);
  const next: Pieces = { ...pieces, rigs: { ...pieces.rigs } };
  const fighters = { enemies: pieces.world.enemies, boss: pieces.world.boss };
  const look = { world: { ...pieces.world.world } };
  delete look.world.dialogue;

  const [overview, newFighters, newLook, abilities] = await Promise.all([
    byStep.has("overview") ? overviewStep(ctx, ex, pieces.overview, byStep.get("overview")) : null,
    byStep.has("fighters") ? fightersStep(ctx, ex, fighters, byStep.get("fighters")) : fighters,
    byStep.has("look") ? lookStep(ctx, ex, look, byStep.get("look")) : look,
    byStep.has("abilities") ? abilitiesStep(ctx, ex, pieces.abilities, byStep.get("abilities")) : pieces.abilities,
  ]);
  if (overview?.outcome === "cartridge" && overview.character) next.overview = overview;
  next.world = worldPiece(newFighters, newLook);
  next.abilities = abilities;
  const oldNames = new Map(figures(pieces).map((f) => [f.key, f.name]));
  for (const fig of figures(next)) if (oldNames.get(fig.key) !== fig.name) delete next.rigs[fig.key];

  // A figure with no rig yet (e.g. a new enemy from re-run fighters) always gets one; new fighters also need new rooms.
  const redoRooms = byStep.has("rooms") || byStep.has("fighters");
  await roundTwo(
    ctx,
    next,
    ex,
    (fig) => {
      const own = byStep.get(`rig:${fig.key}`);
      return own || !next.rigs[fig.key] ? rigStep(ctx, fig, ex, next.rigs[fig.key], own) : null;
    },
    redoRooms ? roomsStep(ctx, next, ex, pieces.rooms, byStep.get("rooms")) : null,
  );
  return { cartridge: stitch(next, ctx.character), pieces: next };
}
