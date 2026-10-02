import { describe, expect, it } from 'vitest';
import { appendFlickContactSample, finalizeFlickContact, releaseShot, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';
import { DISC, TUNE, pegPositions } from '../src/sim/constants';
import { makeDisc, moving, step, type Disc, type Shot } from '../src/sim/physics';
import { DISC_SPIN_INERTIA, integrateSpin } from '../src/sim/spin';

const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
const tune = TUNE as { spinFrictionRatio: number };
function withRatio<T>(ratio: number, run: () => T): T {
  const original = tune.spinFrictionRatio;
  try { tune.spinFrictionRatio = ratio; return run(); }
  finally { tune.spinFrictionRatio = original; }
}
// Mirrors sampleFlick/pointerup: spatial history and 120ms power trail are
// separate; finalization is mandatory before release, not a legacy shortcut.
function register(samples: FlickSample[]) {
  const target = { x: 0, y: 12 };
  let history: FlickSample[] = [], power: FlickSample[] = [], contact: FlickContact | null = null;
  for (const sample of samples) {
    history = appendFlickContactSample(history, sample);
    contact = updateFlickContact(contact, history, target);
    power = [...power, sample].filter(s => sample.t - s.t <= 120);
  }
  contact = finalizeFlickContact(contact, history, target);
  return { history, power, contact, launch: contact ? releaseShot(power, target, contact) : null };
}
function poweredLaunch(speed: number, offset: number) {
  const x = -offset * DISC.radius, distance = Math.min(4, speed * 0.08);
  const samples = Array.from({ length: 17 }, (_, i) => ({ x, y: 12 + distance / 2 - distance * i / 16, t: distance / speed * 1000 * i / 16 }));
  const registered = register(samples), launch = registered.launch!;
  expect(registered.contact?.powered).toBe(true); expect(launch).not.toBeNull();
  const d = makeDisc(1, 0, 0, 12);
  Object.assign(d, { vx: launch.x, vy: launch.y, spin: launch.spin });
  return { d, launch };
}
function firstDiscContact(offset: number, dt: number, airborne: boolean) {
  const { d: a, launch } = poweredLaunch(20, offset), speed = Math.hypot(launch.x, launch.y);
  const b = makeDisc(2, 1, 3 * launch.x / speed, 12 + 3 * launch.y / speed), discs = [a, b], s = shot();
  let impact: { time: number; spin: number; states: Disc[] } | undefined;
  for (let i = 0; i < 1 / dt && !impact; i++) {
    step(discs, dt, s, airborne, e => {
      // The real disc event is emitted after face damping, before impulses.
      if (e.key === 'disc:1:2' && !impact) impact = { time: (i + 1) * dt, spin: a.spin, states: discs.map(d => ({ ...d })) };
    });
    expect([a, b].flatMap(d => [d.x, d.y, d.vx, d.vy, d.z, d.vz, d.spin, d.angle]).every(Number.isFinite)).toBe(true);
  }
  expect(impact).toBeDefined(); expect(s.opponentContact).toBe(true);
  const rebound = discs.map(d => ({ vx: d.vx, vy: d.vy, spin: d.spin }));
  return { launch, impact: impact!, rebound, rest: settle(discs, dt, airborne) };
}
function settle(discs: Disc[], dt = 1 / 240, airborne = true) {
  const s = shot(), events: string[] = [];
  let time = 0, lastTranslationStop = 0;
  let translating = discs.some(d => d.state === 'board' && Math.hypot(d.vx, d.vy) > 0);
  for (let i = 0; i < 10 / dt && discs.some(moving); i++) {
    step(discs, dt, s, airborne, e => events.push(e.kind)); time = (i + 1) * dt;
    const next = discs.some(d => d.state === 'board' && Math.hypot(d.vx, d.vy) > 0);
    if (translating && !next) lastTranslationStop = time;
    translating = next;
    for (const d of discs) expect([d.x, d.y, d.vx, d.vy, d.z, d.vz, d.spin, d.angle].every(Number.isFinite)).toBe(true);
  }
  expect(discs.some(moving)).toBe(false);
  expect(discs.every(d => d.spin === 0)).toBe(true);
  return { time, residual: time - lastTranslationStop, events };
}

describe('separate rotational resistance', () => {
  it('prunes release power independently of accumulated and finalized contact history', () => {
    const path = [{ x: -0.5, y: 12.8, t: 0 }, { x: -0.5, y: 12.8, t: 200 },
      ...Array.from({ length: 16 }, (_, i) => ({ x: -0.5, y: 12.8 - 1.6 * (i + 1) / 16, t: 200 + 5 * (i + 1) }))];
    const result = register(path), withoutStale = register(path.slice(1));
    expect(result.power[0].t).toBe(200); expect(result.contact?.powered).toBe(true);
    expect(result.launch).toEqual(withoutStale.launch);
    const last = path.at(-1)!;
    expect(register([...path, { ...last, t: last.t + 200 }]).launch).toBeNull();
  });
  it.each([-0.8, 0.8])('retains signed launch spin through first disc contact at offset %s, with changed rebounds and finite rest', offset => {
    for (const dt of [1 / 120, 1 / 240]) for (const airborne of [false, true]) {
      // Damping-only counterfactual retains the signed-hop policy; the durable
      // profile probe separately compares the real pinned preview7 graph.
      const candidate = firstDiscContact(offset, dt, airborne), baseline = withRatio(1, () => firstDiscContact(offset, dt, airborne));
      expect(candidate.launch).toEqual(baseline.launch);
      expect(Math.sign(candidate.impact.spin)).toBe(Math.sign(offset));
      expect(candidate.impact.time).toBe(baseline.impact.time);
      expect(candidate.impact.time).toBeGreaterThan(0.05); expect(candidate.impact.time).toBeLessThan(0.15);
      expect(Math.abs(candidate.impact.spin / candidate.launch.spin)).toBeGreaterThan(0.95);
      expect(Math.abs(candidate.impact.spin)).toBeGreaterThan(Math.abs(baseline.impact.spin) + 0.5);
      expect(Math.abs(candidate.impact.spin)).toBeCloseTo(dt === 1 / 120 ? 17.057035992016054 : 17.068134585181763, 8);
      expect(Math.abs(baseline.impact.spin)).toBeCloseTo(dt === 1 / 120 ? 15.891476271750367 : 15.955691790189077, 8);
      // Unchanged collision coefficients do NOT imply unchanged collision outcomes.
      const change = Math.max(...candidate.rebound.map((d, i) => Math.hypot(d.vx - baseline.rebound[i].vx, d.vy - baseline.rebound[i].vy)));
      expect(change).toBeGreaterThan(0.001); expect(change).toBeLessThan(1);
      expect(change).toBeCloseTo(dt === 1 / 120 ? 0.12141247086100941 : 0.1158794578117392, 8);
      expect(candidate.rest.residual).toBeGreaterThan(0.5); expect(candidate.rest.residual).toBeLessThan(2);
    }
  });
  it('settles full-step signed stationary, finalized launch, disc and peg scenes with zero viscosity', () => {
    const mutable = TUNE as { frictionViscous: number }, original = mutable.frictionViscous;
    try {
      mutable.frictionViscous = 0;
      for (const dt of [1 / 120, 1 / 240]) for (const airborne of [false, true]) for (const sign of [-1, 1]) {
        const stationary = makeDisc(1, 0, 0, 9); stationary.spin = sign * 18;
        expect(settle([stationary], dt, airborne).time).toBeGreaterThan(1.5);
        expect(Math.sign(stationary.angle)).toBe(sign);
        settle([poweredLaunch(20, sign * 0.8).d], dt, airborne);
        firstDiscContact(sign * 0.8, dt, airborne);
        const p = pegPositions()[0], peg = makeDisc(1, 0, p.x + 0.8, p.y + 0.15);
        peg.vx = -40; peg.spin = sign * 12;
        expect(settle([peg], dt, airborne).events).toContain('peg');
      }
    } finally { mutable.frictionViscous = original; }
    expect(mutable.frictionViscous).toBe(original);
  });
  it('retains signed grounded strong spin for 1–2 seconds, with faster weak-spin rest', () => {
    for (const sign of [-1, 1]) {
      const times = [3, 6, 12, 18].map(spin => {
        const d = makeDisc(1, 0, 0, 9); d.spin = sign * spin;
        const result = settle([d], 1 / 240, false);
        expect(Math.sign(d.angle)).toBe(sign);
        expect([d.x, d.y, d.vx, d.vy]).toEqual([0, 9, 0, 0]);
        return result.time;
      });
      expect(times[0]).toBeLessThan(0.4); expect(times[1]).toBeLessThan(0.7);
      expect(times[2]).toBeGreaterThan(1); expect(times[2]).toBeLessThan(1.3);
      expect(times[3]).toBeGreaterThan(1.5); expect(times[3]).toBeLessThan(2);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });
  it('only dissipates axial energy, never changes sign or invents a glide force', () => {
    for (const spin of [-18, -6, 6, 18]) for (const speed of [0, 10, 80]) {
      const d = makeDisc(1, 0, -4, 9); d.spin = spin; d.vx = speed;
      let before = DISC_SPIN_INERTIA * d.spin ** 2 / 2;
      for (let i = 0; i < 1200 && d.spin; i++) {
        integrateSpin(d, 1 / 120);
        const after = DISC_SPIN_INERTIA * d.spin ** 2 / 2;
        expect(after).toBeLessThanOrEqual(before); before = after;
        expect(d.spin === 0 || Math.sign(d.spin) === Math.sign(spin)).toBe(true);
        expect([d.x, d.y, d.vx, d.vy]).toEqual([-4, 9, speed, 0]);
      }
      // A held sliding speed is not a settling shot: its slip blend approaches
      // zero with spin. Full-physics finite rest is checked separately below.
      if (speed === 0) expect(d.spin).toBe(0);
    }
  });
  it('lets powered off-center shots wait for real spin, but centered and weak shots do not linger', () => {
    const strong = poweredLaunch(20, 0.8), weak = poweredLaunch(20, 0.15), center = poweredLaunch(20, 0);
    expect(strong.launch.spin).toBeGreaterThan(15);
    const result = settle([strong.d]);
    expect(result.residual).toBeGreaterThan(1); expect(result.residual).toBeLessThan(2);
    expect(settle([weak.d]).residual).toBeLessThan(0.05);
    expect(settle([center.d]).residual).toBe(0);
  });
  it('applies the same resistance to launch and glancing-contact spin, independent of source', () => {
    const a = makeDisc(1, 0, -2, 7), b = makeDisc(2, 1, 0, 7.45); a.vx = 40;
    const s = shot();
    for (let i = 0; i < 120 && !s.touched.has(2); i++) step([a, b], 1 / 240, s, false);
    expect(s.touched.has(2)).toBe(true); expect(Math.abs(a.spin)).toBeGreaterThan(1);
    Object.assign(a, { x: 0, y: 9, vx: 0, vy: 0, z: 0, vz: 0, angle: 0, hole: undefined });
    const flick = poweredLaunch(20, 0.8).d;
    Object.assign(flick, { x: 0, y: 9, vx: 0, vy: 0, z: 0, vz: 0, angle: 0, spin: a.spin });
    for (let i = 0; i < 1200 && moving(a); i++) {
      step([a], 1 / 240, shot(), false); step([flick], 1 / 240, shot(), false);
      expect(a.spin).toBe(flick.spin); expect(a.angle).toBe(flick.angle);
    }
    expect(a.spin).toBe(0); expect(flick.spin).toBe(0);
  });
  it('settles disc and peg glances with residual spin under either airborne mode and timestep', () => {
    for (const dt of [1 / 120, 1 / 240]) for (const airborne of [false, true]) {
      const a = makeDisc(1, 0, -2, 7), b = makeDisc(2, 1, 0, 7.45); a.vx = 40; a.spin = 12;
      const discResult = settle([a, b], dt, airborne);
      expect(discResult.events).toContain('disc');
      expect(discResult.residual).toBeGreaterThan(1); expect(discResult.residual).toBeLessThan(2);
      const p = pegPositions()[0], d = makeDisc(1, 0, p.x + 0.8, p.y + 0.15); d.vx = -40; d.spin = 12;
      const pegResult = settle([d], dt, airborne);
      expect(pegResult.events).toContain('peg');
      expect(pegResult.residual).toBeGreaterThan(0.8); expect(pegResult.residual).toBeLessThan(1.5);
    }
  });
  it('leaves zero-spin slide and centered powered launch trajectories exactly unchanged', () => {
    const trace = (ratio: number, centered: boolean) => withRatio(ratio, () => {
      const d = centered ? poweredLaunch(20, 0).d : makeDisc(1, 0, -4, 9);
      if (!centered) d.vx = 20;
      const states = [], s = shot();
      for (let i = 0; i < 240; i++) { step([d], 1 / 240, s); states.push({ ...d }); }
      return states;
    });
    for (const center of [false, true]) expect(trace(tune.spinFrictionRatio, center)).toEqual(trace(1, center));
  });
  it('is timestep-invariant before sleep and within one sleep quantum after rest', () => {
    const run = (dt: number, seconds: number) => {
      const d = makeDisc(1, 0, 0, 9); d.spin = -18;
      for (let i = 0; i < Math.round(seconds / dt); i++) integrateSpin(d, dt);
      return d;
    };
    const a = run(1 / 120, 1), b = run(1 / 240, 1);
    expect(a.spin).toBeLessThan(-1); expect(a.spin).toBeCloseTo(b.spin, 10); expect(a.angle).toBeCloseTo(b.angle, 10);
    const c = run(1 / 120, 3), d = run(1 / 240, 3);
    expect(c.spin).toBe(0); expect(d.spin).toBe(0); expect(Math.abs(c.angle - d.angle)).toBeLessThan(TUNE.sleepSpin / 120);
  });
  it('scales both decay terms by support but leaves airborne and unsupported spin undamped', () => {
    const full = makeDisc(1, 0, 0, 9), partial = makeDisc(2, 0, 0, 9); full.spin = partial.spin = -18;
    integrateSpin(full, 0.1); integrateSpin(partial, 0.2, 0.5);
    expect(partial.spin).toBeCloseTo(full.spin, 12); expect(partial.angle).toBeCloseTo(2 * full.angle, 12);
    for (const condition of [{ z: 0.001, vz: 0, support: 1 }, { z: 0, vz: 1, support: 1 }, { z: 0, vz: 0, support: 0 }]) {
      const d = makeDisc(3, 0, 0, 9); Object.assign(d, { spin: -18, z: condition.z, vz: condition.vz });
      integrateSpin(d, 0.25, condition.support);
      expect(d.spin).toBe(-18); expect(d.angle).toBe(-4.5);
    }
  });
  it('ratio zero removes only Coulomb torque, retaining the original viscous decay', () => {
    withRatio(0, () => {
      const d = makeDisc(1, 0, 0, 9); d.spin = -18;
      integrateSpin(d, 0.5);
      expect(d.spin).toBeCloseTo(-18 * Math.exp(-TUNE.frictionViscous * 0.5), 12);
      expect(d.angle).toBeCloseTo(-18 * -Math.expm1(-TUNE.frictionViscous * 0.5) / TUNE.frictionViscous, 12);
    });
  });
});
