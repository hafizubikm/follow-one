import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createTheme, parseThemePref, resolveTheme } from '../src/theme/theme.ts';
import { fakeColorScheme, memoryStore, throwingStore } from './fakes.ts';

const key = config.storageKeys.theme;
const fakeRoot = () => ({ dataset: {} as DOMStringMap });

describe('parseThemePref', () => {
  it('accepts the three options', () => {
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('dark')).toBe('dark');
    expect(parseThemePref('system')).toBe('system');
  });

  it('falls back to system for missing or unknown values', () => {
    expect(parseThemePref(null)).toBe('system');
    expect(parseThemePref('')).toBe('system');
    expect(parseThemePref('Dark')).toBe('system');
    expect(parseThemePref('sepia')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('uses an explicit choice regardless of the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system setting for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('createTheme', () => {
  it('defaults to system and applies it immediately', () => {
    const root = fakeRoot();
    const theme = createTheme(memoryStore(), fakeColorScheme(true).query, root);
    expect(theme.pref).toBe('system');
    expect(root.dataset.theme).toBe('dark');
  });

  it('restores a stored preference', () => {
    const root = fakeRoot();
    const theme = createTheme(memoryStore({ [key]: 'light' }), fakeColorScheme(true).query, root);
    expect(theme.pref).toBe('light');
    expect(root.dataset.theme).toBe('light');
  });

  it('persists and applies a new preference', () => {
    const store = memoryStore();
    const root = fakeRoot();
    const theme = createTheme(store, fakeColorScheme(false).query, root);

    theme.setPref('dark');
    expect(theme.pref).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(store.data[key]).toBe('dark');

    theme.setPref('system');
    expect(root.dataset.theme).toBe('light');
    expect(store.data[key]).toBe('system');
  });

  it('follows live system changes while on system', () => {
    const scheme = fakeColorScheme(false);
    const root = fakeRoot();
    createTheme(memoryStore(), scheme.query, root);

    scheme.setDark(true);
    expect(root.dataset.theme).toBe('dark');
    scheme.setDark(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('ignores system changes once an explicit theme is chosen', () => {
    const scheme = fakeColorScheme(false);
    const root = fakeRoot();
    const theme = createTheme(memoryStore(), scheme.query, root);

    theme.setPref('light');
    scheme.setDark(true);
    expect(root.dataset.theme).toBe('light');
  });

  it('keeps working when storage throws or is unavailable', () => {
    for (const store of [throwingStore, null]) {
      const root = fakeRoot();
      const theme = createTheme(store, fakeColorScheme(true).query, root);
      expect(theme.pref).toBe('system');
      expect(root.dataset.theme).toBe('dark');

      expect(() => theme.setPref('light')).not.toThrow();
      expect(root.dataset.theme).toBe('light');
    }
  });
});
