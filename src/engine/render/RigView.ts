/**
 * Phaser side of the rig renderer: one canvas texture + Image per entity,
 * redrawn only when the (quantised, ~12 fps) pose changes.
 */
import Phaser from "phaser";
import { RIG_SCALE } from "../../shared/schema";
import type { Rig } from "../../shared/schema";
import type { RuntimeEntity } from "../types";
import { rasterRig, rigMargin, rigSize, type RigPose } from "./rig";

let texCounter = 0;
const FRAME_MS = 1000 / 12;

export class RigView {
  readonly image: Phaser.GameObjects.Image;
  private readonly key: string;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private lastKey = "";
  private attackRef: RuntimeEntity["attackAnim"] = null;
  private attackStart = 0;
  private dying = false;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rig: Rig,
    depth: number,
  ) {
    const { w, h } = rigSize(rig);
    const m = rigMargin(rig);
    this.key = `rig-${++texCounter}`;
    const tex = scene.textures.createCanvas(this.key, w + m * 2, h + m * 2);
    if (!tex) throw new Error("could not create rig texture");
    this.tex = tex;
    this.image = scene.add
      .image(0, 0, this.key)
      .setOrigin((m + w / 2) / (w + m * 2), (m + h) / (h + m * 2))
      .setScale(RIG_SCALE)
      .setDepth(depth);
  }

  get isDying(): boolean {
    return this.dying;
  }

  /** Feet at (x, bottom); facing flips the image. */
  place(x: number, bottom: number, facing: number): void {
    if (this.destroyed) return;
    this.image.setPosition(x, bottom);
    if (!this.dying) this.image.setFlipX(facing < 0);
  }

  /** Redraw if the quantised pose changed. */
  setPose(pose: RigPose): void {
    if (this.destroyed || this.dying) return;
    const key = this.poseKey(pose);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(pose);
  }

  /** Position over the entity's body (feet on body bottom) and redraw if the pose changed. */
  sync(e: RuntimeEntity, now: number): void {
    if (this.destroyed) return;
    const b = e.body.body;
    if (b) this.place(b.center.x, b.bottom, e.facing);
    if (this.dying) return;

    const pose: RigPose = { anim: e.anim, t: now, facing: e.facing };
    const aa = e.attackAnim;
    if (aa && now < aa.until) {
      if (aa !== this.attackRef) {
        // A fresh object of the same kind right after the last one (AI refreshing it every
        // frame) continues the same swing instead of restarting it.
        const prev = this.attackRef;
        if (!prev || prev.kind !== aa.kind || now > prev.until + 50) this.attackStart = now;
        this.attackRef = aa;
      }
      const elapsed = now - this.attackStart;
      pose.anim = "attack";
      pose.attack = { kind: aa.kind, angle: aa.angle, progress: elapsed / 150, elapsed };
    } else {
      this.attackRef = null;
      if (pose.anim === "attack") pose.anim = "idle";
    }
    pose.white = now < e.hurtUntil;
    if (pose.anim === "death") pose.anim = "idle";
    this.setPose(pose);
  }

  private poseKey(p: RigPose): string {
    const w = p.white ? "w" : "";
    switch (p.anim) {
      case "idle":
      case "hurt":
        return `i${Math.floor(p.t / 500) % 2}${w}`;
      case "run":
        return `r${Math.floor((p.t % 400) / FRAME_MS)}${w}`;
      case "jump":
        return `j${w}`;
      case "attack": {
        const a = p.attack!;
        const f = Math.min(6, Math.floor(a.progress * 6));
        const fl = Math.floor(a.elapsed / 60) % 2 === 0 && a.elapsed < 360 ? "f" : "";
        return `a${a.kind}${f}${Math.round(a.angle * 10)}${p.facing}${fl}${w}`;
      }
      default:
        return `x${w}`;
    }
  }

  private draw(pose: RigPose): void {
    // Rasterize facing right; the Image's flipX mirrors it (attack angle is mirrored in rasterRig).
    const img = rasterRig(this.rig, pose);
    this.tex.context.putImageData(img, 0, 0);
    this.tex.refresh();
  }

  /** Falls over, blinks 3 times, fades. Calls onDone when finished (not called if destroyed first). */
  playDeath(facing: number, onDone?: () => void): void {
    if (this.dying || this.destroyed) return;
    this.dying = true;
    this.draw({ anim: "idle", t: 0 });
    const img = this.image;
    this.scene.tweens.add({
      targets: img,
      angle: facing < 0 ? 90 : -90,
      duration: 250,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (this.destroyed) return;
        this.scene.tweens.add({
          targets: img,
          alpha: 0,
          duration: 90,
          yoyo: true,
          repeat: 2,
          onComplete: () => {
            if (this.destroyed) return;
            this.scene.tweens.add({
              targets: img,
              alpha: 0,
              duration: 300,
              onComplete: () => {
                if (!this.destroyed) onDone?.();
              },
            });
          },
        });
      },
    });
  }

  /** Scene is shutting down (display list already destroyed): only free the texture. */
  releaseTexture(): void {
    this.destroyed = true;
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.tweens.killTweensOf(this.image);
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
