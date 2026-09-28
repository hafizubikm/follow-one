import { describe, expect, it } from 'vitest';
import { createSfx, type AudioContextLike } from '../src/audio/sfx.ts';
import { config } from '../src/config.ts';
import { memoryStore, throwingStore } from './fakes.ts';

const key = config.storageKeys.sound;

describe('sound setting', () => {
  it('is on by default', () => {
    expect(createSfx(memoryStore()).enabled).toBe(true);
  });

  it('restores a stored off', () => {
    expect(createSfx(memoryStore({ [key]: 'off' })).enabled).toBe(false);
  });

  it('treats unknown stored values as on', () => {
    expect(createSfx(memoryStore({ [key]: 'maybe' })).enabled).toBe(true);
  });

  it('persists changes', () => {
    const store = memoryStore();
    const sfx = createSfx(store);

    sfx.setEnabled(false);
    expect(sfx.enabled).toBe(false);
    expect(store.data[key]).toBe('off');

    sfx.setEnabled(true);
    expect(sfx.enabled).toBe(true);
    expect(store.data[key]).toBe('on');
  });

  it('keeps working when storage throws or is unavailable', () => {
    for (const store of [throwingStore, null]) {
      const sfx = createSfx(store);
      expect(sfx.enabled).toBe(true);
      expect(() => sfx.setEnabled(false)).not.toThrow();
      expect(sfx.enabled).toBe(false);
    }
  });
});

/** A stand-in AudioContext that records what gets scheduled. */
function fakeAudio(state: AudioContextState = 'running', resumes = true) {
  const started: Array<{ freq: number; at: number }> = [];
  const masterLevels: number[] = [];
  let gains = 0;
  const param = (onSet?: (value: number) => void) => ({
    setValueAtTime: (value: number) => onSet?.(value),
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  });
  const ctx = {
    currentTime: 0,
    state,
    destination: {},
    resume: () => {
      if (!resumes) return Promise.reject(new Error('blocked'));
      ctx.state = 'running';
      return Promise.resolve();
    },
    createGain: () => {
      const isMaster = gains++ === 0;
      return { gain: param((v) => isMaster && masterLevels.push(v)), connect: (node: unknown) => node };
    },
    createOscillator: () => {
      let freq = 0;
      return {
        type: 'sine',
        frequency: param((v) => (freq ||= v)),
        connect: (node: unknown) => node,
        start: (at: number) => started.push({ freq, at }),
        stop: () => {},
      };
    },
  };
  let created = 0;
  const factory = () => {
    created++;
    return ctx as unknown as AudioContextLike;
  };
  return { ctx, factory, started, masterLevels, created: () => created };
}

describe('sound effects (SPEC §10)', () => {
  it('creates no audio context until the first gesture unlocks it', () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore(), audio.factory);
    sfx.play('tick');
    expect(audio.created()).toBe(0);
    sfx.unlock();
    sfx.unlock();
    expect(audio.created()).toBe(1);
    sfx.play('tick');
    expect(audio.started).toHaveLength(1);
  });

  it('never creates or schedules anything while off', () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore({ [key]: 'off' }), audio.factory);
    sfx.unlock();
    sfx.play('go');
    expect(audio.created()).toBe(0);
    expect(audio.started).toHaveLength(0);

    sfx.setEnabled(true); // the toggle click is a gesture, so it unlocks
    expect(audio.created()).toBe(1);
    sfx.play('go');
    expect(audio.started.length).toBeGreaterThan(0);
  });

  it('silences what is ringing when switched off, and schedules nothing more', () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore(), audio.factory);
    sfx.unlock();
    sfx.play('chime');
    const before = audio.started.length;
    sfx.setEnabled(false);
    expect(audio.masterLevels.at(-1)).toBe(0);
    sfx.play('chime');
    expect(audio.started).toHaveLength(before);
    sfx.setEnabled(true);
    expect(audio.masterLevels.at(-1)).toBe(1);
  });

  it('plays a rising arpeggio for a correct answer and a falling low tone for a miss', () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore(), audio.factory);
    sfx.unlock();
    sfx.play('correct');
    const arpeggio = audio.started.map((s) => s.freq);
    expect(arpeggio).toHaveLength(4);
    expect([...arpeggio].sort((a, b) => a - b)).toEqual(arpeggio);
    expect(audio.started.map((s) => s.at)).toEqual([...audio.started.map((s) => s.at)].sort((a, b) => a - b));

    audio.started.length = 0;
    sfx.play('incorrect');
    expect(audio.started).toHaveLength(1);
    expect(audio.started[0].freq).toBeLessThan(arpeggio[0]);
  });

  it('has a sound for every cue', () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore(), audio.factory);
    sfx.unlock();
    for (const name of ['chime', 'tick', 'go', 'softTick', 'freeze', 'correct', 'incorrect', 'collision'] as const) {
      const before = audio.started.length;
      sfx.play(name);
      expect(audio.started.length, name).toBeGreaterThan(before);
    }
  });

  it(`throttles collision clicks to ${config.collisionClicksPerSecond} per second`, () => {
    const audio = fakeAudio();
    const sfx = createSfx(memoryStore(), audio.factory);
    sfx.unlock();
    for (let i = 0; i < 120; i++) {
      audio.ctx.currentTime = i / 60; // a collision every frame for 2 s
      sfx.play('collision');
    }
    expect(audio.started.length).toBeLessThanOrEqual(2 * config.collisionClicksPerSecond + 1);
    expect(audio.started.length).toBeGreaterThanOrEqual(2 * config.collisionClicksPerSecond - 1);
  });

  it('plays while a suspended context resumes, and drops sounds if it never starts', async () => {
    const starting = fakeAudio('suspended');
    const sfx = createSfx(memoryStore(), starting.factory);
    sfx.unlock();
    sfx.play('chime');
    expect(starting.started.length).toBeGreaterThan(0);

    const blocked = fakeAudio('suspended', false);
    const muted = createSfx(memoryStore(), blocked.factory);
    muted.unlock();
    await Promise.resolve();
    await Promise.resolve();
    muted.play('tick');
    muted.play('go');
    expect(blocked.started).toHaveLength(0);
  });

  it('keeps working in a browser without Web Audio', () => {
    const sfx = createSfx(memoryStore(), () => null);
    expect(() => {
      sfx.unlock();
      sfx.play('go');
      sfx.setEnabled(false);
      sfx.setEnabled(true);
    }).not.toThrow();
  });
});
