import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/header.css';
import './styles/hud.css';
import './styles/arena.css';
import './styles/screens.css';
import { createSfx } from './audio/sfx.ts';
import { config } from './config.ts';
import { createArena } from './render/arena.ts';
import { el } from './render/dom.ts';
import { createHeader } from './render/header.ts';
import { createHud } from './render/hud.ts';
import { createStartScreen, createStatsStrip, setScreen } from './render/screens.ts';
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

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');
app.style.setProperty('--arena-max', `${config.arenaMaxPx}px`);

// The stage keeps HUD, arena and footer together; the footer holds the stats strip or the result card.
const stage = el('main', 'stage');
const footer = el('div', 'footer');
footer.append(createStatsStrip().el);
stage.append(createHud().el, createArena().el, footer);

app.append(
  createHeader(theme, sfx),
  stage,
  // Phase 4 routes this through the state machine; for now it only reveals the play layout.
  createStartScreen(() => setScreen(app, 'play')),
);
setScreen(app, 'start');
