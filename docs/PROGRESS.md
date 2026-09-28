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
