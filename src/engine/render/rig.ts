/**
 * Shape-rig rasterizer (SPEC §6). Pure 2D canvas / ImageData: NO Phaser import here,
 * so the UI lane can use drawRig / rigPreviewCanvas for select-screen previews.
 *
 * Rigs are rasterized pixel by pixel (pixel centre inside shape) so the result is
 * crisp, unsmoothed pixel art even when parts rotate. Rigs are authored facing right.
 */
import { RIG_SIZES } from "../../shared/schema";
import type { Ability, Rig, Shape } from "../../shared/schema";
import type { AnimName } from "../types";

export type AttackKind = Ability["animation"];

export interface RigPose {
  anim: AnimName;
  /** Time in ms (drives idle bob / run cycle). */
  t: number;
  /** -1 mirrors the drawing (drawRig only; the Phaser renderer flips the image instead). */
  facing?: 1 | -1;
  /** Attack overlay (anim "attack"): kind, aim angle in world radians, 0..1 progress, ms since start. */
  attack?: { kind: AttackKind; angle: number; progress: number; elapsed: number };
  /** Paint every pixel white (hurt flash). */
  white?: boolean;
}

export function rigSize(rig: Rig): { w: number; h: number } {
  return RIG_SIZES[rig.sizeClass] ?? RIG_SIZES.human;
}

/** Transparent border around the native canvas so rotated limbs are not clipped. */
export function rigMargin(rig: Rig): number {
  const { w, h } = rigSize(rig);
  return Math.ceil(Math.max(w, h) / 4);
}

type PartXf = { angle: number; px: number; py: number; dx: number; dy: number };
const ID: PartXf = { angle: 0, px: 0, py: 0, dx: 0, dy: 0 };

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16) || 0;
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

const DEG = Math.PI / 180;

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Rotation that points a limb (rest = straight down) toward local angle `a`. */
function limbToward(a: number): number {
  return normAngle(a - Math.PI / 2);
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

interface Transforms {
  head: PartXf;
  torso: PartXf;
  armFront: PartXf;
  armBack: PartXf;
  legFront: PartXf;
  legBack: PartXf;
  /** Hand-tip glow (cast/shoot/beam flash), rig-local coordinates. */
  glow: { x: number; y: number } | null;
}

function armLength(rig: Rig): number {
  const [sx, sy] = rig.pivots.shoulder;
  let L = 2;
  for (const s of rig.parts.armFront) {
    const pts =
      s.type === "rect"
        ? [
            [s.x, s.y],
            [s.x + s.w, s.y],
            [s.x, s.y + s.h],
            [s.x + s.w, s.y + s.h],
          ]
        : [[s.x, s.y + s.r]];
    for (const [x, y] of pts) L = Math.max(L, Math.hypot(x - sx, y - sy));
  }
  return L;
}

function computeTransforms(rig: Rig, pose: RigPose): Transforms {
  const [sx, sy] = rig.pivots.shoulder;
  const [hx, hy] = rig.pivots.hip;
  const rot = (angle: number, px: number, py: number, dy = 0): PartXf => ({ angle, px, py, dx: 0, dy });
  let legF = 0,
    legB = 0,
    armF = 0,
    armB = 0,
    bob = 0;
  let glow: Transforms["glow"] = null;

  switch (pose.anim) {
    case "idle":
    case "hurt":
      bob = Math.floor(pose.t / 500) % 2; // 1 px, 1 s loop
      break;
    case "run": {
      const s = Math.sin((pose.t / 400) * Math.PI * 2);
      legF = s * 30 * DEG;
      legB = -legF;
      armF = -s * 20 * DEG;
      armB = -armF;
      break;
    }
    case "jump":
      legF = -20 * DEG;
      legB = 15 * DEG;
      armF = -135 * DEG;
      armB = 135 * DEG;
      break;
    case "attack":
    case "death":
      break;
  }

  const atk = pose.attack;
  if (pose.anim === "attack" && atk) {
    // Aim in rig-local space (rig faces right; mirror when facing left).
    const local = (pose.facing ?? 1) === 1 ? atk.angle : Math.PI - atk.angle;
    const target = limbToward(local);
    const p = easeOut(Math.min(1, Math.max(0, atk.progress)));
    switch (atk.kind) {
      case "punch":
        armF = normAngle(target * p);
        armB = 15 * DEG;
        break;
      case "swing":
        armF = normAngle(target - 1.8 * (1 - p));
        break;
      case "kick":
        legF = Math.max(-100 * DEG, Math.min(30 * DEG, target)) * p;
        legB = 10 * DEG * p;
        armF = -30 * DEG;
        armB = 30 * DEG;
        break;
      case "cast":
      case "shoot":
      case "beam": {
        armF = target;
        if (atk.kind === "cast") armB = normAngle(target + 25 * DEG);
        if (Math.floor(atk.elapsed / 60) % 2 === 0 && atk.elapsed < 360) {
          const L = armLength(rig);
          glow = { x: sx - Math.sin(armF) * L, y: sy + Math.cos(armF) * L };
        }
        break;
      }
    }
  }

  return {
    head: { ...ID, dy: bob },
    torso: { ...ID, dy: bob },
    armFront: rot(armF, sx, sy, bob),
    armBack: rot(armB, sx, sy, bob),
    legFront: rot(legF, hx, hy),
    legBack: rot(legB, hx, hy),
    glow,
  };
}

/**
 * Rasterize the rig into an RGBA buffer of size (w + 2m) × (h + 2m), where m = rigMargin(rig).
 * Rig pixel (0, 0) lands at buffer pixel (m, m).
 */
export function rasterRig(rig: Rig, pose: RigPose, margin = rigMargin(rig)): ImageData {
  const { w, h } = rigSize(rig);
  const W = w + margin * 2;
  const H = h + margin * 2;
  const img = new ImageData(W, H);
  const buf = img.data;
  const xf = computeTransforms(rig, pose);
  const white = !!pose.white;

  const paint = (shapes: Shape[], t: PartXf, bright = false) => {
    const cos = Math.cos(t.angle);
    const sin = Math.sin(t.angle);
    // forward: q -> R(q - p) + p + d + margin
    const fwd = (x: number, y: number): [number, number] => {
      const rx = x - t.px;
      const ry = y - t.py;
      return [cos * rx - sin * ry + t.px + t.dx + margin, sin * rx + cos * ry + t.py + t.dy + margin];
    };
    for (const s of shapes) {
      let [r, g, b] = white ? [255, 255, 255] : rgb(s.color);
      if (bright && !white) {
        r = Math.min(255, r + 90);
        g = Math.min(255, g + 90);
        b = Math.min(255, b + 90);
      }
      const x0 = s.type === "rect" ? s.x : s.x - s.r;
      const y0 = s.type === "rect" ? s.y : s.y - s.r;
      const x1 = s.type === "rect" ? s.x + s.w : s.x + s.r;
      const y1 = s.type === "rect" ? s.y + s.h : s.y + s.r;
      const corners = [fwd(x0, y0), fwd(x1, y0), fwd(x0, y1), fwd(x1, y1)];
      const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])) - 1));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0])) + 1));
      const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])) - 1));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(...corners.map((c) => c[1])) + 1));
      const rr = s.type === "circle" ? (s.r + 0.25) * (s.r + 0.25) : 0;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          // inverse: c -> R^-1(c - margin - d - p) + p
          const cx = px + 0.5 - margin - t.dx - t.px;
          const cy = py + 0.5 - margin - t.dy - t.py;
          const u = cos * cx + sin * cy + t.px;
          const v = -sin * cx + cos * cy + t.py;
          let inside: boolean;
          if (s.type === "rect") inside = u >= s.x && u < s.x + s.w && v >= s.y && v < s.y + s.h;
          else inside = (u - s.x) * (u - s.x) + (v - s.y) * (v - s.y) <= rr;
          if (!inside) continue;
          const i = (py * W + px) * 4;
          buf[i] = r;
          buf[i + 1] = g;
          buf[i + 2] = b;
          buf[i + 3] = 255;
        }
      }
    }
  };

  const p = rig.parts;
  const extras = (to: "head" | "torso" | "armFront", t: PartXf, bright = false) => {
    for (const e of p.extras) if (e.attachTo === to) paint(e.shapes, t, bright);
  };
  const flashing = xf.glow !== null;
  // Same layering as content/rig-preview.html (what the rigs were tuned against).
  paint(p.armBack, xf.armBack);
  paint(p.legBack, xf.legBack);
  paint(p.legFront, xf.legFront);
  paint(p.torso, xf.torso);
  paint(p.head, xf.head);
  paint(p.armFront, xf.armFront, flashing);
  extras("torso", xf.torso);
  extras("head", xf.head);
  extras("armFront", xf.armFront, flashing);
  if (xf.glow) {
    const c = { type: "circle" as const, x: xf.glow.x, y: xf.glow.y, r: Math.max(1, rigSize(rig).h / 24), color: "#fff6a0" };
    paint([c], { ...ID, dy: xf.armFront.dy });
  }
  return img;
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Draw the rig into `ctx` with rig pixel (0, 0) at the context's current origin.
 * Uses the context's transform, so callers can scale (set imageSmoothingEnabled = false).
 */
export function drawRig(ctx: CanvasRenderingContext2D, rig: Rig, pose?: { anim: AnimName; t: number; facing?: 1 | -1 }): void {
  const full: RigPose = { anim: "idle", t: 0, ...pose };
  const m = rigMargin(rig);
  const img = rasterRig(rig, { ...full, facing: 1 }, m);
  if (!scratch) scratch = document.createElement("canvas");
  scratch.width = img.width;
  scratch.height = img.height;
  scratch.getContext("2d")!.putImageData(img, 0, 0);
  const { w } = rigSize(rig);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (full.facing === -1) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(scratch, -m, -m);
  ctx.restore();
}

/** A standalone canvas (rig size × scale) with the rig's idle pose, nearest-neighbour scaled. */
export function rigPreviewCanvas(rig: Rig, scale: number): HTMLCanvasElement {
  const { w, h } = rigSize(rig);
  const s = Math.max(1, Math.round(scale));
  const canvas = document.createElement("canvas");
  canvas.width = w * s;
  canvas.height = h * s;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(s, s);
  drawRig(ctx, rig, { anim: "idle", t: 0 });
  return canvas;
}

/** Rasterize plain shapes (props) into a w×h buffer, pixel-centre test, no smoothing. */
export function rasterShapes(shapes: Shape[], w: number, h: number): ImageData {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  const img = new ImageData(W, H);
  const buf = img.data;
  for (const s of shapes) {
    const [r, g, b] = rgb(s.color);
    const x0 = Math.max(0, Math.floor(s.type === "rect" ? s.x : s.x - s.r - 1));
    const x1 = Math.min(W - 1, Math.ceil(s.type === "rect" ? s.x + s.w : s.x + s.r + 1));
    const y0 = Math.max(0, Math.floor(s.type === "rect" ? s.y : s.y - s.r - 1));
    const y1 = Math.min(H - 1, Math.ceil(s.type === "rect" ? s.y + s.h : s.y + s.r + 1));
    const rr = s.type === "circle" ? (s.r + 0.25) * (s.r + 0.25) : 0;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const u = px + 0.5;
        const v = py + 0.5;
        const inside =
          s.type === "rect" ? u >= s.x && u < s.x + s.w && v >= s.y && v < s.y + s.h : (u - s.x) * (u - s.x) + (v - s.y) * (v - s.y) <= rr;
        if (!inside) continue;
        const i = (py * W + px) * 4;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = 255;
      }
    }
  }
  return img;
}
