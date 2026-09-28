import type { CountdownView } from '../game/view.ts';
import { el } from './dom.ts';

export interface ArenaCountdown {
  /** Goes first in the arena, so it draws over the arena's face and under the balls. */
  readonly el: HTMLElement;
  render(view: CountdownView): void;
}

// Decorative crossfade between numerals; reduced motion swaps them instantly (SPEC §5, §10).
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const OUT_MS = 320;
const IN_MS = 380;

/**
 * The large numeral in the middle of the arena (SPEC §5). Two stacked faces take turns, so the old
 * numeral can drift out while the new one settles in. Decorative: the HUD carries the same news.
 */
export function createCountdown(reducedMotion: () => boolean): ArenaCountdown {
  const root = el('div', 'countdown');
  root.setAttribute('aria-hidden', 'true');
  const faces = [el('span', 'countdown-face'), el('span', 'countdown-face')];
  root.append(...faces);

  let front = 0;
  let shown = '';
  let strong = false;

  return {
    el: root,
    render(view) {
      if (view.strong !== strong) {
        strong = view.strong;
        root.toggleAttribute('data-strong', strong);
      }
      if (view.text === shown) return;
      shown = view.text;

      const leaving = faces[front];
      front = 1 - front;
      const entering = faces[front];
      for (const face of faces) for (const animation of face.getAnimations()) animation.cancel();
      entering.textContent = view.text;

      const motion = !reducedMotion();
      if (motion && leaving.textContent) {
        // A newer change cancels this animation before it finishes, so the handler never clears a live face.
        leaving
          .animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.18)' }], {
            duration: OUT_MS,
            easing: EASE,
            fill: 'forwards',
          })
          .addEventListener('finish', () => {
            leaving.textContent = '';
            for (const animation of leaving.getAnimations()) animation.cancel();
          });
      } else {
        leaving.textContent = '';
      }
      if (motion && view.text) {
        entering.animate([{ opacity: 0, transform: 'scale(0.82)' }, { opacity: 1, transform: 'none' }], {
          duration: IN_MS,
          easing: EASE,
        });
      }
    },
  };
}
