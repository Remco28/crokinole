// Exact comparisons of real working-tree helpers with the preview7 Git baseline.
// No browser, copied formula oracle, generated baseline files, or source edits.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const BASELINE = '8c719b46e195b3ba80bea6268bc2aa2562b7a744';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = { constants: 'src/sim/constants.ts', flick: 'src/game/flick.ts',
  physics: 'src/sim/physics.ts', spin: 'src/sim/spin.ts', hole: 'src/sim/hole.ts' };
function source(path, ref) {
  return ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' })
    : readFileSync(resolve(root, path), 'utf8');
}
export function loadHelpers(profile) {
  assert.ok(PROFILES.includes(profile), `Explicit profile required: ${profile}`);
  const cache = new Map(), sources = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    assert.ok(path.startsWith('src/') && path.endsWith('.ts'), `Unexpected module: ${path}`);
    const text = profileSource(path, profile), module = { exports: {} };
    sources.set(path, text); cache.set(path, module);
    const code = ts.transpileModule(text, { compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    }, reportDiagnostics: true });
    assert.equal(code.diagnostics?.length ?? 0, 0, `Transpile diagnostics: ${path}`);
    const localRequire = specifier => {
      assert.ok(specifier.startsWith('.'), `Unexpected external dependency: ${specifier}`);
      return load(relative(root, resolve(root, dirname(path), `${specifier}.ts`)));
    };
    new Function('require', 'module', 'exports', code.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  const helpers = Object.fromEntries(Object.entries(entries).map(([key, path]) => [key, load(path)]));
  const hash = createHash('sha256');
  for (const [path, text] of [...sources].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${path}\0${text}\0`);
  return { ...helpers, profile, hashes: Object.fromEntries([...sources].map(([p,t]) => [p, sha(t)])), sourceSha256: hash.digest('hex') };
}
const sha = text => createHash('sha256').update(text).digest('hex');
const manifestText = readFileSync(resolve(root, 'docs/physics/integrated-approved-slices.json'), 'utf8');
assert.equal(sha(manifestText), 'f1e9b31d07ff6a2c7466b6c16d9659163a12c4010bd8979b46c1765ca83cd479', 'Approved slice manifest must not drift');
const manifest = JSON.parse(manifestText);
export const PROFILES = ['actual-integrated', 'pinned-baseline', 'cleanup-restored-baseline', 'unrefactored-spin-hop-reference', 'isolated-spin-reference', 'isolated-hop-reference'];
function apply(text, edits, neutral = false) {
  for (const edit of edits) {
    let a = edit.from, b = edit.to;
    if (neutral) { a = a.replace('TUNE.frictionMu * 386', 'TUNE.frictionMu * TUNE.surfaceGravity'); b = b.replace('TUNE.frictionMu * 386', 'TUNE.frictionMu * TUNE.surfaceGravity'); }
    assert.equal(text.split(a).length - 1, 1, `Unique approved anchor: ${a}`);
    text = text.replace(a, b);
  }
  return text;
}
function approved(path, names) {
  let text = source(path, BASELINE);
  if (names.length === 1 && manifest.slices[names[0]][path]) {
    for (const e of [...manifest.slices[names[0]][path].patches].reverse()) {
      assert.equal(text.slice(e.offset, e.offset + e.from.length), e.from);
      text = text.slice(0,e.offset) + e.to + text.slice(e.offset + e.from.length);
    }
    return text;
  }
  for (const name of names) {
    const entry = manifest.slices[name][path];
    if (entry) text = apply(text, entry.patches, name === 'spin' && names.includes('cleanup'));
  }
  return text;
}
export function profileSource(path, profile) {
  assert.ok(PROFILES.includes(profile), `Unknown profile: ${profile}`);
  if (profile === 'actual-integrated') return source(path, null);
  if (profile === 'pinned-baseline') return source(path, BASELINE);
  if (profile === 'cleanup-restored-baseline') {
    // Restore real pinned baseline spin/hop helper, preserving the neutral gravity
    // substitution. Never emulate the old contactHop with a copied equation.
    if (path === 'src/sim/spin.ts') return approved(path, ['cleanup']);
    let text = source(path, null);
    if (path === 'src/sim/constants.ts') {
      const edits = manifest.slices.spin[path].patches;
      for (const e of edits) { assert.equal(text.split(e.to).length - 1, 1); text = text.replace(e.to, e.from); }
    }
    return text;
  }
  return approved(path, profile === 'isolated-spin-reference' ? ['spin'] : profile === 'isolated-hop-reference' ? ['hop'] : ['spin', 'hop']);
}
export function checkSourceNeutrality(policy = 'integrated-physics') {
  assert.ok(['integrated-physics', 'disc-appearance'].includes(policy), `Explicit source policy required: ${policy}`);
  let cosmetic = null;
  if (policy === 'disc-appearance') {
    const text = readFileSync(resolve(root, 'docs/disc-design-approved.json'), 'utf8');
    assert.equal(sha(text), '6dfb35037834132950ff397ec9849b89572f47366e9cd197d190fcc9463c6723', 'Reviewed cosmetic manifest must not drift');
    cosmetic = JSON.parse(text);
    assert.equal(cosmetic.accepted_physics_release, '425b35eb3a73663e55c1210deda8e0d821c0f827');
    assert.deepStrictEqual(Object.keys(cosmetic.cosmeticSourceHashes).sort(), [
      'src/disc-appearance.ts', 'src/disc-settings.ts', 'src/game/flick.ts', 'src/main.ts', 'src/render/disc-design.ts', 'src/render/orbit.ts',
      'src/render/scene.ts', 'src/storage/disc-images.ts', 'src/style.css',
    ]);
    for (const [path, expected] of Object.entries(cosmetic.cosmeticSourceHashes))
      assert.equal(sha(source(path, null)), expected, `Unapproved cosmetic source: ${path}`);
  }
  for (const [name, files] of Object.entries(manifest.slices)) for (const [path, e] of Object.entries(files)) {
    assert.equal(sha(source(path, BASELINE)), e.baselineSha256, `${name} pinned input ${path}`);
    assert.equal(sha(approved(path, [name])), e.approvedSha256, `${name} approved isolated output ${path}`);
  }
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', BASELINE, 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const path of files) {
    if (cosmetic && Object.hasOwn(cosmetic.cosmeticSourceHashes, path)) continue;
    assert.equal(source(path, null), approved(path, ['cleanup', 'spin', 'hop']), `Unapproved candidate source: ${path}`);
  }
  return { exactSourceFiles: files.length, sourcePolicy: policy, cosmeticSourceFiles: cosmetic ? Object.keys(cosmetic.cosmeticSourceHashes).length : 0, approvedManifestSha256: sha(manifestText),
    currentSourceHashes: Object.fromEntries(files.map(p => [p, sha(source(p,null))])),
    baselineSourceHashes: Object.fromEntries(files.map(p => [p, sha(source(p,BASELINE))])) };
}
function subdivide(path, divisions) {
  return [path[0], ...path.slice(1).flatMap((b, i) => {
    const a = path[i];
    return Array.from({ length: divisions }, (_, j) => {
      const f = (j + 1) / divisions;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
    });
  })];
}
function register(api, path, target) {
  let contact = null, history = [], power = [];
  const updates = [];
  for (const sample of path) {
    history = api.appendFlickContactSample(history, sample);
    contact = api.updateFlickContact(contact, history, target);
    power = [...power, sample].filter(s => sample.t - s.t <= 120);
    updates.push(structuredClone({ history, contact, power }));
  }
  const registered = contact;
  contact = api.finalizeFlickContact(contact, history, target);
  return { updates, registered, contact, velocity: api.releaseVelocity(power, target),
    shot: contact ? api.releaseShot(power, target, contact) : null };
}
export function compareLaunches(current, baseline) {
  let comparisons = 0;
  const offsets = [-1.01, -1, -0.999999, -0.99, -0.9, -0.7, -0.5, -0.4, -0.2,
    -0.100000001, -0.1, -0.099999999, -0, 0, 0.099999999, 0.1, 0.100000001,
    0.2, 0.4, 0.5, 0.7, 0.9, 0.99, 0.999999, 1, 1.01];
  for (const offset of offsets) for (const speed of [0, 7.999, 8, 10, 30, 100, 250])
    for (const degrees of [-80, -60, -30, -16, -8, 0, 8, 16, 30, 43.8079, 60, 80])
      for (const quadrant of [0, 1, 2, 3]) {
        const a = degrees * Math.PI / 180, q = quadrant * Math.PI / 2;
        const rotate = p => ({ x: p.x * Math.cos(q) - p.y * Math.sin(q), y: p.x * Math.sin(q) + p.y * Math.cos(q) });
        const disc = rotate({ x: 0, y: 12 });
        const samples = [{ x: 0, y: 12, t: 0 }, { x: speed * 0.08 * Math.sin(a), y: 12 - speed * 0.08 * Math.cos(a), t: 80 }]
          .map(p => ({ ...rotate(p), t: p.t }));
        const direction = rotate({ x: Math.sin(a), y: -Math.cos(a) });
        for (const contact of [offset, { offset, direction, powered: true },
          { offset, direction: rotate({ x: 0, y: -1 }), finishDirection: direction, powered: true },
          { offset, direction, powered: false }]) {
          assert.deepStrictEqual(current.flick.releaseShot(samples, disc, contact), baseline.flick.releaseShot(samples, disc, contact),
            `launch offset=${offset} speed=${speed} degrees=${degrees} quadrant=${quadrant}`);
          comparisons++;
        }
      }
  return comparisons;
}
export function compareGestures(current, baseline) {
  let comparisons = 0, poweredFinishes = 0, rejected = 0;
  const paths = [];
  for (const degrees of [-60, -30, 30, 60]) for (const slow of [false, true]) {
    const a = degrees * Math.PI / 180, start = { x: -0.0625, y: 12.5, t: 0 };
    const kink = slow ? { x: -0.1875, y: 12.28349364905389, t: 50 } : { ...start, y: start.y - 0.3125, t: 10 };
    const end = { x: kink.x + 5 * Math.sin(a), y: kink.y - 5 * Math.cos(a), t: kink.t + 50 };
    for (const tail of [[], [{ ...end, t: end.t + 10 }], [{ x: end.x - 0.005, y: end.y, t: end.t + 1 }],
      [{ x: end.x + 0.001, y: end.y - 0.001, t: end.t + 5 }], [{ ...end, t: end.t + 200 }],
      [{ x: end.x + 0.125, y: end.y, t: end.t + 30 }]]) paths.push([start, kink, end, ...tail]);
  }
  paths.push(
    [{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 11.3, t: 500 }, { x: 0, y: 9, t: 550 }],
    [{ x: 0.7, y: 14, t: 0 }, { x: 0.7, y: 10, t: 40 }],
    [{ x: 0, y: 12.6, t: 0 }, { x: 0.02, y: 12.59, t: 1 }],
    [{ x: 0, y: 11.38, t: 0 }, { x: 0, y: 11.1, t: 10 }, { x: 0, y: 10.5, t: 20 }],
  );
  for (const offset of [-0.99, -0.9, -0.5, 0, 0.5, 0.9, 0.99]) for (const travel of [0.3, 1.25, 5]) {
    const start = { x: offset * 0.625, y: 12 + travel / 2, t: 0 };
    paths.push([start, { ...start, y: start.y - travel, t: travel / 30 * 1000 }]);
  }
  for (const path of paths) for (const divisions of [1, 4, 16, 64]) {
    const samples = subdivide(path, divisions), disc = { x: 0, y: 12 };
    const actual = register(current.flick, samples, disc);
    assert.deepStrictEqual(actual, register(baseline.flick, samples, disc), `gesture=${comparisons} divisions=${divisions}`);
    if (actual.contact?.finishDirection && actual.contact.powered) poweredFinishes++;
    if (!actual.shot) rejected++;
    comparisons++;
  }
  assert.ok(poweredFinishes > 0 && rejected > 0, 'Exercise finish intent and rejection, not only straight launches');
  return { comparisons, poweredFinishes, rejected };
}
function fixtures(api) {
  const make = (x, y, fields = {}, id = 1) => Object.assign(api.physics.makeDisc(id, id - 1, x, y), fields);
  const hole = fields => ({ ...api.hole.makeHoleMotion(), ...fields });
  const p = api.constants.pegPositions()[0];
  return [
    { name: 'slide-spin', discs: [make(-4, 9, { vx: 40, spin: 12 })] },
    { name: 'stationary-spin', discs: [make(0, 9, { spin: -18 })] },
    { name: 'flight-land', discs: [make(0, 9, { vx: 10, spin: -12, z: 0.02, vz: 4 })], event: 'land' },
    { name: 'peg-centered', discs: [make(p.x + 0.8, p.y, { vx: -40 })], event: 'peg' },
    { name: 'peg-spin', discs: [make(p.x + 0.8, p.y + 0.15, { vx: -40, spin: 12 })], event: 'peg' },
    { name: 'peg-tilt', discs: [make(p.x + 0.7, p.y, { vx: -40, spin: -18, hole: hole({ tilt: 1.2, lean: 0 }) })], event: 'peg' },
    { name: 'disc-centered', discs: [make(-2, 7, { vx: 40 }), make(0, 7, {}, 2)], event: 'disc' },
    { name: 'disc-spin-glance', discs: [make(-2, 7, { vx: 40, spin: 12 }), make(0, 7.45, { spin: -8 }, 2)], event: 'disc' },
    { name: 'occupied-pocket', discs: [make(0, 0, { state: 'sunk' }), make(0.9, 0, { vx: -20, spin: 12 }, 2)], event: 'disc' },
    { name: 'lip-spin', discs: [make(0.67, 0.1, { vx: 80, spin: 12, hole: hole({ engaged: true, dip: 0.02 }) })], event: 'lip' },
    { name: 'sink-spin', discs: [make(0, 0, { spin: 40 })], event: 'sink' },
    { name: 'ditch-spin', discs: [make(12.99, 0, { vx: 40, spin: 12 })], event: 'ditch' },
  ];
}
export function compareSimulations(current, baseline) {
  let comparisons = 0, frames = 0;
  const eventKinds = new Set();
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) for (const airborne of [false, true]) {
    const actual = fixtures(current), expected = fixtures(baseline);
    for (let f = 0; f < actual.length; f++) {
      const a = actual[f], b = expected[f];
      const shot = () => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
      const sa = shot(), sb = shot(), ea = [], eb = [];
      for (let frame = 0; frame < 600; frame++) {
        current.physics.step(a.discs, dt, sa, airborne, e => ea.push(e));
        baseline.physics.step(b.discs, dt, sb, airborne, e => eb.push(e));
        assert.deepStrictEqual(a.discs, b.discs, `${a.name} dt=${dt} airborne=${airborne} frame=${frame}`);
        assert.deepStrictEqual(ea, eb, `${a.name} events frame=${frame}`);
        assert.deepStrictEqual([sa.touched, sa.opponentContact], [sb.touched, sb.opponentContact]);
        assert.deepStrictEqual(a.discs.map(current.physics.moving), b.discs.map(baseline.physics.moving));
        frames++;
        if (!a.discs.some(current.physics.moving)) break;
      }
      if (a.event) assert.ok(ea.some(e => e.kind === a.event), `${a.name} must exercise ${a.event}`);
      for (const e of ea) eventKinds.add(e.kind);
      comparisons++;
    }
  }
  return { comparisons, frames, eventKinds: [...eventKinds].sort() };
}
export function compareAcceptedIntent(current, baseline) {
  const paths = [
    {name:'onset30', degrees:30, samples:[{x:-.0625,y:12.5,t:0},{x:-.0625,y:12.1875,t:10},{x:2.4375,y:7.857372981077807,t:60}]},
    {name:'hook45', degrees:45, samples:[{x:0,y:14,t:0},{x:0,y:10,t:100},{x:1,y:9,t:120}]},
  ];
  let comparisons=0, launches=0;
  for(const f of paths) for(const mirror of [-1,1]) for(const divisions of [1,16,64]) for(const lift of [17,50,100]) {
    const samples=subdivide(f.samples.map(p=>({...p,x:p.x*mirror})),divisions), last=samples.at(-1);
    samples.push({...last,t:last.t+lift});
    const a=register(current.flick,samples,{x:0,y:12}), b=register(baseline.flick,samples,{x:0,y:12});
    assert.deepStrictEqual(a,b, `${f.name} mirror=${mirror} divisions=${divisions} lift=${lift}`);
    if(a.shot) { assert.ok(Math.abs(Math.atan2(a.shot.x,-a.shot.y)*180/Math.PI-f.degrees*mirror)<1e-8); launches++; }
    comparisons++;
  }
  assert.ok(launches>0);
  return {comparisons,launches,finalized:true,fixtures:paths.map(p=>p.name),mirrors:true,liftMilliseconds:[17,50,100]};
}
export function checkSignedHopIntegration() {
  const rows = [], models = Object.fromEntries(['actual-integrated', 'pinned-baseline', 'isolated-spin-reference', 'isolated-hop-reference', 'unrefactored-spin-hop-reference'].map(p => [p, loadHelpers(p)]));
  for (const dt of [1/120, 1/240]) for (const peg of [false,true]) for (const vz of [-10,-1,0,10]) for (const spin of [-12,12]) {
    const runs = {};
    for (const [profile,m] of Object.entries(models)) {
      const p = peg ? m.constants.pegPositions()[0] : {x:0,y:7};
      const a = Object.assign(m.physics.makeDisc(1,0,p.x + (peg ? .8 : 1.24),p.y), {vx:-20,vz,z:.3,spin});
      const b = Object.assign(m.physics.makeDisc(2,1,p.x,p.y), {vz,z:.3});
      const discs = peg ? [a] : [a,b], s = {touched:new Set([1]),opponentContact:false,side:0,sideOf:n=>n}, events=[];
      m.physics.step(discs,dt,s,true,e=>events.push({...e, incomingVz:discs.map(d=>d.vz)}));
      assert.ok(events.some(e=>e.kind === (peg ? 'peg' : 'disc')));
      const firstFrame = structuredClone(discs);
      if (profile==='actual-integrated' && vz===-10) assert.ok(discs.every(d=>d.vz<0), 'Strong descent must not freely reverse at normal timestep');
      let frames=1;
      while(discs.some(m.physics.moving) && frames < 20/dt) {
        m.physics.step(discs,dt,s,true); frames++;
        assert.ok(discs.every(d=>[d.x,d.y,d.vx,d.vy,d.z,d.vz,d.spin,d.angle].every(Number.isFinite)));
      }
      assert.equal(discs.some(m.physics.moving),false, `${profile} signed hop finite settlement`);
      runs[profile]={firstFrame, events, final:structuredClone(discs), settleSeconds:frames*dt, touched:[...s.touched],opponentContact:s.opponentContact};
    }
    assert.deepStrictEqual(runs['actual-integrated'],runs['unrefactored-spin-hop-reference']);
    // Explicit change records, never assert current collisions equal old collisions.
    rows.push({dt,peg,vz,spin,runs,actualMatchesIndependentReference:true,
      changedFromBaseline:JSON.stringify(runs['actual-integrated'])!==JSON.stringify(runs['pinned-baseline']),
      hopContributionFirstFrameVz:runs['actual-integrated'].firstFrame.map((d,i)=>d.vz-runs['isolated-spin-reference'].firstFrame[i].vz)});
  }
  assert.equal(rows.length,32);
  return {cases:rows.length,productionAndFineTimestep:true,allFiniteAndSettled:true,rows};
}
export function runEquivalence() {
  const gates = checkSourceNeutrality('disc-appearance'), current = loadHelpers('actual-integrated'), baseline = loadHelpers('pinned-baseline');
  const counterfactual = loadHelpers('cleanup-restored-baseline'), reference = loadHelpers('unrefactored-spin-hop-reference');
  return { baseline: BASELINE, head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    branch: execFileSync('git', ['branch', '--show-current'], {cwd: root, encoding: 'utf8'}).trim(), unpublished: true, gates,
    profiles: Object.fromEntries([current, baseline, counterfactual, reference].map(m => [m.profile, m.sourceSha256])),
    acceptedIntent: compareAcceptedIntent(current,baseline),
    signedHopIntegration: checkSignedHopIntegration(),
    launchComparisons: compareLaunches(current, baseline), gestures: compareGestures(current, baseline),
    cleanupCounterfactual: compareSimulations(counterfactual, baseline),
    actualCandidateVersusIndependentUnrefactoredReference: compareSimulations(current, reference),
    warning: 'Counterfactual baseline compatibility is NOT actual candidate collision equality. Reference comes from pinned baseline plus independently SHA-gated approved spin/hop patches, without neutral refactors.' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runEquivalence(), null, 2));
