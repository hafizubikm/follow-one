import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/header.css';
import './styles/hud.css';
import './styles/arena.css';
import './styles/countdown.css';
import './styles/screens.css';
import './styles/settings.css';
import './styles/controls.css';
import { createSfx } from './audio/sfx.ts';
import { config } from './config.ts';
import { startDebug } from './debug.ts';
import { createSession, type GameEvent } from './game/session.ts';
import type { GameState } from './game/stateMachine.ts';
import { arenaView, countdownView, hudView, resultView } from './game/view.ts';
import { wireSelection } from './input/selection.ts';
import { startLoop } from './loop.ts';
import { createArena } from './render/arena.ts';
import { createCountdown } from './render/countdown.ts';
import { el } from './render/dom.ts';
import { createHeader } from './render/header.ts';
import { createHud } from './render/hud.ts';
import { createResultCard, createStartScreen, createStatsStrip, setScreen, type Screen } from './render/screens.ts';
import { createSettingsPanel } from './render/settingsPanel.ts';
import { createSettings, roundSetup, settingsLocked } from './settings/settings.ts';
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
const settings = createSettings(store);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => reducedMotionQuery.matches;

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');
app.style.setProperty('--arena-max', `${config.arenaMaxPx}px`);
app.style.setProperty('--full-width-max', `${config.fullWidthMaxPx}px`);

// Which sound each cue plays (SPEC §10).
function playCue(event: GameEvent): void {
  switch (event.type) {
    case 'countdown':
      return sfx.play('tick');
    case 'finalTick':
      return sfx.play('softTick');
    case 'answer':
      return sfx.play(event.correct ? 'correct' : 'incorrect');
    case 'collision':
      if (config.collisionClicks) sfx.play('collision');
      return;
    case 'enter':
      if (event.state === 'TARGET_INTRO') sfx.play('chime');
      else if (event.state === 'TRACKING') sfx.play('go');
      else if (event.state === 'TRACKING_COMPLETE') sfx.play('freeze');
  }
}

const session = createSession({
  strict: import.meta.env.DEV,
  reducedMotion,
  setup: () => roundSetup(settings.current),
  onEvent: playCue,
});

// The stage keeps HUD, arena and footer together; the footer holds the stats strip or the result card.
const stage = el('main', 'stage');
const footer = el('div', 'footer');
const hud = createHud();
const countdown = createCountdown(reducedMotion);
const arena = createArena(countdown.el);
const strip = createStatsStrip();
const resultCard = createResultCard(() => {
  sfx.unlock();
  if (!session.playAgain()) return;
  setScreen(app, 'play');
  window.scrollTo({ top: 0 });
});
footer.append(strip.el, resultCard.el);
stage.append(hud.el, arena.el, footer);
wireSelection(arena, { canPick: () => session.selectionLive, pick: (id) => session.pick(id) });

const startScreen = createStartScreen(() => {
  sfx.unlock(); // inside the click: browsers only let a user gesture start audio
  if (session.start()) setScreen(app, 'play');
}, settings.current);
const header = createHeader(() => panel.open());
const panel = createSettingsPanel({
  settings,
  theme,
  sfx,
  opener: header.settingsButton,
  onChange: (current) => startScreen.setMeta(current),
});

app.append(header.el, stage, startScreen.el);
document.body.append(panel.el);

const screenFor = (state: GameState): Screen => (state === 'IDLE' ? 'start' : state === 'RESULT' ? 'result' : 'play');

// RESULT: fill the card, show it, move focus to Play Again, then bring the card into view if it
// hangs below a short viewport (SPEC §4, §8).
const showResult = () => {
  const view = resultView(session);
  if (!view) return;
  resultCard.show(view);
  setScreen(app, 'result');
  resultCard.focus();
  resultCard.el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
};

if (import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1') {
  setScreen(app, 'play');
  startDebug(arena);
} else {
  setScreen(app, 'start');
  let shownState: GameState = session.state;
  startLoop(1000 / config.physicsHz, config.maxFrameMs, {
    step: () => session.step(),
    render(alpha) {
      if (session.state !== shownState) {
        shownState = session.state;
        panel.setLocked(settingsLocked(shownState));
        if (shownState === 'RESULT') showResult();
        else setScreen(app, screenFor(shownState));
      }
      hud.render(hudView(session));
      countdown.render(countdownView(session));
      arena.render(arenaView(session, alpha));
      strip.update(session.stats);
    },
  });
}
