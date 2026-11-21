/** Small geometry helpers on entity physics bodies (no Phaser runtime needed). */
import type { RuntimeEntity } from "../types";

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

export function rectOf(e: RuntimeEntity): Rect {
  const b = e.body.body;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

export function centerOf(e: RuntimeEntity): Vec {
  const b = e.body.body;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Distance from a point to the nearest point of a rect (0 inside). */
export function distPointRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Gap between two rects (0 when touching/overlapping). */
export function distRectRect(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True if a thick segment (x1,y1)-(x2,y2) of total width `width` touches the rect. */
export function segmentHitsRect(x1: number, y1: number, x2: number, y2: number, width: number, r: Rect): boolean {
  // Sample along the segment; step small enough for 4 px bodies.
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len / 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (distPointRect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r) <= width / 2) return true;
  }
  return false;
}

export function norm(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: 1, y: 0 };
}

/** 2,000 / 1,000,000 style; never NaN/Infinity on screen. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return Math.round(n).toLocaleString("en-US");
}
