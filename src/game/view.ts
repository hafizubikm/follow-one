// What the HUD and each ball show, derived from the session. The renderers only ever see these
// views, never targetId, so this file is the one place the target can be singled out before REVEAL.
import { config, type Config } from '../config.ts';
import { copy, countdownNumerals, fill } from '../copy.ts';
import type { Session } from './session.ts';
import { secondsLeft } from './session.ts';
import type { GameState } from './stateMachine.ts';

type SessionState = Pick<Session, 'state' | 'elapsedMs' | 'round'>;

export interface HudView {
  /** The one instruction on screen; may contain **bold**. Empty while a card speaks instead. */
  readonly message: string;
  /** Countdown numerals and GO! are shown large. */
  readonly big: boolean;
  /** Seconds on the timer, or null when it is hidden. */
  readonly timer: number | null;
  /** The last finalWarningS seconds of tracking. */
  readonly urgent: boolean;
}

export type BallLook = 'target' | 'picked' | 'revealed-correct' | 'revealed-target' | 'revealed-wrong-pick';

export interface BallView {
  readonly x: number;
  readonly y: number;
  /** null = neutral, indistinguishable from every other neutral ball. */
  readonly look: BallLook | null;
  /** How strongly the look shows, 0..1; only the target's reveal-window fade goes below 1. */
  readonly strength: number;
  readonly glyph: string;
  readonly label: string;
}

export interface ArenaView {
  readonly balls: readonly BallView[];
}

export function neutralBall(x: number, y: number): BallView {
  return { x, y, look: null, strength: 0, glyph: '', label: '' };
}

export function hudView(s: SessionState, settings: Config = config): HudView {
  const t = s.elapsedMs;
  const name = s.round ? s.round.balls[s.round.targetId].name : '';
  const text = (message: string): HudView => ({ message, big: false, timer: null, urgent: false });

  switch (s.state) {
    case 'IDLE':
    case 'RESULT':
      return text('');
    case 'TARGET_INTRO':
      return text(fill(copy.hud.intro, { name }));
    case 'COUNTDOWN': {
      const beat = Math.min(Math.floor(t / settings.countdownStepMs), countdownNumerals.length - 1);
      return { ...text(countdownNumerals[beat]), big: true };
    }
    case 'TRACKING': {
      const left = secondsLeft(t, settings);
      const urgent = left <= settings.finalWarningS;
      if (t < settings.goMs) return { message: copy.hud.go, big: true, timer: left, urgent };
      return { message: urgent ? copy.hud.finalWarning : fill(copy.hud.tracking, { name }), big: false, timer: left, urgent };
    }
    case 'TRACKING_COMPLETE':
      return { ...text(copy.hud.freeze), timer: 0 };
    case 'RETURNING':
      return text(copy.hud.returning);
    case 'SELECTION':
      return text(t < settings.settleMs ? copy.hud.returning : fill(copy.hud.selection, { name }));
    case 'CHECKING':
    case 'REVEAL':
      return text(copy.hud.checking);
  }
}

/** The target's highlight (SPEC §2.1): full through the intro, countdown and revealHoldMs, then a linear fade. */
export function targetHighlight(state: GameState, elapsedMs: number, settings: Config = config): number {
  if (state === 'TARGET_INTRO' || state === 'COUNTDOWN') return 1;
  if (state !== 'TRACKING') return 0;
  const intoFade = elapsedMs - settings.revealHoldMs;
  if (intoFade < 0) return 1;
  if (intoFade >= settings.revealFadeMs) return 0;
  return 1 - intoFade / settings.revealFadeMs;
}

export function arenaView(
  s: SessionState & Pick<Session, 'positions'>,
  alpha: number,
  settings: Config = config,
): ArenaView | null {
  const round = s.round;
  if (!round) return null;
  const positions = s.positions(alpha);
  const highlight = targetHighlight(s.state, s.elapsedMs, settings);

  return {
    balls: round.balls.map((ball, i): BallView => {
      const { x, y } = positions[i];
      if (ball.id === round.targetId && highlight > 0) {
        return { x, y, look: 'target', strength: highlight, glyph: copy.glyphs.target, label: ball.name };
      }
      return neutralBall(x, y);
    }),
  };
}
