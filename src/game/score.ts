import { config, type Config } from '../config.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

/** Session stats (SPEC §9); all but bestStreak reset on page reload. */
export interface Stats {
  readonly round: number;
  /** Rounds in which every target was found, and rounds in which one was missed. */
  readonly correct: number;
  readonly incorrect: number;
  /** Targets found and targets shown, over every answered round. */
  readonly found: number;
  readonly targets: number;
  readonly streak: number;
  /** The best streak ever reached on this device; the saved one joins in as each round starts. */
  readonly bestStreak: number;
  readonly score: number;
}

type ScoreRules = Config['score'];

export function createStats(): Stats {
  return { round: 0, correct: 0, incorrect: 0, found: 0, targets: 0, streak: 0, bestStreak: 0, score: 0 };
}

/** A new round; its best streak is the higher of the session's and the one saved on this device. */
export function startRound(stats: Stats, savedBest = 0): Stats {
  return { ...stats, round: stats.round + 1, bestStreak: Math.max(stats.bestStreak, savedBest) };
}

/** A round's answer: how many of its targets the player found. */
export interface Answer {
  readonly found: number;
  readonly targets: number;
}

/** A round is correct when every target was found. */
export function isCorrect(answer: Answer): boolean {
  return answer.found === answer.targets;
}

/**
 * Points for an answer: each target found scores, and a correct round adds the streak bonus per target.
 * `streak` includes this round (one target: 1st = 100, 2nd = 125, …).
 */
export function pointsFor(answer: Answer, streak: number, rules: ScoreRules = config.score): number {
  const bonus = isCorrect(answer) ? rules.streakBonus * (streak - 1) * answer.targets : 0;
  return rules.correct * answer.found + bonus;
}

export function recordAnswer(stats: Stats, answer: Answer, rules: ScoreRules = config.score): Stats {
  const correct = isCorrect(answer);
  const streak = correct ? stats.streak + 1 : 0;
  return {
    ...stats,
    correct: stats.correct + (correct ? 1 : 0),
    incorrect: stats.incorrect + (correct ? 0 : 1),
    found: stats.found + answer.found,
    targets: stats.targets + answer.targets,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    score: stats.score + pointsFor(answer, streak, rules),
  };
}

/** Rounded percentage of the targets shown that were found; 0 before any answer. */
export function accuracyPercent(stats: Stats): number {
  return stats.targets === 0 ? 0 : Math.round((100 * stats.found) / stats.targets);
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
