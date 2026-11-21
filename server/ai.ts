/**
 * SERVER LANE. Picks the AI backend for generation and remix lines.
 * Snowflake trial accounts can't call Cortex AI_COMPLETE, so the default is the
 * Anthropic API when ANTHROPIC_API_KEY is set; the library stays in Snowflake.
 * Set AI_PROVIDER=gemini for Google's Gemini API (free tier, GEMINI_API_KEY), or
 * AI_PROVIDER=cortex to go back to Cortex on a paid account. With none of them,
 * AI is off: generation says so honestly and sessions use the original dialogue.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { cortexSafeSchema } from "./cortex-schema";
import { cortexComplete, type CompleteFn, type CompleteOptions } from "./snowflake";

export type AiProvider = "anthropic" | "gemini" | "cortex" | "none";

export const AI_OFF_MESSAGE =
  "Live generation is off: no AI backend is configured (Snowflake trial accounts can't use Cortex AI, and no AI key is set). The shared library still works.";

export function aiProvider(): AiProvider {
  const p = process.env.AI_PROVIDER;
  if (p === "anthropic" || p === "gemini" || p === "cortex") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return process.env.GEMINI_API_KEY ? "gemini" : "none";
}

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

/** Keeps the schema's structure down to `depth` levels of objects/arrays; deeper values become open. */
export function shallowSchema(schema: unknown, depth: number): unknown {
  if (Array.isArray(schema)) return schema.map((s) => shallowSchema(s, depth));
  if (!schema || typeof schema !== "object") return schema;
  const s = schema as Record<string, unknown>;
  if (depth <= 0 && (s.type === "object" || s.type === "array" || s.anyOf)) {
    return s.type === "array" ? { type: "array", items: {} } : { type: "object" };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, shallowSchema(sub, depth - 1)]));
    } else if (k === "items") {
      out[k] = shallowSchema(v, depth - 1);
    } else if (k === "anyOf") {
      out[k] = shallowSchema(v, depth);
    } else {
      out[k] = v;
    }
  }
  return out;
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: { retryDelay?: string }[] };
};

/** A model that's out of free-tier quota (or still busy after retries); the next model in GEMINI_MODEL is tried. */
class GeminiUnavailable extends Error {
  constructor(message: string, readonly untilMs: number) {
    super(message);
  }
}

/** Models whose daily free-tier quota ran out in this process, with when to try them again. */
const exhausted = new Map<string, number>();

/** How long to wait for a Gemini model to start answering before trying the next one. */
const FIRST_BYTE_MS = Number(process.env.GEMINI_FIRST_BYTE_MS ?? 30_000);

/**
 * One Gemini call constrained by a JSON schema; returns the parsed object.
 * GEMINI_MODEL may list several models ("a,b,c"): the free tier allows only about 20
 * requests a day per model, so when one runs out (or stays busy) the next one is used.
 */
export async function geminiComplete<T = unknown>(prompt: string, jsonSchema: unknown, opts: CompleteOptions = {}): Promise<T> {
  const models = (process.env.GEMINI_MODEL ?? "gemini-3.6-flash").split(",").map((m) => m.trim()).filter(Boolean);
  const errors: string[] = [];
  for (const model of models) {
    if ((exhausted.get(model) ?? 0) > Date.now()) {
      errors.push(`${model}: daily free quota used up`);
      continue;
    }
    try {
      return await geminiCompleteWith<T>(model, prompt, jsonSchema, opts);
    } catch (err) {
      if (!(err instanceof GeminiUnavailable)) throw err;
      if (err.untilMs) exhausted.set(model, err.untilMs);
      errors.push(`${model}: ${err.message}`);
      console.warn(`[ai] ${model}: ${err.message}; trying the next model`);
    }
  }
  throw new Error(`No Gemini model is available right now (${errors.join("; ")}). Free-tier quotas reset daily; add more models to GEMINI_MODEL or try later.`);
}

async function geminiCompleteWith<T>(model: string, prompt: string, jsonSchema: unknown, opts: CompleteOptions): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY in .env");
  const schema = cortexSafeSchema(jsonSchema);

  // Gemini 3+ models take a thinking level; map our effort onto it so short jobs stay fast.
  const thinkingLevel = { low: "LOW", medium: "MEDIUM", high: "HIGH", xhigh: "HIGH", max: "HIGH" }[opts.effort ?? "medium"];
  const thinkingConfig = /^gemini-([3-9]|\d{2,})/.test(model) ? { thinkingConfig: { thinkingLevel } } : {};

  // Streams (SSE) so long generations aren't cut off by fetch's 5-minute wait for response headers.
  // Newer API versions take a JSON Schema as responseJsonSchema; older ones only know responseSchema.
  const call = async (schemaField: "responseJsonSchema" | "responseSchema", schema: unknown, text: string) => {
    // An overloaded model can accept the request and then send nothing; give up on it after
    // FIRST_BYTE_MS so the next model in the list gets a turn.
    const silent = new AbortController();
    const timer = setTimeout(() => silent.abort(), FIRST_BYTE_MS);
    const signals = [silent.signal, ...(opts.timeoutMs ? [AbortSignal.timeout(opts.timeoutMs)] : [])];
    let res: Response;
    try {
      res = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { responseMimeType: "application/json", [schemaField]: schema, maxOutputTokens: opts.maxTokens ?? 32000, ...thinkingConfig },
        }),
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (silent.signal.aborted) throw new GeminiUnavailable(`no answer within ${FIRST_BYTE_MS / 1000} s`, 0);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !res.body) return { res, body: (await res.json().catch(() => ({}))) as GeminiResponse };

    // Merge the streamed chunks into one response.
    let out = "";
    let finishReason: string | undefined;
    let blockReason: string | undefined;
    let buffer = "";
    const decoder = new TextDecoder();
    const take = (line: string) => {
      if (!line.startsWith("data:")) return;
      const chunk = JSON.parse(line.slice(5)) as GeminiResponse;
      blockReason ??= chunk.promptFeedback?.blockReason;
      const c = chunk.candidates?.[0];
      out += (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      finishReason = c?.finishReason ?? finishReason;
    };
    const reader = res.body.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      buffer += decoder.decode(r.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(take);
    }
    take(buffer);
    const body: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: out }] }, finishReason }],
      promptFeedback: blockReason ? { blockReason } : undefined,
    };
    return { res, body };
  };

  // Free-tier models are often busy (503) or rate-limited (429): retry up to 3 times, waiting as long
  // as Gemini asks (RetryInfo.retryDelay) when that's under a minute; longer means the daily quota is gone.
  const busyRetry: typeof call = async (field, s, text) => {
    let r = await call(field, s, text);
    for (const fallbackMs of [3000, 8000, 15000]) {
      if (r.res.status !== 503 && r.res.status !== 429) break;
      const asked = r.body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      const askedMs = asked ? parseFloat(asked) * 1000 : NaN;
      if (askedMs > 60_000) break;
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(askedMs) ? askedMs + 500 : fallbackMs));
      r = await call(field, s, text);
    }
    return r;
  };
  let { res, body } = await busyRetry("responseJsonSchema", schema, prompt);
  if (res.status === 400 && /responseJsonSchema/i.test(body.error?.message ?? "")) ({ res, body } = await busyRetry("responseSchema", schema, prompt));
  // Gemini can't serve schemas as big as a whole cartridge. Retry with shallower ones and put the
  // full schema in the prompt instead; validateCartridge + one repair call enforce the rest.
  const withSchema = `${prompt}\n\nYour JSON must match this JSON Schema exactly, including every required field at every depth:\n${JSON.stringify(schema)}`;
  for (const depth of [4, 3, 2]) {
    if (!(res.status === 400 && /too many states/i.test(body.error?.message ?? ""))) break;
    ({ res, body } = await busyRetry("responseJsonSchema", shallowSchema(schema, depth), withSchema));
  }
  if (res.status === 429 || res.status === 503) {
    const asked = body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
    const askedMs = asked ? parseFloat(asked) * 1000 : 0;
    throw new GeminiUnavailable(res.status === 503 ? "busy" : askedMs > 60_000 ? "daily free quota used up" : "rate limited", askedMs > 60_000 ? Date.now() + askedMs : 0);
  }
  if (!res.ok) throw new Error(`Gemini ${res.status} ${body.error?.status ?? ""}: ${(body.error?.message ?? "request failed").split("\n")[0]}`);

  if (body.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt (${body.promptFeedback.blockReason})`);
  const candidate = body.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish === "MAX_TOKENS") throw new Error(`Gemini's output was cut off at ${opts.maxTokens ?? 32000} tokens`);
  if (finish && finish !== "STOP") throw new Error(`Gemini stopped early (${finish})`);
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no output (model ${model})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini returned text that is not JSON (model ${model}): ${text.slice(0, 200)}`);
  }
}

/** Models this key can call with generateContent (for picking GEMINI_MODEL). */
export async function geminiModels(): Promise<{ name: string; outputTokenLimit?: number }[]> {
  const res = await fetch(`${GEMINI_API}/models?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" } });
  const body = (await res.json()) as { models?: { name: string; outputTokenLimit?: number; supportedGenerationMethods?: string[] }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? "could not list models"}`);
  return (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ name: m.name.replace(/^models\//, ""), outputTokenLimit: m.outputTokenLimit }));
}

/** Structured outputs want every object closed; Cortex-safe stripping already drops unsupported keywords. */
function closeObjects(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closeObjects);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      out[k] = k === "properties" && v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, closeObjects(sub)]))
        : closeObjects(v);
    }
    if (out.type === "object" && out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  }
  return schema;
}

let client: Anthropic | null = null;

/** One Claude call with a JSON schema; returns the parsed object. Throws on refusal, truncation or timeout. */
export async function anthropicComplete<T = unknown>(prompt: string, jsonSchema: unknown, opts: CompleteOptions = {}): Promise<T> {
  client ??= new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  const schema = closeObjects(cortexSafeSchema(jsonSchema)) as Record<string, unknown>;

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs, maxRetries: 0 } : undefined,
  );
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new Error(`Claude declined the request (${message.stop_details?.category ?? "no category"})`);
  if (message.stop_reason === "max_tokens") throw new Error(`Claude's output was cut off at ${opts.maxTokens ?? 32000} tokens`);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  if (!text) throw new Error(`Claude returned no output (model ${message.model})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Claude returned text that is not JSON (model ${message.model}): ${text.slice(0, 200)}`);
  }
}

export const aiComplete: CompleteFn = (prompt, jsonSchema, opts) => {
  const provider = aiProvider();
  if (provider === "anthropic") return anthropicComplete(prompt, jsonSchema, opts);
  if (provider === "gemini") return geminiComplete(prompt, jsonSchema, opts);
  if (provider === "cortex") return cortexComplete(prompt, jsonSchema, opts);
  return Promise.reject(new Error(AI_OFF_MESSAGE));
};
