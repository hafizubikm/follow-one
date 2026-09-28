import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createFixedStep } from '../src/util/fixedStep.ts';

const stepMs = 1000 / config.physicsHz;

describe('fixed step clock', () => {
  it('runs two 120 Hz steps per 60 Hz frame', () => {
    const clock = createFixedStep(stepMs, config.maxFrameMs);
    let steps = 0;
    for (let frame = 0; frame < 60; frame++) steps += clock.advance(1000 / 60);
    expect(steps).toBe(120);
  });

  it('carries the remainder and reports it as alpha', () => {
    const clock = createFixedStep(10, 50);
    expect(clock.advance(25)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5, 12);
    expect(clock.advance(4)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.9, 12);
    expect(clock.advance(1)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0, 12);
  });

  it('clamps long frames, so a hidden tab pauses the round instead of skipping ahead', () => {
    const clock = createFixedStep(stepMs, config.maxFrameMs);
    expect(clock.advance(60_000)).toBe(Math.floor(config.maxFrameMs / stepMs));
  });

  it('ignores negative frame times', () => {
    const clock = createFixedStep(10, 50);
    expect(clock.advance(-100)).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('keeps total simulated time equal to total wall time under jittery frames', () => {
    const clock = createFixedStep(stepMs, config.maxFrameMs);
    let wall = 0;
    let steps = 0;
    for (let frame = 0; frame < 10_000; frame++) {
      const dt = 16.6 + ((frame * 7919) % 13) / 10 - 0.6; // 16.0–17.2 ms
      wall += dt;
      steps += clock.advance(dt);
    }
    expect(steps * stepMs + clock.alpha * stepMs).toBeCloseTo(wall, 6);
  });
});
