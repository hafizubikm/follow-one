import type { Arena } from '../render/arena.ts';

export interface SelectionHandlers {
  /** Whether a pick counts right now: SELECTION only, first activation only (SPEC §8). */
  canPick(): boolean;
  pick(id: number): void;
}

const ringSteps: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Clicks, taps and Enter/Space on a ball (native button activation) become a pick; every other
 * state ignores them. Arrow keys, Home and End move focus around the ring, which is in slot order in the DOM.
 */
export function wireSelection(arena: Arena, handlers: SelectionHandlers): void {
  arena.el.addEventListener('click', (event) => {
    const hit = arena.ballAt(event.target);
    if (hit === null || !handlers.canPick()) return;
    // A pointer click (detail > 0) goes to the nearest ball, so overlapping hit areas on a small
    // arena resolve by distance rather than by stacking order; Enter/Space keep the focused ball.
    const id = event.detail > 0 ? (arena.nearestBall(event.clientX, event.clientY) ?? hit) : hit;
    handlers.pick(id);
  });

  arena.el.addEventListener('keydown', (event) => {
    const current = event.target instanceof Element ? event.target.closest('.ball') : null;
    if (!current) return;
    const buttons = [...arena.el.querySelectorAll<HTMLButtonElement>('.ball')];
    const count = buttons.length;
    let index = buttons.indexOf(current as HTMLButtonElement);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = count - 1;
    else if (event.key in ringSteps) index = (index + ringSteps[event.key] + count) % count;
    else return;
    event.preventDefault();
    buttons[index].focus();
  });
}
