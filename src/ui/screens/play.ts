/** Play screen: POST /api/session, then mount the engine. Exit -> Character select. */
import type { SessionResponse } from "../../shared/api";
import { startGame, type GameHandle } from "../../engine";
import { createSession } from "../api";
import { h } from "../dom";
import { navigate } from "../router";
import { findCharacter, findWorld, state } from "../state";
import { errorBox } from "./common";

export function playScreen(root: HTMLElement) {
  const req = state.pendingPlay;
  if (!req) {
    queueMicrotask(() => navigate("worlds"));
    return;
  }
  let disposed = false;
  let handle: GameHandle | null = null;

  const destroyGame = () => {
    const g = handle;
    handle = null;
    if (g) {
      try {
        g.destroy();
      } catch (e) {
        console.error("engine destroy failed", e);
      }
    }
  };

  const exit = () => {
    if (disposed) return;
    destroyGame();
    state.pendingPlay = null;
    navigate("characters");
  };

  const mount = (session: SessionResponse) => {
    root.replaceChildren();
    const remix = session.dialogueSource === "remix";
    const bar = h(
      "div",
      { class: "panel play-info" },
      h("span", null, `${session.character.name} in ${session.world.name}`),
      h("span", { class: `badge ${remix ? "ok" : ""}` }, `Flavour dialogue: ${remix ? "remix" : "original"}`),
      state.library?.offline ? h("span", { class: "badge warn" }, "Offline stub session") : null,
      h("span", { class: "tiny muted grow" }, "Esc quits"),
      h("button", { class: "btn small-btn", onclick: exit }, "Quit"),
    );
    const host = h("div", { class: "game-host" });
    root.append(bar, host);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      handle = startGame(host, session, () => exit());
    } catch (e) {
      handle = null;
      root.replaceChildren(errorBox("The engine failed to start", (e as Error)?.message ?? String(e), backButtons()));
      return;
    }
    if (disposed) destroyGame();
  };

  const backButtons = () => [
    h("button", { class: "btn", onclick: () => navigate("worlds") }, "Back to World select"),
    h("button", { class: "btn", onclick: () => load() }, "Retry"),
  ];

  const load = () => {
    const ch = findCharacter(req.characterId);
    const w = findWorld(req.worldId);
    root.replaceChildren(
      h(
        "div",
        { class: "panel center-panel" },
        h("p", { class: "loading blink" }, "Loading session…"),
        h("p", { class: "small muted" }, `${ch?.name ?? req.characterId} × ${w?.name ?? req.worldId}`),
      ),
    );
    createSession(req, !!state.library?.offline).then(
      (session) => {
        if (!disposed) mount(session);
      },
      (err: unknown) => {
        if (!disposed) root.replaceChildren(errorBox("Couldn't start the session", (err as Error)?.message ?? String(err), backButtons()));
      },
    );
  };

  load();
  return () => {
    disposed = true;
    destroyGame();
  };
}
