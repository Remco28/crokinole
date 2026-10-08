import { describe, expect, it } from 'vitest';
import { SHOT_FRAMING, shotFocus, shownZoom } from '../src/render/shot-framing';

describe('shot framing', () => {
  const disc = { x: 0, y: 12 };
  it('keeps the centered overview without a waiting disc or at default zoom', () => {
    expect(shotFocus(null, 4, 10)).toEqual({ x: 0, y: 0 });
    expect(shotFocus(disc, SHOT_FRAMING.startZoom, 10)).toEqual({ x: 0, y: 0 });
    expect(shotFocus(disc, 0.75, 10)).toEqual({ x: 0, y: 0 });
  });
  it('leads the view inward of the disc once fully zoomed, leaving room behind it', () => {
    const focus = shotFocus(disc, SHOT_FRAMING.fullZoom, 10);
    expect(focus.x).toBeCloseTo(0, 12);
    expect(focus.y).toBeCloseTo(12 - 10 * SHOT_FRAMING.lead, 12);
    expect(shotFocus(disc, 5, 10)).toEqual(focus);
  });
  it('slides smoothly between the overview and full framing', () => {
    const ys = [1.2, 1.4, 1.7, 2, 2.2].map(zoom => shotFocus(disc, zoom, 10).y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });
  it('follows the disc around the board and never leads past the center', () => {
    const side = shotFocus({ x: -12, y: 0 }, 3, 10);
    expect(side.x).toBeCloseTo(-12 + 10 * SHOT_FRAMING.lead, 12); expect(side.y).toBeCloseTo(0, 12);
    expect(shotFocus({ x: 0, y: 2 }, 3, 100)).toEqual({ x: 0, y: 0 });
  });
  it('caps zoom at the overview limit away from a shot', () => {
    expect(shownZoom(5, true)).toBe(5);
    expect(shownZoom(5, false)).toBe(SHOT_FRAMING.overviewMaxZoom);
    expect(shownZoom(1.2, false)).toBe(1.2);
  });
});
