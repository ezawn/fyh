/**
 * Builds the hand-finished demo cartridge content/peppa-muddy-puddles.json.
 * Run: npx tsx scripts/content/peppa.ts
 *
 * Rigs and props are drawn on the 2x canvas (RIG_SIZES in rig pixels, shown at RIG_SCALE 0.5).
 * Every rig faces right. Arms hang from the shoulder pivot, legs from the hip pivot.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROOM_ROWS, type BossDef, type Cartridge, type CharacterDef, type EnemyDef, type NpcDef, type PropDef, type Rig, type Room, type Shape, type SizeClass } from "../../src/shared/schema";
import { canReach, validateCartridge } from "../../src/shared/validate";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number, color: string): Shape => ({ type: "rect", x, y, w, h, color });
const circle = (x: number, y: number, r: number, color: string): Shape => ({ type: "circle", x, y, r, color });

/** Tile grid: empty rows with 2 ground rows at the bottom. Row 11 is the standing row on the floor. */
type Op =
  | ["gap", number, number] // remove floor, cols c0..c1
  | ["plat", number, number, number] // one-way platform at row, cols c0..c1
  | ["pillar", number, number, number] // ground block rising from the floor: col, width, height
  | ["spikes", number, number] // spikes on the floor, cols c0..c1
  | ["put", string, number, number]; // single tile: char, col, row

function buildLayout(width: number, ops: Op[]): string[] {
  const g: string[][] = Array.from({ length: ROOM_ROWS }, (_, r) => Array.from({ length: width }, () => (r >= ROOM_ROWS - 2 ? "#" : ".")));
  const set = (c: number, r: number, ch: string) => {
    if (c < 0 || c >= width || r < 0 || r >= ROOM_ROWS) throw new Error(`tile (${c},${r}) outside the ${width}-wide room`);
    g[r][c] = ch;
  };
  const floor = ROOM_ROWS - 3; // standing row
  for (const op of ops) {
    switch (op[0]) {
      case "gap":
        for (let c = op[1]; c <= op[2]; c++) for (let r = ROOM_ROWS - 2; r < ROOM_ROWS; r++) set(c, r, ".");
        break;
      case "plat":
        for (let c = op[2]; c <= op[3]; c++) set(c, op[1], "=");
        break;
      case "pillar":
        for (let c = op[1]; c < op[1] + op[2]; c++) for (let k = 0; k < op[3]; k++) set(c, floor - k, "#");
        break;
      case "spikes":
        for (let c = op[1]; c <= op[2]; c++) set(c, floor, "^");
        break;
      case "put":
        set(op[2], op[3], op[1]);
        break;
    }
  }
  return g.map((row) => row.join(""));
}

// ---------------------------------------------------------------------------
// Rig helpers (2x canvas; every rig faces right)
// ---------------------------------------------------------------------------

const OUT = "#2a1a1e";
const WHITE = "#ffffff";
const BLACK = "#141414";

function scaleShapes(shapes: Shape[], k: number, dx: number, dy: number): Shape[] {
  return shapes.map((s) =>
    s.type === "rect" ? rect(s.x * k + dx, s.y * k + dy, s.w * k, s.h * k, s.color) : circle(s.x * k + dx, s.y * k + dy, s.r * k, s.color),
  );
}
function scaleRig(rig: Rig, sizeClass: SizeClass, k: number, dx: number, dy: number): Rig {
  const p = rig.parts;
  const sc = (s: Shape[]) => scaleShapes(s, k, dx, dy);
  const pt = ([x, y]: [number, number]): [number, number] => [x * k + dx, y * k + dy];
  return {
    sizeClass,
    parts: {
      head: sc(p.head), torso: sc(p.torso), armFront: sc(p.armFront), armBack: sc(p.armBack), legFront: sc(p.legFront), legBack: sc(p.legBack),
      extras: p.extras.map((e) => ({ attachTo: e.attachTo, shapes: sc(e.shapes) })),
    },
    pivots: { neck: pt(rig.pivots.neck), shoulder: pt(rig.pivots.shoulder), hip: pt(rig.pivots.hip) },
  };
}

/** Little animal kid on the tiny 24x32 canvas: head on top, dress or top+shorts, boots. */
type Kid = {
  species: "pig" | "sheep" | "dog" | "rabbit";
  skin: string; skinSh: string; muzzle: string; cheek: string;
  outfit: "dress" | "top"; top: string; topSh: string; topHi: string; shorts?: string;
  pattern?: Shape[];
  shoe: string; shoeSh: string; shoeHi: string;
  holds?: Shape[];
};
function tinyKid(k: Kid): Rig {
  const cy = k.species === "rabbit" ? 12 : 10;
  const R = k.species === "rabbit" ? 6.2 : 7;
  const behind: Shape[] = [];
  const face: Shape[] = [];
  const on: Shape[] = [];
  if (k.species === "pig") {
    behind.push(rect(6, 1, 4, 4, OUT), rect(7, 2, 2, 3, k.skin), rect(11, 0, 4, 4, OUT), rect(12, 1, 2, 3, k.skin));
    face.push(circle(18, cy + 2, 3.6, OUT), circle(18, cy + 2, 2.8, k.muzzle), rect(16.6, cy + 1.3, 1, 1.6, k.skinSh), rect(18.8, cy + 1.3, 1, 1.6, k.skinSh));
  } else if (k.species === "sheep") {
    behind.push(circle(5, 6, 3.4, "#e2e2ea"), circle(9, 3.4, 3.4, "#e2e2ea"), circle(14, 3.6, 3.2, "#e2e2ea"), circle(4, 11, 3, "#e2e2ea"));
    on.push(circle(6, 5.5, 2.6, WHITE), circle(10, 3.4, 2.6, WHITE), circle(14, 4, 2.3, WHITE), circle(5, 10, 2.2, WHITE), rect(1, 10, 4, 2, k.skinSh));
    face.push(circle(17, cy + 2, 2.8, k.muzzle), rect(17.5, cy + 0.6, 2, 1.4, "#d9708f"));
  } else if (k.species === "dog") {
    face.push(circle(17, cy + 2, 3.4, OUT), circle(17, cy + 2, 2.7, k.muzzle), circle(19.3, cy + 0.8, 1.3, BLACK));
    on.push(rect(3, cy - 5, 5, 10, OUT), rect(4, cy - 4, 3, 8, k.skinSh));
  } else {
    behind.push(rect(6, 0, 5, 9, OUT), rect(7, 1, 3, 8, k.skin), rect(8, 2, 1, 5, "#f2a0b8"), rect(11, 0, 5, 9, OUT), rect(12, 1, 3, 8, k.skin), rect(13, 2, 1, 5, "#f2a0b8"));
    face.push(circle(16.5, cy + 2, 2.3, k.muzzle), circle(18.2, cy + 1, 0.9, "#e07a9a"), rect(15.6, cy + 3.8, 1.4, 1.6, WHITE));
  }
  const dress: Shape[] = k.outfit === "dress"
    ? [rect(7, 16, 9, 4, OUT), rect(6, 19, 11, 4, OUT), rect(5, 22, 13, 6, OUT), rect(8, 17, 7, 3, k.top), rect(7, 20, 9, 3, k.top), rect(6, 23, 11, 4, k.top),
       rect(7, 20, 2, 3, k.topSh), rect(6, 23, 3, 4, k.topSh), rect(13, 20, 1, 6, k.topHi), rect(6, 26, 11, 1, k.topSh)]
    : [rect(7, 16, 9, 11, OUT), rect(8, 17, 7, 6, k.top), rect(8, 17, 2, 6, k.topSh), rect(13, 18, 1, 4, k.topHi), rect(8, 23, 7, 3, k.shorts ?? k.topSh), rect(8, 23, 2, 3, OUT)];
  return {
    sizeClass: "tiny",
    parts: {
      head: [
        ...behind,
        circle(11, cy, R + 1, OUT),
        circle(11, cy, R, k.skin),
        circle(10, cy - 2, 1.8, WHITE), circle(10.6, cy - 1.8, 0.9, OUT),
        circle(14.5, cy - 2.5, 1.8, WHITE), circle(15.1, cy - 2.3, 0.9, OUT),
        circle(8.5, cy + 2.5, 1.5, k.cheek),
        rect(12, cy + 4.5, 3, 1, "#9c3b55"),
        rect(15, cy + 3.8, 1, 1, "#9c3b55"),
        ...face,
      ],
      torso: [...dress, ...(k.pattern ?? [])],
      armBack: [rect(7, 17, 4, 8, OUT), rect(8, 18, 2, 6, k.skinSh), circle(9, 24.5, 1.3, k.skinSh)],
      armFront: [rect(12, 17, 4, 8, OUT), circle(14, 24.5, 1.6, OUT), rect(13, 18, 2, 6, k.skin), rect(13, 18, 2, 2, k.top), circle(14, 24.5, 1.1, k.skin)],
      legBack: [rect(8, 26, 2, 3, k.skinSh), rect(7, 28, 5, 4, OUT), rect(8, 28.5, 3.5, 3, k.shoeSh)],
      legFront: [rect(12, 26, 2, 3, k.skin), rect(11, 28, 7, 4, OUT), rect(12, 28.5, 5, 3, k.shoe), rect(14.5, 29, 1.5, 1, k.shoeHi)],
      extras: [
        ...(on.length ? [{ attachTo: "head" as const, shapes: on }] : []),
        ...(k.species === "pig" ? [{ attachTo: "torso" as const, shapes: [circle(3.8, 22, 1.6, k.skinSh), circle(3.8, 22, 0.6, k.skin)] }] : []),
        ...(k.holds ? [{ attachTo: "armFront" as const, shapes: k.holds }] : []),
      ],
    },
    pivots: { neck: [11, 17], shoulder: [11, 18], hip: [11, 26] },
  };
}

/** Grown-up pig on the small 32x40 canvas (Mummy, Grandpa; scaled up for Daddy). */
type PigColours = { skin: string; skinSh: string; snout: string; cheek: string; top: string; topSh: string; topHi: string; shoe: string; shoeHi: string };
function pigAdult(c: PigColours, opts: { eyes?: Shape[]; face?: Shape[]; ears?: boolean; belly?: boolean; dress?: boolean } = {}): Rig {
  const eyes = opts.eyes ?? [circle(13.5, 9, 2.2, WHITE), circle(14.2, 9.2, 1.1, OUT), circle(19, 8.5, 2.2, WHITE), circle(19.7, 8.7, 1.1, OUT)];
  const torso: Shape[] = opts.belly
    ? [rect(6, 20, 19, 14, OUT), circle(16, 27, 9, OUT), rect(7, 21, 17, 12, c.top), circle(16, 27, 8, c.top), circle(12, 28, 5, c.topSh), circle(16.5, 26.5, 5.5, c.top), circle(19, 24, 2.5, c.topHi)]
    : [rect(6, 20, 19, 14, OUT), rect(7, 21, 17, 12, c.top), rect(7, 21, 4, 12, c.topSh), rect(19, 22, 2, 9, c.topHi)];
  if (opts.dress) torso.push(rect(4, 30, 23, 5, OUT), rect(5, 30, 21, 4, c.top), rect(5, 30, 5, 4, c.topSh));
  return {
    sizeClass: "small",
    parts: {
      head: [
        ...(opts.ears === false ? [] : [rect(7, 0, 6, 6, OUT), rect(8, 1, 4, 4, c.skin), rect(9, 2, 2, 2, c.skinSh), rect(14, 0, 6, 6, OUT), rect(15, 1, 4, 4, c.skin), rect(16, 2, 2, 2, c.skinSh)]),
        circle(15, 11, 10, OUT),
        circle(15, 11, 9, c.skin),
        circle(24, 13, 5, OUT),
        circle(24, 13, 4, c.snout),
        rect(22, 11.5, 1, 2.5, c.skinSh),
        rect(25, 11.5, 1, 2.5, c.skinSh),
        ...eyes,
        circle(11, 14.5, 2, c.cheek),
        rect(17, 17, 4, 1, c.skinSh),
        rect(21, 16, 1, 1, c.skinSh),
        ...(opts.face ?? []),
      ],
      torso,
      armBack: [rect(8, 21, 5, 11, OUT), rect(9, 22, 3, 9, c.skinSh), rect(9, 22, 3, 4, c.topSh), circle(10.5, 32, 2, c.skinSh)],
      armFront: [rect(17, 21, 5, 11, OUT), circle(19.5, 32, 3, OUT), rect(18, 22, 3, 9, c.skin), rect(18, 22, 3, 4, c.top), circle(19.5, 32, 2, c.skin)],
      legBack: [rect(9, 32, 6, 5, OUT), rect(10, 33, 4, 4, c.skinSh), rect(8, 35, 8, 5, OUT), rect(9, 36, 6, 3.5, c.shoe)],
      legFront: [rect(15, 32, 6, 5, OUT), rect(16, 33, 4, 4, c.skin), rect(14, 35, 9, 5, OUT), rect(15, 36, 7, 3.5, c.shoe), rect(19, 36.5, 2, 1, c.shoeHi)],
      extras: [{ attachTo: "torso", shapes: [circle(4, 24, 2, c.skinSh), circle(4, 24, 0.9, c.skin)] }],
    },
    pivots: { neck: [15, 21], shoulder: [15, 23], hip: [15, 33] },
  };
}

// ---------------------------------------------------------------------------
// Character: Peppa -- an original, simplified piglet design
// ---------------------------------------------------------------------------

const PINK = "#f4a6c0";
const PINK_SH = "#d97a9a";
const SNOUT = "#f8bcd0";
const CHEEK = "#ee6f95";
const dots = (c: string): Shape[] => [circle(9, 18.5, 0.8, c), circle(12.5, 21, 0.8, c), circle(8.5, 24.5, 0.8, c), circle(14.5, 25, 0.8, c), circle(11, 25.5, 0.8, c)];

const peppa: CharacterDef = {
  id: "peppa",
  name: "Peppa",
  source: "Peppa Pig",
  versionOrEpisode: "Series 1 Episode 1: Muddy Puddles",
  assumptions: [
    "Toddler / cartoon-civilian tier: Peppa is a little pig who plays in puddles, so she is the bottom anchor of the reference scale.",
    "Stats are exactly the toddler anchor (HP 15, AD 2, no armour, no magic).",
    "Push and Muddy Splash are playground-level physical hits; nothing she does is magic.",
    "Big Jump is a superJump: jumping up and down in muddy puddles is her signature move.",
    "Giggle Fit is an aoe with tiny damage but big knockback, standing in for her contagious laughter knocking everyone over.",
    "Small and slow on purpose (speed 110, jump 360): she can still walk and jump to every exit, just never win a fight against stronger worlds.",
  ],
  rig: tinyKid({
    species: "pig", skin: PINK, skinSh: PINK_SH, muzzle: SNOUT, cheek: CHEEK,
    outfit: "dress", top: "#e2302a", topSh: "#a81d18", topHi: "#ff6b5c",
    shoe: "#1a1a1a", shoeSh: "#000000", shoeHi: "#5a5a5a",
  }),
  collisionBox: { w: 10, h: 14 },
  movement: { speed: 110, jumpStrength: 360, canFly: false },
  stats: { HP: 15, AD: 2, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  abilities: [
    { id: "push", name: "Push", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 14, cooldown: 0.4, duration: 0, knockback: 120, animation: "punch" },
    { id: "muddy-splash", name: "Muddy Splash", slot: 2, mechanic: "aoe", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 32, cooldown: 2, duration: 0, knockback: 200, animation: "kick" },
    { id: "big-jump", name: "Big Jump", slot: 3, mechanic: "superJump", damageType: "physical", attackTags: [], ratio: 1.6, range: 0, cooldown: 3, duration: 0, knockback: 0, animation: "kick" },
    { id: "giggle-fit", name: "Giggle Fit", slot: 4, mechanic: "aoe", damageType: "physical", attackTags: [], ratio: 0.5, range: 48, cooldown: 8, duration: 0, knockback: 600, animation: "cast" },
  ],
};

// ---------------------------------------------------------------------------
// Enemies and boss
// ---------------------------------------------------------------------------

const toddlerAttack = { damageType: "physical" as const, ratio: 1, attackTags: ["PHYSICAL" as const], range: 12, cooldown: 1 };
const DINO = "#3cb043";

const george: EnemyDef = {
  id: "george",
  name: "George",
  rig: tinyKid({
    species: "pig", skin: PINK, skinSh: PINK_SH, muzzle: SNOUT, cheek: CHEEK,
    outfit: "top", top: "#3b6fd1", topSh: "#2a50a0", topHi: "#7aa0ef", shorts: "#2a2a5a",
    pattern: [rect(8, 19, 7, 1, WHITE), rect(8, 21, 7, 1, WHITE)],
    shoe: "#e0402a", shoeSh: "#a82a1a", shoeHi: "#ff9a8a",
    // Mr. Dinosaur, held out in front
    holds: [rect(14, 21, 7, 5, OUT), rect(15, 22, 5, 3, DINO), rect(18, 17, 5, 6, OUT), rect(19, 18, 2, 4, DINO), rect(19, 18, 3.5, 2, DINO), rect(21, 18.5, 1, 1, OUT), rect(13, 23, 2, 1.5, DINO), rect(16, 21, 1, 1, "#2a8a33")],
  }),
  collisionBox: { w: 9, h: 13 },
  stats: { HP: 10, AD: 1, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 70,
  attack: toddlerAttack,
};

const suzy: EnemyDef = {
  id: "suzy-sheep",
  name: "Suzy Sheep",
  rig: tinyKid({
    species: "sheep", skin: "#f3e6d4", skinSh: "#d8c9b6", muzzle: "#fff6ea", cheek: "#f2a8b8",
    outfit: "dress", top: "#a56ad6", topSh: "#7a46a8", topHi: "#c99af0",
    shoe: BLACK, shoeSh: "#000000", shoeHi: "#5a5a5a",
  }),
  collisionBox: { w: 10, h: 14 },
  stats: { HP: 12, AD: 1, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 90,
  attack: toddlerAttack,
};

const danny: EnemyDef = {
  id: "danny-dog",
  name: "Danny Dog",
  rig: tinyKid({
    species: "dog", skin: "#c9a27a", skinSh: "#7a5230", muzzle: "#ecd8bf", cheek: "#d98a7a",
    outfit: "top", top: "#f08a24", topSh: "#c0641a", topHi: "#ffb860", shorts: "#3a5a9a",
    shoe: "#3a2a1a", shoeSh: "#201408", shoeHi: "#7a5a3a",
  }),
  collisionBox: { w: 10, h: 14 },
  stats: { HP: 14, AD: 2, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 100,
  attack: { ...toddlerAttack, cooldown: 0.9 },
};

const rebecca: EnemyDef = {
  id: "rebecca-rabbit",
  name: "Rebecca Rabbit",
  rig: tinyKid({
    species: "rabbit", skin: "#d8b48c", skinSh: "#b08a62", muzzle: "#f2e2cc", cheek: "#f0a0a8",
    outfit: "top", top: "#4caf6a", topSh: "#2f8a4f", topHi: "#86d89c", shorts: "#3a5a9a",
    pattern: [rect(8, 20, 7, 0.6 + 0.4, "#2f8a4f")], // knitted jumper rib
    shoe: "#c0392b", shoeSh: "#8e2a1f", shoeHi: "#f07a6a",
  }),
  collisionBox: { w: 10, h: 14 },
  stats: { HP: 12, AD: 1, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 90,
  attack: toddlerAttack,
};

// Daddy Pig: grown-up pig drawn on the 32x40 grid, scaled 2.4x onto the 96x96 "large" canvas.
const daddyGrid = pigAdult(
  { skin: PINK, skinSh: PINK_SH, snout: SNOUT, cheek: CHEEK, top: "#2e9a86", topSh: "#1f6e60", topHi: "#5cc8b2", shoe: BLACK, shoeHi: "#6a6a6a" },
  {
    belly: true,
    eyes: [
      circle(13.5, 9, 3, OUT), circle(13.5, 9, 2.3, "#dff4ff"), circle(14.1, 9.2, 1, OUT),
      circle(19, 8.5, 3, OUT), circle(19, 8.5, 2.3, "#dff4ff"), circle(19.6, 8.7, 1, OUT),
      rect(15.5, 8.5, 1.5, 0.6 + 0.4, OUT), // glasses bridge
    ],
    face: [rect(15, 18.5, 0.6, 0.6, PINK_SH), rect(17, 19, 0.6, 0.6, PINK_SH), rect(19, 18.8, 0.6, 0.6, PINK_SH), rect(21, 18.2, 0.6, 0.6, PINK_SH), rect(16, 20, 0.6, 0.6, PINK_SH), rect(18.5, 20.2, 0.6, 0.6, PINK_SH)], // stubble
  },
);
const daddyPig: BossDef = {
  id: "daddy-pig",
  name: "Daddy Pig",
  rig: scaleRig(daddyGrid, "large", 2.4, 9.6, 0),
  collisionBox: { w: 36, h: 44 },
  stats: { HP: 80, AD: 5, AP: 0, ARM: 3, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 90,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 36, cooldown: 1.5 },
  pattern: ["jump", "charge"],
  phaseAt: 0.5,
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

const mummyPig: NpcDef = {
  id: "mummy-pig",
  name: "Mummy Pig",
  rig: (() => {
    const r = pigAdult(
      { skin: PINK, skinSh: PINK_SH, snout: SNOUT, cheek: CHEEK, top: "#e0602a", topSh: "#a8421a", topHi: "#ff8f5a", shoe: "#3a2a20", shoeHi: "#8a6a50" },
      { dress: true, face: [rect(17.5, 6, 2, 1, OUT), rect(19.5, 5.5, 1, 1, OUT)] }, // eyelashes
    );
    r.parts.torso.push(circle(12, 21.5, 0.8, WHITE), circle(14.5, 22.5, 0.8, WHITE), circle(17, 22.5, 0.8, WHITE), circle(19.5, 21.5, 0.8, WHITE)); // necklace
    return r;
  })(),
  lines: [
    { speaker: "Mummy Pig", text: "If you're going to jump in muddy puddles, Peppa, you must wear your boots!" },
    { speaker: "Mummy Pig", text: "Have fun splashing, and try not to get too muddy." },
  ],
};

const grandpaPig: NpcDef = {
  id: "grandpa-pig",
  name: "Grandpa Pig",
  rig: (() => {
    const r = pigAdult(
      { skin: PINK, skinSh: PINK_SH, snout: SNOUT, cheek: CHEEK, top: "#2a3f6a", topSh: "#1a2a4a", topHi: "#4a6aa0", shoe: BLACK, shoeHi: "#6a6a6a" },
      { ears: false, face: [rect(12, 6, 4, 1, "#f4f4f4"), rect(17.5, 5.5, 4, 1, "#f4f4f4")] }, // white eyebrows
    );
    r.parts.torso.push(rect(14, 22, 1.5, 1.5, "#e0b030"), rect(14, 26, 1.5, 1.5, "#e0b030"), rect(14, 30, 1.5, 1.5, "#e0b030")); // brass buttons
    r.parts.extras.push({ attachTo: "head", shapes: [rect(6, 0, 17, 5, OUT), rect(7, 0.5, 15, 4, "#f4f4f4"), rect(5, 4, 20, 2.5, OUT), rect(6, 4.5, 18, 1.5, "#1a2a4a"), rect(13, 1, 3, 2.5, "#e0b030")] }); // captain's hat
    return r;
  })(),
  lines: [
    { speaker: "Grandpa Pig", text: "Ahoy there, Peppa! The fields are full of puddles today." },
    { speaker: "Grandpa Pig", text: "When I was a boy, I was the best puddle jumper in the whole county!" },
  ],
};

// ---------------------------------------------------------------------------
// Props (rig pixels; a tile is 32 rig px)
// ---------------------------------------------------------------------------

const hillHouse: PropDef = (() => {
  const s: Shape[] = [rect(88, 2, 16, 4, "#7a3f12"), rect(90, 4, 12, 26, "#b5651d"), rect(90, 4, 3, 26, "#8a4a18")];
  for (let k = 0; k < 8; k++) {
    const w = 20 + k * 15;
    s.push(rect(64 - w / 2, 8 + k * 5, w, 5, "#d9342b"));
    if (k > 0) s.push(rect(64 - w / 2, 8 + k * 5, 6, 5, "#a8221c"), rect(64 + w / 2 - 14, 8 + k * 5, 6, 2, "#ef5a4a"));
  }
  s.push(circle(64, 34, 5, WHITE), circle(64, 34, 3.5, "#9fd8f7"));
  s.push(rect(12, 46, 104, 66, "#6b4a1a"), rect(14, 48, 100, 64, "#f6d34a"), rect(14, 48, 10, 64, "#d9ae2b"), rect(14, 48, 100, 3, "#d9ae2b"));
  const win = (x: number, y: number, w: number, h: number) =>
    s.push(rect(x - 2, y - 2, w + 4, h + 4, WHITE), rect(x, y, w, h, "#9fd8f7"), rect(x + w / 2 - 1, y, 2, h, WHITE), rect(x, y + h / 2 - 1, w, 2, WHITE));
  win(30, 58, 20, 14);
  win(78, 58, 20, 14);
  win(26, 84, 20, 16);
  win(82, 84, 20, 16);
  s.push(rect(52, 76, 24, 36, WHITE), rect(54, 78, 20, 34, "#8a5a2b"), rect(54, 78, 4, 34, "#6b4226"), circle(70, 95, 1.6, "#f2c230"), rect(10, 108, 108, 4, "#5fbf3a"));
  return { id: "hill-house", name: "Peppa's house on the hill", size: { w: 128, h: 112 }, shapes: s, layer: "back" as const };
})();

const lollipopTree: PropDef = {
  id: "lollipop-tree", name: "Round tree", size: { w: 48, h: 96 }, layer: "back",
  shapes: [rect(21, 44, 6, 52, "#8a5a2b"), rect(21, 44, 2, 52, "#6b4226"), circle(24, 24, 23, "#2f7a2a"), circle(24, 24, 21, "#4caf3a"), circle(20, 29, 13, "#3f9a32"), circle(28, 19, 10, "#6cc94e"), circle(31, 15, 4, "#8fe06a")],
};

const flowers: PropDef = {
  id: "flowers", name: "Flower clump", size: { w: 32, h: 16 }, layer: "front",
  shapes: [
    rect(4, 8, 1.5, 6, "#3f9a32"), rect(11, 6, 1.5, 8, "#3f9a32"), rect(19, 8, 1.5, 6, "#3f9a32"), rect(26, 7, 1.5, 7, "#3f9a32"),
    circle(5, 6, 2.5, "#ff6fa8"), circle(12, 4, 2.5, "#ffd23f"), circle(20, 6, 2.5, WHITE), circle(27, 5, 2.5, "#9b6bff"),
    circle(5, 6, 1, "#ffd23f"), circle(12, 4, 1, "#ff8a3a"), circle(20, 6, 1, "#ffd23f"), circle(27, 5, 1, "#ffd23f"),
    rect(0, 12, 32, 4, "#3f9a32"), rect(2, 11, 6, 2, "#5fbf3a"), rect(16, 11, 8, 2, "#5fbf3a"),
  ],
};

const fence: PropDef = {
  id: "fence", name: "Wooden fence", size: { w: 64, h: 24 }, layer: "back",
  shapes: [
    rect(0, 7, 64, 5, "#7a4a25"), rect(0, 15, 64, 5, "#7a4a25"), rect(0, 8, 64, 3, "#c08a52"), rect(0, 16, 64, 3, "#c08a52"),
    rect(2, 3, 6, 21, "#7a4a25"), rect(29, 3, 6, 21, "#7a4a25"), rect(56, 3, 6, 21, "#7a4a25"),
    rect(3, 2, 4, 21, "#d9a066"), rect(30, 2, 4, 21, "#d9a066"), rect(57, 2, 4, 21, "#d9a066"),
  ],
};

const familyCar: PropDef = {
  id: "family-car", name: "Red family car", size: { w: 96, h: 48 }, layer: "back",
  shapes: [
    rect(21, 5, 52, 20, "#5a1010"), rect(22, 6, 50, 18, "#d9342b"), rect(27, 10, 18, 12, "#9fd8f7"), rect(49, 10, 18, 12, "#9fd8f7"), rect(29, 11, 4, 2, WHITE),
    rect(3, 21, 90, 18, "#5a1010"), rect(4, 22, 88, 16, "#d9342b"), rect(8, 24, 80, 2, "#ef6a5a"), rect(4, 34, 88, 4, "#a8221c"), rect(47, 22, 1, 13, "#a8221c"),
    rect(88, 26, 4, 4, "#ffe680"), rect(4, 26, 3, 4, "#ff9a3a"), rect(52, 27, 6, 1.5, "#5a1010"),
    circle(24, 38, 9, "#222222"), circle(24, 38, 4, "#bbbbbb"), circle(72, 38, 9, "#222222"), circle(72, 38, 4, "#bbbbbb"),
  ],
};

const mudPuddle: PropDef = {
  id: "mud-puddle", name: "Muddy puddle", size: { w: 64, h: 8 }, layer: "back",
  shapes: [rect(8, 0, 48, 8, "#6b4423"), rect(2, 2, 60, 5, "#6b4423"), rect(0, 3, 64, 3, "#6b4423"), rect(12, 2, 40, 4, "#523218"), rect(20, 2, 10, 1, "#a07850"), rect(38, 4, 6, 1, "#a07850")],
};

const cloud: PropDef = {
  id: "cloud", name: "Cloud", size: { w: 80, h: 32 }, layer: "back",
  shapes: [circle(20, 20, 11, WHITE), circle(40, 15, 14, WHITE), circle(60, 20, 11, WHITE), rect(9, 20, 62, 11, WHITE), rect(9, 27, 62, 4, "#dfe9f5"), circle(36, 10, 4, "#f4f9ff")],
};

const props: PropDef[] = [hillHouse, lollipopTree, flowers, fence, familyCar, mudPuddle, cloud];

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const rooms: Room[] = [
  {
    id: "peppas-hill",
    name: "Peppa's Hill",
    objective: "Run down the hill to find some muddy puddles",
    isBossRoom: false,
    exit: { toRoom: "the-muddy-fields" },
    layout: buildLayout(66, [
      ["put", "S", 2, 11],
      ["put", "a", 5, 11], // Mummy Pig
      ["pillar", 8, 3, 1],
      ["pillar", 11, 3, 2],
      ["pillar", 14, 4, 3],
      ["pillar", 18, 3, 2],
      ["pillar", 21, 3, 1],
      ["put", "1", 26, 11],
      ["gap", 29, 30],
      ["plat", 9, 33, 37],
      ["put", "4", 38, 11],
      ["put", "C", 40, 11],
      ["spikes", 43, 44],
      ["put", "2", 47, 11],
      ["pillar", 50, 3, 1],
      ["pillar", 53, 3, 2],
      ["pillar", 56, 2, 1],
      ["gap", 59, 61],
      ["put", "E", 63, 11],
    ]),
    props: [
      { prop: "cloud", col: 4, row: 2 },
      { prop: "cloud", col: 30, row: 1 },
      { prop: "hill-house", col: 14, row: 8 }, // on top of the hill
      { prop: "family-car", col: 18, row: 9 },
      { prop: "flowers", col: 9, row: 10 },
      { prop: "flowers", col: 21, row: 10 },
      { prop: "lollipop-tree", col: 24, row: 11 },
      { prop: "fence", col: 34, row: 11 },
      { prop: "mud-puddle", col: 41, row: 11 },
      { prop: "lollipop-tree", col: 48, row: 11 },
    ],
  },
  {
    id: "the-muddy-fields",
    name: "The Muddy Fields",
    objective: "Splash across the muddy fields",
    isBossRoom: false,
    exit: { toRoom: "the-biggest-muddy-puddle" },
    layout: buildLayout(70, [
      ["put", "S", 2, 11],
      ["put", "b", 4, 11], // Grandpa Pig
      ["plat", 9, 7, 11],
      ["put", "3", 14, 11],
      ["gap", 17, 19],
      ["pillar", 22, 4, 2],
      ["plat", 7, 26, 30],
      ["put", "1", 32, 11],
      ["put", "C", 35, 11],
      ["spikes", 38, 39],
      ["gap", 42, 44],
      ["put", "4", 46, 11],
      ["pillar", 47, 3, 1],
      ["pillar", 50, 3, 2],
      ["pillar", 53, 3, 3],
      ["pillar", 56, 2, 1],
      ["put", "2", 60, 11],
      ["put", "E", 67, 11],
    ]),
    props: [
      { prop: "lollipop-tree", col: 0, row: 11 },
      { prop: "mud-puddle", col: 9, row: 11 },
      { prop: "cloud", col: 10, row: 2 },
      { prop: "lollipop-tree", col: 20, row: 11 },
      { prop: "mud-puddle", col: 27, row: 11 },
      { prop: "fence", col: 36, row: 11 },
      { prop: "cloud", col: 40, row: 1 },
      { prop: "mud-puddle", col: 45, row: 11 },
      { prop: "flowers", col: 58, row: 11 },
      { prop: "lollipop-tree", col: 64, row: 11 },
    ],
  },
  {
    id: "the-biggest-muddy-puddle",
    name: "The Biggest Muddy Puddle",
    objective: "Win the jumping contest against Daddy Pig",
    isBossRoom: true,
    exit: { toRoom: "END" },
    layout: buildLayout(44, [
      ["put", "S", 2, 11],
      ["plat", 9, 8, 12],
      ["plat", 6, 15, 19],
      ["plat", 9, 22, 26],
      ["spikes", 29, 29],
      ["plat", 8, 30, 33],
      ["put", "B", 38, 11],
    ]),
    props: [
      { prop: "lollipop-tree", col: 0, row: 11 },
      { prop: "flowers", col: 4, row: 11 },
      { prop: "cloud", col: 6, row: 1 },
      { prop: "lollipop-tree", col: 13, row: 11 },
      { prop: "fence", col: 20, row: 11 },
      { prop: "cloud", col: 26, row: 2 },
      { prop: "mud-puddle", col: 36, row: 11 },
      { prop: "mud-puddle", col: 40, row: 11 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cartridge
// ---------------------------------------------------------------------------

const cartridge: Cartridge = {
  id: "peppa-muddy-puddles",
  schemaVersion: 1,
  status: "ready",
  source: {
    title: "Peppa Pig",
    medium: "tv",
    versionOrEpisode: "Series 1 Episode 1: Muddy Puddles",
    requestedCharacter: "Peppa",
  },
  character: peppa,
  world: {
    id: "peppa-muddy-puddles",
    name: "Peppa Pig: Muddy Puddles",
    source: "Peppa Pig",
    visualStyle: {
      palette: { sky: "#3fa9f5", skyBottom: "#a8dcff", ground: "#4fae35", groundTop: "#8ee04a", platform: "#a0703a", accent: "#7a4a1f" },
      backdrop: "hills",
    },
    enemies: [george, suzy, danny, rebecca],
    boss: daddyPig,
    npcs: [mummyPig, grandpaPig],
    props,
    rooms,
    dialogue: {
      roomIntro: [
        [
          { speaker: "Peppa", text: "It stopped raining! Can I go out and play, please?" },
          { speaker: "Peppa", text: "George, stop following me! ...Okay, you can come." },
        ],
        [
          { speaker: "Peppa", text: "Muddy puddles everywhere! I love jumping in muddy puddles!" },
          { speaker: "Suzy Sheep", text: "Peppa! Wait for me! Sheep can jump too!" },
        ],
        [{ speaker: "Peppa", text: "That's the biggest muddy puddle in the whole world!" }],
      ],
      bossIntro: [
        { speaker: "Daddy Pig", text: "Ho ho! I happen to be an expert at jumping in muddy puddles." },
        { speaker: "Peppa", text: "Daddy! Let's see who makes the biggest splash!" },
      ],
      bossDefeated: [
        { speaker: "Daddy Pig", text: "Oh dear. I'm covered in mud! Ho ho ho!" },
        { speaker: "Peppa", text: "Everyone loves jumping in muddy puddles! *snort*" },
      ],
      playerDefeated: [
        { speaker: "Peppa", text: "Waaah! I'm all muddy and it's not fun anymore!" },
        { speaker: "Daddy Pig", text: "Never mind, Peppa. Let's have a bath and try again." },
      ],
    },
  },
  notes: {
    sourceFacts: [
      "'Muddy Puddles' is the first episode of Peppa Pig series 1.",
      "Peppa and her little brother George love jumping up and down in muddy puddles.",
      "Peppa wears a red dress; George carries his toy, Mr. Dinosaur.",
      "In the episode Daddy Pig joins in jumping in the puddles and everyone ends up muddy.",
      "Suzy Sheep, Danny Dog and Rebecca Rabbit are Peppa's friends from the series.",
      "Mummy Pig tells Peppa and George to put on their boots before jumping in muddy puddles.",
      "Grandpa Pig is Peppa's grandfather; he loves boats and sailing.",
      "Peppa's family lives in a house on top of a hill and drives a red car.",
    ],
    designChoices: [
      "Rigs are simplified fan-style pixel versions of the cast in their iconic colours (Peppa's red dress, George's blue top, Daddy Pig's glasses and teal shirt).",
      "Daddy Pig is the boss: his big puddle jump in the episode became a jump-and-charge boss fight. He has glasses, stubble dots and a round belly.",
      "George, Suzy Sheep, Danny Dog and Rebecca Rabbit are playful 'enemies'; Suzy, Danny and Rebecca are not in this episode.",
      "Rebecca Rabbit is a jumper at civilian tier (HP 12, AD 1) in a green knitted jumper.",
      "Mummy Pig (room 1) and Grandpa Pig (room 2, captain's hat) are friendly NPCs; Grandpa being out in the fields is a design choice.",
      "Scenery props: the family house on top of the hill with the red car beside it, round trees, flower clumps, fences, muddy puddles and clouds.",
      "Spikes stand in for prickly thistles in the grass (the engine has only spikes as a hazard).",
      "Room order Peppa's Hill -> The Muddy Fields -> The Biggest Muddy Puddle is invented for the game.",
      "Push, Muddy Splash and Giggle Fit are invented abilities based on Peppa's playground behaviour.",
      "Danny Dog's orange top and Suzy's purple dress are simplified colour choices for tiny sprites.",
    ],
  },
  createdAt: "2026-11-21T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Validate, cross-check traversal without abilities, write
// ---------------------------------------------------------------------------

/** Peppa with Big Jump swapped for a plain push, so only walking and normal jumps count. */
const peppaNoAbilities: CharacterDef = {
  ...peppa,
  abilities: [peppa.abilities[0], peppa.abilities[1], { ...peppa.abilities[0], id: "no-jump", slot: 3 }, peppa.abilities[3]],
};

const problems = validateCartridge(cartridge);
for (const room of cartridge.world.rooms) {
  const target = room.isBossRoom ? "B" : "E";
  if (!canReach(room, peppaNoAbilities, target)) problems.push(`room ${room.id}: Peppa (no abilities) cannot reach "${target}"`);
}
for (const room of cartridge.world.rooms) {
  console.log(`\n${room.id} (${room.layout[0].length} wide)`);
  for (const row of room.layout) console.log("  " + row);
}
if (problems.length) {
  console.error(`\nâœ— peppa-muddy-puddles\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const out = fileURLToPath(new URL("../../content/peppa-muddy-puddles.json", import.meta.url));
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`\nâœ“ wrote ${out}`);
