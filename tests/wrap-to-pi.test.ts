import { describe, expect, it } from 'vitest';

import { wrapToPi } from '../src/evaluator/sampling';

// The helper behind ISSUE-020: (−π, π], the atan2 convention, so exactly-left
// is +π like tangent(t) reports it.
describe('wrapToPi', () => {
  it('leaves values already in (−π, π] alone', () => {
    expect(wrapToPi(0)).toBe(0);
    expect(wrapToPi(0.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 12);
    expect(wrapToPi(-0.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
    expect(wrapToPi(Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('folds the bottom-left quadrant that the unwrapped normal produced', () => {
    expect(wrapToPi(-1.25 * Math.PI)).toBeCloseTo(0.75 * Math.PI, 12);
    expect(wrapToPi(-1.17 * Math.PI)).toBeCloseTo(0.83 * Math.PI, 12);
    expect(wrapToPi(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 12);
  });

  it('reports exactly left as +π, never −π', () => {
    expect(wrapToPi(-Math.PI)).toBe(Math.PI);
    expect(wrapToPi(-3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('handles any number of turns', () => {
    expect(wrapToPi(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapToPi(2.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 12);
    expect(wrapToPi(-4.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
  });
});
