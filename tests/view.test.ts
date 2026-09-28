import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { copy, fill } from '../src/copy.ts';
import { createStats } from '../src/game/score.ts';
import type { Session } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';
import { defaultSetup } from '../src/game/round.ts';
import {
  arenaView,
  countdownView,
  hudView,
  inputMode,
  resultView,
  slotNumberOpacity,
  targetHighlight,
  type BallView,
} from '../src/game/view.ts';
import { started, stepMs, steps, toLiveSelection, wrongId } from './drive.ts';

const sample = started().session;
const name = sample.round!.balls[sample.round!.targetId].name;

/** A snapshot of the sample round at a given state and time. */
const at = (state: GameState, elapsedMs: number, extra: Partial<Session> = {}) => ({
  state,
  elapsedMs,
  durationMs: null,
  round: sample.round,
  pickedId: null,
  selectionLive: false,
  stats: createStats(),
  ...extra,
});

describe('HUD (SPEC §3, §12)', () => {
  it('is empty on the start screen and while the result card is up', () => {
    expect(hudView({ ...at('IDLE', 0), round: null }).message).toBe('');
    expect(hudView(at('RESULT', 0)).message).toBe('');
  });

  it('introduces the target by name, in bold', () => {
    const view = hudView(at('TARGET_INTRO', 0));
    expect(view.message).toBe(`Your target is **${name}**. Keep your eyes on it.`);
    expect(view.timer).toBeNull();
  });

  it('keeps the intro line up through the countdown, whose numerals are in the arena', () => {
    for (const t of [0, 1000, 2999]) {
      expect(hudView(at('COUNTDOWN', t))).toEqual({ message: fill(copy.hud.intro, { name }), icon: '', timer: null });
    }
  });

  it('asks to keep eyes on the target from the first step of tracking, then "Stay focused!" for the last seconds', () => {
    expect(hudView(at('TRACKING', 0))).toEqual({ message: fill(copy.hud.tracking, { name }), icon: '', timer: 15 });
    expect(hudView(at('TRACKING', 10_000 - stepMs))).toMatchObject({ message: `Keep your eyes on ${name}`, timer: 6 });
    expect(hudView(at('TRACKING', 10_000))).toEqual({ message: 'Stay focused!', icon: '', timer: 5 });
  });

  it('keeps a timer for assistive technology: 15 → 1, then 0 at the freeze, then none', () => {
    const shown = new Set<number | null>();
    for (let t = 0; t < config.trackingMs; t += stepMs) shown.add(hudView(at('TRACKING', t)).timer);
    expect([...shown]).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(hudView(at('TRACKING_COMPLETE', 0))).toMatchObject({ message: "Nice! Time's up.", timer: 0 });
    for (const state of ['RETURNING', 'SELECTION', 'CHECKING', 'REVEAL', 'RESULT'] as const) {
      expect(hudView(at(state, 0)).timer).toBeNull();
    }
  });

  it('keeps "Getting into position..." until input is live, then asks for the target', () => {
    expect(hudView(at('RETURNING', 0)).message).toBe('Getting into position...');
    expect(hudView(at('SELECTION', config.settleMs - stepMs)).message).toBe('Getting into position...');
    expect(hudView(at('SELECTION', config.settleMs)).message).toBe(`Which one was ${name}?`);
    expect(hudView(at('CHECKING', 0)).message).toBe('Checking...');
  });

  it('shows the verdict at REVEAL', () => {
    const target = sample.round!.targetId;
    expect(hudView(at('REVEAL', 0, { pickedId: target }))).toMatchObject({ message: 'Nailed it!', icon: '🎯' });
    expect(hudView(at('REVEAL', 0, { pickedId: wrongId(sample) }))).toMatchObject({ message: 'Not quite!', icon: '👀' });
  });
});

describe('arena countdown (SPEC §5)', () => {
  const empty = { text: '', strong: false };

  it('is empty before the countdown and from the ring on', () => {
    for (const state of ['IDLE', 'TARGET_INTRO', 'RETURNING', 'SELECTION', 'CHECKING', 'REVEAL', 'RESULT'] as const) {
      expect(countdownView(at(state, 0)), state).toEqual(empty);
    }
  });

  it('shows 3, 2, 1 strongly, one per countdownStepMs', () => {
    const shown = [0, 999, 1000, 1999, 2000, 2999].map((t) => countdownView(at('COUNTDOWN', t)));
    expect(shown.map((v) => v.text)).toEqual(['3', '3', '2', '2', '1', '1']);
    expect(shown.every((v) => v.strong)).toBe(true);
  });

  it('shows GO! strongly for goMs, then the seconds left faintly, 15 → 1', () => {
    expect(countdownView(at('TRACKING', 0))).toEqual({ text: copy.countdown.go, strong: true });
    expect(countdownView(at('TRACKING', config.goMs - stepMs))).toEqual({ text: 'GO!', strong: true });
    expect(countdownView(at('TRACKING', config.goMs))).toEqual({ text: '15', strong: false });
    const shown = new Set<string>();
    for (let t = config.goMs; t < config.trackingMs; t += stepMs) shown.add(countdownView(at('TRACKING', t)).text);
    expect([...shown]).toEqual(['15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
  });

  it('reads 0, faintly, at the freeze', () => {
    expect(countdownView(at('TRACKING_COMPLETE', 0))).toEqual({ text: '0', strong: false });
  });

  it('counts down from the round’s own duration', () => {
    const round = { ...sample.round!, trackingMs: 30_000 };
    expect(countdownView(at('TRACKING', config.goMs, { round })).text).toBe('30');
    expect(countdownView(at('TRACKING', 29_000, { round })).text).toBe('1');
    expect(hudView(at('TRACKING', 24_999, { round }))).toMatchObject({ message: `Keep your eyes on ${name}`, timer: 6 });
    expect(hudView(at('TRACKING', 25_000, { round }))).toMatchObject({ message: 'Stay focused!', timer: 5 });
  });
});

describe('cursor (SPEC §12)', () => {
  it('hides over the arena only while the balls move', () => {
    const driven = started();
    const hidden = new Set<string>();
    for (let i = 0; i < 4_000 && !driven.session.selectionLive; i++) {
      driven.run(1);
      if (arenaView(driven.session, 0)!.hideCursor) hidden.add(driven.session.state);
    }
    expect([...hidden]).toEqual(['TRACKING']);
  });
});

describe('target highlight (SPEC §2.1)', () => {
  const hold = config.revealHoldMs;
  const fade = config.revealFadeMs;

  it('is full through the intro, the countdown and revealHoldMs of tracking', () => {
    expect(targetHighlight('TARGET_INTRO', 1234)).toBe(1);
    expect(targetHighlight('COUNTDOWN', 2999)).toBe(1);
    expect(targetHighlight('TRACKING', 0)).toBe(1);
    expect(targetHighlight('TRACKING', hold - stepMs)).toBe(1);
  });

  it('fades linearly to zero by revealHoldMs + revealFadeMs', () => {
    expect(targetHighlight('TRACKING', hold + fade / 2)).toBeCloseTo(0.5, 12);
    let last = 1;
    for (let t = hold; t < hold + fade; t += stepMs) {
      const h = targetHighlight('TRACKING', t);
      expect(h).toBeLessThanOrEqual(last);
      last = h;
    }
    expect(targetHighlight('TRACKING', hold + fade)).toBe(0);
    expect(targetHighlight('TRACKING', config.trackingMs - stepMs)).toBe(0);
  });

  it.each(['IDLE', 'TRACKING_COMPLETE', 'RETURNING', 'SELECTION', 'CHECKING'] as const)('is zero in %s', (state) => {
    expect(targetHighlight(state, 0)).toBe(0);
  });
});

describe('fairness: after the fade the target is indistinguishable until REVEAL (SPEC §2.1)', () => {
  // Position and the slot-numbered accessible name differ per ball by design; everything else must match.
  const withoutPosition = ({ x: _x, y: _y, ariaLabel, ...rest }: BallView) => ({
    ...rest,
    ariaLabel: ariaLabel.replace(/\d+/, '#'),
  });

  it('every ball view matches every other, step by step, through selection', () => {
    const driven = started();
    const { session } = driven;
    const targetId = session.round!.targetId;
    const fadeEnds = config.revealHoldMs + config.revealFadeMs;
    let checkedSteps = 0;
    let highlightedSteps = 0;

    const check = () => {
      const view = arenaView(session, 0.5)!;
      const target = view.balls[targetId];
      const afterFade = session.state !== 'TARGET_INTRO' && session.state !== 'COUNTDOWN' &&
        !(session.state === 'TRACKING' && session.elapsedMs < fadeEnds);
      if (afterFade) {
        checkedSteps++;
        for (const ball of view.balls) expect(withoutPosition(ball)).toEqual(withoutPosition(target));
        expect(target.look).toBeNull();
      } else {
        highlightedSteps++;
        expect(target.look).toBe('target');
        expect(target.label).toBe(session.round!.balls[targetId].name);
      }
    };

    while (!session.selectionLive) {
      driven.run(1);
      check();
    }
    driven.run(steps(5_000)); // a player taking their time
    check();
    expect(highlightedSteps).toBeGreaterThan(0);
    expect(checkedSteps).toBeGreaterThan((config.trackingMs - fadeEnds) / stepMs);
  });

  it('draws nothing before the first round', () => {
    expect(arenaView({ ...at('IDLE', 0), round: null, positions: () => [] }, 0)).toBeNull();
  });
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
