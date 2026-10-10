import type { Disc } from '../sim/physics';
import { BOARD } from '../sim/constants';

// Optional shot camera. It only pans the shooter view's anchor point: no yaw,
// tilt or zoom changes, so the horizon never rolls. All motion is slow and
// capped, because a camera chasing a fast disc is what made earlier tracking
// feel sickening.
export type ShotCamera = 'off' | 'gentle' | 'follow';
export const SHOT_CAMERAS: ShotCamera[] = ['off', 'gentle', 'follow'];
export const parseShotCamera = (value: unknown): ShotCamera => SHOT_CAMERAS.includes(value as ShotCamera) ? value as ShotCamera : 'off';

export interface Point { x: number; y: number }
export interface FocusTuning {
  tau: number;       // seconds: approach speed is gap / tau, so it slows into the target
  maxSpeed: number;  // inches per second, hard cap
  maxAccel: number;  // inches per second squared: the camera ramps up and brakes, never jerks
  deadZone: number;  // inches the target may stray before the camera moves at all
  maxPan: number;    // inches the focus may sit away from the waiting disc
  gain?: number;     // how much of the pan shows in the far view (default 0.3)
}
export interface FocusState extends Point { vx: number; vy: number }
export const atRest = (p: Point = { x: 0, y: 0 }): FocusState => ({ x: p.x, y: p.y, vx: 0, vy: 0 });
// After a shot settles: a slow glide to where the shooter's disc finished.
export const GENTLE: FocusTuning = { tau: 0.8, maxSpeed: 6, maxAccel: 8, deadZone: 0, maxPan: 10 };
// While discs are moving (Follow): slower and heavier, with a dead zone so the
// camera ignores small movements near the middle and only drifts once the
// action leaves it. It tracks the speed-weighted centre of the moving discs.
export const FOLLOW: FocusTuning = { tau: 0.55, maxSpeed: 9, maxAccel: 14, deadZone: 2, maxPan: 10, gain: 0.55 };
// While the discs are fast the lens eases out a little, so more of the board is
// in view and the camera seems quicker without moving harder. Smooth and capped.
export const PULLBACK = { maxZoomOut: 0.2, slow: 8, fast: 60, tau: 0.7 } as const;
export function pullbackFor(speed: number): number {
  const t = Math.max(0, Math.min(1, (speed - PULLBACK.slow) / (PULLBACK.fast - PULLBACK.slow)));
  return t * t * (3 - 2 * t);
}
export function fastestSpeed(discs: Disc[]): number {
  let fastest = 0;
  for (const d of discs) if (d.state === 'board') fastest = Math.max(fastest, Math.hypot(d.vx, d.vy));
  return fastest;
}
// The glide back out when the next turn starts: quicker, still ramped.
export const RETURN: FocusTuning = { tau: 0.35, maxSpeed: 40, maxAccel: 160, deadZone: 0, maxPan: 99 };
// How long a settled shot rests before the camera starts to glide.
export const SETTLE_DELAY_MS = 450;

// Accelerate toward a target with a speed cap and an acceleration cap, braking
// early enough to stop on it rather than overshoot.
export function stepFocus(state: FocusState, target: Point, dt: number, tuning: FocusTuning): FocusState {
  if (dt <= 0) return { ...state };
  const dx = target.x - state.x, dy = target.y - state.y, distance = Math.hypot(dx, dy);
  const gap = Math.max(0, distance - tuning.deadZone);
  const ux = distance ? dx / distance : 0, uy = distance ? dy / distance : 0;
  const wanted = gap <= 0 ? 0 : Math.min(tuning.maxSpeed, gap / tuning.tau, Math.sqrt(2 * tuning.maxAccel * gap));
  let ax = ux * wanted - state.vx, ay = uy * wanted - state.vy;
  const limit = tuning.maxAccel * dt, change = Math.hypot(ax, ay);
  if (change > limit) { ax *= limit / change; ay *= limit / change; }
  const vx = state.vx + ax, vy = state.vy + ay;
  let x = state.x + vx * dt, y = state.y + vy * dt;
  // Landing exactly on the leash edge ends the motion.
  // Reaching the leash edge: land on it and keep the (already acceleration-
  // limited) velocity, so the camera never halts with a jolt. The braking curve
  // above makes that speed small by then.
  if (gap > 0 && Math.hypot(x - state.x, y - state.y) >= gap) return { x: state.x + ux * gap, y: state.y + uy * gap, vx, vy };
  return { x, y, vx: gap <= 0 && Math.hypot(vx, vy) < 0.01 ? 0 : vx, vy: gap <= 0 && Math.hypot(vx, vy) < 0.01 ? 0 : vy };
}
// Keep a focus point near the waiting disc and on the playing surface.
export function limitFocus(focus: Point, origin: Point, tuning: FocusTuning): Point {
  let { x, y } = focus;
  const away = Math.hypot(x - origin.x, y - origin.y);
  if (away > tuning.maxPan) { x = origin.x + (x - origin.x) / away * tuning.maxPan; y = origin.y + (y - origin.y) / away * tuning.maxPan; }
  const radius = Math.hypot(x, y), edge = BOARD.playRadius - 1;
  if (radius > edge) { x *= edge / radius; y *= edge / radius; }
  return { x, y };
}
// Where the shooter's disc finished, or null if it left the board.
export function settleFocus(discs: Disc[], shooterId: number): Point | null {
  const shooter = discs.find(d => d.id === shooterId);
  return shooter && shooter.state === 'board' ? { x: shooter.x, y: shooter.y } : null;
}
// Centre of the discs that are still moving, weighted by speed, so a fast disc
// pulls the view more than a slow one. Null when nothing is moving quickly.
export function movingFocus(discs: Disc[], minSpeed = 1): Point | null {
  let weight = 0, x = 0, y = 0;
  for (const d of discs) {
    if (d.state !== 'board') continue;
    const speed = Math.hypot(d.vx, d.vy);
    if (speed < minSpeed) continue;
    weight += speed; x += d.x * speed; y += d.y * speed;
  }
  return weight > 0 ? { x: x / weight, y: y / weight } : null;
}
