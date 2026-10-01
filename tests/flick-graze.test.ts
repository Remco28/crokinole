import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { appendFlickContactSample, finalizeFlickContact, releaseShot, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
function release(samples: FlickSample[]) {
  let contact: FlickContact | null = null, history: FlickSample[] = [];
  for (const sample of samples) {
    history = appendFlickContactSample(history, sample);
    contact = updateFlickContact(contact, history, disc);
  }
  contact = finalizeFlickContact(contact, history, disc);
  return { contact, shot: contact ? releaseShot(samples, disc, contact) : null };
}
function clip(offset: number, dt = 5) {
  return [12.15, 12, 11.85].map((y, i) => ({ x: offset * DISC.radius, y, t: i * dt }));
}
describe('release-only short edge registration', () => {
  it('recognizes sustained short mirrored edge clips without lowering the general travel span', () => {
    for (const offset of [-0.99, -0.9, 0.9, 0.99]) {
      const samples = clip(offset);
      const result = release([...samples, { ...samples[2], t: 15 }]);
      expect(result.contact?.powered).toBe(true);
      expect(result.shot).not.toBeNull();
      expect(result.shot!.x * offset).toBeLessThan(0);
    }
  });
  it('keeps the same short clip eligible through collinear subdivisions', () => {
    for (const offset of [-0.99, -0.9, 0.9, 0.99]) {
      const sparse = clip(offset), baseline = release([...sparse, { ...sparse[2], t: 15 }]);
      expect(release([sparse[0], sparse[2], { ...sparse[2], t: 15 }]).shot).toEqual(baseline.shot);
      expect(release([sparse[0], sparse[2]]).contact?.powered).toBe(true);
      for (const divisions of [5, 20]) {
        const dense = [sparse[0]];
        for (let i = 1; i < sparse.length; i++) for (let j = 1; j <= divisions; j++) {
          const a = sparse[i - 1], b = sparse[i], f = j / divisions;
          dense.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f });
        }
        const result = release([...dense, { ...dense[dense.length - 1], t: 15 }]);
        expect(result.contact?.powered).toBe(true);
        expect(result.contact!.offset).toBeCloseTo(baseline.contact!.offset, 12);
        expect(result.shot).toEqual(baseline.shot);
      }
    }
  });
  it('keeps minimum-speed edge clips eligible across subdivisions without accepting slower brushes', () => {
    for (const offset of [-0.99, 0.99]) for (const speed of [8, 8 - 1e-6]) {
      for (const divisions of [1, 5, 20, 100]) {
        const samples = Array.from({ length: divisions + 1 }, (_, i) => ({
          x: offset * DISC.radius, y: 12.125 - 0.25 * i / divisions,
          t: (0.25 / speed) * 1000 * i / divisions,
        }));
        expect(release(samples).contact?.powered).toBe(speed === 8);
        expect(release(samples).shot !== null).toBe(speed === 8);
      }
    }
  });
  it('permits a brief lift endpoint but not a held provisional clip', () => {
    const samples = clip(0.9), end = samples[2];
    expect(release([...samples, { ...end, t: end.t + 16 }]).contact?.powered).toBe(true);
    expect(release([...samples, { ...end, t: end.t + 17 }]).contact?.powered).toBe(false);
  });
  it('does not replace already-powered geometry', () => {
    const contact: FlickContact = { offset: 0.5, direction: { x: 0, y: -1 }, powered: true };
    expect(finalizeFlickContact(contact, clip(0.9), disc)).toBe(contact);
  });
  it('is release-only and rotates with the player quadrant', () => {
    for (const angle of [0, Math.PI / 2, Math.PI]) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const rotate = (p: { x: number; y: number }) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
      const samples = clip(0.9).map(p => ({ ...rotate(p), t: p.t })), target = rotate(disc);
      let history: FlickSample[] = [], contact: FlickContact | null = null;
      for (const p of samples) {
        history = appendFlickContactSample(history, p);
        contact = updateFlickContact(contact, history, target);
      }
      expect(contact?.powered).toBe(false);
      const final = finalizeFlickContact(contact, history, target)!;
      expect(final.powered).toBe(true);
      expect(final.offset).toBeCloseTo(-0.9, 12);
      expect(final.direction.x).toBeCloseTo(s, 12);
      expect(final.direction.y).toBeCloseTo(-c, 12);
    }
  });
  it('keeps tiny central wobbles and incomplete entering brushes provisional', () => {
    for (const offset of [0, 0.1, 0.5]) expect(release(clip(offset)).shot).toBeNull();
    expect(release(clip(0.9).slice(0, 2)).shot).toBeNull();
    expect(release([{ x: 0.56, y: 12.15, t: 0 }, { x: 0.61, y: 12.14, t: 2 }, { x: 0.56, y: 12.13, t: 4 }]).shot).toBeNull();
  });
  it('rejects slow, stopped, bent, outward and outside-only paths', () => {
    expect(release(clip(0.9, 50)).shot).toBeNull();
    expect(release(clip(1.01)).shot).toBeNull();
    const samples = clip(0.9);
    expect(release([samples[0], samples[1], { ...samples[1], t: 8 }, { ...samples[2], t: 13 }]).shot).toBeNull();
    expect(release([samples[0], { ...samples[1], x: 0.45 }, samples[2]]).shot).toBeNull();
    expect(release([...samples].reverse().map((p, i) => ({ ...p, t: i * 5 }))).shot).toBeNull();
    expect(release([...samples, { ...samples[2], t: 50 }]).shot).toBeNull();
    expect(release([samples[0], { ...samples[1], t: 50 }, { ...samples[2], t: 55 }]).shot).toBeNull();
    // A slow real intersection followed by fast movement just outside the rim
    // cannot borrow that miss's speed, even though its overall chord intersects.
    expect(release([{ x: 0.62, y: 12.15, t: 0 }, { x: 0.62, y: 12.02, t: 50 },
      { x: 0.63, y: 11.98, t: 55 }, { x: 0.63, y: 11.85, t: 60 }]).shot).toBeNull();
  });
});
