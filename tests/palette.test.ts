import { describe, expect, it } from 'vitest';
import tokens from '../src/styles/tokens.css?raw';
import indexHtml from '../index.html?raw';
import { config } from '../src/config.ts';
import { copy } from '../src/copy.ts';
import {
  ballColors,
  colorHint,
  colorVars,
  comfortMargin,
  isBallColor,
  isTargetColor,
  pairDistances,
  parseHex,
  targetColors,
  toneToken,
  toneVars,
  type ColorKind,
} from '../src/theme/palette.ts';

const rgb = (hex: string) => {
  const color = parseHex(hex);
  if (!color) throw new Error(`not a #rrggbb color: ${hex}`);
  return color;
};

// WCAG contrast, for the arena and ink checks.
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const minDistance = (a: string, b: string) => Math.min(...Object.values(pairDistances(rgb(a), rgb(b))));

/** Custom properties as each theme resolves them: the dark block overrides the light one, and var() resolves per theme. */
function themeTokens(): Record<'light' | 'dark', (name: string) => string> {
  const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`tokens.css has no ${selector} block`);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const light = block(':root');
  const dark = new Map([...light, ...block(":root[data-theme='dark']")]);
  const reader = (map: Map<string, string>) => {
    const read = (name: string): string =>
      (map.get(name) ?? '').replace(/var\((--[\w-]+)\)/g, (_, ref: string) => read(ref));
    return read;
  };
  return { light: reader(light), dark: reader(dark) };
}

const themes = themeTokens();
const kinds: Array<[ColorKind, readonly string[]]> = [
  ['ball', ballColors],
  ['target', targetColors],
];

describe('options (SPEC §16)', () => {
  it('lists five ball colors and four target colors, in the order copy names them', () => {
    expect(ballColors).toEqual(Object.keys(copy.settings.ballColor.options));
    expect(targetColors).toEqual(Object.keys(copy.settings.targetColor.options));
  });

  it('defaults to Blue balls and a Red target', () => {
    expect(config.ballColor).toBe('blue');
    expect(config.targetColor).toBe('red');
    expect(isBallColor(config.ballColor)).toBe(true);
    expect(isTargetColor(config.targetColor)).toBe(true);
  });

  it('recognizes only its own option names', () => {
    expect(ballColors.every(isBallColor)).toBe(true);
    expect(targetColors.every(isTargetColor)).toBe(true);
    for (const value of ['red', 'Blue', '', 'toString', 42, null, undefined]) expect(isBallColor(value)).toBe(false);
    for (const value of ['blue', 'Red', '', 'constructor', 7, null]) expect(isTargetColor(value)).toBe(false);
  });

  it('points custom properties at a color’s fill, ink and edge tokens', () => {
    expect(toneVars('--swatch', 'target', 'white')).toEqual({
      '--swatch': 'var(--target-white)',
      '--swatch-ink': 'var(--target-white-ink)',
      '--swatch-edge': 'var(--target-white-edge)',
    });
    expect(colorVars('green', 'pink')).toEqual({
      '--ball': 'var(--ball-green)',
      '--ball-ink': 'var(--ball-green-ink)',
      '--ball-edge': 'var(--ball-green-edge)',
      '--target': 'var(--target-pink)',
      '--target-ink': 'var(--target-pink-ink)',
      '--target-edge': 'var(--target-pink-edge)',
    });
  });
});

describe('color math', () => {
  it('parses #rrggbb only', () => {
    expect(parseHex('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(parseHex(' #FFFFFF ')).toEqual([1, 1, 1]);
    for (const text of ['', '#fff', 'ff8000', '#ff80001', 'rgb(1, 2, 3)', '#gg0000']) expect(parseHex(text)).toBeNull();
  });

  it('measures ΔE as the OKLab distance ×100', () => {
    expect(pairDistances(rgb('#000000'), rgb('#ffffff')).normal).toBeCloseTo(100, 3);
    // sRGB red is OKLab (0.62796, 0.22486, 0.12585) (Ottosson's reference values); white is (1, 0, 0).
    expect(pairDistances(rgb('#ff0000'), rgb('#ffffff')).normal).toBeCloseTo(45.256, 2);
    for (const d of Object.values(pairDistances(rgb('#2f6bd8'), rgb('#2f6bd8')))) expect(d).toBe(0);
  });

  it('leaves grays alone under every simulated deficiency', () => {
    const d = pairDistances(rgb('#303030'), rgb('#b0b0b0'));
    for (const value of Object.values(d)) expect(value).toBeCloseTo(d.normal, 3);
  });

  it('simulates each deficiency’s own confusions', () => {
    // Deuteranopes lose red–green; tritanopes keep it.
    const redGreen = pairDistances(rgb('#d03030'), rgb('#30a030'));
    expect(redGreen.deuteranopia).toBeLessThan(redGreen.normal / 4);
    expect(redGreen.tritanopia).toBeGreaterThan(redGreen.normal / 2);
    // Protanopes see red darkened, so it meets a dark green.
    const redDarkGreen = pairDistances(rgb('#e0533b'), rgb('#006e3b'));
    expect(redDarkGreen.protanopia).toBeLessThan(redDarkGreen.normal / 4);
    // Tritanopes lose blue–teal most.
    const blueTeal = pairDistances(rgb('#3050e0'), rgb('#20a0a0'));
    expect(blueTeal.tritanopia).toBeLessThan(Math.min(blueTeal.protanopia, blueTeal.deuteranopia));
  });

  it('matches an independent implementation of the same models on the default pair', () => {
    const d = pairDistances(rgb('#2f6bd8'), rgb('#e0533b'));
    expect(d.normal).toBeCloseTo(33.6, 1);
    expect(d.protanopia).toBeCloseTo(24.7, 1);
    expect(d.deuteranopia).toBeCloseTo(30.9, 1);
    expect(d.tritanopia).toBeCloseTo(33.3, 1);
  });

  it('puts the comfort line at margin 1: normal ΔE over 15, or the worst deficiency over 8', () => {
    const a = rgb('#f5871a');
    const b = rgb('#e0533b');
    const d = pairDistances(a, b);
    const expected = Math.min(d.normal / 15, Math.min(d.protanopia, d.deuteranopia, d.tritanopia) / 8);
    expect(comfortMargin(a, b)).toBeCloseTo(expected, 12);
  });
});

describe('colorHint', () => {
  // Made-up tones: warm balls, a target nearly the same, one that's far off, and one in between.
  const fake: Record<string, string> = {
    '--ball-blue': '#2060e0',
    '--ball-orange': '#f08020',
    '--ball-purple': '#8050d8',
    '--target-red': '#e05838',
    '--target-pink': '#e04890',
    '--target-yellow': '#f8d830',
    '--target-white': '#ffffff',
  };
  const tone = (token: string) => fake[token] ?? '';

  it('says nothing for a comfortable pair', () => {
    expect(colorHint('blue', 'red', tone)).toBeNull();
    expect(colorHint('orange', 'white', tone)).toBeNull();
  });

  it('suggests the most distinct target for hard-to-tell balls', () => {
    const suggestion = colorHint('orange', 'red', tone);
    expect(suggestion).toBe('white');
    const margins = targetColors.map((id) => comfortMargin(rgb(fake['--ball-orange']), rgb(fake[toneToken('target', id)])));
    expect(Math.max(...margins)).toBe(margins[targetColors.indexOf('white')]);
  });

  it('says nothing when a tone can’t be read', () => {
    expect(colorHint('green', 'red', tone)).toBeNull();
    expect(colorHint('orange', 'red', (token) => (token === '--target-pink' ? 'pink' : tone(token)))).toBeNull();
  });

  it('says nothing when no target does better than the chosen one', () => {
    const allClose = (token: string) => (token.startsWith('--target') ? '#e05838' : '#f08020');
    expect(colorHint('orange', 'red', allClose)).toBeNull();
  });
});

describe.each(['light', 'dark'] as const)('the %s tones in tokens.css', (theme) => {
  const read = themes[theme];
  const arena = read('--arena');

  it.each(kinds)('define a fill, an ink and an edge for every %s color', (kind, ids) => {
    for (const id of ids) {
      for (const suffix of ['', '-ink', '-edge']) {
        expect(parseHex(read(`${toneToken(kind, id)}${suffix}`)), `${toneToken(kind, id)}${suffix}`).not.toBeNull();
      }
    }
  });

  it.each(kinds)('keep every %s at ≥ 3:1 against the arena, rimming a light tone only where it needs one', (kind, ids) => {
    for (const id of ids) {
      const token = toneToken(kind, id);
      const [fill, edge] = [read(token), read(`${token}-edge`)];
      expect(contrast(edge, arena), `${token} edge`).toBeGreaterThanOrEqual(3);
      if (edge === fill) continue;
      expect(contrast(fill, arena), `${token} needs no rim`).toBeLessThan(3);
      expect(luminance(edge), `${token} rim is darker`).toBeLessThan(luminance(fill));
    }
  });

  it.each(kinds)('keep glyphs readable on every %s (ink ≥ 3:1, the WCAG minimum for graphics)', (kind, ids) => {
    for (const id of ids) {
      const token = toneToken(kind, id);
      expect(contrast(read(`${token}-ink`), read(token)), token).toBeGreaterThanOrEqual(3);
    }
  });

  it('keep every ball/target pair above the floor, under normal vision and each deficiency', () => {
    for (const ball of ballColors) {
      for (const target of targetColors) {
        const distance = minDistance(read(toneToken('ball', ball)), read(toneToken('target', target)));
        expect(distance, `${ball}/${target}`).toBeGreaterThanOrEqual(config.colorPairFloor);
      }
    }
  });

  it('start from the default colors, a comfortable pair', () => {
    expect(read('--ball')).toBe(read(toneToken('ball', config.ballColor)));
    expect(read('--target')).toBe(read(toneToken('target', config.targetColor)));
    expect(read('--ball-edge')).toBe(read(`${toneToken('ball', config.ballColor)}-edge`));
    expect(read('--target-ink')).toBe(read(`${toneToken('target', config.targetColor)}-ink`));
    expect(colorHint(config.ballColor, config.targetColor, read)).toBeNull();
  });

  it('give every hard pair a one-tap fix that clears the hint', () => {
    for (const ball of ballColors) {
      for (const target of targetColors) {
        const suggestion = colorHint(ball, target, read);
        if (suggestion) expect(colorHint(ball, suggestion, read), `${ball}/${target} → ${suggestion}`).toBeNull();
      }
    }
  });
});

// The favicon can't read custom properties, so it carries copies of the brand mark's tones.
describe('the favicon', () => {
  const href = /<link\s+rel="icon"\s+href="data:image\/svg\+xml,([^"]*)"/.exec(indexHtml)?.[1] ?? '';
  const svg = decodeURIComponent(href);

  it('takes --target-red’s light tone, and its dark one when the system is dark', () => {
    expect(svg).toContain(`circle{fill:${themes.light('--target-red')}}`);
    expect(svg).toContain(`@media (prefers-color-scheme:dark){circle{fill:${themes.dark('--target-red')}}}`);
  });
});
