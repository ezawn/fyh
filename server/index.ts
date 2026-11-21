/**
 * AI LANE owns server/ and cartridges/.
 * STUB: serves the saved cartridges. POST /api/cartridges and POST /api/remix
 * return 501 until the AI lane implements them (see docs/LANES.md).
 */
import "dotenv/config";
import express from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Cartridge } from "../src/shared/cartridge";
import { toSummary, type ApiError } from "../src/shared/api";

const CART_DIR = path.resolve("cartridges");
const app = express();
app.use(express.json({ limit: "1mb" }));

function fail(res: express.Response, status: number, code: string, message: string) {
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
}

async function loadAll(): Promise<Cartridge[]> {
  const files = (await readdir(CART_DIR)).filter((f) => f.endsWith(".json"));
  const carts: Cartridge[] = [];
  for (const f of files) {
    const parsed = Cartridge.safeParse(JSON.parse(await readFile(path.join(CART_DIR, f), "utf8")));
    if (parsed.success) carts.push(parsed.data);
    else console.warn(`Skipping invalid cartridge ${f}`);
  }
  return carts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

app.get("/api/cartridges", async (_req, res) => {
  res.json((await loadAll()).map(toSummary));
});

app.get("/api/cartridges/:id", async (req, res) => {
  const cart = (await loadAll()).find((c) => c.id === req.params.id);
  if (!cart) return fail(res, 404, "NOT_FOUND", `No cartridge "${req.params.id}"`);
  res.json(cart);
});

app.post("/api/cartridges", (_req, res) => fail(res, 501, "NOT_IMPLEMENTED", "Generation not built yet"));
app.post("/api/remix", (_req, res) => fail(res, 501, "NOT_IMPLEMENTED", "Remix not built yet"));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
