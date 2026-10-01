import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { appendFlickContactSample, releaseShot, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const swipe: FlickSample[] = [{ x: 0, y: 14, t: 0 }, { x: 0, y: 10, t: 100 }];
const heading = (s: { x: number; y: number }) => Math.atan2(s.x, -s.y);
function register(samples: FlickSample[], target = disc) {
  let contact: FlickContact | null = null, approach: FlickSample[] = [], trail: FlickSample[] = [];
  for (const p of samples) {
    approach = appendFlickContactSample(approach, p);
    contact = updateFlickContact(contact, approach, target);
    trail = [...trail, p].filter(s => p.t - s.t <= 120);
  }
  return { contact, shot: contact ? releaseShot(trail, target, contact) : null };
}

describe('stroke-relative central directional forgiveness', () => {
  it('preserves the incoming heading throughout a small symmetric central corridor', () => {
    for (const offset of [-0.2, -0.18, -0.1, -0.05, 0, 0.05, 0.1, 0.18, 0.2]) {
      const s = releaseShot(swipe, disc, offset)!;
      expect(s.x).toBeCloseTo(0, 12); expect(s.y).toBeLessThan(0);
    }
  });
  it('applies to real registration from any player quadrant and diagonal approach', () => {
    for (const angle of [-Math.PI / 3, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const rotate = (p: { x: number; y: number }) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
      for (const offset of [-0.18, 0, 0.18]) for (const dt of [5, 20, 60]) {
        const samples = [13.2, 12.8, 12.4, 12, 11.5, 10.5].map((y, i) => ({ ...rotate({ x: offset * DISC.radius, y }), t: i * dt }));
        const { contact, shot } = register(samples, rotate(disc));
        expect(contact?.powered).toBe(true); expect(shot).not.toBeNull();
        expect(shot!.x * c + shot!.y * s).toBeCloseTo(0, 10);
        expect(-shot!.x * s + shot!.y * c).toBeLessThan(0);
      }
    }
  });
  it('preserves diagonal incoming strokes on the same automatically placed disc', () => {
    for (const angle of [-0.4, 0, 0.4]) for (const offset of [-0.18, 0.18]) {
      const direction = { x: Math.sin(angle), y: -Math.cos(angle) };
      const samples = [-1.5, -1, -0.5, 0, 0.5, 1.5].map((along, i) => ({
        x: disc.x + direction.x * along - direction.y * offset * DISC.radius,
        y: disc.y + direction.y * along + direction.x * offset * DISC.radius, t: i * 20,
      }));
      const { contact, shot } = register(samples);
      expect(contact?.powered).toBe(true); expect(shot).not.toBeNull();
      const speed = Math.hypot(shot!.x, shot!.y);
      expect(shot!.x / speed).toBeCloseTo(direction.x, 12);
      expect(shot!.y / speed).toBeCloseTo(direction.y, 12);
    }
  });
  it('ramps deflection smoothly into unchanged outer-strike behavior', () => {
    const angles = [0.2, 0.200001, 0.25, 0.3, 0.4, 0.499999, 0.5, 0.500001, 0.7, 1]
      .map(offset => heading(releaseShot(swipe, disc, offset)!));
    expect(angles[0]).toBeCloseTo(0, 12);
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1]);
    expect(angles[1] - angles[0]).toBeLessThan(1e-8);
    expect(angles[7] - angles[5]).toBeLessThan(1e-5);
    expect(angles.at(-1)).toBeGreaterThan(angles[6]);
  });
  it('keeps the corridor tied to the incoming stroke, not the hole or release endpoint', () => {
    const direction = { x: 0.3, y: -Math.sqrt(1 - 0.3 ** 2) };
    const contact: FlickContact = { offset: 0.15, direction, powered: true };
    const shot = releaseShot([...swipe, { x: -1, y: 9, t: 120 }], disc, contact)!;
    const speed = Math.hypot(shot.x, shot.y);
    expect(shot.x / speed).toBeCloseTo(direction.x, 12);
    expect(shot.y / speed).toBeCloseTo(direction.y, 12);
    expect(shot.x).toBeGreaterThan(0); // It does not snap to the board centre.
  });
  it('retains geometric misses and slow-brush rejection rather than enlarging the hitbox', () => {
    expect(register(swipe.map(p => ({ ...p, x: DISC.radius + 0.01 }))).shot).toBeNull();
    expect(register([{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 11.3, t: 500 }, { x: 0, y: 9, t: 550 }]).shot).toBeNull();
  });
});
