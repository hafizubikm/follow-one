import { config } from '../config.ts';
import { slotPosition } from '../game/slots.ts';
import type { ArenaView, BallView, InputMode } from '../game/view.ts';
import { el } from './dom.ts';

export interface Arena {
  readonly el: HTMLElement;
  /** Draws the balls (index = ball id), or clears the arena when given null. */
  render(view: ArenaView | null): void;
  /** The id of the ball an event landed on, or null. Ids live in this map, never in the DOM. */
  ballAt(target: EventTarget | null): number | null;
}

interface BallElement {
  readonly el: HTMLButtonElement;
  draw(view: BallView, radiusPx: number): void;
}

// Slot numbers sit this far beyond the ball's outer edge, on the side away from the center.
const SLOT_NUMBER_GAP_PX = 10;

// Only this module turns arena units into pixels; everything upstream stays resolution-free (SPEC §4).
export function createArena(count: number = config.ballCount): Arena {
  const arena = el('div', 'arena');
  arena.style.setProperty('--ball-r', String(config.ballRadius));
  arena.style.setProperty('--hit-min', `${config.minHitPx}px`);
  // Balls are buttons from the start (SPEC §5) but stay out of reach until selection.
  arena.inert = true;
  arena.dataset.input = 'off';

  const numbers = el('div', 'slot-numbers');
  numbers.setAttribute('aria-hidden', 'true');
  const numberEls = Array.from({ length: count }, (_, i) => numbers.appendChild(el('span', 'slot-number', String(i + 1))));

  const layer = el('div', 'balls');
  layer.hidden = true;
  const balls = Array.from({ length: count }, createBall);
  const ids = new WeakMap<Element, number>(balls.map((ball, id) => [ball.el, id]));
  layer.append(...balls.map((ball) => ball.el));
  arena.append(numbers, layer);

  // Resizing or rotating mid-round just changes this scale; the next frame redraws at the new size.
  let radiusPx = 0;
  new ResizeObserver(([entry]) => {
    radiusPx = entry.contentRect.width / 2;
  }).observe(arena);

  let order = '';
  let input: InputMode = 'off';
  let numbersRadius = 0;
  let numbersOpacity = '';

  const placeNumbers = () => {
    numbersRadius = radiusPx;
    const along = radiusPx * (config.slotRadius + config.ballRadius) + SLOT_NUMBER_GAP_PX;
    numberEls.forEach((number, i) => {
      const dir = slotPosition(i + 1, count, 1);
      number.style.transform = `translate(-50%, -50%) translate(${(dir.x * along).toFixed(1)}px, ${(dir.y * along).toFixed(1)}px)`;
    });
  };

  const setInput = (next: InputMode) => {
    input = next;
    arena.dataset.input = next;
    arena.inert = next === 'off';
    for (const ball of balls) {
      ball.el.tabIndex = next === 'off' ? -1 : 0;
      if (next === 'locked') ball.el.setAttribute('aria-disabled', 'true');
      else ball.el.removeAttribute('aria-disabled');
    }
  };

  return {
    el: arena,
    render(view) {
      layer.hidden = view === null;
      if (!radiusPx) radiusPx = arena.clientWidth / 2;
      const opacity = view ? String(view.slotNumbers) : '0';
      if (opacity !== numbersOpacity) {
        numbersOpacity = opacity;
        numbers.style.opacity = opacity;
      }
      if (!view) return;

      if (view.slotNumbers > 0 && numbersRadius !== radiusPx) placeNumbers();
      const nextOrder = view.order.join();
      if (nextOrder !== order) {
        order = nextOrder;
        layer.append(...view.order.map((id) => balls[id].el));
      }
      if (view.input !== input) setInput(view.input);
      view.balls.forEach((ball, i) => balls[i].draw(ball, radiusPx));
    },
    ballAt(target) {
      const button = target instanceof Element ? target.closest('.ball') : null;
      return button ? (ids.get(button) ?? null) : null;
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
  let glyphText = '';
  let labelText = '';
  let side = '';
  let ariaLabel = '';
  const vars = new Map<string, string>();
  const setVar = (name: string, value: string) => {
    if ((vars.get(name) ?? '') === value) return;
    vars.set(name, value);
    if (value) button.style.setProperty(name, value);
    else button.style.removeProperty(name);
  };

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

      setVar('--strength', view.look ? view.strength.toFixed(3) : '');

      if (view.glyph !== glyphText) {
        glyphText = view.glyph;
        glyph.textContent = glyphText;
      }

      if (view.label !== labelText) {
        // On the ring a name points at the center. A free ball's name sits above it (below near the
        // top edge); that side is picked when the name appears and kept, so it never jumps mid-motion.
        if (!labelText && view.label) side = view.ring ? 'inward' : view.y < -0.5 ? 'below' : 'above';
        if (!view.label) side = '';
        if (side) label.dataset.side = side;
        else delete label.dataset.side;
        labelText = view.label;
        label.textContent = labelText;
      }
      const free = side === 'above' || side === 'below';
      const toCenter = Math.hypot(view.x, view.y) || 1;
      // A free name's anchor slides right the further left the ball is (and vice versa), keeping it inside the arena.
      setVar('--shift', free ? Math.max(-1, Math.min(1, view.x / 0.9)).toFixed(3) : '');
      setVar('--lx', side === 'inward' ? (-view.x / toCenter).toFixed(3) : '');
      setVar('--ly', side === 'inward' ? (-view.y / toCenter).toFixed(3) : '');
      setVar('--depth', side && view.labelDepth ? String(view.labelDepth) : '');

      if (view.ariaLabel !== ariaLabel) {
        ariaLabel = view.ariaLabel;
        if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
        else button.removeAttribute('aria-label');
      }
    },
  };
}
