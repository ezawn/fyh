/**
 * SERVER LANE. Prints the size of the Cortex-safe response_format schemas and any keywords
 * that remain outside a conservative allow-list. Offline, no Snowflake needed.
 * Run: npx tsx server/print-schema.ts [--dump]
 */
import { generationJsonSchema, remixLinesJsonSchema } from "../src/shared/schema";
import { cortexSafeSchema, schemaRisks } from "./cortex-schema";

const dump = process.argv.includes("--dump");

function report(name: string, raw: Record<string, unknown>) {
  const safe = cortexSafeSchema(raw);
  const text = JSON.stringify(safe);
  const risks = schemaRisks(safe);
  const anyOfs = (text.match(/"anyOf"/g) ?? []).length;
  console.log(`${name}: raw ${JSON.stringify(raw).length} chars -> cortex-safe ${text.length} chars`);
  console.log(`  keywords outside the allow-list: ${Object.keys(risks.keywords).length ? JSON.stringify(risks.keywords) : "none"}`);
  console.log(`  anyOf (unions kept): ${anyOfs}${anyOfs ? "  (set CORTEX_FLATTEN_UNIONS=1 to merge object unions)" : ""}`);
  console.log(`  bad property names: ${risks.badPropertyNames.join(", ") || "none"}`);
  console.log(`  $ref: ${risks.refs.length}, nested $defs: ${risks.nestedDefs.length}`);
  if (dump) console.log(JSON.stringify(safe, null, 2));
}

report("generation", generationJsonSchema());
report("remixLines", remixLinesJsonSchema());
