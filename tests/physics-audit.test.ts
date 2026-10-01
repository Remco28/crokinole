import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import { canStartFlick } from '../src/game/flick';

const disc = { x: 0, y: 12 };
describe('physics audit regression guards', () => {
  it('allows a flick to start anywhere on the visible active disc, including the front', () => {
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      expect(canStartFlick({ x: DISC.radius * 0.99 * Math.cos(a), y: 12 + DISC.radius * 0.99 * Math.sin(a) }, disc)).toBe(true);
    }
    expect(canStartFlick({ x: 0, y: 12 - DISC.radius - 0.05 }, disc)).toBe(false);
  });
});
