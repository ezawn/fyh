/** Hash router: #/title, #/characters, #/worlds, #/generate, #/play. */
import type { Cleanup } from "./dom";

export type Route = "title" | "characters" | "worlds" | "generate" | "play";
export type Screen = (root: HTMLElement) => Cleanup | void;

const ROUTES: Route[] = ["title", "characters", "worlds", "generate", "play"];
let screens: Record<Route, Screen> | null = null;
let root: HTMLElement | null = null;
let cleanup: Cleanup | void;
let onRoute: ((r: Route) => void) | null = null;

export function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, "") as Route;
  return ROUTES.includes(r) ? r : "title";
}

export function navigate(r: Route): void {
  if (currentRoute() === r && location.hash) render();
  else location.hash = `#/${r}`;
}

function render(): void {
  if (!screens || !root) return;
  try {
    cleanup?.();
  } catch (e) {
    console.error(e);
  }
  cleanup = undefined;
  root.replaceChildren();
  const r = currentRoute();
  onRoute?.(r);
  cleanup = screens[r](root);
  window.scrollTo(0, 0);
}

export function startRouter(el: HTMLElement, s: Record<Route, Screen>, routeChanged?: (r: Route) => void): void {
  root = el;
  screens = s;
  onRoute = routeChanged ?? null;
  window.addEventListener("hashchange", render);
  render();
}
