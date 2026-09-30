import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { copy, fill } from '../src/copy.ts';
import { arenaView, inputMode, longestResultViews, resultView, type BallView } from '../src/game/view.ts';
import { picksFinding, startedWith, stepMs, steps, toLiveSelection, wrongIds, type Driven } from './drive.ts';

const targetCounts = Array.from({ length: config.targetCountMax - config.targetCountMin + 1 }, (_, i) => config.targetCountMin + i);

describe('balls with several targets (SPEC §5)', () => {
  const looks = (driven: Driven) => arenaView(driven.session, 0)!.balls;

  it('highlights every target in the reveal window, with ★ and no name', () => {
    for (const k of targetCounts.filter((count) => count > 1)) {
      const driven = startedWith(k);
      const { targetIds } = driven.session.round!;
      for (const state of ['TARGET_INTRO', 'COUNTDOWN', 'TRACKING'] as const) {
        driven.runUntil(state);
        const balls = looks(driven);
        balls.forEach((ball, id) => {
          if (targetIds.includes(id)) expect(ball).toMatchObject({ look: 'target', strength: 1, glyph: '★', label: '' });
          else expect(ball.look).toBeNull();
        });
      }
    }
  });

  it('fades every target at the same moment, to nothing', () => {
    const driven = startedWith(4);
    const { targetIds } = driven.session.round!;
    driven.runUntil('TRACKING');
    driven.run(steps(config.revealHoldMs + config.revealFadeMs / 2));
    const fading = targetIds.map((id) => looks(driven)[id]);
    expect(new Set(fading.map((ball) => ball.strength)).size).toBe(1);
    expect(fading[0].strength).toBeCloseTo(0.5, 6);
    driven.run(steps(config.revealFadeMs / 2));
    expect(looks(driven).every((ball) => ball.look === null)).toBe(true);
  });

  it('outlines each pick as it is made and names it "picked", while the rest stay pickable', () => {
    const driven = startedWith(3);
    const { session } = driven;
    toLiveSelection(driven);
    const round = session.round!;
    const [target, wrong] = [round.targetIds[0], wrongIds(session)[0]];
    session.pick(target);
    session.pick(wrong);
    expect(inputMode(session)).toBe('live');
    looks(driven).forEach((ball, id) => {
      const slot = round.balls[id].slot;
      if (id === target || id === wrong) {
        expect(ball).toMatchObject({ look: 'picked', strength: 1, glyph: '', label: '', ariaLabel: `Ball ${slot}, picked` });
      } else {
        expect(ball).toMatchObject({ look: null, ariaLabel: `Ball ${slot}` });
      }
    });
    session.pick(round.targetIds[1]);
    expect(inputMode(session)).toBe('locked');
    expect(looks(driven).filter((ball) => ball.look === 'picked')).toHaveLength(3);
  });

  it('reveals ✓ on each target found, ★ on each missed and ✕ on each wrong pick, without names', () => {
    const driven = startedWith(5);
    const { session } = driven;
    toLiveSelection(driven);
    const picks = picksFinding(driven, 3);
    for (const id of picks) session.pick(id);
    for (const state of ['REVEAL', 'RESULT'] as const) {
      driven.runUntil(state);
      const { targetIds } = session.round!;
      looks(driven).forEach((ball, id) => {
        const isTarget = targetIds.includes(id);
        const isPick = picks.includes(id);
        if (isTarget && isPick) expect(ball).toMatchObject({ look: 'revealed-correct', glyph: '✓' });
        else if (isTarget) expect(ball).toMatchObject({ look: 'revealed-target', glyph: '★' });
        else if (isPick) expect(ball).toMatchObject({ look: 'revealed-wrong-pick', glyph: '✕' });
        else expect(ball.look).toBeNull();
        expect(ball).toMatchObject({ label: '', labelDepth: 0 });
      });
      expect(looks(driven).filter((ball) => ball.look !== null)).toHaveLength(7); // 3 found, 2 missed, 2 wrong
    }
  });

  it('with one target, names the pick "picked" once it is made', () => {
    const driven = startedWith(1);
    const { session } = driven;
    toLiveSelection(driven);
    const id = session.round!.targetIds[0];
    session.pick(id);
    expect(looks(driven)[id].ariaLabel).toBe(`Ball ${session.round!.balls[id].slot}, picked`);
  });
});

describe('fairness with several targets (SPEC §2.1, §2.7)', () => {
  // Position and the slot number in the accessible name differ per ball by design; everything else must match.
  const withoutPosition = ({ x: _x, y: _y, ariaLabel, ...rest }: BallView) => ({
    ...rest,
    ariaLabel: ariaLabel.replace(/\d+/, '#'),
  });

  it.each([2, config.targetCountMax])('after the fade, none of %i targets differs from any other ball, step by step', (k) => {
    const driven = startedWith(k, config.ballCountMin);
    const { session } = driven;
    const fadeEnds = config.revealHoldMs + config.revealFadeMs;
    let checkedSteps = 0;
    while (!session.selectionLive) {
      driven.run(1);
      const highlighted = session.state === 'TARGET_INTRO' || session.state === 'COUNTDOWN' ||
        (session.state === 'TRACKING' && session.elapsedMs < fadeEnds);
      const balls = arenaView(session, 0.5)!.balls;
      if (highlighted) {
        expect(balls.filter((ball) => ball.look === 'target')).toHaveLength(k);
      } else {
        checkedSteps++;
        for (const ball of balls) expect(withoutPosition(ball)).toEqual(withoutPosition(balls[0]));
        expect(balls[0].look).toBeNull();
      }
    }
    expect(checkedSteps).toBeGreaterThan((config.trackingMs - fadeEnds) / stepMs);
  });

  it('shows a picked target exactly as it shows a picked ball that isn’t one, until REVEAL', () => {
    const driven = startedWith(3);
    const { session } = driven;
    toLiveSelection(driven);
    const round = session.round!;
    const [target, otherTarget] = round.targetIds;
    const [wrong, otherWrong] = wrongIds(session);
    const compare = () => {
      const balls = arenaView(session, 0)!.balls;
      expect(withoutPosition(balls[target])).toEqual(withoutPosition(balls[wrong]));
      expect(withoutPosition(balls[otherTarget])).toEqual(withoutPosition(balls[otherWrong]));
    };
    session.pick(target);
    session.pick(wrong);
    compare(); // two picked, two not
    driven.run(steps(2_000));
    compare();
    session.pick(otherWrong);
    expect(session.state).toBe('CHECKING');
    for (let i = 0; i < steps(config.suspenseMs) - 1; i++) {
      driven.run(1);
      const balls = arenaView(session, 0)!.balls;
      expect(withoutPosition(balls[target])).toEqual(withoutPosition(balls[wrong]));
      expect(withoutPosition(balls[target])).toEqual(withoutPosition(balls[otherWrong]));
    }
    expect(session.state).toBe('CHECKING');
  });
});

describe('result card with several targets (SPEC §3, §9)', () => {
  it('celebrates only when every target was found', () => {
    const driven = startedWith(3);
    toLiveSelection(driven);
    for (const id of picksFinding(driven, 3)) driven.session.pick(id);
    expect(resultView(driven.session)).toBeNull(); // not before REVEAL
    driven.runUntil('RESULT');
    expect(resultView(driven.session)).toEqual({
      correct: true,
      icon: '🎯',
      headline: 'Nailed it!',
      subline: 'You found all 3 targets.',
      stats: [
        { label: 'Round', icon: '', value: '1' },
        { label: 'Score', icon: '', value: '300' },
        { label: 'Accuracy', icon: '', value: '100%' },
        { label: 'Streak', icon: '🔥', value: '1' },
        { label: 'Best', icon: '🔥', value: '1' },
      ],
    });
  });

  it.each([
    [2, 3, 'You found 2 of 3 targets.', ['1', '200', '67%', '0', '0']],
    [0, 2, 'You found 0 of 2 targets.', ['1', '0', '0%', '0', '0']],
    [4, 5, 'You found 4 of 5 targets.', ['1', '400', '80%', '0', '0']],
  ])('says how many were found after a miss: %i of %i', (found, k, subline, values) => {
    const driven = startedWith(k);
    toLiveSelection(driven);
    for (const id of picksFinding(driven, found)) driven.session.pick(id);
    driven.runUntil('RESULT');
    const view = resultView(driven.session)!;
    expect(view).toMatchObject({ correct: false, icon: '👀', headline: 'Not quite!', subline });
    expect(view.stats.map((stat) => stat.value)).toEqual(values);
  });

  it('never needs more room than the longest one-target card the arena reserves (SPEC §4)', () => {
    const reserved = Math.min(...longestResultViews().map((view) => view.subline.length));
    const k = config.targetCountMax;
    for (const subline of [
      fill(copy.result.correct.sublineSeveral, { k }),
      fill(copy.result.incorrect.sublineSeveral, { found: k, k }),
    ]) {
      expect(subline.length).toBeLessThan(reserved);
    }
  });
});
