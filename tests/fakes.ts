import type { ColorSchemeQuery } from '../src/theme/theme.ts';
import type { KeyValueStore } from '../src/util/storage.ts';

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** Behaves like localStorage in a locked-down private window. */
export const throwingStore: KeyValueStore = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

export function fakeColorScheme(dark: boolean): { query: ColorSchemeQuery; setDark(dark: boolean): void } {
  const listeners: Array<() => void> = [];
  const query = {
    matches: dark,
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.push(listener);
    },
  };
  return {
    query,
    setDark(next) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}
