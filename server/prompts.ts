/**
 * SERVER LANE. Cortex prompts (SPEC 8.2, 8.3, 5.6). Bounds and legends come from
 * src/shared/schema.ts constants so the prompt can't drift from the validator.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  GRAVITY,
  MAX_DIALOGUE_CHARS,
  MAX_STAT,
  RIG_SIZES,
  ROOM_MAX_COLS,
  ROOM_MIN_COLS,
  ROOM_ROWS,
  ROOMS_PER_WORLD,
  TIER_BANDS,
  TILE,
  type CharacterDef,
  type WorldDef,
} from "../src/shared/schema";

// ---------------------------------------------------------------------------
// Shared rule blocks
// ---------------------------------------------------------------------------

/** SPEC 5.3: the anchors every cartridge is placed against. */
export const REFERENCE_SCALE = `| Tier | Example | HP | AD | AP | ARM | MR |
|---|---|---|---|---|---|---|
| Toddler / cartoon civilian | Peppa Pig | 15 | 2 | 0 | 0 | 0 |
| Ordinary adult | a security guard | 50 | 8 | 0 | 5 | 0 |
| Peak human | John Wick | 120 | 45 | 0 | 15 | 5 |
| Street-level super | Spider-Man | 600 | 150 | 0 | 80 | 20 |
| City-level | a strong sorcerer | 3,000 | 300 | 600 | 200 | 300 |
| Planet-level | Goku (iconic) | 10,000 | 1,000 | 1,000 | 800 | 800 |
| Cosmic | multiverse-level beings | 100,000+ | 10,000+ | 10,000+ | 5,000+ | 5,000+ |`;

/** The powerTier values and the stat band each one allows (validateCartridge enforces these). */
export const TIER_RULES = Object.entries(TIER_BANDS)
  .map(([tier, b]) => `- "${tier}": HP ${b.hp[0]}–${b.hp[1]}, main attack max(AD, AP) ${b.atk[0]}–${b.atk[1]} (e.g. ${b.example})`)
  .join("\n");

const rigSizes = Object.entries(RIG_SIZES)
  .map(([k, v]) => `${k} ${v.w}x${v.h}`)
  .join(", ");

export const SCHEMA_RULES = `
## Schema rules (the engine only understands these; anything else is ignored or rejected)

### Character (the ONE playable protagonist)
- ids are kebab-case (lowercase letters, digits, single hyphens), e.g. "count-orlok". Every id unique within the cartridge.
- "assumptions": 1-8 short strings. Must include: which version of the character you used and why, the reference-scale tier and why, and any ability mapped to the closest mechanic.
- movement.speed 60-400 px/s, movement.jumpStrength 200-900 px/s (gravity is ${GRAVITY} px/s^2; jump height in tiles = jumpStrength^2 / (2*${GRAVITY}) / ${TILE}), movement.canFly boolean.
- collisionBox { w, h } in px, 4-96 each, roughly matching the rig size (a human is about 12x30).
- Exactly 4 abilities, in slot order: slot 1 basic attack, slot 2 special, slot 3 movement, slot 4 ultimate.

### Ability fields
- mechanic, one of:
  - "melee": hitbox in front of the player toward the mouse; uses range (px).
  - "projectile": fires toward the mouse; needs projectileSpeed (50-2000 px/s) and range.
  - "beam": instant long hitbox toward the mouse for "duration" seconds; uses range.
  - "aoe": circle around the player, radius = range. Negative knockback pulls.
  - "dash": fast move toward the mouse with i-frames during "duration".
  - "teleport": instant move to the mouse within range.
  - "flight": toggle free WASD movement for "duration" seconds (> 0).
  - "superJump": next jump is multiplied by ratio (ratio must be > 1).
  If a real ability doesn't fit, pick the closest mechanic and say so in assumptions.
- damageType: "physical" (scales with AD), "magic" (scales with AP), "mixed" (half each). You decide per attack.
- ratio 0-10 (multiplier on AD/AP), range 0-1600 px, cooldown 0-60 s, duration 0-30 s, knockback -1000..2000 px/s.
- attackTags: up to 3 of BALLISTIC, PHYSICAL, ENERGY, SPACE_BYPASS, NULLIFY.
- animation: punch | kick | cast | shoot | swing | beam.

### Damage formula (deterministic, never rebalanced)
physical = AD * ratio * 100 / (100 + max(0, target.ARM - attacker.ARM_PEN))
magic    = AP * ratio * 100 / (100 + max(0, target.MR - attacker.MAGIC_PEN))
mixed    = half of each

### Stats (every character, enemy and boss)
HP (1-${MAX_STAT}), AD, AP, ARM, MR, ARM_PEN, MAGIC_PEN (all >= 0, uncapped up to ${MAX_STAT}).

### Hax tags (only these exist; only add one when the source clearly justifies it)
| Target has | Effect | Bypassed by attack tag |
|---|---|---|
| INFINITY | takes 0 damage and 0 knockback | SPACE_BYPASS, NULLIFY |
| BULLETPROOF | takes 0 damage from BALLISTIC attacks | NULLIFY, or attacker ARM_PEN >= target ARM x 2 |
| INTANGIBLE | takes 0 damage from physical damage type | NULLIFY |
| REGENERATION | heals 2% max HP per second when not hit for 2 s | n/a |
| FLIGHT | may use flight-mechanic abilities | n/a |

### Rig (appearance, built from coloured shapes)
- sizeClass and canvas size in px: ${rigSizes}.
- parts: head, torso, armFront, armBack, legFront, legBack (arrays of shapes), extras: up to 8 { attachTo: head|torso|armFront, shapes } for hair, capes, weapons, tails.
- shape: { type: "rect", x, y, w, h, color } or { type: "circle", x, y, r, color }; colours "#rrggbb". EVERY shape must lie fully inside the canvas (0..w, 0..h). Circles: x-r >= 0, x+r <= w, etc.
- pivots: neck, shoulder, hip as [x, y] inside the canvas.
- Very simple but recognisable: a few shapes per part, iconic colours and silhouette.

### World
- visualStyle.palette: sky, skyBottom, ground, groundTop, platform, accent ("#rrggbb"). backdrop: hills | mountains | forest | city | school | interior | void.
- enemies: 1-3 types. Each: id, name, rig, collisionBox, stats, tags, behaviour (walker | jumper | flyer | shooter), speed 0-400, attack { damageType, ratio 0-10, attackTags, range, cooldown 0.2-30 }.
- boss: same fields plus pattern (1-3 of charge | jump | shoot | beam | summon, cycled) and phaseAt (0-1; below that HP fraction it speeds up).
- Exactly ${ROOMS_PER_WORLD} rooms; the last is the boss room.
- dialogue: roomIntro (exactly ${ROOMS_PER_WORLD} lists, one per room, max 3 lines each), bossIntro, bossDefeated, playerDefeated (max 3 lines each). Each line { speaker, text }, text at most ${MAX_DIALOGUE_CHARS} characters. Characters speak in their own voice.

### Rooms (tile grid, ${TILE}x${TILE} px tiles)
- layout: exactly ${ROOM_ROWS} strings, all the SAME width, ${ROOM_MIN_COLS}-${ROOM_MAX_COLS} characters. Row 0 is the top.
- Tile legend:
  "." empty | "#" ground (solid) | "=" one-way platform | "X" destructible block | "^" spikes
  "S" player spawn (exactly one per room) | "E" exit (exactly one per non-boss room, none in the boss room)
  "C" checkpoint (optional) | "1","2","3" enemy spawn of enemies[0], [1], [2] (only for enemies that exist)
  "B" boss spawn (exactly one, boss room only)
- Non-boss rooms: exit.toRoom = the id of the next room. Boss room: isBossRoom true, exit.toRoom "END".
- No softlocks: the player must be able to walk and jump from S to E (or to B) with the character's own jump height. Keep gaps and steps small (1-3 tiles high), put a solid floor row at the bottom, and put S and E/B standing on ground.
- Room ids like "room-1", "room-2", "room-3".

### Notes
- notes.sourceFacts: things that really are in the source.
- notes.designChoices: things you invented for the game (e.g. "the boss is a design choice").
`;

export const HONESTY_RULES = `
## Honesty rules (most important)
- If the title is ambiguous (several films/series/episodes fit and the choice matters), return outcome "needs_clarification" with a short "question", e.g. "Which adaptation do you mean: Nosferatu (1922) or another Dracula film?". Do not include a cartridge.
- If you don't know the source, return outcome "unknown_source" with a "message" saying so. Never invent episode details, plot points or characters you aren't sure about.
- If the requested character isn't in that source, return "needs_clarification" asking which character they meant.
- Put real facts from the source in notes.sourceFacts and invented game-design choices in notes.designChoices. Be honest about which is which.
- Use the iconic version of the character (their best-known powers and look), and record that in the character's assumptions. The world (rooms, enemies, boss) follows the requested film/episode.
`;

export const SCALE_RULES = `
## Reference scale (anchors shared by every cartridge in the library)
Place the character AND every enemy and the boss on this scale, so separately generated cartridges are comparable.
${REFERENCE_SCALE}
Interpolate between tiers. Keep canonical strength: never weaken or boost anyone to make the fight fair.
Every character, enemy and boss MUST have a "powerTier" field. Pick the tier that matches the source material, then keep its stats inside that tier's band:
${TIER_RULES}
In the character's assumptions, state its tier and why (e.g. "Peak human: a skilled fighter with no superpowers").
Explain the enemy and boss placements in notes.designChoices.
`;

// ---------------------------------------------------------------------------
// Example cartridge (loaded at runtime from content/, never hard-coded here)
// ---------------------------------------------------------------------------

let warnedMissingExample = false;

/** The example cartridge in GenerationOutput form, or null if the file isn't there. */
export function loadExample(): string | null {
  const file = path.resolve(process.env.EXAMPLE_CARTRIDGE ?? "content/peppa-muddy-puddles.json");
  if (!existsSync(file)) {
    if (!warnedMissingExample) {
      console.warn(`[generate] example cartridge ${file} not found: prompts will have no example`);
      warnedMissingExample = true;
    }
    return null;
  }
  try {
    const { id: _id, schemaVersion: _v, status: _s, createdAt: _c, ...cartridge } = JSON.parse(readFileSync(file, "utf8"));
    return JSON.stringify({ outcome: "cartridge", cartridge });
  } catch (err) {
    console.warn(`[generate] example cartridge ${file} unreadable (${(err as Error).message}): prompts will have no example`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function generationPrompt(title: string, character: string, example: string | null): string {
  return `You design cartridges for a retro 2D platformer engine.

## Task
If this film/episode got an official licensed retro platformer, what would it look like?
Title (as the user typed it): ${JSON.stringify(title)}
Main character (as the user typed it): ${JSON.stringify(character)}

Produce ONE playable protagonist (the requested character) and ONE world of ${ROOMS_PER_WORLD} rooms based on that film/episode, the last with a boss. Enemies and the boss stay in the world. Set cartridge.source.medium to film, tv or anime and source.versionOrEpisode to the specific film/episode you used.
${HONESTY_RULES}${SCHEMA_RULES}${SCALE_RULES}
${example ? `## Example of a complete, valid answer (a different source; copy its structure and level of detail, not its content)\n${example}\n` : ""}
## Output
Return a single JSON object matching the response schema: { "outcome": "cartridge", "cartridge": {...} }, or { "outcome": "needs_clarification", "question": "..." }, or { "outcome": "unknown_source", "message": "..." }.`;
}

export function repairPrompt(title: string, character: string, cartridgeJson: unknown, problems: string[]): string {
  return `You design cartridges for a retro 2D platformer engine. A cartridge you generated for
title ${JSON.stringify(title)} and character ${JSON.stringify(character)} failed validation.

Fix EVERY problem below with the smallest change that makes it valid. Keep everything else the same:
same character, same powers, same stats tier, same story. Don't weaken or rebalance anyone.

## Problems
${problems.map((p) => `- ${p}`).join("\n")}
${SCHEMA_RULES}
## Cartridge to fix
${JSON.stringify(cartridgeJson)}

## Output
Return { "outcome": "cartridge", "cartridge": {...the fixed cartridge...} } matching the response schema.`;
}

export function remixPrompt(character: CharacterDef, world: WorldDef, matchup: string[]): string {
  const brief = (c: CharacterDef) => ({
    name: c.name,
    source: c.source,
    versionOrEpisode: c.versionOrEpisode,
    assumptions: c.assumptions,
    stats: c.stats,
    tags: c.tags,
    abilities: c.abilities.map((a) => ({ name: a.name, mechanic: a.mechanic, damageType: a.damageType, attackTags: a.attackTags })),
  });
  const worldBrief = {
    name: world.name,
    source: world.source,
    rooms: world.rooms.map((r) => ({ name: r.name, objective: r.objective })),
    enemies: world.enemies.map((e) => ({ name: e.name, stats: e.stats, tags: e.tags })),
    boss: { name: world.boss.name, stats: world.boss.stats, tags: world.boss.tags },
    originalDialogue: world.dialogue,
  };
  return `A retro platformer lets any character play in any world. Write crossover flavour dialogue for this combination.
The fight, rooms, objectives, enemies and stats do NOT change; only the dialogue reacts to who showed up.

## Visiting character
${JSON.stringify(brief(character))}

## World
${JSON.stringify(worldBrief)}

## Computed matchup (from the real damage formula; treat as fact)
${matchup.map((m) => `- ${m}`).join("\n")}

## Rules
- Replace roomIntro (exactly ${world.rooms.length} lists, one per room, max 3 lines each), bossIntro, bossDefeated and playerDefeated (max 3 lines each).
- Each line { speaker, text }; text at most ${MAX_DIALOGUE_CHARS} characters. Speakers are the visiting character, the boss or world characters, in their own voices.
- React to the matchup: if the visitor massively outclasses the world, the locals panic or the visitor is bored; if the visitor is hopelessly outmatched, play up the danger; if hax blocks attacks, mention it.
- bossDefeated plays when the visitor wins, playerDefeated when the visitor loses. Keep it family-friendly and short.

Return JSON matching the response schema.`;
}
