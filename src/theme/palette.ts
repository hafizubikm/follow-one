// Ball and target color options (SPEC §16) and the guard that keeps every ball/target pair apart.
// The tones live in CSS (styles/tokens.css) as --{kind}-{id}, -ink and -edge, one set per theme.
import { config, type Config } from '../config.ts';

export const ballColors = ['blue', 'purple', 'green', 'orange', 'cyan'] as const;
export const targetColors = ['red', 'pink', 'yellow', 'white'] as const;
export type BallColor = (typeof ballColors)[number];
export type TargetColor = (typeof targetColors)[number];
export type ColorKind = 'ball' | 'target';

export const isBallColor = (value: unknown): value is BallColor => ballColors.some((color) => color === value);
export const isTargetColor = (value: unknown): value is TargetColor => targetColors.some((color) => color === value);

/** The CSS custom property holding one color's fill; its ink and edge add -ink and -edge. */
export const toneToken = (kind: ColorKind, id: string): string => `--${kind}-${id}`;

/** Custom properties that point `prefix`, `prefix-ink` and `prefix-edge` at one color's tokens. */
export function toneVars(prefix: string, kind: ColorKind, id: string): Record<string, string> {
  const token = toneToken(kind, id);
  return { [prefix]: `var(${token})`, [`${prefix}-ink`]: `var(${token}-ink)`, [`${prefix}-edge`]: `var(${token}-edge)` };
}

/** What --ball and --target (with their ink and edge) resolve to for the player's colors. */
export function colorVars(ball: BallColor, target: TargetColor): Record<string, string> {
  return { ...toneVars('--ball', 'ball', ball), ...toneVars('--target', 'target', target) };
}

// ---------- the pair-distance guard ----------

type Rgb = readonly [number, number, number];
type Matrix = readonly [Rgb, Rgb, Rgb];

/** '#rrggbb' as sRGB channels in 0..1, or null for anything else. */
export function parseHex(text: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

// Machado, Oliveira & Fernandes (2009) at severity 1, on linear sRGB: the model the comfort thresholds are
// calibrated to, and the one Chrome DevTools uses to emulate these deficiencies.
const deficiencies: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** A color as one kind of vision sees it, in OKLab. */
function seen(rgb: Rgb, vision: Vision): Rgb {
  const lin: Rgb = [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
  if (vision === 'normal') return oklab(lin);
  const clamp = (c: number) => Math.min(Math.max(c, 0), 1);
  const [x, y, z] = deficiencies[vision].map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  return oklab([x, y, z]);
}

/** ΔE (OKLab distance ×100) between two colors under each vision. */
export function pairDistances(a: Rgb, b: Rgb): Record<Vision, number> {
  const distance = (vision: Vision) => {
    const [p, q] = [seen(a, vision), seen(b, vision)];
    return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  return {
    normal: distance('normal'),
    protanopia: distance('protanopia'),
    deuteranopia: distance('deuteranopia'),
    tritanopia: distance('tritanopia'),
  };
}

/** How comfortably two tones differ: 1 on the comfort line, above it comfortable (SPEC §16). */
export function comfortMargin(a: Rgb, b: Rgb, settings: Config = config): number {
  const d = pairDistances(a, b);
  const deficient = Math.min(d.protanopia, d.deuteranopia, d.tritanopia);
  return Math.min(d.normal / settings.colorComfortNormal, deficient / settings.colorComfortDeficient);
}

/**
 * The target color to suggest when the chosen pair is distinguishable but not comfortably so: the most
 * distinct one for these balls. Null when the pair is fine or no tone can be read. `tone` reads a custom
 * property from CSS, so the hint judges the current theme's tones.
 */
export function colorHint(
  ball: BallColor,
  target: TargetColor,
  tone: (token: string) => string,
  settings: Config = config,
): TargetColor | null {
  const ballTone = parseHex(tone(toneToken('ball', ball)));
  if (!ballTone) return null;
  let best: TargetColor | null = null;
  let bestMargin = -Infinity;
  let current: number | null = null;
  for (const id of targetColors) {
    const targetTone = parseHex(tone(toneToken('target', id)));
    if (!targetTone) return null;
    const margin = comfortMargin(ballTone, targetTone, settings);
    if (id === target) current = margin;
    if (margin > bestMargin) {
      best = id;
      bestMargin = margin;
    }
  }
  return current !== null && current < 1 && best !== target ? best : null;
}
