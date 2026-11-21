/** Full-screen overlay (DEFEATED / CARTRIDGE COMPLETE) with clickable options, on the HUD. */
import Phaser from "phaser";
import type { HudLayer } from "./hudLayer";
import { HUD_H, HUD_W } from "./hudLayer";
import { PIXEL_FONT, uiText, UI_DEPTH } from "./text";

export type MenuOption = { id: string; label: string };

export class Menu {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly boxes: { id: string; x: number; y: number; w: number; h: number }[] = [];

  constructor(hud: HudLayer, title: string, titleColor: string, subtitle: string, options: MenuOption[]) {
    const scene = hud.scene;
    const d = UI_DEPTH + 50;
    const g = hud.add(scene.add.graphics().setDepth(d));
    g.fillStyle(0x000000, 0.75).fillRect(0, 0, HUD_W, HUD_H);
    this.objects.push(g);
    this.objects.push(uiText(hud, HUD_W / 2, 60, title, titleColor, 16, PIXEL_FONT).setOrigin(0.5).setDepth(d + 1));
    if (subtitle) this.objects.push(uiText(hud, HUD_W / 2, 86, subtitle, "#c0c0d0").setOrigin(0.5).setDepth(d + 1));
    options.forEach((o, i) => {
      const w = 180;
      const h = 18;
      const x = HUD_W / 2 - w / 2;
      const y = 110 + i * 24;
      g.fillStyle(0x1a1a2e, 1).fillRect(x, y, w, h);
      g.lineStyle(1, 0xffe04a, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      this.objects.push(uiText(hud, HUD_W / 2, y + h / 2, o.label, "#ffffff").setOrigin(0.5).setDepth(d + 1));
      this.boxes.push({ id: o.id, x, y, w, h });
    });
  }

  /** Option id under a HUD point, or null. */
  hit(x: number, y: number): string | null {
    for (const b of this.boxes) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}

/** Room name banner: slides in at the top centre, stays ~2.5 s, slides out. */
export function roomBanner(hud: HudLayer, name: string): void {
  const scene = hud.scene;
  const t = uiText(hud, HUD_W / 2, 0, name, "#ffffff", 8, PIXEL_FONT).setOrigin(0.5, 0.5).setDepth(UI_DEPTH + 20);
  const pad = 6;
  const g = hud.add(scene.add.graphics().setDepth(UI_DEPTH + 19));
  const w = Math.min(HUD_W - 20, t.width + pad * 2);
  const h = 16;
  g.fillStyle(0x000000, 0.8).fillRect(-w / 2, -h / 2, w, h);
  g.lineStyle(1, 0xffe04a, 1).strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
  g.setPosition(HUD_W / 2, -20);
  t.setY(-20);
  const shownY = 38;
  scene.tweens.add({
    targets: [t, g],
    y: shownY,
    duration: 350,
    ease: "Back.easeOut",
    onComplete: () =>
      scene.tweens.add({
        targets: [t, g],
        y: -20,
        delay: 2500,
        duration: 300,
        ease: "Quad.easeIn",
        onComplete: () => {
          t.destroy();
          g.destroy();
        },
      }),
  });
}
