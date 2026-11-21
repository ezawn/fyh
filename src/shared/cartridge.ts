/**
 * THE CONTRACT. Engine, AI and UI all build against this file.
 * Change it only on a branch, and tell the whole team first: everyone's code depends on it.
 *
 * A Cartridge = one playable retro game, made of a Character (who you play)
 * and a World (where you play). Characters and worlds are independent, so a
 * remix is just "character from cartridge A + world from cartridge B".
 */
import { z } from "zod";

// ---------- Sprites ----------
// A sprite is a 16x16 pixel grid. Each row is a 16-char string.
// "." is transparent; every other char is a key into `palette` (a hex colour).
export const SPRITE_SIZE = 16;

export const Sprite = z.object({
  palette: z.record(z.string().length(1), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  pixels: z.array(z.string().length(SPRITE_SIZE)).length(SPRITE_SIZE),
});
export type Sprite = z.infer<typeof Sprite>;

// ---------- Abilities ----------
// A fixed menu the engine implements. The AI only picks from this list.
export const Ability = z.enum([
  "doubleJump", // second jump in mid-air
  "projectile", // shoot a projectile forward (fireball, bullet, ki blast...)
  "melee", // short-range hit (punch, sword, whip...)
  "dash", // quick horizontal burst
  "glide", // hold jump to fall slowly
  "shield", // brief invulnerability
  "flight", // free vertical movement while held
]);
export type Ability = z.infer<typeof Ability>;

// ---------- Character ----------
export const Character = z.object({
  id: z.string(), // kebab-case, unique across the library, e.g. "van-helsing"
  name: z.string(),
  description: z.string(), // one sentence, shown in the remix picker
  sprite: Sprite,
  stats: z.object({
    speed: z.number().int().min(1).max(10),
    jump: z.number().int().min(1).max(10),
    health: z.number().int().min(1).max(10), // hits before dying
    damage: z.number().int().min(1).max(10),
  }),
  abilities: z.array(Ability).min(1).max(4),
  attackName: z.string(), // flavour text for the main attack, e.g. "Silver dagger"
  // How strong this character is relative to anything else, 1 (ordinary human)
  // to 100 (cosmic). Used by the remix powerscaling step.
  powerLevel: z.number().int().min(1).max(100),
  traits: z.array(z.string()).max(6), // e.g. ["human", "scholar", "stealthy"]
});
export type Character = z.infer<typeof Character>;

// ---------- Enemies ----------
export const EnemyBehaviour = z.enum(["walker", "jumper", "flyer", "shooter"]);
export type EnemyBehaviour = z.infer<typeof EnemyBehaviour>;

export const Enemy = z.object({
  id: z.string(),
  name: z.string(),
  sprite: Sprite,
  behaviour: EnemyBehaviour,
  health: z.number().int().min(1).max(10),
  damage: z.number().int().min(1).max(5),
  speed: z.number().int().min(1).max(10),
});
export type Enemy = z.infer<typeof Enemy>;

export const Boss = z.object({
  name: z.string(),
  sprite: Sprite,
  health: z.number().int().min(5).max(100),
  damage: z.number().int().min(1).max(5),
  attacks: z.array(z.enum(["charge", "jump", "shoot", "summon"])).min(1).max(3),
  introLine: z.string(),
  defeatLine: z.string(),
});
export type Boss = z.infer<typeof Boss>;

// ---------- Levels ----------
// Layout is an ASCII tile map: exactly LEVEL_HEIGHT rows, all the same width
// (between LEVEL_MIN_WIDTH and LEVEL_MAX_WIDTH chars). Legend:
//   "." empty    "#" solid ground    "=" one-way platform    "^" spikes (hurt)
//   "P" player start (exactly one)   "G" goal / exit (exactly one, not on boss level)
//   "C" collectible                  "B" boss spawn (boss level only, exactly one)
//   "1"-"3" enemy spawn: index+1 into world.enemies ("1" = enemies[0])
export const LEVEL_HEIGHT = 14;
export const LEVEL_MIN_WIDTH = 40;
export const LEVEL_MAX_WIDTH = 120;
export const TILE_CHARS = ".#=^PGCB123";

export const DialogueLine = z.object({
  speaker: z.string(),
  text: z.string().max(140),
});
export type DialogueLine = z.infer<typeof DialogueLine>;

export const Level = z.object({
  name: z.string(),
  objective: z.string(), // shown at level start, e.g. "Reach the castle gate"
  intro: z.array(DialogueLine).max(4), // cutscene before the level
  outro: z.array(DialogueLine).max(4), // cutscene after finishing it
  isBossLevel: z.boolean(),
  layout: z.array(z.string()).length(LEVEL_HEIGHT),
});
export type Level = z.infer<typeof Level>;

// ---------- World ----------
export const Mood = z.enum(["heroic", "spooky", "tense", "playful", "sad", "mysterious"]);
export type Mood = z.infer<typeof Mood>;

export const World = z.object({
  id: z.string(), // kebab-case, unique, e.g. "castle-dracula"
  name: z.string(),
  description: z.string(),
  palette: z.object({
    sky: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    platform: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  mood: Mood,
  collectibleName: z.string(), // e.g. "Garlic", "Clue"
  enemies: z.array(Enemy).min(1).max(3),
  boss: Boss,
  levels: z.array(Level).min(2).max(4), // the last one must be the boss level
  threatLevel: z.number().int().min(1).max(100), // how dangerous this world is; for powerscaling
});
export type World = z.infer<typeof World>;

// ---------- Cartridge ----------
export const Cartridge = z.object({
  id: z.string(), // kebab-case, unique
  title: z.string(), // e.g. "DRACULA: NIGHT OF THE COUNT"
  source: z.string(), // what it was adapted from, e.g. "Dracula (Bram Stoker, 1897)"
  createdAt: z.string(), // ISO 8601
  coverColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), // cartridge label colour in the library
  character: Character,
  world: World,
  // Set only on remixes: which cartridges the character and world came from,
  // and a one-line summary of how gameplay was adapted.
  remix: z
    .object({
      characterFrom: z.string(),
      worldFrom: z.string(),
      adaptationNote: z.string(),
    })
    .optional(),
});
export type Cartridge = z.infer<typeof Cartridge>;

// ---------- Extra checks zod can't express ----------
// Returns a list of problems; empty means the cartridge is valid.
export function checkCartridge(input: unknown): string[] {
  const parsed = Cartridge.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  }
  const cart = parsed.data;
  const problems: string[] = [];
  const spriteChecks: [string, Sprite][] = [
    ["character.sprite", cart.character.sprite],
    ["world.boss.sprite", cart.world.boss.sprite],
    ...cart.world.enemies.map((e, i): [string, Sprite] => [`world.enemies.${i}.sprite`, e.sprite]),
  ];
  for (const [path, s] of spriteChecks) {
    for (const row of s.pixels) {
      for (const ch of row) {
        if (ch !== "." && !(ch in s.palette)) problems.push(`${path}: pixel "${ch}" is not in the palette`);
      }
    }
  }
  const levels = cart.world.levels;
  levels.forEach((lvl, i) => {
    const p = `world.levels.${i}`;
    const width = lvl.layout[0]?.length ?? 0;
    if (width < LEVEL_MIN_WIDTH || width > LEVEL_MAX_WIDTH) problems.push(`${p}: width ${width} out of range`);
    lvl.layout.forEach((row, r) => {
      if (row.length !== width) problems.push(`${p}.layout.${r}: row width ${row.length}, expected ${width}`);
      for (const ch of row) if (!TILE_CHARS.includes(ch)) problems.push(`${p}.layout.${r}: unknown tile "${ch}"`);
    });
    const all = lvl.layout.join("");
    const count = (ch: string) => all.split(ch).length - 1;
    if (count("P") !== 1) problems.push(`${p}: needs exactly one P`);
    if (lvl.isBossLevel) {
      if (count("B") !== 1) problems.push(`${p}: boss level needs exactly one B`);
    } else if (count("G") !== 1) {
      problems.push(`${p}: needs exactly one G`);
    }
    for (let n = 1; n <= 3; n++) {
      if (count(String(n)) > 0 && n > cart.world.enemies.length) problems.push(`${p}: uses enemy ${n} but world has ${cart.world.enemies.length}`);
    }
  });
  const last = levels[levels.length - 1];
  if (!last?.isBossLevel) problems.push("world.levels: the last level must be the boss level");
  if (levels.slice(0, -1).some((l) => l.isBossLevel)) problems.push("world.levels: only the last level may be a boss level");
  return problems;
}
