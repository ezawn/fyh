/**
 * SERVER LANE. Snowflake client: one shared connection, a query helper and the
 * Cortex AI_COMPLETE call. Credentials come only from .env (never the browser).
 *
 * snowflake-sdk is loaded lazily, so STORE=memory and offline scripts work
 * without it (or without a Snowflake account).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import type * as snowflake from "snowflake-sdk";
import { cortexSafeSchema } from "./cortex-schema";

export { cortexSafeSchema } from "./cortex-schema";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

let sdk: Promise<typeof snowflake> | null = null;

function loadSdk(): Promise<typeof snowflake> {
  if (!sdk) {
    sdk = import("snowflake-sdk")
      .then((mod) => {
        const s = ((mod as { default?: typeof snowflake }).default ?? mod) as typeof snowflake;
        s.configure({ logLevel: "ERROR" });
        return s;
      })
      .catch((err) => {
        sdk = null;
        throw new Error(`snowflake-sdk is not installed or failed to load (${(err as Error).message.split("\n")[0]})`);
      });
  }
  return sdk;
}

let conn: Promise<snowflake.Connection> | null = null;

/** Lazily opens one connection, using key-pair auth if a key path is set, else password. */
export function connection(): Promise<snowflake.Connection> {
  if (!conn) {
    conn = loadSdk()
      .then((s) => {
        const keyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;
        const c = s.createConnection({
          account: env("SNOWFLAKE_ACCOUNT"),
          username: env("SNOWFLAKE_USER"),
          ...(keyPath
            ? { authenticator: "SNOWFLAKE_JWT", privateKey: readFileSync(keyPath, "utf8") }
            : { password: env("SNOWFLAKE_PASSWORD") }),
          role: env("SNOWFLAKE_ROLE"),
          warehouse: env("SNOWFLAKE_WAREHOUSE"),
          database: process.env.SNOWFLAKE_DATABASE ?? "RETRO",
          schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
        });
        return c.connectAsync();
      })
      .catch((err) => {
        conn = null;
        throw err;
      });
  }
  return conn;
}

export async function query<T = Record<string, unknown>>(sqlText: string, binds: snowflake.Binds = []): Promise<T[]> {
  const c = await connection();
  return new Promise((resolve, reject) => {
    c.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
    });
  });
}

/** Fully qualified table name from .env (identifiers restricted to letters, digits, _ and $). */
export function table(name: string): string {
  const ident = (s: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) throw new Error(`Bad Snowflake identifier "${s}"`);
    return s;
  };
  return `${ident(process.env.SNOWFLAKE_DATABASE ?? "RETRO")}.${ident(process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC")}.${ident(name)}`;
}

/**
 * Turns JSON into a Snowflake OBJECT/ARRAY constant. AI_COMPLETE wants
 * response_format as a constant, not a bind variable.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  if (Array.isArray(value)) return `[${value.map(sqlLiteral).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${sqlLiteral(k)}: ${sqlLiteral(v)}`);
  return `{${entries.join(", ")}}`;
}

export type CompleteOptions = { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number };

/** Signature shared by the real Cortex call and test fakes. */
export type CompleteFn = <T = unknown>(prompt: string, jsonSchema: unknown, opts?: CompleteOptions) => Promise<T>;

/** Runs AI_COMPLETE with a JSON schema and returns the parsed object. Throws on errors, empty output or timeout. */
export async function cortexComplete<T = unknown>(prompt: string, jsonSchema: unknown, opts: CompleteOptions = {}): Promise<T> {
  const model = opts.model ?? env("CORTEX_MODEL");
  const params = { temperature: opts.temperature ?? 0, max_tokens: opts.maxTokens ?? 32000 };
  const format = { type: "json", schema: cortexSafeSchema(jsonSchema) };
  const sqlText = `SELECT AI_COMPLETE(
    model => ${sqlLiteral(model)},
    prompt => ?,
    model_parameters => ${sqlLiteral(params)},
    response_format => ${sqlLiteral(format)}
  ) AS RESULT`;

  const run = query<{ RESULT: unknown }>(sqlText, [prompt]);
  let timer: NodeJS.Timeout | undefined;
  const rows = opts.timeoutMs
    ? await Promise.race([
        run,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Cortex timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer))
    : await run;

  const result = rows[0]?.RESULT;
  if (result === null || result === undefined) throw new Error(`Cortex returned no output (model ${model})`);
  if (typeof result !== "string") return result as T;
  try {
    return JSON.parse(result) as T;
  } catch {
    throw new Error(`Cortex returned text that is not JSON (model ${model}): ${result.slice(0, 200)}`);
  }
}
