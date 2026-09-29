import { describe, expect, it } from 'vitest';
import spec from '../docs/SPEC.md?raw';
import { config } from '../src/config.ts';

// SPEC §11 lists every default and config.ts holds them, so a default can't change in one and not the other.
function specConfig(): unknown {
  const block = /^export const config = (\{[\s\S]*?^\}) as const;$/m.exec(spec)?.[1];
  if (!block) throw new Error('SPEC §11 has no config block');
  return (new Function(`return (${block});`) as () => unknown)();
}

describe('config', () => {
  it('matches the defaults in SPEC §11', () => {
    expect(config).toEqual(specConfig());
  });

  it('leaves the page column room to grow side margins before the desktop cap (SPEC §4)', () => {
    expect(config.fullWidthMaxPx).toBeGreaterThan(0);
    expect(config.fullWidthMaxPx).toBeLessThan(config.arenaMaxPx);
  });
});
