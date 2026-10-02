# Preview7 release-power timing review (read-only)

## Scope and verdict

Accepted baseline: branch `physics/release-power-preview7`, commit `8c719b46e195b3ba80bea6268bc2aa2562b7a744`, version `0.3.0-preview.7`.
No gameplay source or existing tests changed; no browser, deploy, commit, push, or main-worktree writes. This is board-space Node/VM evidence, not fresh native-screen evidence. Frank currently likes preview7; freezing power is an optional experiment, not a demonstrated required fix.

**Measured:** eligibility/offset stay frozen, refined finish intent stays correct for ordinary powered/tiny tails while eligible, but the separate release-power estimator is sensitive to lift delay, late motion, and event density. A null shot after holding is cancellation, not wrong launch aim. A complete impulse frozen at registration demonstrably loses preview7's 30° onset and 45° hooked finish.

## Actual production trace

- `src/main.ts:278–304`: pointerdown establishes candidate, two separate trails, contact null; second touch cancels shot candidate for pinch.
- `305–353`: actual pointermove consumes `pointerMoveSamples` (coalesced list OR parent event, not both). `sampleFlick` appends power samples, appends spatial contact samples, updates contact, then filters power trail to samples at most 120 ms old. It does not interpolate a window-boundary sample.
- `378–405`: pointerup adds its position/time through the same accumulator, finalizes contact from spatial history, prioritizes powered contact over tap placement, invokes `releaseFlick`, then clears candidate.
- `354–367`: `releaseFlick` requires pass phase/staged/powered, calls real `releaseShot`, and only a nonnull shot changes phase/usage/disc velocity/spin. `cancel` clears both histories and contact.
- `src/game/flick.ts:86–123`: registration freezes powered eligibility, crossing offset, and incoming direction. Slow brushes/late misses cannot lend power to contact.
- `125–179`: finish intent is last 2R uninterrupted powered travel with chord at least .5R; tiny discarded travel capped cumulatively at .1R; meaningful slow/reverse tails are not transparent. Idle history bounded by 120 ms. Release intent is not the power vector.
- `180–211`: provisional short-rim finalization retains its **16 ms stationary-endpoint guard**.
- `214–225`: `releaseVelocity` chooses first retained sample strictly earlier than release; elapsed floor 16 ms; inward speed >=8; mapped magnitude `min(105, .8*speed+12)`.
- `264–312`: `releaseShot` uses power magnitude from that estimator, final finish direction or registered fallback for aim, frozen offset for transfer, and existing spin/glance/diagonal response. Launch heading can change with magnitude when the tangential spin cap changes the response ratio: constant intent does not imply constant output heading.
- `368–390`: cancel/lostcapture/blur/pinch clear candidate, independently of any power measurement.

## Reproducible inputs and evidence

Scratch probe: `/home/frank/.hermes/cache/scratch/release-power-preview7-probe.mjs`.
Raw inputs/outputs: `/home/frank/.hermes/cache/scratch/release-power-preview7-results.json`.
Run from this worktree: `node /home/frank/.hermes/cache/scratch/release-power-preview7-probe.mjs`.
The probe reads pinned source via `git show`, transpiles real helpers and real production handler section with TypeScript, mocks board picking as screen/100, and exercises separate and coalesced moves plus pointerup. No formula-only substitute.

Disc `(0,12)`, R=.625. Main paths:
- Center and signed offsets 0, ±.5R, ±.95R: `(x,14,0) → (x,10,100)`, `x=-offset*.625`.
- Onset30: `(-.0625,12.5,0) → (-.0625,12.1875,10) → (2.4375,7.8573729811,60)` (vertical powered onset then 5 inches at 30°).
- Hook45: `(0,14,0) → (0,10,100) → (1,9,120)`.
Each identical crossing/main path gets one of eight tails, then a same-position lift 17/50/100/150/200 ms after the tail endpoint. Density 1 or 16 collinear subdivisions per moving segment; stationary samples are not subdivided.

Tail inputs relative to the identical main endpoint:
| Tail | Displacement/time |
|---|---|
| none | none |
| acceleration | .625 inch along main direction / 5 ms (125 in/s) |
| deceleration | .625 inch along main direction / 100 ms (6.25 in/s, below contact gate) |
| poweredSlow | .625 inch along main direction / 50 ms (12.5 in/s) |
| jitter | +.005 inch x / 5 ms (1 in/s) |
| observedStop | same position +10 ms |
| reverse | -.625 inch along main direction / 20 ms |
| slowReposition | +.125 inch x / 40 ms (3.125 in/s; larger than tiny-tail allowance) |

560 helper cases; 1,120 production handler runs (separate/coalesced); zero helper/handler discrepancies above 1e-9. All 560 retained powered registration; 156 launched; no 150/200 ms case launched. Unchanged suite: **23 files / 181 tests passed**.

## Timing and tail measurements

Center: power magnitude equals launch speed; spin=0; intent/heading=0° for every nonnull launch. `—` means null power/shot, not mis-aim. Columns are lift delay after tail, in ms.

| Tail | Density | 17 | 50 | 100 | 150 | 200 |
|---|---:|---:|---:|---:|---:|---:|
| none | 1 | 39.3504 | — | — | — | — |
| none | 16 | 39.3504 | 30.5263 | — | — | — |
| acceleration | 1 | 34.7273 | 21.0909 | — | — | — |
| acceleration | 16 | 42.2376 | 33.2766 | 19.6596 | — | — |
| deceleration | 1 | — | — | — | — | — |
| deceleration | 16 | — | — | — | — | — |
| poweredSlow | 1 | 19.4627 | — | — | — | — |
| poweredSlow | 16 | 29.9487 | 21.2632 | — | — | — |
| jitter | 1 | — | — | — | — | — |
| jitter | 16 | 37.9179 | 29.0213 | — | — | — |
| observedStop | 1 | — | — | — | — | — |
| observedStop | 16 | 36.4541 | 27.4839 | — | — | — |
| reverse | 1 | — | — | — | — | — |
| reverse | 16 | 29.7590 | 21.1667 | — | — | — |
| slowReposition | 1 | — | — | — | — | — |
| slowReposition | 16 | 28.7573 | 19.0107 | — | — | — |

Concrete window mechanism: center/no tail at 17 ms retains t=0, power 39.3504. At 50 ms sparse retains only stationary t=100 before lift, so null; dense retains t=31.25, so 30.5263. At 100 ms dense first is t=81.25 and net speed is below gate. Acceleration+100 ms dense keeps t=87.5 and launches 19.6596, sparse keeps t=100 and cancels. These are sampling-policy differences, not geometry loss.

No-tail dense outputs (power, transferred launch speed, axial spin rad/s, world heading degrees from inward -y):

| Geometry | Lift ms | Offset | Registered aim | Refined intent | Power | Launch speed | Spin | Launch heading |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| center | 17 | 0.0000 | 0.0000 | 0.0000 | 39.3504 | 39.3504 | 0.0000 | 0.0000 |
| center | 50 | 0.0000 | 0.0000 | 0.0000 | 30.5263 | 30.5263 | 0.0000 | 0.0000 |
| center | 100 | 0.0000 | 0.0000 | 0.0000 | — | — | — | — |
| signed-0.5 | 17 | -0.5000 | 0.0000 | 0.0000 | 39.3504 | 37.0526 | -14.9906 | -13.6615 |
| signed-0.5 | 50 | -0.5000 | 0.0000 | 0.0000 | 30.5263 | 28.7438 | -11.6291 | -13.6615 |
| signed-0.5 | 100 | -0.5000 | 0.0000 | 0.0000 | — | — | — | — |
| signed0.5 | 17 | 0.5000 | 0.0000 | 0.0000 | 39.3504 | 37.0526 | 14.9906 | 13.6615 |
| signed0.5 | 50 | 0.5000 | 0.0000 | 0.0000 | 30.5263 | 28.7438 | 11.6291 | 13.6615 |
| signed0.5 | 100 | 0.5000 | 0.0000 | 0.0000 | — | — | — | — |
| signed-0.95 | 17 | -0.9500 | 0.0000 | 0.0000 | 39.3504 | 16.9377 | -10.3536 | -53.9946 |
| signed-0.95 | 50 | -0.9500 | 0.0000 | 0.0000 | 30.5263 | 13.2972 | -10.3536 | -50.9244 |
| signed-0.95 | 100 | -0.9500 | 0.0000 | 0.0000 | — | — | — | — |
| signed0.95 | 17 | 0.9500 | 0.0000 | 0.0000 | 39.3504 | 16.9377 | 10.3536 | 53.9946 |
| signed0.95 | 50 | 0.9500 | 0.0000 | 0.0000 | 30.5263 | 13.2972 | 10.3536 | 50.9244 |
| signed0.95 | 100 | 0.9500 | 0.0000 | 0.0000 | — | — | — | — |
| onset30 | 17 | 0.1000 | 0.0000 | 30.0000 | 66.7839 | 66.6133 | 0.0000 | 30.0000 |
| onset30 | 50 | 0.1000 | 0.0000 | 30.0000 | 50.3487 | 50.2201 | 0.0000 | 30.0000 |
| onset30 | 100 | 0.1000 | 0.0000 | 30.0000 | 24.6316 | 24.5687 | 0.0000 | 30.0000 |
| hook45 | 17 | 0.0000 | 0.0000 | 45.0000 | 41.5378 | 41.5378 | 0.0000 | 45.0000 |
| hook45 | 50 | 0.0000 | 0.0000 | 45.0000 | 33.0819 | 33.0819 | 0.0000 | 45.0000 |
| hook45 | 100 | 0.0000 | 0.0000 | 45.0000 | 21.4281 | 21.4281 | 0.0000 | 45.0000 |

Onset30/no-tail sparse at 100 ms cancels; dense launches at 30°, speed 24.5687. Hook45/no-tail at 100 ms launches both densities at 45°, speed 21.4281. Neither establishes universal native 100 ms launch: the parent reports some native fixtures cancel, consistent with this window dependence.

Meaningful reverse/slow-reposition tails explicitly invalidate refined intent in current preview7. Onset30 reverse +17 ms launches at registered 0°, speed 50.2076 (both densities); slow-reposition +17 ms also launches 0°, speed 48.3435. Hook45 reverse +17 ms falls back 0° (sparse 23.0767, dense 32.8104). These are reproducible boundary-policy consequences, **not proof that a tiny/stationary lifted accepted gesture aims incorrectly**, and not grounds for silently broadening this power slice into a new intent policy.

## Power snapshots versus complete impulse freeze

All counterfactuals invoke real `releaseShot` on captured helper inputs; they are not an implemented handler policy. Main-endpoint snapshots use a fixture's known marker as an oracle, not a proven automatic commit detector.

| Fixture, dense, no tail, 17 ms | Current speed / heading | Complete registration freeze | Registration power + final intent | Main-end power + final intent |
|---|---|---|---|---|
| center | 39.3504 / 0.0000° | 44.0000 / 0.0000° | 44.0000 / 0.0000° | 44.0000 / 0.0000° |
| onset30 | 66.6133 / 30.0000° | 27.5544 / 0.0000° | 27.5544 / 30.0000° | 82.0957 / 30.0000° |
| hook45 | 41.5378 / 45.0000° | 44.0000 / 0.0000° | 44.0000 / 45.0000° | 45.9935 / 45.0000° |

**Proven regressions of naive freezing relative to accepted preview7:**
1. Complete impulse freeze restores 0° for the onset30 and hook45 paths where accepted release launches 30°/45°. Do not freeze registration-time direction/whole vector.
2. Registration-only scalar capture retains 30°/45° if re-composed with final intent, but underpowers onset: 27.5544 vs accepted 66.6133 at 17 ms. The 16 ms speed floor contributes to this early snapshot. Earliest eligibility is not an adequate power-commit definition.
3. Unconditionally using old scalar snapshots revives current held cancellations (e.g. center at 150/200 ms, onset final intent has already expired to fallback 0°). A max age and abort policy must be explicit, not inferred from contact eligibility.
4. Even independent scalar capture can change rim launch heading via existing response caps. Dense +.95R no-tail current 17/50 ms headings 53.9946°/50.9244°; main-end scalar yields 55.1341°, unchanged 0° intent and spin ceiling 10.3536. Do not promise bit-identical rim response when increasing power.

### Smallest separately testable optional experiment

Prefer **stationary-lift power stabilization only**, not full impulse freeze or contact-time capture:
- Keep preview7 eligibility, offset, spatial finalization and final intent untouched.
- Maintain an independent power-history snapshot ending at the last moving sample, before stationary lift/stop time advances. Compute its scalar using the unchanged real estimator; never freeze its aim/vector.
- First preserve the current release-power null/non-null gate; only for a currently valid release compose the snapshot scalar with the current finalized contact through unchanged response. Off means exactly preview7.
- This smallest variant does not solve sparse/dense cancellation and intentionally does not revive holds. It changes accepted power feel; do not deploy without A/B approval.
- Late moving acceleration/deceleration remains observable in the snapshot; tiny-moving noise, meaningful reverse/slow reposition, and broader stroke-commit semantics are separate follow-on policies. No guessed radius/time threshold is a product decision here.

140 helper counterfactuals (no tail / observed stop, all geometries/densities/lifts) preserve all current nulls, with zero new cancellations or revived nulls. Baselines independently replayed through production handlers; counterfactual composition is helper-only, not native or integrated-handler implementation. Center valid 17/50 ms dense releases become speed 44 instead of 39.3504/30.5263; center 100/150/200 ms still null. Onset30 valid 17/50/100 ms dense becomes speed 82.0957 at 30°. Hook45 becomes 45.9935 at 45°. These sizable feel changes argue for a separate preview, not treating power freeze as a necessary repair.

A broader alternative (power remains available for a fixed lift grace) would require independently preserving appropriate final intent within that grace, plus explicit expiry/abort. Scalar-only revival after current intent expiry is unsafe for onset/hook paths. Retain existing long-hold cancellation by default; if replacing hold-to-abort, provide a discoverable explicit abort and keep pointercancel/lostcapture/blur/pinch unconditional. No choice is final here.

## Preservation probes and acceptance criteria

Actual production handlers: pointercancel, lostpointercapture, blur and second-touch pinch each suppress launch and usage (phase pass, used=0). Sparse/dense misses, slow-brush→late-fast-miss and tiny wobble never launch; tap/wobble retain current placement routing. Short .99R rim clip (.2 inch / 5 ms) launches with 16 ms stationary lift and cancels at 17 ms in both densities. Existing guard is intact. Baseline scoring/hole/friction/spin/session tests pass; no downstream source changed. This is not downstream verification of a candidate policy.

Any optional candidate should have these separately named acceptance tests before native A/B:
1. Off switch reproduces exact preview7 helper/handler outputs; no source/response tuning bundled with power policy.
2. Powered eligibility, signed offset and registered direction unchanged; accepted final intent matches preview7, including onset30/hook45, tiny noise, meaningful boundaries, mirrors/quadrants.
3. Within agreed lift-only stabilization domain, identical qualifying movement yields lift-delay-invariant scalar/speed/spin; independently report response heading changes where spin caps apply.
4. Preserve current nulls for the smallest variant; larger grace policy must name exactly which nulls become launches, use explicit age since meaningful movement, test threshold ±1 ms, and never launch after intent expiry with fallback early aim.
5. Test real separate/coalesced handlers and actual native pointer timings 17/50/100/150/200 ms, centered/moderate/rim, sparse/dense, early acceleration/late deceleration/reversal and observed stops. Do not reuse preview3/native results as current evidence.
6. Preserve miss/slow-brush/wobble/placement and 16 ms provisional rim guard; unconditional cancel/lostcapture/blur/pinch/deadline abort; usage increments only on launch.
7. Re-run unchanged full helper suite and downstream hole/scoring/slide/spin tests, then the parent's complete native suite on any combined candidate.

**Genuine user decision if experimentation proceeds:** Should late lift/soft braking continue to weaken/cancel an already powered swipe, as today, or should a committed swipe retain movement power for an explicitly bounded grace? How should deliberate reversal/hold abort it? First obtain A/B preference for lift-only stabilization; a general commit detector and replacement abort UX are larger product choices. Keeping liked preview7 unchanged remains the default recommendation.
