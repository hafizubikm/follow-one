import { describe, expect, it } from 'vitest';
import spec from '../docs/SPEC.md?raw';
import { copy, countdownNumerals, fill, textRuns } from '../src/copy.ts';

// SPEC §3 says "use this copy exactly", so copy.ts is checked against the table itself.
function specCopyTable(): Map<string, string> {
  const start = spec.indexOf('## 3. Screens and copy');
  const end = spec.indexOf('## 4.', start);
  const rows = new Map<string, string>();
  for (const line of spec.slice(start, end).split('\n')) {
    const match = /^\| (.+?) \| (.+) \|$/.exec(line);
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

const table = specCopyTable();
const row = (moment: string): string => {
  const text = table.get(moment);
  if (text === undefined) throw new Error(`SPEC §3 has no "${moment}" row`);
  return text;
};

/** The SPEC §5 ball visual-state table: state → glyph column. */
function specGlyphs(): Map<string, string> {
  const glyphs = new Map<string, string>();
  for (const match of spec.matchAll(/^\| `([a-z-]+)` \| `--[a-z]+` \| (\S+) \|/gm)) glyphs.set(match[1], match[2]);
  return glyphs;
}

describe('copy matches SPEC §3', () => {
  it('start screen', () => {
    expect(copy.title).toBe(row('Start title'));
    expect(copy.start.tagline).toBe(row('Start tagline'));
    expect(copy.start.meta).toBe(row('Start meta'));
    expect(copy.start.help).toBe(row('Start help'));
    expect(copy.start.button).toBe(row('Start button'));
  });

  it('HUD', () => {
    expect(copy.hud.intro).toBe(row('Intro (HUD)'));
    expect([...countdownNumerals, copy.hud.go].join(' · ')).toBe(row('Countdown (HUD)'));
    expect(copy.hud.tracking).toBe(row('Tracking (HUD)'));
    expect(copy.hud.finalWarning).toBe(row('Last 5 s (HUD)'));
    expect(copy.hud.freeze).toBe(row('Freeze (HUD)'));
    expect(copy.hud.returning).toBe(row('Returning (HUD)'));
    expect(copy.hud.selection).toBe(row('Selection (HUD)'));
    expect(copy.hud.checking).toBe(row('Checking (HUD)'));
  });

  it('result card', () => {
    const { correct, incorrect, playAgain } = copy.result;
    expect(`${correct.icon} ${correct.headline}`).toBe(row('Correct headline'));
    expect(correct.subline).toBe(row('Correct sub-line'));
    expect(`${incorrect.icon} ${incorrect.headline}`).toBe(row('Incorrect headline'));
    expect(incorrect.subline).toBe(row('Incorrect sub-line'));
    expect(playAgain).toBe(row('Play again button'));
  });

  it('ball buttons use the SPEC §8 accessible name', () => {
    expect(spec).toContain(`<button aria-label="${copy.ball}">`);
  });

  it('header controls', () => {
    const { on, off } = copy.sound;
    expect(`${on.icon} ${on.label} / ${off.icon} ${off.label}`).toBe(row('Sound toggle'));
    expect(Object.values(copy.theme.options).join(' · ')).toBe(row('Theme control'));
  });

  it('stat labels', () => {
    const s = copy.stats;
    const labels = [s.round, s.score, s.accuracy, `${s.streak} ${s.streakIcon}`, `${s.best} ${s.streakIcon}`];
    expect(labels.join(' · ')).toBe(row('Result stats'));
  });
});

describe('glyphs match SPEC §5', () => {
  it('★ ✓ ✕', () => {
    const glyphs = specGlyphs();
    expect(copy.glyphs.target).toBe(glyphs.get('target'));
    expect(copy.glyphs.target).toBe(glyphs.get('revealed-target'));
    expect(copy.glyphs.correct).toBe(glyphs.get('revealed-correct'));
    expect(copy.glyphs.wrong).toBe(glyphs.get('revealed-wrong-pick'));
  });
});

describe('fill', () => {
  it('replaces every placeholder', () => {
    expect(fill('You picked {picked} (#{pickedSlot}). {name} was #{targetSlot}.', {
      picked: 'Beta',
      pickedSlot: 7,
      name: 'Alpha',
      targetSlot: 3,
    })).toBe('You picked Beta (#7). Alpha was #3.');
  });

  it('leaves unknown placeholders visible rather than blank', () => {
    expect(fill('Hi {name}', {})).toBe('Hi {name}');
  });
});

describe('textRuns', () => {
  it('splits **bold** from plain text', () => {
    expect(textRuns('Your target is **Alpha**. Keep your eyes on it.')).toEqual([
      { text: 'Your target is ', strong: false },
      { text: 'Alpha', strong: true },
      { text: '. Keep your eyes on it.', strong: false },
    ]);
    expect(textRuns('Checking...')).toEqual([{ text: 'Checking...', strong: false }]);
    expect(textRuns('')).toEqual([]);
  });
});
