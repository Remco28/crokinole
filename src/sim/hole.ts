import { BOARD, DISC, TUNE } from './constants';
import type { Disc, PhysicsEvent } from './physics';

/** Local contact approximation, not a full 3D rigid-body solver. Angles in radians. */
export interface HoleMotion {
  dip: number;
  fall: number;
  engaged: boolean;
  tilt: number;
  tiltSpeed: number;
  lean: number;
  rollPhase: number;
}
export const makeHoleMotion = (): HoleMotion => ({ dip: 0, fall: 0, engaged: false, tilt: 0, tiltSpeed: 0, lean: 0, rollPhase: 0 });
export function rollingAmount(d: Disc) {
  const m = d.hole, speed = Math.hypot(d.vx, d.vy);
  if (!m || speed < 0.1) return 0;
  const alignment = Math.abs(-d.vx * Math.sin(m.lean) + d.vy * Math.cos(m.lean)) / speed;
  return Math.min(1, Math.max(0, (Math.abs(m.tilt) - 0.3) / 0.85)) * alignment;
}
export const holeMoving = (d: Disc) => Math.abs(d.hole?.tilt ?? 0) > 0.008 || Math.abs(d.hole?.tiltSpeed ?? 0) > 0.04 || (!!d.hole?.engaged && Math.hypot(d.x, d.y) < 0.25);

export function discHalfHeight(d: Disc) {
  const tilt = d.hole?.tilt ?? 0;
  return DISC.height / 2 * Math.cos(tilt) + DISC.radius * Math.abs(Math.sin(tilt));
}
export function discContactRadius(d: Disc, nx: number, ny: number) {
  const m = d.hole;
  const normal = m ? Math.sin(m.tilt) * (nx * Math.cos(m.lean) + ny * Math.sin(m.lean)) : 0;
  return DISC.radius * Math.sqrt(Math.max(0, 1 - normal * normal)) + DISC.height / 2 * Math.abs(normal);
}

export function settleTilt(d: Disc, dt: number) {
  const m = d.hole;
  if (!m) return;
  const roll = rollingAmount(d);
  const speed = Math.hypot(d.vx, d.vy);
  // Edge rolling follows the tipped disc's plane; blending only dissipates energy.
  if (roll > 0 && d.z <= 0.01 && speed > 0) {
    const tx = -Math.sin(m.lean), ty = Math.cos(m.lean);
    const along = d.vx * tx + d.vy * ty;
    const grip = 1 - Math.exp(-roll * 7 * dt);
    d.vx += (along * tx - d.vx) * grip;
    d.vy += (along * ty - d.vy) * grip;
    m.rollPhase += along / DISC.radius * roll * dt;
  }
  // A tipped disc rocks down onto its face. Landing dissipates most of the rocking.
  if (d.z <= 0.01) m.tiltSpeed += (-TUNE.holeTiltSpring * Math.sin(m.tilt) - TUNE.holeTiltDamping * m.tiltSpeed) * dt;
  m.tilt += m.tiltSpeed * dt;
  if (Math.abs(m.tilt) > 1.4) { m.tilt = Math.sign(m.tilt) * 1.4; m.tiltSpeed *= -0.2; }
  if (Math.abs(m.tilt) < 0.008 && Math.abs(m.tiltSpeed) < 0.04) { m.tilt = 0; m.tiltSpeed = 0; }
}

export function interactWithHole(d: Disc, previousRadius: number, dt: number, airborne: boolean, emit?: (event: PhysicsEvent) => void) {
  const m = d.hole ??= makeHoleMotion();
  const r = Math.hypot(d.x, d.y), speed = Math.hypot(d.vx, d.vy);
  const clearance = BOARD.holeRadius - DISC.radius;
  const grounded = d.z <= 0.025;
  // Contact starts when the center loses support at the hole edge. An airborne
  // disc whose underside clears the opening never receives a lip impulse.
  if (grounded && r < BOARD.holeRadius) {
    m.engaged = true;
    const supportLoss = Math.max(0, 1 - r / BOARD.holeRadius);
    m.fall += TUNE.gravityZ * supportLoss * dt;
    const supportedDepth = Math.max(m.dip, BOARD.holeDepth * Math.min(1, supportLoss * 2));
    m.dip = Math.min(supportedDepth, m.dip + m.fall * dt);
    // The weight shift is strongest for slow discs, but a grounded faster disc
    // still loses support and receives a weaker inward influence while crossing.
    if (r > clearance && m.dip > 0.005 && r < BOARD.holeCaptureRadius && speed < TUNE.holeWeightShiftSpeed) {
      const weightShift = speed <= TUNE.holeCaptureSpeed
        ? 1
        : Math.max(0.12, 1 - (speed - TUNE.holeCaptureSpeed) / (TUNE.holeWeightShiftSpeed - TUNE.holeCaptureSpeed));
      const pull = TUNE.gravityZ * Math.min(0.4, m.dip / DISC.radius) * weightShift * dt;
      d.vx -= d.x / r * pull; d.vy -= d.y / r * pull;
    }
    if (r <= clearance && m.dip >= TUNE.holeSinkDip && speed < TUNE.holeCaptureSpeed && Math.abs(m.tilt) < 0.35) {
      emit?.({ kind: 'sink', speed: Math.max(20, speed), x: d.x, y: d.y, key: `sink:${d.id}` });
      d.state = 'sunk'; d.vx = d.vy = d.vz = 0;
      return;
    }
  }
  if (m.engaged && r >= BOARD.holeRadius && previousRadius < BOARD.holeRadius) {
    m.engaged = false;
    if (grounded && m.dip > 0.0001 && speed > 1) {
      const nx = d.x / r, ny = d.y / r;
      const normal = d.vx * nx + d.vy * ny;
      if (normal > 0) {
        const tangent = -d.vx * ny + d.vy * nx;
        const engagement = Math.min(1, m.dip / TUNE.holeLipBevel);
        const loss = TUNE.holeLipLoss * engagement;
        const before = d.vx * d.vx + d.vy * d.vy;
        d.vx -= nx * normal * loss; d.vy -= ny * normal * loss;
        const removed = Math.max(0, before - d.vx * d.vx - d.vy * d.vy);
        if (airborne) {
          // Spend only a fraction of lost translational energy on hop/tilt.
          // Remaining energy is dissipated in contact; the hole cannot boost speed.
          const asymmetry = Math.min(1, Math.abs(tangent) / speed);
          d.vz = Math.sqrt(d.vz * d.vz + removed * 0.1);
          const inertia = DISC.radius * DISC.radius / 4 + DISC.height * DISC.height / 12;
          m.tiltSpeed = Math.sqrt(removed * (0.001 + asymmetry * 0.035) / inertia);
          // The radial lip force sets the tipping axis, making mirrored shots mirror.
          m.lean = Math.atan2(-ny, -nx);
        }
        emit?.({ kind: 'lip', speed: normal * engagement, x: d.x, y: d.y, key: `lip:${d.id}` });
      }
    }
    m.dip = m.fall = 0;
  }
  if (r > BOARD.holeRadius + DISC.radius || !grounded) { m.dip = m.fall = 0; m.engaged = false; }
  // A supported disc can rest on the lip without being credited as a twenty.
  if (speed === 0 && r > clearance) m.fall = 0;
}
