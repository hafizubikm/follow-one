import { config } from '../config.ts';
import { el } from './dom.ts';

/** Where to draw one ball, in arena units (center 0,0, radius 1, y down). */
export interface BallFrame {
  readonly x: number;
  readonly y: number;
}

export interface Arena {
  readonly el: HTMLElement;
  /** Draws the balls (index = ball id), or clears the arena when given null. */
  render(balls: readonly BallFrame[] | null): void;
}

interface BallElement {
  readonly el: HTMLButtonElement;
  move(px: number, py: number): void;
}

// Only this module turns arena units into pixels; everything upstream stays resolution-free (SPEC §4).
export function createArena(count: number = config.ballCount): Arena {
  const arena = el('div', 'arena');
  arena.style.setProperty('--ball-r', String(config.ballRadius));
  arena.style.setProperty('--hit-min', `${config.minHitPx}px`);
  // Balls are buttons from the start (SPEC §5) but stay out of reach until selection.
  arena.inert = true;

  const layer = el('div', 'balls');
  layer.hidden = true;
  const balls = Array.from({ length: count }, createBall);
  layer.append(...balls.map((ball) => ball.el));
  arena.append(layer);

  // Resizing or rotating mid-round just changes this scale; the next frame redraws at the new size.
  let radiusPx = 0;
  new ResizeObserver(([entry]) => {
    radiusPx = entry.contentRect.width / 2;
  }).observe(arena);

  return {
    el: arena,
    render(frames) {
      layer.hidden = frames === null;
      if (!frames) return;
      if (!radiusPx) radiusPx = arena.clientWidth / 2;
      frames.forEach((frame, i) => balls[i].move(frame.x * radiusPx, frame.y * radiusPx));
    },
  };
}

function createBall(): BallElement {
  const button = el('button', 'ball');
  button.type = 'button';
  button.tabIndex = -1;
  button.append(el('span', 'ball-body'));

  let transform = '';
  return {
    el: button,
    move(px, py) {
      const next = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`;
      if (next === transform) return;
      transform = next;
      button.style.transform = next;
    },
  };
}
