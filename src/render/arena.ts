import { config } from '../config.ts';
import type { ArenaView, BallView } from '../game/view.ts';
import { el } from './dom.ts';

export interface Arena {
  readonly el: HTMLElement;
  /** Draws the balls (index = ball id), or clears the arena when given null. */
  render(view: ArenaView | null): void;
}

interface BallElement {
  readonly el: HTMLButtonElement;
  draw(view: BallView, radiusPx: number): void;
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
    render(view) {
      layer.hidden = view === null;
      if (!view) return;
      if (!radiusPx) radiusPx = arena.clientWidth / 2;
      view.balls.forEach((ball, i) => balls[i].draw(ball, radiusPx));
    },
  };
}

// A neutral ball carries no look attribute, no inline variables and empty glyph/label text,
// so once the reveal fade ends the target's element is identical to every other (SPEC §2.1).
// Inline variables live on the button, whose style always keeps the transform: in Chrome, an
// inline style emptied through CSSOM can come back as style="" even after removeAttribute.
function createBall(): BallElement {
  const button = el('button', 'ball');
  button.type = 'button';
  button.tabIndex = -1;
  const body = el('span', 'ball-body');
  const glyph = el('span', 'ball-glyph');
  glyph.setAttribute('aria-hidden', 'true');
  body.append(glyph);
  const label = el('span', 'ball-label');
  label.setAttribute('aria-hidden', 'true');
  button.append(body, label);

  let transform = '';
  let look: string | null = null;
  let strength = '';
  let glyphText = '';
  let labelText = '';
  let shift = '';

  return {
    el: button,
    draw(view, radiusPx) {
      const next = `translate3d(${(view.x * radiusPx).toFixed(2)}px, ${(view.y * radiusPx).toFixed(2)}px, 0)`;
      if (next !== transform) {
        transform = next;
        button.style.transform = next;
      }

      if (view.look !== look) {
        look = view.look;
        if (look) button.dataset.look = look;
        else delete button.dataset.look;
      }

      const nextStrength = view.look ? view.strength.toFixed(3) : '';
      if (nextStrength !== strength) {
        strength = nextStrength;
        setVar(button, '--strength', strength);
      }

      if (view.glyph !== glyphText) {
        glyphText = view.glyph;
        glyph.textContent = glyphText;
      }

      if (view.label !== labelText) {
        // The side is picked when a label appears and kept, so it never jumps while the ball moves.
        if (!labelText && view.label) label.dataset.side = view.y < -0.5 ? 'below' : 'above';
        if (!view.label) delete label.dataset.side;
        labelText = view.label;
        label.textContent = labelText;
      }
      // Anchored further right the further left the ball is (and vice versa), so the label stays inside the arena.
      const nextShift = view.label ? Math.max(-1, Math.min(1, view.x / 0.9)).toFixed(3) : '';
      if (nextShift !== shift) {
        shift = nextShift;
        setVar(button, '--shift', shift);
      }
    },
  };
}

function setVar(node: HTMLElement, name: string, value: string): void {
  if (value) node.style.setProperty(name, value);
  else node.style.removeProperty(name);
}
