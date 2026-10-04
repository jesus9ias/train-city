import { useSyncExternalStore } from 'react';

/** Viewport width below which the compact (phone/tablet) layout is used (spec.md §13.1). */
export const COMPACT_QUERY = '(max-width: 900px)';

/** Live result of a CSS media query; false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
