import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, type EditorAction } from '../core/editor/actions';
import { createGameState, moneyOf, rulesContext, type GameState } from '../core/game/state';
import { trackAt } from '../core/world/world';
import { loadLevel } from '../data/loader';
import type { Level } from '../data/schemas/level';
import { createAppStores, type AppStores } from '../state/stores';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { createAutosave } from './autosave';
import { exportFileName, prepareImport, readSaveFile } from './exportImport';
import { createPersistence } from './index';
import { migrate, type RawSave } from './migrations';
import { decodeRuns, encodeRuns } from './rle';
import { createSaveRepository, NOTICES } from './saveRepository';
import { gameToSave, levelHash, parseSaveText, saveToGame } from './serialize';
import { loadSettings } from './settings';
import { memoryStore, safeStorage, STORAGE_KEYS, type KeyValueStore } from './storage';

const FIXTURE = readFileSync(
  resolve(import.meta.dirname, '../../tests/fixtures/saves/level-001.v1.json'),
  'utf8',
);
const NOW = new Date('2026-10-03T18:00:00.000Z');
const at = (x: number, y: number) => ({ x, y });

function edit(game: GameState, level: Level, ...actions: EditorAction[]): GameState {
  const ctx = rulesContext(level, testCatalogs);
  return actions.reduce((state, action) => {
    const outcome = applyAction(state, ctx, action);
    if (!outcome.ok) throw new Error(outcome.reason);
    return outcome.state;
  }, game);
}

function setup(backend: KeyValueStore = memoryStore()) {
  const storage = safeStorage(() => backend);
  const repository = createSaveRepository({
    storage,
    catalogs: testCatalogs,
    gameVersion: 'test',
    now: () => NOW,
  });
  const stores = createAppStores({
    catalogs: testCatalogs,
    levels: [],
    loadLevel,
    saves: repository,
  });
  const downloads: { fileName: string; text: string }[] = [];
  const persistence = createPersistence({
    stores,
    storage,
    repository,
    catalogs: testCatalogs,
    loadLevel,
    gameVersion: 'test',
    now: () => NOW,
    download: (fileName, text) => downloads.push({ fileName, text }),
  });
  return { backend, storage, repository, stores, persistence, downloads };
}

function ready(stores: AppStores) {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('not ready');
  return session;
}

describe('run-length encoding', () => {
  it('round-trips any list', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('grass', 'snow', 'water')), (values) => {
        expect(decodeRuns(encodeRuns(values))).toEqual(values);
      }),
    );
  });

  it('compresses runs', () => {
    expect(encodeRuns(['a', 'a', 'b'])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

describe('save format', () => {
  it('serialize → parse → deserialize gives back the same game, after any edits', async () => {
    const level = await loadLevel('level-001', testCatalogs);
    const initial = createGameState(level, testCatalogs);
    const actions = fc.oneof(
      fc.record({
        type: fc.constant('placeTrack' as const),
        cell: fc.record({ x: fc.integer({ min: 0, max: 49 }), y: fc.integer({ min: 0, max: 49 }) }),
        piece: fc.constantFrom('straight', 'curve', 'switch'),
        rotation: fc.constantFrom(0, 90, 180, 270),
      }),
      fc.record({
        type: fc.constant('erase' as const),
        cell: fc.record({ x: fc.integer({ min: 0, max: 49 }), y: fc.integer({ min: 0, max: 49 }) }),
      }),
      fc.record({
        type: fc.constant('placeObject' as const),
        cell: fc.record({ x: fc.integer({ min: 0, max: 48 }), y: fc.integer({ min: 0, max: 48 }) }),
        object: fc.constantFrom('rock', 'tree_oak'),
      }),
    );
    const ctx = rulesContext(level, testCatalogs);
    fc.assert(
      fc.property(fc.array(actions, { maxLength: 25 }), (list) => {
        const game = list.reduce((state, action) => {
          const outcome = applyAction(state, ctx, action);
          return outcome.ok ? outcome.state : state;
        }, initial);
        const text = JSON.stringify(gameToSave(game, level, { gameVersion: 't', savedAt: NOW }));
        const parsed = parseSaveText(text);
        if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
        const restored = saveToGame(parsed.value, level, testCatalogs);
        expect(restored).toEqual({ ok: true, value: game });
      }),
      { numRuns: 30 },
    );
  });

  it('a 50x50 save stays well under 200 KB', async () => {
    const level = await loadLevel('level-001', testCatalogs);
    const save = gameToSave(createGameState(level, testCatalogs), level, {
      gameVersion: 't',
      savedAt: NOW,
    });
    expect(JSON.stringify(save).length).toBeLessThan(200_000);
  });

  it('keeps loading the committed v3 fixture: cargo, fuel and inventories intact', async () => {
    const text = readFileSync(
      resolve(import.meta.dirname, '../../tests/fixtures/saves/level-001.v3.json'),
      'utf8',
    );
    const level = await loadLevel('level-001', testCatalogs);
    const parsed = parseSaveText(text);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const game = saveToGame(parsed.value, level, testCatalogs);
    if (!game.ok) throw new Error(JSON.stringify(game.issues));
    const [train] = game.value.trains;
    expect(train?.wagons.map((w) => w.amount)).toEqual([30, 20]);
    expect(game.value.run.fuelUsedTotal).toBeGreaterThan(0);
    expect(game.value.run.inventories['st_A']?.['coal']).toBeLessThan(50);
    expect(game.value).toMatchObject({ mode: 'running', paused: true, elapsedTicks: 300 });
  });

  it('keeps loading the committed v2 fixture, reopening it paused', async () => {
    const text = readFileSync(
      resolve(import.meta.dirname, '../../tests/fixtures/saves/sandbox.v2.json'),
      'utf8',
    );
    const level = await loadLevel('sandbox', testCatalogs);
    const parsed = parseSaveText(text);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const game = saveToGame(parsed.value, level, testCatalogs);
    if (!game.ok) throw new Error(JSON.stringify(game.issues));
    expect(game.value).toMatchObject({ mode: 'running', paused: true, elapsedTicks: 120 });
    expect(game.value.trains[0]).toMatchObject({
      id: 't1',
      locomotive: 'loco_diesel',
      running: true,
    });
  });

  it('rejects trains that do not fit the saved world', async () => {
    const text = readFileSync(
      resolve(import.meta.dirname, '../../tests/fixtures/saves/sandbox.v2.json'),
      'utf8',
    );
    const level = await loadLevel('sandbox', testCatalogs);
    const parsed = parseSaveText(text);
    if (!parsed.ok) throw new Error('fixture invalid');
    const save = structuredClone(parsed.value);
    const [train] = save.world.trains;
    if (!train) throw new Error('fixture has no train');
    save.world.trains.push(
      { ...train },
      {
        ...train,
        id: 't9',
        locomotive: 'loco_maglev',
        wagons: [{ model: 'ufo', cargo: null, amount: 0 }],
      },
      { ...train, id: 't8', head: { ...train.head, cell: { x: 0, y: 0 } }, trail: [] },
    );
    const result = saveToGame(save, level, testCatalogs);
    expect(!result.ok && result.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'duplicate id: t1',
        expect.stringMatching(/two vehicles at/),
        'unknown locomotive "loco_maglev"',
        'unknown wagon "ufo"',
        'one trail cell per wagon expected',
        'train is off the track at (0,0)',
      ]),
    );
  });

  it('keeps loading the committed v1 fixture (format regression guard)', async () => {
    const level = await loadLevel('level-001', testCatalogs);
    const parsed = parseSaveText(FIXTURE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const game = saveToGame(parsed.value, level, testCatalogs);
    expect(game.ok && trackAt(game.value.world, at(10, 12))?.piece).toBe('curve');
  });

  it.each([
    ['not JSON', '{oops', 'Not valid JSON'],
    ['another file', '{"hello":1}', 'Not a Train City save file'],
    [
      'a newer save',
      JSON.stringify({ format: 'traincity-save', schemaVersion: 99 }),
      'newer version of the game',
    ],
  ])('rejects %s', (_, text, message) => {
    const result = parseSaveText(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.message).join()).toContain(message);
  });

  it('rejects oversized text', () => {
    const result = parseSaveText(' '.repeat(5 * 1024 * 1024 + 1));
    expect(!result.ok && result.issues[0]?.message).toBe('File is too large (max 5 MB)');
  });

  it('reports schema problems with their path', () => {
    const save = JSON.parse(FIXTURE) as { economy: { initialMoney: unknown } };
    save.economy.initialMoney = 'lots';
    const result = parseSaveText(JSON.stringify(save));
    expect(!result.ok && result.issues[0]?.path).toBe('economy.initialMoney');
  });

  it('checks a save against its level and the catalogs', async () => {
    const level = await loadLevel('level-001', testCatalogs);
    const parsed = parseSaveText(FIXTURE);
    if (!parsed.ok) throw new Error('fixture invalid');
    const save = structuredClone(parsed.value);
    save.world.terrain.push(['lava', 1]);
    const [track] = save.world.tracks;
    const [object] = save.world.objects;
    if (!track || !object) throw new Error('fixture has no tracks or objects');
    save.world.tracks.push(
      { ...track, piece: 'teleporter' },
      { ...track, at: at(99, 0) },
      { ...track, rotation: 45 },
    );
    save.world.objects.push({ ...object, type: 'ufo' }, { ...object });
    const result = saveToGame(save, level, testCatalogs);
    expect(!result.ok && result.issues.map((i) => `${i.path}: ${i.message}`)).toEqual(
      expect.arrayContaining([
        'world.terrain: expected 2500 cells, got 2501',
        expect.stringMatching(/unknown terrain "lava"/),
        expect.stringMatching(/unknown piece "teleporter"/),
        expect.stringMatching(/track is outside the map/),
        expect.stringMatching(/invalid rotation 45/),
        expect.stringMatching(/unknown object "ufo"/),
        expect.stringMatching(/duplicate id/),
      ]),
    );

    const otherSize = { ...parsed.value, world: { ...parsed.value.world, widthPx: 1600 } };
    expect(saveToGame(otherSize, level, testCatalogs).ok).toBe(false);
  });
});

describe('Feature: Export and import — Scenario: Migrate an old save', () => {
  it('applies the 1→2 migration when the game is at version 2', () => {
    const v1 = JSON.parse(FIXTURE) as RawSave;
    const toV2 = (save: RawSave): RawSave => ({
      ...save,
      schemaVersion: 2,
      run: { elapsedTicks: 0 },
    });
    const result = migrate(v1, 2, { 1: toV2 });
    expect(result).toMatchObject({
      ok: true,
      value: { schemaVersion: 2, run: { elapsedTicks: 0 } },
    });
  });

  it('fails clearly when a migration step is missing', () => {
    const result = migrate({ schemaVersion: 1 }, 3, { 1: (s) => ({ ...s, schemaVersion: 2 }) });
    expect(!result.ok && result.issues[0]?.message).toBe('No migration from save format 2');
  });

  it('a migration must advance exactly one version', () => {
    expect(() =>
      migrate({ schemaVersion: 1 }, 2, { 1: (s) => ({ ...s, schemaVersion: 3 }) }),
    ).toThrow('must produce v2');
  });

  it('current saves need no migration', () => {
    expect(migrate({ schemaVersion: 3 })).toEqual({ ok: true, value: { schemaVersion: 3 } });
  });

  it('a v1 save goes through every real migration (v1 → v2 → v3)', () => {
    const v1 = JSON.parse(FIXTURE) as RawSave;
    const result = migrate(v1);
    expect(result).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 3,
        world: { trains: [] },
        editor: { nextTrainId: 1 },
        run: {
          elapsedTicks: 0,
          paused: false,
          inventories: { st_A: { coal: 50 }, st_B: {} },
          delivered: {},
          fuelUsedTotal: 0,
          outcome: null,
        },
      },
    });
  });
});

describe('Feature: Local save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Scenario: Autosave in the editor', async () => {
    const { stores, backend } = setup();
    await stores.game.getState().loadLevel('level-001');
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toBeNull(); // loading is not an edit

    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    expect(stores.saveStatus.getState().status.kind).toBe('pending');
    vi.advanceTimersByTime(999);
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toBeNull();
    vi.advanceTimersByTime(1);

    const raw = backend.getItem(STORAGE_KEYS.save('level-001'));
    expect(raw).toContain('"piece":"straight"');
    expect(stores.saveStatus.getState().status).toEqual({ kind: 'saved', at: NOW });
  });

  it('Scenario: Restore on reload', async () => {
    const first = setup();
    await first.stores.game.getState().loadLevel('level-001');
    first.stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    first.persistence.flush();

    const reloaded = setup(first.backend);
    await reloaded.stores.game.getState().loadLevel('level-001');
    const session = ready(reloaded.stores);
    expect(trackAt(session.game.world, at(10, 11))?.piece).toBe('straight');
    expect(moneyOf(session.game)).toBe(2490);
    expect(session.notice).toBeNull();
  });

  it('Scenario: Corrupt save', async () => {
    const backend = memoryStore({ [STORAGE_KEYS.save('level-001')]: '{not json' });
    const { stores } = setup(backend);
    await stores.game.getState().loadLevel('level-001');
    const session = ready(stores);
    expect(session.notice).toEqual(NOTICES.corrupt);
    expect(session.game.world.tracks).toHaveLength(6); // the level's own platform tracks
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toBeNull();
    const backups = [...backend.data.keys()].filter((k) => k.includes(':corrupt:'));
    expect(backups).toHaveLength(1);
    expect(backend.data.get(backups[0] ?? '')).toBe('{not json');
  });

  it('a save that no longer fits its level is treated as corrupt', async () => {
    const save = JSON.parse(FIXTURE) as { world: { widthPx: number } };
    save.world.widthPx = 1600;
    const backend = memoryStore({ [STORAGE_KEYS.save('level-001')]: JSON.stringify(save) });
    const { stores } = setup(backend);
    await stores.game.getState().loadLevel('level-001');
    expect(ready(stores).notice).toEqual(NOTICES.corrupt);
  });

  it('a save made with an older version of the level loads with a notice', async () => {
    const save = JSON.parse(FIXTURE) as { levelHash: string };
    save.levelHash = 'fnv1a:00000000';
    const backend = memoryStore({ [STORAGE_KEYS.save('level-001')]: JSON.stringify(save) });
    const { stores } = setup(backend);
    await stores.game.getState().loadLevel('level-001');
    expect(ready(stores).notice).toEqual(NOTICES.levelChanged);
    expect(trackAt(ready(stores).game.world, at(10, 12))?.piece).toBe('curve');
  });

  it('Scenario: Storage quota full', async () => {
    const full: KeyValueStore = {
      ...memoryStore(),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const { stores } = setup(full);
    await stores.game.getState().loadLevel('level-001');
    const place = (x: number) =>
      stores.game
        .getState()
        .execute({ type: 'placeTrack', cell: at(x, 20), piece: 'straight', rotation: 0 });

    place(1);
    vi.advanceTimersByTime(1000);
    expect(stores.saveStatus.getState().status).toEqual({
      kind: 'error',
      message: 'Storage is full',
    });
    expect(stores.editor.getState().notice?.text).toMatch(/Download your game to keep it/);

    // The game keeps working, and the warning is not repeated on every save.
    stores.editor.getState().dismissNotice(stores.editor.getState().notice?.id ?? 0);
    place(2);
    vi.advanceTimersByTime(1000);
    expect(ready(stores).game.world.tracks.length).toBeGreaterThan(6);
    expect(stores.editor.getState().notice).toBeNull();
  });

  it('switching levels saves the previous one immediately', async () => {
    const { stores, backend } = setup();
    await stores.game.getState().loadLevel('level-001');
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    await stores.game.getState().loadLevel('sandbox');
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toContain('straight');
  });

  it('does not save in the middle of a drag stroke', async () => {
    const { stores, backend } = setup();
    await stores.game.getState().loadLevel('sandbox');
    stores.game.getState().beginStroke();
    stores.game.getState().execute({ type: 'paintTerrain', cells: [at(1, 1)], terrain: 'desert' });
    vi.advanceTimersByTime(5000);
    expect(backend.getItem(STORAGE_KEYS.save('sandbox'))).toBeNull();
    stores.game.getState().endStroke();
    vi.advanceTimersByTime(1000);
    expect(backend.getItem(STORAGE_KEYS.save('sandbox'))).not.toBeNull();
  });

  it('Restart level deletes the save and does not bring the edits back', async () => {
    const { stores, backend, persistence } = setup();
    await stores.game.getState().loadLevel('level-001');
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    persistence.flush();
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 12), piece: 'straight', rotation: 0 });

    persistence.actions.restart();
    vi.advanceTimersByTime(5000);
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toBeNull();
    expect(ready(stores).game.world.tracks).toHaveLength(6);
    expect(moneyOf(ready(stores).game)).toBe(2500);
  });

  it('flush with nothing pending does nothing; dispose saves pending edits', async () => {
    const backend = memoryStore();
    const { stores, persistence } = setup(backend);
    await stores.game.getState().loadLevel('level-001');
    persistence.flush();
    expect(backend.data.size).toBe(0);
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    persistence.dispose();
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).not.toBeNull();
  });
});

describe('Feature: Export and import', () => {
  it('Scenario: Export the game', async () => {
    const { stores, persistence, downloads } = setup();
    await stores.game.getState().loadLevel('level-001');
    persistence.actions.exportGame();
    expect(downloads).toHaveLength(1);
    const [file] = downloads;
    expect(file?.fileName).toBe(exportFileName('level-001', NOW));
    expect(parseSaveText(file?.text ?? '').ok).toBe(true);
  });

  it('exporting without a level does nothing', () => {
    const { persistence, downloads } = setup();
    persistence.actions.exportGame();
    expect(downloads).toHaveLength(0);
  });

  it('Scenario: Import a valid game', async () => {
    const source = setup();
    await source.stores.game.getState().loadLevel('level-001');
    source.stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    source.persistence.actions.exportGame();
    const exported = ready(source.stores).game;

    const target = setup();
    await target.stores.game.getState().loadLevel('sandbox');
    const result = await target.persistence.actions.importFile(
      new Blob([source.downloads[0]?.text ?? '']),
    );
    expect(result.ok).toBe(true);
    const session = ready(target.stores);
    expect(session.levelId).toBe('level-001');
    expect(session.game).toEqual(exported);
    expect(session.notice).toEqual({ text: 'Game imported', tone: 'info' });
    expect(target.backend.getItem(STORAGE_KEYS.save('level-001'))).not.toBeNull();
  });

  it('Scenario: Import an invalid file', async () => {
    const { stores, persistence } = setup();
    await stores.game.getState().loadLevel('level-001');
    const before = ready(stores);
    const result = await persistence.actions.importFile(
      new Blob(['{"format":"traincity-save","schemaVersion":1}']),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.length).toBeGreaterThan(0);
    expect(ready(stores)).toBe(before);
  });

  it('rejects saves for unknown levels and oversized files', async () => {
    const save = JSON.parse(FIXTURE) as { levelId: string };
    save.levelId = 'level-999';
    const result = await prepareImport(JSON.stringify(save), { catalogs: testCatalogs, loadLevel });
    expect(!result.ok && result.issues[0]?.message).toBe('unknown level "level-999"');

    const failing = await prepareImport(FIXTURE, {
      catalogs: testCatalogs,
      loadLevel: () => Promise.reject(new Error('boom')),
    });
    expect(!failing.ok && failing.issues[0]?.message).toBe('unknown level "level-001"');

    const big = await readSaveFile({ size: 6 * 1024 * 1024 } as Blob);
    expect(!big.ok && big.issues[0]?.message).toBe('File is too large (max 5 MB)');
    const unreadable = await readSaveFile({
      size: 1,
      text: () => Promise.reject(new Error('x')),
    } as Blob);
    expect(!unreadable.ok && unreadable.issues[0]?.message).toBe('Could not read the file');
  });

  it('imports carry a notice when the level changed since the export', async () => {
    const save = JSON.parse(FIXTURE) as { levelHash: string };
    save.levelHash = 'fnv1a:00000000';
    const result = await prepareImport(JSON.stringify(save), { catalogs: testCatalogs, loadLevel });
    expect(result.ok && result.value.notice).toEqual(NOTICES.levelChanged);
  });

  it('builds file names in local time', () => {
    expect(exportFileName('level-001', new Date(2026, 9, 3, 7, 5))).toBe(
      'traincity-level-001-20261003-0705.json',
    );
  });
});

describe('storage', () => {
  it('reports an unavailable backend without throwing', () => {
    const storage = safeStorage(() => {
      throw new Error('blocked');
    });
    expect(storage.read('x')).toBeNull();
    expect(storage.write('x', '1')).toMatchObject({ ok: false, reason: 'unavailable' });
    storage.remove('x');
  });

  it('survives a backend whose methods throw', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    const storage = safeStorage(() => broken);
    expect(storage.read('x')).toBeNull();
    expect(storage.write('x', '1')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(() => {
      storage.remove('x');
    }).not.toThrow();
  });
});

describe('settings', () => {
  it('restores and saves the grid preference', () => {
    const backend = memoryStore({
      [STORAGE_KEYS.settings]: JSON.stringify({ schemaVersion: 1, showGrid: false }),
    });
    const { stores, storage } = setup(backend);
    expect(stores.view.getState().showGrid).toBe(false);
    stores.view.getState().toggleGrid();
    expect(loadSettings(storage)).toEqual({ schemaVersion: 1, showGrid: true });
  });

  it('ignores broken settings', () => {
    const { storage } = setup(memoryStore({ [STORAGE_KEYS.settings]: '{oops' }));
    expect(loadSettings(storage)).toBeNull();
    const { storage: other } = setup(memoryStore({ [STORAGE_KEYS.settings]: '{"showGrid":1}' }));
    expect(loadSettings(other)).toBeNull();
  });
});

describe('autosave internals', () => {
  it('uses injected timers and skips unchanged games', async () => {
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    const save = vi.fn(() => ({ ok: true as const }));
    const set = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
    const clear = vi.fn();
    createAutosave({
      game: stores.game,
      repository: { save, remove: vi.fn() },
      onStatus: vi.fn(),
      onFailure: vi.fn(),
      now: () => NOW,
      timers: {
        set: set as unknown as typeof setTimeout,
        clear,
      },
    });
    await stores.game.getState().loadLevel('level-001');
    stores.editor.getState().rotate(); // unrelated store: no save
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(10, 12), piece: 'straight', rotation: 0 });
    expect(set).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(levelHash(makeLevel())).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });

  it('edits that come back to the saved state are not re-saved', async () => {
    vi.useFakeTimers();
    const { stores, backend, persistence } = setup();
    await stores.game.getState().loadLevel('level-001');
    const { execute, undo } = stores.game.getState();
    execute({ type: 'placeTrack', cell: at(10, 11), piece: 'straight', rotation: 0 });
    persistence.flush();
    const saved = backend.getItem(STORAGE_KEYS.save('level-001'));
    execute({ type: 'placeTrack', cell: at(10, 12), piece: 'straight', rotation: 0 });
    undo(); // back to the saved state
    vi.advanceTimersByTime(1000);
    expect(backend.getItem(STORAGE_KEYS.save('level-001'))).toBe(saved);
    expect(stores.saveStatus.getState().status.kind).toBe('saved');
    vi.useRealTimers();
    const game = edit(ready(stores).game, ready(stores).level);
    expect(game).toBe(ready(stores).game);
  });
});
