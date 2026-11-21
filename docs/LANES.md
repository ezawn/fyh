# Lanes: 3 people, 3 Claudes, 5 hours

**Product:** paste a story's synopsis → AI makes a retro NES-style platformer "cartridge" → play it in the browser.
Then remix: any character from one cartridge in any world from another, with the AI rebalancing for the power gap.

**Demo with public-domain stories only** (Dracula, Sherlock Holmes, Frankenstein, Robin Hood, Alice in Wonderland,
King Kong 1933…). Don't put copyrighted characters (Mario, Goku, Batman, Bond…) in the demo, the repo or the sample cartridges.

Everyone builds against `src/shared/cartridge.ts` + `src/shared/api.ts` (see `docs/INTERFACES.md`) and the two
sample cartridges in `cartridges/`. Nobody waits for anybody: the engine plays the samples, the UI lists the samples,
and the AI makes new ones.

## Who owns what

| Lane | Folders (only edit these) | Done when |
|------|---------------------------|-----------|
| 1. Engine | `src/engine/` | Both sample cartridges are playable start to finish, with all 7 abilities working |
| 2. AI | `server/`, `cartridges/` | Generate and remix both work from the UI and always return valid cartridges |
| 3. UI | `src/main.ts`, `src/ui/`, `index.html`, `public/` | Library, generate, remix picker and play screen look like a retro console |

Shared files (`src/shared/`, `package.json`, `docs/INTERFACES.md`, `CLAUDE.md`) change only after telling the team.
Need a new npm package? Ask first; `package.json` is shared and conflicts easily.

## Timeline

| Time | Everyone |
|------|----------|
| 0:00–0:15 | Pull, `npm install`, `npm run dev`, paste your lane prompt into your Claude |
| 0:15–2:30 | Build your lane against the samples. Land on main every ~45 min |
| 2:30 | **Check-in:** the engine plays a sample, the AI generates one cartridge, the UI can list, play and generate |
| 2:30–3:45 | Remix, polish, stretch goals |
| 3:45–4:30 | Integrate on main; fix bugs only. Make 3–4 good demo cartridges |
| 4:30–5:00 | **Code freeze.** Rehearse the demo |

## Running it
```
npm install
cp .env.example .env        # then put ANTHROPIC_API_KEY in .env (AI lane needs it; others can leave it blank)
npm run dev                 # web on http://localhost:5173, API on :3001
npm run check:carts         # validates everything in cartridges/
npm run typecheck
```

---

## Lane prompts (paste the one for your lane into your Claude)

### Lane 1: Engine

```
You're on the ENGINE lane of the fyh repo. Read CLAUDE.md, docs/LANES.md, docs/INTERFACES.md and src/shared/cartridge.ts first, then follow the team workflow in CLAUDE.md (branch <yourname>/engine). You only edit src/engine/.

Build a retro NES-style platformer in Phaser 3 (already installed) that plays any Cartridge. Keep the exported startGame(parent, cart, onExit) signature in src/engine/index.ts exactly as it is; the UI depends on it.

Must have, in this order:
1. Render sprites from the 16x16 pixel grids (generate Phaser textures from palette + pixels, scale 3x, pixelArt: true) and levels from the ASCII layout (16px tiles, world.palette colours; camera follows the player).
2. Player movement from character.stats (speed, jump), gravity, solid "#", one-way "=", spikes "^", collectibles "C", goal "G". Arrow keys/WASD to move, Z or Space to jump, X to attack.
3. Enemies spawned from "1"-"3" with their behaviour (walker, jumper, flyer, shooter), health and damage. Player health = stats.health hearts, brief invulnerability after a hit.
4. Abilities: projectile and melee first, then doubleJump, dash, glide, shield, flight. Only abilities listed in character.abilities are active.
5. Level flow: show the level's objective, intro dialogue in a retro text box (one line at a time, Z to advance), play, outro dialogue, next level. Last level spawns the boss at "B" with a health bar, its attacks (charge, jump, shoot, summon), introLine and defeatLine.
6. HUD: hearts, collectible count with world.collectibleName, level name. Game over screen with retry. Esc calls onExit({outcome: "quit"}). Win calls onExit({outcome: "won"}).

Keep it feeling like an NES game: 256x240-ish internal resolution scaled up, chunky pixels, simple flat colours. Test with both cartridges in cartridges/ (you can import the JSON directly while developing). Use world.mood to pick a simple Web Audio chiptune loop only if everything else works.

Commit every 20 minutes and land on main every 45 minutes as CLAUDE.md says. Update your line in NOTES.md. If you need a change to src/shared/, stop and tell me instead of editing it.
```

### Lane 2: AI

```
You're on the AI lane of the fyh repo. Read CLAUDE.md, docs/LANES.md, docs/INTERFACES.md, src/shared/cartridge.ts, src/shared/api.ts and server/index.ts first, then follow the team workflow in CLAUDE.md (branch <yourname>/ai). You only edit server/ and cartridges/.

Implement the two POST routes in the Express server using the Anthropic TypeScript SDK (@anthropic-ai/sdk, already installed) with model claude-opus-5-5. Load your claude-api skill before writing SDK code. The API key comes from ANTHROPIC_API_KEY in .env (never commit .env).

1. POST /api/cartridges { title, synopsis } -> generate a Cartridge from the synopsis. The goal is "what if this story got an official NES game adaptation": pick the playable hero, choose stats and 1-4 abilities from the fixed list, design enemies, a boss, 3 levels that follow the story's beats (last one the boss level), short dialogue, palette and 16x16 pixel-art sprites. Use structured outputs with a JSON schema generated from the zod schemas (z.toJSONSchema), then run checkCartridge(). If it reports problems, send them back to the model and retry (max 2 retries). Assign a fresh id and createdAt, save to cartridges/<id>.json, return 201 + the cartridge.
2. POST /api/remix { characterFrom, worldFrom } -> load both cartridges, take the character from one and the world from the other, then make one AI call that powerscales: compare character.powerLevel and traits with world.threatLevel and rewrite the world's enemy and boss stats, level objectives and all dialogue so the matchup makes sense. A weak human in a deadly world gets stealth/escape objectives and tougher enemies; an overpowered hero gets a comedic power fantasy where dialogue reacts to the mismatch. Keep the level layouts and sprites. Fill in remix { characterFrom, worldFrom, adaptationNote }, validate, save, return 201.
3. Errors use the ApiError shape. Generation is slow: stream the request and use finalMessage() so it doesn't time out, and log progress.
4. Tile layouts are the hardest thing for the model to get right. Put the full tile legend and rules in the prompt, give it one sample cartridge from cartridges/ as an example, and repair simple mistakes in code (pad or trim rows to the same width, force exactly one P and G) before validating.

Only use public-domain stories when testing (Dracula, Frankenstein, Robin Hood, Alice in Wonderland, Sherlock Holmes...). Save the 3-4 best generated cartridges in cartridges/ for the demo.

Commit every 20 minutes and land on main every 45 minutes as CLAUDE.md says. Update your line in NOTES.md. If you need a change to src/shared/, stop and tell me instead of editing it.
```

### Lane 3: UI

```
You're on the UI lane of the fyh repo. Read CLAUDE.md, docs/LANES.md, docs/INTERFACES.md, src/shared/api.ts, src/engine/index.ts and src/main.ts first, then follow the team workflow in CLAUDE.md (branch <yourname>/ui). You only edit src/main.ts, src/ui/, index.html and public/.

Build the app shell around the game, styled like a retro console menu (dark background, pixel font such as "Press Start 2P" from Google Fonts, chunky borders, NES-style colours). Plain TypeScript and DOM, no framework.

1. Library screen: GET /api/cartridges, show each as a cartridge card (cover in coverColor, title, "<character> in <world>", a REMIX badge when isRemix). Click to play.
2. Play screen: fetch the full cartridge, call startGame(container, cart, onExit) from src/engine; on exit show a small result screen (won/died, collectibles) and go back to the library. Call handle.destroy() when leaving.
3. Generate screen: title + synopsis textarea, POST /api/cartridges. Generation takes 30-90 seconds, so show a fun "inserting cartridge / blowing on the contacts" loading animation, then open the new cartridge. Show ApiError messages nicely. Offer 3 public-domain synopsis presets to click (e.g. Frankenstein, Robin Hood, Alice in Wonderland) so the demo is quick.
4. Remix screen: pick a character (from any cartridge) and a world (from any other), show both sprites side by side (render the 16x16 pixel grids to a canvas) with powerLevel vs threatLevel, POST /api/remix, then play it and show remix.adaptationNote on the title card.
5. Make it work at phone width too.

Until the AI lane is done, POST routes return 501: show a friendly "coming soon" message and keep building. Until the engine is done, startGame shows a stub; that's fine.

Commit every 20 minutes and land on main every 45 minutes as CLAUDE.md says. Update your line in NOTES.md. If you need a change to src/shared/ or package.json, stop and tell me instead of editing it.
```
