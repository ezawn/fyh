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
| Engine | _(claim it)_ | `<name>/engine` | `src/engine/` |
| AI | _(claim it)_ | `<name>/ai` | `server/`, `cartridges/` |
| UI | _(claim it)_ | `<name>/ui` | `src/main.ts`, `src/ui/`, `index.html`, `public/` |
| Shared | everyone, after telling the team | — | `src/shared/`, `package.json`, `docs/`, `CLAUDE.md` |

Full lane instructions and prompts: `docs/LANES.md`.

## Project
- **Retro Cartridges:** paste a story's synopsis and the AI turns it into a playable NES-style platformer "cartridge". Characters and worlds are independent, so any character can be remixed into any world, with the AI rebalancing the game for the power gap.
- **Demo with public-domain stories only** (Dracula, Sherlock Holmes, Frankenstein…). No copyrighted characters in the repo or the demo.
- **Stack:** TypeScript everywhere. Vite + Phaser 3 web app (`src/`), Express API (`server/`) calling the Anthropic SDK (`claude-opus-5-5`), cartridges stored as JSON files in `cartridges/`.
- **The contract:** `src/shared/cartridge.ts` (zod schema + `checkCartridge`) and `src/shared/api.ts`. Summary in `docs/INTERFACES.md`.
- **Run:** `npm install`, copy `.env.example` to `.env` (AI lane adds `ANTHROPIC_API_KEY`), then `npm run dev` (web http://localhost:5173, API :3001). Check with `npm run typecheck` and `npm run check:carts`.
