import { config } from './config.ts';

export const copy = {
  title: 'Follow One',

  start: {
    tagline: 'Can you keep your eyes on one ball while everything gets chaotic?',
    meta: `${config.ballCount} balls · ${config.trackingMs / 1000} seconds · 1 target`,
    help: "You'll be given a named ball. Keep track of it while the balls move and collide. At the end, find your target.",
    button: 'Start Game',
  },

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
