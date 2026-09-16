import type { Disc } from '../sim/physics';
import type { Mode, RoundResult } from './rules';
import type { ShotReview } from './review';

export type Phase = 'pass' | 'aim' | 'moving' | 'review' | 'round' | 'won';
export interface SavedMatch {
  version: 1;
  mode: Mode; player: number; round: number; id: number;
  discs: Disc[]; scores: number[]; used: number[]; phase: Phase;
  review: ShotReview | null; roundResult: RoundResult | null;
  deadline: number | null; paused: boolean; remaining: number | null;
  stagedId: number | null; hadOpponent: boolean;
  shot: { touched: number[]; opponentContact: boolean; side: number } | null;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const natural = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const numbers = (v: unknown, length: number) => Array.isArray(v) && v.length === length && v.every(natural);

// Storage is untrusted: reject incomplete or incompatible snapshots before they
// can reach physics, rendering, or scoring. Versionless saves migrate below.
export function readMatch(raw: string): SavedMatch | null {
  try {
    const d = JSON.parse(raw);
    if (!record(d) || (d.version !== undefined && d.version !== 1)) return null;
    if (!['duel', 'teams', 'ffa'].includes(String(d.mode))) return null;
    const players = d.mode === 'duel' ? 2 : 4, sides = d.mode === 'ffa' ? 4 : 2;
    if (!natural(d.player) || d.player >= players || !natural(d.round) || d.round < 1 || !natural(d.id)) return null;
    if (!numbers(d.scores, sides) || !numbers(d.used, players) || (d.used as number[]).some(n => n > (players === 2 ? 12 : 6))) return null;
    if (!['pass', 'aim', 'moving', 'review', 'round', 'won'].includes(String(d.phase))) return null;
    const validDisc = (v: unknown): v is Disc => {
      if (!record(v) || !natural(v.id) || !natural(v.owner) || v.owner >= players) return false;
      if (!['x', 'y', 'vx', 'vy', 'z', 'vz'].every(k => finite(v[k])) || !['board', 'out', 'sunk'].includes(String(v.state))) return false;
      if (v.hole !== undefined && (!record(v.hole) || typeof v.hole.engaged !== 'boolean' || !['dip', 'fall', 'tilt', 'tiltSpeed', 'lean', 'rollPhase'].every(k => finite((v.hole as Record<string, unknown>)[k])))) return false;
      return (v.ditchSlot === undefined || (natural(v.ditchSlot) && v.ditchSlot < 60)) && (v.holeCleared === undefined || typeof v.holeCleared === 'boolean');
    };
    if (!Array.isArray(d.discs) || d.discs.length > 24 || !d.discs.every(validDisc)) return null;
    const ids = new Set(d.discs.map(v => v.id));
    if (ids.size !== d.discs.length || d.discs.some(v => v.id > (d.id as number))) return null;
    const validIds = (v: unknown) => Array.isArray(v) && v.every(id => natural(id) && ids.has(id));
    if (d.deadline !== null && d.deadline !== undefined && !finite(d.deadline)) return null;
    if (d.phase === 'review') {
      const r = d.review;
      if (!record(r) || !finite(r.elapsed) || r.elapsed < 0 || !finite(r.hold) || r.hold < 0 || !Array.isArray(r.removed) || !r.removed.every(validDisc) || !r.removed.every(v => ids.has(v.id))) return null;
      const v = r.verdict;
      if (!record(v) || typeof v.valid !== 'boolean' || (v.reason !== null && v.reason !== 'opponent-missed' && v.reason !== 'inner-ring-missed') || !validIds(v.foulIds) || !validIds(v.removalIds) || !natural(v.revokedTwenties)) return null;
    }
    if (d.phase === 'round' || d.phase === 'won') {
      const r = d.roundResult;
      if (!record(r) || !numbers(r.before, sides) || !numbers(r.after, sides) || !Array.isArray(r.sides) || r.sides.length !== sides || !r.sides.every(row => record(row) && ['twenties', 'fifteens', 'tens', 'fives', 'total', 'awarded'].every(k => natural(row[k])))) return null;
      if (r.winner !== null && (!natural(r.winner) || r.winner >= sides)) return null;
      if ((d.phase === 'won') !== (r.winner !== null) || !(r.after as number[]).every((n, i) => n === (d.scores as number[])[i])) return null;
    }
    if (d.phase === 'moving') {
      const s = d.shot;
      if (!record(s) || !validIds(s.touched) || typeof s.opponentContact !== 'boolean' || s.side !== (d.mode === 'teams' ? d.player % 2 : d.player) || typeof d.hadOpponent !== 'boolean') return null;
    }
    if (d.stagedId != null && !d.discs.some(v => v.id === d.stagedId && v.owner === d.player)) return null;
    if (d.phase === 'aim' && !d.discs.some(v => v.id === d.stagedId && v.state === 'board')) return null;
    if (d.paused !== undefined && typeof d.paused !== 'boolean') return null;
    if (d.paused && d.remaining !== null && (!finite(d.remaining) || d.remaining < 0)) return null;
    return { ...d, version: 1, deadline: d.deadline ?? null, paused: d.paused ?? false, remaining: d.remaining ?? null, stagedId: d.stagedId ?? null, hadOpponent: d.hadOpponent ?? false, shot: d.shot ?? null, review: d.phase === 'review' ? d.review : null, roundResult: ['round', 'won'].includes(String(d.phase)) ? d.roundResult : null } as SavedMatch;
  } catch { return null; }
}
