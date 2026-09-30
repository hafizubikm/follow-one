import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { ballRadiusFor, createRound, defaultSetup, roundPhysics, spawnBodies } from '../src/game/round.ts';
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
    expect(round.targetIds).toHaveLength(1);
    const [targetId] = round.targetIds;
    expect(Number.isInteger(targetId)).toBe(true);
    expect(targetId).toBeGreaterThanOrEqual(0);
    expect(targetId).toBeLessThan(n);
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
        targetCounts[round.targetIds[0]]++;
        const first = round.balls[0];
        firstBallNames.set(first.name, (firstBallNames.get(first.name) ?? 0) + 1);
        const targetName = round.balls[round.targetIds[0]].name;
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

describe('ball size for the ball count (SPEC §5)', () => {
  const counts = Array.from({ length: config.ballCountMax - config.ballCountMin + 1 }, (_, i) => config.ballCountMin + i);

  it('is ballRadius at the default count, larger for fewer balls, smaller for more', () => {
    expect(ballRadiusFor(config.ballCount)).toBe(config.ballRadius);
    for (let i = 1; i < counts.length; i++) expect(ballRadiusFor(counts[i])).toBeLessThanOrEqual(ballRadiusFor(counts[i - 1]));
    expect(ballRadiusFor(config.ballCountMin)).toBeGreaterThan(config.ballRadius);
    expect(ballRadiusFor(config.ballCountMax)).toBe(config.ballRadiusMin);
  });

  it('gives the sizes SPEC §5 lists', () => {
    expect(ballRadiusFor(10)).toBeCloseTo(0.11, 3);
    expect(ballRadiusFor(20)).toBeCloseTo(0.078, 3);
    expect(ballRadiusFor(25)).toBeCloseTo(0.07, 3);
    expect(ballRadiusFor(30)).toBeCloseTo(0.065, 3);
  });

  it('never goes below the readable minimum and keeps the arena about as full at every count', () => {
    for (const n of counts) {
      const r = ballRadiusFor(n);
      expect(r).toBeGreaterThanOrEqual(config.ballRadiusMin);
      const coverage = n * r * r; // share of the arena's area, which is π·1²
      expect(coverage, `${n} balls`).toBeGreaterThan(0.11);
      expect(coverage, `${n} balls`).toBeLessThan(0.13);
    }
  });
});

describe('rounds for every setting (SPEC §5, §6, §16)', () => {
  const pack = getPack(config.namePackId);

  it('builds n balls of the round radius, named from the start of the pack', () => {
    for (let n = config.ballCountMin; n <= config.ballCountMax; n++) {
      const round = createRound({ ...defaultSetup, ballCount: n });
      expect(round.balls.map((b) => b.id)).toEqual([...Array(n).keys()]);
      expect(round.ballRadius).toBe(ballRadiusFor(n));
      expect(round.ringRadius).toBeCloseTo(config.slotRadius + config.ballRadius - round.ballRadius, 12);
      expect(new Set(round.balls.map((b) => b.name))).toEqual(new Set(pack.names.slice(0, n)));
      expect(round.balls.every((b) => b.r === round.ballRadius && b.slot === null)).toBe(true);
      expect(round.targetIds[0]).toBeLessThan(n);
    }
  });

  it('spawns the smallest and largest games inside the arena and apart', () => {
    for (const n of [config.ballCountMin, config.ballCountMax]) {
      const r = ballRadiusFor(n);
      for (let i = 0; i < 200; i++) {
        const { balls } = createRound({ ...defaultSetup, ballCount: n });
        for (const [a, ball] of balls.entries()) {
          expect(Math.hypot(ball.x, ball.y)).toBeLessThanOrEqual(1 - r - config.spawnMargin);
          for (const other of balls.slice(a + 1)) {
            expect(Math.hypot(ball.x - other.x, ball.y - other.y)).toBeGreaterThanOrEqual(2 * r + config.spawnGap);
          }
        }
      }
    }
  });

  it('keeps the duration it was built with', () => {
    expect(createRound().trackingMs).toBe(config.trackingMs);
    expect(createRound({ ...defaultSetup, trackingMs: 45_000 }).trackingMs).toBe(45_000);
  });

  it('spawns at the speed setting', () => {
    for (const speedFactor of Object.values(config.speedPresets)) {
      const [lo, hi] = config.spawnSpeedRange.map((k) => k * config.baseSpeed * speedFactor);
      for (let i = 0; i < 50; i++) {
        const round = createRound({ ...defaultSetup, ballCount: 20, speedFactor });
        expect(round.speedFactor).toBe(speedFactor);
        for (const ball of round.balls) {
          const speed = Math.hypot(ball.vx, ball.vy);
          expect(speed).toBeGreaterThanOrEqual(lo - 1e-12);
          expect(speed).toBeLessThanOrEqual(hi + 1e-12);
        }
      }
    }
  });

  it('runs physics at the round speed, in ⌈speedFactor⌉ substeps', () => {
    const { slow, normal, fast, extreme } = config.speedPresets;
    expect(roundPhysics({ speedFactor: slow })).toMatchObject({ baseSpeed: config.baseSpeed * slow, substeps: 1 });
    expect(roundPhysics({ speedFactor: normal })).toMatchObject({ baseSpeed: config.baseSpeed, substeps: 1 });
    expect(roundPhysics({ speedFactor: fast })).toMatchObject({ baseSpeed: config.baseSpeed * fast, substeps: 2 });
    expect(roundPhysics({ speedFactor: extreme })).toMatchObject({ baseSpeed: config.baseSpeed * extreme, substeps: 2 });
  });

  it(`picks the target and names uniformly in a game of ${config.ballCountMax} too`, () => {
    const n = config.ballCountMax;
    const rounds = 4_500;
    const targets = new Array<number>(n).fill(0);
    const firstNames = new Map<string, number>();
    for (let i = 0; i < rounds; i++) {
      const round = createRound({ ...defaultSetup, ballCount: n });
      targets[round.targetIds[0]]++;
      firstNames.set(round.balls[0].name, (firstNames.get(round.balls[0].name) ?? 0) + 1);
    }
    // Expected 150 each; σ ≈ 12, so ±6σ practically never fails by chance.
    const sigma = Math.sqrt(rounds * (1 / n) * (1 - 1 / n));
    for (const counts of [targets, [...firstNames.values()]]) {
      expect(counts).toHaveLength(n);
      for (const count of counts) expect(Math.abs(count - rounds / n)).toBeLessThan(6 * sigma);
    }
  });
});

describe('several targets (SPEC §2.4, §16)', () => {
  const targetCounts = Array.from({ length: config.targetCountMax - config.targetCountMin + 1 }, (_, i) => config.targetCountMin + i);

  it('draws targetCount distinct balls of the round, for every target count and the smallest and largest games', () => {
    expect(targetCounts).toEqual([1, 2, 3, 4, 5]);
    for (const ballCount of [config.ballCountMin, config.ballCount, config.ballCountMax]) {
      for (const targetCount of targetCounts) {
        for (let i = 0; i < 50; i++) {
          const { targetIds } = createRound({ ...defaultSetup, ballCount, targetCount });
          expect(targetIds).toHaveLength(targetCount);
          expect(new Set(targetIds).size).toBe(targetCount);
          for (const id of targetIds) {
            expect(Number.isInteger(id)).toBe(true);
            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThan(ballCount);
          }
        }
      }
    }
  });

  it('never asks for more targets than half of the smallest game', () => {
    expect(config.targetCountMax).toBeLessThanOrEqual(config.ballCountMin / 2);
    expect(config.targetCountMin).toBe(1);
    expect(config.targetCount).toBe(1);
  });

  it('refuses a round with no targets or nothing but targets', () => {
    for (const targetCount of [0, -1, 1.5, 10, 11]) {
      expect(() => createRound({ ...defaultSetup, ballCount: 10, targetCount }), String(targetCount)).toThrow(/Cannot follow/);
    }
  });

  it('makes every ball a target equally often, and every pair of balls equally often', () => {
    const ballCount = config.ballCountMin;
    const targetCount = 3;
    const rounds = 30_000;
    const perBall = new Array<number>(ballCount).fill(0);
    const perPair = new Map<string, number>();
    const firstDrawn = new Array<number>(ballCount).fill(0);
    for (let i = 0; i < rounds; i++) {
      const { targetIds } = createRound({ ...defaultSetup, ballCount, targetCount });
      firstDrawn[targetIds[0]]++;
      const sorted = [...targetIds].sort((a, b) => a - b);
      for (const [a, id] of sorted.entries()) {
        perBall[id]++;
        for (const other of sorted.slice(a + 1)) perPair.set(`${id},${other}`, (perPair.get(`${id},${other}`) ?? 0) + 1);
      }
    }
    // Binomial counts; ±6σ practically never fails by chance.
    const expectShare = (counts: number[], buckets: number, p: number) => {
      expect(counts).toHaveLength(buckets);
      const sigma = Math.sqrt(rounds * p * (1 - p));
      for (const count of counts) expect(Math.abs(count - rounds * p)).toBeLessThan(6 * sigma);
    };
    expectShare(perBall, ballCount, targetCount / ballCount); // 3 of 10: 9 000 each
    expectShare(firstDrawn, ballCount, 1 / ballCount);
    // 45 pairs, each in C(8,1) of the C(10,3) = 120 sets: 1 in 15.
    expectShare([...perPair.values()], 45, 1 / 15);
  });

  it(`picks ${config.targetCountMax} targets uniformly in a game of ${config.ballCountMax}`, () => {
    const ballCount = config.ballCountMax;
    const targetCount = config.targetCountMax;
    const rounds = 6_000;
    const perBall = new Array<number>(ballCount).fill(0);
    for (let i = 0; i < rounds; i++) {
      for (const id of createRound({ ...defaultSetup, ballCount, targetCount }).targetIds) perBall[id]++;
    }
    const p = targetCount / ballCount;
    const sigma = Math.sqrt(rounds * p * (1 - p));
    for (const count of perBall) expect(Math.abs(count - rounds * p)).toBeLessThan(6 * sigma);
  });
});

describe('spawnBodies', () => {
  it('gives up on a layout that cannot fit', () => {
    const settings = { ...config, ballCount: 40, ballRadius: 0.2 };
    expect(() => spawnBodies(settings)).toThrow(/Could not place 40 balls/);
  });
});
