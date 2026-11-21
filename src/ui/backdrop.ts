/**
 * World preview: sky gradient (sky -> skyBottom), a silhouette for the backdrop
 * kind, a floating platform and the ground/groundTop strip. Drawn at low native
 * resolution and scaled up with nearest-neighbour. Preview only; the engine draws
 * the real parallax.
 */
import type { WorldSummary } from "../shared/api";

const NW = 128;
const NH = 72;
const FALLBACK = { sky: "#202040", skyBottom: "#404070", ground: "#303030", groundTop: "#606060", platform: "#808080", accent: "#ffcc33" };

type Palette = typeof FALLBACK;
type RGB = [number, number, number];

function rgb(hex: string, fb: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(typeof hex === "string" ? hex : "") ?? /^#([0-9a-f]{6})$/i.exec(fb)!;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: RGB, b: RGB, t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function safePalette(w: Pick<WorldSummary, "visualStyle"> | null | undefined): Palette {
  const p = (w?.visualStyle?.palette ?? {}) as Partial<Palette>;
  const out = { ...FALLBACK };
  for (const k of Object.keys(FALLBACK) as (keyof Palette)[]) {
    if (typeof p[k] === "string" && /^#[0-9a-f]{6}$/i.test(p[k]!)) out[k] = p[k]!;
  }
  return out;
}

/** Small deterministic random so a world always previews the same way. */
function rand(seed: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619);
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawNative(ctx: CanvasRenderingContext2D, world: WorldSummary): void {
  const pal = safePalette(world);
  const sky = rgb(pal.sky, FALLBACK.sky);
  const skyB = rgb(pal.skyBottom, FALLBACK.skyBottom);
  const ground = rgb(pal.ground, FALLBACK.ground);
  const r = rand(String(world.id ?? "world"));
  const groundY = NH - 12;

  // Sky gradient in hard bands (pixel look).
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = mix(sky, skyB, i / (bands - 1));
    const y0 = Math.floor((groundY * i) / bands);
    ctx.fillRect(0, y0, NW, Math.ceil(groundY / bands) + 1);
  }

  const far = mix(skyB, ground, 0.35);
  const near = mix(skyB, ground, 0.7);
  const accent = pal.accent;
  const kind = world.visualStyle?.backdrop;

  switch (kind) {
    case "hills":
      ctx.fillStyle = accent;
      ctx.fillRect(98, 8, 8, 8);
      for (const [color, amp, base, freq] of [
        [far, 8, groundY - 14, 0.07],
        [near, 6, groundY - 4, 0.11],
      ] as [string, number, number, number][]) {
        ctx.fillStyle = color;
        const ph = r() * 6;
        for (let x = 0; x < NW; x++) {
          const y = Math.round(base - amp - Math.sin(x * freq + ph) * amp);
          ctx.fillRect(x, y, 1, groundY - y);
        }
      }
      break;
    case "mountains":
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(24, 14, 5, 0, Math.PI * 2);
      ctx.fill();
      for (const [color, count, hMax] of [
        [far, 4, 40],
        [near, 5, 24],
      ] as [string, number, number][]) {
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
          const cx = Math.round((NW / count) * i + r() * 20);
          const hgt = Math.round(hMax * (0.6 + r() * 0.4));
          const half = Math.round(hgt * 0.9);
          ctx.beginPath();
          ctx.moveTo(cx - half, groundY);
          ctx.lineTo(cx, groundY - hgt);
          ctx.lineTo(cx + half, groundY);
          ctx.fill();
        }
      }
      break;
    case "forest":
      for (const [color, count, hMax] of [
        [far, 11, 30],
        [near, 8, 22],
      ] as [string, number, number][]) {
        for (let i = 0; i < count; i++) {
          const cx = Math.round((NW / count) * i + r() * 8);
          const hgt = Math.round(hMax * (0.6 + r() * 0.4));
          ctx.fillStyle = mix(ground, [0, 0, 0], 0.3);
          ctx.fillRect(cx - 1, groundY - 5, 2, 5);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(cx - 6, groundY - 4);
          ctx.lineTo(cx, groundY - hgt);
          ctx.lineTo(cx + 6, groundY - 4);
          ctx.fill();
        }
      }
      break;
    case "city":
      for (const [color, minH, maxH, win] of [
        [far, 14, 40, false],
        [near, 8, 26, true],
      ] as [string, number, number, boolean][]) {
        let x = -2;
        while (x < NW) {
          const bw = 8 + Math.floor(r() * 10);
          const bh = minH + Math.floor(r() * (maxH - minH));
          ctx.fillStyle = color;
          ctx.fillRect(x, groundY - bh, bw, bh);
          if (win) {
            ctx.fillStyle = accent;
            for (let wy = groundY - bh + 3; wy < groundY - 3; wy += 4)
              for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (r() > 0.45) ctx.fillRect(wx, wy, 1, 2);
          }
          x += bw + 1;
        }
      }
      break;
    case "school": {
      ctx.fillStyle = far;
      ctx.fillRect(14, groundY - 34, 100, 34);
      ctx.beginPath();
      ctx.moveTo(52, groundY - 34);
      ctx.lineTo(64, groundY - 46);
      ctx.lineTo(76, groundY - 34);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(64, groundY - 38, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = near;
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 10; col++) if (col !== 5) ctx.fillRect(19 + col * 9, groundY - 30 + row * 9, 5, 5);
      ctx.fillRect(60, groundY - 10, 8, 10);
      break;
    }
    case "interior":
      ctx.fillStyle = far;
      ctx.fillRect(0, 0, NW, groundY);
      ctx.fillStyle = near;
      for (let x = 6; x < NW; x += 30) ctx.fillRect(x, 0, 5, groundY);
      ctx.fillStyle = mix(skyB, sky, 0.3);
      for (let x = 15; x < NW; x += 30) ctx.fillRect(x, 14, 12, 18);
      ctx.fillStyle = accent;
      for (let x = 15; x < NW; x += 30) ctx.fillRect(x + 5, 14, 2, 18);
      break;
    case "void":
    default:
      ctx.fillStyle = accent;
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(r() * NW), Math.floor(r() * (groundY - 2)), 1, 1);
      break;
  }

  // A floating platform, then the ground strip.
  ctx.fillStyle = pal.platform;
  ctx.fillRect(74, groundY - 16, 24, 3);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, groundY, NW, NH - groundY);
  ctx.fillStyle = pal.groundTop;
  ctx.fillRect(0, groundY, NW, 3);
}

/** A static world backdrop preview canvas, scaled by an integer factor. */
export function backdropPreview(world: WorldSummary, scale = 2): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = NW * scale;
  canvas.height = NH * scale;
  canvas.className = "pixel backdrop";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  const off = document.createElement("canvas");
  off.width = NW;
  off.height = NH;
  const octx = off.getContext("2d");
  if (!ctx || !octx) return canvas;
  try {
    drawNative(octx, world);
  } catch {
    octx.fillStyle = "#202030";
    octx.fillRect(0, 0, NW, NH);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, NW * scale, NH * scale);
  return canvas;
}

export function paletteSwatch(world: WorldSummary): HTMLElement {
  const pal = safePalette(world);
  const el = document.createElement("div");
  el.className = "swatch";
  for (const k of ["sky", "skyBottom", "ground", "groundTop", "platform", "accent"] as const) {
    const s = document.createElement("span");
    s.style.background = pal[k];
    s.title = `${k} ${pal[k]}`;
    el.appendChild(s);
  }
  return el;
}
