import { describe, expect, it } from 'vitest';
import { parseColorFunction, readNumber } from '../src/color-parse';

/**
 * Unit tests for the color-function tokenizer's atomic pieces and per-function
 * acceptance table. tests/color-conformance.test.ts covers the end-to-end
 * parseColor() → OKLCH scaling; these lock the structural parse (which
 * component allows a sign/percent, legacy vs modern separators, alpha forms)
 * that the scaling depends on.
 */

function read(s: string) {
  const pos = { i: 0 };
  const r = readNumber(s, pos);
  return r === null ? null : { ...r, consumed: pos.i };
}

describe('readNumber', () => {
  it('reads integers, decimals, and leading-dot decimals', () => {
    expect(read('255')).toEqual({ value: 255, percent: false, signed: false, consumed: 3 });
    expect(read('0.5')).toEqual({ value: 0.5, percent: false, signed: false, consumed: 3 });
    expect(read('.25')).toEqual({ value: 0.25, percent: false, signed: false, consumed: 3 });
  });

  it('reads a trailing percent', () => {
    expect(read('50%')).toEqual({ value: 50, percent: true, signed: false, consumed: 3 });
  });

  it('reads a negative number', () => {
    expect(read('-0.05')).toEqual({ value: -0.05, percent: false, signed: true, consumed: 5 });
  });

  it('rejects a unary plus (never accepted by the color regexes)', () => {
    expect(read('+5')).toBeNull();
  });

  it('rejects exponent notation (stops at the digits before e)', () => {
    // `1e2` reads as `1`, leaving `e2` — parseColorFunction then fails on the
    // stray `e`. This matches the pre-refactor regex behavior.
    expect(read('1e2')).toEqual({ value: 1, percent: false, signed: false, consumed: 1 });
  });

  it('stops at a second dot (implicit terminator)', () => {
    expect(read('1.5.5')).toEqual({ value: 1.5, percent: false, signed: false, consumed: 3 });
  });

  it('returns null when not on a number', () => {
    expect(read('abc')).toBeNull();
    expect(read('')).toBeNull();
  });
});

describe('parseColorFunction: separators and forms', () => {
  it('parses modern space-separated rgb', () => {
    expect(parseColorFunction('rgb(255 0 0)')).toEqual({
      fn: 'rgb',
      legacy: false,
      comps: [
        { value: 255, percent: false },
        { value: 0, percent: false },
        { value: 0, percent: false },
      ],
    });
  });

  it('parses legacy comma-separated rgb with alpha', () => {
    expect(parseColorFunction('rgba(255, 0, 0, 0.5)')).toEqual({
      fn: 'rgb',
      legacy: true,
      comps: [
        { value: 255, percent: false },
        { value: 0, percent: false },
        { value: 0, percent: false },
      ],
      alpha: { value: 0.5, percent: false },
    });
  });

  it('normalizes rgba/hsla/hwba to their base function name', () => {
    expect(parseColorFunction('rgba(1 2 3)')?.fn).toBe('rgb');
    expect(parseColorFunction('hsla(0 1% 2%)')?.fn).toBe('hsl');
    expect(parseColorFunction('hwba(0 1% 2%)')?.fn).toBe('hwb');
  });

  it('parses modern slash alpha', () => {
    expect(parseColorFunction('oklch(0.7 0.1 200 / 0.25)')?.alpha).toEqual({ value: 0.25, percent: false });
    expect(parseColorFunction('rgb(255 0 0 / 50%)')?.alpha).toEqual({ value: 50, percent: true });
  });

  it('rejects mixed comma and slash separators', () => {
    expect(parseColorFunction('rgb(255, 0, 0 / 0.5)')).toBeNull();
    expect(parseColorFunction('rgb(255 0 0, 0.5)')).toBeNull();
  });

  it('rejects wrong component counts', () => {
    expect(parseColorFunction('rgb(255 0)')).toBeNull();
    expect(parseColorFunction('rgb(255 0 0 0 0)')).toBeNull();
  });

  it('rejects an unknown function name', () => {
    expect(parseColorFunction('color(display-p3 1 0 0)')).toBeNull();
    expect(parseColorFunction('notacolor')).toBeNull();
  });

  it('rejects stray characters in the interior', () => {
    expect(parseColorFunction('rgb(255 0 0deg)')).toBeNull();
    expect(parseColorFunction('oklch(none 0.1 200)')).toBeNull();
  });
});

describe('parseColorFunction: per-function acceptance rules', () => {
  it('hsl requires percent on S and L, forbids it on hue', () => {
    expect(parseColorFunction('hsl(120 50% 50%)')).not.toBeNull();
    expect(parseColorFunction('hsl(120 50 50)')).toBeNull(); // S/L missing %
    expect(parseColorFunction('hsl(120% 50% 50%)')).toBeNull(); // hue must not be %
  });

  it('hsl allows both legacy and modern forms', () => {
    expect(parseColorFunction('hsl(120, 50%, 50%)')?.legacy).toBe(true);
    expect(parseColorFunction('hsl(120 50% 50%)')?.legacy).toBe(false);
  });

  it('hwb, oklch, oklab, lab, lch reject the legacy comma form', () => {
    expect(parseColorFunction('hwb(0, 0%, 0%)')).toBeNull();
    expect(parseColorFunction('oklch(0.7, 0.1, 200)')).toBeNull();
    expect(parseColorFunction('oklab(0.5, 0.05, 0)')).toBeNull();
    expect(parseColorFunction('lab(50, 10, 10)')).toBeNull();
    expect(parseColorFunction('lch(50, 30, 120)')).toBeNull();
  });

  it('oklch hue forbids a percent; L and C allow it', () => {
    expect(parseColorFunction('oklch(50% 100% 200)')).not.toBeNull();
    expect(parseColorFunction('oklch(0.5 0.1 200%)')).toBeNull();
  });

  it('oklab a/b allow a sign; L does not', () => {
    expect(parseColorFunction('oklab(0.5 -0.05 0.05)')).not.toBeNull();
    expect(parseColorFunction('oklab(-0.5 0 0)')).toBeNull();
  });

  it('lab a/b allow a sign but forbid a percent', () => {
    expect(parseColorFunction('lab(50 -10 10)')).not.toBeNull();
    expect(parseColorFunction('lab(50 10% 10)')).toBeNull();
  });

  it('lab/lch tolerate an (ignored) percent on L, recorded on the component', () => {
    const lab = parseColorFunction('lab(50% 10 -10)');
    expect(lab?.comps[0]).toEqual({ value: 50, percent: true });
    const lch = parseColorFunction('lch(50% 30 120)');
    expect(lch?.comps[0]).toEqual({ value: 50, percent: true });
  });

  it('lab/lch forbid a percent on alpha', () => {
    expect(parseColorFunction('lab(50 0 0 / 0.5)')).not.toBeNull();
    expect(parseColorFunction('lab(50 0 0 / 50%)')).toBeNull();
    expect(parseColorFunction('lch(50 30 120 / 50%)')).toBeNull();
  });

  it('rgb/hsl/oklch allow a percent on alpha', () => {
    expect(parseColorFunction('rgb(255 0 0 / 50%)')).not.toBeNull();
    expect(parseColorFunction('oklch(0.7 0.1 200 / 50%)')).not.toBeNull();
  });

  it('rejects a signed alpha', () => {
    expect(parseColorFunction('rgb(255 0 0 / -0.5)')).toBeNull();
  });
});

describe('parseColorFunction: modern-component separator enforcement', () => {
  it('requires whitespace between adjacent modern components', () => {
    expect(parseColorFunction('rgb(50%50% 0)')).toBeNull();
    expect(parseColorFunction('hsl(120 50%50%)')).toBeNull();
    expect(parseColorFunction('oklch(0.5 0.1200)')).toBeNull();
  });

  it('rejects a multi-dot number rather than splitting it into phantom components', () => {
    expect(parseColorFunction('rgb(1.5.5 0 0)')).toBeNull();
    expect(parseColorFunction('oklch(1.5.5 0.1 200)')).toBeNull();
  });

  it('rejects an embedded sign inside a component', () => {
    expect(parseColorFunction('lab(50 12-34 30)')).toBeNull();
  });

  it('still accepts generous but valid whitespace and tight slash alpha', () => {
    expect(parseColorFunction('rgb(255  0  0)')).not.toBeNull();
    expect(parseColorFunction('rgb( 255 0 0 )')).not.toBeNull();
    expect(parseColorFunction('rgb(255 0 0/0.5)')?.alpha).toEqual({ value: 0.5, percent: false });
  });
});
