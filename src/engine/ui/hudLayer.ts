/**
 * Screen-space HUD: a second camera (zoom ×2, origin top-left, no scroll) so HUD
 * coordinates are a 400×224 logical space. Objects registered with add() are drawn
 * only by the HUD camera; everything else only by the world camera. The filter is
 * re-applied before every render, so objects created later are handled too.
 */
import Phaser from "phaser";

export const HUD_W = 400;
export const HUD_H = 224;

export class HudLayer {
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly members = new WeakSet<Phaser.GameObjects.GameObject>();

  constructor(
    readonly scene: Phaser.Scene,
    viewW: number,
    viewH: number,
  ) {
    this.cam = scene.cameras
      .add(0, 0, viewW, viewH, false, "hud")
      .setOrigin(0, 0)
      .setZoom(viewW / HUD_W)
      .setScroll(0, 0)
      .setRoundPixels(true);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.filter, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.detach, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.detach, this);
  }

  add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.members.add(obj);
    this.apply(obj);
    return obj;
  }

  /** HUD position (400×224 space) of a pointer. */
  pointer(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: p.x / this.cam.zoom, y: p.y / this.cam.zoom };
  }

  private apply(go: Phaser.GameObjects.GameObject): void {
    const hudId = this.cam.id;
    const mainId = this.scene.cameras.main.id;
    if (this.members.has(go)) {
      go.cameraFilter = (go.cameraFilter & ~hudId) | mainId;
      clearChildren(go, hudId);
    } else {
      go.cameraFilter |= hudId;
    }
  }

  private filter(): void {
    const list = this.scene.children?.list;
    if (!list) return;
    for (const go of list) this.apply(go);
  }

  private detach(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.filter, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.detach, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.detach, this);
  }
}

function clearChildren(go: Phaser.GameObjects.GameObject, hudId: number): void {
  if (go instanceof Phaser.GameObjects.Container) {
    for (const child of go.list) {
      child.cameraFilter &= ~hudId;
      clearChildren(child, hudId);
    }
  }
}
