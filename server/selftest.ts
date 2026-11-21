/**
 * SERVER LANE. Offline self-test: id slugging, the /api/generate pipeline (stages, repair, failure,
 * honesty pass-through, id collisions) and /api/session (remix, cache, timeout, own world)
 * with a fake Cortex and a MemoryStore. Fixture data is original / public domain (Nosferatu, 1922).
 * Run: npx tsx server/selftest.ts
 */
import assert from "node:assert/strict";
import type { GenerateEvent } from "../src/shared/api";
import type { Cartridge, Rig } from "../src/shared/schema";
import { validateCartridge } from "../src/shared/validate";
import { cartridgeBaseId, runGenerate, slug, uniqueId } from "./generate";
import { runSession } from "./session";
import type { CompleteFn } from "./snowflake";
import { MemoryStore } from "./store";

// ---------- fixture ----------
const rig: Rig = {
  sizeClass: "human",
  parts: {
    head: [{ type: "circle", x: 8, y: 5, r: 4, color: "#e8e0d0" }],
    torso: [{ type: "rect", x: 4, y: 9, w: 8, h: 11, color: "#202020" }],
    armFront: [{ type: "rect", x: 11, y: 10, w: 3, h: 9, color: "#202020" }],
    armBack: [{ type: "rect", x: 2, y: 10, w: 3, h: 9, color: "#181818" }],
    legFront: [{ type: "rect", x: 8, y: 20, w: 3, h: 12, color: "#202020" }],
    legBack: [{ type: "rect", x: 5, y: 20, w: 3, h: 12, color: "#181818" }],
    extras: [],
  },
  pivots: { neck: [8, 9], shoulder: [8, 10], hip: [8, 20] },
};
const stats = (HP: number, AD: number, AP = 0) => ({ HP, AD, AP, ARM: 5, MR: 5, ARM_PEN: 0, MAGIC_PEN: 0 });
const W = 40;
const row = (s: string) => s.padEnd(W, ".");
const layout = (goal: "E" | "B") => [
  ...Array.from({ length: 12 }, () => ".".repeat(W)),
  row(`.S${".".repeat(20)}1${".".repeat(14)}${goal}`),
  "#".repeat(W),
];

function body(): Record<string, any> {
  const enemy = {
    id: "rat", name: "Plague Rat", rig: { ...rig, sizeClass: "tiny" as const, parts: { ...rig.parts, head: [{ type: "circle" as const, x: 6, y: 4, r: 3, color: "#555555" }], torso: [], armFront: [], armBack: [], legFront: [], legBack: [] }, pivots: { neck: [6, 7], shoulder: [6, 8], hip: [6, 12] } },
    collisionBox: { w: 10, h: 8 }, stats: stats(5, 1), powerTier: "toddler", tags: [], behaviour: "walker", speed: 60,
    attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 16, cooldown: 1 },
  };
  return {
    source: { title: "Nosferatu", medium: "film", versionOrEpisode: "Nosferatu (1922)", requestedCharacter: "Count Orlok" },
    character: {
      id: "count-orlok", name: "Count Orlok", source: "Nosferatu (1922)", versionOrEpisode: "Iconic (1922 film)",
      assumptions: ["City-level: supernatural vampire"], rig, collisionBox: { w: 12, h: 30 },
      movement: { speed: 140, jumpStrength: 420, canFly: false }, stats: stats(3000, 300, 600), powerTier: "city", tags: [],
      abilities: [
        { id: "claw", name: "Claw", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 24, cooldown: 0.5, duration: 0, knockback: 100, animation: "swing" },
        { id: "shadow", name: "Shadow Grasp", slot: 2, mechanic: "projectile", damageType: "magic", attackTags: ["ENERGY"], ratio: 1.5, range: 300, cooldown: 2, duration: 0, projectileSpeed: 300, knockback: 50, animation: "cast" },
        { id: "glide", name: "Glide", slot: 3, mechanic: "dash", damageType: "physical", attackTags: [], ratio: 0, range: 0, cooldown: 3, duration: 0.3, knockback: 0, animation: "kick" },
        { id: "plague", name: "Plague", slot: 4, mechanic: "aoe", damageType: "magic", attackTags: ["ENERGY"], ratio: 3, range: 80, cooldown: 12, duration: 0, knockback: 200, animation: "cast" },
      ],
    },
    world: {
      id: "nosferatu-wisborg", name: "Wisborg", source: "Nosferatu (1922)",
      visualStyle: { palette: { sky: "#30304a", skyBottom: "#50506a", ground: "#3a3020", groundTop: "#5a5040", platform: "#6a6050", accent: "#c0a040" }, backdrop: "city" },
      enemies: [enemy],
      boss: { ...enemy, id: "hunter", name: "Vampire Hunter", rig, collisionBox: { w: 12, h: 30 }, stats: stats(50, 8), powerTier: "civilian", pattern: ["charge"], phaseAt: 0.5 },
      rooms: [
        { id: "room-1", name: "Harbour", objective: "Reach the town", layout: layout("E"), isBossRoom: false, exit: { toRoom: "room-2" } },
        { id: "room-2", name: "Streets", objective: "Reach the house", layout: layout("E"), isBossRoom: false, exit: { toRoom: "room-3" } },
        { id: "room-3", name: "House", objective: "Defeat the hunter", layout: layout("B"), isBossRoom: true, exit: { toRoom: "END" } },
      ],
      dialogue: {
        roomIntro: [[{ speaker: "Orlok", text: "The ship has landed." }], [], []],
        bossIntro: [{ speaker: "Hunter", text: "Stop there!" }],
        bossDefeated: [],
        playerDefeated: [],
      },
    },
    notes: { sourceFacts: ["Orlok travels to Wisborg by ship"], designChoices: ["The hunter boss is a design choice"] },
  };
}
const fullCart = (id: string): Cartridge =>
  ({ ...body(), id, schemaVersion: 1, status: "ready", createdAt: "2026-01-01T00:00:00.000Z" }) as Cartridge;

function otherFixture(): Cartridge {
  const c = fullCart("nosferatu-1922-hutter");
  c.character = { ...c.character, id: "hutter", name: "Hutter", powerTier: "civilian", stats: { HP: 50, AD: 8, AP: 0, ARM: 5, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 } };
  c.world = { ...c.world, id: "transylvania" };
  return c;
}

// ---------- helpers ----------
function fake(...answers: (unknown | Error | "hang")[]): CompleteFn & { calls: number } {
  const fn = (async () => {
    const a = answers[Math.min(fn.calls++, answers.length - 1)];
    if (a === "hang") return new Promise(() => {});
    if (a instanceof Error) throw a;
    return structuredClone(a);
  }) as unknown as CompleteFn & { calls: number };
  fn.calls = 0;
  return fn;
}
async function gen(store: MemoryStore, complete: CompleteFn, title = "Nosferatu (1922)", character = "Count Orlok") {
  const events: GenerateEvent[] = [];
  // Round-trip each event through NDJSON like the HTTP route does.
  const emit = (e: GenerateEvent) => events.push(JSON.parse(JSON.stringify(e) + "\n"));
  const result = await runGenerate({ title, character }, { store, complete, emit, now: () => new Date("2026-11-21T12:00:00Z") });
  const stages = events.filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage);
  assert.equal(events.at(-1)?.type, "result", "last event is the result");
  assert.equal(events.filter((e) => e.type === "result").length, 1, "exactly one result");
  return { result, stages };
}
let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ---------- tests ----------
// --fixtures DIR: write the two session fixtures as JSON (for an HTTP smoke test with STORE=memory CONTENT_DIR=DIR) and exit.
const fixturesAt = process.argv.indexOf("--fixtures");
if (fixturesAt > 0) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const dir = process.argv[fixturesAt + 1];
  mkdirSync(dir, { recursive: true });
  for (const c of [fullCart("nosferatu-1922-count-orlok"), otherFixture()]) writeFileSync(`${dir}/${c.id}.json`, JSON.stringify(c, null, 2));
  console.log(`wrote fixtures to ${dir}`);
  process.exit(0);
}

await test("fixture is valid", () => assert.deepEqual(validateCartridge(fullCart("x")), []));

await test("slug / ids", () => {
  assert.equal(slug("Nosferatu (1922)"), "nosferatu-1922");
  assert.equal(slug("  Alice in Wonderland!! "), "alice-in-wonderland");
  assert.equal(slug("Amélie"), "amelie");
  assert.equal(slug("???"), "untitled");
  assert.ok(slug("a".repeat(100)).length <= 40);
  assert.equal(cartridgeBaseId("Nosferatu (1922)", "Count Orlok"), "nosferatu-1922-count-orlok");
  assert.equal(cartridgeBaseId("Alice in Wonderland", "Alice"), "alice-in-wonderland-alice");
  const taken = new Set(["a", "a-2"]);
  assert.equal(uniqueId("a", (i) => taken.has(i)), "a-3");
  assert.equal(uniqueId("b", (i) => taken.has(i)), "b");
});

await test("generate: happy path, real stages, saved", async () => {
  const store = new MemoryStore();
  const { result, stages } = await gen(store, fake({ outcome: "cartridge", cartridge: body() }));
  assert.deepEqual(stages, ["interpreting", "validating", "saving", "done"]);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.cartridge.id, "nosferatu-1922-count-orlok");
  assert.equal(result.cartridge.status, "ready");
  assert.equal(result.cartridge.schemaVersion, 1);
  assert.equal(result.cartridge.createdAt, "2026-11-21T12:00:00.000Z");
  assert.equal(result.cartridge.source.requestedCharacter, "Count Orlok");
  assert.ok(await store.get(result.cartridge.id));
});

await test("generate: id collision appends -2, never overwrites", async () => {
  const existing = fullCart("nosferatu-1922-count-orlok");
  const store = new MemoryStore([existing]);
  const { result } = await gen(store, fake({ outcome: "cartridge", cartridge: body() }));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.cartridge.id, "nosferatu-1922-count-orlok-2");
  assert.equal(result.cartridge.character.id, "count-orlok-2");
  assert.equal(result.cartridge.world.id, "nosferatu-wisborg-2");
  assert.deepEqual(await store.get(existing.id), existing);
});

await test("generate: one repair call fixes it", async () => {
  const broken = body();
  broken.world.rooms[0].layout[12] = broken.world.rooms[0].layout[12].replace("S", "."); // no spawn
  const complete = fake({ outcome: "cartridge", cartridge: broken }, { outcome: "cartridge", cartridge: body() });
  const store = new MemoryStore();
  const { result, stages } = await gen(store, complete);
  assert.deepEqual(stages, ["interpreting", "validating", "repairing", "validating", "saving", "done"]);
  assert.equal(result.status, "ready");
  assert.equal(complete.calls, 2);
});

await test("generate: still invalid after repair -> failed, nothing saved", async () => {
  const broken = body();
  broken.world.rooms[0].layout[12] = broken.world.rooms[0].layout[12].replace("S", ".");
  const complete = fake({ outcome: "cartridge", cartridge: broken });
  const store = new MemoryStore();
  const { result } = await gen(store, complete);
  assert.equal(result.status, "failed");
  assert.equal(complete.calls, 2, "exactly one repair attempt");
  if (result.status === "failed") assert.ok(result.problems?.some((p) => p.includes("spawn")));
  assert.equal((await store.listReady()).length, 0);
});

await test("generate: honesty outcomes pass through", async () => {
  const store = new MemoryStore();
  const q = await gen(store, fake({ outcome: "needs_clarification", question: "Which Dracula adaptation?" }), "Dracula", "Dracula");
  assert.deepEqual(q.result, { status: "needs_clarification", question: "Which Dracula adaptation?" });
  assert.deepEqual(q.stages, ["interpreting"]);
  const u = await gen(store, fake({ outcome: "unknown_source", message: "I don't know this film." }), "Zzyzx", "Bob");
  assert.deepEqual(u.result, { status: "unknown_source", message: "I don't know this film." });
});

await test("generate: Cortex error -> failed with a clear message", async () => {
  const { result } = await gen(new MemoryStore(), fake(new Error("Model not available in region")));
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.match(result.message, /AI generation failed: Model not available/);
});

// ---------- session ----------
const orlokCart = fullCart("nosferatu-1922-count-orlok");
const otherCart = otherFixture();
const remixLines = {
  roomIntro: [[{ speaker: "Hutter", text: "The vampire is here?!" }], [], []],
  bossIntro: [{ speaker: "Hunter", text: "Not you again." }],
  bossDefeated: [],
  playerDefeated: [],
};

await test("session: remix call, then cached", async () => {
  const store = new MemoryStore([orlokCart, otherCart]);
  const complete = fake(remixLines);
  const s1 = await runSession({ characterId: "count-orlok", worldId: "transylvania" }, { store, complete });
  assert.equal(s1.dialogueSource, "remix");
  assert.deepEqual(s1.dialogue, remixLines);
  assert.equal(s1.character.id, "count-orlok");
  s1.world.rooms.pop(); // mutating the session must not touch the library
  assert.equal((await store.listReady())[1].world.rooms.length, 3);
  const s2 = await runSession({ characterId: "count-orlok", worldId: "transylvania" }, { store, complete });
  assert.equal(s2.dialogueSource, "remix");
  assert.equal(complete.calls, 1, "second session uses REMIX_LINES cache");
});

await test("session: own world -> original, no call", async () => {
  const complete = fake(remixLines);
  const s = await runSession({ characterId: "count-orlok", worldId: "nosferatu-wisborg" }, { store: new MemoryStore([orlokCart, otherCart]), complete });
  assert.equal(s.dialogueSource, "original");
  assert.equal(complete.calls, 0);
});

await test("session: timeout / bad lines / error -> original", async () => {
  for (const answer of ["hang", { ...remixLines, bossIntro: [{ speaker: "X", text: "y".repeat(121) }] }, new Error("boom")]) {
    const s = await runSession(
      { characterId: "hutter", worldId: "nosferatu-wisborg" },
      { store: new MemoryStore([orlokCart, otherCart]), complete: fake(answer), timeoutMs: 50 },
    );
    assert.equal(s.dialogueSource, "original");
    assert.deepEqual(s.dialogue, orlokCart.world.dialogue);
  }
});

await test("session: unknown ids -> 404", async () => {
  await assert.rejects(
    runSession({ characterId: "nobody", worldId: "transylvania" }, { store: new MemoryStore([otherCart]), complete: fake(remixLines) }),
    (e: { status?: number }) => e.status === 404,
  );
});

console.log(`\n${passed} tests passed`);
