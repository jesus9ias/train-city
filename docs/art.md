# Art guide

Everything visible in Train City is pixel art drawn with one fixed palette (ADR-002). This guide
covers the palette, sizes, frame naming and how to change or add sprites.

## Palette — ENDESGA 32

| Name   | Hex       | Name   | Hex       | Name    | Hex       | Name   | Hex       |
| ------ | --------- | ------ | --------- | ------- | --------- | ------ | --------- |
| brick  | `#be4a2f` | wine   | `#a22633` | forest  | `#265c42` | silver | `#c0cbdc` |
| rust   | `#d77643` | red    | `#e43b44` | pine    | `#193c3e` | steel  | `#8b9bb4` |
| sand   | `#ead4aa` | orange | `#f77622` | navy    | `#124e89` | slate  | `#5a6988` |
| tan    | `#e4a672` | amber  | `#feae34` | blue    | `#0099db` | ink    | `#3a4466` |
| clay   | `#b86f50` | yellow | `#fee761` | cyan    | `#2ce8f5` | night  | `#262b44` |
| bark   | `#733e39` | lime   | `#63c74d` | white   | `#ffffff` | black  | `#181425` |
| plum   | `#3e2731` | green  | `#3e8948` | magenta | `#ff0044` | violet | `#68386c` |
| orchid | `#b55088` | coral  | `#f6757a` | peach   | `#e8b796` | copper | `#c28569` |

The names are the ones `src/art/palette.ts` uses. The React UI uses the same colors as CSS
tokens (`src/app/app.css`).

## Sizes and view

- **1 cell = 20 × 20 px.** Multi-cell objects use multiples (house 40 × 40, power plant 60 × 60).
- **Top-down** for terrain, tracks and vehicles; a **3/4 view** for objects (trees, buildings),
  lit from the **top-left**.
- Vehicles are ~10 px wide, centered on the track, drawn **nose up (north)**; the other facings
  are lossless quarter turns.
- Track pieces are drawn at rotation 0 and turned by the renderer in 90° steps.
- Outlines use `black` (or the darkest tone of the object's ramp), never pure `#000`.

## Atlases and frame names

`pnpm art` writes one atlas per family to `public/assets/atlases/<family>.png` + `.json`
(Phaser JSON hash) and lists them in `src/data/atlases.json`.

| Family     | Frames                                                 | Used by                               |
| ---------- | ------------------------------------------------------ | ------------------------------------- |
| `terrain`  | `<terrain>_<variant>` (3 variants)                     | `terrains.json` → `sprite.frames`     |
| `objects`  | `<object>_0`                                           | `objects.json` → `sprite.frames`      |
| `tracks`   | `<piece>_<state>` (one per switch state), `platform_0` | `track-pieces.json` → `sprite.prefix` |
| `vehicles` | `<model>_<N\|E\|S\|W>`                                 | `train-models.json` → `sprite.prefix` |
| `ui`       | `explosion_0..5`, `smoke_0..3`, `switch_marker`        | effects in `render/layers`            |

Anything a catalog references but the atlas lacks falls back to a generated placeholder and logs a
development warning; `src/data/atlases.test.ts` (part of `pnpm validate:data`) fails for the
bundled catalogs so this never ships.

## Animations

- **Steam**: running locomotives with `render.smoke: true` puff `smoke_0..3` from the chimney.
- **Crash**: `explosion_0..5` at 10 fps where two trains collided.
- **Switch flip**: `switch_marker` brackets the switch for a moment; the lamp on switch frames is
  `lime` on the default route and `amber` otherwise.
- Station idle animations are in the backlog.

## Changing or adding art

1. Edit or add a drawing function in `src/art/` (`terrain.ts`, `objects.ts`, `tracks.ts`,
   `vehicles.ts`, `fx.ts`). Paint only with palette names: `PixelCanvas` rejects anything else.
2. Run `pnpm art` and look at the PNGs (they are tiny; open them zoomed with nearest-neighbor).
3. Reference new frames from the catalogs (`sprite.frames` or `sprite.prefix`).
4. Run `pnpm test` — it checks that the committed atlases match the code, that every pixel is in
   the palette, and that every referenced frame exists.
5. Record new third-party assets in `public/assets/LICENSES.md` (generated art is original).

Hand-made art can replace a family: export a PNG + JSON hash with the same frame names, then
remove that family from the generator (and from the up-to-date test).
