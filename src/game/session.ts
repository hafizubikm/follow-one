import { config, type Config } from '../config.ts';
import type { Vec } from '../physics/vec.ts';
import { stepWorld, type PhysicsParams } from '../physics/world.ts';
import { createRound, defaultSetup, roundPhysics, type Round, type RoundSetup } from './round.ts';
import { createStats, isCorrect, recordAnswer, startRound, type Answer, type SavedBest, type Stats } from './score.ts';
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
  /** The player's ball count, target count, speed and duration, read once as each round is built (SPEC §2.6); defaults if absent. */
  setup?(): RoundSetup;
  /** The best streak kept between visits (SPEC §9): read as each round is built, recorded at REVEAL. */
  readonly savedBest?: SavedBest;
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
  /** The picked balls' ids in pick order, from the first pick until the next round. */
  readonly pickedIds: readonly number[];
  /** Ball input is live: SELECTION, past settleMs, picks still to make (SPEC §8). */
  readonly selectionLive: boolean;
  /** Ball positions between the last two steps (alpha 0 = previous step, 1 = latest), for smooth rendering. */
  positions(alpha: number): Vec[];
  /** Start Game. Does nothing (returns false) outside IDLE. */
  start(): boolean;
  /** A pick. Counts only while selection is live and on a ball not picked yet; the round's last one locks input. */
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
  let physics: PhysicsParams = roundPhysics(defaultSetup, settings);
  let stats = createStats();
  let pickedIds: number[] = [];
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
      round = createRound(options.setup?.() ?? defaultSetup, settings);
      physics = roundPhysics(round, settings);
      stats = startRound(stats, options.savedBest?.read());
      pickedIds = [];
      prevX = new Float64Array(round.balls.length);
      prevY = new Float64Array(round.balls.length);
      rememberPositions();
    } else if (state === 'RETURNING' && round) {
      // Slots come from where the balls froze, nothing else (SPEC §7).
      const { balls, ringRadius } = round;
      const slots = assignSlots(balls);
      balls.forEach((ball, i) => {
        ball.slot = slots[i];
      });
      glideFrom = balls.map(({ x, y }) => ({ x, y }));
      glideTo = balls.map((_, i) => slotPosition(slots[i], balls.length, ringRadius));
    }
    emit({ type: 'enter', state });
    if (state === 'COUNTDOWN') emit({ type: 'countdown', value: settings.countdownFrom });
    if (state === 'REVEAL' && round) {
      const answer = foundTargets(round, pickedIds);
      stats = recordAnswer(stats, answer, settings.score);
      options.savedBest?.record(stats.bestStreak);
      emit({ type: 'answer', correct: isCorrect(answer) });
    }
  };

  const machine = createStateMachine({
    stepHz: settings.physicsHz,
    strict: options.strict,
    // TRACKING lasts the round's own duration; the round exists by then (built on TARGET_INTRO).
    durationOf: (state) =>
      phaseDurationMs(state, round ? { ...settings, trackingMs: round.trackingMs } : settings, options.reducedMotion()),
    onEnter,
  });

  // Cues that fall inside a state rather than on entering it.
  const cuesBetween = (state: GameState, before: number, after: number) => {
    if (state === 'COUNTDOWN') {
      const beat = Math.floor(after / settings.countdownStepMs);
      if (beat !== Math.floor(before / settings.countdownStepMs)) {
        emit({ type: 'countdown', value: settings.countdownFrom - beat });
      }
    } else if (state === 'TRACKING' && round) {
      const left = secondsLeft(after, round);
      if (left !== secondsLeft(before, round) && left <= settings.finalWarningS) {
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
    machine.state === 'SELECTION' &&
    machine.elapsedMs >= settings.settleMs &&
    round !== null &&
    pickedIds.length < round.targetIds.length;

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
    get pickedIds() {
      return pickedIds;
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
      if (!selectionLive() || !round?.balls.some((ball) => ball.id === id) || pickedIds.includes(id)) return false;
      pickedIds = [...pickedIds, id];
      if (pickedIds.length === round.targetIds.length) machine.transition('CHECKING');
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
      if (state === 'TRACKING' && round && stepWorld(round.balls, dt, physics) > 0) emit({ type: 'collision' });
      machine.tick();
      if (machine.state === state) cuesBetween(state, before, machine.elapsedMs);
      if (machine.state === 'RETURNING' && machine.durationMs) placeGliding(machine.elapsedMs / machine.durationMs);
      else if (state === 'RETURNING') placeGliding(1);
    },
  };
}

/** How many of the round's targets are among the picks. */
export function foundTargets(round: Pick<Round, 'targetIds'>, pickedIds: readonly number[]): Answer {
  return { found: round.targetIds.filter((id) => pickedIds.includes(id)).length, targets: round.targetIds.length };
}

/** The tracking timer as shown: whole seconds left of the round's duration, rounded up (SPEC §12). */
export function secondsLeft(elapsedMs: number, round: Pick<Round, 'trackingMs'>): number {
  return Math.ceil((round.trackingMs - elapsedMs) / 1000);
}
