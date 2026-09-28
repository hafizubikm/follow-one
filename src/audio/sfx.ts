import { config } from '../config.ts';
import { readKey, writeKey, type KeyValueStore } from '../util/storage.ts';

export type SoundName = 'chime' | 'tick' | 'go' | 'softTick' | 'freeze' | 'correct' | 'incorrect' | 'collision';

export interface Sfx {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** Creates or resumes the audio context. Call it from a user gesture (SPEC §10). */
  unlock(): void;
  play(name: SoundName): void;
}

/** The slice of AudioContext this module uses, so tests can pass a fake. */
export type AudioContextLike = Pick<
  AudioContext,
  'currentTime' | 'destination' | 'state' | 'resume' | 'createOscillator' | 'createGain'
>;

interface Tone {
  readonly freq: number;
  /** Glide to this frequency over the tone. */
  readonly to?: number;
  readonly wave: OscillatorType;
  /** Seconds after the cue. */
  readonly at: number;
  readonly dur: number;
  readonly gain: number;
}

// The sound design, kept here as the palette is kept in CSS: short, soft, synthesized tones.
const notes = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.51, E7: 2637.02 };
const recipes: Readonly<Record<SoundName, readonly Tone[]>> = {
  chime: [
    { freq: notes.E6, wave: 'sine', at: 0, dur: 0.9, gain: 0.12 },
    { freq: notes.E7, wave: 'sine', at: 0, dur: 0.45, gain: 0.035 },
  ],
  tick: [{ freq: notes.A5, wave: 'sine', at: 0, dur: 0.09, gain: 0.18 }],
  go: [
    { freq: notes.A5, wave: 'triangle', at: 0, dur: 0.1, gain: 0.16 },
    { freq: notes.E6, wave: 'triangle', at: 0.07, dur: 0.26, gain: 0.18 },
  ],
  softTick: [{ freq: notes.C6, wave: 'sine', at: 0, dur: 0.05, gain: 0.06 }],
  freeze: [{ freq: notes.G5, to: notes.G5 / 2, wave: 'triangle', at: 0, dur: 0.32, gain: 0.15 }],
  correct: [notes.C5, notes.E5, notes.G5, notes.C6].map((freq, i) => ({
    freq,
    wave: 'triangle' as const,
    at: i * 0.075,
    dur: i === 3 ? 0.42 : 0.18,
    gain: 0.15,
  })),
  incorrect: [{ freq: 233.08, to: 196, wave: 'sine', at: 0, dur: 0.5, gain: 0.18 }],
  collision: [{ freq: 1600, wave: 'triangle', at: 0, dur: 0.025, gain: 0.025 }],
};

const ATTACK_S = 0.006;
const SILENT = 0.0001;

function browserContext(): AudioContextLike | null {
  const scope = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  try {
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

export function createSfx(
  store: KeyValueStore | null,
  createContext: () => AudioContextLike | null = browserContext,
): Sfx {
  let enabled = readKey(store, config.storageKeys.sound) !== 'off';
  let ctx: AudioContextLike | null = null;
  let master: GainNode | null = null;
  let resuming = false;
  let lastCollisionAt = -Infinity;

  const unlock = () => {
    if (!enabled) return;
    if (!ctx) {
      ctx = createContext();
      if (!ctx) return;
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    master?.gain.setValueAtTime(1, ctx.currentTime);
    if (ctx.state !== 'running' && !resuming) {
      resuming = true;
      const settled = () => {
        resuming = false;
      };
      ctx.resume().then(settled, settled);
    }
  };

  const tone = (audio: AudioContextLike, out: GainNode, t: Tone) => {
    const start = audio.currentTime + t.at;
    const end = start + t.dur;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = t.wave;
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end);
    env.gain.setValueAtTime(SILENT, start);
    env.gain.linearRampToValueAtTime(t.gain, start + ATTACK_S);
    env.gain.exponentialRampToValueAtTime(SILENT, end);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(end + 0.05);
  };

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      writeKey(store, config.storageKeys.sound, on ? 'on' : 'off');
      if (on) unlock();
      // Silence anything still ringing; nothing new is scheduled while off.
      else if (ctx && master) master.gain.setValueAtTime(0, ctx.currentTime);
    },
    unlock,
    play(name) {
      if (!enabled || !ctx || !master) return;
      // A context that never started would release everything queued at once later; drop instead.
      if (ctx.state !== 'running' && !resuming) return;
      if (name === 'collision') {
        if (ctx.currentTime - lastCollisionAt < 1 / config.collisionClicksPerSecond) return;
        lastCollisionAt = ctx.currentTime;
      }
      for (const t of recipes[name]) tone(ctx, master, t);
    },
  };
}
