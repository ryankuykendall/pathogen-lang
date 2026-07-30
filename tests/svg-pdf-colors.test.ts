import { describe, expect, it } from 'vitest';

import { flattenOverWhite, paintedOnWhite } from '../playground/utils/svg-pdf-colors';

// resolveCssColorToHex itself needs a real canvas (browser-only), so it is
// covered end-to-end by the export harness (project-docs/unified-export/
// verify-export.ts, section 12b: transparent + semi-transparent workspace
// background → PDF bleed fill). The decision branch and the compositing math
// it delegates to are pure and tested here.
describe('flattenOverWhite', () => {
  it('alpha 1 returns the color unchanged', () => {
    expect(flattenOverWhite('#3366cc', 1)).toBe('#3366cc');
    expect(flattenOverWhite('#000000', 1)).toBe('#000000');
  });

  it('alpha 0 returns white — fully transparent paints nothing over paper', () => {
    expect(flattenOverWhite('#000000', 0)).toBe('#ffffff');
    expect(flattenOverWhite('#3366cc', 0)).toBe('#ffffff');
  });

  it('composites each channel over white at intermediate alpha', () => {
    // 0×0.5 + 255×0.5 = 127.5 → 128
    expect(flattenOverWhite('#000000', 0.5)).toBe('#808080');
    // r: 51×0.25 + 255×0.75 = 204, g: 102×0.25 + 255×0.75 = 217 (216.75),
    // b: 204×0.25 + 255×0.75 = 242 (242.25)
    expect(flattenOverWhite('#3366cc', 0.25)).toBe('#ccd9f2');
  });

  it('distinguishes opaque black from zero-alpha black', () => {
    expect(flattenOverWhite('#000000', 1)).toBe('#000000');
    expect(flattenOverWhite('#000000', 0)).not.toBe('#000000');
  });
});

// The decision branch behind resolveCssColorToHex — this is where the black
// bleed-fill bug lived: zero-alpha colors resolve as { hex: '#000000',
// alpha: 0 } and must paint NOTHING, never opaque black.
describe('paintedOnWhite', () => {
  it('unresolvable color paints nothing', () => {
    expect(paintedOnWhite(null)).toBeNull();
  });

  it('fully transparent color paints nothing — the black-border regression', () => {
    expect(paintedOnWhite({ hex: '#000000', alpha: 0 })).toBeNull();
    expect(paintedOnWhite({ hex: '#3366cc', alpha: 0 })).toBeNull();
  });

  it('opaque color paints as-is', () => {
    expect(paintedOnWhite({ hex: '#14101c', alpha: null })).toBe('#14101c');
    expect(paintedOnWhite({ hex: '#000000', alpha: null })).toBe('#000000');
  });

  it('semi-transparent color paints flattened over white', () => {
    expect(paintedOnWhite({ hex: '#000000', alpha: 0.5 })).toBe('#808080');
    expect(paintedOnWhite({ hex: '#3366cc', alpha: 0.25 })).toBe('#ccd9f2');
  });
});
