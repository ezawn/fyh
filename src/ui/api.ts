/**
 * Browser client for the server API (src/shared/api.ts, SPEC 7).
 * Falls back to stub data only when the server is unreachable or returns 5xx.
 */
import type {
  ApiError as ApiErrorBody,
  CharacterSummary,
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  SessionRequest,
  SessionResponse,
  WorldSummary,
} from "../shared/api";
import { STUB_CHARACTERS, STUB_WORLDS, isStubPair, stubSession } from "./stub";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** true when the server couldn't be reached or answered 5xx */
    readonly offline: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status} ${res.statusText}`.trim();
  let code = `http_${res.status}`;
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as Partial<ApiErrorBody>;
      if (body?.error?.message) {
        message = body.error.message;
        code = body.error.code || code;
      }
    } catch {
      if (text.trim()) message += `: ${text.trim().slice(0, 200)}`;
    }
  } catch {
    /* body unreadable */
  }
  return new ApiError(message, code, res.status, res.status >= 500);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError("Server not reachable.", "network", 0, true);
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await request(path, { headers: { Accept: "application/json" } });
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(`Invalid JSON from ${path}.`, "bad_json", res.status, false);
  }
}

// ---------- Library ----------

export type Library = {
  characters: CharacterSummary[];
  worlds: WorldSummary[];
  /** true when this is stub data because the server is unreachable */
  offline: boolean;
  offlineReason?: string;
};

export async function fetchLibrary(): Promise<Library> {
  try {
    const [characters, worlds] = await Promise.all([
      getJson<CharacterSummary[]>("/api/characters"),
      getJson<WorldSummary[]>("/api/worlds"),
    ]);
    if (!Array.isArray(characters) || !Array.isArray(worlds)) {
      throw new ApiError("Unexpected library response (expected arrays).", "bad_shape", 200, false);
    }
    return {
      characters: characters.filter((c) => c && typeof c.id === "string"),
      worlds: worlds.filter((w) => w && typeof w.id === "string"),
      offline: false,
    };
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      return { characters: STUB_CHARACTERS, worlds: STUB_WORLDS, offline: true, offlineReason: e.message };
    }
    throw e;
  }
}

/** Removes a cartridge (its character and world) from the shared library. */
export async function deleteCartridge(id: string): Promise<void> {
  await request(`/api/cartridges/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------- Session ----------

export async function createSession(req: SessionRequest, offlineLibrary: boolean): Promise<SessionResponse> {
  if (offlineLibrary) {
    const s = stubSession(req.characterId, req.worldId);
    if (s) return s;
  }
  try {
    const res = await request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req),
    });
    const body = (await res.json()) as SessionResponse;
    if (!body || !body.character || !body.world) throw new ApiError("Unexpected session response.", "bad_shape", res.status, false);
    if (!body.dialogue) body.dialogue = body.world.dialogue;
    if (body.dialogueSource !== "remix") body.dialogueSource = "original";
    return body;
  } catch (e) {
    if (e instanceof ApiError && e.offline && isStubPair(req.characterId, req.worldId)) {
      const s = stubSession(req.characterId, req.worldId);
      if (s) return s;
    }
    throw e;
  }
}

// ---------- Generation (NDJSON stream) ----------

/**
 * POST /api/generate and read the newline-delimited JSON stream.
 * Calls onEvent for every event as it arrives and resolves with the final result.
 */
export async function generate(
  req: GenerateRequest,
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const res = await request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.body) throw new ApiError("Response has no body to stream.", "no_body", res.status, false);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let ev: GenerateEvent;
    try {
      ev = JSON.parse(trimmed) as GenerateEvent;
    } catch {
      throw new ApiError(`Bad line in generation stream: ${trimmed.slice(0, 120)}`, "bad_stream", res.status, false);
    }
    // Tolerate a server that sends the error body in-stream.
    const maybeErr = ev as unknown as Partial<ApiErrorBody>;
    if (maybeErr?.error?.message) throw new ApiError(maybeErr.error.message, maybeErr.error.code ?? "error", res.status, false);
    onEvent(ev);
    if (ev.type === "result") result = ev.result;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  handleLine(buffer);

  if (!result) throw new ApiError("The generation stream ended without a result.", "no_result", res.status, false);
  return result;
}
