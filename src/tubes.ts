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

// Dragging: a tube slides around the rim, so a pointer on the board gives an
// angle. Tubes never overlap: if the wanted spot is taken, the tube rests
// against the neighbour on the side it was dragged from.
export const TUBE_GAP = 0.16;
export const angleFromPoint = (p: { x: number; y: number }) => normalizeAngle(Math.atan2(p.x, p.y));
const turn = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function placeTube(angles: number[], side: number, wanted: number, minGap = TUBE_GAP): number {
  let angle = normalizeAngle(wanted);
  for (let pass = 0; pass < 3; pass++) {
    for (let other = 0; other < angles.length; other++) {
      if (other === side) continue;
      const delta = turn(angle, angles[other]);
      if (Math.abs(delta) < minGap) angle = normalizeAngle(angles[other] + (delta >= 0 ? minGap : -minGap));
    }
  }
  return angle;
}
// Saved positions are kept per game mode, since the defaults differ.
export type TubeAngleStore = Partial<Record<Mode, number[]>>;
export function readTubeAngles(raw: unknown): TubeAngleStore {
  const store: TubeAngleStore = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return store;
  for (const mode of ['duel', 'teams', 'ffa'] as const) {
    const list = (raw as Record<string, unknown>)[mode];
    if (Array.isArray(list)) store[mode] = list.slice(0, 4).map(a => typeof a === 'number' && Number.isFinite(a) ? normalizeAngle(a) : NaN);
  }
  return store;
}
export const anglesFor = (store: TubeAngleStore, mode: Mode): Array<number | undefined> => (store[mode] ?? []).map(a => Number.isFinite(a) ? a : undefined);

// The drawn tube follows the dragged angle through a stiff, nearly critically
// damped spring. Its angular acceleration is what the loose discs inside feel,
// so a quick drag rattles them and a slow one barely does. Semi-implicit steps.
export const RIM_STIFFNESS = 700;
export interface RimMotion { a: number; w: number }
const shortestTurn = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function stepRim(m: RimMotion, target: number, dt: number): { motion: RimMotion; accel: number } {
  if (dt <= 0) return { motion: m, accel: 0 };
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps, damping = 2 * Math.sqrt(RIM_STIFFNESS) * 0.95;
  let a = m.a, w = m.w, sum = 0;
  for (let i = 0; i < steps; i++) {
    const acc = RIM_STIFFNESS * shortestTurn(target, a) - damping * w;
    w += acc * h; a += w * h; sum += acc;
  }
  return { motion: { a: normalizeAngle(a), w }, accel: sum / steps };
}
// Acceleration of the tube in its own frame (x along the rim, z outward).
export const rimFrameAccel = (accel: number, w: number, radius: number) => ({ x: accel * radius, z: -w * w * radius });

// The turn waits for a 20 to fall into its tube before the view moves on. Done
// once nothing is falling and the last landing has had HOLD seconds to be seen,
// or when MAX seconds have passed since the drop began (so it can never hang).
export const DROP_HOLD = 0.9, DROP_MAX = 3.5;
export function dropFinished(now: number, started: number, lastLand: number | null, falling: boolean): boolean {
  if (now - started >= DROP_MAX) return true;
  if (falling) return false;
  return lastLand !== null && lastLand >= started && now - lastLand >= DROP_HOLD;
}
