import { el } from './dom.ts';

export interface Arena {
  readonly el: HTMLElement;
}

export function createArena(): Arena {
  return { el: el('div', 'arena') };
}
