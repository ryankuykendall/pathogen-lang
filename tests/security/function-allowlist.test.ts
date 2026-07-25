import { describe, expect, it } from 'vitest';

import {
  __test__,
  CSS_COLOR_FUNCTION_NAMES,
  CSS_FILTER_FUNCTION_NAMES,
  CSS_SHAPE_FUNCTION_NAMES,
  CSS_TIMING_FUNCTION_NAMES,
  CSS_TRANSFORM_FUNCTION_NAMES,
} from '../../src/evaluator/sanitize';

/**
 * Membership pin for the security-sensitive CSS function allow-list.
 * ALLOWED_FUNCTION_NAMES was restructured (2026-07-25) from one inline set
 * into exported groups that completion data derives from — this test freezes
 * the exact merged membership so any future edit is a deliberate, visible
 * diff here rather than a silent drift.
 */
describe('CSS function allow-list membership', () => {
  it('the merged set is exactly the union of the exported groups', () => {
    const union = new Set<string>([
      ...CSS_COLOR_FUNCTION_NAMES,
      ...CSS_TRANSFORM_FUNCTION_NAMES,
      ...CSS_FILTER_FUNCTION_NAMES,
      ...CSS_SHAPE_FUNCTION_NAMES,
      ...CSS_TIMING_FUNCTION_NAMES,
    ]);
    expect([...__test__.ALLOWED_FUNCTION_NAMES].sort()).toEqual([...union].sort());
  });

  it('pins the exact membership (pre-restructure byte-identical set)', () => {
    expect([...__test__.ALLOWED_FUNCTION_NAMES].sort()).toEqual(
      [
        // Color
        'oklch', 'oklab', 'lch', 'lab', 'rgb', 'rgba', 'hsl', 'hsla',
        'hwb', 'color', 'color-mix', 'light-dark',
        // Transform
        'translate', 'translatex', 'translatey', 'translatez', 'translate3d',
        'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d',
        'scale', 'scalex', 'scaley', 'scalez', 'scale3d',
        'skew', 'skewx', 'skewy',
        'matrix', 'matrix3d',
        'perspective',
        // Filter
        'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale',
        'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia',
        // Clip-path basic shapes
        'inset', 'circle', 'ellipse', 'polygon', 'path',
        // Animation timing
        'cubic-bezier', 'steps',
      ].sort(),
    );
  });

  it('never lists the dangerous functions the validator must reject', () => {
    for (const forbidden of ['url', 'var', 'calc', 'image', 'image-set', 'src', 'expression', 'attr']) {
      expect(__test__.ALLOWED_FUNCTION_NAMES.has(forbidden)).toBe(false);
    }
  });
});
