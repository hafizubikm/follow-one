import { length, randomUnit } from './vec.ts';

/** The physical part of a ball, in arena units (center 0,0, radius 1, y down). Nothing else reaches physics. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface PhysicsParams {
  readonly baseSpeed: number;
  readonly speedBand: readonly [number, number];
  readonly speedRestore: number;
  readonly collisionPasses: number;
}

// Below these, a distance or speed has no usable direction.
const COINCIDENT = 1e-9;
const STOPPED = 1e-9;

/** Advances every body by dt seconds (SPEC §6 step order). */
export function stepWorld(bodies: Body[], dt: number, params: PhysicsParams, random: () => number = Math.random): void {
  for (const b of bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (const b of bodies) keepInArena(b);
  for (let pass = 0; pass < params.collisionPasses; pass++) {
    resolveCollisions(bodies, random);
    for (const b of bodies) keepInArena(b);
  }
  for (const b of bodies) regulateSpeed(b, params, random);
}

/** Puts a body that crossed the wall back on it and reflects it if it is still heading out. */
export function keepInArena(b: Body): void {
  const d = length(b.x, b.y);
  if (d + b.r <= 1) return;
  const nx = b.x / d;
  const ny = b.y / d;
  b.x = nx * (1 - b.r);
  b.y = ny * (1 - b.r);
  const vn = b.vx * nx + b.vy * ny;
  if (vn > 0) {
    b.vx -= 2 * vn * nx;
    b.vy -= 2 * vn * ny;
  }
}

/** One pass over every pair: separate overlaps equally, then exchange the normal velocity (equal mass, elastic). */
export function resolveCollisions(bodies: Body[], random: () => number = Math.random): void {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const minDist = a.r + b.r;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      let d = Math.sqrt(distSq);
      let nx: number;
      let ny: number;
      if (d < COINCIDENT) {
        ({ x: nx, y: ny } = randomUnit(random));
        d = 0;
      } else {
        nx = dx / d;
        ny = dy / d;
      }

      const push = (minDist - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      const s = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (s > 0) {
        a.vx -= s * nx;
        a.vy -= s * ny;
        b.vx += s * nx;
        b.vy += s * ny;
      }
    }
  }
}

/** Eases |v| toward baseSpeed, then clamps it to the band, keeping the direction. */
export function regulateSpeed(b: Body, params: PhysicsParams, random: () => number = Math.random): void {
  const { baseSpeed, speedBand, speedRestore } = params;
  const speed = length(b.vx, b.vy);
  const eased = speed + (baseSpeed - speed) * speedRestore;
  const newSpeed = Math.min(Math.max(eased, speedBand[0] * baseSpeed), speedBand[1] * baseSpeed);

  if (speed < STOPPED) {
    const dir = randomUnit(random);
    b.vx = dir.x * newSpeed;
    b.vy = dir.y * newSpeed;
    return;
  }
  const k = newSpeed / speed;
  b.vx *= k;
  b.vy *= k;
}
