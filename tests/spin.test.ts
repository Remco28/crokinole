import { describe, expect, it } from 'vitest';
import { BOARD, DISC, TUNE, pegPositions } from '../src/sim/constants';
import { discContactRadius, interactWithHole, makeHoleMotion } from '../src/sim/hole';
import { makeDisc, moving, step, type Disc, type Shot } from '../src/sim/physics';
import { DISC_SPIN_INERTIA, contactFriction, contactHop, integrateSpin } from '../src/sim/spin';

const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
const energy = (d: Disc) => 0.5 * (d.vx ** 2 + d.vy ** 2 + d.vz ** 2 + DISC_SPIN_INERTIA * d.spin ** 2) + TUNE.gravityZ * d.z;
const total = (ds: Disc[]) => ds.reduce((sum, d) => sum + energy(d), 0);
function hit(offset = 0, spin = 0, airborne = false, dt = 1 / 120) {
  const a = makeDisc(1, 0, -2, 7), b = makeDisc(2, 1, 0, 7 + offset); a.vx = 40; a.spin = spin;
  const s = shot();
  for (let i = 0; i < 40 && !s.touched.has(2); i++) step([a, b], dt, s, airborne);
  expect(s.touched.has(2)).toBe(true);
  return [a, b];
}
function lip(spin: number, y = 0, airborne = true) {
  const d = makeDisc(1, 0, BOARD.holeRadius + 0.001, y); d.vx = 80; d.spin = spin;
  d.hole = { ...makeHoleMotion(), engaged: true, dip: 0.02 };
  interactWithHole(d, BOARD.holeRadius - 0.001, 1 / 120, airborne);
  return d;
}

describe('physical axial spin', () => {
  it('initializes axial state and uses solid-cylinder inertia per unit mass', () => {
    const d = makeDisc(1, 0, 0, 7);
    expect(d.spin).toBe(0); expect(d.angle).toBe(0);
    expect(DISC_SPIN_INERTIA).toBe(DISC.radius ** 2 / 2);
  });
  it('integrates signed rotation, dissipates grounded spin, and sleeps in finite time without curling', () => {
    const d = makeDisc(1, 0, 0, 9); d.spin = 20;
    expect(moving(d)).toBe(true);
    step([d], 1 / 120, shot(), false);
    expect(d.spin).toBeLessThan(20); expect(d.spin).toBeGreaterThan(0); expect(d.angle).toBeGreaterThan(0);
    for (let i = 0; i < 1200 && moving(d); i++) step([d], 1 / 120, shot(), false);
    expect(d.spin).toBe(0); expect(moving(d)).toBe(false);
    expect([d.x, d.y, d.vx, d.vy]).toEqual([0, 9, 0, 0]);
    const reverse = makeDisc(2, 0, 0, 9); reverse.spin = -20;
    for (let i = 0; i < 1200 && moving(reverse); i++) step([reverse], 1 / 120, shot(), false);
    expect(reverse.angle).toBeCloseTo(-d.angle, 12);
  });
  it('does not apply grounded damping in flight, including a tiny positive height', () => {
    for (const z of [0.001, 1]) {
      const d = makeDisc(1, 0, 0, 9); d.z = z; d.vz = 10; d.spin = -12;
      step([d], 1 / 240, shot());
      expect(d.spin).toBe(-12); expect(d.angle).toBeCloseTo(-12 / 240, 12);
    }
  });
  it('applies identical board damping to flick-like and collision-generated stationary spin', () => {
    const collision = hit(0.45)[0];
    expect(collision.spin).not.toBe(0);
    // Isolate the acquired spin from subsequent sliding/contacts. Its origin
    // must not change surface torque, including after translation has stopped.
    Object.assign(collision, { x: 0, y: 9, vx: 0, vy: 0, z: 0, vz: 0, angle: 0, hole: undefined });
    const flick = makeDisc(3, 0, 0, 9); flick.spin = collision.spin;
    let updates = 0;
    while (moving(collision) && updates < 1200) {
      const before = Math.abs(collision.spin);
      step([collision], 1 / 120, shot(), false); step([flick], 1 / 120, shot(), false);
      expect(Math.abs(collision.spin)).toBeLessThan(before);
      expect(collision.spin).toBe(flick.spin); expect(collision.angle).toBe(flick.angle);
      expect([collision.x, collision.y, collision.vx, collision.vy]).toEqual([0, 9, 0, 0]);
      updates++;
    }
    expect(updates).toBeGreaterThan(1); expect(updates).toBeLessThan(1200);
    expect(collision.spin).toBe(0); expect(flick.spin).toBe(0);
    expect(moving(collision)).toBe(false); expect(moving(flick)).toBe(false);
  });
  it('never hands over with a nonzero sub-threshold collision spin', () => {
    const d = makeDisc(1, 0, 0, 9); d.spin = TUNE.sleepSpin / 2;
    expect(moving(d)).toBe(true); step([d], 1 / 120, shot());
    expect(d.spin).toBe(0); expect(moving(d)).toBe(false);
  });
  it('keeps axial spin undamped through flight and begins damping after landing', () => {
    const d = makeDisc(1, 0, 0, 9); d.z = 0.02; d.spin = 12;
    step([d], 1 / 240, shot()); expect(d.z).toBeGreaterThan(0); expect(d.spin).toBe(12);
    for (let i = 0; i < 120 && d.z > 0; i++) {
      step([d], 1 / 240, shot());
      if (d.z > 0 || d.vz > 0) expect(d.spin).toBe(12);
    }
    expect(d.z).toBe(0); expect(d.vz).toBe(0); expect(d.spin).toBeLessThan(12);
    for (let i = 0; i < 1200 && moving(d); i++) step([d], 1 / 240, shot());
    expect(d.spin).toBe(0); expect(moving(d)).toBe(false);
  });
  it('retains useful flick spin while sliding and increases rotational grip as sliding slows', () => {
    const sliding = makeDisc(1, 0, 0, 9), stationary = makeDisc(2, 0, 0, 9);
    sliding.vx = 40; sliding.spin = stationary.spin = 12;
    integrateSpin(sliding, 0.1); integrateSpin(stationary, 0.1);
    expect(sliding.spin).toBeGreaterThan(10);
    expect(stationary.spin).toBeLessThan(sliding.spin);
    // An unobstructed shot must still have axial rotation on approaching a target,
    // not lose the entire new mechanic immediately after the finger releases.
    const d = makeDisc(3, 0, -4, 9); d.vx = 40; d.spin = 12;
    for (let i = 0; i < 36; i++) step([d], 1 / 120, shot(), false);
    expect(d.spin).toBeGreaterThan(5); expect(d.angle).toBeGreaterThan(1);
  });
  it('does not add a sideways free-flight or flat-glide force', () => {
    for (const z of [0, 1]) {
      const a = makeDisc(1, 0, 0, 9), b = makeDisc(2, 0, 0, 9);
      a.vx = b.vx = 15; a.z = b.z = z; a.spin = 15;
      step([a], 1 / 120, shot()); step([b], 1 / 120, shot());
      expect([a.x, a.y, a.vx, a.vy]).toEqual([b.x, b.y, b.vx, b.vy]);
    }
  });
  it('keeps a centered zero-spin normal collision unchanged', () => {
    const a = makeDisc(1, 0, 0, 7), b = makeDisc(2, 1, 1.24, 7); a.vx = 40;
    const dt = 0.0001, speed = 40 - (TUNE.frictionMu * 386 + TUNE.frictionViscous * 40) * dt;
    step([a, b], dt, shot(), false);
    expect(a.vx).toBeCloseTo(speed * (1 - TUNE.restitutionDisc) / 2, 12);
    expect(b.vx).toBeCloseTo(speed * (1 + TUNE.restitutionDisc) / 2, 12);
    expect([a.vy, b.vy, a.spin, b.spin]).toEqual([0, 0, 0, 0]);
  });
  it('generates mirrored spin and mirrored glancing deflections deterministically', () => {
    const plus = hit(0.45), minus = hit(-0.45);
    expect(plus[0].spin).not.toBe(0); expect(plus[1].spin).not.toBe(0);
    for (let i = 0; i < 2; i++) {
      expect(plus[i].vx).toBeCloseTo(minus[i].vx, 12);
      expect(plus[i].vy).toBeCloseTo(-minus[i].vy, 12);
      expect(plus[i].spin).toBeCloseTo(-minus[i].spin, 12);
      expect(plus[i].y - 7).toBeCloseTo(-(minus[i].y - 7), 12);
    }
    expect(hit(0.45, 8, true)).toEqual(hit(0.45, 8, true));
  });
  it('changes outgoing direction for a spinning contact and transfers angular momentum', () => {
    const flat = hit(), spinning = hit(0, 12);
    expect(flat[1].vy).toBe(0); expect(Math.abs(spinning[1].vy)).toBeGreaterThan(0.1);
    expect(spinning[1].spin).not.toBe(0); expect(spinning[0].spin).toBeLessThan(12);
    // An isolated tangent impulse conserves total angular momentum about the touching centers.
    const a = makeDisc(1, 0, 0, 0), b = makeDisc(2, 1, 2 * DISC.radius, 0); a.spin = 12;
    const before = DISC_SPIN_INERTIA * (a.spin + b.spin);
    contactFriction(a, b, 1, 0, DISC.radius, DISC.radius, 20, TUNE.contactFrictionDisc);
    const after = DISC_SPIN_INERTIA * (a.spin + b.spin) + b.x * b.vy;
    expect(after).toBeCloseTo(before, 12);
  });
  it('uses contact-point slip and actual projected radii for tipped discs', () => {
    const a = makeDisc(1, 0, 0, 0), b = makeDisc(2, 1, 0, 0);
    a.hole = { ...makeHoleMotion(), tilt: 1.4, lean: 0 }; a.spin = 15;
    const ra = discContactRadius(a, 1, 0), rb = discContactRadius(b, 1, 0);
    const slip = -ra * a.spin, effectiveMass = 2 + (ra ** 2 + rb ** 2) / DISC_SPIN_INERTIA;
    const impulse = -slip / effectiveMass;
    contactFriction(a, b, 1, 0, ra, rb, 100, TUNE.contactFrictionDisc);
    expect(a.vy).toBeCloseTo(-impulse, 12); expect(b.vy).toBeCloseTo(impulse, 12);
    expect(a.spin).toBeCloseTo(15 - ra * impulse / DISC_SPIN_INERTIA, 12);
    expect(b.spin).toBeCloseTo(-rb * impulse / DISC_SPIN_INERTIA, 12);
  });
  it('leaves no-slip contact alone and caps a sliding impulse by Coulomb grip', () => {
    const a = makeDisc(1, 0, 0, 0), b = makeDisc(2, 1, 1.25, 0);
    a.spin = 10; b.vy = DISC.radius * a.spin;
    const before = [{ ...a }, { ...b }];
    contactFriction(a, b, 1, 0, DISC.radius, DISC.radius, 20, TUNE.contactFrictionDisc);
    expect([a, b]).toEqual(before);
    b.vy = 100;
    contactFriction(a, b, 1, 0, DISC.radius, DISC.radius, 1, TUNE.contactFrictionDisc);
    expect(a.vy).toBeCloseTo(TUNE.contactFrictionDisc, 12);
    expect(b.vy).toBeCloseTo(100 - TUNE.contactFrictionDisc, 12);
  });
  it('preserves centered peg restitution and the existing hop target at zero spin', () => {
    const p = pegPositions()[0], d = makeDisc(1, 0, p.x + 0.8, p.y); d.vx = -40;
    const dt = 0.0001, speed = 40 - (TUNE.frictionMu * 386 + TUNE.frictionViscous * 40) * dt;
    step([d], dt, shot(), true);
    expect(d.vx).toBeCloseTo(speed * TUNE.restitutionPeg, 12);
    expect(d.vz).toBeCloseTo(speed * 0.1, 12);
    expect(d.vy).toBe(0); expect(d.spin).toBe(0);
  });
  it('peg contacts generate spin and spinning hits alter the rebound', () => {
    const p = pegPositions()[0];
    const run = (spin: number) => {
      const d = makeDisc(1, 0, p.x + 0.8, p.y + 0.15); d.vx = -40; d.spin = spin;
      const events: string[] = []; step([d], 1 / 120, shot(), false, e => events.push(e.kind));
      expect(events).toContain('peg'); return d;
    };
    const flat = run(0), spun = run(10);
    expect(flat.spin).not.toBe(0); expect(Math.abs(spun.vy - flat.vy)).toBeGreaterThan(0.1);
  });
  it('occupied-pocket reflection uses spin contact but never moves a resting hanger', () => {
    const sunk = makeDisc(1, 0, 0, 0); sunk.state = 'sunk';
    const d = makeDisc(2, 1, 0.9, 0); d.vx = -20; d.spin = 12;
    step([sunk, d], 1 / 120, shot(), false);
    expect(d.vx).toBeGreaterThan(0); expect(Math.abs(d.vy)).toBeGreaterThan(0.1);
    const rest = makeDisc(3, 0, 0.9, 0); rest.spin = 12;
    step([sunk, rest], 1 / 120, shot(), false);
    expect([rest.x, rest.y, rest.vx, rest.vy]).toEqual([0.9, 0, 0, 0]);
  });
  it('applies conservative lip spin transfer without steering centered zero-spin exits', () => {
    const centered = lip(0), spun = lip(12), reverse = lip(-12);
    expect(centered.vy).toBe(0); expect(centered.spin).toBe(0);
    expect(Math.abs(spun.vy)).toBeGreaterThan(0.1); expect(spun.spin).toBeLessThan(12);
    expect(spun.vy).toBeCloseTo(-reverse.vy, 12); expect(spun.spin).toBeCloseTo(-reverse.spin, 12);
    expect(spun.vx).toBe(centered.vx); expect(spun.vz).toBe(centered.vz);
  });
  it('generates mirrored spin at off-center lips and does not apply lip friction above the hole', () => {
    const plus = lip(0, 0.2), minus = lip(0, -0.2);
    expect(plus.spin).not.toBe(0); expect(plus.spin).toBeCloseTo(-minus.spin, 12);
    expect(plus.vy).toBeCloseTo(-minus.vy, 12);
    const d = makeDisc(1, 0, BOARD.holeRadius + 0.001, 0); d.vx = 80; d.spin = 20; d.z = 1;
    d.hole = { ...makeHoleMotion(), engaged: true, dip: 0.02 };
    interactWithHole(d, BOARD.holeRadius - 0.001, 1 / 120, true);
    expect([d.vx, d.vy, d.vz, d.spin]).toEqual([80, 0, 0, 20]);
  });
  it('does not reject a centered twenty because of spin and stops spin when sunk/out', () => {
    const sink = makeDisc(1, 0, 0, 0); sink.spin = 40; step([sink], 1 / 120, shot());
    expect(sink.state).toBe('sunk'); expect(sink.spin).toBe(0);
    const out = makeDisc(2, 0, 12.99, 0); out.vx = 40; out.spin = 12; step([out], 1 / 120, shot());
    expect(out.state).toBe('out'); expect(out.spin).toBe(0);
  });
  it('settles a glancing spun shot and remains similar with a halved timestep', () => {
    const run = (dt: number) => {
      const ds = hit(0.45, 12, true, dt), s = shot();
      for (let i = 0; i < 10 / dt && ds.some(moving); i++) step(ds, dt, s);
      expect(ds.some(moving)).toBe(false); expect(ds.every(d => d.spin === 0)).toBe(true); return ds;
    };
    const a = run(1 / 120), b = run(1 / 240);
    for (let i = 0; i < 2; i++) {
      expect(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)).toBeLessThan(0.25);
      expect(Math.abs(a[i].angle - b[i].angle)).toBeLessThan(0.15);
    }
    const c = makeDisc(1, 0, 0, 7), d = makeDisc(2, 0, 0, 7); c.spin = d.spin = 20;
    for (let i = 0; i < 120; i++) integrateSpin(c, 1 / 120);
    for (let i = 0; i < 240; i++) integrateSpin(d, 1 / 240);
    expect(c.angle).toBeCloseTo(d.angle, 5);
  });
});

describe('contact energy bounds', () => {
  it('never increases kinetic energy in disc/fixed friction impulses, including separating/resting and tipped contacts', () => {
    for (const ra of [0.22, DISC.radius]) for (const rb of [0.3, DISC.radius])
      for (const tangent of [-100, 0, 100]) for (const spinA of [-80, 0, 80]) for (const spinB of [-80, 0, 80])
        for (const normalImpulse of [0, 0.001, 20, 100]) for (const fixed of [false, true]) {
          const a = makeDisc(1, 0, 0, 0), b = makeDisc(2, 1, 1, 0);
          a.vx = -3; a.vy = tangent; a.spin = spinA; a.z = b.z = 0.1; a.vz = 10; b.vz = -5; b.spin = spinB;
          const before = total([a, b]);
          contactFriction(a, fixed ? undefined : b, 1, 0, ra, rb, normalImpulse, TUNE.contactFrictionDisc);
          expect(total([a, b])).toBeLessThanOrEqual(before + 1e-8);
          if (normalImpulse === 0) expect(a.spin).toBe(spinA);
        }
  });
  it('caps impact pops against lost contact energy even with pre-existing vertical speed', () => {
    for (const vzA of [-40, 0, 1, 10, 40]) for (const vzB of [-40, 0, 1, 10, 40]) for (const budget of [0, 0.001, 1, 100]) {
      const a = makeDisc(1, 0, 0, 7), b = makeDisc(2, 1, 1, 7); a.vz = vzA; b.vz = vzB;
      const before = total([a, b]);
      contactHop([a, b], [Math.max(a.vz, 8), Math.max(b.vz, 6)], budget);
      expect(total([a, b])).toBeLessThanOrEqual(before + budget + 1e-9);
    }
  });
  it('bounds full disc/peg contacts with airborne and resting vertical channels', () => {
    for (const speed of [0, 0.2, 10, 105]) for (const spin of [-80, 0, 80])
      for (const vz of [-10, 0, 0.5, 10]) for (const z of [0, 0.1]) for (const peg of [false, true]) {
        const p = peg ? pegPositions()[0] : { x: 0, y: 7 };
        const a = makeDisc(1, 0, p.x + (peg ? 0.8 : 1.24), p.y), b = makeDisc(2, 1, p.x, p.y);
        a.vx = -speed; a.spin = spin; a.z = b.z = z; a.vz = b.vz = vz;
        const ds = peg ? [a] : [a, b], before = total(ds);
        step(ds, 0.00001, shot(), true);
        expect(total(ds)).toBeLessThanOrEqual(before + 1e-7);
      }
  });
  it('bounds lip translational/axial/vertical and rocking energy across spin and prior hops', () => {
    for (const spin of [-80, 0, 80]) for (const tangent of [-60, 0, 60]) for (const vz of [-10, 0, 10])
      for (const tiltSpeed of [-20, 0, 20]) {
        const d = makeDisc(1, 0, BOARD.holeRadius + 0.001, 0); d.vx = 80; d.vy = tangent; d.spin = spin; d.vz = vz;
        d.hole = { ...makeHoleMotion(), engaged: true, dip: 0.02, tiltSpeed };
        const inertia = DISC.radius ** 2 / 4 + DISC.height ** 2 / 12;
        const before = energy(d) + 0.5 * inertia * tiltSpeed ** 2;
        interactWithHole(d, BOARD.holeRadius - 0.001, 1 / 120, true);
        expect(energy(d) + 0.5 * inertia * d.hole.tiltSpeed ** 2).toBeLessThanOrEqual(before + 1e-8);
      }
  });
  it('bounds occupied-pocket glancing contacts across spin and vertical state', () => {
    for (const spin of [-80, 0, 80]) for (const tangent of [-40, 0, 40]) for (const z of [0, 0.1]) {
      const sunk = makeDisc(1, 0, 0, 0); sunk.state = 'sunk';
      const d = makeDisc(2, 1, 0.9, 0); d.vx = -40; d.vy = tangent; d.spin = spin; d.z = z; d.vz = 4;
      const before = energy(d); step([sunk, d], 0.00001, shot());
      expect(d.vx).toBeGreaterThan(0); expect(energy(d)).toBeLessThanOrEqual(before + 1e-8);
    }
  });
});
