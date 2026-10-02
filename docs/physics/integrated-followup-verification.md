# Preview 8 — combined follow-up verification

## Publication preparation

Frank explicitly authorized making the combined candidate live for testing.
The release package is `0.3.0-preview.8`; preview 7 remains the rollback tag.
Parent reran all 226 tests and the production build after updating release
metadata. The 93-file browser snapshot remains hash-exact; production source
and tests in the release match that snapshot. Only package-version, workflow
checkout depth and documentation differ. Full Git history is fetched in CI
because the equivalence tests load the immutable preview-7 source from Git.
Final native-browser results passed before the push. Publication is not
established by a local commit: the Pages deployment SHA and the normal URL's
referenced bundle must also be read back and compared to the tested build.

Parent's final serialized browser rerun `proc_ad25b6793d3a` completed with exit 0:
`browser-round.mjs`, `browser-spin.mjs` and `browser-intent.mjs` each exited 0.
This covers artwork/save migration, winner flows, small-screen round advancement,
mouse/laptop-touch/phone-touch registration and cancellation, pause/reload and
resumed rotational settlement. The independent aim suite has **46 unique
cases** (22 seated laptop-touch, 24 emulated phone-touch), **42 launches and four
expected hold cancellations**. No runtime exceptions were reported. Parent
inspected the small-mobile round, match-winner and mobile spin screenshots;
primary actions and layouts are intact. All 93 frozen files still match their
snapshot hashes, and release application source/tests match the tested snapshot.
Detailed outputs, cases and hashes are retained in
[preview8-browser-verification.json](preview8-browser-verification.json).
The earlier killed/wrapper-timeout attempts remain incomplete, not passes.
This is automated Chromium validation, not physical-phone or real-board feel
acceptance. Only package versions, CI checkout depth and release documentation
changed after freezing the browser snapshot.

The original worker report below is a historical pre-publication checkpoint.
Its no-push/no-browser statements describe that worker's delivery, not the
subsequent parent verification or publication preparation above.

## Status and scope

Branch `physics/preview7-followup-integration`; baseline and unchanged HEAD
`8c719b46e195b3ba80bea6268bc2aa2562b7a744`. Working-tree candidate only:
no commit, push, deployment, browser run or physical-device pass by this worker.
The public/live site remains preview7. Parent will independently rerun integrated
unit/build/probes and native main + aim suites.

Approved source edits are confined to `src/sim/constants.ts`, `src/sim/physics.ts`,
`src/game/flick.ts` and `src/sim/spin.ts`. Flick changes only substitute shared
inertia; physics changes only substitute neutral gravity/peg constants. Spin adds
rotational Coulomb ratio **0.12** and the approved signed additive `contactHop`.
All 19 existing `src/` files pass exact approved-composition gates; all other
source, including hole, scoring/rules, storage and main/pointer handling, remains
byte-exact preview7. Maximum power 105, sliding grip 0.1175, viscosity 0.05,
restitution and geometry are unchanged. Surface gravity 386 is intentionally
distinct from vertical gravity 180; peg padding remains 1.02.

## Explicit profiles, not relaxed baseline assertions

`scripts/physics-integrated-equivalence.mjs` requires named profiles. No source
or environment autodetection decides which policy to verify:

- `pinned-baseline`: entire real TypeScript graph from immutable preview7 Git SHA.
- `actual-integrated`: entire candidate graph from the current working tree.
- `cleanup-restored-baseline`: candidate neutral edits, spin policy removed;
  restores the **real pinned baseline spin/hop helper**, retaining only the
  neutral surface-gravity substitution. It does not copy an old hop formula.
- `unrefactored-spin-hop-reference`: independently constructs pinned baseline
  plus exact approved spin/hop patches, without cleanup. Isolated outputs are
  checked against source SHA256s before composition.
- `isolated-spin-reference` / `isolated-hop-reference`: separately SHA-gated
  approved slice graphs for investigating downstream coupling.

`integrated-approved-slices.json` records exact baseline/output hashes and
anchored patches per approved slice, including accepted test inputs. The harness
pins that manifest hash and rejects other production changes. No live constants
leak into the baseline graph; no tautological actual-vs-actual comparison.

Strict baseline assertions remain **34,944 exact launch comparisons**, **292
full accumulated/finalized gestures** (112 powered finishes, 63 rejected), and
**72 simulation runs / 4,455 exact frames** in the restored-baseline profile.
Gestures cover onset, signed/diagonal finish, tiny noise, meaningful reverse,
idle holds, short-edge registration and finalization. An additional **36 exact
finalized onset30/hook45 mirror/lift replays** include 34 launches and two
preview7-compatible cancellations at 17/50/100ms; missing/unknown profiles are
explicitly rejected. Actual candidate versus
independent unrefactored reference matches **72 runs / 8,851 frames**, including
all event/contact/moving state comparisons. Counterfactual compatibility is
**not** actual candidate collision equality.

## Executed gates

- `npm test`: **25 files / 226 tests passed**; no skipped baseline assertions.
- `npm run build`: exit 0; existing >500kB bundle warning only.
- `git diff --check`: exit 0.
- `node scripts/physics-integrated-equivalence.mjs`: exit 0; saved output in
  [integrated-helper-evidence.json](integrated-helper-evidence.json).
- `node scripts/probe-integrated-followup.cjs --write`: exit 0. A separate
  no-argument execution matches the saved JSON **byte-for-byte**.
- Signed helper sweep: 7,350 bounded signed cases, including 2,400 compatible
  nonnegative cases. Production/fine-step probe adds **32 signed spin/contact
  scenes**, each independently replayed across five explicit profiles; finite
  settlement, no unexplained reference mismatch, maximum observed rest 0.95s.
- Signed first-disc impacts at 120Hz retain ±17.057035992 rad/s (~98.59%) versus
  baseline ±15.891476272; maximum first-frame rebound change 0.121412471 in/s.
  Existing 240Hz values and bounds also pass unchanged. Full-step zero-viscosity,
  airborne/support limits, signed dissipation, and no added glide force pass.

The only intermediate failures were probe scaffolding: nonunique patch anchors
resolved with exact baseline offsets, and a new fixture-count assertion incorrectly
said 64 for an actual 32-case loop. No historical golden or physics convergence
bound was moved, no production policy was broadened, and no test was skipped.

## Measured coupling and limits

The existing simple-contact bounds remain <0.25in position, <0.15rad angle,
<0.05s residual-wait differences between 120/240Hz. Complex multi-peg/lip paths
are **not timestep invariant**: maximum final-position differences are
**11.825242061in baseline / 14.102815918in integrated**, and maximum wait
sensitivity is 1.166666667s / 2.4625s respectively.

Compared directly with the independently reconstructed spin-only slice, only
`launch-150-0.5` changes final position in this 46-fixture production/fine sweep:
0.995589029in at 120Hz / 1.053797917in at 240Hz; residual wait decreases
0.216666667s, and fine-step event counts differ. This is an explicitly measured
consequence, not an unchanged-outcomes claim or fitted regression allowance.
The durable `couplingTraces` locate first divergence at a **descending peg**:
120Hz frame 22, incoming vz −4.097034529, integrated output +0.866539626 versus
old hop +4.963574155; 240Hz frame 43, incoming −3.971474090, integrated +1.623296685
versus old hop +5.594770775. Actual candidate matches the independent approved
spin/hop reference on every frame through rest (299 / 677 frames). Thus no
unexplained neutral-cleanup drift remains; gameplay acceptability of this changed
trajectory still needs parent/native/user review. Mild descent may legitimately
become upward after a funded additive kick; strong descent remains downward in
the tested contacts. Existing landing bounces remain allowed.

The analogous **hole-lip signed-velocity reversal remains unfixed** because
`hole.ts` is protected. This conservative pop policy is not a full 3D contact
solver. Contact-generated spin can exceed the launch cap. Fine complex waits
can exceed two seconds. No real-board coefficient, shot-frequency distribution,
physical calibration or physical-device feel is established.

## Evidence applicability

[Integrated sensitivity/scene evidence](integrated-followup-evidence.json) records
all exact source gates, model profiles, signed first-impact/zero-viscosity scenes,
normal-step contacts, coupling traces and timestep comparisons. Historical
[isolated spin JSON](isolated-spin-persistence-evidence.json) and
[isolated cleanup JSON](isolated-cleanup-preview7-equivalence.json) are retained
byte-exact; copied isolated reports are marked historical, not combined passes.
Original isolated worktrees and their evidence were not changed.

Parent-provided evidence, not rerun here: live preview7 main-browser suite exit 0,
79 frozen files exact. Spin-only trusted-CDP native aim `proc_e7317a4eed59`, frozen
`crokinole-spin-native-e20ic7vi`, exit 0: 46 deduplicated cases (22 laptop-touch /
24 emulated phone-touch), 42 launches and 4 expected 100ms no-power hold
cancellations without relocation; no runtime exceptions, all 79 files hash-exact.
This covers mirrors, clock1/2, left-up onset, 17/50/100ms lifts, noise, center and
edge. It is **spin-only automated aiming**, not an integrated native full-suite
or physical-device pass.

[Preview7 power review](release-power-preview7-review.md): parent reran 560 real
helper / 1,120 handler cases with zero mismatches. Complete contact-time launch
freeze loses accepted 30° onset and 45° hook intent; scalar stabilization changes
power feel/rim heading and needs a separate A/B decision. **No power behavior
change is included.** Historical preview3 tables in input findings stay intact.


## Exact review paths and evidence digests

All modified/new deliverable paths (relative to this worktree; pre-existing
`node_modules` link excluded; ignored build output not a deliverable):

```text
docs/physics/cleanup-preview7-verification.md
docs/physics/contact-hop-signed-kick.md
docs/physics/input-findings.md
docs/physics/integrated-approved-slices.json
docs/physics/integrated-followup-evidence.json
docs/physics/integrated-followup-verification.md
docs/physics/integrated-helper-evidence.json
docs/physics/isolated-cleanup-preview7-equivalence.json
docs/physics/isolated-spin-persistence-evidence.json
docs/physics/release-power-preview7-review.md
docs/physics/spin-persistence-verification.md
scripts/physics-integrated-equivalence.mjs
scripts/probe-integrated-followup.cjs
src/game/flick.ts
src/sim/constants.ts
src/sim/physics.ts
src/sim/spin.ts
tests/friction.test.ts
tests/physics-integrated-equivalence.test.ts
tests/spin-damping-limits.test.ts
tests/spin-persistence.test.ts
tests/spin.test.ts
```

Byte-exact rerun SHA256s:

```text
54d80de84a047f75786b96f2540702e5991ba61a7ae9af49c77c85192a7e6d77  docs/physics/integrated-followup-evidence.json
8d8d671cd9d7c319f667c7b1f01d134001436c9a1b1083aaa6943f578f85f774  docs/physics/integrated-helper-evidence.json
f1e9b31d07ff6a2c7466b6c16d9659163a12c4010bd8979b46c1765ca83cd479  docs/physics/integrated-approved-slices.json
```
