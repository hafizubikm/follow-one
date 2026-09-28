import { config } from '../config.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const themePrefs: readonly ThemePref[] = ['light', 'dark', 'system'];
export const systemDarkQuery = '(prefers-color-scheme: dark)';

export function parseThemePref(raw: string | null): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref !== 'system') return pref;
  return systemDark ? 'dark' : 'light';
}

/** The slice of MediaQueryList we use. */
export interface ColorSchemeQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

export interface ThemeController {
  readonly pref: ThemePref;
  setPref(pref: ThemePref): void;
}

/** Mirrors the inline no-flash script in index.html; keep the two in step. */
export function createTheme(
  store: KeyValueStore | null,
  systemDark: ColorSchemeQuery,
  root: Pick<HTMLElement, 'dataset'>,
): ThemeController {
  let pref = parseThemePref(readKey(store, config.storageKeys.theme));
  const apply = () => {
    root.dataset.theme = resolveTheme(pref, systemDark.matches);
  };

  systemDark.addEventListener('change', apply);
  apply();

  return {
    get pref() {
      return pref;
    },
    setPref(next) {
      pref = next;
      writeKey(store, config.storageKeys.theme, next);
      apply();
    },
  };
}
