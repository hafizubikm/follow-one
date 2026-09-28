import { config, type Config } from '../config.ts';
import type { Vec } from '../physics/vec.ts';
import { stepWorld } from '../physics/world.ts';
import { createRound, type Round } from './round.ts';
import { createStats, recordAnswer, startRound, type Stats } from './score.ts';
import { assignSlots, glidePoint, slotPosition } from './slots.ts';
import { createStateMachine, phaseDurationMs, type GameState } from './stateMachine.ts';

/** Moments the page reacts to (sounds); state entries plus the beats inside a state. */
export type GameEvent =
  | { readonly type: 'enter'; readonly state: GameState }
  | { readonly type: 'countdown'; readonly value: number }
  | { readonly type: 'finalTick'; readonly secondsLeft: number }
  | { readonly type: 'answer'; readonly correct: boolean }
  | { readonly type: 'collision' };

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
  /** The current state's fixed duration, or null while it waits for the player. */
  readonly durationMs: number | null;
  readonly round: Round | null;
  readonly stats: Stats;
  /** The picked ball's id, from the pick until the next round. */
  readonly pickedId: number | null;
  /** Ball input is live: SELECTION, past settleMs, nothing picked yet (SPEC §8). */
  readonly selectionLive: boolean;
  /** Ball positions between the last two steps (alpha 0 = previous step, 1 = latest), for smooth rendering. */
  positions(alpha: number): Vec[];
  /** Start Game. Does nothing (returns false) outside IDLE. */
  start(): boolean;
  /** The player's pick. Only the first one while selection is live counts. */
  pick(id: number): boolean;
  /** Play Again. Does nothing (returns false) outside RESULT. */
  playAgain(): boolean;
  /** One fixed simulation step: physics or the glide, then the state clock. */
  step(): void;
}

export function createSession(options: SessionOptions, settings: Config = config): Session {
  const dt = 1 / settings.physicsHz;
  const emit = options.onEvent;
  let round: Round | null = null;
  let stats = createStats();
  let pickedId: number | null = null;
  let prevX = new Float64Array(0);
  let prevY = new Float64Array(0);
  let glideFrom: Vec[] = [];
  let glideTo: Vec[] = [];

  const rememberPositions = () => {
    round?.balls.forEach((ball, i) => {
      prevX[i] = ball.x;
      prevY[i] = ball.y;
    });
  };

  const onEnter = (state: GameState) => {
    if (state === 'TARGET_INTRO') {
      round = createRound(settings);
      stats = startRound(stats);
      pickedId = null;
      prevX = new Float64Array(round.balls.length);
      prevY = new Float64Array(round.balls.length);
      rememberPositions();
    } else if (state === 'RETURNING' && round) {
      // Slots come from where the balls froze, nothing else (SPEC §7).
      const balls = round.balls;
      const slots = assignSlots(balls);
      balls.forEach((ball, i) => {
        ball.slot = slots[i];
      });
      glideFrom = balls.map(({ x, y }) => ({ x, y }));
      glideTo = balls.map((_, i) => slotPosition(slots[i], balls.length, settings.slotRadius));
    }
    emit({ type: 'enter', state });
    if (state === 'COUNTDOWN') emit({ type: 'countdown', value: settings.countdownFrom });
    if (state === 'REVEAL' && round) {
      const correct = pickedId === round.targetId;
      stats = recordAnswer(stats, correct, settings.score);
      emit({ type: 'answer', correct });
    }
  };

  const machine = createStateMachine({
    stepHz: settings.physicsHz,
    strict: options.strict,
    durationOf: (state) => phaseDurationMs(state, settings, options.reducedMotion()),
    onEnter,
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

  const placeGliding = (progress: number) => {
    round?.balls.forEach((ball, i) => {
      const p = glidePoint(glideFrom[i], glideTo[i], progress);
      ball.x = p.x;
      ball.y = p.y;
    });
  };

  const selectionLive = () =>
    machine.state === 'SELECTION' && machine.elapsedMs >= settings.settleMs && pickedId === null;

  return {
    get state() {
      return machine.state;
    },
    get elapsedMs() {
      return machine.elapsedMs;
    },
    get durationMs() {
      return machine.durationMs;
    },
    get round() {
      return round;
    },
    get stats() {
      return stats;
    },
    get pickedId() {
      return pickedId;
    },
    get selectionLive() {
      return selectionLive();
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
    pick(id) {
      if (!selectionLive() || !round?.balls.some((ball) => ball.id === id)) return false;
      pickedId = id;
      machine.transition('CHECKING');
      return true;
    },
    playAgain() {
      if (machine.state !== 'RESULT') return false;
      machine.transition('TARGET_INTRO');
      return true;
    },
    step() {
      rememberPositions();
      const state = machine.state;
      const before = machine.elapsedMs;
      if (state === 'TRACKING' && round && stepWorld(round.balls, dt, settings) > 0) emit({ type: 'collision' });
      machine.tick();
      if (machine.state === state) cuesBetween(state, before, machine.elapsedMs);
      if (machine.state === 'RETURNING' && machine.durationMs) placeGliding(machine.elapsedMs / machine.durationMs);
      else if (state === 'RETURNING') placeGliding(1);
    },
  };
}

/** The tracking timer as shown: whole seconds left, rounded up (SPEC §12). */
export function secondsLeft(elapsedMs: number, settings: Pick<Config, 'trackingMs'>): number {
  return Math.ceil((settings.trackingMs - elapsedMs) / 1000);
}
