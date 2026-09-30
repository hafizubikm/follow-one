export const config = {
  ballCount: 15, // default; Settings allows ballCountMin..ballCountMax (§16)
  ballCountMin: 10,
  ballCountMax: 30,
  targetCount: 1, // default; Settings allows targetCountMin..targetCountMax (§16)
  targetCountMin: 1,
  targetCountMax: 5, // at most half of the smallest game
  namePackId: 'greek',

  // arena units: radius = 1
  ballRadius: 0.09, // at the default ballCount; other counts scale by √(ballCount / n) (§5)
  ballRadiusMin: 0.065, // smallest readable ball (§5)
  slotRadius: 0.85, // ring radius at the default ballCount (§7)
  spawnMargin: 0.02,
  spawnGap: 0.03,
  spawnSpeedRange: [0.9, 1.1], // × the round's speed at spawn

  // motion
  baseSpeed: 0.45, // arena radii per second at Normal
  speedPresets: { slow: 0.7, normal: 1, fast: 1.3, extreme: 1.6 }, // × baseSpeed (§6)
  speedPreset: 'normal', // default Speed setting
  speedBand: [0.7, 1.3], // × the round's speed
  speedRestore: 0.1, // lerp toward the round's speed per physics substep
  physicsHz: 120,
  maxFrameMs: 50,
  collisionPasses: 3,

  // phase timing (ms)
  introMs: 2500,
  countdownFrom: 3, // countdown shows 3, 2, 1
  countdownStepMs: 1000,
  goMs: 500,
  trackingMs: 15000, // default; Settings allows trackingMsMin..trackingMsMax in trackingMsStep steps (§16)
  trackingMsMin: 10000,
  trackingMsMax: 60000,
  trackingMsStep: 5000,
  revealHoldMs: 1500,
  revealFadeMs: 500,
  finalWarningS: 5,
  freezeMs: 600,
  returnMs: 1000,
  returnMsReducedMotion: 600,
  slotLabelFadeFrom: 0.6, // slot numbers fade in over the rest of the glide
  settleMs: 300,
  suspenseMs: 1000,
  revealMs: 800,

  // layout
  arenaMaxPx: 560, // cap on the page column and the arena diameter (§4)
  fullWidthMaxPx: 432, // full-width column up to this (phones); wider, half the extra goes to side margins (§4)
  minHitPx: 44, // smallest ball hit area (§5)

  // colors (§16): ΔE is the OKLab distance ×100, deficiencies simulated as Machado et al. (2009) at full severity
  ballColor: 'blue', // default Ball color setting
  targetColor: 'red', // default Target color setting
  colorPairFloor: 6, // min ΔE of every ball/target pair, normal vision and each deficiency, both themes
  colorComfortNormal: 15, // comfortable at ≥ this under normal vision
  colorComfortDeficient: 8, // and ≥ this under each deficiency; below either, Settings shows the color hint

  // sound
  collisionClicks: false, // optional collision clicks (§10)
  collisionClicksPerSecond: 6,

  score: { correct: 100, streakBonus: 25 },
  storageKeys: {
    theme: 'followone.theme',
    sound: 'followone.sound',
    settings: 'followone.settings',
    best: 'followone.best', // the all-time best streak (§9)
  },
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
