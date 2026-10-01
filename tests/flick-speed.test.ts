import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { appendFlickContactSample, FLICK_STRIKE, releaseShot, releaseVelocity, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const points = [{ x: 0, y: 12.6 }, { x: 0.06, y: 12.59 }, { x: 0.12, y: 12.57 },
  { x: 0, y: 12.4 }, { x: 0, y: 12.1 }, { x: 0, y: 11.5 }, { x: 0, y: 10.5 }];
function register(samples: FlickSample[], target = disc) {
  let contact: FlickContact | null = null;
  let approach: FlickSample[] = [];
  for (const sample of samples) {
    approach = appendFlickContactSample(approach, sample);
    contact = updateFlickContact(contact, approach, target);
  }
  const trail = samples.filter(s => samples[samples.length - 1].t - s.t <= 120);
  return { contact, shot: contact ? releaseShot(trail, target, contact) : null };
}
function samplePath(dt: number, divisions: number, mirror = 1) {
  const samples = [{ ...points[0], t: 0 }];
  for (let i = 1; i < points.length; i++) for (let j = 1; j <= divisions; j++) {
    const a = points[i - 1], b = points[i], f = j / divisions;
    samples.push({ x: mirror * (a.x + (b.x - a.x) * f), y: a.y + (b.y - a.y) * f, t: (i - 1 + f) * dt });
  }
  return samples;
}
const heading = (s: { x: number; y: number }) => Math.atan2(s.x, -s.y) * 180 / Math.PI;

describe('distance-based flick aim across speeds', () => {
  it('keeps an imperfect centered path centered at gentle and hard speeds, sparse and dense', () => {
    for (const dt of [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120]) for (const divisions of [1, 5, 20]) for (const mirror of [-1, 1]) {
      const samples = samplePath(dt, divisions, mirror), { contact, shot } = register(samples);
      expect(contact?.powered, `dt=${dt}, divisions=${divisions}, mirror=${mirror}`).toBe(true);
      expect(shot).not.toBeNull();
      expect(Math.abs(heading(shot!)), `dt=${dt}, divisions=${divisions}, mirror=${mirror}`).toBeLessThan(2);
      expect(shot!.spin).toBe(0);
      const velocity = releaseVelocity(samples, disc)!;
      expect(Math.hypot(shot!.x, shot!.y)).toBeCloseTo(Math.hypot(velocity.x, velocity.y), 8);
    }
  });
  it('keeps the same centered approach accurate in every player quadrant', () => {
    for (const dt of [10, 25, 50]) for (let quadrant = 0; quadrant < 4; quadrant++) {
      const angle = quadrant * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
      const rotate = (p: { x: number; y: number }) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
      const samples = samplePath(dt, 5).map(p => ({ ...rotate(p), t: p.t }));
      const { shot } = register(samples, rotate(disc));
      expect(shot).not.toBeNull();
      const local = { x: shot!.x * c + shot!.y * s, y: -shot!.x * s + shot!.y * c };
      expect(Math.abs(heading(local))).toBeLessThan(2); expect(shot!.spin).toBe(0);
    }
  });
  it('does not move the aim anchor when slow preparation becomes powered inside the disc', () => {
    for (const dt of [80, 100, 120]) for (const mirror of [-1, 1]) {
      const coarse = register(samplePath(dt, 1, mirror));
      for (const divisions of [5, 20]) {
        const dense = register(samplePath(dt, divisions, mirror));
        expect(coarse.contact?.powered).toBe(true); expect(dense.contact?.powered).toBe(true);
        expect(heading(dense.shot!)).toBeCloseTo(heading(coarse.shot!), 10);
        expect(dense.contact!.offset).toBeCloseTo(coarse.contact!.offset, 10);
        expect(dense.shot!.spin).toBe(coarse.shot!.spin);
      }
    }
  });
  it('retains physical side-strike geometry and spin at gentle and hard speeds', () => {
    for (const x of [-0.4, 0.4]) for (const dt of [5, 20, 50]) {
      const samples = [14, 13, 12.8, 12.3, 11.7, 11.1, 10.5].map((y, i) => ({ x, y, t: i * dt }));
      const { contact, shot } = register(samples);
      expect(contact?.powered).toBe(true); expect(contact!.offset).toBeCloseTo(-x / DISC.radius);
      expect(contact!.direction).toEqual({ x: 0, y: -1 }); expect(shot!.x * x).toBeLessThan(0);
      expect(shot!.spin * x).toBeLessThan(0);
      const v = releaseVelocity(samples, disc)!;
      expect(shot!.x ** 2 + shot!.y ** 2 + DISC.radius ** 2 / 2 * shot!.spin ** 2).toBeLessThanOrEqual(v.x ** 2 + v.y ** 2 + 1e-8);
    }
  });
  it('does not let slow preparation dilute the speed of a real powered crossing', () => {
    const samples = [{ x: 0, y: 12.8, t: 0 }, { x: 0, y: 12.7, t: 70 }, { x: 0, y: 12.3, t: 110 }, { x: 0, y: 11.5, t: 160 }];
    const { contact, shot } = register(samples);
    expect(contact?.powered).toBe(true); expect(shot!.x).toBe(0); expect(shot!.spin).toBe(0);
  });
  it('retains spatial approach samples older than the release-power window', () => {
    let approach: FlickSample[] = [];
    for (const sample of [{ x: 0, y: 14, t: 0 }, { x: 0, y: 13.5, t: 100 }, { x: 0, y: 13, t: 200 },
      { x: 0, y: 12.8, t: 250 }, { x: 0, y: 12.3, t: 290 }]) approach = appendFlickContactSample(approach, sample);
    expect(approach[0].t).toBeLessThan(290 - 120);
    expect(updateFlickContact(null, approach, disc)?.direction).toEqual({ x: 0, y: -1 });
  });
  it('trims by traveled distance and bounds stationary duplicate events', () => {
    let approach: FlickSample[] = [];
    for (let i = 0; i < 1000; i++) approach = appendFlickContactSample(approach, { x: 0, y: 14, t: i });
    expect(approach).toEqual([{ x: 0, y: 14, t: 0 }, { x: 0, y: 14, t: 999 }]);
    for (let i = 1; i <= 40; i++) approach = appendFlickContactSample(approach, { x: 0, y: 14 - i * 0.1, t: 999 + i });
    expect(approach.length).toBeLessThan(16);
    expect(approach[0].y - approach[approach.length - 1].y).toBeGreaterThanOrEqual(FLICK_STRIKE.approachDistance);
  });
  it('keeps a coarse swipe launched from the disc center valid', () => {
    const { contact, shot } = register([{ ...disc, t: 0 }, { x: 0, y: 10.5, t: 50 }]);
    expect(contact?.powered).toBe(true); expect(shot!.x).toBe(0); expect(shot!.spin).toBe(0);
  });
  it('preserves approach history before a coarse overshoot and matches a collinear subdivision', () => {
    for (const mirror of [-1, 1]) {
      const coarse = [{ x: mirror * 0.5, y: 13.5, t: 0 }, { x: 0, y: 12.8, t: 20 }, { x: 0, y: 11.5, t: 60 }];
      const dense = [...coarse.slice(0, 2), { x: 0, y: 12, t: 20 + 40 * 0.8 / 1.3 }, coarse[2]];
      const a = register(coarse), b = register(dense);
      expect(a.contact?.powered).toBe(true); expect(b.contact?.powered).toBe(true);
      expect(a.contact!.direction.x).toBeCloseTo(b.contact!.direction.x, 12);
      expect(a.contact!.direction.y).toBeCloseTo(b.contact!.direction.y, 12);
      expect(a.contact!.offset).toBeCloseTo(b.contact!.offset, 12);
      expect(heading(a.shot!)).toBeCloseTo(heading(b.shot!), 10);
    }
  });
  it('registers a continuous powered stroke starting on the front face with dense samples', () => {
    const samples = Array.from({ length: 17 }, (_, i) => ({ x: 0, y: 11.6 - i * 0.05, t: i * 3 }));
    const { contact, shot } = register(samples);
    expect(contact?.powered).toBe(true); expect(shot).not.toBeNull();
    expect(shot!.x).toBe(0); expect(shot!.spin).toBe(0);
  });
  it('never turns a slow or interrupted front-face brush into a fast outside launch', () => {
    const paths = [
      [{ x: 0, y: 11.6, t: 0 }, { x: 0, y: 11.55, t: 50 }, { x: 1, y: 11.55, t: 250 }, { x: 1, y: 10, t: 300 }],
      [{ x: 0, y: 11.6, t: 0 }, { x: 0, y: 11.4, t: 12 }, { x: 0, y: 11.3, t: 212 }, { x: 0, y: 10.5, t: 232 }],
      [{ x: 0, y: 11.6, t: 0 }, { x: 0, y: 11.37, t: 14 }, { x: 0, y: 11.37, t: 24 }, { x: 0, y: 11.1, t: 40 }],
      [{ x: 0, y: 11.6, t: 0 }, { x: 0, y: 11.55, t: 3 }, { x: 0.4, y: 11.7, t: 23 }, { x: 1, y: 11.7, t: 43 }, { x: 1, y: 10, t: 63 }],
    ];
    for (const samples of paths) {
      const { contact, shot } = register(samples);
      expect(contact?.powered).toBe(false); expect(shot).toBeNull();
    }
  });
});
