/**
 * HTTP API between the web app and the server (docs/SPEC.md section 7).
 * All JSON. Errors: non-2xx with ApiError.
 *
 *   GET  /api/characters        -> CharacterSummary[]
 *   GET  /api/worlds            -> WorldSummary[]
 *   GET  /api/cartridges/:id    -> Cartridge
 *   POST /api/generate          GenerateRequest -> newline-delimited JSON stream of GenerateEvent
 *   POST /api/session           SessionRequest  -> SessionResponse
 */
import type { Cartridge, CharacterDef, WorldDef, WorldDialogue } from "./schema";

export type ApiError = { error: { code: string; message: string } };

// ---------- Library ----------
export type CharacterSummary = Pick<
  CharacterDef,
  "id" | "name" | "source" | "rig" | "stats" | "tags" | "abilities" | "assumptions"
> & { cartridgeId: string };

export type WorldSummary = Pick<WorldDef, "id" | "name" | "source" | "visualStyle"> & {
  bossName: string;
  roomNames: string[];
  cartridgeId: string;
};

export function toCharacterSummary(c: Cartridge): CharacterSummary {
  const { id, name, source, rig, stats, tags, abilities, assumptions } = c.character;
  return { id, name, source, rig, stats, tags, abilities, assumptions, cartridgeId: c.id };
}

export function toWorldSummary(c: Cartridge): WorldSummary {
  const { id, name, source, visualStyle, boss, rooms } = c.world;
  return { id, name, source, visualStyle, bossName: boss.name, roomNames: rooms.map((r) => r.name), cartridgeId: c.id };
}

// ---------- Generation ----------
export type GenerateRequest = {
  title: string; // "Dragon Ball episode 1"
  character: string; // "Goku"
};

export type GenerateStage = "interpreting" | "validating" | "repairing" | "saving" | "done";

/** One line of the /api/generate stream. The last line is always a "result". */
export type GenerateEvent =
  | { type: "stage"; stage: GenerateStage; detail?: string }
  | { type: "result"; result: GenerateResult };

export type GenerateResult =
  | { status: "ready"; cartridge: Cartridge }
  | { status: "needs_clarification"; question: string }
  | { status: "unknown_source"; message: string }
  | { status: "failed"; message: string; problems?: string[] };

// ---------- Play session ----------
export type SessionRequest = { characterId: string; worldId: string };

/**
 * Fresh runtime copies. The engine may mutate its own runtime state but these
 * definitions are never written back. `dialogue` is the remix flavour lines,
 * or the world's original dialogue if none could be generated.
 */
export type SessionResponse = {
  character: CharacterDef;
  world: WorldDef;
  dialogue: WorldDialogue;
  dialogueSource: "remix" | "original";
};
