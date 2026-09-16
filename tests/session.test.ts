import { describe, expect, it } from 'vitest';
import { readMatch, type SavedMatch } from '../src/game/session';
import { remainingTime, resumeDeadline } from '../src/game/clock';
import { makeDisc, step, type Shot } from '../src/sim/physics';

const snapshot = (): SavedMatch => ({ version: 1, mode: 'duel', player: 0, round: 1, id: 1, discs: [makeDisc(1, 0, 0, 12)], scores: [0, 0], used: [0, 0], phase: 'aim', review: null, roundResult: null, deadline: 60000, paused: true, remaining: 32000, stagedId: 1, hadOpponent: false, shot: null });
describe('saved table and pause', () => {
  it('keeps the exact clock budget through a long pause, including off and expired clocks', () => {
    expect(resumeDeadline(remainingTime(60000, 28000), 100000)).toBe(132000);
    expect(resumeDeadline(remainingTime(null, 28000), 100000)).toBeNull();
    expect(resumeDeadline(remainingTime(10000, 28000), 100000)).toBe(100000);
  });
  it('preserves a paused placed disc and clock across reload', () => {
    const s = snapshot(); s.discs[0].x = 3;
    expect(readMatch(JSON.stringify(s))).toEqual(s);
  });
  it('restores in-flight physics and shot contact history without changing the result', () => {
    const s = snapshot(); s.phase = 'moving'; s.discs[0].vy = -38; s.used[0] = 1;
    s.shot = { touched: [1], opponentContact: false, side: 0 };
    const originalShot: Shot = { ...s.shot, touched: new Set([1]), sideOf: n => n };
    for (let i = 0; i < 25; i++) step(s.discs, 1 / 120, originalShot);
    const restored = readMatch(JSON.stringify(s))!;
    const restoredShot: Shot = { ...restored.shot!, touched: new Set(restored.shot!.touched), sideOf: n => n };
    for (let i = 0; i < 300; i++) { step(s.discs, 1 / 120, originalShot); step(restored.discs, 1 / 120, restoredShot); }
    expect(restored.discs).toEqual(s.discs);
    expect(restoredShot).toMatchObject({ touched: originalShot.touched, opponentContact: originalShot.opponentContact });
  });
  it('migrates a valid older save', () => {
    const s = { ...snapshot(), version: undefined, phase: 'pass', paused: undefined, remaining: undefined, stagedId: undefined };
    expect(readMatch(JSON.stringify(s))).toMatchObject({ version: 1, paused: false, stagedId: null });
  });
  it('rejects saves that can crash scoring, rendering, or shot resolution', () => {
    for (const change of [ { version: 2 }, { scores: [0] }, { used: [13, 0] }, { player: 4 }, { discs: [makeDisc(1, 3, 0, 12)] }, { phase: 'moving', shot: null }, { phase: 'review', review: {} }, { phase: 'won', roundResult: null }, { stagedId: 7 } ]) {
      expect(readMatch(JSON.stringify({ ...snapshot(), ...change }))).toBeNull();
    }
    expect(readMatch('broken JSON')).toBeNull();
  });
});
