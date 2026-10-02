import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { releaseShot } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const angle = (p: { x: number; y: number }) => Math.atan2(p.x, -p.y) * 180 / Math.PI;
function stroke(degrees: number, speed = 100) {
  const a = degrees * Math.PI / 180;
  return [{ x: 0, y: 12, t: 0 }, { x: speed * 0.08 * Math.sin(a), y: 12 - speed * 0.08 * Math.cos(a), t: 80 }];
}

describe('diagonal intent survives opposing glancing deflection', () => {
  it('does not erase or reverse an established diagonal even at the extreme rim', () => {
    for (const degrees of [16, 30, 43.8079, 60, 80]) for (const speed of [10, 30, 100, 250]) {
      for (const offset of [0.5, 0.756699, 0.9, 0.953625, 0.99, 1]) {
        const shot = releaseShot(stroke(degrees, speed), disc, -offset)!;
        expect(angle(shot)).toBeGreaterThanOrEqual(degrees * 0.35 - 1e-8);
        expect(angle(shot)).toBeLessThanOrEqual(degrees + 1e-8);
      }
    }
  });
  it('preserves radial edge glances and reinforcing diagonal responses', () => {
    const radial = releaseShot(stroke(0), disc, -0.99)!;
    expect(Math.abs(angle(radial))).toBeGreaterThan(50);
    const reinforce = releaseShot(stroke(30), disc, 0.99)!;
    expect(angle(reinforce)).toBeGreaterThan(80);
  });
  it('preserves transferred speed and spin relative to the equivalent radial impulse', () => {
    for (const degrees of [16, 30, 60]) for (const offset of [-0.99, -0.9, -0.5]) {
      const radial = releaseShot(stroke(0), disc, offset)!, diagonal = releaseShot(stroke(degrees), disc, offset)!;
      expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(Math.hypot(radial.x, radial.y), 10);
      expect(diagonal.spin).toBeCloseTo(radial.spin, 10);
      expect(diagonal.x ** 2 + diagonal.y ** 2 + DISC.radius ** 2 / 2 * diagonal.spin ** 2).toBeLessThanOrEqual(92 ** 2 + 1e-8);
    }
  });
  it('mirrors and rotates with each player instead of adding a global rightward correction', () => {
    const samples = stroke(30), shot = releaseShot(samples, disc, -0.99)!;
    const mirrored = releaseShot(samples.map(p => ({ ...p, x: -p.x })), disc, 0.99)!;
    expect(mirrored.x).toBeCloseTo(-shot.x, 10); expect(mirrored.y).toBeCloseTo(shot.y, 10); expect(mirrored.spin).toBe(-shot.spin);
    for (let q = 1; q < 4; q++) {
      const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      const rotate = (p: { x: number; y: number }) => ({ x: c * p.x - s * p.y, y: s * p.x + c * p.y });
      const rotated = releaseShot(samples.map(p => ({ ...rotate(p), t: p.t })), rotate(disc), -0.99)!;
      expect(rotated.x).toBeCloseTo(rotate(shot).x, 10); expect(rotated.y).toBeCloseTo(rotate(shot).y, 10);
      expect(rotated.spin).toBeCloseTo(shot.spin, 10);
    }
  });
});
