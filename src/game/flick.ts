import { DISC } from '../sim/constants';
import { DISC_SPIN_INERTIA } from '../sim/spin';

export interface FlickSample { x: number; y: number; t: number }
interface Point { x: number; y: number }

// Collinear subdivision can round an exact threshold speed slightly downward.
// This absolute tolerance is numerical only, not a lower gameplay threshold.
function hasContactSpeed(speed: number): boolean {
  return speed + 1e-9 >= FLICK_STRIKE.minContactSpeed;
}

// A swept finger segment catches fast flicks even when no event lands on the disc.
// Signed perpendicular offset in disc radii; positive produces CCW axial spin.
export function flickContactOffset(samples: FlickSample[], disc: Point): number | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1], start = samples[samples.length - 2];
  const dx = end.x - start.x, dy = end.y - start.y, length2 = dx * dx + dy * dy;
  if (!length2 || dx * disc.x + dy * disc.y >= 0) return null;
  const u = Math.max(0, Math.min(1, ((disc.x - start.x) * dx + (disc.y - start.y) * dy) / length2));
  if (Math.hypot(start.x + u * dx - disc.x, start.y + u * dy - disc.y) > DISC.radius) return null;
  const offset = ((start.x - disc.x) * dy - (start.y - disc.y) * dx) / (Math.sqrt(length2) * DISC.radius);
  return Math.max(-1, Math.min(1, offset)) || 0;
}
export function crossesDisc(samples: FlickSample[], disc: Point): boolean {
  return flickContactOffset(samples, disc) !== null;
}

export interface FlickContact {
  offset: number; direction: Point; powered: boolean; frontStart?: FlickSample;
  // Release intent is separate from the registered crossing's geometry.
  finishDirection?: Point;
}

// Aim history is spatial, independent of the 120 ms release-power history.
// Retain 2R BEFORE the newest segment: its endpoint may overshoot contact by
// several radii. Trimming from that endpoint would erase the incoming approach.
export function appendFlickContactSample(samples: FlickSample[], sample: FlickSample): FlickSample[] {
  const last = samples[samples.length - 1];
  if (last && last.x === sample.x && last.y === sample.y) {
    if (last.t === sample.t) return samples; // Same event, not a new stop.
    const before = samples[samples.length - 2];
    // Preserve a zero-speed segment when time advances. Replacing a moving
    // endpoint's time would replay the old movement and conceal a real stop.
    if (before && before.x === last.x && before.y === last.y) return [...samples.slice(0, -1), sample];
    return [...samples, sample];
  }
  let travel = 0;
  for (let i = samples.length - 2; i >= 0; i--) {
    travel += Math.hypot(samples[i + 1].x - samples[i].x, samples[i + 1].y - samples[i].y);
    if (travel >= FLICK_STRIKE.approachDistance) return [...samples.slice(i), sample];
  }
  return [...samples, sample];
}

function spatialApproach(samples: FlickSample[], focus: Point): [Point, Point] {
  let start: Point = focus, newer: Point = focus, travel = 0;
  for (let i = samples.length - 2; i >= 0; i--) {
    // A pause/reposition starts a new approach, not a new time-sized aim window.
    if (i < samples.length - 2 && samples[i + 1].t - samples[i].t > FLICK_STRIKE.strokeGapMs) break;
    const older = samples[i], piece = Math.hypot(older.x - newer.x, older.y - newer.y);
    if (piece && travel + piece >= FLICK_STRIKE.approachDistance) {
      const f = (FLICK_STRIKE.approachDistance - travel) / piece;
      start = { x: newer.x + (older.x - newer.x) * f, y: newer.y + (older.y - newer.y) * f };
      break;
    }
    start = older; newer = older; travel += piece;
  }
  return [start, focus];
}

function approachSpan(samples: FlickSample[], disc: Point): [Point, Point] {
  const end = samples[samples.length - 1], segmentStart = samples[samples.length - 2];
  const dx = end.x - segmentStart.x, dy = end.y - segmentStart.y, length = Math.hypot(dx, dy);
  const closest = ((disc.x - segmentStart.x) * dx + (disc.y - segmentStart.y) * dy) / (length * length);
  const [priorStart] = spatialApproach(samples, segmentStart);
  // Existing approach travel can already stabilize a powered stroke that starts
  // inside the disc. Do not move its anchor forward by a fresh minimum distance
  // in every segment: subdividing the same slow path would change its aim.
  const ready = Math.hypot(segmentStart.x - priorStart.x, segmentStart.y - priorStart.y) + 1e-9 >= FLICK_STRIKE.minContactTravel;
  const u = Math.max(0, Math.min(1, Math.max(closest, ready ? 0 : FLICK_STRIKE.minContactTravel / length)));
  return spatialApproach(samples, { x: segmentStart.x + u * dx, y: segmentStart.y + u * dy });
}

// A brush or tiny wobble is provisional. Establish real powered contact from a
// short spatial approach, then freeze eligibility and its crossing geometry.
export function updateFlickContact(previous: FlickContact | null, samples: FlickSample[], disc: Point): FlickContact | null {
  if (previous?.powered) return previous;
  if (samples.length < 2) return previous;
  const end = samples[samples.length - 1], segmentStart = samples[samples.length - 2];
  const sx = end.x - segmentStart.x, sy = end.y - segmentStart.y, segmentLength = Math.hypot(sx, sy);
  const segmentSeconds = (end.t - segmentStart.t) / 1000;
  const poweredSegment = segmentSeconds > 0 && hasContactSpeed(segmentLength / segmentSeconds);
  const continuous = poweredSegment && segmentSeconds * 1000 <= FLICK_STRIKE.strokeGapMs && sx * disc.x + sy * disc.y < 0;
  const offset = flickContactOffset(samples, disc);
  if (offset === null) {
    // A forceful start on the leading face may leave the disc before enough
    // travel exists to aim. Allow only that uninterrupted powered stroke to
    // finish registration; a slow brush, pause or outward move cannot do this.
    if (previous?.frontStart) {
      const start = previous.frontStart, dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
      const stableOffset = flickContactOffset([start, end], disc);
      if (continuous && stableOffset !== null) {
        if (length + 1e-9 >= FLICK_STRIKE.minContactTravel)
          return { offset: stableOffset, direction: { x: dx / length, y: dy / length }, powered: true };
        return previous;
      }
      return { offset: previous.offset, direction: previous.direction, powered: false };
    }
    return previous; // A later fast miss cannot power a slow brush.
  }
  const [start, focus] = approachSpan(samples, disc);
  const dx = focus.x - start.x, dy = focus.y - start.y, length = Math.hypot(dx, dy);
  const stableOffset = flickContactOffset([{ ...start, t: 0 }, { ...focus, t: 1 }], disc);
  if (stableOffset !== null && length + 1e-9 >= FLICK_STRIKE.minContactTravel
    && poweredSegment) {
    return { offset: stableOffset, direction: { x: dx / length, y: dy / length }, powered: true };
  }
  const front = Math.hypot(segmentStart.x - disc.x, segmentStart.y - disc.y) <= DISC.radius
    && (segmentStart.x - disc.x) * disc.x + (segmentStart.y - disc.y) * disc.y < -DISC.radius * 0.3 * Math.hypot(disc.x, disc.y);
  const frontStart = continuous ? previous?.frontStart ?? (front ? segmentStart : undefined) : undefined;
  return { offset, direction: { x: sx / segmentLength, y: sy / segmentLength }, powered: false,
    ...(frontStart ? { frontStart } : {}) };
}

// The last 2R of uninterrupted powered travel express finish intent, not the
// first tiny contact or the final noisy event. Clip within a segment so adding
// collinear events cannot change this spatial chord. Slow setup/observed stops
// are boundaries. A stationary lift or tiny trailing jitter retains the last
// meaningful run, while releaseVelocity independently decides whether power remains.
function finishIntent(samples: FlickSample[], disc: Point, registered: Point): Point | null {
  let index = samples.length - 1;
  if (index < 1) return null;
  const last = samples[index];
  let ignoredTravel = 0;
  while (index > 0 && last.t - samples[index].t <= FLICK_STRIKE.strokeGapMs) {
    const end = samples[index];
    let start: Point = end, travel = 0;
    for (let i = index; i > 0; i--) {
      const a = samples[i - 1], b = samples[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y), seconds = (b.t - a.t) / 1000;
      if (seconds <= 0 || seconds * 1000 > FLICK_STRIKE.strokeGapMs || !hasContactSpeed(length / seconds)) break;
      const used = Math.min(length, FLICK_STRIKE.approachDistance - travel);
      const f = used / length;
      start = { x: b.x + (a.x - b.x) * f, y: b.y + (a.y - b.y) * f };
      travel += used;
      if (travel >= FLICK_STRIKE.approachDistance) break;
    }
    const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
    if (chord + 1e-9 >= FLICK_STRIKE.minContactTravel) {
      if (dx * disc.x + dy * disc.y >= 0) return null;
      const direction = { x: dx / chord, y: dy / chord };
      // Preserve the complete existing launch bit-for-bit for straight strokes.
      if (Math.abs(direction.x * registered.y - direction.y * registered.x) < 1e-12
        && direction.x * registered.x + direction.y * registered.y > 0) return registered;
      return direction;
    }
    // Never bypass a meaningful slow reposition or many small loops. This
    // allowance is spatial and accumulates through subdivisions, not per event.
    const before = samples[index - 1];
    ignoredTravel += Math.hypot(end.x - before.x, end.y - before.y);
    if (ignoredTravel > DISC.radius * 0.1 + 1e-9) return null;
    index--;
  }
  return null;
}

// Refine only the finish intent of real powered contact. Crossing offset,
// direction, eligibility and provisional short-edge registration stay intact.
export function finalizeFlickContact(previous: FlickContact | null, samples: FlickSample[], disc: Point): FlickContact | null {
  if (!previous || samples.length < 2) return previous;
  if (previous.powered) {
    const finishDirection = finishIntent(samples, disc, previous.direction);
    if (!finishDirection || finishDirection === previous.direction) {
      if (!previous.finishDirection) return previous;
      const { finishDirection: _stale, ...registered } = previous;
      return registered;
    }
    return { ...previous, finishDirection };
  }
  const path = [...samples], last = path[path.length - 1], before = path[path.length - 2];
  // A brief stationary lift endpoint is normal; an observed stop in the stroke
  // or a held release must not turn a brush into a powered crossing.
  if (last.x === before.x && last.y === before.y) {
    if (last.t - before.t > 16) return previous;
    path.pop();
  }
  if (path.length < 2) return previous;
  const start = path[0], end = path[path.length - 1];
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length < DISC.radius * 0.25 || length >= FLICK_STRIKE.minContactTravel
    || dx * disc.x + dy * disc.y >= 0) return previous;
  const offset = flickContactOffset([start, end], disc);
  if (offset === null || Math.abs(offset) < 0.8) return previous;
  // Complete the clip past its closest point, not just touch the entering edge.
  const closest = ((disc.x - start.x) * dx + (disc.y - start.y) * dy) / (length * length);
  if (closest <= 0 || closest >= 1) return previous;
  let intersects = false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], sx = b.x - a.x, sy = b.y - a.y;
    const travel = Math.hypot(sx, sy), seconds = (b.t - a.t) / 1000;
    if (seconds <= 0 || seconds * 1000 > FLICK_STRIKE.strokeGapMs
      || !hasContactSpeed(travel / seconds)
      || (sx * dx + sy * dy) < 0.98 * travel * length) return previous;
    // Dense sampling exposes outside approach/tail pieces hidden inside sparse
    // intersecting segments. Require real powered contact somewhere, while all
    // pieces remain fast and aligned; a slow brush cannot borrow later speed.
    intersects ||= flickContactOffset([a, b], disc) !== null;
  }
  if (!intersects) return previous;
  return { offset, direction: { x: dx / length, y: dy / length }, powered: true };
}

// Measure the finish of the gesture, including follow-through, on release.
export function releaseVelocity(samples: FlickSample[], disc: Point): Point | null {
  const end = samples[samples.length - 1];
  if (!end) return null;
  const first = samples.find(s => end.t - s.t <= 120 && s.t < end.t);
  if (!first) return null;
  const seconds = Math.max(0.016, (end.t - first.t) / 1000);
  const vx = (end.x - first.x) / seconds, vy = (end.y - first.y) / seconds;
  const speed = Math.hypot(vx, vy);
  if (!hasContactSpeed(speed) || vx * disc.x + vy * disc.y >= 0) return null;
  const power = Math.min(105, speed * 0.8 + 12) / speed;
  return { x: vx * power, y: vy * power };
}

// A rounded virtual fingertip gives a contact normal, not an arbitrary aim penalty.
// This softens the response for phone-sized discs without enlarging the hitbox.
export const FLICK_STRIKE = { fingerRadiusRatio: 0.4, friction: 0.35, minContactSpeed: 8,
  approachDistance: DISC.radius * 2, minContactTravel: DISC.radius * 0.5, strokeGapMs: 120 } as const;
export const FLICK_SPIN = { centerZone: 0.1, fullGripOffset: 0.4, maxSpeed: 18 } as const;
// Directional control forgiveness in disc radii, relative to the incoming stroke.
// This does not enlarge contact, target the hole, or retune power/spin transfer.
export const FLICK_AIM = { neutralOffset: 0.2, fullDeflectionOffset: 0.5 } as const;
// Keep accepted center/moderate strikes exact; near the rim reduce virtual
// fingertip rounding smoothly. A small rim radius avoids a zero-energy tangent.
// This is gameplay contact tuning, not a calibrated physical finger model.
export const FLICK_GLANCE = { startOffset: 0.7, rimFingerRadiusRatio: 0.02 } as const;
// Gameplay intent guard, not calibrated finger physics. Preserve radial skims
// and reinforcing responses; only bound deflection that overwhelms a diagonal.
export const FLICK_DIAGONAL = { beginDegrees: 8, fullDegrees: 16, freeFraction: 0.5, saturationFraction: 0.15 } as const;
function protectDiagonal(shot: Point & { spin: number }, direction: Point, disc: Point): Point & { spin: number } {
  const radius = Math.hypot(disc.x, disc.y);
  if (!radius) return shot;
  const radial = { x: -disc.x / radius, y: -disc.y / radius };
  const alpha = Math.atan2(radial.x * direction.y - radial.y * direction.x,
    radial.x * direction.x + radial.y * direction.y);
  const a = Math.abs(alpha), begin = FLICK_DIAGONAL.beginDegrees * Math.PI / 180;
  if (a <= begin) return shot;
  const delta = Math.atan2(direction.x * shot.y - direction.y * shot.x,
    direction.x * shot.x + direction.y * shot.y);
  const free = FLICK_DIAGONAL.freeFraction * a;
  if (alpha * delta >= 0 || Math.abs(delta) <= free) return shot;
  const span = FLICK_DIAGONAL.saturationFraction * a;
  const bound = free + span * Math.tanh((Math.abs(delta) - free) / span);
  const full = FLICK_DIAGONAL.fullDegrees * Math.PI / 180;
  const t = Math.max(0, Math.min(1, (a - begin) / (full - begin)));
  const weight = t * t * t * (10 + t * (-15 + 6 * t));
  const adjustment = weight * (Math.sign(delta) * bound - delta);
  const c = Math.cos(adjustment), s = Math.sin(adjustment);
  // Rotate only: do not add speed, spin, energy or artificial side force.
  return { x: shot.x * c - shot.y * s, y: shot.x * s + shot.y * c, spin: shot.spin };
}
export function releaseShot(samples: FlickSample[], disc: Point, contact: number | FlickContact = 0): (Point & { spin: number }) | null {
  if (typeof contact !== 'number' && !contact.powered) return null;
  const velocity = releaseVelocity(samples, disc);
  if (!velocity) return null;
  const speed = Math.hypot(velocity.x, velocity.y);
  const direction = typeof contact === 'number' ? { x: velocity.x / speed, y: velocity.y / speed }
    : contact.finishDirection ?? contact.direction;
  const offset = Math.max(-1, Math.min(1, typeof contact === 'number' ? contact : contact.offset));
  if (!offset) return { x: direction.x * speed, y: direction.y * speed, spin: 0 };
  const outer = Math.max(0, Math.min(1, (Math.abs(offset) - FLICK_GLANCE.startOffset)
    / (1 - FLICK_GLANCE.startOffset)));
  const blend = outer * outer * (3 - 2 * outer);
  const fingerRadius = FLICK_STRIKE.fingerRadiusRatio
    + (FLICK_GLANCE.rimFingerRadiusRatio - FLICK_STRIKE.fingerRadiusRatio) * blend;
  const side = offset / (1 + fingerRadius);
  const forward = Math.sqrt(1 - side * side);
  const normal = { x: direction.x * forward - direction.y * side, y: direction.y * forward + direction.x * side };
  const tangent = { x: -normal.y, y: normal.x };
  const normalImpulse = speed * forward;
  const amount = Math.max(0, Math.min(1, (Math.abs(offset) - FLICK_SPIN.centerZone) / (FLICK_SPIN.fullGripOffset - FLICK_SPIN.centerZone)));
  const grip = amount * amount * (3 - 2 * amount);
  // Contact-point slip couples tangential translation to axial rotation. Cap the
  // sticking impulse by finger grip and angular speed. No bonus launch energy:
  // jn² + (1 + R²/I)jt² <= speed²; a glancing strike transfers less energy.
  const stickingImpulse = speed * Math.abs(side) / (1 + DISC.radius ** 2 / DISC_SPIN_INERTIA);
  const roundedSide = offset / (1 + FLICK_STRIKE.fingerRadiusRatio);
  const roundedForward = Math.sqrt(1 - roundedSide * roundedSide);
  // As the edge becomes more tangent, reduce its spin-transfer ceiling with
  // normal impulse too; a weak skim must not retain a full powered spin kick.
  const spinTransfer = forward / roundedForward;
  const tangentImpulse = -Math.sign(side) * Math.min(stickingImpulse * grip,
    FLICK_STRIKE.friction * normalImpulse, FLICK_SPIN.maxSpeed * DISC_SPIN_INERTIA / DISC.radius * spinTransfer);
  const shot = {
    x: normal.x * normalImpulse + tangent.x * tangentImpulse,
    y: normal.y * normalImpulse + tangent.y * tangentImpulse,
    spin: -DISC.radius * tangentImpulse / DISC_SPIN_INERTIA || 0,
  };
  if (Math.abs(offset) >= FLICK_AIM.fullDeflectionOffset) return protectDiagonal(shot, direction, disc);
  const t = Math.max(0, (Math.abs(offset) - FLICK_AIM.neutralOffset)
    / (FLICK_AIM.fullDeflectionOffset - FLICK_AIM.neutralOffset));
  const response = t * t * (3 - 2 * t);
  const deflection = Math.atan2(direction.x * shot.y - direction.y * shot.x,
    direction.x * shot.x + direction.y * shot.y) * response;
  const c = Math.cos(deflection), s = Math.sin(deflection), transferredSpeed = Math.hypot(shot.x, shot.y);
  // Rotate only the launch heading toward the actual stroke, preserving the
  // existing transferred speed, axial spin and energy budget. No target snap.
  return protectDiagonal({ x: transferredSpeed * (direction.x * c - direction.y * s) || 0,
    y: transferredSpeed * (direction.x * s + direction.y * c) || 0, spin: shot.spin }, direction, disc);
}

export function canStartFlick(p: Point, disc: Point) {
  const dx = p.x - disc.x, dy = p.y - disc.y;
  // A touch on the active disc is a shot candidate, not a camera/placement drag.
  if (Math.hypot(dx, dy) <= DISC.radius) return true;
  const radius = Math.hypot(disc.x, disc.y);
  const outward = (dx * disc.x + dy * disc.y) / radius;
  const sideways = Math.abs(dx * disc.y - dy * disc.x) / radius;
  return outward >= -DISC.radius * 0.3 && outward <= 8 && sideways <= DISC.radius * 2.4;
}

// A shot candidate can become a normal view drag once it clearly moves away
// from the disc. Keep the camera fixed for an inward approach through the disc.
export function shouldRotateInstead(start: Point, current: Point, disc: Point) {
  const radius = Math.hypot(disc.x, disc.y);
  const dx = current.x - start.x, dy = current.y - start.y;
  if (Math.hypot(dx, dy) < DISC.radius * 0.7) return false;
  const outward = (dx * disc.x + dy * disc.y) / radius;
  const sideways = Math.abs((current.x - disc.x) * disc.y - (current.y - disc.y) * disc.x) / radius;
  return outward > DISC.radius * 0.7 || sideways > DISC.radius * 2.5;
}
