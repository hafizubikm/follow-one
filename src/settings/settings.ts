import { config } from '../config.ts';
import type { RoundSetup } from '../game/round.ts';
import type { GameState } from '../game/stateMachine.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

export type SpeedPreset = keyof typeof config.speedPresets;

export const speedPresets = Object.keys(config.speedPresets) as SpeedPreset[];

/** The player's choices that shape a round (SPEC §16). Theme and sound persist on their own. */
export interface Settings {
  readonly ballCount: number;
  readonly speed: SpeedPreset;
}

export const defaultSettings: Settings = { ballCount: config.ballCount, speed: config.speedPreset };

/** A whole number of balls in the allowed range; anything unusable falls back to the default. */
export function clampBallCount(value: number): number {
  if (!Number.isFinite(value)) return defaultSettings.ballCount;
  return Math.min(Math.max(Math.round(value), config.ballCountMin), config.ballCountMax);
}

function isSpeedPreset(value: unknown): value is SpeedPreset {
  return typeof value === 'string' && Object.hasOwn(config.speedPresets, value);
}

/** Validates each field on its own, so one bad value never resets the others. */
export function sanitizeSettings(data: unknown): Settings {
  const fields: Partial<Record<keyof Settings, unknown>> = typeof data === 'object' && data !== null ? data : {};
  return {
    ballCount: typeof fields.ballCount === 'number' ? clampBallCount(fields.ballCount) : defaultSettings.ballCount,
    speed: isSpeedPreset(fields.speed) ? fields.speed : defaultSettings.speed,
  };
}

export function parseSettings(raw: string | null): Settings {
  if (raw === null) return defaultSettings;
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

export interface SettingsStore {
  readonly current: Settings;
  /** Applies a change (validated) and persists the result. */
  update(change: Partial<Settings>): Settings;
}

export function createSettings(store: KeyValueStore | null): SettingsStore {
  let current = parseSettings(readKey(store, config.storageKeys.settings));
  return {
    get current() {
      return current;
    },
    update(change) {
      current = sanitizeSettings({ ...current, ...change });
      writeKey(store, config.storageKeys.settings, JSON.stringify(current));
      return current;
    },
  };
}

/** What a new round is built from. */
export function roundSetup(settings: Settings): RoundSetup {
  return { ballCount: settings.ballCount, speedFactor: config.speedPresets[settings.speed] };
}

/** Settings that shape a round are locked from TARGET_INTRO through REVEAL (SPEC §16). */
export function settingsLocked(state: GameState): boolean {
  return state !== 'IDLE' && state !== 'RESULT';
}
