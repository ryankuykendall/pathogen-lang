import { describe, it, expect } from 'vitest';
import { getKnownVariants, nearestWeight, getAvailableWeights } from '../playground/utils/google-fonts';

describe('getKnownVariants', () => {
  it('returns the curated variants for a known family', () => {
    expect(getKnownVariants('Baumans')).toEqual([400]);
    expect(getKnownVariants('Titillium Web')).toEqual([200, 300, 400, 600, 700, 900]);
  });

  it('returns null for an unknown family — never a default', () => {
    // The contract that distinguishes this from getAvailableWeights: callers
    // must be able to tell "family unknown" apart from "has 400 and 700",
    // otherwise weight validation would snap weights for families whose real
    // variants we don't know.
    expect(getKnownVariants('TotallyMadeUpFamily')).toBeNull();
    expect(getAvailableWeights('TotallyMadeUpFamily')).toEqual([400, 700]);
  });

  it('covers system font stacks', () => {
    expect(getKnownVariants('sans-serif')).toEqual([400, 700]);
    expect(getKnownVariants('cursive')).toEqual([400]);
  });
});

describe('nearestWeight', () => {
  it('returns an exact match unchanged', () => {
    expect(nearestWeight(400, [200, 400, 700])).toBe(400);
  });

  it('snaps to the only variant of a single-weight family', () => {
    expect(nearestWeight(900, [400])).toBe(400);
    expect(nearestWeight(100, [400])).toBe(400);
  });

  it('breaks distance ties toward the lower weight', () => {
    expect(nearestWeight(500, [400, 600])).toBe(400);
  });

  it('picks the closer variant regardless of direction', () => {
    expect(nearestWeight(100, [300, 700])).toBe(300);
    expect(nearestWeight(800, [200, 900])).toBe(900);
  });
});
