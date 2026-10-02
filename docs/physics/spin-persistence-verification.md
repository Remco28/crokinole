# Slower-spin candidate: preview-7 verification repair


> Parent subsequently verified spin-only trusted-CDP native aim (`proc_e7317a4eed59`, frozen `crokinole-spin-native-e20ic7vi`): exit 0, 46 deduplicated cases (22 laptop-touch / 24 emulated phone-touch), 42 launches and 4 expected 100ms no-power hold cancellations without relocation; no runtime exceptions; all 79 frozen files hash-exact. Mirrors, clock 1/2, left-up onset, 17/50/100ms lift, noise, center and edge covered. This is not combined-candidate evidence, a native full-suite pass, or physical-device testing.

> Historical isolated spin-only verification copied without changing its recorded measurements. It does not verify the combined candidate. Original isolated worktree evidence remains unchanged. See [integrated verification](integrated-followup-verification.md) for explicit current profiles and rerun commands. No deployment, integrated native-browser or physical-device pass is implied.

**Unpublished candidate. Public preview 7 stays unchanged.** This slice repairs
verification only; it does not select new damping or modify gameplay source.
The copied candidate still uses `spinFrictionRatio = 0.12` for axial Coulomb
torque, with unchanged translational friction, viscous drag, input, collision
coefficients, hole behavior and scoring. Retained spin changes collision
**outcomes**; unchanged coefficients are not an outcome-invariance claim.

## Provenance and reproduction

- Baseline is pinned to exact preview-7 commit
  `8c719b46e195b3ba80bea6268bc2aa2562b7a744`, not a movable tag or preview 6.
- `scripts/probe-spin-persistence.cjs` transpiles independent graphs of the real
  production helpers, records SHA-256 source hashes, asserts equality of all
  17 protected `src` files, and checks unchanged tuning/geometry except the
  already-copied spin ratio. The two candidate source files retain copied hashes:
  - `src/sim/constants.ts`: `0df71607018ef498285b697914522c9bcfcff001081345a577b9a8c6d3ec817f`
  - `src/sim/spin.ts`: `a239cb2fbceb0bfc30dc7657c0370f01571d084dfc8bdf3aed1111007348b3f5`
- Fixtures accumulate `appendFlickContactSample`/`updateFlickContact`, independently
  prune the 120ms power window, call `finalizeFlickContact`, then `releaseShot`.
  Stale preparation is pruned and a 200ms held release cancels. These are real
  helper/full-physics fixtures, not native screen-to-board touch tests.
- Exact ratio-1 replay matches baseline full-model rows and stationary damping;
  zero-spin slide/centered traces are exact. There are **280 exact signed/centered
  launch comparisons** across five approach speeds, seven offsets and eight
  subdivision densities, in addition to the sweep comparisons.

```sh
npm test -- tests/spin-persistence.test.ts tests/spin-damping-limits.test.ts tests/flick-intent.test.ts
npm test
npm run build
node scripts/probe-spin-persistence.cjs --write
node scripts/probe-spin-persistence.cjs > spin-probe-replay.json
cmp docs/physics/isolated-spin-persistence-evidence.json spin-probe-replay.json
```

Verified locally: **37 targeted tests / 3 files**, **194 total tests / 24 files**,
TypeScript plus production build, and durable probe pass. A second probe run is
byte-identical to the regenerated schema-2 evidence. Build retains the existing
nonfatal >500kB bundle warning. No Chrome/browser run was performed in this slice.

## Measured behavior

Primary step is production's 1/120s; 1/240s and both airborne modes are retained.
Stationary signed 3/6/12/18 rad/s spins settle in approximately
0.283/0.567/1.117/1.650s. At approach speed 20 in/s, free launch residual waits
are 1.375s (0.8R offset), 0.0167s (0.15R) and zero (centered).

The durable signed first-disc-contact fixture uses ±0.8R, 20 in/s and a stationary
target **3 inches along the real launch vector**. At 120Hz first contact is
observed in the frame ending at 0.091667s: candidate pre-impulse spin is
±17.057036 rad/s, **98.5911% retained**, versus baseline ±15.891476 rad/s.
The event is emitted after face damping and before disc impulses. Frame-end
rebound velocity differs by up to **0.121412 in/s**; this change is asserted, not
hidden. This head-on fixture settles in 1.158333s total with 0.700s residual wait.
The finer-step contact frame ends at 0.0875s, retains 98.6553%, and changes rebound
velocity by 0.115879 in/s. It settles finitely under either airborne mode.
Residual waits from differently arranged exploratory collisions are not this
fixture's acceptance target.

Eight signed timestep/airborne combinations also run **full `step()` with zero
viscosity** through stationary spin, finalized free launch, first disc contact
and peg contact: 32 finite settled scenes, not merely analytic-helper checks.
Temporary viscosity/ratio mutations are restored. All evidence scenes remain
finite and settle within the probe's 20s bound (unit fixtures use 10s).

## Limits and remaining checks

- Complex peg/lip sequences are **not timestep-invariant**. Candidate 240Hz
  `launch-80-0.5` / `launch-150-0.5` waits are 2.4625 / 2.020833s. Maximum final
  position differences versus 120Hz are 14.102816 inches for the candidate and
  11.825242 inches for preview 7. Event/state differences remain in the evidence;
  baseline divergence does not excuse or conceal candidate sensitivity.
- Existing simple disc/peg-glance convergence bounds remain asserted: <0.25in
  final position, <0.15rad final angle, <0.05s residual-wait difference.
- This is gameplay resistance tuning, **not real-physics calibration**. User
  reports of roughly one-in-five shots waiting 1–2s are qualitative play feedback;
  fixture frequencies are not observed player probabilities or a forced quota.
- Remaining native checks: frozen-candidate seated laptop-touch/emulated-phone
  aiming and signed edge launches, full browser gameplay/turn handover after
  residual spin, pause/reload/resumed settlement, and physical phone/laptop
  touchscreen play feel. No native or physical-device candidate pass is claimed.
- `contactHop` audit and hole behavior remain intentionally untouched. No commit,
  push, deployment, public-version change or claim about another worker's full
  browser run is part of this repair.

Evidence: [isolated-spin-persistence-evidence.json](isolated-spin-persistence-evidence.json).
