import { beforeAll, describe, expect, it } from 'vitest';
import { DISC, PEG_COLLISION_MARGIN, TUNE } from '../src/sim/constants';
import { DISC_SPIN_INERTIA } from '../src/sim/spin';
import { BASELINE, checkSourceNeutrality, compareGestures, compareLaunches,
  compareSimulations, loadHelpers, checkSignedHopIntegration, compareAcceptedIntent } from '../scripts/physics-integrated-equivalence.mjs';

describe('explicit integrated and neutral counterfactual profiles', () => {
  let current: ReturnType<typeof loadHelpers>, baseline: ReturnType<typeof loadHelpers>;
  beforeAll(() => { current = loadHelpers('actual-integrated'); baseline = loadHelpers('pinned-baseline'); });

  it('names the existing scales without unifying surface and hop gravity', () => {
    expect(TUNE.surfaceGravity).toBe(386);
    expect(TUNE.gravityZ).toBe(180);
    expect(PEG_COLLISION_MARGIN).toBe(1.02);
    expect(DISC_SPIN_INERTIA).toBe(DISC.radius * DISC.radius / 2);
  });
  it('allows only approved physics slices and explicitly pinned cosmetic source', () => {
    const gate = checkSourceNeutrality('disc-appearance');
    expect(gate.exactSourceFiles).toBe(19);
    expect(gate.cosmeticSourceFiles).toBe(9);
    expect(() => checkSourceNeutrality('unknown')).toThrow();
    expect(() => checkSourceNeutrality()).toThrow(); // Old whole-source policy cannot bless UI changes.
  });
  it('matches real baseline launches exactly across offsets, power, quadrants and diagonal guards', () => {
    expect(compareLaunches(current, baseline)).toBe(34944);
  });
  it('matches real powered finalization, onset, noise and short-edge registration exactly', () => {
    const result = compareGestures(current, baseline);
    expect(result).toEqual({ comparisons: 292, poweredFinishes: 112, rejected: 63 });
  });
  it('preserves historical baseline assertions under explicit restored-baseline counterfactual', () => {
    const result = compareSimulations(loadHelpers('cleanup-restored-baseline'), baseline);
    expect(result.comparisons).toBe(72);
    expect(result.frames).toBe(4455);
    expect(result.eventKinds).toEqual(['disc', 'ditch', 'land', 'lip', 'peg', 'sink']);
  });
  it('matches actual candidate frames to independently reconstructed unrefactored spin/hop reference', () => {
    const result = compareSimulations(current, loadHelpers('unrefactored-spin-hop-reference'));
    expect(result.comparisons).toBe(72);
    expect(result.eventKinds).toEqual(['disc', 'ditch', 'land', 'lip', 'peg', 'sink']);
  });
  it('preserves finalized onset30 and hook45 launches exactly through mirrors and lift timing', () => {
    expect(compareAcceptedIntent(current,baseline).comparisons).toBe(36);
  });
  it('refuses missing or unknown verification profiles instead of autodetecting source drift', () => {
    expect(() => loadHelpers()).toThrow(); expect(() => loadHelpers('unknown')).toThrow();
  });
  it('covers signed kicks and finite settlement at production 120Hz and fine 240Hz', () => {
    const result = checkSignedHopIntegration();
    expect(result.cases).toBe(32); expect(result.allFiniteAndSettled).toBe(true);
  });
});
