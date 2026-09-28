import { describe, expect, it } from 'vitest';
import spec from '../docs/SPEC.md?raw';
import { config } from '../src/config.ts';
import { getPack, packIds } from '../src/names/packs.ts';

describe('name packs', () => {
  it('ships the greek pack exactly as listed in SPEC §5', () => {
    const listed = /ships `greek` only: (.+)\./.exec(spec)?.[1];
    expect(listed).toBeDefined();
    expect(getPack('greek').names.join(', ')).toBe(listed);
  });

  it('every registered pack has enough unique, non-empty names for the biggest game', () => {
    expect(packIds).toContain(config.namePackId);
    for (const id of packIds) {
      const pack = getPack(id);
      expect(pack.id).toBe(id);
      expect(new Set(pack.names).size, id).toBe(pack.names.length);
      expect(pack.names.length, id).toBeGreaterThanOrEqual(config.ballCountMax);
      for (const name of pack.names) expect(name.trim(), id).toBe(name);
      expect(pack.names.every((name) => name.length > 0)).toBe(true);
    }
  });

  it('rejects an unknown pack id', () => {
    expect(() => getPack('klingon')).toThrow(/klingon/);
  });
});
