/**
 * HUD (SPEC §9), 400×224 logical space on the HUD camera:
 * portrait + name + HP bar (top-left), world/room + objective (top-right),
 * 4 ability slots + mute button (bottom), controls line (very bottom).
 * COMBAT's boss bar goes top-centre (between y 2 and ~20, x ~150-250).
 */
import Phaser from "phaser";
import { RIG_SCALE } from "../../shared/schema";
import type { CharacterDef, Room, WorldDef } from "../../shared/schema";
import { rigPreviewCanvas, rigSize } from "../render/rig";
import type { CombatSystem, RuntimeEntity } from "../types";
import type { HudLayer } from "./hudLayer";
import { HUD_H, HUD_W } from "./hudLayer";
import { fmt, uiText, UI_DEPTH } from "./text";

const SLOT_W = 60;
const SLOT_H = 16;
const SLOT_Y = HUD_H - 30;
const MUTE = { x: HUD_W - 34, y: SLOT_Y, w: 32, h: SLOT_H };
const CONTROLS = "WASD move · Space jump · Mouse aim · Click attack · 1–4 abilities · Esc quit";

export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly slotTexts: Phaser.GameObjects.Text[] = [];
  private readonly slotRight: Phaser.GameObjects.Text[] = [];
  private readonly muteText: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Text | null = null;
  private readonly rightPanelW: number;
  private toastUntil = 0;

  constructor(
    private readonly hud: HudLayer,
    private readonly character: CharacterDef,
    world: WorldDef,
    room: Room,
    private readonly combat: CombatSystem,
    private readonly player: RuntimeEntity,
    private readonly selectedSlot: () => number,
  ) {
    const scene = hud.scene;
    this.g = hud.add(scene.add.graphics().setDepth(UI_DEPTH));

    // Portrait (rig pixels shown at RIG_SCALE; cropped to the head for tall rigs).
    const key = `portrait-${character.id}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, rigPreviewCanvas(character.rig, 1));
    const { w, h } = rigSize(character.rig);
    const img = hud.add(scene.add.image(3, 3, key).setOrigin(0, 0).setDepth(UI_DEPTH + 1));
    const box = 20;
    if (w * RIG_SCALE <= box) {
      img.setScale(RIG_SCALE);
      if (h * RIG_SCALE > box) img.setCrop(0, 0, w, box / RIG_SCALE);
      img.x = 3 + Math.floor((box - w * RIG_SCALE) / 2);
    } else {
      const s = box / Math.max(w, h);
      img.setScale(s);
      img.x = 3 + Math.floor((box - w * s) / 2);
    }

    uiText(hud, 27, 2, character.name.slice(0, 22), "#ffffff");
    this.hpText = uiText(hud, 27 + 82, 11, "", "#ffffff");

    const t1 = uiText(hud, HUD_W - 3, 2, fit(`${world.name} · ${room.name}`, 230), "#c8d8ff").setOrigin(1, 0);
    const t2 = uiText(hud, HUD_W - 3, 12, fit(room.objective, 230), "#ffe04a").setOrigin(1, 0);
    fitText(t1, 230);
    fitText(t2, 230);
    this.rightPanelW = Math.ceil(Math.max(t1.width, t2.width)) + 6;

    for (let i = 0; i < 4; i++) {
      const x = 3 + i * (SLOT_W + 2);
      this.slotTexts.push(uiText(hud, x + 3, SLOT_Y + 3, ""));
      this.slotRight.push(uiText(hud, x + SLOT_W - 2, SLOT_Y + 3, "", "#ffb0b0").setOrigin(1, 0));
    }
    this.muteText = uiText(hud, MUTE.x + MUTE.w / 2, MUTE.y + 3, "", "#ffffff").setOrigin(0.5, 0);
    uiText(hud, HUD_W / 2, HUD_H - 11, CONTROLS, "#a0a0b0").setOrigin(0.5, 0);
  }

  /** True if the HUD point is on the mute button. */
  hitMute(x: number, y: number): boolean {
    return x >= MUTE.x && x <= MUTE.x + MUTE.w && y >= MUTE.y && y <= MUTE.y + MUTE.h;
  }

  /** Short message above the ability bar (e.g. "Not supported"). */
  flash(msg: string, now: number): void {
    if (!this.toast) this.toast = uiText(this.hud, 3, SLOT_Y - 11, "", "#ff8080");
    this.toast.setText(msg).setVisible(true);
    this.toastUntil = now + 1200;
  }

  update(now: number): void {
    const g = this.g;
    const p = this.player;
    g.clear();

    // Top-left panel
    g.fillStyle(0x000000, 0.55).fillRect(1, 1, Math.max(150, 27 + 82 + Math.ceil(this.hpText.width) + 3), 24);
    g.fillStyle(0x202030, 1).fillRect(2, 2, 22, 22);
    g.lineStyle(1, 0x8080a0, 1).strokeRect(2.5, 2.5, 21, 21);
    const frac = p.maxHP > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHP)) : 0;
    const col = frac > 0.5 ? 0x40d060 : frac > 0.25 ? 0xe0c030 : 0xe04040;
    g.fillStyle(0x401010, 1).fillRect(27, 13, 80, 6);
    g.fillStyle(col, 1).fillRect(27, 13, Math.ceil(80 * frac), 6);
    g.lineStyle(1, 0xffffff, 0.8).strokeRect(26.5, 12.5, 81, 7);
    this.hpText.setText(`${fmt(p.hp)}/${fmt(p.maxHP)}`);

    // Top-right panel background
    g.fillStyle(0x000000, 0.45).fillRect(HUD_W - 1 - this.rightPanelW, 1, this.rightPanelW, 21);

    // Ability slots
    const supported = this.combat.supportedMechanics;
    const sel = this.selectedSlot();
    for (let i = 0; i < 4; i++) {
      const ab = this.character.abilities.find((a) => a.slot === i + 1) ?? this.character.abilities[i];
      const x = 3 + i * (SLOT_W + 2);
      const ok = !!ab && supported.includes(ab.mechanic);
      g.fillStyle(ok ? 0x1a1a2e : 0x2a2a2a, 0.9).fillRect(x, SLOT_Y, SLOT_W, SLOT_H);
      let right = "";
      if (ok && ab) {
        const remain = p.cooldownReadyAt[i] - now;
        if (remain > 0) {
          const f = Math.min(1, remain / Math.max(1, ab.cooldown * 1000));
          g.fillStyle(0x000000, 0.6).fillRect(x, SLOT_Y, Math.ceil(SLOT_W * f), SLOT_H);
          right = (remain / 1000).toFixed(remain < 10_000 ? 1 : 0);
        }
      } else right = "N/A";
      const selected = sel === i + 1;
      g.lineStyle(1, selected ? 0xffe04a : 0x606080, 1).strokeRect(x + 0.5, SLOT_Y + 0.5, SLOT_W - 1, SLOT_H - 1);
      if (selected) g.lineStyle(1, 0xffe04a, 0.5).strokeRect(x - 0.5, SLOT_Y - 0.5, SLOT_W + 1, SLOT_H + 1);
      const maxName = right ? 7 : 10;
      const name = ab ? abbreviate(ab.name, maxName) : "-";
      this.slotTexts[i].setText(`${i + 1} ${name}`).setColor(ok ? (selected ? "#ffe04a" : "#ffffff") : "#808080");
      this.slotRight[i].setText(right).setColor(ok ? "#ffb0b0" : "#ff6060");
    }

    // Mute button
    const muted = this.combat.music.muted;
    g.fillStyle(0x1a1a2e, 0.9).fillRect(MUTE.x, MUTE.y, MUTE.w, MUTE.h);
    g.lineStyle(1, 0x606080, 1).strokeRect(MUTE.x + 0.5, MUTE.y + 0.5, MUTE.w - 1, MUTE.h - 1);
    this.muteText.setText(muted ? "M:off" : "M:on").setColor(muted ? "#ff8080" : "#80ff80");

    // Controls line background
    g.fillStyle(0x000000, 0.45).fillRect(0, HUD_H - 12, HUD_W, 12);

    if (this.toast && now > this.toastUntil) this.toast.setVisible(false);
  }
}

function abbreviate(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}.`;
}

function fit(s: string, _maxW: number): string {
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

/** Trim a text object until it is at most maxW wide. */
function fitText(t: Phaser.GameObjects.Text, maxW: number): void {
  let s = t.text;
  while (t.width > maxW && s.length > 4) {
    s = s.slice(0, -2);
    t.setText(`${s}…`);
  }
}
