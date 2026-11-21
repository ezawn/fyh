// Builds the hand-finished Jujutsu Kaisen demo cartridge (docs/SPEC.md section 11).
// Run: npx tsx scripts/content/jjk.ts   -> writes content/jjk-gojo.json
// Rigs and props are drawn at 2x detail (contract v1.1): coordinates are rig pixels, drawn at RIG_SCALE 0.5.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Ability, BossDef, Cartridge, CharacterDef, EnemyDef, NpcDef, PropDef, PropPlacement, Rig, Room, Shape } from "../../src/shared/schema";
import { RIG_SCALE, ROOM_ROWS, TILE, TILES } from "../../src/shared/schema";
import { canReach, validateCartridge } from "../../src/shared/validate";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// color may be left out for shapes that go through paint().
const rect = (x: number, y: number, w: number, h: number, color = "#000000"): Shape => ({ type: "rect", x, y, w, h, color });
const circle = (x: number, y: number, r: number, color: string): Shape => ({ type: "circle", x, y, r, color });
/** Recolour a list of shapes. */
const paint = (color: string, shapes: Shape[]): Shape[] => shapes.map((s) => ({ ...s, color }));

/**
 * Dark outline: a 1px-larger copy of each shape in `color`, clipped to the W x H canvas.
 * Put it before the coloured shapes so it shows as an edge around them.
 */
function ol(W: number, H: number, color: string, shapes: Shape[]): Shape[] {
  return shapes.map((s) => {
    if (s.type === "rect") {
      const x0 = Math.max(0, s.x - 1);
      const y0 = Math.max(0, s.y - 1);
      const x1 = Math.min(W, s.x + s.w + 1);
      const y1 = Math.min(H, s.y + s.h + 1);
      return rect(x0, y0, x1 - x0, y1 - y0, color);
    }
    const r = Math.max(s.r, Math.min(s.r + 1, s.x, s.y, W - s.x, H - s.y));
    return circle(s.x, s.y, r, color);
  });
}

/** Tile grid: 14 rows, the bottom 2 are ground. Standing row (on top of the ground) is row 11. */
class Grid {
  static readonly FLOOR = ROOM_ROWS - 3; // 11: the row a character stands in on the ground
  private cells: string[][];
  constructor(readonly width: number) {
    this.cells = Array.from({ length: ROOM_ROWS }, (_, r) => Array(width).fill(r >= ROOM_ROWS - 2 ? TILES.GROUND : TILES.EMPTY));
  }
  put(col: number, row: number, ch: string) {
    if (col < 0 || col >= this.width || row < 0 || row >= ROOM_ROWS) throw new Error(`put out of bounds: ${col},${row}`);
    this.cells[row][col] = ch;
    return this;
  }
  /** Remove the ground in [col, col+w) (a pit you fall out of). */
  gap(col: number, w: number) {
    for (let c = col; c < col + w; c++) for (let r = ROOM_ROWS - 2; r < ROOM_ROWS; r++) this.put(c, r, TILES.EMPTY);
    return this;
  }
  /** Horizontal platform in `row` from col to col+len-1 (one-way by default). */
  platform(row: number, col: number, len: number, ch: string = TILES.ONE_WAY) {
    for (let c = col; c < col + len; c++) this.put(c, row, ch);
    return this;
  }
  /** Solid pillar from the ground up, `h` tiles tall above the floor. */
  pillar(col: number, w: number, h: number) {
    for (let c = col; c < col + w; c++) for (let r = Grid.FLOOR - h + 1; r <= Grid.FLOOR; r++) this.put(c, r, TILES.GROUND);
    return this;
  }
  /** Spikes sitting on the floor. */
  spikes(col: number, w: number, row: number = Grid.FLOOR) {
    for (let c = col; c < col + w; c++) this.put(c, row, TILES.SPIKES);
    return this;
  }
  /** Ceiling of solid tiles in the top `h` rows. */
  ceiling(h: number) {
    for (let r = 0; r < h; r++) for (let c = 0; c < this.width; c++) this.put(c, r, TILES.GROUND);
    return this;
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(""));
  }
}

const F = Grid.FLOOR;

// ---------------------------------------------------------------------------
// Shared humanoid body (32 px wide canvas): torso, arms from the shoulder, legs from the hip.
// ---------------------------------------------------------------------------

type BodyColors = {
  jacket: string; // base
  dark: string; // shadow
  light: string; // highlight
  button: string;
  pants: string;
  skin: string;
  skinShade: string;
  shoe: string;
  shoeShine: string;
  outline: string;
};

/** top = first torso row, hip = hip pivot row, H = canvas height (shoes end there). */
function body(c: BodyColors, top: number, hip: number, H: number) {
  const W = 32;
  const th = hip - top + 2;
  const core = rect(9, top, 14, th, c.jacket);
  const buttons: Shape[] = [];
  for (let y = top + 5; y < hip - 2; y += 5) buttons.push(circle(16.5, y, 1.2, c.button));
  const torso: Shape[] = [
    ...ol(W, H, c.outline, [core]),
    core,
    rect(19, top + 1, 4, th - 2, c.dark), // shadow side
    rect(10, top + 2, 2, th - 5, c.light), // highlight side
    rect(9, hip - 1, 14, 3, c.dark), // hem
    rect(16, top + 2, 1, th - 4, c.dark), // front seam
    ...buttons,
  ];

  const armLen = Math.round((hip - top) * 0.85);
  const arm = (shade: string, hand: string, hi: boolean): Shape[] => {
    const sleeve = rect(13, top + 1, 6, armLen, shade);
    const palm = rect(13, top + 1 + armLen, 6, 4, hand);
    return [
      ...ol(W, H, c.outline, [sleeve, palm]),
      sleeve,
      ...(hi ? [rect(13, top + 2, 2, armLen - 3, c.light)] : []),
      rect(13, top + armLen - 1, 6, 2, c.dark), // cuff
      palm,
      rect(13, top + armLen + 4, 6, 1, c.skinShade), // fingertips
    ];
  };

  const legLen = H - 4 - hip;
  const leg = (x: number, shade: string, shoeX: number, hi: boolean): Shape[] => {
    const l = rect(x, hip, 5, legLen, shade);
    const s = rect(shoeX, H - 4, 9, 4, c.shoe);
    return [
      ...ol(W, H, c.outline, [l, s]),
      l,
      ...(hi ? [rect(x, hip + 1, 1, legLen - 2, c.light)] : [rect(x + 4, hip + 1, 1, legLen - 2, c.outline)]),
      s,
      rect(shoeX + 1, H - 4, 3, 1, c.shoeShine),
    ];
  };

  return {
    torso,
    armFront: arm(c.jacket, c.skin, true),
    armBack: arm(c.dark, c.skinShade, false),
    legFront: leg(17, c.pants, 16, true),
    legBack: leg(10, c.dark, 7, false),
    pivots: { neck: [16, top - 1] as [number, number], shoulder: [16, top + 3] as [number, number], hip: [16, hip] as [number, number] },
  };
}

// ---------------------------------------------------------------------------
// Gojo (tall: 32x80)
// ---------------------------------------------------------------------------

const GOJO = {
  hair: "#f4f6fb",
  hairShade: "#b9c6da",
  skin: "#f2d8c6",
  skinShade: "#d6b39d",
  blindfold: "#14141c",
  blindfoldHi: "#34344a",
  uniform: "#1e2540",
  uniformDark: "#11152a",
  uniformLight: "#34406a",
  swirl: "#9aa4c8",
  outline: "#06070c",
};

const gojoBody = body(
  {
    jacket: GOJO.uniform,
    dark: GOJO.uniformDark,
    light: GOJO.uniformLight,
    button: GOJO.swirl,
    pants: GOJO.uniform,
    skin: GOJO.skin,
    skinShade: GOJO.skinShade,
    shoe: GOJO.outline,
    shoeShine: GOJO.blindfoldHi,
    outline: GOJO.outline,
  },
  29,
  51,
  80,
);

const gojoFace = rect(10, 10, 12, 16, GOJO.skin);
/** A hair spike: a body plus a narrower tip, so spikes taper instead of reading as one block. */
const spike = (x: number, y: number, w: number, h: number, tipX: number, tipY: number, tipW = 2, tipH = 2): Shape[] => [rect(x, y, w, h), rect(tipX, tipY, tipW, tipH)];
const gojoHair: Shape[] = paint(GOJO.hair, [
  rect(8, 7, 16, 6), // crown
  ...spike(4, 5, 4, 4, 3, 3), // upswept spikes, fanning outwards
  ...spike(7, 3, 4, 5, 7, 1),
  ...spike(11, 2, 4, 6, 12, 0),
  ...spike(15, 4, 3, 4, 16, 2, 1),
  ...spike(18, 1, 4, 7, 19, 0, 2, 1),
  ...spike(22, 3, 4, 5, 23, 1),
  ...spike(24, 6, 4, 4, 27, 4),
  ...spike(6, 9, 3, 5, 7, 14, 1), // side locks
  ...spike(23, 9, 3, 5, 24, 14, 1),
]);
const gojoBlindfold = rect(8, 13, 16, 5, GOJO.blindfold);

const gojoRig: Rig = {
  sizeClass: "tall", // 32x80 rig px = 16x40 world px
  parts: {
    head: [
      ...ol(32, 80, GOJO.outline, [gojoFace, rect(9, 17, 2, 4, GOJO.skin)]),
      gojoFace,
      rect(9, 17, 2, 4, GOJO.skinShade), // ear
      rect(10, 22, 12, 4, GOJO.skinShade), // jaw shadow
      rect(11, 22, 10, 2, GOJO.skin),
      rect(18, 18, 2, 3, GOJO.skinShade), // nose
      rect(14, 22, 5, 1, "#a8665c"), // mouth
      rect(15, 23, 3, 1, GOJO.skinShade),
    ],
    torso: gojoBody.torso,
    armFront: gojoBody.armFront,
    armBack: gojoBody.armBack,
    legFront: gojoBody.legFront,
    legBack: gojoBody.legBack,
    extras: [
      { attachTo: "head", shapes: ol(32, 80, GOJO.outline, [...gojoHair, gojoBlindfold]) },
      { attachTo: "head", shapes: gojoHair },
      {
        // pale blue-grey strands
        attachTo: "head",
        shapes: paint(GOJO.hairShade, [
          rect(9, 3, 1, 5),
          rect(13, 2, 1, 6),
          rect(20, 1, 1, 7),
          rect(24, 3, 1, 5),
          rect(5, 6, 1, 3),
          rect(26, 7, 1, 2),
          rect(7, 10, 1, 4),
          rect(24, 10, 1, 4),
          rect(9, 12, 14, 1),
          rect(16, 5, 1, 3),
        ]),
      },
      {
        // thick black blindfold
        attachTo: "head",
        shapes: [gojoBlindfold, rect(8, 13, 16, 1, GOJO.blindfoldHi), rect(8, 17, 16, 1, GOJO.outline)],
      },
      {
        // high collar with the jujutsu swirl button (drawn over the chin)
        attachTo: "torso",
        shapes: [
          ...ol(32, 80, GOJO.outline, [rect(10, 24, 12, 6, GOJO.uniform)]),
          rect(10, 24, 12, 6, GOJO.uniform),
          rect(10, 24, 12, 1, GOJO.uniformLight),
          rect(18, 25, 4, 5, GOJO.uniformDark),
          rect(16, 25, 1, 5, GOJO.uniformDark),
          circle(13.5, 27, 1.6, GOJO.swirl),
          circle(13.5, 27, 0.7, GOJO.uniformDark),
        ],
      },
    ],
  },
  pivots: gojoBody.pivots,
};

const gojoAbilities: Ability[] = [
  {
    id: "strike",
    name: "Strike",
    slot: 1,
    mechanic: "melee",
    damageType: "physical",
    attackTags: ["PHYSICAL"],
    ratio: 1,
    range: 26,
    cooldown: 0.3,
    duration: 0,
    knockback: 200,
    animation: "punch",
  },
  {
    id: "lapse-blue",
    name: "Lapse: Blue",
    slot: 2,
    mechanic: "aoe",
    damageType: "magic",
    attackTags: ["ENERGY"],
    ratio: 1.5,
    range: 64,
    cooldown: 4,
    duration: 0.4,
    knockback: -500, // pull
    animation: "cast",
  },
  {
    id: "teleport",
    name: "Teleport",
    slot: 3,
    mechanic: "teleport",
    damageType: "magic",
    attackTags: [],
    ratio: 0,
    range: 160,
    cooldown: 3,
    duration: 0,
    knockback: 0,
    animation: "cast",
  },
  {
    id: "hollow-purple",
    name: "Hollow Purple",
    slot: 4,
    mechanic: "beam",
    damageType: "magic",
    attackTags: ["ENERGY", "SPACE_BYPASS"],
    ratio: 5,
    range: 400,
    cooldown: 12,
    duration: 0.7,
    knockback: 600,
    animation: "beam",
  },
];

const gojo: CharacterDef = {
  id: "gojo",
  name: "Satoru Gojo",
  source: "Jujutsu Kaisen",
  versionOrEpisode: "Iconic (Limitless: Infinity, Blue, Red, Hollow Purple, teleport)",
  assumptions: [
    "Uses the iconic Gojo, not only what he shows in episodes 1-2: Limitless/Infinity, Lapse: Blue, Reversal: Red, Hollow Purple and short-range teleport.",
    "Between city-level and planet-level on the reference scale: the strongest sorcerer in his verse, but below iconic Goku on every raw stat (HP, AD, AP, ARM, MR). His edge is hax, not raw power.",
    "AP 900 above AD 600 because his power is cursed energy, not muscle; MAGIC_PEN 300 reflects Six Eyes precision.",
    "INFINITY is why nobody can touch him: attacks without SPACE_BYPASS or NULLIFY never reach him, however strong the attacker. Domain amplification/expansion (NULLIFY) and space-cutting attacks like World Cutting Slash (SPACE_BYPASS) do. FLIGHT tag: he levitates freely in the series.",
    "Red is not its own slot: Hollow Purple stands in for Red + Blue combined. Teleport uses the engine's teleport mechanic.",
    "Lapse: Blue is an aoe with negative knockback, so it pulls enemies in.",
  ],
  rig: gojoRig,
  collisionBox: { w: 12, h: 38 },
  movement: { speed: 240, jumpStrength: 560, canFly: true },
  stats: { HP: 6000, AD: 600, AP: 900, ARM: 500, MR: 700, ARM_PEN: 100, MAGIC_PEN: 300 },
  tags: ["INFINITY", "FLIGHT"],
  abilities: gojoAbilities,
};

// ---------------------------------------------------------------------------
// Enemies (cursed spirits)
// ---------------------------------------------------------------------------

const CURSE = {
  body: "#4b3b5e",
  light: "#6e5a88",
  hi: "#8f7aab",
  dark: "#2e2340",
  green: "#6f9a4e",
  teeth: "#e9e2c9",
  gum: "#8a1c38",
  eye: "#d1294a",
  pupil: "#f4e04d",
  outline: "#120c18",
};

const crawlHead = rect(5, 4, 22, 14, CURSE.light);
const crawlTorso = rect(4, 16, 24, 13, CURSE.body);
const crawlingCurse: EnemyDef = {
  id: "crawling-curse",
  name: "Crawling Curse",
  rig: {
    sizeClass: "small", // 32x40
    parts: {
      head: [
        ...ol(32, 40, CURSE.outline, [crawlHead]),
        crawlHead,
        rect(7, 4, 16, 2, CURSE.hi),
        rect(23, 6, 4, 12, CURSE.body),
        rect(7, 12, 18, 6, CURSE.outline), // gaping mouth
        rect(7, 12, 18, 1, CURSE.gum),
        ...paint(CURSE.teeth, [rect(8, 13, 2, 2), rect(11, 13, 2, 3), rect(14, 13, 2, 2), rect(17, 13, 2, 3), rect(20, 13, 2, 2), rect(23, 13, 2, 2)]),
        ...paint(CURSE.teeth, [rect(9, 16, 2, 2), rect(15, 16, 2, 2), rect(21, 16, 2, 2)]),
      ],
      torso: [
        ...ol(32, 40, CURSE.outline, [crawlTorso]),
        crawlTorso,
        rect(4, 25, 24, 4, CURSE.dark),
        rect(6, 17, 14, 2, CURSE.light),
        circle(8, 21, 1.6, CURSE.green),
        circle(24, 21, 2, CURSE.green),
        circle(19, 26, 1.3, CURSE.green),
        circle(12, 26, 1, CURSE.green),
      ],
      armFront: [
        ...ol(32, 40, CURSE.outline, [rect(21, 19, 4, 14, CURSE.body)]),
        rect(21, 19, 4, 14, CURSE.body),
        rect(21, 20, 1, 12, CURSE.light),
        rect(20, 33, 2, 3, CURSE.teeth),
        rect(23, 33, 2, 3, CURSE.teeth),
      ],
      armBack: [
        ...ol(32, 40, CURSE.outline, [rect(7, 19, 4, 14, CURSE.dark)]),
        rect(7, 19, 4, 14, CURSE.dark),
        rect(6, 33, 2, 3, CURSE.teeth),
        rect(9, 33, 2, 3, CURSE.teeth),
      ],
      legFront: [...ol(32, 40, CURSE.outline, [rect(18, 28, 5, 8, CURSE.dark), rect(17, 36, 8, 3, CURSE.body)]), rect(18, 28, 5, 8, CURSE.dark), rect(17, 36, 8, 3, CURSE.body)],
      legBack: [...ol(32, 40, CURSE.outline, [rect(9, 28, 5, 8, CURSE.dark), rect(7, 36, 8, 3, CURSE.dark)]), rect(9, 28, 5, 8, CURSE.dark), rect(7, 36, 8, 3, CURSE.dark)],
      extras: [
        {
          // a cluster of mismatched red eyes
          attachTo: "head",
          shapes: [
            ...ol(32, 40, CURSE.outline, [circle(10, 8, 2.5, CURSE.eye), circle(16, 7, 3, CURSE.eye), circle(22, 8.5, 2, CURSE.eye)]),
            circle(10, 8, 2.5, CURSE.eye),
            circle(16, 7, 3, CURSE.eye),
            circle(22, 8.5, 2, CURSE.eye),
            circle(13, 10.5, 1.2, CURSE.eye),
            circle(10, 8, 1, CURSE.pupil),
            circle(16.5, 7, 1.2, CURSE.pupil),
            circle(22, 8.5, 0.8, CURSE.pupil),
          ],
        },
      ],
    },
    pivots: { neck: [16, 16], shoulder: [16, 20], hip: [16, 28] },
  },
  collisionBox: { w: 14, h: 16 },
  stats: { HP: 300, AD: 60, AP: 0, ARM: 40, MR: 30, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 70,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.2 },
};

const EYE = {
  white: "#efe9dc",
  whiteShade: "#c9bfa9",
  iris: "#c4203f",
  irisDark: "#7d0f26",
  pupil: "#0b0a10",
  flesh: "#6b3f66",
  fleshDark: "#43243f",
  vein: "#a8324e",
  slime: "#7aa35a",
  outline: "#160c16",
};

const eyeballCurse: EnemyDef = {
  id: "eyeball-curse",
  name: "Floating Eyeball Curse",
  rig: {
    sizeClass: "small", // 32x40
    parts: {
      head: [
        circle(16, 15, 12, EYE.outline),
        circle(16, 15, 11, EYE.whiteShade),
        circle(14.5, 13.5, 9.5, EYE.white),
        ...paint(EYE.vein, [rect(6, 12, 4, 1), rect(8, 20, 4, 1), rect(9, 6, 3, 1), rect(22, 22, 3, 1), rect(10, 11, 1, 2), rect(24, 7, 2, 1)]),
        circle(18, 15, 6, EYE.irisDark),
        circle(18, 15, 5, EYE.iris),
        circle(19, 15, 2.5, EYE.pupil),
        circle(21, 12.5, 1.3, EYE.white),
      ],
      torso: [...ol(32, 40, EYE.outline, [rect(12, 25, 8, 6, EYE.flesh)]), rect(12, 25, 8, 6, EYE.flesh), rect(17, 25, 3, 6, EYE.fleshDark)],
      armFront: [
        ...ol(32, 40, EYE.outline, [rect(25, 20, 6, 3, EYE.flesh), rect(28, 23, 3, 3, EYE.flesh)]),
        rect(25, 20, 6, 3, EYE.flesh),
        rect(28, 23, 3, 3, EYE.flesh),
        rect(29, 25, 2, 1, EYE.slime),
      ],
      armBack: [
        ...ol(32, 40, EYE.outline, [rect(1, 20, 6, 3, EYE.fleshDark), rect(1, 23, 3, 3, EYE.fleshDark)]),
        rect(1, 20, 6, 3, EYE.fleshDark),
        rect(1, 23, 3, 3, EYE.fleshDark),
      ],
      legFront: [...ol(32, 40, EYE.outline, [rect(17, 30, 3, 8, EYE.flesh)]), rect(17, 30, 3, 8, EYE.flesh), rect(17, 37, 3, 2, EYE.slime)],
      legBack: [...ol(32, 40, EYE.outline, [rect(12, 30, 3, 6, EYE.fleshDark)]), rect(12, 30, 3, 6, EYE.fleshDark), rect(12, 35, 3, 2, EYE.slime)],
      extras: [
        {
          // fleshy upper lid
          attachTo: "head",
          shapes: [
            ...ol(32, 40, EYE.outline, [rect(8, 2, 16, 3, EYE.flesh), rect(5, 4, 4, 3, EYE.flesh), rect(23, 4, 4, 3, EYE.flesh)]),
            rect(8, 2, 16, 3, EYE.flesh),
            rect(5, 4, 4, 3, EYE.flesh),
            rect(23, 4, 4, 3, EYE.flesh),
            rect(8, 4, 16, 1, EYE.fleshDark),
          ],
        },
      ],
    },
    pivots: { neck: [16, 26], shoulder: [16, 22], hip: [16, 30] },
  },
  collisionBox: { w: 12, h: 12 },
  stats: { HP: 200, AD: 0, AP: 80, ARM: 10, MR: 40, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "flyer",
  speed: 90,
  attack: { damageType: "magic", ratio: 1, attackTags: ["ENERGY"], range: 160, cooldown: 1.8 },
};

const FB = {
  body: "#5b6b4e",
  light: "#7b8f66",
  dark: "#3a4632",
  bone: "#ddd5b6",
  boneShade: "#b0a684",
  mouth: "#9e1f39",
  mouthDark: "#3d0812",
  eye: "#f0e45a",
  outline: "#121810",
};

const fbHead = rect(6, 10, 20, 16, FB.body);
const fbFingers = [rect(8, 3, 3, 8, FB.bone), rect(14, 0, 4, 11, FB.bone), rect(21, 4, 3, 7, FB.bone)];
const fingerBearer: EnemyDef = {
  id: "finger-bearer",
  name: "Finger Bearer",
  rig: {
    sizeClass: "human", // 32x64
    parts: {
      head: [
        ...ol(32, 64, FB.outline, [fbHead]),
        fbHead,
        rect(7, 11, 5, 13, FB.light),
        rect(22, 11, 4, 15, FB.dark),
        rect(8, 17, 16, 8, FB.mouthDark), // huge mouth
        rect(8, 17, 16, 2, FB.mouth),
        ...paint(FB.bone, [rect(9, 19, 2, 3), rect(12, 19, 2, 3), rect(15, 19, 2, 3), rect(18, 19, 2, 3), rect(21, 19, 2, 3)]),
        ...paint(FB.bone, [rect(10, 22, 2, 3), rect(14, 22, 2, 3), rect(17, 22, 2, 3), rect(20, 22, 2, 3)]),
        rect(9, 12, 5, 4, FB.outline),
        rect(10, 13, 3, 2, FB.eye),
        rect(19, 12, 5, 4, FB.outline),
        rect(20, 13, 3, 2, FB.eye),
        rect(11, 13, 1, 2, FB.outline),
        rect(21, 13, 1, 2, FB.outline),
      ],
      torso: [
        ...ol(32, 64, FB.outline, [rect(5, 25, 22, 22, FB.body)]),
        rect(5, 25, 22, 22, FB.body),
        rect(6, 27, 3, 18, FB.light),
        rect(21, 27, 6, 19, FB.dark),
        rect(10, 30, 9, 1, FB.dark), // ribs
        rect(10, 33, 9, 1, FB.dark),
        rect(10, 36, 9, 1, FB.dark),
        circle(15, 42, 2.2, FB.outline), // eye in its belly
        circle(15, 42, 1.4, FB.eye),
      ],
      armFront: [
        ...ol(32, 64, FB.outline, [rect(15, 27, 6, 25, FB.body)]),
        rect(15, 27, 6, 25, FB.body),
        rect(15, 28, 2, 22, FB.light),
        rect(15, 52, 2, 5, FB.bone),
        rect(19, 52, 2, 5, FB.bone),
      ],
      armBack: [
        ...ol(32, 64, FB.outline, [rect(11, 27, 6, 25, FB.dark)]),
        rect(11, 27, 6, 25, FB.dark),
        rect(11, 52, 2, 4, FB.boneShade),
        rect(15, 52, 2, 4, FB.boneShade),
      ],
      legFront: [
        ...ol(32, 64, FB.outline, [rect(17, 46, 6, 14, FB.body), rect(16, 60, 9, 4, FB.dark)]),
        rect(17, 46, 6, 14, FB.body),
        rect(17, 47, 2, 12, FB.light),
        rect(16, 60, 9, 4, FB.dark),
      ],
      legBack: [
        ...ol(32, 64, FB.outline, [rect(9, 46, 6, 14, FB.dark), rect(6, 60, 9, 4, FB.dark)]),
        rect(9, 46, 6, 14, FB.dark),
        rect(6, 60, 9, 4, FB.dark),
      ],
      extras: [
        {
          // Fingers growing out of its head
          attachTo: "head",
          shapes: [
            ...ol(32, 64, FB.outline, fbFingers),
            ...fbFingers,
            ...paint(FB.boneShade, [rect(8, 3, 3, 2), rect(14, 0, 4, 2), rect(21, 4, 3, 2), rect(8, 7, 3, 1), rect(14, 5, 4, 1), rect(14, 8, 4, 1), rect(21, 8, 3, 1)]),
          ],
        },
      ],
    },
    pivots: { neck: [16, 25], shoulder: [16, 28], hip: [16, 46] },
  },
  collisionBox: { w: 14, h: 30 },
  stats: { HP: 500, AD: 40, AP: 120, ARM: 60, MR: 80, ARM_PEN: 0, MAGIC_PEN: 20 },
  tags: [],
  behaviour: "shooter",
  speed: 40,
  attack: { damageType: "magic", ratio: 1.2, attackTags: ["ENERGY"], range: 240, cooldown: 2.2 },
};

const GH = {
  green: "#5d8a3a",
  dark: "#34521f",
  light: "#8dbb5a",
  eye: "#d1294a",
  shine: "#ffd0da",
  teeth: "#e9e2c9",
  curse: "#6e5a88",
  outline: "#0f160a",
};

const ghHead = rect(18, 7, 12, 10, GH.green);
const ghBody = rect(3, 13, 18, 11, GH.green);
const grasshopperCurse: EnemyDef = {
  id: "grasshopper-curse",
  name: "Grasshopper Curse",
  rig: {
    sizeClass: "small", // 32x40
    parts: {
      head: [
        ...ol(32, 40, GH.outline, [ghHead, rect(21, 16, 3, 3, GH.teeth), rect(26, 16, 4, 3, GH.teeth)]),
        ghHead,
        rect(18, 14, 12, 3, GH.dark),
        rect(19, 7, 8, 1, GH.light),
        rect(21, 16, 3, 3, GH.teeth), // mandibles
        rect(26, 16, 4, 3, GH.teeth),
        rect(24, 17, 2, 2, GH.outline),
        circle(25, 10.5, 3, GH.outline),
        circle(25, 10.5, 2.4, GH.eye), // compound eye
        circle(26, 9.5, 0.9, GH.shine),
        circle(20.5, 10.5, 1.4, GH.eye),
      ],
      torso: [
        ...ol(32, 40, GH.outline, [ghBody]),
        ghBody,
        rect(5, 11, 13, 4, GH.light), // folded wing
        rect(4, 21, 16, 3, GH.light),
        rect(7, 15, 1, 9, GH.dark),
        rect(11, 15, 1, 9, GH.dark),
        rect(15, 15, 1, 9, GH.dark),
        circle(9.5, 18, 2, GH.curse),
        circle(14, 19, 1.4, GH.curse),
      ],
      armFront: [...ol(32, 40, GH.outline, [rect(19, 22, 3, 11, GH.dark)]), rect(19, 22, 3, 11, GH.dark), rect(20, 33, 4, 2, GH.teeth)],
      armBack: [...ol(32, 40, GH.outline, [rect(15, 22, 3, 11, GH.dark)]), rect(15, 22, 3, 11, GH.outline), rect(16, 33, 3, 2, GH.dark)],
      legFront: [
        ...ol(32, 40, GH.outline, [rect(8, 20, 6, 9, GH.green), rect(4, 28, 4, 9, GH.dark), rect(2, 37, 8, 3, GH.dark)]),
        rect(8, 20, 6, 9, GH.green), // big hind thigh
        rect(9, 21, 2, 7, GH.light),
        rect(4, 28, 4, 9, GH.dark), // shin
        rect(2, 37, 8, 3, GH.dark),
        rect(3, 30, 1, 1, GH.teeth),
        rect(3, 33, 1, 1, GH.teeth),
      ],
      legBack: [
        ...ol(32, 40, GH.outline, [rect(12, 20, 5, 9, GH.dark), rect(13, 28, 3, 9, GH.dark), rect(11, 37, 7, 3, GH.dark)]),
        rect(12, 20, 5, 9, GH.dark),
        rect(13, 28, 3, 9, GH.dark),
        rect(11, 37, 7, 3, GH.dark),
      ],
      extras: [
        {
          // antennae
          attachTo: "head",
          shapes: paint(GH.dark, [rect(20, 1, 1, 6), rect(17, 1, 3, 1), rect(24, 0, 1, 7), rect(25, 0, 4, 1)]),
        },
      ],
    },
    pivots: { neck: [20, 14], shoulder: [19, 22], hip: [10, 22] },
  },
  collisionBox: { w: 14, h: 14 },
  stats: { HP: 250, AD: 50, AP: 0, ARM: 30, MR: 20, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 80,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 20, cooldown: 1 },
};

// ---------------------------------------------------------------------------
// Boss: Sukuna in Yuji's body (human: 32x64)
// ---------------------------------------------------------------------------

const SK = {
  hair: "#f09aa8",
  hairDark: "#b8566a",
  skin: "#f0c9a8",
  skinShade: "#d2a383",
  mark: "#1c0c10",
  eye: "#d0102e",
  teeth: "#f5efe6",
  uniform: "#1d2236",
  uniformDark: "#10131f",
  uniformLight: "#2f3756",
  hood: "#b3202c",
  hoodDark: "#7e1420",
};

const skBody = body(
  {
    jacket: SK.uniform,
    dark: SK.uniformDark,
    light: SK.uniformLight,
    button: "#c9b26a",
    pants: SK.uniform,
    skin: SK.skin,
    skinShade: SK.skinShade,
    shoe: SK.hood,
    shoeShine: SK.teeth,
    outline: SK.mark,
  },
  26,
  43,
  64,
);
const skFace = rect(9, 8, 14, 16, SK.skin);
const skHair: Shape[] = paint(SK.hair, [
  rect(8, 5, 16, 6),
  ...spike(7, 3, 4, 4, 6, 1),
  ...spike(11, 2, 4, 4, 12, 0),
  ...spike(15, 3, 3, 3, 16, 1, 1),
  ...spike(18, 2, 4, 4, 19, 0),
  ...spike(22, 3, 3, 4, 24, 1),
  rect(7, 6, 2, 5),
  rect(23, 6, 2, 5),
  rect(10, 10, 3, 2), // fringe spikes
  rect(15, 10, 2, 2),
  rect(19, 10, 3, 2),
]);

const sukuna: BossDef = {
  id: "sukuna-yuji",
  name: "Sukuna (in Yuji's body)",
  rig: {
    sizeClass: "human", // 32x64
    parts: {
      head: [
        ...ol(32, 64, SK.mark, [skFace]),
        skFace,
        rect(9, 15, 1, 4, SK.skinShade),
        rect(10, 21, 12, 3, SK.skinShade),
        rect(10, 12, 3, 1, SK.mark), // angry brows
        rect(13, 13, 1, 1, SK.mark),
        rect(19, 12, 3, 1, SK.mark),
        rect(18, 13, 1, 1, SK.mark),
        rect(11, 14, 3, 2, SK.eye), // red eyes
        rect(18, 14, 3, 2, SK.eye),
        rect(12, 14, 1, 2, SK.mark),
        rect(19, 14, 1, 2, SK.mark),
        rect(11, 17, 3, 1, SK.mark), // Sukuna's second pair of eyes
        rect(12, 17, 1, 1, SK.eye),
        rect(18, 17, 3, 1, SK.mark),
        rect(19, 17, 1, 1, SK.eye),
        rect(11, 19, 10, 3, SK.mark), // menacing grin
        rect(12, 19, 8, 1, SK.teeth),
        rect(12, 20, 1, 1, SK.teeth),
        rect(19, 20, 1, 1, SK.teeth),
        rect(10, 18, 1, 2, SK.mark),
        rect(21, 18, 1, 2, SK.mark),
      ],
      torso: skBody.torso,
      armFront: skBody.armFront,
      armBack: skBody.armBack,
      legFront: skBody.legFront,
      legBack: skBody.legBack,
      extras: [
        { attachTo: "head", shapes: ol(32, 64, SK.mark, skHair) },
        { attachTo: "head", shapes: skHair },
        {
          // darker roots / undercut and strand shading
          attachTo: "head",
          shapes: paint(SK.hairDark, [rect(7, 8, 2, 4), rect(23, 8, 2, 4), rect(9, 9, 14, 1), rect(9, 3, 1, 4), rect(13, 2, 1, 5), rect(20, 2, 1, 5), rect(23, 4, 1, 3)]),
        },
        {
          // Sukuna's black face markings
          attachTo: "head",
          shapes: paint(SK.mark, [rect(14, 11, 4, 1), rect(9, 14, 2, 1), rect(21, 14, 2, 1), rect(9, 16, 1, 3), rect(22, 16, 1, 3)]),
        },
        {
          // Yuji's red hood around the collar
          attachTo: "torso",
          shapes: [
            ...ol(32, 64, SK.mark, [rect(8, 23, 16, 5, SK.hood), rect(9, 28, 5, 4, SK.hood)]),
            rect(8, 23, 16, 5, SK.hood),
            rect(9, 28, 5, 4, SK.hood),
            rect(8, 26, 16, 2, SK.hoodDark),
            rect(15, 23, 2, 4, SK.hoodDark),
          ],
        },
        {
          // black bands on the wrists and black nails
          attachTo: "armFront",
          shapes: [rect(13, 41, 6, 1, SK.mark), rect(13, 45, 6, 1, SK.mark)],
        },
      ],
    },
    pivots: skBody.pivots,
  },
  collisionBox: { w: 12, h: 30 },
  stats: { HP: 5000, AD: 700, AP: 800, ARM: 400, MR: 500, ARM_PEN: 100, MAGIC_PEN: 200 },
  tags: ["REGENERATION"],
  behaviour: "walker",
  speed: 150,
  attack: { damageType: "mixed", ratio: 1.5, attackTags: ["ENERGY", "NULLIFY"], range: 120, cooldown: 1.5 }, // NULLIFY = domain amplification: reaches through Infinity
  pattern: ["charge", "shoot", "jump"],
  phaseAt: 0.4,
};

// ---------------------------------------------------------------------------
// NPCs (human: 32x64)
// ---------------------------------------------------------------------------

const MG = {
  hair: "#1d2030",
  hairHi: "#3c4766",
  skin: "#f1d6c2",
  skinShade: "#d3b19b",
  eye: "#22304f",
  jacket: "#161a28",
  dark: "#0b0d16",
  light: "#2a3150",
  gold: "#c9b26a",
  outline: "#040509",
};
const mgBody = body(
  { jacket: MG.jacket, dark: MG.dark, light: MG.light, button: MG.gold, pants: MG.jacket, skin: MG.skin, skinShade: MG.skinShade, shoe: MG.outline, shoeShine: MG.hairHi, outline: MG.outline },
  26,
  43,
  64,
);
const mgFace = rect(9, 9, 14, 15, MG.skin);
const mgHair: Shape[] = paint(MG.hair, [
  rect(7, 3, 18, 9),
  rect(5, 1, 4, 5),
  rect(10, 0, 3, 4),
  rect(15, 0, 3, 4),
  rect(20, 0, 3, 4),
  rect(23, 2, 4, 5),
  rect(3, 6, 4, 4),
  rect(25, 6, 4, 4),
  rect(5, 10, 3, 4),
  rect(24, 10, 3, 4),
  rect(9, 11, 3, 3),
  rect(13, 11, 2, 2),
  rect(19, 11, 3, 2),
]);

const megumi: NpcDef = {
  id: "megumi",
  name: "Megumi Fushiguro",
  rig: {
    sizeClass: "human",
    parts: {
      head: [
        ...ol(32, 64, MG.outline, [mgFace]),
        mgFace,
        rect(10, 21, 12, 3, MG.skinShade),
        rect(11, 14, 3, 1, MG.hair), // brows
        rect(18, 14, 3, 1, MG.hair),
        rect(11, 15, 3, 2, MG.eye),
        rect(18, 15, 3, 2, MG.eye),
        rect(11, 15, 1, 1, MG.skin),
        rect(18, 15, 1, 1, MG.skin),
        rect(17, 17, 1, 2, MG.skinShade), // nose
        rect(14, 20, 4, 1, "#9a5d55"), // flat, serious mouth
      ],
      torso: mgBody.torso,
      armFront: mgBody.armFront,
      armBack: mgBody.armBack,
      legFront: mgBody.legFront,
      legBack: mgBody.legBack,
      extras: [
        { attachTo: "head", shapes: ol(32, 64, MG.outline, mgHair) },
        { attachTo: "head", shapes: mgHair },
        { attachTo: "head", shapes: paint(MG.hairHi, [rect(11, 2, 1, 6), rect(16, 1, 1, 7), rect(21, 2, 1, 6), rect(6, 3, 2, 1), rect(25, 4, 2, 1), rect(8, 9, 2, 1)]) },
        {
          // high collar with gold swirl button
          attachTo: "torso",
          shapes: [
            ...ol(32, 64, MG.outline, [rect(10, 22, 12, 5, MG.jacket)]),
            rect(10, 22, 12, 5, MG.jacket),
            rect(10, 22, 12, 1, MG.light),
            rect(18, 23, 4, 4, MG.dark),
            circle(13.5, 24.5, 1.4, MG.gold),
          ],
        },
      ],
    },
    pivots: mgBody.pivots,
  },
  lines: [
    { speaker: "Megumi", text: "That box holds one of Sukuna's fingers. A special grade cursed object. Whatever you do, don't touch it." },
    { speaker: "Megumi", text: "The seal is wearing off. Every curse in this school can smell it, and they're getting bolder." },
  ],
};

const NB = {
  hair: "#d9772e",
  hairDark: "#a5521c",
  hairLight: "#f2a35e",
  skin: "#f3d3bd",
  skinShade: "#d6ad94",
  eye: "#6b3a1e",
  jacket: "#1a1d2b",
  dark: "#0e1018",
  light: "#2e3450",
  metal: "#9aa0ab",
  metalDark: "#5c616d",
  wood: "#7a4a26",
  outline: "#08070a",
};
const nbBody = body(
  { jacket: NB.jacket, dark: NB.dark, light: NB.light, button: "#c9b26a", pants: "#26222c", skin: NB.skin, skinShade: NB.skinShade, shoe: "#4a2a1a", shoeShine: NB.wood, outline: NB.outline },
  26,
  43,
  64,
);
const nbFace = rect(9, 8, 14, 16, NB.skin);
const nbHair: Shape[] = paint(NB.hair, [rect(9, 1, 14, 3), rect(7, 3, 18, 8), rect(6, 8, 4, 13), rect(22, 8, 4, 13), rect(10, 10, 12, 3)]);
const nbHammer: Shape[] = [rect(15, 42, 2, 11, NB.wood), rect(11, 52, 10, 5, NB.metal)];

const nobara: NpcDef = {
  id: "nobara",
  name: "Nobara Kugisaki",
  rig: {
    sizeClass: "human",
    parts: {
      head: [
        ...ol(32, 64, NB.outline, [nbFace]),
        nbFace,
        rect(10, 21, 12, 3, NB.skinShade),
        rect(11, 13, 3, 1, NB.hairDark), // confident brows
        rect(18, 13, 3, 1, NB.hairDark),
        rect(11, 15, 3, 2, NB.eye),
        rect(18, 15, 3, 2, NB.eye),
        rect(11, 15, 1, 1, "#ffffff"),
        rect(18, 15, 1, 1, "#ffffff"),
        rect(17, 17, 1, 2, NB.skinShade),
        rect(14, 20, 4, 1, "#b5574f"), // smirk
        rect(18, 19, 1, 1, "#b5574f"),
      ],
      torso: nbBody.torso,
      armFront: nbBody.armFront,
      armBack: nbBody.armBack,
      legFront: nbBody.legFront,
      legBack: nbBody.legBack,
      extras: [
        { attachTo: "head", shapes: ol(32, 64, NB.outline, nbHair) },
        { attachTo: "head", shapes: nbHair },
        {
          // bob shading, straight-cut ends, fringe part
          attachTo: "head",
          shapes: [
            ...paint(NB.hairDark, [rect(8, 11, 2, 9), rect(22, 11, 2, 9), rect(6, 20, 4, 1), rect(22, 20, 4, 1), rect(16, 10, 1, 3)]),
            ...paint(NB.hairLight, [rect(11, 2, 6, 1), rect(9, 4, 3, 1), rect(19, 4, 3, 1), rect(7, 9, 1, 6)]),
          ],
        },
        {
          // pleated skirt
          attachTo: "torso",
          shapes: [
            ...ol(32, 64, NB.outline, [rect(8, 40, 16, 8, "#232842")]),
            rect(8, 40, 16, 8, "#232842"),
            rect(11, 41, 1, 7, NB.dark),
            rect(15, 41, 1, 7, NB.dark),
            rect(19, 41, 1, 7, NB.dark),
            rect(8, 40, 16, 1, NB.light),
          ],
        },
        {
          // hammer held at her side, nails between her fingers
          attachTo: "armFront",
          shapes: [
            ...ol(32, 64, NB.outline, nbHammer),
            ...nbHammer,
            rect(11, 52, 2, 5, NB.metalDark),
            rect(11, 52, 10, 1, "#c4c9d2"),
            rect(19, 41, 3, 1, NB.metal),
            rect(19, 43, 3, 1, NB.metal),
          ],
        },
      ],
    },
    pivots: nbBody.pivots,
  },
  lines: [
    { speaker: "Nobara", text: "Nobara Kugisaki. Yeah, I'm early. I came to be a sorcerer, so try to keep up, teach." },
    { speaker: "Nobara", text: "Hammer, nails, straw doll. Point me at a curse and watch it pop." },
  ],
};

// ---------------------------------------------------------------------------
// Props (rig pixels; drawn at RIG_SCALE so 32 rig px = 1 tile)
// ---------------------------------------------------------------------------

const NIGHT = {
  concrete: "#3d4259",
  concreteDark: "#2c3044",
  concreteLight: "#555b78",
  glass: "#141628",
  lit: "#e8c66a",
  moon: "#6f86b8",
  frame: "#22253a",
  clock: "#e6e1cf",
  ink: "#111218",
  metal: "#4a5066",
  metalDark: "#2b2f3d",
};

function schoolFacade(): PropDef {
  const W = 352;
  const H = 256;
  const shapes: Shape[] = [
    rect(0, 24, W, H - 24, NIGHT.concrete),
    rect(0, 16, W, 10, NIGHT.concreteLight), // parapet
    rect(0, 26, W, 4, NIGHT.concreteDark),
    rect(144, 0, 64, 30, NIGHT.concrete), // clock tower
    rect(144, 0, 64, 4, NIGHT.concreteLight),
    rect(200, 4, 8, 26, NIGHT.concreteDark),
    circle(176, 18, 13, NIGHT.frame),
    circle(176, 18, 11, NIGHT.clock),
    rect(175, 9, 2, 10, NIGHT.ink), // hands at ten past twelve: night
    rect(176, 17, 7, 2, NIGHT.ink),
    circle(176, 18, 1.5, NIGHT.ink),
    rect(0, 106, W, 4, NIGHT.concreteDark), // floor bands
    rect(0, 186, W, 4, NIGHT.concreteDark),
    rect(W - 12, 30, 12, H - 30, NIGHT.concreteDark), // shaded corner
    rect(0, 30, 6, H - 30, NIGHT.concreteLight),
  ];
  // 3 floors x 8 windows; the ground floor's middle two are the entrance.
  const lit = new Set(["0,2", "1,5", "1,6", "2,0", "0,7"]);
  const moonlit = new Set(["0,4", "1,1", "2,6"]);
  const floorsY = [42, 122, 200];
  floorsY.forEach((y, f) => {
    shapes.push(rect(0, y - 3, W, 50, NIGHT.concreteDark));
    for (let i = 0; i < 8; i++) {
      if (f === 2 && (i === 3 || i === 4)) continue;
      const x = 8 + i * 44;
      const key = `${f},${i}`;
      shapes.push(rect(x, y, 32, 44, lit.has(key) ? NIGHT.lit : moonlit.has(key) ? NIGHT.moon : NIGHT.glass));
      shapes.push(rect(x + 15, y, 2, 44, NIGHT.frame));
      shapes.push(rect(x, y + 16, 32, 2, NIGHT.frame));
    }
  });
  // Entrance
  shapes.push(
    rect(136, 194, 80, 62, NIGHT.frame),
    rect(140, 200, 34, 56, "#2a3a4a"),
    rect(178, 200, 34, 56, "#2a3a4a"),
    rect(142, 202, 30, 30, NIGHT.glass),
    rect(180, 202, 30, 30, NIGHT.glass),
    rect(170, 230, 3, 8, NIGHT.metal),
    rect(179, 230, 3, 8, NIGHT.metal),
    rect(132, 188, 88, 6, NIGHT.concreteLight), // canopy
    rect(150, 176, 52, 10, NIGHT.clock), // school name plate
    rect(154, 180, 44, 2, NIGHT.frame),
    rect(128, 250, 96, 6, NIGHT.concreteLight), // step
  );
  return { id: "school-facade", name: "Sugisawa Third High School", size: { w: W, h: H }, shapes, layer: "back" };
}

const streetLamp: PropDef = {
  id: "street-lamp",
  name: "Street lamp",
  size: { w: 16, h: 96 },
  layer: "back",
  shapes: [
    circle(8, 19, 7.5, "#3f3656"), // glow
    circle(8, 18, 5, "#6a5a6e"),
    rect(7, 20, 3, 70, NIGHT.metalDark),
    rect(7, 20, 1, 70, NIGHT.metal),
    rect(4, 88, 9, 8, NIGHT.metalDark),
    rect(4, 88, 9, 1, NIGHT.metal),
    rect(5, 8, 7, 2, NIGHT.metalDark),
    rect(3, 10, 11, 6, NIGHT.metalDark),
    rect(4, 16, 9, 3, "#ffe9a8"),
  ],
};

function shoeLockers(): PropDef {
  const shapes: Shape[] = [rect(0, 0, 64, 48, "#6b6f7e"), rect(0, 0, 64, 2, "#8a8fa0"), rect(58, 0, 6, 48, "#4f5361")];
  const shoes: Record<string, string> = { "0,1": "#e6e0d0", "2,0": "#e6e0d0", "1,3": "#b03040", "2,2": "#e6e0d0", "0,3": "#2b4a8a" };
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 14;
      const y = 4 + j * 14;
      shapes.push(rect(x, y, 12, 11, "#262935"));
      const shoe = shoes[`${j},${i}`];
      if (shoe) shapes.push(rect(x + 2, y + 6, 8, 4, shoe));
    }
  shapes.push(rect(0, 46, 64, 2, "#3a3d48"));
  return { id: "shoe-lockers", name: "Shoe cubbies", size: { w: 64, h: 48 }, shapes, layer: "back" };
}

const classroomWindow: PropDef = {
  id: "classroom-window",
  name: "Moonlit classroom window",
  size: { w: 64, h: 96 },
  layer: "back",
  shapes: [
    rect(0, 4, 64, 62, "#8a8fa3"), // aluminium frame
    rect(3, 7, 28, 27, "#1b2550"),
    rect(33, 7, 28, 27, "#1b2550"),
    rect(3, 36, 28, 27, "#1b2550"),
    rect(33, 36, 28, 27, "#1b2550"),
    circle(48, 19, 7, "#e8ecf5"), // crescent moon
    circle(45, 17, 6, "#1b2550"),
    rect(6, 10, 3, 20, "#33427a"), // moonlight glare
    rect(11, 10, 2, 14, "#33427a"),
    rect(36, 40, 3, 20, "#33427a"),
    rect(6, 39, 3, 20, "#33427a"),
    rect(0, 64, 64, 5, "#6a6f84"), // sill
    rect(0, 76, 64, 3, "#3a3446"), // wall rail
    rect(6, 88, 52, 8, "#2a3058"), // patch of moonlight on the floor
  ],
};

const vendingMachine: PropDef = {
  id: "vending-machine",
  name: "Vending machine",
  size: { w: 32, h: 64 },
  layer: "back",
  shapes: [
    rect(0, 0, 32, 64, "#b8243a"),
    rect(26, 0, 6, 64, "#82182a"),
    rect(0, 0, 32, 4, "#d94a5a"),
    rect(3, 6, 21, 26, "#cfe3f0"), // lit display
    ...[0, 1, 2].flatMap((j) =>
      [0, 1, 2, 3].map((i) => rect(5 + i * 5, 9 + j * 8, 3, 6, ["#2b6fd6", "#e0a020", "#3aa860", "#d83c3c"][(i + j) % 4])),
    ),
    rect(3, 34, 21, 3, "#2a2a33"),
    rect(22, 38, 3, 7, "#2a2a33"), // coin slot
    rect(3, 48, 21, 9, "#1a1a22"), // dispenser
    rect(3, 48, 21, 1, "#5a1420"),
    rect(0, 62, 32, 2, "#5a1420"),
  ],
};

const fingerBox: PropDef = {
  id: "finger-box",
  name: "Sealed box with Sukuna's finger",
  size: { w: 32, h: 24 },
  layer: "back",
  shapes: [
    rect(1, 5, 30, 19, "#2a170c"),
    rect(2, 6, 28, 17, "#8a5a2b"),
    rect(0, 3, 32, 5, "#2a170c"), // lid
    rect(1, 4, 30, 3, "#a06a35"),
    rect(3, 12, 26, 1, "#6b4420"), // grain
    rect(3, 18, 26, 1, "#6b4420"),
    rect(6, 1, 5, 22, "#efe6c8"), // talismans
    rect(21, 1, 5, 22, "#efe6c8"),
    rect(7, 4, 3, 1, "#c0202a"),
    rect(7, 7, 3, 5, "#c0202a"),
    rect(8, 14, 1, 6, "#c0202a"),
    rect(22, 4, 3, 1, "#c0202a"),
    rect(22, 7, 3, 5, "#c0202a"),
    rect(23, 14, 1, 6, "#c0202a"),
    rect(14, 0, 2, 2, "#a3245c"), // seeping cursed energy
    rect(17, 1, 2, 2, "#a3245c"),
    rect(28, 0, 2, 2, "#a3245c"),
  ],
};

function waterTank(): PropDef {
  const shapes: Shape[] = [
    rect(10, 80, 6, 48, "#4a4f5e"), // legs
    rect(45, 80, 6, 48, "#4a4f5e"),
    rect(80, 80, 6, 48, "#4a4f5e"),
    rect(10, 102, 76, 3, "#3a3e4a"),
    rect(4, 24, 88, 58, "#8d93a3"), // tank
    rect(70, 24, 22, 58, "#6b7080"),
    rect(10, 24, 6, 58, "#b4bac8"),
    rect(4, 40, 88, 3, "#5c6170"),
    rect(4, 62, 88, 3, "#5c6170"),
    rect(8, 16, 80, 10, "#a3a9b8"), // dome
    rect(8, 16, 80, 2, "#c4cad6"),
    rect(40, 10, 16, 7, "#6b7080"), // hatch
    rect(60, 28, 2, 98, "#3a3e4a"), // ladder
    rect(68, 28, 2, 98, "#3a3e4a"),
    rect(18, 70, 10, 8, "#6a4e3c"), // rust
  ];
  for (let y = 34; y < 126; y += 10) shapes.push(rect(60, y, 10, 2, "#3a3e4a"));
  return { id: "water-tank", name: "Rooftop water tank", size: { w: 96, h: 128 }, shapes, layer: "back" };
}

function roofRailing(): PropDef {
  const shapes: Shape[] = [rect(0, 0, 128, 4, "#9aa0b0"), rect(0, 3, 128, 1, "#5c6170"), rect(0, 28, 128, 3, "#7a8090")];
  for (let i = 0; i < 8; i++) {
    shapes.push(rect(i * 16, 0, 3, 36, "#7a8090"));
    shapes.push(rect(i * 16 + 8, 4, 2, 24, "#5c6170"));
  }
  shapes.push(rect(0, 34, 128, 6, "#4a4f5e"));
  return { id: "roof-railing", name: "Rooftop safety railing", size: { w: 128, h: 40 }, shapes, layer: "back" };
}

const props: PropDef[] = [schoolFacade(), streetLamp, shoeLockers(), classroomWindow, vendingMachine, fingerBox, waterTank(), roofRailing()];
const at = (prop: string, col: number, row: number = F): PropPlacement => ({ prop, col, row });

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function schoolGrounds(): Room {
  const g = new Grid(70);
  g.put(2, F, TILES.SPAWN);
  g.put(5, F, TILES.NPC_A); // Megumi, next to the sealed box
  g.platform(9, 7, 5); // warm-up hop (climb 2 from the floor... stands on row 8)
  g.put(14, F, "1");
  g.gap(18, 3);
  g.pillar(24, 2, 2);
  g.spikes(28, 2);
  g.platform(9, 30, 4);
  g.put(36, F, TILES.CHECKPOINT);
  g.put(41, 6, "2");
  g.gap(44, 3);
  g.platform(9, 48, 5);
  g.put(50, 8, "1");
  g.put(56, F, "3");
  g.pillar(59, 2, 3);
  g.platform(8, 62, 3);
  g.put(65, F, "4");
  g.put(67, F, TILES.EXIT);
  return {
    id: "school-grounds",
    name: "Sugisawa High School Grounds",
    objective: "Cross the school grounds and get inside",
    layout: g.rows(),
    isBossRoom: false,
    exit: { toRoom: "haunted-corridors" },
    props: [
      at("school-facade", 21),
      at("street-lamp", 1),
      at("finger-box", 6),
      at("street-lamp", 16),
      at("street-lamp", 35),
      at("vending-machine", 38),
      at("street-lamp", 47),
      at("street-lamp", 54),
    ],
  };
}

function hauntedCorridors(): Room {
  const g = new Grid(72);
  g.ceiling(1);
  g.put(2, F, TILES.SPAWN);
  g.put(6, F, TILES.NPC_B); // Nobara
  g.put(10, F, "1");
  g.pillar(14, 1, 2); // overturned desks
  g.pillar(15, 1, 1);
  g.gap(19, 3); // broken floor
  g.platform(9, 23, 6);
  g.put(25, 6, "2");
  g.spikes(30, 2);
  g.pillar(33, 3, 2);
  g.put(38, F, TILES.CHECKPOINT);
  g.put(43, F, "3");
  g.gap(46, 2);
  g.platform(9, 50, 4);
  g.platform(6, 55, 4); // upper ledge (climb 3 from the platform)
  g.put(56, 4, "2");
  g.gap(55, 3);
  g.pillar(61, 2, 2);
  g.put(64, F, "1");
  g.put(41, F, "4");
  g.put(69, F, TILES.EXIT);
  return {
    id: "haunted-corridors",
    name: "Haunted Corridors",
    objective: "Follow the cursed energy up to the roof",
    layout: g.rows(),
    isBossRoom: false,
    exit: { toRoom: "the-rooftop" },
    props: [
      at("classroom-window", 3),
      at("shoe-lockers", 8),
      at("classroom-window", 16),
      at("classroom-window", 26),
      at("shoe-lockers", 36),
      at("classroom-window", 44),
      at("classroom-window", 51),
      at("vending-machine", 59),
      at("shoe-lockers", 66),
    ],
  };
}

function rooftop(): Room {
  const g = new Grid(44);
  g.put(2, F, TILES.SPAWN);
  g.pillar(8, 2, 1); // air-conditioning units
  g.platform(9, 13, 4);
  g.gap(18, 2);
  g.spikes(23, 2);
  g.platform(8, 27, 4);
  g.pillar(33, 1, 1);
  g.put(39, F, TILES.BOSS);
  return {
    id: "the-rooftop",
    name: "The Rooftop",
    objective: "Defeat Sukuna",
    layout: g.rows(),
    isBossRoom: true,
    exit: { toRoom: "END" },
    props: [
      at("roof-railing", 3),
      at("roof-railing", 10),
      at("street-lamp", 17),
      at("roof-railing", 20),
      at("roof-railing", 28),
      at("water-tank", 34),
      at("roof-railing", 40),
    ],
  };
}

// ---------------------------------------------------------------------------
// Cartridge
// ---------------------------------------------------------------------------

const cartridge: Cartridge = {
  id: "jjk-gojo",
  schemaVersion: 1,
  status: "ready",
  source: {
    title: "Jujutsu Kaisen",
    medium: "anime",
    versionOrEpisode: "Season 1 opening arc (Episodes 1-2)",
    requestedCharacter: "Gojo",
  },
  character: gojo,
  world: {
    id: "jjk-opening-arc",
    name: "Jujutsu Kaisen: The Opening Arc",
    source: "Jujutsu Kaisen",
    visualStyle: {
      palette: {
        sky: "#0d0b26",
        skyBottom: "#3a1f4f",
        ground: "#4a4d57",
        groundTop: "#7a7e8a",
        platform: "#2a2c38",
        accent: "#a3245c",
      },
      backdrop: "school",
    },
    enemies: [crawlingCurse, eyeballCurse, fingerBearer, grasshopperCurse],
    boss: sukuna,
    npcs: [megumi, nobara],
    props,
    rooms: [schoolGrounds(), hauntedCorridors(), rooftop()],
    dialogue: {
      roomIntro: [
        [
          { speaker: "Gojo", text: "A special grade cursed object loose at a high school at night. Sure, why not." },
          { speaker: "Gojo", text: "Low-grade curses crawling everywhere. Relax, the strongest just showed up." },
        ],
        [
          { speaker: "Gojo", text: "These halls reek of cursed energy. Somebody swallowed something they really shouldn't have." },
          { speaker: "Gojo", text: "Mind the floor. Curses love a building nobody's watching." },
        ],
        [{ speaker: "Gojo", text: "Up on the roof? Let's see who's really in charge of that body." }],
      ],
      bossIntro: [
        { speaker: "Sukuna", text: "So you're this era's strongest. Entertain me before the brat takes his body back." },
        { speaker: "Gojo", text: "Ten seconds. If Yuji's still in there, he can come back after." },
      ],
      bossDefeated: [
        { speaker: "Sukuna", text: "Tch. Enjoy it while it lasts, sorcerer." },
        { speaker: "Gojo", text: "Welcome back, Yuji. You're going to need a lot of training." },
      ],
      playerDefeated: [{ speaker: "Sukuna", text: "The strongest? Don't make me laugh. Come back with a real technique." }],
    },
  },
  notes: {
    sourceFacts: [
      "Yuji Itadori is a student at Sugisawa Third High School in Sendai.",
      "Yuji swallows one of Ryomen Sukuna's fingers, a special grade cursed object, to fight off curses at his school at night.",
      "Sukuna takes over Yuji's body; Gojo arrives and briefly fights Sukuna before Yuji regains control.",
      "Gojo's technique is Limitless: Infinity stops attacks before they touch him; Blue pulls, Red repels, Hollow Purple combines both.",
      "Gojo wears a black blindfold over his Six Eyes, has white hair and a dark high-collar jujutsu uniform.",
      "When Sukuna takes over, extra eyes and black markings appear on Yuji's face.",
      "Megumi Fushiguro, a first-year at Tokyo Jujutsu High with spiky black hair, is sent to Sugisawa to recover the finger and warns Yuji about it.",
      "The finger was kept at the school in a box sealed with talismans; the seal had weakened, drawing curses to it.",
      "Nobara Kugisaki (ginger bob) fights with a hammer, nails and a straw doll (Straw Doll Technique); she is introduced in episode 3.",
      "In episode 4 Nobara fights a grasshopper-like curse in an abandoned building in Roppongi.",
    ],
    designChoices: [
      "Gojo is played in his iconic form; Hollow Purple and teleport are shown later than episodes 1-2.",
      "The three rooms (school grounds, corridors, rooftop) and the rooftop showdown are invented for the game.",
      "Enemies are generic low-grade curses (crawler, floating eyeball, finger bearer), not specific named curses from episodes 1-2.",
      "The Grasshopper Curse is borrowed from episode 4 (Roppongi) and placed at Sugisawa as a jumper (HP 250, AD 50).",
      "Megumi stands at the start of the school grounds next to the sealed finger box, which is a background prop.",
      "Nobara joins early as an NPC in the corridors; in the show she only appears from episode 3 in Tokyo.",
      "NPCs only talk; they don't fight. Scenery props (school facade, lamps, shoe cubbies, moonlit windows, vending machines, water tank, railing) are background only.",
      "Rigs are redrawn at 2x detail with dark outlines, 2-3 shades per material, and the same size classes, collision boxes and stats as before.",
      "Sukuna is the boss; his attacks are mixed damage tagged ENERGY + NULLIFY: he uses domain amplification, which neutralises techniques on contact, so his hits reach through Gojo's Infinity.",
      "Sukuna in Yuji's body (only a few fingers) sits just below Gojo: HP 5000, AD 700, AP 800.",
      "Sukuna gets REGENERATION to reflect his reverse cursed technique.",
      "Every room is passable without abilities by the weakest demo character (Peppa), so any character can visit this world.",
    ],
  },
  createdAt: "2026-11-21T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const problems = validateCartridge(cartridge);

// Peppa-movement reachability: the weakest walker in the demo must finish every room without abilities.
const peppaProbe: CharacterDef = {
  ...gojo,
  id: "peppa-probe",
  name: "Peppa (movement probe)",
  rig: { ...gojoRig, sizeClass: "tiny", parts: { head: [], torso: [], armFront: [], armBack: [], legFront: [], legBack: [], extras: [] } },
  collisionBox: { w: 10, h: 14 },
  movement: { speed: 110, jumpStrength: 360, canFly: false },
  stats: { HP: 15, AD: 2, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  abilities: [1, 2, 3, 4].map((slot) => ({ ...gojoAbilities[0], id: `probe-${slot}`, slot: slot as Ability["slot"] })),
};
cartridge.world.rooms.forEach((room, i) => {
  const target = room.isBossRoom ? TILES.BOSS : TILES.EXIT;
  if (!canReach(room, peppaProbe, target)) problems.push(`world.rooms.${i} (${room.id}): Peppa's movement cannot reach "${target}"`);
});

// Props stand on something and never hide the spawn, exit, boss, enemies or NPCs; NPCs stand on the ground.
const propById = new Map(props.map((p) => [p.id, p]));
cartridge.world.rooms.forEach((room, i) => {
  const cell = (c: number, r: number) => room.layout[r]?.[c] ?? "#";
  for (const pl of room.props ?? []) {
    const p = propById.get(pl.prop)!;
    const wT = Math.ceil((p.size.w * RIG_SCALE) / TILE);
    const hT = Math.ceil((p.size.h * RIG_SCALE) / TILE);
    for (let c = pl.col; c < pl.col + wT; c++) {
      if (!"#=X".includes(cell(c, pl.row + 1))) {
        problems.push(`world.rooms.${i}: prop ${pl.prop} at (${pl.col},${pl.row}) has nothing under column ${c}`);
      }
      for (let r = pl.row - hT + 1; r <= pl.row; r++) {
        if ("SEB12345abc".includes(cell(c, r))) problems.push(`world.rooms.${i}: prop ${pl.prop} at (${pl.col},${pl.row}) covers "${cell(c, r)}" at (${c},${r})`);
      }
    }
  }
  room.layout.forEach((row, r) =>
    [...row].forEach((t, c) => {
      if ("abc".includes(t) && cell(c, r + 1) !== "#") problems.push(`world.rooms.${i}: NPC "${t}" at (${c},${r}) is not standing on the ground`);
    }),
  );
});

if (problems.length) {
  console.error(`✗ jjk-gojo has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

const out = path.join("content", "jjk-gojo.json");
mkdirSync("content", { recursive: true });
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`✓ wrote ${out}`);
for (const room of cartridge.world.rooms) console.log(`\n${room.name} (${room.layout[0].length} cols)\n${room.layout.join("\n")}`);
