# Hax

**Any hero, any world, no rebalancing.** Type a film, TV episode or anime and its main character, and AI turns it into a playable retro platformer "cartridge". Then drop any character into any other cartridge's world and see who really wins.

Goku one-shots everything in Peppa Pig's world. Peppa gets flattened in Dragon Ball's. Gojo's Infinity makes Goku's attacks show `IMMUNE`, and only attacks that cut through space or nullify techniques can land a hit. The fight is never rebalanced and the mission never changes. Only the dialogue reacts to the matchup.

[![Hax demo video](https://img.youtube.com/vi/mzTg_PZi25A/hqdefault.jpg)](https://youtu.be/mzTg_PZi25A)

**▶ [Watch the demo video](https://youtu.be/mzTg_PZi25A)**

## How it works

1. **Generate a cartridge.** Enter a title and a character, for example "Dragon Ball episode 1" and "Goku". The server asks an AI model to design one playable character and one world of 3 rooms ending in a boss, built step by step from a strict schema. Ambiguous or unknown titles get a clarification question or an honest error instead of made-up details.
2. **Validate and repair.** Shared validation code checks every cartridge: the schema, stat bounds, and that every room's exit can actually be reached with that character's jump. Small problems are fixed automatically; anything else gets one AI repair pass or the cartridge is rejected.
3. **Save it to the shared library.** Valid cartridges are stored in **Snowflake** and appear for everyone on the character and world select screens.
4. **Mix and play.** Pick a character on a Terraria-style character select, pick any world, and play. All gameplay runs in the browser with no AI calls during play.

## Powerscaling and hax

- **Uncapped, League-of-Legends-style stats** (HP, AD, AP, armour, magic resist, penetration) are anchored to a shared reference scale, from a cartoon toddler (Peppa, 15 HP) to planet-level (Goku, 10,000 HP), so separately generated cartridges stay comparable.
- **One deterministic damage formula** (`src/shared/combat.ts`) resolves every hit. There's no randomness and no level scaling, so the same hit always does the same damage.
- **Hax tags** are rules raw power can't beat: `INFINITY` (nothing touches you unless the attack has `SPACE_BYPASS` or `NULLIFY`), `BULLETPROOF`, `INTANGIBLE` and `REGENERATION`.
- **Matchup flavour lines** are written by AI for each character and world pair, without changing objectives, rooms, enemies or stats.

## The game

- Phaser 3 pixel-art platformer: rooms built from ASCII tile layouts, parallax backdrops, NPCs, scenery props.
- Characters are **shape rigs**: coloured shapes per body part, animated procedurally (idle, run, jump, attack, hurt, death) and rendered at low resolution for a chunky pixel look.
- 8 ability mechanics (melee, projectile, beam, dash, super jump, flight, AoE, teleport) on slots 1–4, aimed with the mouse.
- Floating damage numbers and `IMMUNE`, knockback, i-frames, walker/jumper/flyer/shooter enemies, and a boss with attack patterns and a health bar.
- Three chiptune loops generated in code with Web Audio: `STAGE`, `BOSS`, and `STOMP` (when you massively outclass the boss).

Controls: **WASD** move · **Space** jump · **mouse** aim · **click** attack · **1–4** abilities · **M** mute · **F** fullscreen · **Esc** quit.

Demo cartridges: **Goku** (Dragon Ball ep 1), **Peppa** (Peppa Pig "Muddy Puddles") and **Gojo** (Jujutsu Kaisen).

## Tech

- **Front end:** TypeScript, Vite, Phaser 3 (Arcade physics), Web Audio
- **Server:** Node.js, Express, zod (shared schema and validation)
- **Data:** Snowflake (`snowflake-sdk`): the shared cartridge library and cached matchup lines
- **AI:** Google Gemini API (free tier, used now), Anthropic Claude API, or Snowflake Cortex `AI_COMPLETE` on a paid Snowflake account. Snowflake trial accounts can't call Cortex, so the provider is configurable (`AI_PROVIDER`).

## Run it

```bash
npm install
cp .env.example .env    # fill in Snowflake and one AI key; never commit .env
npm run dev             # web on http://localhost:5173, API on :3001
```

- Snowflake setup SQL: `server/sql/setup.sql`. Seed the demo cartridges with `npx tsx server/seed.ts`.
- No Snowflake handy? `STORE=memory npm run dev` serves the cartridges in `content/` locally (nothing is saved).
- No AI key? Everything except live generation and matchup lines still works.
- Checks: `npm run typecheck`, `npm run check:content`.
- Engine dev page: http://localhost:5173/src/engine/dev.html?char=dragon-ball-ep1-goku&world=peppa-muddy-puddles

## Repo layout

| Folder | What |
|---|---|
| `src/shared/` | The cartridge schema, validation and damage formula, shared by server and game |
| `src/engine/` | The Phaser game: rooms, rigs, combat, enemy AI, boss, HUD, music |
| `src/ui/` | Library, character select, world select and generate screens |
| `server/` | API, AI generation and repair, Snowflake storage |
| `content/` | The hand-finished demo cartridges |
| `docs/SPEC.md` | The full design spec |

Built in 3.5 hours at First Year Hack by a team of 3, each working with Claude Code.
