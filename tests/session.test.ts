import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { defaultSetup, type RoundSetup } from '../src/game/round.ts';
import { createSession, type Session } from '../src/game/session.ts';
import { assignSlots, slotPosition } from '../src/game/slots.ts';
import { started, steps, toLiveSelection } from './drive.ts';

const positionsOf = (s: Session) => s.round?.balls.map(({ x, y }) => [x, y]);

describe('session: into the round', () => {
  it('starts idle, then Start Game builds round 1', () => {
    const idle = createSession({ strict: true, reducedMotion: () => false, onEvent: () => {} });
    expect(idle.state).toBe('IDLE');
    expect(idle.round).toBeNull();
    expect(idle.stats.round).toBe(0);

    const { session } = started();
    expect(session.state).toBe('TARGET_INTRO');
    expect(session.round?.balls).toHaveLength(config.ballCount);
    expect(session.stats.round).toBe(1);
  });

  it('ignores Start Game and Play Again at the wrong time', () => {
    const { session } = started();
    const round = session.round;
    expect(session.start()).toBe(false);
    expect(session.playAgain()).toBe(false);
    expect(session.round).toBe(round);
    expect(session.stats.round).toBe(1);
  });

  it('keeps the balls still through the intro and countdown', () => {
    const { session, runUntil } = started();
    const spawn = positionsOf(session);
    runUntil('COUNTDOWN');
    expect(positionsOf(session)).toEqual(spawn);
    runUntil('TRACKING');
    expect(positionsOf(session)).toEqual(spawn);
  });

  it('moves the balls for exactly trackingMs, then freezes them for freezeMs', () => {
    const { session, run, runUntil } = started();
    runUntil('TRACKING');
    const start = positionsOf(session);
    let trackingSteps = 0;
    while (session.state === 'TRACKING') {
      run(1);
      trackingSteps++;
    }
    expect(trackingSteps).toBe(steps(config.trackingMs));
    expect(session.state).toBe('TRACKING_COMPLETE');
    const frozen = positionsOf(session);
    expect(frozen).not.toEqual(start);
    run(steps(config.freezeMs) - 1);
    expect(session.state).toBe('TRACKING_COMPLETE');
    expect(positionsOf(session)).toEqual(frozen);
    run(1);
    expect(session.state).toBe('RETURNING');
  });

  it('cues the countdown beats, GO, the final seconds and the freeze on the simulation clock', () => {
    const { events: all, runUntil, clock } = started();
    runUntil('TRACKING_COMPLETE');
    const events = all.filter(({ event }) => event.type !== 'collision'); // checked separately below
    const introEnd = steps(config.introMs);
    const countdownEnd = introEnd + steps(config.countdownFrom * config.countdownStepMs);
    const trackingEnd = countdownEnd + steps(config.trackingMs);
    expect(clock()).toBe(trackingEnd);

    const beat = steps(config.countdownStepMs);
    const warnFrom = config.trackingMs / 1000 - config.finalWarningS;
    expect(events).toEqual([
      { at: 0, event: { type: 'enter', state: 'TARGET_INTRO' } },
      { at: introEnd, event: { type: 'enter', state: 'COUNTDOWN' } },
      { at: introEnd, event: { type: 'countdown', value: 3 } },
      { at: introEnd + beat, event: { type: 'countdown', value: 2 } },
      { at: introEnd + 2 * beat, event: { type: 'countdown', value: 1 } },
      { at: countdownEnd, event: { type: 'enter', state: 'TRACKING' } },
      ...[5, 4, 3, 2, 1].map((left, i) => ({
        at: countdownEnd + steps((warnFrom + i) * 1000),
        event: { type: 'finalTick', secondsLeft: left },
      })),
      { at: trackingEnd, event: { type: 'enter', state: 'TRACKING_COMPLETE' } },
    ]);
  });

  it('cues collisions during tracking only', () => {
    const { events, runUntil } = started();
    runUntil('RETURNING');
    const trackingStart = events.find(({ event }) => event.type === 'enter' && event.state === 'TRACKING')!.at;
    const trackingEnd = events.find(({ event }) => event.type === 'enter' && event.state === 'TRACKING_COMPLETE')!.at;
    const hits = events.filter(({ event }) => event.type === 'collision');
    expect(hits.length).toBeGreaterThan(0);
    for (const { at } of hits) {
      expect(at).toBeGreaterThan(trackingStart);
      expect(at).toBeLessThanOrEqual(trackingEnd);
    }
  });

  it('interpolates render positions between the last two steps', () => {
    const { session, run, runUntil } = started();
    runUntil('TRACKING');
    run(10);
    const before = session.positions(0);
    const after = session.positions(1);
    const mid = session.positions(0.5);
    const ball = session.round!.balls[0];
    expect(after[0]).toEqual({ x: ball.x, y: ball.y });
    expect(before[0]).not.toEqual(after[0]);
    expect(mid[0].x).toBeCloseTo((before[0].x + after[0].x) / 2, 12);
    expect(mid[0].y).toBeCloseTo((before[0].y + after[0].y) / 2, 12);
  });
});

describe('session: the ring (SPEC §7)', () => {
  it('assigns slots from the frozen positions and glides every ball onto its slot', () => {
    const { session, run, runUntil } = started();
    runUntil('TRACKING_COMPLETE');
    const frozen = session.round!.balls.map(({ x, y }) => ({ x, y }));
    expect(session.round!.balls.every((b) => b.slot === null)).toBe(true);

    runUntil('RETURNING');
    const expected = assignSlots(frozen);
    expect(session.round!.balls.map((b) => b.slot)).toEqual(expected);

    run(steps(config.returnMs / 2));
    const halfway = session.round!.balls;
    halfway.forEach((ball, i) => {
      const slot = slotPosition(expected[i], config.ballCount, config.slotRadius);
      const total = Math.hypot(slot.x - frozen[i].x, slot.y - frozen[i].y);
      const left = Math.hypot(slot.x - ball.x, slot.y - ball.y);
      if (total > 1e-9) expect(left / total).toBeCloseTo(0.5, 6); // ease-in-out is halfway at t = 0.5
    });

    run(steps(config.returnMs / 2));
    expect(session.state).toBe('SELECTION');
    session.round!.balls.forEach((ball, i) => {
      expect(ball).toMatchObject(slotPosition(expected[i], config.ballCount, config.slotRadius));
    });
  });

  it('shortens the glide under reduced motion', () => {
    const driven = started();
    driven.setReducedMotion(true);
    driven.runUntil('RETURNING');
    let glideSteps = 0;
    while (driven.session.state === 'RETURNING') {
      driven.run(1);
      glideSteps++;
    }
    expect(glideSteps).toBe(steps(config.returnMsReducedMotion));
  });
});

describe('session: settings per round (SPEC §2.6, §16)', () => {
  it('builds each round from the setup read as it starts, and keeps it to the end', () => {
    let setup: RoundSetup = { ...defaultSetup, ballCount: 12 };
    const driven = started(config, () => setup);
    const { session } = driven;
    const first = session.round!;
    expect(first.balls).toHaveLength(12);

    setup = { ballCount: 30, speedFactor: 1.6, trackingMs: 40_000 }; // changed mid-round
    toLiveSelection(driven);
    expect(session.round).toBe(first);
    expect(first.balls).toHaveLength(12);
    expect(first.speedFactor).toBe(1);
    session.pick(first.targetId);
    driven.runUntil('RESULT');

    session.playAgain();
    expect(session.round!.balls).toHaveLength(30);
    expect(session.round!.speedFactor).toBe(1.6);
  });

  it('moves the balls for the round’s duration, with the final ticks in its last seconds', () => {
    let setup: RoundSetup = { ...defaultSetup, trackingMs: 30_000 };
    const driven = started(config, () => setup);
    driven.runUntil('TRACKING');
    setup = { ...defaultSetup, trackingMs: 10_000 }; // changed mid-round: no effect on this one
    const trackingStart = driven.clock();
    driven.runUntil('TRACKING_COMPLETE');
    expect(driven.clock() - trackingStart).toBe(steps(30_000));
    const ticks = driven.events.filter(({ event }) => event.type === 'finalTick');
    expect(ticks.map(({ event }) => (event.type === 'finalTick' ? event.secondsLeft : 0))).toEqual([5, 4, 3, 2, 1]);
    expect(ticks[0].at - trackingStart).toBe(steps(25_000));

    driven.runUntil('SELECTION');
    driven.run(steps(config.settleMs));
    driven.session.pick(0);
    driven.runUntil('RESULT');
    driven.session.playAgain();
    driven.runUntil('TRACKING');
    const next = driven.clock();
    driven.runUntil('TRACKING_COMPLETE');
    expect(driven.clock() - next).toBe(steps(10_000));
  });

  it('runs the balls at the round speed', () => {
    for (const speedFactor of [config.speedPresets.slow, config.speedPresets.extreme]) {
      const driven = started(config, () => ({ ...defaultSetup, ballCount: 20, speedFactor }));
      driven.runUntil('TRACKING');
      const speed = speedFactor * config.baseSpeed;
      let total = 0;
      let samples = 0;
      for (let i = 0; i < 600; i++) {
        driven.run(1);
        for (const ball of driven.session.round!.balls) {
          const v = Math.hypot(ball.vx, ball.vy);
          expect(v).toBeGreaterThanOrEqual(config.speedBand[0] * speed - 1e-9);
          expect(v).toBeLessThanOrEqual(config.speedBand[1] * speed + 1e-9);
          total += v;
          samples++;
        }
      }
      expect(total / samples / speed).toBeCloseTo(1, 1);
    }
  });

  it('glides a 30-ball round onto its own ring', () => {
    const driven = started(config, () => ({ ...defaultSetup, ballCount: 30 }));
    driven.runUntil('SELECTION');
    const round = driven.session.round!;
    expect(round.ringRadius).toBeCloseTo(config.slotRadius + config.ballRadius - round.ballRadius, 12);
    for (const ball of round.balls) expect(ball).toMatchObject(slotPosition(ball.slot!, 30, round.ringRadius));
  });
});
