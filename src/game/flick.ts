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

export interface FlickContact { offset: number; direction: Point; powered: boolean }

// A slow brush is provisional: the finger can still settle into a side strike.
// Freeze the first powered crossing, so post-impact follow-through cannot steer.
export function updateFlickContact(previous: FlickContact | null, samples: FlickSample[], disc: Point): FlickContact | null {
  if (previous?.powered) return previous;
  const offset = flickContactOffset(samples, disc);
  if (offset === null) return previous;
  const end = samples[samples.length - 1], start = samples[samples.length - 2];
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  const seconds = (end.t - start.t) / 1000;
  return { offset, direction: { x: dx / length, y: dy / length }, powered: seconds > 0 && length / seconds >= FLICK_STRIKE.minContactSpeed };
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
export const FLICK_STRIKE = { fingerRadiusRatio: 0.4, friction: 0.35, minContactSpeed: 8 } as const;
export const FLICK_SPIN = { centerZone: 0.1, fullGripOffset: 0.4, maxSpeed: 18 } as const;
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
  return {
    x: normal.x * normalImpulse + tangent.x * tangentImpulse,
    y: normal.y * normalImpulse + tangent.y * tangentImpulse,
    spin: -DISC.radius * tangentImpulse / inertia || 0,
  };
}

export function canStartFlick(p: Point, disc: Point) {
  const dx = p.x - disc.x, dy = p.y - disc.y;
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
