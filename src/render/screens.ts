import { copy } from '../copy.ts';
import type { ResultView } from '../game/view.ts';
import { el, icon } from './dom.ts';

/** Which panel the page shows; CSS keys layout off `data-screen` on the app root. */
export type Screen = 'start' | 'play' | 'result';

export function setScreen(root: HTMLElement, screen: Screen): void {
  if (root.dataset.screen !== screen) root.dataset.screen = screen;
}

export function createStartScreen(onStart: () => void): HTMLElement {
  const screen = el('section', 'start-screen');
  const slot = el('div', 'start-slot');
  const card = el('div', 'start-card');

  const button = el('button', 'button-primary', copy.start.button);
  button.type = 'button';
  button.addEventListener('click', onStart);

  card.append(
    el('h1', 'start-title', copy.title),
    el('p', 'start-tagline', copy.start.tagline),
    el('p', 'start-meta', copy.start.meta),
    button,
    el('p', 'start-help', copy.start.help),
  );
  slot.append(card);
  screen.append(slot);
  return screen;
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
  show(view: ResultView): void;
  /** Focuses Play Again without scrolling; the caller decides how to bring the card into view. */
  focus(): void;
}

export function createResultCard(onPlayAgain: () => void): ResultCard {
  const card = el('section', 'result-card');
  card.setAttribute('aria-labelledby', 'result-headline');
  const headline = el('h2', 'result-headline');
  headline.id = 'result-headline';
  const subline = el('p', 'result-subline');
  subline.id = 'result-subline';
  const stats = el('dl', 'result-stats');

  const button = el('button', 'button-primary result-action', copy.result.playAgain);
  button.type = 'button';
  // Focus lands here on entry, so screen readers hear the verdict's detail with the button.
  button.setAttribute('aria-describedby', 'result-subline');
  button.addEventListener('click', onPlayAgain);

  card.append(headline, subline, stats, button);
  return {
    el: card,
    show(view) {
      card.dataset.verdict = view.correct ? 'correct' : 'incorrect';
      headline.replaceChildren(icon(view.icon), ' ', view.headline);
      subline.textContent = view.subline;
      stats.replaceChildren();
      for (const item of view.stats) stat(stats, item.label, item.icon).textContent = item.value;
    },
    focus() {
      button.focus({ preventScroll: true });
    },
  };
}

function stat(strip: HTMLElement, label: string, glyph = ''): HTMLElement {
  const item = el('div', 'stat');
  const term = el('dt', '', label);
  if (glyph) term.append(' ', icon(glyph));
  const value = el('dd');
  item.append(term, value);
  strip.append(item);
  return value;
}
