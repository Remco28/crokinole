import { describe, expect, it } from 'vitest';
import { SEATED_LEVEL, TILT, cameraLevel, centeredOrbit, dragOrbit, isSeated, nearestStop } from '../src/render/orbit';
describe('quadrant-limited camera', () => {
  it('stops repeated drags at each side of the 90-degree shooting quadrant', () => {
    let angle = centeredOrbit();
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, 0.1, 0);
    expect(angle.offset).toBe(-Math.PI / 4);
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, -0.1, 0);
    expect(angle.offset).toBe(Math.PI / 4);
  });
  it('lets the camera move back immediately after reaching the boundary', () => {
    const edge = dragOrbit(centeredOrbit(), 10, 0);
    expect(dragOrbit(edge, -0.1, 0).offset).toBeCloseTo(-Math.PI / 4 + 0.1);
  });
  it('tilts continuously from the overview to seated eye level by drag alone', () => {
    let angle = centeredOrbit(TILT.overview);
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, 0, 0.02);
    expect(angle.polar).toBe(TILT.max);
    for (let i = 0; i < 100; i++) angle = dragOrbit(angle, 0, -0.02);
    expect(angle.polar).toBe(TILT.min);
  });
});
describe('camera stops and the one-cheek rule', () => {
  it('places Overview, Table and Shooter at levels 0, 1 and 2', () => {
    expect(cameraLevel(TILT.overview, 0)).toBe(0);
    expect(cameraLevel(TILT.table, 0)).toBe(1);
    expect(cameraLevel(TILT.table, 1)).toBe(2);
    expect(cameraLevel(TILT.min, 0)).toBe(0); expect(cameraLevel(TILT.max, 0)).toBe(1);
  });
  it('names the nearest stop', () => {
    expect([0, 0.49, 0.5, 1.49, 1.5, 2].map(nearestStop)).toEqual(['overview', 'overview', 'table', 'table', 'shooter', 'shooter']);
  });
  it('stands at Overview and sits from halfway down, or when moved in close', () => {
    expect(isSeated(cameraLevel(TILT.overview, 0))).toBe(false);
    expect(isSeated(cameraLevel(TILT.table, 0))).toBe(true);
    expect(isSeated(SEATED_LEVEL)).toBe(true);
    expect(isSeated(cameraLevel(TILT.overview, 0.6))).toBe(true);
  });
});
