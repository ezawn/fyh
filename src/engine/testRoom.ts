/** Hard-coded test session so the engine runs before content/ lands. */
import type { Session } from "./session";

// 14 rows × 60 cols. Legend: SPEC §4.5.
const layout = [
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

export const TEST_SESSION: Session = {
  character: {
    id: "test-hero",
    name: "Test Hero",
    collisionBox: { w: 10, h: 28 },
    movement: { speed: 140, jumpStrength: 380, canFly: false },
    stats: { HP: 100, AD: 10, AP: 0, ARM: 0, MR: 0, ARM_PEN: 0, MAGIC_PEN: 0 },
  },
  world: {
    id: "test-world",
    name: "Test World",
    visualStyle: {
      palette: { sky: "#5c94fc", skyBottom: "#a4c8ff", ground: "#8b5a2b", groundTop: "#3fa34d", platform: "#c08040", accent: "#ffd23f" },
      backdrop: "hills",
    },
    rooms: [{ id: "room-1", name: "Test Room", objective: "Reach the exit", layout, isBossRoom: false, exit: { toRoom: "END" } }],
  },
  dialogue: {
    roomIntro: [[{ speaker: "Test Hero", text: "Engine boot test. WASD to move, Space to jump." }]],
    bossIntro: [],
    bossDefeated: [],
    playerDefeated: [],
  },
};
