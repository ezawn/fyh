/**
 * Sky gradient + 1–2 procedural parallax layers per backdrop type (SPEC §4.4).
 * Layers are drawn once into repeating canvas textures and shown as TileSprites
 * fixed to the camera; update() scrolls them.
 */
import Phaser from "phaser";
import type { Backdrop } from "../../shared/schema";
import { hex, mix, shade, type Palette } from "./tiles";

const LAYER_W = 256;

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fill(g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Filled silhouette from a height function, pixel columns (seamless if f is periodic in w). */
function ridge(g: CanvasRenderingContext2D, c: string, w: number, h: number, f: (x: number) => number) {
  g.fillStyle = c;
  for (let x = 0; x < w; x++) {
    const top = Math.round(f(x));
    g.fillRect(x, top, 1, h - top);
  }
}

function layers(type: Backdrop, pal: Palette): { draw: Draw; factor: number }[] {
  const far = (c: string) => mix(c, pal.skyBottom, 0.6);
  const near = (c: string) => mix(c, pal.skyBottom, 0.3);
  const TAU = Math.PI * 2;
  switch (type) {
    case "hills":
      return [
        { factor: 0.15, draw: (g, w, h) => ridge(g, far(pal.groundTop), w, h, (x) => h * 0.55 - 18 * Math.sin((x / w) * TAU * 2) - 8 * Math.sin((x / w) * TAU * 5)) },
        { factor: 0.35, draw: (g, w, h) => ridge(g, near(pal.groundTop), w, h, (x) => h * 0.7 - 14 * Math.sin((x / w) * TAU * 3 + 1) - 4 * Math.cos((x / w) * TAU * 7)) },
      ];
    case "mountains":
      return [
        {
          factor: 0.1,
          draw: (g, w, h) => {
            const peaks = [0, 64, 112, 176, 224, 256];
            const hs = [40, 90, 60, 100, 50, 40];
            const f = (x: number) => {
              let i = 0;
              while (i < peaks.length - 2 && x > peaks[i + 1]) i++;
              const t = (x - peaks[i]) / (peaks[i + 1] - peaks[i]);
              return h * 0.75 - (hs[i] * (1 - t) + hs[i + 1] * t);
            };
            ridge(g, far(pal.ground), w, h, f);
            // snow caps
            g.fillStyle = mix("#ffffff", pal.skyBottom, 0.3);
            for (let x = 0; x < w; x++) {
              const top = Math.round(f(x));
              if (top < h * 0.75 - 75) g.fillRect(x, top, 1, Math.max(1, Math.round(h * 0.75 - 75 - top)));
            }
          },
        },
        { factor: 0.3, draw: (g, w, h) => ridge(g, near(pal.ground), w, h, (x) => h * 0.78 - 30 * Math.abs(Math.sin((x / w) * TAU * 1.5)) - 6 * Math.sin((x / w) * TAU * 6)) },
      ];
    case "forest":
      return [
        { factor: 0.15, draw: (g, w, h) => ridge(g, far(pal.groundTop), w, h, (x) => h * 0.5 - Math.abs(Math.sin((x / w) * TAU * 8)) * 14) },
        {
          factor: 0.4,
          draw: (g, w, h, rnd) => {
            const leaf = near(shade(pal.groundTop, -0.25));
            const trunk = near(shade(pal.ground, -0.3));
            fill(g, leaf, 0, h * 0.8, w, h * 0.2);
            for (let x = 8; x < w; x += 32) {
              const th = 50 + rnd() * 30;
              const base = h * 0.82;
              fill(g, trunk, x + 6, base - th * 0.5, 4, th * 0.5);
              for (let i = 0; i < 5; i++) {
                const y = base - th + i * (th * 0.12);
                const hw = 4 + i * 3;
                fill(g, leaf, x + 8 - hw, y, hw * 2, th * 0.12 + 1);
              }
            }
          },
        },
      ];
    case "city":
      return [
        {
          factor: 0.12,
          draw: (g, w, h, rnd) => {
            const c = far(shade(pal.ground, -0.3));
            for (let x = 0; x < w; x += 16) fill(g, c, x, h * 0.45 + rnd() * 40, 15, h);
          },
        },
        {
          factor: 0.3,
          draw: (g, w, h, rnd) => {
            const c = near(shade(pal.ground, -0.45));
            const win = mix(pal.accent, "#ffffff", 0.3);
            for (let x = 0; x < w; x += 32) {
              const top = h * 0.5 + rnd() * 50;
              const bw = 24 + Math.floor(rnd() * 6);
              fill(g, c, x, top, bw, h - top);
              for (let wy = top + 4; wy < h - 6; wy += 7)
                for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (rnd() < 0.45) fill(g, win, wx, wy, 2, 3);
            }
          },
        },
      ];
    case "school":
      return [
        {
          factor: 0.2,
          draw: (g, w, h) => {
            const wall = far(mix(pal.platform, "#ffffff", 0.3));
            const roof = far(shade(pal.accent, -0.2));
            const win = far("#3a5a8a");
            fill(g, wall, 0, h * 0.4, w, h);
            fill(g, roof, 0, h * 0.4 - 4, w, 5);
            for (let x = 6; x < w; x += 20) for (let y = h * 0.4 + 8; y < h * 0.8; y += 22) fill(g, win, x, y, 10, 12);
            // clock tower
            fill(g, wall, 112, h * 0.22, 32, h);
            fill(g, roof, 108, h * 0.22 - 4, 40, 5);
            g.fillStyle = "#ffffff";
            g.beginPath();
            g.arc(128, h * 0.3, 7, 0, Math.PI * 2);
            g.fill();
            fill(g, "#333333", 127, h * 0.3 - 5, 2, 6);
          },
        },
        {
          factor: 0.45,
          draw: (g, w, h) => {
            const c = near(shade(pal.ground, -0.3));
            fill(g, c, 0, h * 0.78, w, 2);
            fill(g, c, 0, h * 0.86, w, 2);
            for (let x = 0; x < w; x += 8) fill(g, c, x, h * 0.75, 2, h * 0.25);
          },
        },
      ];
    case "interior":
      return [
        {
          factor: 0.25,
          draw: (g, w, h) => {
            const wall = shade(pal.sky, -0.1);
            fill(g, wall, 0, 0, w, h);
            for (let x = 0; x < w; x += 16) fill(g, shade(pal.sky, -0.18), x, 0, 1, h);
            fill(g, shade(pal.platform, -0.2), 0, h * 0.72, w, 6);
            for (let x = 24; x < w; x += 128) {
              fill(g, shade(pal.accent, -0.3), x, h * 0.25, 40, 36);
              fill(g, mix(pal.skyBottom, "#ffffff", 0.4), x + 3, h * 0.25 + 3, 34, 30);
              fill(g, shade(pal.accent, -0.3), x + 19, h * 0.25, 2, 36);
            }
          },
        },
        {
          factor: 0.5,
          draw: (g, w, h) => {
            const c = shade(pal.ground, -0.35);
            for (let x = 0; x < w; x += 128) {
              fill(g, c, x + 90, 0, 14, h);
              fill(g, shade(c, 0.2), x + 90, 0, 2, h);
            }
          },
        },
      ];
    case "void":
    default:
      return [
        {
          factor: 0.05,
          draw: (g, w, h, rnd) => {
            for (let i = 0; i < 60; i++) fill(g, rnd() < 0.3 ? pal.accent : "#ffffff", rnd() * w, rnd() * h * 0.9, 1, 1);
          },
        },
        {
          factor: 0.2,
          draw: (g, w, h, rnd) => {
            const c = mix(pal.accent, pal.sky, 0.5);
            for (let i = 0; i < 8; i++) {
              const s = 3 + Math.floor(rnd() * 6);
              fill(g, c, rnd() * (w - s), 20 + rnd() * h * 0.6, s, s);
            }
          },
        },
      ];
  }
}

export class BackdropView {
  private readonly sprites: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];

  /**
   * `view` is the rect, in scrollFactor-0 coordinates of the (zoomed) world camera,
   * that is visible on screen: x = W/2 - W/(2z), w = W/z (same for y).
   */
  constructor(scene: Phaser.Scene, type: Backdrop, pal: Palette, view: { x: number; y: number; w: number; h: number }) {
    const vw = Math.ceil(view.w) + 2;
    const vh = Math.ceil(view.h) + 2;
    const x0 = Math.floor(view.x) - 1;
    const y0 = Math.floor(view.y) - 1;
    const sky = scene.add.graphics().setScrollFactor(0).setDepth(-100);
    sky.fillGradientStyle(hex(pal.sky), hex(pal.sky), hex(pal.skyBottom), hex(pal.skyBottom), 1);
    sky.fillRect(x0, y0, vw, vh);

    layers(type, pal).forEach((layer, i) => {
      const key = `bd-${type}-${i}-${vh}-${pal.sky}${pal.skyBottom}${pal.ground}${pal.groundTop}${pal.platform}${pal.accent}`.replace(/#/g, "");
      if (!scene.textures.exists(key)) {
        const tex = scene.textures.createCanvas(key, LAYER_W, vh);
        if (!tex) return;
        tex.context.imageSmoothingEnabled = false;
        layer.draw(tex.context, LAYER_W, vh, rng(1234 + i * 77));
        tex.refresh();
      }
      const sprite = scene.add.tileSprite(x0, y0, vw, vh, key).setOrigin(0, 0).setScrollFactor(0).setDepth(-90 + i);
      this.sprites.push({ sprite, factor: layer.factor });
    });
  }

  update(scrollX: number): void {
    for (const { sprite, factor } of this.sprites) sprite.tilePositionX = Math.round(scrollX * factor);
  }
}
