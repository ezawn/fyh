/**
 * SERVER LANE. POST /api/generate (SPEC 7, 8): Cortex -> autoFix -> validate -> (one repair) -> save.
 * Emits only real stages. Cortex is injected so the pipeline can be tested without Snowflake.
 */
import { z } from "zod";
import type { GenerateEvent, GenerateResult, GenerateStage } from "../src/shared/api";
import { SCHEMA_VERSION, generationJsonSchema, type Cartridge } from "../src/shared/schema";
import { autoFix, validateCartridge } from "../src/shared/validate";
import { generationPrompt, loadExample, repairPrompt } from "./prompts";
import type { CompleteFn } from "./snowflake";
import { IdTakenError, type Store } from "./store";

export const GenerateRequestBody = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  character: z.string().trim().min(1, "character is required").max(100),
});

export type GenerateDeps = {
  store: Store;
  complete: CompleteFn;
  emit: (event: GenerateEvent) => void;
  now?: () => Date;
};

const MAX_TOKENS = 32000;
const MAX_PROBLEMS_SHOWN = 40;

type AnyObj = Record<string, any>;

/** kebab-case slug, max `max` chars, never empty. */
export function slug(s: string, max = 40): string {
  const out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return out || "untitled";
}

/** base, base-2, base-3, ... : the first one `taken` says is free. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

/** The cartridge id: kebab-case from title + character. */
export function cartridgeBaseId(title: string, character: string): string {
  const t = slug(title, 40);
  const c = slug(character, 24);
  return t.endsWith(c) ? t : `${t}-${c}`;
}

/**
 * Turns Cortex's cartridge body into a full cartridge: server-owned fields,
 * autoFix, and library-unique ids for the cartridge, character and world.
 */
export function assemble(
  body: AnyObj,
  req: { title: string; character: string },
  library: Cartridge[],
  createdAt: string,
  reservedIds: string[] = [],
): AnyObj {
  const cart: AnyObj = autoFix({
    ...body,
    id: "pending",
    schemaVersion: SCHEMA_VERSION,
    status: "ready",
    createdAt,
  });
  if (cart.source && typeof cart.source === "object") cart.source.requestedCharacter = req.character;

  const cartIds = new Set([...library.map((c) => c.id), ...reservedIds]);
  cart.id = uniqueId(cartridgeBaseId(req.title, req.character), (id) => cartIds.has(id));

  // Character and world ids must be unique across the library too (sessions and remix lines key on them).
  const charIds = new Set(library.map((c) => c.character.id));
  const worldIds = new Set(library.map((c) => c.world.id));
  if (cart.character && typeof cart.character === "object") {
    cart.character.id = uniqueId(typeof cart.character.id === "string" && cart.character.id ? cart.character.id : slug(req.character), (id) => charIds.has(id));
  }
  if (cart.world && typeof cart.world === "object") {
    cart.world.id = uniqueId(typeof cart.world.id === "string" && cart.world.id ? cart.world.id : `${slug(req.title)}-world`, (id) => worldIds.has(id));
  }
  return cart;
}

/** Strips the server-owned fields again, for the repair prompt. */
function body(cart: AnyObj): AnyObj {
  const { id: _i, schemaVersion: _v, status: _s, createdAt: _c, ...rest } = cart;
  return rest;
}

function errMsg(err: unknown): string {
  return ((err as Error)?.message ?? String(err)).split("\n")[0].slice(0, 300);
}

type Outcome =
  | { kind: "cartridge"; body: AnyObj }
  | { kind: "result"; result: GenerateResult };

/** Interprets Cortex's GenerationOutput honestly. */
function interpret(raw: unknown): Outcome {
  if (!raw || typeof raw !== "object") return { kind: "result", result: { status: "failed", message: "Cortex returned something that isn't a JSON object." } };
  const out = raw as AnyObj;
  if (out.outcome === "needs_clarification") {
    const question = typeof out.question === "string" && out.question.trim() ? out.question.trim() : "Which exact film, series or episode do you mean?";
    return { kind: "result", result: { status: "needs_clarification", question } };
  }
  if (out.outcome === "unknown_source") {
    const message = typeof out.message === "string" && out.message.trim() ? out.message.trim() : "The AI doesn't know this source well enough to make a cartridge without inventing details.";
    return { kind: "result", result: { status: "unknown_source", message } };
  }
  if (out.outcome === "cartridge" && out.cartridge && typeof out.cartridge === "object") return { kind: "cartridge", body: out.cartridge };
  return { kind: "result", result: { status: "failed", message: `Cortex returned outcome "${String(out.outcome)}" without a cartridge.` } };
}

/** Runs the whole pipeline. Always ends with exactly one {type:"result"} event; never throws. */
export async function runGenerate(input: { title: string; character: string }, deps: GenerateDeps): Promise<GenerateResult> {
  const { store, complete, emit } = deps;
  const now = deps.now ?? (() => new Date());
  const stage = (s: GenerateStage, detail?: string) => emit(detail ? { type: "stage", stage: s, detail } : { type: "stage", stage: s });
  const finish = (result: GenerateResult) => {
    emit({ type: "result", result });
    return result;
  };
  const schema = generationJsonSchema();

  try {
    // 1. interpreting: the Cortex call
    stage("interpreting", `Asking Cortex about "${input.title}" / "${input.character}"`);
    let raw: unknown;
    try {
      raw = await complete(generationPrompt(input.title, input.character, loadExample()), schema, { maxTokens: MAX_TOKENS, effort: "high" });
    } catch (err) {
      return finish({ status: "failed", message: `Cortex generation failed: ${errMsg(err)}` });
    }
    const first = interpret(raw);
    if (first.kind === "result") return finish(first.result);

    // 2. validating
    stage("validating");
    const library = await store.listReady();
    let cart = assemble(first.body, input, library, now().toISOString());
    let problems = validateCartridge(cart);

    // 3. repairing (one Cortex call, only if needed)
    if (problems.length) {
      stage("repairing", `${problems.length} problem(s) after auto-fix`);
      let repaired: unknown;
      try {
        repaired = await complete(repairPrompt(input.title, input.character, body(cart), problems), schema, { maxTokens: MAX_TOKENS, effort: "high" });
      } catch (err) {
        return finish({ status: "failed", message: `Cortex repair call failed: ${errMsg(err)}`, problems: problems.slice(0, MAX_PROBLEMS_SHOWN) });
      }
      const second = interpret(repaired);
      if (second.kind === "result") {
        return finish({
          status: "failed",
          message: "The repair call did not return a cartridge.",
          problems: problems.slice(0, MAX_PROBLEMS_SHOWN),
        });
      }
      stage("validating", "after repair");
      cart = assemble(second.body, input, library, cart.createdAt);
      problems = validateCartridge(cart);
      if (problems.length) {
        return finish({
          status: "failed",
          message: `The generated cartridge is still invalid after one repair (${problems.length} problem(s)). Nothing was saved.`,
          problems: problems.slice(0, MAX_PROBLEMS_SHOWN),
        });
      }
    }

    // 4. saving (insert-only; if someone took the id meanwhile, pick the next one)
    stage("saving");
    const reserved: string[] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        await store.save(cart as Cartridge);
        break;
      } catch (err) {
        if (err instanceof IdTakenError && attempt < 3) {
          reserved.push(cart.id);
          const fresh = assemble(body(cart), input, await store.listReady(), cart.createdAt, reserved);
          if (validateCartridge(fresh).length === 0) {
            cart = fresh;
            continue;
          }
        }
        return finish({ status: "failed", message: `Saving to the library failed: ${errMsg(err)}` });
      }
    }

    stage("done");
    return finish({ status: "ready", cartridge: cart as Cartridge });
  } catch (err) {
    return finish({ status: "failed", message: `Generation failed: ${errMsg(err)}` });
  }
}
