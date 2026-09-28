import { describe, expect, it } from 'vitest';
import { accuracyPercent, createStats, pointsFor, recordAnswer, startRound, type Stats } from '../src/game/score.ts';

const play = (answers: boolean[], from: Stats = createStats()) =>
  answers.reduce((stats, correct) => recordAnswer(startRound(stats), correct), from);

describe('scoring (SPEC §9)', () => {
  it('pays 100 + 25 × (streak − 1) for a correct answer', () => {
    expect([1, 2, 3, 4].map((streak) => pointsFor(streak))).toEqual([100, 125, 150, 175]);
  });

  it('builds a streak and a score', () => {
    const stats = play([true, true, true]);
    expect(stats).toEqual({ round: 3, correct: 3, incorrect: 0, streak: 3, bestStreak: 3, score: 375 });
  });

  it('resets the streak on a miss, adds nothing, and keeps the best streak', () => {
    const stats = play([true, true, false]);
    expect(stats).toEqual({ round: 3, correct: 2, incorrect: 1, streak: 0, bestStreak: 2, score: 225 });
    const later = play([true], stats);
    expect(later).toMatchObject({ streak: 1, bestStreak: 2, score: 325 });
  });

  it('starts a streak over at 100 points', () => {
    expect(play([true, false, true]).score).toBe(200);
  });

  it('reports accuracy as a rounded percentage, 0% before any answer', () => {
    expect(accuracyPercent(createStats())).toBe(0);
    expect(accuracyPercent(play([true, false, true]))).toBe(67);
    expect(accuracyPercent(play([false]))).toBe(0);
    expect(accuracyPercent(play([true]))).toBe(100);
  });

  it('counts rounds on start, not on answer', () => {
    expect(startRound(createStats()).round).toBe(1);
    expect(recordAnswer(createStats(), true).round).toBe(0);
  });
});
