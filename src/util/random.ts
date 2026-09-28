// Always Math.random, never seeded: every round must be freshly random (SPEC §2.4).

/** Uniform integer in [0, n). */
export function randomInt(n: number): number {
  return Math.floor(Math.random() * n);
}

/** Uniform float in [min, max). */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Fisher–Yates; returns a new array and leaves the input untouched. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
