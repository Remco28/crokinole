export type BoardView = 'standing' | 'seated';
export type CameraStop = 'overview' | 'table' | 'shooter';
export interface OrbitAngle { offset: number; polar: number }
import { seatedLimit } from './seat';
const radians = (degrees: number) => degrees * Math.PI / 180;
// One continuous tilt, from a high look down at the board to seated eye level.
// Overview and Table are named stops on it; Shooter is Table moved in close.
export const TILT = { min: radians(20), overview: radians(25), table: radians(62), max: radians(68) } as const;
// Camera level: 0 at Overview, 1 at Table, 2 at full Shooter. A player stands
// above the seated eye height and, by the one-cheek rule, may only shoot when
// seated. The limit is derived in seat.ts; at the Table framing distance it
// lands on the Table stop, so the view a turn starts in is the top of seated.
export const SEATED_LEVEL = 1;
export const seatedPolar = (distance: number) => seatedLimit(distance);
export function centeredOrbit(polar: number = TILT.table): OrbitAngle {
  return { offset: 0, polar };
}
// Normal controls: dragging up lowers the camera toward the table, like pulling
// the board's far edge toward you. Inverted controls raise it instead.
export function dragOrbit(angle: OrbitAngle, horizontal: number, vertical: number, invertVertical = false): OrbitAngle {
  return {
    offset: Math.max(-Math.PI / 4, Math.min(Math.PI / 4, angle.offset - horizontal)),
    polar: Math.max(TILT.min, Math.min(TILT.max, angle.polar + (invertVertical ? vertical : -vertical))),
  };
}
export function cameraLevel(polar: number, closeness: number): number {
  const tilt = Math.max(0, Math.min(1, (polar - TILT.overview) / (TILT.table - TILT.overview)));
  return tilt + Math.max(0, Math.min(1, closeness));
}
export const isSeated = (level: number, polar?: number, distance?: number) =>
  polar !== undefined && distance !== undefined ? polar >= seatedLimit(distance) : level >= SEATED_LEVEL;
export function nearestStop(level: number): CameraStop {
  return level < 0.5 ? 'overview' : level < 1.5 ? 'table' : 'shooter';
}
