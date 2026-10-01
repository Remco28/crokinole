import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { appendFlickContactSample, finalizeFlickContact, releaseShot, releaseVelocity, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const swipe = (speed: number): FlickSample[] => {
  const distance = Math.min(4, speed * 0.08);
  return [{ x: 0, y: 12 + distance / 2, t: 0 }, { x: 0, y: 12 - distance / 2, t: distance / speed * 1000 }];
};
const heading = (shot: { x: number; y: number }) => Math.atan2(Math.abs(shot.x), -shot.y) * 180 / Math.PI;
const energy = (shot: { x: number; y: number; spin: number }) => shot.x ** 2 + shot.y ** 2 + DISC.radius ** 2 / 2 * shot.spin ** 2;

describe('progressive outer glancing impulse', () => {
  it('gives deliberate near-rim contact a sharper mirrored direction', () => {
    for (const speed of [10, 30, 100, 250]) {
      const samples = swipe(speed), edge = releaseShot(samples, disc, 0.99)!;
      expect(heading(edge)).toBeGreaterThan(50);
      const mirror = releaseShot(samples, disc, -0.99)!;
      expect(mirror).toEqual({ x: -edge.x, y: edge.y, spin: -edge.spin });
      expect(heading(releaseShot(samples, disc, 0.9)!)).toBeGreaterThan(33);
    }
  });
  it('keeps the accepted central and moderate response exactly unchanged', () => {
    const samples = [{ x: 0, y: 14, t: 0 }, { x: 0, y: 10, t: 100 }];
    expect(releaseShot(samples, disc, 0.5)).toEqual({ x: 9.78528334264233, y: -40.25850340136054, spin: 16.761904761904763 });
  });
  it('has continuous increasing outer headings, falling transferred speed and bounded energy', () => {
    for (const speed of [10, 30, 100, 250]) {
      const samples = swipe(speed), input = releaseVelocity(samples, disc)!;
      let priorHeading = -Infinity, priorSpeed = Infinity;
      for (let i = 700; i <= 1000; i++) {
        const shot = releaseShot(samples, disc, i / 1000)!;
        const angle = heading(shot), transferred = Math.hypot(shot.x, shot.y);
        expect(angle + 1e-9).toBeGreaterThanOrEqual(priorHeading);
        expect(transferred).toBeLessThanOrEqual(priorSpeed + 1e-9);
        expect(energy(shot)).toBeLessThanOrEqual(input.x ** 2 + input.y ** 2 + 1e-8);
        expect(Math.abs(shot.spin)).toBeLessThanOrEqual(18);
        expect(angle).toBeLessThan(90);
        priorHeading = angle; priorSpeed = transferred;
      }
      const at = releaseShot(samples, disc, 0.7)!, after = releaseShot(samples, disc, 0.700001)!;
      expect(Math.hypot(after.x - at.x, after.y - at.y)).toBeLessThan(0.001);
    }
  });
  it('retains short-clip registration, subdivisions and true-miss rejection', () => {
    for (const offset of [-1.01, -0.99, 0.99, 1.01]) for (const divisions of [1, 20]) {
      let history: FlickSample[] = [], contact: FlickContact | null = null;
      const samples = Array.from({ length: divisions + 1 }, (_, i) => ({ x: offset * DISC.radius, y: 12.15 - 0.3 * i / divisions, t: 10 * i / divisions }));
      for (const sample of samples) {
        history = appendFlickContactSample(history, sample);
        contact = updateFlickContact(contact, history, disc);
      }
      contact = finalizeFlickContact(contact, history, disc);
      const shot = contact ? releaseShot(samples, disc, contact) : null;
      if (Math.abs(offset) > 1) expect(shot).toBeNull();
      else { expect(shot).not.toBeNull(); expect(heading(shot!)).toBeGreaterThan(50); expect(shot!.x * offset).toBeLessThan(0); }
    }
  });
});
