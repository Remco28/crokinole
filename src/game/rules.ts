import { BOARD, DISC } from '../sim/constants';
import type { Disc, Shot } from '../sim/physics';
export type Mode = 'duel' | 'teams' | 'ffa';
export const sideOf = (mode: Mode, owner: number) => mode === 'teams' ? owner % 2 : owner;
export function points(d: Disc): number {
  if (d.state === 'sunk') return 20;
  if (d.state !== 'board') return 0;
  const edge = Math.hypot(d.x, d.y) + DISC.radius + BOARD.lineWidth / 2;
  return edge < BOARD.ring15 ? 15 : edge < BOARD.ring10 ? 10 : edge < BOARD.ring5 ? 5 : 0;
}
export function resolveShot(discs: Disc[], shot: Shot, hadOpponent: boolean): boolean {
  const valid = hadOpponent ? shot.opponentContact : discs.some(d => shot.touched.has(d.id) && shot.sideOf(d.owner) === shot.side && (d.state === 'sunk' || (d.state === 'board' && Math.hypot(d.x, d.y) - DISC.radius <= BOARD.ring15 + BOARD.lineWidth / 2)));
  if (!valid) for (const d of discs) if (shot.touched.has(d.id) && shot.sideOf(d.owner) === shot.side) d.state = 'out';
  return valid;
}
export function roundScore(discs: Disc[], mode: Mode): number[] {
  const totals = Array(mode === 'ffa' ? 4 : 2).fill(0) as number[];
  for (const d of discs) totals[sideOf(mode, d.owner)] += points(d);
  if (mode === 'ffa') return totals;
  return totals.map((v, i) => Math.max(0, v - totals[1 - i]));
}
