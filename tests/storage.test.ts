import { describe, expect, it } from 'vitest';
import { readKey, writeKey } from '../src/util/storage.ts';
import { memoryStore, throwingStore } from './fakes.ts';

describe('storage wrappers', () => {
  it('round-trips through a working store', () => {
    const store = memoryStore();
    writeKey(store, 'k', 'v');
    expect(readKey(store, 'k')).toBe('v');
    expect(readKey(store, 'missing')).toBeNull();
  });

  it('swallows errors from a throwing store', () => {
    expect(() => writeKey(throwingStore, 'k', 'v')).not.toThrow();
    expect(readKey(throwingStore, 'k')).toBeNull();
  });

  it('treats a missing store as empty', () => {
    expect(() => writeKey(null, 'k', 'v')).not.toThrow();
    expect(readKey(null, 'k')).toBeNull();
  });
});
