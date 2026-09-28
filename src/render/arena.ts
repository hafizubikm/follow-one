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
  /** The id of the ball whose center is nearest a viewport point. */
  nearestBall(clientX: number, clientY: number): number | null;
}

interface BallElement {
  readonly el: HTMLButtonElement;
  draw(view: BallView, radiusPx: number): void;
}

// Slot numbers sit this far beyond the ball's outer edge, on the side away from the center.
const SLOT_NUMBER_GAP_PX = 10;

// Only this module turns arena units into pixels; everything upstream stays resolution-free (SPEC §4).
// `underlay` (the countdown watermark) goes first, so it draws over the arena's face and under the balls.
export function createArena(underlay?: HTMLElement): Arena {
  const arena = el('div', 'arena');
  arena.style.setProperty('--hit-min', `${config.minHitPx}px`);
  arena.dataset.input = 'off';

  const numbers = el('div', 'slot-numbers');
  numbers.setAttribute('aria-hidden', 'true');
  const layer = el('div', 'balls');
  layer.hidden = true;
  // Balls are buttons from the start (SPEC §5) but stay out of reach until selection. Only their layer
  // goes inert: an inert arena would let the pointer fall through to the page, taking the hidden
  // cursor with it.
  layer.inert = true;
  arena.append(...(underlay ? [underlay] : []), numbers, layer);

  let balls: BallElement[] = [];
  let numberEls: HTMLElement[] = [];
  let ids = new WeakMap<Element, number>();

  // Resizing or rotating mid-round just changes this scale; the next frame redraws at the new size.
  let radiusPx = 0;
  new ResizeObserver(([entry]) => {
    radiusPx = entry.contentRect.width / 2;
  }).observe(arena);

  let order = '';
  let input: InputMode = 'off';
  let cursorHidden = false;
  let ballRadius = 0;
  let numbersAt = '';
  let numbersOpacity = '';

  const placeNumbers = (ringRadius: number) => {
    const along = radiusPx * (ringRadius + ballRadius) + SLOT_NUMBER_GAP_PX;
    numberEls.forEach((number, i) => {
      const dir = slotPosition(i + 1, numberEls.length, 1);
      number.style.transform = `translate(-50%, -50%) translate(${(dir.x * along).toFixed(1)}px, ${(dir.y * along).toFixed(1)}px)`;
    });
  };

  const setInput = (next: InputMode) => {
    input = next;
    arena.dataset.input = next;
    layer.inert = next === 'off';
    for (const ball of balls) {
      ball.el.tabIndex = next === 'off' ? -1 : 0;
      if (next === 'locked') ball.el.setAttribute('aria-disabled', 'true');
      else ball.el.removeAttribute('aria-disabled');
    }
  };

  // A round with another ball count gets a fresh set of identical elements, before any of it is shown.
  const setCount = (count: number) => {
    balls = Array.from({ length: count }, createBall);
    ids = new WeakMap(balls.map((ball, id) => [ball.el, id]));
    layer.replaceChildren(...balls.map((ball) => ball.el));
    numberEls = Array.from({ length: count }, (_, i) => el('span', 'slot-number', String(i + 1)));
    numbers.replaceChildren(...numberEls);
    order = '';
    numbersAt = '';
    setInput(input);
  };

  return {
    el: arena,
    render(view) {
      if (layer.hidden !== (view === null)) layer.hidden = view === null;
      const hideCursor = view?.hideCursor ?? false;
      if (hideCursor !== cursorHidden) {
        cursorHidden = hideCursor;
        arena.toggleAttribute('data-hide-cursor', hideCursor);
      }
      if (!radiusPx) radiusPx = arena.clientWidth / 2;
      const opacity = view ? String(view.slotNumbers) : '0';
      if (opacity !== numbersOpacity) {
        numbersOpacity = opacity;
        numbers.style.opacity = opacity;
      }
      if (!view) return;

      if (view.balls.length !== balls.length) setCount(view.balls.length);
      if (view.ballRadius !== ballRadius) {
        ballRadius = view.ballRadius;
        arena.style.setProperty('--ball-r', String(ballRadius));
      }
      if (view.slotNumbers > 0) {
        const at = `${radiusPx}|${view.ringRadius}|${ballRadius}|${numberEls.length}`;
        if (at !== numbersAt) {
          numbersAt = at;
          placeNumbers(view.ringRadius);
        }
      }
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
    nearestBall(clientX, clientY) {
      let nearest: number | null = null;
      let best = Infinity;
      balls.forEach((ball, id) => {
        const box = ball.el.getBoundingClientRect();
        const distance = Math.hypot(box.left + box.width / 2 - clientX, box.top + box.height / 2 - clientY);
        if (distance < best) {
          best = distance;
          nearest = id;
        }
      });
      return nearest;
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
