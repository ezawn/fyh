/**
 * SERVER + UI LANE owns src/main.ts and src/ui/.
 * STUB: pick the first character and world from the API and start the engine.
 */
import { startGame, type GameHandle } from "./engine";
import type { CharacterSummary, SessionResponse, WorldSummary } from "./shared/api";

const app = document.getElementById("app")!;
let game: GameHandle | null = null;

async function showSelect() {
  game?.destroy();
  game = null;
  app.innerHTML = "<h1>AI Retro Remix</h1><p>Loading…</p>";
  const [characters, worlds]: [CharacterSummary[], WorldSummary[]] = await Promise.all([
    fetch("/api/characters").then((r) => r.json()),
    fetch("/api/worlds").then((r) => r.json()),
  ]);
  app.innerHTML = "<h1>AI Retro Remix</h1><p>UI STUB: choose a character, then a world.</p>";
  for (const c of characters) {
    for (const w of worlds) {
      const btn = document.createElement("button");
      btn.textContent = `${c.name} in ${w.name}`;
      btn.style.cssText = "display:block;margin:6px 0;padding:6px;";
      btn.onclick = () => play(c.id, w.id);
      app.appendChild(btn);
    }
  }
}

async function play(characterId: string, worldId: string) {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, worldId }),
  });
  const session: SessionResponse = await res.json();
  app.innerHTML = "";
  game = startGame(app, session, () => showSelect());
}

showSelect();
