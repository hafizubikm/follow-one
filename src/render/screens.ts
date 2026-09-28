import { copy } from '../copy.ts';
import { el, icon } from './dom.ts';

/** Which panel the page shows; CSS keys layout off `data-screen` on the app root. */
export type Screen = 'start' | 'play' | 'result';

export function setScreen(root: HTMLElement, screen: Screen): void {
  root.dataset.screen = screen;
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

  const update = (stats: StripStats) => {
    round.textContent = String(stats.round);
    score.textContent = String(stats.score);
    streak.textContent = String(stats.streak);
  };
  update({ round: 0, score: 0, streak: 0 });
  return { el: strip, update };
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
