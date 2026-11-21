# fyh

Shared repo worked on by several people, each with their own Claude Code session.
Claude sessions on different machines can't message each other, so this repo is how we coordinate.

## Team workflow for Claude (follow exactly)

1. **Before starting:** `git checkout main`, then `git pull origin main`.
2. **Create your own branch once:** `git checkout -b <yourname>/<feature>`. Never commit directly to `main`.
3. **Stay in your area.** Only edit files in the folders you've been given. If you need a change in someone else's area, stop and tell your human instead of editing it.
4. **Every ~20 minutes, save and push your branch:**
   ```
   git add -A
   git commit -m "<what changed>"
   git push -u origin <your-branch>
   ```
5. **Every ~45 minutes, and whenever a piece of work is finished, land it on main safely:**
   ```
   git fetch origin
   git merge origin/main            # pull everyone else's work into YOUR branch first
   ```
   - If there's a conflict, **STOP and show your human the output. Don't resolve it yourself.**
   - If it's clean:
   ```
   git push origin <your-branch>
   git checkout main
   git pull --ff-only origin main
   git merge --no-ff <your-branch>
   git push origin main
   git checkout <your-branch>
   git merge --ff-only main
   ```
6. **Never force-push and never rewrite history on `main`.**
7. **Keep `NOTES.md` current:** add a line saying who you are, what you're working on and its status.

Note: on Windows PowerShell 5.1, `&&` doesn't work, so run the commands one at a time (or use `;` / Git Bash).

## Areas (who owns which folders)

Add yourself here when you start. Don't edit folders owned by someone else.

| Lane | Person | Branch | Folders |
|------|--------|--------|---------|
| Contract + Content | Rayan | `rayan/content` | `src/shared/` (contract), `content/`, `scripts/` |
| Engine | Friend 1 | `<name>/engine` | `src/engine/` |
| Server + UI | Friend 2 | `<name>/server-ui` | `server/`, `src/ui/`, `src/main.ts`, `index.html`, `public/` |
| Shared | tell the team first | — | `package.json`, `docs/`, `CLAUDE.md` |

Each lead Claude splits its lane between 2 agents with separate folders; agents never run git, the lead commits. Full split, timeline and prompts: `docs/LANES.md`.

## Project
- **AI Retro Remix.** The full spec is **`docs/SPEC.md`**; read it before doing anything. Type a film, episode or anime + its main character, and Snowflake Cortex generates a retro platformer "cartridge" (one protagonist + one 3-room world). Pick any character and any world on Terraria-style select screens. Power gaps are preserved (uncapped LoL-style stats + hax tags), and only the dialogue reacts to mismatches.
- **Stack:** TypeScript. Vite + Phaser 3 web app (`src/`), Express server (`server/`) using `snowflake-sdk` for Cortex `AI_COMPLETE` and the shared cartridge library in Snowflake.
- **Demo cartridges:** Goku (Dragon Ball ep 1), Peppa (Muddy Puddles), Gojo (JJK).
- **Run:** `npm install`, copy `.env.example` to `.env` and add the Snowflake values (never commit `.env`), then `npm run dev` (web http://localhost:5173, API :3001). Check with `npm run typecheck`.
- Note: until Rayan's contract lands (about 0:20), `main` still contains an older draft scaffold (`src/shared/cartridge.ts`, Dracula/Sherlock samples, Anthropic SDK server). SPEC §14 lists what gets replaced.
