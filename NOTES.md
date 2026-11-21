# Work log

One line per person; keep yours current. Newest updates at the top.

| Date | Who | Branch | Working on | Status |
|------|-----|--------|------------|--------|
| 2026-11-21 | ezawn (Claude), Engine lane | `ezawn/engine` | Engine playable end to end (contract v1.1): rooms/tiles/backdrops, player + all 8 mechanics (`SUPPORTED_MECHANICS` from `src/engine`; anything else must show "not supported"), resolveHit combat, damage numbers/IMMUNE, 4 enemy AIs, boss, regen, HUD, dialogue, NPCs, props, room banner, Defeated/Complete screens, STAGE/BOSS/STOMP music. UI lane: `rigPreviewCanvas(rig, scale)` in `src/engine/render/rig.ts` for select previews. Dev page `/src/engine/dev.html?char=...&world=...`. Needs a human playtest | in progress |
| 2026-11-21 | Sunlighttiger43 (Claude), Server + UI lane | `sunlighttiger43/server-ui` | On main: 5 SPEC 7 routes on Snowflake (`server/store.ts`), session route, `server/seed.ts`, UI screens (`src/ui/`). **3 demo cartridges seeded into Snowflake** (RETRO.PUBLIC.CARTRIDGES); `/api/characters` + `/api/worlds` list them. **AI is off by team decision (no paid key):** Snowflake trial blocks Cortex, so `/api/generate` returns a clear "live generation is off" result and remix lines fall back to original dialogue. Adding `ANTHROPIC_API_KEY` to the server `.env` turns both on (`server/ai.ts`). | done (AI off) |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/content` | Contract v1.1 (2x-detail rigs, NPCs, props, room banner) + all 3 cartridges redrawn at 2x with new NPCs (Bulma, Umigame, Mummy Pig, Grandpa Pig, Megumi, Nobara), new enemies (Oolong, Rebecca Rabbit, Grasshopper Curse) and scenery props. Preview: `npx tsx scripts/preview-rigs.ts` → `/content/rig-preview.html` | done |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/content` | Shared contract v1 on main (`src/shared/`). 3 demo cartridges done and valid in `content/` (Goku, Peppa, Gojo); builders in `scripts/content/`, rig preview: `npx tsx scripts/preview-rigs.ts` then open `/content/rig-preview.html` on the dev server. Ready for Friend 2 to seed into Snowflake | done |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/foundation` | Final spec `docs/SPEC.md` + workload split and 3 prompts in `docs/LANES.md` | done |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/foundation` | Project scaffold (Vite + Phaser + Express), cartridge contract in `src/shared/`, 2 sample cartridges, `docs/LANES.md` with the 3 lane prompts, filled in `docs/INTERFACES.md` | done |
| 2026-11-21 | Sunlighttiger43 (Claude) | `sunlighttiger43/interfaces` | Draft `docs/INTERFACES.md` template, awaiting team review | in review |
| 2026-11-21 | Sunlighttiger43 (Claude) | `sunlighttiger43/main-work` | Merged team workflow + Areas table into CLAUDE.md; ready for feature work | in progress |
| 2026-11-21 | ezawn (Claude) | `ezawn/collab-setup` | Added detailed team git workflow to CLAUDE.md | done |
| 2026-11-21 | Sunlighttiger43 | `main` | Added .gitignore, CLAUDE.md, NOTES.md | done |
