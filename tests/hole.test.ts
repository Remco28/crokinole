import { describe, expect, it } from 'vitest';
import { makeDisc, moving, step, type PhysicsEvent, type Shot } from '../src/sim/physics';
import { discContactRadius, discHalfHeight, makeHoleMotion, rollingAmount } from '../src/sim/hole';
import { DISC } from '../src/sim/constants';
const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
function crossing(speed: number, offset: number, dt = 1 / 120) {
  const disc = makeDisc(1, 0, -1.5, offset); disc.vx = speed;
  const events: PhysicsEvent[] = []; const s = shot();
  for (let i = 0; i < 3 / dt && moving(disc); i++) {
    step([disc], dt, s, true, e => events.push(e));
    if (events.some(e => e.kind === 'lip')) break;
  }
  return { disc, events };
}
describe('twenty hole contact', () => {
  it('does not teleport resting discs or lift lip hangers when the pocket is occupied', () => {
    for (const radius of [0.7, 0.9, 1.1]) {
      const sunk = makeDisc(1, 0, 0, 0); sunk.state = 'sunk';
      const resting = makeDisc(2, 1, radius, 0);
      resting.hole = { ...makeHoleMotion(), dip: 0.02 };
      step([sunk, resting], 1 / 120, shot());
      expect(resting.x).toBe(radius); expect(resting.y).toBe(0);
      expect(resting.hole.dip).toBe(0.02);
      expect(moving(resting)).toBe(false);
    }
  });
  it('blocks inward motion inside the occupied footprint without a position jump', () => {
    const sunk = makeDisc(1, 0, 0, 0); sunk.state = 'sunk';
    const incoming = makeDisc(2, 1, 0.9, 0); incoming.vx = -5;
    step([sunk, incoming], 1 / 120, shot());
    // Subsequent adaptive substeps may already move it outward after impact.
    expect(Math.abs(incoming.x - 0.9)).toBeLessThanOrEqual(5 / 120);
    expect(incoming.vx).toBeGreaterThan(0);
    expect(incoming.state).toBe('board');
  });
  it('keeps a gentle twenty reachable from the actual shooting line', () => {
    const d = makeDisc(1, 0, 0, 12); d.vy = -38;
    for (let i = 0; i < 1200 && moving(d); i++) step([d], 1 / 120, shot());
    expect(d.state).toBe('sunk');
  });
  it('captures centered gentle shots after falling, rather than snapping on overlap', () => {
    const result = crossing(25, 0);
    expect(result.disc.state).toBe('sunk');
    expect(result.events.map(e => e.kind)).toEqual(['sink']);
    expect(Math.hypot(result.disc.x, result.disc.y)).toBeLessThanOrEqual(0.0625);
  });
  it('allows only one disc to claim the center hole', () => {
    const first = makeDisc(1, 0, -1.5, 0), second = makeDisc(2, 1, -1.5, 0.2);
    first.vx = 25;
    for (let i = 0; i < 600 && moving(first); i++) step([first], 1 / 120, shot());
    second.vx = 25;
    for (let i = 0; i < 600 && moving(second); i++) step([first, second], 1 / 120, shot());
    expect([first, second].filter(d => d.state === 'sunk')).toHaveLength(1);
    expect(second.x).toBeLessThan(-DISC.radius * 2);
    expect(moving(second)).toBe(false);
    // Collecting the twenty for the next turn must reopen the hole without
    // deleting the disc's scoring record.
    first.holeCleared = true;
    const third = makeDisc(3, 0, -1.5, 0); third.vx = 25;
    for (let i = 0; i < 600 && moving(third); i++) step([first, third], 1 / 120, shot());
    expect(third.state).toBe('sunk');
    expect(first.state).toBe('sunk');
  });
  it('lets a supported disc rest at the lip without awarding twenty', () => {
    const d = makeDisc(1, 0, 0.6, 0);
    for (let i = 0; i < 120; i++) step([d], 1 / 120, shot());
    expect(d.state).toBe('board'); expect(moving(d)).toBe(false);
  });
  it('deflects mirrored shots symmetrically and a centered shot never veers sideways', () => {
    const left = crossing(50, 0.35).disc, right = crossing(50, -0.35).disc;
    expect(left.vy).toBeLessThan(-1); expect(left.vy).toBeCloseTo(-right.vy, 6);
    expect(left.vx).toBeCloseTo(right.vx, 6);
    expect(crossing(80, 0).disc.vy).toBe(0);
    expect(crossing(50, 0.35)).toEqual(crossing(50, 0.35));
  });
  it('spends existing shot energy on the hop and tipping', () => {
    for (const speed of [35, 50, 80, 105]) for (const offset of [0, 0.15, 0.35, 0.55]) {
      const { disc: d, events } = crossing(speed, offset);
      // A slow centered crossing may now tip fully through the experimental
      // drop-through radius before it reaches the far lip.
      if (d.state === 'sunk') expect(events.filter(e => e.kind === 'sink')).toHaveLength(1);
      else expect(events.filter(e => e.kind === 'lip')).toHaveLength(1);
      const inertia = DISC.radius ** 2 / 4 + DISC.height ** 2 / 12;
      const energy = d.vx ** 2 + d.vy ** 2 + d.vz ** 2 + inertia * (d.hole?.tiltSpeed ?? 0) ** 2;
      expect(energy).toBeLessThan(speed ** 2);
    }
  });
  it('does not kick a disc passing above the opening', () => {
    const d = makeDisc(1, 0, -1.5, 0.2); d.vx = 100; d.z = 1; d.vz = 10;
    const events: PhysicsEvent[] = [];
    for (let i = 0; i < 5; i++) step([d], 1 / 120, shot(), true, e => events.push(e));
    expect(d.x).toBeGreaterThan(1); expect(d.vy).toBe(0);
    expect(events).toEqual([]); expect(d.vx).toBeCloseTo(100);
  });
  it('keeps lip response similar when the timestep is halved', () => {
    const a = crossing(80, 0.35).disc, b = crossing(80, 0.35, 1 / 240).disc;
    expect(Math.abs(a.vx - b.vx)).toBeLessThan(2);
    expect(Math.abs(a.vy - b.vy)).toBeLessThan(1);
    expect(Math.abs(a.vz - b.vz)).toBeLessThan(1);
  });
  it('can tip an off-center shot into a short roll, then settles', () => {
    const d = crossing(25, 0.35).disc;
    let maximumTilt = 0, rolling = false;
    for (let i = 0; i < 1200 && moving(d); i++) {
      step([d], 1 / 120, shot());
      maximumTilt = Math.max(maximumTilt, Math.abs(d.hole?.tilt ?? 0));
      rolling ||= d.z < 0.01 && rollingAmount(d) > 0.1;
    }
    if (d.state === 'sunk') expect(maximumTilt).toBeLessThanOrEqual(0.7);
    else { expect(maximumTilt).toBeGreaterThan(0.5); expect(rolling).toBe(true); expect(moving(d)).toBe(false); }
  });
  it('can send a fast skip off the playing surface', () => {
    const d = crossing(105, 0.15).disc;
    for (let i = 0; i < 600 && moving(d); i++) step([d], 1 / 120, shot());
    expect(d.state).toBe('out');
  });
  it('uses a narrower collision profile when the disc tips onto its edge', () => {
    const d = makeDisc(1, 0, 0, 5); d.hole = { ...makeHoleMotion(), tilt: 1.4, lean: 0 };
    expect(discContactRadius(d, 1, 0)).toBeLessThan(DISC.radius / 2);
    expect(discContactRadius(d, 0, 1)).toBeCloseTo(DISC.radius);
    expect(discHalfHeight(d)).toBeGreaterThan(DISC.height / 2);
  });
});
