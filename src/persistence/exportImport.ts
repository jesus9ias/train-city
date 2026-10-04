import type { GameState } from '../core/game/state';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Level } from '../data/schemas/level';
import type { SaveGame } from '../data/schemas/save';
import { DataError, type Result } from '../data/validate';
import type { LoadNotice } from './saveRepository';
import { NOTICES } from './saveRepository';
import { gameToSave, levelHash, MAX_SAVE_BYTES, parseSaveText, saveToGame } from './serialize';

const DOWNLOAD_URL_TTL_MS = 60_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** `traincity-<levelId>-<YYYYMMDD-HHmm>.json`, in local time (spec.md §7.3). */
export function exportFileName(levelId: string, date: Date): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `traincity-${levelId}-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export function exportText(game: GameState, level: Level, gameVersion: string, now: Date): string {
  return JSON.stringify(gameToSave(game, level, { gameVersion, savedAt: now }), null, 2);
}

/** Triggers a browser download of a text file. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking right away can cut the download short in some browsers; give it time to finish.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_TTL_MS);
}

/** Reads a user-picked file as text, refusing files over the size limit. */
export async function readSaveFile(file: Blob): Promise<Result<string>> {
  if (file.size > MAX_SAVE_BYTES) {
    return { ok: false, issues: [{ path: '', message: 'File is too large (max 5 MB)' }] };
  }
  try {
    return { ok: true, value: await file.text() };
  } catch {
    return { ok: false, issues: [{ path: '', message: 'Could not read the file' }] };
  }
}

export type ImportedGame = {
  readonly save: SaveGame;
  readonly level: Level;
  readonly game: GameState;
  readonly notice: LoadNotice | null;
};

/** Validates an imported save end to end: format, migrations, level and catalog references. */
export async function prepareImport(
  text: string,
  deps: { catalogs: Catalogs; loadLevel: (id: string, catalogs: Catalogs) => Promise<Level> },
): Promise<Result<ImportedGame>> {
  const parsed = parseSaveText(text);
  if (!parsed.ok) return parsed;
  const save = parsed.value;

  let level: Level;
  try {
    level = await deps.loadLevel(save.levelId, deps.catalogs);
  } catch (error) {
    const issues =
      error instanceof DataError
        ? [...error.issues]
        : [{ path: 'levelId', message: `unknown level "${save.levelId}"` }];
    return { ok: false, issues };
  }

  const game = saveToGame(save, level, deps.catalogs);
  if (!game.ok) return game;
  const notice = save.levelHash === levelHash(level) ? null : NOTICES.levelChanged;
  return { ok: true, value: { save, level, game: game.value, notice } };
}
