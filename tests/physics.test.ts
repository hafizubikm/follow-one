import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createRound, defaultSetup, roundPhysics, type RoundSetup } from '../src/game/round.ts';
import { keepInArena, regulateSpeed, resolveCollisions, stepWorld, type Body } from '../src/physics/world.ts';

const dt = 1 / config.physicsHz;
const [minSpeed, maxSpeed] = config.speedBand.map((k) => k * config.baseSpeed);
const speed = (b: Body) => Math.hypot(b.vx, b.vy);
const body = (x: number, y: number, vx: number, vy: number): Body => ({ x, y, vx, vy, r: config.ballRadius });

/** A fixed sequence standing in for Math.random, so fallbacks are reproducible. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/**
 * Runs `rounds` rounds of `steps` steps, checking the SPEC §6 invariants after every step, and that
 * over the run every ball crosses more than one unit in x and in y (nobody gets stuck).
 */
function expectInvariants(setup: RoundSetup, rounds: number, steps: number) {
  let worstOverlap = 0;
  let worstWall = -Infinity;

  for (let round = 0; round < rounds; round++) {
    const built = createRound(setup);
    const params = roundPhysics(built);
    const [lo, hi] = params.speedBand.map((k) => k * params.baseSpeed);
    const bodies: Body[] = built.balls;
    const xs = bodies.map((b) => [b.x, b.x]);
    const ys = bodies.map((b) => [b.y, b.y]);

    for (let step = 0; step < steps; step++) {
      stepWorld(bodies, dt, params);

      bodies.forEach((b, i) => {
        for (const value of [b.x, b.y, b.vx, b.vy]) {
          if (!Number.isFinite(value)) throw new Error(`round ${round} step ${step}: ball ${i} has ${value}`);
        }
        worstWall = Math.max(worstWall, Math.hypot(b.x, b.y) + b.r - 1);
        const v = speed(b);
        if (v < lo - 1e-9 || v > hi + 1e-9) {
          throw new Error(`round ${round} step ${step}: ball ${i} speed ${v} outside the band`);
        }
        for (let j = i + 1; j < bodies.length; j++) {
          const o = bodies[j];
          worstOverlap = Math.max(worstOverlap, b.r + o.r - Math.hypot(b.x - o.x, b.y - o.y));
        }
        xs[i][0] = Math.min(xs[i][0], b.x);
        xs[i][1] = Math.max(xs[i][1], b.x);
        ys[i][0] = Math.min(ys[i][0], b.y);
        ys[i][1] = Math.max(ys[i][1], b.y);
      });
    }

    for (let i = 0; i < bodies.length; i++) {
      expect(xs[i][1] - xs[i][0], `ball ${i} x range`).toBeGreaterThan(1);
      expect(ys[i][1] - ys[i][0], `ball ${i} y range`).toBeGreaterThan(1);
    }
  }

  expect(worstWall).toBeLessThanOrEqual(1e-6);
  expect(worstOverlap).toBeLessThanOrEqual(1e-3);
}

describe('world invariants (SPEC §6)', () => {
  const steps = 12_000; // 100 s of play per round

  it(`hold after every step for 10 rounds × ${steps} steps at the defaults`, () => {
    expectInvariants(defaultSetup, 10, steps);
  });

  it.each([
    [config.ballCountMin, 'slow'],
    [config.ballCountMin, 'extreme'],
    [config.ballCountMax, 'slow'],
    [config.ballCountMax, 'extreme'],
  ] as const)('hold for %i balls at %s speed', (ballCount, preset) => {
    expectInvariants({ ...defaultSetup, ballCount, speedFactor: config.speedPresets[preset] }, 5, steps);
  });

  it('never leaves a ball at zero speed', () => {
    // A square hit on a ball crossing the line of impact stops the hitter dead.
    const hitter = body(-0.1, 0, 0.45, 0);
    const crosser = body(0.079, 0, 0, 0.45);
    resolveCollisions([hitter, crosser]);
    expect(speed(hitter)).toBe(0);

    regulateSpeed(hitter, config, sequence(0.25));
    expect(speed(hitter)).toBeCloseTo(minSpeed, 12);
    expect(hitter.vx).toBeCloseTo(0, 12); // angle 0.25 × 2π points straight down (y down)
    expect(hitter.vy).toBeCloseTo(minSpeed, 12);
  });
});

describe('arena boundary', () => {
  it('puts a ball that crossed the wall back on it and reflects it', () => {
    const b = body(0.95, 0, 0.45, 0.1);
    keepInArena(b);
    expect(b.x).toBeCloseTo(1 - b.r, 12);
    expect(b.y).toBe(0);
    expect(b.vx).toBeCloseTo(-0.45, 12);
    expect(b.vy).toBeCloseTo(0.1, 12);
  });

  it('does not reflect a ball already heading back in', () => {
    const b = body(0, -0.95, 0.2, 0.3);
    keepInArena(b);
    expect(b.y).toBeCloseTo(-(1 - b.r), 12);
    expect([b.vx, b.vy]).toEqual([0.2, 0.3]);
  });

  it('leaves balls inside the arena alone', () => {
    const b = body(0.5, -0.5, 0.3, 0.3);
    keepInArena(b);
    expect(b).toEqual(body(0.5, -0.5, 0.3, 0.3));
  });
});

describe('ball–ball collisions', () => {
  it('swaps velocities in a head-on collision (equal mass, elastic)', () => {
    const a = body(-0.08, 0, 0.45, 0);
    const b = body(0.08, 0, -0.4, 0);
    resolveCollisions([a, b]);
    expect(a.vx).toBeCloseTo(-0.4, 12);
    expect(b.vx).toBeCloseTo(0.45, 12);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(a.r + b.r, 12);
  });

  it('conserves momentum and energy in a glancing collision', () => {
    const a = body(0, 0, 0.3, 0.2);
    const b = body(0.12, 0.1, -0.25, 0.05);
    const momentum = [a.vx + b.vx, a.vy + b.vy];
    const energy = speed(a) ** 2 + speed(b) ** 2;
    resolveCollisions([a, b]);
    expect(a.vx + b.vx).toBeCloseTo(momentum[0], 12);
    expect(a.vy + b.vy).toBeCloseTo(momentum[1], 12);
    expect(speed(a) ** 2 + speed(b) ** 2).toBeCloseTo(energy, 12);
  });

  it('separates overlapping balls that are already moving apart without changing velocity', () => {
    const a = body(-0.05, 0, -0.3, 0);
    const b = body(0.05, 0, 0.3, 0);
    resolveCollisions([a, b]);
    expect(b.x - a.x).toBeCloseTo(a.r + b.r, 12);
    expect([a.vx, b.vx]).toEqual([-0.3, 0.3]);
  });

  it('counts collisions: approaching pairs only', () => {
    expect(resolveCollisions([body(-0.08, 0, 0.45, 0), body(0.08, 0, -0.45, 0)])).toBe(1);
    expect(resolveCollisions([body(-0.05, 0, -0.3, 0), body(0.05, 0, 0.3, 0)])).toBe(0); // already parting
    expect(resolveCollisions([body(-0.5, 0, 0.45, 0), body(0.5, 0, -0.45, 0)])).toBe(0); // apart
    let total = 0;
    const bodies: Body[] = createRound().balls;
    for (let i = 0; i < 1_200; i++) total += stepWorld(bodies, dt, config);
    expect(total).toBeGreaterThan(0);
  });

  it('separates balls with coincident centers along a random direction', () => {
    const a = body(0.2, 0.2, 0, 0);
    const b = body(0.2, 0.2, 0, 0);
    resolveCollisions([a, b], sequence(0)); // angle 0: along +x
    expect(a.x).toBeCloseTo(0.2 - a.r, 12);
    expect(b.x).toBeCloseTo(0.2 + b.r, 12);
    expect(a.y).toBeCloseTo(0.2, 12);
  });
});

describe('speed regulation', () => {
  it('eases toward baseSpeed by speedRestore', () => {
    const b = body(0, 0, 0.5, 0);
    regulateSpeed(b, config);
    expect(speed(b)).toBeCloseTo(0.5 + (config.baseSpeed - 0.5) * config.speedRestore, 12);
    expect(b.vy).toBe(0);
  });

  it('clamps to the band', () => {
    const slow = body(0, 0, 0, -0.01);
    const fast = body(0, 0, 3, 4);
    regulateSpeed(slow, config);
    regulateSpeed(fast, config);
    expect(speed(slow)).toBeCloseTo(minSpeed, 12);
    expect(slow.vy).toBeLessThan(0);
    expect(speed(fast)).toBeCloseTo(maxSpeed, 12);
    expect(fast.vy / fast.vx).toBeCloseTo(4 / 3, 12);
  });
});

describe('substeps (SPEC §6)', () => {
  it('split a step into equal parts and count the collisions of each', () => {
    const start = createRound().balls.map(({ x, y, vx, vy, r }) => ({ x, y, vx, vy, r }));
    const whole = structuredClone(start);
    const halves = structuredClone(start);
    let collisions = 0;
    for (let i = 0; i < 1_200; i++) {
      const counted = stepWorld(whole, dt, { ...config, substeps: 2 }, sequence(0.3));
      const first = stepWorld(halves, dt / 2, config, sequence(0.3));
      expect(counted).toBe(first + stepWorld(halves, dt / 2, config, sequence(0.3)));
      collisions += counted;
    }
    expect(whole).toEqual(halves);
    expect(collisions).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('gives identical results for identical inputs', () => {
    const start = createRound().balls.map(({ x, y, vx, vy, r }) => ({ x, y, vx, vy, r }));
    const a = structuredClone(start);
    const b = structuredClone(start);
    for (let i = 0; i < 2_000; i++) {
      stepWorld(a, dt, config, sequence(0.1, 0.7));
      stepWorld(b, dt, config, sequence(0.1, 0.7));
    }
    expect(a).toEqual(b);
  });
});

describe('fairness (SPEC §2.3)', () => {
  const sources = import.meta.glob<string>('../src/physics/**/*.ts', { query: '?raw', import: 'default', eager: true });

  it('physics/ never refers to the target or to ball names', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/target/i);
      expect(source, file).not.toMatch(/\bnames?\b/i);
    }
  });
});
