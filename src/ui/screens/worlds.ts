/** World select (SPEC 10.3). Play -> #/play, which calls /api/session. */
import { backdropPreview, paletteSwatch } from "../backdrop";
import { h, isTyping } from "../dom";
import { rigPreview } from "../rig";
import { navigate } from "../router";
import { findCharacter, state } from "../state";
import { gridStep, onKey, screenHeader, withLibrary } from "./common";

export function worldsScreen(root: HTMLElement) {
  let removeKeys: (() => void) | null = null;
  const cleanup = withLibrary(root, (lib) => {
    const worlds = lib.worlds;
    const hero = findCharacter(state.selectedCharacterId) ?? lib.characters[0];
    if (hero) state.selectedCharacterId = hero.id;
    root.append(screenHeader("World select", "Arrows: move · Enter: play · Esc: back to characters"));

    const heroBar = h(
      "div",
      { class: "panel hero-bar" },
      hero
        ? [
            rigPreview(hero.rig, { width: 40, height: 56, isActive: () => true }),
            h("div", null, h("span", { class: "tiny muted" }, "Playing as"), h("div", null, hero.name)),
          ]
        : h("span", null, "No character chosen yet."),
      h("button", { class: "btn", onclick: () => navigate("characters") }, hero ? "Change" : "Choose character"),
    );
    root.append(heroBar);

    if (!worlds.length) {
      root.append(h("div", { class: "panel" }, h("p", null, "No worlds in the library yet."), h("button", { class: "btn accent", onclick: () => navigate("generate") }, "+ New cartridge")));
      return;
    }

    let index = Math.max(0, worlds.findIndex((w) => w.id === state.selectedWorldId));
    const cards: HTMLElement[] = [];
    const playBtn = h("button", { class: "btn primary big" }, "▶ Play");
    const playNote = h("p", { class: "tiny muted" });

    const play = () => {
      if (!hero) {
        navigate("characters");
        return;
      }
      state.selectedWorldId = worlds[index].id;
      state.pendingPlay = { characterId: hero.id, worldId: worlds[index].id };
      navigate("play");
    };
    playBtn.addEventListener("click", play);

    const select = (i: number, focus = false) => {
      index = i;
      state.selectedWorldId = worlds[i].id;
      cards.forEach((c, j) => {
        c.classList.toggle("selected", j === i);
        c.setAttribute("aria-pressed", String(j === i));
      });
      playBtn.textContent = hero ? `▶ Play ${hero.name} in ${worlds[i].name}` : "Choose a character first";
      playNote.textContent = "Same rooms, enemies and stats for every character. Only the flavour dialogue may be remixed.";
      if (focus) cards[i].focus();
    };

    const grid = h("div", { class: "world-grid" });
    worlds.forEach((w, i) => {
      const rooms = Array.isArray(w.roomNames) ? w.roomNames : [];
      const card = h(
        "button",
        { class: "card world-card", onclick: () => select(i), ondblclick: play },
        backdropPreview(w, 2),
        h("span", { class: "card-name" }, w.name),
        h("span", { class: "tiny muted" }, w.source),
        paletteSwatch(w),
        h("span", { class: "small" }, h("span", { class: "muted" }, "Boss: "), w.bossName ?? "?"),
        h("ol", { class: "rooms tiny" }, rooms.map((r) => h("li", null, r))),
        h("span", { class: "tiny muted" }, `Backdrop: ${w.visualStyle?.backdrop ?? "?"}`),
      );
      cards.push(card);
      grid.appendChild(card);
    });

    root.append(h("div", { class: "panel" }, grid), h("div", { class: "play-bar panel" }, playBtn, playNote));
    select(index);

    removeKeys = onKey((e) => {
      if (isTyping(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        select(gridStep(cards, index, e.key), true);
      } else if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement && !cards.includes(document.activeElement))) {
        e.preventDefault();
        play();
      } else if (e.key === "Escape") {
        navigate("characters");
      }
    });
  });
  return () => {
    removeKeys?.();
    cleanup();
  };
}
