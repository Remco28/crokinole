# Physics versions and rollback

The strike preview is published from `main` through GitHub Pages at https://crokinole.teamremco.org/. The original development branch is retained as `physics/spin-v0.2`.

## Preserved checkpoints

| Tag | Package version | Behavior |
| --- | --- | --- |
| `crokinole-v0.1.0-original` | `0.1.0` | Original game before this work; sliding grip `0.115`, no axial spin. |
| `crokinole-v0.1.1-friction` | `0.1.1` | Small grip increase to `0.120`; original flick power and normal collision bounce. |
| `crokinole-v0.2.0-spin-preview.1` | `0.2.0-preview.1` | Friction adjustment plus forgiving flick spin and physical tangential contacts. |
| `crokinole-v0.2.0-spin-preview.2` | `0.2.0-preview.2` | Slightly narrower neutral center and stronger moderate-offset spin; damping and power unchanged. |
| `crokinole-v0.3.0-strike-preview.1` | `0.3.0-preview.1` | Rounded finger-contact deflection and coupled spin; powered-contact registration, native timestamps and coalesced paths. |
| `crokinole-v0.3.0-strike-preview.2` | `0.3.0-preview.2` | Stable near-impact direction instead of tiny-segment latching; picking aligned to the visible disc top. Physics-response parameters unchanged. |
| `crokinole-spin-damping-hardening` | `0.3.0-preview.2` | Separate numerical guard checkpoint; zero/near-zero damping support with gameplay coefficients unchanged. |
| `crokinole-friction-easing` | `0.3.0-preview.2` | Separate surface-grip easing checkpoint: `0.120` to `0.1175`; viscous drag, power, restitution and hole rules unchanged. |
| `crokinole-v0.3.0-strike-preview.3` | `0.3.0-preview.3` | Distance-based aim independent of the power window, overshoot-safe approach history, raw/coalesced event normalization, front-face touch starts, and zero-damping numerical guards. |
| `crokinole-v0.3.0-strike-preview.4` | `0.3.0-preview.4` | Small stroke-relative directional neutral corridor with a smooth deflection ramp; transferred speed, launch spin, power window, board-spin damping, collisions and hole behavior unchanged. |
| `crokinole-v0.3.0-strike-preview.5` | `0.3.0-preview.5` | Release-only short-edge registration, sampling-boundary robustness, and powered-strike precedence over the screen tap gate; accepted central forgiveness and outer physics response unchanged. |
| `crokinole-v0.3.0-strike-preview.6` | `0.3.0-preview.6` | Sharper outer glances beyond 0.70R with reduced transferred speed/spin; central response, registration and board-spin damping unchanged. |
| `crokinole-v0.3.0-strike-preview.7` | `0.3.0-preview.7` | Refined powered finish intent with bounded lift/jitter retention and symmetric diagonal counter-deflection protection; eligibility, release power, transferred speed/spin and board damping unchanged. |
| `crokinole-v0.3.0-strike-preview.8` | `0.3.0-preview.8` | Preview-7 input preserved; rotational Coulomb ratio 0.12, budgeted additive falling-contact hops, and neutral constant/inertia cleanup. Hole/scoring/sliding grip/power unchanged. |
| `crokinole-v0.3.0-disc-designs-preview.9` | `0.3.0-preview.9` | Cosmetic disc release: stained wood/poker chips, palettes, printed emblems and local circular picture crops; cream dash removed. Preview-8 physics/input/save behavior unchanged. |

The original checkpoint passed all 60 unit tests, production build, and artwork/winner browser flows. The friction checkpoint passed 62 unit tests, build, and the same browser flows. Spin preview 1 passed 96 unit tests; spin preview 2 passed 98. Strike preview 1 passed 108; strike preview 2 passed 115. Those releases passed production build and native desktop/mobile browser checks, including legacy-save preservation. Preview 3 passed 133 unit tests, production build and the expanded full browser suite in an isolated immutable release worktree. The earlier interrupted and screenshot-directory-failed attempts remain failures; the corrected isolated run completed with exit code 0. Preview 4 passed 139 unit tests, production build and the expanded full native browser suite in an isolated immutable candidate worktree (exit code 0). Its 24 central native gestures across mouse, laptop touch and emulated phone touch follow the incoming heading within 0.001 degrees at gentle/hard speeds. A separate 24-case native diagonal check on the same placed disc follows each angled stroke within 0.003 degrees instead of snapping to the hole. A separate 7,230-case comparison against preview 3 verifies unchanged launch spin and transferred speed and exact outer-strike response; registration regressions retain geometric misses and slow-brush rejection. Release checkpoints are preserved on GitHub.

`main` serves the strike preview; earlier versions remain available through their tags. To undo only preview 4's directional forgiveness after publication, run `git revert crokinole-v0.3.0-strike-preview.4` on `main`, verify, and push; no friction, rotational or hole tuning needs reverting. To then undo only preview 3's input changes, run `git revert crokinole-v0.3.0-strike-preview.3` on `main`, verify, and push; the separate spin-integration hardening and friction easing remain. Revert `crokinole-friction-easing` independently to restore the previous `0.120` grip. To then undo the preview-2 registration/picking fixes, run `git revert crokinole-v0.3.0-strike-preview.2` on `main`, verify, and push. To then return to spin preview 2 while retaining the mobile round-progression fix, revert `crokinole-v0.3.0-strike-preview.1`, verify, and push. To then return to spin preview 1 input tuning, revert `crokinole-v0.2.0-spin-preview.2`, verify, and push. For friction-only behavior, first revert the separate numerical guard commit (`git revert crokinole-spin-damping-hardening`), then revert the spin feature commit (`0b2ea0c`), verify, and push; to restore exactly the original grip, also revert `crokinole-friction-easing` if not already reverted, then the original grip-increase commit (`2ebbd16`). Do not move tags or force-push for rollback. To compare without deleting history or resetting work, start with a clean tracked working tree (`git status --short`), then:

```sh
# Try the friction-only checkpoint on a separate local branch.
git switch -c playtest/friction-only crokinole-v0.1.1-friction
npm run build
npm run dev

# Return to the latest strike playtest.
git switch main
npm run build
npm run dev
```

Use `crokinole-v0.1.0-original` with a different branch name to compare the completely original game. Stop the current dev/preview server before changing versions and reload the browser afterward. Rebuild before serving `dist/`; switching Git branches alone does not replace an already-built bundle. Do not use `git reset --hard` or `git clean` for this workflow. Unrelated review documents and artwork in the repo remain untouched.

## Saved games also have a boundary

The preview writes schema-version-2 matches to `crokinole-match-spin-v2`. If that key does not yet exist, it can copy the previous `crokinole-match` table, supplying zero spin and angle for old discs (including review copies). It never overwrites the old key.

Returning to an old physics tag therefore restores the pre-spin table on the **same browser origin**, not a spin-version match that the old code cannot understand. Returning to the preview resumes its separate table. Scores/artwork/preferences are otherwise unchanged; artwork remains shared. Start a new game when comparing fresh shot behavior. Different ports/domains have separate browser storage.

## Current strike and spin model

Preview 9 adds flat printed disc faces and local appearance settings only.
Preview 8 remains the accepted physics baseline and preserved cosmetic rollback
checkpoint. Revert `crokinole-v0.3.0-disc-designs-preview.9`, verify and push to
undo the cosmetic release without undoing preview 8's spin/contact behavior.
Appearance preferences/pictures have separate storage keys; the match key stays
`crokinole-match-spin-v2`. See [disc verification](docs/disc-design-verification.md).

Preview 8 is the combined spin/hop/cleanup playtest authorized by Frank for the
normal public URL. Preview 7 remains the rollback checkpoint. Revert the preview-8
release commit (`git revert crokinole-v0.3.0-strike-preview.8`), verify and push
to restore preview-7 behavior without rewriting history or changing saved games.
The combined candidate passed 226 tests, production build, source/provenance
checks and reproducible helper/settling probes. Browser publication checks and
their final status are recorded in the integrated verification report; interrupted
attempts are not passes. Retained spin and corrected descending-contact kicks
change some rebounds. Complex multi-contact timestep sensitivity and the
protected, unfixed hole-lip sign replacement remain disclosed. No power-freeze
experiment or physical-device acceptance is included.

Investigation results, human playtest feedback, reproducible near-edge diagnostics
and the ordered remaining work are recorded in
[input findings and remaining physics work](docs/physics/input-findings.md).
Preview 4's central behavior is accepted as more playable; short grazing contact
and the fixed screen-pixel tap gate are addressed separately in preview 5.
The registration-only correction from `physics/graze-registration-v0.3` does not
tune the outer impulse response. Sampling fixes, tap/hold policy and verification
status are recorded in the linked findings. Preview 5 passed 151 unit tests and
production build; the expanded full browser run remains in progress at publication.
Frank explicitly requested publishing for sole-player physical-device testing
without waiting for that run. No full-browser pass is claimed. To undo only this
registration change, run `git revert crokinole-v0.3.0-strike-preview.5` on `main`,
verify and push; preview 4's accepted directional forgiveness remains intact.

Post-publication preview-5 full-browser result: exit 1. Artwork, winner, mobile
progression and mouse/laptop-touch/phone short-graze regressions passed, but the
phone controlled stationary leading-face test unexpectedly launched. The linked
findings retain the reproduced calibration-fixture cause and test-only correction;
this original run is not a full-suite pass. Preview 6 tunes only launch response
beyond 0.70R and does not alter registration, central forgiveness or the hole.
Frank requested making this available on the normal public link for testing.
155 unit tests/build and 27 focused native cases pass; the corrected frozen full
browser suite remains pending at this publication decision. No full-suite pass
is claimed. Revert `crokinole-v0.3.0-strike-preview.6`, verify and push to undo
only this outer-response release. Longer residual spin is a separate next step.

Post-publication preview-6 verification completed: the corrected frozen full
browser suite exited 0, including mouse/laptop-touch/emulated-phone input,
stationary controls, cancellation, migration, pause/reload and resumed settling.
Source/tests matched the release. Initial positive feedback was superseded by
Frank's recurring bottom-left-to-1/2-o'clock wrong-direction report. The aiming
problem is reopened; slower-spin development is paused and remains unpublished.

Preview 7 addresses that reopened aiming report. Contact eligibility and offset
stay registered, but release refines intent from the last meaningful powered
spatial run instead of the small onset. A heading-only safeguard limits opposing
deflection for established diagonals; sharp radial edge glances remain. This is
explicit control tuning, not exact clock-face fidelity or physical calibration.
181 aiming-only unit tests/build, 46 seated native-touch cases and 27 focused
glance cases pass. The broader run was interrupted after artwork/winner checks,
so **no full-browser pass is claimed for preview 7**. Frank explicitly requested
commit/push for physical-device testing with that boundary. The paused slower-spin
candidate is excluded. Revert `crokinole-v0.3.0-strike-preview.7`, verify and push
to undo only the aiming release; preview 6 remains preserved.

Subsequent preview-7 verification completed: the isolated full browser suite
exited 0, with all 79 snapshot files byte-exact to the published release. The
earlier interruption above remains historical, not the final verification state.

- Maximum translational flick power remains `105`; centered launches use the original response.
- Flat-slide slowing retains the original formula: `frictionMu × 386 + frictionViscous × speed`. Surface grip is eased to `0.1175` from `0.120`; speed-dependent drag stays at `0.05`. Spin/contact additions did not add another free-slide brake. Contact collisions and glancing launches can still transfer translational energy into rotation or dissipate it.
- Contact is measured from swept segments through the actual disc radius; the hitbox is not enlarged. Slow intersections and tiny wobbles remain provisional. Direction and offset use up to `2` disc radii of spatial approach near contact, with at least `0.5` radii of net travel. The history retains enough distance before the newest segment, so a coarse overshoot cannot discard the incoming approach. A sample gap above `120 ms` starts a new approach. When sufficient approach travel already exists, a powered segment starting inside the disc fits from that start instead of advancing by another minimum-distance span; subdividing a long gentle preparation therefore does not move its aim anchor in the regression. A real intersection reaching `8 in/s` is required before a shot can launch; slow preparation does not dilute that speed, and an earlier fast outside approach cannot power a slow brush. Stable powered geometry freezes. The final `120 ms` still determine power, with the original response and cap; this release does not freeze a complete launch impulse at contact. Post-contact slowing/holding can still weaken or reject a shot, and release power can still affect outer-strike deflection when the angular cap engages. Raw coalesced events are processed instead of—not in addition to—their processed parent; unsupported/empty lists fall back to the parent. Native event timestamps remain authoritative.
- A gesture may start anywhere on the active disc footprint, including its leading face, without becoming a placement/camera drag. A real powered leading-face intersection that exits before enough spatial travel is available may mature through its uninterrupted powered inward continuation. Any slow or observed stationary segment, pause or outward move cancels that allowance; slow-brush-plus-fast-miss paths remain unable to launch.
- Flick picking intersects the visible top-face plane at `DISC.height`; shooting-line placement still explicitly intersects the board at height zero. This removes the view/placement-dependent offset caused by picking through the disc mid-height.
- A rounded virtual fingertip (`0.4` disc radii through 0.70R offset, smoothly reduced to `0.02` at the rim in preview 6) supplies the raw strike normal. The same geometry drives a Coulomb-capped tangential impulse (`0.35` finger grip), transferred speed and axial spin. Outer spin-transfer allowance scales with the reduced normal component. This is a tuned impulse-transfer approximation, not a measured fingertip collision model.
- Preview 4 adds an explicit directional comfort layer: offsets within `0.2` disc radii (`0.125 inches` either side of the stroke-relative centre line) preserve the incoming heading. A smoothstep ramp reaches the unchanged raw deflection at `0.5` radii; outer strikes are unchanged. Only the launch vector's orientation is softened, preserving transferred speed and angular velocity. The corridor rotates with the incoming stroke in board coordinates; it is not fixed behind a disc and does not target the 20-hole. This is deliberate input forgiveness, not a claim of measured fingertip physics or a rightward bias correction. The neutral spin zone remains independent, so a forgiven central strike can still carry a small amount of spin.
- Offsets within `0.1` disc radii produce zero spin; tangential grip ramps smoothly to full response by `0.4` radii. The spin cap remains `18 rad/s`. At an original launch speed of `44 in/s`, half-radius contact starts at about `16.8 rad/s` and deflects about `13.7°`. Preview 6 strengthens only outer deflection and reduces outer transferred speed/spin; measured examples are in the linked findings.
- Centered contact retains the original energy and power response. Glancing contact transfers less: `jn² + (1 + R²/I)jt² <= originalSpeed²`. There is no energy boost, arbitrary random aim penalty or post-impact steering.
- Axial spin is positive counterclockwise in the simulation plane. Inertia per unit mass is `radius²/2`.
- Grounded rotation loses speed from board friction and viscous drag. The analytical integrator handles zero/near-zero viscous friction, purely viscous friction and both-zero friction without nonfinite state; a small-argument series avoids cancellation in the angle integral. Sliding discs get less rotational torque than discs spinning in place: the regularized face-slip model uses the uniform-face torque arm at rest and the translating slip limit at high speed. Preview 8 multiplies only rotational Coulomb torque by `spinFrictionRatio=0.12`; translational grip and viscous drag remain unchanged. As sliding slows, rotational grip increases. Tipped/rolling support reduces it; airborne discs receive no board torque. Angular speed sleeps at `0.04 rad/s` and is set to exactly zero. Turn handover waits for rotational settling too.
- Disc, peg, occupied-pocket and exiting-lip contacts use relative contact-point velocity, including axial rim speed, to calculate an energy-dissipating, Coulomb-capped tangent impulse. Coefficients are `0.18` for discs, `0.28` for pegs, and `0.12` for the hole lip. These are gameplay tuning values, not measured material coefficients.
- Normal restitution remains `0.8` for discs and `0.62` for pegs. Disc/peg impact pops add a conservative, energy-budgeted upward kick to incoming signed vertical velocity; falling kinetic energy cannot fund a free sign replacement. Grounded/rising responses remain mathematically equivalent and genuine landing rebound remains. This is not a momentum-conserving free-air 3D contact solver. The analogous hole-lip reversal is protected and remains unfixed.
- There is no invented sideways free-slide force, shot randomness, or spin-dependent rejection of twenties. Hole dimensions and capture gates are unchanged. Lip friction can alter a glancing skip, but a centered clean twenty remains possible.
- Stained wood grain and printed poker/emblem/picture faces replace the cream inlay, following the same simulated rotation without a spin HUD or changed geometry.

This is an intentionally restrained extension of the existing approximate simulation, not a full 3D rigid-body solver or a model calibrated to measured real-board trajectories. Spin adds contact technique; it is **not** intended to secretly make good centered shots miss. Hole difficulty remains a separate tuning decision.

## Mobile round progression

The mobile viewport no longer has a forced `560px` minimum height. Its content can scroll, while the footer action remains pinned and uses an opaque theme-matched background. Next round remains visible with the round breakdown expanded; collapsing scores is optional. Tests cover all three modes at narrow, short and landscape sizes, including expanded four-player match details, scrolling to the full breakdown, and native touch advancement. This fix has its own commit before the preview-2 input-tuning commit, so reverting the tuning keeps the fix.

## Verification and playtest

```sh
npm test
npm run build
npm run test:browser
npm run test:browser:aim
npm run test:browser:discs
```

For the bounded latest-input regression only, run `CROKINOLE_INPUT_SMOKE=1 node tests/browser-spin.mjs`. That is not a substitute for, or a claimed pass of, the full browser suite.

The browser suite checks legacy-save preservation, actual centered and mirrored offset mouse flicks, moderate side contact on desktop/mobile, small-screen neutral touch contact, deliberate seated-view spin, pause/reload and resumed settling, in addition to artwork/winner flows and mobile round progression. Native input uses explicit gesture timestamps, with real rendering and physics loops left running. Strike checks include slow-brush-to-side-strike registration, meaningful hooked-finish refinement with registered contact preserved, misses and cancellation. The early-wobble reproduction previously veered about 50 degrees; preview 2 launches its ordinary-sample version straight on mouse and touch, and its millisecond-dense version stays around 5.4 degrees with mirrored behavior. Picking checks independently project the actual rendered top surface across views, placements and player quadrants. Preview 3 also compares the same imperfect path at multiple gentle/hard speeds and sampling densities, coarse overshoots against collinear subdivisions, and leading-face touch starts. Preview 4 adds small mirrored off-centre strikes at gentle/hard speeds within the directional corridor on mouse, laptop touch and emulated phone touch, plus a monotonic deflection-ramp check. Unit tests also exercise diagonal incoming strokes and other player quadrants without snapping to the hole. The stationary-contact handler regression injects one controlled stationary sample between native movements, because the test Chrome/CDP path suppresses unchanged-coordinate touch updates. It runs with isolated local browser storage, never a user's live table.

Human playtesting is still required for feel, particularly on a physical phone: ordinary centered shots should remain accessible; left/right offsets should be learnable rather than twitchy; glancing rebounds should be readable; rotation should die away rather than linger through handover. Compare the friction-only version if anything feels worse before tuning multiple variables together.
