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

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

/** One Gemini generateContent call constrained by a JSON schema; returns the parsed object. */
export async function geminiComplete<T = unknown>(prompt: string, jsonSchema: unknown, opts: CompleteOptions = {}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY in .env");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const schema = cortexSafeSchema(jsonSchema);

  // Newer API versions take a JSON Schema as responseJsonSchema; older ones only know responseSchema.
  const call = async (schemaField: "responseJsonSchema" | "responseSchema") => {
    const res = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", [schemaField]: schema, maxOutputTokens: opts.maxTokens ?? 32000 },
      }),
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
    });
    return { res, body: (await res.json().catch(() => ({}))) as GeminiResponse };
  };

  let { res, body } = await call("responseJsonSchema");
  if (res.status === 400 && /responseJsonSchema/i.test(body.error?.message ?? "")) ({ res, body } = await call("responseSchema"));
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
