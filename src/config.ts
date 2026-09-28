export const config = {
  ballCount: 15,
  namePackId: 'greek',

  // arena units: radius = 1
  ballRadius: 0.09,
  slotRadius: 0.85,
  spawnMargin: 0.02,
  spawnGap: 0.03,
  spawnSpeedRange: [0.9, 1.1], // × baseSpeed at spawn

  // motion
  baseSpeed: 0.45, // arena radii per second
  speedBand: [0.7, 1.3], // × baseSpeed
  speedRestore: 0.1, // lerp toward baseSpeed per physics step
  physicsHz: 120,
  maxFrameMs: 50,
  collisionPasses: 3,

  // phase timing (ms)
  introMs: 2500,
  countdownFrom: 3, // countdown shows 3, 2, 1
  countdownStepMs: 1000,
  goMs: 500,
  trackingMs: 15000,
  revealHoldMs: 1500,
  revealFadeMs: 500,
  finalWarningS: 5,
  freezeMs: 600,
  returnMs: 1000,
  returnMsReducedMotion: 600,
  settleMs: 300,
  suspenseMs: 1000,
  revealMs: 800,

  // layout
  arenaMaxPx: 640, // desktop cap on the arena diameter (§4)
  minHitPx: 44, // smallest ball hit area (§5)

  score: { correct: 100, streakBonus: 25 },
  storageKeys: { theme: 'followone.theme', sound: 'followone.sound', best: 'followone.best' },
} as const;

/** The shape of config with plain number/string types, so tests can pass variants of it. */
export type Config = Widen<typeof config>;

type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends boolean
      ? boolean
      : T extends readonly [infer A, infer B]
        ? readonly [Widen<A>, Widen<B>]
        : { readonly [K in keyof T]: Widen<T[K]> };
