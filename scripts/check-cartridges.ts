// Validates every file in cartridges/ against the contract. Run: npm run check:carts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { checkCartridge } from "../src/shared/cartridge";

const dir = path.resolve("cartridges");
let bad = 0;
for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
  const problems = checkCartridge(JSON.parse(await readFile(path.join(dir, f), "utf8")));
  if (problems.length) {
    bad++;
    console.log(`✗ ${f}\n  - ${problems.join("\n  - ")}`);
  } else console.log(`✓ ${f}`);
}
process.exit(bad ? 1 : 0);
