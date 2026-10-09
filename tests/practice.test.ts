import { describe, expect, it } from 'vitest';
import { aimOffset, beginLog, liveText, recordEvent, recordStep, summarize, summaryRows, summaryJson } from '../src/practice';
import { makeDisc } from '../src/sim/physics';

const launched = (vx: number, vy: number, spin = 0) => { const d = makeDisc(1, 0, 0, 12); d.vx = vx; d.vy = vy; d.spin = spin; return d; };

describe('aim offset', () => {
  it('is zero for a shot straight at the center', () => {
    expect(aimOffset({ x: 0, y: 12 }, 0, -50)).toBeCloseTo(0);
  });
  it('is signed by side from the shooter\'s point of view', () => {
    const left = aimOffset({ x: 0, y: 12 }, 5, -50), right = aimOffset({ x: 0, y: 12 }, -5, -50);
    expect(Math.sign(left)).toBe(-Math.sign(right));
    expect(Math.abs(left)).toBeCloseTo(Math.atan(5 / 50) * 180 / Math.PI, 3);
  });
  it('is zero for a disc that was not launched', () => {
    expect(aimOffset({ x: 0, y: 12 }, 0, 0)).toBe(0);
  });
});

describe('shot log', () => {
  it('measures path length and elapsed time from the shooter only', () => {
    const d = launched(0, -50), other = makeDisc(2, 1, 3, 3), log = beginLog(d);
    d.y = 9; recordStep(log, [d, other], 0.1);
    d.y = 5; other.x = 99; recordStep(log, [d, other], 0.1);
    expect(log.path).toBeCloseTo(7); expect(log.elapsed).toBeCloseTo(0.2);
  });
  it('stops counting distance once the shooter has left the board', () => {
    const d = launched(0, -50), log = beginLog(d);
    d.y = 8; recordStep(log, [d], 0.1); d.state = 'out'; d.y = -40; recordStep(log, [d], 0.1);
    expect(log.path).toBeCloseTo(4);
  });
  it('counts a repeated report of one contact once, and a later one separately', () => {
    const log = beginLog(launched(0, -50));
    const hit = { kind: 'disc' as const, speed: 12, x: 0, y: 0, key: 'a:b' };
    recordEvent(log, hit); log.elapsed += 0.01; recordEvent(log, hit);
    expect(log.hits.disc).toBe(1);
    log.elapsed += 0.05; recordEvent(log, { ...hit, speed: 30 });
    expect(log.hits.disc).toBe(2); expect(log.strongestHit).toBe(30);
  });
  it('tracks event kinds separately and only disc hits set the hardest hit', () => {
    const log = beginLog(launched(0, -50));
    recordEvent(log, { kind: 'peg', speed: 99, x: 0, y: 0, key: 'p' }); recordEvent(log, { kind: 'lip', speed: 5, x: 0, y: 0, key: 'l' });
    expect(log.hits.peg).toBe(1); expect(log.hits.lip).toBe(1); expect(log.strongestHit).toBe(0);
  });
});

describe('summary', () => {
  it('describes where the shooter finished', () => {
    const log = beginLog(launched(0, -50, 1.5)), d = launched(0, -50, 1.5);
    d.x = 0; d.y = 2; recordStep(log, [d], 0.5);
    const s = summarize(log, [d], { touched: new Set([1, 2]) });
    expect(s.result.label).toBe('Inside the 15 ring'); expect(s.discsStruck).toBe(1); expect(s.launchSpeed).toBeCloseTo(50);
  });
  it('reports a sunk disc and a disc that left the board', () => {
    const log = beginLog(launched(0, -50)), d = launched(0, -50);
    d.state = 'sunk'; expect(summarize(log, [d], null).result.label).toBe('Sank in the center hole');
    d.state = 'out'; expect(summarize(log, [d], null).result.label).toBe('Left the board');
  });
  it('handles a shooter that is no longer in the disc list', () => {
    expect(summarize(beginLog(launched(0, -50)), [], null).result.label).toBe('Disc removed');
  });
  it('gives readable rows and valid JSON', () => {
    const log = beginLog(launched(0, -50)), d = launched(0, -50); d.y = 6; recordStep(log, [d], 1);
    const s = summarize(log, [d], null), rows = summaryRows(s);
    expect(rows.map(r => r[0])).toContain('Launch speed'); expect(rows.every(([k, v]) => k && v)).toBe(true);
    expect(JSON.parse(summaryJson(s)).tune.frictionMu).toBeGreaterThan(0);
  });
  it('shows the fastest moving disc while live', () => {
    const d = launched(30, 40), log = beginLog(d);
    expect(liveText(log, [d])).toContain('50.0 in/s');
  });
});
