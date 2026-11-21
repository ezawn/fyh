// Validates every cartridge in content/ (or the files given as arguments).
// Run: npm run check:content   or   npm run check:content -- content/foo.json
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateCartridge } from "../src/shared/validate";

const args = process.argv.slice(2);
const files = args.length
  ? args
  : (await readdir("content").catch(() => [] as string[])).filter((f) => f.endsWith(".json")).map((f) => path.join("content", f));

if (files.length === 0) {
  console.log("No cartridges in content/ yet.");
  process.exit(0);
}

let bad = 0;
for (const f of files) {
  let problems: string[];
  try {
    problems = validateCartridge(JSON.parse(await readFile(f, "utf8")));
  } catch (e) {
    problems = [`could not read JSON: ${(e as Error).message}`];
  }
  if (problems.length) {
    bad++;
    console.log(`✗ ${f}\n  - ${problems.join("\n  - ")}`);
  } else console.log(`✓ ${f}`);
}
process.exit(bad ? 1 : 0);
