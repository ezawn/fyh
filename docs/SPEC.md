# AI Retro Remix: Final Hackathon Spec

**Status:** v1, agreed 2026-11-21. Everyone builds against this. To change anything in sections 4–7, tell the whole team first.
**Time:** 3.5 hours of coding. **Team:** 3 people, each with Claude Code.

---

## 1. The product in one paragraph

A web app that turns a film, TV episode or anime into a short, playable retro platformer "cartridge". Each cartridge contains **one playable protagonist** and **one world** (3 rooms, the last with a boss). Characters and worlds are independent: like Terraria, you pick a character on a **character select screen** and a world on a **world select screen**, and play that combination. Characters keep their canonical strength. Superman one-shots Peppa Pig's world; Peppa gets one-shot in Dragon Ball's. The fight is never rebalanced and the mission never changes. The only adaptation is **AI-written flavour dialogue** that reacts to the matchup.

**Central demo:** pick Goku, enter Peppa Pig's world, and one-shot George. Pick Peppa, enter Dragon Ball's world, and get flattened. Pick Goku, fight Gojo's world, and watch his attacks hit Infinity and show `IMMUNE`.

---

## 2. Decisions (agreed)

| Topic | Decision |
|---|---|
| Unfair matchups | **Same fight, same objectives, same rooms.** Only dialogue changes (AI flavour text). Unwinnable matchups are allowed and intentional. |
| Stats | **Uncapped, League-of-Legends-style:** HP, AD, AP, ARM, MR, ARM_PEN, MAGIC_PEN. The AI picks the numbers, anchored to a reference scale (section 5.3) so cartridges stay comparable. |
| Damage type | The AI decides per attack: **physical (AD), magic (AP) or mixed.** |
| Hax | A small fixed set of **tags the engine enforces** (section 5.5). |
| AI provider | **Snowflake Cortex** (`AI_COMPLETE` with JSON-schema structured output), paid by trial credits. |
| Storage | **One shared library in a Snowflake table** (VARIANT column). No accounts. |
| Input | **Title + main character**, e.g. "Dragon Ball episode 1" + "Goku". Ambiguous or unknown titles get a clear clarification or error, never made-up details. |
| Character versions | **Iconic version per franchise** (Goku with Kamehameha, Gojo with Infinity and Hollow Purple), recorded in the character's `assumptions`. The world follows the chosen episode. |
| Roster | **One playable protagonist per cartridge.** Enemies and bosses stay in their world. |
| Controls | **WASD** move, **Space** jump, **mouse** aims, **left click** uses the selected ability, **1–4** select ability slot. |
| Ability slots | Every character has exactly 4: **1 basic, 2 special, 3 movement, 4 ultimate.** |
| Sprites | **Shape rigs, auto-animated:** characters are built from coloured shapes per body part. The engine animates them procedurally and renders at low resolution for a chunky pixel look. Claude Code hand-tunes the demo characters; Cortex writes the same format for new ones. |
| Music | **3 shared code-generated chiptune loops:** `STAGE`, `BOSS`, `STOMP`. |
| Platform | Web app: TypeScript, Vite + Phaser 3 front end, Node/Express server. |
| Demo cartridges (finished 100%) | **Goku** (Dragon Ball ep 1), **Peppa** (Peppa Pig "Muddy Puddles"), **Gojo** (Jujutsu Kaisen, opening arc). |
| IP | The team's call; we're using the real franchises. |

**Not in scope:** accounts, multiplayer, watching or analysing video, per-world generated music, more than one playable character per cartridge, mission or objective changes for mismatches, LLM calls during gameplay.

---

## 3. Architecture

```
Browser (Vite + Phaser)                      Server (Node/Express)                 Snowflake
┌──────────────────────────────┐   /api     ┌─────────────────────────┐   SQL    ┌──────────────────────────┐
│ UI: library, character       │ ─────────► │ routes                  │ ───────► │ AI_COMPLETE (Cortex)     │
│ select, world select,        │            │ generation + repair     │          │ RETRO.PUBLIC.CARTRIDGES  │
│ generate screen              │            │ validation (zod)        │          │ RETRO.PUBLIC.REMIX_LINES │
│ Engine: platformer, combat   │            │ Snowflake client        │          └──────────────────────────┘
│ resolver, rig animator,      │            │ (credentials in .env)   │
│ chiptune player              │            └─────────────────────────┘
└──────────────────────────────┘
```

- **All gameplay runs in the browser** at a fixed timestep. Combat is deterministic: no network or LLM calls during play.
- **Credentials live only in the server's `.env`.** The browser never sees Snowflake details.
- **One shared engine** reads cartridge data. The AI never generates code.
- **Validation is shared code** (`src/shared/`) used by the server before saving and by the engine before loading.

### Folders and owners

| Folder | Owner |
|---|---|
| `src/shared/` (schema, validation, damage formula, reference scale) | **Shared:** change only after telling the team |
| `src/engine/` (Phaser game, combat, rig renderer, abilities, music) | **Lane A: Engine** |
| `server/` (API, Cortex prompts, repair, Snowflake) | **Lane B: AI + Snowflake** |
| `src/ui/`, `src/main.ts`, `index.html`, `public/` | **Lane C: UI + Content** |
| `content/` (the 3 hand-finished demo cartridges as JSON) | **Lane C**, with Lane B seeding them into Snowflake |

---

## 4. Cartridge data model

The source of truth is code: `src/shared/schema.ts` (zod). The shapes below are what it must contain. Every id is kebab-case and unique across the library.

### 4.1 Cartridge

```ts
type Cartridge = {
  id: string;                    // e.g. "dragon-ball-ep1-goku"
  schemaVersion: 1;
  status: "ready" | "failed";    // only "ready" cartridges show in select screens
  source: {
    title: string;               // "Dragon Ball"
    medium: "film" | "tv" | "anime";
    versionOrEpisode: string;    // "Episode 1: The Secret of the Dragon Balls"
    requestedCharacter: string;  // what the user typed: "Goku"
  };
  character: CharacterDef;       // the one playable protagonist
  world: WorldDef;
  notes: {
    sourceFacts: string[];       // what the AI says comes from the source
    designChoices: string[];     // what was invented for the game (e.g. "Daddy Pig is the boss")
  };
  createdAt: string;             // ISO 8601
};
```

### 4.2 Character

```ts
type CharacterDef = {
  id: string;                    // "goku"
  name: string;
  source: string;                // "Dragon Ball"
  versionOrEpisode: string;      // "Iconic (Kamehameha, Nimbus, Power Pole)"
  assumptions: string[];         // power-scaling interpretation, e.g. "Uses iconic version, not episode-1 kid Goku"
  rig: Rig;                      // appearance (section 6)
  collisionBox: { w: number; h: number };   // in pixels, separate from the art
  movement: {
    speed: number;               // px/s, 60–400
    jumpStrength: number;        // px/s initial velocity, 200–900
    canFly: boolean;
  };
  stats: Stats;                  // section 5.1
  tags: HaxTag[];                // section 5.5
  abilities: [Ability, Ability, Ability, Ability];   // slots 1–4: basic, special, movement, ultimate
};
```

### 4.3 Abilities: only mechanics the engine implements

```ts
type Ability = {
  id: string;                    // "kamehameha"
  name: string;
  slot: 1 | 2 | 3 | 4;
  mechanic: Mechanic;
  damageType: "physical" | "magic" | "mixed";   // the AI decides
  attackTags: AttackTag[];       // section 5.5
  ratio: number;                 // multiplier on AD/AP (mixed = half from each), 0–10
  range: number;                 // px
  cooldown: number;              // seconds
  duration: number;              // seconds (beam length, flight time, dash time)
  projectileSpeed?: number;      // px/s, projectile only
  knockback: number;             // px/s
  animation: "punch" | "kick" | "cast" | "shoot" | "swing" | "beam";
};

type Mechanic =
  | "melee"        // hitbox in front of the player, toward the mouse; uses range
  | "projectile"   // fires toward the mouse; projectileSpeed, range
  | "beam"         // instant long hitbox toward the mouse for `duration` (Kamehameha, Hollow Purple)
  | "aoe"          // circle around the player, radius = range (Blue's pull is aoe with negative knockback)
  | "dash"         // fast move toward the mouse, i-frames during `duration`
  | "teleport"     // instant move to the mouse position, within range, if not inside a solid tile
  | "flight"       // toggle: free movement with WASD for `duration` seconds
  | "superJump";   // next jump is multiplied by ratio
```

If a generated ability can't be expressed with these, the AI must pick the closest mechanic and record that in `assumptions`. **The UI only lists abilities that resolve to an implemented mechanic.**

### 4.4 World

```ts
type WorldDef = {
  id: string;                    // "peppa-muddy-puddles"
  name: string;
  source: string;
  visualStyle: {
    palette: { sky: string; skyBottom: string; ground: string; groundTop: string; platform: string; accent: string };
    backdrop: "hills" | "mountains" | "forest" | "city" | "school" | "interior" | "void";  // engine-drawn parallax
  };
  enemies: EnemyDef[];           // 1–5 types
  boss: BossDef;
  npcs?: NpcDef[];               // 0–3 friendly characters from the show; stand at "a"–"c" and talk when the player is near
  props?: PropDef[];             // 0–12 non-colliding scenery pieces (houses, trees, signs), placed per room
  rooms: Room[];                 // exactly 3; the last is the boss room
  dialogue: {
    roomIntro: DialogueLine[][]; // one list per room, max 3 lines each
    bossIntro: DialogueLine[];
    bossDefeated: DialogueLine[];
    playerDefeated: DialogueLine[];
  };
};

type EnemyDef = {
  id: string; name: string;
  rig: Rig; collisionBox: { w: number; h: number };
  stats: Stats; tags: HaxTag[];
  behaviour: "walker" | "jumper" | "flyer" | "shooter";
  speed: number;                 // px/s
  attack: { damageType: "physical" | "magic" | "mixed"; ratio: number; attackTags: AttackTag[]; range: number; cooldown: number };
};

type BossDef = EnemyDef & {
  pattern: ("charge" | "jump" | "shoot" | "beam" | "summon")[];   // 1–3, cycled
  phaseAt: number;               // 0–1: below this HP fraction, the boss speeds up 30%
};

type DialogueLine = { speaker: string; text: string };   // text ≤ 120 chars

type NpcDef = { id: string; name: string; rig: Rig; lines: DialogueLine[] };   // 1–3 lines, shown in a speech box when the player is within ~2 tiles
type PropDef = { id: string; name: string; size: { w: number; h: number }; shapes: Shape[]; layer: "back" | "front" };
// size and shapes in rig pixels (drawn at RIG_SCALE = 0.5), up to 384×384
```

### 4.5 Rooms (tile grid)

- **Tile size 16×16 px.** Each room is **14 rows** high and **40–100 columns** wide.
- Coordinates are tile `(col, row)` from the top-left. The engine converts them to pixels.

```ts
type Room = {
  id: string;                    // "room-1"
  name: string;                  // "Mount Paozu"
  objective: string;             // "Reach the forest" / "Defeat the Bear Thief"
  layout: string[];              // 14 strings of equal width
  isBossRoom: boolean;
  exit: { toRoom: string | "END" };   // where the exit tile "E" leads
  props?: { prop: string; col: number; row: number }[];   // prop's bottom-left sits on top of tile (col, row+1)
};
// The engine shows `name` as a banner at the top of the screen for ~2.5 s every time the room starts.
```

| Char | Meaning | Solid? |
|---|---|---|
| `.` | empty | no |
| `#` | ground | yes |
| `=` | one-way platform (jump through from below) | top only |
| `X` | destructible block (breaks when hit by any attack) | yes until broken |
| `^` | spikes: 20% of the player's max HP per hit | no (hazard) |
| `S` | player spawn (exactly one per room) | no |
| `E` | exit (exactly one per non-boss room) | no |
| `C` | checkpoint (optional) | no |
| `1`–`5` | enemy spawn: `1` = `enemies[0]` | no |
| `a`–`c` | NPC spawn: `a` = `npcs[0]` | no |
| `B` | boss spawn (boss room only, exactly one) | no |

**Progression rules (no softlocks):** a non-boss room is finished by touching `E`; enemies never have to be killed. The boss room is finished when the boss's HP reaches 0, which ends the cartridge. Defeated enemies stay defeated until the room restarts. Death restarts the current room from `S` (or the last `C`) with full HP.

---

## 5. Combat and powerscaling

### 5.1 Stats

```ts
type Stats = {
  HP: number;        // > 0, uncapped (validator rejects > 1,000,000 as nonsense)
  AD: number;        // attack damage, physical/kinetic, ≥ 0
  AP: number;        // ability power, magic/ki/cursed energy, ≥ 0
  ARM: number;       // armour, reduces physical damage, ≥ 0
  MR: number;        // magic resist, reduces magic damage, ≥ 0
  ARM_PEN: number;   // flat armour penetration, ≥ 0
  MAGIC_PEN: number; // flat magic penetration, ≥ 0
};
```

### 5.2 Damage formula (`src/shared/combat.ts`, used by the engine only)

```
physical = attacker.AD * ability.ratio * 100 / (100 + max(0, target.ARM - attacker.ARM_PEN))
magic    = attacker.AP * ability.ratio * 100 / (100 + max(0, target.MR  - attacker.MAGIC_PEN))
mixed    = 0.5 * physical + 0.5 * magic
final    = hax check (5.5) → round(max(0, result)); show as a floating number ("IMMUNE" if blocked)
```

There's no level scaling, no rebalancing and no randomness, so the same hit always does the same damage.

### 5.3 Reference scale (the anchors in every Cortex prompt)

The AI places every character and enemy relative to these anchors, so separately generated cartridges share one scale:

| Tier | Example | HP | AD | AP | ARM | MR |
|---|---|---|---|---|---|---|
| Toddler / cartoon civilian | Peppa Pig | 15 | 2 | 0 | 0 | 0 |
| Ordinary adult | a security guard | 50 | 8 | 0 | 5 | 0 |
| Peak human | John Wick | 120 | 45 | 0 | 15 | 5 |
| Street-level super | Spider-Man | 600 | 150 | 0 | 80 | 20 |
| City-level | a strong sorcerer | 3,000 | 300 | 600 | 200 | 300 |
| Planet-level | Goku (iconic) | 10,000 | 1,000 | 1,000 | 800 | 800 |
| Cosmic | multiverse-level beings | 100,000+ | 10,000+ | 10,000+ | 5,000+ | 5,000+ |

The prompt asks the AI to explain its placement in `assumptions` (e.g. "Planet-level: destroys the moon in the original series").

### 5.4 What a mismatch looks like (intended)

- **Goku in Peppa's world:** a basic punch does ~2,000 to George (15 HP), so everything dies in one hit. The `STOMP` music plays when the player's HP + damage outclass the boss by more than 10× (exact rule in `combat.ts`: `player.HP / boss.HP > 10 && playerMaxHitOnBoss >= boss.HP`).
- **Peppa in Dragon Ball's world:** any hit kills her. She can still run and jump to every exit; she just can't beat the boss. The `playerDefeated` flavour lines play.
- **Goku vs Gojo's world:** Goku's attacks hit `INFINITY`, show `IMMUNE` and do 0 damage.

### 5.5 Hax tags (enforced by the engine, checked before the damage formula)

```ts
type HaxTag = "INFINITY" | "BULLETPROOF" | "INTANGIBLE" | "REGENERATION" | "FLIGHT";
type AttackTag = "BALLISTIC" | "PHYSICAL" | "ENERGY" | "SPACE_BYPASS" | "NULLIFY";
```

| Target has | Effect | Bypassed by attack tag |
|---|---|---|
| `INFINITY` | Takes 0 damage and 0 knockback; projectiles stop and despawn 1 tile away | `SPACE_BYPASS`, `NULLIFY` |
| `BULLETPROOF` | Takes 0 damage from `BALLISTIC` attacks | `NULLIFY`, or attacker `ARM_PEN` ≥ target `ARM` × 2 |
| `INTANGIBLE` | Takes 0 damage from `physical` damage type | `NULLIFY` |
| `REGENERATION` | Heals 2% max HP per second while not hit for 2 s | n/a |
| `FLIGHT` | Can use `flight` mechanic abilities (movement capability) | n/a |

Gojo's own Hollow Purple carries `SPACE_BYPASS`. Anything not in this table is ignored by the engine and must not be promised in the UI.

### 5.6 Crossover flavour dialogue

When the player starts a character × world combination:
1. The server looks up `REMIX_LINES` for `(characterId, worldId)`.
2. If it's missing, it makes **one** Cortex call with both definitions and the computed matchup (who outclasses whom, which hax blocks what). That call returns replacement `roomIntro`, `bossIntro`, `bossDefeated` and `playerDefeated` lines, which are validated and saved.
3. If the call fails or takes longer than 20 s, the game uses the world's original dialogue. The gameplay never waits on it.

Flavour dialogue only. Objectives, rooms, enemies and stats are never changed.

---

## 6. Sprites: shape rigs

### 6.1 Format

```ts
type Rig = {
  sizeClass: "tiny" | "small" | "human" | "tall" | "large" | "huge";
  // canvas size in RIG pixels (2x detail): tiny 24×32, small 32×40, human 32×64, tall 32×80, large 96×96, huge 192×192
  // drawn at RIG_SCALE = 0.5, so in the world a human is still 16×32 px (2 tiles tall), just twice as detailed
  parts: {
    head: Shape[]; torso: Shape[];
    armFront: Shape[]; armBack: Shape[];
    legFront: Shape[]; legBack: Shape[];
    extras: { attachTo: "head" | "torso" | "armFront"; shapes: Shape[] }[];   // hair, cape, gun, tail, blindfold
  };
  pivots: { neck: [number, number]; shoulder: [number, number]; hip: [number, number] };
};

type Shape =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { type: "circle"; x: number; y: number; r: number; color: string };
// x/y in the rig's pixel canvas, colours "#rrggbb"
```

### 6.2 Animation (engine-generated, no frames to draw)

| Animation | Motion |
|---|---|
| idle | 1 px vertical bob, 1 s loop |
| run | legs swing ±30°, arms counter-swing ±20°, 0.4 s loop |
| jump | legs tucked 20°, arms raised |
| attack | front arm swings toward the mouse over 0.15 s (`punch`/`swing`), or points and flashes (`cast`/`shoot`/`beam`) |
| hurt | white flash for 0.1 s, knocked back |
| death | falls over, blinks 3 times, fades |

Rigs are drawn to an offscreen canvas at native size, then scaled up with nearest-neighbour (no smoothing), so everything looks like chunky pixels. The **collision box is separate from the rig** and never derived from the art.

### 6.3 Who makes them

- **Demo characters, enemies and bosses (3 cartridges):** hand-tuned by Claude Code in `content/`. "Very simple but recognisable": Goku has a spiky black hair extra and an orange gi with a blue belt; Peppa is a pink circle head with a snout, a red dress, and a tiny sizeClass; Gojo has white spiky hair, a black blindfold band and a dark uniform, and is tall.
- **New cartridges:** Cortex writes the same `Rig` format. The validator checks every shape is inside the canvas.

---

## 7. Server API

All JSON. Errors are `{ error: { code, message } }` with a matching HTTP status.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/characters` | – | `{ id, name, source, rig, stats, tags, abilities, assumptions, cartridgeId }[]` (from ready cartridges) |
| GET | `/api/worlds` | – | `{ id, name, source, visualStyle, bossName, roomNames, cartridgeId }[]` |
| GET | `/api/cartridges/:id` | – | `Cartridge` |
| POST | `/api/generate` | `{ title, character }` | Streams stage events, then `{ status: "ready", cartridge }` or `{ status: "needs_clarification", question }` or `{ status: "unknown_source", message }` or `{ status: "failed", message }` |
| POST | `/api/session` | `{ characterId, worldId }` | `{ character: CharacterDef, world: WorldDef, dialogue }` (dialogue = remix lines or the originals) |

**Generation stages** are real stages, streamed as newline-delimited JSON events: `interpreting` → `validating` → `repairing` (only if needed) → `saving` → `done`. No fake progress bars.

**The session** is a fresh, runtime-only copy. HP lost, cooldowns and defeated enemies live in the engine's runtime state and never modify the saved definitions.

---

## 8. AI generation (Lane B)

### 8.1 Cortex call

- `SELECT AI_COMPLETE(model => '<CORTEX_MODEL>', prompt => ?, response_format => <JSON schema>)` from the server through the Node Snowflake driver (`snowflake-sdk`).
- The JSON schema is generated from the zod schema, so the contract and the prompt can't drift apart.
- Use a Claude model if Cortex offers one in the account's region; otherwise the best available model. Put the model name in `.env` as `CORTEX_MODEL`. If the model isn't available in the region, the account may need cross-region inference enabled (check the Snowflake Cortex docs).

### 8.2 Prompt contents

1. The task: "If this film/episode got an official licensed retro platformer, what would it look like?"
2. Honesty rules:
   - If the title is ambiguous, return `needs_clarification` with a question (e.g. "Which Dragon Ball series and episode?").
   - If you don't know the source, return `unknown_source`. Never invent episode details.
   - Put real source facts in `notes.sourceFacts` and invented game-design choices in `notes.designChoices`.
   - Use the iconic version of the character and say so in `assumptions`.
3. The full schema rules: the mechanics list, hax tags, tile legend and room rules (section 4).
4. The reference scale (section 5.3), with the instruction to place every character and enemy on it and explain why.
5. One complete finished cartridge (the Peppa one) as an example.

### 8.3 Validation and repair (`src/shared/validate.ts`)

Checks that:
- the schema matches (zod);
- ids are unique and every reference resolves (enemy spawns → `enemies`, `exit.toRoom` → a real room or `END`);
- numbers are within the bounds in section 4 and section 5.1;
- every ability uses a supported mechanic and every tag is supported;
- every room has 14 equal-width rows, exactly one `S`, exactly one `E` (non-boss) or `B` (boss room), and the last room is the boss room;
- rig shapes fit inside the canvas;
- the default character can reach the exit: a simple tile-grid reachability check from `S` to `E` using the character's jump height in tiles (`jumpStrength² / (2 × gravity) / 16`).

Code first auto-fixes trivial problems: it pads or trims row widths and clamps numbers into bounds. If problems remain, it makes **one** repair call to Cortex with the error list. If the cartridge still fails, it returns `status: "failed"` with the errors, saves nothing, and leaves existing cartridges untouched.

### 8.4 Snowflake storage

```sql
CREATE DATABASE RETRO;
CREATE TABLE RETRO.PUBLIC.CARTRIDGES (
  ID STRING PRIMARY KEY, SCHEMA_VERSION INT, STATUS STRING,
  DATA VARIANT, CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);
CREATE TABLE RETRO.PUBLIC.REMIX_LINES (
  CHARACTER_ID STRING, WORLD_ID STRING, DATA VARIANT,
  CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (CHARACTER_ID, WORLD_ID)
);
```

`.env` (server only, never committed): `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE=RETRO`, `SNOWFLAKE_SCHEMA=PUBLIC`, `CORTEX_MODEL`.

The library is shared by everyone using the app and persists in Snowflake across restarts. The UI says "Shared library (stored in Snowflake)". There's no browser-only storage.

---

## 9. Engine (Lane A)

- **Phaser 3, Arcade physics.** World units stay 16 px tiles, rooms 14 rows. **Render at 2x:** canvas 800×448 with the camera zoomed so each world px is 2 screen px, then an extra camera zoom of ~1.5 (view ≈ 17×9.5 tiles, following the player, vertical scroll allowed), integer-scaled to the window, `pixelArt: true`, no smoothing. Rig and prop textures are generated at their full rig-pixel size and displayed at `RIG_SCALE` so their 2x detail shows. Tiles get simple procedural detail (grass tufts, edge highlights, brick lines) from the world palette.
- **Room banner:** on every room start, the room `name` slides in at the top centre in the pixel font for ~2.5 s.
- **NPCs:** spawned at `a`–`c`, idle-animated, non-colliding, not attackable. When the player is within ~2 tiles, their `lines` play in the dialogue box (once per room visit).
- **Props:** drawn from `world.props` at each room's `props` placements, behind (`back`) or in front of (`front`) the player, never colliding. Movement is time-based (delta-time), so speed doesn't change with frame rate.
- **Player:** spawns at `S`, WASD + Space, mouse aim, left click uses the selected slot, 1–4 select slots, cooldown shown on each slot.
- **Combat:** every hit goes through `resolveHit(attacker, ability, target)` in `src/shared/combat.ts` (hax check, then formula). Floating damage numbers or `IMMUNE`. Knockback, 0.5 s invulnerability after a hit.
- **Enemies:** behaviours `walker` (patrols, turns at edges and walls), `jumper` (hops toward the player), `flyer` (sine-wave flight toward the player), `shooter` (stands and fires projectiles). They have real HP and attacks and die at 0 HP.
- **Boss:** health bar at the top, cycles its `pattern`, speeds up below `phaseAt`, has `bossIntro` and `bossDefeated` dialogue.
- **Dialogue:** retro text box at the bottom, one line at a time, click or Space to advance, shown at room start and around the boss.
- **HUD:** character name and portrait, world name, HP bar with numbers, the 4 ability slots with keys and cooldowns, the room objective, and a "WASD move · Space jump · Mouse aim · Click attack · 1–4 abilities · Esc quit" line.
- **Loop:** death leads to a "Defeated" screen (restart room / back to select). Defeating the boss leads to a "Cartridge Complete" screen (back to select). Esc goes back to select.
- **Music:** Web Audio square/triangle/noise loops `STAGE`, `BOSS` (in the boss room) and `STOMP` (rule in 5.4), with a mute button.
- **Mechanics to implement, in priority order:** melee, projectile, beam, dash, superJump, flight, aoe, teleport. Any mechanic not done by the freeze makes its ability show "not supported" in the UI instead of silently failing.

---

## 10. UI (Lane C)

Retro console look: dark background, "Press Start 2P" pixel font, chunky borders, nearest-neighbour scaling.

1. **Title / library:** list of cartridges as cartridge cards, a "New cartridge" button, and the label "Shared library (stored in Snowflake)".
2. **Character select (Terraria-style):** grid of unlocked characters with animated rig previews. Selecting one shows HP/AD/AP/ARM/MR/pens, tags, the 4 abilities (name, mechanic, damage type, cooldown) and the "assumptions" in small text.
3. **World select:** grid of worlds with a palette and backdrop preview, room names and boss name. "Play" calls `/api/session`, then starts the engine.
4. **Generate:** title + character fields. Shows the real stages as they stream in, then either opens the new cartridge, shows the clarification question with a way to resubmit, or shows the error. Existing cartridges stay untouched on failure.
5. **Placeholders are labelled:** anything not working yet says so on screen.

---

## 11. Demo cartridges (finished 100%, Lane C with Lane B)

All three are hand-finished JSON in `content/`, validated, and seeded into Snowflake before the demo.

| Cartridge | Character (iconic) | World (3 rooms) | Boss |
|---|---|---|---|
| Dragon Ball ep 1 | **Goku**: planet-level, ki AP + martial AD. 1 Punch (melee, physical), 2 Ki Blast (projectile, magic, ENERGY), 3 Instant Transmission (teleport), 4 Kamehameha (beam, magic, ENERGY) | Mount Paozu → Forest → Bear Thief's clearing | Bear Thief |
| Peppa Pig "Muddy Puddles" | **Peppa**: toddler tier, `tiny`. 1 Push (melee), 2 Muddy Splash (aoe), 3 Big Jump (superJump), 4 Giggle Fit (aoe, tiny damage, big knockback) | Peppa's hill → Muddy fields → The biggest puddle | Daddy Pig (design choice) |
| Jujutsu Kaisen (opening arc) | **Gojo**: cosmic-adjacent, `tall`, tags `INFINITY`, `FLIGHT`. 1 Strike (melee, physical), 2 Blue (aoe, pull, magic), 3 Teleport, 4 Hollow Purple (beam, magic, `SPACE_BYPASS`) | School grounds → Corridors → Rooftop | Sukuna (in Yuji's body) |

**Demo script (about 3 min):**
1. Character select: show Goku's, Peppa's and Gojo's stats side by side. Explain the reference scale.
2. **Goku in Peppa's world:** one-punch George, `STOMP` music, flavour dialogue mocking the matchup.
3. **Peppa in Dragon Ball's world:** gets one-shot, but can still run to the exit. The fight is never "fair" by design.
4. **Goku in Gojo's world, or Gojo's Infinity vs Goku:** `IMMUNE`. Hax beats raw stats.
5. If there's time and the connection is good: generate a new title live and play it.

---

## 12. Timeline (3.5 hours)

| Time | Lane A: Engine | Lane B: AI + Snowflake | Lane C: UI + Content |
|---|---|---|---|
| 0:00–0:20 | Pull, read spec, write `src/shared/combat.ts` | **Create Snowflake trial**, enable Cortex, create tables, `.env` | Write `src/shared/schema.ts` + `validate.ts` (**everyone reviews it at 0:20**) |
| 0:20–1:45 | Platformer, tiles, rig renderer and animations, melee/projectile/beam, enemies | Server routes, Snowflake client, Cortex generation, validation + 1 repair | Goku + Peppa characters and Peppa's world in `content/`; select screens on stub data |
| **1:45** | **Checkpoint:** Goku is playable in Peppa's world with real damage; `/api/generate` returns one valid cartridge; select screens list from the API | | |
| 1:45–2:45 | Remaining mechanics, boss, hax tags, HUD, music | `/api/session` + remix lines, streaming stages, seed demo cartridges | Dragon Ball + Gojo worlds, Gojo character, generate screen |
| 2:45–3:15 | **Integrate on main, bug fixes only.** Run through the demo script end to end | | |
| 3:15–3:30 | **Code freeze.** Rehearse the demo | | |

**If behind, cut in this order:** `STOMP` track → teleport/aoe mechanics (mark as unsupported) → remix flavour lines (fall back to the original dialogue) → reachability check → live generation in the demo. **Never cut:** the 3 demo cartridges, real combat with the formula, the select screens, `INFINITY`.

---

## 13. Acceptance criteria

- [ ] Goku, Peppa and Gojo cartridges load from Snowflake and are fully playable start to finish.
- [ ] Any character plays in any world with its **own** stats, abilities and hitbox, not just a sprite swap.
- [ ] Goku one-shots Peppa's world; Peppa is one-shot in Dragon Ball's world; Goku's attacks show `IMMUNE` against Infinity.
- [ ] Attacks, damage numbers, enemy AI, boss, death, room restart, level completion and the return to select screens all work.
- [ ] `/api/generate` turns a known title into a validated, saved, reopenable cartridge, and gives a clear clarification or error for ambiguous or unknown titles.
- [ ] Reopening a cartridge never regenerates it.
- [ ] Unsupported mechanics and placeholders are labelled on screen.
- [ ] No credentials in the browser or in git.

---

## 14. Changes from what's on main now

What's currently on `main` (from `rayan/foundation`) is an earlier draft: different schema (16×16 pixel grids, 1–10 stats), an Express server using the Anthropic SDK, and Dracula/Sherlock samples. Under this spec:
- `src/shared/cartridge.ts` is replaced by `schema.ts`, `validate.ts` and `combat.ts`;
- the server swaps the Anthropic SDK for `snowflake-sdk` + Cortex;
- the Dracula and Sherlock samples are deleted;
- `docs/LANES.md` and `docs/INTERFACES.md` are rewritten to point here.

The Vite + Phaser + Express setup and the team git workflow stay.
