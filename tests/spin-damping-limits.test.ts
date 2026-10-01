import { describe, expect, it } from 'vitest';
import { DISC, TUNE } from '../src/sim/constants';
import { makeDisc } from '../src/sim/physics';
import { integrateSpin } from '../src/sim/spin';

describe('spin damping tuning limits', () => {
  it('integrates pure Coulomb damping with finite signed spin and angle', () => {
    const tune = TUNE as { frictionViscous: number; frictionMu: number }, original = tune.frictionViscous;
    try {
      for (const viscous of [0, 1e-12, 1e-8]) for (const sign of [-1, 1]) {
        tune.frictionViscous = viscous;
        const d = makeDisc(1, 0, 0, 9); d.spin = sign * 18;
        const a = TUNE.frictionMu * 386 * (2 * DISC.contactRadius / 3) / (DISC.radius ** 2 / 2), dt = 0.01;
        integrateSpin(d, dt);
        expect(Number.isFinite(d.angle)).toBe(true); expect(Number.isFinite(d.spin)).toBe(true);
        expect(d.angle).toBeCloseTo(sign * (18 * dt - a * dt ** 2 / 2), 7);
        expect(d.spin).toBeCloseTo(sign * (18 - a * dt), 7);
        integrateSpin(d, 1); expect(d.spin).toBe(0); expect(Number.isFinite(d.angle)).toBe(true);
      }
    } finally { tune.frictionViscous = original; }
  });
  it('handles both-zero friction and purely viscous friction without a singularity', () => {
    const tune = TUNE as { frictionViscous: number; frictionMu: number }, original = { ...tune };
    try {
      tune.frictionMu = 0;
      for (const viscous of [0, 0.05]) {
        tune.frictionViscous = viscous;
        const d = makeDisc(1, 0, 0, 9); d.spin = -18; integrateSpin(d, 0.1);
        expect(d.spin).toBeCloseTo(-18 * Math.exp(-viscous * 0.1), 10);
        const integral = viscous ? -Math.expm1(-viscous * 0.1) / viscous : 0.1;
        expect(d.angle).toBeCloseTo(-18 * integral, 10);
      }
    } finally { tune.frictionMu = original.frictionMu; tune.frictionViscous = original.frictionViscous; }
  });
});
