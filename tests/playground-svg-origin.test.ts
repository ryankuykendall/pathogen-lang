// Tests for playground/utils/svg-origin.ts — the viewBox origin
// normalization used when the admin moderation view feeds a compiled
// approval render into the thumbnail crop modal (which assumes a 0,0
// origin throughout its crop/pan/zoom math).

import { describe, expect, it } from 'vitest';

import { computeOriginNormalization } from '../playground/utils/svg-origin';

describe('computeOriginNormalization', () => {
  it('returns no translate for a zero origin', () => {
    expect(computeOriginNormalization('0 0 800 600')).toEqual({
      width: 800,
      height: 600,
      translate: null,
    });
  });

  it('translates negative origins to (0,0)', () => {
    expect(computeOriginNormalization('-100 -100 200 200')).toEqual({
      width: 200,
      height: 200,
      translate: 'translate(100 100)',
    });
  });

  it('translates positive origins to (0,0)', () => {
    expect(computeOriginNormalization('50 25 400 300')).toEqual({
      width: 400,
      height: 300,
      translate: 'translate(-50 -25)',
    });
  });

  it('handles a non-zero origin on one axis only', () => {
    expect(computeOriginNormalization('0 -10 100 120')).toEqual({
      width: 100,
      height: 120,
      translate: 'translate(0 10)',
    });
  });

  it('handles fractional values', () => {
    expect(computeOriginNormalization('-0.5 1.25 10.5 20.75')).toEqual({
      width: 10.5,
      height: 20.75,
      translate: 'translate(0.5 -1.25)',
    });
  });

  it('accepts comma separators and extra whitespace', () => {
    expect(computeOriginNormalization('  -10, -20,  100, 50 ')).toEqual({
      width: 100,
      height: 50,
      translate: 'translate(10 20)',
    });
  });

  const fallback = { width: 200, height: 200, translate: null };

  it('falls back safely on malformed input', () => {
    expect(computeOriginNormalization('')).toEqual(fallback);
    expect(computeOriginNormalization('not a viewbox')).toEqual(fallback);
    expect(computeOriginNormalization('0 0 200')).toEqual(fallback);
    expect(computeOriginNormalization('0 0 200 200 5')).toEqual(fallback);
  });

  it('falls back on non-positive dimensions', () => {
    expect(computeOriginNormalization('0 0 0 200')).toEqual(fallback);
    expect(computeOriginNormalization('0 0 200 -5')).toEqual(fallback);
  });
});
