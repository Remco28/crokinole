import { DISC } from '../sim/constants';

export interface FlickSample { x: number; y: number; t: number }
interface Point { x: number; y: number }

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

export interface FlickContact { offset: number; direction: Point; powered: boolean; frontStart?: FlickSample }

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

// A brush or tiny wobble is provisional. Establish direction from a short
// spatial approach with meaningful travel, then freeze the powered crossing.
export function updateFlickContact(previous: FlickContact | null, samples: FlickSample[], disc: Point): FlickContact | null {
  if (previous?.powered) return previous;
  if (samples.length < 2) return previous;
  const end = samples[samples.length - 1], segmentStart = samples[samples.length - 2];
  const sx = end.x - segmentStart.x, sy = end.y - segmentStart.y, segmentLength = Math.hypot(sx, sy);
  const segmentSeconds = (end.t - segmentStart.t) / 1000;
  const poweredSegment = segmentSeconds > 0 && segmentLength / segmentSeconds >= FLICK_STRIKE.minContactSpeed;
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

// Measure the finish of the gesture, including follow-through, on release.
export function releaseVelocity(samples: FlickSample[], disc: Point): Point | null {
  const end = samples[samples.length - 1];
  if (!end) return null;
  const first = samples.find(s => end.t - s.t <= 120 && s.t < end.t);
  if (!first) return null;
  const seconds = Math.max(0.016, (end.t - first.t) / 1000);
  const vx = (end.x - first.x) / seconds, vy = (end.y - first.y) / seconds;
  const speed = Math.hypot(vx, vy);
  if (speed < 8 || vx * disc.x + vy * disc.y >= 0) return null;
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
export function releaseShot(samples: FlickSample[], disc: Point, contact: number | FlickContact = 0): (Point & { spin: number }) | null {
  if (typeof contact !== 'number' && !contact.powered) return null;
  const velocity = releaseVelocity(samples, disc);
  if (!velocity) return null;
  const speed = Math.hypot(velocity.x, velocity.y);
  const direction = typeof contact === 'number' ? { x: velocity.x / speed, y: velocity.y / speed } : contact.direction;
  const offset = Math.max(-1, Math.min(1, typeof contact === 'number' ? contact : contact.offset));
  if (!offset) return { x: direction.x * speed, y: direction.y * speed, spin: 0 };
  const side = offset / (1 + FLICK_STRIKE.fingerRadiusRatio);
  const forward = Math.sqrt(1 - side * side);
  const normal = { x: direction.x * forward - direction.y * side, y: direction.y * forward + direction.x * side };
  const tangent = { x: -normal.y, y: normal.x };
  const normalImpulse = speed * forward;
  const inertia = DISC.radius * DISC.radius / 2;
  const amount = Math.max(0, Math.min(1, (Math.abs(offset) - FLICK_SPIN.centerZone) / (FLICK_SPIN.fullGripOffset - FLICK_SPIN.centerZone)));
  const grip = amount * amount * (3 - 2 * amount);
  // Contact-point slip couples tangential translation to axial rotation. Cap the
  // sticking impulse by finger grip and angular speed. No bonus launch energy:
  // jn² + (1 + R²/I)jt² <= speed²; a glancing strike transfers less energy.
  const stickingImpulse = speed * Math.abs(side) / (1 + DISC.radius ** 2 / inertia);
  const tangentImpulse = -Math.sign(side) * Math.min(stickingImpulse * grip,
    FLICK_STRIKE.friction * normalImpulse, FLICK_SPIN.maxSpeed * inertia / DISC.radius);
  const shot = {
    x: normal.x * normalImpulse + tangent.x * tangentImpulse,
    y: normal.y * normalImpulse + tangent.y * tangentImpulse,
    spin: -DISC.radius * tangentImpulse / inertia || 0,
  };
  if (Math.abs(offset) >= FLICK_AIM.fullDeflectionOffset) return shot;
  const t = Math.max(0, (Math.abs(offset) - FLICK_AIM.neutralOffset)
    / (FLICK_AIM.fullDeflectionOffset - FLICK_AIM.neutralOffset));
  const response = t * t * (3 - 2 * t);
  const deflection = Math.atan2(direction.x * shot.y - direction.y * shot.x,
    direction.x * shot.x + direction.y * shot.y) * response;
  const c = Math.cos(deflection), s = Math.sin(deflection), transferredSpeed = Math.hypot(shot.x, shot.y);
  // Rotate only the launch heading toward the actual stroke, preserving the
  // existing transferred speed, axial spin and energy budget. No target snap.
  return { x: transferredSpeed * (direction.x * c - direction.y * s) || 0,
    y: transferredSpeed * (direction.x * s + direction.y * c) || 0, spin: shot.spin };
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
