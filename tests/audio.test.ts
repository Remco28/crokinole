import { describe, expect, it } from 'vitest';
import { impactSamples, type SoundKind } from '../src/audio/synthesis';
import { makeDisc, step, type PhysicsEvent, type Shot } from '../src/sim/physics';
const shot = (): Shot => ({ touched: new Set([1]), opponentContact: false, side: 0, sideOf: n => n });
describe('impact sound synthesis', () => {
  it('keeps wooden disc contact dry with virtually no sustained tail', () => {
    const rate = 44100, samples = impactSamples('disc', rate, 11);
    let total = 0, tail = 0;
    samples.forEach((value, i) => { total += value * value; if (i / rate > 0.02) tail += value * value; });
    expect(tail / total).toBeLessThan(0.001);
  });
  for (const kind of ['disc', 'peg', 'sink', 'ditch', 'land', 'flick'] as SoundKind[]) {
    it(`${kind} has a finite signal, headroom, and a quiet tail`, () => {
      const data = impactSamples(kind, 44100, 11);
      let peak = 0, tail = 0;
      for (let i = 0; i < data.length; i++) {
        expect(Number.isFinite(data[i])).toBe(true);
        peak = Math.max(peak, Math.abs(data[i]));
        if (i > data.length - 220) tail = Math.max(tail, Math.abs(data[i]));
      }
      expect(peak).toBeGreaterThan(0.1); expect(peak).toBeLessThan(0.8); expect(tail).toBeLessThan(0.01);
    });
  }
});
describe('physics audio events', () => {
  it('emits one sink event and never repeats it for a removed disc', () => {
    const d = makeDisc(1, 0, 0.1, 0); const events: PhysicsEvent[] = [];
    for (let i = 0; i < 120; i++) step([d], 1 / 120, shot(), true, e => events.push(e));
    expect(events.map(e => e.kind)).toEqual(['sink']);
  });
  it('does not play a ditch sound for a stationary disc removed by the outer-line rule', () => {
    const events: PhysicsEvent[] = []; step([makeDisc(1, 0, 12, 0)], 1 / 120, shot(), true, e => events.push(e));
    expect(events).toEqual([]);
  });
  it('reports collision speed without changing simulation results', () => {
    const a = makeDisc(1, 0, 0, 6), b = makeDisc(2, 1, 1.3, 6); a.vx = 50;
    const silent = [{ ...a }, { ...b }], audible = [{ ...a }, { ...b }], events: PhysicsEvent[] = [];
    step(silent, 1 / 120, shot(), true); step(audible, 1 / 120, shot(), true, e => events.push(e));
    expect(audible).toEqual(silent); expect(events[0].kind).toBe('disc'); expect(events[0].speed).toBeGreaterThan(45);
  });
});
