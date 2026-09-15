import { describe, expect, it } from 'vitest';
import { centeredOrbit, dragOrbit } from '../src/render/orbit';
describe('quadrant-limited camera', () => {
  it('stops repeated drags at each side of the 90-degree shooting quadrant', () => {
    let angle = centeredOrbit('seated');
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, 0.1, 0, 'seated');
    expect(angle.offset).toBe(-Math.PI / 4);
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, -0.1, 0, 'seated');
    expect(angle.offset).toBe(Math.PI / 4);
  });
  it('lets the camera move back immediately after reaching the boundary', () => {
    const edge = dragOrbit(centeredOrbit('seated'), 10, 0, 'seated');
    expect(dragOrbit(edge, -0.1, 0, 'seated').offset).toBeCloseTo(-Math.PI / 4 + 0.1);
  });
  it('keeps seated and standing elevation within their respective ranges', () => {
    for (const view of ['seated', 'standing'] as const) {
      const top = dragOrbit(centeredOrbit(view), 0, -100, view).polar;
      const bottom = dragOrbit(centeredOrbit(view), 0, 100, view).polar;
      expect(top * 180 / Math.PI).toBeCloseTo(view === 'seated' ? 48 : 20);
      expect(bottom * 180 / Math.PI).toBeCloseTo(view === 'seated' ? 68 : 40);
    }
  });
});
