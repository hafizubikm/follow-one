// Dev-only free-run (?debug=1, SPEC §13): balls bounce forever so speed and radius can be tuned by eye.
// main.ts only calls this behind import.meta.env.DEV, so production builds drop the module.
// Its text is for the developer, not the player, so it stays out of copy.ts.
import { config } from './config.ts';
import { spawnBodies } from './game/round.ts';
import { stepWorld, type Body } from './physics/world.ts';
import { el } from './render/dom.ts';

const panelStyle = [
  'position:fixed',
  'left:12px',
  'bottom:12px',
  'z-index:10',
  'display:grid',
  'gap:6px',
  'padding:10px 12px',
  'border:1px solid var(--border)',
  'border-radius:12px',
  'background:var(--surface)',
  'color:var(--text)',
  'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
  'box-shadow:0 8px 24px rgb(var(--shadow) / 0.15)',
].join(';');

export function startDebug(arena: HTMLElement): void {
  const settings = { ...config, baseSpeed: config.baseSpeed as number, ballRadius: config.ballRadius as number };
  let bodies: Body[] = [];
  let dots: HTMLElement[] = [];

  const respawn = () => {
    bodies = spawnBodies(settings);
    dots.forEach((dot) => dot.remove());
    dots = bodies.map(() => arena.appendChild(el('div', 'ball')));
    arena.style.setProperty('--ball-r', String(settings.ballRadius));
  };

  const readout = el('output');
  const panel = el('div');
  panel.style.cssText = panelStyle;
  panel.append(
    el('strong', '', 'free-run (?debug=1)'),
    slider('baseSpeed', 0.1, 1.2, 0.01, settings.baseSpeed, (v) => {
      settings.baseSpeed = v; // regulation eases every ball to the new speed
    }),
    slider('ballRadius', 0.04, 0.14, 0.005, settings.ballRadius, (v) => {
      settings.ballRadius = v;
      respawn();
    }),
    button('respawn', respawn),
    readout,
  );
  document.body.append(panel);
  respawn();

  const stepMs = 1000 / config.physicsHz;
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let windowStart = last;

  const frame = (now: number) => {
    acc += Math.min(now - last, config.maxFrameMs);
    last = now;
    while (acc >= stepMs) {
      stepWorld(bodies, stepMs / 1000, settings);
      acc -= stepMs;
    }

    const radiusPx = arena.clientWidth / 2;
    bodies.forEach((b, i) => {
      dots[i].style.transform = `translate3d(${b.x * radiusPx}px, ${b.y * radiusPx}px, 0)`;
    });

    frames++;
    if (now - windowStart >= 500) {
      const speeds = bodies.map((b) => Math.hypot(b.vx, b.vy));
      const mean = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
      readout.textContent =
        `${Math.round((frames * 1000) / (now - windowStart))} fps · speed ` +
        `${Math.min(...speeds).toFixed(3)} / ${mean.toFixed(3)} / ${Math.max(...speeds).toFixed(3)}`;
      frames = 0;
      windowStart = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function slider(name: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void) {
  const label = el('label');
  label.style.cssText = 'display:grid;grid-template-columns:7em 10em 3.5em;align-items:center;gap:8px';
  const input = el('input');
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const shown = el('span', '', String(value));
  input.addEventListener('input', () => {
    shown.textContent = input.value;
    onInput(Number(input.value));
  });
  label.append(el('span', '', name), input, shown);
  return label;
}

function button(text: string, onClick: () => void) {
  const node = el('button', '', text);
  node.type = 'button';
  node.style.cssText = 'justify-self:start;padding:2px 10px;border:1px solid var(--border);border-radius:6px';
  node.addEventListener('click', onClick);
  return node;
}
