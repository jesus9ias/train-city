# Train City — Specification (spec.md)

> Document version: 0.3.0 · Date: 2026-10-03 · Status: Draft, ready to start Stage 0

---

## 1. Vision

Train City is a 2D pixel-art railway simulation game that runs **entirely in the browser** (no backend, no database). The player's goal is to **move cargo and passengers from A to B efficiently**, measured by **time**, **fuel** and **construction cost**. Each level defines its own objectives and constraints, and the player builds the network (tracks, switches, loops, stations, trains) to meet them.

Deliveries earn **money**, which pays for construction, trains and fuel. If a level reaches a state where its objectives can no longer be met (e.g. the trains are lost and there is not enough money to replace them), the level is lost and must be restarted.

The game has two modes:

- **Editor Mode**: place terrain, objects, track pieces, stations, trains and wagons. Entering it pauses the simulation.
- **Run Mode**: the simulation runs; the player only interacts with what was built (start/stop trains, flip switches, change simulation speed).

All content (terrains, objects, pieces, trains, cargo, levels) is **configurable JSON**, so it can grow in future iterations without touching code.

### 1.1 Guiding principles

1. **Minimum functional first**: every stage delivers something playable or verifiable.
2. **Data-driven**: adding a terrain, a tree or a train model = adding a JSON entry (plus, optionally, a sprite).
3. **Pure, deterministic core**: game logic does not depend on React, Phaser or the DOM. Same input → same output.
4. **Serializable state**: everything that matters (map, trains, cargo, fuel, money, time) can be saved and restored exactly.
5. **Schema versioning** from day 1 (saves survive updates).
6. **English only**: code, docs, UI text and data are in English. No i18n layer for now.
7. **Future-proof grid**: the connection model supports 8 directions from day 1, even though the MVP only uses 4 (diagonals arrive in Stage 8).

---

## 2. Tech stack and library recommendation

### 2.1 Rendering engine comparison

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Phaser** | Camera (pan/zoom), input, scenes, tweens, sprite atlases, built-in `pixelArt` mode, good docs, WebGL + Canvas | Heavier; its lifecycle coexists with React's and must be isolated | ✅ **Recommended** |
| PixiJS | Very fast and lightweight, pure rendering | Camera, input and scenes must be built by hand | Valid alternative |
| Konva / react-konva | Declarative React integration | Worse performance with thousands of nodes and continuous animation | ❌ |
| Hand-written Canvas 2D | Full control, zero dependencies | Reinvent everything | ❌ |

**Decision (ADR-001)**: **Phaser** (latest stable version at scaffolding time; if Phaser 4 is stable, evaluate it first) for canvas rendering and input, and **React** for all non-canvas UI (toolbars, palettes, inspector, HUD, menus).
Because the core is pure, **the renderer is replaceable** (e.g. migrate to PixiJS) without touching game logic.

### 2.2 Full stack

| Area | Choice |
|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Build | Vite |
| UI | React (latest stable) |
| Game rendering | Phaser (`pixelArt: true`) |
| App state | Zustand (small stores; used outside React via `getState/subscribe`) |
| JSON validation | Zod (schemas are the source of truth; types via `z.infer`) |
| Unit/integration tests | Vitest + @testing-library/react |
| Property-based testing | fast-check (track connectivity, determinism, economy invariants) |
| E2E | Playwright |
| Lint/format | ESLint (flat config) + `eslint-plugin-boundaries` or `import/no-restricted-paths` + Prettier |
| Git hooks | Husky + lint-staged + commitlint (Conventional Commits) |
| CI | GitHub Actions: lint → typecheck → test → build → e2e |
| Package manager | pnpm |
| Pixel-art tooling | Aseprite (or LibreSprite) → PNG spritesheet + JSON atlas |

---

## 3. Architecture

### 3.1 Layers

```
┌──────────────────────────────────────────────────────────────┐
│ ui/ (React)        Toolbar · Palette · Inspector · HUD · Menus │
├──────────────────────────────────────────────────────────────┤
│ state/ (Zustand)   gameStore · editorStore · uiStore           │
│                    Commands (undo/redo) · EventBus             │
├───────────────┬──────────────────────────────┬───────────────┤
│ render/       │ core/ (pure TS, deterministic)│ persistence/ │
│ (Phaser)      │ grid · track · sim · economy │ localStorage  │
│ Scenes/Layers │ cargo · objectives · failure │ export/import │
│ Input→Command │                              │ migrations    │
├───────────────┴──────────────────────────────┴───────────────┤
│ data/   schemas (Zod) · catalogs/*.json · levels/*.json        │
│ public/assets/   pixel-art atlases (PNG + JSON)                │
└──────────────────────────────────────────────────────────────┘
```

**Dependency rules (enforced by the linter):**

- `core/` may only import from `core/` and from `data/schemas` types. **Never** from `react`, `phaser`, `window`, `document` or `localStorage`.
- `render/` reads state and emits commands; it **never** mutates state directly.
- `ui/` does not import from `render/` (they communicate through `state/`).
- `persistence/` only serializes and deserializes, using Zod schemas.

### 3.2 Data flow

```
Input (Phaser pointer / React button)
   → Command (e.g. PlaceTrackCommand)              [state/commands]
   → applies a pure core reducer                   [core/]
   → new GameState in the store                    [state/]
   → subscribers: Phaser re-renders the affected layer, React re-renders the UI
   → debounced autosave                            [persistence/]
```

In **Run Mode**, Phaser's update loop calls `simulation.step(state, dt)` with a **fixed timestep**: `TICK_MS = 50` (20 ticks/s), using an accumulator. Rendering interpolates between ticks.

`step` returns `{ state, events }`. **Events** (`train_crashed`, `cargo_delivered`, `train_out_of_fuel`, `level_completed`, `level_failed`…) are plain data that the renderer and UI use for animations, notices and (later) sound. Events never feed back into the core.

### 3.3 React ↔ Phaser integration

- A `<GameCanvas />` component creates the `Phaser.Game` instance in `useEffect` and destroys it in the cleanup. It must be safe against StrictMode double-mounting.
- Scenes receive the store through injection (no global import) so they can be tested.
- Phaser **never** holds game state of its own: sprites are a projection of `GameState`.

### 3.4 Folder structure

```
train-city/
├─ spec.md
├─ docs/
│  ├─ adr/                     # Architecture Decision Records
│  └─ art.md                   # pixel-art guide: palette, sizes, naming
├─ art/                        # source files (.aseprite), not shipped
├─ public/assets/
│  ├─ atlases/                 # terrain/objects/tracks/vehicles/ui .png + .json
│  └─ LICENSES.md              # origin/license of every asset
├─ src/
│  ├─ app/                     # App.tsx, simple routing (menu → level)
│  ├─ core/
│  │  ├─ grid/                 # coordinates, ports (8 directions), helpers
│  │  ├─ track/                # pieces, rotation, routes, geometry, graph
│  │  ├─ sim/                  # step(), trains, movement, collisions, events
│  │  ├─ economy/              # money, ledger, fuel purchase, revenue
│  │  ├─ cargo/                # stations, loading/unloading, production
│  │  ├─ objectives/           # objectives, stars, failure checks
│  │  ├─ rng.ts                # seeded PRNG (mulberry32)
│  │  └─ index.ts
│  ├─ data/
│  │  ├─ schemas/              # Zod: catalog, level, save
│  │  ├─ catalogs/             # terrains.json, objects.json, track-pieces.json,
│  │  │                        # train-models.json, cargo-types.json
│  │  ├─ levels/               # level-001.json, sandbox.json, index.json
│  │  ├─ atlases.json          # atlas families that exist in public/assets/atlases
│  │  ├─ loader.ts             # bundles catalogs, lazy-loads levels, validates everything
│  │  └─ validate.ts           # semantic validation (cross references, map rules)
│  ├─ state/                   # stores, commands, history (undo/redo)
│  ├─ render/                  # Phaser: scenes, layers, camera, textureFactory (placeholders)
│  ├─ persistence/             # storage.ts, exportImport.ts, migrations/
│  ├─ lib/                     # generic helpers with no game logic (logger)
│  └─ ui/                      # React components
├─ tests/
│  ├─ fixtures/                # minimal levels and saves for tests
│  └─ e2e/                     # Playwright
└─ .github/workflows/ci.yml
```

---

## 4. World model

### 4.1 Map, cells and ports

- Map size is configurable in pixels: `widthPx`, `heightPx` (default **1000 × 1000**).
- **Cell = 20 × 20 px** (`CELL_SIZE = 20`, global constant). It is the minimum unit for terrain, objects and tracks.
- `widthPx` and `heightPx` **must** be multiples of `CELL_SIZE` → `cols = widthPx / 20`, `rows = heightPx / 20` (1000 px → 50 × 50 = 2,500 cells).
- Limits: minimum 200 × 200 px (10 × 10 cells), maximum 4000 × 4000 px (200 × 200 = 40,000 cells).
- Coordinates: `{ x: col, y: row }`, origin at the top-left. A cell's center pixel is `(x*20+10, y*20+10)`.

**Ports** (connection points of a cell). There are 8, defined from day 1:

| Port | Position | Neighbor offset | Opposite |
|---|---|---|---|
| `N` | top edge midpoint | (0, −1) | `S` |
| `E` | right edge midpoint | (+1, 0) | `W` |
| `S` | bottom edge midpoint | (0, +1) | `N` |
| `W` | left edge midpoint | (−1, 0) | `E` |
| `NE` | top-right corner | (+1, −1) | `SW` |
| `SE` | bottom-right corner | (+1, +1) | `NW` |
| `SW` | bottom-left corner | (−1, +1) | `NE` |
| `NW` | top-left corner | (−1, −1) | `SE` |

- A port of a cell connects **only** to the opposite port of the neighbor given by its offset. A diagonal port (corner) connects only to the diagonal neighbor, never to the two orthogonal cells that share that corner.
- **MVP (Stages 0–7) uses only the cardinal ports** `N/E/S/W`. Diagonal ports are valid in the types and schemas, but the level/catalog validator rejects them until Stage 8 is enabled (`features.diagonals` flag in `core/constants.ts`).

Each cell has **layers**:

| Layer | Content | Cardinality |
|---|---|---|
| `terrain` | terrain id (+ deterministic visual variant) | exactly 1 |
| `object` | object id (tree, rock, house…) | 0..1 (multi-cell objects span several cells) |
| `track` | track piece + rotation + state | 0..1 |
| `station` | station reference | 0..1 (on a straight track) |

Rule: **a cell cannot hold both a blocking object and a track.**

### 4.2 Terrains (`catalogs/terrains.json`)

```json
{
  "schemaVersion": 1,
  "terrains": [
    { "id": "grass",  "name": "Grass",  "color": "#5DA130", "sprite": { "atlas": "terrain", "frames": ["grass_0","grass_1","grass_2"] }, "buildable": true,  "trackCostMultiplier": 1.0, "fuelMultiplier": 1.0,  "speedMultiplier": 1.0 },
    { "id": "dirt",   "name": "Dirt",   "color": "#8B6B3E", "buildable": true,  "trackCostMultiplier": 1.0, "fuelMultiplier": 1.05, "speedMultiplier": 1.0 },
    { "id": "desert", "name": "Desert", "color": "#E3C77A", "buildable": true,  "trackCostMultiplier": 1.2, "fuelMultiplier": 1.15, "speedMultiplier": 0.95 },
    { "id": "snow",   "name": "Snow",   "color": "#F2F6FA", "buildable": true,  "trackCostMultiplier": 1.5, "fuelMultiplier": 1.3,  "speedMultiplier": 0.85 },
    { "id": "water",  "name": "Water",  "color": "#3B7DD8", "buildable": false, "trackCostMultiplier": 0,   "fuelMultiplier": 1.0,  "speedMultiplier": 1.0 }
  ]
}
```

- `color` is required (placeholder and minimap); `sprite` is optional (see §4.14).
- Optional fields for the future: `tags[]`, `transitions` (autotiling).

### 4.3 Objects (`catalogs/objects.json`)

```json
{
  "schemaVersion": 1,
  "objects": [
    { "id": "tree_pine", "name": "Pine tree", "category": "nature",   "footprint": { "w": 1, "h": 1 }, "blocksTrack": true, "removable": true,  "removeCost": 5,  "render": { "shape": "circle", "color": "#2F6B2F" }, "sprite": { "atlas": "objects", "frames": ["tree_pine_0"] }, "allowedTerrains": ["grass", "dirt", "snow"] },
    { "id": "rock",      "name": "Rock",      "category": "nature",   "footprint": { "w": 1, "h": 1 }, "blocksTrack": true, "removable": true,  "removeCost": 10, "render": { "shape": "rect",   "color": "#7A7A7A" } },
    { "id": "house_s",   "name": "House",     "category": "building", "footprint": { "w": 2, "h": 2 }, "blocksTrack": true, "removable": false,                    "render": { "shape": "rect",   "color": "#B5533C" } }
  ]
}
```

- A multi-cell object's anchor is its top-left cell.
- If `allowedTerrains` is omitted, the object is allowed on any `buildable` terrain.
- Removing an object costs `removeCost` money.

### 4.4 Track pieces (`catalogs/track-pieces.json`)

Pieces are defined in their **base orientation** (0° rotation). They rotate in 90° steps in the MVP (`rotation ∈ {0, 90, 180, 270}`); from Stage 8, 45° steps are also allowed. A 90° clockwise rotation maps N→E→S→W→N and NE→SE→SW→NW→NE.

Each piece has **routes**: pairs of ports a train can traverse. A **stateful** piece has several routes sharing one port (the *trunk*); its state selects the active route.

```json
{
  "schemaVersion": 1,
  "pieces": [
    { "id": "straight",      "name": "Straight",       "cost": 10, "routes": [["N","S"]] },
    { "id": "curve",         "name": "Curve",          "cost": 12, "routes": [["S","E"]] },
    { "id": "cross",         "name": "X crossing",     "cost": 30, "routes": [["N","S"],["E","W"]] },
    { "id": "switch",        "name": "Switch",         "cost": 40, "stateful": true, "trunk": "S", "routes": [["S","N"],["S","E"]], "defaultState": 0 },
    { "id": "wye",           "name": "Wye",            "cost": 40, "stateful": true, "trunk": "S", "routes": [["S","W"],["S","E"]], "defaultState": 0 },
    { "id": "buffer",        "name": "Buffer stop",    "cost": 8,  "routes": [["S", null]] },
    { "id": "station_track", "name": "Platform track", "cost": 15, "routes": [["N","S"]], "isStation": true }
  ]
}
```

**Route length**: each route has a length in *cell units* (1 unit = one cell side), computed by `core/track/geometry` from its ports: opposite cardinal ports = 1; 90° cardinal curve = π/4 ≈ 0.785; opposite diagonal ports = √2 (Stage 8); mixed cardinal-to-corner routes come from their geometry (Stage 8). Speed and fuel are expressed per unit of distance, so they stay correct when diagonals arrive.

**Traffic rules:**

1. A train entering through port `p` looks for a route containing `p`. If none exists → **derailment** (MVP: the train stops with status `derailed` and can only be scrapped).
2. **Switch/Wye entered from the trunk**: the route of the current state is used.
3. **Switch/Wye entered from a branch** (*trailing move*): that branch's route to the trunk is used regardless of state. The state does not change.
4. **X crossing**: two independent routes; no direction change inside the crossing.
5. **Buffer stop**: the train stops with status `blocked`. **Trains never reverse** (see 4.8), so a train at a buffer stop stays there until scrapped. The network validator warns about dead ends.
6. **Map edge / no track ahead**: the train stops with status `blocked`.
7. A switch can only be flipped if **no train occupies its cell**.

**Turning around — loops**: trains only travel forwards. To return in the opposite direction, the network needs a **reversing loop** (balloon loop): a switch or wye whose two branches join each other. The train enters from the trunk, goes around the loop, and comes back to the same switch through the other branch; by rule 3 it then leaves through the trunk, facing the opposite direction. A loop around the whole network (circuit) also works. Turntables are not planned.

```
        ┌──────────┐
        │          │       train → enters the trunk (S), switch state = N
        │   loop   │       goes around the loop and comes back through branch E
        │          │       trailing move → exits through S, now heading back
        └──┐    ┌──┘
           N    E
            \  /
           [switch]
              S
              │
          main line
```

Future (Stage 8+): diagonal pieces (diagonal straight, 45° curves, diagonal switches); bridges and tunnels, signals, double slips and slopes are in the backlog.

### 4.5 Stations

- A station is a **contiguous group of `station_track` cells in a straight line** (platform length = number of cells), plus metadata:

```json
{
  "id": "st_A",
  "name": "North Mine",
  "cells": [{ "x": 5, "y": 10 }, { "x": 5, "y": 11 }, { "x": 5, "y": 12 }],
  "supplies": [{ "cargo": "coal", "ratePerMinute": 10, "capacity": 100, "initial": 50 }],
  "demands":  [{ "cargo": "passengers" }],
  "services": ["fuel"],
  "dwellSeconds": 3,
  "locked": true
}
```

- `locked: true` means the station is defined by the level and cannot be moved or deleted by the player.
- `services`: `"fuel"` = trains can buy fuel here (§4.9). Future: `"depot"` (add/remove wagons), `"repair"`.
- A train **stops at a station** when its locomotive reaches the **middle** of the last platform cell in its direction of travel (MVP: it stops at **every** station it passes through, once per visit; `lastStation` prevents stopping again until it leaves the platform). Per-train orders come later.
- Cargo moves in **whole units**; production accumulates fractions, and only whole units can be loaded. A train placed on the last platform cell stops there as soon as it starts, so it can be loaded right away.
- During the stop (`dwellSeconds`), in this order: (1) **unload** cargo the station demands (and get paid, §4.12), (2) **load** cargo the station supplies, up to the capacity of compatible wagons, (3) **refuel** if the station has the `fuel` service and the train has `autoRefuel` on.

### 4.6 Cargo (`catalogs/cargo-types.json`)

```json
{
  "schemaVersion": 1,
  "cargoTypes": [
    { "id": "passengers", "name": "Passengers", "unit": "pax", "weightPerUnit": 0.08, "payPerUnit": 3 },
    { "id": "coal",       "name": "Coal",       "unit": "t",   "weightPerUnit": 1.0,  "payPerUnit": 5 },
    { "id": "grain",      "name": "Grain",      "unit": "t",   "weightPerUnit": 0.8,  "payPerUnit": 6 },
    { "id": "oil",        "name": "Oil",        "unit": "kl",  "weightPerUnit": 0.9,  "payPerUnit": 8 },
    { "id": "goods",      "name": "Goods",      "unit": "u",   "weightPerUnit": 0.5,  "payPerUnit": 10 }
  ]
}
```

### 4.7 Locomotives and wagons

`catalogs/train-models.json`:

```json
{
  "schemaVersion": 1,
  "locomotives": [
    { "id": "loco_steam",  "name": "Steam",  "maxSpeed": 2.0, "acceleration": 0.5, "fuelCapacity": 500, "fuelPerUnit": 1.0, "fuelIdlePerSecond": 0.05, "weight": 60, "maxWagons": 5, "cost": 300, "render": { "color": "#222222" }, "sprite": { "atlas": "vehicles", "prefix": "loco_steam" } },
    { "id": "loco_diesel", "name": "Diesel", "maxSpeed": 3.0, "acceleration": 0.8, "fuelCapacity": 800, "fuelPerUnit": 0.8, "fuelIdlePerSecond": 0.02, "weight": 50, "maxWagons": 8, "cost": 500, "render": { "color": "#C8102E" } }
  ],
  "wagons": [
    { "id": "wagon_pax",    "name": "Passenger car", "accepts": ["passengers"],    "capacity": 40, "emptyWeight": 10, "cost": 80, "render": { "color": "#2B5DA8" } },
    { "id": "wagon_hopper", "name": "Hopper",        "accepts": ["coal", "grain"], "capacity": 30, "emptyWeight": 12, "cost": 70, "render": { "color": "#5A4632" } },
    { "id": "wagon_tank",   "name": "Tank car",      "accepts": ["oil"],           "capacity": 25, "emptyWeight": 12, "cost": 90, "render": { "color": "#444444" } },
    { "id": "wagon_box",    "name": "Boxcar",        "accepts": ["goods"],         "capacity": 20, "emptyWeight": 10, "cost": 60, "render": { "color": "#8C6D3F" } }
  ]
}
```

- Units: `maxSpeed` and `acceleration` in **distance units per second** of simulated time (1 unit = one cell side); `fuelPerUnit` per unit of distance.
- Each vehicle occupies **1 cell** (MVP). A train with one locomotive and N wagons occupies N+1 cells.
- A wagon carries **one cargo type at a time**.
- **Trains are one-directional**: the locomotive is always at the front, and a train never reverses (§4.4 loops).

### 4.8 Movement (simulation core)

Train state:

```ts
type TrainState = {
  id: string;
  locomotiveModel: string;
  wagons: { model: string; cargo: string | null; amount: number }[];
  head: { cell: Cell; entryPort: Port; progress: number }; // progress in distance units within the current route
  trail: { cell: Cell; entryPort: Port }[];  // cell history: wagon positions (wagons.length entries)
  speed: number;        // current units/s
  targetSpeed: number;  // 0 or maxSpeed (MVP)
  fuel: number;
  autoRefuel: boolean;  // default true
  status: 'stopped' | 'running' | 'loading' | 'blocked' | 'derailed' | 'out_of_fuel';
  dwellRemaining: number;
  purchaseValue: number; // total paid for loco + wagons (used for scrap refunds)
};
```

The heading is implied by `entryPort` and the active route; there is no "reverse" field.

`step(state, dt)` algorithm, per train:

1. If `status` is `loading`: decrement `dwellRemaining` and process unload → load → refuel; when it reaches 0 → `running`.
2. Accelerate or brake towards `targetSpeed` using `acceleration`.
3. `advance = speed × terrain.speedMultiplier × dt`; `progress += advance`.
4. While `progress ≥ routeLength`: exit through the current route's exit port, enter the neighboring cell (applying the rules in 4.4), push the cell onto `trail` (trimmed to `wagons.length` entries), and `progress -= routeLength`. Consume fuel for the distance travelled (4.9).
5. Check collisions (4.10), station stops and failure conditions (4.13).
6. Idle consumption: `fuelIdlePerSecond × dt` while the train is `stopped`/`loading`.

**Implementation notes (Stage 4)**: `core/sim/step.ts` advances one fixed tick; `core/sim/routing.ts` resolves a piece's exit for an entry port (trunk → active route, branch → trunk, no route → derailment, `null` → dead end). A train stopped at the end of the track keeps checking every tick, so it continues once the player extends the track. The renderer interpolates vehicle positions between ticks (`core/sim/facing.ts`); each wagon is drawn at the same fraction of its own cell's route as the locomotive, and sprites snap to the nearest of 4 facings.

**Determinism**: `step` is a pure function `(GameState, dt) → { state, events }`. `Math.random`, `Date.now` and `performance.now` are forbidden in `core/`. If randomness is needed (e.g. passenger arrivals), use `core/rng.ts` with the seed stored in the state.

### 4.9 Fuel

Consumption:

```
totalWeight   = loco.weight + Σ (wagon.emptyWeight + amount × cargo.weightPerUnit)
loadFactor    = totalWeight / loco.weight
fuelPerUnit   = loco.fuelPerUnit × loadFactor × terrain.fuelMultiplier
```

Purchase (fuel is **bought with money** at the level's `economy.fuelPrice` per fuel unit):

- **When a train is placed**, its tank is filled and the player pays `fuelCapacity × fuelPrice` on top of the train's price.
- **At stations with the `fuel` service**, during the dwell, a train with `autoRefuel` fills its tank as far as the money balance allows (partial refuel if money is short).
- If `fuel ≤ 0` → `status = out_of_fuel`; the train brakes to a stop. A train stranded away from a fuel station **cannot be refueled in the MVP**: it can only be scrapped (rescue is in the backlog).
- Metrics: `fuelUsedTotal`, `fuelUsedByTrain[id]`, `fuelBoughtTotal`, `fuelSpent` (money).

### 4.10 Collisions

- Occupancy is the set of cells `head.cell ∪ trail[*].cell` of each train.
- If two trains occupy the same cell (except on an X crossing through different routes) → **both trains are destroyed**: they are removed from the state at the end of the tick and their cargo is counted as `lost`. A `train_crashed` event is emitted (explosion animation).
- Track and stations are left intact (MVP).
- A crash **does not fail the level by itself**. The cost is the lost investment: the player must buy new trains. The level fails only if a failure check (4.13) says the objectives are no longer reachable.
- Future: signals and blocks that prevent collisions automatically.

**Implementation notes (Stage 6)**: `core/sim/collisions.ts` runs at the end of every tick, after all trains have moved, comparing each train's cells before and after the tick (in train order, so it is deterministic). Two trains collide when (a) they end the tick on the same cell and their routes through it share a port — so only different routes of an X crossing are exempt — or (b) they swapped cells head-on (each entered a cell the other held when the tick began). Following a train bumper to bumper is not a collision. The cargo of destroyed trains goes to `run.lost`; the `train_crashed` event carries the trains' ids and locomotives, the cell and the lost cargo, and the UI shows a toast and a placeholder burst (final animation in Stage 7). Running into a stopped or blocked train also destroys both. Lost trains are replaced by buying new ones in Editor Mode, within `editorRules.maxTrains`; the Trains tab lists every train (`n/maxTrains`) with a Scrap button, and the Run Mode panel lists them with Start/Stop.

### 4.11 Time

- `elapsedTicks` (integer) is the source of truth. `elapsedSeconds = elapsedTicks × TICK_MS / 1000`.
- The clock only runs in Run Mode; Editor Mode pauses it.
- Simulation speeds: ×0 (pause), ×1, ×2, ×4. Speed changes how many ticks are processed per frame, **never** the tick's `dt`.

### 4.12 Economy

The level has a single **money balance**, starting at `economy.initialMoney`. Money also works as **points**: the net profit is the level's score.

| Type | Item | Amount |
|---|---|---|
| Expense | Track piece | `piece.cost × terrain.trackCostMultiplier` |
| Expense | Removing an object | `object.removeCost` |
| Expense | Train | `loco.cost + Σ wagon.cost` (+ initial fuel) |
| Expense | Fuel | `fuelBought × economy.fuelPrice` |
| Income | Delivery | `amount × payPerUnit` (cargo catalog, overridable per level with `economy.payOverrides`) |
| Refund | Erasing a piece / scrapping a train | `purchaseValue × economy.refundRatio` (default 0.5) |
| Refund | Undo inside the current editor session | 100% of what that command charged |
| Refund | Erasing a piece placed in the current editor session | 100% (same as undoing it) |
| Free | Placing objects; removing an object placed in the current editor session | 0 |

Rules:

- **Money never goes negative.** An action that would make it negative is rejected ("Not enough money"); a refuel becomes partial.
- Every money movement is recorded in a **ledger** by category (`build`, `trains`, `objects`, `fuel`, `revenue`, `refunds`), so the HUD and result screen can show the breakdown.
- `buildCost` (used for scoring) = net spent on `build` + `objects` + `trains` (expenses minus refunds).
- Payment happens when cargo is unloaded at a station that demands it. Revenue based on distance or time is in the backlog.

### 4.13 Level failure (unreachable objectives)

Failure checks run at the end of every simulation tick (Run Mode, not paused), but only while objectives are still incomplete. In Editor Mode nothing is checked, so the player can plan freely; the first tick after pressing Run evaluates everything. They are a pluggable list (`core/objectives/failureChecks.ts`), so new rules can be added later. MVP checks:

1. **Time limit**: `elapsedSeconds ≥ constraints.timeLimitSeconds`.
2. **Cargo unreachable**: for any incomplete `deliver` objective, `delivered + inTransit + availableAtSources + producibleInRemainingTime < required`. If there is no time limit and a source produces with `ratePerMinute > 0`, it counts as infinite.
3. **Bankrupt**: there is no operational train **and** `money + scrapValueOfNonOperationalTrains < minRecoveryCost`.
   - *Operational* = status `running`, `stopped`, or `loading`, with `fuel > 0`.
   - `minRecoveryCost` = the cheapest allowed locomotive with a full tank + the cheapest allowed wagon compatible with a cargo still needed by an objective.

When a check fails, the level becomes `failed`, the simulation stops, and the result screen shows the reason. The **only option is "Restart level"**, which reloads the level from its JSON (initial state) and discards that level's save.

### 4.14 Art direction (pixel art)

- **Style**: pixel art. Sprites are authored at native resolution: **1 cell = 20 × 20 px**. Multi-cell objects use multiples (a 2×2 house = 40 × 40 px).
- **Phaser config**: `pixelArt: true`, `roundPixels: true`, `antialias: false`. Camera zoom uses discrete steps **0.5×, 1×, 2×, 3×, 4×** (integers when ≥ 1) so pixels don't shimmer.
- **Palette**: one fixed palette for the whole game (≈32 colors, chosen in ADR-002), documented in `docs/art.md`. Catalog `color` values should come from that palette.
- **Atlases**: one atlas per family (`terrain`, `objects`, `tracks`, `vehicles`, `ui`), exported from Aseprite as PNG + JSON (hash) into `public/assets/atlases/`. Frame naming: `<id>_<variant>` and, for vehicles, `<id>_<facing>`. Only the families listed in `src/data/atlases.json` are loaded, so a missing atlas never causes a 404. `pnpm validate:data` warns about frames that catalogs reference but atlases lack.
- **Terrain variants**: each terrain can have 2–4 variants. The variant per cell is chosen with a **deterministic hash of (x, y)** (no runtime RNG), so the map always looks the same. Transitions/autotiling are in the backlog.
- **Tracks**: rotating by multiples of 90° at runtime is allowed (it's lossless for pixel art). Stateful pieces have one frame per state.
- **Vehicles**: one frame per **facing** (4 in the MVP: N, E, S, W; 8 from Stage 8). Vehicles are never rotated by arbitrary angles: on curves, the facing is snapped to the closest direction of the current route segment.
- **Placeholders**: `render/textureFactory` generates pixel textures at runtime from `render.color`/`shape`. Every catalog entry without `sprite`, or whose frame is missing, still renders (and a dev warning is logged). This lets content and art evolve independently.
- **Animations** (Stage 7): steam/smoke, station idle animations, crash explosion, switch-flip feedback.
- **UI**: React UI uses a pixel font (OFL-licensed) for headings and HUD, and `image-rendering: pixelated` for any sprite shown in React (palette icons).
- **Licensing**: only original or CC0 assets; each one is recorded in `public/assets/LICENSES.md`.

---

## 5. Levels

### 5.1 Level schema (`levels/level-001.json`)

```json
{
  "schemaVersion": 1,
  "id": "level-001",
  "name": "First Run",
  "description": "Haul 50 t of coal from North Mine to the Power Plant.",
  "map": {
    "widthPx": 1000,
    "heightPx": 1000,
    "defaultTerrain": "grass",
    "terrainPatches": [
      { "terrain": "desert", "rect": { "x": 30, "y": 0, "w": 20, "h": 50 } }
    ],
    "objects": [
      { "type": "tree_pine", "at": { "x": 12, "y": 7 } },
      { "type": "house_s",   "at": { "x": 20, "y": 20 }, "locked": true }
    ],
    "tracks": [],
    "stations": [ { "...": "see 4.5" } ]
  },
  "editorRules": {
    "allowTerrainEdit": false,
    "allowObjectEdit": true,
    "allowedPieces": ["straight", "curve", "switch", "wye", "buffer", "station_track"],
    "allowedLocomotives": ["loco_steam"],
    "allowedWagons": ["wagon_hopper"],
    "maxTrains": 1
  },
  "economy": {
    "initialMoney": 2500,
    "fuelPrice": 0.5,
    "refundRatio": 0.5,
    "payOverrides": { "coal": 6 }
  },
  "objectives": [
    { "id": "o1", "type": "deliver", "cargo": "coal", "amount": 50, "to": "st_B", "from": "st_A" }
  ],
  "constraints": {
    "timeLimitSeconds": 600
  },
  "scoring": {
    "stars": [
      { "stars": 3, "maxSeconds": 180, "maxFuel": 300, "maxBuildCost": 1200 },
      { "stars": 2, "maxSeconds": 300, "maxFuel": 450, "maxBuildCost": 1800 },
      { "stars": 1 }
    ]
  },
  "seed": 12345
}
```

- `levels/index.json` lists level order, display names and which levels are initially unlocked.
- `editorRules.allowedPieces`, `allowedLocomotives` and `allowedWagons` are optional: omitted means "everything in the catalog".
- Ids use letters, digits, `_` and `-` (e.g. `st_A`, `level-001`). Station track cells must hold `isStation` pieces running along the station line.
- `sandbox.json` is a level with no objectives, fully permissive `editorRules` and infinite money (`initialMoney: null`). In the sandbox, failure checks are disabled.
- MVP objective types: `deliver` (cargo/passengers). Progress counts every delivery of that cargo at `to`; `from` is informational for now, because cargo does not remember its origin. Future: `deliverWithin`, `maxFuel`, `connect`, `noCrash`, `chain`, `minProfit`.
- **Scoring**:
  - **Stars** = the highest tier whose conditions are all met (time, fuel used, build cost; every field is optional).
  - **Score** = net profit = `finalMoney − initialMoney`.
  - Progress stores the best stars and the best score for each level.

### 5.2 Level states

```
            ┌───────── Editor Mode ─────────┐
 start ──▶  editing  ◀──── pause/edit ────▶ running ──▶ completed
                 │                            │
                 └──────────▶ failed ◀────────┘
                                │
                          Restart level ──▶ start (initial state)
```

- A level starts in `editing` with the clock at 0.
- Switching to Editor Mode **pauses** the simulation and keeps all run state (positions, cargo, money, time). Switching back resumes it.
- `completed`: the result screen shows stars, score and the ledger, with the options "Next level" and "Restart level".
- `failed`: the result screen shows the reason; the only option is "Restart level".
- The player can also restart manually at any time (with confirmation).

---

## 6. Game modes

### 6.1 Editor Mode

- **Palette** (React) with tabs: Tracks · Objects · Terrain (Stage 2), plus Trains (Stage 4) and Stations (backlog: player-built stations). Only shows what `editorRules` allows, with the price of each item. Tools: Erase, Rotate (click a placed track to turn it 90°), Inspect, Undo, Redo.
- **Tools**: Place, Erase/Scrap, Rotate (`R` key), Terrain brush (drag), Inspect.
- **Ghost preview**, green if placement is valid and red if not, with a tooltip explaining why and showing the cost.
- **Placement validations**: inside the map, `buildable` terrain, no blocking object, cell not `locked`, **cell not occupied by a train**, enough money, item allowed, `maxTrains` not exceeded.
- **Trains**:
  - Placed on tracks with a **facing direction**: `R` cycles N → E → S → W, and if the track does not allow the chosen direction the next one clockwise that fits is used. The player picks the locomotive and the wagon list in the **Trains** palette tab, which shows the total (vehicles + a full tank of fuel). Vehicles start centered in their cells; a new train is `stopped`.
  - The **Erase** tool removes the topmost thing in a cell: a train first (scrapping it), then a track, then an object.
  - The train occupies cells behind the locomotive along the track. If it doesn't fit, placement is invalid.
  - Scrapping a train refunds `purchaseValue × refundRatio`.
- **Undo/Redo** (`Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z`, up to 100 steps). Every edit is a pure `applyAction(state, ctx, action)` transition (`core/editor/actions.ts`); the history keeps the immutable states before/after each one (structural sharing keeps this cheap). A drag stroke (terrain brush, erase) is a single undo step. The history covers the current editor session and is **cleared when the simulation resumes**.
- **Preview = the real action**: the ghost and the cursor tooltip run the same `applyAction` and discard the result, so a preview can never disagree with what a click does.
- **Camera**: pan (middle-button drag or `Space` + drag), wheel zoom in discrete steps (0.5×, 1×, 2×, 3×, 4×), toggleable grid (`G`).
- **Network validator** ("Check network" button): highlights loose ends (ports with no matching neighbor), buffer stops (dead ends: trains cannot reverse), track not reaching any station, and isolated stations (whose track group reaches no other station), plus the number of track groups. Informational only, never blocking.

### 6.2 Run Mode

- **Controls**: Play/Pause, speed ×1/×2/×4, Restart level (with confirmation).
- **Canvas interactions**:
  - Clicking a switch flips it (if free).
  - Clicking a train opens a panel with start/stop, auto-refuel on/off, fuel level, cargo and status.
- **HUD**: money (with ledger tooltip), elapsed time / limit, total fuel used, build cost, progress of each objective and projected stars.
- **Not allowed** in this mode: placing, erasing or rotating pieces, changing terrain or buying trains (switch to Editor Mode, which pauses the game).

---

## 7. Persistence

### 7.1 localStorage

| Key | Content |
|---|---|
| `traincity:v1:settings` | preferences (volume, grid) |
| `traincity:v1:progress` | completed levels, best stars and best score per level |
| `traincity:v1:save:<levelId>` | latest `SaveGame` for that level |

- **Autosave**: in the editor, debounced 1 s after each command (a drag stroke saves once it ends). In Run Mode, every 5 s of real time, on pause, on mode change, and on `beforeunload`.
  - Loading a level, restarting or importing creates a *fresh* game: it becomes the baseline and is not written until the player edits it.
  - Switching levels writes the previous level's pending edits immediately. Restart and import discard them.
  - Undoing back to the saved state cancels the pending write.
  - The top bar shows `Saving…`, `Saved ✓ <time>` or `✕ Not saved: <reason>`. The first failure in a row also shows a toast suggesting to download the game.
- **Restart level** (with confirmation) deletes `traincity:v1:save:<levelId>` and reloads the level from its JSON.
- **Settings** (`traincity:v1:settings`): `{ schemaVersion: 1, showGrid }`. Invalid settings are ignored.
- **Errors** (`QuotaExceededError`, corrupt JSON) never break the game. A notice is shown and, if a save is corrupt, the player is offered to discard it. The corrupt save is backed up under `...:corrupt:<timestamp>`.
- Size: terrain is serialized as `defaultTerrain` + patches/RLE; tracks and objects as sparse lists. Target: under 200 KB for a 50 × 50 map.

### 7.2 `SaveGame` format (also the download format)

Schema: `src/data/schemas/save.ts`. Version 1 (Stages 2–3) stored everything the editor can change. **Version 2 (Stage 4)** added `world.trains` (each with its cells, progress, speed, status, fuel and prices), `run: { elapsedTicks, paused }`, `editor.nextTrainId` and `mode: "editing" | "running"`. **Version 3 (Stage 5, current)** adds `run.inventories`, `run.delivered`, `run.lost`, `run.fuelUsedTotal`, `run.fuelUsedByTrain`, `run.fuelBoughtTotal`, `run.outcome`, and per-train `dwellRemaining` and `lastStation`; the v2 → v3 migration starts inventories from each station's `initial` supply and everything else at zero. Example of the v1 part:

```json
{
  "format": "traincity-save",
  "schemaVersion": 1,
  "gameVersion": "0.0.0",
  "savedAt": "2026-10-03T18:00:00.000Z",
  "levelId": "level-001",
  "levelHash": "fnv1a:51a552a2",
  "mode": "editing",
  "world": {
    "widthPx": 1000,
    "heightPx": 1000,
    "terrain": [["snow", 14], ["grass", 16], ["desert", 20]],
    "objects": [{ "id": "obj-37", "type": "rock", "at": { "x": 20, "y": 10 }, "locked": false, "placedInSession": 1 }],
    "tracks": [{ "at": { "x": 10, "y": 11 }, "piece": "straight", "rotation": 0, "state": 0, "locked": false, "paid": 10, "placedInSession": 1 }],
    "stations": []
  },
  "economy": {
    "initialMoney": 2500,
    "ledger": { "build": 22, "objects": 5, "trains": 0, "fuel": 0, "revenue": 0, "refunds": 0 }
  },
  "editor": { "session": 1, "nextObjectId": 38 }
}
```

- `terrain` is row-major run-length encoded `[terrainId, count]` pairs. A 50 × 50 save is about 10 KB.
- `levelHash` fingerprints the level JSON the save was made with. A save whose level has changed still loads (with an info notice), as long as it passes the semantic checks: same map size, known ids, cells in bounds, valid rotations and states, no duplicate track cells or object ids.
- The **v1 → v2 migration** adds no trains, `run: { elapsedTicks: 0, paused: false }` and `nextTrainId: 1`.
- A game saved while running reopens **paused** in Run Mode.
- Committed fixtures that must keep loading forever (format regression guards): `tests/fixtures/saves/level-001.v1.json` (through the migration) `tests/fixtures/saves/sandbox.v2.json` (a diesel train in motion) and `tests/fixtures/saves/level-001.v3.json` (a loaded train halfway to the power plant).

### 7.3 Export / import

- **Export**: downloads `traincity-<levelId>-<YYYYMMDD-HHmm>.json` (Blob + `URL.createObjectURL`).
- **Import**: `<input type="file" accept=".json">`. Steps: 5 MB limit → `JSON.parse` → format header check → migrations → Zod validation → check that the level exists → semantic checks against the level and catalogs (if `levelHash` differs, warn but allow) → load (switching level if needed) → save to localStorage. Any failure shows a dialog listing the problems, and the current game is left untouched.
- **Migrations**: `persistence/migrations/` contains chained `vN → vN+1` functions. Each migration has its own test with a real fixture.

---

## 8. Gherkin scenarios (acceptance criteria)

> Each `Feature` becomes tests: rule scenarios are covered by unit/integration tests (Vitest) and user-flow scenarios by E2E tests (Playwright). Tags indicate the stage: `@s1`…`@s8`.

### 8.1 Map and terrain

```gherkin
@s1
Feature: Build the map from the level configuration

  Scenario: Default 1000x1000 map
    Given a level with widthPx 1000, heightPx 1000 and defaultTerrain "grass"
    When the level is loaded
    Then the map has 50 columns and 50 rows
    And every cell has terrain "grass"

  Scenario: Dimensions not multiple of 20
    Given a level with widthPx 1010
    When the level is validated
    Then validation fails with the error "widthPx must be a multiple of 20"

  Scenario: Terrain patch
    Given a level with a "desert" patch in the rectangle x=30 y=0 w=20 h=50
    When the level is loaded
    Then cell (30,0) has terrain "desert"
    And cell (29,0) has terrain "grass"

  Scenario: Unknown terrain
    Given a level that references terrain "lava", which is not in the catalog
    When the level is validated
    Then validation fails mentioning id "lava" and its JSON path

  Scenario: Terrain variants are stable
    Given terrain "grass" has 3 sprite variants
    When the same level is loaded twice
    Then every cell shows the same variant both times

@s2
Feature: Paint terrain in the editor

  Scenario: Paint with the brush
    Given I am in Editor Mode and the level allows terrain editing
    And I selected terrain "snow"
    When I drag the brush over cells (1,1), (2,1) and (3,1)
    Then those cells have terrain "snow"
    And the undo history has 1 new action

  Scenario: Terrain locked by the level
    Given the level has allowTerrainEdit set to false
    Then the "Terrain" palette tab is not available
```

### 8.2 Objects

```gherkin
@s2
Feature: Place and remove objects

  Scenario: Place a tree
    Given I am in Editor Mode with the "tree_pine" tool
    When I click cell (4,4) with terrain "grass"
    Then cell (4,4) contains object "tree_pine"

  Scenario: Multi-cell object that does not fit
    Given the 2x2 "house_s" tool
    When I try to place it at cell (49,49)
    Then the preview is shown in red
    And no object is placed

  Scenario: Object on a disallowed terrain
    Given the "tree_pine" tool with allowedTerrains ["grass","dirt","snow"]
    When I try to place it on a "desert" cell
    Then placement is invalid with reason "Terrain not allowed"

  Scenario: Removing an object costs money
    Given cell (4,4) contains "rock" with removeCost 10 and I have 100 money
    When I erase the rock
    Then cell (4,4) is empty
    And I have 90 money

  Scenario: Remove an object locked by the level
    Given a house with locked true at (20,20)
    When I use the Erase tool on (20,20)
    Then the house remains
    And I see the message "Locked level element"
```

### 8.3 Tracks and pieces

```gherkin
@s2
Feature: Build tracks

  Scenario: Place a straight and rotate it
    Given I am in Editor Mode with the "straight" piece
    When I press "R"
    And I click cell (10,10)
    Then cell (10,10) has a "straight" with rotation 90
    And the piece connects ports E and W

  Scenario: Cannot build on a blocking object
    Given cell (4,4) contains "rock"
    When I try to place a "straight" at (4,4)
    Then placement is invalid with reason "Cell occupied"

  Scenario: Cannot build on water
    Given cell (8,8) has terrain "water"
    When I try to place a "curve" at (8,8)
    Then placement is invalid with reason "Terrain not buildable"

  Scenario: Not enough money
    Given I have 5 money
    When I try to place a "straight" that costs 10
    Then placement is invalid with reason "Not enough money"

  Scenario: Cost depends on terrain
    Given a "straight" with cost 10 and a "snow" cell with trackCostMultiplier 1.5
    And I have 100 money
    When I place the piece on that cell
    Then I have 85 money

  Scenario: Erasing refunds part of the cost
    Given a "straight" bought for 10 and refundRatio 0.5
    And the editor session where it was placed has ended
    When I erase it
    Then I get 5 money back

  Scenario: Undo and redo
    Given I have 100 money
    And I placed a "straight" costing 10 at (10,10)
    When I press Ctrl+Z
    Then cell (10,10) has no track
    And I have 100 money
    When I press Ctrl+Y
    Then cell (10,10) has the "straight" again
    And I have 90 money

@s1
Feature: Piece connectivity (core rules)

  Scenario Outline: Port rotation
    Given a "curve" piece with base route S-E
    When I rotate it <rot> degrees
    Then its route is <route>

    Examples:
      | rot | route |
      | 0   | S-E   |
      | 90  | W-S   |
      | 180 | N-W   |
      | 270 | E-N   |

  Scenario: Two adjacent pieces are connected
    Given a "straight" with rotation 90 at (10,10) and another at (11,10)
    Then port E of (10,10) is connected to port W of (11,10)

  Scenario: Diagonal ports are reserved in the MVP
    Given the diagonals feature is disabled
    When a catalog defines a piece with route ["NE","SW"]
    Then validation fails with "Diagonal ports are not enabled"
```

### 8.4 Switches, wyes, crossings and loops

```gherkin
@s4
Feature: Switches and wyes

  Scenario: Entering from the trunk follows the active state
    Given a "switch" with trunk S and state 1 (route S-E)
    When a train enters through port S
    Then the train exits through port E

  Scenario: Trailing through a switch
    Given a "switch" with trunk S and state 0 (route S-N)
    When a train enters through port E
    Then the train exits through port S
    And the switch state is still 0

  Scenario: Flip a switch in Run Mode
    Given I am in Run Mode and the switch at (5,9) is free
    When I click the switch
    Then its state toggles to the next one

  Scenario: Cannot flip an occupied switch
    Given a train occupies the switch cell at (5,9)
    When I click the switch
    Then its state does not change
    And I see the notice "Switch occupied"

  Scenario: Traverse an X crossing
    Given a "cross" at (7,7)
    When a train enters through port W
    Then the train exits through port E

  Scenario: Reversing loop turns a train around
    Given a main line heading north into the trunk of a switch
    And the switch branches N and E are joined by a loop of track
    When a train travels north into the switch and completes the loop
    Then the train leaves the switch through the trunk heading south
```

### 8.5 Trains and movement

```gherkin
@s4
Feature: Train movement

  Scenario: Place a train with wagons
    Given a straight stretch of 5 cells
    When I place a "loco_steam" facing north with 2 "wagon_hopper"
    Then the train occupies 3 consecutive track cells
    And the wagons are behind the locomotive, to the south

  Scenario: Train does not fit
    Given a straight stretch of 2 cells
    When I try to place a locomotive with 2 wagons
    Then placement is invalid with reason "Train does not fit on the track"

  Scenario: Train moves according to its speed
    Given a stopped train with maxSpeed 2 and infinite acceleration on straight "grass" track
    When I start it and the simulation advances 1 second
    Then the locomotive advanced 2 cells

  Scenario: Trains never reverse
    Given a train moving towards a "buffer"
    When the locomotive reaches the buffer stop
    Then the train stops with status "blocked"
    And it stays blocked when I press start again

  Scenario: End of track without a buffer stop
    Given a train moving towards a cell with no track
    When the locomotive tries to leave the last piece
    Then the train stops with status "blocked"

  Scenario: Determinism
    Given the same level, the same layout and the same seed
    When I run 10,000 ticks twice
    Then the final state hash is identical in both runs

@s6
Feature: Collisions

  Scenario: Two trains in the same cell are destroyed
    Given two trains carrying 20 t of "coal" each on a collision course on a single track
    When they occupy the same cell
    Then both trains are removed from the game
    And 40 t of "coal" are counted as lost
    And the level keeps running

  Scenario: X crossing without collision
    Given two trains crossing a "cross" via different routes on different ticks
    Then no train crashes
```

### 8.6 Fuel

```gherkin
@s5
Feature: Fuel consumption and purchase

  Scenario: Consumption per cell with no load
    Given a "loco_steam" with no wagons, fuelPerUnit 1.0, on straight "grass" track
    When it advances 10 cells
    Then it consumed 10 units of fuel

  Scenario: Load increases consumption
    Given a "loco_steam" (weight 60) with one "wagon_hopper" (emptyWeight 12) loaded with 30 t of "coal"
    When it advances 1 cell on straight "grass" track
    Then it consumed 1.0 × (60 + 12 + 30) / 60 = 1.7 units

  Scenario: Terrain multiplies consumption
    Given an empty locomotive on "snow" with fuelMultiplier 1.3
    When it advances 1 cell on straight track
    Then it consumed 1.3 units

  Scenario: Buying a train fills its tank
    Given fuelPrice 0.5 and I have 1000 money
    When I place a "loco_steam" (cost 300, fuelCapacity 500) with no wagons
    Then the train has 500 fuel
    And I have 450 money

  Scenario: Refuel at a fuel station
    Given a train with 100/500 fuel and autoRefuel on
    And station "st_A" has the "fuel" service, fuelPrice is 0.5 and I have 1000 money
    When the train stops at "st_A"
    Then the train has 500 fuel
    And I have 800 money

  Scenario: Partial refuel when money is short
    Given a train with 100/500 fuel and autoRefuel on at a fuel station
    And fuelPrice is 0.5 and I have 50 money
    When the train refuels
    Then the train has 200 fuel
    And I have 0 money

  Scenario: Out of fuel
    Given a train with 0.5 units of fuel and fuelPerUnit 1.0
    When it tries to advance one cell
    Then the train gets status "out_of_fuel"
    And it stops
```

### 8.7 Stations, cargo, economy and objectives

```gherkin
@s5
Feature: Loading and unloading at stations

  Scenario: Load at the origin
    Given station "st_A" supplies 50 t of "coal"
    And a train with 2 empty "wagon_hopper" with capacity 30
    When the train stops at "st_A"
    Then the train carries 50 t of "coal" split 30 and 20
    And "st_A" has 0 t of "coal" left

  Scenario: Incompatible wagon
    Given station "st_A" supplies "coal"
    And a train with only "wagon_pax"
    When the train stops at "st_A"
    Then nothing is loaded

  Scenario: Unloading at the destination pays money
    Given a train carrying 30 t of "coal" and coal pays 6 per unit in this level
    And station "st_B" demands "coal" and I have 100 money
    When the train stops at "st_B"
    Then the train is empty
    And the "coal" delivery counter of "st_B" increases by 30
    And I have 280 money

  Scenario: Production over time
    Given "st_A" produces 10 t of "coal" per minute with capacity 100
    When 60 seconds of simulation pass
    Then the inventory of "st_A" increased by 10 t without exceeding 100

@s5
Feature: Objectives and scoring

  Scenario: Complete a level
    Given the objective "deliver 50 t of coal to st_B"
    When accumulated "coal" deliveries at "st_B" reach 50
    Then the level becomes "completed"
    And stars are computed from time, fuel used and build cost
    And the score is the net profit

  Scenario: Compute stars including build cost
    Given the 3-star tier requires maxSeconds 180, maxFuel 300 and maxBuildCost 1200
    When I complete the level in 170 s using 290 fuel with a build cost of 1300
    Then I get 2 stars

  Scenario: Best result is kept
    Given my best result on "level-001" is 2 stars and score 400
    When I complete it with 3 stars and score 350
    Then progress stores 3 stars and score 400
```

### 8.8 Level failure

```gherkin
@s5
Feature: The level is lost when objectives become unreachable

  Scenario: Exceed the time limit
    Given a level with timeLimitSeconds 600
    When 600 seconds pass without meeting all objectives
    Then the level becomes "failed" with reason "Time is up"

  Scenario: Cargo can no longer be delivered
    Given an objective to deliver 50 t of "coal" and the only source has 20 t with no production
    And 0 t have been delivered and none are in transit
    Then the level becomes "failed" with reason "Not enough cargo left"

  Scenario: Only option after failing is to restart
    Given the level is "failed"
    Then the only available action is "Restart level"
    When I restart
    Then the level is back to its initial state from the JSON
    And the level's save is deleted

@s6
Feature: Losing trains and recovering

  Scenario: Crash with enough money to recover
    Given my only train is destroyed in a crash
    And I have more money than the cheapest locomotive with a full tank plus a compatible wagon
    Then the level keeps running
    And I can switch to Editor Mode and buy a new train

  Scenario: Crash without money to recover
    Given my only train is destroyed in a crash
    And I have less money than the cheapest locomotive with a full tank plus a compatible wagon
    Then the level becomes "failed" with reason "No trains and not enough money"

  Scenario: Scrap value counts towards recovery
    Given my only train is stranded with status "out_of_fuel"
    And my money plus its scrap value covers a new train
    Then the level keeps running
```

### 8.9 Modes

```gherkin
@s4
Feature: Switching between modes

  Scenario: Editing is disabled in Run Mode
    Given I am in Run Mode
    Then the build palette is disabled
    And clicking empty cells does not place pieces

  Scenario: Editor Mode pauses and keeps the run state
    Given I am in Run Mode with a train halfway along its route at 02:00
    When I switch to Editor Mode
    Then the clock stays at 02:00
    And the train keeps its position, cargo and fuel
    When I switch back to Run Mode
    Then the simulation resumes from that state

  Scenario: Cannot edit under a train
    Given I am in Editor Mode and a train occupies cell (6,6)
    When I try to rotate the track at (6,6)
    Then the action is invalid with reason "Occupied by a train"

  Scenario: Undo history is cleared when resuming
    Given I placed pieces in Editor Mode
    When I switch to Run Mode and back to Editor Mode
    Then undo is not available
```

### 8.10 Persistence

```gherkin
@s3
Feature: Local save

  Scenario: Autosave in the editor
    Given I am in Editor Mode on level "level-001"
    When I place a piece and wait 1 second
    Then localStorage contains "traincity:v1:save:level-001" with that piece

  Scenario: Restore on reload
    Given there is a save for "level-001" in mode "running" with elapsedTicks 3120
    When I reload the page and open "level-001"
    Then the map, trains, fuel, money and deliveries match the save
    And the simulation is paused

  Scenario: Corrupt save
    Given localStorage has invalid JSON under "traincity:v1:save:level-001"
    When I open "level-001"
    Then I see the notice "Saved game is corrupted"
    And I can start the level from scratch
    And the corrupt content is backed up under a "corrupt" key

  Scenario: Storage quota full
    Given localStorage throws QuotaExceededError
    When an autosave is attempted
    Then the game keeps working
    And I see a notice suggesting to export the game

@s3
Feature: Export and import

  Scenario: Export the game
    Given I am playing "level-001"
    When I press "Download game"
    Then a file "traincity-level-001-<date>.json" is downloaded
    And the file validates against the SaveGame schema

  Scenario: Import a valid game
    Given a previously exported file
    When I import it
    Then the game state equals the state at export time

  Scenario: Import an invalid file
    Given a JSON file that does not match the schema
    When I import it
    Then I see readable validation errors
    And the current state does not change

  Scenario: Migrate an old save
    Given a save with schemaVersion 1 while the game is at schemaVersion 2
    When I import it
    Then the 1→2 migration is applied
    And the game loads correctly
```

### 8.11 Configurable catalogs and art

```gherkin
@s1
Feature: Content extensible through JSON

  Scenario: Add a new terrain without code
    Given I add {"id":"mud","name":"Mud","color":"#5B4A3A","buildable":true,...} to terrains.json
    When I start the game
    Then "Mud" appears in the terrain palette
    And it renders with a placeholder texture of its color

  Scenario: Duplicate IDs
    Given terrains.json contains two entries with id "grass"
    When the catalogs are validated
    Then validation fails with "duplicate id: grass"

  Scenario: Missing sprite frame falls back to a placeholder
    Given the "rock" object references frame "rock_0", which is not in the "objects" atlas
    When the map is rendered
    Then the rock is drawn with a placeholder generated from its color
    And a development warning is logged
```

### 8.12 Diagonals (future stage)

```gherkin
@s8
Feature: Diagonal tracks

  Scenario: Diagonal straight connects corner to corner
    Given a diagonal straight with route NE-SW at (10,10)
    And another diagonal straight with route NE-SW at (11,9)
    Then port NE of (10,10) is connected to port SW of (11,9)
    And (10,10) is not connected to (11,10) or (10,9)

  Scenario: Diagonal distance
    Given a train with maxSpeed 2 on diagonal straight track
    When the simulation advances 1 second
    Then the train travelled 2 distance units, about 1.41 cells diagonally

  Scenario: Diagonal crossing through a shared corner
    Given diagonal tracks NE-SW at (10,10) and NW-SE at (11,10)
    Then they do not connect to each other
```

---

## 9. Stages (roadmap)

Each stage ends with a **playable or verifiable demo**, its Definition of Done (§11) met, and a `v0.<stage>.0` tag.

| Stage | Name | Deliverable | Gherkin |
|---|---|---|---|
| **0** ✅ | Foundations | Repo with Vite + React + TS + Phaser (`pixelArt` config) wired up; lint, tests, CI and hooks configured; empty canvas with pan/zoom camera (discrete steps); ADR-001 written | — |
| **1** ✅ | Static world | Zod schemas for catalogs and levels; load `level-001` and `sandbox`; placeholder textureFactory + atlas loader with fallback; render terrain (deterministic variants), objects and grid; `core/grid` with 8 ports and `core/track` with rotation, routes and geometry (logic only) | @s1 |
| **2** ✅ | Editor | React palette with prices; place/erase/rotate tracks and objects; terrain brush; validations with ghost preview; money and ledger; undo/redo; network validator | @s2 |
| **3** ✅ | Persistence | localStorage autosave; restore on load; export/import; migration infrastructure; error handling | @s3 |
| **4** ✅ | Basic simulation | Fixed-tick loop with events; one one-directional train (loco + wagons) running over straights, curves, switches, wyes, crossings, loops and buffer stops; Run Mode; editor pauses the game; flipping switches; ×1/×2/×4 speeds | @s4 |
| **5** ✅ | Minimum complete game (**MVP**) | Stations, cargo, production, revenue, fuel consumption and purchase, objectives, stars and score, failure checks and restart, HUD, level menu with progress; 3 tutorial levels (the 2nd one teaches loops) | @s5 |
| **6** ✅ | Multiple trains | Several trains, collisions that destroy trains, buying replacements, bankrupt check, `maxTrains`, train list panel | @s6 |
| **7** | Pixel-art pass | Final palette (ADR-002) and atlases for terrain, objects, tracks, vehicles (4 facings) and UI; animations (smoke, crash, switch feedback); pixel font; `docs/art.md` | — |
| **8** | Diagonals | Enable diagonal ports; diagonal straights, 45° curves and diagonal switches; 8-facing vehicle sprites; 45° rotation in the editor | @s8 |
| 9+ | Evolution (backlog) | Per-train orders/schedules · signals and blocks · rescue locomotive for stranded trains · depots (change wagons) · distance/time-based revenue · running costs · passengers with random demand (seeded RNG) · terrain autotiling · bridges and tunnels · sound · level editor export · offline PWA · advanced accessibility · responsive layout | — |

**MVP milestone = end of Stage 5.**

**Tutorial levels (Stage 5)** — each one has a reference solution in `src/test/golden.test.ts` that must win it (≥ 2 stars, positive profit):

| Level | Teaches | Reference result |
|---|---|---|
| `level-001` First Run | Lay track, buy a train with wagons, deliver | ★★★ in 0:35, profit $218 |
| `level-002` Round Trip | Trains never reverse: a circuit serving two towns (passengers both ways) | ★★★ in 3:04, profit $505 |
| `level-003` Dead End Port | Switches: a reversing loop at each dead end of a single line | ★★★ in 5:04, profit $510 |

Levels after the first are locked until the previous one is completed. Progress (`traincity:v1:progress`) keeps the best stars and the best score separately.

---

## 10. Development practices

### 10.1 Workflow

- **Spec-first**: any new feature starts by adding or updating its Gherkin scenarios in this document (or in `docs/features/*.feature`).
- **TDD in `core/`**: red test → minimal implementation → refactor.
- **Trunk-based** with short-lived branches `feat/…`, `fix/…`, `chore/…`, and small PRs (< 400 diff lines when possible).
- **Conventional Commits** (`feat(track): add wye piece`), enforced by commitlint.
- **ADRs** in `docs/adr/NNN-title.md` for every decision that is costly to revert (render engine, palette, save format, movement model…).
- **Changelog** generated from commits.

### 10.2 Code

- **Everything in English**: identifiers, comments, docs, commit messages, UI strings and JSON content. No i18n layer; UI strings live inline in components (or in a plain `ui/strings.ts` if reused).
- TypeScript `strict`; no `any` (`no-explicit-any: error`) and no `as` casts except at boundaries, justified with a comment.
- External data types are **derived from Zod** (`z.infer`); no hand-duplicated interfaces.
- Pure, immutable functions in `core/` (plain data structures; `structuredClone` or Immer allowed in `state/`).
- Entity IDs: stable strings (`t1`, `st_A`) generated from a counter in the state, never random.
- Money values are rounded to 2 decimals at every ledger write, to avoid floating-point drift in saves and comparisons.
- No magic numbers: constants live in `core/constants.ts` (`CELL_SIZE`, `TICK_MS`, `MAX_UNDO`, `ZOOM_STEPS`, feature flags…).

### 10.3 Testing strategy

| Level | Tool | Scope | Target |
|---|---|---|---|
| Unit | Vitest | All of `core/`: ports, rotation, geometry, movement, fuel, economy, cargo, objectives, failure checks, migrations | ≥ 90% line and branch coverage in `core/` |
| Property-based | fast-check | Rotating 4 × 90° = identity; connections are symmetric; `step` is deterministic; serialize → deserialize = identity; money ledger always balances | All invariants in §12 |
| Golden/snapshot | Vitest | Run each level with a fixed solution layout for N ticks and compare the state hash | 1 per level |
| Integration | Vitest + RTL | Stores + commands + React UI (palette, HUD, import/export) | Key flows |
| E2E | Playwright | Build → run → complete level; crash → rebuy; fail → restart; reload and restore; export and import | 1 per user-flow Feature |
| Schemas | Vitest | All JSON in `data/` validates; referenced IDs exist; referenced sprite frames exist in atlases (warning) | 100% of files |

- **Test hook**: only when `import.meta.env.DEV` or `MODE === 'test'`, expose `window.__TRAINCITY__` (`getState`, `dispatch`, `stepTicks(n)`) so E2E tests don't depend on pixel coordinates.
- Phaser render tests are limited to smoke tests (the scene mounts without errors). Visible logic is tested in `core/`.
- Every bug fix comes with a regression test.

### 10.4 CI (GitHub Actions)

`install → lint → typecheck → test:unit (with coverage) → validate:data → build → test:e2e (Chromium)`. Any failing step blocks the merge.

---

## 11. Definition of Done (per story/stage)

- [ ] Gherkin scenarios written and automated (unit or E2E), all green.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass with no new errors or warnings.
- [ ] `core/` coverage ≥ 90%.
- [ ] New or modified JSON validates against its schema (`pnpm validate:data`).
- [ ] If the save format changes: `schemaVersion` bumped + migration + fixture + test.
- [ ] New assets are in the palette, at native resolution, and listed in `LICENSES.md`.
- [ ] No `console.log` in shipped code (use the leveled `logger`).
- [ ] Manually tested in Chrome and Firefox (desktop).
- [ ] Performance within budget (§12.3).
- [ ] spec.md / ADRs updated if behavior or architecture changed.

---

## 12. Guardrails

### 12.1 Architecture

- 🚫 `core/` importing `react`, `phaser`, DOM APIs or `localStorage` (blocked by ESLint).
- 🚫 `Math.random`, `Date.now` or `performance.now` inside `core/` (`no-restricted-globals` / `no-restricted-properties`).
- 🚫 Mutating `GameState` outside a command or `step()`.
- 🚫 Storing game state inside Phaser objects.
- 🚫 Hard-coding the 4-direction assumption outside `core/grid` (always use the `Port` helpers: `opposite`, `neighbor`, `rotate`).
- ✅ All incoming data (catalogs, levels, saves, imported files) goes through Zod **before** use.

### 12.2 State invariants (checked in tests and, in DEV, after every command and tick)

1. Every cell has exactly one valid terrain.
2. No cell has both a track and a blocking object.
3. Tracks only sit on `buildable` terrain.
4. `money ≥ 0`, and `money = initialMoney + revenue + refunds − build − objects − trains − fuel` (ledger balances).
5. `0 ≤ fuel ≤ fuelCapacity` for every train.
6. `0 ≤ amount ≤ capacity` in every wagon; a wagon with `amount > 0` has a compatible `cargo`.
7. Cargo is conserved: `produced + initial = inventories + inTransit + delivered + lost`.
8. `trail.length === wagons.length`, and a train's cells are contiguous along the track.
9. `elapsedTicks` is monotonically increasing and does not change in Editor Mode.
10. No switch state is out of range of its routes.
11. No two trains share a cell at the end of a tick (crashes are resolved within the tick), except on different routes of an X crossing.
12. Only cardinal ports are used while `features.diagonals` is off.

### 12.3 Performance

- 60 FPS on a 50 × 50 map with 10 trains on a mid-range machine; ≥ 30 FPS on 200 × 200.
- Terrain is drawn into a RenderTexture or tilemap and **only the modified region is redrawn**.
- One `step()` with 10 trains takes < 1 ms, plus failure checks. There is a Vitest benchmark (`bench`).
- Initial bundle < 2 MB gzipped (Phaser included, atlases excluded); levels load via dynamic `import()`. Each atlas is ≤ 2048 × 2048 px.

### 12.4 Security and robustness

- Import has a 5 MB limit and `JSON.parse` wrapped in try/catch; never `eval` or `new Function`.
- Text coming from JSON (level or station names) is rendered as plain text in React; never via `dangerouslySetInnerHTML`.
- localStorage, parse or validation errors never leave a blank screen: a React ErrorBoundary offers "back to menu" and "export current state".
- No telemetry and no network calls (other than loading the app's own assets).

### 12.5 Scope

- Do not add features beyond the current stage without first updating this spec.
- New ideas go to the backlog (§9, Stage 9+), not into the current PR.

---

## 13. Minimal UX

```
┌──────────────────────────────────────────────────────────────────┐
│ ☰ Train City · Level 1: First Run      [Editor|Run]      💾 ⬇ ⬆   │
├────────────┬─────────────────────────────────────────┬───────────┤
│ Palette    │                                         │ Inspector │
│ ▸ Terrain  │             CANVAS (Phaser)             │ (current  │
│ ▸ Objects  │                                         │ selection)│
│ ▸ Tracks   │                                         │           │
│ ▸ Stations │                                         │ Objectives│
│ ▸ Trains   │                                         │ ☐ 30/50 t │
├────────────┴─────────────────────────────────────────┴───────────┤
│ $ 1,342 · Build 1,525 · ⏱ 02:36/10:00 · ⛽ 182.4 · ▶ ⏸ ×1 ×2 ×4   │
└──────────────────────────────────────────────────────────────────┘
```

- **Shortcuts**: `R` rotate / flip train facing · `G` grid · `Del` erase · `I` inspect · `Esc` deselect · `Ctrl+Z/Y` undo/redo · `P` play/pause (in Run Mode; `Space` stays reserved for panning) · `Tab` toggle Editor/Run (only when the focus is on the map, so Tab still moves between controls).
- **Notices** (toasts) for key events: delivery (+money), crash, out of fuel, not enough money.
- **Accessibility**: React controls are keyboard navigable and have `aria-label`s; color is never the only signal (invalid ghosts also show an ✕ icon and a tooltip).
- **Desktop only for the MVP**; responsive tablet layout is in the backlog.

---

## 14. Glossary

| Term | Definition |
|---|---|
| Cell | 20 × 20 px map unit |
| Port | Connection point of a cell: 4 edge midpoints (N, E, S, W) and 4 corners (NE, SE, SW, NW) |
| Route | Pair of ports connected by a piece |
| Trunk | The port shared by the routes of a switch or wye |
| Trailing move | Passing through a switch from a branch towards the trunk |
| Reversing loop | Track loop that lets a one-directional train come back the way it came |
| Distance unit | Length of one cell side; speed and fuel are measured per unit |
| Tick | Fixed simulation step (50 ms) |
| Ledger | Record of money movements by category |
| Build cost | Net money spent on track, object removal and trains |
| Score | Net profit: final money − initial money |
| Layout | Everything built in the editor (tracks, objects, trains) |
| Run state | State accumulated while running (time, fuel, money, deliveries, positions) |

---

## 15. Decisions log and open questions

### 15.1 Resolved (2026-10-03)

| # | Question | Decision |
|---|---|---|
| D1 | Can trains reverse? | No. Trains are one-directional; turning around requires a reversing loop (§4.4). |
| D2 | Does build cost count in scoring? | Yes: stars use time, fuel used and build cost (§5.1). |
| D3 | How is fuel obtained? | Bought with money: tank filled on purchase, refuel at stations with the `fuel` service (§4.9). |
| D4 | Is there money? | Yes: initial money per level; deliveries earn money; money = score (§4.12). |
| D5 | What happens on a crash? | The trains are lost and must be rebought; the level fails only if objectives become unreachable (e.g. no money to recover), and then it must be restarted (§4.10, §4.13). |
| D6 | Diagonals? | Yes, in Stage 8. The 8-port model exists from day 1 (§4.1). |
| D7 | Art style? | Pixel art, 20 × 20 px per cell, with color placeholders until the art pass (§4.14). |
| D8 | Language | English for everything; no i18n for now. |
| D9 | Can wagons be changed on an existing train? (S6) | No: only scrap and rebuy. Depots stay in the backlog (§9). |

### 15.2 Open

1. **S5**: Is revenue a flat amount per unit, or does it depend on distance or delivery time? (MVP: flat.)
2. **S5**: Do trains have running/maintenance costs over time? (MVP: no.)
3. **S5**: Passengers: does every passenger station both supply and demand, with origin/destination pairs?
4. **S7**: Which 32-color palette? Native 20 × 20 sprites, or 10 × 10 drawn and scaled ×2?
5. **S8**: Which diagonal pieces do we need: only 45° curves, or also sharper 90° diagonal-to-diagonal curves?
6. Should a stranded train (out of fuel or blocked) ever be recoverable (rescue locomotive), or only scrapped?
