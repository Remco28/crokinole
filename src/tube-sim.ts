import { DISC } from './sim/constants';

// A small physical model of the discs inside a 20s tube. It is separate from
// the board physics, which stays pinned to the accepted release. Everything is
// in the tube's own frame: x runs along the rim, z points out from the board,
// and y is height above the rim's top edge.
//
// The lowest disc rests on the thin rim, not a flat floor, so with only one or
// two discs it can rock a little; more discs above it press it steady. Discs
// are loose in the tube: a shove slides them against the wall (a knock) and
// rocking discs tick as they settle back. Landing drives sound-sized impacts.
export const TUBE_DIM = { radius: 0.8, height: 5.4, floor: 0.4 } as const;
export const TUBE_CAPACITY = Math.floor(TUBE_DIM.height / DISC.height);
export const TUBE_TUNE = {
  gravity: 386,                  // in/s²: a real drop
  play: TUBE_DIM.radius - DISC.radius, // sideways room each way
  friction: 0.3,                 // wood on wood: slides once the tube accelerates past μg
  wallRestitution: 0.35,
  landRestitution: 0.25,
  restSpeed: 6,                  // a landing slower than this stops without bouncing
  rockStiffness: 600,            // 1/s²: lone disc rocking on the rim (about 4 Hz)
  pressPerDisc: 1.5,             // extra stiffness for each disc above it
  upperStiffness: 3000,          // discs resting on discs are steady
  tangentStiffness: 4,           // rocking along the rim is stiffer than across it
  rockDamping: 0.05,             // damping ratio of the bottom disc; lone discs ring a while
  upperDamping: 0.4,
  accelToTilt: 1.3,              // tube acceleration to tilting torque
  maxTiltBottom: 0.14,           // rad: where the disc meets the tube wall
  maxTiltUpper: 0.05,
  tickSpeed: 0.8,                // in/s of rim speed worth reporting
  knockSpeed: 1,
  substep: 1 / 480,
} as const;

export interface TubeDisc {
  owner: number;
  x: number; z: number; vx: number; vz: number; // sideways position and speed
  y: number; vy: number;                          // centre height above the rim
  tx: number; tz: number; wx: number; wz: number; // tilt about x and z, and its rate
  falling: boolean;
}
export interface TubeState { discs: TubeDisc[]; seed: number; awake: boolean }
export type TubeEventKind = 'land' | 'knock' | 'tick';
export interface TubeEvent { kind: TubeEventKind; speed: number; level: number }
export interface TubeAccel { x: number; z: number }

const half = DISC.height / 2;
export const restHeight = (level: number) => half + level * DISC.height;
const noAccel: TubeAccel = { x: 0, z: 0 };

// Small deterministic generator so drops and tests are repeatable.
function rand(state: TubeState): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(state.seed ^ (state.seed >>> 15), 1 | state.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const signed = (state: TubeState) => rand(state) * 2 - 1;
const newDisc = (owner: number, level: number): TubeDisc => ({ owner, x: 0, z: 0, vx: 0, vz: 0, y: restHeight(level), vy: 0, tx: 0, tz: 0, wx: 0, wz: 0, falling: false });

// A tube that is already full of settled discs, as after a reload.
export function createTube(owners: number[], seed = 1): TubeState {
  return { discs: owners.slice(0, TUBE_CAPACITY).map((owner, level) => newDisc(owner, level)), seed, awake: false };
}
export const tubeOwners = (state: TubeState) => state.discs.map(d => d.owner);
export const tubeCount = (state: TubeState) => state.discs.length;

// Let a disc fall in from the top of the tube. Returns false when it is full.
export function dropDisc(state: TubeState, owner: number, downSpeed = 0): boolean {
  if (state.discs.length >= TUBE_CAPACITY) return false;
  const disc = newDisc(owner, state.discs.length);
  const room = TUBE_TUNE.play * 0.8;
  disc.x = signed(state) * room; disc.z = signed(state) * room;
  disc.vx = signed(state) * 3; disc.vz = signed(state) * 3;
  disc.y = TUBE_DIM.height + half + 0.2; disc.vy = -Math.abs(downSpeed);
  disc.tx = signed(state) * 0.12; disc.tz = signed(state) * 0.06;
  disc.falling = true;
  state.discs.push(disc); state.awake = true;
  return true;
}
export function nudgeTube(state: TubeState, speed: number) {
  for (const [i, d] of state.discs.entries()) if (!d.falling) { d.vx += signed(state) * speed / (1 + i * 0.3); d.vz += signed(state) * speed / (1 + i * 0.3); }
  state.awake = true;
}


function sideways(d: TubeDisc, h: number, accel: TubeAccel, level: number, emit?: (e: TubeEvent) => void) {
  const drag = TUBE_TUNE.friction * TUBE_TUNE.gravity;
  const supported = !d.falling;
  if (supported) {
    // The tube accelerates, so the disc feels the opposite push. Static
    // friction holds it until that push passes μg.
    if (Math.hypot(d.vx, d.vz) < 1e-3 && Math.hypot(accel.x, accel.z) <= drag) { d.vx = d.vz = 0; }
    else {
      d.vx -= accel.x * h; d.vz -= accel.z * h;
      const speed = Math.hypot(d.vx, d.vz), slowed = Math.max(0, speed - drag * h);
      if (speed > 0) { d.vx *= slowed / speed; d.vz *= slowed / speed; }
    }
  }
  d.x += d.vx * h; d.z += d.vz * h;
  const radius = Math.hypot(d.x, d.z), play = TUBE_TUNE.play;
  if (radius > play) {
    const nx = d.x / radius, nz = d.z / radius;
    d.x = nx * play; d.z = nz * play;
    const normal = d.vx * nx + d.vz * nz;
    if (normal > 0) {
      d.vx -= (1 + TUBE_TUNE.wallRestitution) * normal * nx; d.vz -= (1 + TUBE_TUNE.wallRestitution) * normal * nz;
      if (normal > TUBE_TUNE.knockSpeed) emit?.({ kind: 'knock', speed: normal, level });
    }
  }
}

function rock(d: TubeDisc, h: number, accel: TubeAccel, level: number, above: number, emit?: (e: TubeEvent) => void) {
  const bottom = level === 0;
  const kx = bottom ? TUBE_TUNE.rockStiffness * (1 + TUBE_TUNE.pressPerDisc * above) : TUBE_TUNE.upperStiffness;
  const kz = kx * TUBE_TUNE.tangentStiffness;
  const zeta = bottom ? TUBE_TUNE.rockDamping * (1 + 0.3 * above) : TUBE_TUNE.upperDamping;
  const gain = TUBE_TUNE.accelToTilt * (bottom ? 1 : 0.5);
  // Rotation about x leans the disc in or out; about z, along the rim.
  d.wx += (-gain * accel.z - kx * d.tx - 2 * zeta * Math.sqrt(kx) * d.wx) * h;
  d.wz += (gain * accel.x - kz * d.tz - 2 * zeta * Math.sqrt(kz) * d.wz) * h;
  const beforeX = d.tx, beforeZ = d.tz;
  d.tx += d.wx * h; d.tz += d.wz * h;
  const limit = bottom ? TUBE_TUNE.maxTiltBottom : TUBE_TUNE.maxTiltUpper;
  for (const axis of ['x', 'z'] as const) {
    const t = axis === 'x' ? 'tx' : 'tz', w = axis === 'x' ? 'wx' : 'wz', before = axis === 'x' ? beforeX : beforeZ;
    if (Math.abs(d[t]) > limit) {
      const out = Math.sign(d[t]); d[t] = out * limit;
      if (d[w] * out > 0) { const speed = Math.abs(d[w]) * DISC.radius; d[w] = -d[w] * TUBE_TUNE.wallRestitution; if (speed > TUBE_TUNE.tickSpeed) emit?.({ kind: 'tick', speed, level }); }
    } else if (before * d[t] < 0) {
      // Rocking back through level: the rim edge slaps down.
      const speed = Math.abs(d[w]) * DISC.radius;
      if (speed > TUBE_TUNE.tickSpeed) emit?.({ kind: 'tick', speed, level });
    }
  }
}

// Shake the discs below a landing in proportion to how hard it hit.
function shudder(state: TubeState, index: number, speed: number) {
  for (let j = 0; j <= index; j++) {
    const d = state.discs[j], depth = index - j + 1, scale = speed / depth;
    if (j === index) { d.wx += signed(state) * scale * 0.12; d.wz += signed(state) * scale * 0.05; }
    else if (!d.falling) { d.vx += signed(state) * scale * 0.04; d.vz += signed(state) * scale * 0.04; d.wx += signed(state) * scale * 0.02; }
  }
}

function fall(state: TubeState, index: number, h: number, emit?: (e: TubeEvent) => void) {
  const d = state.discs[index], below = index > 0 ? state.discs[index - 1] : null;
  d.vy -= TUBE_TUNE.gravity * h; d.y += d.vy * h;
  const support = below ? below.y + DISC.height : half;
  if (d.y > support) return;
  d.y = support;
  const relative = d.vy - (below ? below.vy : 0);
  if (relative >= 0) return;
  const speed = -relative;
  if (below && below.falling) { d.vy = below.vy; return; }
  emit?.({ kind: 'land', speed, level: index });
  shudder(state, index, speed);
  if (speed < TUBE_TUNE.restSpeed) { d.vy = 0; d.falling = false; d.y = restHeight(index); }
  else d.vy = speed * TUBE_TUNE.landRestitution;
}

const rested = (d: TubeDisc) => !d.falling && Math.hypot(d.vx, d.vz) < 0.02 && Math.abs(d.wx) < 0.02 && Math.abs(d.wz) < 0.02 && Math.abs(d.tx) < 0.001 && Math.abs(d.tz) < 0.001;

// Advance the tube by dt seconds. accel is the tube's own acceleration in its
// frame (sliding it along the rim); it is zero when the tube is still.
export function stepTube(state: TubeState, dt: number, accel: TubeAccel = noAccel, emit?: (e: TubeEvent) => void) {
  if (dt <= 0) return;
  const moved = Math.hypot(accel.x, accel.z) > 1;
  if (!state.awake) { if (!moved || state.discs.length === 0) return; state.awake = true; }
  const steps = Math.max(1, Math.ceil(dt / TUBE_TUNE.substep)), h = dt / steps, n = state.discs.length;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      const d = state.discs[i];
      if (d.falling) fall(state, i, h, emit);
      else { d.y = restHeight(i); d.vy = 0; }
      sideways(d, h, accel, i, emit);
      if (d.falling) { d.wx *= 1 - 1.5 * h; d.wz *= 1 - 1.5 * h; d.tx += d.wx * h; d.tz += d.wz * h; }
      else rock(d, h, accel, i, n - 1 - i, emit);
    }
  }
  if (!moved && state.discs.every(rested)) {
    for (const d of state.discs) { d.vx = d.vz = 0; d.tx = d.tz = d.wx = d.wz = 0; }
    state.awake = false;
  }
}
