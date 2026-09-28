import { createFixedStep } from './util/fixedStep.ts';

export interface LoopHandlers {
  /** Advances the simulation by exactly one fixed step. */
  step(): void;
  /** Draws the current state; alpha is how far the clock is into the next step. */
  render(alpha: number): void;
}

/**
 * The single requestAnimationFrame loop. All simulation time comes from here, clamped per frame,
 * so a hidden or throttled tab pauses the round instead of letting it run ahead (SPEC §6).
 */
export function startLoop(stepMs: number, maxFrameMs: number, handlers: LoopHandlers): void {
  const clock = createFixedStep(stepMs, maxFrameMs);
  let last: number | undefined;

  const frame = (now: number) => {
    const steps = last === undefined ? 0 : clock.advance(now - last);
    last = now;
    for (let i = 0; i < steps; i++) handlers.step();
    handlers.render(clock.alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
