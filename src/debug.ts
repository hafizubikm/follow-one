// Dev-only free-run (?debug=1, SPEC §13): balls bounce forever so count, speed and radius can be tuned by eye.
// main.ts only calls this behind import.meta.env.DEV, so production builds drop the module.
// Its text is for the developer, not the player, so it stays out of copy.ts.
import { config } from './config.ts';
import { ballRadiusFor, spawnBodies } from './game/round.ts';
import { ringRadiusFor } from './game/slots.ts';
import { neutralBall } from './game/view.ts';
import { startLoop } from './loop.ts';
import { stepWorld, type Body } from './physics/world.ts';
import type { Vec } from './physics/vec.ts';
import type { Arena } from './render/arena.ts';
import { el } from './render/dom.ts';

export function startDebug(arena: Arena): void {
  // ballRadius is the size at the default count; the count slider applies the §5 scaling to it.
  const tuning = { ...config, baseSpeed: config.baseSpeed as number, ballRadius: config.ballRadius as number };
  let count: number = config.ballCount;
  let radius = 0;
  let bodies: Body[] = [];
  let prev: Vec[] = [];

  const respawn = () => {
    radius = ballRadiusFor(count, tuning);
    bodies = spawnBodies({ ...tuning, ballCount: count, ballRadius: radius });
    prev = bodies.map(({ x, y }) => ({ x, y }));
  };

  const readout = el('output');
  // Inside the function: a module-level [...].join() would survive tree-shaking in production.
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
  const panel = el('div');
  panel.style.cssText = panelStyle;
  panel.append(
    el('strong', '', 'free-run (?debug=1)'),
    slider('balls', config.ballCountMin, config.ballCountMax, 1, count, (v) => {
      count = v;
      respawn();
    }),
    slider('baseSpeed', 0.1, 1.2, 0.01, tuning.baseSpeed, (v) => {
      tuning.baseSpeed = v; // regulation eases every ball to the new speed
    }),
    slider('radius@15', 0.04, 0.14, 0.005, tuning.ballRadius, (v) => {
      tuning.ballRadius = v;
      respawn();
    }),
    button('respawn', respawn),
    readout,
  );
  document.body.append(panel);
  respawn();

  const stepMs = 1000 / config.physicsHz;
  let frames = 0;
  let windowStart = performance.now();

  startLoop(stepMs, config.maxFrameMs, {
    step() {
      prev = bodies.map(({ x, y }) => ({ x, y }));
      // Substeps as a speed preset with this factor would get (SPEC §6).
      stepWorld(bodies, stepMs / 1000, { ...tuning, substeps: Math.ceil(tuning.baseSpeed / config.baseSpeed) });
    },
    render(alpha) {
      arena.render({
        balls: bodies.map((b, i) => neutralBall(prev[i].x + (b.x - prev[i].x) * alpha, prev[i].y + (b.y - prev[i].y) * alpha)),
        ballRadius: radius,
        ringRadius: ringRadiusFor(radius, config),
        order: bodies.map((_, i) => i),
        slotNumbers: 0,
        input: 'off',
        hideCursor: false,
      });

      frames++;
      const now = performance.now();
      if (now - windowStart < 500) return;
      const speeds = bodies.map((b) => Math.hypot(b.vx, b.vy));
      const mean = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
      readout.textContent =
        `${Math.round((frames * 1000) / (now - windowStart))} fps · r ${radius.toFixed(3)} · speed ` +
        `${Math.min(...speeds).toFixed(3)} / ${mean.toFixed(3)} / ${Math.max(...speeds).toFixed(3)}`;
      frames = 0;
      windowStart = now;
    },
  });
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
