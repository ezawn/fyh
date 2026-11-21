/**
 * Builds the hand-finished demo cartridge content/dragon-ball-ep1-goku.json.
 * Run: npx tsx scripts/content/dragon-ball.ts
 *
 * Rigs and props are drawn on the 2x canvas (RIG_SIZES in rig pixels, shown at RIG_SCALE 0.5).
 * Every rig faces right. Arms hang from the shoulder pivot, legs from the hip pivot.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROOM_ROWS, type BossDef, type Cartridge, type CharacterDef, type EnemyDef, type NpcDef, type PropDef, type Rig, type Room, type Shape, type SizeClass, type PowerTier } from "../../src/shared/schema";
import { canReach, validateCartridge } from "../../src/shared/validate";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number, color: string): Shape => ({ type: "rect", x, y, w, h, color });
const circle = (x: number, y: number, r: number, color: string): Shape => ({ type: "circle", x, y, r, color });

/** Shared dark outline colour: a slightly larger dark shape is layered behind key parts. */
const OUT = "#1c140e";
const WHITE = "#ffffff";

/** Scale a rig drawn on a small design grid up to its real canvas (outlines scale with it). */
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
      head: sc(p.head),
      torso: sc(p.torso),
      armFront: sc(p.armFront),
      armBack: sc(p.armBack),
      legFront: sc(p.legFront),
      legBack: sc(p.legBack),
      extras: p.extras.map((e) => ({ attachTo: e.attachTo, shapes: sc(e.shapes) })),
    },
    pivots: { neck: pt(rig.pivots.neck), shoulder: pt(rig.pivots.shoulder), hip: pt(rig.pivots.hip) },
  };
}

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
// Shared human body (32x64 canvas): torso, arms from shoulder (16,24), legs from hip (16,41)
// ---------------------------------------------------------------------------

type BodyColours = {
  skin: string; skinSh: string;
  top: string; topSh: string; topHi: string;
  pants: string; pantsSh: string; pantsHi: string;
  boot: string; bootSh: string; lace: string; cuff: string;
};

function humanBody(c: BodyColours) {
  return {
    torso: [
      rect(15, 19, 4, 4, c.skinSh), // neck
      rect(9, 22, 15, 19, OUT),
      rect(10, 23, 13, 17, c.top),
      rect(10, 23, 3, 17, c.topSh),
      rect(19, 24, 2, 10, c.topHi),
    ],
    armBack: [
      rect(10, 23, 7, 16, OUT),
      circle(13.5, 40, 3.5, OUT),
      rect(11, 24, 5, 8, c.topSh),
      rect(11, 32, 5, 5, c.skinSh),
      rect(11, 36, 5, 2, c.cuff),
      circle(13.5, 40, 2.5, c.skinSh),
    ],
    armFront: [
      rect(15, 23, 7, 16, OUT),
      circle(18.5, 40, 3.5, OUT),
      rect(16, 24, 5, 8, c.top),
      rect(16, 24, 1, 8, c.topSh),
      rect(16, 32, 5, 5, c.skin),
      rect(16, 36, 5, 2, c.cuff),
      circle(18.5, 40, 2.5, c.skin),
      rect(19, 39, 1, 2, c.skinSh), // fingers
    ],
    legBack: [
      rect(10, 40, 7, 15, OUT),
      rect(11, 41, 5, 14, c.pantsSh),
      rect(9, 54, 9, 10, OUT),
      rect(10, 55, 7, 8, c.bootSh),
    ],
    legFront: [
      rect(15, 40, 7, 15, OUT),
      rect(16, 41, 5, 14, c.pants),
      rect(19, 42, 1, 11, c.pantsHi),
      rect(15, 54, 11, 10, OUT),
      rect(16, 55, 9, 8, c.boot),
      rect(17, 56, 5, 1, c.lace),
      rect(17, 58, 5, 1, c.lace),
      rect(16, 61, 9, 2, c.bootSh), // sole
    ],
  };
}

const HUMAN_PIVOTS = { neck: [17, 21] as [number, number], shoulder: [16, 24] as [number, number], hip: [16, 41] as [number, number] };

// ---------------------------------------------------------------------------
// Character: Goku (iconic) -- an original, simplified martial-artist design
// ---------------------------------------------------------------------------

const SKIN = "#f2c08f";
const SKIN_SH = "#d8966a";
const HAIR = "#22180f";
const HAIR_HI = "#4a3624";
const GI = "#f28c28";
const GI_SH = "#c4621a";
const GI_HI = "#ffb35c";
const SASH = "#2a56b8";
const SASH_SH = "#1b3a80";
const BAND = "#d33a2c";
const BOOT = "#1f2f6b";
const WRAP = "#2a56b8";

const gokuBody = humanBody({
  skin: SKIN, skinSh: SKIN_SH,
  top: GI, topSh: GI_SH, topHi: GI_HI,
  pants: GI, pantsSh: GI_SH, pantsHi: GI_HI,
  boot: BOOT, bootSh: "#141e48", lace: "#e8c060", cuff: WRAP,
});

const goku: CharacterDef = {
  id: "goku",
  name: "Goku",
  source: "Dragon Ball",
  versionOrEpisode: "Iconic (Kamehameha, Instant Transmission, Power Pole)",
  assumptions: [
    "Uses the iconic adult Goku (Kamehameha, Instant Transmission, Power Pole), not the episode-1 kid Goku.",
    "Planet-level on the reference scale: iconic Goku fights at planet-busting levels (Frieza-era and beyond), so he is the planet-level anchor.",
    "Stats are exactly the planet-level anchor (HP 10000, AD 1000, AP 1000, ARM 800, MR 800).",
    "Martial-arts hits are physical (AD); ki attacks (Ki Blast, Kamehameha) are magic damage with the ENERGY tag (AP).",
    "Small flat penetration (100) reflects his training to strike through guards and ki defences.",
    "Movement slot is Instant Transmission (teleport mechanic). The Flying Nimbus was dropped by team decision, so canFly is false and he has no FLIGHT tag.",
    "The Power Pole is a visual/flavour reference only; the engine has no extending-staff mechanic.",
  ],
  rig: {
    sizeClass: "human",
    parts: {
      head: [
        circle(17, 13, 9, OUT),
        circle(17, 13, 8, SKIN),
        circle(12.5, 15, 2.5, SKIN_SH), // ear
        rect(19, 12, 4, 4, WHITE), // eye white
        rect(21, 13, 2, 3, OUT), // pupil
        rect(18, 11, 5, 1, HAIR), // eyebrow
        rect(24, 14, 2, 2, SKIN_SH), // nose
        rect(19, 18, 4, 1, "#8a3b2a"), // grin
        rect(23, 17, 1, 1, "#8a3b2a"),
      ],
      ...gokuBody,
      torso: [
        ...gokuBody.torso,
        rect(15, 23, 4, 3, SASH), // blue undershirt in the V collar
        rect(16, 26, 2, 2, SASH),
        rect(14, 23, 1, 5, GI_SH),
        rect(10, 34, 13, 3, SASH), // sash belt
        rect(10, 36, 13, 1, SASH_SH),
        rect(20, 35, 3, 6, SASH), // knot tails
        rect(21, 35, 2, 2, SASH_SH),
      ],
      extras: [
        {
          attachTo: "head",
          shapes: [
            rect(8, 4, 18, 5, HAIR), // crown
            rect(7, 6, 5, 11, HAIR), // back of the head
            rect(5, 5, 3, 4, HAIR), // tufts
            rect(9, 1, 4, 4, HAIR),
            rect(14, 0, 4, 5, HAIR),
            rect(19, 1, 4, 4, HAIR),
            rect(23, 3, 4, 4, HAIR),
            rect(14, 1, 2, 3, HAIR_HI), // highlights
            rect(10, 5, 6, 1, HAIR_HI),
            rect(19, 5, 5, 1, HAIR_HI),
            rect(1, 2, 7, 4, HAIR), // big spikes out to the sides
            rect(0, 6, 6, 4, HAIR),
            rect(2, 10, 5, 4, HAIR),
            rect(25, 0, 5, 5, HAIR),
            rect(27, 5, 5, 3, HAIR),
            rect(10, 0, 3, 2, HAIR),
            rect(2, 3, 4, 1, HAIR_HI),
            rect(26, 1, 3, 1, HAIR_HI),
          ],
        },
      ],
    },
    pivots: HUMAN_PIVOTS,
  },
  collisionBox: { w: 12, h: 30 },
  movement: { speed: 220, jumpStrength: 520, canFly: false },
  stats: { HP: 10000, AD: 1000, AP: 1000, ARM: 800, MR: 800, ARM_PEN: 100, MAGIC_PEN: 100 },
  tags: [],
  abilities: [
    { id: "punch", name: "Punch", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 24, cooldown: 0.3, duration: 0, knockback: 200, animation: "punch" },
    { id: "ki-blast", name: "Ki Blast", slot: 2, mechanic: "projectile", damageType: "magic", attackTags: ["ENERGY"], ratio: 1.2, range: 300, cooldown: 0.6, duration: 0, projectileSpeed: 500, knockback: 150, animation: "cast" },
    { id: "instant-transmission", name: "Instant Transmission", slot: 3, mechanic: "teleport", damageType: "physical", attackTags: [], ratio: 0, range: 160, cooldown: 3, duration: 0, knockback: 0, animation: "cast" },
    { id: "kamehameha", name: "Kamehameha", slot: 4, mechanic: "beam", damageType: "magic", attackTags: ["ENERGY"], ratio: 4, range: 380, cooldown: 8, duration: 0.6, knockback: 600, animation: "beam" },
  ],
};

// ---------------------------------------------------------------------------
// Four-legged animals (small 32x40): front legs hang from the shoulder, back legs from the hip
// ---------------------------------------------------------------------------

type QuadColours = { base: string; dark: string; light: string; eye: string };

function quadruped(c: QuadColours, opts: { stripes?: Shape[]; fangs?: boolean; tail: Shape[] }): Rig {
  const leg = (x: number, col: string, paw: string): Shape[] => [rect(x - 1, 25, 5, 13, OUT), rect(x, 26, 3, 10, col), rect(x - 1, 35, 5, 3, OUT), rect(x - 0.5, 35.5, 4, 2, paw)];
  return {
    sizeClass: "small",
    parts: {
      head: [
        rect(17, 6, 5, 6, OUT), // ears, behind the head
        rect(18, 7, 3, 4, c.dark),
        rect(22, 5, 5, 6, OUT),
        rect(23, 6, 3, 4, c.dark),
        circle(23, 15, 7, OUT),
        circle(23, 15, 6, c.base),
        circle(21, 12, 2.5, c.light), // brow highlight
        rect(26, 14, 5.5, 5.5, OUT), // muzzle
        rect(27, 15, 4, 3.5, c.light),
        rect(29.5, 14.2, 2, 2, OUT), // nose
        rect(23, 11, 3, 3, WHITE), // eye
        rect(24, 11.5, 2, 2, c.eye),
        rect(25, 12, 1, 1, OUT),
        rect(22.5, 10, 4, 1, c.dark), // brow
        rect(27, 18.5, 4, 1, OUT), // mouth
        ...(opts.fangs ? [rect(27.5, 19, 1.2, 3, "#f4f0e0"), rect(29.5, 19, 1.2, 3, "#f4f0e0")] : []),
      ],
      torso: [rect(2, 15, 21, 13, OUT), rect(3, 16, 19, 11, c.base), rect(3, 16, 19, 3, c.dark), rect(6, 24, 13, 3, c.light), ...(opts.stripes ?? [])],
      armFront: leg(19, c.base, c.light),
      armBack: leg(16, c.dark, c.dark),
      legFront: leg(7, c.base, c.light),
      legBack: leg(4, c.dark, c.dark),
      extras: [{ attachTo: "torso", shapes: opts.tail }],
    },
    pivots: { neck: [21, 16], shoulder: [18, 26], hip: [6, 26] },
  };
}

// ---------------------------------------------------------------------------
// Enemies and boss
// ---------------------------------------------------------------------------

const WOLF = { base: "#7a7a85", dark: "#4f4f5a", light: "#c9c9cf", eye: "#e8d23a" };
const wolf: EnemyDef = {
  id: "mountain-wolf",
  name: "Mountain Wolf",
  rig: quadruped(WOLF, { tail: [rect(0, 12, 6, 6, OUT), rect(0.5, 13, 5, 4, WOLF.base), rect(0.5, 13, 2, 2, WOLF.light)] }),
  collisionBox: { w: 14, h: 12 },
  stats: { HP: 60, AD: 15, AP: 0, ARM: 5, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 120,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 18, cooldown: 1 },
};

const PT = "#b5651d";
const PT_D = "#7a3f12";
const PT_L = "#e8b070";
const BEAK = "#e8c070";
const BEAK_D = "#b8903a";
const pterodactyl: EnemyDef = {
  id: "pterodactyl",
  name: "Pterodactyl",
  rig: {
    sizeClass: "small",
    parts: {
      head: [
        rect(11, 12, 10, 4, OUT), // crest
        rect(12, 13, 8, 2, PT_D),
        circle(23, 17, 5, OUT),
        circle(23, 17, 4, PT),
        rect(25.5, 15.5, 6.5, 5, OUT), // beak
        rect(26, 16, 5.5, 2.5, BEAK),
        rect(26, 18.5, 4.5, 1.5, BEAK_D),
        circle(23.5, 15.5, 1.6, WHITE),
        circle(24.1, 15.7, 0.8, OUT),
      ],
      torso: [rect(9, 20, 14, 9, OUT), rect(10, 21, 12, 7, PT), rect(10, 21, 12, 2, PT_D), rect(12, 25, 9, 3, PT_L)],
      armFront: [rect(4, 16, 13, 7, OUT), rect(5, 17, 11, 5, "#c9783a"), rect(5, 17, 11, 1, PT_D), rect(3, 14, 3, 3, BEAK)],
      armBack: [rect(0, 11, 16, 7, OUT), rect(1, 12, 14, 5, "#8a4a1a"), rect(1, 12, 14, 1, PT_D)],
      legFront: [rect(16, 28, 2, 5, BEAK), rect(15, 32, 5, 1.5, BEAK)],
      legBack: [rect(12, 28, 2, 5, BEAK_D), rect(11, 32, 4, 1.5, BEAK_D)],
      extras: [{ attachTo: "torso", shapes: [rect(3, 23, 7, 2, PT_D), rect(1, 22, 3, 3, PT_D)] }],
    },
    pivots: { neck: [21, 21], shoulder: [15, 21], hip: [15, 28] },
  },
  collisionBox: { w: 14, h: 10 },
  stats: { HP: 50, AD: 12, AP: 0, ARM: 3, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "flyer",
  speed: 100,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 16, cooldown: 1.2 },
};

const TIGER = { base: "#e08a2a", dark: "#b4661a", light: "#f4ead0", eye: "#7ac943" };
const STRIPE = "#3a2410";
const sabreTooth: EnemyDef = {
  id: "sabre-tooth-tiger",
  name: "Sabre-tooth Tiger",
  rig: quadruped(TIGER, {
    fangs: true,
    stripes: [rect(7, 16, 1.5, 6, STRIPE), rect(11, 16, 1.5, 7, STRIPE), rect(15, 16, 1.5, 6, STRIPE), rect(19, 16, 1.5, 5, STRIPE)],
    tail: [rect(0, 13, 5, 3, OUT), rect(0.5, 13.5, 4, 2, TIGER.base), rect(1, 13.5, 1, 2, STRIPE)],
  }),
  collisionBox: { w: 14, h: 12 },
  stats: { HP: 120, AD: 30, AP: 0, ARM: 10, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 140,
  attack: { damageType: "physical", ratio: 1.2, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.1 },
};

/** Adult pig figure on the small 32x40 canvas (also used for Oolong). */
type PigColours = { skin: string; skinSh: string; snout: string; cheek: string; top: string; topSh: string; topHi: string; shoe: string; shoeHi: string };
function pigAdult(c: PigColours, face: Shape[] = []): Rig {
  return {
    sizeClass: "small",
    parts: {
      head: [
        rect(7, 0, 6, 6, OUT), // ears
        rect(8, 1, 4, 4, c.skin),
        rect(9, 2, 2, 2, c.skinSh),
        rect(14, 0, 6, 6, OUT),
        rect(15, 1, 4, 4, c.skin),
        rect(16, 2, 2, 2, c.skinSh),
        circle(15, 11, 10, OUT),
        circle(15, 11, 9, c.skin),
        circle(24, 13, 5, OUT), // snout
        circle(24, 13, 4, c.snout),
        rect(22, 11.5, 1, 2.5, c.skinSh),
        rect(25, 11.5, 1, 2.5, c.skinSh),
        circle(13.5, 9, 2.2, WHITE),
        circle(14.2, 9.2, 1.1, OUT),
        circle(19, 8.5, 2.2, WHITE),
        circle(19.7, 8.7, 1.1, OUT),
        circle(11, 14.5, 2, c.cheek),
        rect(17, 17, 4, 1, c.skinSh),
        ...face,
      ],
      torso: [rect(6, 20, 19, 14, OUT), rect(7, 21, 17, 12, c.top), rect(7, 21, 4, 12, c.topSh), rect(19, 22, 2, 9, c.topHi)],
      armBack: [rect(8, 21, 5, 11, OUT), rect(9, 22, 3, 9, c.skinSh), rect(9, 22, 3, 4, c.topSh), circle(10.5, 32, 2, c.skinSh)],
      armFront: [rect(17, 21, 5, 11, OUT), circle(19.5, 32, 3, OUT), rect(18, 22, 3, 9, c.skin), rect(18, 22, 3, 4, c.top), circle(19.5, 32, 2, c.skin)],
      legBack: [rect(9, 32, 6, 5, OUT), rect(10, 33, 4, 4, c.skinSh), rect(8, 35, 8, 5, OUT), rect(9, 36, 6, 3.5, c.shoe)],
      legFront: [rect(15, 32, 6, 5, OUT), rect(16, 33, 4, 4, c.skin), rect(14, 35, 9, 5, OUT), rect(15, 36, 7, 3.5, c.shoe), rect(19, 36.5, 2, 1, c.shoeHi)],
      extras: [{ attachTo: "torso", shapes: [circle(4.5, 24, 2, c.skinSh), circle(4.5, 24, 0.9, c.top)] }],
    },
    pivots: { neck: [15, 21], shoulder: [15, 23], hip: [15, 33] },
  };
}

const oolong: EnemyDef = {
  id: "oolong",
  name: "Oolong",
  rig: (() => {
    const r = pigAdult(
      { skin: "#f0b0b8", skinSh: "#c98890", snout: "#f6c6cc", cheek: "#e88a98", top: "#3f8f4a", topSh: "#2a6633", topHi: "#6cc077", shoe: "#2a2a2a", shoeHi: "#7a7a7a" },
      [rect(12, 5.5, 4, 1.2, OUT), rect(17.5, 5, 4, 1.2, OUT)], // scheming eyebrows
    );
    // A shifty trickster's cap and a puff of shape-shifting smoke
    r.parts.extras.push({ attachTo: "head", shapes: [rect(6, 1, 16, 4, OUT), rect(7, 1.5, 14, 3, "#3d3d4a"), rect(19, 3.5, 7, 2, "#3d3d4a"), rect(12, 2, 4, 1, "#6a6a7a")] });
    r.parts.extras.push({ attachTo: "armFront", shapes: [circle(25, 30, 2.5, "#e6e0f2"), circle(28, 28, 2, "#f4f0fa"), circle(27, 32.5, 1.5, "#d6cfe6")] });
    r.parts.torso.push(rect(14, 21, 3, 12, "#f2c230"), rect(14.5, 25, 2, 1, "#c48a1e"), rect(14.5, 29, 2, 1, "#c48a1e")); // vest buttons strip
    return r;
  })(),
  collisionBox: { w: 12, h: 18 },
  stats: { HP: 40, AD: 6, AP: 0, ARM: 2, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 90,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 16, cooldown: 1.2 },
};

// Bear Thief: drawn on a 48x48 grid and scaled 2x onto the 96x96 "large" canvas.
const FUR = "#7a4a25";
const FUR_D = "#4e2e15";
const FUR_HI = "#9a6236";
const MUZ = "#d9b58a";
const VEST = "#7a2a2a";
const VEST_D = "#4f1a1a";
const STEEL = "#c8ccd6";
const GOLD = "#e0b030";
const bearGrid: Rig = {
  sizeClass: "large",
  parts: {
    head: [
      circle(19.5, 5, 3.6, OUT), // ears
      circle(19.5, 5, 2.8, FUR),
      circle(19.5, 5, 1.4, FUR_D),
      circle(31.5, 4, 3.6, OUT),
      circle(31.5, 4, 2.8, FUR),
      circle(31.5, 4, 1.4, FUR_D),
      circle(26, 12, 9.5, OUT),
      circle(26, 12, 8.5, FUR),
      circle(23.5, 8, 3, FUR_HI),
      rect(21, 7, 1, 6, "#b0504a"), // old scar
      circle(32, 15, 4.2, MUZ), // muzzle
      circle(35.2, 13.4, 1.8, OUT), // nose
      circle(34.7, 12.8, 0.5, "#8a8a8a"),
      rect(30.5, 18.3, 4, 1, OUT), // mouth
      circle(29, 9.5, 2, WHITE), // eye
      circle(29.8, 9.8, 1.1, OUT),
      rect(27, 6.4, 5, 1.2, FUR_D), // angry brow
    ],
    torso: [
      rect(15, 19, 21, 17, OUT),
      rect(16, 20, 19, 15, FUR),
      rect(16, 20, 4, 15, FUR_D),
      rect(23, 23, 9, 10, MUZ), // belly
      rect(16, 20, 7, 13, VEST), // open vest
      rect(16, 20, 2, 13, VEST_D),
      rect(22, 20, 1, 13, VEST_D),
      rect(32, 20, 3, 13, VEST),
      rect(16, 31, 19, 3, "#3a2a1a"), // belt
      rect(25, 30.5, 4, 4, GOLD),
      rect(26, 31.5, 2, 2, "#3a2a1a"),
    ],
    armBack: [rect(16, 20, 8, 15, OUT), rect(17, 21, 6, 13, FUR_D), circle(20, 34.5, 3.4, OUT), circle(20, 34.5, 2.6, FUR_D)],
    armFront: [rect(26, 21, 8, 13, OUT), rect(27, 22, 6, 11, FUR), rect(31, 22, 2, 9, FUR_HI), rect(28, 30, 13, 6, OUT), rect(29, 31, 11, 4, FUR)],
    legBack: [rect(16, 34, 9, 10, OUT), rect(17, 35, 7, 8, "#4a3a2a"), rect(15, 42, 11, 5.5, OUT), rect(16, 43, 9, 4, FUR_D)],
    legFront: [
      rect(25, 34, 9, 10, OUT),
      rect(26, 35, 7, 8, "#6a5238"),
      rect(27, 37, 3, 3, "#8a7050"), // patch on the trousers
      rect(25, 42, 13, 5.5, OUT),
      rect(26, 43, 11, 4, FUR),
      rect(34.5, 45.5, 1, 1, "#f4f0e0"), // claws
      rect(36.5, 45.5, 1, 1, "#f4f0e0"),
    ],
    extras: [
      // Big sword held upright off to the side (well clear of the face), gripped in the front paw
      {
        attachTo: "armFront",
        shapes: [
          rect(38.5, 3.5, 3, 25, OUT),
          rect(39, 4, 2, 24, STEEL),
          rect(40.3, 4, 0.7, 24, "#f2f4f8"),
          rect(39.3, 2.5, 1.4, 1.5, STEEL), // tip
          rect(35, 28, 10, 2, GOLD), // guard
          rect(38.8, 30, 2.4, 7, "#5a3418"), // grip
          circle(40, 37.5, 1.2, GOLD), // pommel
          circle(40, 33, 3.4, OUT), // paw over the grip
          circle(40, 33, 2.6, FUR),
        ],
      },
    ],
  },
  pivots: { neck: [26, 20], shoulder: [27, 22], hip: [25, 35] },
};

const bearThief: BossDef = {
  id: "bear-thief",
  name: "Bear Thief",
  rig: scaleRig(bearGrid, "large", 2, 0, 0),
  collisionBox: { w: 36, h: 44 },
  stats: { HP: 600, AD: 80, AP: 0, ARM: 40, MR: 10, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 110,
  attack: { damageType: "physical", ratio: 1.5, attackTags: ["PHYSICAL"], range: 40, cooldown: 1.5 },
  pattern: ["charge", "jump"],
  phaseAt: 0.4,
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

const B_HAIR = "#2fb8b0";
const B_HAIR_HI = "#7fe0d8";
const JUMP = "#f06aa8";
const JUMP_SH = "#c2487f";
const bulmaBody = humanBody({
  skin: SKIN, skinSh: SKIN_SH,
  top: JUMP, topSh: JUMP_SH, topHi: "#ff9fcb",
  pants: JUMP, pantsSh: JUMP_SH, pantsHi: "#ff9fcb",
  boot: "#3c5a8c", bootSh: "#263d63", lace: "#e8eef8", cuff: "#33302c",
});
const bulma: NpcDef = {
  id: "bulma",
  name: "Bulma",
  rig: {
    sizeClass: "human",
    parts: {
      head: [
        circle(17, 13, 9, OUT),
        circle(17, 13, 8, SKIN),
        circle(12.5, 15, 2.5, SKIN_SH),
        rect(19, 12, 4, 4, WHITE),
        rect(21, 13, 2, 3, "#3a6bd6"), // blue iris
        rect(22, 13, 1, 2, OUT),
        rect(18.5, 11, 5, 1, OUT), // lashes
        rect(23, 10.5, 1.5, 1, OUT),
        rect(24, 14, 2, 2, SKIN_SH),
        rect(19.5, 18, 3, 1, "#d9605a"),
        circle(17, 16.5, 1.5, "#f2a090"),
      ],
      ...bulmaBody,
      torso: [
        ...bulmaBody.torso,
        rect(16, 24, 1, 10, JUMP_SH), // zip
        rect(18, 27, 4, 2.5, "#33302c"), // name patch on the chest
        rect(10, 34, 13, 2.5, "#5a4636"), // tool belt
        rect(11, 35, 4, 4, "#7a6248"),
      ],
      extras: [
        {
          attachTo: "head",
          shapes: [
            circle(6, 8, 3.5, B_HAIR), // ponytail
            rect(2, 10, 4, 9, B_HAIR),
            rect(2.5, 12, 1, 6, B_HAIR_HI),
            rect(4, 9, 4, 2, "#e03a6a"), // hair tie
            rect(8, 3, 18, 6, B_HAIR),
            rect(7, 5, 6, 13, B_HAIR),
            rect(19, 6, 7, 3, B_HAIR), // fringe
            rect(22, 8, 4, 3, B_HAIR),
            rect(9, 4, 6, 1, B_HAIR_HI),
            rect(17, 4, 6, 1, B_HAIR_HI),
            rect(10, 5, 14, 1.5, "#33302c"), // goggles pushed up
            circle(20, 5.5, 2.6, "#33302c"),
            circle(20, 5.5, 1.7, "#5bc0eb"),
            circle(19.4, 5, 0.6, WHITE),
          ],
        },
        // Handheld tracker (the "Dragon Radar" idea) in her front hand
        { attachTo: "armFront", shapes: [rect(18, 36, 8, 7, OUT), rect(19, 37, 6, 5, "#8a8f99"), rect(20, 38, 4, 3, "#2a6a3a"), circle(22.5, 39.5, 0.8, "#7dff9a")] },
      ],
    },
    pivots: HUMAN_PIVOTS,
  },
  lines: [
    { speaker: "Bulma", text: "Hey! That orange ball with stars in it is a Dragon Ball. Gather all seven and you get a wish!" },
    { speaker: "Bulma", text: "My Dragon Radar says another one is past the forest. Let's go together!" },
  ],
};

const SHELL = "#4f7a3a";
const SHELL_D = "#355a26";
const T_SKIN = "#8fc27a";
const T_SKIN_D = "#6a9a58";
const shellRows: [number, number, number, number][] = [
  [7, 17, 14, 3],
  [5, 20, 18, 3],
  [3, 23, 22, 5],
  [2, 28, 24, 4],
];
const umigame: NpcDef = {
  id: "umigame",
  name: "Umigame",
  rig: {
    sizeClass: "small",
    parts: {
      head: [
        rect(23, 24, 6, 7, OUT), // neck
        rect(24, 25, 4, 6, T_SKIN),
        circle(27, 21, 4.5, OUT),
        circle(27, 21, 3.5, T_SKIN),
        circle(28, 19.8, 1.4, WHITE),
        circle(28.6, 20, 0.7, OUT),
        rect(26.5, 17.6, 3, 1, "#f4f4f4"), // bushy old-turtle brow
        rect(27, 23, 3, 1, OUT),
      ],
      torso: [
        ...shellRows.map(([x, y, w, h]) => rect(x - 1, y - 1, w + 2, h + 2, OUT)),
        ...shellRows.map(([x, y, w, h]) => rect(x, y, w, h, SHELL)),
        rect(8, 21, 5, 3, SHELL_D), // shell plates
        rect(15, 21, 5, 3, SHELL_D),
        rect(5, 25, 5, 3, SHELL_D),
        rect(12, 25, 5, 3, SHELL_D),
        rect(19, 25, 4, 3, SHELL_D),
        rect(9, 18, 6, 1, "#79a85a"),
        rect(0, 30, 28, 5, OUT), // rim
        rect(1, 31, 26, 3, "#c9b073"),
      ],
      armFront: [rect(20, 33, 6, 6, OUT), rect(21, 34, 4, 4, T_SKIN), rect(21, 37, 5, 1, T_SKIN_D)],
      armBack: [rect(17, 33, 5, 6, OUT), rect(18, 34, 3, 4, T_SKIN_D)],
      legFront: [rect(6, 33, 6, 6, OUT), rect(7, 34, 4, 4, T_SKIN), rect(7, 37, 5, 1, T_SKIN_D)],
      legBack: [rect(3, 33, 5, 6, OUT), rect(4, 34, 3, 4, T_SKIN_D)],
      extras: [],
    },
    pivots: { neck: [24, 27], shoulder: [21, 33], hip: [7, 33] },
  },
  lines: [
    { speaker: "Umigame", text: "Oh dear, oh dear... I wandered off the beach and now I can't find the sea." },
    { speaker: "Umigame", text: "Could you help an old turtle get home? I'd be ever so grateful." },
  ],
};

// ---------------------------------------------------------------------------
// Props (rig pixels; a tile is 32 rig px)
// ---------------------------------------------------------------------------

/** Grandpa Gohan's dome house: 4 tiles wide, 3 tall. */
const domeHouse: PropDef = (() => {
  const shapes: Shape[] = [];
  const tiers: [number, number][] = [
    [8, 20],
    [14, 34],
    [20, 44],
    [28, 52],
    [38, 56],
  ];
  shapes.push(rect(72, 0, 8, 12, "#6a6a75"), rect(70, 0, 12, 3, "#45454f")); // stove pipe
  tiers.forEach(([y, hw], i) => shapes.push(rect(64 - hw - 2, y - 2, hw * 2 + 4, (tiers[i + 1]?.[0] ?? 86) - y + 4, "#3a3f4a")));
  tiers.forEach(([y, hw], i) => {
    const h = (tiers[i + 1]?.[0] ?? 86) - y;
    shapes.push(rect(64 - hw, y, hw * 2, h, "#f4f1ea"));
    shapes.push(rect(64 - hw, y, Math.round(hw * 0.35), h, "#c9cdd6"));
  });
  shapes.push(
    rect(70, 12, 10, 3, WHITE), // highlights
    rect(84, 22, 12, 3, WHITE),
    rect(18, 50, 92, 2, "#c9cdd6"), // seam
    circle(34, 60, 9, "#8a6a4a"), // round windows
    circle(34, 60, 7, "#7ec8f0"),
    rect(33, 53, 2, 14, "#8a6a4a"),
    rect(27, 59, 14, 2, "#8a6a4a"),
    circle(31, 57, 2, "#d6f0ff"),
    circle(98, 58, 8, "#8a6a4a"),
    circle(98, 58, 6, "#7ec8f0"),
    rect(97, 52, 2, 12, "#8a6a4a"),
    circle(96, 56, 1.5, "#d6f0ff"),
    circle(66, 66, 11, "#5a3418"), // arched door
    rect(55, 66, 22, 20, "#5a3418"),
    circle(66, 66, 9, "#7a4a25"),
    rect(57, 66, 18, 20, "#7a4a25"),
    rect(65.5, 58, 1, 28, "#5a3418"),
    circle(71, 76, 1.5, "#f2c230"),
    rect(4, 86, 120, 10, "#9a9184"), // stone base
    rect(4, 86, 120, 2, "#b8b0a2"),
    rect(20, 90, 1, 6, "#6e665a"),
    rect(44, 90, 1, 6, "#6e665a"),
    rect(84, 90, 1, 6, "#6e665a"),
    rect(108, 90, 1, 6, "#6e665a"),
    rect(52, 84, 28, 3, "#b8b0a2"), // doorstep
  );
  return { id: "dome-house", name: "Grandpa Gohan's dome house", size: { w: 128, h: 96 }, shapes, layer: "back" as const };
})();

/** Tall pine tree: 1.5 tiles wide, 4 tiles tall. */
const pineTree: PropDef = (() => {
  const shapes: Shape[] = [rect(20, 104, 8, 24, "#6b4226"), rect(20, 104, 3, 24, "#4e2f1a"), rect(22, 0, 4, 6, "#1f5a32")];
  for (let t = 0; t < 4; t++) {
    for (let k = 0; k < 6; k++) {
      const w = 6 + k * 6 + t * 3;
      const y = 4 + t * 24 + k * 5;
      shapes.push(rect(24 - w / 2, y, w, 5, "#1f5a32"));
      if (w > 8) shapes.push(rect(24 - w / 2 + 3, y, w - 6, 4, "#2e7d46"));
      if (w > 12) shapes.push(rect(24 + w / 4, y, w / 5, 3, "#4fa35e"));
    }
  }
  return { id: "pine-tree", name: "Pine tree", size: { w: 48, h: 128 }, shapes, layer: "back" as const };
})();

const boulder: PropDef = {
  id: "boulder",
  name: "Boulder",
  size: { w: 48, h: 32 },
  layer: "back",
  shapes: [
    circle(24, 19, 13, "#3e3a34"),
    circle(14, 24, 8, "#3e3a34"),
    circle(34, 23, 9, "#3e3a34"),
    circle(24, 19, 12, "#7d7468"),
    circle(14, 24, 7, "#6e665a"),
    circle(34, 23, 8, "#7d7468"),
    rect(7, 28, 35, 3, "#5e574e"),
    circle(21, 14, 4, "#a39a8c"),
    circle(32, 19, 2.5, "#a39a8c"),
    rect(16, 10, 6, 2, "#5fa84a"), // moss
  ],
};

/** Tall rock spire, 5 tiles tall. */
const rockSpire: PropDef = (() => {
  const steps: [number, number, number, number][] = [
    [2, 120, 36, 40],
    [5, 80, 30, 40],
    [8, 44, 24, 36],
    [11, 16, 18, 28],
    [14, 3, 12, 13],
  ];
  const shapes: Shape[] = [];
  for (const [x, y, w, h] of steps) shapes.push(rect(x - 1, y - 1, w + 2, h + 1, "#4a3828"));
  for (const [x, y, w, h] of steps) shapes.push(rect(x, y, w, h, "#a07a5a"), rect(x, y, Math.round(w * 0.3), h, "#7a5a40"), rect(x + w - 4, y + 2, 2, h - 4, "#c49a74"));
  for (const y of [30, 62, 100, 140]) shapes.push(rect(steps.find((s) => y >= s[1] && y < s[1] + s[3])![0], y, 22, 2, "#6a4c34"));
  shapes.push(rect(13, 0, 14, 3, "#4fa35e"), rect(15, 0, 3, 2, "#6cc24a"));
  return { id: "rock-spire", name: "Rock spire", size: { w: 40, h: 160 }, shapes, layer: "back" as const };
})();

const bush: PropDef = {
  id: "bush",
  name: "Bush",
  size: { w: 48, h: 24 },
  layer: "back",
  shapes: [
    circle(12, 15, 9, "#1f4a22"),
    circle(24, 11, 11, "#1f4a22"),
    circle(36, 15, 9, "#1f4a22"),
    circle(12, 15, 8, "#2e7d3a"),
    circle(24, 11, 10, "#3a9a46"),
    circle(36, 15, 8, "#2e7d3a"),
    rect(4, 18, 40, 6, "#2e7d3a"),
    circle(27, 7, 4, "#5fbf5a"),
    circle(38, 12, 2.5, "#5fbf5a"),
    circle(15, 17, 1.5, "#d6312a"), // berries
    circle(30, 15, 1.5, "#d6312a"),
    circle(20, 20, 1.5, "#d6312a"),
  ],
};

const tallGrass: PropDef = {
  id: "tall-grass",
  name: "Tall grass",
  size: { w: 32, h: 16 },
  layer: "front",
  shapes: [
    rect(2, 6, 2, 10, "#3a9a46"),
    rect(5, 2, 2, 14, "#5fbf5a"),
    rect(9, 8, 2, 8, "#2e7d3a"),
    rect(13, 0, 2, 16, "#3a9a46"),
    rect(17, 5, 2, 11, "#5fbf5a"),
    rect(21, 9, 2, 7, "#2e7d3a"),
    rect(25, 3, 2, 13, "#3a9a46"),
    rect(28, 7, 2, 9, "#5fbf5a"),
  ],
};

const STAR = "#d62828";
const star = (x: number, y: number): Shape[] => [rect(x - 1.5, y - 0.5, 3, 1, STAR), rect(x - 0.5, y - 1.5, 1, 3, STAR)];
const dragonBallStand: PropDef = {
  id: "four-star-ball",
  name: "Four-star Dragon Ball on its cushion",
  size: { w: 32, h: 40 },
  layer: "back",
  shapes: [
    rect(11, 30, 10, 10, "#5a3418"), // little wooden stand
    rect(12, 30, 8, 10, "#7a4a25"),
    rect(6, 28, 20, 3, "#5a3418"),
    rect(6, 22, 20, 7, "#c0392b"), // cushion
    rect(6, 27, 20, 2, "#8e2a1f"),
    rect(4, 26, 2, 4, "#f2c230"), // tassels
    rect(26, 26, 2, 4, "#f2c230"),
    circle(16, 14, 9, "#b85c00"),
    circle(16, 14, 8, "#ff9f1c"),
    circle(17, 15, 6, "#ffb347"),
    ...star(13, 12),
    ...star(19, 12),
    ...star(13, 17),
    ...star(19, 17),
    circle(12, 9, 2, "#fff3c4"),
  ],
};

const signpost: PropDef = {
  id: "signpost",
  name: "Wooden signpost",
  size: { w: 32, h: 48 },
  layer: "back",
  shapes: [
    rect(13, 12, 6, 36, "#4e2f1a"),
    rect(14, 12, 4, 36, "#7a4a25"),
    rect(14, 12, 1, 36, "#5a3418"),
    rect(1, 6, 26, 12, "#4e2f1a"), // plank pointing right
    rect(26, 8, 3, 8, "#4e2f1a"),
    rect(29, 10, 2, 4, "#4e2f1a"),
    rect(2, 7, 25, 10, "#a0703a"),
    rect(26, 9, 2, 6, "#a0703a"),
    rect(28, 11, 1, 2, "#a0703a"),
    rect(5, 10, 14, 1.5, "#4e2f1a"),
    rect(5, 13, 10, 1.5, "#4e2f1a"),
    rect(4, 22, 24, 10, "#4e2f1a"), // plank pointing left
    rect(2, 24, 2, 6, "#4e2f1a"),
    rect(5, 23, 22, 8, "#b8844a"),
    rect(9, 26, 12, 1.5, "#4e2f1a"),
    rect(10, 44, 12, 4, "#5fa84a"), // grass at the foot
  ],
};

const props: PropDef[] = [domeHouse, pineTree, boulder, rockSpire, bush, tallGrass, dragonBallStand, signpost];

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const rooms: Room[] = [
  {
    id: "mount-paozu",
    name: "Mount Paozu",
    objective: "Head down the mountain to the forest",
    isBossRoom: false,
    exit: { toRoom: "the-forest" },
    layout: buildLayout(72, [
      ["put", "S", 2, 11],
      ["put", "a", 8, 11], // Bulma
      ["pillar", 9, 2, 1],
      ["pillar", 13, 2, 2],
      ["gap", 17, 19],
      ["plat", 9, 22, 27],
      ["put", "1", 30, 11],
      ["pillar", 34, 3, 3],
      ["put", "C", 40, 11],
      ["put", "4", 43, 11],
      ["spikes", 44, 45],
      ["plat", 9, 47, 52],
      ["plat", 6, 53, 57],
      ["put", "2", 50, 4],
      ["gap", 58, 60],
      ["put", "1", 64, 11],
      ["put", "E", 69, 11],
    ]),
    props: [
      { prop: "dome-house", col: 3, row: 11 },
      { prop: "four-star-ball", col: 7, row: 11 },
      { prop: "pine-tree", col: 11, row: 11 },
      { prop: "pine-tree", col: 15, row: 11 },
      { prop: "boulder", col: 20, row: 11 },
      { prop: "tall-grass", col: 32, row: 11 },
      { prop: "rock-spire", col: 37, row: 11 },
      { prop: "signpost", col: 41, row: 11 },
      { prop: "bush", col: 61, row: 11 },
      { prop: "pine-tree", col: 66, row: 11 },
    ],
  },
  {
    id: "the-forest",
    name: "The Forest",
    objective: "Track the thief through the forest",
    isBossRoom: false,
    exit: { toRoom: "bear-thiefs-clearing" },
    layout: buildLayout(76, [
      ["put", "S", 2, 11],
      ["put", "b", 5, 11], // Umigame
      ["plat", 9, 8, 12],
      ["put", "1", 14, 11],
      ["gap", 17, 19],
      ["pillar", 22, 2, 2],
      ["plat", 8, 26, 31],
      ["put", "4", 28, 11],
      ["put", "3", 33, 11],
      ["spikes", 36, 37],
      ["put", "C", 40, 11],
      ["gap", 43, 45],
      ["plat", 9, 48, 53],
      ["plat", 6, 55, 59],
      ["spikes", 57, 58],
      ["put", "2", 57, 3],
      ["pillar", 62, 2, 3],
      ["put", "3", 68, 11],
      ["put", "E", 73, 11],
    ]),
    props: [
      { prop: "pine-tree", col: 0, row: 11 },
      { prop: "boulder", col: 9, row: 11 },
      { prop: "pine-tree", col: 15, row: 11 },
      { prop: "pine-tree", col: 24, row: 11 },
      { prop: "boulder", col: 38, row: 11 },
      { prop: "bush", col: 46, row: 11 },
      { prop: "rock-spire", col: 62, row: 8 },
      { prop: "pine-tree", col: 65, row: 11 },
      { prop: "tall-grass", col: 70, row: 11 },
      { prop: "signpost", col: 71, row: 11 },
    ],
  },
  {
    id: "bear-thiefs-clearing",
    name: "Bear Thief's Clearing",
    objective: "Defeat the Bear Thief",
    isBossRoom: true,
    exit: { toRoom: "END" },
    layout: buildLayout(46, [
      ["put", "S", 2, 11],
      ["plat", 9, 9, 13],
      ["plat", 6, 16, 20],
      ["spikes", 21, 22],
      ["plat", 9, 24, 28],
      ["plat", 7, 31, 34],
      ["put", "B", 40, 11],
    ]),
    props: [
      { prop: "pine-tree", col: 0, row: 11 },
      { prop: "boulder", col: 5, row: 11 },
      { prop: "pine-tree", col: 14, row: 11 },
      { prop: "boulder", col: 25, row: 11 },
      { prop: "rock-spire", col: 29, row: 11 },
      { prop: "bush", col: 35, row: 11 },
      { prop: "pine-tree", col: 44, row: 11 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cartridge
// ---------------------------------------------------------------------------

const cartridge: Cartridge = {
  id: "dragon-ball-ep1-goku",
  schemaVersion: 1,
  status: "ready",
  source: {
    title: "Dragon Ball",
    medium: "anime",
    versionOrEpisode: "Episode 1: The Secret of the Dragon Balls",
    requestedCharacter: "Goku",
  },
  character: goku,
  world: {
    id: "dragon-ball-ep1",
    name: "Dragon Ball: The Secret of the Dragon Balls",
    source: "Dragon Ball",
    visualStyle: {
      palette: { sky: "#5bb8f5", skyBottom: "#d6f0ff", ground: "#3f8f3a", groundTop: "#6cc24a", platform: "#8b5a2b", accent: "#ff8c1a" },
      backdrop: "mountains",
    },
    enemies: [wolf, pterodactyl, sabreTooth, oolong],
    boss: bearThief,
    npcs: [bulma, umigame],
    props,
    rooms,
    dialogue: {
      roomIntro: [
        [
          { speaker: "Goku", text: "Grandpa's Dragon Ball is safe and sound. Time to go catch some dinner!" },
          { speaker: "Goku", text: "Wolves up here are hungry too. Stay sharp." },
        ],
        [
          { speaker: "Goku", text: "Somebody big came through here. Those footprints have claws!" },
          { speaker: "Goku", text: "Ooh, a sabre-tooth. This could be a good warm-up." },
        ],
        [{ speaker: "Goku", text: "Found you! Give back what you stole, mister bear." }],
      ],
      bossIntro: [
        { speaker: "Bear Thief", text: "This is my forest, kid. Turn around or I'll make you my lunch!" },
        { speaker: "Goku", text: "Wow, you're huge! Bet you're strong. Let's fight!" },
      ],
      bossDefeated: [
        { speaker: "Bear Thief", text: "Ugh... the brat hits like a mountain falling on me..." },
        { speaker: "Goku", text: "That was fun! Now, anyone know where I can find dinner?" },
      ],
      playerDefeated: [
        { speaker: "Bear Thief", text: "Hah! Back to the mountains with you, little one." },
        { speaker: "Goku", text: "Okay, okay... I just need to train a bit more!" },
      ],
    },
  },
  notes: {
    sourceFacts: [
      "Dragon Ball episode 1 is 'The Secret of the Dragon Balls'; Goku lives alone on Mount Paozu.",
      "Goku keeps his late grandfather Gohan's four-star Dragon Ball.",
      "Goku is known for the Kamehameha, the Flying Nimbus cloud and the Power Pole (Nyoibo).",
      "Pterodactyls and other giant prehistoric animals appear in Goku's wilderness in the early episodes.",
      "Bulma meets Goku in episode 1 while hunting the seven Dragon Balls with her Dragon Radar.",
      "Umigame is a sea turtle Goku and Bulma help return to the sea, which leads them to Master Roshi.",
      "Oolong is a shape-shifting pig the pair meet early in their journey.",
    ],
    designChoices: [
      "The playable Goku is the iconic adult version, not the child Goku of episode 1.",
      "Rigs are simplified fan-style pixel versions of the cast in their iconic colours (Goku's orange gi with blue belt, Bulma's teal hair and pink dress, Oolong in green).",
      "The Bear Thief (a sword-wielding bear bandit) appears in the early episodes; making him the boss of this episode-1 world is a design choice. His sword is held off to the side so it never covers his face.",
      "Room order Mount Paozu -> The Forest -> Bear Thief's Clearing is invented for the game.",
      "Wolves, a pterodactyl and a sabre-tooth tiger are the regular enemies, placed at animal/ordinary-adult tier on the reference scale.",
      "Oolong is a regular walker enemy at ordinary-adult tier (HP 40, AD 6); a trickster cap and smoke puff stand in for his shape-shifting.",
      "Bulma (room 1) and Umigame (room 2) are friendly NPCs; meeting Umigame in the forest is a design choice (in the show he is stranded near a beach).",
      "Scenery props: Grandpa Gohan's dome house and the four-star Dragon Ball on Mount Paozu, pine trees, boulders, rock spires, bushes, tall grass and signposts.",
      "Kamehameha and Ki Blast deal magic (ki) damage with the ENERGY tag; punches deal physical damage.",
      "Every room is laid out so even a toddler-tier character can walk and jump to the exit without abilities.",
    ],
  },
  createdAt: "2026-11-21T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Validate, cross-check Peppa traversal, write
// ---------------------------------------------------------------------------

/** Peppa's exact movement, with her superJump swapped for a plain melee so only walking and jumping count. */
const peppaNoAbilities: CharacterDef = {
  ...goku,
  id: "peppa",
  name: "Peppa (no abilities)",
  rig: { ...goku.rig },
  collisionBox: { w: 10, h: 14 },
  movement: { speed: 110, jumpStrength: 360, canFly: false },
  tags: [],
  abilities: [
    { ...goku.abilities[0], id: "push", slot: 1 },
    { ...goku.abilities[0], id: "splash", slot: 2 },
    { ...goku.abilities[0], id: "no-jump", slot: 3 },
    { ...goku.abilities[0], id: "giggle", slot: 4 },
  ],
};

// Power tiers (SPEC 5.3): explicit per fighter, checked against the stat bands by validateCartridge.
const TIERS: Record<string, PowerTier> = { goku: "planet", "mountain-wolf": "civilian", pterodactyl: "civilian", "sabre-tooth-tiger": "peak-human", oolong: "civilian", "bear-thief": "street" };
for (const f of [cartridge.character, ...cartridge.world.enemies, cartridge.world.boss]) {
  if (!TIERS[f.id]) throw new Error(`No power tier set for ${f.id}`);
  f.powerTier = TIERS[f.id];
}
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
  console.error(`\nâœ— dragon-ball-ep1-goku\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const out = fileURLToPath(new URL("../../content/dragon-ball-ep1-goku.json", import.meta.url));
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`\nâœ“ wrote ${out}`);
