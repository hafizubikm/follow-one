import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import {
  accuracyPercent,
  createSavedBest,
  createStats,
  parseBestStreak,
  pointsFor,
  recordAnswer,
  startRound,
  type Stats,
} from '../src/game/score.ts';
import { memoryStore, throwingStore } from './fakes.ts';

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

describe('the saved best streak (SPEC §9)', () => {
  const key = config.storageKeys.best;

  it('joins a round as it starts when it beats the session’s own best', () => {
    expect(startRound(createStats(), 4)).toMatchObject({ round: 1, streak: 0, bestStreak: 4 });
    const three = play([true, true, true]);
    expect(startRound(three, 2).bestStreak).toBe(3);
    expect(startRound(three, 5).bestStreak).toBe(5);
    expect(startRound(three).bestStreak).toBe(3);
  });

  it('reads { "bestStreak": n } and counts anything else as 0', () => {
    expect(parseBestStreak(null)).toBe(0);
    expect(parseBestStreak('{"bestStreak":7}')).toBe(7);
    const invalid = ['', 'nope', '7', 'null', '[]', '{}', '{"bestStreak":-2}', '{"bestStreak":2.5}', '{"bestStreak":"7"}', '{"bestStreak":1e300}'];
    for (const raw of invalid) expect(parseBestStreak(raw), raw).toBe(0);
  });

  it('stores a best only when it beats the stored one', () => {
    const store = memoryStore({ [key]: 'garbage' });
    const saved = createSavedBest(store);
    expect(saved.read()).toBe(0);
    saved.record(0);
    expect(store.data[key]).toBe('garbage');
    saved.record(3);
    expect(store.data[key]).toBe('{"bestStreak":3}');
    saved.record(2);
    saved.record(3);
    expect(store.data[key]).toBe('{"bestStreak":3}');
  });

  it('re-reads before storing, so a higher best from another tab survives', () => {
    const store = memoryStore({ [key]: '{"bestStreak":4}' });
    const saved = createSavedBest(store);
    store.data[key] = '{"bestStreak":9}';
    saved.record(6);
    expect(saved.read()).toBe(9);
  });

  it('plays on without storage', () => {
    for (const store of [null, throwingStore]) {
      const saved = createSavedBest(store);
      expect(saved.read()).toBe(0);
      expect(() => saved.record(5)).not.toThrow();
    }
  });
});
