import { describe, expect, it } from 'vitest';
import { TUBE_GAP, angleFromPoint, anglesFor, pushTubes, readTubeAngles, defaultTubeAngle, normalizeAngle, parseTubePref, tubeContents, tubeSpecs, tubesVisible } from '../src/tubes';
import { makeDisc } from '../src/sim/physics';

const sunk = (id: number, owner: number, cleared = true) => { const d = makeDisc(id, owner, 0, 0); d.state = 'sunk'; d.holeCleared = cleared; return d; };
const side = (mode: 'duel' | 'teams') => (o: number) => mode === 'teams' ? o % 2 : o;

describe('tube contents', () => {
  it('holds cleared 20s by side, oldest first', () => {
    expect(tubeContents([sunk(3, 1), sunk(1, 0), sunk(2, 0)], side('duel'), 2)).toEqual([[0, 0], [1]]);
  });
  it('leaves a 20 still in the hole, and discs on the board or in the ditch, out', () => {
    const board = makeDisc(4, 0, 3, 3), out = makeDisc(5, 0, 0, 0); out.state = 'out';
    expect(tubeContents([sunk(1, 0, false), board, out], side('duel'), 2)).toEqual([[], []]);
  });
  it('puts partners in one team tube and keeps each owner for the disc look', () => {
    expect(tubeContents([sunk(1, 0), sunk(2, 2), sunk(3, 1)], side('teams'), 2)).toEqual([[0, 2], [1]]);
  });
});
describe('tube layout and setting', () => {
  it('uses saved angles over defaults and keeps defaults apart', () => {
    const specs = tubeSpecs([], 'duel', side('duel'), [1.5]);
    expect(specs[0].angle).toBe(1.5); expect(specs[1].angle).toBe(defaultTubeAngle('duel', 1));
    expect(Math.abs(defaultTubeAngle('duel', 0) - defaultTubeAngle('duel', 1))).toBeGreaterThan(1);
  });
  it('makes four tubes in free-for-all and two otherwise', () => {
    expect(tubeSpecs([], 'ffa', o => o).length).toBe(4); expect(tubeSpecs([], 'teams', side('teams')).length).toBe(2);
  });
  it('shows tubes automatically only on larger screens', () => {
    expect(tubesVisible('auto', false)).toBe(true); expect(tubesVisible('auto', true)).toBe(false);
    expect(tubesVisible('on', true)).toBe(true); expect(tubesVisible('off', false)).toBe(false);
    expect(parseTubePref('on')).toBe('on'); expect(parseTubePref('junk')).toBe('auto');
  });
  it('wraps angles into one turn', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5); expect(normalizeAngle(Math.PI * 5)).toBeCloseTo(Math.PI);
  });
});

describe('moving tubes', () => {
  it('turns a point on the board into a rim angle', () => {
    expect(angleFromPoint({ x: 0, y: 14 })).toBeCloseTo(0); expect(angleFromPoint({ x: 14, y: 0 })).toBeCloseTo(Math.PI / 2); expect(angleFromPoint({ x: 0, y: -14 })).toBeCloseTo(Math.PI);
  });
  const gapBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  it('lets a tube go anywhere that is free, leaving the others alone', () => {
    const out = pushTubes([1, 4], 0, 2.2); expect(out[0]).toBeCloseTo(2.2); expect(out[1]).toBeCloseTo(4);
  });
  it('pushes the neighbour along the rail instead of passing through it', () => {
    const out = pushTubes([1, 2], 0, 2.5);
    expect(out[0]).toBeCloseTo(2.5); expect(out[1]).toBeCloseTo(2.5 + TUBE_GAP);
  });
  it('pushes the other way when dragged from the other side', () => {
    const out = pushTubes([2, 1], 0, 0.6);
    expect(out[0]).toBeCloseTo(0.6); expect(out[1]).toBeCloseTo(0.6 - TUBE_GAP);
  });
  it('never crosses, even when the pointer jumps far past the neighbour in one move', () => {
    const out = pushTubes([1, 1.5], 0, 3);
    expect(out[0]).toBeCloseTo(3); expect(out[1]).toBeCloseTo(3 + TUBE_GAP);
    expect(out[1] - out[0]).toBeGreaterThan(0);
  });
  it('pushes a chain of tubes together, and keeps their order', () => {
    const out = pushTubes([1, 1.3, 1.45, 5], 0, 1.4);
    expect(out[0]).toBeCloseTo(1.4); expect(out[1]).toBeCloseTo(1.4 + TUBE_GAP); expect(out[2]).toBeCloseTo(1.4 + 2 * TUBE_GAP); expect(out[3]).toBeCloseTo(5);
  });
  it('does not drag a neighbour that is not in the way, or one left behind', () => {
    const out = pushTubes([2, 1.2], 0, 2.6);
    expect(out[1]).toBeCloseTo(1.2);
  });
  it('pushes across the seam at zero', () => {
    const out = pushTubes([6.1, 0.1], 0, 0.05);
    expect(gapBetween(out[0], out[1])).toBeGreaterThanOrEqual(TUBE_GAP - 1e-9); expect(out[0]).toBeCloseTo(0.05);
  });
  it('keeps every tube at least a gap apart through a long drag all the way round', () => {
    let angles = [0.5, 1.0, 1.6, 3.5], pointer = 0.5;
    for (let i = 0; i < 400; i++) {
      pointer += 0.02; angles = pushTubes(angles, 0, pointer);
      for (let a = 0; a < angles.length; a++) for (let b = a + 1; b < angles.length; b++) expect(gapBetween(angles[a], angles[b])).toBeGreaterThanOrEqual(TUBE_GAP - 1e-9);
    }
  });
  it('saves positions per mode and ignores junk', () => {
    const store = readTubeAngles({ duel: [1, 'x', 7], teams: 'no', ffa: [0.5, 1, 2, 3, 4, 5] });
    expect(anglesFor(store, 'duel')[0]).toBeCloseTo(1); expect(anglesFor(store, 'duel')[1]).toBeUndefined(); expect(anglesFor(store, 'duel')[2]).toBeCloseTo(7 - Math.PI * 2);
    expect(anglesFor(store, 'teams')).toEqual([]); expect(anglesFor(store, 'ffa').length).toBe(4);
    expect(readTubeAngles(null)).toEqual({}); expect(readTubeAngles([1, 2])).toEqual({});
  });
});

import { DROP_HOLD, DROP_MAX, dropFinished, RIM_STIFFNESS, rimFrameAccel, stepRim } from '../src/tubes';
describe('rim follower', () => {
  const settle = (from: number, to: number, seconds = 2) => { let m = { a: from, w: 0 }, peak = 0, overshoot = 0; for (let i = 0; i < seconds * 60; i++) { const r = stepRim(m, to, 1 / 60); m = r.motion; peak = Math.max(peak, Math.abs(r.accel)); overshoot = Math.max(overshoot, Math.abs(Math.atan2(Math.sin(m.a - to), Math.cos(m.a - to)))) } return { m, peak }; };
  it('arrives on the target and stops', () => {
    const { m } = settle(1, 1.4); expect(m.a).toBeCloseTo(1.4, 3); expect(Math.abs(m.w)).toBeLessThan(1e-3);
  });
  it('takes the short way around the seam', () => {
    const r = stepRim({ a: 6.2, w: 0 }, 0.1, 1 / 60); expect(r.motion.w).toBeGreaterThan(0);
  });
  it('accelerates harder for a bigger jump, and not at all when already there', () => {
    expect(settle(1, 1.5).peak).toBeGreaterThan(settle(1, 1.05).peak); expect(stepRim({ a: 2, w: 0 }, 2, 1 / 60).accel).toBe(0);
  });
  it('converts to the tube frame with the centripetal pull toward the board', () => {
    expect(rimFrameAccel(2, 0, 14.9)).toEqual({ x: 29.8, z: -0 }); expect(rimFrameAccel(0, 3, 10).z).toBeCloseTo(-90); expect(RIM_STIFFNESS).toBeGreaterThan(0);
  });
});

describe('waiting for a 20 to drop', () => {
  it('is not finished while the disc is still falling, or before anything has landed', () => {
    expect(dropFinished(1, 0, null, true)).toBe(false); expect(dropFinished(1, 0, null, false)).toBe(false); expect(dropFinished(1, 0, 0.8, true)).toBe(false);
  });
  it('holds briefly after the landing so the drop can be seen, then moves on', () => {
    expect(dropFinished(1.0 + DROP_HOLD - 0.01, 0, 1.0, false)).toBe(false); expect(dropFinished(1.0 + DROP_HOLD + 0.001, 0, 1.0, false)).toBe(true);
  });
  it('ignores a landing from before this drop began', () => {
    expect(dropFinished(5, 4, 2, false)).toBe(false);
  });
  it('never waits longer than the cap, even if nothing lands', () => {
    expect(dropFinished(DROP_MAX, 0, null, true)).toBe(true);
  });
});
