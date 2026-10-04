/** The subset of the Web Storage API we use; lets tests pass an in-memory fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_KEYS = {
  settings: 'traincity:v1:settings',
  progress: 'traincity:v1:progress',
  save: (levelId: string) => `traincity:v1:save:${levelId}`,
  corrupt: (levelId: string, stamp: string) => `traincity:v1:save:${levelId}:corrupt:${stamp}`,
};

export type WriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'quota' | 'unavailable'; readonly message: string };

export type SafeStorage = {
  read(key: string): string | null;
  write(key: string, value: string): WriteResult;
  remove(key: string): void;
};

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Storage access that never throws: localStorage can be missing (privacy modes), full, or
 * blocked. Errors become results so the game keeps running (spec.md §7.1).
 */
export function safeStorage(getBackend: () => KeyValueStore | null): SafeStorage {
  const backend = (): KeyValueStore | null => {
    try {
      return getBackend();
    } catch {
      return null;
    }
  };
  return {
    read(key) {
      try {
        return backend()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      const store = backend();
      if (!store) return { ok: false, reason: 'unavailable', message: 'Storage is not available' };
      try {
        store.setItem(key, value);
        return { ok: true };
      } catch (error) {
        return isQuotaError(error)
          ? { ok: false, reason: 'quota', message: 'Storage is full' }
          : { ok: false, reason: 'unavailable', message: 'Storage is not available' };
      }
    },
    remove(key) {
      try {
        backend()?.removeItem(key);
      } catch {
        // Nothing to do: the key simply stays.
      }
    },
  };
}

/** In-memory storage for tests and as a fallback. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
