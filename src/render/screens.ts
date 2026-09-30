import { copy, fill, targetCountText } from '../copy.ts';
import type { ResultView } from '../game/view.ts';
import type { Settings } from '../settings/settings.ts';
import { el, icon } from './dom.ts';

/** Which panel the page shows; CSS keys layout off `data-screen` on the app root. */
export type Screen = 'start' | 'play' | 'result';

export function setScreen(root: HTMLElement, screen: Screen): void {
  if (root.dataset.screen !== screen) root.dataset.screen = screen;
}

type MetaSettings = Pick<Settings, 'ballCount' | 'targetCount' | 'trackingMs'>;

export interface StartScreen {
  readonly el: HTMLElement;
  /** The meta line follows the ball-count, target-count and duration settings; the tagline and the help sentence the target count. */
  setMeta(settings: MetaSettings): void;
}

export function createStartScreen(onStart: () => void, settings: MetaSettings): StartScreen {
  const screen = el('section', 'start-screen');
  const slot = el('div', 'start-slot');
  const card = el('div', 'start-card');

  const button = el('button', 'button-primary', copy.start.button);
  button.type = 'button';
  button.addEventListener('click', onStart);

  const tagline = el('p', 'start-tagline');
  const meta = el('p', 'start-meta');
  const help = el('p', 'start-help');
  const setMeta = ({ ballCount, targetCount, trackingMs }: MetaSettings) => {
    meta.textContent = fill(copy.start.meta, {
      n: ballCount,
      seconds: trackingMs / 1000,
      targets: targetCountText(targetCount),
    });
    const several = targetCount > 1;
    tagline.textContent = several ? fill(copy.start.taglineSeveral, { k: targetCount }) : copy.start.tagline;
    help.textContent = several ? fill(copy.start.helpSeveral, { k: targetCount }) : copy.start.help;
  };
  setMeta(settings);

  card.append(
    el('h1', 'start-title', copy.title),
    tagline,
    meta,
    button,
    help,
  );
  slot.append(card);
  screen.append(slot);
  return { el: screen, setMeta };
}

export interface StripStats {
  readonly round: number;
  readonly score: number;
  readonly streak: number;
}

export interface StatsStrip {
  readonly el: HTMLElement;
  update(stats: StripStats): void;
}

export function createStatsStrip(): StatsStrip {
  const strip = el('dl', 'stats');
  const round = stat(strip, copy.stats.round);
  const score = stat(strip, copy.stats.score);
  const streak = stat(strip, copy.stats.streak, copy.stats.streakIcon);

  const show = (node: HTMLElement, value: number) => {
    const text = String(value);
    if (node.textContent !== text) node.textContent = text;
  };
  const update = (stats: StripStats) => {
    show(round, stats.round);
    show(score, stats.score);
    show(streak, stats.streak);
  };
  update({ round: 0, score: 0, streak: 0 });
  return { el: strip, update };
}

export interface ResultCard {
  readonly el: HTMLElement;
  /**
   * A hidden copy of the card at its longest, laid out at the card's width in every state: its height is the
   * room the arena leaves for the card (SPEC §4).
   */
  readonly sizer: HTMLElement;
  show(view: ResultView): void;
  /** Focuses Play Again without scrolling; the caller decides how to bring the card into view. */
  focus(): void;
}

/** `longest`: the longest results (game/view.ts); the sizer stacks their sub-lines in one cell. */
export function createResultCard(onPlayAgain: () => void, longest: readonly ResultView[]): ResultCard {
  const card = resultCardParts();
  card.el.setAttribute('aria-labelledby', 'result-headline');
  card.headline.id = 'result-headline';
  card.subline.id = 'result-subline';
  // Focus lands here on entry, so screen readers hear the verdict's detail with the button.
  card.button.setAttribute('aria-describedby', 'result-subline');
  card.button.addEventListener('click', onPlayAgain);

  const sizer = resultCardParts();
  sizer.el.classList.add('result-sizer');
  sizer.el.setAttribute('aria-hidden', 'true');
  sizer.el.inert = true;
  sizer.show(longest[0]);
  sizer.subline.replaceChildren(...longest.map((view) => el('span', '', view.subline)));

  return {
    el: card.el,
    sizer: sizer.el,
    show: card.show,
    focus() {
      card.button.focus({ preventScroll: true });
    },
  };
}

function resultCardParts() {
  const card = el('section', 'result-card');
  const headline = el('h2', 'result-headline');
  const subline = el('p', 'result-subline');
  const stats = el('dl', 'result-stats');
  const button = el('button', 'button-primary result-action', copy.result.playAgain);
  button.type = 'button';
  card.append(headline, subline, stats, button);
  return {
    el: card,
    headline,
    subline,
    button,
    show(view: ResultView) {
      card.dataset.verdict = view.correct ? 'correct' : 'incorrect';
      headline.replaceChildren(icon(view.icon), view.headline);
      subline.textContent = view.subline;
      stats.replaceChildren();
      for (const item of view.stats) stat(stats, item.label, item.icon).textContent = item.value;
    },
  };
}

function stat(strip: HTMLElement, label: string, glyph = ''): HTMLElement {
  const item = el('div', 'stat');
  const term = el('dt', '', label);
  if (glyph) term.append(icon(glyph));
  const value = el('dd');
  item.append(term, value);
  strip.append(item);
  return value;
}
