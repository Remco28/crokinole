import { BOARD, DISC } from '../sim/constants';
import type { Disc, Shot } from '../sim/physics';
export type Mode = 'duel' | 'teams' | 'ffa';
export const sideOf = (mode: Mode, owner: number) => mode === 'teams' ? owner % 2 : owner;
export function points(d: Disc): number {
  if (d.state === 'sunk') return 20;
  if (d.state !== 'board') return 0;
  const edge = Math.hypot(d.x, d.y) + DISC.contactRadius + BOARD.lineWidth / 2;
  return edge < BOARD.ring15 ? 15 : edge < BOARD.ring10 ? 10 : edge < BOARD.ring5 ? 5 : 0;
}
export interface ShotVerdict {
  valid: boolean;
  reason: 'opponent-missed' | 'inner-ring-missed' | null;
  foulIds: number[];
  removalIds: number[];
  revokedTwenties: number;
}
export function inspectShot(discs: Disc[], shot: Shot, hadOpponent: boolean): ShotVerdict {
  const valid = hadOpponent ? shot.opponentContact : discs.some(d => shot.touched.has(d.id) && shot.sideOf(d.owner) === shot.side && (d.state === 'sunk' || (d.state === 'board' && Math.hypot(d.x, d.y) - DISC.contactRadius <= BOARD.ring15 + BOARD.lineWidth / 2)));
  const foulIds = valid ? [] : discs.filter(d => d.state !== 'out' && shot.touched.has(d.id) && shot.sideOf(d.owner) === shot.side).map(d => d.id);
  const outsideIds = discs.filter(d => d.state === 'board' && Math.hypot(d.x, d.y) + DISC.contactRadius >= BOARD.ring5 - BOARD.lineWidth / 2).map(d => d.id);
  return {
    valid, reason: valid ? null : hadOpponent ? 'opponent-missed' : 'inner-ring-missed',
    foulIds, removalIds: [...new Set([...foulIds, ...outsideIds])],
    revokedTwenties: discs.filter(d => d.state === 'sunk' && foulIds.includes(d.id)).length,
  };
}
export function applyVerdict(discs: Disc[], verdict: ShotVerdict) {
  for (const d of discs) if (verdict.removalIds.includes(d.id)) {
    d.state = 'out'; d.vx = d.vy = d.vz = 0;
  }
}
export function resolveShot(discs: Disc[], shot: Shot, hadOpponent: boolean): boolean {
  const verdict = inspectShot(discs, shot, hadOpponent);
  applyVerdict(discs, verdict);
  return verdict.valid;
}
export interface SideBreakdown { twenties: number; fifteens: number; tens: number; fives: number; total: number; awarded: number }
export interface RoundResult { sides: SideBreakdown[]; before: number[]; after: number[]; winner: number | null }
export function roundBreakdown(discs: Disc[], mode: Mode): SideBreakdown[] {
  const sides = Array.from({ length: mode === 'ffa' ? 4 : 2 }, (): SideBreakdown => ({ twenties: 0, fifteens: 0, tens: 0, fives: 0, total: 0, awarded: 0 }));
  for (const d of discs) {
    const value = points(d), row = sides[sideOf(mode, d.owner)];
    row.total += value;
    if (value === 20) row.twenties++;
    if (value === 15) row.fifteens++;
    if (value === 10) row.tens++;
    if (value === 5) row.fives++;
  }
  sides.forEach((row, i) => { row.awarded = mode === 'ffa' ? row.total : Math.max(0, row.total - sides[1 - i].total); });
  return sides;
}
export function roundScore(discs: Disc[], mode: Mode): number[] {
  return roundBreakdown(discs, mode).map(row => row.awarded);
}
export function completeRound(discs: Disc[], mode: Mode, scores: number[]): RoundResult {
  const sides = roundBreakdown(discs, mode), after = scores.map((score, i) => score + sides[i].awarded);
  const high = Math.max(...after), leaders = after.map((score, i) => score === high ? i : -1).filter(i => i >= 0);
  return { sides, before: [...scores], after, winner: high >= 100 && leaders.length === 1 ? leaders[0] : null };
}
