import { describe, expect, it } from 'vitest';
import { STEPS, TUTORIAL_KEY, isFreshVisit, stepBy, swipeDelta } from '../src/tutorial';

const storage = (items: Record<string, string>) => ({ getItem: (key: string) => items[key] ?? null });

describe('tutorial pages', () => {
  it('has a title, body and picture on every page', () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(4);
    for (const step of STEPS) { expect(step.title.length).toBeGreaterThan(0); expect(step.body.length).toBeGreaterThan(20); expect(step.art).toContain('<svg'); }
  });
  it('moves one page at a time and stops at both ends', () => {
    expect(stepBy(0, -1)).toBe(0);
    expect(stepBy(0, 1)).toBe(1);
    expect(stepBy(STEPS.length - 1, 1)).toBe(STEPS.length - 1);
  });
});

describe('first visit', () => {
  it('shows only when nothing is saved in this browser', () => {
    expect(isFreshVisit(storage({}))).toBe(true);
    expect(isFreshVisit(storage({ [TUTORIAL_KEY]: '1' }))).toBe(false);
    expect(isFreshVisit(storage({ 'crokinole-table': '{}' }))).toBe(false);
    expect(isFreshVisit(storage({ 'crokinole-match-spin-v2': '{}' }))).toBe(false);
  });
  it('treats unreadable storage as not a first visit', () => {
    expect(isFreshVisit({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});

describe('swipe', () => {
  it('turns the page for a long, mostly horizontal swipe', () => {
    expect(swipeDelta(-80, 5)).toBe(1);
    expect(swipeDelta(80, -5)).toBe(-1);
  });
  it('ignores short or mostly vertical movement', () => {
    expect(swipeDelta(-20, 0)).toBe(0);
    expect(swipeDelta(-60, 70)).toBe(0);
  });
});
