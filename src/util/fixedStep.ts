/** Turns variable frame times into whole fixed steps (SPEC §6 timestep). */
export interface FixedStep {
  /** Adds one frame's elapsed time, clamped to [0, maxFrameMs], and returns how many steps to run now. */
  advance(frameMs: number): number;
  /** How far the clock is into the next step, in [0, 1); renderers interpolate with it. */
  readonly alpha: number;
}

export function createFixedStep(stepMs: number, maxFrameMs: number): FixedStep {
  let pending = 0;
  return {
    advance(frameMs) {
      pending += Math.min(Math.max(frameMs, 0), maxFrameMs);
      const steps = Math.floor(pending / stepMs);
      pending -= steps * stepMs;
      return steps;
    },
    get alpha() {
      return pending / stepMs;
    },
  };
}
