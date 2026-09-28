export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Emoji carry no meaning a screen reader needs beyond the text beside them. */
export function icon(glyph: string): HTMLSpanElement {
  const node = el('span', 'icon', glyph);
  node.setAttribute('aria-hidden', 'true');
  return node;
}
