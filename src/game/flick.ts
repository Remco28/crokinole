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

// Broad neutral center and a smooth ramp: phone-sized discs must not turn
// subpixel contact errors into strong spin. Offset is captured at first contact,
// independently of the follow-through used for launch direction and power.
export const FLICK_SPIN = { centerZone: 0.3, rimSpeedRatio: 0.22, maxSpeed: 18 } as const;
export function releaseShot(samples: FlickSample[], disc: Point, offset = 0): (Point & { spin: number }) | null {
  const velocity = releaseVelocity(samples, disc);
  if (!velocity) return null;
  const amount = Math.max(0, Math.min(1, (Math.abs(offset) - FLICK_SPIN.centerZone) / (1 - FLICK_SPIN.centerZone)));
  if (!amount) return { ...velocity, spin: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const ramp = amount * amount * (3 - 2 * amount);
  const spin = Math.sign(offset) * ramp * Math.min(FLICK_SPIN.maxSpeed, speed * FLICK_SPIN.rimSpeedRatio / DISC.radius);
  // Share the original launch energy between translation and axial rotation;
  // offset strikes never receive free bonus energy or a higher power ceiling.
  const inertia = DISC.radius * DISC.radius / 2;
  const ratio = speed / Math.hypot(speed, Math.sqrt(inertia) * spin);
  return { x: velocity.x * ratio, y: velocity.y * ratio, spin: spin * ratio };
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
