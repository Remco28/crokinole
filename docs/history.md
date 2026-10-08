# Project history and open findings

Condensed from the planning notes, code reviews, physics reviews and per-preview
verification reports written between 2026-09-15 and 2026-10-02. The originals are
in git history (last present at `21c9a86`); the untracked review files were never
committed and survive only as this summary.

For releases, tags and rollback see [PHYSICS-VERSIONS.md](../PHYSICS-VERSIONS.md).
For shot-detection design and its reasoning see
[physics/input-findings.md](physics/input-findings.md).

## Original plan (September 2026)

A touch-first, frontend-only pass-and-play crokinole board. No backend, accounts,
AI or online play.

- **Modes:** 1v1 (12 discs each), 2v2 teams (6 each, partners opposite), FFA
  cutthroat (6 each, each player's own total to 100).
- **Scoring:** 20/15/10/5; touching a line scores the lower value. Duel and teams
  add the difference of the round totals; FFA adds each player's own total. Match
  to 100; a tied lead at or above 100 plays another round.
- **Rules:** open board must attempt a twenty. With opponent discs present a shot
  must contact one, else a foul removes the shooter's touched discs (including
  twenties sunk that shot). Ditch discs are dead for the round.
- **Units:** 1 sim unit = 1 inch, board centre at origin. Playing surface radius
  13, rings 4/8/12, hole radius 0.6875, disc radius 0.625 x 0.375 thick, 8 pegs on
  the 4-inch circle offset 22.5 degrees.
- **Physics:** custom deterministic 2D engine with a height channel, fixed 120 Hz
  substeps. Off-the-shelf engines were rejected for tunnelling and jitter on small
  fast discs and because hole capture needs custom handling. Constants live in
  `src/sim/constants.ts`.
- **Rendering:** Three.js for looks only; the simulation is the source of truth.

Corrections made during implementation: the inner-ring finish is required only on
open-board shots; discs crossing the playing edge are removed rather than bounced;
production must be served over HTTP(S) because file:// can't load ES modules.

## Decisions made with the user

- **Pacing:** settled shots hold 1.25 s, fouls 2 s, then marked removals animate
  for 0.65 s and the turn hands over automatically. Round summaries stay until
  **Next round** is pressed.
- **Foul marker:** keep the owner's colour and add a pulsing outlined X, so the
  marker never depends on colour alone. Reduced motion gets a steady marker.
- **Ditch:** out-of-play discs lie flat in a 1.75-inch ditch, in the nearest free
  slot.
- **Pegs:** 0.8 inches of exposed rubber with brass caps.
- **Views:** standing (25 degree polar overview) and seated (62 degrees). Drag
  orbits within +/-45 degrees of the active player's side.
- **Sound:** synthesized Web Audio, not recordings. The **Preview sounds** button
  in Settings is a testing tool; the user asked to keep it for now and revisit
  before the UI is final.
- **Aim aid:** none shipped; the plan's 150 ms fading ghost was never built.
- **Physics previews:** the user approved each preview separately and explicitly
  authorized each publication. Keep experiments as isolated, reversible slices
  compared against the live baseline before combining them.

## Verification record (summary)

| Preview | What changed | Evidence at the time |
| --- | --- | --- |
| 7 | Release-power and finish-intent refinement | Full browser suite passed (79 frozen files hash-exact). A read-only review found release power sensitive to lift delay and event density; freezing power at registration lost the hooked finishes the user liked, so it was not changed. |
| 7 cleanup | Named `TUNE.surfaceGravity` (386 in/s²) and `PEG_COLLISION_MARGIN`; reused `DISC_SPIN_INERTIA` in launch impulses | Bit-for-bit trajectory equivalence. |
| 8 | Slower axial spin (`spinFrictionRatio` 0.12); signed additive `contactHop` kick; the cleanup above | 226 unit tests, build, three browser suites (46 aim cases: 22 laptop-touch, 24 emulated phone-touch). Automated Chromium only, not a physical phone. |
| 9 | Cosmetic disc appearance: stained wood, poker faces, emblems, local photo crops | See [disc-design-verification.md](disc-design-verification.md). |

The `contactHop` fix in preview 8 replaced a version that erased downward
momentum. Kicks are now added to the signed vertical velocity and drawn from a
shared energy budget, so a falling disc can't be flipped upward for free.

Still awaiting human playtesting: spin duration, spinning rebounds, and falling
contact hops on a real device.

## Open findings, re-checked 2026-10-08

All other earlier findings were fixed or deliberately accepted.

- **Shooting-line radius hardcoded as `12`** in `src/main.ts` (five places)
  although `BOARD.ring5` exists. `src/render/scene.ts` likewise hardcodes the
  playing radius `13.0` twice next to `BOARD.playRadius`.
- **Most of `main.ts` is untestable.** Match flow, storage, placement and UI live
  in one module. Proposed refactor: extract `match.ts`, `storage.ts` and
  `placement.ts`.
- **`crossesDisc`** in `src/game/flick.ts` is used only by tests.
- **`manifest.webmanifest` colours** (`#1a120b`) match nothing in the app
  (background is `#171d1c`).
- **Blocking font `@import`** to Google Fonts at the top of `src/style.css`; the
  app's only third-party request.
- **Nested Vite** under vitest 2; defer to a dependency-upgrade pass.
- **Stylesheet is append-only**; later media queries override earlier rules and
  the cascade has to be read bottom-up.
- **Short-stroke gap (intentional):** fast chords shorter than 0.5R register only
  at offsets of 0.8R or more. This is anti-wobble protection, tested in
  `tests/flick-graze.test.ts`; lowering it would be a product decision.
- **Wishlist from earlier passes:** keyboard play, installable-app icons, keeping
  transparency in uploaded artwork (currently saved as JPEG).

## Regenerating evidence

The large JSON evidence files were removed from the tree (they remain in git
history). Regenerate them with their probes:

```sh
node scripts/probe-spin-persistence.cjs --write
node scripts/probe-integrated-followup.cjs --write
```

`docs/physics/integrated-approved-slices.json` and
`docs/disc-design-approved.json` are inputs to
`tests/physics-integrated-equivalence.test.ts` and must stay.
