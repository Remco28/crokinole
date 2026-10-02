#!/usr/bin/env node
// Run: node scripts/probe-integrated-followup.cjs [--write]
// --write replaces docs/physics/integrated-followup-evidence.json. No app hooks,
// invented shot delay, randomness, or copied damping/contact equations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baselineTag = 'crokinole-v0.3.0-strike-preview.7'; // descriptive only
const baselineCommit = '8c719b46e195b3ba80bea6268bc2aa2562b7a744'; // immutable authority
const selectedFactor = 0.12;
const approachSpeeds = [8, 20, 40, 80, 150];
const offsets = [0, 0.15, 0.28, 0.5, 0.7, 0.8, 0.9, 0.99];
const sha256 = source => createHash('sha256').update(source).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
const sourceAt = (ref, file) => ref
  ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');

// Graph loading below requires an explicit verification profile and real TS modules.
const shot = () => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
const translating = discs => discs.some(d => d.state === 'board' && Math.hypot(d.vx, d.vy) > 0);
const spinning = discs => discs.some(d => d.state === 'board' && d.spin !== 0);
const snapshot = discs => discs.map(d => ({ ...d, ...(d.hole ? { hole: { ...d.hole } } : {}) }));
function stationary(m, initialSpin, dt) {
  const d = m.makeDisc(1, 0, 0, 9); d.spin = initialSpin;
  let updates = 0, peakEnergyIncrease = 0;
  while (d.spin && updates < 20 / dt) {
    const before = m.DISC_SPIN_INERTIA * d.spin ** 2 / 2;
    m.integrateSpin(d, dt); updates++;
    const after = m.DISC_SPIN_INERTIA * d.spin ** 2 / 2;
    peakEnergyIncrease = Math.max(peakEnergyIncrease, after - before);
    assert.ok(after <= before + 1e-12);
    assert.ok(d.spin === 0 || Math.sign(d.spin) === Math.sign(initialSpin));
    assert.ok([d.spin, d.angle].every(Number.isFinite));
    assert.deepEqual([d.x, d.y, d.vx, d.vy], [0, 9, 0, 0]);
  }
  assert.equal(d.spin, 0, 'stationary spin settles within 20s');
  return { initialSpin, settleSeconds: updates * dt, angle: d.angle, peakEnergyIncrease };
}
function register(m, samples, disc) {
  let history = [], power = [], contact = null;
  for (const sample of samples) {
    history = m.appendFlickContactSample(history, sample);
    contact = m.updateFlickContact(contact, history, disc);
    power = [...power, sample].filter(s => sample.t - s.t <= 120);
  }
  contact = m.finalizeFlickContact(contact, history, disc);
  return { history, power, contact, launch: contact ? m.releaseShot(power, disc, contact) : null };
}
function poweredLaunch(m, approachSpeed, offset, divisions = 16) {
  const x = -offset * m.DISC.radius, distance = Math.min(4, approachSpeed * 0.08);
  const samples = Array.from({ length: divisions + 1 }, (_, i) => ({ x,
    y: 12 + distance / 2 - distance * i / divisions, t: distance / approachSpeed * 1000 * i / divisions }));
  const disc = { x: 0, y: 12 }, { history, power, contact, launch } = register(m, samples, disc);
  assert.equal(contact?.powered, true, 'real input helper registers powered fixture');
  const velocity = m.releaseVelocity(power, disc);
  assert.ok(launch && velocity);
  const launchEnergy = (launch.x ** 2 + launch.y ** 2 + m.DISC_SPIN_INERTIA * launch.spin ** 2) / 2;
  assert.ok(launchEnergy <= (velocity.x ** 2 + velocity.y ** 2) / 2 + 1e-8);
  const d = m.makeDisc(1, 0, 0, 12);
  Object.assign(d, { vx: launch.x, vy: launch.y, spin: launch.spin });
  return { discs: [d], metadata: { approachSpeed, offset, samples, history, power, contact, launch, launchEnergy } };
}
function firstDiscContact(m, offset, dt, airborne) {
  const f = poweredLaunch(m, 20, offset), a = f.discs[0], launch = f.metadata.launch;
  const speed = Math.hypot(launch.x, launch.y);
  const b = m.makeDisc(2, 1, 3 * launch.x / speed, 12 + 3 * launch.y / speed), discs = [a, b], s = shot();
  let first;
  for (let i = 0; i < 1 / dt && !first; i++) {
    m.step(discs, dt, s, airborne, e => {
      if (e.key === 'disc:1:2' && !first) first = { frameEndSeconds: (i + 1) * dt,
        preImpulseSpin: a.spin, retainedFraction: a.spin / launch.spin, preImpulseStates: snapshot(discs) };
    });
    for (const d of discs) assert.ok([d.x, d.y, d.vx, d.vy, d.z, d.vz, d.spin, d.angle].every(Number.isFinite));
  }
  assert.ok(first, 'launched disc reaches actual first disc contact');
  assert.equal(s.opponentContact, true);
  const postContactFrame = snapshot(discs);
  const rest = measureScene(m, `first-disc-contact-${offset}`, discs, {}, dt, airborne);
  return { offset, dt, airborne, launch, first, postContactFrame, totalSettleSeconds: first.frameEndSeconds + rest.settleSeconds, rest };
}
function measureScene(m, name, discs, metadata, dt, airborne) {
  const initial = snapshot(discs), s = shot(), events = {};
  let settleSeconds = 0, lastTranslationStop = 0, lastAxialRest = 0;
  let atLastTranslationStop = snapshot(discs), previousTranslation = translating(discs);
  let previousSpin = spinning(discs), maxAbsSpin = Math.max(...discs.map(d => Math.abs(d.spin)));
  for (let i = 0; i < 20 / dt && discs.some(m.moving); i++) {
    m.step(discs, dt, s, airborne, e => events[e.kind] = (events[e.kind] || 0) + 1);
    settleSeconds = (i + 1) * dt;
    const nextTranslation = translating(discs), nextSpin = spinning(discs);
    if (previousTranslation && !nextTranslation) {
      lastTranslationStop = settleSeconds; atLastTranslationStop = snapshot(discs);
    }
    if (previousSpin && !nextSpin) lastAxialRest = settleSeconds;
    previousTranslation = nextTranslation; previousSpin = nextSpin;
    maxAbsSpin = Math.max(maxAbsSpin, ...discs.map(d => Math.abs(d.spin)));
    for (const d of discs) assert.ok([d.x, d.y, d.vx, d.vy, d.z, d.vz, d.spin, d.angle].every(Number.isFinite));
  }
  assert.equal(discs.some(m.moving), false, `${name} settles within 20s`);
  assert.ok(discs.every(d => d.spin === 0));
  return { name, ...metadata, initial, settled: true, settleSeconds, lastTranslationStop,
    residualWaitSeconds: settleSeconds - lastTranslationStop,
    axialWaitAfterTranslationSeconds: Math.max(0, lastAxialRest - lastTranslationStop),
    maxAbsSpin, atLastTranslationStop, events, final: snapshot(discs) };
}
function measure(m, factor, dt = 1 / 120, airborne = true) {
  if (factor !== undefined) m.TUNE.spinFrictionRatio = factor;
  const rows = [];
  for (const speed of approachSpeeds) for (const offset of offsets) {
    const f = poweredLaunch(m, speed, offset);
    rows.push(measureScene(m, `launch-${speed}-${offset}`, f.discs, f.metadata, dt, airborne));
  }
  for (const spin of [0, 12, -12]) {
    const a = m.makeDisc(1, 0, -2, 7), b = m.makeDisc(2, 1, 0, 7.45); a.vx = 40; a.spin = spin;
    const discRow = measureScene(m, `disc-glance-${spin}`, [a, b], { initialSpin: spin }, dt, airborne);
    assert.ok(discRow.events.disc > 0); rows.push(discRow);
    const p = m.pegPositions()[0], d = m.makeDisc(1, 0, p.x + 0.8, p.y + 0.15); d.vx = -40; d.spin = spin;
    const pegRow = measureScene(m, `peg-glance-${spin}`, [d], { initialSpin: spin }, dt, airborne);
    assert.ok(pegRow.events.peg > 0); rows.push(pegRow);
  }
  assert.equal(rows.length, approachSpeeds.length * offsets.length + 6);
  const launches = rows.filter(r => r.approachSpeed !== undefined), waits = launches.map(r => r.residualWaitSeconds);
  return { verificationProfile: m.verificationProfile, model: factor === undefined ? 'preview7' : 'candidate', factor: factor ?? 1, dt, airborne,
    stationary: [-18, -12, -6, -3, 3, 6, 12, 18].map(spin => stationary(m, spin, dt)),
    diagnostic: { fixtureCount: rows.length, launchFixtureCount: launches.length,
      zeroWaitLaunches: waits.filter(w => w === 0).length,
      subQuarterSecondLaunches: waits.filter(w => w < 0.25).length,
      oneToTwoSecondLaunches: waits.filter(w => w >= 1 && w <= 2).length,
      aboveTwoSecondLaunches: waits.filter(w => w > 2).length,
      maxLaunchResidualWait: Math.max(...waits),
      frequencyWarning: 'Deterministic fixture-dependent diagnostics, NOT a player shot distribution or a 20% calibration.' }, rows };
}
function zeroSpinTrace(m, centered) {
  const d = centered ? poweredLaunch(m, 20, 0).discs[0] : m.makeDisc(1, 0, -4, 9);
  if (!centered) d.vx = 20;
  const trace = [], s = shot();
  for (let i = 0; i < 240; i++) { m.step([d], 1 / 240, s); trace.push(snapshot([d])); }
  return trace;
}

(async () => {
const { loadHelpers, checkSourceNeutrality, checkSignedHopIntegration } = await import('./physics-integrated-equivalence.mjs');
const provenance = checkSourceNeutrality('disc-appearance');
const loadGraph = profile => { const m = loadHelpers(profile); return { ...m.constants, ...m.physics, ...m.spin, ...m.hole, ...m.flick, verificationProfile: profile, hashes: m.hashes }; };
assert.ok(process.argv.slice(2).every(a => a === '--write'), 'Only --write is supported');
const baseline = loadGraph('pinned-baseline'), current = loadGraph('actual-integrated');
assert.equal(current.TUNE.spinFrictionRatio, selectedFactor, 'probe selection matches shipped tuning');
const protectedSourceFiles = git(['ls-tree', '-r', '--name-only', baselineCommit, 'src']).split('\n')
  // Cosmetic files are checked against the independently reviewed manifest above.
  .filter(file => !['src/sim/constants.ts', 'src/sim/spin.ts', 'src/sim/physics.ts', 'src/game/flick.ts', 'src/main.ts', 'src/style.css', 'src/render/scene.ts'].includes(file));
for (const file of protectedSourceFiles) assert.equal(sourceAt(null, file), sourceAt(baselineCommit, file), `${file} remains exactly preview7`);
const { spinFrictionRatio: _ratio, surfaceGravity: _gravity, ...otherTune } = current.TUNE;
assert.deepEqual(otherTune, baseline.TUNE, 'no other tune changes');
assert.deepEqual(current.BOARD, baseline.BOARD); assert.deepEqual(current.DISC, baseline.DISC); assert.deepEqual(current.PEGS, baseline.PEGS);
const sweep = [measure(baseline), ...[0.08, 0.1, 0.12, 0.15].map(f => measure(current, f)), measure(loadGraph('cleanup-restored-baseline'), 1)];
const replay = sweep.at(-1);
assert.deepEqual(replay.rows, sweep[0].rows, 'Explicit restored-baseline counterfactual exactly replays full-model fixtures; not actual candidate equality');
assert.deepEqual(replay.stationary, sweep[0].stationary, 'ratio 1 exactly replays the old damping helper');
current.TUNE.spinFrictionRatio = selectedFactor;
for (const center of [false, true]) assert.deepEqual(zeroSpinTrace(current, center), zeroSpinTrace(baseline, center));
for (const row of sweep.find(r => r.factor === selectedFactor).rows.filter(r => r.launch)) {
  assert.deepEqual(row.launch, sweep[0].rows.find(old => old.name === row.name).launch, 'all launch transfer is unchanged');
}
const sensitivityRuns = [];
for (const [dt, airborne] of [[1 / 240, true], [1 / 120, false], [1 / 240, false]]) {
  sensitivityRuns.push(measure(baseline, undefined, dt, airborne), measure(current, selectedFactor, dt, airborne));
}
const selectedRun = sweep.find(r => r.factor === selectedFactor);
const signedFirstContacts = [];
for (const dt of [1 / 120, 1 / 240]) for (const airborne of [false, true]) for (const offset of [-0.8, 0.8]) {
  const old = firstDiscContact(baseline, offset, dt, airborne), candidate = firstDiscContact(current, offset, dt, airborne);
  assert.deepEqual(candidate.launch, old.launch);
  assert.equal(Math.sign(candidate.first.preImpulseSpin), Math.sign(offset));
  assert.equal(candidate.first.frameEndSeconds, old.first.frameEndSeconds);
  assert.ok(candidate.first.retainedFraction > 0.95);
  assert.ok(Math.abs(candidate.first.preImpulseSpin) > Math.abs(old.first.preImpulseSpin) + 0.5);
  const maxReboundVelocityDifference = Math.max(...candidate.postContactFrame.map((d, i) =>
    Math.hypot(d.vx - old.postContactFrame[i].vx, d.vy - old.postContactFrame[i].vy)));
  assert.ok(maxReboundVelocityDifference > 0.001 && maxReboundVelocityDifference < 1);
  signedFirstContacts.push({ baseline: old, candidate, maxReboundVelocityDifference });
}
const zeroViscosityRuns = [], originalViscosity = current.TUNE.frictionViscous;
try {
  current.TUNE.frictionViscous = 0;
  for (const dt of [1 / 120, 1 / 240]) for (const airborne of [false, true]) for (const sign of [-1, 1]) {
    const stationaryDisc = current.makeDisc(1, 0, 0, 9); stationaryDisc.spin = sign * 18;
    const stationaryRow = measureScene(current, `zero-viscosity-stationary-${sign}`, [stationaryDisc], {}, dt, airborne);
    const f = poweredLaunch(current, 20, sign * 0.8);
    const free = measureScene(current, `zero-viscosity-launch-${sign}`, f.discs, f.metadata, dt, airborne);
    const contact = firstDiscContact(current, sign * 0.8, dt, airborne);
    const p = current.pegPositions()[0], peg = current.makeDisc(1, 0, p.x + 0.8, p.y + 0.15); peg.vx = -40; peg.spin = sign * 12;
    const glance = measureScene(current, `zero-viscosity-peg-${sign}`, [peg], {}, dt, airborne);
    assert.ok(glance.events.peg > 0);
    zeroViscosityRuns.push({ dt, airborne, sign, stationary: stationaryRow, free, contact, peg: glance });
  }
} finally { current.TUNE.frictionViscous = originalViscosity; }
assert.equal(current.TUNE.frictionViscous, originalViscosity);
let exactLaunchComparisonCount = 0;
for (const speed of approachSpeeds) for (const offset of [-0.99, -0.8, -0.15, 0, 0.15, 0.8, 0.99]) for (const divisions of [1, 2, 4, 8, 16, 32, 64, 100]) {
  assert.deepEqual(poweredLaunch(current, speed, offset, divisions).metadata.launch,
    poweredLaunch(baseline, speed, offset, divisions).metadata.launch);
  exactLaunchComparisonCount++;
}
const pruningPath = [{ x: -0.5, y: 12.8, t: 0 }, { x: -0.5, y: 12.8, t: 200 },
  ...Array.from({ length: 16 }, (_, i) => ({ x: -0.5, y: 12.8 - 1.6 * (i + 1) / 16, t: 200 + 5 * (i + 1) }))];
const pruned = register(current, pruningPath, { x: 0, y: 12 });
assert.equal(pruned.power[0].t, 200);
assert.deepEqual(pruned.launch, register(current, pruningPath.slice(1), { x: 0, y: 12 }).launch);
const end = pruningPath.at(-1);
assert.equal(register(current, [...pruningPath, { ...end, t: end.t + 200 }], { x: 0, y: 12 }).launch, null);
function compareRuns(a, b) {
  const cases = a.rows.map(row => {
    const other = b.rows.find(r => r.name === row.name);
    return { name: row.name, residualWaitDifference: other.residualWaitSeconds - row.residualWaitSeconds,
      maxFinalPositionDifference: Math.max(...row.final.map((d, i) => Math.hypot(d.x - other.final[i].x, d.y - other.final[i].y))),
      maxFinalAngleDifference: Math.max(...row.final.map((d, i) => Math.abs(d.angle - other.final[i].angle))),
      sameEvents: JSON.stringify(row.events) === JSON.stringify(other.events),
      sameFinalStates: row.final.every((d, i) => d.state === other.final[i].state) };
  });
  return { model: a.model, comparison: `${a.dt}/${a.airborne} -> ${b.dt}/${b.airborne}`, cases,
    maxResidualWaitDifference: Math.max(...cases.map(c => Math.abs(c.residualWaitDifference))),
    maxFinalPositionDifference: Math.max(...cases.map(c => c.maxFinalPositionDifference)) };
}
const timestepSensitivity = [compareRuns(sweep[0], sensitivityRuns[0]), compareRuns(selectedRun, sensitivityRuns[1])];
// Preserve the established simple-glance convergence bounds. Hole/multi-contact
// sequences are diagnostic: never label changed contacts as timestep-invariant.
const fineSelected = sensitivityRuns[1];
for (const row of selectedRun.rows.filter(r => r.name.startsWith('disc-glance') || r.name.startsWith('peg-glance'))) {
  const fine = fineSelected.rows.find(r => r.name === row.name);
  assert.ok(Math.abs(row.residualWaitSeconds - fine.residualWaitSeconds) < 0.05);
  row.final.forEach((d, i) => {
    assert.ok(Math.hypot(d.x - fine.final[i].x, d.y - fine.final[i].y) < 0.25);
    assert.ok(Math.abs(d.angle - fine.final[i].angle) < 0.15);
  });
}
const isolatedSpinRuns = [measure(loadGraph('isolated-spin-reference'), selectedFactor), measure(loadGraph('isolated-spin-reference'), selectedFactor, 1/240, true)];
const sliceCoupling = [compareRuns(isolatedSpinRuns[0], selectedRun), compareRuns(isolatedSpinRuns[1], fineSelected)];
function traceApprovedHopCoupling(dt) {
  const profiles = ['actual-integrated','isolated-spin-reference','unrefactored-spin-hop-reference'];
  const runs = Object.fromEntries(profiles.map(profile => { const m=loadGraph(profile); return [profile,{m,discs:poweredLaunch(m,150,.5).discs,s:shot()}]; }));
  let firstDivergence, finalFrame=0;
  for (let i=0;i<20/dt;i++) {
    const frame={};
    for(const [profile,r] of Object.entries(runs)) {
      const before=snapshot(r.discs), events=[];
      r.m.step(r.discs,dt,r.s,true,e=>events.push({...e, preContactStates:snapshot(r.discs)}));
      frame[profile]={before,events,after:snapshot(r.discs)};
    }
    assert.deepEqual(frame['actual-integrated'],frame['unrefactored-spin-hop-reference'], 'Complex coupling still exactly matches approved independent reference');
    if(!firstDivergence && JSON.stringify(frame['actual-integrated'].after)!==JSON.stringify(frame['isolated-spin-reference'].after)) {
      firstDivergence={frame:i+1,time:(i+1)*dt,runs:frame};
      const contact = frame['actual-integrated'].events.find(e=>e.kind==='peg' || e.kind==='disc');
      assert.ok(contact && contact.preContactStates.some(d=>d.vz<0), 'First drift must be an approved contactHop descending contact, not unexplained source drift');
    }
    finalFrame=i+1;
    if(Object.values(runs).every(r=>!r.discs.some(r.m.moving))) break;
  }
  assert.ok(firstDivergence);
  assert.ok(Object.values(runs).every(r=>!r.discs.some(r.m.moving)));
  return {fixture:'launch-150-0.5',dt,firstDivergence,framesComparedToIndependentReference:finalFrame,
    interpretation:'First divergence is the deliberately signed additive kick at a descending contact. Later position/angle/contact-sequence differences are downstream coupling, not neutral-cleanup drift. No new bounds or goldens are fitted.'};
}
const couplingTraces=[traceApprovedHopCoupling(1/120),traceApprovedHopCoupling(1/240)];
const evidence = {
  schemaVersion: 3, signedHopIntegration: checkSignedHopIntegration(), profile: 'actual-integrated', provenance, ratioOneReplayProfile: 'cleanup-restored-baseline', command: 'node scripts/probe-integrated-followup.cjs --write', nodeVersion: process.version,
  baselineTag, baselineCommit, headCommit: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']), unpublished: true,
  currentSourceHashes: current.hashes, baselineSourceHashes: baseline.hashes,
  protectedSourceHashes: Object.fromEntries(protectedSourceFiles.map(file => [file, sha256(sourceAt(null, file))])),
  selectedFactor, selection: {
    feedback: 'User reports extra waiting for residual disc spin ~1–2s, roughly one fifth of real-life shots, dependent on flick power.',
    method: 'Independent production module graphs pinned to exact preview7 SHA and explicit actual-integrated candidate with signed contactHop. Accumulate spatial contact history, prune 120ms release power, finalizeFlickContact, then releaseShot; run real step/contact scenes.',
    rationale: '0.12 retains stationary 12/18 rad/s for ~1.12/1.65s and ordinary strong powered board finishes for ~1.1–1.4s, while centered, weak, sunk and ditched shots do not all linger. 0.08/0.10 make strongest spins and complex contacts longer; 0.15 makes 12 rad/s settle before 1s.',
    limits: 'Gameplay resistance candidate, not a measured wood/wax friction coefficient or real-physics calibration. No shot-frequency quota. Retained spin changes tangential impulses and rebound outcomes despite unchanged collision coefficients. Contact-created spin can exceed the launch cap. Fine-step multi-peg/lip fixtures have >2s waits and changed contact sequences; retained, not hidden or clamped. See explicit timestep sensitivity alongside preview7. No browser or physical-device result is implied.',
  },
  measurement: { timestepSeconds: 1 / 120, maxRunSeconds: 20,
    timestepChoice: 'Primary sweep matches production main.ts fixed 1/120s. Sensitivity repeats preview7 and the candidate at 1/240s and with airborne disabled. Complex hole/contact trajectories are not asserted timestep-invariant.',
    residualWaitDefinition: 'all-rest time minus the last transition to no translating board discs; all rest uses the real moving() predicate, including axial, vertical and hole motion.',
    axialWaitDefinition: 'last transition to zero axial spin minus last translation stop, floored at zero; separates actual residual axial spin from rocking/hop rest.',
    quantization: 'Stop times sampled at frame end; resolution dt, adaptive production substeps remain enabled.',
    fixtures: '40 inward powered launch fixtures at y=12, five approach speeds and eight contact offsets, sampled with 16 subdivisions, plus six isolated disc/peg glances with initial spin 0,+12,-12. Positive offsets use a finger path at x=-offset*DISC.radius. Signed first-contact fixtures place a stationary target 3 inches along the real launch vector. Contact event captures face-damped spin before disc impulses; postContactFrame is frame end, not a new collision solver.' },
  verified: { exactRestoredBaselineCounterfactualReplay: true, identicalLaunches: true, exactZeroSpinSlideAndCenteredLaunch: true,
    unchangedProtectedSourceFiles: protectedSourceFiles, unchangedOtherTuneAndGeometry: true,
    stationarySignedDissipationNoInventedEnergy: true, allFixturesFiniteAndSettled: true,
    exactLaunchComparisonCount, productionAccumulationPruningAndFinalization: true,
    signedLaunchToFirstContactRetainedSpinAndChangedRebounds: true, fullStepZeroViscosity: true,
    simpleGlanceTimestepBoundsUnchanged: { maxPositionDifference: 0.25, maxAngleDifference: 0.15, maxResidualWaitDifference: 0.05 } },
  sweep, sensitivityRuns, timestepSensitivity, signedFirstContacts, zeroViscosityRuns, sliceCoupling, couplingTraces,
};
const text = JSON.stringify(evidence, null, 2) + '\n';
if (process.argv.includes('--write')) {
  const output = path.join(root, 'docs/physics/integrated-followup-evidence.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, text);
  console.log(JSON.stringify({ output, selectedFactor, sweep: sweep.map(r => ({ factor: r.factor,
    stationary: r.stationary.filter(s => s.initialSpin > 0), diagnostic: r.diagnostic })),
    sensitivityRuns: sensitivityRuns.map(r => ({ model: r.model, dt: r.dt, airborne: r.airborne, diagnostic: r.diagnostic })),
    timestepSensitivity: timestepSensitivity.map(({ cases: _cases, ...summary }) => summary) }, null, 2));
} else process.stdout.write(text);

})().catch(error => { console.error(error); process.exitCode = 1; });
