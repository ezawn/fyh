/**
 * SERVER LANE. Seeds every cartridge in content/ (or the files given) into RETRO.PUBLIC.CARTRIDGES.
 * autoFix + validateCartridge each; MERGE (upsert by ID) the valid ones; skip invalid ones with their problems.
 * Run: npx tsx server/seed.ts [content/foo.json ...]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Cartridge } from "../src/shared/schema";
import { autoFix, validateCartridge } from "../src/shared/validate";
import { SnowflakeStore } from "./store";

const args = process.argv.slice(2);
const files = args.length
  ? args
  : (await readdir("content").catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort().map((f) => path.join("content", f));

if (files.length === 0) {
  console.log("No cartridges in content/: nothing to seed.");
  process.exit(0);
}

const store = new SnowflakeStore();
let ok = 0;
let skipped = 0;
for (const f of files) {
  let problems: string[];
  let fixed: unknown;
  try {
    fixed = autoFix(JSON.parse(await readFile(f, "utf8")));
    problems = validateCartridge(fixed);
  } catch (err) {
    problems = [`could not read JSON: ${(err as Error).message}`];
  }
  if (problems.length) {
    skipped++;
    console.log(`SKIP ${f}: ${problems.length} problem(s)\n  - ${problems.join("\n  - ")}`);
    continue;
  }
  const cart = Cartridge.parse(fixed);
  try {
    const action = await store.upsert(cart);
    ok++;
    console.log(`OK   ${f} -> ${cart.id} (${action}, status ${cart.status})`);
  } catch (err) {
    skipped++;
    console.log(`FAIL ${f} -> ${cart.id}: ${(err as Error).message.split("\n")[0]}`);
  }
}
console.log(`\nSeeded ${ok}, skipped ${skipped}.`);
process.exit(skipped ? 1 : 0);
