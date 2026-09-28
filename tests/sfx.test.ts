import { describe, expect, it } from 'vitest';
import { createSfx } from '../src/audio/sfx.ts';
import { config } from '../src/config.ts';
import { memoryStore, throwingStore } from './fakes.ts';

const key = config.storageKeys.sound;

describe('sound setting', () => {
  it('is on by default', () => {
    expect(createSfx(memoryStore()).enabled).toBe(true);
  });

  it('restores a stored off', () => {
    expect(createSfx(memoryStore({ [key]: 'off' })).enabled).toBe(false);
  });

  it('treats unknown stored values as on', () => {
    expect(createSfx(memoryStore({ [key]: 'maybe' })).enabled).toBe(true);
  });

  it('persists changes', () => {
    const store = memoryStore();
    const sfx = createSfx(store);

    sfx.setEnabled(false);
    expect(sfx.enabled).toBe(false);
    expect(store.data[key]).toBe('off');

    sfx.setEnabled(true);
    expect(sfx.enabled).toBe(true);
    expect(store.data[key]).toBe('on');
  });

  it('keeps working when storage throws or is unavailable', () => {
    for (const store of [throwingStore, null]) {
      const sfx = createSfx(store);
      expect(sfx.enabled).toBe(true);
      expect(() => sfx.setEnabled(false)).not.toThrow();
      expect(sfx.enabled).toBe(false);
    }
  });
});
