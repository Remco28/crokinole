// NCA tournament dimensions. 1 unit = 1 inch. Board center at (0,0).
// Locked decisions: airborne = impact-pops only, aim = fading ghost, FFA = cutthroat.

export const BOARD = {
  playRadius: 13.0,
  ditchOuterRadius: 14.75, // 1.75-inch gutter comfortably fits a flat 1.25-inch disc
  ring15: 4.0,
  ring10: 8.0,
  ring5: 12.0,
  holeRadius: 1.375 / 2,
  holeDepth: 0.2,
  holeCaptureRadius: 0.55, // slow inward settling region; full clearance required to score
  lineWidth: 1 / 16,
} as const;

export const DISC = {
  radius: 1.25 / 2,
  height: 3 / 8,
  edgeRadius: 1 / 16,
  contactRadius: 1.25 / 2 - 1 / 16, // flat bottom footprint, inside the rounded edge
} as const;

export const PEGS = {
  count: 8,
  radius: 0.5 / 2.54, // ~1cm dia -> inches (~0.197)
  ringRadius: 4.0, // on the 15-circle, every 45deg
  angleOffset: Math.PI / 8, // leave each player’s center shooting lane open
  height: 0.8, // exposed rubber-covered post; mounting thread is below the board
} as const;

export const PEG_COLLISION_RADIUS = PEGS.radius + DISC.radius;

// Tunables (debug panel can tweak live in later phases).
export const TUNE = {
  frictionMu: 0.115, // slight extra board grip without changing flick power
  frictionViscous: 0.05,
  restitutionDisc: 0.8,
  restitutionPeg: 0.62,
  restitutionRail: 0.45,
  tangentDampingPeg: 0.98,
  gravityZ: 180.0, // in/s^2 for hop channel
  popGainMin: 0.05,
  popGainMax: 0.15,
  landBounce: 0.35,
  maxStepMove: 0.2, // inches per substep (CCD guard)
  sleepSpeed: 0.15,
  holeCaptureSpeed: 28,
  holeLipBevel: 0.025, // effective rounded lip contact depth
  holeLipLoss: 0.65, // fraction of outward normal speed lost at full engagement
  holeTiltSpring: 24,
  holeTiltDamping: 7,
  rollingFrictionRatio: 0.2,
} as const;

export function pegPositions(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < PEGS.count; i++) {
    const a = (i / PEGS.count) * Math.PI * 2 + PEGS.angleOffset;
    out.push({ x: Math.cos(a) * PEGS.ringRadius, y: Math.sin(a) * PEGS.ringRadius });
  }
  return out;
}
