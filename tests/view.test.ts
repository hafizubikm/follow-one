import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { copy, fill } from '../src/copy.ts';
import { createStats } from '../src/game/score.ts';
import type { Session } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';
import { arenaView, countdownView, hudView, targetHighlight, type BallView } from '../src/game/view.ts';
import { started, stepMs, steps, wrongId } from './drive.ts';

const sample = started().session;
const name = sample.round!.balls[sample.round!.targetIds[0]].name;

/** A snapshot of the sample round at a given state and time. */
const at = (state: GameState, elapsedMs: number, extra: Partial<Session> = {}) => ({
  state,
  elapsedMs,
  durationMs: null,
  round: sample.round,
  pickedIds: [],
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
    const target = sample.round!.targetIds[0];
    expect(hudView(at('REVEAL', 0, { pickedIds: [target] }))).toMatchObject({ message: 'Nailed it!', icon: '🎯' });
    expect(hudView(at('REVEAL', 0, { pickedIds: [wrongId(sample)] }))).toMatchObject({ message: 'Not quite!', icon: '👀' });
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
    const targetId = session.round!.targetIds[0];
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
