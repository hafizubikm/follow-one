import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createSession, type GameEvent } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';

const stepMs = 1000 / config.physicsHz;
const steps = (ms: number) => Math.round(ms / stepMs);

function started() {
  const events: Array<{ at: number; event: GameEvent }> = [];
  let clock = 0;
  const session = createSession({
    strict: true,
    reducedMotion: () => false,
    onEvent: (event) => events.push({ at: clock, event }),
  });
  // Events are stamped with the number of steps completed once the emitting step ends.
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock++;
      session.step();
    }
  };
  const runUntil = (state: GameState) => {
    for (let guard = 0; session.state !== state; guard++) {
      if (guard > 100_000) throw new Error(`never reached ${state}`);
      run(1);
    }
  };
  expect(session.start()).toBe(true);
  return { session, events, run, runUntil, clock: () => clock };
}

const positionsOf = (s: ReturnType<typeof started>['session']) => s.round?.balls.map(({ x, y }) => [x, y]);

describe('session', () => {
  it('starts idle, then Start Game builds round 1', () => {
    const idle = createSession({ strict: true, reducedMotion: () => false, onEvent: () => {} });
    expect(idle.state).toBe('IDLE');
    expect(idle.round).toBeNull();
    expect(idle.stats.round).toBe(0);

    const { session } = started();
    expect(session.state).toBe('TARGET_INTRO');
    expect(session.round?.balls).toHaveLength(config.ballCount);
    expect(session.stats.round).toBe(1);
  });

  it('ignores Start Game once a round is running', () => {
    const { session } = started();
    const round = session.round;
    expect(session.start()).toBe(false);
    expect(session.round).toBe(round);
    expect(session.stats.round).toBe(1);
  });

  it('keeps the balls still through the intro and countdown', () => {
    const { session, runUntil } = started();
    const spawn = positionsOf(session);
    runUntil('COUNTDOWN');
    expect(positionsOf(session)).toEqual(spawn);
    runUntil('TRACKING');
    expect(positionsOf(session)).toEqual(spawn);
  });

  it('moves the balls for exactly trackingMs, then freezes them', () => {
    const { session, run, runUntil } = started();
    runUntil('TRACKING');
    const start = positionsOf(session);
    let trackingSteps = 0;
    while (session.state === 'TRACKING') {
      run(1);
      trackingSteps++;
    }
    expect(trackingSteps).toBe(steps(config.trackingMs));
    expect(session.state).toBe('TRACKING_COMPLETE');
    const frozen = positionsOf(session);
    expect(frozen).not.toEqual(start);
    run(steps(config.freezeMs) * 3);
    expect(positionsOf(session)).toEqual(frozen);
  });

  it('cues the countdown beats, GO, the final seconds and the freeze on the simulation clock', () => {
    const { events, runUntil, clock } = started();
    runUntil('TRACKING_COMPLETE');
    const introEnd = steps(config.introMs);
    const countdownEnd = introEnd + steps(config.countdownFrom * config.countdownStepMs);
    const trackingEnd = countdownEnd + steps(config.trackingMs);
    expect(clock()).toBe(trackingEnd);

    const beat = steps(config.countdownStepMs);
    const warnFrom = config.trackingMs / 1000 - config.finalWarningS;
    expect(events).toEqual([
      { at: 0, event: { type: 'enter', state: 'TARGET_INTRO' } },
      { at: introEnd, event: { type: 'enter', state: 'COUNTDOWN' } },
      { at: introEnd, event: { type: 'countdown', value: 3 } },
      { at: introEnd + beat, event: { type: 'countdown', value: 2 } },
      { at: introEnd + 2 * beat, event: { type: 'countdown', value: 1 } },
      { at: countdownEnd, event: { type: 'enter', state: 'TRACKING' } },
      ...[5, 4, 3, 2, 1].map((left, i) => ({
        at: countdownEnd + steps((warnFrom + i) * 1000),
        event: { type: 'finalTick', secondsLeft: left },
      })),
      { at: trackingEnd, event: { type: 'enter', state: 'TRACKING_COMPLETE' } },
    ]);
  });

  it('interpolates render positions between the last two steps', () => {
    const { session, run, runUntil } = started();
    runUntil('TRACKING');
    run(10);
    const before = session.positions(0);
    const after = session.positions(1);
    const mid = session.positions(0.5);
    const ball = session.round!.balls[0];
    expect(after[0]).toEqual({ x: ball.x, y: ball.y });
    expect(before[0]).not.toEqual(after[0]);
    expect(mid[0].x).toBeCloseTo((before[0].x + after[0].x) / 2, 12);
    expect(mid[0].y).toBeCloseTo((before[0].y + after[0].y) / 2, 12);
  });

  it('renders still balls exactly where they are', () => {
    const { session } = started();
    const ball = session.round!.balls[3];
    expect(session.positions(0.37)[3]).toEqual({ x: ball.x, y: ball.y });
  });
});
