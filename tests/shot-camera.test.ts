import { describe, expect, it } from 'vitest';
import { FOLLOW, GENTLE, RETURN, movingFocus, atRest, limitFocus, parseShotCamera, settleFocus, stepFocus } from '../src/render/shot-camera';
import { makeDisc } from '../src/sim/physics';

const run = (target: { x: number; y: number }, seconds: number, tuning = GENTLE, start = atRest()) => {
  const speeds: number[] = [], jumps: number[] = []; let p = start, last = 0;
  for (let i = 0; i < seconds * 60; i++) { const n = stepFocus(p, target, 1 / 60, tuning), v = Math.hypot(n.vx, n.vy); speeds.push(v); jumps.push(Math.abs(v - last)); last = v; p = n; }
  return { p, speeds, jumps };
};
describe('gentle focus glide', () => {
  it('never exceeds the speed cap, however far the target is', () => {
    expect(Math.max(...run({ x: 0, y: 40 }, 8).speeds)).toBeLessThanOrEqual(GENTLE.maxSpeed + 1e-9);
  });
  it('ramps up and brakes: speed changes by at most the acceleration cap each frame', () => {
    const { jumps } = run({ x: 8, y: 0 }, 6);
    expect(Math.max(...jumps)).toBeLessThanOrEqual(GENTLE.maxAccel / 60 + 1e-9);
  });
  it('arrives on the target at rest without overshooting', () => {
    const { p } = run({ x: 3, y: 0 }, 10);
    expect(p.x).toBeCloseTo(3, 1); expect(Math.hypot(p.vx, p.vy)).toBeLessThan(0.05);
    let q = atRest(); for (let i = 0; i < 600; i++) { q = stepFocus(q, { x: 3, y: 0 }, 1 / 60, GENTLE); expect(q.x).toBeLessThanOrEqual(3 + 1e-9); }
  });
  it('starts from a standstill and does not move without time or when already there', () => {
    expect(stepFocus(atRest({ x: 1, y: 1 }), { x: 5, y: 5 }, 0, GENTLE)).toEqual(atRest({ x: 1, y: 1 }));
    expect(stepFocus(atRest({ x: 2, y: 2 }), { x: 2, y: 2 }, 0.1, GENTLE)).toEqual(atRest({ x: 2, y: 2 }));
    expect(run({ x: 6, y: 0 }, 0.05).speeds[0]).toBeLessThan(0.2);
  });
  it('honors a dead zone', () => {
    const tuning = { ...GENTLE, deadZone: 2 };
    expect(run({ x: 1.5, y: 0 }, 3, tuning).p.x).toBe(0);
    expect(run({ x: 5, y: 0 }, 10, tuning).p.x).toBeCloseTo(3, 1);
  });
  it('returns to the start quickly but still without a jolt', () => {
    const { p, jumps } = run({ x: 0, y: 0 }, 2, RETURN, atRest({ x: 5, y: 4 }));
    expect(Math.hypot(p.x, p.y)).toBeLessThan(0.1); expect(Math.max(...jumps)).toBeLessThanOrEqual(RETURN.maxAccel / 60 + 1e-9);
  });
});

describe('focus limits and targets', () => {
  it('keeps the focus near the waiting disc and on the board', () => {
    const near = limitFocus({ x: 0, y: -12 }, { x: 0, y: 12 }, GENTLE);
    expect(Math.hypot(near.x, near.y - 12)).toBeLessThanOrEqual(GENTLE.maxPan + 1e-9);
    const edge = limitFocus({ x: 20, y: 0 }, { x: 12, y: 0 }, { ...GENTLE, maxPan: 99 });
    expect(Math.hypot(edge.x, edge.y)).toBeLessThan(13);
  });
  it('focuses a settled disc and ignores one that left the board', () => {
    const d = makeDisc(7, 0, 2, -3);
    expect(settleFocus([d], 7)).toEqual({ x: 2, y: -3 });
    d.state = 'out'; expect(settleFocus([d], 7)).toBeNull();
    expect(settleFocus([], 7)).toBeNull();
  });
  it('defaults an unknown saved camera setting to off', () => {
    expect(parseShotCamera('gentle')).toBe('gentle'); expect(parseShotCamera('follow')).toBe('follow'); expect(parseShotCamera('wild')).toBe('off'); expect(parseShotCamera(undefined)).toBe('off');
  });
});

describe('follow camera', () => {
  const mover = (id: number, x: number, y: number, vx: number, vy: number) => { const d = makeDisc(id, 0, x, y); d.vx = vx; d.vy = vy; return d; };
  it('weights the focus toward faster discs and ignores resting ones', () => {
    const f = movingFocus([mover(1, 0, 0, 40, 0), mover(2, 10, 0, 10, 0), mover(3, 99, 99, 0, 0)])!;
    expect(f.x).toBeCloseTo(2); expect(f.y).toBeCloseTo(0);
  });
  it('has no focus when nothing is moving, or moving discs have left the board', () => {
    expect(movingFocus([mover(1, 0, 0, 0, 0)])).toBeNull();
    const out = mover(2, 5, 5, 30, 0); out.state = 'out'; expect(movingFocus([out])).toBeNull();
  });
  it('ignores action near the middle of the view and only drifts when it leaves', () => {
    expect(run({ x: 2.5, y: 0 }, 5, FOLLOW).p.x).toBe(0);
    expect(run({ x: 9, y: 0 }, 20, FOLLOW).p.x).toBeCloseTo(6, 1);
  });
  it('is slower and heavier than the settle glide', () => {
    expect(FOLLOW.maxSpeed).toBeLessThan(GENTLE.maxSpeed); expect(FOLLOW.maxAccel).toBeLessThan(GENTLE.maxAccel); expect(FOLLOW.tau).toBeGreaterThan(GENTLE.tau);
  });
  it('keeps motion smooth while the target jumps around, as discs collide', () => {
    let p = atRest(), last = 0, worst = 0;
    for (let i = 0; i < 600; i++) {
      const target = { x: Math.sin(i / 7) * 9, y: Math.cos(i / 5) * 9 }, n = stepFocus(p, target, 1 / 60, FOLLOW), v = Math.hypot(n.vx, n.vy);
      worst = Math.max(worst, Math.abs(v - last)); expect(v).toBeLessThanOrEqual(FOLLOW.maxSpeed + 1e-9); last = v; p = n;
    }
    expect(worst).toBeLessThanOrEqual(FOLLOW.maxAccel / 60 + 1e-9);
  });
});
