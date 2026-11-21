/**
 * SERVER + UI LANE owns src/main.ts and src/ui/.
 * App shell: header nav, offline banner, hash-routed screens.
 */
import "./ui/style.css";
import { append, h } from "./ui/dom";
import { currentRoute, navigate, startRouter, type Route } from "./ui/router";
import { charactersScreen } from "./ui/screens/characters";
import { generateScreen } from "./ui/screens/generate";
import { playScreen } from "./ui/screens/play";
import { titleScreen } from "./ui/screens/title";
import { worldsScreen } from "./ui/screens/worlds";
import { ensureLibrary, onLibraryChange, state } from "./ui/state";

const app = document.getElementById("app")!;

const NAV: [Route, string][] = [
  ["title", "Library"],
  ["characters", "Characters"],
  ["worlds", "Worlds"],
  ["generate", "+ New"],
];

const navButtons = NAV.map(([route, label]) => {
  const b = h("button", { class: "nav-btn", "data-route": route, onclick: () => navigate(route) }, label);
  return b;
});

const banner = h("div", { class: "banner", role: "status", hidden: true });
const main = h("main", { id: "screen" });

app.replaceChildren(
  h(
    "header",
    { class: "top" },
    h("button", { class: "brand", onclick: () => navigate("title") }, "HAX"),
    h("nav", null, navButtons),
  ),
  banner,
  main,
);

function updateBanner() {
  const lib = state.library;
  if (lib?.offline) {
    banner.hidden = false;
    banner.replaceChildren();
    append(banner, [
      h("span", null, "Offline: showing stub data (server not reachable)"),
      lib.offlineReason ? h("span", { class: "tiny" }, ` (${lib.offlineReason})`) : null,
      h(
        "button",
        {
          class: "btn small-btn",
          onclick: () => {
            ensureLibrary(true)
              .catch(() => {})
              .then(() => navigate(currentRoute()));
          },
        },
        "Retry",
      ),
    ]);
  } else {
    banner.hidden = true;
    banner.replaceChildren();
  }
}

onLibraryChange(updateBanner);

startRouter(main, {
  title: titleScreen,
  characters: charactersScreen,
  worlds: worldsScreen,
  generate: generateScreen,
  play: playScreen,
}, (route) => {
  document.body.dataset.route = route;
  for (const b of navButtons) b.classList.toggle("active", b.dataset.route === route);
});
