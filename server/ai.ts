/**
 * SERVER LANE. Picks the AI backend for generation and remix lines.
 * Snowflake trial accounts can't call Cortex AI_COMPLETE, so the default is the
 * Anthropic API when ANTHROPIC_API_KEY is set; the library stays in Snowflake.
 * Set AI_PROVIDER=cortex to go back to Cortex on a paid account.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { cortexSafeSchema } from "./cortex-schema";
import { cortexComplete, type CompleteFn, type CompleteOptions } from "./snowflake";

export type AiProvider = "anthropic" | "cortex";

export function aiProvider(): AiProvider {
  const p = process.env.AI_PROVIDER;
  if (p === "anthropic" || p === "cortex") return p;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "cortex";
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

export const aiComplete: CompleteFn = (prompt, jsonSchema, opts) =>
  aiProvider() === "anthropic" ? anthropicComplete(prompt, jsonSchema, opts) : cortexComplete(prompt, jsonSchema, opts);
