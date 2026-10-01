import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { appendFlickContactSample, releaseShot, releaseVelocity, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
function register(samples: FlickSample[]) {
  let contact: FlickContact | null = null, trail: FlickSample[] = [], approach: FlickSample[] = [];
  for (const sample of samples) {
    trail.push(sample); approach = appendFlickContactSample(approach, sample);
    contact = updateFlickContact(contact, approach, disc);
    trail = trail.filter(s => sample.t - s.t <= 120);
  }
  return { contact, shot: contact ? releaseShot(trail, disc, contact) : null };
}
function wobble(x: number, t = 5): FlickSample[] {
  return [{ x: 0, y: 12.6, t: 0 }, { x, y: 12.59, t },
    { x: 0, y: 12.3, t: 20 }, { x: 0, y: 11.7, t: 40 }, { x: 0, y: 11.1, t: 60 }, { x: 0, y: 10.5, t: 80 }];
}
const heading = (shot: { x: number; y: number }) => Math.atan2(shot.x, -shot.y) * 180 / Math.PI;

describe('stable near-impact registration', () => {
  it('does not let a tiny fast first movement become a powered strike', () => {
    for (const x of [-0.05, 0.05]) {
      const contact = register(wobble(x).slice(0, 2)).contact;
      expect(contact).not.toBeNull(); expect(contact!.powered).toBe(false);
    }
  });
  it('preserves centered follow-through after a mirrored initial wobble', () => {
    for (const x of [-0.05, -0.02, 0, 0.02, 0.05]) for (const t of [2, 5]) {
      const samples = wobble(x, t), { shot } = register(samples);
      expect(shot).not.toBeNull(); expect(shot!.x).toBeCloseTo(0, 10); expect(shot!.spin).toBe(0);
      expect(shot!.y).toBeCloseTo(releaseVelocity(samples, disc)!.y, 10);
    }
  });
  it('bounds the same small wobble with dense millisecond samples', () => {
    for (const x of [-0.05, 0.05]) {
      const sparse = wobble(x), dense = [sparse[0]];
      for (let i = 1; i < sparse.length; i++) {
        const a = sparse[i - 1], b = sparse[i];
        for (let t = a.t + 1; t <= b.t; t++) {
          const f = (t - a.t) / (b.t - a.t);
          dense.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t });
        }
      }
      const { shot } = register(dense);
      expect(shot).not.toBeNull(); expect(Math.abs(heading(shot!))).toBeLessThan(8);
    }
  });
  it('still registers deliberate short diagonal strikes and freezes their direction', () => {
    const samples = [{ x: 0, y: 12.6, t: 0 }, { x: 0.25, y: 12.3, t: 15 }];
    const { contact, shot } = register(samples);
    expect(contact!.powered).toBe(true); expect(Math.abs(heading(shot!))).toBeGreaterThan(5);
    expect(updateFlickContact(contact, [...samples, { x: -1, y: 11, t: 35 }], disc)).toBe(contact);
  });
  it('keeps a slow brush followed by a fast outside miss unpowered', () => {
    const { contact, shot } = register([{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 12.55, t: 50 },
      { x: 1, y: 12.55, t: 250 }, { x: 1, y: 10, t: 300 }]);
    expect(contact!.powered).toBe(false); expect(shot).toBeNull();
  });
  it('does not borrow speed from a fast approach that slowed before actual contact', () => {
    const { contact, shot } = register([{ x: 0, y: 14, t: 0 }, { x: 0, y: 12.7, t: 20 },
      { x: 0, y: 12.61, t: 40 }, { x: 1, y: 12.61, t: 200 }, { x: 1, y: 10, t: 250 }]);
    expect(contact!.powered).toBe(false); expect(shot).toBeNull();
  });
  it('retains mirrored side-strike deflection, spin and the energy ceiling', () => {
    for (const x of [0.2, 0.4, 0.6]) {
      const samples = [12.8, 12.3, 11.7, 11.1, 10.5].map((y, i) => ({ x, y, t: i * 20 }));
      const a = register(samples).shot!, b = register(samples.map(s => ({ ...s, x: -s.x }))).shot!;
      expect(a.x).toBeLessThan(0); expect(b.x).toBe(-a.x); expect(b.y).toBe(a.y); expect(b.spin).toBe(-a.spin);
      const velocity = releaseVelocity(samples, disc)!;
      expect(a.x ** 2 + a.y ** 2 + DISC.radius ** 2 / 2 * a.spin ** 2).toBeLessThanOrEqual(velocity.x ** 2 + velocity.y ** 2 + 1e-8);
    }
  });
});
