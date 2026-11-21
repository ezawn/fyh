/**
 * SERVER LANE. Cartridge library storage.
 *  - SnowflakeStore (default): the shared library in RETRO.PUBLIC.CARTRIDGES / REMIX_LINES (SPEC 8.4).
 *  - MemoryStore (STORE=memory only): seeded from content/*.json, for offline dev. Not shared, not persistent.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Cartridge, RemixLines } from "../src/shared/schema";
import { autoFix, validateCartridge } from "../src/shared/validate";
import { query, table } from "./snowflake";

export interface Store {
  readonly kind: "snowflake" | "memory";
  /** Every cartridge with status "ready" (others never show in lists). */
  listReady(): Promise<Cartridge[]>;
  /** Any cartridge by id, or null. */
  get(id: string): Promise<Cartridge | null>;
  /** Inserts a new cartridge. Never overwrites: throws IdTakenError if the id exists. */
  save(cart: Cartridge): Promise<void>;
  getRemix(characterId: string, worldId: string): Promise<RemixLines | null>;
  saveRemix(characterId: string, worldId: string, lines: RemixLines): Promise<void>;
  /** Removes a cartridge and any cached remix lines that use its character or world. False if it didn't exist. */
  delete(id: string): Promise<boolean>;
}

export class IdTakenError extends Error {
  constructor(public id: string) {
    super(`Cartridge id "${id}" is already taken`);
  }
}

/** Parses stored DATA (object or JSON string). Logs and drops anything that no longer matches the schema. */
function parseCartridge(data: unknown, label: string): Cartridge | null {
  let json = data;
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      console.warn(`[store] ${label}: DATA is not JSON, skipping`);
      return null;
    }
  }
  const parsed = Cartridge.safeParse(json);
  if (!parsed.success) {
    console.warn(`[store] ${label}: does not match the schema, skipping (${parsed.error.issues[0]?.message})`);
    return null;
  }
  return parsed.data;
}

function parseRemix(data: unknown): RemixLines | null {
  const json = typeof data === "string" ? safeJson(data) : data;
  const parsed = RemixLines.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snowflake
// ---------------------------------------------------------------------------

/** First numeric value of the first row (e.g. "number of rows inserted"). */
function affected(rows: Record<string, unknown>[]): number {
  const v = rows[0] ? Object.values(rows[0])[0] : 0;
  return Number(v) || 0;
}

export class SnowflakeStore implements Store {
  readonly kind = "snowflake" as const;

  async listReady(): Promise<Cartridge[]> {
    const rows = await query<{ ID: string; DATA: unknown }>(
      `SELECT ID, DATA FROM ${table("CARTRIDGES")} WHERE STATUS = 'ready' ORDER BY CREATED_AT, ID`,
    );
    return rows.map((r) => parseCartridge(r.DATA, r.ID)).filter((c): c is Cartridge => !!c && c.status === "ready");
  }

  async get(id: string): Promise<Cartridge | null> {
    const rows = await query<{ ID: string; DATA: unknown }>(`SELECT ID, DATA FROM ${table("CARTRIDGES")} WHERE ID = ?`, [id]);
    return rows[0] ? parseCartridge(rows[0].DATA, rows[0].ID) : null;
  }

  async save(cart: Cartridge): Promise<void> {
    // VALUES can't hold PARSE_JSON, so INSERT ... SELECT; the NOT EXISTS guard means we never overwrite.
    const rows = await query(
      `INSERT INTO ${table("CARTRIDGES")} (ID, SCHEMA_VERSION, STATUS, DATA, CREATED_AT)
       SELECT ?, ?, ?, PARSE_JSON(?), ?::TIMESTAMP_TZ
       WHERE NOT EXISTS (SELECT 1 FROM ${table("CARTRIDGES")} WHERE ID = ?)`,
      [cart.id, cart.schemaVersion, cart.status, JSON.stringify(cart), cart.createdAt, cart.id],
    );
    if (affected(rows) === 0) throw new IdTakenError(cart.id);
  }

  /** Seeding only: insert or replace by ID. */
  async upsert(cart: Cartridge): Promise<"inserted" | "updated"> {
    const existed = (await query(`SELECT 1 AS X FROM ${table("CARTRIDGES")} WHERE ID = ?`, [cart.id])).length > 0;
    await query(
      `MERGE INTO ${table("CARTRIDGES")} t
       USING (SELECT ? AS ID, ? AS SCHEMA_VERSION, ? AS STATUS, PARSE_JSON(?) AS DATA, ?::TIMESTAMP_TZ AS CREATED_AT) s
       ON t.ID = s.ID
       WHEN MATCHED THEN UPDATE SET SCHEMA_VERSION = s.SCHEMA_VERSION, STATUS = s.STATUS, DATA = s.DATA
       WHEN NOT MATCHED THEN INSERT (ID, SCHEMA_VERSION, STATUS, DATA, CREATED_AT)
         VALUES (s.ID, s.SCHEMA_VERSION, s.STATUS, s.DATA, s.CREATED_AT)`,
      [cart.id, cart.schemaVersion, cart.status, JSON.stringify(cart), cart.createdAt],
    );
    return existed ? "updated" : "inserted";
  }

  async getRemix(characterId: string, worldId: string): Promise<RemixLines | null> {
    const rows = await query<{ DATA: unknown }>(
      `SELECT DATA FROM ${table("REMIX_LINES")} WHERE CHARACTER_ID = ? AND WORLD_ID = ?`,
      [characterId, worldId],
    );
    return rows[0] ? parseRemix(rows[0].DATA) : null;
  }

  async saveRemix(characterId: string, worldId: string, lines: RemixLines): Promise<void> {
    await query(
      `MERGE INTO ${table("REMIX_LINES")} t
       USING (SELECT ? AS CHARACTER_ID, ? AS WORLD_ID, PARSE_JSON(?) AS DATA) s
       ON t.CHARACTER_ID = s.CHARACTER_ID AND t.WORLD_ID = s.WORLD_ID
       WHEN MATCHED THEN UPDATE SET DATA = s.DATA, CREATED_AT = CURRENT_TIMESTAMP()
       WHEN NOT MATCHED THEN INSERT (CHARACTER_ID, WORLD_ID, DATA) VALUES (s.CHARACTER_ID, s.WORLD_ID, s.DATA)`,
      [characterId, worldId, JSON.stringify(lines)],
    );
  }

  async delete(id: string): Promise<boolean> {
    const cart = await this.get(id);
    if (!cart) return false;
    await query(`DELETE FROM ${table("REMIX_LINES")} WHERE CHARACTER_ID = ? OR WORLD_ID = ?`, [cart.character.id, cart.world.id]);
    return affected(await query(`DELETE FROM ${table("CARTRIDGES")} WHERE ID = ?`, [id])) > 0;
  }
}

// ---------------------------------------------------------------------------
// Memory (offline dev only)
// ---------------------------------------------------------------------------

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private carts = new Map<string, Cartridge>();
  private remix = new Map<string, RemixLines>();

  constructor(initial: Cartridge[] = []) {
    for (const c of initial) this.carts.set(c.id, structuredClone(c));
  }

  /** Loads every valid cartridge in a folder (autoFix + validateCartridge), logging the ones it skips. */
  static async fromContent(dir = path.resolve("content")): Promise<MemoryStore> {
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
    const carts: Cartridge[] = [];
    for (const f of files) {
      try {
        const fixed = autoFix(JSON.parse(await readFile(path.join(dir, f), "utf8")));
        const problems = validateCartridge(fixed);
        if (problems.length) {
          console.warn(`[store] skipping ${f}: ${problems.length} problem(s), first: ${problems[0]}`);
          continue;
        }
        carts.push(Cartridge.parse(fixed));
      } catch (err) {
        console.warn(`[store] skipping ${f}: ${(err as Error).message}`);
      }
    }
    console.log(`[store] memory store loaded ${carts.length} cartridge(s) from ${files.length} file(s) in ${dir}`);
    return new MemoryStore(carts);
  }

  async listReady() {
    return [...this.carts.values()].filter((c) => c.status === "ready").map((c) => structuredClone(c));
  }
  async get(id: string) {
    const c = this.carts.get(id);
    return c ? structuredClone(c) : null;
  }
  async save(cart: Cartridge) {
    if (this.carts.has(cart.id)) throw new IdTakenError(cart.id);
    this.carts.set(cart.id, structuredClone(cart));
  }
  async getRemix(characterId: string, worldId: string) {
    const r = this.remix.get(`${characterId}\u0000${worldId}`);
    return r ? structuredClone(r) : null;
  }
  async saveRemix(characterId: string, worldId: string, lines: RemixLines) {
    this.remix.set(`${characterId}\u0000${worldId}`, structuredClone(lines));
  }
  async delete(id: string) {
    const cart = this.carts.get(id);
    if (!cart) return false;
    for (const key of [...this.remix.keys()]) {
      const [ch, w] = key.split("\u0000");
      if (ch === cart.character.id || w === cart.world.id) this.remix.delete(key);
    }
    return this.carts.delete(id);
  }
}

/** STORE=memory -> MemoryStore (loudly labelled); anything else -> the shared Snowflake library. */
export async function createStore(): Promise<Store> {
  if ((process.env.STORE ?? "").toLowerCase() === "memory") {
    console.warn("=".repeat(72));
    console.warn("STORE=memory: not the shared Snowflake library. Nothing is persisted or shared.");
    console.warn("=".repeat(72));
    return MemoryStore.fromContent(path.resolve(process.env.CONTENT_DIR ?? "content"));
  }
  return new SnowflakeStore();
}
