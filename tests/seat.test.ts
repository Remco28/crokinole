import { describe, expect, it } from 'vitest';
import { SEAT, seatedEyeHeight, seatedLimit } from '../src/render/seat';
import { SEATED_LEVEL, TILT, cameraLevel, isSeated } from '../src/render/orbit';

const radians = (degrees: number) => degrees * Math.PI / 180;

describe('the seated eye', () => {
  it('puts a tall man 18.6 inches above the playing surface', () => {
    // 17 in seat + 33.4 in seated eye height − 30 in table − 1.8 in board.
    expect(seatedEyeHeight()).toBeCloseTo(18.6, 5);
    expect(SEAT.eyeAboveSeat).toBe(33.4);
  });
  it('lets the limit move when the body or the furniture changes', () => {
    const taller = seatedLimit(42, { ...SEAT, eyeAboveSeat: 34.2 });
    expect(taller).toBeLessThan(seatedLimit(42));
    const higherTable = seatedLimit(42, { ...SEAT, tableHeight: 32 });
    expect(higherTable).toBeGreaterThan(seatedLimit(42));
  });
});

describe('camera stops and the one-cheek rule', () => {
  const tableDistance = 42;
  it('stands above the seated eye and sits once the camera drops to it', () => {
    const limit = seatedLimit(tableDistance);
    expect(isSeated(0, limit - 0.01, tableDistance)).toBe(false);
    expect(isSeated(0, limit, tableDistance)).toBe(true);
    // Table is 62° from vertical. The eased limit sits near 51°, so the Table
    // view is seated with room to lean back, and Overview is standing.
    expect(TILT.table).toBeGreaterThan(limit);
    expect(TILT.overview).toBeLessThan(limit);
  });
  it('keeps the level fallback at the Table stop', () => {
    expect(SEATED_LEVEL).toBe(1);
    expect(isSeated(cameraLevel(TILT.overview, 0))).toBe(false);
    expect(isSeated(cameraLevel(TILT.table, 0))).toBe(true);
    // Moving in close behind the disc is still seated, however high the tilt.
    expect(isSeated(cameraLevel(TILT.overview, 1))).toBe(true);
  });
  it('eases the limit by 20%, so a lean back still counts as seated', () => {
    const strict = Math.acos(18.6 / 42);
    expect(seatedLimit(42)).toBeCloseTo(strict * 0.8, 5);
    expect(seatedLimit(42)).toBeCloseTo(radians(50.97), 2);
  });
});
