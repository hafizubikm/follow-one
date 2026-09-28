import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createRound, spawnBodies } from '../src/game/round.ts';
import { getPack } from '../src/names/packs.ts';

const n = config.ballCount;
const r = config.ballRadius;

describe('createRound', () => {
  it('builds ballCount balls with stable ids, pack names and no slots', () => {
    const round = createRound();
    const pack = getPack(config.namePackId);
    expect(round.namePackId).toBe(pack.id);
    expect(round.balls.map((b) => b.id)).toEqual([...Array(n).keys()]);
    expect(new Set(round.balls.map((b) => b.name)).size).toBe(n);
    for (const ball of round.balls) {
      expect(pack.names).toContain(ball.name);
      expect(ball.slot).toBeNull();
      expect(ball.r).toBe(r);
    }
    expect(Number.isInteger(round.targetId)).toBe(true);
    expect(round.targetId).toBeGreaterThanOrEqual(0);
    expect(round.targetId).toBeLessThan(n);
  });

  it('spawns inside the arena, apart, at spawn speed (SPEC §6)', () => {
    const maxCenter = 1 - r - config.spawnMargin;
    const minGap = 2 * r + config.spawnGap;
    const [lo, hi] = config.spawnSpeedRange.map((k) => k * config.baseSpeed);

    for (let i = 0; i < 500; i++) {
      const { balls } = createRound();
      for (const [a, ball] of balls.entries()) {
        expect(Math.hypot(ball.x, ball.y)).toBeLessThanOrEqual(maxCenter);
        const speed = Math.hypot(ball.vx, ball.vy);
        expect(speed).toBeGreaterThanOrEqual(lo - 1e-12);
        expect(speed).toBeLessThanOrEqual(hi + 1e-12);
        for (const other of balls.slice(a + 1)) {
          expect(Math.hypot(ball.x - other.x, ball.y - other.y)).toBeGreaterThanOrEqual(minGap);
        }
      }
    }
  });

  describe('fresh randomness every round (SPEC §2.4)', () => {
    const rounds = 15_000;
    const targetCounts = new Array<number>(n).fill(0);
    const firstBallNames = new Map<string, number>();
    const targetNames = new Map<string, number>();
    const directions = new Array<number>(8).fill(0);
    let repeatedLayouts = 0;

    beforeAll(() => {
      let previous = createRound();
      for (let i = 0; i < rounds; i++) {
        const round = createRound();
        targetCounts[round.targetId]++;
        const first = round.balls[0];
        firstBallNames.set(first.name, (firstBallNames.get(first.name) ?? 0) + 1);
        const targetName = round.balls[round.targetId].name;
        targetNames.set(targetName, (targetNames.get(targetName) ?? 0) + 1);
        const octant = Math.floor(((Math.atan2(first.vy, first.vx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
        directions[octant]++;
        if (round.balls.every((b, id) => b.x === previous.balls[id].x && b.y === previous.balls[id].y)) {
          repeatedLayouts++;
        }
        previous = round;
      }
    });

    // Each of 15 outcomes: expected 1 000, σ ≈ 30.6; ±6σ ≈ ±184 practically never fails by chance.
    const expectUniform = (counts: Iterable<number>, buckets: number) => {
      const list = [...counts];
      expect(list).toHaveLength(buckets);
      const expected = rounds / buckets;
      const sigma = Math.sqrt(rounds * (1 / buckets) * (1 - 1 / buckets));
      for (const count of list) expect(Math.abs(count - expected)).toBeLessThan(6 * sigma);
    };

    it(`picks the target uniformly (${rounds} rounds → every ball ≈ ${rounds / n} times)`, () => {
      expectUniform(targetCounts, n);
    });

    it('reshuffles names over the balls', () => {
      expectUniform(firstBallNames.values(), n);
      expectUniform(targetNames.values(), n);
    });

    it('draws new positions and directions', () => {
      expect(repeatedLayouts).toBe(0);
      expectUniform(directions, 8);
    });
  });
});

describe('spawnBodies', () => {
  it('gives up on a layout that cannot fit', () => {
    const settings = { ...config, ballCount: 40, ballRadius: 0.2 };
    expect(() => spawnBodies(settings)).toThrow(/Could not place 40 balls/);
  });
});
