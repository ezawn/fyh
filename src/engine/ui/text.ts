import Phaser from "phaser";
import type { HudLayer } from "./hudLayer";

export const FONT = "monospace";
export const PIXEL_FONT = '"Press Start 2P", monospace';
export const UI_DEPTH = 1000;

/** 8px text on the HUD layer (400×224 logical space). */
export function uiText(hud: HudLayer, x: number, y: number, s: string, color = "#ffffff", size = 8, font = FONT): Phaser.GameObjects.Text {
  // resolution 2: the HUD camera is zoomed ×2, so this keeps glyphs at screen-pixel sharpness.
  return hud.add(hud.scene.add.text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color, resolution: 2 }).setDepth(UI_DEPTH + 2));
}

/** Compact number: 1234, 98.7k, 1.00M. */
export function fmt(n: number): string {
  const v = Math.max(0, Math.ceil(n));
  if (v < 100_000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}
