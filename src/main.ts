import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/header.css';
import './styles/hud.css';
import './styles/arena.css';
import './styles/screens.css';
import { createSfx } from './audio/sfx.ts';
import { config } from './config.ts';
import { startDebug } from './debug.ts';
import { createSession } from './game/session.ts';
import type { GameState } from './game/stateMachine.ts';
import { arenaView, hudView } from './game/view.ts';
import { startLoop } from './loop.ts';
import { createArena } from './render/arena.ts';
import { el } from './render/dom.ts';
import { createHeader } from './render/header.ts';
import { createHud } from './render/hud.ts';
import { createStartScreen, createStatsStrip, setScreen, type Screen } from './render/screens.ts';
import { createTheme, systemDarkQuery } from './theme/theme.ts';
import type { KeyValueStore } from './util/storage.ts';

function localStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = localStore();
const theme = createTheme(store, window.matchMedia(systemDarkQuery), document.documentElement);
const sfx = createSfx(store);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => reducedMotionQuery.matches;

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');
app.style.setProperty('--arena-max', `${config.arenaMaxPx}px`);

// The stage keeps HUD, arena and footer together; the footer holds the stats strip or the result card.
const stage = el('main', 'stage');
const footer = el('div', 'footer');
const hud = createHud(reducedMotion);
const arena = createArena();
const strip = createStatsStrip();
footer.append(strip.el);
stage.append(hud.el, arena.el, footer);

const session = createSession({
  strict: import.meta.env.DEV,
  reducedMotion,
  onEvent: () => {
    // Phase 6: sounds.
  },
});

const screenFor = (state: GameState): Screen => (state === 'IDLE' ? 'start' : state === 'RESULT' ? 'result' : 'play');

app.append(
  createHeader(theme, sfx),
  stage,
  createStartScreen(() => {
    if (session.start()) setScreen(app, 'play');
  }),
);

if (import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1') {
  setScreen(app, 'play');
  startDebug(arena);
} else {
  setScreen(app, 'start');
  startLoop(1000 / config.physicsHz, config.maxFrameMs, {
    step: () => session.step(),
    render(alpha) {
      setScreen(app, screenFor(session.state));
      hud.render(hudView(session));
      arena.render(arenaView(session, alpha));
      strip.update(session.stats);
    },
  });
}
