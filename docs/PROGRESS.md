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

## 2026-09-29 — Phase 5: Ring, selection, reveal, result, scoring

### Done
- `game/slots.ts`: slot geometry (slot 1 at 12 o'clock, clockwise), `clockAngle`, `assignSlots` (angle, then distance; positions only), ease-in-out `glidePoint` that lands exactly on both ends.
- `game/score.ts`: `100 + 25 × (streak − 1)`, misses reset the streak, best streak, rounded accuracy (0% before any answer).
- Session: RETURNING assigns slots from the frozen positions and glides every ball onto its slot (`returnMs`, or `returnMsReducedMotion` when reduced motion is on at glide start); SELECTION goes live after `settleMs`; the first pick locks input (→ CHECKING); REVEAL scores and emits the answer; RESULT waits; Play Again builds a fresh round.
- View: REVEAL puts the verdict in the HUD; RESULT's HUD is empty; picked / revealed-correct / revealed-target / revealed-wrong-pick looks; input mode off/live/locked; "Ball {slot}" names while the ring is reachable; DOM order = slot order from slot assignment on; slot numbers fade in over the last 40% of the glide; result card content.
- Arena renderer: slot numbers just outside each slot; on the ring names point at the center, and a wrong pick within 3 slots of the target gets its name one row further in; inert when input is off, `aria-disabled` while locked so focus isn't dropped; clicks map to ids through a WeakMap (no ids in the DOM).
- `input/selection.ts`: click/tap/Enter/Space → pick through one guard; arrows, Home and End move around the ring.
- Result card: verdict (emoji hidden from screen readers), sub-line, the five stats, Play Again (focused on entry, described by the sub-line). It hangs below the arena; if the viewport is too short the page scrolls just enough (header and HUD first), and Play Again scrolls back to the top. Landscape phones get a compact two-row card. The bounce-in and the reveal pop are decorative and off under reduced motion.
- Tests (134): ring geometry and clockwise numbering; slot assignment order, tie-break, order-independence; spawn never on a slot center and never slotted; glide endpoints, straight path, easing; scoring sequences and accuracy; session glide lands exactly on the slots; reduced-motion glide length; pick guards (motion, settle, non-ball, second pick); scoring only at REVEAL; streak across rounds; Play Again; HUD verdict; input modes; aria names; DOM order; slot-number fade; looks for correct and wrong picks; neighbour name stepping; result card text; fairness now step by step through selection.

### Spec edits
- §4: the result card may scroll the page on short viewports; Play Again scrolls back. §5: slot numbers on the outer side, names on the inner side. §7: new key `slotLabelFadeFrom: 0.6` ("the last part of the glide"); DOM in slot order. §8: arrows/Home/End; balls stay focusable but `aria-disabled` through CHECKING/REVEAL; REVEAL shows the verdict in the HUD; RESULT's HUD is empty. §11: `slotLabelFadeFrom`. §12: SELECTION/REVEAL/RESULT rows updated to match.

### Verified in the browser (headless Chrome, full rounds)
- 1024×768 light, keyboard only: clicking the target during tracking did nothing; at SELECTION the HUD asked for the target, DOM order was Ball 1…15, every ball's markup matched (minus position and slot name), tabindex 0. Tab order: sound, Light, Dark, System, Ball 1, Ball 2. →/←/Home/End moved focus as expected with a visible ring. Enter picked: "Checking...", picked outline, focus kept, a second click ignored. REVEAL: "🎯 Nailed it!", ✓ on the target, strip updated. RESULT: HUD empty, card text right, Play Again focused, page scrolled 76 px with card and whole arena visible, arena inert. Enter on Play Again: round 2 intro at scroll 0.
- 375×812 dark, wrong pick: ✕ + outline + name on the pick, ★ + name on the target, sub-line "You picked … (#1). … was #10."; the card fits without scrolling.
- 812×375 light: first version scrolled 109 px and hid the top of the ring (both highlighted balls there), and neighbouring names collided. Fixed with the compact card and name stepping; now it scrolls 31–64 px with the arena whole and the stats on one row.
- 1024×768 dark with a neighbour pick: names don't overlap; card clear of the bottom edge (footer padding now counts toward the scrollable area).
- The phase 4 DOM fairness check still passes 3/3.

### SPEC §14 items touched
- Verified: balls glide to the ring, slot numbers appear, exactly one ball can be picked; input locks after the pick, "Checking..." shows, the reveal follows after the delay; correct and incorrect results show the right copy and highlights; score, streak, best, accuracy and round update (tests + browser); Play Again starts a fresh round with a new target; spawn positions are never ring slots and slots are assigned only at the freeze; nothing in the DOM distinguishes the target during motion, returning or selection; keyboard-only play works through a whole round; every color state has a glyph or label; no horizontal scroll at 1024×768, 375×812, 812×375; all Vitest tests pass.

### Deferred
- Sound, reduced-motion pass, mobile QA and a11y review: phase 6.
- SPEC §9's optional `followone.best` persistence isn't implemented: it would change what "Best 🔥" means (session vs all-time), which the spec doesn't settle.

### Known issues / notes
- At 812×375 the ring slots are ~38 px apart, so neighbouring 44 px hit areas still overlap slightly (phase 6).
- The test harness must target `.start-card .button-primary`: Play Again also uses `.button-primary` and comes earlier in the DOM.

## 2026-09-29 — Phase 6: Polish (sound, reduced motion, a11y, mobile QA)

### Done
- Sound (`audio/sfx.ts`): synthesized with Web Audio (oscillator + gain envelope), no files. The audio context is created and resumed from the Start Game click, and also on Play Again and when sound is switched on. Cues:
  - reveal chime when the target is revealed (TARGET_INTRO);
  - tick on each countdown numeral, then GO;
  - a soft tick on each of the last 5 s, then freeze;
  - at REVEAL, a rising C–E–G–C arpeggio or a soft falling low tone.
  Nothing is scheduled while off, and switching off silences what's still ringing. Sounds are dropped (not queued) if the context never starts. The context factory is injectable, so all of this is unit-tested with a fake.
- Optional collision clicks: physics now returns its collision count; the session emits a cue; `config.collisionClicks` (default false) gates it, and sfx throttles to `collisionClicksPerSecond`.
- Taps resolve to the nearest ball center, so the slightly overlapping 44 px hit areas on small landscape arenas pick the ball under the finger; Enter/Space keep the focused ball.
- Accessible names no longer carry stray spaces next to aria-hidden emoji (the gap is CSS margin now), e.g. region "Not quite!", term "Streak".
- The arena doesn't select text or open the touch callout on quick taps.
- Tests (144): sound unlock/off/silence/resume/drop/throttle and per-cue recipes; physics collision counting; collision cues only during tracking.

### Spec edits
- §10: when each effect plays (the "reveal chime" marks the target reveal at TARGET_INTRO, the spec's "reveal window"; REVEAL has correct/incorrect); recipes live in `audio/sfx.ts` like the palette lives in CSS; Play Again and switching sound on resume audio; switching off silences; failed contexts drop sounds. §5: nearest-center picking where hit areas overlap. §11: new keys `collisionClicks: false`, `collisionClicksPerSecond: 6` (the §10 values).

### Verified in the browser (headless Chrome over the DevTools protocol)
- Sound, with Chrome's autoplay exemption turned off and a trusted click on Start: the context is `running`, and oscillator starts line up with the round:
  - chime ×2 partials at 0.2 s;
  - ticks at 2.6 / 3.6 / 4.6 s, GO ×2 at 5.6 s;
  - soft ticks at 15.6–19.6 s, freeze at 20.6 s;
  - the incorrect tone at REVEAL.
  After clicking the toggle to "Sound off", a whole second round scheduled 0 oscillators.
- Reduced motion: no CSS or Web Animation runs anywhere in a round (pulse, numeral pop, timer pulse, reveal pop, result bounce, arena fade all off); the target halo is static; balls still move; glide + settle = 899 ms vs 1299 ms normally.
- Accessibility tree per stage: named header controls with `aria-pressed`; balls absent from the tree during motion; 15 "Ball N" buttons in selection; `disabled` during checking with focus kept; the result region named by the verdict; Play Again described by the sub-line; the live region carries each instruction.
- Mobile/desktop sweep, a full round each: 320×568, 360×740, 375×812, 390×844, 412×915, 568×320, 667×375, 812×375, 844×390, 768×1024, 1280×800, 1440×900, 1920×1080. At every size:
  - zero horizontal overflow at start, intro, selection and result;
  - the target's name label and all slot numbers stay on screen;
  - hit areas ≥ 44 px;
  - a tap on ball 5's center picks Ball 5 (at 568×320 neighbours are only 28 px apart);
  - at RESULT the card is fully visible and the arena whole.
  Portrait phones ≥ 375 px wide need no scroll; the rest scroll 14–146 px.
- Performance at 390×844: 60 fps with frame p95 16.7–16.8 ms, both unthrottled and with 4× CPU throttling; ~1.3 ms main-thread work per frame (script 0.12 ms, style 1.2 ms, layout 0).

### SPEC §14 items touched
- Verified: sound toggle works and persists, nothing plays while off, audio unlocks on the first click; keyboard-only play through every step with visible focus; HUD messages go through the live region; reduced motion removes decorative animation and stays playable; no horizontal scrolling at 13 sizes; balls visible and tappable (≥ 44 px) on mobile; smooth ~60 fps (headless, incl. 4× throttle — not measured on a physical phone).

### Deferred
- Phase 7: walk the whole §14 checklist, re-check the production build from `file://` and a subpath.

### Known issues / notes
- Parallel headless runs can collide on a DevTools port (one bogus 360×740 row; a solo rerun was correct).
- Sound was verified by scheduling, not by ear: the headless browser has no audible output.

## 2026-09-29 — Phase 7: Acceptance

### Done
- Walked SPEC §14 against the production build (`npm run build`, served by `vite preview`), keyboard only, three rounds (correct, correct, wrong), plus the checks from phases 2–6.
- Fixes from the walk:
  - `loop.ts` now requests the next frame before stepping and rendering, so one frame that throws can't stop the game for good.
  - The cue→sound mapping in `main.ts` is a switch.
  - The arena no longer rewrites the ball layer's `hidden` every frame.
- `.claude/launch.json`: a `dist-subpath` server (python `http.server` on 4174 at the repo root) for checking the build under `/dist/`.

### SPEC §14 checklist
Flow
- [x] Start screen works; Start Game begins a round — mouse and keyboard (Tab → Start Game → Enter), production build.
- [x] Target shown highlighted and named before the countdown — "Your target is **X**", coral ★ + label, every round.
- [x] 3-2-1-GO works; motion starts on GO — HUD timeline to the step (phase 4) and unit tests.
- [x] Timer counts 15 → 1 and freezes at 0 — HUD timeline and view tests.
- [x] Balls glide to the ring, slot numbers appear, exactly one ball can be picked — session tests; browser (second pick ignored).
- [x] Input locks after the pick; "Checking..." shows; reveal follows the delay — browser + tests.
- [x] Correct and incorrect results display with the right copy and highlights — rounds 1–3: "🎯 Nailed it! You found Alpha." / "👀 Not quite! You picked Eta (#8). Alpha was #7.", ✓ / ★ / ✕ looks.
- [x] Score, streak, best, accuracy, round update correctly — after correct, correct, wrong: Round 3 · Score 225 · Accuracy 67% · Streak 0 · Best 2 (100 + 125, then a miss).
- [x] Play Again starts a fresh round with a new random target — Enter on the focused Play Again; targets Alpha, Xi, Alpha (repeats allowed, §2.4).

Fairness
- [x] Highlight fully gone by `revealHoldMs + revealFadeMs`, never back before REVEAL — step-by-step view test through selection.
- [x] Nothing in the DOM/CSS distinguishes the target during motion, returning or selection — markup compared with every other ball after the fade, mid-glide and in selection, all 3 rounds of the production run (plus 5 + 3 dev runs); computed styles equal too. A Chrome `style=""` leak was found and fixed in phase 4.
- [x] Spawn positions never ring slots; slots only at the freeze — tests (2 000 rounds, slot null until RETURNING, slots = assignment of the frozen positions).
- [x] `physics/` has no reference to the target — source-scan test, plus `Body` carries no id or name.
- [x] Target, names, positions, velocities re-randomized every round — 15 000-round uniformity tests.

Physics
- [x] Balls move continuously, bounce, collide and push — tests + debug free-run + every round.
- [x] No ball escapes, sticks, stops dead or runs away — invariants after every step over 120 000 steps; roam test.
- [x] Smooth ~60 fps — 60 fps, frame p95 16.7 ms at 390×844, also with 4× CPU throttle (headless; not measured on a physical phone or laptop GPU).
- [x] Hidden tab pauses; resize/rotate rescales — another tab in front for 3 s: timer held at 13 and balls didn't move, then the round continued (13 → 12). Resizing 1024×768 → 600×900 mid-round: arena 568 px, balls inside, no overflow.

Settings and accessibility
- [x] Themes work and persist, no flash — Dark chosen, page reloaded: `data-theme="dark"`, Dark pressed; the inline theme script precedes the stylesheet.
- [x] Sound toggle works and persists; nothing plays while off; audio unlocks on the first click — trusted click with the autoplay exemption off: context running, cues on time; after "Sound off", a whole round scheduled 0 oscillators.
- [x] Keyboard-only play works for every step but tracking; focus always visible — whole production run by keyboard; focus ring on balls, Play Again, header controls.
- [x] HUD messages announced via the live region — one polite region, written only on change; the accessibility tree shows it per stage.
- [x] Reduced motion removes decorative animation and stays playable — no animation runs; the glide is shortened; the balls still move.
- [x] Every color state has a glyph or label — ★ ✓ ✕, outlines and names; the view tests pin looks per state.

Layout
- [x] No horizontal scrolling on any screen size — 13 viewports from 320×568 to 1920×1080, at start/intro/selection/result: overflow 0.
- [x] Balls visible and tappable (≥ 44 px hit area) on mobile — hit ≥ 44 px at every size; taps hit the ball under the finger even where hit areas overlap (568×320: 28 px apart).
- [x] Desktop arena centered and the primary visual element — screenshots at 1024–1920 px.

Code
- [x] All Vitest tests pass — 144.
- [x] Modules as in §0, no giant file, no tunables outside `config.ts` — the tree matches §0 file for file. The largest file is 220 lines. A literal audit finds only unit conversions, formula constants, safety guards, and presentation constants beside the code that draws them (sound recipes per §10, label placement, decorative animation timing).

### Also verified
- The production build runs from `http://127.0.0.1:4174/dist/` and from `file://…/dist/index.html`: styled, one deferred classic script, a round starts and balls move, no console errors.

### Known issues / notes
- 60 fps and sound were verified in headless Chrome (timing and scheduling), not on a physical phone or by ear.
- SPEC §9's optional best-streak persistence is not implemented (see phase 5).
- Landscape phones: small arena by design (215 px at 812×375); neighbouring hit areas overlap slightly and resolve to the nearest ball.

## 2026-09-29 — Spec v1.1 and Phase 8: Settings drawer, ball count and speed

### Spec edits (v1.1, before any code)
- The additions requested today (settings drawer, ball count, speed, ball/target colors, arena countdown, hidden cursor, Play typeface) are specified across §0–§16 and split into phases 8–11 in §13. New §16 Settings; §14 gains Settings and "Arena countdown, cursor, typography" items.
- Decisions made while specifying:
  - Names for 25–30 balls: the pack now lists all 24 Greek letters, then six archaic ones (Digamma, Koppa, Sampi, San, Sho, Yot). A round uses the first n names, shuffled (`shuffle(names.slice(0, n))`), so a 15-ball game still uses Alpha–Omicron.
  - Ball radius `max(ballRadiusMin, ballRadius × √(15 / n))`: 0.09 at 15 as before, same arena coverage (~12%) at every count, 0.065 floor. The ring keeps the balls' outer edge where it was (`slotRadius + ballRadius − r`).
  - Speed presets multiply `baseSpeed`. Faster presets run `⌈factor⌉` substeps per step: with 3 collision passes, 30 balls at Extreme exceeded the 1e-3 overlap limit (1.02e-3 once in 720k steps); with substeps every combination stays ≤ 6.1e-4.
  - The arena countdown takes 3·2·1 and GO! (strong), then the seconds (faint); the HUD keeps the intro line through the countdown and drops the timer (phase 10).
  - Settings are disabled from TARGET_INTRO through REVEAL with a note; opening Settings doesn't pause the round.
- CLAUDE.md: the Play font is the one allowed web font; `settings/` is pure; the settings lock is a hard rule.
- §11 new keys: `ballCountMin: 10`, `ballCountMax: 30`, `ballRadiusMin: 0.065`, `speedPresets`, `speedPreset: 'normal'`, `storageKeys.settings`. No existing default changed: 15 balls at Normal play exactly as before (same radius, ring, speed, no substeps).

### Done
- `settings/settings.ts` (pure): defaults, per-field validation (count rounded and clamped to 10–30, unknown presets → Normal), JSON persistence under `followone.settings` through the storage wrappers, `roundSetup`, `settingsLocked`.
- `game/round.ts`: `ballRadiusFor`, `RoundSetup` (count + speed factor), rounds carry `ballRadius`, `ringRadius`, `speedFactor`; `roundPhysics` gives the round's speed and substeps. `physics/world.ts` takes an optional `substeps`.
- Session reads the setup once as each round is built; physics and the glide use the round's values.
- Arena renderer builds one element set per ball count (fresh, identical elements when the count changes at round start) and takes `--ball-r` and the ring from the view. The "neighbouring wrong pick" name stepping is now a fifth of the ring (3 of 15, 6 of 30).
- Header: ⚙ at the left edge (header now spans the full width), title centered. Theme and sound moved into the drawer.
- Drawer (`render/settingsPanel.ts`, `render/controls.ts`, `styles/settings.css`, `styles/controls.css`): modal `<dialog>` sliding from the left, Game (Balls slider with "n balls" and 10/30 ends, Speed segmented radios) and Appearance (Theme segmented radios, Sound switch). ✕, Esc and a backdrop press close it (a slider drag that ends on the backdrop doesn't); focus returns to ⚙. 360 px wide, `100vw − 40px` on phones, full width below 360 px, scrolls on short screens.
- Start meta line follows the ball count. Debug free-run: ball-count slider, radius-at-15 slider, substeps like the presets.
- Tests (177, was 144): settings parsing/validation/persistence/locking; radius per count and the sizes §5 quotes; rounds of every count (ids, radius, ring, names from the start of the pack); spawn bounds at 10 and 30; spawn speed per preset; `roundPhysics`; target and name uniformity at 30 balls; ring gap and outer edge for every count; slot numbering at 10 and 30; §6 invariants at 10 and 30 balls × Slow and Extreme (shared checker with the default test, limits unchanged); substeps = two half steps with summed collisions; session reads the setup only at round start, runs at the round speed, glides 30 balls onto their ring; view radii; name stepping at 10 and 30; copy rows for the drawer.

### Verified in the browser (headless Chrome over the DevTools protocol; the Browser pane was hidden)
- Drawer at 1280×800, keyboard and pointer: Tab order ⚙ → Start Game; Enter opens it with focus on ✕; Tab cycles ✕ → Balls → Speed → Theme → Sound inside it; End/← on the slider (value, "30 balls", meta line, storage); click and ←/→ on Speed; Theme Dark applies at once; the Sound label and switch both toggle (aria-checked, "On/Off", `followone.sound`). Esc, ✕ and the backdrop close it; focus back on ⚙. Reload restores 30 balls, Extreme, Dark, sound off. Accessibility tree: modal dialog "Settings", slider "Balls" 10–30, radio groups "Speed" and "Theme", switch "Sound".
- Sizes 1280×800, 375×812, 360×740, 320×568, 812×375, light and dark: no horizontal overflow with the drawer open or closed, no clipped segment labels, arena sizes unchanged from phase 7 (588/343/328/288/215 px). Drawer slides in (−360 → 0 px); reduced motion shows it at once.
- Full rounds at 1280×800, 390×844, 375×812 and 812×375, 30 balls at Extreme then 10 at Slow (changed in RESULT, applied from Play Again; the arena kept its 30 balls until then):
  - 30 balls: r 0.065 (38 px on 588, 22 px on 343, 14 px on 215), hit areas 44 px, measured speed 0.63–0.69 u/s (Extreme 0.72, sampled over 150 ms); ring at exactly 0.875, labels Ball 1…30, slot numbers on screen; tapping slot 5's center picked #5 everywhere, including 812×375 where neighbours are ~20 px apart.
  - 10 balls: r 0.110 (65 px on 588), ring 0.830, speed 0.27–0.30 u/s (Slow 0.315).
  - Drawer mid-round (intro and tracking): note shown, Balls and Speed disabled (End on the slider changes nothing), Theme and Sound work. In RESULT: unlocked.
  - DOM fairness at 30 and 10 balls: after the fade and in selection every ball's markup is identical (minus transform and slot name), no look attributes.
- Performance: 30 balls at Extreme at 390×844 — 60 fps, frame p95 16.7 ms unthrottled and 16.8 ms at 4× CPU throttle.
- Production build: one deferred classic script, no `crossorigin`, debug code excluded. From `http://127.0.0.1:4174/dist/` and from `file://`: stored settings restored (22 balls, Fast) and the round built with 22 balls. No console errors in any run.

### SPEC §14 items touched
- Verified: ⚙ opens the drawer; ✕/Esc/backdrop close it; focus returns; no horizontal scroll on phones. Balls, Speed, Theme and Sound work with pointer and keyboard. Those four persist across reloads with first-visit defaults 15 · Normal · System · On. Ball count and speed are locked with the note from TARGET_INTRO through REVEAL (unit test for every state, browser in intro and tracking) and apply from the next round. Balls resize with the count; every count spawns, rings without overlaps, numbers 1..n, unique names (tests for all 21 counts, browser at 10 and 30). No escape/stick/stall/runaway at 10 and 30 × Slow and Extreme. ~60 fps with 30 balls (headless, 4× throttle). Target indistinguishable after the fade at 10 and 30 balls. No horizontal scroll; ≥ 44 px hit areas; keyboard-only drawer use with visible focus; reduced motion removes the slide. All tests pass.
- Not yet (later phases): Ball color, Target color and the color hint (phase 9); the arena countdown, the hidden cursor and Play (phase 10). The "six settings persist" item has four of six until phase 9.

### Deferred
- Phase 9: ball and target colors. Phase 10: arena countdown, cursor, typography. Phase 11: v1.1 acceptance.
- §0 lists `render/countdown.ts` (phase 10) and `theme/palette.ts` (phase 9), not written yet.

### Known issues / notes
- Headless Chrome only: a CDP `Escape` key press, and `Enter` sent as rawKeyDown + char, mark the page `hidden`, which stops rAF (the game pauses, correctly). Enter sent as `keyDown` with text works. Esc closing the drawer was verified on its own; the round runs close it with ✕.
- Chrome's accessibility tree reports the Balls slider's value text as "15", not the `aria-valuetext` "15 balls"; a plain `<input type=range>` does the same, so it's Chrome's mapping. The label "Balls" plus the value still reads clearly.
- In RESULT on short viewports the page scrolls to the card, so ⚙ (in the header) scrolls out of view until the player scrolls up; it is never fixed over the arena.
- Collision clicks still exist and stay off by default (`collisionClicks: false`), as before.

## 2026-09-29 — Phase 9: Duration, arena countdown, cursor and typography

Asked for after phase 8: a way to change the round's duration, and the countdown as a watermark in the middle of the arena. The watermark was planned for phase 10 with the cursor and the Play font (its numerals are set in Play), so that whole phase moved up and colors became phase 10.

### Spec edits
- Duration setting (§1, §2.6, §3, §11, §12, §14, §16): a slider from 10 to 60 s in 5 s steps, default 15 s, locked during a round like ball count and speed, stored in `followone.settings`. New §3 row "Duration setting | Duration · {seconds} seconds"; `{seconds}` in the start meta line is now the setting.
- §11 new keys: `trackingMsMin: 10000`, `trackingMsMax: 60000`, `trackingMsStep: 5000`. `trackingMs: 15000` is unchanged and is the default.
- §13: phases re-cut: 9 duration, arena countdown, cursor and typography; 10 colors; 11 acceptance.
- §8: in RESULT "the balls become inert" (was "the arena"): the cursor rule needs the arena itself to take the pointer. §10: Play loads without blocking the first paint.
- CLAUDE.md: the settings-lock hard rule includes duration.

### Done
- Duration: `Settings.trackingMs` (snapped to the 5 s grid within 10–60 s), `RoundSetup`/`Round.trackingMs`; the session times TRACKING and the final-second ticks from the round's duration; the drawer's Game section gains a Duration slider (seconds shown, ms stored) that locks with the others; the start meta line shows it.
- Arena countdown (`render/countdown.ts`, `styles/countdown.css`, `countdownView`): one large Play-bold numeral in the middle of the arena, the arena's first child, so it draws over its face and edge and under the balls; `pointer-events: none`, `aria-hidden`. 3·2·1 and GO! at 55% opacity, the seconds left and the freeze's 0 at 14%, empty from RETURNING on. Two stacked faces crossfade with a slight scale (old out, new in); reduced motion swaps instantly. The face is trimmed to cap height (`text-box`), so the digits' ink sits on the arena's center; browsers without `text-box` get a measured 0.035 em nudge instead.
- HUD: the intro line stays up through the countdown; from the first step of tracking it shows "Keep your eyes on {name}" (then "Stay focused!"). The visible timer pill and the big-numeral mode are gone; a visually hidden `role="timer"` keeps the seconds available to assistive technology. The target's name in the intro line is bold and larger.
- Cursor: `data-hide-cursor` on the arena during TRACKING hides the cursor over the circle only. `inert` moved from the arena to the ball layer: Chrome skips inert elements when hit-testing (checked on a bare page), so an inert arena would show the page's cursor.
- Typography: Play 400/700 from Google Fonts with preconnects; the stylesheet loads as `media="print"` and switches on load, so a slow or blocked font host never delays the first paint. The build keeps `crossorigin` on the font preconnect (only our own `./` assets lose it now). Weights normalized to Play's two: 700 for titles, names, buttons, labels, numbers; 400 for instructions and secondary text (meta line, stat labels, setting values).
- Tests (186, was 177): duration clamping, parsing and persistence; round keeps its duration; the session moves the balls for the round's duration with the final ticks in its last 5 s, ignores a mid-round change and uses the new one next round; HUD per state (intro through the countdown, tracking line from step 1, hidden timer 15 → 1 → 0); arena countdown per state (3·2·1 strong, GO! then 15 → 1 faint, 0 at the freeze, empty otherwise); countdown from a 30 s round; cursor hidden in TRACKING only; copy row for Duration.

### Verified in the browser (headless Chrome over the DevTools protocol; the Browser pane was hidden)
- Play loads (400 and 700) on the dev server and from `file://` in the production build; body font Play. The watermark is Play bold.
- Watermark at 1280×800 light, 375×812 dark and 812×375 light, with a 20 s duration: empty in the intro; 3 → 2 → 1 strong; GO! strong with the HUD already on "Keep your eyes on …"; then 19 → 1 faint; "Stay focused!" at 5; 0 at the freeze; gone during the glide and selection. It is the arena's first child, `pointer-events: none`, `aria-hidden`; at every ball's center the topmost element is the ball. After the `text-box` fix the numeral's box is the digit's cap height (168 px vs 170 expected at 1280×800) and sits exactly on the arena's center (0, 0 px); before it the ink sat ~9 px low.
- Cursor: during TRACKING the hit test at the arena's center lands on the arena (not the page) with `cursor: none`, balls too; just outside the circle the page shows `auto`; before and after TRACKING the flag is off.
- Duration: slider 10–60 step 5 reads "15 seconds"; → moves to 20, updates the meta line and storage; a 60 s round starts at "60"; both sliders are disabled mid-round.
- Reduced motion: numerals 3 2 1 GO! 15 14 13 appear with zero Web Animations and no opacity transition; with motion both faces animate on each change.
- Layout with Play at 1280×800, 375×812, 360×740, 320×568, 812×375: no horizontal overflow, no clipped segment labels, arena sizes unchanged (588/343/328/288/215 px). The drawer now scrolls at 320×568 (50 px) and 812×375.
- Font host blocked (`Network.setBlockedURLs`) or hanging (requests intercepted and never answered), production build from `file://`: first contentful paint at 92–120 ms, no Play faces registered so the system font renders, and a round starts and counts down. Online the same build loads Play 400 and 700.
- Regression: phase 8's rounds (30 balls Extreme, 10 balls Slow, changed in RESULT) and keyboard/accessibility runs pass: ring, fairness after the fade and in selection, locking, tab order ✕ → Balls → Speed → Duration → Theme → Sound, AX tree with slider "Duration". 30 balls at Extreme with the watermark: 60 fps, p95 16.7 ms at 4× CPU throttle.

### SPEC §14 items touched
- Verified: 3·2·1 and GO! strong, then the seconds faint, large in the arena center behind the balls, never blocking a pick, 0 at the freeze, gone for the ring; timer counts down from the round's duration and freezes at 0; the cursor hides over the arena only while tracking and comes back outside it and after; Play everywhere with a clear hierarchy, system font as fallback; Duration works with pointer and keyboard, persists, and is locked mid-round; reduced motion removes the countdown's scale/fade; no horizontal scroll; all tests pass.
- Not yet: Ball color, Target color and the color hint (phase 10), so "all seven settings persist" has five of seven.

### Deferred
- Phase 10: ball and target colors. Phase 11: v1.1 acceptance.

### Known issues / notes
- Google Fonts receives visitors' IP addresses and needs a connection; self-hosting the two woff2 files would avoid both (not done: the spec asks for Google Fonts).
- Screen readers get the tracking seconds from the hidden timer on request, as before; the watermark itself is decorative.

## 2026-09-29 — Layout: ⚙ on the right, page column, smaller desktop arena

Asked for after phase 9: move ⚙ from the left to the right, and stop the "canvas" running full width on desktop, with a sensible width on every device. "Canvas" could mean the header (edge to edge on wide windows, ⚙ at the window's left edge) or the arena (640 px, only 40 px from the edges in a 720 px window); the answer was both. The drawer follows ⚙ to the right.

### Spec edits
- §4: the whole stack is one centered page column. Column width = `min(W, (W + fullWidthMaxPx) / 2, arenaMaxPx)`, W being the width between the gutters: full width on phones up to 432 px, then half of every extra pixel goes to the side margins, capped at 560 px. Arena diameter = `min(column, available height − chrome)`. Header: title centered, ⚙ at the right end.
- §11: **default changed:** `arenaMaxPx` 640 → 560 (desktop arenas are 12.5% smaller; balls scale with them). New key `fullWidthMaxPx: 432`.
- §16 and §14: ⚙ at the right end of the header; the drawer slides in from the right. The §14 Layout item "Desktop arena is centered…" now describes the column. §5: 30 balls are ≈ 36 px on a 560 px desktop arena (was 42 px on 640). §0: `header.ts` is "title and ⚙".

### Done
- `layout.css`: `--column-w` (the formula above) replaces `--panel-w`. Header, HUD, footer and the start slot take the column width; the arena takes `min(column, height left)`.
  - `#app` is now an inline-size container, so the header measures the column exactly as the stage does.
  - `--full-width-max` comes from config, like `--arena-max`.
  - The fallback for browsers without container queries uses the same formula in viewport units.
- Header: the title comes first in the DOM and ⚙ sits in the third grid column, so reading order matches the screen. ⚙ is still the first Tab stop.
- Drawer: pinned to the right edge and slides in and out to the right. Its rounded corners and shadow are on the left; the safe-area padding is on the right.
- Tests (188, was 186): `tests/config.test.ts` checks `config.ts` against the SPEC §11 block (it fails when a default changes in one but not the other; confirmed by bumping a spec value). It also checks the fluid band exists (`fullWidthMaxPx < arenaMaxPx`).

### Verified in the browser (Browser pane for static layout; headless Chrome over the DevTools protocol for rounds, keys and the drawer's motion)
- Column width matched the formula at 19 viewports. At each: header = HUD = footer, arena and title centered, ⚙ flush with the column's right end, no horizontal overflow.
  - 320, 375 and 430 px phones: full width (16 px margins).
  - 480 → 440 (20 px margins); 600 → 500 (50); 720 → 560 (80); 768 → 560 (104).
  - 1280×800, 1440×900, 1920×1080 → 560 (were 588/640/640). 1024×768 → arena 556 (height-limited).
  - 1366×650 → arena 438 in a 560 column. Landscape 812×375 → arena 215, column 560; 568×320 → arena 160, column 484 (start card fits, no scroll).
- Full rounds at 1440×900 light, 1920×1080 dark, 1280×650 light, 720×900 light, 768×1024 dark, 375×812 dark, 360×740 light, 320×568 light, 812×375 light and 568×320 dark:
  - the column held through intro and selection;
  - slot numbers stayed on screen and hit areas were ≥ 44 px (50 px on desktop, neighbours 99 px apart at 15 balls);
  - after picking Ball 1, the result card was fully visible with focus on Play Again. The page scrolled 93, 31 and 54 px at 1280×650, 812×375 and 568×320, so scrolling still works with `#app` as a container;
  - Play Again went back to the top. No console errors.
- Drawer: at every size its right edge is the viewport's. At 1280 px it opens 1090 → 920 px and closes 920 → 1280 px, with no horizontal overflow on any frame. Reduced motion shows and hides it at once. The backdrop (✕ below 360 px, where the drawer is full width) closes it and focus returns to ⚙.
- Keyboard: Tab → ⚙ → Start Game; Enter on ⚙ opens the drawer with focus on ✕; Esc closes it and focus returns to ⚙.
- Production build from `file://`: same layout, a full round at 320×568, no console errors.

### SPEC §14 items touched
- Verified:
  - ⚙ (right end of the header) opens the drawer from the right; ✕, Esc and the backdrop close it; focus returns to ⚙; no horizontal scroll on phones.
  - No horizontal scrolling at 19 sizes; hit areas ≥ 44 px.
  - One centered page column: full width on phones, side margins beyond, 560 px cap on desktop, ⚙ at its right end, the arena the primary visual element.
  - Resizing mid-round rescales cleanly: during tracking, 1440×900 → 600×900 → 375×812 took the arena from 560 → 500 → 343 px with the column; every ball stayed inside; no overflow.
  - All tests pass.

### Known issues / notes
- Pre-existing, not caused by this change: at 320×568, when the "Not quite!" sub-line wraps to an extra line, the result card and the arena don't both fit. The page scrolls 136 px and the arena's top ends up 4 px above the viewport, while §4 wants the arena whole. A build of the previous commit does the same; the column at that width is unchanged (288 px).

## 2026-09-29 — Phase 10: Ball and target colors

### Spec edits
- §16: ΔE is the OKLab distance ×100, with each deficiency simulated as Machado et al. (2009) at full severity (the model Chrome DevTools emulates). The floor is 6 under normal vision and each deficiency, in both themes. A pair is comfortable at ≥ 15 (normal) and ≥ 8 (each deficiency); otherwise it gets the hint. These are the usual data-visualization thresholds; the floor can sit below them because the target never relies on color alone.
- §16: the hint follows the current theme, since tones differ per theme. Its one-tap fix is the target color that clears the comfort line by the widest margin. Each tone is a fill, a glyph ink and an edge (the fill itself, or a rim). The chosen color's name shows beside the label.
- §16: the dot beside the title is a fixed brand mark in the default red, not the target color (your call, asked in this session).
- §5, §10: glyphs take the chosen color's ink, and `--ball`/`--target` have `-ink` and `-edge` tokens. `--on-accent` no longer colors ball glyphs.
- §0: `palette.ts` also holds the color hint.
- §11 new keys: `ballColor: 'blue'`, `targetColor: 'red'`, `colorPairFloor: 6`, `colorComfortNormal: 15`, `colorComfortDeficient: 8`. No existing default changed: Blue and Red keep their exact tones in both themes.
- CLAUDE.md: `theme/palette.ts` is on the pure list.

### Done
- `theme/palette.ts` (pure):
  - the option lists: Blue, Purple, Green, Orange, Cyan / Red, Pink, Yellow, White;
  - `toneVars`/`colorVars`, which point `--ball`/`--target` and each swatch at a color's tokens;
  - the pair-distance guard: sRGB → linear → Machado → OKLab, then `pairDistances` and `comfortMargin`;
  - `colorHint`, which reads the tones through an injected reader.
- Tones in `styles/tokens.css`, one set per theme, as `--{kind}-{id}`, `-ink` and `-edge`.
  - Light theme: orange, cyan, yellow and white are rimmed; the rim is a 2 px inset ring (`--edge-w`). The dark theme needs no rims.
  - `main.ts` sets the chosen colors as inline custom properties on `<html>`, at startup and on every change.
- Arena:
  - Every ball draws its edge. The target's fill and edge both fade into the ball's.
  - Glyphs use the tone's ink.
  - The target's pulse takes the edge color, so a white or yellow target's halo shows on the light arena.
- Settings: `ballColor` and `targetColor` are validated on their own (only listed names), persisted with the rest, and locked with Balls, Speed and Duration.
- Drawer: Ball color and Target color rows of swatches (`swatchChoice`, a native radio group: arrow keys, ring + ✓ + name).
  - The hint sits under the target swatches as a polite status region. Its color name is a button (a mini swatch plus the name), described by the hint sentence.
  - The fix moves focus to the new swatch. The hint re-checks on any color change and on theme changes (`ThemeController.onChange`, new).
- Copy: the three §3 rows (`ballColor`, `targetColor`, `colorHint`) and a `chosen` ✓ glyph.
- Tests (222, was 188): `tests/palette.test.ts` reads `tokens.css` as each theme resolves it (the dark block over the light one, `var()` resolved).
  - It checks that every option defines fill, ink and edge in both themes, and that each edge is ≥ 3:1 against the arena.
  - A rim must be darker than its fill, and only where the fill alone is below 3:1. Ink must be ≥ 3:1 on its fill.
  - Every pair must be ≥ the floor under all four visions in both themes. The defaults must be comfortable, and every hint's fix must clear it.
  - Math: Ottosson's reference OKLab value for red, grays unchanged by every simulation, each deficiency's own confusion pair, and the default pair's four distances. Those match an independent implementation of the same models: 33.6 / 24.7 / 30.9 / 33.3.
  - `colorHint` logic on made-up tones.
  - Settings: color defaults, validation, persistence. Copy rows. Theme listeners.
  - Mutation check: a too-dark green, a missing white rim, an unneeded blue rim, a rim leaking from the light block into the dark one, and unreadable orange ink each fail the suite.
- `vite.config.ts`: `test.css.include` for `tokens.css`, because Vitest blanks CSS imports (even `?raw`) otherwise. The build ignores it.

The hard pairs with the shipped tones (everything else is comfortable):

| Theme | Pair | Limiting distance | Fix |
|---|---|---|---|
| Light | green/red | deuteranopia 6.6 | White |
| Light | orange/red | normal 12.8 | White |
| Dark | orange/red | normal 10.6, deuteranopia 7.3 | White |

### Verified in the browser (headless Chrome over the DevTools protocol; the Browser pane was hidden)
- Drawer at 1280×800, light and dark:
  - A first visit has Blue/Red, no hint and nothing stored.
  - Orange balls → "Hard to tell apart from the balls. Try White." Tapping White sets the target to White, clears the hint, focuses the White swatch and stores the choice.
  - Green/red shows the hint in light and not in dark; switching the theme re-checks it.
  - Arrow keys move through a swatch row and wrap. The focus ring sits outside the chosen ring.
- 320×568: no horizontal overflow in the page or the drawer, each swatch row on one line, and the hint wraps cleanly.
- Chrome's own vision-deficiency emulation (same matrices) on the swatches: under deuteranopia green and red become nearly the same khaki, which is the pair the hint flags; under protanopia red darkens enough to stay apart.
- Full rounds:
  - 1280×800 light, orange/white, 15 balls, wrong pick.
  - 390×844 dark, cyan/yellow, 30 balls, right pick.
  - 1280×800 light, Blue/Red, right pick.
  - In each:
    - The intro target shows its fill, rim, ★ in its ink, name and halo.
    - Mid-round, the drawer shows the note and disabled color groups; trusted clicks on a swatch and on the hint's button change nothing.
    - Mid-fade, fill and rim blend together.
    - After the fade and in selection, every ball's markup and computed fill, rim, glyph ink, z-index and pulse are identical, with no look attribute.
    - The reveal shows ✓/★/✕ in the right inks.
    - In RESULT the colors are live again, and switching the target to Pink recolored the revealed target at once.
    - No overflow, no console errors.
- Default Blue/Red renders as before: fills #2f6bd8/#e0533b, a rim equal to the fill (invisible), white glyph ink, and an unchanged title dot. With a Yellow or Pink target the dot stays red.
- Production build from `file://` and from `http://127.0.0.1:4174/dist/`: one deferred classic script. Stored orange/red is restored, the hint shows, the balls are orange, and the dot stays red.
- Accessibility tree: groups "Ball color" and "Target color", radios named by color with their checked state, a polite status region, and the "White" button described by the hint sentence.
- Reduced motion: swatch transitions 0 s.

### SPEC §14 items touched
- Verified:
  - Ball color (5) and Target color (4) work with pointer and keyboard.
  - All seven settings persist; a first visit gets Blue and Red.
  - Colors are locked with the note from TARGET_INTRO through REVEAL, and live in RESULT.
  - A hard-to-tell pair shows the hint and its one-tap fix; no pair falls below the floor (unit test, both themes, four visions).
  - The target color never shows between the fade and REVEAL: DOM and computed-style check after the fade and in selection, at 15 and 30 balls. The title dot no longer uses it.
  - Every color state keeps a glyph or label.
  - Focus is visible on swatches; reduced motion removes their transition.
  - No horizontal scroll at 1280, 390, 375 and 320 px.
  - All tests pass.
- Not re-walked this phase: the rest of §14 is Phase 11 (v1.1 acceptance).

### Known issues / notes
- `styles/controls.css` is 319 lines, just over the ~300 guideline, about the size of `screens.css` (316).
- Dark-theme orange is a light orange (#ffa54b). A deeper orange sits too close to the dark default red (#ff7a5e, a light coral) under deuteranopia to clear the floor. The pair still gets the hint.
- Pre-existing, out of scope: a module-level style array in `src/debug.ts` survives tree-shaking in the production bundle (about 200 bytes, never used).
- The fix button's accessible description reads "…Try White ." with a space before the period; that's Chrome's text computation around the inline-flex button, and harmless.
- The 320×568 wrong-answer layout issue from the layout entry is unchanged.

## 2026-09-29 — Phase 11: Acceptance (v1.1)

### How it was walked
All of this ran in headless Chrome over the DevTools protocol; the Browser pane was hidden. The scratch scripts are not in the repo.
- **Round matrix.** 48 full rounds: 10, 15 and 30 balls × Slow, Normal, Fast, Extreme, in four configurations (light 1280×800, dark 1440×900, light 375×812, dark 390×844). It ran twice, on the dev server and on the production build from `/dist/`; every check passed both times.
  - Each configuration starts from a first visit and plays its 12 rounds in one session, so score, streak and accuracy accumulate.
  - Settings change in RESULT through the real drawer controls: keys on the sliders, clicks on segments and swatches.
  - Colors rotate so every ball and target color appears, both hint pairs included. Picks alternate between keyboard and pointer.
  - An in-page recorder logs the HUD, the watermark, the cursor flag, the settings lock and every ball's position each frame.
  - Timing is judged on the game's own clock, rebuilt from rAF timestamps with the 50 ms clamp. A stalled frame pauses the round, so wall-clock timing would misread it.
- **Layout sweep.** 25 viewport sizes, from 320×568 to 1920×1080, including real phone-browser heights (375×548, 360×560, 390×664, 414×620) and landscape phones. It checks start, intro, selection and result, with the result also re-laid-out using the longest possible sub-line. It ran on the production build, plus `file://` at two sizes.
- **Targeted checks.** The drawer and every control by pointer and keyboard; persistence; hint; watermark paint order; typography online and with the font host blocked; sound; keyboard-only play; live region; reduced motion; hidden tab; resize and rotate; frame rate.

### Fixed
- **§4 result card on short portrait screens** (the known 320×568 bug, and worse on real phone browsers).
  - The card was 256 px everywhere. Under a whole arena there is only 252 px at 320×568, 204 at 360×560 and 177 at 375×548 (iPhone SE Safari with its bars).
  - At `(max-width: 480px) and (max-height: 740px) and (orientation: portrait)` the card now puts Play Again (still ≥ 44 px) beside the headline, and the stats become one row of label-over-value columns. The card is 153–174 px.
  - Arena top after the scroll: 78 px at 320×568, 24 at 375×548, 51 at 360×560. Taller phones keep the stacked card.
- **Landscape card at the width boundary.** The landscape card also applies to any landscape viewport ≤ 520 px tall, a union with the old `min-width: 481px` rule. The portrait rules are portrait-only, so 480×320 no longer mixes the two.
- **`styles/result.css`.** The result card's styles moved out of `screens.css`, which would have passed ~360 lines. It's a pure move: 47 rules checked identical by a parser, cascade unchanged.
- **`debug.ts`.** The panel's style array moved into `startDebug`. As a module-level `[...].join()` it survived tree-shaking, so production now carries no debug code (34.57 → 34.31 kB). `?debug=1` still works in dev.

### Spec edits
- §0: the result card has its own stylesheet.
- §4: the card is compact wherever it has to be (landscape phones; short portrait screens).

### SPEC §14 checklist
Flow
- [x] Start screen works; Start Game begins a round. Pointer and keyboard (Tab → ⚙ → Start Game → Enter), dev and production, all four configurations.
- [x] Target shown highlighted and named before the countdown. Every matrix round: one look, ★, the name on screen, the HUD intro line.
- [x] 3-2-1-GO in the arena; motion starts on GO. Watermark sequence in every round; balls still until GO (frame by frame).
- [x] Timer counts down from the round's duration to 1 and freezes at 0: 15 → 1 in each first-visit round, 10 → 1 in the others, then 0. The game clock measured intro 2 500, countdown 3 000 and tracking 15 000 / 10 000 ms, each within one frame.
- [x] Glide to the ring; slot numbers; exactly one pick.
  - Every round: ring positions within 1e-3 of the §7 geometry, neighbours never overlapping, slot numbers 1..n on screen.
  - DOM and tab order are Ball 1..n, and a second pick is ignored.
- [x] Input locks after the pick; "Checking..."; reveal after the delay. `aria-disabled`, focus kept on the picked ball, HUD sequence.
- [x] Correct and incorrect results display with the right copy and highlights. Headline, sub-line with names and slots, ✓/★/✕ and names, in every round.
- [x] Score, streak, best, accuracy and round update correctly: checked against an independent tally after each of the 48 rounds.
- [x] Play Again starts a fresh round with a new random target, in all four sessions.

Fairness
- [x] The highlight is fully gone by 2.0 s and never returns before REVEAL: frame by frame on the game clock, every round (full before 1.5 s, fading between, no look after), plus the unit tests.
- [x] Nothing distinguishes the target during motion, returning or selection.
  - Markup and computed fill, rim, ink, size, z-index and pulse are identical across balls after the fade and in selection.
  - The recorded look stays null through the glide.
- [x] Spawn positions are never ring slots, and slots come only at the freeze: unit tests, and ring labels appear only in selection.
- [x] `physics/` has no reference to the target: source-scan test.
- [x] Everything is re-randomized every round: 15 000-round unit tests, and targets, names and slots varied across the 48 rounds.
- [x] Settings can't change mid-round, and the target color never shows between the fade and REVEAL.
  - The settings are locked from TARGET_INTRO to RESULT in every round, with the note.
  - Mid-round, the Balls, Speed, Duration and color controls are disabled while Theme and Sound work.
  - Trusted clicks on a swatch and on the hint's button change nothing.

Physics
- [x] Balls move, bounce, collide and push. Each ball's path is 97–101% of what its speed predicts, and every ball roams ≥ 0.48 of the radius, in all 48 rounds.
- [x] No escape, sticking, dead stop or runaway at any count or speed: all 12 cells in both themes and both sizes.
  - Max |p| + r − 1 ≤ 2.2e-5; overlap ≤ 0.0002.
  - No 0.2 s stretch with under 2% of the expected path, and speeds held to the preset.
  - Plus the unit tests at 10/30 × Slow/Extreme.
- [x] Smooth ~60 fps, 30 balls included.
  - 30 balls at Extreme: 60 fps with p95 16.8 ms at 390×844, with and without 4× CPU throttling, and 16.7 ms at 1280×800.
  - Every matrix round rendered 599 frames per 10 s. This is headless, not a physical phone.
- [x] Hiding the tab pauses the round; rotating or resizing rescales it.
  - With another tab in front for 3 s, the watermark held at 29 with no ball moving, then the round resumed (28).
  - Mid-round, 1280×800 → 600×900 → 375×812 → 812×375 → 390×844 took the arena 560 → 500 → 343 → 215 → 358 px; every ball stayed inside, with no overflow.

Settings
- [x] ⚙ at the right end opens the drawer from the right, and ✕, Esc and the backdrop close it.
  - At 1280×800, 375×812 and 320×568 the drawer slides in from the right edge (1280 → 920 px) as a modal, and focus goes to ✕. ✕, the backdrop and Esc each close it, with focus back on ⚙.
  - There is no horizontal scroll with the drawer open.
- [x] All seven controls work with pointer and keyboard.
  - Keyboard: Balls End + ← (29), Duration →×5 (40 s), Speed →→ (Extreme), Ball color ← (Cyan), Target color →→ (Yellow), Theme ← (Dark), Sound Space and Enter.
  - Pointer: clicks on both slider tracks (10, 60), the segments, the swatches and the switch.
  - Tab order: Balls → Speed → Duration → Ball color → Target color → Theme → Sound, with a visible focus ring.
- [x] All seven settings persist, and a first visit gets 15 · Normal · 15 s · Blue · Red · System · On.
  - 22 balls, Fast, 30 s, Purple, White, Dark and Off all survived a reload.
  - The first-visit defaults were checked in each of the four fresh profiles, with nothing stored.
  - System follows the OS live.
- [x] Locked from TARGET_INTRO through REVEAL, with the note, and applied from the next round; theme and sound always work. Lock timeline in every round; count, speed, duration and colors changed in RESULT showed up in the next round.
- [x] Balls resize with the count; every count spawns, rings without overlaps, numbers 1..n and uses unique names. Ball size = r(n) × arena at 10, 15 and 30 (unit tests cover all 21 counts), ring gaps positive, names from the first n.
- [x] A hard pair shows the hint and its one-tap fix, and no pair is indistinguishable. Orange/red in both themes and green/red in light only; the fix picks White and moves focus there. The floor is unit-tested (phase 10).

Arena countdown, cursor, typography
- [x] 3·2·1 and GO! strong, the seconds faint; centered behind the balls, never blocking a pick; 0 at the freeze, then gone.
  - Strong and faint are judged by position relative to GO!, since the seconds also pass 3, 2, 1.
  - The numeral is centered to the pixel (0, 0) and is the arena's first child, with `pointer-events: none` and `aria-hidden`.
  - Hit-testing in paint order (including `pointer-events: none` elements), the watermark was topmost at none of the 30 ball centers, 3 of them inside the numeral's box. It is empty in selection.
- [x] The cursor hides over the arena only while tracking. It is hidden from GO! to the freeze to within one frame, `cursor: none` inside the arena and not outside it, and a pointer on the balls in selection.
- [x] Play is the typeface everywhere, with a clear hierarchy, and the system font takes over offline.
  - Play 400 and 700 load and come first everywhere. Sizes run title 42 > HUD and tagline 18 > meta 13; buttons, labels and the watermark are bold, secondary text regular.
  - With the font host blocked, no Play face loads, first paint is at 40 ms, and a round runs.

Accessibility
- [x] Light, dark and system work and persist, with no flash: the inline theme script precedes the stylesheet in the build.
- [x] Sound works and persists, and unlocks on the first gesture.
  - No audio context exists before the first gesture; the Start Game key press creates one and it runs.
  - Cues landed on the round's beats: 0, 2.4, 3.4, 4.4, 5.5, 10.4–14.4 and 15.4 s. That's measured from when the harness saw the key press; the nominal beats are 0, 2.5 … 15.5.
  - Switched off by keyboard, a whole round scheduled 0 oscillators, and "off" survived a reload.
- [x] Keyboard-only play works with visible focus. Tab → ⚙ → Start Game; Enter; Tab to Ball 1; arrows, Home and End; Enter picks; Play Again is focused; Enter starts the next round. Focus rings are solid on each.
- [x] HUD messages go through the live region: `aria-live="polite"`, 9 writes for 9 instructions, no repeats.
- [x] Reduced motion. Zero running animations or transitions over a whole 30-ball round; the drawer appears at once; glide plus settle is 900 ms; the round plays to RESULT.
- [x] Every color state has a glyph or label: ★ with the name in the intro; ✓/★/✕ with names at the reveal; the swatches' ring, ✓ and name.

Layout
- [x] No horizontal scrolling at any of the 25 sizes, in any state, drawer included.
- [x] Balls tappable on mobile. Hit areas are 44 px at every size. A tap on Ball 5's center picks Ball 5 everywhere, including 480×320 and 568×320 where ring neighbours are 15 px apart.
- [x] One centered column, full width on phones, capped at 560 px, with ⚙ at its right end. Columns 288–560 px, the arena centered, ⚙ flush with the column's right edge.

Code
- [x] All Vitest tests pass (222).
- [x] Modules as in §0, no giant file, no tunables outside `config.ts`.
  - Every `src/*.ts` matches the §0 tree.
  - The largest source file is `view.ts` at 253 lines.
  - Literals outside config are unit conversions, formula constants, sound recipes (§10), label placement and decorative animation timing, as in phase 7's audit.

### Known issues / notes
- Portrait viewports under 520 px tall (320×460, a 400×400 window): the arena is height-limited there, so even the compact card can't fit under it. The page shows the whole card and clips the arena's top by up to 26 px. The one phone with such a viewport, the first iPhone SE's Safari, has no container queries and gets the fallback layout, which leaves more room; that wasn't measured.
- The first Start click stalls headless Chrome for about 250 ms while the AudioContext starts; the round pauses through it rather than skipping time.
- Tab past the last drawer control lands on the `<dialog>` itself (with a focus ring), then ✕. That's Chrome's handling of a scrollable modal, and focus never leaves the drawer.
- 60 fps and sound are verified in headless Chrome (frame timing, CPU throttling, scheduled oscillators), not on a physical phone or by ear.
- Over the ~300-line guideline: `styles/controls.css` (319), `tests/view.test.ts` (372), `tests/session.test.ts` (311).
- SPEC §9's optional best-score persistence is still not implemented. It needs a decision on session vs all-time "Best".

## 2026-09-29 — Favicon: the brand mark

Asked for after phase 11, from a screenshot of the dot beside the title: "Add a favicon like this."

### Spec edits
- §16: the favicon is the same mark as the title's dot, an inline SVG in `index.html` (no image file) that takes the dark theme's red when the system is dark.

### Done
- `index.html`: the empty `data:,` icon becomes an inline SVG of `.brand::before`, a dot in a 22% halo (6 and 9 units in an 18-unit square, as 12 px + 3 px on the page).
  - Its fill is `--target-red`'s light tone (#e0533b), or its dark one (#ff7a5e) under `prefers-color-scheme: dark`.
  - The icon sits in the browser's tab strip, so it follows the system's appearance rather than the in-game Theme setting.
  - Being inline, it adds no file or request and works from `file://` and any subpath.
- Tests (223, was 222): `tests/palette.test.ts` checks the favicon's two tones against `--target-red` in each theme of `tokens.css`. It fails when either drifts (confirmed by nudging the dark tone).

### Verified in the browser (headless Chrome over the DevTools protocol; the dev server in the Browser pane)
- Production build from `file://`:
  - one icon link, byte-identical to the source; the JS and CSS bundles are unchanged;
  - Chrome registers it as the tab's favicon (`faviconUrl` in `/json/list`) and it decodes, with no console errors.
- Rendered pixels match: light dot rgb(224, 83, 59) with halo rgb(248, 217, 212) on white; dark dot rgb(255, 122, 94) with halo rgb(97, 69, 66) on #35363a, each the expected 22% blend. The title's brand mark computes the same fills in each theme.
- Dev server: the same icon, and it decodes.

### SPEC §14 items touched
- Code: all Vitest tests pass (223).

### Known issues / notes
- SVG favicons need Safari 26 or later (Chrome and Firefox have supported them for years); older Safari shows no icon, since a PNG fallback would be an image file.

## 2026-09-30 — Leftovers: saved best streak, result card room, file sizes

Asked for after the favicon: "complete if anything left". Three things were left:
- SPEC §9's optional best persistence, which needed a decision (asked: the all-time best streak);
- the §4 known issue, the arena clipped above the result card on short viewports;
- three files over the ~300-line guideline.

### Spec edits
- §9: "Best 🔥" is the best streak ever reached on this device.
  - It is stored under `followone.best` as `{ "bestStreak": n }`, and an invalid value counts as 0.
  - Each round starts from the higher of the stored best and the session's own. A new best is stored at REVEAL only if it beats what's stored now, so a higher best from another tab survives.
  - The other stats still reset on reload. `bestScore` is dropped, since no screen would show it.
- §4: the arena diameter gains a third term, viewport height − card room.
  - The card room is what the result card needs under the arena at its longest, measured from a hidden copy of the card.
  - On small arenas it also covers the top slot number, which reaches past the arena's edge.
- §0 (the `score.ts` line), §11 (a comment on `storageKeys.best`), §14 (the best streak survives a reload, the rest start over). No default changed.

### Done
- Saved best streak:
  - `game/score.ts`: `parseBestStreak`, and `createSavedBest(store)`, which reads the stored best and records a new one only when it beats what's stored now. `startRound(stats, savedBest)` merges the stored best in.
  - The session takes an optional `savedBest`: it reads it as each round is built and records it at REVEAL. `main.ts` passes `createSavedBest` over localStorage.
- Result card room (§4):
  - `render/screens.ts` builds the card with one function, used twice. The second copy, `.result-sizer`, is `visibility: hidden`, `inert` and `aria-hidden`. It hangs up from the footer's bottom, so it never adds to the page's height.
  - The sizer holds `longestResultViews()` (`game/view.ts`): a miss in slots #30/#29 with large totals (Round 999, Score 99999, 100%, 99, 99). Its sub-line cell stacks the sub-line once per name, with that name in both places, because which name renders widest depends on the font.
  - `main.ts`: a ResizeObserver on the sizer sets `--card-room`. `--ring-edge` (`slotRadius + ballRadius`, the ring's outer edge at every count) and `--slot-number-gap` (from `arena.ts`) come from their sources.
  - `layout.css`: `--arena-size` takes the smallest of four terms:
    - the column width;
    - the height left after the HUD and footer;
    - the room above the card;
    - the room above the card less the top slot number's reach, plus 1px because the scroll lands on whole pixels.
    It is the same in every state.
  - `result.css`: `--card-margin` replaces the bottom-margin calc repeated in four places. The landscape footer now has the card's width in every state, so the sizer measures the card at its own width; the stats strip is centered either way.
- File sizes:
  - `tests/view.test.ts` (372 lines): the ring, input, reveal and result card tests moved to `tests/ringView.test.ts`.
  - `tests/session.test.ts` (311): the picking and scoring tests moved to `tests/picking.test.ts`. The moved `describe` blocks were checked byte-identical.
  - `styles/controls.css` (319 → 309): segments and swatches share one hidden-radio rule and one disabled-cursor rule, with the same specificity and cascade.
- Tests (233, was 223):
  - The best streak's parsing, storing, re-reading before a write, and missing or throwing storage.
  - The session reads it at round start and records it at REVEAL, not before. It keeps the best through a miss, outlives a reload, and takes a higher best from another tab at the next round.
  - The longest views, and a check that no miss can have a longer sub-line.
  - Mutation check: dropping the REVEAL record, the round-start read, the re-read before storing, or the integer check each fails the suite.

### Verified in the browser (headless Chrome over the DevTools protocol)
- Best streak, on the dev server, the production build from `/dist/` and `file://`, 20 checks each:
  - four correct rounds give Best 4, stored as `{"bestStreak":4}`;
  - a miss keeps Best 4 with Streak 0;
  - after a reload the card shows Round 1 · Score 0 · Streak 0 · Best 4, and the strip starts at 0;
  - a corrupt stored value counts as 0 and the next best replaces it.
- Result layout: a grid of 1,360 viewports (320–1000 px wide × 300–900 px tall), with the longest possible sub-line, laid out and scrolled as RESULT does. It ran with Play and with the font host blocked, on the dev server and on the build.
  - Before: the arena was clipped at 154 sizes (182 with the fallback font), in three regions:
    - portrait windows up to ~520 px tall, by 6–38 px;
    - 481–540 px wide × 521–680 px tall, by 10 px, where the sub-line wraps to three lines beside Play Again;
    - tiny landscape windows.
  - The round-1 grid also understates real sessions. At 560–600 px wide the stats wrap to two rows by round 10 (Round 10 · Score 1250), and the card grows from 165 to 194 px, the sizer's height.
  - After: the arena, every slot number and the card fit at every size except windows at most 460 × 380 px (31 sizes; 35 with the fallback font), where the arena sits at its 120 px floor. There is no horizontal overflow at any size; a pre-existing 115 px overflow at 320×300 is gone.
  - The arena shrank at 308 sizes and grew at none, all within 680 × 760 px. Examples:
    - 375×500: 340 → 294;
    - 390×520: 358 → 336;
    - 480×480: 320 → 295;
    - 500×600: 388 → 371;
    - 320×460: 288 → 253.
    1280×800, 812×375 and 375×812 are unchanged.
- The sizer:
  - it is hidden, inert and aria-hidden, absent from the accessibility tree, and adds no duplicate ids;
  - the start screen still doesn't scroll, and the tab order is still ⚙ → Start Game;
  - RESULT still focuses the real Play Again;
  - its content never changes during a round.
- Drawer radios after the CSS merge: all 16 are absolute, transparent, pointer-cursored and label-sized; the drawer opens and closes.
- Fairness spot check: after the fade, every ball's markup is identical (minus the transform).
- Screenshots of start, play and result at 375×500, 500×600, 812×375 and 1280×800 (light), and at 390×520 (dark, reduced motion). On the smaller arenas the start card overflows evenly into the HUD and footer, as designed.

### SPEC §14 items touched
- Verified:
  - Score, streak, best streak, accuracy and round update correctly; the best streak survives a reload and the rest start over.
  - No horizontal scrolling at 1,360 sizes.
  - Nothing in the DOM distinguishes the target after the fade (spot check).
  - Focus lands on Play Again in RESULT.
  - All Vitest tests pass (233), and no file is over ~300 lines (the largest is `controls.css` at 309).

### Known issues / notes
- Windows at most ~460 × 380 px can't fit the card under the arena's 120 px floor, so the arena's top is clipped there. No phone or tablet viewport is that small.
- The sizer reserves for the widest name twice, a safe upper bound. In a ~9 px band of widths (371–380 px in the compact layout) it reserves a sub-line row that no real miss needs, and only on short viewports. On a real device that costs the iPhone SE 2/3's Safari viewport (375×548) 4 px of arena (343 → 339).
- The large totals keep room for long sessions, with 3-digit rounds, 5-digit scores and 2-digit streaks. On windows 481–680 px wide and up to 760 px tall that costs 3–19 px of arena in every round, even before the numbers grow.
- On arenas under ~190 px (windows 300–420 px tall), the bottom slot number's 12 px box overlaps the card's top edge by 1–3 px, because the 8 px gap under the arena is smaller than the number's reach there. Of these 158 grid sizes, 75 had it before with the same arena. At the other 83 (≤ 500 × 420 px) the arena shrank to fit: 65 had the arena's top clipped before, by up to 136 px, and 18 (460–500 px wide, 300–400 px tall) had a whole arena but the top slot number cut off (computed from the ring geometry; the old grid didn't measure the numbers).
- The scratch scripts (grid sweep, checks, screenshots) live in this session's scratchpad, not the repo.
