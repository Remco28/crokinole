import { DISC, TUNE } from './constants';
import type { Disc } from './physics';

/** Solid cylinder's axial inertia per unit mass (inch²). Spin is CCW rad/s. */
export const DISC_SPIN_INERTIA = DISC.radius ** 2 / 2;

/**
 * Coulomb torque from a uniformly loaded face: mean friction arm = 2R/3.
 * While translating, face slip mostly points along the shot, so its torque is
 * smaller than for a disc spinning in place. A regularized blend preserves the
 * uniform-face geometry: 2R/3 arm at rest and omega*R²/(4v) at high
 * sliding speed. spinFrictionRatio scales only this rotational Coulomb torque
 * to tune axial persistence independently of launch and translational grip.
 * The existing viscous coefficient is unchanged. No lateral force is created.
 * Integrate Coulomb + viscous decay analytically with the current slip blend;
 * the fixed/adaptive physics steps update that blend as the shot slows.
 */
export function integrateSpin(d: Disc, dt: number, support = 1) {
  if (d.state !== 'board') { d.spin = 0; return; }
  if (d.z > 0 || d.vz > 0 || support <= 0) { d.angle += d.spin * dt; return; }
  const speed = Math.abs(d.spin), sign = Math.sign(d.spin);
  if (speed <= TUNE.sleepSpin) { d.spin = 0; return; }
  const slidingSpeed = Math.hypot(d.vx, d.vy);
  const rimSpeed = DISC.contactRadius * speed;
  const slipBlend = rimSpeed / Math.hypot(rimSpeed, slidingSpeed * 8 / 3);
  const torque = TUNE.spinFrictionRatio * TUNE.frictionMu * TUNE.surfaceGravity * (2 * DISC.contactRadius / 3) * support * slipBlend;
  const deceleration = torque / DISC_SPIN_INERTIA;
  const viscous = TUNE.frictionViscous * support;
  const stopTime = deceleration > 0
    ? (viscous > 0 ? Math.log1p(viscous * speed / deceleration) / viscous : speed / deceleration)
    : Infinity;
  const duration = Math.min(dt, stopTime);
  const x = viscous * duration;
  const integral = viscous > 0 ? -Math.expm1(-x) / viscous : duration;
  // The second integral tends to dt²/2. Its small-x series avoids subtracting
  // almost equal terms, including the pure-Coulomb/both-zero friction limits.
  const secondIntegral = x < 1e-3
    ? duration ** 2 * (0.5 - x / 6 + x ** 2 / 24 - x ** 3 / 120 + x ** 4 / 720)
    : (duration - integral) / viscous;
  const next = Math.max(0, speed * Math.exp(-x) - deceleration * integral);
  d.angle += sign * (speed * integral - deceleration * secondIntegral);
  d.spin = next > TUNE.sleepSpin ? sign * next : 0;
}

/**
 * n points from a toward b/the fixed obstacle; t = (-ny,nx). Impulse +j*t
 * acts on b and -j*t on a. The two facing rim velocities include opposite
 * rotational arms. Projected contact radii are supplied by the caller.
 * Coulomb-capped sticking impulse cannot reverse slip or add kinetic energy.
 * No compressive normal impulse means no friction (even at resting overlaps).
 */
export function contactFriction(a: Disc, b: Disc | undefined, nx: number, ny: number,
  radiusA: number, radiusB: number, normalImpulse: number, mu: number) {
  if (normalImpulse <= 0 || mu <= 0) return;
  const tx = -ny, ty = nx;
  const slip = ((b?.vx ?? 0) - a.vx) * tx + ((b?.vy ?? 0) - a.vy) * ty
    - radiusA * a.spin - (b ? radiusB * b.spin : 0);
  const inverseMass = 1 + (b ? 1 : 0)
    + (radiusA ** 2 + (b ? radiusB ** 2 : 0)) / DISC_SPIN_INERTIA;
  const limit = mu * normalImpulse;
  const impulse = Math.max(-limit, Math.min(limit, -slip / inverseMass));
  a.vx -= impulse * tx; a.vy -= impulse * ty;
  a.spin -= radiusA * impulse / DISC_SPIN_INERTIA;
  if (b) {
    b.vx += impulse * tx; b.vy += impulse * ty;
    b.spin -= radiusB * impulse / DISC_SPIN_INERTIA;
  }
}

/**
 * Add an upward kick, funded only by dissipated normal-contact energy.
 * Targets are zero-baseline hop speeds, not replacements for signed vz.
 * Charge work against max(vz, 0): falling KE never pays for a free reversal.
 * This conservative pop policy is not a full 3D momentum/contact solver.
 */
export function contactHop(discs: Disc[], targets: number[], energyBudget: number) {
  const incoming = discs.map(d => d.vz);
  const bases = incoming.map(v => Math.max(v, 0));
  const costs = bases.map((u, i) => {
    const q = Math.max(targets[i] - u, 0);
    return u * q + q ** 2 / 2;
  });
  const requested = costs.reduce((sum, work) => sum + work, 0);
  const fraction = requested > 0 ? Math.min(1, Math.max(0, energyBudget) / requested) : 0;
  discs.forEach((d, i) => {
    const work = fraction * costs[i], u = bases[i];
    // Rationalized sqrt(u² + 2W) - u avoids cancellation for small kicks.
    const denominator = Math.sqrt(u ** 2 + 2 * work) + u;
    const kick = denominator > 0 ? 2 * work / denominator : 0;
    d.vz = incoming[i] + kick;
  });
}
