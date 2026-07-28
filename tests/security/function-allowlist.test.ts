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

/**
 * The per-function argument rules and the token allow-list read the same unit
 * lists. If they ever diverge, a unit passes one check and fails the other
 * with a confusing "disallowed token" message instead of the fix-it — so pin
 * the relationship rather than the two lists separately.
 */
describe('CSS argument unit rules', () => {
  it('every unit the arg rules accept is also an allowed token form', () => {
    const ruleUnits = [...__test__.LENGTH_UNIT_SET, ...__test__.ANGLE_UNIT_SET];
    expect(ruleUnits.length).toBeGreaterThan(0);
    for (const unit of ruleUnits) {
      expect(__test__.NUMERIC_TOKEN_RE.test(`1${unit}`)).toBe(true);
    }
  });

  it('only constrains functions that are on the allow-list', () => {
    for (const fnName of __test__.CSS_FUNCTION_ARG_RULES.keys()) {
      expect(__test__.ALLOWED_FUNCTION_NAMES.has(fnName)).toBe(true);
    }
  });

  it('leaves transform and color functions unconstrained apart from scale/matrix', () => {
    // Transforms are emitted into SVG's transform attribute, whose grammar
    // takes unitless user units — and the compiler emits them itself.
    const constrained = [...__test__.CSS_FUNCTION_ARG_RULES.keys()];
    for (const fn of CSS_TRANSFORM_FUNCTION_NAMES) {
      const expected = fn.startsWith('scale') || fn.startsWith('matrix');
      expect(constrained.includes(fn)).toBe(expected);
    }
    for (const fn of CSS_COLOR_FUNCTION_NAMES) {
      expect(constrained.includes(fn)).toBe(false);
    }
  });
});
