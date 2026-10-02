# Independent verification of the October 1 follow-up review

Scope: `PHYSICS-REVIEW-2026-10-01-FOLLOWUP.md`, against HEAD `4b7535f4af93874fff63dbbd79da36e08fe2133d` and the existing unpublished rotational-resistance working tree. Verification made no gameplay source changes, commits, pushes or deployments. Input code, main handlers and linear/collision physics match that release; the local spin changes are not part of the published playtest.

## Verdicts

1. **Falling-contact sign reversal reproduced, proposed remedy rejected.** `src/sim/spin.ts:71–79` changes `vz=-10` to `+2` for a target of 2, even with zero additional energy budget. Full `step()` reproduces downward-to-upward transitions at both peg and disc contacts (from -10 to +2 and +1.44 respectively). The report's suggested `Math.max(d.vz, targets[i])` also yields +2, so it does not repair the reported falling case. The other branch also reverses -10 to +10 with target 20 and zero budget. Existing energy bounds include negative vertical speeds, but do not constrain the impulse or specify when reversal is justified. Energy boundedness alone does not establish a correct vertical response. However, an upward contact impulse is not intrinsically forbidden: fixing this requires an explicit collision/hop rule, not a blanket assertion that falling discs must always continue falling. This is not evidence for Frank's pre-collision aiming complaint.

2. **Short-stroke eligibility boundary reproduced; not yet an established accidental bug or aiming cause.** A fast 0.30-inch chord (below ordinary 0.3125-inch/0.5R stabilization) produces no launch at offsets 0, 0.5, 0.6, 0.7 and 0.79R; the identical chord launches at 0.8, 0.9 and 0.99R. The boundary is perpendicular offset, not stroke length: the review heading mixes those dimensions. The restriction is explicitly documented in input findings and tested as anti-wobble protection in `tests/flick-graze.test.ts:85–88`. Lowering it may be a product improvement but must preserve central wobble, slow-brush/fast-miss and sample-density controls. It explains rejected short swipes, not an accepted shot going left instead of right.

3. **Two gravity scales and duplicated `386` confirmed; maintenance finding.** `gravityZ=180` is explicitly the gameplay hop channel; surface friction uses 386 in `physics.ts:34` and `spin.ts:26`. Naming the surface acceleration is sensible. Do not unify the two physical/gameplay scales as a purported numerical fix.

4. **Duplicated inertia expression confirmed; maintenance finding.** `flick.ts:202` and `spin.ts:5` currently compute the same solid-cylinder inertia. No current inconsistency was found. Sharing it could avoid future drift; no need to mix this refactor into aiming work.

5. **Unused application wrapper confirmed.** Search found `crossesDisc` only in its definition and old unit tests; production uses the underlying contact functions. Coverage of that wrapper does not establish coverage of production registration, but the project also has direct registration, release-routing and native input tests, so it is not all phantom coverage.

6. **Unused peg constant and inline padding confirmed.** `PEG_COLLISION_RADIUS` is definition-only; production instead computes orientation-dependent `discContactRadius` and adds peg radius, then pads by 1.02. Do not replace that dynamic calculation with the static unused constant: tipped-disc geometry would be lost. A named padding tunable is a maintenance decision, not a reproduced directional bug.

7. **Strict inward radial gate reproduced; policy rather than accidental inversion.** At disc (0,12), a center-crossing stroke 89.9 degrees from inward launches; exact lateral 90 and outward 90.1/100 degrees do not. The rule is present in contact detection, continuous registration, short-clip finalization and release power. Altering it would change intended shot/camera policy and requires dedicated controls. It does not establish why a valid inward rightward shot launches left.

## Corrections to broader claims

- Re-ran the current unit suite: **164 tests / 22 files pass**. `npm run build` passes with the existing nonfatal >500 kB bundle warning. Did not rerun the long full browser suite for this audit; the published-release browser pass is a historical result documented separately, not a fresh candidate-browser result.
- Confirmed coalesced-event single-representation selection, zero-viscosity analytical branches/Taylor limit and whole-disc flick eligibility in source, with their existing tests passing.
- Replayed a clean straight centered approach at 16/20/60/120/1000 Hz: initial headings are all zero and launch objects equal. This confirms those geometries only. It does **not** prove all imperfect/contact-start gestures are sample-rate independent or reliable on physical touchscreens. Existing imperfect-path tests allow bounded differences.
- The unpublished `spinFrictionRatio=0.12` candidate produces grounded rest times approximately 0.283/0.563/1.117/1.650 seconds from 3/6/12/18 rad/s. It does not make every spinning shot wait 1–2 seconds and does not establish the reported one-in-five played-shot frequency.
- **“Without altering collision dynamics” is too strong.** The collision formula is unchanged, and zero-spin centered paths can remain identical. But changing retained spin before impact changes tangential contact impulses. An otherwise identical spinning glancing-disc probe at ratios 1 and 0.12 yielded different post-impact velocities/spins. This is expected coupling, not necessarily a defect; it must be acknowledged and checked if the spin experiment resumes.

## Evidence and reproduction

Executed scratch probe: `/home/frank/.hermes/cache/scratch/verify-crokinole-followup.cjs`; full measured output: `/home/frank/.hermes/cache/scratch/verify-crokinole-followup-evidence.json`. The probe loads actual TypeScript through the installed compiler, exercises contact accumulation/finalization/release, direct and full-step hop cases, centered-rate controls and spin/collision comparisons. The review's suggested hop replacement is compiled only in memory, not applied to project source. Scratch paths may be pruned; this document preserves the key measured outcomes.

Priority remains Frank's bottom-left-to-screen-1/2-o'clock wrong-direction complaint on **phone and laptop touchscreen, seated view**. None of the follow-up report's findings yet establishes its cause. Spin remains paused and unpublished. Do not replace the aiming investigation with cleanup or unrelated collision tuning.
