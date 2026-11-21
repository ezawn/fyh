/**
 * Builds the hand-finished demo cartridge content/dragon-ball-ep1-goku.json.
 * Run: npx tsx scripts/content/dragon-ball.ts
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
// Character: Goku (iconic)
// ---------------------------------------------------------------------------

const SKIN = "#f5c99b";
const HAIR = "#141414";
const GI = "#f07a1a";
const BLUE = "#1f4fbf";
const BOOT = "#14235c";

const goku: CharacterDef = {
  id: "goku",
  name: "Goku",
  source: "Dragon Ball",
  versionOrEpisode: "Iconic (Kamehameha, Nimbus, Power Pole)",
  assumptions: [
    "Uses the iconic adult Goku (Kamehameha, Flying Nimbus, Power Pole), not the episode-1 kid Goku.",
    "Planet-level on the reference scale: iconic Goku fights at planet-busting levels (Frieza-era and beyond), so he is the planet-level anchor.",
    "Stats are exactly the planet-level anchor (HP 10000, AD 1000, AP 1000, ARM 800, MR 800).",
    "Martial-arts hits are physical (AD); ki attacks (Ki Blast, Kamehameha) are magic damage with the ENERGY tag (AP).",
    "Small flat penetration (100) reflects his training to strike through guards and ki defences.",
    "Flight comes from the Flying Nimbus ability rather than innate flight, so canFly is false and he has no FLIGHT tag.",
    "The Power Pole is a visual/flavour reference only; the engine has no extending-staff mechanic.",
  ],
  rig: {
    sizeClass: "human",
    parts: {
      head: [circle(8, 7, 4, SKIN), rect(9, 6, 1, 2, HAIR)],
      torso: [rect(4, 11, 8, 9, GI), rect(7, 11, 2, 3, BLUE), rect(4, 18, 8, 2, BLUE)],
      armFront: [rect(8, 12, 3, 6, SKIN), rect(8, 18, 3, 2, BLUE), rect(8, 20, 3, 2, SKIN)],
      armBack: [rect(5, 12, 3, 6, SKIN), rect(5, 18, 3, 2, BLUE), rect(5, 20, 3, 2, SKIN)],
      legFront: [rect(8, 20, 3, 8, GI), rect(8, 28, 4, 4, BOOT)],
      legBack: [rect(5, 20, 3, 8, GI), rect(4, 28, 4, 4, BOOT)],
      extras: [
        {
          attachTo: "head",
          shapes: [
            rect(4, 2, 8, 3, HAIR), // crown
            rect(3, 4, 2, 4, HAIR), // side lock back
            rect(1, 3, 3, 2, HAIR), // spike out the back
            rect(0, 1, 2, 2, HAIR),
            rect(4, 0, 2, 2, HAIR), // spikes on top
            rect(7, 0, 2, 2, HAIR),
            rect(10, 0, 2, 2, HAIR),
            rect(11, 3, 3, 2, HAIR), // fringe spike to the front
          ],
        },
      ],
    },
    pivots: { neck: [8, 11], shoulder: [8, 13], hip: [8, 20] },
  },
  collisionBox: { w: 12, h: 30 },
  movement: { speed: 220, jumpStrength: 520, canFly: false },
  stats: { HP: 10000, AD: 1000, AP: 1000, ARM: 800, MR: 800, ARM_PEN: 100, MAGIC_PEN: 100 },
  tags: [],
  abilities: [
    { id: "punch", name: "Punch", slot: 1, mechanic: "melee", damageType: "physical", attackTags: ["PHYSICAL"], ratio: 1, range: 24, cooldown: 0.3, duration: 0, knockback: 200, animation: "punch" },
    { id: "ki-blast", name: "Ki Blast", slot: 2, mechanic: "projectile", damageType: "magic", attackTags: ["ENERGY"], ratio: 1.2, range: 300, cooldown: 0.6, duration: 0, projectileSpeed: 500, knockback: 150, animation: "cast" },
    { id: "flying-nimbus", name: "Flying Nimbus", slot: 3, mechanic: "flight", damageType: "physical", attackTags: [], ratio: 0, range: 0, cooldown: 6, duration: 4, knockback: 0, animation: "cast" },
    { id: "kamehameha", name: "Kamehameha", slot: 4, mechanic: "beam", damageType: "magic", attackTags: ["ENERGY"], ratio: 4, range: 380, cooldown: 8, duration: 0.6, knockback: 600, animation: "beam" },
  ],
};

// ---------------------------------------------------------------------------
// Enemies and boss
// ---------------------------------------------------------------------------

const WOLF = "#7a7a85";
const WOLF_DARK = "#4a4a55";
const wolf: EnemyDef = {
  id: "mountain-wolf",
  name: "Mountain Wolf",
  rig: {
    sizeClass: "small",
    parts: {
      head: [circle(13, 9, 3, WOLF), rect(14, 10, 2, 2, WOLF_DARK), rect(13, 8, 1, 1, "#e8d23a")],
      torso: [rect(2, 9, 11, 5, WOLF), rect(4, 12, 7, 2, "#c9c9cf")],
      armFront: [rect(11, 13, 2, 6, WOLF)],
      armBack: [rect(9, 13, 2, 6, WOLF_DARK)],
      legFront: [rect(4, 13, 2, 6, WOLF)],
      legBack: [rect(2, 13, 2, 6, WOLF_DARK)],
      extras: [
        { attachTo: "head", shapes: [rect(11, 5, 2, 2, WOLF_DARK), rect(14, 5, 1, 2, WOLF_DARK)] },
        { attachTo: "torso", shapes: [rect(0, 8, 3, 2, WOLF_DARK)] },
      ],
    },
    pivots: { neck: [12, 10], shoulder: [11, 13], hip: [4, 13] },
  },
  collisionBox: { w: 14, h: 12 },
  stats: { HP: 60, AD: 15, AP: 0, ARM: 5, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 120,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 18, cooldown: 1 },
};

const PTERO = "#b5651d";
const PTERO_DARK = "#7a3f12";
const pterodactyl: EnemyDef = {
  id: "pterodactyl",
  name: "Pterodactyl",
  rig: {
    sizeClass: "small",
    parts: {
      head: [circle(12, 6, 2, PTERO), rect(13, 6, 3, 1, "#e8c070"), rect(12, 5, 1, 1, "#141414")],
      torso: [rect(5, 7, 6, 4, PTERO)],
      armFront: [rect(8, 7, 8, 2, PTERO_DARK)],
      armBack: [rect(0, 7, 8, 2, PTERO_DARK)],
      legFront: [rect(8, 11, 1, 3, "#e8c070")],
      legBack: [rect(6, 11, 1, 3, "#e8c070")],
      extras: [{ attachTo: "head", shapes: [rect(9, 3, 3, 2, PTERO_DARK)] }],
    },
    pivots: { neck: [11, 7], shoulder: [8, 8], hip: [7, 11] },
  },
  collisionBox: { w: 14, h: 10 },
  stats: { HP: 50, AD: 12, AP: 0, ARM: 3, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "flyer",
  speed: 100,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 16, cooldown: 1.2 },
};

const TIGER = "#e08a2a";
const STRIPE = "#3a2410";
const sabreTooth: EnemyDef = {
  id: "sabre-tooth-tiger",
  name: "Sabre-tooth Tiger",
  rig: {
    sizeClass: "small",
    parts: {
      head: [circle(12, 9, 3, TIGER), rect(12, 11, 1, 3, "#f4f0e0"), rect(14, 11, 1, 3, "#f4f0e0"), rect(13, 8, 1, 1, STRIPE)],
      torso: [rect(1, 9, 11, 5, TIGER), rect(4, 9, 1, 4, STRIPE), rect(7, 9, 1, 4, STRIPE), rect(10, 9, 1, 3, STRIPE)],
      armFront: [rect(10, 13, 2, 6, TIGER)],
      armBack: [rect(8, 13, 2, 6, STRIPE)],
      legFront: [rect(3, 13, 2, 6, TIGER)],
      legBack: [rect(1, 13, 2, 6, STRIPE)],
      extras: [{ attachTo: "head", shapes: [rect(10, 5, 2, 2, TIGER), rect(13, 5, 2, 2, TIGER)] }],
    },
    pivots: { neck: [11, 10], shoulder: [10, 13], hip: [3, 13] },
  },
  collisionBox: { w: 14, h: 12 },
  stats: { HP: 120, AD: 30, AP: 0, ARM: 10, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "jumper",
  speed: 140,
  attack: { damageType: "physical", ratio: 1.2, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.1 },
};

const FUR = "#7a4a25";
const FUR_DARK = "#4e2e15";
const MUZZLE = "#d9b58a";
const bearThief: BossDef = {
  id: "bear-thief",
  name: "Bear Thief",
  rig: {
    sizeClass: "large",
    parts: {
      head: [circle(24, 12, 8, FUR), circle(29, 14, 4, MUZZLE), circle(32, 13, 1.5, "#141414"), rect(27, 9, 2, 2, "#141414")],
      torso: [rect(14, 19, 20, 15, FUR), rect(18, 22, 12, 10, MUZZLE)],
      armFront: [rect(22, 21, 6, 13, FUR), circle(25, 35, 3, FUR_DARK)],
      armBack: [rect(17, 21, 6, 13, FUR_DARK), circle(20, 35, 3, FUR_DARK)],
      legFront: [rect(25, 34, 7, 10, FUR), rect(25, 44, 9, 4, FUR_DARK)],
      legBack: [rect(16, 34, 7, 10, FUR_DARK), rect(14, 44, 9, 4, FUR_DARK)],
      extras: [
        { attachTo: "head", shapes: [circle(18, 5, 3, FUR), circle(30, 5, 3, FUR)] },
        // Big sword held upright in the front paw
        // Big sword held upright in the front paw, to the side so it doesn't cover the face
        { attachTo: "armFront", shapes: [rect(34, 10, 3, 23, "#c8c8d0"), rect(31, 33, 9, 2, FUR_DARK), rect(34, 35, 3, 3, FUR_DARK)] },
      ],
    },
    pivots: { neck: [24, 19], shoulder: [24, 21], hip: [24, 34] },
  },
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
      ["pillar", 9, 2, 1],
      ["pillar", 13, 2, 2],
      ["gap", 17, 19],
      ["plat", 9, 22, 27],
      ["put", "1", 30, 11],
      ["pillar", 34, 3, 3],
      ["put", "C", 40, 11],
      ["spikes", 44, 45],
      ["plat", 9, 47, 52],
      ["plat", 6, 53, 57],
      ["put", "2", 50, 4],
      ["gap", 58, 60],
      ["put", "1", 64, 11],
      ["put", "E", 69, 11],
    ]),
  },
  {
    id: "the-forest",
    name: "The Forest",
    objective: "Track the thief through the forest",
    isBossRoom: false,
    exit: { toRoom: "bear-thiefs-clearing" },
    layout: buildLayout(76, [
      ["put", "S", 2, 11],
      ["plat", 9, 8, 12],
      ["put", "1", 14, 11],
      ["gap", 17, 19],
      ["pillar", 22, 2, 2],
      ["plat", 8, 26, 31],
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
    enemies: [wolf, pterodactyl, sabreTooth],
    boss: bearThief,
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
      "Goku wears an orange gi with a blue belt, blue wristbands and dark boots, with spiky black hair.",
      "Pterodactyls and other giant prehistoric animals appear in Goku's wilderness in the early episodes.",
    ],
    designChoices: [
      "The playable Goku is the iconic adult version, not the child Goku of episode 1.",
      "The Bear Thief (a sword-wielding bear bandit) appears in the early episodes; making him the boss of this episode-1 world is a design choice.",
      "Room order Mount Paozu -> The Forest -> Bear Thief's Clearing is invented for the game.",
      "Wolves, a pterodactyl and a sabre-tooth tiger are the regular enemies, placed at animal/ordinary-adult tier on the reference scale.",
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
  console.error(`\n✗ dragon-ball-ep1-goku\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const out = fileURLToPath(new URL("../../content/dragon-ball-ep1-goku.json", import.meta.url));
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`\n✓ wrote ${out}`);
