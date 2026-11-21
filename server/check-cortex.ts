/**
 * SERVER LANE. Setup check: connects to Snowflake, checks the tables exist, and
 * tries AI_COMPLETE with response_format on each candidate model.
 * Run: npx tsx server/check-cortex.ts   (prints no credentials)
 */
import { cortexComplete, query } from "./snowflake";

const CANDIDATES = [process.env.CORTEX_MODEL, "claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-4-6", "claude-sonnet-4-5"]
  .filter((m, i, all): m is string => !!m && all.indexOf(m) === i);

const schema = {
  type: "object",
  properties: { answer: { type: "string" }, number: { type: "integer" }, tags: { type: "array", items: { type: "string" } } },
  required: ["answer", "number", "tags"],
  additionalProperties: false,
};

async function main() {
  const [who] = await query<Record<string, string>>(
    "SELECT CURRENT_USER() AS U, CURRENT_ROLE() AS R, CURRENT_WAREHOUSE() AS W, CURRENT_REGION() AS REGION",
  );
  console.log(`Connected as ${who.U} / role ${who.R} / warehouse ${who.W} / region ${who.REGION}`);

  const tables = await query<{ name: string }>("SHOW TABLES IN SCHEMA RETRO.PUBLIC");
  console.log(`Tables: ${tables.map((t) => t.name).join(", ") || "(none, run server/sql/setup.sql)"}`);

  let working: string | null = null;
  for (const model of CANDIDATES) {
    const started = Date.now();
    try {
      const out = await cortexComplete<{ answer: string; number: number; tags: string[] }>(
        'Reply with answer "ok", number 7 and tags ["retro", "remix"].',
        schema,
        { model, maxTokens: 200, timeoutMs: 60_000 },
      );
      const ok = out.answer === "ok" && out.number === 7 && Array.isArray(out.tags);
      console.log(`${ok ? "OK  " : "ODD "} ${model} (${Date.now() - started} ms): ${JSON.stringify(out)}`);
      if (ok && !working) working = model;
      if (working) break;
    } catch (err) {
      console.log(`FAIL ${model}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  console.log(working ? `\nUse CORTEX_MODEL=${working}` : "\nNo model worked: check cross-region inference and the CORTEX_USER grant.");
  process.exit(working ? 0 : 1);
}

main().catch((err) => {
  console.error(`Setup check failed: ${(err as Error).message.split("\n")[0]}`);
  process.exit(1);
});
