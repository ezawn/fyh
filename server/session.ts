/**
 * SERVER LANE. POST /api/session (SPEC 5.6, 7): fresh copies of a character and a world,
 * plus crossover flavour dialogue (cached in REMIX_LINES, else one Cortex call, else the originals).
 */
import { z } from "zod";
import type { SessionResponse } from "../src/shared/api";
import { isStomp, maxHitOn, resolveHit, type Combatant } from "../src/shared/combat";
import {
  MAX_DIALOGUE_CHARS,
  RemixLines,
  remixLinesJsonSchema,
  type CharacterDef,
  type EnemyDef,
  type WorldDef,
} from "../src/shared/schema";
import { remixPrompt } from "./prompts";
import type { CompleteFn } from "./snowflake";
import type { Store } from "./store";

export const SessionRequestBody = z.object({
  characterId: z.string().trim().min(1, "characterId is required").max(200),
  worldId: z.string().trim().min(1, "worldId is required").max(200),
});

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type SessionDeps = { store: Store; complete: CompleteFn; timeoutMs?: number };

const REMIX_TIMEOUT_MS = 20_000;

/** Plain-language matchup facts from the real combat code, for the remix prompt. */
export function describeMatchup(player: CharacterDef, world: WorldDef): string[] {
  const facts: string[] = [];
  const fighters: (EnemyDef & { role: string })[] = [
    ...world.enemies.map((e) => ({ ...e, role: "enemy" })),
    { ...world.boss, role: "boss" },
  ];
  for (const f of fighters) {
    const foe: Combatant = { stats: f.stats, tags: f.tags };
    const best = maxHitOn(player, foe);
    const blocked = player.abilities
      .map((a) => ({ a, hit: resolveHit(player, a, foe) }))
      .filter(({ hit }) => hit.blocked)
      .map(({ a, hit }) => `${a.name} (${hit.reason})`);
    const toKill = best > 0 ? Math.ceil(f.stats.HP / best) : Infinity;
    const theirHit = resolveHit(foe, f.attack, player).damage;
    const toDie = theirHit > 0 ? Math.ceil(player.stats.HP / theirHit) : Infinity;
    const offence =
      best === 0
        ? `${player.name} cannot damage ${f.name} (${f.role}) at all`
        : toKill === 1
          ? `${player.name} kills ${f.name} (${f.role}, ${f.stats.HP} HP) in one hit (best hit ${best})`
          : `${player.name} needs ${toKill} hits to defeat ${f.name} (${f.role}, ${f.stats.HP} HP; best hit ${best})`;
    const defence =
      theirHit === 0
        ? `${f.name} cannot hurt ${player.name}`
        : toDie === 1
          ? `${f.name} kills ${player.name} in one hit (${theirHit} damage vs ${player.stats.HP} HP)`
          : `${f.name} needs ${toDie} hits to defeat ${player.name} (${theirHit} per hit)`;
    facts.push(`${offence}. ${defence}.`);
    if (blocked.length) facts.push(`${f.name}'s hax blocks: ${blocked.join(", ")}.`);
  }
  if (isStomp(player, world.boss)) facts.push(`STOMP: ${player.name} massively outclasses the boss ${world.boss.name}.`);
  return facts;
}

/** RemixLines schema + the 120-char limit + one intro list per room. Returns problems (empty = ok). */
export function checkRemix(lines: unknown, world: WorldDef): { ok: true; lines: RemixLines } | { ok: false; problem: string } {
  const parsed = RemixLines.safeParse(lines);
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? "invalid" };
  const all = [...parsed.data.roomIntro.flat(), ...parsed.data.bossIntro, ...parsed.data.bossDefeated, ...parsed.data.playerDefeated];
  const long = all.find((l) => l.text.length > MAX_DIALOGUE_CHARS);
  if (long) return { ok: false, problem: `line longer than ${MAX_DIALOGUE_CHARS} chars` };
  if (parsed.data.roomIntro.length !== world.rooms.length) return { ok: false, problem: "roomIntro must have one list per room" };
  return { ok: true, lines: parsed.data };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** One remix call in flight per (character, world): concurrent sessions share it. */
const inFlight = new Map<string, Promise<RemixLines | null>>();

async function remixFor(character: CharacterDef, world: WorldDef, deps: SessionDeps): Promise<RemixLines | null> {
  const { store, complete } = deps;
  try {
    const cached = await store.getRemix(character.id, world.id);
    if (cached) {
      const check = checkRemix(cached, world);
      if (check.ok) return check.lines;
    }
  } catch (err) {
    console.warn(`[session] reading REMIX_LINES failed: ${(err as Error).message.split("\n")[0]}`);
  }

  const key = `${character.id}\u0000${world.id}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      const raw = await withTimeout(
        complete(remixPrompt(character, world, describeMatchup(character, world)), remixLinesJsonSchema(), {
          maxTokens: 4000,
          temperature: 0.7,
          effort: "low", // has to finish inside the 20 s budget
          timeoutMs: deps.timeoutMs ?? REMIX_TIMEOUT_MS,
        }),
        deps.timeoutMs ?? REMIX_TIMEOUT_MS,
      );
      const check = checkRemix(raw, world);
      if (!check.ok) {
        console.warn(`[session] remix lines for ${character.id} x ${world.id} rejected: ${check.problem}`);
        return null;
      }
      store.saveRemix(character.id, world.id, check.lines).catch((err) =>
        console.warn(`[session] caching remix lines failed: ${(err as Error).message.split("\n")[0]}`),
      );
      return check.lines;
    } catch (err) {
      console.warn(`[session] remix call for ${character.id} x ${world.id} failed: ${(err as Error).message.split("\n")[0]}`);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

export async function runSession(req: { characterId: string; worldId: string }, deps: SessionDeps): Promise<SessionResponse> {
  const carts = await deps.store.listReady();
  const charCart = carts.find((c) => c.character.id === req.characterId);
  const worldCart = carts.find((c) => c.world.id === req.worldId);
  if (!charCart) throw new HttpError(404, "NOT_FOUND", `No character "${req.characterId}" in the library`);
  if (!worldCart) throw new HttpError(404, "NOT_FOUND", `No world "${req.worldId}" in the library`);

  const character = structuredClone(charCart.character);
  const world = structuredClone(worldCart.world);

  // A character in its own world keeps the original dialogue: no call.
  const remix = charCart.id === worldCart.id ? null : await remixFor(character, world, deps);
  return {
    character,
    world,
    dialogue: remix ? structuredClone(remix) : structuredClone(world.dialogue),
    dialogueSource: remix ? "remix" : "original",
  };
}
