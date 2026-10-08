import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DISC } from '../src/sim/constants';
import * as flick from '../src/game/flick';
import * as pointerHelpers from '../src/game/pointer';
import { appendFlickContactSample, finalizeFlickContact, releaseShot, type FlickContact, type FlickSample, updateFlickContact } from '../src/game/flick';

const disc = { x: 0, y: 12 };
const heading = (p: { x: number; y: number }) => Math.atan2(p.x, -p.y) * 180 / Math.PI;
function subdivide(path: FlickSample[], divisions: number): FlickSample[] {
  return [path[0], ...path.slice(1).flatMap((b, i) => {
    const a = path[i];
    return Array.from({ length: divisions }, (_, j) => {
      const f = (j + 1) / divisions;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
    });
  })];
}
function register(samples: FlickSample[], target = disc) {
  let contact: FlickContact | null = null, history: FlickSample[] = [], power: FlickSample[] = [];
  for (const sample of samples) {
    history = appendFlickContactSample(history, sample);
    contact = updateFlickContact(contact, history, target);
    power = [...power, sample].filter(s => sample.t - s.t <= 120);
  }
  const registered = contact;
  contact = finalizeFlickContact(contact, history, target);
  return { registered, contact, power, shot: contact ? releaseShot(power, target, contact) : null };
}
function prelude(angle: number, slow = false): FlickSample[] {
  const a = angle * Math.PI / 180;
  const start = { x: -0.0625, y: 12.5, t: 0 };
  const kink = slow ? { x: -0.1875, y: 12.28349364905389, t: 50 } : { ...start, y: start.y - DISC.radius * 0.5, t: 10 };
  return [start, kink, { x: kink.x + 5 * Math.sin(a), y: kink.y - 5 * Math.cos(a), t: kink.t + 50 }];
}
// Zero the registered offset only in this measurement to isolate intent from
// independent glancing deflection. Real launch geometry is tested separately.
function intent(result: ReturnType<typeof register>, target = disc) {
  expect(result.contact?.powered).toBe(true);
  return releaseShot(result.power, target, { ...result.contact!, offset: 0 })!;
}

describe('release intent separate from powered registration', () => {
  it.each([30, 60])('does not lock a %s-degree main swipe to a small vertical onset', angle => {
    const result = register(subdivide(prelude(angle), 16));
    expect(heading(result.registered!.direction)).toBeCloseTo(0, 10);
    expect(heading(intent(result))).toBeCloseTo(angle, 10);
    expect(result.contact!.offset).toBe(result.registered!.offset);
  });

  it('excludes slow left-up setup and is invariant under collinear subdivisions', () => {
    for (const divisions of [1, 4, 16, 64]) {
      const result = register(subdivide(prelude(30, true), divisions));
      expect(heading(intent(result)), `divisions=${divisions}`).toBeCloseTo(30, 10);
      expect(result.contact!.offset).toBe(result.registered!.offset);
    }
  });

  it('uses the powered tail rather than slow setup even when it is shorter than 2R', () => {
    const path = prelude(30, true).slice(0, 2), start = path[1];
    path.push({ x: start.x + 0.25, y: start.y - Math.sqrt(3) * 0.25, t: start.t + 5 });
    for (const divisions of [1, 4, 16, 64]) expect(heading(intent(register(subdivide(path, divisions))))).toBeCloseTo(30, 10);
  });

  it('measures a curved spatial tail identically at every subdivision, not the last tangent', () => {
    const path = prelude(30).slice(0, 2);
    for (const [angle, distance] of [[30, 2], [45, 0.625], [60, 0.3125]]) {
      const p = path[path.length - 1], a = angle * Math.PI / 180;
      path.push({ x: p.x + distance * Math.sin(a), y: p.y - distance * Math.cos(a), t: p.t + distance * 10 });
    }
    for (const divisions of [1, 4, 16, 64]) {
      const result = register(subdivide(path, divisions));
      expect(heading(intent(result))).toBeCloseTo(45, 10);
      expect(result.contact!.direction).toEqual(result.registered!.direction);
    }
  });

  it('does not chase a tiny noisy last segment', () => {
    const path = prelude(30), last = path[path.length - 1];
    path.push({ x: last.x - 0.01, y: last.y, t: last.t + 1 });
    expect(Math.abs(heading(intent(register(path))) - 30)).toBeLessThan(0.5);
  });

  it('keeps complete straight launches exact, including near-edge geometry and short clips', () => {
    for (const offset of [-0.99, -0.9, -0.5, -0.15, 0, 0.15, 0.5, 0.9, 0.99]) {
      for (const divisions of [1, 4, 16, 64]) {
        for (const [travel, speed] of [[5, 100], [1.25, 10], [0.3, 30]]) {
          const start = { x: offset * DISC.radius, y: disc.y + travel / 2, t: 0 };
          const samples = subdivide([start, { ...start, y: start.y - travel, t: travel / speed * 1000 }], divisions);
          const result = register(samples);
          if (!result.contact?.powered) { expect(result.shot).toBeNull(); continue; }
          const legacy = { offset: result.contact.offset, direction: result.contact.direction, powered: true };
          expect(result.shot).toEqual(releaseShot(result.power, disc, legacy));
          expect(result.contact.finishDirection).toBeUndefined();
          expect(result.contact.offset).toBeCloseTo(-offset, 10);
        }
      }
    }
  });

  it('retains straight diagonal launches exactly in every quadrant', () => {
    for (const angle of [30, 60]) for (const offset of [-0.9, 0, 0.9]) for (let q = 0; q < 4; q++) {
      const a = angle * Math.PI / 180, c = Math.cos(q * Math.PI / 2), s = Math.sin(q * Math.PI / 2);
      const rotate = (p: { x: number; y: number }) => ({ x: c * p.x - s * p.y, y: s * p.x + c * p.y });
      const start = { x: -Math.sin(a) + Math.cos(a) * offset * DISC.radius,
        y: 12 + Math.cos(a) + Math.sin(a) * offset * DISC.radius, t: 0 };
      const path = subdivide([start, { x: start.x + 4 * Math.sin(a), y: start.y - 4 * Math.cos(a), t: 40 }], 16)
        .map(p => ({ ...rotate(p), t: p.t }));
      const result = register(path, rotate(disc));
      expect(result.contact?.powered).toBe(true);
      const legacy = { offset: result.contact!.offset, direction: result.contact!.direction, powered: true };
      expect(result.shot).toEqual(releaseShot(result.power, rotate(disc), legacy));
    }
  });

  it('changes only heading, preserving registered offset, launch speed and spin', () => {
    const result = register(subdivide(prelude(60), 16));
    const old = releaseShot(result.power, disc, result.registered!)!;
    expect(result.contact!.offset).toBe(result.registered!.offset);
    expect(result.contact!.powered).toBe(result.registered!.powered);
    expect(result.contact!.direction).toEqual(result.registered!.direction);
    expect(Math.hypot(result.shot!.x, result.shot!.y)).toBeCloseTo(Math.hypot(old.x, old.y), 12);
    expect(result.shot!.spin).toBe(old.spin);
    expect(heading(result.shot!) - heading(old)).toBeCloseTo(60, 10);
  });

  it('keeps registration frozen but explicitly refines a meaningful hooked finish on release', () => {
    const swipe = [{ x: 0, y: 14, t: 0 }, { x: 0, y: 10, t: 100 }];
    const contact = updateFlickContact(null, swipe, disc)!;
    const hooked = [...swipe, { x: 1, y: 9, t: 120 }];
    expect(updateFlickContact(contact, hooked, disc)).toBe(contact);
    expect(releaseShot(hooked, disc, contact)!.x).toBe(0); // Unfinalized compatibility path.
    const final = finalizeFlickContact(contact, hooked, disc)!;
    expect(final.direction).toEqual(contact.direction); expect(final.offset).toBe(contact.offset);
    expect(heading(releaseShot(hooked, disc, final)!)).toBeCloseTo(45, 10);
    expect(contact.finishDirection).toBeUndefined(); // No mutation of registered geometry.
  });

  it('ignores a brief stationary lift but never adds power after a held release', () => {
    const samples = subdivide(prelude(30), 16), end = samples[samples.length - 1];
    for (const dt of [5, 16, 17, 50, 100]) {
      const result = register([...samples, { ...end, t: end.t + dt }]);
      expect(result.shot).not.toBeNull();
      expect(heading(intent(result))).toBeCloseTo(30, 10);
    }
    const held = register([...samples, { ...end, t: end.t + 200 }]);
    expect(held.contact!.powered).toBe(true); expect(held.shot).toBeNull();
    expect(register([{ ...disc, t: 0 }, { ...disc, t: 10 }]).shot).toBeNull();
  });

  it('retains meaningful finish intent instead of using a tiny tail after an observed stop', () => {
    const samples = subdivide(prelude(30), 16), end = samples[samples.length - 1];
    samples.push({ ...end, t: end.t + 10 }, { x: end.x - 0.02, y: end.y - 0.01, t: end.t + 11 });
    const result = register(samples);
    expect(heading(intent(result))).toBeCloseTo(30, 10);
    expect(result.contact!.direction).toEqual(result.registered!.direction);
  });

  it('does not restore onset aim when final endpoint noise is below the contact-speed gate', () => {
    for (const [dx, dy, dt] of [[-0.005, 0, 1], [0.001, -0.001, 5], [-0.01, 0, 1]]) {
      for (const divisions of [1, 4, 16]) {
        const samples = subdivide(prelude(30), 16), end = samples[samples.length - 1];
        const noise = subdivide([end, { x: end.x + dx, y: end.y + dy, t: end.t + dt }], divisions);
        const result = register([...samples, ...noise.slice(1)]);
        expect(result.shot).not.toBeNull();
        expect(Math.abs(heading(intent(result)) - 30)).toBeLessThan(0.5);
      }
    }
  });

  it('does not reuse stale finish intent when the same contact is finalized again', () => {
    const result = register(subdivide(prelude(30), 16));
    expect(result.contact!.finishDirection).toBeDefined();
    const end = result.power[result.power.length - 1];
    const invalid = [{ ...end, t: 0 }, { x: end.x + 1, y: end.y + 1, t: 10 }];
    expect(finalizeFlickContact(result.contact, invalid, disc)!.finishDirection).toBeUndefined();
  });

  it('requires a meaningful chord, not accumulated tiny loops', () => {
    const samples = prelude(30), end = samples[samples.length - 1];
    const points = [[0.02, 0], [0.02, -0.02], [0, -0.02], [0, 0]];
    for (let i = 0; i < 100; i++) {
      const [dx, dy] = points[i % points.length];
      samples.push({ x: end.x + dx, y: end.y + dy, t: end.t + (i + 1) * 0.5 });
    }
    expect(register(samples).contact!.finishDirection).toBeUndefined();
  });

  it('does not look past a meaningful slow reposition for old finish intent', () => {
    const path = prelude(30), end = path[path.length - 1];
    path.push({ x: end.x + DISC.radius * 0.2, y: end.y, t: end.t + 30 });
    for (const divisions of [1, 4, 16, 64]) {
      const result = register(subdivide(path, divisions));
      expect(result.contact!.finishDirection).toBeUndefined();
    }
  });

  it('bounds retained finish intent by time even with almost no trailing displacement', () => {
    const path = prelude(30), end = path[path.length - 1];
    path.push({ x: end.x + 0.001, y: end.y, t: end.t + 121 });
    for (const divisions of [1, 4, 16, 64]) {
      const result = register(subdivide(path, divisions));
      expect(result.contact!.finishDirection).toBeUndefined();
      expect(result.shot).toBeNull();
    }
  });

  it('does not manufacture powered registration from slow brushes, late fast misses or outside paths', () => {
    const paths = [
      [{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 12.55, t: 50 }, { x: 1, y: 12.55, t: 250 }, { x: 1, y: 10, t: 300 }],
      [{ x: 0, y: 12.6, t: 0 }, { x: 0, y: 11.3, t: 500 }, { x: 0, y: 9, t: 550 }],
      [{ x: 0.7, y: 14, t: 0 }, { x: 0.7, y: 10, t: 40 }],
      [{ x: 0, y: 10, t: 0 }, { x: 0, y: 14, t: 40 }],
      [{ x: 0, y: 12.6, t: 0 }, { x: 0.02, y: 12.59, t: 1 }],
    ];
    for (const path of paths) for (const divisions of [1, 4, 16]) {
      const result = register(subdivide(path, divisions));
      expect(result.contact?.powered ?? false).toBe(false);
      expect(result.shot).toBeNull();
    }
  });

  it('keeps spatial finish information even when the power trail contains less than 2R', () => {
    const samples = prelude(30), start = samples[1];
    samples[2] = { x: start.x + 0.625, y: start.y - Math.sqrt(3) * 0.625, t: start.t + 150 };
    const result = register(subdivide(samples, 64));
    expect(result.power[result.power.length - 1].t - result.power[0].t).toBeLessThanOrEqual(120);
    expect(result.contact!.finishDirection).toBeDefined();
    expect(heading(intent(result))).toBeCloseTo(30, 10);
    const legacy = releaseShot(result.power, disc, result.registered!)!;
    expect(Math.hypot(result.shot!.x, result.shot!.y)).toBeCloseTo(Math.hypot(legacy.x, legacy.y), 10);
  });

  it('mirrors refined heading and preserves quadrant covariance', () => {
    const path = subdivide(prelude(60), 16), original = register(path).shot!;
    const mirror = register(path.map(p => ({ ...p, x: -p.x }))).shot!;
    expect(mirror.x).toBeCloseTo(-original.x, 12); expect(mirror.y).toBeCloseTo(original.y, 12); expect(mirror.spin).toBeCloseTo(-original.spin, 12);
    for (let q = 1; q < 4; q++) {
      const c = Math.cos(q * Math.PI / 2), s = Math.sin(q * Math.PI / 2);
      const rotate = (p: { x: number; y: number }) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
      const shot = register(path.map(p => ({ ...rotate(p), t: p.t })), rotate(disc)).shot!;
      expect(shot.x).toBeCloseTo(rotate(original).x, 10); expect(shot.y).toBeCloseTo(rotate(original).y, 10);
      expect(shot.spin).toBeCloseTo(original.spin, 10);
    }
  });
});

// Run the actual production move/release routing with board picking mocked,
// including the 120ms power filter and spatial contact history. This is not a
// native screen-space test; the parent separately verifies camera projection.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const section = main.slice(main.indexOf("canvas.addEventListener('pointerdown', e => {"), main.indexOf('\nfunction finishShot()'));
const production = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function route(samples: FlickSample[], coalesced: boolean) {
  const handlers: Record<string, (event: object) => void> = {}, shots: ReturnType<typeof releaseShot>[] = [];
  const staged = { ...disc, id: 1, owner: 0, state: 'board' };
  const context = {
    ...flick, ...pointerHelpers, window: { addEventListener: () => {} },
    paused: false, flickSpeedScale: () => 1, settings: { open: false }, phase: 'pass', readyAt: 0, performance: { now: () => 1000 }, deadline: null,
    canvas: { clientWidth: 800, clientHeight: 800, addEventListener: (name: string, cb: (event: object) => void) => { handlers[name] = cb; }, setPointerCapture: () => {} },
    pointer: null, placementPointer: null, placementPress: { x: 0, y: 0 }, orbitPointer: null, orbitLast: { x: 0, y: 0 },
    pinching: false, pinchDistance: 0, touches: new Map(), touchDistance: () => 0, setZoom: () => {}, zoom: 1,
    press: { x: 0, y: 0 }, flickStart: { x: 0, y: 0 }, discCrossed: false, flickContact: null, trail: [], contactTrail: [], staged,
    canInspectBoard: () => true, linePosition: () => null, placeAt: () => {}, expireShot: () => {}, cancelOrbit: () => {},
    scene: { boardPoint: (x: number, y: number) => ({ x: x / 100, y: y / 100 }), isViewMoving: () => false, dragView: () => {}, highlightDisc: () => {} },
    discs: [staged], player: 0, side: () => 0, hadOpponent: false, shot: null, sound: { play: () => {} }, used: [0], next: {}, banner: {}, hint: {}, hud: () => {}, save: () => {},
    releaseShot: (history: FlickSample[], target: { x: number; y: number }, contact: FlickContact) => {
      const shot = flick.releaseShot(history, target, contact); shots.push(shot); return shot;
    },
  };
  runInContext(production, createContext(context));
  const event = (p: FlickSample) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: p.x * 100, clientY: p.y * 100, timeStamp: p.t });
  handlers.pointerdown(event(samples[0]));
  if (coalesced) {
    handlers.pointermove({ ...event(samples[samples.length - 2]), getCoalescedEvents: () => samples.slice(1, -1).map(event) });
  } else for (const sample of samples.slice(1, -1)) handlers.pointermove(event(sample));
  handlers.pointerup(event(samples[samples.length - 1]));
  return { shot: shots[0] ?? null, phase: context.phase };
}

describe('production release intent routing', () => {
  it.each([30, 60])('refines a %s-degree main stroke through real production handlers, separately or coalesced', angle => {
    const samples = subdivide(prelude(angle), 16), result = register(samples);
    const separate = route(samples, false), batch = route(samples, true);
    expect(separate.phase).toBe('moving'); expect(batch.phase).toBe('moving');
    expect(separate.shot!.x).toBeCloseTo(result.shot!.x, 10);
    expect(separate.shot!.y).toBeCloseTo(result.shot!.y, 10);
    expect(separate.shot!.spin).toBeCloseTo(result.shot!.spin, 10);
    expect(batch.shot).toEqual(separate.shot);
  });
});
