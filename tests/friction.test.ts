import { describe, expect, it } from 'vitest';
import { DISC, TUNE } from '../src/sim/constants';
import { makeDisc, moving, step, type Shot } from '../src/sim/physics';
import { DISC_SPIN_INERTIA } from '../src/sim/spin';

const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
describe('small surface grip adjustment', () => {
  it('eases extra grip slightly without changing speed-dependent drag or bounce', () => {
    expect(TUNE.frictionMu).toBe(0.1175);
    expect(TUNE.frictionViscous).toBe(0.05);
    expect(TUNE.surfaceGravity).toBe(386);
    expect(TUNE.gravityZ).toBe(180);
    expect(TUNE.restitutionDisc).toBe(0.8);
    expect(TUNE.restitutionPeg).toBe(0.62);
  });
  it('shortens an unobstructed flat glide by a small amount', () => {
    const d = makeDisc(1, 0, 0, 9); d.vx = 20;
    for (let i = 0; i < 600 && moving(d); i++) step([d], 1 / 120, shot(), false);
    // Same isolated lane under 0.115 grip traveled about 4.52 inches.
    expect(d.x).toBeGreaterThan(4.2); expect(d.x).toBeLessThan(4.5);
    expect(d.y).toBe(9); expect(moving(d)).toBe(false);
  });
  it('glides farther than the previous extra-grip setting but less than the original', () => {
    const tune = TUNE as { frictionMu: number }, saved = tune.frictionMu;
    const distances: number[] = [];
    try {
      for (const mu of [0.12, 0.1175, 0.115]) {
        tune.frictionMu = mu;
        const d = makeDisc(1, 0, 0, 9); d.vx = 20;
        for (let i = 0; i < 600 && moving(d); i++) step([d], 1 / 120, shot(), false);
        expect(d.y).toBe(9); expect(moving(d)).toBe(false);
        distances.push(d.x);
      }
    } finally { tune.frictionMu = saved; }
    expect(distances[1]).toBeGreaterThan(distances[0]);
    expect(distances[1]).toBeLessThan(distances[2]);
    expect(distances[1] / distances[0]).toBeLessThan(1.03);
  });
});

describe('shared surface-friction gravity', () => {
  it('drives sliding and axial damping independently of stylized vertical gravity', () => {
    const tune = TUNE as { surfaceGravity: number; gravityZ: number };
    const original = { surfaceGravity: tune.surfaceGravity, gravityZ: tune.gravityZ };
    try {
      for (const surfaceGravity of [386, 193]) for (const gravityZ of [180, 360]) {
        tune.surfaceGravity = surfaceGravity; tune.gravityZ = gravityZ;
        const d = makeDisc(1, 0, 0, 9); d.vx = 20; d.spin = 12;
        const dt = 0.001, rimSpeed = DISC.contactRadius * d.spin;
        const blend = rimSpeed / Math.hypot(rimSpeed, d.vx * 8 / 3);
        const a = TUNE.spinFrictionRatio * TUNE.frictionMu * surfaceGravity * (2 * DISC.contactRadius / 3) * blend / DISC_SPIN_INERTIA;
        const b = TUNE.frictionViscous, decay = Math.exp(-b * dt);
        const integral = -Math.expm1(-b * dt) / b;
        step([d], dt, shot(), false);
        expect(d.vx).toBeCloseTo(20 - (TUNE.frictionMu * surfaceGravity + b * 20) * dt, 12);
        expect(d.spin).toBeCloseTo(12 * decay - a * integral, 12);
        expect(d.angle).toBeCloseTo(12 * integral - a * (dt - integral) / b, 12);
        expect([d.y, d.vy, d.z, d.vz]).toEqual([9, 0, 0, 0]);
      }
    } finally { tune.surfaceGravity = original.surfaceGravity; tune.gravityZ = original.gravityZ; }
  });
});
