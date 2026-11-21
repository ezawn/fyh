/**
 * Builds the hand-finished demo cartridge content/peppa-muddy-puddles.json.
 * Run: npx tsx scripts/content/peppa.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROOM_ROWS, type Ability, type BossDef, type Cartridge, type CharacterDef, type EnemyDef, type Room, type Shape } from "../../src/shared/schema";
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
// Character: Peppa
// ---------------------------------------------------------------------------

const PINK = "#f7a1c4";
const PINK_DARK = "#d9668f";
const CHEEK = "#ef6f9a";
const BLACK = "#141414";
const RED = "#e8202a";

/** A tiny piglet rig (12x16) facing right; used for Peppa and, recoloured, for George. */
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
  rig: {
    sizeClass: "tiny",
    parts: {
      head: [
        circle(5, 5, 4, PINK),
        circle(9.5, 4, 2, PINK),
        rect(8.5, 3.5, 1, 1, PINK_DARK),
        rect(10, 3.5, 1, 1, PINK_DARK),
        rect(6, 3, 1, 1, BLACK),
        circle(5, 6.5, 1.2, CHEEK),
        rect(6, 8, 2, 1, PINK_DARK),
      ],
      torso: [rect(4, 9, 3, 1, RED), rect(3, 10, 5, 1, RED), rect(2, 11, 7, 2, RED)],
      armFront: [rect(6, 10, 1, 3, PINK)],
      armBack: [rect(4, 10, 1, 3, PINK_DARK)],
      legFront: [rect(6, 13, 1, 2, PINK), rect(6, 15, 2, 1, BLACK)],
      legBack: [rect(4, 13, 1, 2, PINK_DARK), rect(4, 15, 2, 1, BLACK)],
      extras: [{ attachTo: "head", shapes: [rect(2, 0, 2, 2, PINK), rect(5, 0, 2, 2, PINK)] }],
    },
    pivots: { neck: [5, 9], shoulder: [5, 10], hip: [5, 13] },
  },
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

const george: EnemyDef = {
  id: "george",
  name: "George",
  rig: {
    sizeClass: "tiny",
    parts: {
      head: [
        circle(5, 6, 3.5, PINK),
        circle(8.8, 5.5, 1.6, PINK),
        rect(8, 5, 1, 1, PINK_DARK),
        rect(9.5, 5, 1, 1, PINK_DARK),
        rect(6, 4, 1, 1, BLACK),
        circle(4.5, 7.5, 1, CHEEK),
      ],
      torso: [rect(3, 9.5, 5, 3.5, "#3a7bd5")],
      armFront: [rect(6, 10, 1, 3, PINK)],
      armBack: [rect(4, 10, 1, 3, PINK_DARK)],
      legFront: [rect(6, 13, 1, 2, PINK), rect(6, 15, 2, 1, BLACK)],
      legBack: [rect(4, 13, 1, 2, PINK_DARK), rect(4, 15, 2, 1, BLACK)],
      extras: [
        { attachTo: "head", shapes: [rect(3, 1.5, 1, 2, PINK), rect(5, 1.5, 1, 2, PINK)] },
        // Mr. Dinosaur, held in front
        { attachTo: "armFront", shapes: [rect(7, 11, 3, 2, "#3cb043"), rect(9, 9, 2, 2, "#3cb043")] },
      ],
    },
    pivots: { neck: [5, 9.5], shoulder: [5, 10], hip: [5, 13] },
  },
  collisionBox: { w: 9, h: 13 },
  stats: { HP: 10, AD: 1, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 70,
  attack: toddlerAttack,
};

const WOOL = "#f8f8f8";
const suzy: EnemyDef = {
  id: "suzy-sheep",
  name: "Suzy Sheep",
  rig: {
    sizeClass: "tiny",
    parts: {
      head: [circle(5, 5, 3.5, WOOL), circle(9, 5.5, 2, WOOL), rect(10, 4.5, 1, 1, "#e88aa8"), rect(6, 4, 1, 1, BLACK)],
      torso: [rect(4, 9, 3, 1, "#f49ac1"), rect(3, 10, 5, 1, "#f49ac1"), rect(2, 11, 7, 2, "#f49ac1")],
      armFront: [rect(6, 10, 1, 3, "#efe3d3")],
      armBack: [rect(4, 10, 1, 3, "#d8c9b6")],
      legFront: [rect(6, 13, 1, 2, "#efe3d3"), rect(6, 15, 2, 1, BLACK)],
      legBack: [rect(4, 13, 1, 2, "#d8c9b6"), rect(4, 15, 2, 1, BLACK)],
      extras: [{ attachTo: "head", shapes: [circle(2.5, 2.5, 2, WOOL), circle(5, 1.8, 1.8, WOOL), circle(7.5, 2.5, 1.8, WOOL)] }],
    },
    pivots: { neck: [5, 9], shoulder: [5, 10], hip: [5, 13] },
  },
  collisionBox: { w: 10, h: 14 },
  stats: { HP: 12, AD: 1, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 90,
  attack: toddlerAttack,
};

const DOG = "#c9a27a";
const danny: EnemyDef = {
  id: "danny-dog",
  name: "Danny Dog",
  rig: {
    sizeClass: "tiny",
    parts: {
      head: [circle(5, 5, 3.5, DOG), circle(8.8, 6, 2, "#e8d2b8"), circle(10.5, 5, 1, BLACK), rect(6, 3.5, 1, 1, BLACK)],
      torso: [rect(3, 9, 5, 4, "#f2c230")],
      armFront: [rect(6, 10, 1, 3, DOG)],
      armBack: [rect(4, 10, 1, 3, "#7a5230")],
      legFront: [rect(6, 13, 1, 2, DOG), rect(6, 15, 2, 1, BLACK)],
      legBack: [rect(4, 13, 1, 2, "#7a5230"), rect(4, 15, 2, 1, BLACK)],
      extras: [{ attachTo: "head", shapes: [rect(1, 2, 2, 5, "#7a5230")] }],
    },
    pivots: { neck: [5, 9], shoulder: [5, 10], hip: [5, 13] },
  },
  collisionBox: { w: 10, h: 14 },
  stats: { HP: 14, AD: 2, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 100,
  attack: { ...toddlerAttack, cooldown: 0.9 },
};

const SHIRT = "#2e6f6a";
const daddyPig: BossDef = {
  id: "daddy-pig",
  name: "Daddy Pig",
  rig: {
    sizeClass: "large",
    parts: {
      head: [circle(24, 13, 10, PINK), circle(35, 12, 5, PINK), circle(34, 11, 1, PINK_DARK), circle(37, 11, 1, PINK_DARK), circle(22, 18, 2, CHEEK)],
      torso: [circle(24, 32, 11, SHIRT)],
      armFront: [rect(30, 24, 4, 11, PINK)],
      armBack: [rect(14, 24, 4, 11, PINK_DARK)],
      legFront: [rect(26, 40, 4, 5, PINK), rect(26, 45, 7, 3, BLACK)],
      legBack: [rect(18, 40, 4, 5, PINK_DARK), rect(17, 45, 7, 3, BLACK)],
      extras: [
        { attachTo: "head", shapes: [rect(17, 1, 3, 4, PINK), rect(23, 0, 3, 4, PINK)] },
        // Round glasses with an eye dot
        { attachTo: "head", shapes: [circle(28, 9, 3, BLACK), circle(28, 9, 2, "#dff4ff"), circle(28.5, 9, 0.8, BLACK)] },
      ],
    },
    pivots: { neck: [24, 22], shoulder: [24, 25], hip: [24, 40] },
  },
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
      ["pillar", 8, 3, 1],
      ["pillar", 11, 3, 2],
      ["pillar", 14, 4, 3],
      ["pillar", 18, 3, 2],
      ["pillar", 21, 3, 1],
      ["put", "1", 26, 11],
      ["gap", 29, 30],
      ["plat", 9, 33, 37],
      ["put", "C", 40, 11],
      ["spikes", 43, 44],
      ["put", "2", 47, 11],
      ["pillar", 50, 3, 1],
      ["pillar", 53, 3, 2],
      ["pillar", 56, 2, 1],
      ["gap", 59, 61],
      ["put", "E", 63, 11],
    ]),
  },
  {
    id: "the-muddy-fields",
    name: "The Muddy Fields",
    objective: "Splash across the muddy fields",
    isBossRoom: false,
    exit: { toRoom: "the-biggest-muddy-puddle" },
    layout: buildLayout(70, [
      ["put", "S", 2, 11],
      ["plat", 9, 7, 11],
      ["put", "3", 14, 11],
      ["gap", 17, 19],
      ["pillar", 22, 4, 2],
      ["plat", 7, 26, 30],
      ["put", "1", 32, 11],
      ["put", "C", 35, 11],
      ["spikes", 38, 39],
      ["gap", 42, 44],
      ["pillar", 47, 3, 1],
      ["pillar", 50, 3, 2],
      ["pillar", 53, 3, 3],
      ["pillar", 56, 2, 1],
      ["put", "2", 60, 11],
      ["put", "E", 67, 11],
    ]),
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
    enemies: [george, suzy, danny],
    boss: daddyPig,
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
      "Suzy Sheep and Danny Dog are Peppa's friends from the series.",
    ],
    designChoices: [
      "Daddy Pig is the boss: his big puddle jump in the episode became a jump-and-charge boss fight.",
      "George, Suzy Sheep and Danny Dog are playful 'enemies'; Suzy and Danny are not in this episode.",
      "Spikes stand in for prickly thistles in the grass (the engine has only spikes as a hazard).",
      "Room order Peppa's Hill -> The Muddy Fields -> The Biggest Muddy Puddle is invented for the game.",
      "Push, Muddy Splash and Giggle Fit are invented abilities based on Peppa's playground behaviour.",
      "Danny Dog's yellow top and Suzy's pink dress are simplified colour choices for tiny sprites.",
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
  console.error(`\n✗ peppa-muddy-puddles\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const out = fileURLToPath(new URL("../../content/peppa-muddy-puddles.json", import.meta.url));
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`\n✓ wrote ${out}`);
