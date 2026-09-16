import { discContactRadius, discHalfHeight, holeMoving, interactWithHole, rollingAmount, settleTilt, type HoleMotion } from './hole';
import { BOARD, PEGS, TUNE, pegPositions } from './constants';

export interface Disc { id: number; owner: number; x: number; y: number; vx: number; vy: number; z: number; vz: number; state: 'board' | 'sunk' | 'out'; hole?: HoleMotion; ditchSlot?: number }
export interface PhysicsEvent { kind: 'disc' | 'peg' | 'sink' | 'ditch' | 'land' | 'lip'; speed: number; x: number; y: number; key: string }
export interface Shot { touched: Set<number>; opponentContact: boolean; side: number; sideOf: (owner: number) => number }
export const makeDisc = (id: number, owner: number, x: number, y: number): Disc => ({ id, owner, x, y, vx: 0, vy: 0, z: 0, vz: 0, state: 'board' });
export const moving = (d: Disc) => d.state === 'board' && (Math.hypot(d.vx, d.vy) > 0 || d.z > 0 || d.vz !== 0 || holeMoving(d));
const pegs = pegPositions();
export function step(discs: Disc[], dt: number, shot: Shot, airborne = true, emit?: (event: PhysicsEvent) => void) {
  // Resolve the narrow twenty clearance and lip dwell time more finely than pegs.
  const steps = Math.max(1, ...discs.filter(d => d.state === 'board').map(d =>
    Math.ceil(Math.hypot(d.vx, d.vy) * dt / (Math.hypot(d.x, d.y) < 1.6 ? 0.035 : TUNE.maxStepMove))));
  const h = dt / steps;
  // Crokinole's center hole holds one disc. A sunk disc, or the first disc that
  // claims the opening during this step, blocks later discs from sinking too.
  let holeOccupied = discs.some(d => d.state === 'sunk');
  for (let n = 0; n < steps; n++) {
    for (const d of discs) {
      if (d.state !== 'board') continue;
      const previousRadius = Math.hypot(d.x, d.y);
      settleTilt(d, h);
      d.x += d.vx * h; d.y += d.vy * h;
      if (d.z > 0 || d.vz > 0) {
        d.vz -= TUNE.gravityZ * h; d.z += d.vz * h;
        if (d.z <= 0) { emit?.({ kind: 'land', speed: Math.abs(d.vz), x: d.x, y: d.y, key: `land:${d.id}` }); d.z = 0; d.vz = Math.abs(d.vz) > 3 ? -d.vz * TUNE.landBounce : 0; }
      }
      const v = Math.hypot(d.vx, d.vy);
      const friction = d.z > 0.01 ? 0 : 1 - rollingAmount(d) * (1 - TUNE.rollingFrictionRatio);
      const next = Math.max(0, v - (TUNE.frictionMu * 386 + TUNE.frictionViscous * v) * friction * h);
      const ratio = v > 0 && next > TUNE.sleepSpeed ? next / v : 0;
      d.vx *= ratio; d.vy *= ratio;
      const radius = Math.hypot(d.x, d.y);
      // Only leaving the playing surface is immediate. Line-touching discs remain
      // hittable until the whole shot has settled, then rules remove them.
      if (radius > BOARD.playRadius) { emit?.({ kind: 'ditch', speed: Math.max(12, v), x: d.x, y: d.y, key: `ditch:${d.id}` }); d.state = 'out'; continue; }
      interactWithHole(d, previousRadius, h, airborne, emit, holeOccupied);
      if ((d as Disc).state === 'sunk') holeOccupied = true;
      if (d.state !== 'board') continue;
      for (const p of pegs) {
        if (d.z > PEGS.height) continue;
        const dx = d.x - p.x, dy = d.y - p.y, dist = Math.hypot(dx, dy);
        const nx = dist ? dx / dist : 1, ny = dist ? dy / dist : 0;
        const r = (discContactRadius(d, nx, ny) + PEGS.radius) * 1.02;
        if (dist >= r) continue;
        d.x += nx * (r - dist); d.y += ny * (r - dist);
        const normal = d.vx * nx + d.vy * ny;
        if (normal < 0) {
          emit?.({ kind: 'peg', speed: -normal, x: p.x, y: p.y, key: `peg:${d.id}:${p.x}:${p.y}` });
          d.vx -= (1 + TUNE.restitutionPeg) * normal * nx;
          d.vy -= (1 + TUNE.restitutionPeg) * normal * ny;
          if (airborne) d.vz = Math.max(d.vz, -normal * 0.1);
        }
      }
    }
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i], b = discs[j];
      if (a.state !== 'board' || b.state !== 'board' || a.z > b.z + discHalfHeight(b) * 2 || b.z > a.z + discHalfHeight(a) * 2) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      const nx = dist ? dx / dist : 1, ny = dist ? dy / dist : 0;
      const contactRadius = discContactRadius(a, nx, ny) + discContactRadius(b, nx, ny);
      if (dist >= contactRadius) continue;
      const overlap = (contactRadius - dist) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const v = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (v >= 0) continue;
      if (shot.touched.has(a.id) || shot.touched.has(b.id)) {
        shot.touched.add(a.id); shot.touched.add(b.id);
        if (shot.sideOf(a.owner) !== shot.side || shot.sideOf(b.owner) !== shot.side) shot.opponentContact = true;
      }
      emit?.({ kind: 'disc', speed: -v, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, key: `disc:${a.id}:${b.id}` });
      const impulse = -(1 + TUNE.restitutionDisc) * v / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
      if (airborne) { a.vz = Math.max(a.vz, impulse * 0.08); b.vz = Math.max(b.vz, impulse * 0.06); }
    }
  }
}
