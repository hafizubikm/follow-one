import { config, type Config } from '../config.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

/** Session stats (SPEC §9); all but bestStreak reset on page reload. */
export interface Stats {
  readonly round: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly streak: number;
  /** The best streak ever reached on this device; the saved one joins in as each round starts. */
  readonly bestStreak: number;
  readonly score: number;
}

type ScoreRules = Config['score'];

export function createStats(): Stats {
  return { round: 0, correct: 0, incorrect: 0, streak: 0, bestStreak: 0, score: 0 };
}

/** A new round; its best streak is the higher of the session's and the one saved on this device. */
export function startRound(stats: Stats, savedBest = 0): Stats {
  return { ...stats, round: stats.round + 1, bestStreak: Math.max(stats.bestStreak, savedBest) };
}

/** Points for a correct answer; `streak` includes this answer (1st = 100, 2nd = 125, …). */
export function pointsFor(streak: number, rules: ScoreRules = config.score): number {
  return rules.correct + rules.streakBonus * (streak - 1);
}

export function recordAnswer(stats: Stats, correct: boolean, rules: ScoreRules = config.score): Stats {
  if (!correct) return { ...stats, incorrect: stats.incorrect + 1, streak: 0 };
  const streak = stats.streak + 1;
  return {
    ...stats,
    correct: stats.correct + 1,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    score: stats.score + pointsFor(streak, rules),
  };
}

/** Rounded percentage of answers that were right; 0 before any answer. */
export function accuracyPercent(stats: Stats): number {
  const answered = stats.correct + stats.incorrect;
  return answered === 0 ? 0 : Math.round((100 * stats.correct) / answered);
}

/** The best streak kept between visits, as `{ "bestStreak": n }` under followone.best (SPEC §9). */
export interface SavedBest {
  /** The stored best streak; 0 if there is none or it can't be read. */
  read(): number;
  /** Stores `bestStreak` if it beats what's stored now, so a higher best from another tab survives. */
  record(bestStreak: number): void;
}

export function parseBestStreak(raw: string | null): number {
  if (raw === null) return 0;
  try {
    const data: unknown = JSON.parse(raw);
    const best = typeof data === 'object' && data !== null && 'bestStreak' in data ? data.bestStreak : null;
    return typeof best === 'number' && Number.isSafeInteger(best) && best > 0 ? best : 0;
  } catch {
    return 0;
  }
}

export function createSavedBest(store: KeyValueStore | null): SavedBest {
  const read = () => parseBestStreak(readKey(store, config.storageKeys.best));
  return {
    read,
    record(bestStreak) {
      if (bestStreak > read()) writeKey(store, config.storageKeys.best, JSON.stringify({ bestStreak }));
    },
  };
}
