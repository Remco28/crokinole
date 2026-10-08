#!/usr/bin/env node
// Run: node scripts/probe-spin-persistence.cjs [--write]
// --write replaces docs/physics/spin-persistence-evidence.json. No app hooks,
// invented shot delay, randomness, or copied damping/contact equations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const baselineTag = 'crokinole-v0.3.0-strike-preview.6';
const selectedFactor = 0.12;
const approachSpeeds = [8, 20, 40, 80, 150];
const offsets = [0, 0.15, 0.28, 0.5, 0.7, 0.8, 0.9, 0.99];
const sha256 = source => createHash('sha256').update(source).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
const sourceAt = (ref, file) => ref
  ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');

// Separate module graphs prevent current constants leaking into the baseline.
// Transpile the real helpers in memory; never reimplement their equations.
function loadGraph(ref) {
  const cache = new Map(), hashes = {};
  function load(relative) {
    const file = path.join(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const source = sourceAt(ref, relative); hashes[relative] = sha256(source);
    const m = new Module(file); cache.set(file, m);
    m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    m.require = request => request.startsWith('.')
      ? load(path.relative(root, path.resolve(path.dirname(file), request)) + '.ts')
      : require(request);
    m._compile(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
    return m.exports;
  }
  return { ...load('src/sim/constants.ts'), ...load('src/sim/physics.ts'),
    ...load('src/sim/spin.ts'), ...load('src/sim/hole.ts'), ...load('src/game/flick.ts'), hashes };
}
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
function poweredLaunch(m, approachSpeed, offset) {
  const x = -offset * m.DISC.radius, distance = Math.min(4, approachSpeed * 0.08);
  const samples = [{ x, y: 12 + distance / 2, t: 0 },
    { x, y: 12 - distance / 2, t: distance / approachSpeed * 1000 }];
  const disc = { x: 0, y: 12 }, contact = m.updateFlickContact(null, samples, disc);
  assert.equal(contact?.powered, true, 'real input helper registers powered fixture');
  const launch = m.releaseShot(samples, disc, contact), velocity = m.releaseVelocity(samples, disc);
  assert.ok(launch && velocity);
  const launchEnergy = (launch.x ** 2 + launch.y ** 2 + m.DISC_SPIN_INERTIA * launch.spin ** 2) / 2;
  assert.ok(launchEnergy <= (velocity.x ** 2 + velocity.y ** 2) / 2 + 1e-8);
  const d = m.makeDisc(1, 0, 0, 12);
  Object.assign(d, { vx: launch.x, vy: launch.y, spin: launch.spin });
  return { discs: [d], metadata: { approachSpeed, offset, samples, contact, launch, launchEnergy } };
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
  return { model: factor === undefined ? 'preview6' : 'current', factor: factor ?? 1, dt, airborne,
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

assert.ok(process.argv.slice(2).every(a => a === '--write'), 'Only --write is supported');
const baseline = loadGraph(baselineTag), current = loadGraph();
assert.equal(current.TUNE.spinFrictionRatio, selectedFactor, 'probe selection matches shipped tuning');
const protectedSourceFiles = ['src/game/flick.ts', 'src/game/rules.ts', 'src/sim/physics.ts', 'src/sim/hole.ts'];
for (const file of protectedSourceFiles) assert.equal(sourceAt(null, file), sourceAt(baselineTag, file), `${file} remains exactly preview6`);
const { spinFrictionRatio: _ratio, ...otherTune } = current.TUNE;
assert.deepEqual(otherTune, baseline.TUNE, 'no other tune changes');
assert.deepEqual(current.BOARD, baseline.BOARD); assert.deepEqual(current.DISC, baseline.DISC); assert.deepEqual(current.PEGS, baseline.PEGS);
const sweep = [measure(baseline), ...[0.08, 0.1, 0.12, 0.15, 1].map(f => measure(current, f))];
const replay = sweep.at(-1);
assert.deepEqual(replay.rows, sweep[0].rows, 'ratio 1 exactly replays the old full-model fixtures');
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
const evidence = {
  schemaVersion: 1, command: 'node scripts/probe-spin-persistence.cjs --write', nodeVersion: process.version,
  baselineTag, baselineCommit: git(['rev-parse', `${baselineTag}^{commit}`]),
  currentSourceHashes: current.hashes, baselineSourceHashes: baseline.hashes,
  selectedFactor, selection: {
    feedback: 'User reports extra waiting for residual disc spin ~1–2s, roughly one fifth of real-life shots, dependent on flick power.',
    method: 'Sweep actual preview6 helper in scratch by scaling only rotational Coulomb torque; confirm with actual current helper, real powered releaseShot and full step/contact scenes.',
    rationale: '0.12 retains stationary 12/18 rad/s for ~1.12/1.65s and ordinary strong powered board finishes for ~1.1–1.4s, while centered, weak, sunk and ditched shots do not all linger. 0.08/0.10 make strongest spins and complex contacts longer; 0.15 makes 12 rad/s settle before 1s.',
    limits: 'Gameplay resistance baseline, not a measured wood/wax friction coefficient. No attempt to make exactly 20% of shots wait. Contact-created spin can exceed the launch cap. Fine-step multi-peg/lip fixtures have >2s waits and changed contact sequences; retained, not hidden or clamped. See explicit timestep sensitivity alongside preview6.',
  },
  measurement: { timestepSeconds: 1 / 120, maxRunSeconds: 20,
    timestepChoice: 'Primary sweep matches production main.ts fixed 1/120s. Sensitivity repeats preview6 and the candidate at 1/240s and with airborne disabled. Complex hole/contact trajectories are not asserted timestep-invariant.',
    residualWaitDefinition: 'all-rest time minus the last transition to no translating board discs; all rest uses the real moving() predicate, including axial, vertical and hole motion.',
    axialWaitDefinition: 'last transition to zero axial spin minus last translation stop, floored at zero; separates actual residual axial spin from rocking/hop rest.',
    quantization: 'Stop times sampled at frame end; resolution dt, adaptive production substeps remain enabled.',
    fixtures: '40 inward powered launch fixtures at y=12, five approach speeds and eight contact offsets, plus six isolated disc/peg glances with initial spin 0,+12,-12. Positive offsets use a finger path at x=-offset*DISC.radius.' },
  verified: { exactRatioOneReplay: true, identicalLaunches: true, exactZeroSpinSlideAndCenteredLaunch: true,
    unchangedProtectedSourceFiles: protectedSourceFiles, unchangedOtherTuneAndGeometry: true,
    stationarySignedDissipationNoInventedEnergy: true, allFixturesFiniteAndSettled: true,
    simpleGlanceTimestepBoundsUnchanged: { maxPositionDifference: 0.25, maxAngleDifference: 0.15, maxResidualWaitDifference: 0.05 } },
  sweep, sensitivityRuns, timestepSensitivity,
};
const text = JSON.stringify(evidence, null, 2) + '\n';
if (process.argv.includes('--write')) {
  const output = path.join(root, 'docs/physics/spin-persistence-evidence.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, text);
  console.log(JSON.stringify({ output, selectedFactor, sweep: sweep.map(r => ({ factor: r.factor,
    stationary: r.stationary.filter(s => s.initialSpin > 0), diagnostic: r.diagnostic })),
    sensitivityRuns: sensitivityRuns.map(r => ({ model: r.model, dt: r.dt, airborne: r.airborne, diagnostic: r.diagnostic })),
    timestepSensitivity: timestepSensitivity.map(({ cases: _cases, ...summary }) => summary) }, null, 2));
} else process.stdout.write(text);
