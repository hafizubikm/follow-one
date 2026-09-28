import { config } from '../config.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

export interface Sfx {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
}

export function createSfx(store: KeyValueStore | null): Sfx {
  let enabled = readKey(store, config.storageKeys.sound) !== 'off';

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      writeKey(store, config.storageKeys.sound, on ? 'on' : 'off');
    },
  };
}
