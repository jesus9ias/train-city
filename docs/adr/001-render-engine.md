# ADR-001: Phaser 4 for the canvas, React for the UI, pure TypeScript core

- **Status**: Accepted
- **Date**: 2026-10-03

## Context

Train City is a 2D, grid-based (20 × 20 px cells), pixel-art railway simulation that runs only in
the browser. It needs a pannable/zoomable canvas with good performance for up to 200 × 200 cells and
dozens of animated vehicles, plus a fair amount of conventional UI (palettes, inspector, HUD, menus,
file import/export). Game logic must be deterministic and testable without a browser
(spec.md §1.1, §4.8).

## Decision

- **Phaser 4** (4.2.1 at the time of writing; stable since 4.0) renders the world and handles canvas
  input. It is configured with `pixelArt: true` and `roundPixels: true`.
- **React 19** renders every non-canvas UI element.
- **Game logic lives in `src/core/`**, written in plain TypeScript with no dependency on React,
  Phaser or the DOM. ESLint enforces this (`no-restricted-imports`, `no-restricted-globals`,
  `no-restricted-properties` in `eslint.config.js`).
- React and Phaser communicate only through **Zustand vanilla stores** (`src/state/`). Phaser scenes
  receive the stores through their constructor. Phaser objects never hold game state.
- **Camera math** (discrete zoom steps, anchored zoom, clamping/centering) lives in `core/view` as pure
  functions. We do not use Phaser's camera bounds, because Phaser 4 left-aligns a map that is smaller
  than the viewport, and we want it centered.

## Alternatives considered

| Option                 | Why not                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PixiJS                 | Faster and lighter, but camera, input and scene management would have to be built by hand. Still a valid fallback: the pure core makes the renderer replaceable. |
| Konva / react-konva    | Declarative React integration, but weaker performance with thousands of nodes and continuous animation.                                                          |
| Hand-written Canvas 2D | Full control, but we would reinvent cameras, input, texture atlases and batching.                                                                                |
| Phaser 3               | Mature, but Phaser 4 is the current stable line with a reworked WebGL renderer. Its API is close enough to Phaser 3 that most examples still apply.              |

## Consequences

- Phaser adds about 360 KB gzipped, kept in its own `phaser` chunk. That is within the 2 MB initial
  budget (spec.md §12.3).
- Phaser and React have different lifecycles. `render/GameCanvas.tsx` creates the game in an effect
  and destroys it in the cleanup. Phaser defers destruction to the next animation frame, which never
  comes in a hidden tab, so the cleanup also detaches the canvas immediately. Otherwise a StrictMode
  remount leaves a second, dead canvas on top of the live one.
- Rendering code is covered by E2E smoke tests (Playwright). All visible logic is unit-tested in
  `core/`.
- TypeScript is pinned to 6.0.x because `typescript-eslint` does not support TypeScript 7 yet.
  Revisit when it does.
