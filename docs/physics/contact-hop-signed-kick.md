# Isolated signed contact-hop correction


> Historical isolated signed-hop-only verification copied without changing its recorded measurements. It does not verify the combined candidate. Original isolated worktree evidence remains unchanged. See [integrated verification](integrated-followup-verification.md) for explicit current profiles and rerun commands. No deployment, integrated native-browser or physical-device pass is implied.

Candidate branch: `physics/contact-hop-signed-kick`, based on `8c719b46e195b3ba80bea6268bc2aa2562b7a744`. This is not a deployed change. The input findings' "unfixed" hop entry describes the published baseline; this document records the isolated correction.

## Policy and scope

Only `contactHop` in `src/sim/spin.ts` changes production behavior. Both production callers (`src/sim/physics.ts`: peg contact and disc-pair contact) remain unchanged, as do horizontal restitution, contact friction, registration, axial damping, landing, hole interaction/capture/scoring, and input/aim.

Targets are **zero-baseline upward hop speeds**, not replacement signed velocities. Snapshot each incoming signed velocity `v` before allocating the shared energy budget `B`:

- `u = max(v, 0)`
- `q = max(target - u, 0)`
- Requested synthetic work: `C = u*q + q*q/2`
- One common fraction: `f = sum(C) > 0 ? clamp(B/sum(C), 0, 1) : 0`
- Allocated work: `W = f*C`
- Additive upward kick: `delta = 2*W / (sqrt(u*u + 2*W) + u)`; a zero denominator gives zero.
- Output: `v + delta`

The rationalized expression avoids subtracting almost equal square roots. Zero/negative budget gives no kick; zero/negative targets or targets below existing rising speed also give no kick. For finite simulation inputs, `0 <= delta <= q` and `u*delta + delta*delta/2 = W` in real arithmetic. Actual vertical KE change is `v*delta + delta*delta/2 <= W` because `v <= u`. Even the sum of individual positive KE increases is bounded by the budget; a falling disc's lost KE is never credited to its partner. Floating-point checks allow numerical roundoff.

For grounded/rising inputs, this is mathematically equivalent to the previous production-caller behavior, `sqrt(v*v + 2*W)`, with caller targets clamped to at least `v`. The previous helper's behavior of overwriting a rising velocity with a lower target was not used by production callers and is intentionally not retained. No pre-existing test assertions needed alteration: every old assertion passes unchanged.

For falling inputs the kick is added to signed descent, not to its speed magnitude. A legitimate upward reversal is still possible if a funded kick exceeds the descent. This is a **conservative gameplay pop/work policy, not a full 3D rigid-body or momentum-conserving airborne contact solver**. It can spend more synthetic work than the actual KE increase, deliberately dissipates rather than reuses falling energy, and does not model coupled vertical collision geometry/momentum.

## Regression and execution evidence

Tests were added before changing the helper. Against the unchanged helper, the targeted run had **15 failures / 45 passes**; the failures included zero/negative-budget reversals, direct funded descent, shared mixed-state allocation, and actual peg/disc callers. Hole tests passed throughout.

After the correction:

- `npm test -- tests/spin.test.ts tests/hole.test.ts`: **60 passed**, 2 files.
- `npm test`: **203 passed**, 23 files.
- `npm run build`: TypeScript and Vite passed. Vite retains the non-fatal bundle-size warning for a chunk over 500 kB.
- `git diff --check`: passed.
- Deterministic two-disc sweep in `tests/spin.test.ts`: **7,350 cases**, including negative budgets/targets, falling/grounded/rising states, bounded signed kicks, synthetic-work bounds, and sum-of-positive-actual-KE bounds.
- Independent execution of the real helper against the HEAD helper: **0 invariant failures**, **2,400 nonnegative caller-compatible cases**, maximum output difference **7.105427357601002e-15**. Maximum kick-over-cap was zero; maximum synthetic/positive-actual-KE budget excess was floating-point roundoff, **4.547473508864641e-13**, below the tests' `1e-8` tolerance.

Selected direct outputs:

| Incoming `vz` | Target | Budget | Corrected `vz` |
| ---: | ---: | ---: | ---: |
| -10 | 2 | 0 | -10 |
| -10 | 20 | 0 | -10 |
| -10 | 2 | 1 | -8.585786437626904 |
| -10 | 20 | 50 | 0 |
| -10 | 20 | 200 | 10 |
| -1 | 2 | 2 | 1 |

For actual `step` contacts at `dt=0.00001`, `z=0.1`, horizontal approach speed 20, gravity first changes incoming `vz` by `-0.0018`:

| Contact | Incoming `vz` | Previous output | Corrected output |
| --- | ---: | --- | --- |
| Peg | -10 | +2 | -8.0018 |
| Disc pair, both falling | -10 | (+1.44, +1.08) | (-8.5618, -8.9218) |
| Peg | -1 | +2 | +0.9982 |
| Disc pair, both falling | -1 | (+1.44, +1.08) | (+0.4382, +0.0782) |

Baseline-vs-candidate execution verified identical horizontal velocities/spin, events, touched IDs, and opponent-contact registration in all eight sampled peg/disc cases across `vz=-10,-1,0,10`. Permanent tests also cover grounded pops, rising targets, mixed falling/rising caller state, airborne-disabled contacts, resting/separating overlaps, height exclusions, non-board participants, and legitimate landing bounce.

A supported landing from `vz=-10`, `z=0.00001` at the same timestep still emits only `land`, sets `z=0`, and gives `vz=3.5006299999999997` through the unchanged `landBounce=0.35` response. This reversal is intentional and must not be suppressed by a blanket "falling discs cannot rise" rule.

## Separate hole-lip issue: explicitly unfixed

`src/sim/hole.ts:114` still uses `sqrt(vz*vz + removed*0.1)` and can reverse a falling disc even during a weak lip interaction. Reproducing with `vx=2`, `vz=-10`, `z=0`, position `(BOARD.holeRadius+0.001, 0)`, engaged hole motion with `dip=0.02`, and `previousRadius=BOARD.holeRadius-0.001` produces **`vz=10.015380172514671`**. This is separate from `contactHop` and is intentionally left unchanged to protect the requested hole behavior. Existing hole and lip-energy tests still pass; those energy-only bounds do not themselves detect a signed reversal.

No browser/Chrome run, commit, push, deployment, or main-worktree edit was performed.
