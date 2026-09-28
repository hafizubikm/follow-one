import { greek } from './greek.ts';

/** A themed set of ball names: at least `config.ballCountMax` unique names, most familiar first. */
export interface NamePack {
  readonly id: string;
  readonly label: string;
  readonly names: readonly string[];
}

// Adding a pack = one new file + one entry here (SPEC §5).
const registry: Readonly<Record<string, NamePack>> = {
  [greek.id]: greek,
};

export const packIds: readonly string[] = Object.keys(registry);

export function getPack(id: string): NamePack {
  const pack = registry[id] as NamePack | undefined;
  if (!pack) throw new Error(`Unknown name pack "${id}"`);
  return pack;
}
