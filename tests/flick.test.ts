import { describe, expect, it } from 'vitest';
import { canStartFlick, flickContact } from '../src/game/flick';

describe('finger flick contact', () => {
  const disc = { x: 0, y: 12 };
  it('accepts a start outside the rim and catches a fast pass through the disc', () => {
    expect(canStartFlick({ x: 0, y: 17 }, disc)).toBe(true);
    expect(flickContact([{ x: 0, y: 17, t: 0 }, { x: 0, y: 10, t: 70 }], disc)).toEqual({ x: 0, y: -80 });
  });
  it('does not launch on a miss, outward sweep, or a stationary tap', () => {
    expect(flickContact([{ x: 2, y: 17, t: 0 }, { x: 2, y: 10, t: 70 }], disc)).toBeNull();
    expect(flickContact([{ x: 0, y: 10, t: 0 }, { x: 0, y: 17, t: 70 }], disc)).toBeNull();
    expect(flickContact([{ ...disc, t: 0 }, { ...disc, t: 70 }], disc)).toBeNull();
    expect(canStartFlick({ x: 0, y: 8 }, disc)).toBe(false);
  });
  it('ignores a pause and scales strength with speed without a minimum power jump', () => {
    expect(flickContact([{ x: 0, y: 13, t: 0 }, { x: 0, y: 12, t: 500 }], disc)).toBeNull();
    expect(flickContact([{ x: 0, y: 12.7, t: 0 }, { x: 0, y: 12.5, t: 50 }], disc)?.y).toBeCloseTo(-3.2);
  });
  it('works from another player quadrant and caps hard flicks', () => {
    expect(flickContact([{ x: -17, y: 0, t: 0 }, { x: -10, y: 0, t: 10 }], { x: -12, y: 0 })).toEqual({ x: 105, y: 0 });
  });
});
