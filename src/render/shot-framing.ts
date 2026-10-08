export interface BoardPoint { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

const radians = (degrees: number) => degrees * Math.PI / 180;

// Pinching in past startZoom while a disc waits to be shot moves the eye down
// and in behind that disc (the shooter view) instead of narrowing the lens, so
// the disc grows while the board ahead stays in view. Closeness reaches 1 at
// maxZoom. Outside a shot the lens zoom is capped at overviewMaxZoom.
// The near eye sits nearDistance inches from a point lead inches ahead of the
// disc, nearPolar from vertical; vertical view drags tilt it like the overview.
export const SHOT_VIEW = {
  startZoom: 1.2, maxZoom: 4, overviewMaxZoom: 2.5,
  nearDistance: 18, nearPolar: radians(58), lead: 2,
  minNearPolar: radians(40), maxNearPolar: radians(72),
} as const;

export function shotCloseness(zoom: number): number {
  if (zoom <= SHOT_VIEW.startZoom) return 0;
  return Math.min(1, Math.log(zoom / SHOT_VIEW.startZoom) / Math.log(SHOT_VIEW.maxZoom / SHOT_VIEW.startZoom));
}

// The shooter view moves the camera rather than the lens.
export function shownZoom(zoom: number, framingShot: boolean): number {
  return Math.min(zoom, framingShot ? SHOT_VIEW.startZoom : SHOT_VIEW.overviewMaxZoom);
}

export interface PoseInput {
  yaw: number; polar: number; polarOffset: number; distance: number;
  disc: BoardPoint; closeness: number;
}
// Board points map to scene (x, 0, y). Yaw places the eye on the player's side.
export function cameraPose({ yaw, polar, polarOffset, distance, disc, closeness }: PoseInput): { eye: Vec3; target: Vec3 } {
  const sphere = (center: Vec3, angle: number, length: number): Vec3 => ({
    x: center.x + Math.sin(angle) * Math.sin(yaw) * length,
    y: center.y + Math.cos(angle) * length,
    z: center.z + Math.sin(angle) * Math.cos(yaw) * length,
  });
  const farTarget = { x: 0, y: 0, z: 0 }, farEye = sphere(farTarget, polar, distance);
  if (closeness <= 0) return { eye: farEye, target: farTarget };
  const nearTarget = { x: disc.x - Math.sin(yaw) * SHOT_VIEW.lead, y: 0, z: disc.y - Math.cos(yaw) * SHOT_VIEW.lead };
  const nearPolar = Math.max(SHOT_VIEW.minNearPolar, Math.min(SHOT_VIEW.maxNearPolar, SHOT_VIEW.nearPolar + polarOffset));
  const nearEye = sphere(nearTarget, nearPolar, SHOT_VIEW.nearDistance);
  const t = Math.min(1, closeness), e = t * t * (3 - 2 * t);
  const mix = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e });
  return { eye: mix(farEye, nearEye), target: mix(farTarget, nearTarget) };
}
