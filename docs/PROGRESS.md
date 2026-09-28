# Progress

## 2026-09-29 — Phase 1: Scaffold

### Done
- Vite 8.3 + TypeScript 7.0 (strict) + Vitest 5.0, no runtime dependencies. Scripts: `dev`, `build`, `preview`, `test`, `typecheck`, `check`.
- `typecheck` runs a second pass (`tsconfig.pure.json`) that compiles `config.ts`, `copy.ts`, `physics/`, `game/`, `names/`, `util/` without DOM types, so `window`, `document` or `setTimeout` there fail the check (verified with a throwaway probe file).
- `src/config.ts`: SPEC §11 plus `arenaMaxPx: 640`.
- `src/copy.ts`: start screen, header controls, stat labels. `tests/copy.test.ts` parses the SPEC §3 table and fails if copy drifts from it.
- Theme (`theme/theme.ts`): light / dark / system, stored under `followone.theme`. System follows `prefers-color-scheme` live. An inline script in `<head>` applies the stored theme before any stylesheet; its storage key, the `<title>` and the meta description are filled from `config.ts` / `copy.ts` at build time.
- Sound toggle (`audio/sfx.ts`): on/off stored under `followone.sound`. It plays nothing yet.
- Page shell: header (brand, sound toggle, theme segmented control) → stage (HUD, arena, footer with stats strip). In IDLE the start card sits centered on the faint, empty arena. The arena diameter is `min(width, height left after HUD and footer, arenaMaxPx)`, from a CSS size container, and is computed the same way in every state.
- Build output: one IIFE in a deferred classic script, extracted render-blocking CSS, no `crossorigin`. `dist/index.html` opens from `file://` and from any subpath.
- Palette ("clean and calm") checked with WCAG contrast: text ≥ 13.3, muted ≥ 5.3, on-accent ≥ 6.0, ball on arena ≥ 4.1, target on arena ≥ 3.2, focus ring ≥ 4.8, in both themes.

### Spec edits
- §0: how `file://` works; module tree adds `copy.ts`, `render/dom.ts`, `render/header.ts`, `util/storage.ts`, `styles/`; `screens.ts` also owns the stats strip.
- §3: incorrect sub-line uses `#{pickedSlot}` / `#{targetSlot}` (was `#{n}` twice); start meta numbers come from config.
- §4 / §11: `arenaMaxPx: 640` in config (no default values changed).
- §10: the "clean and calm" look; supporting color tokens `--on-accent --control --border --shadow`.

### Verified in the browser
- Light, Dark and System each apply, update `aria-pressed` and survive a reload. An explicit choice overrides the OS setting. System follows OS light↔dark changes without a reload.
- Keyboard: Tab reaches the sound toggle, the theme buttons and Start Game with a visible focus ring. Enter and Space both activate them.
- No horizontal scroll and no vertical scroll at 1024×768, 375×812, 360×740, 320×568, 812×375 and 667×375. Arena sizes: 556, 343, 328, 288 and 215 px. The header stays on one row down to 360px wide.
- Start → play layout: the arena doesn't move; a two-line HUD message fits the fixed-height HUD.
- Production build: served from a `/dist/` subpath with no console errors. From `file://` in headless Chrome the app renders. A control copy with Vite's default module tags stays blank, and Chrome logs CORS blocks for both the script and the stylesheet.

### SPEC §14 items touched
- Verified: themes work, persist and don't flash (the theme is set before the render-blocking stylesheet); no horizontal scrolling at the sizes above; desktop arena centered; all Vitest tests pass; modules follow §0 with no tunables outside `config.ts`.
- Partly: sound toggle works and persists (audio itself is phase 6); header controls and Start Game work by keyboard (the full flow is phases 4–6).

### Deferred
- Start Game only switches to the play layout (`setScreen('play')`); phase 4 routes it through the state machine.
- The HUD has its message and timer elements but no content (phase 4). The stats strip shows zeros (phase 5).

### Known issues / notes
- At 812×375 the arena is 215px, so neighbouring ring slots sit about 38px apart, less than the 44px hit area in §5. Revisit landscape phones in phase 5/6.
- Below about 360px wide the header wraps to two rows. This is intentional and never overflows.
- In `npm run dev` the CSS is injected by JavaScript, so the first paint can be unstyled. The production build links the CSS as render-blocking.
- The Browser pane can't open `file://` pages (it shows static snapshots). Headless Chrome can: `--dump-dom` prints the DOM, but Chrome doesn't exit on its own here, so cap it with a timeout.

## 2026-09-29 — Phase 2: Physics and round setup (headless)

### Done
- `util/random.ts`: `randomInt`, `randomBetween`, Fisher–Yates `shuffle`, always on `Math.random`.
- `physics/vec.ts`, `physics/world.ts`: `stepWorld` = integrate → boundary → `collisionPasses` × (ball–ball pass → boundary) → speed regulation. Physics works on `Body` (position, velocity, radius), so it cannot see ids, names or the target. The two fallbacks (coincident centers, zero velocity) take their random source as a parameter.
- `names/packs.ts` + `names/greek.ts`: registry and `getPack(id)`.
- `game/round.ts`: `createRound()` shuffles names, rejection-samples the layout (§6 bounds), picks `targetId = randomInt(ballCount)`; `slot` starts `null`.
- `debug.ts`: `?debug=1` free-run in `npm run dev` with sliders for `baseSpeed` and `ballRadius`, respawn, and fps/speed readouts. Gated on `import.meta.env.DEV`; the production bundle doesn't contain it (checked by grepping the build).
- Tests (48 total): §6 invariants after every step over 10 rounds × 12 000 steps, plus "nobody gets stuck" (every ball crosses > 1 unit in x and y); wall reflection; elastic head-on swap; momentum/energy conservation; coincident-center split; speed ease and clamp; zero-speed recovery; determinism; a source scan that fails if `physics/` mentions the target or names; 15 000 rounds → uniform target, uniform names on ball 0 and on the target, uniform first-ball direction, no repeated layout; spawn bounds and gaps; the greek pack matches the SPEC §5 list.
- Mutation check: removing the per-pass boundary, adding `isTarget` to `Body`, or dropping the speed clamp each fail the suite.

### Spec edits
- §0: `debug.ts`; `random.ts` also exports `randomBetween`.
- §6: physics works on `Body`; explicit step order; zero-velocity fallback; spawn speed uses `spawnSpeedRange`.
- §11: new key `spawnSpeedRange: [0.9, 1.1]` (the value §6 already gave; no default changed).

### Verified in the browser
- `?debug=1` (dev server): 15 balls bounce and collide at 60 fps. Sampling the rendered transforms for 4 s: max `|p| + r` = 1.0000, closest pair = 0.1800 (= 2r), every ball moved. Sliders change speed live (0.8 → mean 0.793) and radius respawns.
- Measured headless over 1.2 M steps: worst overlap 5.6e-4 (limit 1e-3), boundary error 2e-16, speeds pinned to the 0.315–0.585 band. Defaults (`baseSpeed 0.45`, `ballRadius 0.09`) look trackable; unchanged.

### SPEC §14 items touched
- Verified: `physics/` has no reference to the target (test); target, names, positions and velocities re-randomized every round (test); balls move, bounce, collide and never escape, stall or run away (tests + debug run); all Vitest tests pass.

### Deferred
- The debug loop steps physics without render interpolation; phase 3's loop adds it and handles resize.
- "Spawn positions are never ring slots" gets its test in phase 5, with `slots.ts`.

### Known issues / notes
- A Vite dev server for this repo was already running on port 5173, so the Browser pane used it rather than starting another.

## 2026-09-29 — Phase 3: Renderer and loop

### Done
- `util/fixedStep.ts` (pure): accumulates frame time clamped to `[0, maxFrameMs]`, returns whole 120 Hz steps, exposes `alpha` for interpolation.
- `loop.ts`: the single rAF loop — N fixed steps, then one render with `alpha`. No timers anywhere.
- `render/arena.ts`: 15 `<button>` balls (tabindex −1, arena `inert` until selection) with a drawn body inside. The button box is the hit area, `max(ball diameter, minHitPx)`. A ResizeObserver keeps the arena's pixel radius, and every frame each ball gets `translate3d(x·R, y·R)`; the transform is written only when it changes. The ball layer is hidden when there is no round.
- Ball size is CSS-derived from the same `--arena-size` as the arena, via `--ball-r` from config, so JS and CSS never disagree on scale.
- `?debug=1` now runs on the real renderer and loop, interpolating between the last two physics steps.
- Tests (53 total): 60 Hz frames → exactly 2 steps each; remainder carried into `alpha`; a 60 s frame is clamped to 6 steps; negative frame times ignored; total simulated time tracks wall time under jittery frames.

### Spec edits
- §0: `loop.ts`, `util/fixedStep.ts`. §6: rendering interpolates between the last two steps. §5 / §11: new key `minHitPx: 44` (the 44 px §5 already required; no default changed).

### Verified in the browser
- Smoothness: sampled 180 frames with rAF intervals jittering 15.6–17.6 ms. 94% of per-frame moves are within ±10% of each ball's median (the rest are bounces). Without interpolation, jitter at 60 Hz alternates 1- and 3-step frames.
- Resize/orientation mid-run: desktop → 375×812 (arena 343 px, body 30.9 px = 0.09 × 343, hit area 44 px) → 812×375 (arena 215 px). Balls rescale on the next frame, stay inside the arena and never cause horizontal or vertical scroll.
- Throttled tab: stalling the main thread for 2 s moved balls at most 0.035 units (one clamped frame; unclamped would be ~0.9).
- The normal page is unchanged: start screen, ball layer hidden, arena inert, no console errors. The production bundle still excludes the debug module.

### SPEC §14 items touched
- Verified: resizing and rotating mid-run rescales cleanly; a stalled tab pauses instead of desyncing (proxy test above; background tabs stop rAF entirely); balls ≥ 44 px hit area on mobile; no horizontal scroll at 1024×768, 375×812, 812×375; all Vitest tests pass.

### Deferred
- Ball looks (target highlight, picked, revealed), ring labels and live input: phases 4–5.

### Known issues / notes
- 812×375 still gives a 215 px arena, so ring slots will sit ~38 px apart and neighbouring 44 px hit areas will overlap slightly (noted in phase 1; revisit in phase 6).

## 2026-09-29 — Phase 4: State machine and round flow

### Done
- `game/stateMachine.ts`: the ten states, the single legal successor of each, `phaseDurationMs`, and a machine whose clock is whole physics steps (elapsed = steps × 1000 / hz, so 300 steps is exactly 2 500 ms). A state's duration is read once, on entry. Illegal transitions throw when `strict` (dev) and are ignored otherwise.
- `game/session.ts`: Start Game (ignored outside IDLE), round build + `round++` on TARGET_INTRO, physics only in TRACKING, positions frozen afterwards, and cues on the simulation clock (state entries, countdown beats 3/2/1, final ticks 5…1). It keeps the previous step's positions for render interpolation. For this phase the round rests at the freeze: TRACKING_COMPLETE's timer is disabled until phase 5 adds the ring.
- `game/view.ts`: pure HUD and ball views — the only place the target is singled out before REVEAL. The renderers never receive `targetId`.
- `copy.ts`: HUD rows of the §3 table verbatim (`{name}` via `fill`, `**bold**` via `textRuns`), countdown numerals from `config.countdownFrom`, glyphs ★ ✓ ✕.
- HUD renderer: writes only on change (so the live region announces each instruction once); large numerals for 3·2·1·GO!; timer only in TRACKING/TRACKING_COMPLETE; coral ring in the last 5 s. The numeral pop-in and timer pulse are decorative Web Animations, skipped under reduced motion.
- Arena renderer: `data-look`, `--strength` (fade), ★ glyph, name label (side chosen when it appears; anchor slides with x so it stays inside the arena), pulse halo (still under reduced motion). A neutral ball has no look attribute, no inline variables and empty glyph/label.
- Tests (99 total): every legal/illegal transition; each timed state lasts exactly its step count (tracking = 1 800); waiting states never time out; reduced-motion glide and duration-on-entry; session flow, frozen balls, event timing to the step; interpolation; HUD copy per state and time; timer 15 → 1 then 0; highlight hold/fade/zero; and a step-by-step check that after the fade every ball view equals the target's (minus position) through the freeze.

### Spec edits
- §0: `game/session.ts`, `game/view.ts`. §11/§12: new key `countdownFrom: 3` (the count §12 already used). §12: illegal transitions ignored in production; player actions ignored outside their state; state time counted in whole steps; timer shown only in TRACKING/TRACKING_COMPLETE. §10: `--on-accent` also colors ball glyphs.

### Verified in the browser
- The Browser pane was hidden, which stops rAF (so the round correctly paused there). The flow was checked in headless Chrome over the DevTools protocol with a scratch script (not in the repo).
- HUD timeline from the click: intro 0 s; 3/2/1 at 2.5/3.5/4.5 s; GO! with timer 15 at 5.5 s; tracking line at 6.0 s; timer steps each second; "Stay focused!" + urgent ring at 15.5 s (5 left); "Nice! Time's up." with 0 at 20.5 s; balls then stay frozen.
- Screenshots: intro (bold name, coral ★ target, label, halo), countdown, GO!, mid-fade blend, after fade, final seconds, freeze; dark desktop and light 375×812. No horizontal scroll.
- DOM fairness after the fade: the target's markup (minus its transform) equals every other ball's, computed styles match, and no ball has a look attribute, a styled child, or glyph/label text. 5/5 runs.
- Found and fixed a leak: in Chrome, an element whose inline style is emptied through CSSOM (with no read in between) re-serializes as `style=""` even after `removeAttribute('style')`. The former target's label kept `style=""`, which no other ball had, failing 3/3 runs. Inline variables now live on the ball button, whose style always keeps its transform.

### SPEC §14 items touched
- Verified: Start Game begins a round; the target is shown highlighted and named before the countdown; 3-2-1-GO works and motion starts on GO; the timer counts 15 → 1 and freezes at 0; the highlight is fully gone by `revealHoldMs + revealFadeMs` and never returns before the freeze (unit test + DOM check); nothing in the DOM/CSS distinguishes the target during motion; HUD messages go through the live region; all Vitest tests pass.

### Deferred
- RETURNING → RESULT (slots, glide, selection, reveal, result card, scoring): phase 5. Sounds: phase 6.

### Known issues / notes
- The DOM fairness check needs a real browser (the lazy style sync is Chrome behavior), so it isn't in Vitest; the view-level test covers the logic, and the renderer comment records the pitfall.
