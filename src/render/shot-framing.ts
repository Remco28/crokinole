export interface BoardPoint { x: number; y: number }

// Zoom above startZoom frames the waiting disc instead of the board center,
// fully by fullZoom. lead is the fraction of the visible half-depth the view
// sits ahead of the disc. Outside a shot, zoom is capped at the overview limit.
export const SHOT_FRAMING = { startZoom: 1.2, fullZoom: 2.2, lead: 0.15, overviewMaxZoom: 2.5, maxZoom: 5 } as const;

// The board point the camera should look at. halfDepth is how many inches of
// board are visible between the view center and the screen's lower edge.
export function shotFocus(disc: BoardPoint | null, zoom: number, halfDepth: number): BoardPoint {
  if (!disc) return { x: 0, y: 0 };
  const t = Math.max(0, Math.min(1, (zoom - SHOT_FRAMING.startZoom) / (SHOT_FRAMING.fullZoom - SHOT_FRAMING.startZoom)));
  const weight = t * t * (3 - 2 * t), radius = Math.hypot(disc.x, disc.y);
  if (!weight || !radius) return { x: 0, y: 0 };
  // Leading the view inward places the disc below center, with room behind it.
  const inset = 1 - Math.min(radius, halfDepth * SHOT_FRAMING.lead) / radius;
  return { x: disc.x * inset * weight, y: disc.y * inset * weight };
}

export function shownZoom(zoom: number, framingShot: boolean): number {
  return framingShot ? zoom : Math.min(zoom, SHOT_FRAMING.overviewMaxZoom);
}
