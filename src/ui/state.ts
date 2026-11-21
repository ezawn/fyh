/** App state shared between screens. */
import type { CharacterSummary, WorldSummary } from "../shared/api";
import { fetchLibrary, type Library } from "./api";

export const state = {
  library: null as Library | null,
  selectedCharacterId: null as string | null,
  selectedWorldId: null as string | null,
  /** set by World select, consumed by the play screen */
  pendingPlay: null as { characterId: string; worldId: string } | null,
};

const listeners = new Set<() => void>();
export function onLibraryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let inflight: Promise<Library> | null = null;

export function ensureLibrary(force = false): Promise<Library> {
  if (!force && state.library) return Promise.resolve(state.library);
  if (!force && inflight) return inflight;
  const p = fetchLibrary().then((lib) => {
    state.library = lib;
    listeners.forEach((f) => f());
    return lib;
  });
  inflight = p;
  p.finally(() => {
    if (inflight === p) inflight = null;
  }).catch(() => {});
  return p;
}

export function findCharacter(id: string | null): CharacterSummary | undefined {
  return id ? state.library?.characters.find((c) => c.id === id) : undefined;
}
export function findWorld(id: string | null): WorldSummary | undefined {
  return id ? state.library?.worlds.find((w) => w.id === id) : undefined;
}

export type CartridgeCard = { id: string; title: string; characters: CharacterSummary[]; worlds: WorldSummary[] };

/** Cartridges derived from the character and world lists by cartridgeId. */
export function cartridges(lib: Library): CartridgeCard[] {
  const map = new Map<string, CartridgeCard>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) map.set(id, (c = { id, title: id, characters: [], worlds: [] }));
    return c;
  };
  for (const ch of lib.characters) get(ch.cartridgeId ?? ch.id).characters.push(ch);
  for (const w of lib.worlds) get(w.cartridgeId ?? w.id).worlds.push(w);
  for (const c of map.values()) c.title = c.characters[0]?.source || c.worlds[0]?.source || c.id;
  return [...map.values()];
}
