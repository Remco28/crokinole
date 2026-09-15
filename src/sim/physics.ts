import { BOARD, DISC, PEGS, TUNE, pegPositions } from './constants';

export interface Disc { id: number; owner: number; x: number; y: number; vx: number; vy: number; z: number; vz: number; state: 'board' | 'sunk' | 'out' }
export interface Shot { touched: Set<number>; opponentContact: boolean; side: number; sideOf: (owner: number) => number }
export const makeDisc = (id: number, owner: number, x: number, y: number): Disc => ({ id, owner, x, y, vx: 0, vy: 0, z: 0, vz: 0, state: 'board' });
export const moving = (d: Disc) => d.state === 'board' && (Math.hypot(d.vx, d.vy) > 0 || d.z > 0 || d.vz !== 0);
const pegs = pegPositions();
export function step(discs: Disc[], dt: number, shot: Shot, airborne = true) {
  const speed = Math.max(1, ...discs.map(d => Math.hypot(d.vx, d.vy)));
  const steps = Math.max(1, Math.ceil(speed * dt / TUNE.maxStepMove));
  const h = dt / steps;
  for (let n = 0; n < steps; n++) {
    for (const d of discs) {
      if (d.state !== 'board') continue;
      d.x += d.vx * h; d.y += d.vy * h;
      if (d.z > 0 || d.vz > 0) {
        d.vz -= TUNE.gravityZ * h; d.z += d.vz * h;
        if (d.z <= 0) { d.z = 0; d.vz = Math.abs(d.vz) > 3 ? -d.vz * TUNE.landBounce : 0; }
      }
      const v = Math.hypot(d.vx, d.vy);
      const next = Math.max(0, v - (TUNE.frictionMu * 386 + TUNE.frictionViscous * v) * h);
      const ratio = v > 0 && next > TUNE.sleepSpeed ? next / v : 0;
      d.vx *= ratio; d.vy *= ratio;
      const radius = Math.hypot(d.x, d.y);
      if (radius > BOARD.playRadius || (next === 0 && radius + DISC.radius >= BOARD.ring5)) { d.state = 'out'; continue; }
      if (radius < BOARD.holeCaptureRadius && d.z < 0.2 && v < 28) { d.state = 'sunk'; continue; }
      for (const p of pegs) {
        if (d.z > PEGS.height) continue;
        const dx = d.x - p.x, dy = d.y - p.y, dist = Math.hypot(dx, dy);
        const r = (DISC.radius + PEGS.radius) * 1.02;
        if (dist >= r) continue;
        const nx = dist ? dx / dist : 1, ny = dist ? dy / dist : 0;
        d.x += nx * (r - dist); d.y += ny * (r - dist);
        const normal = d.vx * nx + d.vy * ny;
        if (normal < 0) {
          d.vx -= (1 + TUNE.restitutionPeg) * normal * nx;
          d.vy -= (1 + TUNE.restitutionPeg) * normal * ny;
          if (airborne) d.vz = Math.max(d.vz, -normal * 0.1);
        }
      }
    }
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i], b = discs[j];
      if (a.state !== 'board' || b.state !== 'board' || Math.abs(a.z - b.z) > DISC.height) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      if (dist >= DISC.radius * 2) continue;
      const nx = dist ? dx / dist : 1, ny = dist ? dy / dist : 0;
      const overlap = (DISC.radius * 2 - dist) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const v = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (v >= 0) continue;
      if (shot.touched.has(a.id) || shot.touched.has(b.id)) {
        shot.touched.add(a.id); shot.touched.add(b.id);
        if (shot.sideOf(a.owner) !== shot.side || shot.sideOf(b.owner) !== shot.side) shot.opponentContact = true;
      }
      const impulse = -(1 + TUNE.restitutionDisc) * v / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
      if (airborne) { a.vz = Math.max(a.vz, impulse * 0.08); b.vz = Math.max(b.vz, impulse * 0.06); }
    }
  }
}
