import {
  createGameState,
  rulesContext,
  type GameState,
  type RulesContext,
} from '../core/game/state';
import { RAW_CATALOGS } from '../data/loader';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Level, LevelInput } from '../data/schemas/level';
import { validateCatalogs, validateLevel } from '../data/validate';

export const testCatalogs: Catalogs = (() => {
  const result = validateCatalogs(RAW_CATALOGS);
  if (!result.ok) throw new Error('bundled catalogs are invalid');
  return result.value;
})();

export function levelInput(
  map: Partial<LevelInput['map']> = {},
  extra: Partial<LevelInput> = {},
): LevelInput {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    editorRules: { allowTerrainEdit: true, allowObjectEdit: true, maxTrains: null },
    economy: { initialMoney: 1000, fuelPrice: 0.5 },
    seed: 1,
    ...extra,
    map: { widthPx: 1000, heightPx: 1000, defaultTerrain: 'grass', ...map },
  };
}

export function makeLevel(
  map: Partial<LevelInput['map']> = {},
  extra: Partial<LevelInput> = {},
): Level {
  const result = validateLevel(levelInput(map, extra), testCatalogs);
  if (!result.ok) throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return result.value;
}

export function makeGame(level: Level): { state: GameState; ctx: RulesContext } {
  return { state: createGameState(level, testCatalogs), ctx: rulesContext(level, testCatalogs) };
}
