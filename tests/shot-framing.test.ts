import { describe, expect, it } from 'vitest';
import { SHOT_VIEW, cameraPose, shotCloseness, shownZoom } from '../src/render/shot-framing';

const base = { yaw: 0, polar: 25 * Math.PI / 180, polarOffset: 0, distance: 100, disc: { x: 0, y: 12 } };
describe('shooter view', () => {
  it('maps pinch zoom to closeness from the default to the maximum', () => {
    expect(shotCloseness(0.75)).toBe(0);
    expect(shotCloseness(SHOT_VIEW.startZoom)).toBe(0);
    expect(shotCloseness(SHOT_VIEW.maxZoom)).toBe(1);
    // Equal pinch ratios move equally far, like a lens zoom.
    const a = shotCloseness(1.5) - shotCloseness(1.2), b = shotCloseness(3) - shotCloseness(2.4);
    expect(a).toBeCloseTo(b, 12);
  });
  it('keeps the existing overview pose at closeness zero', () => {
    const { eye, target } = cameraPose({ ...base, closeness: 0 });
    expect(target).toEqual({ x: 0, y: 0, z: 0 });
    expect(eye.x).toBe(0);
    expect(eye.y).toBe(Math.cos(base.polar) * 100);
    expect(eye.z).toBe(Math.sin(base.polar) * 100);
  });
  it('puts the eye low behind the disc, looking past it toward the center', () => {
    const { eye, target } = cameraPose({ ...base, closeness: 1 });
    expect(target).toEqual({ x: 0, y: 0, z: 12 - SHOT_VIEW.lead });
    expect(eye.z).toBeGreaterThan(12); // Behind the disc, on the player's side.
    expect(eye.y).toBeCloseTo(Math.cos(SHOT_VIEW.nearPolar) * SHOT_VIEW.nearDistance, 12);
  });
  it('moves continuously and monotonically as the pinch closes in', () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map(closeness => cameraPose({ ...base, closeness }).eye.y);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]);
  });
  it('orbits around the disc and tilts with view drags, within limits', () => {
    const side = cameraPose({ ...base, yaw: Math.PI / 2, disc: { x: 12, y: 0 }, closeness: 1 });
    expect(side.target.x).toBeCloseTo(12 - SHOT_VIEW.lead, 12); expect(side.target.z).toBeCloseTo(0, 12);
    const low = cameraPose({ ...base, polarOffset: 1, closeness: 1 }).eye.y;
    expect(low).toBeCloseTo(Math.cos(SHOT_VIEW.maxNearPolar) * SHOT_VIEW.nearDistance, 12);
  });
  it('uses the default lens in the shooter view and caps the overview lens', () => {
    expect(shownZoom(4, true)).toBe(SHOT_VIEW.startZoom);
    expect(shownZoom(1, true)).toBe(1);
    expect(shownZoom(4, false)).toBe(SHOT_VIEW.overviewMaxZoom);
  });
});
