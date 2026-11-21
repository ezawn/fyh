/**
 * Combat visuals owned by COMBAT: floating damage numbers, one shared world-space
 * Graphics for projectiles/beams/swipes/rings, and the boss health bar.
 * Everything is advanced manually from update() (so it freezes while paused) and
 * destroyed in destroy() (rooms restart often).
 */
import type Phaser from "phaser";
import type { RuntimeEntity } from "../types";
import { fmt } from "./geom";

type Floater = { text: Phaser.GameObjects.Text; x: number; y: number; born: number; life: number };

/** Short-lived shapes drawn on the shared Graphics. */
export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: number; until: number; born: number }
  | { kind: "ring"; x: number; y: number; r: number; color: number; until: number; born: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number; color: number; until: number; born: number };

/** HUD logical space (types.ts addToHud). */
const HUD_W = 400;

export const COLORS = {
  dmgEnemy: "#ffffff",
  dmgBig: "#ffd23f",
  dmgPlayer: "#ff5a5a",
  immune: "#7fe3ff",
};

export class Fx {
  readonly g: Phaser.GameObjects.Graphics;
  private floaters: Floater[] = [];
  private shapes: Shape[] = [];
  private stagger = 0;
  private bossG: Phaser.GameObjects.Graphics | null = null;
  private bossText: Phaser.GameObjects.Text | null = null;
  private lastBossKey = "";

  /** `addToHud` puts screen-fixed objects on CORE's HUD camera (400×224 logical space). */
  constructor(
    private scene: Phaser.Scene,
    private addToHud: (obj: Phaser.GameObjects.GameObject) => void,
  ) {
    this.g = scene.add.graphics().setDepth(45);
  }

  /** Floating number / word rising from the top of an entity. */
  float(e: RuntimeEntity, label: string, color: string, now: number, big = false) {
    const b = e.body.body;
    const off = ((this.stagger++ % 3) - 1) * 6;
    const x = b.x + b.width / 2 + off;
    const y = b.y - 2;
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: "monospace",
        fontSize: big ? "8px" : "6px",
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 4, // world camera is zoomed ×3: render text crisp
      })
      .setOrigin(0.5, 1)
      .setDepth(60);
    this.floaters.push({ text, x, y, born: now, life: big ? 1000 : 750 });
  }

  damage(e: RuntimeEntity, amount: number, now: number) {
    const color = e.team === "player" ? COLORS.dmgPlayer : amount >= 1000 ? COLORS.dmgBig : COLORS.dmgEnemy;
    this.float(e, fmt(amount), color, now, amount >= 1000);
  }

  immune(e: RuntimeEntity, now: number) {
    this.float(e, "IMMUNE", COLORS.immune, now, false);
  }

  add(shape: Shape) {
    this.shapes.push(shape);
  }

  /** Advance floaters, expire shapes. Call once per frame, then draw. */
  update(now: number) {
    this.floaters = this.floaters.filter((f) => {
      const t = (now - f.born) / f.life;
      if (t >= 1) {
        f.text.destroy();
        return false;
      }
      f.text.setPosition(f.x, f.y - 14 * t);
      f.text.setAlpha(1 - t * t);
      return true;
    });
    this.shapes = this.shapes.filter((s) => now < s.until);
  }

  /** Clear the shared graphics and draw this frame's transient shapes. */
  beginDraw(now: number) {
    const g = this.g;
    g.clear();
    for (const s of this.shapes) {
      const life = Math.max(1, s.until - s.born);
      const a = Math.max(0, Math.min(1, (s.until - now) / life));
      switch (s.kind) {
        case "rect":
          g.fillStyle(s.color, 0.55 * a).fillRect(s.x, s.y, s.w, s.h);
          break;
        case "ring": {
          const grow = 0.6 + 0.4 * (1 - a);
          g.lineStyle(2, s.color, a).strokeCircle(s.x, s.y, s.r * grow);
          g.fillStyle(s.color, 0.15 * a).fillCircle(s.x, s.y, s.r * grow);
          break;
        }
        case "line":
          g.lineStyle(s.width, s.color, 0.7 * a).lineBetween(s.x1, s.y1, s.x2, s.y2);
          break;
      }
    }
  }

  /** Beam: glow + bright core. */
  drawBeam(x1: number, y1: number, x2: number, y2: number, width: number, color: number, flicker: number) {
    const w = width * (0.85 + 0.15 * flicker);
    this.g.lineStyle(w + 4, color, 0.35).lineBetween(x1, y1, x2, y2);
    this.g.lineStyle(w, color, 0.9).lineBetween(x1, y1, x2, y2);
    this.g.lineStyle(Math.max(1, w * 0.4), 0xffffff, 1).lineBetween(x1, y1, x2, y2);
    this.g.fillStyle(0xffffff, 0.9).fillCircle(x1, y1, w * 0.7);
  }

  drawProjectile(x: number, y: number, r: number, color: number, alpha: number) {
    this.g.fillStyle(color, 0.35 * alpha).fillCircle(x, y, r + 2);
    this.g.fillStyle(color, alpha).fillCircle(x, y, r);
    this.g.fillStyle(0xffffff, alpha).fillCircle(x, y, Math.max(1, r * 0.4));
  }

  /** Boss bar fixed to the camera at the top centre. */
  drawBossBar(boss: RuntimeEntity | null) {
    if (!boss) {
      this.bossG?.setVisible(false);
      this.bossText?.setVisible(false);
      return;
    }
    const W = 180;
    const x = Math.round((HUD_W - W) / 2);
    const y = 16;
    if (!this.bossG) {
      this.bossG = this.scene.add.graphics().setDepth(95);
      this.bossText = this.scene.add
        .text(HUD_W / 2, y - 1, "", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(96);
      this.addToHud(this.bossG);
      this.addToHud(this.bossText);
    }
    const hp = Math.max(0, boss.hp);
    const key = `${boss.name}|${Math.ceil(hp)}|${boss.maxHP}`;
    if (key === this.lastBossKey) return;
    this.lastBossKey = key;
    const frac = boss.maxHP > 0 ? Math.max(0, Math.min(1, hp / boss.maxHP)) : 0;
    const g = this.bossG.setVisible(true);
    g.clear();
    g.fillStyle(0x000000, 0.8).fillRect(x - 1, y - 1, W + 2, 7);
    g.fillStyle(0x4a0d0d, 1).fillRect(x, y, W, 5);
    g.fillStyle(frac > 0.4 ? 0xe0302a : 0xff8a1a, 1).fillRect(x, y, Math.round(W * frac), 5);
    g.fillStyle(0xffffff, 0.35).fillRect(x, y, Math.round(W * frac), 1);
    this.bossText!.setVisible(true).setText(`${boss.name}  ${fmt(Math.ceil(hp))} / ${fmt(boss.maxHP)}`);
  }

  destroy() {
    for (const f of this.floaters) f.text.destroy();
    this.floaters = [];
    this.shapes = [];
    this.g.destroy();
    this.bossG?.destroy();
    this.bossText?.destroy();
    this.bossG = null;
    this.bossText = null;
  }
}
