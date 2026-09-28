# Follow One

Browser cognitive-tracking game: follow one named ball among 15 bouncing balls for 15 s, then pick it out. Static site, no backend. Solo project, built in phases with Claude Code.

## Source of truth

Full specification: @docs/SPEC.md (loaded with this file).

- The spec wins over existing code and over your assumptions. If the spec is ambiguous, ask before guessing; once decided, edit the spec first, then the code.
- Every number in the spec is a default that lives in `src/config.ts`. Never hard-code a tunable anywhere else, and never change a default silently — say so in the phase summary.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build to `dist/` (Vite `base: './'`)
- `npm run preview` — serve the build
- `npm test` — Vitest, single run (`vitest run`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run check` — typecheck + test; must pass before any phase is called done

Phase 1 creates these scripts. Package manager is npm.

## Stack and conventions

- Vite + TypeScript (`strict: true`, no `any`), ES modules, no UI framework, no runtime dependencies. Plain CSS with custom properties; no CSS framework.
- Module layout follows SPEC §0, plus `src/copy.ts` holding the SPEC §3 copy table. No user-facing strings anywhere else.
- One concern per file; no file over ~300 lines.
- `physics/`, `game/`, `names/` and `util/` are pure: no DOM, no `window`, importable in Vitest.
- All positions and radii are normalized arena units (center 0,0, radius 1). Only `render/` converts to pixels.
- One requestAnimationFrame loop and one simulation clock drive physics, the countdown timer and every phase timer. No `setTimeout`/`setInterval` for game timing.
- Comments only where the *why* isn't obvious. No README padding, no changelog prose.

## Hard rules (fairness — never bend these)

- `physics/` must not reference `targetId`, `isTarget`, or ball names.
- After the reveal fade in TRACKING, and throughout RETURNING and SELECTION, the target must be indistinguishable: no class, data attribute, z-index, aria text or style that differs from other balls.
- Ring slots are assigned only at the freeze, by angular order (SPEC §7). Balls never spawn on slots.
- Target, names, spawn positions and velocities are re-randomized every round with `Math.random`; no seeding, no "avoid repeats" logic.
- Ball input is live only in SELECTION; the first activation locks input.

## Workflow

- Build in the SPEC §13 phase order. One phase per session unless told otherwise.
- Each phase: implement → write/extend tests → `npm run check` → verify in the browser → append a dated entry to `docs/PROGRESS.md` (create if missing: done, deferred, known issues) → stop and summarize. Don't start the next phase on your own.
- Tests are part of the deliverable. Never delete, skip or loosen a failing test to get green; fix the code or explain why the test is wrong.
- Keep changes scoped to the phase. No drive-by refactors, renames or cleanups outside it.
- Commit at the end of each phase with a message like `phase 3: renderer and loop`. Never push, never force-push, never rewrite history.
- Before calling a phase done, re-read the relevant SPEC §14 checklist items and state which ones you actually verified.

## Don't

- Add libraries, frameworks, CDNs, web fonts, images or audio files. Sound is synthesized with the Web Audio API.
- Use canvas unless explicitly asked; balls are DOM elements (SPEC §5).
- Touch `localStorage` without try/catch.
- Add a backend, analytics, service worker, leaderboard, or anything in SPEC §15.