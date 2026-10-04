# ADR-002: ENDESGA 32 palette, native 20 × 20 sprites, art generated from code

- **Status**: Accepted
- **Date**: 2026-10-04

## Context

Stage 7 replaces the colored placeholders with real pixel art (spec.md §4.14). We had to choose
the game's fixed palette and the native sprite size (open question S7), and decide how sprites
are authored and turned into the atlases the renderer loads (`public/assets/atlases/`). The
project has no dedicated artist yet, the art must be original or CC0, and every pixel must stay
inside the palette.

## Decision

- **Palette**: [ENDESGA 32](https://lospec.com/palette-list/endesga-32) — 32 colors with good
  ramps for nature (greens, browns, sand, water) and saturated accents for vehicles and UI. The
  colors are listed, with the names the code uses, in `src/art/palette.ts` and `docs/art.md`.
  A palette is a list of colors, not a copyrightable work; ENDESGA 32 is published for free use.
- **Sprite size**: native **20 × 20 px per cell** (multi-cell objects use multiples), drawn at
  1× and never scaled at authoring time. Camera zoom keeps integer steps ≥ 1× (spec.md §4.14).
- **Authoring**: sprites are **drawn by code** in `src/art/` (terrain noise, shaded volumes for
  trees and rocks, buildings from shapes, tracks from the same route geometry the simulation
  uses, vehicles drawn nose-up and turned losslessly). `PixelCanvas` only accepts palette color
  names, so off-palette pixels are impossible by construction.
- **Pipeline**: `pnpm art` (`scripts/build-art.ts`) packs every family into a PNG + Phaser
  JSON-hash atlas in `public/assets/atlases/` and lists them in `src/data/atlases.json`. The
  output is committed. A unit test regenerates the atlases in memory and fails if the committed
  files differ, so code and assets cannot drift apart.
- **Fonts**: Pixelify Sans (SIL OFL 1.1), self-hosted through `@fontsource/pixelify-sans`, for
  headings, the HUD and map labels.

## Alternatives considered

| Option                              | Why not                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PICO-8 (16 colors)                  | Too few ramps for five terrains, buildings and eight vehicle types.                                                     |
| A custom palette                    | More work to balance; ENDESGA 32 is a proven, widely used 32-color set.                                                 |
| 10 × 10 sprites scaled ×2           | Chunkier look, and halves the detail available for vehicles, which are only ~10 px wide already.                        |
| Hand-drawn Aseprite files           | No artist on the project yet. The atlas format is the same, so Aseprite exports can replace the generated sheets later. |
| Generating textures at runtime only | That is what the placeholders do; shipping atlases keeps the spec's artist-replaceable pipeline.                        |

## Consequences

- Art changes are code reviews: diffs are readable, deterministic and tested.
- Replacing a family with hand-made art means exporting a PNG + JSON hash with the same frame
  names and deleting its generator, or keeping both and letting the up-to-date test track it.
- Catalog `color` values (used by placeholders and vector fallbacks) are palette colors too;
  modders may still use any color, which just falls back to placeholders.
