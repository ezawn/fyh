// Builds the hand-made sample cartridges in cartridges/. Run: npx tsx scripts/make-samples.ts
// These are the test fixtures every lane can build against before the AI works.
import { writeFile, mkdir } from "node:fs/promises";
import { Cartridge, checkCartridge, LEVEL_HEIGHT, type Sprite } from "../src/shared/cartridge";

// ---------- Sprites (16x16; "." transparent) ----------
const HUMAN = [
  "......hhhh......",
  ".....hhhhhh.....",
  ".....hssssh.....",
  ".....sesses.....",
  ".....ssssss.....",
  "......ssss......",
  "....cccccccc....",
  "...cccccccccc...",
  "...cs.cccc.sc...",
  "...ss.cccc.ss...",
  "......cccc......",
  "......pppp......",
  "......p..p......",
  "......p..p......",
  ".....bb..bb.....",
  ".....bb..bb.....",
];
const BAT = [
  "................",
  "................",
  "................",
  "................",
  "w......bb......w",
  "ww....bbbb....ww",
  "www..bbbbbb..www",
  "wwwwbbrbbrbbwwww",
  "wwwwwbbbbbbwwwww",
  ".www..bbbb..www.",
  "..w....bb....w..",
  "................",
  "................",
  "................",
  "................",
  "................",
];
const BEAST = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".ff.........ff..",
  ".fff.......fff..",
  ".ffffffffffffff.",
  "fffrffffffffrfff",
  "ffffffffffffffff",
  "fwfwfffffffffff.",
  ".ffffffffffffff.",
  "..ff..ff..ff.ff.",
  "..ff..ff..ff.ff.",
  "..ff..ff..ff.ff.",
  "................",
];
const GHOST = [
  "................",
  ".....gggggg.....",
  "....gggggggg....",
  "...gggggggggg...",
  "...ggkggggkgg...",
  "...ggkggggkgg...",
  "...gggggggggg...",
  "...gggkkkkggg...",
  "...gggggggggg...",
  "...gggggggggg...",
  "...gggggggggg...",
  "...gggggggggg...",
  "...gggggggggg...",
  "...g.gg.gg.gg...",
  "...g..g..g..g...",
  "................",
];

function sprite(pixels: string[], palette: Record<string, string>): Sprite {
  return { pixels, palette };
}

// ---------- Level builder ----------
// Starts with a flat ground floor, then you stamp features at columns.
class LevelGrid {
  rows: string[][];
  constructor(public width: number) {
    this.rows = Array.from({ length: LEVEL_HEIGHT }, (_, r) =>
      Array.from({ length: width }, () => (r >= LEVEL_HEIGHT - 2 ? "#" : ".")),
    );
  }
  set(col: number, row: number, ch: string) {
    this.rows[row][col] = ch;
    return this;
  }
  gap(from: number, len: number) {
    for (let c = from; c < from + len; c++) for (let r = LEVEL_HEIGHT - 2; r < LEVEL_HEIGHT; r++) this.rows[r][c] = ".";
    return this;
  }
  spikes(from: number, len: number) {
    for (let c = from; c < from + len; c++) this.rows[LEVEL_HEIGHT - 3][c] = "^";
    return this;
  }
  platform(from: number, len: number, row: number, ch = "=") {
    for (let c = from; c < from + len; c++) this.rows[row][c] = ch;
    return this;
  }
  pillar(col: number, height: number) {
    for (let r = LEVEL_HEIGHT - 2 - height; r < LEVEL_HEIGHT - 2; r++) this.rows[r][col] = "#";
    return this;
  }
  onGround(col: number, ch: string) {
    return this.set(col, LEVEL_HEIGHT - 3, ch);
  }
  done() {
    return this.rows.map((r) => r.join(""));
  }
}

const now = new Date("2026-11-21T12:00:00Z").toISOString();

// ---------- Cartridge 1: Dracula ----------
const dracula: Cartridge = {
  id: "dracula",
  title: "DRACULA: NIGHT OF THE COUNT",
  source: "Dracula (Bram Stoker, 1897)",
  createdAt: now,
  coverColor: "#8b1a1a",
  character: {
    id: "jonathan-harker",
    name: "Jonathan Harker",
    description: "A young solicitor armed with a crucifix and nerve he didn't know he had.",
    sprite: sprite(HUMAN, { h: "#4a2f1b", s: "#f1c9a5", e: "#1b1b1b", c: "#2e3a59", p: "#3b3b3b", b: "#1a1a1a" }),
    stats: { speed: 5, jump: 5, health: 4, damage: 3 },
    abilities: ["melee", "projectile"],
    attackName: "Thrown crucifix",
    powerLevel: 8,
    traits: ["human", "resourceful", "brave"],
  },
  world: {
    id: "castle-dracula",
    name: "Castle Dracula",
    description: "A crumbling Transylvanian castle crawling with bats and wolves.",
    palette: { sky: "#1a1030", ground: "#3d3d4a", platform: "#6b5b4a", accent: "#b3202a" },
    mood: "spooky",
    collectibleName: "Garlic",
    threatLevel: 40,
    enemies: [
      {
        id: "vampire-bat", name: "Vampire Bat", behaviour: "flyer", health: 1, damage: 1, speed: 6,
        sprite: sprite(BAT, { w: "#2b2b2b", b: "#4a4a4a", r: "#ff3030" }),
      },
      {
        id: "wolf", name: "Wolf", behaviour: "walker", health: 2, damage: 1, speed: 5,
        sprite: sprite(BEAST, { f: "#6e6e6e", r: "#ffcc00", w: "#ffffff" }),
      },
    ],
    boss: {
      name: "Count Dracula", health: 30, damage: 2, attacks: ["charge", "summon"],
      introLine: "Welcome to my house. Enter freely, and leave something of the happiness you bring.",
      defeatLine: "The sun... it rises...",
      sprite: sprite(HUMAN, { h: "#0d0d0d", s: "#e8e8e8", e: "#ff2020", c: "#1a0a0a", p: "#2a0a0a", b: "#000000" }),
    },
    levels: [
      {
        name: "The Borgo Pass",
        objective: "Reach the castle gate",
        intro: [
          { speaker: "Narrator", text: "Transylvania, 1893. A carriage leaves you at the Borgo Pass at midnight." },
          { speaker: "Jonathan", text: "The Count's letter said someone would meet me here..." },
        ],
        outro: [{ speaker: "Jonathan", text: "The gate opens by itself. Of course it does." }],
        isBossLevel: false,
        layout: new LevelGrid(64)
          .onGround(2, "P").onGround(10, "2").gap(16, 3).platform(14, 6, 8).onGround(8, "C")
          .set(16, 7, "C").set(26, 6, "1").spikes(30, 3).pillar(36, 3).onGround(42, "2")
          .platform(46, 5, 7).set(48, 6, "C").set(52, 5, "1").gap(54, 2).onGround(61, "G").done(),
      },
      {
        name: "The Castle Halls",
        objective: "Find the Count's crypt",
        intro: [{ speaker: "Jonathan", text: "The doors are all locked. Every one of them." }],
        outro: [{ speaker: "Jonathan", text: "Stone steps lead down. I can hear something breathing." }],
        isBossLevel: false,
        layout: new LevelGrid(72)
          .onGround(2, "P").platform(8, 5, 9).set(10, 8, "C").set(14, 5, "1").pillar(18, 2).onGround(22, "2")
          .gap(26, 4).platform(25, 6, 8).set(27, 7, "C").spikes(34, 4).set(38, 4, "1").platform(40, 6, 7)
          .onGround(48, "2").pillar(52, 4).platform(54, 5, 6).set(56, 5, "C").gap(60, 3).set(64, 5, "1").onGround(69, "G").done(),
      },
      {
        name: "The Crypt",
        objective: "Defeat Count Dracula",
        intro: [
          { speaker: "Dracula", text: "Welcome to my house. Enter freely." },
          { speaker: "Jonathan", text: "I know what you are." },
        ],
        outro: [{ speaker: "Narrator", text: "Dawn breaks over Transylvania. The Count is dust." }],
        isBossLevel: true,
        layout: new LevelGrid(40)
          .onGround(3, "P").platform(10, 5, 8).platform(25, 5, 8).set(12, 7, "C").set(27, 7, "C").onGround(32, "B").done(),
      },
    ],
  },
};

// ---------- Cartridge 2: Sherlock Holmes ----------
const holmes: Cartridge = {
  id: "hound-of-the-baskervilles",
  title: "SHERLOCK HOLMES: THE HOUND",
  source: "The Hound of the Baskervilles (Arthur Conan Doyle, 1902)",
  createdAt: new Date("2026-11-21T12:05:00Z").toISOString(),
  coverColor: "#2f4f3a",
  character: {
    id: "sherlock-holmes",
    name: "Sherlock Holmes",
    description: "The world's only consulting detective: quick, observant, and handy with a cane.",
    sprite: sprite(HUMAN, { h: "#5a4a32", s: "#f1c9a5", e: "#1b1b1b", c: "#6b5a3a", p: "#4a4030", b: "#2a1a10" }),
    stats: { speed: 6, jump: 4, health: 4, damage: 2 },
    abilities: ["melee", "dash"],
    attackName: "Cane strike",
    powerLevel: 10,
    traits: ["human", "genius", "observant"],
  },
  world: {
    id: "dartmoor",
    name: "Dartmoor",
    description: "Fog-soaked moorland, bottomless bogs and a hound that should not exist.",
    palette: { sky: "#3a4a4a", ground: "#4a5a3a", platform: "#7a6a4a", accent: "#e0c050" },
    mood: "mysterious",
    collectibleName: "Clue",
    threatLevel: 25,
    enemies: [
      {
        id: "bog-ghost", name: "Moor Wraith", behaviour: "flyer", health: 1, damage: 1, speed: 4,
        sprite: sprite(GHOST, { g: "#c8d8d8", k: "#1a2a2a" }),
      },
      {
        id: "convict", name: "Escaped Convict", behaviour: "jumper", health: 2, damage: 1, speed: 4,
        sprite: sprite(HUMAN, { h: "#3a3a3a", s: "#d9b08c", e: "#000000", c: "#e0e0e0", p: "#303030", b: "#101010" }),
      },
    ],
    boss: {
      name: "The Hound", health: 24, damage: 2, attacks: ["charge", "jump"],
      introLine: "A howl rolls across the moor. Something enormous is coming.",
      defeatLine: "Just a dog. A very large dog, painted with phosphorus.",
      sprite: sprite(BEAST, { f: "#1a1a1a", r: "#80ff60", w: "#80ff60" }),
    },
    levels: [
      {
        name: "Baskerville Hall",
        objective: "Gather clues around the estate",
        intro: [
          { speaker: "Holmes", text: "A gigantic hound, Watson? Then let us find its footprints." },
        ],
        outro: [{ speaker: "Holmes", text: "Mud from the Grimpen Mire. Our hound lives on the moor." }],
        isBossLevel: false,
        layout: new LevelGrid(60)
          .onGround(2, "P").onGround(8, "C").platform(12, 5, 9).set(14, 8, "C").onGround(20, "2").pillar(24, 2)
          .set(28, 6, "1").gap(32, 3).platform(31, 5, 8).spikes(38, 2).onGround(42, "C").onGround(46, "2")
          .platform(48, 5, 7).set(50, 6, "C").onGround(57, "G").done(),
      },
      {
        name: "The Grimpen Mire",
        objective: "Cross the mire without sinking",
        intro: [{ speaker: "Holmes", text: "One false step here and the bog keeps you forever." }],
        outro: [{ speaker: "Holmes", text: "Listen. That howl came from very close." }],
        isBossLevel: false,
        layout: new LevelGrid(70)
          .onGround(2, "P").gap(8, 4).platform(8, 4, 9).set(9, 8, "C").set(16, 6, "1").gap(18, 5).platform(18, 2, 8)
          .platform(21, 2, 7).onGround(26, "2").spikes(30, 3).gap(36, 6).platform(36, 3, 8).platform(40, 2, 6)
          .set(41, 5, "C").set(46, 5, "1").onGround(50, "2").gap(54, 4).platform(54, 4, 8).onGround(62, "C").onGround(67, "G").done(),
      },
      {
        name: "The Hound's Lair",
        objective: "Stop the Hound of the Baskervilles",
        intro: [
          { speaker: "Watson", text: "Holmes! Its jaws are glowing!" },
          { speaker: "Holmes", text: "Stay behind me, Watson." },
        ],
        outro: [{ speaker: "Holmes", text: "Elementary. The case of the Baskervilles is closed." }],
        isBossLevel: true,
        layout: new LevelGrid(40)
          .onGround(3, "P").platform(9, 4, 8).platform(27, 4, 8).set(10, 7, "C").set(28, 7, "C").onGround(33, "B").done(),
      },
    ],
  },
};

await mkdir("cartridges", { recursive: true });
for (const cart of [dracula, holmes]) {
  const problems = checkCartridge(cart);
  if (problems.length) {
    console.error(`${cart.id} is invalid:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  await writeFile(`cartridges/${cart.id}.json`, JSON.stringify(cart, null, 2) + "\n");
  console.log(`wrote cartridges/${cart.id}.json`);
}
