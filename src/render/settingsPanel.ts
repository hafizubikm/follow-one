import type { Sfx } from '../audio/sfx.ts';
import { config } from '../config.ts';
import { copy, fill } from '../copy.ts';
import type { Settings, SettingsStore } from '../settings/settings.ts';
import { colorHint, toneVars, type BallColor, type TargetColor } from '../theme/palette.ts';
import type { ThemeController } from '../theme/theme.ts';
import { segmentedChoice, sliderRow, swatchChoice, switchRow } from './controls.ts';
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
  const ballColor = swatchChoice(
    text.ballColor.label,
    text.ballColor.options,
    settings.current.ballColor,
    copy.glyphs.chosen,
    (id) => toneVars('--swatch', 'ball', id),
    (next) => {
      change({ ballColor: next });
      showHint();
    },
  );
  const targetColor = swatchChoice(
    text.targetColor.label,
    text.targetColor.options,
    settings.current.targetColor,
    copy.glyphs.chosen,
    (id) => toneVars('--swatch', 'target', id),
    (next) => {
      change({ targetColor: next });
      showHint();
    },
  );
  const themeChoice = segmentedChoice(text.theme.label, text.theme.options, theme.pref, (pref) => theme.setPref(pref));
  const sound = switchRow(text.sound.label, text.sound, sfx.enabled, (on) => sfx.setEnabled(on));

  const hint = colorHintRow((next) => {
    // Focus moves to the newly chosen swatch before the hint, and the button in it, goes away.
    targetColor.set(next);
    targetColor.focus();
    change({ targetColor: next });
    showHint();
  });
  const showHint = () => hint.update(settings.current.ballColor, settings.current.targetColor);
  targetColor.append(hint.el);
  // The hint judges the current theme's tones (SPEC §16).
  theme.onChange(showHint);
  showHint();

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
    section('appearance', text.sections.appearance, ballColor.el, targetColor.el, themeChoice.el, sound),
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
      ballColor.setDisabled(locked);
      targetColor.setDisabled(locked);
    },
  };
}

interface ColorHintRow {
  readonly el: HTMLElement;
  update(ball: BallColor, target: TargetColor): void;
}

/**
 * The color hint under the target swatches (SPEC §16). Its color name is a button that picks that color.
 * A status region, so new advice is announced; empty while the pair is fine.
 */
function colorHintRow(onFix: (target: TargetColor) => void): ColorHintRow {
  const text = copy.settings;
  const row = el('p', 'color-hint');
  row.id = 'color-hint';
  row.setAttribute('role', 'status');
  const fix = el('button', 'color-hint-fix');
  fix.type = 'button';
  // Reached by Tab, "White" alone says little; the sentence around it is its description.
  fix.setAttribute('aria-describedby', row.id);
  const dot = el('span', 'color-hint-dot');
  dot.setAttribute('aria-hidden', 'true');
  const name = el('span');
  fix.append(dot, name);
  const [before, after] = text.colorHint.split('{color}');
  // Tones come from CSS, so they're the current theme's.
  const readTone = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token);
  let suggested: TargetColor | null = null;

  fix.addEventListener('click', () => {
    if (suggested) onFix(suggested);
  });
  return {
    el: row,
    update(ball, target) {
      const next = colorHint(ball, target, readTone);
      if (next === suggested) return;
      suggested = next;
      if (!next) {
        row.replaceChildren();
        return;
      }
      for (const [property, value] of Object.entries(toneVars('--swatch', 'target', next))) {
        dot.style.setProperty(property, value);
      }
      name.textContent = text.targetColor.options[next];
      row.replaceChildren(before, fix, after);
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
