import { describe, expect, it } from 'vitest';
import { makeDisc, moving, step, type Shot } from '../src/sim/physics';
import { points, resolveShot, roundScore } from '../src/game/rules';
const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
describe('scoring and legal shots', () => {
  it('scores line touches in the lower ring', () => {
    expect(points(makeDisc(1, 0, 3, 0))).toBe(15);
    expect(points(makeDisc(1, 0, 3.375, 0))).toBe(10);
    expect(points(makeDisc(1, 0, 7.375, 0))).toBe(5);
    expect(points(makeDisc(1, 0, 11.375, 0))).toBe(0);
  });
  it('requires the shot to reach the inner ring on an open board', () => {
    const d = makeDisc(1, 0, 6, 0); expect(resolveShot([d], shot(), false)).toBe(false); expect(d.state).toBe('out');
    const good = makeDisc(1, 0, 4.5, 0); expect(resolveShot([good], shot(), false)).toBe(true);
  });
  it('accepts opponent contact without requiring an inner-ring finish', () => {
    const s = shot(); s.opponentContact = true; expect(resolveShot([makeDisc(1, 0, 7, 0)], s, true)).toBe(true);
  });
  it('revokes a sunk twenty on a foul and leaves untouched discs', () => {
    const a = makeDisc(1, 0, 0, 0); a.state = 'sunk'; const b = makeDisc(2, 0, 2, 0);
    resolveShot([a, b], shot(), true); expect(points(a)).toBe(0); expect(b.state).toBe('board');
  });
  it('awards differential points to teams and individual totals in FFA', () => {
    const discs = [makeDisc(1, 0, 2, 0), makeDisc(2, 2, 2, 1), makeDisc(3, 1, 6, 0)];
    expect(roundScore(discs, 'teams')).toEqual([20, 0]); expect(roundScore(discs, 'ffa')).toEqual([15, 10, 15, 0]);
  });
});
describe('physics', () => {
  it('captures a slow central shot and lets a fast shot pass', () => {
    const slow = makeDisc(1, 0, 0.2, 0); slow.vx = -5; step([slow], 1 / 120, shot()); expect(slow.state).toBe('sunk');
    const fast = makeDisc(1, 0, 0.2, 0); fast.vx = 80; step([fast], 1 / 120, shot()); expect(fast.state).toBe('board');
  });
  it('reflects fast peg hits without tunneling', () => {
    const d = makeDisc(1, 0, 6, 0); d.vx = -100;
    for (let i = 0; i < 3; i++) step([d], 1 / 120, shot(), false);
    expect(d.vx).toBeGreaterThan(0); expect(d.x).toBeGreaterThan(4);
  });
  it('transfers momentum and records opponent contact', () => {
    const a = makeDisc(1, 0, 0, 6), b = makeDisc(2, 1, 1.3, 6); a.vx = 50; const s = shot();
    step([a, b], 1 / 120, s, false); expect(b.vx).toBeGreaterThan(30); expect(s.opponentContact).toBe(true); expect(s.touched.has(2)).toBe(true);
  });
  it('settles deterministically and removes ditch discs', () => {
    const run = () => { const d = makeDisc(1, 0, 0, 10); d.vy = -20; for (let i = 0; i < 240; i++) step([d], 1 / 120, shot()); return d; };
    expect(run()).toEqual(run()); expect(moving(run())).toBe(false);
    const d = makeDisc(1, 0, 12.9, 0); d.vx = 50; step([d], 1 / 120, shot()); expect(d.state).toBe('out');
  });
});
