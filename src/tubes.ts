import type { Disc } from './sim/physics';
import type { Mode } from './game/rules';

// 20s tubes: clear tubes that hang on the board's rim and hold each side's
// sunk 20s. Layout and contents are pure so they can be tested without a scene.
export type TubePref = 'auto' | 'on' | 'off';
export const parseTubePref = (value: unknown): TubePref => value === 'on' || value === 'off' ? value : 'auto';
// Auto hides the tubes on phones and other small screens.
export const SMALL_SCREEN_QUERY = '(max-width: 700px), (max-height: 480px) and (pointer: coarse)';
export const tubesVisible = (pref: TubePref, smallScreen: boolean) => pref === 'on' || (pref === 'auto' && !smallScreen);

export interface TubeSpec { side: number; angle: number; owners: number[] }

// Discs that have dropped into the hole and been cleared stay with their side
// until the round ends. A foul sends a cancelled 20 to the ditch instead, so
// only valid 20s are ever 'sunk' here.
export function tubeContents(discs: Disc[], sideOf: (owner: number) => number, sides: number): number[][] {
  const tubes: number[][] = Array.from({ length: sides }, () => []);
  for (const d of [...discs].sort((a, b) => a.id - b.id)) if (d.state === 'sunk' && d.holeCleared) tubes[sideOf(d.owner)]?.push(d.owner);
  return tubes;
}

// Where each tube starts, in board angle (the shooting line for a player at
// angle a is at (sin a, cos a)). Duel: just past each player's right-hand
// quadrant edge. Otherwise on the quadrant borders; players slide them freely.
export function defaultTubeAngle(mode: Mode, side: number): number {
  const quarter = Math.PI / 4;
  if (mode === 'duel') return quarter + 0.3 + side * Math.PI;
  if (mode === 'teams') return quarter + side * Math.PI;
  return quarter + side * Math.PI / 2;
}
export function tubeSpecs(discs: Disc[], mode: Mode, sideOf: (owner: number) => number, angles: Array<number | undefined> = []): TubeSpec[] {
  const sides = mode === 'ffa' ? 4 : 2;
  return tubeContents(discs, sideOf, sides).map((owners, side) => ({ side, angle: angles[side] ?? defaultTubeAngle(mode, side), owners }));
}
// Tubes follow the board's circle, so a stored angle is all that is saved.
export const normalizeAngle = (angle: number) => { const a = angle % (Math.PI * 2); return a < 0 ? a + Math.PI * 2 : a; };
