import { config } from '../config.ts';
import { getPack } from '../names/packs.ts';
import { randomUnit } from '../physics/vec.ts';
import type { Body } from '../physics/world.ts';
import { randomBetween, randomInt, shuffle } from '../util/random.ts';

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
}

export interface SpawnSettings {
  readonly ballCount: number;
  readonly ballRadius: number;
  readonly spawnMargin: number;
  readonly spawnGap: number;
  readonly baseSpeed: number;
  readonly spawnSpeedRange: readonly [number, number];
}

export interface RoundSettings extends SpawnSettings {
  readonly namePackId: string;
}

/** Everything random about a round is drawn fresh here: layout, velocities, names, target (SPEC §2.4). */
export function createRound(settings: RoundSettings = config): Round {
  const pack = getPack(settings.namePackId);
  if (pack.names.length < settings.ballCount) {
    throw new Error(`Name pack "${pack.id}" has fewer than ${settings.ballCount} names`);
  }
  const names = shuffle(pack.names).slice(0, settings.ballCount);
  const balls = spawnBodies(settings).map((body, id): Ball => ({ ...body, id, name: names[id], slot: null }));
  return { balls, targetId: randomInt(settings.ballCount), namePackId: pack.id };
}

// Far more than needed at the default density (~17% of the RSA jamming limit); guards against impossible configs.
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
