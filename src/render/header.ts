import type { Sfx } from '../audio/sfx.ts';
import { copy } from '../copy.ts';
import { themePrefs, type ThemeController } from '../theme/theme.ts';
import { el, icon } from './dom.ts';

export function createHeader(theme: ThemeController, sfx: Sfx): HTMLElement {
  const header = el('header', 'header');
  const brand = el('span', 'brand', copy.title);
  const controls = el('div', 'header-controls');
  controls.append(createSoundToggle(sfx), createThemeControl(theme));
  header.append(brand, controls);
  return header;
}

// The label states the current setting, per the copy table, so no aria-pressed.
function createSoundToggle(sfx: Sfx): HTMLButtonElement {
  const button = el('button', 'sound-toggle');
  button.type = 'button';

  const render = () => {
    const state = sfx.enabled ? copy.sound.on : copy.sound.off;
    button.replaceChildren(icon(state.icon), el('span', 'sound-label', state.label));
  };

  button.addEventListener('click', () => {
    sfx.setEnabled(!sfx.enabled);
    render();
  });
  render();
  return button;
}

function createThemeControl(theme: ThemeController): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', copy.theme.groupLabel);

  const buttons = themePrefs.map((pref) => {
    const button = el('button', '', copy.theme.options[pref]);
    button.type = 'button';
    button.addEventListener('click', () => {
      theme.setPref(pref);
      render();
    });
    return button;
  });

  const render = () => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(themePrefs[i] === theme.pref));
    });
  };

  group.append(...buttons);
  render();
  return group;
}
