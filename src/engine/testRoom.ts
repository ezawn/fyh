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
  ".S..........1...........................2..............E....",
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

const rig = (body: string, head: string): Rig => ({
  sizeClass: "human",
  parts: {
    head: [{ type: "circle", x: 8, y: 5, r: 4, color: head }],
    torso: [{ type: "rect", x: 5, y: 10, w: 6, h: 10, color: body }],
    armFront: [{ type: "rect", x: 10, y: 11, w: 2, h: 8, color: head }],
    armBack: [{ type: "rect", x: 4, y: 11, w: 2, h: 8, color: head }],
    legFront: [{ type: "rect", x: 8, y: 20, w: 3, h: 12, color: "#202060" }],
    legBack: [{ type: "rect", x: 5, y: 20, w: 3, h: 12, color: "#202060" }],
    extras: [],
  },
  pivots: { neck: [8, 9], shoulder: [8, 11], hip: [8, 20] },
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
    enemies: [
      { id: "test-walker", name: "Walker", rig: rig("#c03030", "#e0a0a0"), collisionBox: { w: 10, h: 28 }, stats: stats(15, 2), tags: [], behaviour: "walker", speed: 40, attack: enemyAttack },
      { id: "test-flyer", name: "Flyer", rig: rig("#3030c0", "#a0a0e0"), collisionBox: { w: 10, h: 28 }, stats: stats(15, 2), tags: [], behaviour: "flyer", speed: 50, attack: enemyAttack },
    ],
    boss: {
      id: "test-boss", name: "Test Boss", rig: rig("#602080", "#d0a0f0"), collisionBox: { w: 14, h: 30 }, stats: stats(200, 8), tags: [],
      behaviour: "walker", speed: 60, attack: enemyAttack, pattern: ["charge", "jump", "shoot"], phaseAt: 0.5,
    },
    rooms: [
      { id: "room-1", name: "Test Room", objective: "Reach the exit", layout: room1, isBossRoom: false, exit: { toRoom: "room-2" } },
      { id: "room-2", name: "Test Room 2", objective: "Reach the exit", layout: room1, isBossRoom: false, exit: { toRoom: "room-3" } },
      { id: "room-3", name: "Boss Arena", objective: "Defeat the Test Boss", layout: bossRoom, isBossRoom: true, exit: { toRoom: "END" } },
    ],
    dialogue,
  },
  dialogue,
  dialogueSource: "original",
};
