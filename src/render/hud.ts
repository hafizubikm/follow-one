import { textRuns } from '../copy.ts';
import type { HudView } from '../game/view.ts';
import { el, icon } from './dom.ts';

export interface Hud {
  readonly el: HTMLElement;
  render(view: HudView): void;
}

export function createHud(): Hud {
  const hud = el('section', 'hud');
  const message = el('p', 'hud-message');
  message.setAttribute('aria-live', 'polite');
  // The arena shows the seconds to the eye (SPEC §5); this copy is for assistive technology.
  // role=timer is implicitly aria-live=off, so per-second ticks aren't announced.
  const timer = el('p', 'visually-hidden');
  timer.setAttribute('role', 'timer');
  hud.append(message, timer);

  let shownMessage = '';
  let shownIcon = '';
  let shownTimer: number | null = null;

  return {
    el: hud,
    // Writes only on change: every write to the live region is announced.
    render(view) {
      if (view.message !== shownMessage || view.icon !== shownIcon) {
        shownMessage = view.message;
        shownIcon = view.icon;
        const runs = textRuns(view.message).map((run) => (run.strong ? el('strong', '', run.text) : run.text));
        message.replaceChildren(...(view.icon ? [icon(view.icon)] : []), ...runs);
      }
      if (view.timer !== shownTimer) {
        shownTimer = view.timer;
        timer.textContent = view.timer === null ? '' : String(view.timer);
      }
    },
  };
}
