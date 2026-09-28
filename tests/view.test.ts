import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { copy, fill } from '../src/copy.ts';
import { createSession, type Session } from '../src/game/session.ts';
import type { GameState } from '../src/game/stateMachine.ts';
import { arenaView, hudView, targetHighlight, type BallView } from '../src/game/view.ts';

const stepMs = 1000 / config.physicsHz;
const round = createSession({ strict: true, reducedMotion: () => false, onEvent: () => {} });
round.start();
const name = round.round!.balls[round.round!.targetId].name;
const at = (state: GameState, elapsedMs: number) => ({ state, elapsedMs, round: round.round });

describe('HUD (SPEC §3, §12)', () => {
  it('is empty on the start screen', () => {
    expect(hudView({ state: 'IDLE', elapsedMs: 0, round: null }).message).toBe('');
  });

  it('introduces the target by name, in bold', () => {
    const view = hudView(at('TARGET_INTRO', 0));
    expect(view.message).toBe(`Your target is **${name}**. Keep your eyes on it.`);
    expect(view.timer).toBeNull();
  });

  it('counts down 3, 2, 1 in large numerals, one per countdownStepMs', () => {
    const shown = [0, 999, 1000, 1999, 2000, 2999].map((t) => hudView(at('COUNTDOWN', t)));
    expect(shown.map((v) => v.message)).toEqual(['3', '3', '2', '2', '1', '1']);
    expect(shown.every((v) => v.big && v.timer === null)).toBe(true);
  });

  it('shows GO! for goMs, then the tracking line, then "Stay focused!" for the last seconds', () => {
    expect(hudView(at('TRACKING', 0))).toEqual({ message: 'GO!', big: true, timer: 15, urgent: false });
    expect(hudView(at('TRACKING', config.goMs - stepMs)).message).toBe('GO!');
    expect(hudView(at('TRACKING', config.goMs))).toEqual({
      message: fill(copy.hud.tracking, { name }),
      big: false,
      timer: 15,
      urgent: false,
    });
    expect(hudView(at('TRACKING', 10_000 - stepMs))).toMatchObject({ message: `Keep your eyes on ${name}`, timer: 6 });
    expect(hudView(at('TRACKING', 10_000))).toEqual({ message: 'Stay focused!', big: false, timer: 5, urgent: true });
  });

  it('counts the timer 15 → 1, then shows 0 at the freeze', () => {
    const shown = new Set<number | null>();
    for (let t = 0; t < config.trackingMs; t += stepMs) shown.add(hudView(at('TRACKING', t)).timer);
    expect([...shown]).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(hudView(at('TRACKING_COMPLETE', 0))).toEqual({ message: "Nice! Time's up.", big: false, timer: 0, urgent: false });
    expect(hudView(at('RETURNING', 0)).timer).toBeNull();
  });

  it('keeps "Getting into position..." until input is live, then asks for the target', () => {
    expect(hudView(at('RETURNING', 0)).message).toBe('Getting into position...');
    expect(hudView(at('SELECTION', config.settleMs - stepMs)).message).toBe('Getting into position...');
    expect(hudView(at('SELECTION', config.settleMs)).message).toBe(`Which one was ${name}?`);
    expect(hudView(at('CHECKING', 0)).message).toBe('Checking...');
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

describe('fairness: the target is indistinguishable after the fade (SPEC §2.1)', () => {
  const withoutPosition = ({ x: _x, y: _y, ...rest }: BallView) => rest;

  it('every ball view matches every other, step by step, until the round rests', () => {
    const session: Session = createSession({ strict: true, reducedMotion: () => false, onEvent: () => {} });
    session.start();
    const targetId = session.round!.targetId;
    const fadeEnds = config.revealHoldMs + config.revealFadeMs;
    let checkedSteps = 0;
    let highlightedSteps = 0;

    for (let i = 0; i < 20_000 && session.state !== 'IDLE'; i++) {
      session.step();
      const view = arenaView(session, 0.5)!;
      const target = view.balls[targetId];
      const afterFade =
        (session.state === 'TRACKING' && session.elapsedMs >= fadeEnds) ||
        ['TRACKING_COMPLETE', 'RETURNING', 'SELECTION'].includes(session.state);

      if (afterFade) {
        checkedSteps++;
        for (const ball of view.balls) expect(withoutPosition(ball)).toEqual(withoutPosition(target));
        expect(target.look).toBeNull();
      } else {
        highlightedSteps++;
        expect(target.look).toBe('target');
        expect(target.label).toBe(session.round!.balls[targetId].name);
      }
      if (session.state === 'TRACKING_COMPLETE' && session.elapsedMs > config.freezeMs * 2) break;
    }
    expect(highlightedSteps).toBeGreaterThan(0);
    expect(checkedSteps).toBeGreaterThan((config.trackingMs - fadeEnds) / stepMs);
  });

  it('draws nothing before the first round', () => {
    const idle = createSession({ strict: true, reducedMotion: () => false, onEvent: () => {} });
    expect(arenaView(idle, 0)).toBeNull();
  });
});
