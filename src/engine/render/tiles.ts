/**
 * Procedural tile textures in the world palette, generated once per palette.
 * Tileset layout (16×16 each): see TILE_INDEX.
 */
import Phaser from "phaser";
import type { WorldDef } from "../../shared/schema";
import { TILE } from "../../shared/schema";

export type Palette = WorldDef["visualStyle"]["palette"];


export function hex(c: string): number {
  return parseInt(c.replace("#", ""), 16) || 0;
}

export function shade(c: string, f: number): string {
  // f < 0 darkens, f > 0 lightens (fraction toward black/white)
  const n = hex(c);
  const ch = (v: number) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const l = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((1 << 24) | (l(16) << 16) | (l(8) << 8) | l(0)).toString(16).slice(1)}`;
}

function paletteKey(prefix: string, pal: Palette): string {
  return `${prefix}-${pal.sky}${pal.skyBottom}${pal.ground}${pal.groundTop}${pal.platform}${pal.accent}`.replace(/#/g, "");
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  draw(tex.context);
  tex.refresh();
  return key;
}

function tileRng(c: number, r: number, salt: number): () => number {
  let s = (Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Whole-room static art (ground, one-way platforms, spikes) in one canvas texture,
 * with per-tile detail seeded by (col, row). Destructible blocks are separate images.
 */
export function roomTexture(scene: Phaser.Scene, key: string, layout: string[], pal: Palette): string {
  const rows = layout.length;
  const cols = Math.max(...layout.map((l) => l.length));
  return canvasTexture(scene, key, cols * TILE, rows * TILE, (g) => {
    const at = (c: number, r: number) => layout[r]?.[c] ?? ".";
    const solid = (c: number, r: number) => {
      if (c < 0 || c >= cols) return true;
      if (r >= rows) return true;
      const ch = at(c, r);
      return ch === "#" || ch === "X";
    };
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    const dark = shade(pal.ground, -0.25);
    const darker = shade(pal.ground, -0.45);
    const lite = shade(pal.ground, 0.15);
    const grass = pal.groundTop;
    const grassLite = shade(pal.groundTop, 0.3);
    const grassDark = shade(pal.groundTop, -0.25);
    const plank = pal.platform;
    const plankLite = shade(pal.platform, 0.3);
    const plankDark = shade(pal.platform, -0.35);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = at(c, r);
        const x = c * TILE;
        const y = r * TILE;
        const rnd = tileRng(c, r, ch.charCodeAt(0));
        if (ch === "#") {
          const top = r === 0 || !solid(c, r - 1);
          px(x, y, TILE, TILE, pal.ground);
          for (let i = 0; i < 6; i++) px(x + Math.floor(rnd() * 15), y + Math.floor(rnd() * 15), 1 + Math.floor(rnd() * 2), 1, dark);
          for (let i = 0; i < 3; i++) px(x + Math.floor(rnd() * 16), y + Math.floor(rnd() * 16), 1, 1, lite);
          if (rnd() < 0.3) px(x + 3 + Math.floor(rnd() * 9), y + 5 + Math.floor(rnd() * 8), 2, 2, darker);
          if (!solid(c - 1, r)) px(x, y, 1, TILE, darker);
          if (!solid(c + 1, r)) px(x + TILE - 1, y, 1, TILE, darker);
          if (!solid(c, r + 1)) px(x, y + TILE - 1, TILE, 1, darker);
          if (top) {
            for (let i = 0; i < TILE; i++) {
              const h = 3 + Math.floor(rnd() * 3);
              px(x + i, y, 1, h, grass);
              px(x + i, y + h, 1, 1, grassDark);
            }
            px(x, y, TILE, 1, grassLite);
            const tufts = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < tufts; i++) {
              const tx = x + 1 + Math.floor(rnd() * 14);
              const th = 1 + Math.floor(rnd() * 3);
              px(tx, y - th, 1, th, rnd() < 0.5 ? grass : grassLite);
              if (th > 1 && rnd() < 0.5) px(tx + (rnd() < 0.5 ? -1 : 1), y - 1, 1, 1, grass);
            }
            if (!solid(c - 1, r)) px(x, y, 1, 4, grassDark);
            if (!solid(c + 1, r)) px(x + TILE - 1, y, 1, 4, grassDark);
          }
        } else if (ch === "=") {
          const left = at(c - 1, r) !== "=";
          const right = at(c + 1, r) !== "=";
          px(x, y, TILE, 6, plank);
          px(x, y, TILE, 1, plankLite);
          px(x, y + 5, TILE, 1, plankDark);
          for (let i = 0; i < 3; i++) {
            const gy = y + 2 + Math.floor(rnd() * 3);
            const gx = x + Math.floor(rnd() * 10);
            px(gx, gy, 3 + Math.floor(rnd() * 5), 1, shade(pal.platform, -0.18));
          }
          if (rnd() < 0.4) px(x + 4 + Math.floor(rnd() * 8), y + 2, 2, 1, plankDark); // knot
          px(x + 15, y + 1, 1, 4, shade(pal.platform, -0.25)); // plank seam
          if (left) {
            px(x, y, 1, 6, plankDark);
            px(x + 2, y + 2, 1, 1, "#c8c8c8");
          }
          if (right) {
            px(x + 15, y, 1, 6, plankDark);
            px(x + 13, y + 2, 1, 1, "#c8c8c8");
          }
          if (left || right || rnd() < 0.3) px(x + 6, y + 6, 4, 2, plankDark); // bracket
        } else if (ch === "^") {
          px(x, y + 14, TILE, 2, "#4a5060");
          px(x, y + 14, TILE, 1, "#7c8496");
          for (let i = 0; i < 4; i++) {
            const ox = x + i * 4;
            for (let row = 0; row < 7; row++) {
              const w = 1 + Math.floor(row / 2);
              const sx = ox + Math.floor((4 - w) / 2);
              px(sx, y + 7 + row, w, 1, "#9aa3b5");
              px(sx, y + 7 + row, Math.max(1, Math.floor(w / 2)), 1, "#e8ecf4");
            }
            px(ox + 1, y + 7, 1, 1, "#ffffff");
          }
        }
      }
    }
  });
}

/** 16×16 cracked-brick destructible block (3 variants). */
export function blockTexture(scene: Phaser.Scene, pal: Palette, variant: number): string {
  const v = ((variant % 3) + 3) % 3;
  return canvasTexture(scene, paletteKey(`block${v}`, pal), TILE, TILE, (g) => {
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };
    const acc = pal.accent;
    const mortar = shade(acc, -0.45);
    px(0, 0, 16, 16, mortar);
    // bricks: rows of 4px, offset every other row
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let bx = -off; bx < 16; bx += 8) {
        const x0 = Math.max(0, bx + 1);
        const x1 = Math.min(16, bx + 8);
        if (x1 <= x0) continue;
        px(x0, row * 4 + 1, x1 - x0, 3, acc);
        px(x0, row * 4 + 1, x1 - x0, 1, shade(acc, 0.25));
      }
    }
    const rnd = tileRng(v, 7, 99);
    let cx = 5 + Math.floor(rnd() * 6);
    let cy = 1;
    const crack = shade(acc, -0.6);
    while (cy < 15) {
      px(cx, cy, 1, 1, crack);
      cy += 1;
      cx += rnd() < 0.33 ? -1 : rnd() < 0.5 ? 1 : 0;
      cx = Math.max(1, Math.min(14, cx));
    }
    px(0, 0, 16, 1, shade(acc, -0.6));
    px(0, 15, 16, 1, shade(acc, -0.6));
  });
}

/** 16×32 exit door. */
export function exitTexture(scene: Phaser.Scene, pal: Palette): string {
  return canvasTexture(scene, paletteKey("exit", pal), 16, 32, (g) => {
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };
    px(1, 2, 14, 30, shade(pal.accent, -0.5));
    px(3, 4, 10, 28, "#1a1a2a");
    px(4, 5, 8, 26, mix("#1a1a2a", pal.skyBottom, 0.35));
    px(1, 0, 14, 3, pal.accent);
    // arrow
    px(6, 14, 4, 2, "#ffffff");
    px(9, 12, 1, 6, "#ffffff");
    px(10, 13, 1, 4, "#ffffff");
    px(11, 14, 1, 2, "#ffffff");
  });
}

/** 16×32 checkpoint flag; `on` = activated. */
export function flagTexture(scene: Phaser.Scene, pal: Palette, on: boolean): string {
  return canvasTexture(scene, paletteKey(on ? "flagon" : "flagoff", pal), 16, 32, (g) => {
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };
    px(4, 4, 2, 28, "#d8d8d8");
    px(3, 30, 6, 2, "#808080");
    px(4, 3, 2, 1, "#ffffff");
    const c = on ? "#ffe04a" : "#9a9aa8";
    px(6, 5, 8, 6, c);
    px(6, 5, 8, 1, shade(c, 0.4));
    px(12, 7, 2, 2, shade(c, -0.3));
  });
}
