import { describe, it, expect } from 'vitest';
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
      expect(() => compile('let c = Color("#ff0000"); log(c.foo);')).toThrow("does not exist on Color");
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

    it('unknown method throws', () => {
      expect(() => compile('let c = Color("#ff0000"); c.foo();')).toThrow('Unknown Color method');
    });
  });

  // ── Static methods ─────────────────────────────────────────────────────

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
        "layer('main').apply { M 0 0 L 100 100 }"
      );
      const mainLayer = result.layers.find(l => l.name === 'main');
      expect(mainLayer?.styles?.stroke).toBe('#e63946');
    });

    it('auto-converts manipulated Color in style block', () => {
      const result = compile(
        "let c = Color('#ff0000').alpha(0.5);\n" +
        "define PathLayer('main') ${ stroke: c; }\n" +
        "layer('main').apply { M 0 0 L 100 100 }"
      );
      const mainLayer = result.layers.find(l => l.name === 'main');
      expect(mainLayer?.styles?.stroke).toBe('rgba(255, 0, 0, 0.5)');
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
});
