# Follow One — Game Specification (v1.1)

Build a polished, responsive, browser-only cognitive tracking game.

**Pitch:** Fifteen balls bounce around a circular arena for 15 seconds. You were told which one to follow. When they stop, point to it.

This document is the single source of truth. Every numeric value below is a default that lives in `config.ts`; game logic never hard-codes them.

---

## 0. Tech stack and project shape

- Vite + TypeScript (strict), no UI framework. Plain CSS with custom properties.
- Output is a static site (`npm run build` → `dist/`) that works from any subpath and from `file://`. `base: './'` covers subpaths. For `file://`, the build emits one deferred classic script (IIFE) and no `crossorigin` attributes, because browsers block module scripts and CORS-mode stylesheets on `file://` pages.
- The Play typeface (§10) loads from Google Fonts, the one external resource. Offline or blocked, the system font stack takes over and nothing else changes.
- No backend, accounts, database, analytics, ads, leaderboards, multiplayer, social login or payments.
- Vitest for pure modules. `physics/`, `game/`, `names/` and `settings/` must be importable without a DOM.

```
src/
  main.ts                 bootstrap: build the page shell, wire modules, start the loop
  loop.ts                 the single requestAnimationFrame loop: fixed steps, then one render (§6)
  debug.ts                dev-only free-run (`?debug=1`, §13): balls bounce forever, ball count/speed sliders
  config.ts               every tunable (see §11)
  copy.ts                 every user-facing string (§3)
  settings/
    settings.ts           player settings (§16): defaults, validation, persistence, when they lock
  game/
    stateMachine.ts       states, transitions, phase timers (§12)
    session.ts            one game session: drives the machine, the round, physics, stats; emits cues
    view.ts               what the HUD and each ball show, derived from the session (the only place the target is singled out before REVEAL)
    round.ts              new-round setup: spawn, target pick, name assignment
    slots.ts              ring geometry + angular slot assignment (§7)
    score.ts              scoring + session stats (§9)
  physics/
    world.ts              integrate, boundary, ball–ball collisions, speed regulation (§6)
    vec.ts
  render/
    dom.ts                tiny element helpers (el, aria-hidden icon)
    header.ts             title and ⚙ settings button
    settingsPanel.ts      the settings drawer (§16)
    controls.ts           the drawer's form controls: slider row, segmented choice, switch, swatches
    arena.ts              arena element, ball elements, ring labels, ball visual states
    countdown.ts          the arena countdown watermark (§5)
    hud.ts                message line, aria-live region
    screens.ts            start screen, stats strip, result card
  input/
    selection.ts          enables/locks ball buttons, keyboard handling
  audio/
    sfx.ts                Web Audio synthesized effects, unlock on first gesture
  theme/
    theme.ts              light/dark/system + persistence
    palette.ts            ball and target color options, the pair-distance guard and the color hint (§16)
  names/
    packs.ts              NamePack type, registry, getPack(id)
    greek.ts
  util/
    random.ts             randomInt, randomBetween, shuffle (Fisher–Yates)
    storage.ts            try/catch wrappers around an injected localStorage
    fixedStep.ts          fixed-timestep accumulator with clamped frame time (§6)
  styles/                 plain CSS: tokens, base, layout, then one file per render module (the result card has its own)
tests/
  physics.test.ts  round.test.ts  slots.test.ts  score.test.ts  stateMachine.test.ts  settings.test.ts
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
| 2 | Round is built from the current settings (§16): `ballCount` balls (default 15) at random interior positions, one chosen as target, names shuffled. | — |
| 3 | Intro: all balls shown stationary in the arena; the target is highlighted and labelled. HUD: "Your target is Alpha. Keep your eyes on it." | 2.5 s |
| 4 | Countdown 3 → 2 → 1, large in the arena center behind the balls; the HUD keeps the intro line. Balls still stationary, target still highlighted. | 3 s |
| 5 | Motion starts. The arena shows "GO!" briefly, then the seconds left (15 → 1 by default) as a faint watermark. HUD "Keep your eyes on Alpha". The cursor hides over the arena. | the Duration setting, 15 s by default |
| 6 | The target's highlight fades out early in the motion (§2.1). From then on all balls are identical. | fade ends at 2 s |
| 7 | Last 5 seconds: HUD "Stay focused!", soft tick. | — |
| 8 | Time's up: physics freezes, the watermark reads 0, the cursor is back. HUD "Nice! Time's up." | 0.6 s |
| 9 | Slots are assigned by angular order (§7); balls glide to the ring; the watermark fades out. HUD "Getting into position...". | 1 s |
| 10 | Selection: balls become buttons, slot numbers appear. HUD "Which one was Alpha?" | until pick |
| 11 | Player picks one. Input locks. Picked ball gets an outline. HUD "Checking..." | 1 s |
| 12 | Reveal: the real target takes the target color with ★. Correct/incorrect visuals + sound. | 0.8 s |
| 13 | Result card with headline, stats and **Play Again**. | — |
| 14 | Play Again → step 2 with a fresh random target. | — |

At every moment exactly one instruction is visible in the HUD. The player should never wonder what to do next.

---

## 2. Fairness rules (non-negotiable)

The game is only fun if tracking is the only way to win.

1. **Reveal window.** The target is highlighted during `TARGET_INTRO`, `COUNTDOWN`, and the first `revealHoldMs` of `TRACKING`; the highlight (color, ★, name label, pulse) then fades to neutral over `revealFadeMs`. From that moment until `REVEAL`, the target is pixel-identical to every other ball: same size, color, label (none), stacking rules, hit area. No arrow, glow, outline, cursor hint or DOM attribute that CSS or a curious player could see.
2. **Start ≠ finish.** Balls spawn at random non-overlapping positions inside the arena, never on the ring. Slots are assigned only when the timer ends, from the balls' positions at that instant (§7). Nothing visible before or during tracking predicts the target's slot number.
3. **Identical physics.** The target uses the same spawn, speed, collision and boundary code paths as every other ball. `physics/` contains no reference to `isTarget` or `targetId`.
4. **Fresh randomness every round.** Target = uniform pick over the round's balls (`Math.floor(Math.random() * ballCount)`). Names are shuffled over the balls. Spawn positions and velocities are random. Repeating the previous target by chance is fine; deliberately avoiding or forcing repeats is not.
5. **Identity by ID.** `targetId` is stored at round start. Never identify the target by array index, DOM order or slot number during motion.
6. **Settings are fixed for the round.** Ball count, speed, duration and colors are read when the round is built and locked until it ends (§16); they apply to every ball alike. The target color shows only in the reveal window and from `REVEAL` on. The arena countdown and the hidden cursor belong to the arena, never to a ball.

---

## 3. Screens and copy

Use this copy exactly. `{name}` = target name, `{picked}` = the picked ball's name, `#{pickedSlot}` / `#{targetSlot}` = slot numbers, `{n}` = the ball-count setting, `{seconds}` = the duration setting in seconds, `{color}` = a target color's name. Setting rows give the control's label, then its options or its value.

| Moment | Text |
|---|---|
| Start title | Follow One |
| Start tagline | Can you keep your eyes on one ball while everything gets chaotic? |
| Start meta | {n} balls · {seconds} seconds · 1 target |
| Start help | You'll be given a named ball. Keep track of it while the balls move and collide. At the end, find your target. |
| Start button | Start Game |
| Intro (HUD) | Your target is **{name}**. Keep your eyes on it. |
| Countdown (arena) | 3 · 2 · 1 · GO! |
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
| Settings button and title | Settings |
| Settings close | Close settings |
| Settings sections | Game · Appearance |
| Balls setting | Balls · {n} balls |
| Speed setting | Speed · Slow · Normal · Fast · Extreme |
| Duration setting | Duration · {seconds} seconds |
| Ball color setting | Ball color · Blue · Purple · Green · Orange · Cyan |
| Target color setting | Target color · Red · Pink · Yellow · White |
| Color hint | Hard to tell apart from the balls. Try {color}. |
| Theme setting | Theme · Light · Dark · System |
| Sound setting | Sound · On · Off |
| Settings locked | Some settings are locked until this round ends. |

Never use technical language ("tracking phase initiated", "select target entity").

**Start screen:** title, tagline, meta line, Start Game, help sentence. Nothing else.

**Result card:** headline, sub-line, the five stats, Play Again (focused on entry). Play Again starts the next round directly; it does not return to the start screen.

---

## 4. Layout and responsiveness

- Vertical stack: **header** (the title, centered, then the ⚙ settings button at the right) → **HUD** (the current instruction; fixed height so nothing jumps) → **arena** → **stats strip** (Round · Score · Streak) or, after a round, the **result card**. Settings open in a drawer over the page (§16), never inside the gameplay area.
- **Page column.** The whole stack shares one centered column, so ⚙ sits at the right end of the game's column, never at the window's edge. Column width = `min(W, (W + fullWidthMaxPx) / 2, arenaMaxPx)`, where `W` is the width between the side gutters: the full width on phones (up to `fullWidthMaxPx` = 432 px), then half of every extra pixel goes to the side margins, up to `arenaMaxPx` = 560 px on tablets and desktops. Nothing runs edge to edge on a desktop. (On landscape phones the result card runs wider than the column, so it hangs less below the arena.)
- Arena diameter = `min(column width, available height − chrome)`. Mobile portrait: nearly full width. Landscape phones and short desktop windows: height-limited, still playable.
- No horizontal scrolling in any state. Size elements correctly rather than hiding overflow.
- Use `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and safe-area insets for header/footer padding.
- No game overlay covers the balls during `TARGET_INTRO`, `COUNTDOWN`, `TRACKING` or `RETURNING` (the player may still open Settings over them). The countdown and the tracking timer are a watermark in the arena center, drawn behind the balls (§5).
- The arena size is computed the same way in every state so the layout never shifts between states.
- The result card appears below the arena; the arena stays visible with both highlighted balls. When the viewport is too short for the card, the page scrolls just enough to show it (the header and HUD go first, the arena stays whole); Play Again scrolls back to the top. The card is compact wherever it has to be for that: on landscape phones it runs wider in two rows, and on short portrait screens (phones whose browser bars take height) Play Again sits beside the headline and the stats form one row.

**Normalized coordinates.** All positions and radii are stored in arena units: center `(0, 0)`, arena radius `1`. The renderer multiplies by the current pixel radius each frame. Resizing or rotating mid-round therefore just rescales; physics never sees pixels.

---

## 5. Balls, names, rendering

```ts
interface Ball {
  id: number;             // 0..n−1, stable within a round (n = the round's ball count)
  name: string;           // from the name pack, shuffled per round
  x: number; y: number;   // normalized, arena radius = 1, y down
  vx: number; vy: number; // normalized units per second
  r: number;              // the round's ball radius (below)
  slot: number | null;    // 1..n, assigned at the freeze
}

interface Round {
  balls: Ball[];
  targetId: number;
  namePackId: string;
  ballRadius: number;     // r for this ball count (below)
  ringRadius: number;     // the ring for this ball size (§7)
  speedFactor: number;    // the Speed setting's multiplier (§6)
}
```

**Name packs** (`names/packs.ts`):

```ts
interface NamePack { id: string; label: string; names: string[] } // ≥ ballCountMax unique names, most familiar first
```

- Registry keyed by id; the engine calls `getPack(config.namePackId)` and never references a literal name.
- The game ships `greek` only: Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Eta, Theta, Iota, Kappa, Lambda, Mu, Nu, Xi, Omicron, Pi, Rho, Sigma, Tau, Upsilon, Phi, Chi, Psi, Omega, Digamma, Koppa, Sampi, San, Sho, Yot.
- That is the 24 letters of the alphabet, then six archaic ones for games of 25–30 balls.
- Adding a pack (Space, Animals, Fantasy, Robots, Nature…) = one new file + one registry entry, no engine change.
- Each round: `shuffle(pack.names.slice(0, ballCount))` assigned to balls by index, so a game of 15 uses Alpha–Omicron and only bigger games reach the rarer names.

**Rendering (recommended):** one absolutely positioned element per ball inside the arena, moved each frame with `transform: translate3d(...)` (compositor-only; even 30 elements are trivial at 60 fps). The same elements become `<button>`s in `SELECTION`, so there is no canvas↔DOM switch and no visual pop. Canvas 2D is acceptable for the motion phases only if the selection ring is a DOM overlay that matches the canvas drawing exactly.

**Ball radius** depends on the round's ball count `n` and is fixed for the round: `r = max(ballRadiusMin, ballRadius × √(ballCount / n))`, where `ballRadius = 0.09` is the size at the default 15 balls. Fewer balls are larger, more are smaller, and the balls cover about the same share of the arena (≈12%) at every count; `ballRadiusMin = 0.065` is the smallest readable ball. That gives 10 balls ≈ 0.110, 15 = 0.090, 20 ≈ 0.078, 25 ≈ 0.070, 30 = 0.065. Sizes are normalized, so on screen they follow the arena diameter: 30 balls are ≈ 22 px across on a 343 px phone arena and ≈ 36 px on a 560 px desktop one. Every count spawns with room to spare and keeps a clear gap between neighbours on the ring (§7). Selection hit area is at least 44 × 44 px (`minHitPx`) regardless of drawn size. Where neighbouring hit areas overlap (small arenas, many balls), a pointer pick goes to the ball whose center is nearest the pointer.

**Ball visual states** (color is never the only cue; `--ball` and `--target` are the colors chosen in Settings, §16, and glyphs take that color's ink):

| State | Fill | Glyph | Label | Used in |
|---|---|---|---|---|
| `neutral` | `--ball` | — | — | everywhere |
| `target` | `--target` | ★ | name above | intro, countdown, reveal window; fades to neutral |
| `picked` | `--ball` | — | 3 px outline `--text` | checking |
| `revealed-correct` | `--target` | ✓ | name | reveal/result when picked = target |
| `revealed-target` | `--target` | ★ | name | reveal/result when incorrect |
| `revealed-wrong-pick` | `--ball` | ✕ | outline + picked name | reveal/result when incorrect |

Slot numbers (1–n) render as small muted labels just outside each slot (on the side away from the center) during `SELECTION`, `CHECKING`, `REVEAL` and `RESULT` only. On the ring, name labels go on the side toward the center, so the two never collide.

The target's highlight never depends on its color: the ★, the name label and the pulse ring mark it in any color pair (§16).

**Arena countdown.** The countdown and the tracking timer are one large numeral centered in the arena: a watermark in the Play typeface, bold, with no box, border or card. Layer order: arena background and edge → watermark → balls → ball effects. It has `pointer-events: none` and never blocks a ball, and balls stay clearly visible where they cross it.
- `COUNTDOWN`: 3, 2, 1, strong (about 50–70% opacity).
- `TRACKING`: GO! (strong) for `goMs`, then `ceil(remaining)` seconds, faint (about 15–25%).
- `TRACKING_COMPLETE`: 0, faint. It fades out as the balls glide to the ring and is empty in every other state.
- Each change crossfades with a slight scale, the old numeral out and the new one in; reduced motion swaps it instantly. The opacity values live in CSS with the palette.
- It is decorative (`aria-hidden`): the HUD live region, the sounds and a visually hidden `role="timer"` in the HUD carry the same information.

---

## 6. Physics

Runs only in `TRACKING`. Pure functions over the physical part of each ball (`Body`: position, velocity, radius), so physics never sees ids, names or the target; no DOM access; deterministic given inputs (the random source for the two fallbacks below is an input, `Math.random` by default).

- **Timestep.** Fixed `physicsHz = 120`. The rAF loop accumulates frame time clamped to `maxFrameMs = 50` and steps the world. Rendering interpolates positions between the last two steps, so motion stays smooth when a display's refresh rate is not a multiple of 120 Hz. The tracking timer, the reveal fade and every phase timer use this same simulation clock, so a hidden or throttled tab pauses the round instead of desyncing it.
- **Speed.** The round's speed is `baseSpeed × speedFactor`, where `speedFactor` comes from the Speed setting (§16): Slow 0.7, Normal 1, Fast 1.3, Extreme 1.6 (`speedPresets`). Spawn speed, the regulation target and the speed band all follow it. Each step runs as `⌈speedFactor⌉` equal substeps, so no ball moves further per substep than at Normal and collisions stay as clean at Extreme.
- **Spawn.** Rejection-sample positions with `|p| ≤ 1 − r − spawnMargin` and pairwise center distance `≥ 2r + spawnGap`. Direction uniform random; speed `baseSpeed × speedFactor × rand(spawnSpeedRange)` (default 0.9–1.1).
- **Integrate.** `p += v · dt`.
- **Arena boundary.** If `|p| + r > 1`: `n = p / |p|`; set `p = n · (1 − r)`; if `v · n > 0` reflect `v -= 2 (v · n) n`.
- **Ball–ball** (equal mass, elastic). For each pair with `d = |pB − pA| < 2r`: `n = (pB − pA) / d` (random unit vector if `d ≈ 0`); push each ball apart by `(2r − d) / 2` along `n`; let `s = (vA − vB) · n`; if `s > 0` (approaching): `vA -= s · n`, `vB += s · n`. Run `collisionPasses = 3` per step so clusters settle without jitter.
- **Speed regulation** (after collisions): lerp each ball's `|v|` toward the round's speed by `speedRestore` per substep, then clamp to `speedBand ×` that speed. Keeps every ball lively, prevents dead stops and runaways, and keeps collisions visibly physical. A velocity of exactly zero (a square hit on a ball moving across the line of impact) takes a random direction.
- **Step order** (each substep). integrate → boundary → `collisionPasses` × (ball–ball pass → boundary) → speed regulation. Re-applying the boundary after each pass keeps the boundary invariant exact when a collision pushes a ball into the wall.
- **Defaults.** `baseSpeed = 0.45` arena radii/second at Normal (≈4.5 s to cross the arena). Tune for feel in the debug free-run mode.
- **Invariants** (unit-tested over ≥ 10 000 steps at the defaults, and at 10 and at 30 balls at both Slow and Extreme): no `NaN`; every ball satisfies `|p| + r ≤ 1 + 1e-6`; no pair overlaps by more than `1e-3` after a step; every speed within the band; no ball's speed is exactly zero for more than one step.

Never teleport balls, never reposition them per frame, never treat the target differently.

---

## 7. Ring slots and the return glide

- One slot per ball: `n` slots evenly spaced on a ring (step `2π / n`), slot 1 at 12 o'clock, numbered clockwise. Slot `k` center angle: `θk = 2π (k − 1) / n` measured clockwise from 12 o'clock.
- The ring radius follows the ball size so the balls' outer edge sits where it does at the default count: `ringRadius = slotRadius + ballRadius − r`, i.e. `slotRadius = 0.85` at 15 balls, ≈ 0.83 at 10, 0.875 at 30. Neighbours never touch: at 30 balls the gap between them is still ≈ 0.05, more than `spawnGap`.
- **Assignment at the freeze:** compute each ball's angle `θ = atan2(x, −y)` normalized to `[0, 2π)` (clockwise from 12 o'clock in screen coordinates), sort ascending (tie-break by distance from center), and give the k-th ball slot `k`. Each ball therefore glides a short distance to its own part of the ring; paths rarely cross, so a player who was tracking can follow the glide, and one who wasn't gains nothing.
- **Glide:** straight line, ease-in-out, `returnMs = 1000` (`returnMsReducedMotion = 600`), physics off. Brief overlaps during the glide are acceptable.
- Slot numbers fade in during the last part of the glide (from `slotLabelFadeFrom` = 60% of it).
- From slot assignment on, the ball elements are in slot order in the DOM, so tab order is slot order and DOM position says nothing that the ring doesn't.

---

## 8. Selection, reveal, result

- After `settleMs`, each ball element becomes `<button aria-label="Ball {slot}">`. Tab order = slot order. Enter/Space or tap selects; arrow keys (and Home/End) move focus around the ring. Visible hover/press and `:focus-visible` states. Do not move focus into the ring automatically.
- The first activation locks input immediately; later activations are ignored. The picked ball gets the `picked` state; HUD "Checking..."; wait `suspenseMs`. Through `CHECKING` and `REVEAL` the balls stay focusable but `aria-disabled`, so keyboard focus isn't dropped; in `RESULT` focus moves to Play Again and the balls become inert.
- `REVEAL`: the target takes `revealed-correct` or `revealed-target`; a wrong pick takes `revealed-wrong-pick`. Score updates now. Play the correct/incorrect sound. The HUD shows the headline. Hold `revealMs`.
- `RESULT`: result card (§3), stats updated, Play Again focused. The arena keeps showing the reveal. The HUD is empty while the card is up, as on the start screen.
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
- Options `light | dark | system`, default `system`, chosen in Settings (§16). `system` follows `prefers-color-scheme` live through a `matchMedia` listener.
- Applied as `data-theme="light|dark"` on `<html>`. All colors are CSS custom properties: `--bg --surface --text --muted --arena --arena-edge --ball --target --accent --focus`, plus supporting tokens `--on-accent --control --border --shadow`. Every screen, card, button, the HUD, the settings drawer and the arena use them. `--ball` and `--target` follow the colors chosen in Settings, each with an `-ink` token for the glyphs on it and an `-edge` token for its outline (§16).
- Look: modern, minimal and calm with a futuristic, slightly arcade edge; a polished brain-training game, not a generic web app, an admin dashboard or a children's game. Soft neutral background, white/slate surfaces, medium-blue balls and a red target by default; the dark theme is deep navy/charcoal. Rounded corners, light shadows; the arena is the focus. The Play typeface, the circular arena and the big center countdown are the game's identity.
- Typography: Play (Google Fonts, weights 400 and 700, `display=swap`, loaded without blocking the first paint) everywhere: title, headings, buttons, HUD, names, countdown, stats, settings, result. It is set as `font-family: "Play", <system stack>`, so the system font takes over offline. Hierarchy: title and target name large and bold; the countdown very large and bold; instructions and settings medium; buttons medium and bold; secondary information smaller and regular. No other typeface.
- Persist under `followone.theme`; wrap all localStorage access in try/catch and fall back to defaults.
- Apply the stored theme from a tiny inline script in `<head>` before stylesheets load to avoid a flash.
- Contrast: text ≥ 4.5:1; every ball and target color ≥ 3:1 against the arena in both themes; ball and target colors distinguishable for common color-vision deficiencies (§16), plus the glyphs.

**Sound**
- Web Audio API, synthesized in code, no audio files. Create and resume the `AudioContext` on the first user gesture (the Start Game click); Play Again and switching sound on resume it too. Sounds that would pile up in a context that failed to start are dropped, not queued.
- Effects: countdown tick (each numeral), GO (motion starts), soft tick (each of the last `finalWarningS` seconds), freeze (`TRACKING_COMPLETE`), correct (short rising arpeggio) or incorrect (soft low tone, never harsh) at `REVEAL`, reveal chime (the target is revealed at `TARGET_INTRO`). The recipes (pitches, envelopes, gains) are sound design and live in `audio/sfx.ts`, as the palette lives in CSS. Collision clicks are optional and off by default (`collisionClicks`); if enabled, throttle to ≤ `collisionClicksPerSecond` (6) at low gain, however many balls collide.
- The Sound switch lives in Settings (§16), persisted under `followone.sound`, default on. Never schedule audio while off; switching off also silences anything still ringing.

**Accessibility**
- Real `<button>` elements everywhere, and native inputs in Settings; visible `:focus-visible` styles; Enter/Space work on every control.
- The HUD message is an `aria-live="polite"` region so the current instruction is announced.
- The settings drawer is a modal dialog: focus moves into it and stays there, Esc closes it, and focus returns to ⚙.
- `prefers-reduced-motion`: keep essential motion (the ball movement is the game; the return glide is functional but shortened; the reveal fade stays because it is opacity, not motion). Remove decorative motion: countdown scale/fade, target pulse, result bounce, the drawer's slide.
- Never color-only: every color state carries a glyph and/or label (§5).
- The tracking phase is inherently visual; everything around it must be fully operable and announced.

---

## 11. Config (defaults)

```ts
export const config = {
  ballCount: 15,            // default; Settings allows ballCountMin..ballCountMax (§16)
  ballCountMin: 10,
  ballCountMax: 30,
  namePackId: 'greek',

  // arena units: radius = 1
  ballRadius: 0.09,         // at the default ballCount; other counts scale by √(ballCount / n) (§5)
  ballRadiusMin: 0.065,     // smallest readable ball (§5)
  slotRadius: 0.85,         // ring radius at the default ballCount (§7)
  spawnMargin: 0.02,
  spawnGap: 0.03,
  spawnSpeedRange: [0.9, 1.1], // × the round's speed at spawn

  // motion
  baseSpeed: 0.45,          // arena radii per second at Normal
  speedPresets: { slow: 0.7, normal: 1, fast: 1.3, extreme: 1.6 }, // × baseSpeed (§6)
  speedPreset: 'normal',    // default Speed setting
  speedBand: [0.7, 1.3],    // × the round's speed
  speedRestore: 0.1,        // lerp toward the round's speed per physics substep
  physicsHz: 120,
  maxFrameMs: 50,
  collisionPasses: 3,

  // phase timing (ms)
  introMs: 2500,
  countdownFrom: 3,         // countdown shows 3, 2, 1
  countdownStepMs: 1000,
  goMs: 500,
  trackingMs: 15000,       // default; Settings allows trackingMsMin..trackingMsMax in trackingMsStep steps (§16)
  trackingMsMin: 10000,
  trackingMsMax: 60000,
  trackingMsStep: 5000,
  revealHoldMs: 1500,
  revealFadeMs: 500,
  finalWarningS: 5,
  freezeMs: 600,
  returnMs: 1000,
  returnMsReducedMotion: 600,
  slotLabelFadeFrom: 0.6,   // slot numbers fade in over the rest of the glide
  settleMs: 300,
  suspenseMs: 1000,
  revealMs: 800,

  // layout
  arenaMaxPx: 560,          // cap on the page column and the arena diameter (§4)
  fullWidthMaxPx: 432,      // full-width column up to this (phones); wider, half the extra goes to side margins (§4)
  minHitPx: 44,             // smallest ball hit area (§5)

  // colors (§16): ΔE is the OKLab distance ×100, deficiencies simulated as Machado et al. (2009) at full severity
  ballColor: 'blue',        // default Ball color setting
  targetColor: 'red',       // default Target color setting
  colorPairFloor: 6,        // min ΔE of every ball/target pair, normal vision and each deficiency, both themes
  colorComfortNormal: 15,   // comfortable at ≥ this under normal vision
  colorComfortDeficient: 8, // and ≥ this under each deficiency; below either, Settings shows the color hint

  // sound
  collisionClicks: false,   // optional collision clicks (§10)
  collisionClicksPerSecond: 6,

  score: { correct: 100, streakBonus: 25 },
  storageKeys: {
    theme: 'followone.theme',
    sound: 'followone.sound',
    settings: 'followone.settings',
    best: 'followone.best',
  },
} as const;
```

---

## 12. State machine

One explicit machine in `game/stateMachine.ts`. All transitions go through `transition(to)`; illegal transitions throw in development and are ignored in production. Player actions (Start Game, a pick, Play Again) are simply ignored outside the state that accepts them. Phase timers are driven by the simulation clock in the single rAF loop: a state's time is counted in whole physics steps, so the default 15 s of tracking is exactly 1 800 steps of motion.

| State | On enter | Exit |
|---|---|---|
| `IDLE` | Start screen visible; arena empty or faint; every setting live. | Start Game → `TARGET_INTRO` |
| `TARGET_INTRO` | `round++`; build the round from the current ball-count, speed and duration settings (spawn, target, names) and lock them (§16); render all balls stationary; target in `target` state; HUD intro copy; unlock audio. | after `introMs` → `COUNTDOWN` |
| `COUNTDOWN` | The arena countdown shows `countdownFrom` … 1 (3, 2, 1), one per `countdownStepMs`, tick each; the HUD keeps the intro copy; balls stationary, target still highlighted. | after `countdownFrom` × `countdownStepMs` → `TRACKING` |
| `TRACKING` | Physics on; the arena shows GO! for `goMs` (GO sound), then the seconds left, `ceil(remaining)`; HUD "Keep your eyes on {name}"; highlight fades between `revealHoldMs` and `revealHoldMs + revealFadeMs`; at ≤ `finalWarningS` s remaining HUD "Stay focused!" + soft tick. The cursor is hidden over the arena. | elapsed ≥ the round's duration → `TRACKING_COMPLETE` |
| `TRACKING_COMPLETE` | Physics off, positions frozen; the arena countdown reads 0; the cursor is back; HUD "Nice! Time's up."; freeze sound. | after `freezeMs` → `RETURNING` |
| `RETURNING` | Assign slots (§7); glide; the arena countdown fades out; HUD "Getting into position..."; slot numbers fade in. | after `returnMs` → `SELECTION` |
| `SELECTION` | After `settleMs`, balls become buttons; HUD "Which one was {name}?" (until then it keeps "Getting into position..."). | player picks → `CHECKING` |
| `CHECKING` | Lock input; picked ball outlined; HUD "Checking...". | after `suspenseMs` → `REVEAL` |
| `REVEAL` | Apply reveal states (§5); update score; play sound; HUD shows the headline. | after `revealMs` → `RESULT` |
| `RESULT` | Result card + stats; focus Play Again; HUD empty; settings unlock. | Play Again → `TARGET_INTRO` |

Theme and sound work in every state; ball count, speed, duration and colors are locked from `TARGET_INTRO` through `REVEAL` (§16). Ball input is only live in `SELECTION`.

The arena countdown is empty outside `COUNTDOWN`, `TRACKING` and `TRACKING_COMPLETE` (where it reads 0), apart from its fade-out in `RETURNING`.

---

## 13. Build order

1. **Scaffold.** Vite + TS, `config.ts`, theme system with persistence and no-flash script, page shell (header / HUD / arena / stats), start screen. Verify both themes and the system option.
2. **Physics + round setup, headless.** `physics/world.ts`, `game/round.ts`, `util/random.ts`, tests for §6 invariants and uniform target selection (e.g. 15 000 rounds → every ball chosen roughly 1 000 times). Add a dev-only free-run mode (`?debug=1`) that renders 15 balls forever for tuning speed and radius.
3. **Renderer + loop.** DOM balls, normalized→pixel mapping, resize/orientation handling, fixed-timestep loop with clamped dt.
4. **State machine + round flow** with the copy table wired to the HUD: intro → countdown → tracking (with reveal window) → freeze.
5. **Ring, selection, reveal, result, scoring.** Slot assignment + tests, glide, buttons, checking/reveal/result card, stats.
6. **Polish pass.** Sound, reduced motion, keyboard/focus/aria, mobile QA (portrait and landscape), no-horizontal-scroll check.
7. **Acceptance.** Walk §14, fix, done.

v1.1:

8. **Settings drawer, ball count and speed.** `settings/` (defaults, validation, persistence, locking); the ⚙ button and drawer with Balls, Speed, Theme and Sound (theme and sound leave the header); ball radius, ring and names for 10–30 balls; speed presets with substeps. Tests for every count and preset.
9. **Duration, arena countdown, cursor and typography.** The Duration setting; the watermark countdown (the HUD timer goes); the hidden cursor over the arena while tracking; the Play typeface and type hierarchy; a visual-identity pass.
10. **Ball and target colors.** Palettes with a tone per theme, the pair-distance guard and its hint, swatches in the drawer.
11. **Acceptance (v1.1).** Walk the new §14 items at 10, 15 and 30 balls and every speed, in both themes, on phone and desktop sizes.

---

## 14. Acceptance checklist

**Flow**
- [ ] Start screen works; Start Game begins a round.
- [ ] Target is shown in the arena, highlighted and named, before the countdown.
- [ ] 3-2-1-GO countdown works in the arena; motion starts on GO.
- [ ] Timer counts down from the round's duration (15 by default) to 1 in the arena and freezes at 0.
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
- [ ] Ball count, speed, duration and colors can't change mid-round; the target color never shows between the fade and `REVEAL`.

**Physics**
- [ ] Balls move continuously, bounce off the arena edge, collide and push each other.
- [ ] No ball escapes, gets stuck, stops dead, or reaches an unrealistic speed, at every ball count and speed.
- [ ] Smooth (~60 fps) on a mid-range phone and a laptop, 30 balls included.
- [ ] Hiding the tab mid-round pauses rather than desyncs; rotating/resizing mid-round rescales cleanly.

**Settings**
- [ ] ⚙ (at the right end of the header) opens the drawer from the right; ✕, Esc and the backdrop close it; focus returns to ⚙; no horizontal scroll on phones.
- [ ] Balls (10–30, value shown), Speed (four presets), Duration (10–60 s, value shown), Ball color (5), Target color (4), Theme and Sound all work with pointer and keyboard.
- [ ] All seven settings persist across reloads; a first visit gets 15 balls, Normal, 15 seconds, Blue, Red, System, sound on.
- [ ] Ball count, speed, duration and colors are locked, with the note, from `TARGET_INTRO` through `REVEAL` and apply from the next round; theme and sound always work.
- [ ] Balls resize with the count (largest at 10, smallest at 30); every count spawns, rings without overlaps, numbers slots 1..n and uses unique names.
- [ ] A hard-to-tell color pair shows the hint and its one-tap fix; no pair is indistinguishable.

**Arena countdown, cursor, typography**
- [ ] 3·2·1 and GO! (strong), then the seconds left (faint), large in the arena center behind the balls, never blocking a pick; 0 at the freeze; gone for the ring.
- [ ] The cursor hides over the arena only while tracking, and comes back when it leaves the arena or tracking ends.
- [ ] Play is the typeface everywhere, with a clear hierarchy; the system font takes over offline.

**Accessibility**
- [ ] Light, dark and system themes all work and persist across reloads; no flash on load.
- [ ] The sound switch works and persists; nothing plays while off; audio unlocks on the first click.
- [ ] Keyboard-only play works for every step except the visual tracking itself; focus is always visible.
- [ ] HUD messages are announced via the live region.
- [ ] Reduced motion removes decorative animation and keeps the game playable.
- [ ] Every color state has a glyph or label.

**Layout**
- [ ] No horizontal scrolling on any screen size.
- [ ] Balls are visible and tappable (≥ 44 px hit area) on mobile.
- [ ] The page is one centered column: full width on phones, clear side margins on wider windows, at most `arenaMaxPx` (560 px) on desktop, with ⚙ at its right end. The arena is the primary visual element.

**Code**
- [ ] All Vitest tests pass.
- [ ] Modules are separated as in §0; no single giant file; no tunables outside `config.ts`.

---

## 15. Out of scope

Difficulty levels beyond the ball-count and speed settings (and scoring by difficulty), additional name packs (architecture only), multiple targets, a pass-through/occlusion mode, PWA/offline support, and everything listed under §0 (backend, accounts, leaderboards, ads, payments, multiplayer). Keep the config and name-pack architecture ready for them.

---

## 16. Settings

A first-time player never needs Settings: the defaults are the standard game (15 balls, Normal speed, 15 seconds, Blue balls, Red target, System theme, sound on). Settings exist for customization, not as a step before playing.

**Opening.** A small ⚙ button at the right end of the header (accessible name "Settings", ≥ 44 px hit area) opens the settings drawer: a modal `<dialog>` that slides in from the right over a subtle backdrop, with the game still visible behind it. It is about 360 px wide on desktop and nearly full width on phones, never wider than the viewport, and scrolls vertically when the viewport is short. ✕ ("Close settings"), Esc, or a click or tap on the backdrop closes it, and focus returns to ⚙. Opening Settings doesn't pause the round.

**Layout.** Compact, calm and modern, not an admin dashboard: two short sections, one row per setting, the same tokens as the rest of the game.
- **Game.** Balls: a slider from `ballCountMin` (10) to `ballCountMax` (30) in steps of 1, with its value shown as "{n} balls". Speed: a segmented choice, Slow · Normal · Fast · Extreme. Duration: how long the balls move, a slider from 10 to 60 seconds in steps of 5 (`trackingMsMin`, `trackingMsMax`, `trackingMsStep`), shown as "{seconds} seconds".
- **Appearance.** Ball color and Target color: rows of swatches, the chosen color's name shown beside the label. Theme: a segmented choice, Light · Dark · System. Sound: a switch, On · Off.
- Every control is native and keyboard-operable: a range input, radio groups for the choices and swatches (arrow keys move within a group), and a `role="switch"` button for sound. A change applies at once (no Save button) and persists.

**Colors.** Ball color: Blue (default), Purple, Green, Orange, Cyan. Target color: Red (default), Pink, Yellow, White. Each swatch is a radio named by its color; the chosen one is marked by a ring and a ✓, not by color alone.
- Each color has a tone per theme, tuned so every ball and target keeps ≥ 3:1 against the arena and glyphs on it stay readable; a very light tone gets a thin darker rim where it needs one. The tones live in CSS with the other tokens, each color a fill, a glyph ink and an edge (the fill itself, or that rim); `theme/palette.ts` lists the options.
- Every ball/target pair stays distinguishable: the distance between the two tones, under normal vision and simulated protanopia, deuteranopia and tritanopia, never falls below a floor (unit-tested). The distance is ΔE, the OKLab distance ×100, with each deficiency simulated as Machado et al. (2009) at full severity; the floor is `colorPairFloor` (6) in both themes. A pair is comfortable at ≥ `colorComfortNormal` (15) under normal vision and ≥ `colorComfortDeficient` (8) under each deficiency, the usual data-visualization thresholds; the floor can sit lower because the target never relies on color alone (★, name, pulse).
- A pair that is distinguishable but not comfortably so shows a subtle hint under the target swatches, "Hard to tell apart from the balls. Try {color}.", where the named color is a one-tap fix: the most distinct target color for those balls, the one that clears the comfort thresholds by the widest margin. Tones differ per theme, so the hint judges the current theme's tones and follows a theme change.
- The chosen colors apply to every ball alike; the target color only shows while the target is highlighted (§2.1) and from `REVEAL` on. The dot beside the title is a fixed brand mark in the default red, not the target color. The favicon is the same mark, an inline SVG in `index.html` (no image file) that takes the dark theme's red when the system is dark.

**During a round.** From `TARGET_INTRO` through `REVEAL`, Balls, Speed, Duration, Ball color and Target color are disabled under the note "Some settings are locked until this round ends."; the round keeps the values it was built with. Theme and sound work in every state. In `IDLE` and `RESULT` everything is live: a new ball count, speed or duration applies from the next Start Game or Play Again, and new colors show at once.

**Persistence.** Ball count, speed, duration, ball color and target color are stored together under `followone.settings` as JSON; theme and sound keep `followone.theme` and `followone.sound`. Every access goes through the try/catch storage wrappers. Each stored field is validated on its own (a ball count is rounded and clamped to 10–30, a duration snapped to 5 s steps within 10–60 s; unknown names fall back to the default), so one bad field never resets the others.
