import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { gameStates } from '../src/game/stateMachine.ts';
import {
  clampBallCount,
  createSettings,
  defaultSettings,
  parseSettings,
  roundSetup,
  settingsLocked,
  speedPresets,
} from '../src/settings/settings.ts';
import { memoryStore, throwingStore } from './fakes.ts';

const key = config.storageKeys.settings;
const stored = (value: unknown) => memoryStore({ [key]: JSON.stringify(value) });

describe('defaults (SPEC §16)', () => {
  it('are the standard game: 15 balls at Normal speed', () => {
    expect(defaultSettings).toEqual({ ballCount: 15, speed: 'normal' });
    expect(createSettings(memoryStore()).current).toEqual(defaultSettings);
  });

  it('offer the four speed presets, slowest first', () => {
    expect(speedPresets).toEqual(['slow', 'normal', 'fast', 'extreme']);
    expect(speedPresets.map((p) => config.speedPresets[p])).toEqual([0.7, 1, 1.3, 1.6]);
  });
});

describe('validation', () => {
  it('keeps ball counts whole and within 10–30', () => {
    expect(clampBallCount(10)).toBe(10);
    expect(clampBallCount(30)).toBe(30);
    expect(clampBallCount(9)).toBe(10);
    expect(clampBallCount(31)).toBe(30);
    expect(clampBallCount(-4)).toBe(10);
    expect(clampBallCount(14.6)).toBe(15);
    expect(clampBallCount(Number.NaN)).toBe(15);
    expect(clampBallCount(Infinity)).toBe(15);
  });

  it('restores stored values', () => {
    expect(parseSettings(JSON.stringify({ ballCount: 24, speed: 'extreme' }))).toEqual({ ballCount: 24, speed: 'extreme' });
  });

  it('checks each field on its own, so one bad value never resets the others', () => {
    expect(parseSettings(JSON.stringify({ ballCount: 'twenty', speed: 'fast' }))).toEqual({ ballCount: 15, speed: 'fast' });
    expect(parseSettings(JSON.stringify({ ballCount: 12, speed: 'ludicrous' }))).toEqual({ ballCount: 12, speed: 'normal' });
    expect(parseSettings(JSON.stringify({ ballCount: 99 }))).toEqual({ ballCount: 30, speed: 'normal' });
    expect(parseSettings(JSON.stringify({ speed: 'toString' }))).toEqual(defaultSettings);
  });

  it('falls back to the defaults for missing or unreadable data', () => {
    for (const raw of [null, '', '{', 'null', '42', '"fast"', '[20, "fast"]']) {
      expect(parseSettings(raw), String(raw)).toEqual(defaultSettings);
    }
  });
});

describe('createSettings (persistence)', () => {
  it('restores what was stored', () => {
    expect(createSettings(stored({ ballCount: 21, speed: 'slow' })).current).toEqual({ ballCount: 21, speed: 'slow' });
  });

  it('applies a change, validated, and persists the whole set as JSON', () => {
    const store = memoryStore();
    const settings = createSettings(store);
    expect(settings.update({ ballCount: 27 })).toEqual({ ballCount: 27, speed: 'normal' });
    settings.update({ speed: 'fast' });
    expect(settings.current).toEqual({ ballCount: 27, speed: 'fast' });
    expect(JSON.parse(store.data[key])).toEqual({ ballCount: 27, speed: 'fast' });

    settings.update({ ballCount: 3 });
    expect(settings.current.ballCount).toBe(config.ballCountMin);
  });

  it('keeps working when storage throws or is unavailable', () => {
    for (const store of [throwingStore, null]) {
      const settings = createSettings(store);
      expect(settings.current).toEqual(defaultSettings);
      expect(() => settings.update({ ballCount: 20 })).not.toThrow();
      expect(settings.current.ballCount).toBe(20);
    }
  });
});

describe('rounds and locking', () => {
  it('turns settings into a round setup', () => {
    expect(roundSetup({ ballCount: 30, speed: 'extreme' })).toEqual({ ballCount: 30, speedFactor: 1.6 });
    expect(roundSetup(defaultSettings)).toEqual({ ballCount: 15, speedFactor: 1 });
  });

  it('locks from TARGET_INTRO through REVEAL, and only then (SPEC §16)', () => {
    const unlocked = gameStates.filter((state) => !settingsLocked(state));
    expect(unlocked).toEqual(['IDLE', 'RESULT']);
  });
});
