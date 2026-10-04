import type { LevelIndexEntry } from '../data/schemas/level';
import { isUnlocked, type LevelResult } from '../state/progressStore';

type Props = {
  levels: readonly LevelIndexEntry[];
  /** Best results per level, to show stars and unlock the next level. */
  results?: Readonly<Record<string, LevelResult>>;
  currentId: string | undefined;
  onSelect: (levelId: string) => void;
};

export function LevelPicker({ levels, results = {}, currentId, onSelect }: Props) {
  return (
    <label className="level-picker">
      <span className="level-picker__label">Level</span>
      <select
        value={currentId ?? ''}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        {levels.map((level) => {
          const unlocked = isUnlocked(levels, results, level.id);
          const stars = results[level.id]?.stars;
          return (
            <option key={level.id} value={level.id} disabled={!unlocked}>
              {unlocked ? '' : '🔒 '}
              {level.name}
              {stars !== undefined && ` ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
