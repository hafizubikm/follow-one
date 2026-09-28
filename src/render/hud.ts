import { textRuns } from '../copy.ts';
import type { HudView } from '../game/view.ts';
import { el } from './dom.ts';

export interface Hud {
  readonly el: HTMLElement;
  render(view: HudView): void;
}

export function createHud(reducedMotion: () => boolean): Hud {
  const hud = el('section', 'hud');
  const message = el('p', 'hud-message');
  message.setAttribute('aria-live', 'polite');
  // role=timer is implicitly aria-live=off, so per-second ticks aren't announced.
  const timer = el('p', 'hud-timer');
  timer.setAttribute('role', 'timer');
  hud.append(message, timer);

  let shownMessage = '';
  let shownTimer: number | null = null;

  const pop = (node: HTMLElement, keyframes: Keyframe[], duration: number) => {
    if (!reducedMotion()) node.animate(keyframes, { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  };

  return {
    el: hud,
    // Writes only on change: every write to the live region is announced.
    render(view) {
      if (view.message !== shownMessage) {
        shownMessage = view.message;
        message.replaceChildren(...textRuns(view.message).map((run) => (run.strong ? el('strong', '', run.text) : run.text)));
        message.toggleAttribute('data-big', view.big);
        // Decorative: countdown numerals scale in (SPEC §10 removes this under reduced motion).
        if (view.big) pop(message, [{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320);
      }
      if (view.timer !== shownTimer) {
        shownTimer = view.timer;
        timer.textContent = view.timer === null ? '' : String(view.timer);
        timer.toggleAttribute('data-urgent', view.urgent);
        // Decorative: the timer pulses on each of the last seconds.
        if (view.urgent && view.timer) pop(timer, [{ transform: 'scale(1.2)' }, { transform: 'none' }], 300);
      }
    },
  };
}
