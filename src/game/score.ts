/** Session stats (SPEC §9); they reset on page reload. */
export interface Stats {
  readonly round: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly score: number;
}

export function createStats(): Stats {
  return { round: 0, correct: 0, incorrect: 0, streak: 0, bestStreak: 0, score: 0 };
}

export function startRound(stats: Stats): Stats {
  return { ...stats, round: stats.round + 1 };
}
