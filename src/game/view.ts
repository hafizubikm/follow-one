// What the HUD, each ball and the result card show, derived from the session. The renderers only
// see these views, never targetIds, so this file is the one place the targets are singled out.
import { config, type Config } from '../config.ts';
import { copy, countdownNumerals, fill } from '../copy.ts';
import { getPack } from '../names/packs.ts';
import type { Ball, Round } from './round.ts';
import { accuracyPercent, isCorrect } from './score.ts';
import { foundTargets, secondsLeft, type Session } from './session.ts';
import type { GameState } from './stateMachine.ts';

type SessionState = Pick<Session, 'state' | 'elapsedMs' | 'durationMs' | 'round' | 'pickedIds' | 'selectionLive' | 'stats'>;

export interface HudView {
  /** The one instruction on screen; may contain **bold**. Empty while a card speaks instead. */
  readonly message: string;
  /** Emoji shown before the message, hidden from screen readers. */
  readonly icon: string;
  /** Seconds left, for assistive technology (the arena shows them to the eye); null outside tracking. */
  readonly timer: number | null;
}

/** The arena's watermark numeral (SPEC §5). */
export interface CountdownView {
  /** 3, 2, 1, GO!, the seconds left or 0; '' when there is none. */
  readonly text: string;
  /** 3·2·1 and GO! show strongly; the tracking seconds and the freeze's 0 faintly. */
  readonly strong: boolean;
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
  /** The cursor hides over the arena while the balls move (SPEC §12). */
  readonly hideCursor: boolean;
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

/** Names show only in a round with one target; several are followed as a group (SPEC §1, §5). */
const soleTarget = (round: Round): Ball | null => (round.targetIds.length === 1 ? round.balls[round.targetIds[0]] : null);

/** The HUD lines that speak of the targets: by name for one, by count for several (SPEC §3). */
function targetLines(s: SessionState): { intro: string; tracking: string; selection: string } {
  const { hud } = copy;
  const sole = s.round ? soleTarget(s.round) : null;
  if (!s.round || sole) {
    const name = sole?.name ?? '';
    return { intro: fill(hud.intro, { name }), tracking: fill(hud.tracking, { name }), selection: fill(hud.selection, { name }) };
  }
  const k = s.round.targetIds.length;
  const left = k - s.pickedIds.length;
  return {
    intro: fill(hud.several.intro, { k }),
    tracking: fill(hud.several.tracking, { k }),
    selection: left === k ? fill(hud.several.selection, { k }) : fill(hud.several.picksLeft, { left }),
  };
}

export function hudView(s: SessionState, settings: Config = config): HudView {
  const t = s.elapsedMs;
  const lines = targetLines(s);
  const text = (message: string, icon = ''): HudView => ({ message, icon, timer: null });

  switch (s.state) {
    case 'IDLE':
    case 'RESULT':
      return text('');
    // The countdown runs in the arena; the HUD keeps the intro line up meanwhile.
    case 'TARGET_INTRO':
    case 'COUNTDOWN':
      return text(lines.intro);
    case 'TRACKING': {
      const left = s.round ? secondsLeft(t, s.round) : 0;
      const message = left <= settings.finalWarningS ? copy.hud.finalWarning : lines.tracking;
      return { ...text(message), timer: left };
    }
    case 'TRACKING_COMPLETE':
      return { ...text(copy.hud.freeze), timer: 0 };
    case 'RETURNING':
      return text(copy.hud.returning);
    case 'SELECTION':
      return text(t < settings.settleMs ? copy.hud.returning : lines.selection);
    case 'CHECKING':
      return text(copy.hud.checking);
    case 'REVEAL': {
      const correct = s.round !== null && isCorrect(foundTargets(s.round, s.pickedIds));
      const verdict = correct ? copy.result.correct : copy.result.incorrect;
      return text(verdict.headline, verdict.icon);
    }
  }
}

export function countdownView(s: SessionState, settings: Config = config): CountdownView {
  const t = s.elapsedMs;
  switch (s.state) {
    case 'COUNTDOWN': {
      const beat = Math.min(Math.floor(t / settings.countdownStepMs), countdownNumerals.length - 1);
      return { text: countdownNumerals[beat], strong: true };
    }
    case 'TRACKING':
      if (t < settings.goMs) return { text: copy.countdown.go, strong: true };
      return { text: String(s.round ? secondsLeft(t, s.round) : 0), strong: false };
    case 'TRACKING_COMPLETE':
      return { text: '0', strong: false };
    default:
      return { text: '', strong: false };
  }
}

/** The targets' highlight (SPEC §2.1): full through the intro, countdown and revealHoldMs, then a linear fade. */
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
  const isTarget = round.targetIds.includes(ball.id);
  const isPick = s.pickedIds.includes(ball.id);
  const sole = soleTarget(round);
  const label = sole ? ball.name : '';
  if (isTarget && highlight > 0) return { look: 'target', strength: highlight, glyph: copy.glyphs.target, label };
  // A pick is outlined from the moment it is made, the same whether it is right or wrong (SPEC §2.7).
  if ((s.state === 'SELECTION' || s.state === 'CHECKING') && isPick) return { look: 'picked', strength: 1, glyph: '', label: '' };
  if (s.state === 'REVEAL' || s.state === 'RESULT') {
    if (isTarget && isPick) return { look: 'revealed-correct', strength: 1, glyph: copy.glyphs.correct, label };
    if (isTarget) return { look: 'revealed-target', strength: 1, glyph: copy.glyphs.target, label };
    if (isPick) {
      const count = round.balls.length;
      const gap = Math.abs((ball.slot ?? 0) - (sole?.slot ?? 0));
      const near = sole !== null && Math.min(gap, count - gap) / count <= NEIGHBOUR_ARC;
      return { look: 'revealed-wrong-pick', strength: 1, glyph: copy.glyphs.wrong, label, labelDepth: near ? 1 : 0 };
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
    const name = s.pickedIds.includes(ball.id) ? copy.ballPicked : copy.ball;
    const ariaLabel = input !== 'off' && ball.slot !== null ? fill(name, { slot: ball.slot }) : '';
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
    hideCursor: s.state === 'TRACKING',
  };
}

/** The result card (SPEC §3), from REVEAL on. */
export function resultView(s: SessionState): ResultView | null {
  const round = s.round;
  if (!round || s.pickedIds.length === 0 || (s.state !== 'REVEAL' && s.state !== 'RESULT')) return null;
  const answer = foundTargets(round, s.pickedIds);
  const stats = s.stats;
  const totals: Totals = [stats.round, stats.score, accuracyPercent(stats), stats.streak, stats.bestStreak];
  const target = soleTarget(round);
  if (!target) return cardView(isCorrect(answer), { found: answer.found, k: answer.targets }, totals, true);
  const picked = round.balls[s.pickedIds[0]];
  return cardView(
    isCorrect(answer),
    { name: target.name, picked: picked.name, pickedSlot: picked.slot ?? '', targetSlot: target.slot ?? '' },
    totals,
  );
}

// Totals a long session could reach, so the longest card holds numbers as wide as real ones.
const LARGE_TOTALS = [999, 99_999, 100, 99, 99] as const;

/**
 * The result card at its longest, which the arena leaves room for (SPEC §4): a one-target miss in the highest
 * slots with large totals, once per name with that name in both places. No real miss is wider than the widest of
 * these (the several-target sub-lines are shorter), and which name renders widest depends on the font, so the
 * sizer stacks them all.
 */
export function longestResultViews(settings: Config = config): ResultView[] {
  const slot = settings.ballCountMax;
  return getPack(settings.namePackId).names.map((name) =>
    cardView(false, { name, picked: name, pickedSlot: slot, targetSlot: slot - 1 }, LARGE_TOTALS),
  );
}

type Totals = readonly [round: number, score: number, accuracy: number, streak: number, best: number];

/** `fills`: the sub-line's names and slots, or with `several` targets its counts. */
function cardView(
  correct: boolean,
  fills: Readonly<Record<string, string | number>>,
  totals: Totals,
  several = false,
): ResultView {
  const verdict = correct ? copy.result.correct : copy.result.incorrect;
  const labels = copy.stats;
  const [round, score, accuracy, streak, best] = totals;
  return {
    correct,
    icon: verdict.icon,
    headline: verdict.headline,
    subline: fill(several ? verdict.sublineSeveral : verdict.subline, fills),
    stats: [
      { label: labels.round, icon: '', value: String(round) },
      { label: labels.score, icon: '', value: String(score) },
      { label: labels.accuracy, icon: '', value: fill(labels.accuracyValue, { percent: accuracy }) },
      { label: labels.streak, icon: labels.streakIcon, value: String(streak) },
      { label: labels.best, icon: labels.streakIcon, value: String(best) },
    ],
  };
}
