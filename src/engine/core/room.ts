/** Parse a room's ASCII layout (SPEC §4.5) into grid facts + spawns. */
import { TILE } from "../../shared/schema";
import type { Room } from "../../shared/schema";
import type { RoomSpawns } from "../types";

export type Cell = { c: number; r: number };
export type Rect = { c: number; r: number; w: number; h: number }; // in tiles

export interface ParsedRoom {
  cols: number;
  rows: number;
  at(c: number, r: number): string;
  spawns: RoomSpawns;
  exits: Cell[];
  checkpoints: Cell[];
  destructibles: Cell[];
  npcs: { npcIndex: number; x: number; y: number }[];
  /** Merged rectangles of "#" tiles. */
  solidRects: Rect[];
  /** Horizontal runs of "=" tiles (h = 1). */
  oneWayRuns: Rect[];
  /** Horizontal runs of "^" tiles (h = 1). */
  spikeRuns: Rect[];
}

const feet = (c: number, r: number) => ({ x: c * TILE + TILE / 2, y: (r + 1) * TILE });

export function parseRoom(room: Room, enemyCount: number, npcCount: number): ParsedRoom {
  const layout = room.layout;
  const rows = layout.length;
  const cols = Math.max(1, ...layout.map((l) => l.length));
  const at = (c: number, r: number) => layout[r]?.[c] ?? ".";

  let player: { x: number; y: number } | null = null;
  const enemies: RoomSpawns["enemies"] = [];
  let boss: RoomSpawns["boss"] = null;
  const checkpoints: Cell[] = [];
  const exits: Cell[] = [];
  const destructibles: Cell[] = [];
  const npcs: ParsedRoom["npcs"] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      if (ch === "S" && !player) player = feet(c, r);
      else if (ch >= "1" && ch <= "5") {
        const enemyIndex = ch.charCodeAt(0) - 49;
        if (enemyIndex < enemyCount) enemies.push({ enemyIndex, ...feet(c, r) });
      } else if (ch === "B" && !boss) boss = feet(c, r);
      else if (ch === "C") checkpoints.push({ c, r });
      else if (ch === "E") exits.push({ c, r });
      else if (ch === "X") destructibles.push({ c, r });
      else if (ch === "a" || ch === "b" || ch === "c") {
        const npcIndex = ch.charCodeAt(0) - 97;
        if (npcIndex < npcCount) npcs.push({ npcIndex, ...feet(c, r) });
      }
    }
  }
  if (!player) player = feet(1, Math.max(0, rows - 5));

  return {
    cols,
    rows,
    at,
    spawns: { player, enemies, boss, checkpoints: checkpoints.map((k) => feet(k.c, k.r)) },
    exits,
    checkpoints,
    destructibles,
    npcs,
    solidRects: mergeRects(cols, rows, (c, r) => at(c, r) === "#"),
    oneWayRuns: runs(cols, rows, (c, r) => at(c, r) === "="),
    spikeRuns: runs(cols, rows, (c, r) => at(c, r) === "^"),
  };
}

function runs(cols: number, rows: number, is: (c: number, r: number) => boolean): Rect[] {
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!is(c, r)) {
        c++;
        continue;
      }
      const start = c;
      while (c < cols && is(c, r)) c++;
      out.push({ c: start, r, w: c - start, h: 1 });
    }
  }
  return out;
}

/** Greedy rectangle merge (fewer static bodies, no seams to snag on). */
function mergeRects(cols: number, rows: number, is: (c: number, r: number) => boolean): Rect[] {
  const used: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const free = (c: number, r: number) => is(c, r) && !used[r][c];
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!free(c, r)) continue;
      let w = 0;
      while (c + w < cols && free(c + w, r)) w++;
      let h = 1;
      while (r + h < rows) {
        let ok = true;
        for (let i = 0; i < w; i++) if (!free(c + i, r + h)) ok = false;
        if (!ok) break;
        h++;
      }
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used[y][x] = true;
      out.push({ c, r, w, h });
    }
  }
  return out;
}
