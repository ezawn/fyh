# Work log

One line per person; keep yours current. Newest updates at the top.

| Date | Who | Branch | Working on | Status |
|------|-----|--------|------------|--------|
| 2026-11-21 | Sunlighttiger43 (Claude), Server + UI lane | `sunlighttiger43/server-ui` | Server: 5 SPEC 7 routes on Snowflake storage (`server/store.ts`), NDJSON-streamed generation with 1 repair, session + remix lines, `server/seed.ts`. **Snowflake trial blocks Cortex AI_COMPLETE**, so AI calls use the Anthropic API (`server/ai.ts`, needs `ANTHROPIC_API_KEY`; `AI_PROVIDER=cortex` on a paid account). UI: library, character/world select, generate, play screens (`src/ui/`). Offline dev: `STORE=memory` | in progress |
| 2026-11-21 | ezawn (Claude), Engine lane | `ezawn/engine` | Phaser engine on main: 400×224 pixel-art scene, rooms from ASCII layouts, `startGame(parent, SessionResponse, onExit)`; dev page `/src/engine/dev.html`. Starting CORE + COMBAT agents. `SUPPORTED_MECHANICS` (exported from `src/engine`) lists what works; anything else must show "not supported" | in progress |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/content` | Shared contract v1 on main (`src/shared/`). 3 demo cartridges done and valid in `content/` (Goku, Peppa, Gojo); builders in `scripts/content/`, rig preview: `npx tsx scripts/preview-rigs.ts` then open `/content/rig-preview.html` on the dev server. Ready for Friend 2 to seed into Snowflake | done |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/foundation` | Final spec `docs/SPEC.md` + workload split and 3 prompts in `docs/LANES.md` | done |
| 2026-11-21 | RayanDeputy (Claude) | `rayan/foundation` | Project scaffold (Vite + Phaser + Express), cartridge contract in `src/shared/`, 2 sample cartridges, `docs/LANES.md` with the 3 lane prompts, filled in `docs/INTERFACES.md` | done |
| 2026-11-21 | Sunlighttiger43 (Claude) | `sunlighttiger43/interfaces` | Draft `docs/INTERFACES.md` template, awaiting team review | in review |
| 2026-11-21 | Sunlighttiger43 (Claude) | `sunlighttiger43/main-work` | Merged team workflow + Areas table into CLAUDE.md; ready for feature work | in progress |
| 2026-11-21 | ezawn (Claude) | `ezawn/collab-setup` | Added detailed team git workflow to CLAUDE.md | done |
| 2026-11-21 | Sunlighttiger43 | `main` | Added .gitignore, CLAUDE.md, NOTES.md | done |
