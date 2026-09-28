// What the HUD, each ball and the result card show, derived from the session. The renderers only
// see these views, never targetId, so this file is the one place the target is singled out.
import { config, type Config } from '../config.ts';
import { copy, countdownNumerals, fill } from '../copy.ts';
import type { Ball, Round } from './round.ts';
import { accuracyPercent } from './score.ts';
import { secondsLeft, type Session } from './session.ts';
import type { GameState } from './stateMachine.ts';

type SessionState = Pick<Session, 'state' | 'elapsedMs' | 'durationMs' | 'round' | 'pickedId' | 'selectionLive' | 'stats'>;

export interface HudView {
  /** The one instruction on screen; may contain **bold**. Empty while a card speaks instead. */
  readonly message: string;
  /** Emoji shown before the message, hidden from screen readers. */
  readonly icon: string;
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
  /** Balls are on the ring (slots assigned): names then go toward the center. Same for every ball. */
  readonly ring: boolean;
  /** 1 steps a name one row further in, clear of a neighbouring name; 0 otherwise. */
  readonly labelDepth: number;
  /** Accessible name while the ring is reachable, else ''. */
  readonly ariaLabel: string;
}

/** off: inert. live: pickable. locked: picked, still focusable but disabled (SPEC §8). */
export type InputMode = 'off' | 'live' | 'locked';

export interface ArenaView {
  /** Indexed by ball id. */
  readonly balls: readonly BallView[];
  /** The round's ball radius and ring radius, in arena units. */
  readonly ballRadius: number;
  readonly ringRadius: number;
  /** Ball ids in DOM order: slot order once slots exist, so tab order is slot order. */
  readonly order: readonly number[];
  /** Opacity of the ring's slot numbers. */
  readonly slotNumbers: number;
  readonly input: InputMode;
}

export interface ResultStat {
  readonly label: string;
  readonly icon: string;
  readonly value: string;
}

export interface ResultView {
  readonly correct: boolean;
  readonly icon: string;
  readonly headline: string;
  readonly subline: string;
  readonly stats: readonly ResultStat[];
}

export function neutralBall(x: number, y: number, ring = false, ariaLabel = ''): BallView {
  return { x, y, look: null, strength: 0, glyph: '', label: '', ring, labelDepth: 0, ariaLabel };
}

const targetName = (round: Round | null) => (round ? round.balls[round.targetId].name : '');

export function hudView(s: SessionState, settings: Config = config): HudView {
  const t = s.elapsedMs;
  const name = targetName(s.round);
  const text = (message: string, icon = ''): HudView => ({ message, icon, big: false, timer: null, urgent: false });

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
      if (t < settings.goMs) return { ...text(copy.hud.go), big: true, timer: left, urgent };
      return { ...text(urgent ? copy.hud.finalWarning : fill(copy.hud.tracking, { name })), timer: left, urgent };
    }
    case 'TRACKING_COMPLETE':
      return { ...text(copy.hud.freeze), timer: 0 };
    case 'RETURNING':
      return text(copy.hud.returning);
    case 'SELECTION':
      return text(t < settings.settleMs ? copy.hud.returning : fill(copy.hud.selection, { name }));
    case 'CHECKING':
      return text(copy.hud.checking);
    case 'REVEAL': {
      const verdict = s.pickedId === s.round?.targetId ? copy.result.correct : copy.result.incorrect;
      return text(verdict.headline, verdict.icon);
    }
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

type Look = Pick<BallView, 'look' | 'strength' | 'glyph' | 'label'> & { labelDepth?: number };

// A wrong pick within this share of the ring from the target (3 slots of 15) would put the two
// names on top of each other.
const NEIGHBOUR_ARC = 1 / 5;

function lookOf(ball: Ball, s: SessionState, highlight: number): Look | null {
  const round = s.round;
  if (!round) return null;
  const isTarget = ball.id === round.targetId;
  const isPick = ball.id === s.pickedId;
  if (isTarget && highlight > 0) return { look: 'target', strength: highlight, glyph: copy.glyphs.target, label: ball.name };
  if (s.state === 'CHECKING' && isPick) return { look: 'picked', strength: 1, glyph: '', label: '' };
  if (s.state === 'REVEAL' || s.state === 'RESULT') {
    const correct = s.pickedId === round.targetId;
    if (isTarget && correct) return { look: 'revealed-correct', strength: 1, glyph: copy.glyphs.correct, label: ball.name };
    if (isTarget) return { look: 'revealed-target', strength: 1, glyph: copy.glyphs.target, label: ball.name };
    if (isPick) {
      const target = round.balls[round.targetId];
      const count = round.balls.length;
      const gap = Math.abs((ball.slot ?? 0) - (target.slot ?? 0));
      const near = Math.min(gap, count - gap) / count <= NEIGHBOUR_ARC;
      return { look: 'revealed-wrong-pick', strength: 1, glyph: copy.glyphs.wrong, label: ball.name, labelDepth: near ? 1 : 0 };
    }
  }
  return null;
}

export function inputMode(s: SessionState): InputMode {
  if (s.selectionLive) return 'live';
  return s.state === 'CHECKING' || s.state === 'REVEAL' ? 'locked' : 'off';
}

/** Slot numbers fade in over the end of the glide and stay until the next round (SPEC §5, §7). */
export function slotNumberOpacity(s: SessionState, settings: Config = config): number {
  if (s.state === 'RETURNING') {
    const progress = s.durationMs ? s.elapsedMs / s.durationMs : 1;
    const fade = (progress - settings.slotLabelFadeFrom) / (1 - settings.slotLabelFadeFrom);
    return Math.min(Math.max(fade, 0), 1);
  }
  return ['SELECTION', 'CHECKING', 'REVEAL', 'RESULT'].includes(s.state) ? 1 : 0;
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
  const input = inputMode(s);

  const slotted = round.balls.every((ball) => ball.slot !== null);
  const balls = round.balls.map((ball, i): BallView => {
    const { x, y } = positions[i];
    const ariaLabel = input !== 'off' && ball.slot !== null ? fill(copy.ball, { slot: ball.slot }) : '';
    const look = lookOf(ball, s, highlight);
    if (!look) return neutralBall(x, y, slotted, ariaLabel);
    return { x, y, labelDepth: 0, ...look, ring: slotted, ariaLabel };
  });
  const order = round.balls
    .slice()
    .sort((a, b) => (slotted ? (a.slot ?? 0) - (b.slot ?? 0) : a.id - b.id))
    .map((ball) => ball.id);

  return {
    balls,
    ballRadius: round.ballRadius,
    ringRadius: round.ringRadius,
    order,
    slotNumbers: slotNumberOpacity(s, settings),
    input,
  };
}

/** The result card (SPEC §3), from REVEAL on. */
export function resultView(s: SessionState): ResultView | null {
  const round = s.round;
  if (!round || s.pickedId === null || (s.state !== 'REVEAL' && s.state !== 'RESULT')) return null;
  const target = round.balls[round.targetId];
  const picked = round.balls[s.pickedId];
  const correct = picked.id === target.id;
  const verdict = correct ? copy.result.correct : copy.result.incorrect;
  const labels = copy.stats;
  const stats = s.stats;

  return {
    correct,
    icon: verdict.icon,
    headline: verdict.headline,
    subline: fill(verdict.subline, {
      name: target.name,
      picked: picked.name,
      pickedSlot: picked.slot ?? '',
      targetSlot: target.slot ?? '',
    }),
    stats: [
      { label: labels.round, icon: '', value: String(stats.round) },
      { label: labels.score, icon: '', value: String(stats.score) },
      { label: labels.accuracy, icon: '', value: fill(labels.accuracyValue, { percent: accuracyPercent(stats) }) },
      { label: labels.streak, icon: labels.streakIcon, value: String(stats.streak) },
      { label: labels.best, icon: labels.streakIcon, value: String(stats.bestStreak) },
    ],
  };
}
