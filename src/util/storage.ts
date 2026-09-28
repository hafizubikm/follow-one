/** The subset of the Web Storage API we use; injected so this stays DOM-free. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Storage throws in private modes, with blocked cookies, or when full; every access is guarded.
export function readKey(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeKey(store: KeyValueStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Preference just won't persist.
  }
}
