/**
 * ENGINE LANE owns src/engine/.
 * Public API the UI calls. Keep this signature stable; everything else in
 * this folder is yours to change.
 */
import type { Cartridge } from "../shared/cartridge";

export type GameResult = { outcome: "won" | "died" | "quit"; collectibles: number };

export type GameHandle = { destroy(): void };

/**
 * Mount a playable game for `cart` inside `parent`. Call `onExit` when the
 * player wins, dies (and chooses to stop) or presses Esc.
 *
 * STUB: replace with the real Phaser game.
 */
export function startGame(parent: HTMLElement, cart: Cartridge, onExit: (r: GameResult) => void): GameHandle {
  const box = document.createElement("div");
  box.style.cssText = "padding:24px;font-family:monospace;color:#fff;background:#000;";
  box.innerHTML = `<p>ENGINE STUB: would play <b>${cart.title}</b> as ${cart.character.name} in ${cart.world.name}
    (${cart.world.levels.length} levels). Press Esc to exit.</p>`;
  parent.appendChild(box);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onExit({ outcome: "quit", collectibles: 0 });
  };
  window.addEventListener("keydown", onKey);
  return {
    destroy() {
      window.removeEventListener("keydown", onKey);
      box.remove();
    },
  };
}
