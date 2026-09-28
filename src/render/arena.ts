import { config } from '../config.ts';
import { el } from './dom.ts';

export interface Arena {
  readonly el: HTMLElement;
}

export function createArena(): Arena {
  const arena = el('div', 'arena');
  arena.style.setProperty('--ball-r', String(config.ballRadius));
  return { el: arena };
}
