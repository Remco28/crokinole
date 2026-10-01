import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { releaseShot, releaseVelocity, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const swipe: FlickSample[] = [{ x: 0, y: 14, t: 0 }, { x: 0, y: 10, t: 100 }];
const inertia = DISC.radius ** 2 / 2;
const energy = (s: { x: number; y: number; spin: number }) => s.x ** 2 + s.y ** 2 + inertia * s.spin ** 2;

describe('rounded finger strike', () => {
  it('preserves an exactly centered shot, but redirects parallel off-center strikes', () => {
    expect(releaseShot(swipe, disc, 0)).toEqual({ ...releaseVelocity(swipe, disc), spin: 0 });
    const side = releaseShot(swipe, disc, -0.5)!;
    const angle = Math.atan2(Math.abs(side.x), -side.y) * 180 / Math.PI;
    expect(side.x).toBeLessThan(0); expect(side.y).toBeLessThan(0);
    expect(angle).toBeGreaterThan(10); expect(angle).toBeLessThan(25);
    expect(side.spin).toBeLessThan(-10);
  });
  it('does not hide directional impact error inside the small neutral spin zone', () => {
    const side = releaseShot(swipe, disc, 0.05)!;
    expect(side.x).toBeGreaterThan(0); expect(side.y).toBeLessThan(0);
    expect(side.spin).toBe(0);
  });
  it('mirrors deflection and spin, and makes grazing contact less efficient', () => {
    const half = releaseShot(swipe, disc, 0.5)!;
    const edge = releaseShot(swipe, disc, 1)!;
    const mirror = releaseShot(swipe, disc, -1)!;
    expect(mirror.x).toBe(-edge.x); expect(mirror.y).toBe(edge.y); expect(mirror.spin).toBe(-edge.spin);
    expect(Math.atan2(edge.x, -edge.y)).toBeGreaterThan(Math.atan2(half.x, -half.y));
    expect(Math.hypot(edge.x, edge.y)).toBeLessThan(Math.hypot(half.x, half.y));
    expect(energy(edge)).toBeLessThan(energy({ ...releaseVelocity(swipe, disc)!, spin: 0 }));
  });
  it('keeps all impact energy and spin within the original launch budget', () => {
    for (const duration of [20, 70, 100, 200]) for (let offset = -1; offset <= 1; offset += 0.025) {
      const samples = swipe.map(s => ({ ...s, t: s.t ? duration : 0 }));
      const original = releaseVelocity(samples, disc), shot = releaseShot(samples, disc, offset);
      if (!original) { expect(shot).toBeNull(); continue; }
      expect(Math.abs(shot!.spin)).toBeLessThanOrEqual(18);
      expect(Math.hypot(shot!.x, shot!.y)).toBeLessThanOrEqual(105);
      expect(energy(shot!)).toBeLessThanOrEqual(original.x ** 2 + original.y ** 2 + 1e-8);
    }
  });
  it('rotates the entire strike response with the player quadrant', () => {
    const original = releaseShot(swipe, disc, 0.5)!;
    const rotated = releaseShot(swipe.map(s => ({ x: -s.y, y: s.x, t: s.t })), { x: -12, y: 0 }, 0.5)!;
    expect(rotated.x).toBeCloseTo(-original.y); expect(rotated.y).toBeCloseTo(original.x);
    expect(rotated.spin).toBeCloseTo(original.spin);
  });
});

describe('contact registration at the powered strike', () => {
  it('allows a slow center brush to develop into a deliberate side strike', () => {
    const samples: FlickSample[] = [
      { x: 0, y: 12.7, t: 0 }, { x: 0, y: 12.55, t: 200 },
      { x: 0.4, y: 12.3, t: 330 }, { x: 0.4, y: 11.5, t: 350 },
    ];
    let contact: FlickContact | null = null;
    contact = updateFlickContact(contact, samples.slice(0, 2), disc);
    expect(contact?.offset).toBe(0); expect(contact?.powered).toBe(false);
    contact = updateFlickContact(contact, samples.slice(0, 3), disc);
    expect(contact?.powered).toBe(false);
    contact = updateFlickContact(contact, samples, disc);
    expect(contact?.powered).toBe(true); expect(contact?.offset).toBeCloseTo(-0.4 / DISC.radius);
    expect(releaseShot(samples, disc, contact!)!.spin).toBeLessThan(-10);
  });
  it('freezes contact direction and offset once struck, not at the end of follow-through', () => {
    const contact = updateFlickContact(null, swipe, disc)!;
    expect(contact.powered).toBe(true);
    const hooked = [...swipe, { x: 1, y: 9, t: 120 }];
    expect(updateFlickContact(contact, hooked, disc)).toBe(contact);
    expect(releaseVelocity(hooked, disc)!.x).toBeGreaterThan(0);
    expect(releaseShot(hooked, disc, contact)!.x).toBe(0);
    expect(releaseShot(hooked, disc, contact)!.spin).toBe(0);
  });
  it('does not manufacture contact from an outward swipe or a miss', () => {
    expect(updateFlickContact(null, swipe.map(s => ({ ...s, x: 0.8 })), disc)).toBeNull();
    expect(updateFlickContact(null, [...swipe].reverse().map((s, i) => ({ ...s, t: i * 100 })), disc)).toBeNull();
  });
  it('rejects a fast miss or late acceleration after only a slow provisional brush', () => {
    const paths: FlickSample[][] = [
      [{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 12.55, t: 50 }, { x: 1, y: 12.55, t: 250 }, { x: 1, y: 10, t: 300 }],
      [{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 11.3, t: 500 }, { x: 0, y: 9, t: 550 }],
    ];
    for (const samples of paths) {
      let contact: FlickContact | null = null;
      for (let i = 2; i <= samples.length; i++) contact = updateFlickContact(contact, samples.slice(0, i), disc);
      expect(contact).not.toBeNull(); expect(contact!.powered).toBe(false);
      expect(releaseVelocity(samples, disc)).not.toBeNull();
      expect(releaseShot(samples, disc, contact!)).toBeNull();
    }
  });
  it('captures the same straight impact with coarse and dense pointer sampling', () => {
    const coarse = updateFlickContact(null, swipe.map(s => ({ ...s, x: 0.3 })), disc)!;
    const samples = [14, 13, 12.6, 12.3, 11.7, 10].map((y, i) => ({ x: 0.3, y, t: i * 20 }));
    let dense: FlickContact | null = null;
    for (let i = 2; i <= samples.length; i++) dense = updateFlickContact(dense, samples.slice(0, i), disc);
    expect(dense!.offset).toBeCloseTo(coarse.offset);
    expect(dense!.direction).toEqual(coarse.direction);
  });
});
