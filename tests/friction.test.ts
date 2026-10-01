import { describe, expect, it } from 'vitest';
import { TUNE } from '../src/sim/constants';
import { makeDisc, moving, step, type Shot } from '../src/sim/physics';

const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
describe('small surface grip adjustment', () => {
  it('eases extra grip slightly without changing speed-dependent drag or bounce', () => {
    expect(TUNE.frictionMu).toBe(0.1175);
    expect(TUNE.frictionViscous).toBe(0.05);
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
