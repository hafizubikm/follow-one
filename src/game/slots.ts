import type { Config } from '../config.ts';
import type { Vec } from '../physics/vec.ts';

const TAU = 2 * Math.PI;

/** The ring for balls of this radius: their outer edge stays where it is at the default count (SPEC §7). */
export function ringRadiusFor(ballRadius: number, settings: Pick<Config, 'slotRadius' | 'ballRadius'>): number {
  return settings.slotRadius + settings.ballRadius - ballRadius;
}

/** Slot k's angle, clockwise from 12 o'clock (SPEC §7). */
export function slotAngle(slot: number, count: number): number {
  return (TAU * (slot - 1)) / count;
}

/** Center of slot k on a ring of the given radius; y points down, so 12 o'clock is −y. */
export function slotPosition(slot: number, count: number, radius: number): Vec {
  const angle = slotAngle(slot, count);
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

/** A point's angle clockwise from 12 o'clock, in [0, 2π). */
export function clockAngle(x: number, y: number): number {
  const angle = Math.atan2(x, -y);
  return angle < 0 ? angle + TAU : angle;
}

/**
 * Slot numbers for balls at the given positions: the k-th ball clockwise from 12 o'clock gets
 * slot k (ties: nearer the center first). Positions are all it looks at (SPEC §2.2, §7).
 */
export function assignSlots(positions: readonly Vec[]): number[] {
  const order = positions
    .map((p, index) => ({ index, angle: clockAngle(p.x, p.y), distance: Math.hypot(p.x, p.y) }))
    .sort((a, b) => a.angle - b.angle || a.distance - b.distance);
  const slots = new Array<number>(positions.length);
  order.forEach(({ index }, k) => {
    slots[index] = k + 1;
  });
  return slots;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** A gliding ball's position at progress t (0..1) along its straight path; exact at both ends. */
export function glidePoint(from: Vec, to: Vec, t: number): Vec {
  const k = easeInOut(Math.min(Math.max(t, 0), 1));
  return { x: from.x * (1 - k) + to.x * k, y: from.y * (1 - k) + to.y * k };
}
