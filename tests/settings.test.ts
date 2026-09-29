import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { gameStates } from '../src/game/stateMachine.ts';
import {
  clampBallCount,
  clampTrackingMs,
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
  it('are the standard game: 15 balls at Normal speed for 15 seconds, Blue balls, a Red target', () => {
    expect(defaultSettings).toEqual({
      ballCount: 15,
      speed: 'normal',
      trackingMs: 15_000,
      ballColor: 'blue',
      targetColor: 'red',
    });
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

  it('keeps durations on the 5 s grid within 10–60 s', () => {
    expect(clampTrackingMs(10_000)).toBe(10_000);
    expect(clampTrackingMs(60_000)).toBe(60_000);
    expect(clampTrackingMs(35_000)).toBe(35_000);
    expect(clampTrackingMs(17_000)).toBe(15_000);
    expect(clampTrackingMs(18_000)).toBe(20_000);
    expect(clampTrackingMs(3_000)).toBe(10_000);
    expect(clampTrackingMs(600_000)).toBe(60_000);
    expect(clampTrackingMs(Number.NaN)).toBe(15_000);
  });

  it('restores stored values', () => {
    const stored = { ballCount: 24, speed: 'extreme', trackingMs: 45_000, ballColor: 'cyan', targetColor: 'white' };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it('accepts only the listed color names (SPEC §16)', () => {
    expect(parseSettings(JSON.stringify({ ballColor: 'teal', targetColor: 'Red' }))).toEqual(defaultSettings);
    expect(parseSettings(JSON.stringify({ ballColor: 'red', targetColor: 'blue' }))).toEqual(defaultSettings);
    expect(parseSettings(JSON.stringify({ ballColor: 7, targetColor: null }))).toEqual(defaultSettings);
    expect(parseSettings(JSON.stringify({ ballColor: 'constructor' }))).toEqual(defaultSettings);
  });

  it('checks each field on its own, so one bad value never resets the others', () => {
    expect(parseSettings(JSON.stringify({ ballCount: 'twenty', speed: 'fast', trackingMs: 20_000 }))).toEqual({
      ...defaultSettings,
      ballCount: 15,
      speed: 'fast',
      trackingMs: 20_000,
    });
    expect(parseSettings(JSON.stringify({ ballCount: 12, speed: 'ludicrous' }))).toEqual({ ...defaultSettings, ballCount: 12 });
    expect(parseSettings(JSON.stringify({ ballCount: 99, trackingMs: '30s' }))).toEqual({ ...defaultSettings, ballCount: 30 });
    expect(parseSettings(JSON.stringify({ speed: 'toString' }))).toEqual(defaultSettings);
    expect(parseSettings(JSON.stringify({ ballCount: 12, ballColor: 'magenta', targetColor: 'yellow' }))).toEqual({
      ...defaultSettings,
      ballCount: 12,
      targetColor: 'yellow',
    });
    expect(parseSettings(JSON.stringify({ speed: 'fast', ballColor: 'green', targetColor: 'gold' }))).toEqual({
      ...defaultSettings,
      speed: 'fast',
      ballColor: 'green',
    });
  });

  it('falls back to the defaults for missing or unreadable data', () => {
    for (const raw of [null, '', '{', 'null', '42', '"fast"', '[20, "fast"]']) {
      expect(parseSettings(raw), String(raw)).toEqual(defaultSettings);
    }
  });
});

describe('createSettings (persistence)', () => {
  it('restores what was stored', () => {
    const saved = { ballCount: 21, speed: 'slow', trackingMs: 30_000, ballColor: 'purple', targetColor: 'pink' };
    expect(createSettings(stored(saved)).current).toEqual(saved);
  });

  it('applies a change, validated, and persists the whole set as JSON', () => {
    const store = memoryStore();
    const settings = createSettings(store);
    expect(settings.update({ ballCount: 27 })).toEqual({ ...defaultSettings, ballCount: 27 });
    settings.update({ speed: 'fast' });
    settings.update({ trackingMs: 25_000 });
    settings.update({ ballColor: 'orange', targetColor: 'white' });
    const expected = { ballCount: 27, speed: 'fast', trackingMs: 25_000, ballColor: 'orange', targetColor: 'white' };
    expect(settings.current).toEqual(expected);
    expect(JSON.parse(store.data[key])).toEqual(expected);

    settings.update({ ballCount: 3, trackingMs: 1_000 });
    expect(settings.current).toMatchObject({ ballCount: config.ballCountMin, trackingMs: config.trackingMsMin });
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
    expect(roundSetup({ ...defaultSettings, ballCount: 30, speed: 'extreme', trackingMs: 60_000 })).toEqual({
      ballCount: 30,
      speedFactor: 1.6,
      trackingMs: 60_000,
    });
    expect(roundSetup(defaultSettings)).toEqual({ ballCount: 15, speedFactor: 1, trackingMs: 15_000 });
  });

  it('locks from TARGET_INTRO through REVEAL, and only then (SPEC §16)', () => {
    const unlocked = gameStates.filter((state) => !settingsLocked(state));
    expect(unlocked).toEqual(['IDLE', 'RESULT']);
  });
});
