import { describe, expect, it } from 'vitest';
import { canStartFlick, crossesDisc, releaseVelocity } from '../src/game/flick';

describe('follow-through flicks', () => {
  const disc = { x: 0, y: 12 };
  it('detects a fast crossing from behind the rim', () => {
    expect(canStartFlick({ x: 0, y: 17 }, disc)).toBe(true);
    expect(crossesDisc([{ x: 0, y: 17, t: 0 }, { x: 0, y: 10, t: 70 }], disc)).toBe(true);
  });
  it('rejects a miss, outward crossing, or stationary tap', () => {
    expect(crossesDisc([{ x: 2, y: 17, t: 0 }, { x: 2, y: 10, t: 70 }], disc)).toBe(false);
    expect(crossesDisc([{ x: 0, y: 10, t: 0 }, { x: 0, y: 17, t: 70 }], disc)).toBe(false);
    expect(crossesDisc([{ ...disc, t: 0 }, { ...disc, t: 70 }], disc)).toBe(false);
    expect(canStartFlick({ x: 0, y: 8 }, disc)).toBe(false);
  });
  it('uses follow-through acceleration rather than the tiny approach movement', () => {
    const approach = [{ x: 0, y: 12.7, t: 0 }, { x: 0, y: 12.5, t: 50 }];
    expect(crossesDisc(approach, disc)).toBe(true);
    expect(releaseVelocity(approach, disc)?.y).toBeCloseTo(-15.2);
    expect(releaseVelocity([...approach, { x: 0, y: 9.7, t: 100 }], disc)?.y).toBeCloseTo(-36);
  });
  it('allows slow initial contact followed by a deliberate flick', () => {
    expect(crossesDisc([{ x: 0, y: 12.7, t: 0 }, { x: 0, y: 12.5, t: 500 }], disc)).toBe(true);
    expect(releaseVelocity([{ x: 0, y: 12.5, t: 500 }, { x: 0, y: 10, t: 550 }], disc)?.y).toBe(-52);
  });
  it('does not convert a stationary hold or backward finish into a shot', () => {
    expect(releaseVelocity([{ x: 0, y: 13, t: 0 }, { x: 0, y: 12, t: 500 }], disc)).toBeNull();
    expect(releaseVelocity([{ x: 0, y: 10, t: 0 }, { x: 0, y: 12, t: 50 }], disc)).toBeNull();
  });
  it('works in another quadrant and caps hard flicks', () => {
    expect(releaseVelocity([{ x: -17, y: 0, t: 0 }, { x: -10, y: 0, t: 20 }], { x: -12, y: 0 })).toEqual({ x: 105, y: 0 });
  });
});
