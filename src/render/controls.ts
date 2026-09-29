// Native form controls for the settings drawer (SPEC §16), so keyboard and screen-reader behavior
// comes from the platform: a range input, radio groups, and a switch button.
import { el } from './dom.ts';

let lastId = 0;
const uniqueId = (prefix: string) => `${prefix}-${++lastId}`;

export interface SliderRow {
  readonly el: HTMLElement;
  setDisabled(disabled: boolean): void;
}

/** A labelled slider with its current value spelled out beside the label and at the ends of its range. */
export function sliderRow(
  label: string,
  range: { readonly min: number; readonly max: number; readonly step: number },
  value: number,
  format: (value: number) => string,
  onInput: (value: number) => void,
): SliderRow {
  const id = uniqueId('slider');
  const row = el('div', 'setting');
  const head = el('div', 'setting-head');
  const name = el('label', 'setting-label', label);
  name.htmlFor = id;
  // The slider's aria-valuetext already speaks the value; this copy is for the eye.
  const shown = el('span', 'setting-value');
  shown.setAttribute('aria-hidden', 'true');
  head.append(name, shown);

  const input = el('input', 'slider');
  Object.assign(input, { type: 'range', id, min: String(range.min), max: String(range.max), step: String(range.step) });
  const end = (text: number) => {
    const node = el('span', 'slider-end', String(text));
    node.setAttribute('aria-hidden', 'true');
    return node;
  };
  const track = el('div', 'slider-row');
  track.append(end(range.min), input, end(range.max));
  row.append(head, track);

  const show = (next: number) => {
    input.value = String(next);
    shown.textContent = format(next);
    input.setAttribute('aria-valuetext', format(next));
    input.style.setProperty('--fill', `${((next - range.min) / (range.max - range.min)) * 100}%`);
  };
  input.addEventListener('input', () => {
    const next = Number(input.value);
    show(next);
    onInput(next);
  });
  show(value);

  return {
    el: row,
    setDisabled(disabled) {
      input.disabled = disabled;
      row.toggleAttribute('data-disabled', disabled);
    },
  };
}

export interface Choice {
  readonly el: HTMLElement;
  setDisabled(disabled: boolean): void;
}

/** A radio group drawn as a segmented control; arrow keys move within it natively. */
export function segmentedChoice<T extends string>(
  label: string,
  options: Readonly<Record<T, string>>,
  value: T,
  onChange: (value: T) => void,
): Choice {
  const fieldset = el('fieldset', 'setting');
  const group = el('div', 'segmented');
  const name = uniqueId('choice');

  for (const key of Object.keys(options) as T[]) {
    const input = el('input');
    Object.assign(input, { type: 'radio', name, value: key, checked: key === value });
    input.addEventListener('change', () => {
      if (input.checked) onChange(key);
    });
    const option = el('label', 'segment');
    option.append(input, el('span', '', options[key]));
    group.append(option);
  }
  fieldset.append(el('legend', 'setting-label', label), group);

  return {
    el: fieldset,
    setDisabled(disabled) {
      fieldset.disabled = disabled;
    },
  };
}

export interface SwatchChoice<T extends string> extends Choice {
  /** Checks an option from code (no change event), e.g. after the color hint's one-tap fix. */
  set(value: T): void;
  /** Focuses the checked swatch. */
  focus(): void;
  /** Adds a node under the swatches, inside the group (so it's disabled along with it). */
  append(node: HTMLElement): void;
}

/**
 * A radio group of color swatches (SPEC §16). `paint` gives each swatch's custom properties. The chosen one
 * is marked by a ring and a ✓, and its name shows beside the label, so the choice never rests on color alone.
 */
export function swatchChoice<T extends string>(
  label: string,
  options: Readonly<Record<T, string>>,
  value: T,
  glyph: string,
  paint: (key: T) => Readonly<Record<string, string>>,
  onChange: (value: T) => void,
): SwatchChoice<T> {
  const fieldset = el('fieldset', 'setting');
  const legend = el('legend', 'setting-head');
  const shown = el('span', 'setting-value');
  shown.setAttribute('aria-hidden', 'true');
  legend.append(el('span', 'setting-label', label), shown);
  const group = el('div', 'swatches');
  const name = uniqueId('swatch');
  const inputs = new Map<T, HTMLInputElement>();

  const show = (key: T) => {
    shown.textContent = options[key];
  };
  for (const key of Object.keys(options) as T[]) {
    const input = el('input');
    Object.assign(input, { type: 'radio', name, value: key, checked: key === value });
    input.addEventListener('change', () => {
      if (!input.checked) return;
      show(key);
      onChange(key);
    });
    inputs.set(key, input);
    const dot = el('span', 'swatch-dot', glyph);
    dot.setAttribute('aria-hidden', 'true');
    for (const [property, color] of Object.entries(paint(key))) dot.style.setProperty(property, color);
    const option = el('label', 'swatch');
    option.append(input, dot, el('span', 'visually-hidden', options[key]));
    group.append(option);
  }
  fieldset.append(legend, group);
  show(value);

  return {
    el: fieldset,
    setDisabled(disabled) {
      fieldset.disabled = disabled;
    },
    set(key) {
      const input = inputs.get(key);
      if (input) input.checked = true;
      show(key);
    },
    focus() {
      for (const input of inputs.values()) if (input.checked) input.focus();
    },
    append(node) {
      fieldset.append(node);
    },
  };
}

/** An on/off switch whose label never changes; the state is aria-checked plus a visible word. */
export function switchRow(
  label: string,
  states: { readonly on: string; readonly off: string },
  value: boolean,
  onToggle: (on: boolean) => void,
): HTMLElement {
  const id = uniqueId('switch');
  const row = el('div', 'setting setting-inline');
  const name = el('label', 'setting-label', label);
  name.htmlFor = id;

  const button = el('button', 'switch');
  Object.assign(button, { type: 'button', id });
  button.setAttribute('role', 'switch');
  const word = el('span', 'switch-state');
  const track = el('span', 'switch-track');
  track.append(el('span', 'switch-thumb'));
  for (const part of [word, track]) part.setAttribute('aria-hidden', 'true');
  button.append(word, track);
  row.append(name, button);

  let on = value;
  const show = () => {
    button.setAttribute('aria-checked', String(on));
    word.textContent = on ? states.on : states.off;
  };
  button.addEventListener('click', () => {
    on = !on;
    show();
    onToggle(on);
  });
  show();
  return row;
}
