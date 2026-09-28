import { config, type Config } from '../config.ts';
import { getPack } from '../names/packs.ts';
import { randomUnit } from '../physics/vec.ts';
import type { Body, PhysicsParams } from '../physics/world.ts';
import { randomBetween, randomInt, shuffle } from '../util/random.ts';
import { ringRadiusFor } from './slots.ts';

export interface Ball extends Body {
  readonly id: number;
  readonly name: string;
  /** 1..ballCount, assigned at the freeze (SPEC §7). */
  slot: number | null;
}

export interface Round {
  readonly balls: Ball[];
  readonly targetId: number;
  readonly namePackId: string;
  /** Every ball's radius this round (SPEC §5). */
  readonly ballRadius: number;
  /** The ring the balls glide to (SPEC §7). */
  readonly ringRadius: number;
  /** The Speed setting's multiplier on baseSpeed (SPEC §6). */
  readonly speedFactor: number;
}

/** What the player's settings decide about a round; read once, when it is built (SPEC §2.6). */
export interface RoundSetup {
  readonly ballCount: number;
  readonly speedFactor: number;
}

export const defaultSetup: RoundSetup = {
  ballCount: config.ballCount,
  speedFactor: config.speedPresets[config.speedPreset],
};

export interface SpawnSettings {
  readonly ballCount: number;
  readonly ballRadius: number;
  readonly spawnMargin: number;
  readonly spawnGap: number;
  readonly baseSpeed: number;
  readonly spawnSpeedRange: readonly [number, number];
}

/**
 * Ball radius for a ball count (SPEC §5): the balls cover the same share of the arena at every
 * count, and never shrink below the smallest readable size.
 */
export function ballRadiusFor(count: number, settings: Pick<Config, 'ballCount' | 'ballRadius' | 'ballRadiusMin'> = config): number {
  return Math.max(settings.ballRadiusMin, settings.ballRadius * Math.sqrt(settings.ballCount / count));
}

/** The physics a round runs with: its speed, and ⌈speedFactor⌉ substeps per step (SPEC §6). */
export function roundPhysics(round: Pick<Round, 'speedFactor'>, settings: Config = config): PhysicsParams {
  return {
    baseSpeed: settings.baseSpeed * round.speedFactor,
    speedBand: settings.speedBand,
    speedRestore: settings.speedRestore,
    collisionPasses: settings.collisionPasses,
    substeps: Math.ceil(round.speedFactor),
  };
}

/** Everything random about a round is drawn fresh here: layout, velocities, names, target (SPEC §2.4). */
export function createRound(setup: RoundSetup = defaultSetup, settings: Config = config): Round {
  const count = setup.ballCount;
  const pack = getPack(settings.namePackId);
  if (pack.names.length < count) {
    throw new Error(`Name pack "${pack.id}" has fewer than ${count} names`);
  }
  // The pack lists its most familiar names first, so smaller games use those (SPEC §5).
  const names = shuffle(pack.names.slice(0, count));
  const ballRadius = ballRadiusFor(count, settings);
  const bodies = spawnBodies({
    ...settings,
    ballCount: count,
    ballRadius,
    baseSpeed: settings.baseSpeed * setup.speedFactor,
  });
  return {
    balls: bodies.map((body, id): Ball => ({ ...body, id, name: names[id], slot: null })),
    targetId: randomInt(count),
    namePackId: pack.id,
    ballRadius,
    ringRadius: ringRadiusFor(ballRadius, settings),
    speedFactor: setup.speedFactor,
  };
}

// Far more than needed: even 30 balls pack only ~19% of the arena, well below the ~55% where random
// placement jams. Guards against impossible configs.
const TRIES_PER_LAYOUT = 20_000;
const MAX_LAYOUTS = 50;

/** Rejection-samples non-overlapping positions inside the arena, with random directions and speeds (SPEC §6). */
export function spawnBodies(settings: SpawnSettings): Body[] {
  for (let layout = 0; layout < MAX_LAYOUTS; layout++) {
    const bodies = tryLayout(settings);
    if (bodies) return bodies;
  }
  throw new Error(`Could not place ${settings.ballCount} balls of radius ${settings.ballRadius}`);
}

function tryLayout(s: SpawnSettings): Body[] | null {
  const r = s.ballRadius;
  const maxCenter = 1 - r - s.spawnMargin;
  const minGapSq = (2 * r + s.spawnGap) ** 2;
  const bodies: Body[] = [];

  for (let tries = 0; bodies.length < s.ballCount; tries++) {
    if (tries >= TRIES_PER_LAYOUT) return null;
    const x = randomBetween(-maxCenter, maxCenter);
    const y = randomBetween(-maxCenter, maxCenter);
    if (x * x + y * y > maxCenter * maxCenter) continue;
    if (bodies.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < minGapSq)) continue;

    const dir = randomUnit();
    const speed = s.baseSpeed * randomBetween(s.spawnSpeedRange[0], s.spawnSpeedRange[1]);
    bodies.push({ x, y, vx: dir.x * speed, vy: dir.y * speed, r });
  }
  return bodies;
}
