import { describe, expect, it } from 'vitest';
import { pointerMoveSamples } from '../src/game/pointer';

type Sample = { clientX: number; clientY: number; timeStamp: number; getCoalescedEvents?: () => Sample[] };
describe('raw pointer sample extraction', () => {
  it('uses only raw coalesced samples, not their differently processed parent', () => {
    const raw: Sample[] = [{ clientX: 10, clientY: 20, timeStamp: 5 }, { clientX: 12, clientY: 18, timeStamp: 10 }];
    const parent: Sample = { clientX: 11, clientY: 19, timeStamp: 11, getCoalescedEvents: () => raw };
    expect(pointerMoveSamples(parent)).toBe(raw); expect(pointerMoveSamples(parent)).not.toContain(parent);
  });
  it('does not double-count the last raw sample when parent coordinates and time match', () => {
    const raw: Sample[] = [{ clientX: 10, clientY: 20, timeStamp: 5 }];
    const parent: Sample = { ...raw[0], getCoalescedEvents: () => raw };
    expect(pointerMoveSamples(parent)).toHaveLength(1);
  });
  it('falls back to the parent for unsupported browsers and empty coalesced lists', () => {
    const parent: Sample = { clientX: 10, clientY: 20, timeStamp: 5 };
    expect(pointerMoveSamples(parent)).toEqual([parent]);
    const empty: Sample = { ...parent, getCoalescedEvents: () => [] };
    expect(pointerMoveSamples(empty)).toEqual([empty]);
  });
});
