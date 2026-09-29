import { DISC } from '../sim/constants';

export interface FlickSample { x: number; y: number; t: number }
interface Point { x: number; y: number }

// A swept finger segment catches fast flicks even when no event lands on the disc.
export function crossesDisc(samples: FlickSample[], disc: Point): boolean {
  if (samples.length < 2) return false;
  const end = samples[samples.length - 1], start = samples[samples.length - 2];
  const dx = end.x - start.x, dy = end.y - start.y, length2 = dx * dx + dy * dy;
  if (!length2 || dx * disc.x + dy * disc.y >= 0) return false;
  const u = Math.max(0, Math.min(1, ((disc.x - start.x) * dx + (disc.y - start.y) * dy) / length2));
  return Math.hypot(start.x + u * dx - disc.x, start.y + u * dy - disc.y) <= DISC.radius;
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
