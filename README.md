# Train City

A 2D pixel-art railway simulation game that runs entirely in the browser. Build track networks and
move cargo and passengers from A to B efficiently.

**How to play:** in the Editor, lay track between stations and buy a train (Trains tab). Press
Run and start it: trains stop at every station, unload what it wants (you get paid), load what
it supplies and refuel where fuel is sold. Meet the level's objectives before time runs out; you
earn up to 3 stars for being fast, fuel-efficient and cheap. Trains never reverse: build loops.
Run several trains if the level allows it, but keep them apart: two trains on the same track crash
and are lost with their cargo. Buy replacements in the Editor (Trains tab, where you can also scrap
trains); if no train can work and you cannot afford a new one, the level is lost.

- Specification: [spec.md](spec.md)
- Architecture decisions: [docs/adr](docs/adr)
- Art guide (palette, sprites, atlases): [docs/art.md](docs/art.md)

## Requirements

- Node.js 24+
- pnpm (the version is pinned in `package.json` → `packageManager`). If `pnpm` is not on your PATH,
  run `corepack enable pnpm` once, or prefix the commands with `corepack`
  (e.g. `corepack pnpm install`).

## Commands

| Command                             | Description                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm install`                      | Install dependencies and git hooks                                                |
| `pnpm dev`                          | Start the dev server at http://localhost:5173                                     |
| `pnpm build`                        | Typecheck and build for production into `dist/`                                   |
| `pnpm preview`                      | Serve the production build                                                        |
| `pnpm lint`                         | ESLint (including architecture guardrails)                                        |
| `pnpm format` / `pnpm format:check` | Prettier                                                                          |
| `pnpm typecheck`                    | TypeScript, no emit                                                               |
| `pnpm test` / `pnpm test:watch`     | Unit and integration tests (Vitest)                                               |
| `pnpm validate:data`                | Validate catalogs, levels and atlas references                                    |
| `pnpm art`                          | Regenerate the pixel-art atlases from `src/art` (see [docs/art.md](docs/art.md))  |
| `pnpm test:coverage`                | Unit tests with coverage (≥ 90% required for `src/core`)                          |
| `pnpm test:e2e`                     | End-to-end tests (Playwright). First run: `pnpm exec playwright install chromium` |

Open a specific level with `?level=<id>` (e.g. http://localhost:5173/?level=sandbox).

## Controls

| Input                                      | Action                                  |
| ------------------------------------------ | --------------------------------------- |
| Palette item, then click the map           | Place a track, object or terrain (drag) |
| `R`                                        | Rotate the next track piece 90°         |
| `Del` / `I` / `Esc`                        | Erase tool / Inspect tool / deselect    |
| `Ctrl+Z` / `Ctrl+Y`                        | Undo / redo                             |
| Mouse wheel / `+` `−` buttons              | Zoom (0.5×, 1×, 2×, 3×, 4×)             |
| Middle-button drag, or `Space` + left drag | Pan                                     |
| `G`                                        | Toggle grid                             |
| `Tab` (with the map focused) / `P`         | Switch Editor ⇄ Run / play-pause in Run |
| Click a switch / a train in Run Mode       | Flip the switch / show the train panel  |

On phones and tablets (narrow screens) the map fills the screen: open the palette with **Build**
(or **Trains** in Run Mode) and the inspector with **Info**; file actions live under **☰**.

| Touch                                   | Action                                                |
| --------------------------------------- | ----------------------------------------------------- |
| Tap                                     | Same as a click (place, erase, inspect, flip, select) |
| One-finger drag, no build tool selected | Pan (with a build tool it paints, like the mouse)     |
| Two-finger drag / pinch                 | Pan / zoom in steps                                   |
| ↻ / ✕ over the map                      | Rotate the next piece or turn the train / deselect    |

## Project layout

```
src/
  core/         pure, deterministic game logic (no React/Phaser/DOM)
  art/          palette and sprite drawing code; `pnpm art` turns it into atlases
  data/         JSON catalogs and levels, Zod schemas, loader and validation
  state/        Zustand stores shared by React and Phaser
  render/       Phaser game, scenes and the <GameCanvas> bridge
  ui/           React components
  app/          app shell, error boundary, test hook
  lib/          generic helpers (logger)
scripts/        build-art.ts (atlas generator)
public/assets/  generated atlases and LICENSES.md
tests/e2e/      Playwright tests
docs/adr/       architecture decision records
```

## Conventions

- Everything in English: code, docs, UI and data.
- Conventional Commits, enforced by commitlint (`feat(track): add wye piece`).
- Pre-commit runs lint-staged (ESLint + Prettier) and the typecheck.
