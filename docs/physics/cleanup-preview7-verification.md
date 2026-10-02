# Preview7 shared-constant cleanup verification


> Historical isolated cleanup-only verification copied without changing its recorded measurements. It does not verify the combined candidate. Original isolated worktree evidence remains unchanged. See [integrated verification](integrated-followup-verification.md) for explicit current profiles and rerun commands. No deployment, integrated native-browser or physical-device pass is implied.

Baseline: `8c719b46e195b3ba80bea6268bc2aa2562b7a744` (preview7).
Manually adapted the production cleanup from
`2c6a657858dbe674e05011afe92fc225c49f1bb4`; no cherry-pick or old-source overwrite.

## Scope

- Name the unchanged `386 in/s²` sliding/axial-friction scale as
  `TUNE.surfaceGravity`. Keep the independent gameplay `TUNE.gravityZ = 180`
  hop/hole channel untouched.
- Reuse solid-cylinder axial inertia `DISC_SPIN_INERTIA` in launch impulses.
  Hole tilt-axis inertia is unchanged and separate.
- Name the unchanged `1.02` projected-radius peg margin
  `PEG_COLLISION_MARGIN`; remove the definition-only `PEG_COLLISION_RADIUS`.
- Preserve preview7 finish-intent refinement, onset/noise handling, diagonal
  protection, spin-transfer ceiling, input routing, impulses and trajectories.
  No version bump, global README/version-history rewrite, browser or deployment.

## Reproduce

```sh
npm test
npm run build
git diff --check
node --check scripts/physics-cleanup-equivalence.mjs
node scripts/physics-cleanup-equivalence.mjs
```

The helper reads the real baseline modules directly with `git show`, reads the
real current modules from disk, and transpiles both with the installed TypeScript
compiler into independently cached module graphs. It never replaces production
files or uses copied-formula baseline helpers. `assert.deepStrictEqual` compares
numbers exactly (including signed zero), not with an epsilon or JSON rounding.

Results: **187 tests / 24 test files passed**; TypeScript/Vite build passed;
source diff/check and Node syntax check passed. Vite reports its existing
large-chunk advisory (bundle above 500 kB); this does not fail the build.

[Machine-readable probe evidence](isolated-cleanup-preview7-equivalence.json):

- **34,944** numeric/object-contact launches across offset thresholds, speed
  gates/cap, diagonal headings, four quadrants and provisional contacts.
- **292** gesture comparisons, including every registration update, spatial and
  power histories, powered finalization, onset/setup, endpoint noise, stationary
  lifts, held releases, rejected brushes/misses and short edge clips; subdivisions
  1/4/16/64. Includes **112** powered finish directions and **63** null launches.
- **72** simulation runs / **4,455** exactly matched frames: 12 fixtures at
  three timesteps with airborne on/off. Compare full disc state (including spin,
  tilt and settling), events and shot contacts; assert actual disc/peg/lip/land/
  sink/ditch event coverage. Includes tilted peg and spinning disc collisions.
- **5** source files match the baseline byte-for-byte after reversing only the
  approved cleanup substitutions (hole source must remain entirely unchanged).

The source guard and exact behavior tests intentionally pin this **neutral
cleanup slice** to preview7. When integrating separately approved behavior
changes, review/update that verification boundary explicitly rather than
silently weakening the assertions.
