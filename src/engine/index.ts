/**
 * ENGINE LANE owns src/engine/.
 * Public API the UI calls. Keep this signature stable (docs/LANES.md).
 *
 * STUB: replace with the real Phaser game.
 */
import type { SessionResponse } from "../shared/api";

export type GameResult = { outcome: "won" | "died" | "quit" };
export type GameHandle = { destroy(): void };

export function startGame(parent: HTMLElement, session: SessionResponse, onExit: (r: GameResult) => void): GameHandle {
  const box = document.createElement("div");
  box.style.cssText = "padding:24px;font-family:monospace;color:#fff;background:#000;";
  box.textContent = `ENGINE STUB: ${session.character.name} in ${session.world.name}. Press Esc to exit.`;
  parent.appendChild(box);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onExit({ outcome: "quit" });
  };
  window.addEventListener("keydown", onKey);
  return {
    destroy() {
      window.removeEventListener("keydown", onKey);
      box.remove();
    },
  };
}
