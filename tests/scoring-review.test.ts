import { describe, expect, it } from 'vitest';
import { completeRound, inspectShot, points, roundBreakdown } from '../src/game/rules';
import { assignDitchSlots, beginReview, reviewDuration } from '../src/game/review';
import { makeDisc, step, type Disc, type Shot } from '../src/sim/physics';
import { BOARD, DISC } from '../src/sim/constants';
import { DITCH_SLOTS } from '../src/game/review';

const shot = (ids = [1]): Shot => ({ touched: new Set(ids), opponentContact: false, side: 0, sideOf: n => n });
const twenty = (id: number, owner: number): Disc => ({ ...makeDisc(id, owner, 0, 0), state: 'sunk' });
// Hand-counted round: Coral 2 twenties + 15 + 10 = 65; Blue 20 + 15 + 5 = 40.
function exampleRound() {
  return [twenty(1, 0), twenty(2, 0), makeDisc(3, 0, 2, 0), makeDisc(4, 0, 6, 0), twenty(5, 1), makeDisc(6, 1, 2, 1), makeDisc(7, 1, 10, 0)];
}
describe('round scoring audit', () => {
  it('awards a hand-counted 65–40 round as +25–0', () => {
    const result = completeRound(exampleRound(), 'duel', [30, 45]);
    expect(result.sides).toEqual([
      { twenties: 2, fifteens: 1, tens: 1, fives: 0, total: 65, awarded: 25 },
      { twenties: 1, fifteens: 1, tens: 0, fives: 1, total: 40, awarded: 0 },
    ]);
    expect(result.before).toEqual([30, 45]); expect(result.after).toEqual([55, 45]); expect(result.winner).toBeNull();
  });
  it('combines opposite partners before calculating the difference', () => {
    const discs = exampleRound(); discs[1].owner = 2; discs[3].owner = 2; discs[6].owner = 3;
    expect(completeRound(discs, 'teams', [90, 30]).after).toEqual([115, 30]);
    expect(completeRound(discs, 'teams', [90, 30]).winner).toBe(0);
  });
  it('awards neither side on a tied conventional round', () => {
    expect(completeRound([twenty(1, 0), twenty(2, 1)], 'duel', [90, 85]).after).toEqual([90, 85]);
  });
  it('adds FFA totals independently and continues a tied lead above 100', () => {
    const discs = [twenty(1, 0), twenty(2, 1), makeDisc(3, 2, 6, 0), makeDisc(4, 3, 10, 0)];
    const result = completeRound(discs, 'ffa', [90, 90, 30, 40]);
    expect(result.after).toEqual([110, 110, 40, 45]); expect(result.winner).toBeNull();
  });
  it('distinguishes the flat bottom touching a line from its rounded overhang', () => {
    expect(points(makeDisc(1, 0, 3.375, 0))).toBe(15);
    expect(points(makeDisc(1, 0, 3.40624, 0))).toBe(15);
    expect(points(makeDisc(1, 0, 3.40625, 0))).toBe(10);
    expect(points(makeDisc(1, 0, 3.40626, 0))).toBe(10);
  });
  it('keeps an outer-line disc hittable until the shot settles', () => {
    const target = makeDisc(2, 1, 11.5, 0), shooter = makeDisc(1, 0, 11.5, -1.3); shooter.vy = 50;
    const s = shot(); step([shooter, target], 1 / 120, s, false);
    expect(target.state).toBe('board'); expect(target.vy).toBeGreaterThan(0); expect(s.opponentContact).toBe(true);
  });
});
describe('shot review and ditch', () => {
  it('cancels only the current shot’s invalid twenty and preserves earlier twenties', () => {
    const discs = [twenty(1, 0), twenty(2, 0), makeDisc(3, 1, 6, 0)];
    const review = beginReview(discs, inspectShot(discs, shot(), true));
    expect(review.verdict.revokedTwenties).toBe(1); expect(review.removed.map(d => d.id)).toEqual([1]);
    expect(review.removed[0].state).toBe('sunk'); expect(discs[0].state).toBe('out');
    expect(roundBreakdown(discs, 'duel')[0].total).toBe(20);
    expect(review.hold).toBe(2000); expect(reviewDuration(review)).toBe(2650);
  });
  it('preserves identities and totals across a saved/reloaded review', () => {
    const discs = exampleRound(), review = beginReview(discs, inspectShot(discs, shot([1, 3]), true));
    assignDitchSlots(discs);
    const saved = JSON.parse(JSON.stringify({ discs, review, scores: [40, 20] }));
    expect(saved.review.removed.map((d: Disc) => d.id)).toEqual([1, 3]);
    expect(completeRound(saved.discs, 'duel', saved.scores).after).toEqual([40, 30]);
    expect(saved.discs.filter((d: Disc) => d.state === 'out').every((d: Disc) => d.ditchSlot !== undefined)).toBe(true);
  });
  it('gives ordinary valid shots a 1.25 second hold', () => {
    const discs = [makeDisc(1, 0, 2, 0)];
    const review = beginReview(discs, inspectShot(discs, shot(), false));
    expect(review.verdict.valid).toBe(true); expect(reviewDuration(review)).toBe(1250);
  });
  it('assigns stable, distinct ditch spaces even when discs leave at the same point', () => {
    const discs = Array.from({ length: 24 }, (_, id) => ({ ...makeDisc(id, id % 4, 13, 0), state: 'out' as const }));
    assignDitchSlots(discs); const slots = discs.map(d => d.ditchSlot);
    expect(new Set(slots).size).toBe(24); assignDitchSlots(discs); expect(discs.map(d => d.ditchSlot)).toEqual(slots);
    expect(roundBreakdown(discs, 'teams').map(row => row.total)).toEqual([0, 0]);
    const radius = (BOARD.playRadius + BOARD.ditchOuterRadius) / 2;
    expect(radius - DISC.radius).toBeGreaterThan(BOARD.playRadius);
    expect(radius + DISC.radius).toBeLessThan(BOARD.ditchOuterRadius);
    expect(2 * radius * Math.sin(Math.PI / DITCH_SLOTS)).toBeGreaterThan(DISC.radius * 2);
  });
});
