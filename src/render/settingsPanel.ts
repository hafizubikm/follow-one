import type { Sfx } from '../audio/sfx.ts';
import { config } from '../config.ts';
import { copy, fill } from '../copy.ts';
import type { Settings, SettingsStore } from '../settings/settings.ts';
import type { ThemeController } from '../theme/theme.ts';
import { segmentedChoice, sliderRow, switchRow } from './controls.ts';
import { el, lineIcon } from './dom.ts';

export interface SettingsPanel {
  readonly el: HTMLDialogElement;
  open(): void;
  /** Disables the settings that shape a round while one is being played (SPEC §16). */
  setLocked(locked: boolean): void;
}

export interface SettingsPanelOptions {
  readonly settings: SettingsStore;
  readonly theme: ThemeController;
  readonly sfx: Sfx;
  /** The ⚙ button; focus returns to it when the drawer closes. */
  readonly opener: HTMLElement;
  onChange(settings: Settings): void;
}

const CLOSE_ICON = 'M6 6l12 12M18 6L6 18';

/** The settings drawer: a modal dialog from the right, beside ⚙. ✕, Esc and the backdrop close it. */
export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  const { settings, theme, sfx } = options;
  const text = copy.settings;
  const change = (patch: Partial<Settings>) => options.onChange(settings.update(patch));

  const balls = sliderRow(
    text.balls.label,
    { min: config.ballCountMin, max: config.ballCountMax, step: 1 },
    settings.current.ballCount,
    (n) => fill(text.balls.value, { n }),
    (ballCount) => change({ ballCount }),
  );
  const speed = segmentedChoice(text.speed.label, text.speed.options, settings.current.speed, (next) =>
    change({ speed: next }),
  );
  // Shown and stepped in seconds; stored in ms like every other duration.
  const duration = sliderRow(
    text.duration.label,
    { min: config.trackingMsMin / 1000, max: config.trackingMsMax / 1000, step: config.trackingMsStep / 1000 },
    settings.current.trackingMs / 1000,
    (seconds) => fill(text.duration.value, { seconds }),
    (seconds) => change({ trackingMs: seconds * 1000 }),
  );
  const themeChoice = segmentedChoice(text.theme.label, text.theme.options, theme.pref, (pref) => theme.setPref(pref));
  const sound = switchRow(text.sound.label, text.sound, sfx.enabled, (on) => sfx.setEnabled(on));

  const dialog = el('dialog', 'settings');
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const title = el('h2', 'settings-title', text.title);
  title.id = 'settings-title';
  const close = el('button', 'settings-close');
  close.type = 'button';
  close.setAttribute('aria-label', text.close);
  close.append(lineIcon(CLOSE_ICON));
  const head = el('div', 'settings-head');
  head.append(title, close);
  const note = el('p', 'settings-note', text.locked);
  note.hidden = true;

  dialog.append(
    head,
    note,
    section('game', text.sections.game, balls.el, speed.el, duration.el),
    section('appearance', text.sections.appearance, themeChoice.el, sound),
  );

  // A click whose press also began on the backdrop closes the drawer; a slider drag that ends
  // outside it doesn't. The dialog box is the panel itself, so the backdrop is "outside its box".
  const onBackdrop = (event: MouseEvent) => {
    if (event.target !== dialog) return false;
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = onBackdrop(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pressedOnBackdrop && onBackdrop(event)) dialog.close();
    pressedOnBackdrop = false;
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => options.opener.focus({ preventScroll: true }));

  return {
    el: dialog,
    open() {
      if (dialog.open) return;
      dialog.showModal();
      close.focus();
    },
    setLocked(locked) {
      note.hidden = !locked;
      balls.setDisabled(locked);
      speed.setDisabled(locked);
      duration.setDisabled(locked);
    },
  };
}

function section(key: string, heading: string, ...rows: HTMLElement[]): HTMLElement {
  const node = el('section', 'settings-section');
  const id = `settings-${key}`;
  const title = el('h3', 'settings-section-title', heading);
  title.id = id;
  node.setAttribute('aria-labelledby', id);
  node.append(title, ...rows);
  return node;
}
