import { config, type Config } from '../config.ts';
import type { Vec } from '../physics/vec.ts';
import { stepWorld } from '../physics/world.ts';
import { createRound, type Round } from './round.ts';
import { createStats, startRound, type Stats } from './score.ts';
import { createStateMachine, phaseDurationMs, type GameState } from './stateMachine.ts';

/** Moments the page reacts to (sounds); state entries plus the ticks inside a state. */
export type GameEvent =
  | { readonly type: 'enter'; readonly state: GameState }
  | { readonly type: 'countdown'; readonly value: number }
  | { readonly type: 'finalTick'; readonly secondsLeft: number };

export interface SessionOptions {
  /** Throw on an illegal transition (development). */
  readonly strict: boolean;
  /** Read when a state that depends on it begins (SPEC §10). */
  reducedMotion(): boolean;
  onEvent(event: GameEvent): void;
}

export interface Session {
  readonly state: GameState;
  /** Simulation time spent in the current state. */
  readonly elapsedMs: number;
  readonly round: Round | null;
  readonly stats: Stats;
  /** Ball positions between the last two steps (alpha 0 = previous step, 1 = latest), for smooth rendering. */
  positions(alpha: number): Vec[];
  /** Start Game. Does nothing (returns false) outside IDLE. */
  start(): boolean;
  /** One fixed simulation step: physics if tracking, then the state clock. */
  step(): void;
}

export function createSession(options: SessionOptions, settings: Config = config): Session {
  const dt = 1 / settings.physicsHz;
  const emit = options.onEvent;
  let round: Round | null = null;
  let stats = createStats();
  let prevX = new Float64Array(0);
  let prevY = new Float64Array(0);

  const rememberPositions = () => {
    round?.balls.forEach((ball, i) => {
      prevX[i] = ball.x;
      prevY[i] = ball.y;
    });
  };

  const machine = createStateMachine({
    stepHz: settings.physicsHz,
    strict: options.strict,
    // Until phase 5 adds the ring, the round rests at the freeze.
    durationOf: (state) =>
      state === 'TRACKING_COMPLETE' ? null : phaseDurationMs(state, settings, options.reducedMotion()),
    onEnter(state) {
      if (state === 'TARGET_INTRO') {
        round = createRound(settings);
        stats = startRound(stats);
        prevX = new Float64Array(round.balls.length);
        prevY = new Float64Array(round.balls.length);
        rememberPositions();
      }
      emit({ type: 'enter', state });
      if (state === 'COUNTDOWN') emit({ type: 'countdown', value: settings.countdownFrom });
    },
  });

  // Cues that fall inside a state rather than on entering it.
  const cuesBetween = (state: GameState, before: number, after: number) => {
    if (state === 'COUNTDOWN') {
      const beat = Math.floor(after / settings.countdownStepMs);
      if (beat !== Math.floor(before / settings.countdownStepMs)) {
        emit({ type: 'countdown', value: settings.countdownFrom - beat });
      }
    } else if (state === 'TRACKING') {
      const left = secondsLeft(after, settings);
      if (left !== secondsLeft(before, settings) && left <= settings.finalWarningS) {
        emit({ type: 'finalTick', secondsLeft: left });
      }
    }
  };

  return {
    get state() {
      return machine.state;
    },
    get elapsedMs() {
      return machine.elapsedMs;
    },
    get round() {
      return round;
    },
    get stats() {
      return stats;
    },
    positions(alpha) {
      return (round?.balls ?? []).map((ball, i) => ({
        x: prevX[i] + (ball.x - prevX[i]) * alpha,
        y: prevY[i] + (ball.y - prevY[i]) * alpha,
      }));
    },
    start() {
      if (machine.state !== 'IDLE') return false;
      machine.transition('TARGET_INTRO');
      return true;
    },
    step() {
      rememberPositions();
      const state = machine.state;
      const before = machine.elapsedMs;
      if (state === 'TRACKING' && round) stepWorld(round.balls, dt, settings);
      machine.tick();
      if (machine.state === state) cuesBetween(state, before, machine.elapsedMs);
    },
  };
}

/** The tracking timer as shown: whole seconds left, rounded up (SPEC §12). */
export function secondsLeft(elapsedMs: number, settings: Pick<Config, 'trackingMs'>): number {
  return Math.ceil((settings.trackingMs - elapsedMs) / 1000);
}
