import type { Disc } from '../sim/physics';
import { applyVerdict, type ShotVerdict } from './rules';

export const REVIEW_TIMING = { normal: 1250, foul: 2000, removal: 650 } as const;
export interface ShotReview { verdict: ShotVerdict; removed: Disc[]; elapsed: number; hold: number }
export function beginReview(discs: Disc[], verdict: ShotVerdict): ShotReview {
  const removed = discs.filter(d => verdict.removalIds.includes(d.id)).map(d => ({ ...d, hole: d.hole ? { ...d.hole } : undefined }));
  applyVerdict(discs, verdict);
  return { verdict, removed, elapsed: 0, hold: verdict.valid ? REVIEW_TIMING.normal : REVIEW_TIMING.foul };
}
export function reviewDuration(review: ShotReview) {
  return review.hold + (review.removed.length ? REVIEW_TIMING.removal : 0);
}

// Visual parking spaces only; out-of-play discs never participate in physics.
export const DITCH_SLOTS = 60;
export function assignDitchSlots(discs: Disc[]) {
  const occupied = new Set(discs.filter(d => d.state === 'out' && d.ditchSlot !== undefined).map(d => d.ditchSlot!));
  for (const d of discs) {
    if (d.state !== 'out' || d.ditchSlot !== undefined) continue;
    const preferred = (Math.round(Math.atan2(d.y, d.x) / (Math.PI * 2) * DITCH_SLOTS) + DITCH_SLOTS) % DITCH_SLOTS;
    for (let distance = 0; distance < DITCH_SLOTS; distance++) {
      const offset = distance % 2 === 0 ? distance / 2 : -(distance + 1) / 2;
      const slot = (preferred + offset + DITCH_SLOTS) % DITCH_SLOTS;
      if (!occupied.has(slot)) { d.ditchSlot = slot; occupied.add(slot); break; }
    }
  }
}
