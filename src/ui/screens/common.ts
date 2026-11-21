import type { Library } from "../api";
import { h, type Cleanup } from "../dom";
import { ensureLibrary } from "../state";

/** Shows "Loading library…", then calls render once the library is in. Retry on error. */
export function withLibrary(root: HTMLElement, render: (lib: Library) => Cleanup | void): Cleanup {
  let disposed = false;
  let inner: Cleanup | void;

  const attempt = (force: boolean) => {
    root.replaceChildren(h("p", { class: "loading blink" }, "Loading library…"));
    ensureLibrary(force).then(
      (lib) => {
        if (disposed) return;
        root.replaceChildren();
        inner = render(lib);
      },
      (err: unknown) => {
        if (disposed) return;
        root.replaceChildren(
          errorBox("Couldn't load the library", (err as Error)?.message ?? String(err), [
            h("button", { class: "btn", onclick: () => attempt(true) }, "Retry"),
          ]),
        );
      },
    );
  };
  attempt(false);
  return () => {
    disposed = true;
    inner?.();
  };
}

export function errorBox(title: string, message: string, actions: HTMLElement[] = [], extra?: Node): HTMLElement {
  return h("div", { class: "panel error", role: "alert" }, h("h3", null, title), h("p", null, message), extra, h("div", { class: "row" }, actions));
}

export function screenHeader(title: string, subtitle?: string): HTMLElement {
  return h("div", { class: "screen-head" }, h("h2", null, title), subtitle ? h("p", { class: "muted small" }, subtitle) : null);
}

/** Registers a keydown handler and returns its remover. */
export function onKey(fn: (e: KeyboardEvent) => void): Cleanup {
  window.addEventListener("keydown", fn);
  return () => window.removeEventListener("keydown", fn);
}

/** Index of the card in the next row/column for arrow-key grid navigation. */
export function gridStep(cards: HTMLElement[], index: number, key: string): number {
  if (!cards.length) return -1;
  const top0 = cards[0].offsetTop;
  let cols = cards.findIndex((c) => c.offsetTop !== top0);
  if (cols <= 0) cols = cards.length;
  const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -cols : key === "ArrowDown" ? cols : 0;
  const next = index < 0 ? 0 : index + delta;
  return Math.max(0, Math.min(cards.length - 1, next));
}
