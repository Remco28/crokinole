import { describe, expect, it } from 'vitest';
import { DISC, TUNE } from '../src/sim/constants';
import { makeDisc } from '../src/sim/physics';
import { DISC_SPIN_INERTIA, integrateSpin } from '../src/sim/spin';

describe('spin damping tuning limits', () => {
  it('integrates pure Coulomb damping with finite signed spin and angle', () => {
    const tune = TUNE as { frictionViscous: number; frictionMu: number }, original = tune.frictionViscous;
    try {
      for (const viscous of [0, 1e-12, 1e-8]) for (const sign of [-1, 1]) {
        tune.frictionViscous = viscous;
        const d = makeDisc(1, 0, 0, 9); d.spin = sign * 18;
        const a = TUNE.spinFrictionRatio * TUNE.frictionMu * TUNE.surfaceGravity * (2 * DISC.contactRadius / 3) / DISC_SPIN_INERTIA, dt = 0.01;
        integrateSpin(d, dt);
        expect(Number.isFinite(d.angle)).toBe(true); expect(Number.isFinite(d.spin)).toBe(true);
        expect(d.angle).toBeCloseTo(sign * (18 * dt - a * dt ** 2 / 2), 7);
        expect(d.spin).toBeCloseTo(sign * (18 - a * dt), 7);
        // At the tuned resistance, the exact pure-Coulomb stop occurs later
        // than one second; integrate past its analytic stopping time.
        integrateSpin(d, 18 / a); expect(d.spin).toBe(0); expect(Number.isFinite(d.angle)).toBe(true);
      }
    } finally { tune.frictionViscous = original; }
  });
  it('handles both-zero friction and purely viscous friction without a singularity', () => {
    const tune = TUNE as { frictionViscous: number; frictionMu: number; spinFrictionRatio: number }, original = { ...tune };
    try {
      // Either zero sliding grip or zero rotational ratio removes only the
      // Coulomb term. The viscous-only and both-zero limits stay unchanged.
      for (const disable of ['mu', 'ratio']) for (const viscous of [0, 0.05]) {
        tune.frictionMu = disable === 'mu' ? 0 : original.frictionMu;
        tune.spinFrictionRatio = disable === 'ratio' ? 0 : original.spinFrictionRatio;
        tune.frictionViscous = viscous;
        const d = makeDisc(1, 0, 0, 9); d.spin = -18; integrateSpin(d, 0.1);
        expect(d.spin).toBeCloseTo(-18 * Math.exp(-viscous * 0.1), 10);
        const integral = viscous ? -Math.expm1(-viscous * 0.1) / viscous : 0.1;
        expect(d.angle).toBeCloseTo(-18 * integral, 10);
      }
    } finally {
      tune.frictionMu = original.frictionMu; tune.frictionViscous = original.frictionViscous;
      tune.spinFrictionRatio = original.spinFrictionRatio;
    }
  });
});
