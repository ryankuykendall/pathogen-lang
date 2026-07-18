import { describe, expect, it } from 'vitest';
import { parseColor } from '../src/color';

/**
 * Phase 0 characterization tests for parseColor's accept/reject grammar.
 * These are the first DIRECT tests of parseColor (tests/color.test.ts covers
 * it only through compiled Pathogen programs). They pin the exact acceptance
 * boundary and CSS Color L4 percent scalings ahead of the Phase 3 rewrite
 * (regex ladder → tokenizer). The Phase 3 parser must keep every row below
 * byte-identical; loosening the REJECT rows (e.g. `none`, `deg` units) is a
 * separate, docs-first feature.
 */

describe('parseColor: cross-format equivalence (same pipeline → identical floats)', () => {
  const red = parseColor('#ff0000');

  it.each([
    ['rgb modern', 'rgb(255 0 0)'],
    ['rgb legacy', 'rgb(255, 0, 0)'],
    ['rgb percent', 'rgb(100% 0% 0%)'],
    ['hsl modern', 'hsl(0 100% 50%)'],
    ['hsl legacy', 'hsl(0, 100%, 50%)'],
    ['hwb', 'hwb(0 0% 0%)'],
    ['named', 'red'],
    ['named uppercase + padding', '  RED  '],
    ['short hex', '#f00'],
  ])('%s equals #ff0000', (_label, input) => {
    expect(parseColor(input)).toEqual(red);
  });

  it('rgb percent components scale as 100% = 255 (50% = 127.5)', () => {
    expect(parseColor('rgb(50% 0% 0%)')).toEqual(parseColor('rgb(127.5 0 0)'));
  });

  it('hwb whiteness/blackness normalize when w + b > 1', () => {
    expect(parseColor('hwb(0 60% 60%)')).toEqual(parseColor('hwb(0 50% 50%)'));
  });

  it('lab/lch tolerate and IGNORE a percent sign on L (quirk)', () => {
    expect(parseColor('lab(50% 10 -10)')).toEqual(parseColor('lab(50 10 -10)'));
    expect(parseColor('lch(50% 30 120)')).toEqual(parseColor('lch(50 30 120)'));
  });
});

describe('parseColor: OKLCH component scaling (CSS Color L4)', () => {
  it('parses bare oklch numbers verbatim', () => {
    expect(parseColor('oklch(0.7 0.1 200)')).toEqual({ L: 0.7, C: 0.1, H: 200, alpha: 1 });
  });

  it('scales L% as 100→1.0 and C% as 100→0.4', () => {
    const c = parseColor('oklch(50% 100% 200)');
    expect(c.L).toBeCloseTo(0.5, 12);
    expect(c.C).toBeCloseTo(0.4, 12);
    expect(c.H).toBe(200);
  });

  it('round-trips the hdr-color-input picker emit shape (oklch(L% C% H))', () => {
    // The playground color picker emits this exact form; scaling must stay
    // bit-compatible: L = 62.8/100, C = 25.77/250, H bare.
    const c = parseColor('oklch(62.8% 25.77% 29.23)');
    expect(c.L).toBeCloseTo(62.8 / 100, 12);
    expect(c.C).toBeCloseTo(25.77 / 250, 12);
    expect(c.H).toBeCloseTo(29.23, 12);
    expect(c.alpha).toBe(1);
  });

  it('parses slash alpha as number and percent', () => {
    expect(parseColor('oklch(0.7 0.1 200 / 0.25)').alpha).toBe(0.25);
    expect(parseColor('oklch(0.7 0.1 200 / 25%)').alpha).toBeCloseTo(0.25, 12);
  });

  it('parses oklab axis-aligned values to exact hues', () => {
    const posA = parseColor('oklab(0.5 0.05 0)');
    expect(posA.L).toBe(0.5);
    expect(posA.C).toBeCloseTo(0.05, 12);
    expect(posA.H).toBeCloseTo(0, 12);
    expect(parseColor('oklab(0.5 0 0.05)').H).toBeCloseTo(90, 12);
    expect(parseColor('oklab(0.5 -0.05 0)').H).toBeCloseTo(180, 12);
  });

  it('scales oklab a/b percents as 100% → 0.4', () => {
    const c = parseColor('oklab(50% 25% 0%)');
    expect(c.L).toBeCloseTo(0.5, 12);
    expect(c.C).toBeCloseTo(0.1, 12); // 25/250
  });
});

describe('parseColor: alpha forms', () => {
  it('parses legacy comma alpha (rgba/hsla)', () => {
    expect(parseColor('rgba(255, 0, 0, 0.5)').alpha).toBe(0.5);
    expect(parseColor('hsla(0, 100%, 50%, 0.5)').alpha).toBe(0.5);
  });

  it('parses modern slash alpha with percent', () => {
    expect(parseColor('rgb(255 0 0 / 50%)').alpha).toBeCloseTo(0.5, 12);
    expect(parseColor('hsl(120 50% 50% / 50%)').alpha).toBeCloseTo(0.5, 12);
  });

  it('parses 4/8-digit hex alpha', () => {
    expect(parseColor('#ff000080').alpha).toBeCloseTo(128 / 255, 12);
    expect(parseColor('#f008').alpha).toBeCloseTo(136 / 255, 12);
  });

  it('parses lab/lch number-only alpha', () => {
    expect(parseColor('lab(50 0 0 / 0.5)').alpha).toBe(0.5);
    expect(parseColor('lch(50 30 120 / 0.5)').alpha).toBe(0.5);
  });
});

describe('parseColor: CIE lab/lch conversion sanity', () => {
  it('lab(100 0 0) is near-white in OKLCH (L≈1, C≈0)', () => {
    const c = parseColor('lab(100 0 0)');
    expect(c.L).toBeCloseTo(1, 2);
    expect(c.C).toBeCloseTo(0, 2);
  });
});

describe('parseColor: REJECT boundary (current throws, locked)', () => {
  it.each([
    // CSS Color L4 gaps — valid CSS today, rejected by the current regexes.
    // Accepting any of these is a user-facing feature (docs-first), not part
    // of the Phase 3 refactor.
    ['hue with deg unit (L4 gap)', 'oklch(0.7 0.1 200deg)'],
    ['none component (L4 gap)', 'oklch(none 0.1 200)'],
    ['scientific notation component (L4 gap)', 'oklch(1e-1 0.1 200)'],
    ['negative hue (L4 gap)', 'hsl(-10 50% 50%)'],
    ['percent alpha on lab (L4 gap)', 'lab(50 0 0 / 50%)'],
    ['color() function (L4 gap)', 'color(display-p3 1 0 0)'],
    // Genuinely invalid.
    ['hwb legacy commas (invalid per L4)', 'hwb(0, 0%, 0%)'],
    ['too few rgb components', 'rgb(255 0)'],
    ['mixed comma/space separators', 'rgb(255, 0 0)'],
    ['five-digit hex', '#ff000'],
    ['empty string', ''],
    ['unknown keyword', 'notacolor'],
  ])('throws on %s: %s', (_label, input) => {
    expect(() => parseColor(input)).toThrow();
  });

  it('CHARACTERIZATION: out-of-range hue (400) is accepted without validation', () => {
    expect(() => parseColor('hsl(400 50% 50%)')).not.toThrow();
  });

  it.each([
    // Zero-separator adjacency: the old regexes required whitespace between
    // modern components; the tokenizer enforces the same, so these reject.
    ['adjacent components, no space', 'rgb(50%50% 0)'],
    ['adjacent components in hsl', 'hsl(120 50%50%)'],
    // Malformed multi-dot / embedded-sign numbers: the old regexes accepted
    // some of these by silently truncating via parseFloat (wrong values); the
    // tokenizer rejects them outright. Deliberate correctness improvement.
    ['multi-dot number splits into phantom components', 'rgb(1.5.5 0 0)'],
    ['multi-dot number in oklch (old truncated to 1.5)', 'oklch(1.5.5 0.1 200)'],
    ['embedded sign in lab a (old truncated to 12)', 'lab(50 12-34 30)'],
    ['trailing dot with garbage', 'rgb(1.5. 0 0)'],
    ['lone dot component', 'rgb(. 0 0)'],
  ])('rejects malformed numeric form — %s: %s', (_label, input) => {
    expect(() => parseColor(input)).toThrow();
  });

  it.each([
    // These must keep parsing — separators that are valid but easy to break.
    ['double space between components', 'rgb(255  0  0)', '#ff0000'],
    ['padded parens', 'rgb( 255 0 0 )', '#ff0000'],
    ['slash alpha with no surrounding space', 'rgb(255 0 0/0.5)'],
  ])('still accepts valid spacing — %s: %s', (_label, input) => {
    expect(() => parseColor(input)).not.toThrow();
  });
});
