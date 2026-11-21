/** Generate screen (SPEC 10.4): real streamed stages, then the result. */
import type { GenerateEvent, GenerateResult, GenerateStage } from "../../shared/api";
import { ApiError, generate } from "../api";
import { h } from "../dom";
import { navigate } from "../router";
import { ensureLibrary, state } from "../state";
import { screenHeader } from "./common";

const STAGE_LABEL: Record<GenerateStage, string> = {
  interpreting: "Interpreting the source (Cortex)",
  validating: "Validating the cartridge",
  repairing: "Repairing (one Cortex repair call)",
  saving: "Saving to the shared library (Snowflake)",
  done: "Done",
};

let lastInput = { title: "", character: "" };

export function generateScreen(root: HTMLElement) {
  let disposed = false;
  let abort: AbortController | null = null;
  let openTimer = 0;

  const titleIn = h("input", { id: "gen-title", type: "text", maxlength: "200", autocomplete: "off", placeholder: "e.g. Nosferatu (1922)" });
  const charIn = h("input", { id: "gen-char", type: "text", maxlength: "120", autocomplete: "off", placeholder: "e.g. Count Orlok" });
  titleIn.value = lastInput.title;
  charIn.value = lastInput.character;
  const submit = h("button", { class: "btn accent", type: "submit" }, "Generate cartridge");
  const formMsg = h("p", { class: "small warn-text", role: "status" });
  const log = h("ol", { class: "stage-log" });
  const result = h("div", { class: "gen-result", "aria-live": "polite" });

  const setBusy = (busy: boolean) => {
    titleIn.disabled = busy;
    charIn.disabled = busy;
    submit.disabled = busy;
    submit.textContent = busy ? "Generating…" : "Generate cartridge";
  };

  let t0 = 0;
  const addLog = (label: string, detail?: string, cls = "") => {
    const now = performance.now();
    const clock = new Date().toLocaleTimeString("en-GB");
    log.appendChild(
      h(
        "li",
        { class: cls },
        h("span", { class: "tiny muted ts" }, `${clock} +${((now - t0) / 1000).toFixed(1)}s`),
        h("span", { class: "stage-name" }, label),
        detail ? h("span", { class: "tiny muted" }, detail) : null,
      ),
    );
  };

  const onEvent = (ev: GenerateEvent) => {
    if (disposed || ev.type !== "stage") return;
    addLog(STAGE_LABEL[ev.stage] ?? String(ev.stage), ev.detail, `stage-${ev.stage}`);
  };

  const showResult = (r: GenerateResult) => {
    switch (r.status) {
      case "ready": {
        const ch = r.cartridge?.character;
        const openBtn = h("button", { class: "btn primary" }, ch ? `Open ${ch.name} in Character select` : "Open Character select");
        const open = () => {
          window.clearTimeout(openTimer);
          if (ch) state.selectedCharacterId = ch.id;
          navigate("characters");
        };
        openBtn.addEventListener("click", open);
        const status = h("p", { class: "tiny muted blink" }, "Refreshing the library…");
        result.replaceChildren(
          h("div", { class: "panel ok" }, h("h3", null, "Cartridge saved"), h("p", { class: "small" }, `${r.cartridge?.id ?? ""}${ch ? `: ${ch.name}` : ""}`), status, openBtn),
        );
        if (ch) state.selectedCharacterId = ch.id;
        ensureLibrary(true)
          .catch(() => {})
          .then(() => {
            if (disposed) return;
            status.textContent = "Opening Character select…";
            openTimer = window.setTimeout(() => !disposed && open(), 1200);
          });
        openBtn.focus();
        break;
      }
      case "needs_clarification":
        result.replaceChildren(
          h(
            "div",
            { class: "panel warn" },
            h("h3", null, "Needs clarification"),
            h("p", null, r.question || "Please be more specific."),
            h("p", { class: "small muted" }, "Edit the title or character above and submit again."),
          ),
        );
        submit.textContent = "Resubmit";
        titleIn.focus();
        titleIn.select();
        break;
      case "unknown_source":
        result.replaceChildren(h("div", { class: "panel warn" }, h("h3", null, "Unknown source"), h("p", null, r.message || "The AI doesn't know this source.")));
        break;
      case "failed":
        result.replaceChildren(
          h(
            "div",
            { class: "panel error" },
            h("h3", null, "Generation failed"),
            h("p", null, r.message || "The cartridge didn't pass validation."),
            r.problems?.length ? h("ul", { class: "problems tiny" }, r.problems.map((p) => h("li", null, p))) : null,
            h("p", { class: "small" }, "Existing cartridges are untouched."),
          ),
        );
        break;
      default:
        result.replaceChildren(h("div", { class: "panel error" }, h("p", null, "Unexpected result from the server.")));
    }
  };

  const run = async () => {
    const title = titleIn.value.trim();
    const character = charIn.value.trim();
    if (!title || !character) {
      formMsg.textContent = "Enter both a title and a character.";
      return;
    }
    lastInput = { title, character };
    formMsg.textContent = "";
    log.replaceChildren();
    result.replaceChildren();
    window.clearTimeout(openTimer);
    abort = new AbortController();
    t0 = performance.now();
    addLog("Request sent", `"${title}" + "${character}"`, "stage-sent");
    setBusy(true);
    try {
      const r = await generate({ title, character }, onEvent, abort.signal);
      if (disposed) return;
      setBusy(false);
      showResult(r);
    } catch (e) {
      if (disposed || (e as Error)?.name === "AbortError") return;
      setBusy(false);
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? String(e);
      const offline = e instanceof ApiError && e.offline;
      addLog("Error", msg, "stage-error");
      result.replaceChildren(
        h(
          "div",
          { class: "panel error" },
          h("h3", null, offline ? "Server problem" : "Request failed"),
          h("p", null, msg),
          offline ? h("p", { class: "small muted" }, "Generation needs the server and Snowflake; stub data can't generate.") : null,
          h("p", { class: "small" }, "Existing cartridges are untouched."),
        ),
      );
    }
  };

  const form = h(
    "form",
    {
      class: "panel gen-form",
      onsubmit: (e: Event) => {
        e.preventDefault();
        if (!submit.disabled) void run();
      },
    },
    h("label", { for: "gen-title" }, "Film / episode / anime title"),
    titleIn,
    h("label", { for: "gen-char" }, "Main character"),
    charIn,
    h("div", { class: "row" }, submit, h("button", { class: "btn", type: "button", onclick: () => navigate("title") }, "Back")),
    formMsg,
  );

  root.append(
    screenHeader("New cartridge", "Snowflake Cortex writes one protagonist + a 3-room world. Stages below are the server's real stages."),
    h("div", { class: "gen-layout" }, form, h("div", { class: "panel" }, h("h3", null, "Stages"), log, result)),
  );
  titleIn.focus();

  return () => {
    disposed = true;
    window.clearTimeout(openTimer);
    abort?.abort();
  };
}
