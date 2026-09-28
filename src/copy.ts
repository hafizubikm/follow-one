import { config } from './config.ts';

export const copy = {
  title: 'Follow One',

  start: {
    tagline: 'Can you keep your eyes on one ball while everything gets chaotic?',
    meta: `${config.ballCount} balls · ${config.trackingMs / 1000} seconds · 1 target`,
    help: "You'll be given a named ball. Keep track of it while the balls move and collide. At the end, find your target.",
    button: 'Start Game',
  },

  // Templates: {key} is filled by fill(); **text** is shown bold.
  hud: {
    intro: 'Your target is **{name}**. Keep your eyes on it.',
    go: 'GO!',
    tracking: 'Keep your eyes on {name}',
    finalWarning: 'Stay focused!',
    freeze: "Nice! Time's up.",
    returning: 'Getting into position...',
    selection: 'Which one was {name}?',
    checking: 'Checking...',
  },

  glyphs: { target: '★', correct: '✓', wrong: '✕' },

  sound: {
    on: { icon: '🔊', label: 'Sound on' },
    off: { icon: '🔇', label: 'Sound off' },
  },

  theme: {
    groupLabel: 'Theme',
    options: { light: 'Light', dark: 'Dark', system: 'System' },
  },

  stats: {
    round: 'Round',
    score: 'Score',
    accuracy: 'Accuracy',
    streak: 'Streak',
    best: 'Best',
    streakIcon: '🔥',
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
