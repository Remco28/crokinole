import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendFlickContactSample, finalizeFlickContact, releaseShot, updateFlickContact, type FlickContact, type FlickSample } from '../src/game/flick';

// Exercise the production pointerup branch without replacing its routing logic.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const handler = main.slice(main.indexOf("canvas.addEventListener('pointerup', e => {"), main.indexOf('\nfunction finishShot()'));
function route(samples: FlickSample[]) {
  const disc = { x: 0, y: 12 }, scale = 10;
  let contact: FlickContact | null = null, history: FlickSample[] = [], callback: (event: object) => void;
  for (const sample of samples.slice(0, -1)) {
    history = appendFlickContactSample(history, sample);
    contact = updateFlickContact(contact, history, disc);
  }
  const result = { placements: 0, launches: 0, cancels: 0 };
  const context = {
    canvas: { addEventListener: (_: string, cb: typeof callback) => { callback = cb; } },
    paused: false, placementPointer: null, orbitPointer: null, pinching: false,
    touches: new Map(), pointer: 1, staged: disc, phase: 'pass', deadline: null,
    scene: { isViewMoving: () => false, boardPoint: (x: number, y: number) => ({ x: x / scale, y: y / scale }) },
    press: { x: samples[0].x * scale, y: samples[0].y * scale },
    flickContact: contact, contactTrail: history, finalizeFlickContact,
    cancel: () => { result.cancels++; }, placeAt: () => { result.placements++; },
    endPointer: () => {}, expireShot: () => {},
    sampleFlick: (p: { x: number; y: number }, t: number) => {
      context.contactTrail = appendFlickContactSample(context.contactTrail, { ...p, t });
      context.flickContact = updateFlickContact(context.flickContact, context.contactTrail, disc);
    },
    releaseFlick: () => {
      if (context.flickContact && releaseShot(samples, disc, context.flickContact)) result.launches++;
    },
  };
  runInContext(handler, createContext(context));
  const last = samples[samples.length - 1];
  callback!({ pointerId: 1, clientX: last.x * scale, clientY: last.y * scale, timeStamp: last.t });
  return result;
}
describe('powered strike versus screen tap routing', () => {
  it('keeps stationary taps and unpowered central movement as placement', () => {
    expect(route([{ x: 0, y: 12, t: 0 }, { x: 0, y: 12, t: 10 }])).toEqual({ placements: 1, launches: 0, cancels: 1 });
    expect(route([{ x: 0, y: 12.15, t: 0 }, { x: 0, y: 12, t: 5 }]).placements).toBe(1);
  });
  it('launches a powered three-pixel edge clip instead of placing', () => {
    const samples = [12.15, 12, 11.85].map((y, i) => ({ x: 0.5625, y, t: i * 5 }));
    expect(route([...samples, { ...samples[2], t: 15 }])).toEqual({ placements: 0, launches: 1, cancels: 1 });
  });
  it('retains tap routing when a held short edge clip never becomes powered', () => {
    const samples = [12.15, 12, 11.85].map((y, i) => ({ x: 0.5625, y, t: i * 5 }));
    expect(route([...samples, { ...samples[2], t: 26 }]).launches).toBe(1);
    for (const t of [27, 210]) {
      expect(route([...samples, { ...samples[2], t }])).toEqual({ placements: 1, launches: 0, cancels: 1 });
    }
  });
  it('cancels a held powered four-pixel strike without converting it into placement', () => {
    expect(route([{ x: 0, y: 12.2, t: 0 }, { x: 0, y: 11.8, t: 10 }, { x: 0, y: 11.8, t: 210 }])).toEqual({ placements: 0, launches: 0, cancels: 1 });
  });
});
