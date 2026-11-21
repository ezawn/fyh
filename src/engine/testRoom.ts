/** Hard-coded test session so the engine runs before content/ lands. */
import type { Ability, Rig, Session } from "./session";

// 14 rows × 60 cols. Legend: SPEC §4.5.
const room1 = [
  "............................................................",
  "............................................................",
  "............................................................",
  "............................................................",
  "...............................XXX..........................",
  "..........====.................................====.........",
  "............................................................",
  "......................=====..............=====..............",
  "...................................C........................",
  ".S..a.......1...........................2..............E....",
  "####...######.....######......####^^^^######......######....",
  "####...######.....######......##############......##########",
  "####^^^######^^^^^######^^^^^^##############^^^^^^##########",
  "############################################################",
];

const bossRoom = [
  "........................................",
  "........................................",
  "........................................",
  "........................................",
  "........................................",
  "........====..............====..........",
  "........................................",
  "........................................",
  "........................................",
  ".S...........................B..........",
  "########################################",
  "########################################",
  "########################################",
  "########################################",
];

// v1.1: human rig canvas is 32×64 rig px (drawn at RIG_SCALE 0.5).
const rig = (body: string, head: string): Rig => ({
  sizeClass: "human",
  parts: {
    head: [{ type: "circle", x: 16, y: 10, r: 8, color: head }],
    torso: [{ type: "rect", x: 10, y: 20, w: 12, h: 20, color: body }],
    armFront: [{ type: "rect", x: 20, y: 22, w: 4, h: 16, color: head }],
    armBack: [{ type: "rect", x: 8, y: 22, w: 4, h: 16, color: head }],
    legFront: [{ type: "rect", x: 16, y: 40, w: 6, h: 24, color: "#202060" }],
    legBack: [{ type: "rect", x: 10, y: 40, w: 6, h: 24, color: "#202060" }],
    extras: [],
  },
  pivots: { neck: [16, 18], shoulder: [16, 22], hip: [16, 40] },
});

const ab = (slot: 1 | 2 | 3 | 4, mechanic: Ability["mechanic"], extra: Partial<Ability> = {}): Ability => ({
  id: `test-${mechanic}`,
  name: `Test ${mechanic}`,
  slot,
  mechanic,
  damageType: "physical",
  attackTags: [],
  ratio: 1,
  range: 24,
  cooldown: 0.4,
  duration: 0.3,
  knockback: 150,
  animation: "punch",
  ...extra,
});

const stats = (HP: number, AD: number) => ({ HP, AD, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 });
const enemyAttack = { damageType: "physical" as const, ratio: 1, attackTags: [], range: 16, cooldown: 1 };

const dialogue: Session["dialogue"] = {
  roomIntro: [[{ speaker: "Test Hero", text: "Engine test room. WASD move, Space jump, click attack." }], [], []],
  bossIntro: [{ speaker: "Test Boss", text: "You shall not pass the test." }],
  bossDefeated: [{ speaker: "Test Boss", text: "Test passed." }],
  playerDefeated: [{ speaker: "Test Boss", text: "Test failed." }],
};

export const TEST_SESSION: Session = {
  character: {
    id: "test-hero",
    name: "Test Hero",
    source: "Engine",
    versionOrEpisode: "Test",
    assumptions: ["Test character"],
    rig: rig("#ff8c1a", "#f0c090"),
    collisionBox: { w: 10, h: 28 },
    movement: { speed: 140, jumpStrength: 420, canFly: true },
    stats: { ...stats(100, 10), AP: 10 },
    tags: ["FLIGHT"],
    abilities: [
      ab(1, "melee"),
      ab(2, "projectile", { damageType: "magic", attackTags: ["ENERGY"], range: 200, projectileSpeed: 300, animation: "shoot" }),
      ab(3, "dash", { range: 80, cooldown: 1 }),
      ab(4, "beam", { damageType: "magic", ratio: 3, range: 240, cooldown: 4, duration: 0.6, animation: "beam" }),
    ],
  },
  world: {
    id: "test-world",
    name: "Test World",
    source: "Engine",
    visualStyle: {
      palette: { sky: "#5c94fc", skyBottom: "#a4c8ff", ground: "#8b5a2b", groundTop: "#3fa34d", platform: "#c08040", accent: "#ffd23f" },
      backdrop: "hills",
    },
    npcs: [{ id: "test-npc", name: "Signpost Sam", rig: rig("#30a030", "#f0d0a0"), lines: [{ speaker: "Signpost Sam", text: "Hi! I'm a test NPC. The exit is to the right." }] }],
    props: [
      { id: "test-tree", name: "Tree", size: { w: 48, h: 80 }, layer: "back", shapes: [
        { type: "rect", x: 20, y: 40, w: 8, h: 40, color: "#6b4226" },
        { type: "circle", x: 24, y: 28, r: 22, color: "#2e8b3a" },
        { type: "circle", x: 16, y: 20, r: 8, color: "#45a84f" } ] },
      { id: "test-bush", name: "Bush", size: { w: 32, h: 16 }, layer: "front", shapes: [
        { type: "circle", x: 9, y: 9, r: 7, color: "#3a9a44" }, { type: "circle", x: 22, y: 8, r: 8, color: "#2e8b3a" } ] },
    ],
    enemies: [
      { id: "test-walker", name: "Walker", rig: rig("#c03030", "#e0a0a0"), collisionBox: { w: 10, h: 28 }, stats: stats(15, 2), tags: [], behaviour: "walker", speed: 40, attack: enemyAttack },
      { id: "test-flyer", name: "Flyer", rig: rig("#3030c0", "#a0a0e0"), collisionBox: { w: 10, h: 28 }, stats: stats(15, 2), tags: [], behaviour: "flyer", speed: 50, attack: enemyAttack },
    ],
    boss: {
      id: "test-boss", name: "Test Boss", rig: rig("#602080", "#d0a0f0"), collisionBox: { w: 14, h: 30 }, stats: stats(200, 8), tags: [],
      behaviour: "walker", speed: 60, attack: enemyAttack, pattern: ["charge", "jump", "shoot"], phaseAt: 0.5,
    },
    rooms: [
      { id: "room-1", name: "Test Room", objective: "Reach the exit", layout: room1, isBossRoom: false, exit: { toRoom: "room-2" }, props: [{ prop: "test-tree", col: 8, row: 9 }, { prop: "test-bush", col: 19, row: 9 }] },
      { id: "room-2", name: "Test Room 2", objective: "Reach the exit", layout: room1, isBossRoom: false, exit: { toRoom: "room-3" } },
      { id: "room-3", name: "Boss Arena", objective: "Defeat the Test Boss", layout: bossRoom, isBossRoom: true, exit: { toRoom: "END" } },
    ],
    dialogue,
  },
  dialogue,
  dialogueSource: "original",
};
