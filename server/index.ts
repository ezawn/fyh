/**
 * SERVER LANE. Express API (docs/SPEC.md section 7, contract in src/shared/api.ts).
 * Storage: the shared Snowflake library, or STORE=memory for offline dev (server/store.ts).
 */
import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import type { ZodError } from "zod";
import { toCharacterSummary, toWorldSummary, type ApiError, type GenerateEvent } from "../src/shared/api";
import { GenerateRequestBody, runGenerate } from "./generate";
import { HttpError, SessionRequestBody, runSession } from "./session";
import { AI_OFF_MESSAGE, aiComplete, aiProvider } from "./ai";
import { createStore } from "./store";

const store = await createStore();
const app = express();
app.use(express.json({ limit: "1mb" }));

function sendError(res: express.Response, status: number, code: string, message: string) {
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
}

function zodMessage(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** Express 4 doesn't catch rejected promises: route them to the error handler. */
const route =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

app.get("/api/characters", route(async (_req, res) => res.json((await store.listReady()).map(toCharacterSummary))));

app.get("/api/worlds", route(async (_req, res) => res.json((await store.listReady()).map(toWorldSummary))));

app.get(
  "/api/cartridges/:id",
  route(async (req, res) => {
    const id = String(req.params.id);
    const cart = await store.get(id);
    if (!cart || cart.status !== "ready") return sendError(res, 404, "NOT_FOUND", `No cartridge "${id}"`);
    res.json(cart);
  }),
);

// Demo cartridges (content/*.json) can't be deleted, so the showcase always works.
const DEMO_IDS = new Set(
  (await readdir(path.resolve("content")).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)),
);

app.delete(
  "/api/cartridges/:id",
  route(async (req, res) => {
    const id = String(req.params.id);
    if (DEMO_IDS.has(id)) return sendError(res, 403, "PROTECTED", `"${id}" is a demo cartridge and can't be deleted`);
    if (!(await store.delete(id))) return sendError(res, 404, "NOT_FOUND", `No cartridge "${id}"`);
    console.log(`[library] deleted ${id}`);
    res.status(204).end();
  }),
);

app.post(
  "/api/session",
  route(async (req, res) => {
    const body = SessionRequestBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, "BAD_REQUEST", zodMessage(body.error));
    res.json(await runSession(body.data, { store, complete: aiComplete }));
  }),
);

app.post(
  "/api/generate",
  route(async (req, res) => {
    const body = GenerateRequestBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, "BAD_REQUEST", zodMessage(body.error));

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    let closed = false;
    res.on("close", () => (closed = true));
    const emit = (event: GenerateEvent) => {
      if (!closed) res.write(JSON.stringify(event) + "\n");
    };
    // Generation keeps going if the client disconnects, so a finished cartridge still lands in the library.
    if (aiProvider() === "none") {
      emit({ type: "result", result: { status: "failed", message: AI_OFF_MESSAGE } });
      return res.end();
    }
    const result = await runGenerate(body.data, { store, complete: aiComplete, emit, stepwise: aiProvider() === "gemini" || process.env.GENERATE_STEPWISE === "1" });
    console.log(`[generate] "${body.data.title}" / "${body.data.character}" -> ${result.status}${result.status === "ready" ? ` (${result.cartridge.id})` : ""}`);
    res.end();
  }),
);

app.use("/api", (_req, res) => sendError(res, 404, "NOT_FOUND", "No such API route"));

// Error handler: malformed JSON, HttpError, store/Snowflake failures.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message);
  if (e?.type === "entity.parse.failed") return sendError(res, 400, "BAD_REQUEST", "Request body is not valid JSON");
  if (e?.type === "entity.too.large") return sendError(res, 413, "TOO_LARGE", "Request body is too large");
  const message = (e?.message ?? String(err)).split("\n")[0];
  console.error(`[api] ${message}`);
  sendError(res, 503, "STORE_UNAVAILABLE", `The ${store.kind === "snowflake" ? "Snowflake library" : "store"} is unavailable: ${message}`);
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port} (store: ${store.kind}, ai: ${aiProvider()})`));
