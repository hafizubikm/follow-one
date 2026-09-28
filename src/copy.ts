import { config } from './config.ts';

export const copy = {
  title: 'Follow One',

  start: {
    tagline: 'Can you keep your eyes on one ball while everything gets chaotic?',
    // {n}: the ball-count setting; {seconds}: trackingMs in seconds.
    meta: '{n} balls · {seconds} seconds · 1 target',
    help: "You'll be given a named ball. Keep track of it while the balls move and collide. At the end, find your target.",
    button: 'Start Game',
  },

  // Templates: {key} is filled by fill(); **text** is shown bold.
  hud: {
    intro: 'Your target is **{name}**. Keep your eyes on it.',
    tracking: 'Keep your eyes on {name}',
    finalWarning: 'Stay focused!',
    freeze: "Nice! Time's up.",
    returning: 'Getting into position...',
    selection: 'Which one was {name}?',
    checking: 'Checking...',
  },

  /** Shown large in the arena after the countdown numerals (SPEC §5). */
  countdown: { go: 'GO!' },

  glyphs: { target: '★', correct: '✓', wrong: '✕' },

  /** A ball's accessible name while it can be picked (SPEC §8). */
  ball: 'Ball {slot}',

  result: {
    correct: { icon: '🎯', headline: 'Nailed it!', subline: 'You found {name}.' },
    incorrect: { icon: '👀', headline: 'Not quite!', subline: 'You picked {picked} (#{pickedSlot}). {name} was #{targetSlot}.' },
    playAgain: 'Play Again',
  },

  settings: {
    /** The ⚙ button's accessible name and the drawer's heading. */
    title: 'Settings',
    close: 'Close settings',
    sections: { game: 'Game', appearance: 'Appearance' },
    balls: { label: 'Balls', value: '{n} balls' },
    speed: { label: 'Speed', options: { slow: 'Slow', normal: 'Normal', fast: 'Fast', extreme: 'Extreme' } },
    duration: { label: 'Duration', value: '{seconds} seconds' },
    theme: { label: 'Theme', options: { light: 'Light', dark: 'Dark', system: 'System' } },
    sound: { label: 'Sound', on: 'On', off: 'Off' },
    locked: 'Some settings are locked until this round ends.',
  },

  stats: {
    round: 'Round',
    score: 'Score',
    accuracy: 'Accuracy',
    streak: 'Streak',
    best: 'Best',
    streakIcon: '🔥',
    accuracyValue: '{percent}%',
  },
} as const;

/** Countdown numerals, e.g. ['3', '2', '1']. */
export const countdownNumerals: readonly string[] = Array.from({ length: config.countdownFrom }, (_, i) =>
  String(config.countdownFrom - i),
);

/** Replaces each {key} in a copy template. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}

export interface TextRun {
  readonly text: string;
  readonly strong: boolean;
}

/** Splits **bold** markup into runs. */
export function textRuns(text: string): TextRun[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((run) => run.text !== '');
}
