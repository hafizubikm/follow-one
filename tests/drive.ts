import { config, type Config } from '../src/config.ts';
import { defaultSetup, type RoundSetup } from '../src/game/round.ts';
import type { SavedBest } from '../src/game/score.ts';
import { createSession, type GameEvent, type Session } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';

export const stepMs = 1000 / config.physicsHz;
export const steps = (ms: number) => Math.round(ms / stepMs);

export interface Driven {
  readonly session: Session;
  /** Events stamped with the number of steps completed once the emitting step ends. */
  readonly events: Array<{ at: number; event: GameEvent }>;
  run(n: number): void;
  runUntil(state: GameState): void;
  clock(): number;
  setReducedMotion(on: boolean): void;
}

/**
 * A session in strict mode with Start Game already pressed; `setup` gives each round's ball count, target count,
 * speed and duration, `savedBest` the best streak kept between visits.
 */
export function started(settings: Config = config, setup?: () => RoundSetup, savedBest?: SavedBest): Driven {
  const events: Driven['events'] = [];
  let clock = 0;
  let reduced = false;
  const session = createSession(
    {
      strict: true,
      reducedMotion: () => reduced,
      setup,
      savedBest,
      onEvent: (event) => events.push({ at: clock, event }),
    },
    settings,
  );
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock++;
      session.step();
    }
  };
  const runUntil = (state: GameState) => {
    for (let guard = 0; session.state !== state; guard++) {
      if (guard > 100_000) throw new Error(`never reached ${state} (stuck in ${session.state})`);
      run(1);
    }
  };
  if (!session.start()) throw new Error('Start Game was ignored');
  return {
    session,
    events,
    run,
    runUntil,
    clock: () => clock,
    setReducedMotion: (on) => {
      reduced = on;
    },
  };
}

/** Plays a round to SELECTION with input live. */
export function toLiveSelection(driven: Driven): void {
  driven.runUntil('SELECTION');
  driven.run(steps(config.settleMs));
  if (!driven.session.selectionLive) throw new Error('selection did not go live');
}

/** The ids of the round's balls that aren't targets. */
export function wrongIds(session: Session): number[] {
  const round = session.round;
  if (!round) throw new Error('no round');
  return round.balls.map((ball) => ball.id).filter((id) => !round.targetIds.includes(id));
}

export function wrongId(session: Session): number {
  return wrongIds(session)[0];
}

/** Picks that find `found` of the round's targets; the rest of the picks go to balls that aren't targets. */
export function picksFinding(driven: Driven, found: number): number[] {
  const { targetIds } = driven.session.round!;
  return [...targetIds.slice(0, found), ...wrongIds(driven.session).slice(0, targetIds.length - found)];
}

/** A session started with `targetCount` targets per round (and `ballCount` balls). */
export function startedWith(targetCount: number, ballCount: number = config.ballCount): Driven {
  return started(config, () => ({ ...defaultSetup, ballCount, targetCount }));
}
