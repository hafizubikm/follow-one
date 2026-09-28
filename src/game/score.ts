import { config, type Config } from '../config.ts';

/** Session stats (SPEC §9); they reset on page reload. */
export interface Stats {
  readonly round: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly score: number;
}

type ScoreRules = Config['score'];

export function createStats(): Stats {
  return { round: 0, correct: 0, incorrect: 0, streak: 0, bestStreak: 0, score: 0 };
}

export function startRound(stats: Stats): Stats {
  return { ...stats, round: stats.round + 1 };
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
