/** Title / library screen (SPEC 10.1). */
import { backdropPreview } from "../backdrop";
import { h } from "../dom";
import { rigPreview } from "../rig";
import { navigate } from "../router";
import { cartridges, state } from "../state";
import { withLibrary } from "./common";

export function titleScreen(root: HTMLElement) {
  return withLibrary(root, (lib) => {
    const carts = cartridges(lib);

    const hero = h(
      "section",
      { class: "hero" },
      h("h1", { class: "logo" }, "HAX"),
      h("p", { class: "muted" }, "Any character. Any world. Canon strength, no rebalancing."),
      h(
        "div",
        { class: "row center" },
        h("button", { class: "btn primary", onclick: () => navigate("characters") }, "Character select"),
        h("button", { class: "btn", onclick: () => navigate("worlds") }, "World select"),
        h("button", { class: "btn accent", onclick: () => navigate("generate") }, "+ New cartridge"),
      ),
    );

    const grid = h("div", { class: "cart-grid" });
    for (const c of carts) {
      const ch = c.characters[0];
      const w = c.worlds[0];
      const label = h("div", { class: "cart-label" });
      if (w) label.appendChild(backdropPreview(w, 2));
      if (ch) label.appendChild(rigPreview(ch.rig, { width: 64, height: 96, className: "cart-rig", isActive: () => card.matches(":hover, :focus") }));
      const card = h(
        "button",
        {
          class: "cart",
          title: ch ? `Open ${ch.name} in Character select` : "Open World select",
          onclick: () => {
            if (ch) {
              state.selectedCharacterId = ch.id;
              navigate("characters");
            } else if (w) {
              state.selectedWorldId = w.id;
              navigate("worlds");
            }
          },
        },
        h("span", { class: "cart-notch" }),
        label,
        h("span", { class: "cart-title" }, c.title),
        h("span", { class: "cart-line small" }, ch ? `Hero: ${ch.name}` : "Hero: none"),
        h("span", { class: "cart-line small" }, w ? `World: ${w.name}` : "World: none"),
        h("span", { class: "cart-id tiny muted" }, c.id),
      );
      grid.appendChild(card);
    }
    grid.appendChild(
      h(
        "button",
        { class: "cart cart-new", onclick: () => navigate("generate") },
        h("span", { class: "cart-notch" }),
        h("span", { class: "cart-plus" }, "+"),
        h("span", { class: "cart-title" }, "New cartridge"),
        h("span", { class: "cart-line small muted" }, "Title + character"),
      ),
    );

    root.append(
      hero,
      h(
        "section",
        { class: "panel" },
        h(
          "div",
          { class: "library-head" },
          h("h2", null, "Shared library (stored in Snowflake)"),
          h("span", { class: "muted small" }, `${carts.length} cartridge${carts.length === 1 ? "" : "s"}`),
        ),
        lib.offline ? h("p", { class: "placeholder small" }, "Offline: these are local stub cartridges, not the Snowflake library.") : null,
        carts.length ? null : h("p", { class: "muted" }, "No cartridges yet. Make the first one!"),
        grid,
      ),
    );
  });
}
