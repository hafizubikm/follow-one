import { describe, expect, it } from 'vitest';
import spec from '../docs/SPEC.md?raw';
import { copy } from '../src/copy.ts';

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

describe('copy matches SPEC §3', () => {
  it('start screen', () => {
    expect(copy.title).toBe(row('Start title'));
    expect(copy.start.tagline).toBe(row('Start tagline'));
    expect(copy.start.meta).toBe(row('Start meta'));
    expect(copy.start.help).toBe(row('Start help'));
    expect(copy.start.button).toBe(row('Start button'));
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
