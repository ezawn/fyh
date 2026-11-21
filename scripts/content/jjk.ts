// Builds the hand-finished Jujutsu Kaisen demo cartridge (docs/SPEC.md section 11).
// Run: npx tsx scripts/content/jjk.ts   -> writes content/jjk-gojo.json
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Ability, BossDef, Cartridge, CharacterDef, EnemyDef, Rig, Room, Shape } from "../../src/shared/schema";
import { ROOM_ROWS, TILES } from "../../src/shared/schema";
import { canReach, validateCartridge } from "../../src/shared/validate";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number, color: string): Shape => ({ type: "rect", x, y, w, h, color });
const circle = (x: number, y: number, r: number, color: string): Shape => ({ type: "circle", x, y, r, color });

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
// Gojo
// ---------------------------------------------------------------------------

const GOJO = {
  hair: "#f4f6fb",
  hairShade: "#c9d3e3",
  skin: "#f2d8c6",
  blindfold: "#0e0e14",
  uniform: "#1b2036",
  uniformDark: "#11152a",
  shoe: "#050507",
};

const gojoRig: Rig = {
  sizeClass: "tall", // 16x40
  parts: {
    head: [rect(5, 4, 6, 7, GOJO.skin)],
    torso: [
      rect(4, 11, 8, 14, GOJO.uniform),
      rect(5, 10, 6, 3, GOJO.uniformDark), // high collar
      rect(7, 13, 2, 10, GOJO.uniformDark), // button line
    ],
    armFront: [rect(6, 12, 4, 12, GOJO.uniform), rect(6, 24, 4, 2, GOJO.skin)],
    armBack: [rect(6, 12, 4, 12, GOJO.uniformDark), rect(6, 24, 4, 2, GOJO.skin)],
    legFront: [rect(8, 25, 3, 13, GOJO.uniform), rect(8, 38, 4, 2, GOJO.shoe)],
    legBack: [rect(5, 25, 3, 13, GOJO.uniformDark), rect(4, 38, 4, 2, GOJO.shoe)],
    extras: [
      {
        // White spiky hair: a cap over the head plus spikes sticking up
        attachTo: "head",
        shapes: [
          rect(4, 2, 8, 3, GOJO.hair),
          rect(3, 1, 2, 3, GOJO.hair),
          rect(6, 0, 2, 3, GOJO.hair),
          rect(9, 0, 2, 3, GOJO.hair),
          rect(11, 1, 2, 3, GOJO.hair),
          rect(3, 3, 1, 3, GOJO.hair),
          rect(12, 3, 1, 3, GOJO.hair),
          rect(7, 1, 1, 3, GOJO.hairShade),
          rect(10, 2, 1, 2, GOJO.hairShade),
        ],
      },
      {
        // Thick black blindfold band across the eyes
        attachTo: "head",
        shapes: [rect(4, 5, 8, 3, GOJO.blindfold)],
      },
    ],
  },
  pivots: { neck: [8, 11], shoulder: [8, 13], hip: [8, 25] },
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
    "Near the top of the reference scale (between planet-level Goku and cosmic): stated to be the strongest sorcerer alive; Hollow Purple erases everything in its path.",
    "AP 6000 is far above AD 1500 because his power is cursed energy, not muscle; MR 3000 reflects his Six Eyes and cursed energy control.",
    "HP 30000 is 3x iconic Goku's, reflecting that in-universe almost nothing can touch him while Infinity is up.",
    "INFINITY tag: attacks without SPACE_BYPASS or NULLIFY never reach him. FLIGHT tag: he levitates freely in the series.",
    "Red is not its own slot: Hollow Purple stands in for Red + Blue combined. Teleport uses the engine's teleport mechanic.",
    "Lapse: Blue is an aoe with negative knockback, so it pulls enemies in.",
  ],
  rig: gojoRig,
  collisionBox: { w: 12, h: 38 },
  movement: { speed: 240, jumpStrength: 560, canFly: true },
  stats: { HP: 30000, AD: 1500, AP: 6000, ARM: 1500, MR: 3000, ARM_PEN: 200, MAGIC_PEN: 1000 },
  tags: ["INFINITY", "FLIGHT"],
  abilities: gojoAbilities,
};

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

const CURSE = {
  body: "#4b3b5e",
  bodyLight: "#6e5a88",
  teeth: "#e9e2c9",
  eye: "#d1294a",
  dark: "#1a1222",
};

const crawlingCurse: EnemyDef = {
  id: "crawling-curse",
  name: "Crawling Curse",
  rig: {
    sizeClass: "small", // 16x20
    parts: {
      head: [rect(3, 3, 10, 6, CURSE.bodyLight), rect(4, 7, 8, 2, CURSE.dark), rect(5, 7, 1, 1, CURSE.teeth), rect(7, 7, 1, 1, CURSE.teeth), rect(9, 7, 1, 1, CURSE.teeth), rect(11, 7, 1, 1, CURSE.teeth)],
      torso: [rect(2, 8, 12, 8, CURSE.body), rect(4, 10, 8, 2, CURSE.bodyLight)],
      armFront: [rect(9, 9, 2, 7, CURSE.body), rect(9, 16, 3, 1, CURSE.teeth)],
      armBack: [rect(5, 9, 2, 7, CURSE.dark), rect(4, 16, 3, 1, CURSE.teeth)],
      legFront: [rect(9, 15, 2, 5, CURSE.dark)],
      legBack: [rect(5, 15, 2, 5, CURSE.dark)],
      extras: [
        {
          attachTo: "head",
          shapes: [circle(5, 5, 1, CURSE.eye), circle(8, 4.5, 1.5, CURSE.eye), circle(11, 5, 1, CURSE.eye)],
        },
      ],
    },
    pivots: { neck: [8, 8], shoulder: [8, 10], hip: [8, 15] },
  },
  collisionBox: { w: 14, h: 16 },
  stats: { HP: 300, AD: 60, AP: 0, ARM: 40, MR: 30, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "walker",
  speed: 70,
  attack: { damageType: "physical", ratio: 1, attackTags: ["PHYSICAL"], range: 20, cooldown: 1.2 },
};

const EYE = { white: "#efe9dc", iris: "#c4203f", pupil: "#0b0a10", flesh: "#6b3f66", vein: "#a8324e" };

const eyeballCurse: EnemyDef = {
  id: "eyeball-curse",
  name: "Floating Eyeball Curse",
  rig: {
    sizeClass: "small",
    parts: {
      head: [circle(8, 8, 6, EYE.white), circle(9, 8, 3, EYE.iris), circle(9, 8, 1.5, EYE.pupil)],
      torso: [rect(6, 13, 4, 3, EYE.flesh)],
      armFront: [rect(11, 11, 3, 2, EYE.flesh)],
      armBack: [rect(2, 11, 3, 2, EYE.flesh)],
      legFront: [rect(9, 15, 1, 5, EYE.flesh)],
      legBack: [rect(6, 15, 1, 4, EYE.flesh)],
      extras: [{ attachTo: "head", shapes: [rect(3, 6, 2, 1, EYE.vein), rect(4, 10, 2, 1, EYE.vein), rect(6, 3, 2, 1, EYE.vein)] }],
    },
    pivots: { neck: [8, 13], shoulder: [8, 12], hip: [8, 15] },
  },
  collisionBox: { w: 12, h: 12 },
  stats: { HP: 200, AD: 0, AP: 80, ARM: 10, MR: 40, ARM_PEN: 0, MAGIC_PEN: 0 },
  tags: [],
  behaviour: "flyer",
  speed: 90,
  attack: { damageType: "magic", ratio: 1, attackTags: ["ENERGY"], range: 160, cooldown: 1.8 },
};

const FB = { body: "#5b6b4e", dark: "#3a4632", bone: "#ddd5b6", mouth: "#9e1f39", eye: "#f0e45a" };

const fingerBearer: EnemyDef = {
  id: "finger-bearer",
  name: "Finger Bearer",
  rig: {
    sizeClass: "human", // 16x32
    parts: {
      head: [rect(3, 5, 10, 8, FB.body), rect(4, 9, 8, 3, FB.mouth), rect(5, 9, 1, 1, FB.bone), rect(7, 9, 1, 1, FB.bone), rect(9, 9, 1, 1, FB.bone), rect(11, 9, 1, 1, FB.bone), rect(5, 6, 2, 2, FB.eye), rect(9, 6, 2, 2, FB.eye)],
      torso: [rect(3, 12, 10, 11, FB.body), rect(5, 14, 6, 6, FB.dark)],
      armFront: [rect(7, 13, 3, 12, FB.body), rect(7, 25, 1, 3, FB.bone), rect(9, 25, 1, 3, FB.bone)],
      armBack: [rect(6, 13, 3, 12, FB.dark), rect(6, 25, 1, 3, FB.bone)],
      legFront: [rect(8, 23, 3, 9, FB.body)],
      legBack: [rect(5, 23, 3, 9, FB.dark)],
      extras: [
        {
          // Fingers growing out of its head
          attachTo: "head",
          shapes: [rect(4, 1, 2, 4, FB.bone), rect(7, 0, 2, 5, FB.bone), rect(10, 2, 2, 3, FB.bone)],
        },
      ],
    },
    pivots: { neck: [8, 12], shoulder: [8, 14], hip: [8, 23] },
  },
  collisionBox: { w: 14, h: 30 },
  stats: { HP: 500, AD: 40, AP: 120, ARM: 60, MR: 80, ARM_PEN: 0, MAGIC_PEN: 20 },
  tags: [],
  behaviour: "shooter",
  speed: 40,
  attack: { damageType: "magic", ratio: 1.2, attackTags: ["ENERGY"], range: 240, cooldown: 2.2 },
};

// ---------------------------------------------------------------------------
// Boss: Sukuna in Yuji's body
// ---------------------------------------------------------------------------

const SK = {
  hair: "#e58fa0",
  skin: "#efc8a6",
  mark: "#2b1215",
  eye: "#c8102e",
  uniform: "#1d2033",
  hood: "#b3202c",
  shoe: "#0a0a0d",
};

const sukuna: BossDef = {
  id: "sukuna-yuji",
  name: "Sukuna (in Yuji's body)",
  rig: {
    sizeClass: "human", // 16x32
    parts: {
      head: [
        rect(4, 3, 8, 8, SK.skin),
        rect(5, 6, 2, 1, SK.eye),
        rect(9, 6, 2, 1, SK.eye),
        rect(5, 8, 2, 1, SK.mark), // second pair of "eyes" under the first
        rect(9, 8, 2, 1, SK.mark),
        rect(7, 10, 2, 1, SK.mark), // grin
      ],
      torso: [rect(4, 11, 8, 10, SK.uniform), rect(4, 11, 8, 2, SK.hood), rect(5, 13, 1, 3, SK.hood)],
      armFront: [rect(6, 12, 4, 9, SK.uniform), rect(6, 21, 4, 2, SK.skin), rect(6, 18, 4, 1, SK.mark)],
      armBack: [rect(6, 12, 4, 9, SK.uniform), rect(6, 21, 4, 2, SK.skin)],
      legFront: [rect(8, 21, 3, 9, SK.uniform), rect(8, 30, 4, 2, SK.shoe)],
      legBack: [rect(5, 21, 3, 9, SK.uniform), rect(4, 30, 4, 2, SK.shoe)],
      extras: [
        {
          // Yuji's pink spiky hair
          attachTo: "head",
          shapes: [
            rect(4, 1, 8, 3, SK.hair),
            rect(3, 0, 2, 3, SK.hair),
            rect(7, 0, 2, 2, SK.hair),
            rect(11, 0, 2, 3, SK.hair),
            rect(3, 3, 1, 2, SK.hair),
            rect(12, 3, 1, 2, SK.hair),
          ],
        },
        {
          // Sukuna's face markings
          attachTo: "head",
          shapes: [rect(4, 7, 1, 3, SK.mark), rect(11, 7, 1, 3, SK.mark), rect(6, 4, 4, 1, SK.mark)],
        },
      ],
    },
    pivots: { neck: [8, 11], shoulder: [8, 13], hip: [8, 21] },
  },
  collisionBox: { w: 12, h: 30 },
  stats: { HP: 15000, AD: 2000, AP: 3000, ARM: 1000, MR: 1500, ARM_PEN: 200, MAGIC_PEN: 300 },
  tags: ["REGENERATION"],
  behaviour: "walker",
  speed: 150,
  attack: { damageType: "mixed", ratio: 1.5, attackTags: ["ENERGY"], range: 120, cooldown: 1.5 },
  pattern: ["charge", "shoot", "jump"],
  phaseAt: 0.4,
};

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function schoolGrounds(): Room {
  const g = new Grid(70);
  g.put(2, F, TILES.SPAWN);
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
  g.put(67, F, TILES.EXIT);
  return {
    id: "school-grounds",
    name: "Sugisawa High School Grounds",
    objective: "Cross the school grounds and get inside",
    layout: g.rows(),
    isBossRoom: false,
    exit: { toRoom: "haunted-corridors" },
  };
}

function hauntedCorridors(): Room {
  const g = new Grid(72);
  g.ceiling(1);
  g.put(2, F, TILES.SPAWN);
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
  g.put(69, F, TILES.EXIT);
  return {
    id: "haunted-corridors",
    name: "Haunted Corridors",
    objective: "Follow the cursed energy up to the roof",
    layout: g.rows(),
    isBossRoom: false,
    exit: { toRoom: "the-rooftop" },
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
    enemies: [crawlingCurse, eyeballCurse, fingerBearer],
    boss: sukuna,
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
        [
          { speaker: "Gojo", text: "Up on the roof? Let's see who's really in charge of that body." },
        ],
      ],
      bossIntro: [
        { speaker: "Sukuna", text: "So you're this era's strongest. Entertain me before the brat takes his body back." },
        { speaker: "Gojo", text: "Ten seconds. If Yuji's still in there, he can come back after." },
      ],
      bossDefeated: [
        { speaker: "Sukuna", text: "Tch. Enjoy it while it lasts, sorcerer." },
        { speaker: "Gojo", text: "Welcome back, Yuji. You're going to need a lot of training." },
      ],
      playerDefeated: [
        { speaker: "Sukuna", text: "The strongest? Don't make me laugh. Come back with a real technique." },
      ],
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
    ],
    designChoices: [
      "Gojo is played in his iconic form; Hollow Purple and teleport are shown later than episodes 1-2.",
      "The three rooms (school grounds, corridors, rooftop) and the rooftop showdown are invented for the game.",
      "Enemies are generic low-grade curses (crawler, floating eyeball, finger bearer), not specific named curses from episodes 1-2.",
      "Sukuna is the boss; his attacks are mixed damage with ENERGY tags, so Gojo's Infinity makes him immune to them.",
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

if (problems.length) {
  console.error(`✗ jjk-gojo has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

const out = path.join("content", "jjk-gojo.json");
mkdirSync("content", { recursive: true });
writeFileSync(out, JSON.stringify(cartridge, null, 2) + "\n");
console.log(`✓ wrote ${out}`);
for (const room of cartridge.world.rooms) console.log(`\n${room.name} (${room.layout[0].length} cols)\n${room.layout.join("\n")}`);
