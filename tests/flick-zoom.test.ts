import { describe, expect, it } from 'vitest';
import { appendFlickContactSample, releaseShot, releaseVelocity, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

const disc = { x: 0, y: 12 };
// A straight stroke toward the center through the disc, slightly off-center.
function stroke(speed: number, offset = 0.15): FlickSample[] {
  const steps = Math.ceil(3 / (speed * 0.008));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: offset, y: 13.5 - i * speed * 0.008, t: i * 8 }));
}
function register(samples: FlickSample[], scale?: number) {
  let contact: FlickContact | null = null, history: FlickSample[] = [];
  for (const sample of samples) {
    history = appendFlickContactSample(history, sample);
    contact = updateFlickContact(contact, history, disc, scale);
  }
  return contact;
}

describe('zoom speed scale', () => {
  it('is exact at the default scale', () => {
    const samples = stroke(40), contact = register(samples)!;
    expect(register(samples, 1)).toEqual(contact);
    expect(releaseShot(samples, disc, contact, 1)).toEqual(releaseShot(samples, disc, contact));
  });
  it('scales finger speed before the power curve', () => {
    const samples = stroke(20), raw = releaseVelocity(samples, disc)!, scaled = releaseVelocity(samples, disc, 2)!;
    const power = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
    expect(power(scaled)).toBeCloseTo(Math.min(105, 40 * 0.8 + 12), 6);
    expect(power(raw)).toBeCloseTo(20 * 0.8 + 12, 6);
    expect(scaled.x / power(scaled)).toBeCloseTo(raw.x / power(raw), 12);
  });
  it('lets a soft shot register when zoomed in, with unchanged contact geometry', () => {
    const slow = stroke(5);
    expect(register(slow)?.powered ?? false).toBe(false);
    const zoomed = register(slow, 4)!, reference = register(stroke(20))!;
    expect(zoomed.powered).toBe(true);
    expect(zoomed.offset).toBeCloseTo(reference.offset, 12);
    expect(zoomed.direction.y).toBeCloseTo(reference.direction.y, 12);
    expect(releaseShot(slow, disc, zoomed, 4)).not.toBeNull();
  });
});
