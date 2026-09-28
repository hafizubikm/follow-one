import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import {
  createStateMachine,
  gameStates,
  nextState,
  phaseDurationMs,
  type GameState,
  type MachineOptions,
} from '../src/game/stateMachine.ts';

const hz = config.physicsHz;
const cycle: GameState[] = [
  'TARGET_INTRO',
  'COUNTDOWN',
  'TRACKING',
  'TRACKING_COMPLETE',
  'RETURNING',
  'SELECTION',
  'CHECKING',
  'REVEAL',
  'RESULT',
];

function machine(overrides: Partial<MachineOptions> = {}) {
  const entered: GameState[] = [];
  const m = createStateMachine({
    stepHz: hz,
    strict: true,
    durationOf: (state) => phaseDurationMs(state, config, false),
    onEnter: (state) => entered.push(state),
    ...overrides,
  });
  return { m, entered };
}

/** A machine walked from IDLE to `state` through legal transitions. */
function machineAt(state: GameState, overrides: Partial<MachineOptions> = {}) {
  const built = machine(overrides);
  for (const s of cycle) {
    if (built.m.state === state) break;
    built.m.transition(s);
  }
  expect(built.m.state).toBe(state);
  return built;
}

/** Ticks until the state changes; returns how many steps that took. */
function stepsUntilExit(m: ReturnType<typeof machine>['m'], limit = 100_000): number {
  const from = m.state;
  let steps = 0;
  while (m.state === from) {
    m.tick();
    if (++steps > limit) return Infinity;
  }
  return steps;
}

describe('transitions (SPEC §12)', () => {
  it('starts in IDLE', () => {
    expect(machine().m.state).toBe('IDLE');
  });

  it('follows the round order and loops RESULT → TARGET_INTRO', () => {
    const { m, entered } = machine();
    for (const state of [...cycle, 'TARGET_INTRO' as const]) m.transition(state);
    expect(entered).toEqual([...cycle, 'TARGET_INTRO']);
  });

  it('gives every state exactly one successor, and every state is reachable', () => {
    expect(new Set(Object.values(nextState))).toEqual(new Set(gameStates.filter((s) => s !== 'IDLE')));
  });

  it('throws on every illegal transition in strict mode and stays put', () => {
    for (const from of gameStates) {
      for (const to of gameStates) {
        if (nextState[from] === to) continue;
        const { m, entered } = machineAt(from);
        const before = entered.length;
        expect(() => m.transition(to), `${from} → ${to}`).toThrow(/Illegal transition/);
        expect(m.state).toBe(from);
        expect(entered).toHaveLength(before);
      }
    }
  });

  it('ignores illegal transitions when not strict', () => {
    const { m, entered } = machineAt('TRACKING', { strict: false });
    m.transition('SELECTION');
    m.transition('IDLE');
    expect(m.state).toBe('TRACKING');
    expect(entered).toEqual(['TARGET_INTRO', 'COUNTDOWN', 'TRACKING']);
  });
});

describe('phase timers', () => {
  const stepsFor = (ms: number) => (ms * hz) / 1000;

  it.each([
    ['TARGET_INTRO', config.introMs],
    ['COUNTDOWN', config.countdownFrom * config.countdownStepMs],
    ['TRACKING', config.trackingMs],
    ['TRACKING_COMPLETE', config.freezeMs],
    ['RETURNING', config.returnMs],
    ['CHECKING', config.suspenseMs],
    ['REVEAL', config.revealMs],
  ] as const)('%s lasts exactly %i ms of simulation steps', (state, ms) => {
    const { m } = machineAt(state);
    expect(stepsUntilExit(m)).toBe(stepsFor(ms));
    expect(m.state).toBe(nextState[state]);
  });

  it('tracking is exactly 1 800 steps at 120 Hz', () => {
    expect(stepsUntilExit(machineAt('TRACKING').m)).toBe(1800);
  });

  it.each(['IDLE', 'SELECTION', 'RESULT'] as const)('%s waits for the player', (state) => {
    const { m } = machineAt(state);
    for (let i = 0; i < 100_000; i++) m.tick();
    expect(m.state).toBe(state);
    expect(m.durationMs).toBeNull();
  });

  it('shortens the return glide under reduced motion', () => {
    const { m } = machineAt('RETURNING', { durationOf: (state) => phaseDurationMs(state, config, true) });
    expect(stepsUntilExit(m)).toBe(stepsFor(config.returnMsReducedMotion));
  });

  it('reads a duration once, on entry', () => {
    let reduced = false;
    const { m } = machineAt('RETURNING', { durationOf: (state) => phaseDurationMs(state, config, reduced) });
    reduced = true;
    expect(stepsUntilExit(m)).toBe(stepsFor(config.returnMs));
  });

  it('counts elapsed time exactly and restarts it on each entry', () => {
    const { m } = machineAt('TARGET_INTRO');
    for (let i = 0; i < 299; i++) m.tick();
    expect(m.elapsedMs).toBeLessThan(config.introMs);
    m.tick();
    expect(m.state).toBe('COUNTDOWN');
    expect(m.elapsedMs).toBe(0);
    for (let i = 0; i < 120; i++) m.tick();
    expect(m.elapsedMs).toBe(1000);
  });
});
