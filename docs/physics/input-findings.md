# Input findings and remaining physics work

Baseline: `0.3.0-preview.4`, commit `e3e7d6ec2351f864041499819209a42efdc4a4ed`, tag `crokinole-v0.3.0-strike-preview.4`. See [versions/rollback](../../PHYSICS-VERSIONS.md). The baseline evidence below remains historical; preview 5 adds the separate registration correction described next.

## Registration correction — preview 5

The correction from `physics/graze-registration-v0.3` finalizes completed short edge clips only on lift. It preserves the ordinary 0.5R stabilization span and accepts a short chord from 0.25R up to (but not including) 0.5R, offset at least 0.8R, inward movement, closest-point passage, actual disc intersection, and powered near-collinear movement throughout. A stationary release endpoint may trail the final movement by at most 16 ms; 17 ms rejects provisional promotion. This is an explicit registration cutoff, not a measured physical lift tolerance. Already-powered geometry is unchanged.

Independent review caught a sampling bug in the first candidate: requiring every individual segment to intersect rejected dense ±0.99R paths whose sparse segments hid outside approach/tail pieces. The correction requires at least one real intersection while every piece remains fast and aligned. One complete movement segment and its collinear subdivisions are equally eligible; an incomplete entering brush is not. Regressions compare identical launch objects for sparse, 5-way and 20-way subdivisions at mirrored 0.90R/0.99R offsets. A slow real brush followed by a fast outside miss still cannot power a shot.

Pointerup now records/finalizes contact before the five-pixel tap check. Powered board-space strikes take precedence over screen-space placement. An already-powered stroke held for 200 ms still loses release power under the unchanged 120 ms power rule, but is cancelled **without moving the staged disc**; it is not reinterpreted as an accidental placement tap. Stationary taps and unpowered short central motion still use placement. Production-handler routing tests cover this distinction.

The second read-only review reproduced a numerical boundary: exact 8 in/s sparse clips registered, but subdivisions rounded individual speeds slightly below 8. Contact registration and release now share a 1e-9 in/s comparison tolerance; mirrored boundary regressions cover 1/5/20/100 subdivisions and reject 8−1e-6 in/s. This does not meaningfully lower the gameplay speed threshold.

Conservative limitations remain explicit: preparation pauses retained in the short clip's history, interior stops and differing positions with identical timestamps reject promotion. A held **provisional** clip that fails the 16 ms release guard remains unpowered and can still route to placement when screen displacement is below five pixels; routing tests cover 16/17/200 ms. This differs from holding an already-powered strike, which cancels without placement. Complete-launch timing remains a separate future experiment.

Current local checks: 151 unit tests and production build pass. Added native browser regressions cover mirrored short clips, sparse/dense 0.99R paths, tiny powered phone displacement, holds, true misses, slow brushes and cancellation. Full browser verification is pending; earlier focused-run timeout was not a pass. Central forgiveness, outer launch response, spin, power timing, holes and scoring remain unchanged. Native/emulated checks do not establish physical-phone feel.

Verification snapshot history: the first isolated full run (149 tests) passed artwork/winner/mobile round progression and desktop short-graze checks, then was deliberately stopped after review required the minimum-speed numerical correction; it is incomplete, not a full-suite pass. A fresh immutable snapshot with the correction and 151 tests is running the complete suite. The helper diagnostic now invokes release-only finalization when available, so its 180 current-helper cases no longer accidentally omit this new production step; baseline native JSON remains unchanged.

Publication decision: Frank requested committing/pushing preview 5 for testing on the normal public app as its sole player, before the expanded full browser run completes. Unit tests/build are verified; full-browser status remains pending, not passed. Preview 4 remains an immutable rollback tag. Test quick mirrored near-edge clips on laptop touch and physical phone, then confirm the accepted central control still feels unchanged. Stronger extreme-glance response is not part of preview 5.

## Human playtest result

Frank reports preview 4 feels better and much more playable. Small and moderate off-centre contact are usable; attempts to barely clip the edge do not yet produce the expected strong left/right glance. This is human feedback, not a measured device trajectory. Preserve the successful central directional forgiveness while working on outer contact separately.

## Near-edge investigation

Offsets below are perpendicular **path displacement divided by disc radius**, not percentage of overlap/contact area. A 0.90 offset runs 0.5625 inches from the disc centre; 0.99 runs 0.61875 inches away. Disc radius is 0.625 inches. The physical finger footprint is not measured; input is a pointer centreline.

Executed the actual production helpers for 180 cases: offsets 0, 0.20, 0.50, 0.80, 0.90, 0.95, 0.98, 0.99, 1.00 and 1.01 radii, both sides, event intervals 5/20/50 ms, and three stroke lengths. Executed 45 native CDP cases across desktop mouse, laptop touch and 390×844 seated-view phone touch, then 18 faster/extended confirmation cases. Native launch measurements capture the first production moving-phase persistence write before simulation advances. No production test hooks or user storage are involved. Browser-emulated phone is not a physical-phone feel test.

### 1. A real short graze can remain provisional indefinitely

At lateral offset ±0.90R, path `(x,12.15) → (x,12.00) → (x,11.85)` intersects the disc and travels 0.30 inches, below the `0.5R = 0.3125 inch` stabilizing span. It remains unpowered even at 5 ms per segment (30 inches/second). All six native short-fast confirmation cases fail to launch, including desktop where displacement exceeds five screen pixels.

Extending that same stroke to y=11.75 gives 0.40 inches of travel and launches on mouse/laptop touch. This isolates a travel-registration limit from inadequate speed. The front-face continuation allowance does not rescue these starts: its radial front-region test excludes the side/equatorial part of the disc. The allowance was designed for leading-face starts, not every edge graze.

Relevant code: `approachSpan`, `updateFlickContact`, `FLICK_STRIKE.minContactTravel`, and the `front`/`frontStart` conditions in `src/game/flick.ts`. Do not simply lower minimum travel globally: it previously prevented fast tiny wobbles from latching extreme headings. Also retain slow-brush-plus-fast-miss rejection.

### 2. The fixed five-pixel tap gate discards powered phone contact

Path y=`12.4,12.2,12.0,11.8` at ±0.90R registers and launches on desktop mouse/laptop touch but not seated phone touch. Native pointerdown, raw moves and pointerup all arrive. The phone path spans approximately 4.82 screen pixels; `src/main.ts` pointerup treats displacement below five pixels as a placement tap and returns before adding the release sample or launching. This check ignores already-powered contact.

Confirmation: extending to y=11.7 gives approximately 5.62 phone pixels and launches on both sides, without changing game parameters. The 0.40-inch short-extended stroke still fails on phone (approximately 3.20 pixels), while launching on desktop. This is view/zoom-sensitive screen displacement, independent of the board-coordinate contact fit.

A focused future correction should distinguish an actual powered registered strike from a tap, without turning slow brushes/taps into shots. Test different zooms/views and preserve placement/camera gestures.

### 3. Long edge swipes are detected, but deflection is limited by the strike model

Long path y=`12.8,12.3,11.7,11.1,10.5` at ±0.90R and ±0.99R launches in all three native configurations. Initial phone headings are approximately ±27.69° and ±31.70°, respectively; spin reaches the existing 18 rad/s cap. A 1.01R path misses in all three configurations. Mirrored signs reverse as expected.

Preview 4's comfort layer is inactive at offsets >=0.50R, so it does not suppress these edge strikes. `releaseShot` instead computes the rounded-finger side component as `offset / 1.4`: the contact-eligibility radius is R, but the virtual normal uses R plus a 0.4R fingertip. Consequently an accepted centreline at R is not treated as a tangent to the combined circles, and its normal never approaches a perpendicular edge impulse. Tangential grip and the angular cap further change the resulting heading with power. These are tuned model choices, not calibrated real fingertip physics.

Therefore fixing detection alone will make short grazes register, but will not automatically create an almost-sideways glance. If stronger extreme glances are wanted, evaluate outer-normal/impulse geometry as a separate versioned change; preserve the central corridor, symmetry, diminishing edge energy, and true-miss boundary. Do not enlarge the hitbox or add arbitrary sideways speed as a shortcut.

## Reusable evidence

Run from project root with existing dependencies:

```sh
node scripts/probe-grazing.cjs
# Requires the Chrome/CDP environment used by tests/browser-spin.mjs:
node scripts/probe-grazing-native.mjs
```

Both are diagnostics that report the current behavior, not acceptance tests asserting that rejected grazes are correct. The native script uses isolated temporary storage and cleans its browser/server; it does not touch the public game. [Recorded native outcomes](grazing-native-evidence.json) retain all 45 baseline and 18 confirmation measurements, including screen travel. Scratch full event traces were inspected to verify raw-sample delivery; the durable script emits those traces on rerun.

## Recap: resolved, open and intentionally unchanged

1. **Central directional sensitivity: improved and published.** Stroke-relative neutral corridor 0.20R, smooth ramp to unchanged deflection at 0.50R. User confirms better playability. 139 unit tests, full isolated browser suite, and diagonal native checks passed for preview 4. No blanket rightward correction or target snap.
2. **Extreme grazing: registration corrected in preview 5; outer response unchanged.** Short-travel and phone tap gates are addressed separately from the limited outer normal. Full-browser verification is still pending at publication. Independently evaluate stronger extreme deflection after physical-device playtesting; keep accepted centre behavior unchanged.
3. **Follow-through power/timing: confirmed separate issue, not fixed.** Direction/offset freeze at powered contact, but the final 120 ms before release still supply power. Prior 476 helper and 54 native cases showed late slowing/acceleration changes power, 150 ms holds can cancel an already registered crossing, and off-centre heading varies through power-dependent impulse caps. A future complete-launch freeze at contact should be tested separately while retaining lift-to-release. These earlier exact measurements were on preview 3; the release-power path remains unchanged in preview 4, whose central corridor now suppresses central directional deflection.
4. **Spin deceleration: unchanged; separate physical tuning pending.** No dedicated rotational-resistance factor exists yet. Current stationary-spin model at 18 rad/s predicts roughly 0.21 seconds and less than one-third revolution, not a real-board measurement. Research found qualitative face/wax variability but no controlled crokinole spin-decay target. A separate resistance factor would alter angular velocity retained at collisions, tangential impulses and settling—not merely the cream dash. Preserve translational grip/drag; label unmeasured tuning honestly. Useful sources: [coupled slide/spin friction](https://arxiv.org/pdf/physics/0210024), [maker maintenance guidance](https://traceyboards.com/faq), [qualitative face comparison](https://www.youtube.com/watch?v=qNK4h6cc69Q).
5. **Audit hop issue: confirmed, unfixed.** `contactHop` can reverse a falling disc toward an upward target even with zero incremental-energy budget. One-sided energy bounds alone do not protect signed vertical velocity; the previously suggested simple `Math.max` repair did not resolve the class. Treat as an isolated simulation fix with falling/rising regressions, not input tuning.
6. **Shared-constant maintenance: verified but not deployed.** Commit `2c6a657` on `physics/review-cleanups-v0.3`, tag `crokinole-review-constants-cleanup`; 134 tests/build and exact launch/simulation comparisons passed. Shares unchanged surface gravity/inertia, names unchanged peg margin and removes an unused constant. Keep separate from behavioral experiments.
7. **Protected behavior:** the 20-hole, scoring, maximum power 105, sliding friction 0.1175, viscous drag 0.05, normal restitution, mobile Next round accessibility, legacy-save boundary and cream rotation marker. No changes to these in this investigation.

Do not restart a broad left-bias search solely because short edge clips fail: the present evidence identifies distinct gates and outer-model limits, with mirrored behavior. The actual user's gesture is not fully captured by these deterministic tests, and physical-device playtesting remains necessary.
