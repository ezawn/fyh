/** Retro dialogue box at the bottom of the HUD: one line at a time, Space/click advances. */
import Phaser from "phaser";
import type { DialogueLine } from "../../shared/schema";
import type { HudLayer } from "./hudLayer";
import { HUD_H, HUD_W } from "./hudLayer";
import { uiText, UI_DEPTH } from "./text";

const BOX = { x: 4, y: HUD_H - 54, w: HUD_W - 8, h: 50 };
const CHARS_PER_MS = 0.05;

export class DialogueBox {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly speaker: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private queue: { lines: DialogueLine[]; resolve: () => void }[] = [];
  private lineIndex = 0;
  private lineStart = 0;
  private shown = 0;

  constructor(
    private readonly hud: HudLayer,
    private readonly now: () => number,
  ) {
    const scene = hud.scene;
    this.g = hud.add(scene.add.graphics().setDepth(UI_DEPTH + 10));
    this.speaker = uiText(hud, BOX.x + 8, BOX.y + 5, "", "#ffe04a").setDepth(UI_DEPTH + 11);
    this.body = uiText(hud, BOX.x + 8, BOX.y + 16, "", "#ffffff")
      .setDepth(UI_DEPTH + 11)
      .setWordWrapWidth(BOX.w - 18, true)
      .setLineSpacing(1);
    this.setVisible(false);
  }

  get active(): boolean {
    return this.queue.length > 0;
  }

  show(lines: DialogueLine[]): Promise<void> {
    const valid = (lines ?? []).filter((l) => l && l.text);
    if (!valid.length) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.queue.push({ lines: valid, resolve });
      if (this.queue.length === 1) this.startLine(0);
    });
  }

  /** Space / click: finish the typewriter, or go to the next line. */
  advance(): void {
    const cur = this.queue[0];
    if (!cur) return;
    const text = cur.lines[this.lineIndex].text;
    if (this.shown < text.length) {
      this.shown = text.length;
      this.body.setText(text);
      return;
    }
    if (this.lineIndex + 1 < cur.lines.length) {
      this.startLine(this.lineIndex + 1);
      return;
    }
    this.queue.shift();
    cur.resolve();
    if (this.queue.length) this.startLine(0);
    else this.setVisible(false);
  }

  update(now: number): void {
    const cur = this.queue[0];
    if (!cur) return;
    const text = cur.lines[this.lineIndex].text;
    if (this.shown < text.length) {
      this.shown = Math.min(text.length, Math.floor((now - this.lineStart) * CHARS_PER_MS));
      this.body.setText(text.slice(0, this.shown));
    }
    this.draw(this.shown >= text.length && Math.floor(now / 300) % 2 === 0);
  }

  private startLine(i: number): void {
    const cur = this.queue[0];
    this.lineIndex = i;
    this.lineStart = this.now();
    this.shown = 0;
    this.speaker.setText(cur.lines[i].speaker);
    this.body.setText("");
    this.setVisible(true);
    this.draw(false);
  }

  private draw(prompt: boolean): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.85).fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
    g.lineStyle(2, 0xffffff, 1).strokeRect(BOX.x + 1, BOX.y + 1, BOX.w - 2, BOX.h - 2);
    g.lineStyle(1, 0x6060a0, 1).strokeRect(BOX.x + 3.5, BOX.y + 3.5, BOX.w - 7, BOX.h - 7);
    if (prompt) {
      const x = BOX.x + BOX.w - 12;
      const y = BOX.y + BOX.h - 10;
      g.fillStyle(0xffe04a, 1).fillTriangle(x, y, x + 6, y, x + 3, y + 4);
    }
  }

  private setVisible(v: boolean): void {
    this.g.setVisible(v);
    this.speaker.setVisible(v);
    this.body.setVisible(v);
  }
}
