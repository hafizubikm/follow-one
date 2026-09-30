import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { createSavedBest } from '../src/game/score.ts';
import type { KeyValueStore } from '../src/util/storage.ts';
import { started, steps, toLiveSelection, wrongId, type Driven } from './drive.ts';
import { memoryStore } from './fakes.ts';

describe('session: picking (SPEC §8)', () => {
  it('ignores picks before selection is live, then takes the first one only', () => {
    const driven = started();
    const { session } = driven;
    driven.runUntil('TRACKING');
    expect(session.pick(0)).toBe(false);
    driven.runUntil('SELECTION');
    expect(session.selectionLive).toBe(false);
    expect(session.pick(0)).toBe(false); // still settling
    driven.run(steps(config.settleMs));
    expect(session.selectionLive).toBe(true);
    expect(session.pick(99)).toBe(false); // not a ball
    expect(session.pick(3)).toBe(true);
    expect(session.state).toBe('CHECKING');
    expect(session.selectionLive).toBe(false);
    expect(session.pick(4)).toBe(false);
    expect(session.pickedIds).toEqual([3]);
  });

  it('never goes live when the settle is over but the state has moved on', () => {
    const driven = started();
    toLiveSelection(driven);
    driven.session.pick(driven.session.round!.targetIds[0]);
    driven.run(steps(config.suspenseMs) - 1);
    expect(driven.session.state).toBe('CHECKING');
    expect(driven.session.selectionLive).toBe(false);
  });

  it('scores a correct pick at REVEAL, after the suspense', () => {
    const driven = started();
    const { session, events } = driven;
    toLiveSelection(driven);
    session.pick(session.round!.targetIds[0]);
    driven.run(steps(config.suspenseMs) - 1);
    expect(session.stats.score).toBe(0); // not before REVEAL
    driven.run(1);
    expect(session.state).toBe('REVEAL');
    expect(session.stats).toMatchObject({ correct: 1, streak: 1, bestStreak: 1, score: 100 });
    expect(events.at(-1)?.event).toEqual({ type: 'answer', correct: true });
    driven.run(steps(config.revealMs));
    expect(session.state).toBe('RESULT');
  });

  it('scores a wrong pick as a miss', () => {
    const driven = started();
    const { session, events } = driven;
    toLiveSelection(driven);
    session.pick(wrongId(session));
    driven.runUntil('REVEAL');
    expect(session.stats).toMatchObject({ correct: 0, incorrect: 1, streak: 0, score: 0 });
    expect(events.at(-1)?.event).toEqual({ type: 'answer', correct: false });
  });

  it('waits in RESULT, then Play Again starts a fresh round with a new layout', () => {
    const driven = started();
    const { session } = driven;
    toLiveSelection(driven);
    session.pick(session.round!.targetIds[0]);
    driven.runUntil('RESULT');
    driven.run(10_000);
    expect(session.state).toBe('RESULT');

    const previous = session.round;
    expect(session.playAgain()).toBe(true);
    expect(session.state).toBe('TARGET_INTRO');
    expect(session.round).not.toBe(previous);
    expect(session.round!.balls.every((b) => b.slot === null)).toBe(true);
    expect(session.pickedIds).toEqual([]);
    expect(session.stats).toMatchObject({ round: 2, correct: 1, score: 100 });
  });

  it('keeps the streak going across rounds', () => {
    const driven = started();
    const { session } = driven;
    for (let round = 1; round <= 3; round++) {
      toLiveSelection(driven);
      session.pick(session.round!.targetIds[0]);
      driven.runUntil('RESULT');
      if (round < 3) session.playAgain();
    }
    expect(session.stats).toMatchObject({ round: 3, streak: 3, bestStreak: 3, score: 375 });
  });
});

describe('session: the saved best streak (SPEC §9)', () => {
  const key = config.storageKeys.best;
  const withSaved = (store: KeyValueStore) => started(config, undefined, createSavedBest(store));

  /** Plays the current round to RESULT. */
  const answer = (driven: Driven, correct: boolean) => {
    const { session } = driven;
    toLiveSelection(driven);
    session.pick(correct ? session.round!.targetIds[0] : wrongId(session));
    driven.runUntil('RESULT');
  };

  it('starts every round from the best saved on this device, so it outlives a reload', () => {
    const store = memoryStore({ [key]: '{"bestStreak":4}' });
    const driven = withSaved(store);
    expect(driven.session.stats).toMatchObject({ round: 1, score: 0, streak: 0, bestStreak: 4 });
    answer(driven, true);
    expect(driven.session.stats).toMatchObject({ streak: 1, bestStreak: 4 });
    expect(store.data[key]).toBe('{"bestStreak":4}');
  });

  it('saves a new best at REVEAL, not before, and keeps it through a miss', () => {
    const store = memoryStore();
    const driven = withSaved(store);
    const { session } = driven;
    answer(driven, true);
    expect(store.data[key]).toBe('{"bestStreak":1}');

    session.playAgain();
    toLiveSelection(driven);
    session.pick(session.round!.targetIds[0]);
    driven.run(steps(config.suspenseMs) - 1);
    expect(store.data[key]).toBe('{"bestStreak":1}');
    driven.run(1);
    expect(session.state).toBe('REVEAL');
    expect(store.data[key]).toBe('{"bestStreak":2}');

    driven.runUntil('RESULT');
    session.playAgain();
    answer(driven, false);
    expect(session.stats).toMatchObject({ streak: 0, bestStreak: 2 });
    expect(store.data[key]).toBe('{"bestStreak":2}');
  });

  it('takes a higher best saved in another tab from the next round, and never lowers it', () => {
    const store = memoryStore({ [key]: '{"bestStreak":2}' });
    const driven = withSaved(store);
    store.data[key] = '{"bestStreak":6}'; // another tab, mid-round
    answer(driven, true);
    expect(driven.session.stats.bestStreak).toBe(2);
    expect(store.data[key]).toBe('{"bestStreak":6}');
    driven.session.playAgain();
    expect(driven.session.stats.bestStreak).toBe(6);
  });
});
