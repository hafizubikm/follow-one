import { config, type Config } from '../src/config.ts';
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

/** A session in strict mode with Start Game already pressed. */
export function started(settings: Config = config): Driven {
  const events: Driven['events'] = [];
  let clock = 0;
  let reduced = false;
  const session = createSession(
    { strict: true, reducedMotion: () => reduced, onEvent: (event) => events.push({ at: clock, event }) },
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

export function wrongId(session: Session): number {
  const round = session.round;
  if (!round) throw new Error('no round');
  return (round.targetId + 1) % round.balls.length;
}
