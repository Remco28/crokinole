import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { flickContactOffset, releaseShot, releaseVelocity, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const swipe = (offset: number, milliseconds = 100): FlickSample[] => [
  { x: offset, y: 14, t: 0 }, { x: offset, y: 10, t: milliseconds },
];
const inertia = DISC.radius ** 2 / 2;
describe('forgiving spin from swept flick contact', () => {
  it('measures fast crossings even without an event on the disc', () => {
    expect(flickContactOffset(swipe(0), disc)).toBe(0);
    expect(flickContactOffset(swipe(0.4), disc)).toBeCloseTo(-0.4 / DISC.radius);
    expect(flickContactOffset(swipe(0.8), disc)).toBeNull();
    expect(flickContactOffset([...swipe(0)].reverse(), disc)).toBeNull();
  });
  it('keeps a small neutral spin zone and the original exactly centered launch', () => {
    const velocity = releaseVelocity(swipe(0), disc)!;
    expect(releaseShot(swipe(0), disc, 0)).toEqual({ ...velocity, spin: 0 });
    for (const offset of [-0.1, -0.05, 0, 0.05, 0.1]) {
      expect(releaseShot(swipe(0), disc, offset)!.spin).toBe(0);
    }
  });
  it('uses progressively stronger deliberate offsets, with mirrored spin', () => {
    const medium = releaseShot(swipe(0), disc, 0.5)!;
    const edge = releaseShot(swipe(0), disc, 1)!;
    const mirrored = releaseShot(swipe(0), disc, -1)!;
    expect(medium.spin).toBeGreaterThan(5); expect(edge.spin).toBeGreaterThan(medium.spin);
    expect(mirrored.spin).toBe(-edge.spin); expect(mirrored.y).toBe(edge.y);
    expect(edge.x).toBeGreaterThan(0);
  });
  it('starts gentle signed spin inside the previous neutral zone', () => {
    const left = releaseShot(swipe(0), disc, 0.28)!;
    const right = releaseShot(swipe(0), disc, -0.28)!;
    expect(left.spin).toBeGreaterThan(0); expect(left.spin).toBeLessThan(10);
    expect(right.spin).toBe(-left.spin);
  });
  it('reaches strong spin without requiring a rim-grazing strike', () => {
    expect(releaseShot(swipe(0), disc, 0.5)!.spin).toBeGreaterThan(10);
    expect(releaseShot(swipe(0), disc, 0.8)!.spin).toBe(18);
    expect(releaseShot(swipe(0), disc, -0.8)!.spin).toBe(-18);
  });
  it('is continuous at the center-zone boundary, not a binary spin switch', () => {
    expect(releaseShot(swipe(0), disc, 0.1001)!.spin).toBeLessThan(0.001);
  });
  it('caps angular speed and does not add launch energy', () => {
    for (const duration of [20, 70, 100, 200, 400]) for (const offset of [-2, -1, -0.4, 0, 0.4, 1, 2]) {
      const samples = swipe(0, duration), velocity = releaseVelocity(samples, disc);
      const result = releaseShot(samples, disc, offset);
      if (!velocity) { expect(result).toBeNull(); continue; }
      expect(Math.abs(result!.spin)).toBeLessThanOrEqual(18);
      expect(Math.hypot(result!.x, result!.y)).toBeLessThanOrEqual(105);
      expect(result!.x ** 2 + result!.y ** 2 + inertia * result!.spin ** 2).toBeLessThanOrEqual(velocity.x ** 2 + velocity.y ** 2 + 1e-8);
    }
    expect(Math.hypot(...Object.values(releaseVelocity(swipe(0, 20), disc)!))).toBe(105);
  });
  it('measures the same contact in another quadrant and ignores sample spacing', () => {
    const original = swipe(0.4);
    const rotated = original.map(s => ({ x: -s.y, y: s.x, t: s.t }));
    expect(flickContactOffset(rotated, { x: -12, y: 0 })).toBeCloseTo(flickContactOffset(original, disc)!);
    expect(flickContactOffset([{ x: 0.4, y: 12.7, t: 0 }, { x: 0.4, y: 11.4, t: 70 }], disc)).toBeCloseTo(flickContactOffset(original, disc)!);
  });
});
