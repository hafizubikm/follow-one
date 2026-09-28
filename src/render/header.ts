import { copy } from '../copy.ts';
import { el, lineIcon } from './dom.ts';

export interface Header {
  readonly el: HTMLElement;
  /** Opens Settings; focus comes back here when the drawer closes. */
  readonly settingsButton: HTMLButtonElement;
}

/** ⚙ at the left, then the title (SPEC §4). The other controls live in the settings drawer. */
export function createHeader(onOpenSettings: () => void): Header {
  const header = el('header', 'header');
  const button = el('button', 'settings-button');
  button.type = 'button';
  button.setAttribute('aria-label', copy.settings.title);
  button.setAttribute('aria-haspopup', 'dialog');
  button.append(lineIcon(gearPath()));
  button.addEventListener('click', onOpenSettings);
  header.append(button, el('span', 'brand', copy.title));
  return { el: header, settingsButton: button };
}

/** An 8-tooth gear outline around a hub, on the 24-unit icon grid. */
function gearPath(teeth = 8, tip = 10, root = 7.2, hub = 3): string {
  const pitch = (2 * Math.PI) / teeth;
  const at = (angle: number, r: number) =>
    `${(12 + r * Math.sin(angle)).toFixed(2)} ${(12 - r * Math.cos(angle)).toFixed(2)}`;
  let d = `M${at(-0.3 * pitch, root)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * pitch;
    d += `L${at(a - 0.15 * pitch, tip)}L${at(a + 0.15 * pitch, tip)}L${at(a + 0.3 * pitch, root)}`;
    d += `A${root} ${root} 0 0 1 ${at(a + 0.7 * pitch, root)}`;
  }
  return `${d}ZM${12 + hub} 12a${hub} ${hub} 0 1 1 ${-2 * hub} 0a${hub} ${hub} 0 1 1 ${2 * hub} 0`;
}
