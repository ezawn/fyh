/**
 * UI LANE owns src/main.ts and src/ui/.
 * STUB: lists the library and plays a cartridge with the engine. Replace with
 * the real library / generate / remix screens.
 */
import { startGame, type GameHandle } from "./engine";
import type { Cartridge } from "./shared/cartridge";
import type { CartridgeSummary } from "./shared/api";

const app = document.getElementById("app")!;
let game: GameHandle | null = null;

async function showLibrary() {
  game?.destroy();
  game = null;
  app.innerHTML = "<h1>Retro Cartridges</h1><p>Loading…</p>";
  const res = await fetch("/api/cartridges");
  const list: CartridgeSummary[] = await res.json();
  app.innerHTML = "<h1>Retro Cartridges</h1>";
  for (const c of list) {
    const btn = document.createElement("button");
    btn.textContent = `${c.title} (${c.characterName} in ${c.worldName})`;
    btn.style.cssText = `display:block;margin:8px 0;background:${c.coverColor};color:#fff;padding:8px;`;
    btn.onclick = () => play(c.id);
    app.appendChild(btn);
  }
}

async function play(id: string) {
  const cart: Cartridge = await (await fetch(`/api/cartridges/${id}`)).json();
  app.innerHTML = "";
  game = startGame(app, cart, () => showLibrary());
}

showLibrary();
