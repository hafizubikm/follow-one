import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { copy, fill } from '../src/copy.ts';
import { defaultSetup } from '../src/game/round.ts';
import { createStats } from '../src/game/score.ts';
import type { Session } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';
import { arenaView, inputMode, longestResultViews, resultView, slotNumberOpacity } from '../src/game/view.ts';
import { getPack } from '../src/names/packs.ts';
import { started, toLiveSelection, wrongId } from './drive.ts';

/** A snapshot at a given state and time, for the views that read nothing else. */
const at = (state: GameState, elapsedMs: number, extra: Partial<Session> = {}) => ({
  state,
  elapsedMs,
  durationMs: null,
  round: null,
  pickedId: null,
  selectionLive: false,
  stats: createStats(),
  ...extra,
});

describe('ring, input and reveal views', () => {
  it('orders the DOM by id until slots exist, then by slot', () => {
    const driven = started();
    const { session } = driven;
    expect(arenaView(session, 0)!.order).toEqual([...Array(config.ballCount).keys()]);
    driven.runUntil('RETURNING');
    const order = arenaView(session, 0)!.order;
    expect(order.map((id) => session.round!.balls[id].slot)).toEqual([...Array(config.ballCount).keys()].map((k) => k + 1));
  });

  it('fades the slot numbers in over the end of the glide and keeps them to the end of the round', () => {
    const glide = config.returnMs;
    const during = (t: number) => slotNumberOpacity(at('RETURNING', t, { durationMs: glide }));
    expect(slotNumberOpacity(at('TRACKING_COMPLETE', 0))).toBe(0);
    expect(during(0)).toBe(0);
    expect(during(glide * config.slotLabelFadeFrom)).toBe(0);
    expect(during(glide * (1 + config.slotLabelFadeFrom) / 2)).toBeCloseTo(0.5, 9);
    expect(during(glide)).toBe(1);
    for (const state of ['SELECTION', 'CHECKING', 'REVEAL', 'RESULT'] as const) expect(slotNumberOpacity(at(state, 0))).toBe(1);
  });

  it('opens input only while selection is live and locks it through the reveal', () => {
    expect(inputMode(at('SELECTION', 0))).toBe('off');
    expect(inputMode(at('SELECTION', config.settleMs, { selectionLive: true }))).toBe('live');
    expect(inputMode(at('CHECKING', 0))).toBe('locked');
    expect(inputMode(at('REVEAL', 0))).toBe('locked');
    for (const state of ['TARGET_INTRO', 'TRACKING', 'RETURNING', 'RESULT'] as const) expect(inputMode(at(state, 0))).toBe('off');
  });

  it('names every ball "Ball {slot}" while the ring is reachable, and nothing otherwise', () => {
    const driven = started();
    toLiveSelection(driven);
    const view = arenaView(driven.session, 0)!;
    view.balls.forEach((ball, id) => expect(ball.ariaLabel).toBe(`Ball ${driven.session.round!.balls[id].slot}`));
    driven.session.pick(0);
    driven.runUntil('RESULT');
    expect(arenaView(driven.session, 0)!.balls.every((ball) => ball.ariaLabel === '')).toBe(true);
  });

  it('outlines the pick while checking, then reveals a correct pick with ✓', () => {
    const driven = started();
    const { session } = driven;
    toLiveSelection(driven);
    const targetId = session.round!.targetId;
    session.pick(targetId);
    const checking = arenaView(session, 0)!;
    expect(checking.balls[targetId]).toMatchObject({ look: 'picked', glyph: '', label: '' });
    expect(checking.balls.filter((b) => b.look !== null)).toHaveLength(1);

    driven.runUntil('REVEAL');
    const reveal = arenaView(session, 0)!;
    expect(reveal.balls[targetId]).toMatchObject({ look: 'revealed-correct', glyph: '✓', label: session.round!.balls[targetId].name });
    expect(reveal.balls.filter((b) => b.look !== null)).toHaveLength(1);
  });

  it('reveals a wrong pick with ✕ and the real target with ★', () => {
    const driven = started();
    const { session } = driven;
    toLiveSelection(driven);
    const targetId = session.round!.targetId;
    const pick = wrongId(session);
    session.pick(pick);
    driven.runUntil('RESULT');
    const view = arenaView(session, 0)!;
    expect(view.balls[targetId]).toMatchObject({ look: 'revealed-target', glyph: '★', label: session.round!.balls[targetId].name });
    expect(view.balls[pick]).toMatchObject({ look: 'revealed-wrong-pick', glyph: '✕', label: session.round!.balls[pick].name });
    expect(view.balls.filter((b) => b.look !== null)).toHaveLength(2);
  });
});

describe('names on the ring', () => {
  /** A finished round of `count` balls whose target sits in slot 1 and whose wrong pick sits in `pickSlot`. */
  const revealWithPickIn = (pickSlot: number, count: number = config.ballCount) => {
    const driven = started(config, () => ({ ...defaultSetup, ballCount: count }));
    const { session } = driven;
    toLiveSelection(driven);
    const round = session.round!;
    const pick = wrongId(session);
    session.pick(pick);
    driven.runUntil('RESULT');
    let next = 2;
    for (const ball of round.balls) {
      if (ball.id === round.targetId) ball.slot = 1;
      else if (ball.id === pick) ball.slot = pickSlot;
      else {
        if (next === pickSlot) next++;
        ball.slot = next++;
      }
    }
    const view = arenaView(session, 0)!;
    return { target: view.balls[round.targetId], pick: view.balls[pick], all: view.balls };
  };

  it('points names at the center once the balls are on the ring, for every ball alike', () => {
    const { all } = revealWithPickIn(8);
    expect(all.every((ball) => ball.ring)).toBe(true);
  });

  it('steps a neighbouring wrong pick’s name one row further in', () => {
    for (const slot of [2, 4, 13, 15]) {
      const { target, pick } = revealWithPickIn(slot);
      expect([target.labelDepth, pick.labelDepth], `pick in slot ${slot}`).toEqual([0, 1]);
    }
    for (const slot of [5, 8, 12]) {
      expect(revealWithPickIn(slot).pick.labelDepth, `pick in slot ${slot}`).toBe(0);
    }
  });

  it('counts "neighbouring" as the same share of the ring at any ball count', () => {
    // 3 slots of 15 is a fifth of the ring: 6 slots of 30, 2 of 10.
    for (const slot of [2, 7, 25, 30]) expect(revealWithPickIn(slot, 30).pick.labelDepth, `30 balls, slot ${slot}`).toBe(1);
    for (const slot of [8, 16, 24]) expect(revealWithPickIn(slot, 30).pick.labelDepth, `30 balls, slot ${slot}`).toBe(0);
    for (const slot of [2, 3, 9, 10]) expect(revealWithPickIn(slot, 10).pick.labelDepth, `10 balls, slot ${slot}`).toBe(1);
    for (const slot of [4, 8]) expect(revealWithPickIn(slot, 10).pick.labelDepth, `10 balls, slot ${slot}`).toBe(0);
  });
});

describe('ball size and ring in the view', () => {
  it('passes the round’s ball radius and ring radius to the renderer', () => {
    for (const ballCount of [config.ballCountMin, config.ballCount, config.ballCountMax]) {
      const { session } = started(config, () => ({ ...defaultSetup, ballCount }));
      const view = arenaView(session, 0)!;
      expect(view.balls).toHaveLength(ballCount);
      expect(view.ballRadius).toBe(session.round!.ballRadius);
      expect(view.ringRadius).toBe(session.round!.ringRadius);
    }
  });
});

describe('result card (SPEC §3)', () => {
  it('celebrates a correct pick', () => {
    const driven = started();
    const { session } = driven;
    toLiveSelection(driven);
    session.pick(session.round!.targetId);
    expect(resultView(session)).toBeNull(); // not before REVEAL
    driven.runUntil('RESULT');
    const target = session.round!.balls[session.round!.targetId];
    expect(resultView(session)).toEqual({
      correct: true,
      icon: '🎯',
      headline: 'Nailed it!',
      subline: `You found ${target.name}.`,
      stats: [
        { label: 'Round', icon: '', value: '1' },
        { label: 'Score', icon: '', value: '100' },
        { label: 'Accuracy', icon: '', value: '100%' },
        { label: 'Streak', icon: '🔥', value: '1' },
        { label: 'Best', icon: '🔥', value: '1' },
      ],
    });
  });

  it('names both balls and their slots after a miss', () => {
    const driven = started();
    const { session } = driven;
    toLiveSelection(driven);
    const picked = session.round!.balls[wrongId(session)];
    session.pick(picked.id);
    driven.runUntil('RESULT');
    const target = session.round!.balls[session.round!.targetId];
    const view = resultView(session)!;
    expect(view).toMatchObject({ correct: false, icon: '👀', headline: 'Not quite!' });
    expect(view.subline).toBe(`You picked ${picked.name} (#${picked.slot}). ${target.name} was #${target.slot}.`);
    expect(view.stats.map((s) => s.value)).toEqual(['1', '0', '0%', '0', '0']);
  });
});

describe('the longest result card, which the arena leaves room for (SPEC §4)', () => {
  const longest = longestResultViews();
  const names = getPack(config.namePackId).names;

  it('is a miss with large totals, once per name with that name in both places', () => {
    expect(longest).toHaveLength(names.length);
    longest.forEach((view, i) => {
      expect(view).toMatchObject({ correct: false, icon: '👀', headline: 'Not quite!' });
      expect(view.subline).toBe(`You picked ${names[i]} (#30). ${names[i]} was #29.`);
      expect(view.stats.map((s) => s.value)).toEqual(['999', '99999', '100%', '99', '99']);
    });
  });

  it('has a sub-line at least as long as any miss can have', () => {
    const longestSubline = Math.max(...longest.map((view) => view.subline.length));
    for (const picked of names) {
      for (const name of names) {
        if (picked === name) continue;
        const subline = fill(copy.result.incorrect.subline, { picked, name, pickedSlot: config.ballCountMax, targetSlot: 1 });
        expect(subline.length).toBeLessThanOrEqual(longestSubline);
      }
    }
  });
});
