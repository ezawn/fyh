# Workload split: 3 people × 3 Claude Pros × 2 agents each

The product is defined in **`docs/SPEC.md`**; read it first. This file says **who builds what**.

Each person's Claude is the **lead** for their lane. It splits its lane between **2 agents (subagents) working in parallel**, each with its own folders, then integrates their work, tests it and does all the git commits itself.

| Person | Lane | Agent 1 | Agent 2 |
|---|---|---|---|
| **Rayan** | **Contract + Content** | Dragon Ball + Peppa Pig cartridges | Jujutsu Kaisen cartridge + seed and reachability tooling |
| **Friend 1** | **Engine** | Core: scene, tiles, player, rig animation, HUD, dialogue, game loop | Combat: abilities, projectiles, enemies, boss, hax, music |
| **Friend 2** | **Server + UI** | Server: Snowflake, Cortex generation, validation/repair, session + remix lines | UI: library, character select, world select, generate screen |

Rayan's lane starts with the shared contract (first 20 minutes) because everyone depends on it. Meanwhile Friend 1 sets up the Phaser boot scene and Friend 2 creates the Snowflake trial.

## Rules for leads and agents

1. **The lead writes the interface between its two agents first** (one small types file, about 10 minutes), then starts both agents in parallel with a clear brief each: their folders, the interface, and what "done" means.
2. **Agents only edit their own folders** (listed in each prompt) and **never run git**. The lead reviews, runs the checks (`npm run typecheck`, the game in the browser), commits and lands on main using the workflow in `CLAUDE.md`.
3. **`src/shared/` is the contract.** After 0:20 only Rayan's lane changes it, and only after telling the team. Anyone who needs a change asks their human, who asks Rayan.
4. **`package.json` is shared.** If you need a new npm package, tell the team before adding it so two people don't install at the same time and conflict.
5. Land on main at least every 45 minutes, and **always at the 1:45 checkpoint**.
6. **Claude Pro usage limits:** running 2 agents uses roughly twice as much of your Pro allowance. If you get close to the limit, stop starting new agents and finish in the main session. Don't let anyone's lane stall waiting for a limit reset.

## Timeline (3.5 hours)

| Time | Rayan: Contract + Content | Friend 1: Engine | Friend 2: Server + UI |
|---|---|---|---|
| 0:00–0:20 | Write `src/shared/schema.ts`, `validate.ts`, `combat.ts`; remove the old scaffold pieces (SPEC §14). **Push to main by 0:20** | Pull, read spec, Phaser boot scene at 400×224 with a hard-coded test room | **Create Snowflake trial**, enable Cortex, create tables (SPEC §8.4), fill in `.env`, confirm `AI_COMPLETE` works |
| 0:20 | **Everyone pulls main and starts their 2 agents** | | |
| 0:20–1:45 | Goku + Peppa characters, Peppa's world | Movement, tiles, rig renderer + animations / melee, projectile, beam, enemies | Server routes + Snowflake + Cortex / select screens on stub data |
| **1:45** | **Checkpoint, everyone lands on main.** Goku playable in Peppa's world with real damage; `/api/generate` returns a valid cartridge; select screens list from the API | | |
| 1:45–2:45 | Gojo + Dragon Ball + JJK worlds, seed all 3 into Snowflake | Boss, remaining mechanics, hax, HUD, music | Session + remix lines + streaming stages / generate screen, polish |
| 2:45–3:15 | **Everyone: integrate on main, bug fixes only, run the demo script (SPEC §11)** | | |
| 3:15–3:30 | **Code freeze. Rehearse.** | | |

If behind, cut in the order in SPEC §12.

---

## Prompts: each person pastes theirs into their own Claude

### Rayan: Contract + Content

```
You are the lead for the CONTRACT + CONTENT lane of the fyh repo (github.com/ezawn/fyh). Read CLAUDE.md, docs/SPEC.md (all of it) and docs/LANES.md first, then follow the team git workflow in CLAUDE.md on branch rayan/content.

PART 1, the shared contract. Do this yourself, no agents, and push it to main within 20 minutes because the whole team is waiting on it:
- src/shared/schema.ts: zod schemas for every type in SPEC sections 4, 5.1, 5.5 and 6.1 (Cartridge, CharacterDef, Ability, Mechanic, WorldDef, EnemyDef, BossDef, Room, DialogueLine, Stats, HaxTag, AttackTag, Rig, Shape), with the numeric bounds from the spec, plus a function that returns the JSON schema (z.toJSONSchema) for the server's Cortex call.
- src/shared/validate.ts: validateCartridge(json) returning a list of problems, covering every check in SPEC 8.3 including the tile-grid reachability check, plus autoFix(json) for trivial fixes (pad/trim rows, clamp numbers).
- src/shared/combat.ts: resolveHit(attacker, ability, target) implementing SPEC 5.2 and 5.5 exactly (hax check, then the formula; returns { damage, blocked, reason }), and isStomp(player, boss) from 5.4.
- src/shared/api.ts: request/response types for SPEC section 7.
- Remove the old draft pieces listed in SPEC section 14 (src/shared/cartridge.ts, the Dracula/Sherlock samples, scripts/make-samples.ts, scripts/check-cartridges.ts) and fix anything that imported them so `npm run typecheck` passes.
- Add a script `npm run check:content` that validates every file in content/.
Land this on main and tell me so I can tell the team.

PART 2, the 3 demo cartridges in content/ (SPEC section 11), each 100% finished and valid. Start 2 agents in parallel:
- Agent 1: content/dragon-ball-ep1-goku.json and content/peppa-muddy-puddles.json.
- Agent 2: content/jjk-gojo.json, then server-independent tooling: scripts/preview-rig.ts or a small dev page under content/ to eyeball rigs if useful.
Give each agent: SPEC sections 4–6 and 11, the reference scale in 5.3, the hax rules, and these quality bars: rigs are very simple but instantly recognisable (Goku's spiky black hair and orange gi with blue belt, Peppa's pink round head, snout and red dress at tiny size, Gojo's white spiky hair, black blindfold, dark uniform, tall); stats follow the reference scale with reasons in assumptions; every ability uses a supported mechanic; each world has 3 rooms of 14 rows, 40–100 columns, fun to play, with the boss room last; dialogue is short and in character; notes separate source facts from design choices. Agents only edit their own files in content/ and never run git.
After both finish, run npm run check:content, fix anything, commit and land on main. Then hand the 3 files to the server lane (Friend 2) for seeding into Snowflake, and help play-test with the engine as soon as it can load them.

Never change src/shared/ again after 0:20 without telling the team first. Update your line in NOTES.md.
```

### Friend 1: Engine

```
You are the lead for the ENGINE lane of the fyh repo (github.com/ezawn/fyh). Read CLAUDE.md, docs/SPEC.md (all of it, especially sections 4–6 and 9) and docs/LANES.md first, then follow the team git workflow in CLAUDE.md on branch <yourname>/engine. Your lane only edits src/engine/.

First 20 minutes (before the shared contract lands): set up a Phaser 3 game in src/engine/ at a fixed 400×224 logical resolution, pixelArt true, integer scaling, Arcade physics with time-based movement, rendering one hard-coded test room from an ASCII layout using the tile legend in SPEC 4.5. Export startGame(parent: HTMLElement, session: { character, world, dialogue }, onExit: (result) => void): { destroy(): void } from src/engine/index.ts. The UI lane depends on that signature.

When the shared contract is on main (around 0:20), pull it, then write src/engine/types.ts: the runtime interface between your two agents (runtime entity with position, facing, HP, cooldowns, invulnerability; hooks like onAbilityUsed, spawnProjectile, damageEntity). Then start 2 agents in parallel:
- Agent 1, CORE (src/engine/core/, src/engine/render/, src/engine/ui/): room loading from layouts (solid, one-way, destructible, spikes, spawn, exit, checkpoints), camera, player movement (WASD, Space, flight toggle support), rig renderer and procedural animations per SPEC 6 (offscreen canvas, nearest-neighbour, collision box separate from art), HUD (name, world, HP bar with numbers, 4 slots with keys and cooldowns, objective, controls line), dialogue box, room transitions, death leads to restart room, boss defeat leads to the complete screen, Esc quits, the backdrop per visualStyle.
- Agent 2, COMBAT (src/engine/combat/, src/engine/ai/, src/engine/audio/): the ability mechanics in the SPEC 9 priority order (melee, projectile, beam, dash, superJump, flight, aoe, teleport), mouse aiming, every hit through resolveHit from src/shared/combat.ts, floating damage numbers and IMMUNE, knockback and i-frames, enemy behaviours (walker, jumper, flyer, shooter), boss pattern cycling with phaseAt and a health bar, REGENERATION, and the 3 Web Audio chiptune loops STAGE / BOSS / STOMP with a mute button.
Agents only edit their own folders and never run git. You integrate, test in the browser, commit and land on main.

Test with the demo cartridges in content/ as soon as they land (until then use your test room). The 1:45 checkpoint goal: Goku playable in Peppa's world, one-shotting enemies with real damage numbers. Any mechanic not finished by the freeze must be reported as unsupported to the UI, never silently ignored.

If you need a change to src/shared/, stop and tell me so I can ask Rayan. Update your line in NOTES.md.
```

### Friend 2: Server + UI

```
You are the lead for the SERVER + UI lane of the fyh repo (github.com/ezawn/fyh). Read CLAUDE.md, docs/SPEC.md (all of it, especially sections 3, 7, 8 and 10) and docs/LANES.md first, then follow the team git workflow in CLAUDE.md on branch <yourname>/server-ui. Your lane only edits server/, src/ui/, src/main.ts, index.html and public/.

First 20 minutes (while the contract is being written): help me set up Snowflake. I will create the free trial account myself and type in the credentials. You write the setup SQL from SPEC 8.4 for me to run, and tell me exactly which values to put in .env (SPEC 8.4). Never print or commit the credentials. Then confirm from the server that a test AI_COMPLETE call with response_format works with the model in our region (check the Snowflake Cortex docs for model availability and cross-region inference if needed), and put the working model name in CORTEX_MODEL. Replace the Anthropic SDK in server/ with snowflake-sdk (tell the team before changing package.json).

When the shared contract is on main (around 0:20), pull it and start 2 agents in parallel:
- Agent 1, SERVER (server/): all routes in SPEC 7 backed by Snowflake (shared library in the CARTRIDGES table); POST /api/generate running the Cortex prompt from SPEC 8.2 with the JSON schema from src/shared/schema.ts, then autoFix + validateCartridge, one repair call, then save, streaming real stage events as newline-delimited JSON; needs_clarification / unknown_source / failed handled honestly; POST /api/session returning runtime copies plus remix flavour lines (SPEC 5.6: cached in REMIX_LINES, one Cortex call, 20 s timeout falls back to the original dialogue); a script server/seed.ts that inserts the files from content/ into Snowflake.
- Agent 2, UI (src/ui/, src/main.ts, index.html, public/): the retro-styled screens in SPEC 10 (library, Terraria-style character select with animated rig previews and full stats/abilities/tags/assumptions, world select, generate screen showing the real streamed stages, clarification and errors), "Shared library (stored in Snowflake)" label, labelled placeholders, and the play screen that calls startGame from src/engine/index.ts and returns to select on exit. Use stub data until the server routes work. For rig previews, use the engine's rig renderer once it exists (ask the engine lane), with a simple placeholder until then.
Agents only edit their own folders and never run git. You integrate, test, commit and land on main.

As soon as Rayan's content/ cartridges land, seed them into Snowflake. The 1:45 checkpoint goal: /api/generate returns one valid cartridge for "Dragon Ball episode 1" + "Goku", and the select screens list the library from the API.

If you need a change to src/shared/, stop and tell me so I can ask Rayan. Update your line in NOTES.md.
```
