export const gameStates = [
  'IDLE',
  'TARGET_INTRO',
  'COUNTDOWN',
  'TRACKING',
  'TRACKING_COMPLETE',
  'RETURNING',
  'SELECTION',
  'CHECKING',
  'REVEAL',
  'RESULT',
] as const;

export type GameState = (typeof gameStates)[number];

/** The one legal successor of each state (SPEC §12). */
export const nextState: Readonly<Record<GameState, GameState>> = {
  IDLE: 'TARGET_INTRO',
  TARGET_INTRO: 'COUNTDOWN',
  COUNTDOWN: 'TRACKING',
  TRACKING: 'TRACKING_COMPLETE',
  TRACKING_COMPLETE: 'RETURNING',
  RETURNING: 'SELECTION',
  SELECTION: 'CHECKING',
  CHECKING: 'REVEAL',
  REVEAL: 'RESULT',
  RESULT: 'TARGET_INTRO',
};

export interface PhaseTimings {
  readonly introMs: number;
  readonly countdownFrom: number;
  readonly countdownStepMs: number;
  readonly trackingMs: number;
  readonly freezeMs: number;
  readonly returnMs: number;
  readonly returnMsReducedMotion: number;
  readonly suspenseMs: number;
  readonly revealMs: number;
}

/** How long a state lasts before its timer moves on, or null when it waits for the player. */
export function phaseDurationMs(state: GameState, t: PhaseTimings, reducedMotion: boolean): number | null {
  switch (state) {
    case 'TARGET_INTRO':
      return t.introMs;
    case 'COUNTDOWN':
      return t.countdownFrom * t.countdownStepMs;
    case 'TRACKING':
      return t.trackingMs;
    case 'TRACKING_COMPLETE':
      return t.freezeMs;
    case 'RETURNING':
      return reducedMotion ? t.returnMsReducedMotion : t.returnMs;
    case 'CHECKING':
      return t.suspenseMs;
    case 'REVEAL':
      return t.revealMs;
    case 'IDLE':
    case 'SELECTION':
    case 'RESULT':
      return null;
  }
}

export interface MachineOptions {
  /** Simulation steps per second; the machine's only clock. */
  readonly stepHz: number;
  /** Throw on an illegal transition (development); otherwise ignore it. */
  readonly strict: boolean;
  /** Read once on entering a state, so a setting changed mid-state doesn't stretch it. */
  durationOf(state: GameState): number | null;
  onEnter(state: GameState): void;
}

export interface StateMachine {
  readonly state: GameState;
  /** Simulation time in the current state: whole steps × step length, exact for whole-ms durations. */
  readonly elapsedMs: number;
  /** The current state's duration, fixed on entry; null while it waits for the player. */
  readonly durationMs: number | null;
  transition(to: GameState): void;
  /** One simulation step passes; a timed state moves on once its time is up. */
  tick(): void;
}

export function createStateMachine(options: MachineOptions): StateMachine {
  let state: GameState = 'IDLE';
  let steps = 0;
  let durationMs: number | null = null;
  // steps × 1000 / hz (not steps × stepMs) so 300 steps at 120 Hz is exactly 2500.
  const elapsedMs = () => (steps * 1000) / options.stepHz;

  const transition = (to: GameState) => {
    if (nextState[state] !== to) {
      if (options.strict) throw new Error(`Illegal transition ${state} → ${to}`);
      return;
    }
    state = to;
    steps = 0;
    durationMs = options.durationOf(to);
    options.onEnter(to);
  };

  return {
    get state() {
      return state;
    },
    get elapsedMs() {
      return elapsedMs();
    },
    get durationMs() {
      return durationMs;
    },
    transition,
    tick() {
      steps++;
      if (durationMs !== null && elapsedMs() >= durationMs) transition(nextState[state]);
    },
  };
}
