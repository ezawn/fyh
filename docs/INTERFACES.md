# Shared interfaces

The contract everyone builds against. **Status: v1, build against this.**
The source of truth is the code: [`src/shared/cartridge.ts`](../src/shared/cartridge.ts) (data) and [`src/shared/api.ts`](../src/shared/api.ts) (HTTP).
Change those files only on a branch, and tell the whole team first, because everyone's code depends on them.

## Conventions
- All requests and responses are JSON (`Content-Type: application/json`).
- IDs are kebab-case strings. Timestamps are ISO 8601 UTC strings (`"2026-11-21T12:00:00Z"`).
- Field names use `camelCase`.
- Base URL: `/api` (Vite proxies it from :5173 to the Express server on :3001).
- Auth: none.

## Data types (summary; full definitions in `src/shared/cartridge.ts`)

- **`Cartridge`**: one playable game = `character` + `world`, plus `title`, `source`, `coverColor`, and `remix` (only on remixes).
- **`Character`**: who you play. `sprite`, `stats` (speed / jump / health / damage, 1–10), `abilities` (1–4 picked from the fixed list), `attackName`, `powerLevel` (1–100), `traits`.
- **`World`**: where you play. `palette` (sky / ground / platform / accent), `mood`, `collectibleName`, `enemies` (1–3), `boss`, `levels` (2–4, last one is the boss level), `threatLevel` (1–100).
- **`Level`**: `name`, `objective`, `intro` / `outro` dialogue (max 4 lines each), `isBossLevel`, `layout` (ASCII tile map).
- **`Sprite`**: 16×16 grid; each row is a 16-char string, `.` is transparent, every other char is a key into `palette` (hex colour).
- **Abilities** (the engine implements exactly these): `doubleJump`, `projectile`, `melee`, `dash`, `glide`, `shield`, `flight`.
- **Enemy behaviours**: `walker`, `jumper`, `flyer`, `shooter`. **Boss attacks**: `charge`, `jump`, `shoot`, `summon`.

### Level tile map
Exactly 14 rows, all the same width (40–120 chars).

| Char | Meaning |
|------|---------|
| `.` | empty |
| `#` | solid ground |
| `=` | one-way platform (jump up through it) |
| `^` | spikes (hurt on touch) |
| `P` | player start (exactly one) |
| `G` | goal / exit (exactly one; not on the boss level) |
| `C` | collectible |
| `B` | boss spawn (boss level only, exactly one) |
| `1`–`3` | enemy spawn: `1` = `world.enemies[0]` |

`checkCartridge(json)` in `cartridge.ts` returns a list of problems (empty = valid). The AI lane must run every generated cartridge through it. `npm run check:carts` checks every file in `cartridges/`.

## API routes

| Method | Path | Request body | Response | Owner |
|--------|------|--------------|----------|-------|
| GET | `/api/cartridges` | none | `CartridgeSummary[]` (newest first) | AI lane |
| GET | `/api/cartridges/:id` | none | `Cartridge` | AI lane |
| POST | `/api/cartridges` | `GenerateRequest { title, synopsis }` | `201` + `Cartridge` (generated and saved) | AI lane |
| POST | `/api/remix` | `RemixRequest { characterFrom, worldFrom }` | `201` + `Cartridge` (powerscaled and saved) | AI lane |

## Engine API (UI → engine)

```ts
// src/engine/index.ts
startGame(parent: HTMLElement, cart: Cartridge, onExit: (r: GameResult) => void): GameHandle
type GameResult = { outcome: "won" | "died" | "quit"; collectibles: number };
type GameHandle = { destroy(): void };
```

## Errors
Every error response uses the same shape, with a matching HTTP status (400, 404, 500, 501…):
```ts
type ApiError = {
  error: {
    code: string;    // machine-readable, e.g. "NOT_FOUND", "GENERATION_FAILED"
    message: string; // human-readable
  };
};
```
