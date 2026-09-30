import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { hudView } from '../src/game/view.ts';
import { picksFinding, startedWith, steps, toLiveSelection, wrongIds, type Driven } from './drive.ts';

const targetCounts = Array.from({ length: config.targetCountMax - config.targetCountMin + 1 }, (_, i) => config.targetCountMin + i);

/** Plays the current round to RESULT, finding `found` of its targets. */
const answer = (driven: Driven, found: number) => {
  toLiveSelection(driven);
  for (const id of picksFinding(driven, found)) expect(driven.session.pick(id)).toBe(true);
  driven.runUntil('RESULT');
};

describe('session: picking several targets (SPEC §8)', () => {
  it.each(targetCounts)('takes exactly %i pick(s), then locks input', (k) => {
    const driven = startedWith(k);
    const { session } = driven;
    expect(session.round!.targetIds).toHaveLength(k);
    toLiveSelection(driven);
    const picks = picksFinding(driven, k);
    picks.forEach((id, i) => {
      expect(session.state).toBe('SELECTION');
      expect(session.selectionLive).toBe(true);
      expect(session.pick(id)).toBe(true);
      expect(session.pickedIds).toEqual(picks.slice(0, i + 1));
    });
    expect(session.state).toBe('CHECKING');
    expect(session.selectionLive).toBe(false);
    expect(session.pick(wrongIds(session)[0])).toBe(false);
    expect(session.pickedIds).toEqual(picks);
  });

  it('makes every pick final: a picked ball can’t be picked again or taken back', () => {
    const driven = startedWith(3);
    const { session } = driven;
    toLiveSelection(driven);
    const [first, second] = wrongIds(session);
    expect(session.pick(first)).toBe(true);
    expect(session.pick(first)).toBe(false);
    expect(session.pick(99)).toBe(false); // not a ball
    expect(session.pickedIds).toEqual([first]);
    expect(session.state).toBe('SELECTION');
    expect(session.pick(second)).toBe(true);
    expect(session.pick(first)).toBe(false);
    expect(session.pickedIds).toEqual([first, second]);
    expect(session.selectionLive).toBe(true);
  });

  it('waits for the last pick however long it takes', () => {
    const driven = startedWith(2);
    toLiveSelection(driven);
    driven.session.pick(driven.session.round!.targetIds[0]);
    driven.run(steps(30_000));
    expect(driven.session.state).toBe('SELECTION');
    expect(driven.session.selectionLive).toBe(true);
  });

  it('scores at REVEAL, not as the picks are made', () => {
    const driven = startedWith(3);
    const { session, events } = driven;
    toLiveSelection(driven);
    for (const id of session.round!.targetIds) session.pick(id);
    driven.run(steps(config.suspenseMs) - 1);
    expect(session.state).toBe('CHECKING');
    expect(session.stats).toMatchObject({ correct: 0, found: 0, targets: 0, score: 0 });
    expect(events.some(({ event }) => event.type === 'answer')).toBe(false);
    driven.run(1);
    expect(session.state).toBe('REVEAL');
    expect(session.stats).toMatchObject({ correct: 1, incorrect: 0, found: 3, targets: 3, streak: 1, bestStreak: 1, score: 300 });
    expect(events.at(-1)?.event).toEqual({ type: 'answer', correct: true });
  });

  it('finds the targets in any pick order', () => {
    const driven = startedWith(4);
    toLiveSelection(driven);
    for (const id of [...driven.session.round!.targetIds].reverse()) driven.session.pick(id);
    driven.runUntil('REVEAL');
    expect(driven.session.stats).toMatchObject({ correct: 1, found: 4, targets: 4, score: 400 });
  });

  it('counts a round with a missed target as incorrect, and still scores the targets found', () => {
    const driven = startedWith(3);
    answer(driven, 2);
    expect(driven.session.stats).toMatchObject({ correct: 0, incorrect: 1, found: 2, targets: 3, streak: 0, score: 200 });
    expect(driven.events.filter(({ event }) => event.type === 'answer').map(({ event }) => event)).toEqual([
      { type: 'answer', correct: false },
    ]);
  });

  it('builds the streak bonus per target across rounds, and loses it on a miss', () => {
    const driven = startedWith(2);
    const { session } = driven;
    answer(driven, 2);
    session.playAgain();
    expect(session.pickedIds).toEqual([]);
    answer(driven, 2);
    expect(session.stats).toMatchObject({ round: 2, streak: 2, bestStreak: 2, score: 200 + 250 });
    session.playAgain();
    answer(driven, 1);
    expect(session.stats).toMatchObject({ round: 3, streak: 0, bestStreak: 2, found: 5, targets: 6, score: 200 + 250 + 100 });
    session.playAgain();
    answer(driven, 0);
    expect(session.stats).toMatchObject({ round: 4, incorrect: 2, found: 5, targets: 8, score: 550 });
  });
});

describe('HUD with several targets (SPEC §3)', () => {
  it('counts the targets instead of naming them, from the intro to the last seconds', () => {
    const driven = startedWith(3);
    const { session } = driven;
    const names = session.round!.balls.map((ball) => ball.name);
    const seen: string[] = [];
    while (session.state !== 'RETURNING') {
      const { message } = hudView(session);
      if (message !== seen.at(-1)) seen.push(message);
      driven.run(1);
    }
    expect(seen).toEqual([
      'You have **3 targets**. Keep your eyes on them.',
      'Keep your eyes on all 3',
      'Stay focused!',
      "Nice! Time's up.",
    ]);
    for (const message of seen) for (const name of names) expect(message).not.toContain(name);
  });

  it('asks for all of them, then counts the picks left', () => {
    const driven = startedWith(3);
    const { session } = driven;
    driven.runUntil('SELECTION');
    expect(hudView(session).message).toBe('Getting into position...');
    driven.run(steps(config.settleMs));
    expect(hudView(session).message).toBe('Which 3 were your targets?');
    const [a, b, c] = picksFinding(driven, 3);
    session.pick(a);
    expect(hudView(session).message).toBe('Pick 2 more');
    session.pick(b);
    expect(hudView(session).message).toBe('Pick 1 more');
    session.pick(c);
    expect(hudView(session).message).toBe('Checking...');
  });

  it.each([
    [5, 5, 'Nailed it!', '🎯'],
    [4, 5, 'Not quite!', '👀'],
    [0, 5, 'Not quite!', '👀'],
  ])('gives the verdict at REVEAL: %i of %i found → %s', (found, k, headline, icon) => {
    const driven = startedWith(k);
    toLiveSelection(driven);
    for (const id of picksFinding(driven, found)) driven.session.pick(id);
    driven.runUntil('REVEAL');
    expect(hudView(driven.session)).toMatchObject({ message: headline, icon });
  });
});
