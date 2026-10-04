/* eslint-disable no-console -- the logger is the single place allowed to write to the console. */

const isDev = import.meta.env.DEV;
const warnedKeys = new Set<string>();

/** Leveled logger. `debug` and `info` are dropped in production builds. */
export const logger = {
  debug(...args: unknown[]): void {
    if (isDev) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (isDev) console.info(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
  /** Development-only warning emitted at most once per key. */
  devWarnOnce(key: string, ...args: unknown[]): void {
    if (!isDev || warnedKeys.has(key)) return;
    warnedKeys.add(key);
    console.warn(...args);
  },
};
