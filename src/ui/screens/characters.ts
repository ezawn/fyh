/** Character select, Terraria-style (SPEC 10.2). */
import type { CharacterSummary } from "../../shared/api";
import type { Ability } from "../../shared/schema";
import { h, isTyping } from "../dom";
import { ATTACK_TAG_INFO, STAT_KEYS, SLOT_ROLE, formatNumber, haxInfo } from "../info";
import { isMechanicSupported } from "../mechanics";
import { rigPreview } from "../rig";
import { navigate } from "../router";
import { state } from "../state";
import { gridStep, onKey, screenHeader, withLibrary } from "./common";

function abilityRow(a: Ability): HTMLElement {
  const supported = isMechanicSupported(a.mechanic);
  const tags = Array.isArray(a.attackTags) ? a.attackTags : [];
  return h(
    "li",
    { class: `ability${supported ? "" : " unsupported"}` },
    h("span", { class: "slot-key" }, String(a.slot)),
    h(
      "div",
      { class: "ability-body" },
      h(
        "div",
        { class: "ability-name" },
        a.name,
        h("span", { class: "tiny muted" }, ` ${SLOT_ROLE[a.slot] ?? ""}`),
        supported ? null : h("span", { class: "badge warn" }, "NOT SUPPORTED YET"),
      ),
      h(
        "div",
        { class: "ability-meta small" },
        h("span", { class: "chip" }, a.mechanic),
        h("span", { class: `chip dmg-${a.damageType}` }, a.damageType),
        h("span", { class: "chip" }, `CD ${formatNumber(a.cooldown)}s`),
        tags.map((t) => h("span", { class: "chip tag", title: (ATTACK_TAG_INFO as Record<string, string>)[t] ?? "" }, t)),
      ),
    ),
  );
}

function detail(c: CharacterSummary, onNext: () => void): HTMLElement {
  const stats = c.stats ?? ({} as CharacterSummary["stats"]);
  const tags = Array.isArray(c.tags) ? c.tags : [];
  const abilities = (Array.isArray(c.abilities) ? [...c.abilities] : []).sort((a, b) => a.slot - b.slot);
  const assumptions = Array.isArray(c.assumptions) ? c.assumptions : [];
  const big = rigPreview(c.rig, { width: 144, height: 192, className: "big-rig", isActive: () => true });

  return h(
    "div",
    { class: "panel detail" },
    h(
      "div",
      { class: "detail-top" },
      h("div", { class: "preview-box" }, big),
      h(
        "div",
        { class: "detail-id" },
        h("h2", null, c.name),
        h("p", { class: "muted small" }, c.source),
        h("p", { class: "placeholder tiny" }, "Rig preview: placeholder renderer (engine renderer not wired in yet)"),
        h("button", { class: "btn primary", onclick: onNext }, "Next: World select ▶"),
      ),
    ),
    h(
      "div",
      { class: "stats" },
      STAT_KEYS.map((k) => h("div", { class: "stat" }, h("span", { class: "stat-k tiny" }, k), h("span", { class: "stat-v" }, formatNumber(stats[k])))),
    ),
    h("h3", null, "Hax tags"),
    tags.length
      ? h(
          "ul",
          { class: "tags" },
          tags.map((t) => h("li", null, h("span", { class: "chip tag" }, t), h("span", { class: "small" }, haxInfo(t)))),
        )
      : h("p", { class: "muted small" }, "None. Raw stats only."),
    h("h3", null, "Abilities"),
    abilities.length ? h("ul", { class: "abilities" }, abilities.map(abilityRow)) : h("p", { class: "muted small" }, "No abilities."),
    h("h3", null, "Assumptions"),
    h("ul", { class: "assumptions tiny muted" }, assumptions.map((a) => h("li", null, a))),
  );
}

export function charactersScreen(root: HTMLElement) {
  let removeKeys: (() => void) | null = null;
  const cleanup = withLibrary(root, (lib) => {
    const chars = lib.characters;
    root.append(screenHeader("Character select", "Arrows: move · Enter: next · Esc: back · Hover a card to see it run"));
    if (!chars.length) {
      root.append(
        h("div", { class: "panel" }, h("p", null, "No characters in the library yet."), h("button", { class: "btn accent", onclick: () => navigate("generate") }, "+ New cartridge")),
      );
      return;
    }

    let index = Math.max(0, chars.findIndex((c) => c.id === state.selectedCharacterId));
    const grid = h("div", { class: "card-grid" });
    const side = h("div", { class: "detail-wrap" });
    const cards: HTMLElement[] = [];
    const next = () => {
      state.selectedCharacterId = chars[index].id;
      navigate("worlds");
    };

    const select = (i: number, focus = false) => {
      index = i;
      state.selectedCharacterId = chars[i].id;
      cards.forEach((c, j) => {
        c.classList.toggle("selected", j === i);
        c.setAttribute("aria-pressed", String(j === i));
      });
      side.replaceChildren(detail(chars[i], next));
      if (focus) cards[i].focus();
    };

    chars.forEach((c, i) => {
      const card: HTMLButtonElement = h(
        "button",
        { class: "card char-card", onclick: () => select(i), ondblclick: next },
        rigPreview(c.rig, { width: 80, height: 104, isActive: () => card.matches(":hover") || card.classList.contains("selected") }),
        h("span", { class: "card-name" }, c.name),
        h("span", { class: "tiny muted" }, c.source),
      );
      cards.push(card);
      grid.appendChild(card);
    });

    root.append(h("div", { class: "select-layout" }, h("div", { class: "panel grid-panel" }, grid), side));
    select(index);

    removeKeys = onKey((e) => {
      if (isTyping(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        select(gridStep(cards, index, e.key), true);
      } else if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement && !cards.includes(document.activeElement))) {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        navigate("title");
      }
    });
  });
  return () => {
    removeKeys?.();
    cleanup();
  };
}
