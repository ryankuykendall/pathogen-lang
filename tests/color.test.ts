import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

describe('Color type', () => {
  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates from hex string', () => {
      const result = compile('let c = Color("#ff0000"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from short hex string', () => {
      const result = compile('let c = Color("#f00"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from hex with alpha', () => {
      const result = compile('let c = Color("#ff000080"); log(c.a);');
      const alpha = parseFloat(result.logs[0].parts[0].value);
      expect(alpha).toBeCloseTo(0.502, 1);
    });

    it('creates from 4-digit hex with alpha', () => {
      const result = compile('let c = Color("#f008"); log(c.hex);');
      // #f008 = #ff000088, alpha ≈ 0.533
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
      const result2 = compile('let c = Color("#f008"); log(c.a);');
      const alpha = parseFloat(result2.logs[0].parts[0].value);
      expect(alpha).toBeCloseTo(0.533, 1);
    });

    it('creates from named color', () => {
      const result = compile('let c = Color("red"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from named color (case insensitive)', () => {
      const result = compile('let c = Color("Red"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from named color (coral)', () => {
      const result = compile('let c = Color("coral"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff7f50');
    });

    it('creates from rgb()', () => {
      const result = compile('let c = Color("rgb(255, 0, 0)"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from rgba()', () => {
      const result = compile('let c = Color("rgba(255, 0, 0, 0.5)"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('creates from hsl()', () => {
      const result = compile('let c = Color("hsl(0, 100%, 50%)"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from hsla()', () => {
      const result = compile('let c = Color("hsla(0, 100%, 50%, 0.5)"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('creates from oklch()', () => {
      const result = compile('let c = Color("oklch(0.6 0.15 30)"); log(c.lightness);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
    });

    it('creates from oklch() with alpha', () => {
      const result = compile('let c = Color("oklch(0.6 0.15 30 / 0.5)"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('creates from 3-number OKLCH (L, C, H)', () => {
      const result = compile('let c = Color(0.6, 0.15, 30); log(c.lightness);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
    });

    it('creates from 4-number OKLCH (L, C, H, alpha)', () => {
      const result = compile('let c = Color(0.6, 0.15, 30, 0.5); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('creates from oklab()', () => {
      // oklab(0.6 -0.1 0.15) — should produce a valid color
      const result = compile('let c = Color("oklab(0.6 -0.1 0.15)"); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('creates from hwb()', () => {
      // hwb(0 0% 0%) = pure red
      const result = compile('let c = Color("hwb(0 0% 0%)"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('creates from hwb() with whiteness', () => {
      // hwb(0 100% 0%) = white
      const result = compile('let c = Color("hwb(0 100% 0%)"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ffffff');
    });

    it('creates from lab()', () => {
      // CIE Lab — should produce a valid color
      const result = compile('let c = Color("lab(50 40 59.5)"); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('creates from lch()', () => {
      // CIE LCH — should produce a valid color
      const result = compile('let c = Color("lch(50 64 30)"); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('creates from oklab() with alpha', () => {
      const result = compile('let c = Color("oklab(0.6 -0.1 0.15 / 0.5)"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('creates from hwb() with alpha', () => {
      const result = compile('let c = Color("hwb(0 0% 0% / 0.5)"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('bare hwb() literal', () => {
      const result = compile('let c = hwb(0 0% 0%); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('bare oklab() literal', () => {
      const result = compile('let c = oklab(0.6 -0.1 0.15); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('bare lab() literal', () => {
      const result = compile('let c = lab(50 40 59.5); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('bare lch() literal', () => {
      const result = compile('let c = lch(50 64 30); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('throws on invalid color string', () => {
      expect(() => compile('let c = Color("notacolor");')).toThrow('Invalid color');
    });

    it('throws on wrong argument count (0)', () => {
      expect(() => compile('let c = Color();')).toThrow();
    });

    it('throws on wrong argument count (2)', () => {
      expect(() => compile('let c = Color(0.5, 0.1);')).toThrow();
    });

    it('throws on wrong argument count (5)', () => {
      expect(() => compile('let c = Color(0.5, 0.1, 30, 1, 1);')).toThrow();
    });
  });

  // ── Properties ─────────────────────────────────────────────────────────

  describe('properties', () => {
    it('.css returns hex for opaque color', () => {
      const result = compile('let c = Color("#e63946"); log(c.css);');
      expect(result.logs[0].parts[0].value).toBe('#e63946');
    });

    it('.css returns rgba() for transparent color', () => {
      const result = compile('let c = Color("#ff0000").alpha(0.5); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^rgba\(255, 0, 0, 0\.5\)$/);
    });

    it('.hex returns hex string', () => {
      const result = compile('let c = Color("#457b9d"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#457b9d');
    });

    it('.oklch returns oklch string', () => {
      const result = compile('let c = Color(0.6, 0.15, 30); log(c.oklch);');
      expect(result.logs[0].parts[0].value).toMatch(/^oklch\(0\.6 0\.15 30\)$/);
    });

    it('.oklch includes alpha when transparent', () => {
      const result = compile('let c = Color(0.6, 0.15, 30, 0.5); log(c.oklch);');
      expect(result.logs[0].parts[0].value).toMatch(/^oklch\(0\.6 0\.15 30 \/ 0\.5\)$/);
    });

    it('.hsl returns hsl string', () => {
      const result = compile('let c = Color("#ff0000"); log(c.hsl);');
      expect(result.logs[0].parts[0].value).toMatch(/^hsl\(0, 100%, 50%\)$/);
    });

    it('.rgb returns rgb string', () => {
      const result = compile('let c = Color("#ff0000"); log(c.rgb);');
      expect(result.logs[0].parts[0].value).toBe('rgb(255, 0, 0)');
    });

    it('.lightness returns L value', () => {
      const result = compile('let c = Color(0.65, 0.15, 30); log(c.lightness);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.65, 2);
    });

    it('.chroma returns C value', () => {
      const result = compile('let c = Color(0.6, 0.15, 30); log(c.chroma);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.15, 2);
    });

    it('.hue returns H value', () => {
      const result = compile('let c = Color(0.6, 0.15, 30); log(c.hue);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(30, 1);
    });

    it('.a returns alpha value', () => {
      const result = compile('let c = Color(0.6, 0.15, 30, 0.75); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.75, 2);
    });

    it('.a returns 1 for opaque color', () => {
      const result = compile('let c = Color("#ff0000"); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(1);
    });

    it('throws on unknown property', () => {
      expect(() => compile('let c = Color("#ff0000"); log(c.foo);')).toThrow('does not exist on Color');
    });
  });

  // ── Methods ────────────────────────────────────────────────────────────

  describe('methods', () => {
    it('.lighten() increases lightness', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let lighter = c.lighten(0.2);
        log(lighter.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.7, 2);
    });

    it('.lighten() clamps to 1', () => {
      const result = compile(`
        let c = Color(0.9, 0.15, 30);
        let lighter = c.lighten(0.5);
        log(lighter.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(1);
    });

    it('.darken() decreases lightness', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let darker = c.darken(0.15);
        log(darker.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.35, 2);
    });

    it('.darken() clamps to 0', () => {
      const result = compile(`
        let c = Color(0.1, 0.15, 30);
        let darker = c.darken(0.5);
        log(darker.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(0);
    });

    it('.saturate() multiplies chroma', () => {
      const result = compile(`
        let c = Color(0.5, 0.1, 30);
        let vivid = c.saturate(1.5);
        log(vivid.chroma);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.15, 2);
    });

    it('.desaturate() multiplies chroma by factor', () => {
      const result = compile(`
        let c = Color(0.5, 0.2, 30);
        let muted = c.desaturate(0.5);
        log(muted.chroma);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.1, 2);
    });

    it('.alpha() sets alpha', () => {
      const result = compile(`
        let c = Color("#ff0000");
        let semi = c.alpha(0.5);
        log(semi.a);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('.alpha() clamps to [0,1]', () => {
      const result = compile(`
        let c = Color("#ff0000");
        log(c.alpha(2).a);
        log(c.alpha(-1).a);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBe(0);
    });

    it('.hueShift() shifts hue', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let shifted = c.hueShift(180);
        log(shifted.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(210, 1);
    });

    it('.hueShift() wraps around 360', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 350);
        let shifted = c.hueShift(30);
        log(shifted.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(20, 1);
    });

    it('.hueShift() handles negative values', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let shifted = c.hueShift(-60);
        log(shifted.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(330, 1);
    });

    it('.complement() shifts hue by 180', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let comp = c.complement();
        log(comp.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(210, 1);
    });

    it('.mix() mixes two colors', () => {
      const result = compile(`
        let a = Color(0.4, 0.1, 0);
        let b = Color(0.8, 0.1, 0);
        let mid = a.mix(b, 0.5);
        log(mid.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
    });

    it('.mix(other, 0) returns original', () => {
      const result = compile(`
        let a = Color(0.4, 0.1, 30);
        let b = Color(0.8, 0.1, 200);
        let same = a.mix(b, 0);
        log(same.lightness);
        log(same.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.4, 2);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(30, 1);
    });

    it('.mix(other, 1) returns other', () => {
      const result = compile(`
        let a = Color(0.4, 0.1, 30);
        let b = Color(0.8, 0.1, 200);
        let other = a.mix(b, 1);
        log(other.lightness);
        log(other.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.8, 2);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(200, 1);
    });

    it('.flatten() composites 50% red onto default white in gamma sRGB', () => {
      const result = compile(`
        let c = Color("#ff0000").alpha(0.5);
        let flat = c.flatten();
        log(flat.hex);
        log(flat.a);
      `);
      // source-over on gamma sRGB: (1, 0, 0)·0.5 + (1, 1, 1)·0.5 = (1, 0.5, 0.5) → #ff8080
      const hex = result.logs[0].parts[0].value;
      const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16));
      expect(r).toBe(255);
      expect(g).toBeGreaterThanOrEqual(127);
      expect(g).toBeLessThanOrEqual(128);
      expect(b).toBeGreaterThanOrEqual(127);
      expect(b).toBeLessThanOrEqual(128);
      expect(parseFloat(result.logs[1].parts[0].value)).toBe(1);
    });

    it('.flatten() with no argument equals .flatten(white)', () => {
      const result = compile(`
        let c = Color(0.6, 0.2, 250, 0.4);
        log(c.flatten().hex);
        log(c.flatten(Color("#ffffff")).hex);
      `);
      expect(result.logs[0].parts[0].value).toBe(result.logs[1].parts[0].value);
    });

    it('.flatten() accepts a hex-literal background', () => {
      const result = compile(`
        let c = Color("#ffffff").alpha(0.5);
        let flat = c.flatten(#000);
        log(flat.hex);
      `);
      // 50% white over black: each channel 0.5 → #808080
      const hex = result.logs[0].parts[0].value;
      const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16));
      for (const ch of channels) {
        expect(ch).toBeGreaterThanOrEqual(127);
        expect(ch).toBeLessThanOrEqual(128);
      }
    });

    it('.flatten() leaves an opaque color unchanged', () => {
      const result = compile(`
        let c = Color("#3366cc");
        log(c.hex);
        log(c.flatten(#000).hex);
        log(c.flatten(#000).a);
      `);
      expect(result.logs[1].parts[0].value).toBe(result.logs[0].parts[0].value);
      expect(parseFloat(result.logs[2].parts[0].value)).toBe(1);
    });

    it('.flatten() clips an out-of-gamut opaque color into sRGB gamut', () => {
      const result = compile(`
        let vivid = Color(0.7, 0.35, 150);
        let flat = vivid.flatten();
        log(flat.chroma);
        log(flat.a);
      `);
      // oklch(0.7 0.35 150) is far outside sRGB; the composite round-trips
      // through clamped sRGB, so chroma lands at the gamut boundary
      expect(parseFloat(result.logs[0].parts[0].value)).toBeLessThan(0.35);
      expect(parseFloat(result.logs[1].parts[0].value)).toBe(1);
    });

    it('.flatten() of a fully transparent color returns the background', () => {
      const result = compile(`
        let c = Color("#ff0000").alpha(0);
        let bg = Color("#00ff00");
        log(c.flatten(bg).hex);
        log(bg.hex);
      `);
      expect(result.logs[0].parts[0].value).toBe(result.logs[1].parts[0].value);
    });

    it('.flatten() of fully transparent over fully transparent yields alpha 0 without NaN', () => {
      const result = compile(`
        let c = Color("#ff0000").alpha(0);
        let bg = Color("#00ff00").alpha(0);
        let flat = c.flatten(bg);
        log(flat.a);
        log(flat.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(0);
      expect(parseFloat(result.logs[1].parts[0].value)).toBe(0);
    });

    it('.flatten() onto a translucent background composites alpha (source-over)', () => {
      const result = compile(`
        let c = Color("#ff0000").alpha(0.5);
        let bg = Color("#ffffff").alpha(0.5);
        log(c.flatten(bg).a);
      `);
      // αout = 0.5 + 0.5·(1 − 0.5) = 0.75
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.75, 5);
    });

    it('method chaining works', () => {
      const result = compile(`
        let c = Color(0.5, 0.2, 30)
          .lighten(0.1)
          .desaturate(0.5)
          .alpha(0.9);
        log(c.lightness);
        log(c.chroma);
        log(c.a);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.1, 2);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(0.9, 2);
    });

    it('.lighten() throws on wrong arg count', () => {
      expect(() => compile('let c = Color("#ff0000"); c.lighten();')).toThrow('expects 1 argument');
    });

    it('.lighten() throws on non-number arg', () => {
      expect(() => compile('let c = Color("#ff0000"); c.lighten("a");')).toThrow('must be a number');
    });

    it('.mix() throws on non-Color arg', () => {
      expect(() => compile('let c = Color("#ff0000"); c.mix("blue", 0.5);')).toThrow('must be a Color');
    });

    it('.mix() throws on wrong arg count', () => {
      expect(() => compile('let c = Color("#ff0000"); c.mix(c);')).toThrow('expects 2 arguments');
    });

    it('.flatten() throws on non-Color background', () => {
      expect(() => compile('let c = Color("#ff0000"); c.flatten("white");')).toThrow('must be a Color');
    });

    it('.flatten() throws on too many arguments', () => {
      expect(() => compile('let c = Color("#ff0000"); c.flatten(c, c);')).toThrow('expects 0 or 1 arguments');
    });

    it('.flatten() throws on a CSSVar-backed source', () => {
      expect(() =>
        compile('let c = Color(CSSVar("--x", "#ff0000")); c.flatten();')
      ).toThrow('theme-dynamic');
    });

    it('.flatten() throws on a CSSVar-derived (cssExpr) source', () => {
      expect(() =>
        compile('let c = Color(CSSVar("--x", "#ff0000")).lighten(0.1); c.flatten();')
      ).toThrow('theme-dynamic');
    });

    it('.flatten() throws on a CSSVar-backed background', () => {
      expect(() =>
        compile('let c = Color("#ff0000").alpha(0.5); let bg = Color(CSSVar("--x", "#ffffff")); c.flatten(bg);')
      ).toThrow('theme-dynamic');
    });

    it('.flatten() throws on a lightDark background', () => {
      expect(() =>
        compile(
          "let c = Color('#ff0000').alpha(0.5); let bg = Color.lightDark(Color('#fff'), Color('#000')); c.flatten(bg);"
        )
      ).toThrow('theme-dynamic');
    });

    it('.flatten() throws on a lightDark source', () => {
      expect(() =>
        compile("let c = Color.lightDark(Color('#333'), Color('#eee')); c.flatten();")
      ).toThrow('theme-dynamic');
    });

    it('unknown method throws', () => {
      expect(() => compile('let c = Color("#ff0000"); c.foo();')).toThrow('Unknown Color method');
    });
  });

  // ── Static methods ─────────────────────────────────────────────────────

  // ── Angle-unit arguments ────────────────────────────────────────────────
  // Color methods take degrees for bare numbers; arguments written with
  // angle units (deg/rad/pi) — including calc() arithmetic over them —
  // evaluate to radians and are auto-converted to degrees.

  describe('angle-unit arguments', () => {
    const hueOf = (src: string): number => parseFloat(compile(src).logs[0].parts[0].value);

    it('.hueShift(90deg) equals .hueShift(90)', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(90deg).hue);')).toBeCloseTo(120, 1);
    });

    it('.hueShift(0.5pi) shifts 90°', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(0.5pi).hue);')).toBeCloseTo(120, 1);
    });

    it('.hueShift(1.5707963rad) shifts ≈90°', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(1.5707963rad).hue);')).toBeCloseTo(120, 1);
    });

    it('.hueShift(-90deg) shifts backwards', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(-90deg).hue);')).toBeCloseTo(300, 1);
    });

    it('scaling keeps the angle unit: calc(2 * 45deg)', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(calc(2 * 45deg)).hue);')).toBeCloseTo(120, 1);
    });

    it('division keeps the angle unit: calc(2pi / 4)', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(calc(2pi / 4)).hue);')).toBeCloseTo(120, 1);
    });

    it('angle/angle ratio is unitless: calc(1pi / 2pi * 180) is 90 degrees', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(calc(1pi / 2pi * 180)).hue);')).toBeCloseTo(
        120,
        1,
      );
    });

    it('ternary arms are inferred: both angle arms convert', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(1 < 2 ? 90deg : 45deg).hue);')).toBeCloseTo(
        120,
        1,
      );
    });

    it('bare-number arithmetic remains degrees: calc(90 + 90)', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(calc(90 + 90)).hue);')).toBeCloseTo(210, 1);
    });

    it('call results are not treated as angles: calc(sin(0.5pi) * 180) is 180 degrees', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(calc(sin(0.5pi) * 180)).hue);')).toBeCloseTo(
        210,
        1,
      );
    });

    it('sweeps the hue wheel with loop-variable calc arithmetic', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        for (i in 0..8) {
          log(c.hueShift(calc(i / 8 * 2pi)).hue);
        }
      `);
      const hues = result.logs.map((l) => parseFloat(l.parts[0].value));
      expect(hues[0]).toBeCloseTo(30, 1); // 0 turns
      expect(hues[2]).toBeCloseTo(120, 1); // quarter turn
      expect(hues[4]).toBeCloseTo(210, 1); // half turn
      expect(hues[8]).toBeCloseTo(30, 1); // full turn wraps home
    });

    it('angle survives a variable: hueShift(turn) and hueShift(deg(turn)) agree', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        let turn = 0.5pi;
        log(c.hueShift(deg(turn)).hue);
        log(c.hueShift(turn).hue);
      `);
      // deg() returns a plain number of degrees; the Angle variable converts
      // exactly — both shift 90°.
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(120, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(120, 1);
    });

    it('angle survives an array element', () => {
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let angles = [90deg, 45deg]; log(c.hueShift(angles[0]).hue);'),
      ).toBeCloseTo(120, 1);
    });

    it('angle survives a user function parameter and return value', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        fn shifted(a) { return c.hueShift(a); }
        fn quarter() { return 0.5pi; }
        log(shifted(90deg).hue);
        log(c.hueShift(quarter()).hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(120, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(120, 1);
    });

    it('the reported halo trap: hoisted calc angle drives a per-iteration sweep', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        for (i in 0..8) {
          let shift = calc(i / 8 * 2pi);
          log(c.hueShift(shift).hue);
        }
      `);
      const hues = result.logs.map((l) => parseFloat(l.parts[0].value));
      expect(hues[2]).toBeCloseTo(120, 1); // quarter turn — was 30 + 1.57° before Angle values
      expect(hues[4]).toBeCloseTo(210, 1); // half turn
    });

    it('Color(L, C, H) auto-converts an Angle hue', () => {
      expect(hueOf('let c = Color(0.5, 0.15, 90deg); log(c.hue);')).toBeCloseTo(90, 5);
      expect(hueOf('let h = 0.5pi; let c = Color(0.5, 0.15, h); log(c.hue);')).toBeCloseTo(90, 5);
    });

    it('deg-written angles convert without float noise: hueShift(30deg) hue is exactly 60', () => {
      // The rad→deg round trip must keep the 1e10 snap (30deg → 29.999999999999996 without it)
      expect(hueOf('let c = Color(0.5, 0.15, 30); log(c.hueShift(30deg).hue);')).toBe(60);
    });

    it('.analogous(45deg) equals .analogous(45)', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 60);
        let colors = c.analogous(45deg);
        log(colors[0].hue);
        log(colors[2].hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(15, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(105, 1);
    });

    it('.splitComplementary(15deg) equals .splitComplementary(15)', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 60);
        let colors = c.splitComplementary(15deg);
        log(colors[1].hue);
        log(colors[2].hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(225, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(255, 1);
    });

    it('per-layer fills vary in the reported hue-sweep program', () => {
      const result = compile(`
        let orangish = #d19a66;
        for (i in 1..9) {
          let shiftLayer = PathLayer(\`shift-\${i}\`) \${
            stroke: none;
            fill: orangish.hueShift(calc(i / 9 * 2pi));
          };
          shiftLayer.apply {
            rect(0, calc(i * 24), 20, 20);
          }
        }
      `);
      const fills = result.layers.filter((l) => l.name.startsWith('shift-')).map((l) => l.styles.fill);
      expect(fills).toHaveLength(9);
      expect(new Set(fills).size).toBe(9);
    });
  });

  describe('static methods', () => {
    it('Color.mix() mixes two colors', () => {
      const result = compile(`
        let a = Color(0.4, 0.1, 0);
        let b = Color(0.8, 0.1, 0);
        let mid = Color.mix(a, b, 0.5);
        log(mid.lightness);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
    });

    it('Color.mix() throws on non-Color first arg', () => {
      expect(() => compile('let b = Color("#ff0000"); Color.mix("red", b, 0.5);')).toThrow('must be a Color');
    });

    it('Color.mix() throws on non-Color second arg', () => {
      expect(() => compile('let a = Color("#ff0000"); Color.mix(a, "blue", 0.5);')).toThrow('must be a Color');
    });

    it('Color.mix() throws on wrong arg count', () => {
      expect(() => compile('let a = Color("#ff0000"); Color.mix(a, a);')).toThrow('expects 3 arguments');
    });

    it('unknown Color namespace method throws', () => {
      expect(() => compile('Color.foo();')).toThrow('Unknown Color method');
    });
  });

  // ── Style blocks ───────────────────────────────────────────────────────

  describe('style blocks', () => {
    it('auto-converts Color in style block', () => {
      const result = compile(
        "let primary = Color('#e63946');\n" +
          "define PathLayer('main') ${ stroke: primary; }\n" +
          "layer('main').apply { M 0 0 L 100 100 }",
      );
      const mainLayer = result.layers.find((l) => l.name === 'main');
      expect(mainLayer?.styles?.stroke).toBe('#e63946');
    });

    it('auto-converts manipulated Color in style block', () => {
      const result = compile(
        "let c = Color('#ff0000').alpha(0.5);\n" +
          "define PathLayer('main') ${ stroke: c; }\n" +
          "layer('main').apply { M 0 0 L 100 100 }",
      );
      const mainLayer = result.layers.find((l) => l.name === 'main');
      expect(mainLayer?.styles?.stroke).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('resolves rgba().lighten() directly in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: rgba(0, 0, 200, 1).lighten(0.2); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('.lighten');
    });

    it('resolves parenthesized rgba().lighten(%) in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: (rgba(0, 0, 200, 1).lighten(20%)); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('rgba');
      expect(stroke).not.toContain('.lighten');
    });

    it('resolves hsl().darken() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: hsl(200, 100%, 50%).darken(0.1); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('hsl');
    });

    it('resolves oklch().hueShift() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: oklch(0.6 0.15 200).hueShift(30); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('oklch');
    });

    it('resolves oklab().alpha() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: oklab(0.5 0.1 -0.1).alpha(0.8); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^rgba\(/);
      expect(stroke).not.toContain('oklab');
    });

    it('resolves hwb().lighten() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: hwb(200 10% 20%).lighten(0.1); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('hwb');
    });

    it('resolves lab().darken() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: lab(50 20 -30).darken(0.1); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(stroke).not.toContain('lab');
    });

    it('resolves lch().alpha() in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: lch(50 30 200).alpha(0.7); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^rgba\(/);
      expect(stroke).not.toContain('lch');
    });

    it('resolves rgba().alpha() with sub-1 alpha in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: rgba(0, 0, 200, 1).alpha(0.5); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^rgba\(/);
      expect(stroke).not.toContain('.alpha');
    });

    it('resolves chained methods in style block', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke: rgba(0, 0, 200, 1).lighten(50%).alpha(0.6); }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      const stroke = result.layers[0].styles.stroke;
      expect(stroke).toMatch(/^rgba\(/);
      expect(stroke).not.toContain('.lighten');
      expect(stroke).not.toContain('.alpha');
    });
  });

  // ── Template literals / log display ────────────────────────────────────

  describe('display', () => {
    it('log() displays Color(#hex)', () => {
      const result = compile('let c = Color("#e63946"); log(c);');
      expect(result.logs[0].parts[0].value).toBe('Color(#e63946)');
    });

    it('template literal displays Color(#hex)', () => {
      const result = compile('let c = Color("#ff0000"); log(`color: ${c}`);');
      expect(result.logs[0].parts[0].value).toBe('color: Color(#ff0000)');
    });

    it('log() displays Color with alpha', () => {
      const result = compile('let c = Color("#ff0000").alpha(0.5); log(c);');
      expect(result.logs[0].parts[0].value).toMatch(/^Color\(rgba\(255, 0, 0, 0\.5\)\)$/);
    });
  });

  // ── Roundtrip fidelity ─────────────────────────────────────────────────

  describe('roundtrip', () => {
    it('pure red roundtrips exactly', () => {
      const result = compile('let c = Color("#ff0000"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('pure green roundtrips exactly', () => {
      const result = compile('let c = Color("#00ff00"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#00ff00');
    });

    it('pure blue roundtrips exactly', () => {
      const result = compile('let c = Color("#0000ff"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#0000ff');
    });

    it('black roundtrips exactly', () => {
      const result = compile('let c = Color("#000000"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#000000');
    });

    it('white roundtrips exactly', () => {
      const result = compile('let c = Color("#ffffff"); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ffffff');
    });

    it('arbitrary color roundtrips closely', () => {
      const result = compile('let c = Color("#e63946"); log(c.hex);');
      // Allow ±1 per channel due to float precision
      expect(result.logs[0].parts[0].value).toBe('#e63946');
    });
  });

  // ── Hue interpolation edge cases ───────────────────────────────────────

  describe('hue interpolation', () => {
    it('mixes across the 360/0 boundary via shortest arc', () => {
      const result = compile(`
        let a = Color(0.5, 0.15, 10);
        let b = Color(0.5, 0.15, 350);
        let mid = a.mix(b, 0.5);
        log(mid.hue);
      `);
      // Shortest arc: 10 → 350 should go through 0, giving hue ≈ 0 (or 360)
      const hue = parseFloat(result.logs[0].parts[0].value);
      expect(hue < 10 || hue > 350).toBe(true);
    });

    it('mix of achromatic colors uses other hue', () => {
      // Achromatic (C≈0) has undefined hue — should use the other color's hue
      const result = compile(`
        let gray = Color(0.5, 0, 0);
        let blue = Color(0.5, 0.15, 240);
        let mid = gray.mix(blue, 0.5);
        log(mid.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(240, 1);
    });
  });

  // ── Color Harmonies ─────────────────────────────────────────────────────

  describe('color harmonies', () => {
    describe('.analogous()', () => {
      it('returns array of 3 colors', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 60);
          let colors = c.analogous();
          log(colors.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
      });

      it('uses default 30° angle', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 60);
          let colors = c.analogous();
          log(colors[0].hue);
          log(colors[1].hue);
          log(colors[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(30, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(60, 1);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(90, 1);
      });

      it('accepts custom angle', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 60);
          let colors = c.analogous(45);
          log(colors[0].hue);
          log(colors[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(15, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(105, 1);
      });

      it('wraps hue around 360', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 10);
          let colors = c.analogous();
          log(colors[0].hue);
        `);
        // 10 - 30 = -20 → 340
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(340, 1);
      });

      it('preserves lightness and chroma', () => {
        const result = compile(`
          let c = Color(0.6, 0.2, 60);
          let colors = c.analogous();
          log(colors[0].lightness);
          log(colors[0].chroma);
          log(colors[2].lightness);
          log(colors[2].chroma);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.2, 2);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(0.6, 2);
        expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(0.2, 2);
      });

      it('throws on non-number angle', () => {
        expect(() => compile('Color(0.5, 0.15, 60).analogous("x");')).toThrow('must be a number');
      });

      it('throws on too many arguments', () => {
        expect(() => compile('Color(0.5, 0.15, 60).analogous(30, 45);')).toThrow('expects 0 or 1 arguments');
      });
    });

    describe('.triadic()', () => {
      it('returns array of 3 colors', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 0);
          let colors = c.triadic();
          log(colors.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
      });

      it('returns self, +120, +240', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 30);
          let colors = c.triadic();
          log(colors[0].hue);
          log(colors[1].hue);
          log(colors[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(30, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(150, 1);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(270, 1);
      });

      it('wraps hue around 360', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 300);
          let colors = c.triadic();
          log(colors[1].hue);
          log(colors[2].hue);
        `);
        // 300 + 120 = 420 → 60, 300 + 240 = 540 → 180
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(60, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(180, 1);
      });

      it('throws on arguments', () => {
        expect(() => compile('Color(0.5, 0.15, 60).triadic(30);')).toThrow('expects 0 arguments');
      });
    });

    describe('.tetradic()', () => {
      it('returns array of 4 colors', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 0);
          let colors = c.tetradic();
          log(colors.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('4');
      });

      it('returns self, +90, +180, +270', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 45);
          let colors = c.tetradic();
          log(colors[0].hue);
          log(colors[1].hue);
          log(colors[2].hue);
          log(colors[3].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(45, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(135, 1);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(225, 1);
        expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(315, 1);
      });

      it('throws on arguments', () => {
        expect(() => compile('Color(0.5, 0.15, 60).tetradic(30);')).toThrow('expects 0 arguments');
      });
    });

    describe('.splitComplementary()', () => {
      it('returns array of 3 colors', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 0);
          let colors = c.splitComplementary();
          log(colors.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
      });

      it('returns self, 180-30, 180+30 with default angle', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 0);
          let colors = c.splitComplementary();
          log(colors[0].hue);
          log(colors[1].hue);
          log(colors[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(150, 1);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(210, 1);
      });

      it('accepts custom angle', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 0);
          let colors = c.splitComplementary(15);
          log(colors[1].hue);
          log(colors[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(165, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(195, 1);
      });

      it('throws on non-number angle', () => {
        expect(() => compile('Color(0.5, 0.15, 60).splitComplementary("x");')).toThrow('must be a number');
      });
    });

    it('harmony colors work in for-each iteration', () => {
      const result = compile(`
        let c = Color(0.5, 0.15, 30);
        for ([color, i] in c.triadic()) {
          log(color.hue);
        }
      `);
      expect(result.logs).toHaveLength(3);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(30, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(150, 1);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(270, 1);
    });
  });

  // ── Color.palette() ────────────────────────────────────────────────────

  describe('Color.palette()', () => {
    describe('lightness ramp', () => {
      it('returns array of n colors', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 30);
          let p = Color.palette(c, 5);
          log(p.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('5');
      });

      it('ramp goes from L=0.15 to L=0.95', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 30);
          let p = Color.palette(c, 2);
          log(p[0].lightness);
          log(p[1].lightness);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.15, 2);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.95, 2);
      });

      it('preserves hue and chroma', () => {
        const result = compile(`
          let c = Color(0.5, 0.2, 120);
          let p = Color.palette(c, 3);
          log(p[0].hue);
          log(p[0].chroma);
          log(p[2].hue);
          log(p[2].chroma);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(120, 1);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.2, 2);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(120, 1);
        expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(0.2, 2);
      });

      it('intermediate lightness values are evenly spaced', () => {
        const result = compile(`
          let c = Color(0.5, 0.15, 30);
          let p = Color.palette(c, 5);
          log(p[1].lightness);
          log(p[2].lightness);
          log(p[3].lightness);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.35, 2);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.55, 2);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(0.75, 2);
      });

      it('throws on non-Color first arg', () => {
        expect(() => compile('Color.palette("red", 5);')).toThrow('must be a Color');
      });

      it('throws on n < 2', () => {
        expect(() => compile('let c = Color("#ff0000"); Color.palette(c, 1);')).toThrow('must be an integer >= 2');
      });

      it('throws on non-integer n', () => {
        expect(() => compile('let c = Color("#ff0000"); Color.palette(c, 2.5);')).toThrow('must be an integer >= 2');
      });
    });

    describe('interpolation', () => {
      it('returns array of n colors', () => {
        const result = compile(`
          let a = Color(0.4, 0.1, 0);
          let b = Color(0.8, 0.1, 120);
          let p = Color.palette(a, b, 5);
          log(p.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('5');
      });

      it('first and last match inputs', () => {
        const result = compile(`
          let a = Color(0.4, 0.1, 0);
          let b = Color(0.8, 0.1, 120);
          let p = Color.palette(a, b, 3);
          log(p[0].lightness);
          log(p[0].hue);
          log(p[2].lightness);
          log(p[2].hue);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.4, 2);
        expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0, 1);
        expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(0.8, 2);
        expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(120, 1);
      });

      it('midpoint is interpolated', () => {
        const result = compile(`
          let a = Color(0.4, 0.1, 0);
          let b = Color(0.8, 0.1, 0);
          let p = Color.palette(a, b, 3);
          log(p[1].lightness);
        `);
        expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.6, 2);
      });

      it('throws on non-Color second arg', () => {
        expect(() => compile('let a = Color("#ff0000"); Color.palette(a, "blue", 5);')).toThrow('must be a Color');
      });

      it('throws on n < 2', () => {
        expect(() => compile('let a = Color("#ff0000"); let b = Color("#0000ff"); Color.palette(a, b, 1);')).toThrow(
          'must be an integer >= 2',
        );
      });
    });

    it('throws on wrong arg count (0)', () => {
      expect(() => compile('Color.palette();')).toThrow('expects 2 or 3 arguments');
    });

    it('throws on wrong arg count (4)', () => {
      expect(() => compile('let c = Color("#ff0000"); Color.palette(c, c, c, 5);')).toThrow('expects 2 or 3 arguments');
    });
  });

  // ── Color.lightDark() ────────────────────────────────────────────────────

  describe('Color.lightDark()', () => {
    it('returns a Color', () => {
      const result = compile(`
        let c = Color.lightDark(Color('#333'), Color('#eee'));
        log(c.hex);
      `);
      // Resolves to light variant
      expect(result.logs[0].parts[0].value).toBe('#333333');
    });

    it('resolves properties to light variant', () => {
      const result = compile(`
        let c = Color.lightDark(Color(0.4, 0.1, 30), Color(0.9, 0.05, 200));
        log(c.lightness);
        log(c.chroma);
        log(c.hue);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.4, 2);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.1, 2);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(30, 1);
    });

    it('emits light-dark() in style blocks', () => {
      const result = compile(`
        let c = Color.lightDark(Color('#333'), Color('#eee'));
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles.fill).toBe('light-dark(#333333, #eeeeee)');
    });

    it('works with CSSVar-backed variants', () => {
      const result = compile(`
        let c = Color.lightDark(
          Color(CSSVar('--fg-light', '#333')),
          Color(CSSVar('--fg-dark', '#eee'))
        );
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles.fill).toBe('light-dark(var(--fg-light, #333), var(--fg-dark, #eee))');
    });

    it('works with mixed variants (one CSSVar, one plain)', () => {
      const result = compile(`
        let c = Color.lightDark(
          Color(CSSVar('--fg-light', '#333')),
          Color('#eee')
        );
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles.fill).toBe('light-dark(var(--fg-light, #333), #eeeeee)');
    });

    it('method calls on lightDark color operate on light variant', () => {
      const result = compile(`
        let c = Color.lightDark(Color('#333'), Color('#eee'));
        let lighter = c.lighten(0.1);
        log(lighter.lightness);
      `);
      // Should be light variant's lightness + 0.1
      const lightness = parseFloat(result.logs[0].parts[0].value);
      expect(lightness).toBeGreaterThan(0.2); // original is dark, lightened
    });

    it('displays lightDark in log output', () => {
      const result = compile(`
        let c = Color.lightDark(Color('#333'), Color('#eee'));
        log(c);
      `);
      expect(result.logs[0].parts[0].value).toContain('Color.lightDark');
    });

    it('throws on non-Color first argument', () => {
      expect(() => compile('Color.lightDark("#333", Color("#eee"));')).toThrow('first argument must be a Color');
    });

    it('throws on non-Color second argument', () => {
      expect(() => compile('Color.lightDark(Color("#333"), "#eee");')).toThrow('second argument must be a Color');
    });

    it('throws on wrong argument count', () => {
      expect(() => compile('Color.lightDark(Color("#333"));')).toThrow('expects 2 arguments');
    });

    it('throws on too many arguments', () => {
      expect(() => compile('Color.lightDark(Color("#333"), Color("#eee"), Color("#fff"));')).toThrow(
        'expects 2 arguments',
      );
    });
  });
});
