const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), ts = require(root + '/node_modules/typescript');
const baselineTag = 'crokinole-v0.3.0-strike-preview.5';
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
function load(source) {
  const file = root + '/src/game/flick.ts', m = new Module(file);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
const old = load(execFileSync('git', ['show', baselineTag + ':src/game/flick.ts'], { cwd: root, encoding: 'utf8' }));
const current = load(fs.readFileSync(root + '/src/game/flick.ts', 'utf8'));
const radius = require(root + '/src/sim/constants.ts').DISC.radius;
const magnitude = s => Math.hypot(s.x, s.y);
const energy = s => s.x ** 2 + s.y ** 2 + radius ** 2 / 2 * s.spin ** 2;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
let count = 0, exactProtected = 0;
for (const speed of [8, 10, 20, 40, 80, 150, 250]) for (const angle of [-1, -0.4, 0, 0.4, Math.PI / 2, Math.PI]) {
  const c = Math.cos(angle), s = Math.sin(angle), rotate = p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const distance = Math.min(4, speed * 0.08), disc = rotate({ x: 0, y: 12 });
  const samples = [{ ...rotate({ x: 0, y: 12 + distance / 2 }), t: 0 }, { ...rotate({ x: 0, y: 12 - distance / 2 }), t: distance / speed * 1000 }];
  for (let i = -100; i <= 100; i++) {
    const offset = i / 100, a = old.releaseShot(samples, disc, offset), b = current.releaseShot(samples, disc, offset);
    assert.ok(a && b); count++;
    assert.ok([b.x, b.y, b.spin].every(Number.isFinite));
    assert.ok(energy(b) <= magnitude(current.releaseVelocity(samples, disc)) ** 2 + 1e-8);
    assert.ok(magnitude(b) <= magnitude(a) + 1e-8); assert.ok(Math.abs(b.spin) <= 18);
    if (Math.abs(offset) <= 0.7) { assert.deepEqual(b, a); exactProtected++; }
    const mirror = current.releaseShot(samples, disc, -offset);
    near(b.x * c + b.y * s, -(mirror.x * c + mirror.y * s));
    near(-b.x * s + b.y * c, -mirror.x * s + mirror.y * c);
    near(b.spin, -mirror.spin);
  }
}
const rows = [];
for (const speed of [10, 30, 100, 250]) {
  const distance = Math.min(4, speed * 0.08), samples = [{ x: 0, y: 12 + distance / 2, t: 0 }, { x: 0, y: 12 - distance / 2, t: distance / speed * 1000 }];
  let lastHeading = -1, lastSpeed = Infinity;
  for (let i = 700; i <= 1000; i++) {
    const shot = current.releaseShot(samples, { x: 0, y: 12 }, i / 1000), heading = Math.atan2(shot.x, -shot.y) * 180 / Math.PI;
    assert.ok(heading >= lastHeading - 1e-9); assert.ok(magnitude(shot) <= lastSpeed + 1e-9);
    lastHeading = heading; lastSpeed = magnitude(shot);
  }
  for (const offset of [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1]) {
    const a = old.releaseShot(samples, { x: 0, y: 12 }, offset), b = current.releaseShot(samples, { x: 0, y: 12 }, offset);
    rows.push({ approachSpeed: speed, offset, oldHeading: Math.atan2(a.x, -a.y) * 180 / Math.PI, heading: Math.atan2(b.x, -b.y) * 180 / Math.PI, oldSpeed: magnitude(a), speed: magnitude(b), oldSpin: a.spin, spin: b.spin });
  }
}
console.log(JSON.stringify({ baselineTag, count, exactProtected, monotonicSweepCases: 4 * 301, rows }, null, 2));
