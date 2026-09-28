import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBetween, randomInt, shuffle } from '../src/util/random.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('randomInt', () => {
  it('draws from Math.random, unseeded', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(randomInt(10)).toBe(5);
    vi.spyOn(Math, 'random').mockReturnValue(0.999_999);
    expect(randomInt(15)).toBe(14);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomInt(15)).toBe(0);
  });

  it('is uniform over [0, n)', () => {
    const n = 6;
    const draws = 60_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[randomInt(n)]++;
    // Expected 10 000 each; σ ≈ 91, so ±6σ practically never fails by chance.
    for (const count of counts) expect(Math.abs(count - draws / n)).toBeLessThan(550);
  });
});

describe('randomBetween', () => {
  it('stays in [min, max)', () => {
    for (let i = 0; i < 10_000; i++) {
      const value = randomBetween(-0.5, 2);
      expect(value).toBeGreaterThanOrEqual(-0.5);
      expect(value).toBeLessThan(2);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd', 'e']);
    const out = shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual([...input]);
  });

  it('makes every ordering equally likely', () => {
    const draws = 60_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < draws; i++) {
      const key = shuffle([1, 2, 3]).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // Expected 10 000 each; σ ≈ 91.
    for (const count of counts.values()) expect(Math.abs(count - draws / 6)).toBeLessThan(550);
  });
});
