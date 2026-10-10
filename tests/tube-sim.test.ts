import { describe, expect, it } from 'vitest';
import { TUBE_CAPACITY, TUBE_DIM, TUBE_TUNE, createTube, dropDisc, nudgeTube, restHeight, stepTube, tubeCount, tubeOwners, type TubeEvent, type TubeState } from '../src/tube-sim';
import { DISC } from '../src/sim/constants';

const run = (s: TubeState, seconds: number, accel = { x: 0, z: 0 }) => {
  const events: TubeEvent[] = [];
  for (let i = 0; i < seconds * 120; i++) stepTube(s, 1 / 120, accel, e => events.push(e));
  return events;
};
const maxTilt = (s: TubeState) => Math.max(0, ...s.discs.map(d => Math.hypot(d.tx, d.tz)));

describe('stack and capacity', () => {
  it('rebuilds a settled stack silently from owners, in order', () => {
    const t = createTube([0, 0, 0]);
    expect(tubeOwners(t)).toEqual([0, 0, 0]); expect(t.awake).toBe(false);
    expect(t.discs.map(d => d.y)).toEqual([restHeight(0), restHeight(1), restHeight(2)]);
    expect(run(t, 1)).toEqual([]);
  });
  it('holds the eight discs of tournament play and refuses more', () => {
    const t = createTube(Array(TUBE_CAPACITY).fill(0));
    expect(TUBE_CAPACITY).toBe(8); expect(dropDisc(t, 0)).toBe(false); expect(tubeCount(t)).toBe(TUBE_CAPACITY);
    expect(createTube(Array(40).fill(1)).discs.length).toBe(TUBE_CAPACITY);
  });
});

describe('dropping in', () => {
  it('falls, lands on the stack with an impact and ends settled at the right height', () => {
    const t = createTube([0, 0]); dropDisc(t, 0);
    const events = run(t, 3);
    const lands = events.filter(e => e.kind === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(1); expect(lands[0].level).toBe(2);
    expect(t.discs[2].falling).toBe(false); expect(t.discs[2].y).toBeCloseTo(restHeight(2), 3);
    expect(t.awake).toBe(false);
  });
  it('lands harder from a taller fall than from a short stack, and into an empty tube', () => {
    const empty = createTube([]), tall = createTube(Array(8).fill(0));
    dropDisc(empty, 0); dropDisc(tall, 0);
    const first = (s: TubeState) => { const e = run(s, 2).find(e => e.kind === 'land'); return e ? e.speed : 0; };
    expect(first(empty)).toBeGreaterThan(first(tall));
    const mid = createTube([0, 0, 0]); dropDisc(mid, 0);
    expect(first(mid)).toBeGreaterThan(0); expect(first(mid)).toBeLessThanOrEqual(first(empty) + 1e-9);
  });
  it('never sinks through or floats above the stack while falling', () => {
    const t = createTube([1]); dropDisc(t, 0);
    for (let i = 0; i < 600; i++) { stepTube(t, 1 / 120); expect(t.discs[1].y).toBeGreaterThanOrEqual(restHeight(1) - 1e-9); expect(Math.hypot(t.discs[1].x, t.discs[1].z)).toBeLessThanOrEqual(TUBE_TUNE.play + 1e-9); }
  });
  it('is repeatable for the same seed', () => {
    const a = createTube([0], 7), b = createTube([0], 7); dropDisc(a, 1); dropDisc(b, 1);
    expect(run(a, 2)).toEqual(run(b, 2)); expect(a.discs[1].x).toBe(b.discs[1].x);
  });
});

describe('rim wobble', () => {
  const shove = (t: TubeState) => { for (let i = 0; i < 20; i++) stepTube(t, 1 / 120, { x: 120, z: 0 }); };
  it('lets a lone disc rock more than one carrying a full stack', () => {
    const one = createTube([0]), full = createTube(Array(8).fill(0));
    shove(one); shove(full);
    expect(maxTilt(one)).toBeGreaterThan(maxTilt(full) * 1.5);
  });
  it('keeps rocking for a moment when nearly empty, then settles flat and asleep', () => {
    const t = createTube([0]); shove(t);
    run(t, 0.3); expect(maxTilt(t)).toBeGreaterThan(0.003);
    run(t, 12); expect(t.awake).toBe(false); expect(maxTilt(t)).toBe(0);
  });
  it('rocks a heavier stack less and settles it sooner than a lone disc', () => {
    const settleTime = (owners: number[]) => { const t = createTube(owners); shove(t); let i = 0; for (; i < 120 * 30 && t.awake; i++) stepTube(t, 1 / 120); return i / 120; };
    expect(settleTime(Array(8).fill(0))).toBeLessThan(settleTime([0]));
  });
  it('never tilts past the tube wall', () => {
    const t = createTube([0]);
    for (let i = 0; i < 600; i++) { stepTube(t, 1 / 120, { x: 4000 * Math.sin(i / 3), z: 4000 * Math.cos(i / 4) }); expect(maxTilt(t)).toBeLessThanOrEqual(Math.SQRT2 * TUBE_TUNE.maxTiltBottom + 1e-9); }
  });
});

describe('rattle', () => {
  it('stays quiet for a slow slide and knocks for a quick shove', () => {
    const slow = createTube([0, 0, 0]), quick = createTube([0, 0, 0]);
    const slowEvents = run(slow, 1, { x: 20, z: 0 }), quickEvents = [...run(quick, 0.08, { x: 900, z: 0 }), ...run(quick, 0.08, { x: -900, z: 0 }), ...run(quick, 1)];
    expect(slowEvents.filter(e => e.kind === 'knock').length).toBe(0);
    expect(quickEvents.filter(e => e.kind === 'knock' || e.kind === 'tick').length).toBeGreaterThan(0);
  });
  it('holds loose discs in place against gentle acceleration (static friction)', () => {
    const t = createTube([0, 0]); run(t, 1, { x: 100, z: 0 });
    expect(t.discs.every(d => d.x === 0 && d.vx === 0)).toBe(true);
  });
  it('keeps every disc inside the tube however hard it is shaken', () => {
    const t = createTube([0, 1, 0, 1]);
    for (let i = 0; i < 1200; i++) { stepTube(t, 1 / 120, { x: 3000 * Math.sin(i), z: 3000 * Math.cos(i * 1.7) }); for (const d of t.discs) expect(Math.hypot(d.x, d.z)).toBeLessThanOrEqual(TUBE_TUNE.play + 1e-9); }
    for (const d of t.discs) expect(Number.isFinite(d.x + d.z + d.tx + d.tz + d.y)).toBe(true);
  });
  it('reports a clear tick or knock level and a positive speed on every event', () => {
    const t = createTube([0, 0, 0]), ev = run(t, 0.1, { x: 2500, z: 800 });
    for (const e of ev) { expect(e.speed).toBeGreaterThan(0); expect(e.level).toBeGreaterThanOrEqual(0); expect(e.level).toBeLessThan(3); }
  });
  it('wakes on nudges and sleeps again', () => {
    const t = createTube([0, 0]); nudgeTube(t, 5); expect(t.awake).toBe(true); run(t, 15); expect(t.awake).toBe(false);
  });
});

describe('geometry', () => {
  it('gives the discs sideways play and a stack that fits the tube', () => {
    expect(TUBE_TUNE.play).toBeGreaterThan(0.05); expect(TUBE_DIM.radius).toBeGreaterThan(DISC.radius);
    expect(restHeight(TUBE_CAPACITY - 1) + DISC.height / 2).toBeLessThanOrEqual(TUBE_DIM.height + 1e-9);
  });
});
