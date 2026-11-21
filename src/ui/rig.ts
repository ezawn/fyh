/**
 * PLACEHOLDER rig preview renderer for the select screens, used until the engine
 * lane ships its own rig renderer (SPEC 6.2). Draws a Rig at native size
 * (RIG_SIZES) on an offscreen canvas, then scales it up with nearest-neighbour.
 * idle: 1 px bob, 1 s loop. Active (hover/selected): run cycle, legs ±30° around
 * pivots.hip, arms ±20° around pivots.shoulder, 0.4 s loop.
 * Never throws: missing or odd rigs draw a "?" box.
 */
import { RIG_SIZES, type Rig, type Shape } from "../shared/schema";

const PAD = 3; // native px of room around the rig for bob and swinging limbs
const DEG = Math.PI / 180;

type Pose = { bob: number; leg: number; arm: number };
type Point = [number, number];

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function rigSize(rig: unknown): { w: number; h: number } | null {
  const r = rig as Rig | null | undefined;
  if (!r || typeof r !== "object" || !r.parts || typeof r.parts !== "object") return null;
  return (RIG_SIZES as Record<string, { w: number; h: number }>)[r.sizeClass] ?? null;
}

function shapes(v: unknown): Shape[] {
  return Array.isArray(v) ? (v as Shape[]) : [];
}

function pivot(rig: Rig, key: "neck" | "shoulder" | "hip", fallback: Point): Point {
  const p = rig.pivots?.[key];
  return Array.isArray(p) && num(p[0]) && num(p[1]) ? [p[0], p[1]] : fallback;
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
  if (!s || typeof s !== "object") return;
  ctx.fillStyle = typeof s.color === "string" ? s.color : "#ff00ff";
  if (s.type === "rect" && num(s.x) && num(s.y) && num(s.w) && num(s.h)) {
    ctx.fillRect(s.x, s.y, s.w, s.h);
  } else if (s.type === "circle" && num(s.x) && num(s.y) && num(s.r) && s.r > 0) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPart(ctx: CanvasRenderingContext2D, list: Shape[], at: Point, angle: number): void {
  if (!list.length) return;
  ctx.save();
  if (angle) {
    ctx.translate(at[0], at[1]);
    ctx.rotate(angle);
    ctx.translate(-at[0], -at[1]);
  }
  for (const s of list) drawShape(ctx, s);
  ctx.restore();
}

function extrasFor(rig: Rig, attachTo: string): Shape[] {
  const ex = Array.isArray(rig.parts.extras) ? rig.parts.extras : [];
  return ex.filter((e) => e && e.attachTo === attachTo).flatMap((e) => shapes(e.shapes));
}

/** Draws the rig at native resolution into ctx (which is PAD px larger on each side). */
function drawNative(ctx: CanvasRenderingContext2D, rig: Rig, size: { w: number; h: number }, pose: Pose): void {
  const p = rig.parts;
  const hip = pivot(rig, "hip", [size.w / 2, size.h * 0.65]);
  const shoulder = pivot(rig, "shoulder", [size.w / 2, size.h * 0.3]);
  ctx.save();
  ctx.translate(PAD, PAD + pose.bob);
  drawPart(ctx, shapes(p.armBack), shoulder, pose.arm);
  drawPart(ctx, shapes(p.legBack), hip, -pose.leg);
  drawPart(ctx, [...shapes(p.torso), ...extrasFor(rig, "torso")], hip, 0);
  drawPart(ctx, shapes(p.legFront), hip, pose.leg);
  drawPart(ctx, [...shapes(p.head), ...extrasFor(rig, "head")], hip, 0);
  drawPart(ctx, [...shapes(p.armFront), ...extrasFor(rig, "armFront")], shoulder, -pose.arm);
  ctx.restore();
}

function drawUnknown(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const s = Math.max(16, Math.floor(Math.min(w, h) * 0.6));
  const x = Math.floor((w - s) / 2);
  const y = Math.floor((h - s) / 2);
  ctx.fillStyle = "#3a3a52";
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = "#e8e8f0";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = "#e8e8f0";
  ctx.font = `${Math.floor(s * 0.5)}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", w / 2, h / 2 + 1);
}

const offscreens = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** Draws one frame of the rig into `canvas`, scaled up by the biggest integer factor that fits. */
export function drawRig(canvas: HTMLCanvasElement, rig: unknown, pose: Pose = { bob: 0, leg: 0, arm: 0 }): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = rigSize(rig);
  if (!size) return drawUnknown(ctx, canvas.width, canvas.height);
  try {
    const nw = size.w + PAD * 2;
    const nh = size.h + PAD * 2;
    let off = offscreens.get(canvas);
    if (!off || off.width !== nw || off.height !== nh) {
      off = document.createElement("canvas");
      off.width = nw;
      off.height = nh;
      offscreens.set(canvas, off);
    }
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.clearRect(0, 0, nw, nh);
    drawNative(octx, rig as Rig, size, pose);

    const scale = Math.max(1, Math.floor(Math.min(canvas.width / nw, canvas.height / nh)));
    const dw = nw * scale;
    const dh = nh * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, nw, nh, Math.floor((canvas.width - dw) / 2), canvas.height - dh, dw, dh);
  } catch {
    drawUnknown(ctx, canvas.width, canvas.height);
  }
}

function poseAt(t: number, active: boolean): Pose {
  if (!active) return { bob: Math.floor(t / 500) % 2 ? -1 : 0, leg: 0, arm: 0 };
  const s = Math.sin((t / 400) * Math.PI * 2);
  return { bob: Math.floor(t / 200) % 2 ? -1 : 0, leg: s * 30 * DEG, arm: s * 20 * DEG };
}

// ---------- shared animation loop ----------

type Entry = { canvas: HTMLCanvasElement; rig: unknown; isActive: () => boolean; born: number; seen: boolean };
const entries = new Set<Entry>();
let raf = 0;

function tick(t: number): void {
  for (const e of entries) {
    if (!e.canvas.isConnected) {
      // Removed from the page (or never attached within 3 s): stop animating it.
      if (e.seen || t - e.born > 3000) entries.delete(e);
      continue;
    }
    e.seen = true;
    let active = false;
    try {
      active = e.isActive();
    } catch {
      /* ignore */
    }
    drawRig(e.canvas, e.rig, poseAt(t, active));
  }
  raf = entries.size ? requestAnimationFrame(tick) : 0;
}

/**
 * An animated rig preview canvas. Runs while `isActive()` is true, idles otherwise.
 * It stops animating by itself once removed from the DOM.
 */
export function rigPreview(rig: unknown, opts: { width: number; height: number; isActive?: () => boolean; className?: string }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  canvas.className = `pixel rig ${opts.className ?? ""}`.trim();
  canvas.setAttribute("aria-hidden", "true");
  drawRig(canvas, rig, poseAt(0, false));
  entries.add({ canvas, rig, isActive: opts.isActive ?? (() => canvas.matches(":hover")), born: performance.now(), seen: false });
  if (!raf) raf = requestAnimationFrame(tick);
  return canvas;
}
