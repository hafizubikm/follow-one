import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { ballRadiusFor, createRound, defaultSetup } from '../src/game/round.ts';
import { assignSlots, clockAngle, easeInOut, glidePoint, ringRadiusFor, slotAngle, slotPosition } from '../src/game/slots.ts';
import { shuffle } from '../src/util/random.ts';

const n = config.ballCount;
const r = config.slotRadius;
const TAU = 2 * Math.PI;

describe('ring geometry (SPEC §7)', () => {
  it('puts slot 1 at 12 o’clock and numbers the rest clockwise', () => {
    const one = slotPosition(1, n, r);
    expect(one.x).toBeCloseTo(0, 12);
    expect(one.y).toBeCloseTo(-r, 12);
    const two = slotPosition(2, n, r);
    expect(two.x).toBeGreaterThan(0); // clockwise on screen: right of the top
    expect(two.y).toBeLessThan(0);
  });

  it('spaces the slots evenly on the ring', () => {
    for (let k = 1; k <= n; k++) {
      const p = slotPosition(k, n, r);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(r, 12);
      expect(slotAngle(k, n)).toBeCloseTo((TAU * (k - 1)) / n, 12);
      expect(clockAngle(p.x, p.y)).toBeCloseTo(slotAngle(k, n), 9);
    }
  });

  it('measures angles clockwise from 12 o’clock in screen coordinates', () => {
    expect(clockAngle(0, -1)).toBeCloseTo(0, 12);
    expect(clockAngle(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(clockAngle(0, 1)).toBeCloseTo(Math.PI, 12);
    expect(clockAngle(-1, 0)).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(clockAngle(-0.001, -1)).toBeLessThan(TAU);
    expect(clockAngle(-0.001, -1)).toBeGreaterThan(6.28);
  });
});

describe('the ring for every ball count (SPEC §7)', () => {
  const counts = Array.from({ length: config.ballCountMax - config.ballCountMin + 1 }, (_, i) => config.ballCountMin + i);

  it('is slotRadius at the default count and keeps the balls’ outer edge in place', () => {
    expect(ringRadiusFor(config.ballRadius, config)).toBe(config.slotRadius);
    expect(ringRadiusFor(ballRadiusFor(10), config)).toBeCloseTo(0.83, 2);
    expect(ringRadiusFor(ballRadiusFor(30), config)).toBeCloseTo(0.875, 3);
    for (const n of counts) {
      const r = ballRadiusFor(n);
      expect(ringRadiusFor(r, config) + r).toBeCloseTo(config.slotRadius + config.ballRadius, 12);
    }
  });

  it('leaves every pair of neighbours a clear gap, inside the arena', () => {
    for (const n of counts) {
      const r = ballRadiusFor(n);
      const ring = ringRadiusFor(r, config);
      const a = slotPosition(1, n, ring);
      const b = slotPosition(2, n, ring);
      expect(Math.hypot(a.x - b.x, a.y - b.y) - 2 * r, `${n} balls`).toBeGreaterThan(config.spawnGap);
      expect(ring + r).toBeLessThan(1);
    }
  });

  it('numbers every ball of a small and a large game clockwise, 1..n', () => {
    for (const n of [config.ballCountMin, config.ballCountMax]) {
      for (let i = 0; i < 100; i++) {
        const { balls } = createRound({ ...defaultSetup, ballCount: n });
        const slots = assignSlots(balls);
        expect([...slots].sort((x, y) => x - y)).toEqual([...Array(n).keys()].map((k) => k + 1));
        const angles = balls.map((b, index) => ({ slot: slots[index], angle: clockAngle(b.x, b.y) }));
        angles.sort((x, y) => x.slot - y.slot);
        for (let k = 1; k < n; k++) expect(angles[k].angle).toBeGreaterThanOrEqual(angles[k - 1].angle);
      }
    }
  });
});

describe('assignSlots', () => {
  it('gives slots 1..n in clockwise order from 12 o’clock', () => {
    for (let i = 0; i < 200; i++) {
      const { balls } = createRound();
      const slots = assignSlots(balls);
      expect([...slots].sort((a, b) => a - b)).toEqual([...Array(n).keys()].map((k) => k + 1));
      const bySlot = balls.map((b, index) => ({ slot: slots[index], angle: clockAngle(b.x, b.y) }));
      bySlot.sort((a, b) => a.slot - b.slot);
      for (let k = 1; k < n; k++) expect(bySlot[k].angle).toBeGreaterThanOrEqual(bySlot[k - 1].angle);
    }
  });

  it('breaks ties by distance from the center', () => {
    expect(assignSlots([{ x: 0.5, y: 0 }, { x: 0.2, y: 0 }, { x: 0, y: -0.3 }])).toEqual([3, 2, 1]);
  });

  it('depends only on the positions, not on the order they arrive in', () => {
    const { balls } = createRound();
    const points = balls.map(({ x, y }) => ({ x, y }));
    const slotOf = new Map(points.map((p, i) => [p, assignSlots(points)[i]]));
    const shuffled = shuffle(points);
    assignSlots(shuffled).forEach((slot, i) => expect(slot).toBe(slotOf.get(shuffled[i])));
  });
});

describe('spawn never uses the ring (SPEC §2.2)', () => {
  it('starts every ball unslotted and off the slot centers', () => {
    for (const [count, rounds] of [[n, 2_000], [config.ballCountMin, 500], [config.ballCountMax, 500]] as const) {
      const ring = ringRadiusFor(ballRadiusFor(count), config);
      const slotCenters = Array.from({ length: count }, (_, k) => slotPosition(k + 1, count, ring));
      let slotted = 0;
      let closest = Infinity;
      for (let i = 0; i < rounds; i++) {
        for (const ball of createRound({ ...defaultSetup, ballCount: count }).balls) {
          if (ball.slot !== null) slotted++;
          for (const c of slotCenters) closest = Math.min(closest, Math.hypot(ball.x - c.x, ball.y - c.y));
        }
      }
      expect(slotted).toBe(0);
      expect(closest).toBeGreaterThan(1e-6);
    }
  });
});

describe('return glide', () => {
  it('eases in and out between exact endpoints', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      expect(easeInOut(t)).toBeGreaterThanOrEqual(last);
      last = easeInOut(t);
    }
  });

  it('moves in a straight line from the freeze point to the slot', () => {
    const from = { x: -0.2, y: 0.4 };
    const to = slotPosition(4, n, r);
    expect(glidePoint(from, to, 0)).toEqual(from);
    expect(glidePoint(from, to, 1)).toEqual(to);
    const mid = glidePoint(from, to, 0.3);
    const cross = (mid.x - from.x) * (to.y - from.y) - (mid.y - from.y) * (to.x - from.x);
    expect(cross).toBeCloseTo(0, 12);
    expect(glidePoint(from, to, 2)).toEqual(to);
  });
});
