export type BoardView = 'standing' | 'seated';
export interface OrbitAngle { offset: number; polar: number }
const radians = (degrees: number) => degrees * Math.PI / 180;
const limits = {
  seated: { min: radians(48), max: radians(68), initial: radians(62) },
  standing: { min: radians(20), max: radians(40), initial: radians(25) },
};
export function centeredOrbit(view: BoardView): OrbitAngle {
  return { offset: 0, polar: limits[view].initial };
}
export function dragOrbit(angle: OrbitAngle, horizontal: number, vertical: number, view: BoardView): OrbitAngle {
  return {
    offset: Math.max(-Math.PI / 4, Math.min(Math.PI / 4, angle.offset - horizontal)),
    polar: Math.max(limits[view].min, Math.min(limits[view].max, angle.polar + vertical)),
  };
}
