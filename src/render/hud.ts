import { el } from './dom.ts';

export interface Hud {
  readonly el: HTMLElement;
}

export function createHud(): Hud {
  const hud = el('section', 'hud');
  const message = el('p', 'hud-message');
  message.setAttribute('aria-live', 'polite');
  // role=timer is implicitly aria-live=off, so per-second ticks aren't announced.
  const timer = el('p', 'hud-timer');
  timer.setAttribute('role', 'timer');
  hud.append(message, timer);
  return { el: hud };
}
