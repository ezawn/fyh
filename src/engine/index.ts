/**
 * ENGINE LANE owns src/engine/.
 * Public API the UI calls. Keep this signature stable (docs/LANES.md).
 */
import Phaser from "phaser";
import { GameScene, VIEW_H, VIEW_W } from "./core/GameScene";
import type { Session } from "./session";

export type { Session } from "./session";

export type GameResult = { outcome: "won" | "died" | "quit" };

export type GameHandle = { destroy(): void };

/**
 * Mechanics the engine actually implements right now (SPEC §9). The UI must
 * show any ability whose mechanic is not in this list as "not supported".
 */
export { SUPPORTED_MECHANICS } from "./combat";

/**
 * Mount the game for a session (POST /api/session response) inside `parent`.
 * `onExit` fires once: boss defeated ("won"), player gave up after dying
 * ("died") or Esc ("quit").
 */
export function startGame(parent: HTMLElement, session: Session, onExit: (result: GameResult) => void): GameHandle {
  let exited = false;
  const exit = (r: GameResult) => {
    if (exited) return;
    exited = true;
    onExit(r);
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    backgroundColor: "#000000",
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    // fullscreenTarget = parent: F / the HUD button fullscreens the game's own box, and fit() rescales it.
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: parent },
  });

  // Integer scaling: largest whole-number zoom that fits the parent.
  const fit = () => {
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    game.scale.setZoom(Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H))));
  };
  window.addEventListener("resize", fit);
  // Entering/leaving fullscreen resizes the parent; refit once the browser has laid it out.
  const refitSoon = () => requestAnimationFrame(() => requestAnimationFrame(fit));
  document.addEventListener("fullscreenchange", refitSoon);
  game.events.once(Phaser.Core.Events.READY, () => {
    fit();
    game.scene.add("game", GameScene, true, { session, roomIndex: 0, onExit: exit });
  });

  return {
    destroy() {
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", refitSoon);
      if (document.fullscreenElement === parent) void document.exitFullscreen().catch(() => {});
      game.destroy(true);
    },
  };
}
