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

/** Emoji carry no meaning a screen reader needs beyond the text beside them. Spacing comes from CSS, so accessible names get no stray spaces. */
export function icon(glyph: string): HTMLSpanElement {
  const node = el('span', 'icon', glyph);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A decorative line icon on a 24-unit grid, stroked in currentColor (sized by CSS). */
export function lineIcon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('line-icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}
