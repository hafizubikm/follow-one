import { describe, expect, it } from 'vitest';
import spec from '../docs/SPEC.md?raw';
import { config } from '../src/config.ts';
import { copy, countdownNumerals, fill, targetCountText, textRuns } from '../src/copy.ts';

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
    expect(copy.start.taglineSeveral).toBe(row('Start tagline (several targets)'));
    expect(copy.start.meta).toBe(row('Start meta'));
    expect(`${copy.start.targetCount.one} · ${copy.start.targetCount.several}`).toBe(row('Target count'));
    expect(copy.start.help).toBe(row('Start help'));
    expect(copy.start.helpSeveral).toBe(row('Start help (several targets)'));
    expect(copy.start.button).toBe(row('Start button'));
  });

  it('HUD', () => {
    expect(copy.hud.intro).toBe(row('Intro (HUD)'));
    expect([...countdownNumerals, copy.countdown.go].join(' · ')).toBe(row('Countdown (arena)'));
    expect(copy.hud.tracking).toBe(row('Tracking (HUD)'));
    expect(copy.hud.finalWarning).toBe(row('Last 5 s (HUD)'));
    expect(copy.hud.freeze).toBe(row('Freeze (HUD)'));
    expect(copy.hud.returning).toBe(row('Returning (HUD)'));
    expect(copy.hud.selection).toBe(row('Selection (HUD)'));
    expect(copy.hud.checking).toBe(row('Checking (HUD)'));
  });

  it('HUD with several targets', () => {
    const { several } = copy.hud;
    expect(several.intro).toBe(row('Intro (HUD, several targets)'));
    expect(several.tracking).toBe(row('Tracking (HUD, several targets)'));
    expect(several.selection).toBe(row('Selection (HUD, several targets)'));
    expect(several.picksLeft).toBe(row('Selection, picks left (HUD)'));
  });

  it('result card', () => {
    const { correct, incorrect, playAgain } = copy.result;
    expect(`${correct.icon} ${correct.headline}`).toBe(row('Correct headline'));
    expect(correct.subline).toBe(row('Correct sub-line'));
    expect(correct.sublineSeveral).toBe(row('Correct sub-line (several targets)'));
    expect(`${incorrect.icon} ${incorrect.headline}`).toBe(row('Incorrect headline'));
    expect(incorrect.subline).toBe(row('Incorrect sub-line'));
    expect(incorrect.sublineSeveral).toBe(row('Incorrect sub-line (several targets)'));
    expect(playAgain).toBe(row('Play again button'));
  });

  it('ball buttons use the SPEC §8 accessible names', () => {
    expect(spec).toContain(`<button aria-label="${copy.ball}">`);
    expect(spec).toContain(`its accessible name becomes "${copy.ballPicked}"`);
  });

  it('counts the targets for the start screen: "1 target", "{k} targets"', () => {
    expect(targetCountText(1)).toBe('1 target');
    expect(targetCountText(2)).toBe('2 targets');
    expect(targetCountText(5)).toBe('5 targets');
    expect(fill(copy.start.meta, { n: 15, seconds: 15, targets: targetCountText(1) })).toBe('15 balls · 15 seconds · 1 target');
  });

  it('settings drawer', () => {
    const s = copy.settings;
    const control = (label: string, values: Readonly<Record<string, string>>) => [label, ...Object.values(values)].join(' · ');
    expect(s.title).toBe(row('Settings button and title'));
    expect(s.close).toBe(row('Settings close'));
    expect(Object.values(s.sections).join(' · ')).toBe(row('Settings sections'));
    expect(`${s.balls.label} · ${s.balls.value}`).toBe(row('Balls setting'));
    const targetCounts = Array.from({ length: config.targetCountMax - config.targetCountMin + 1 }, (_, i) => config.targetCountMin + i);
    expect([s.targets.label, ...targetCounts].join(' · ')).toBe(row('Targets setting'));
    expect(control(s.speed.label, s.speed.options)).toBe(row('Speed setting'));
    expect(`${s.duration.label} · ${s.duration.value}`).toBe(row('Duration setting'));
    expect(control(s.ballColor.label, s.ballColor.options)).toBe(row('Ball color setting'));
    expect(control(s.targetColor.label, s.targetColor.options)).toBe(row('Target color setting'));
    expect(s.colorHint).toBe(row('Color hint'));
    expect(control(s.theme.label, s.theme.options)).toBe(row('Theme setting'));
    expect(`${s.sound.label} · ${s.sound.on} · ${s.sound.off}`).toBe(row('Sound setting'));
    expect(s.locked).toBe(row('Settings locked'));
  });

  it('names every speed preset in config, in order', () => {
    expect(Object.keys(copy.settings.speed.options)).toEqual(Object.keys(config.speedPresets));
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
