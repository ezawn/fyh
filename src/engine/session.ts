/**
 * PROVISIONAL engine-side view of the session (SPEC §4, §7 POST /api/session).
 * Only the fields the engine reads today. Once src/shared/schema.ts lands on
 * main, these become re-exports of the shared types.
 */

export type Stats = { HP: number; AD: number; AP: number; ARM: number; MR: number; ARM_PEN: number; MAGIC_PEN: number };

export type DialogueLine = { speaker: string; text: string };

export type Room = {
  id: string;
  name: string;
  objective: string;
  layout: string[]; // 14 rows, equal width, legend SPEC §4.5
  isBossRoom: boolean;
  exit: { toRoom: string };
};

export type CharacterLike = {
  id: string;
  name: string;
  collisionBox: { w: number; h: number };
  movement: { speed: number; jumpStrength: number; canFly: boolean };
  stats: Stats;
  // rig, tags, abilities: added once the shared contract lands
};

export type WorldLike = {
  id: string;
  name: string;
  visualStyle: {
    palette: { sky: string; skyBottom: string; ground: string; groundTop: string; platform: string; accent: string };
    backdrop: string;
  };
  rooms: Room[];
};

export type DialogueSet = {
  roomIntro: DialogueLine[][];
  bossIntro: DialogueLine[];
  bossDefeated: DialogueLine[];
  playerDefeated: DialogueLine[];
};

export type Session = { character: CharacterLike; world: WorldLike; dialogue: DialogueSet };
