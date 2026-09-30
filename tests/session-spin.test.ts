import { describe, expect, it } from 'vitest';
import { readMatch } from '../src/game/session';
import { makeDisc, step, type Shot } from '../src/sim/physics';

function snapshot(version = 2) {
  const d = { ...makeDisc(1, 0, 0, 9), vx: 20, spin: 8, angle: 0.4 };
  return { version, mode: 'duel', player: 0, round: 1, id: 1, discs: [d], scores: [0, 0], used: [1, 0], phase: 'moving', review: null, roundResult: null, deadline: null, paused: true, remaining: null, stagedId: 1, hadOpponent: false, shot: { touched: [1], opponentContact: false, side: 0 } };
}
describe('spin save version and migration', () => {
  it('keeps angular state and reproduces the exact resumed trajectory', () => {
    const s = snapshot(), restored = readMatch(JSON.stringify(s))!;
    expect(restored).not.toBeNull(); expect(restored.version).toBe(2);
    const originalShot: Shot = { touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n };
    const restoredShot: Shot = { ...originalShot, touched: new Set([1]) };
    for (let i = 0; i < 300; i++) { step(s.discs, 1 / 120, originalShot); step(restored.discs, 1 / 120, restoredShot); }
    expect(restored.discs).toEqual(s.discs);
  });
  it('migrates old saves and review copies to zero axial spin', () => {
    const s = snapshot(1);
    const legacy = s.discs.map(({ spin: _spin, angle: _angle, ...d }) => d);
    const review = { elapsed: 0, hold: 2000, removed: legacy, verdict: { valid: false, reason: 'opponent-missed', foulIds: [1], removalIds: [1], revokedTwenties: 0 } };
    for (const version of [undefined, 1]) {
      const restored = readMatch(JSON.stringify({ ...s, version, discs: legacy, phase: 'review', review }))!;
      expect(restored.version).toBe(2);
      expect(restored.discs[0]).toMatchObject({ spin: 0, angle: 0 });
      expect(restored.review!.removed[0]).toMatchObject({ spin: 0, angle: 0 });
    }
  });
  it('rejects missing or invalid new angular state, including removed review discs', () => {
    for (const change of [{ spin: undefined }, { angle: undefined }, { spin: 'fast' }, { angle: null }, { spin: Infinity }]) {
      const s = snapshot(); Object.assign(s.discs[0], change);
      expect(readMatch(JSON.stringify(s))).toBeNull();
    }
    const s = snapshot();
    const review = { elapsed: 0, hold: 2000, removed: [{ ...s.discs[0], spin: null }], verdict: { valid: false, reason: 'opponent-missed', foulIds: [1], removalIds: [1], revokedTwenties: 0 } };
    expect(readMatch(JSON.stringify({ ...s, phase: 'review', review }))).toBeNull();
    expect(readMatch(JSON.stringify({ ...s, version: 3 }))).toBeNull();
  });
});
