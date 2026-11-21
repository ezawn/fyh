/**
 * SERVER + UI LANE owns server/.
 * STUB: serves the hand-made cartridges in content/ from disk so the other lanes
 * can work before Snowflake is wired up. Replace storage with Snowflake and
 * implement /api/generate + remix lines (docs/SPEC.md sections 5.6, 7, 8).
 */
import "dotenv/config";
import express from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Cartridge } from "../src/shared/schema";
import { toCharacterSummary, toWorldSummary, type ApiError, type SessionResponse } from "../src/shared/api";

const CONTENT_DIR = path.resolve("content");
const app = express();
app.use(express.json({ limit: "1mb" }));

function fail(res: express.Response, status: number, code: string, message: string) {
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
}

async function loadAll(): Promise<Cartridge[]> {
  const files = (await readdir(CONTENT_DIR).catch(() => [])).filter((f) => f.endsWith(".json"));
  const carts: Cartridge[] = [];
  for (const f of files) {
    const parsed = Cartridge.safeParse(JSON.parse(await readFile(path.join(CONTENT_DIR, f), "utf8")));
    if (parsed.success && parsed.data.status === "ready") carts.push(parsed.data);
    else if (!parsed.success) console.warn(`Skipping invalid cartridge ${f}`);
  }
  return carts;
}

app.get("/api/characters", async (_req, res) => res.json((await loadAll()).map(toCharacterSummary)));
app.get("/api/worlds", async (_req, res) => res.json((await loadAll()).map(toWorldSummary)));

app.get("/api/cartridges/:id", async (req, res) => {
  const cart = (await loadAll()).find((c) => c.id === req.params.id);
  if (!cart) return fail(res, 404, "NOT_FOUND", `No cartridge "${req.params.id}"`);
  res.json(cart);
});

app.post("/api/session", async (req, res) => {
  const { characterId, worldId } = req.body ?? {};
  const carts = await loadAll();
  const character = carts.find((c) => c.character.id === characterId)?.character;
  const world = carts.find((c) => c.world.id === worldId)?.world;
  if (!character || !world) return fail(res, 404, "NOT_FOUND", "Unknown character or world");
  const session: SessionResponse = {
    character: structuredClone(character),
    world: structuredClone(world),
    dialogue: structuredClone(world.dialogue),
    dialogueSource: "original",
  };
  res.json(session);
});

app.post("/api/generate", (_req, res) => fail(res, 501, "NOT_IMPLEMENTED", "Generation not built yet"));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
