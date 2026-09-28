# Follow One — Game Specification (v1)

Build a polished, responsive, browser-only cognitive tracking game.

**Pitch:** Fifteen balls bounce around a circular arena for 15 seconds. You were told which one to follow. When they stop, point to it.

This document is the single source of truth. Every numeric value below is a default that lives in `config.ts`; game logic never hard-codes them.

---

## 0. Tech stack and project shape

- Vite + TypeScript (strict), no UI framework. Plain CSS with custom properties.
- Output is a static site (`npm run build` → `dist/`) that works from any subpath and from `file://`. `base: './'` covers subpaths. For `file://`, the build emits one deferred classic script (IIFE) and no `crossorigin` attributes, because browsers block module scripts and CORS-mode stylesheets on `file://` pages.
- No backend, accounts, database, analytics, ads, leaderboards, multiplayer, social login or payments.
- Vitest for pure modules. `physics/`, `game/` and `names/` must be importable without a DOM.

```
src/
  main.ts                 bootstrap: build the page shell, wire modules, start the loop
  loop.ts                 the single requestAnimationFrame loop: fixed steps, then one render (§6)
  debug.ts                dev-only free-run (`?debug=1`, §13): balls bounce forever, speed/radius sliders
  config.ts               every tunable (see §11)
  copy.ts                 every user-facing string (§3)
  game/
    stateMachine.ts       states, transitions, phase timers (§12)
    round.ts              new-round setup: spawn, target pick, name assignment
    slots.ts              ring geometry + angular slot assignment (§7)
    score.ts              scoring + session stats (§9)
  physics/
    world.ts              integrate, boundary, ball–ball collisions, speed regulation (§6)
    vec.ts
  render/
    dom.ts                tiny element helpers (el, aria-hidden icon)
    header.ts             title, sound toggle, theme control
    arena.ts              arena element, ball elements, ring labels, ball visual states
    hud.ts                message line, timer, aria-live region
    screens.ts            start screen, stats strip, result card
  input/
    selection.ts          enables/locks ball buttons, keyboard handling
  audio/
    sfx.ts                Web Audio synthesized effects, unlock on first gesture
  theme/
    theme.ts              light/dark/system + persistence
  names/
    packs.ts              NamePack type, registry, getPack(id)
    greek.ts
  util/
    random.ts             randomInt, randomBetween, shuffle (Fisher–Yates)
    storage.ts            try/catch wrappers around an injected localStorage
    fixedStep.ts          fixed-timestep accumulator with clamped frame time (§6)
  styles/                 plain CSS: tokens, base, layout, then one file per render module
tests/
  physics.test.ts  round.test.ts  slots.test.ts  score.test.ts  stateMachine.test.ts
```

Suggested `CLAUDE.md` for the repo:

```
Read docs/SPEC.md before any change; it is the source of truth.
TypeScript strict, no UI framework, all tunables in src/config.ts.
physics/ never branches on which ball is the target.
Write/keep Vitest tests for physics invariants, target selection, slots, scoring, state transitions.
Build in the phase order of SPEC.md §13; run tests before moving to the next phase.
```

---

## 1. The round, as the player experiences it

Meet your target → Remember it → Follow it → Don't lose it → Time's up → Find it → Did you get it? → Play again.

| Step | What happens | Duration |
|---|---|---|
| 1 | Start screen. Player clicks **Start Game**. | — |
| 2 | Round is built: 15 balls at random interior positions, one chosen as target, names shuffled. | — |
| 3 | Intro: all balls shown stationary in the arena; the target is highlighted and labelled. HUD: "Your target is Alpha. Keep your eyes on it." | 2.5 s |
| 4 | Countdown 3 → 2 → 1 in the HUD. Balls still stationary, target still highlighted. | 3 s |
| 5 | Motion starts. HUD shows "GO!" briefly, then "Keep your eyes on Alpha". Timer 15 → 1. | 15 s |
| 6 | The target's highlight fades out early in the motion (§2.1). From then on all balls are identical. | fade ends at 2 s |
| 7 | Last 5 seconds: HUD "Stay focused!", soft tick. | — |
| 8 | Timer hits 0: physics freezes. HUD "Nice! Time's up." | 0.6 s |
| 9 | Slots are assigned by angular order (§7); balls glide to the ring. HUD "Getting into position...". | 1 s |
| 10 | Selection: balls become buttons, slot numbers appear. HUD "Which one was Alpha?" | until pick |
| 11 | Player picks one. Input locks. Picked ball gets an outline. HUD "Checking..." | 1 s |
| 12 | Reveal: the real target turns red with ★. Correct/incorrect visuals + sound. | 0.8 s |
| 13 | Result card with headline, stats and **Play Again**. | — |
| 14 | Play Again → step 2 with a fresh random target. | — |

At every moment exactly one instruction is visible in the HUD. The player should never wonder what to do next.

---

## 2. Fairness rules (non-negotiable)

The game is only fun if tracking is the only way to win.

1. **Reveal window.** The target is highlighted during `TARGET_INTRO`, `COUNTDOWN`, and the first `revealHoldMs` of `TRACKING`; the highlight (color, ★, name label, pulse) then fades to neutral over `revealFadeMs`. From that moment until `REVEAL`, the target is pixel-identical to every other ball: same size, color, label (none), stacking rules, hit area. No arrow, glow, outline, cursor hint or DOM attribute that CSS or a curious player could see.
2. **Start ≠ finish.** Balls spawn at random non-overlapping positions inside the arena, never on the ring. Slots are assigned only when the timer ends, from the balls' positions at that instant (§7). Nothing visible before or during tracking predicts the target's slot number.
3. **Identical physics.** The target uses the same spawn, speed, collision and boundary code paths as every other ball. `physics/` contains no reference to `isTarget` or `targetId`.
4. **Fresh randomness every round.** Target = uniform pick over the 15 balls (`Math.floor(Math.random() * ballCount)`). Names are shuffled over the balls. Spawn positions and velocities are random. Repeating the previous target by chance is fine; deliberately avoiding or forcing repeats is not.
5. **Identity by ID.** `targetId` is stored at round start. Never identify the target by array index, DOM order or slot number during motion.

---

## 3. Screens and copy

Use this copy exactly. `{name}` = target name, `{picked}` = the picked ball's name, `#{pickedSlot}` / `#{targetSlot}` = slot numbers. The numbers in the start meta line come from config (`ballCount`, `trackingMs`).

| Moment | Text |
|---|---|
| Start title | Follow One |
| Start tagline | Can you keep your eyes on one ball while everything gets chaotic? |
| Start meta | 15 balls · 15 seconds · 1 target |
| Start help | You'll be given a named ball. Keep track of it while the balls move and collide. At the end, find your target. |
| Start button | Start Game |
| Intro (HUD) | Your target is **{name}**. Keep your eyes on it. |
| Countdown (HUD) | 3 · 2 · 1 · GO! |
| Tracking (HUD) | Keep your eyes on {name} |
| Last 5 s (HUD) | Stay focused! |
| Freeze (HUD) | Nice! Time's up. |
| Returning (HUD) | Getting into position... |
| Selection (HUD) | Which one was {name}? |
| Checking (HUD) | Checking... |
| Correct headline | 🎯 Nailed it! |
| Correct sub-line | You found {name}. |
| Incorrect headline | 👀 Not quite! |
| Incorrect sub-line | You picked {picked} (#{pickedSlot}). {name} was #{targetSlot}. |
| Result stats | Round · Score · Accuracy · Streak 🔥 · Best 🔥 |
| Play again button | Play Again |
| Sound toggle | 🔊 Sound on / 🔇 Sound off |
| Theme control | Light · Dark · System |

Never use technical language ("tracking phase initiated", "select target entity").

**Start screen:** title, tagline, meta line, Start Game, help sentence. Nothing else.

**Result card:** headline, sub-line, the five stats, Play Again (focused on entry). Play Again starts the next round directly; it does not return to the start screen.

---

## 4. Layout and responsiveness

- Vertical stack: **header** (title, sound toggle, theme control) → **HUD** (message + timer; fixed height so nothing jumps) → **arena** → **stats strip** (Round · Score · Streak) or, after a round, the **result card**.
- Arena diameter = `min(available width − padding, available height − chrome)`, capped at 640 px (`arenaMaxPx`) on desktop. Mobile portrait: nearly full width. Landscape phones: height-limited, still playable.
- No horizontal scrolling in any state. Size elements correctly rather than hiding overflow.
- Use `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and safe-area insets for header/footer padding.
- Overlays never cover the balls during `TARGET_INTRO`, `COUNTDOWN`, `TRACKING` or `RETURNING`. Countdown numbers and the timer live in the HUD, not in the arena center.
- The arena size is computed the same way in every state so the layout never shifts between states.
- The result card appears below the arena; the arena stays visible with both highlighted balls.

**Normalized coordinates.** All positions and radii are stored in arena units: center `(0, 0)`, arena radius `1`. The renderer multiplies by the current pixel radius each frame. Resizing or rotating mid-round therefore just rescales; physics never sees pixels.

---

## 5. Balls, names, rendering

```ts
interface Ball {
  id: number;             // 0..14, stable within a round
  name: string;           // from the name pack, shuffled per round
  x: number; y: number;   // normalized, arena radius = 1, y down
  vx: number; vy: number; // normalized units per second
  r: number;              // = config.ballRadius
  slot: number | null;    // 1..15, assigned at the freeze
}

interface Round {
  balls: Ball[];
  targetId: number;
  namePackId: string;
}
```

**Name packs** (`names/packs.ts`):

```ts
interface NamePack { id: string; label: string; names: string[] } // ≥ ballCount unique names
```

- Registry keyed by id; the engine calls `getPack(config.namePackId)` and never references a literal name.
- v1 ships `greek` only: Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Eta, Theta, Iota, Kappa, Lambda, Mu, Nu, Xi, Omicron.
- Adding a pack (Space, Animals, Fantasy, Robots, Nature…) = one new file + one registry entry, no engine change.
- Each round: `shuffle(pack.names).slice(0, ballCount)` assigned to balls by index.

**Rendering (recommended):** 15 absolutely positioned elements inside the arena, moved each frame with `transform: translate3d(...)` (compositor-only; 15 elements is trivial at 60 fps). The same elements become `<button>`s in `SELECTION`, so there is no canvas↔DOM switch and no visual pop. Canvas 2D is acceptable for the motion phases only if the selection ring is a DOM overlay that matches the canvas drawing exactly.

**Ball radius:** `ballRadius = 0.09` normalized (≈15 px on a 340 px arena, ≈29 px on 640 px). Selection hit area is at least 44 × 44 px (`minHitPx`) regardless of drawn size.

**Ball visual states** (color is never the only cue):

| State | Fill | Glyph | Label | Used in |
|---|---|---|---|---|
| `neutral` | `--ball` | — | — | everywhere |
| `target` | `--target` | ★ | name above | intro, countdown, reveal window; fades to neutral |
| `picked` | `--ball` | — | 3 px outline `--text` | checking |
| `revealed-correct` | `--target` | ✓ | name | reveal/result when picked = target |
| `revealed-target` | `--target` | ★ | name | reveal/result when incorrect |
| `revealed-wrong-pick` | `--ball` | ✕ | outline + picked name | reveal/result when incorrect |

Slot numbers (1–15) render as small muted labels just outside each slot during `SELECTION`, `CHECKING`, `REVEAL` and `RESULT` only.

---

## 6. Physics

Runs only in `TRACKING`. Pure functions over the physical part of each ball (`Body`: position, velocity, radius), so physics never sees ids, names or the target; no DOM access; deterministic given inputs (the random source for the two fallbacks below is an input, `Math.random` by default).

- **Timestep.** Fixed `physicsHz = 120`. The rAF loop accumulates frame time clamped to `maxFrameMs = 50` and steps the world. Rendering interpolates positions between the last two steps, so motion stays smooth when a display's refresh rate is not a multiple of 120 Hz. The 15 s timer, the reveal fade and every phase timer use this same simulation clock, so a hidden or throttled tab pauses the round instead of desyncing it.
- **Spawn.** Rejection-sample positions with `|p| ≤ 1 − r − spawnMargin` and pairwise center distance `≥ 2r + spawnGap`. Direction uniform random; speed `baseSpeed × rand(spawnSpeedRange)` (default 0.9–1.1).
- **Integrate.** `p += v · dt`.
- **Arena boundary.** If `|p| + r > 1`: `n = p / |p|`; set `p = n · (1 − r)`; if `v · n > 0` reflect `v -= 2 (v · n) n`.
- **Ball–ball** (equal mass, elastic). For each pair with `d = |pB − pA| < 2r`: `n = (pB − pA) / d` (random unit vector if `d ≈ 0`); push each ball apart by `(2r − d) / 2` along `n`; let `s = (vA − vB) · n`; if `s > 0` (approaching): `vA -= s · n`, `vB += s · n`. Run `collisionPasses = 3` per step so clusters settle without jitter.
- **Speed regulation** (after collisions): lerp each ball's `|v|` toward `baseSpeed` by `speedRestore` per step, then clamp to `speedBand × baseSpeed`. Keeps every ball lively, prevents dead stops and runaways, and keeps collisions visibly physical. A velocity of exactly zero (a square hit on a ball moving across the line of impact) takes a random direction.
- **Step order.** integrate → boundary → `collisionPasses` × (ball–ball pass → boundary) → speed regulation. Re-applying the boundary after each pass keeps the boundary invariant exact when a collision pushes a ball into the wall.
- **Defaults.** `baseSpeed = 0.45` arena radii/second (≈4.5 s to cross the arena). Tune for feel in the debug free-run mode.
- **Invariants** (unit-tested over ≥ 10 000 steps): no `NaN`; every ball satisfies `|p| + r ≤ 1 + 1e-6`; no pair overlaps by more than `1e-3` after a step; every speed within the band; no ball's speed is exactly zero for more than one step.

Never teleport balls, never reposition them per frame, never treat the target differently.

---

## 7. Ring slots and the return glide

- 15 slots on a circle of radius `slotRadius = 0.85`, slot 1 at 12 o'clock, numbered clockwise. Slot `k` center angle: `θk = 2π (k − 1) / 15` measured clockwise from 12 o'clock.
- **Assignment at the freeze:** compute each ball's angle `θ = atan2(x, −y)` normalized to `[0, 2π)` (clockwise from 12 o'clock in screen coordinates), sort ascending (tie-break by distance from center), and give the k-th ball slot `k`. Each ball therefore glides a short distance to its own part of the ring; paths rarely cross, so a player who was tracking can follow the glide, and one who wasn't gains nothing.
- **Glide:** straight line, ease-in-out, `returnMs = 1000` (`returnMsReducedMotion = 600`), physics off. Brief overlaps during the glide are acceptable.
- Slot numbers fade in during the last part of the glide.

---

## 8. Selection, reveal, result

- After `settleMs`, each ball element becomes `<button aria-label="Ball {slot}">`. Tab order = slot order. Enter/Space or tap selects. Visible hover/press and `:focus-visible` states. Do not move focus into the ring automatically.
- The first activation locks input immediately; later activations are ignored. The picked ball gets the `picked` state; HUD "Checking..."; wait `suspenseMs`.
- `REVEAL`: the target takes `revealed-correct` or `revealed-target`; a wrong pick takes `revealed-wrong-pick`. Score updates now. Play the correct/incorrect sound. Hold `revealMs`.
- `RESULT`: result card (§3), stats updated, Play Again focused. The arena keeps showing the reveal.
- Pointer and keyboard input on balls is ignored in every state except `SELECTION`.

---

## 9. Scoring

- Correct: `+100 + 25 × (streak − 1)`, where `streak` includes this answer (1st in a row = 100, 2nd = 125, 3rd = 150…).
- Incorrect: `+0`; streak resets to 0.
- Session stats: `round`, `correct`, `incorrect`, `accuracy = correct / (correct + incorrect)` (shown as a rounded percentage, 0% before any answer), `streak`, `bestStreak`, `score`. Reset on page reload.
- Optional: persist `bestStreak` and `bestScore` in localStorage under `followone.best`.

---

## 10. Theme, sound, accessibility

**Theme**
- Options `light | dark | system`, default `system`. `system` follows `prefers-color-scheme` live through a `matchMedia` listener.
- Applied as `data-theme="light|dark"` on `<html>`. All colors are CSS custom properties: `--bg --surface --text --muted --arena --arena-edge --ball --target --accent --focus`, plus supporting tokens `--on-accent --control --border --shadow`. Every screen, card, button, the HUD and the arena use them.
- Look: clean and calm. Soft neutral background, white/slate surfaces, medium-blue balls, coral target; the dark theme is deep navy/charcoal. System font stack, rounded corners, light shadows; the arena is the focus.
- Persist under `followone.theme`; wrap all localStorage access in try/catch and fall back to defaults.
- Apply the stored theme from a tiny inline script in `<head>` before stylesheets load to avoid a flash.
- Contrast: text ≥ 4.5:1; ball vs arena ≥ 3:1 in both themes; `--target` clearly distinct from `--ball` for common color-vision deficiencies (red/coral vs blue is fine, plus the glyphs).

**Sound**
- Web Audio API, synthesized in code, no audio files. Create and resume the `AudioContext` on the first user gesture (the Start Game click).
- Effects: countdown tick, GO, soft tick in the last 5 seconds, freeze, correct (short rising arpeggio), incorrect (soft low tone, never harsh), reveal chime. Collision clicks are optional and off by default; if enabled, throttle to ≤ 6 per second at low gain.
- Header toggle 🔊/🔇, persisted under `followone.sound`, default on. Never schedule audio while off.

**Accessibility**
- Real `<button>` elements everywhere; visible `:focus-visible` styles; Enter/Space work on every control.
- The HUD message is an `aria-live="polite"` region so the current instruction is announced.
- `prefers-reduced-motion`: keep essential motion (the ball movement is the game; the return glide is functional but shortened; the reveal fade stays because it is opacity, not motion). Remove decorative motion: countdown scale/fade, target pulse, timer pulse, result bounce.
- Never color-only: every color state carries a glyph and/or label (§5).
- The tracking phase is inherently visual; everything around it must be fully operable and announced.

---

## 11. Config (defaults)

```ts
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
  baseSpeed: 0.45,          // arena radii per second
  speedBand: [0.7, 1.3],    // × baseSpeed
  speedRestore: 0.1,        // lerp toward baseSpeed per physics step
  physicsHz: 120,
  maxFrameMs: 50,
  collisionPasses: 3,

  // phase timing (ms)
  introMs: 2500,
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
  arenaMaxPx: 640,          // desktop cap on the arena diameter (§4)
  minHitPx: 44,             // smallest ball hit area (§5)

  score: { correct: 100, streakBonus: 25 },
  storageKeys: { theme: 'followone.theme', sound: 'followone.sound', best: 'followone.best' },
} as const;
```

---

## 12. State machine

One explicit machine in `game/stateMachine.ts`. All transitions go through `transition(to)`; illegal transitions throw in development. Phase timers are driven by the simulation clock in the single rAF loop.

| State | On enter | Exit |
|---|---|---|
| `IDLE` | Start screen visible; arena empty or faint. | Start Game → `TARGET_INTRO` |
| `TARGET_INTRO` | `round++`; build the round (spawn, target, names); render all balls stationary; target in `target` state; HUD intro copy; unlock audio. | after `introMs` → `COUNTDOWN` |
| `COUNTDOWN` | HUD shows 3, 2, 1, one per `countdownStepMs`, tick each; balls stationary, target still highlighted. | after 3 × `countdownStepMs` → `TRACKING` |
| `TRACKING` | Physics on; timer starts; HUD "GO!" for `goMs` (GO sound) then "Keep your eyes on {name}"; highlight fades between `revealHoldMs` and `revealHoldMs + revealFadeMs`; at ≤ `finalWarningS` s remaining HUD "Stay focused!" + soft tick. Timer shows `ceil(remaining)`. | elapsed ≥ `trackingMs` → `TRACKING_COMPLETE` |
| `TRACKING_COMPLETE` | Physics off, positions frozen; HUD "Nice! Time's up."; freeze sound. | after `freezeMs` → `RETURNING` |
| `RETURNING` | Assign slots (§7); glide; HUD "Getting into position..."; slot numbers fade in. | after `returnMs` → `SELECTION` |
| `SELECTION` | After `settleMs`, balls become buttons; HUD "Which one was {name}?". | player picks → `CHECKING` |
| `CHECKING` | Lock input; picked ball outlined; HUD "Checking...". | after `suspenseMs` → `REVEAL` |
| `REVEAL` | Apply reveal states (§5); update score; play sound. | after `revealMs` → `RESULT` |
| `RESULT` | Result card + stats; focus Play Again. | Play Again → `TARGET_INTRO` |

Theme and sound controls work in every state. Ball input is only live in `SELECTION`.

---

## 13. Build order

1. **Scaffold.** Vite + TS, `config.ts`, theme system with persistence and no-flash script, page shell (header / HUD / arena / stats), start screen. Verify both themes and the system option.
2. **Physics + round setup, headless.** `physics/world.ts`, `game/round.ts`, `util/random.ts`, tests for §6 invariants and uniform target selection (e.g. 15 000 rounds → every ball chosen roughly 1 000 times). Add a dev-only free-run mode (`?debug=1`) that renders 15 balls forever for tuning speed and radius.
3. **Renderer + loop.** DOM balls, normalized→pixel mapping, resize/orientation handling, fixed-timestep loop with clamped dt.
4. **State machine + round flow** with the copy table wired to the HUD: intro → countdown → tracking (with reveal window) → freeze.
5. **Ring, selection, reveal, result, scoring.** Slot assignment + tests, glide, buttons, checking/reveal/result card, stats.
6. **Polish pass.** Sound, reduced motion, keyboard/focus/aria, mobile QA (portrait and landscape), no-horizontal-scroll check.
7. **Acceptance.** Walk §14, fix, done.

---

## 14. Acceptance checklist

**Flow**
- [ ] Start screen works; Start Game begins a round.
- [ ] Target is shown in the arena, highlighted and named, before the countdown.
- [ ] 3-2-1-GO countdown works; motion starts on GO.
- [ ] Timer counts 15 → 1 and freezes at 0.
- [ ] Balls glide to the ring; slot numbers appear; player can pick exactly one ball.
- [ ] Input locks after the pick; "Checking..." shows; reveal happens after the delay.
- [ ] Correct and incorrect results both display with the right copy and highlights.
- [ ] Score, streak, best streak, accuracy and round all update correctly.
- [ ] Play Again starts a fresh round with a new random target.

**Fairness**
- [ ] The target highlight is fully gone by `revealHoldMs + revealFadeMs` and never returns before `REVEAL`.
- [ ] Nothing in the DOM/CSS distinguishes the target during motion, returning, or selection.
- [ ] Spawn positions are never ring slots; slots are assigned only at the freeze.
- [ ] `physics/` contains no reference to the target.
- [ ] Target, names, spawn positions and velocities are re-randomized every round.

**Physics**
- [ ] Balls move continuously, bounce off the arena edge, collide and push each other.
- [ ] No ball escapes, gets stuck, stops dead, or reaches an unrealistic speed.
- [ ] Smooth (~60 fps) on a mid-range phone and a laptop.
- [ ] Hiding the tab mid-round pauses rather than desyncs; rotating/resizing mid-round rescales cleanly.

**Settings and accessibility**
- [ ] Light, dark and system themes all work and persist across reloads; no flash on load.
- [ ] Sound toggle works and persists; nothing plays while off; audio unlocks on the first click.
- [ ] Keyboard-only play works for every step except the visual tracking itself; focus is always visible.
- [ ] HUD messages are announced via the live region.
- [ ] Reduced motion removes decorative animation and keeps the game playable.
- [ ] Every color state has a glyph or label.

**Layout**
- [ ] No horizontal scrolling on any screen size.
- [ ] Balls are visible and tappable (≥ 44 px hit area) on mobile.
- [ ] Desktop arena is centered and the primary visual element.

**Code**
- [ ] All Vitest tests pass.
- [ ] Modules are separated as in §0; no single giant file; no tunables outside `config.ts`.

---

## 15. Out of scope for v1

Difficulty levels, additional name packs (architecture only), multiple targets, a pass-through/occlusion mode, PWA/offline support, and everything listed under §0 (backend, accounts, leaderboards, ads, payments, multiplayer). Keep the config and name-pack architecture ready for them.
