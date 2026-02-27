import { describe, it, expect } from 'vitest';
import { compile } from '../src';

describe('CSSVar type', () => {
  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates with just a variable name (no fallback)', () => {
      const result = compile('let v = CSSVar("--primary"); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--primary)');
    });

    it('creates with a string fallback', () => {
      const result = compile('let v = CSSVar("--primary", "#e63946"); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--primary, #e63946)');
    });

    it('creates with a Color fallback', () => {
      const result = compile('let v = CSSVar("--primary", Color("#e63946")); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--primary, #e63946)');
    });

    it('throws on wrong argument count (0 args)', () => {
      expect(() => compile('let v = CSSVar();')).toThrow('CSSVar() expects 1 or 2 arguments');
    });

    it('throws on wrong argument count (3 args)', () => {
      expect(() => compile('let v = CSSVar("--a", "b", "c");')).toThrow('CSSVar() expects 1 or 2 arguments');
    });

    it('throws on non-string name', () => {
      expect(() => compile('let v = CSSVar(42);')).toThrow('CSSVar() first argument must be a string');
    });

    it('throws when name does not start with --', () => {
      expect(() => compile('let v = CSSVar("primary");')).toThrow("must start with '--'");
    });

    it('accepts numeric fallback by stringifying', () => {
      const result = compile(`
        define PathLayer('a') \${ stroke-width: CSSVar('--w', 42); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['stroke-width']).toBe('var(--w, 42)');
    });

    it('throws on invalid fallback type', () => {
      expect(() => compile('let a = [1, 2]; let v = CSSVar("--x", a);')).toThrow('CSSVar() fallback must be a string, number, or Color');
    });
  });

  // ── Properties ─────────────────────────────────────────────────────────

  describe('properties', () => {
    it('.var returns the variable name', () => {
      const result = compile('let v = CSSVar("--primary"); log(v.var);');
      expect(result.logs[0].parts[0].value).toBe('--primary');
    });

    it('.fallback returns the fallback string', () => {
      const result = compile('let v = CSSVar("--primary", "#e63946"); log(v.fallback);');
      expect(result.logs[0].parts[0].value).toBe('#e63946');
    });

    it('.fallback returns null when no fallback', () => {
      const result = compile('let v = CSSVar("--primary"); log(v.fallback);');
      expect(result.logs[0].parts[0].value).toBe('null');
    });

    it('.css returns var() with fallback', () => {
      const result = compile('let v = CSSVar("--fg", "#333"); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--fg, #333)');
    });

    it('.css returns var() without fallback', () => {
      const result = compile('let v = CSSVar("--fg"); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--fg)');
    });

    it('throws on unknown property', () => {
      expect(() => compile('let v = CSSVar("--x"); log(v.unknown);')).toThrow("does not exist on CSSVar");
    });
  });

  // ── Style blocks ───────────────────────────────────────────────────────

  describe('style blocks', () => {
    it('auto-converts in style block stroke', () => {
      const result = compile(`
        let fg = CSSVar("--foreground", "#333");
        define PathLayer('main') \${ stroke: fg; }
        layer('main').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'var(--foreground, #333)' });
    });

    it('auto-converts inline CSSVar in style block', () => {
      const result = compile(`
        define PathLayer('main') \${ fill: CSSVar("--fill", "none"); }
        layer('main').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({ fill: 'var(--fill, none)' });
    });

    it('auto-converts CSSVar without fallback in style block', () => {
      const result = compile(`
        let c = CSSVar("--stroke-color");
        define PathLayer('main') \${ stroke: c; }
        layer('main').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'var(--stroke-color)' });
    });
  });

  // ── Display ────────────────────────────────────────────────────────────

  describe('display', () => {
    it('log() displays with fallback', () => {
      const result = compile('let v = CSSVar("--primary", "#e63946"); log(v);');
      expect(result.logs[0].parts[0].value).toBe('CSSVar(--primary, #e63946)');
    });

    it('log() displays without fallback', () => {
      const result = compile('let v = CSSVar("--bg"); log(v);');
      expect(result.logs[0].parts[0].value).toBe('CSSVar(--bg)');
    });

    it('template literal includes display form', () => {
      const result = compile('let v = CSSVar("--primary", "#e63946"); log(`color: ${v}`);');
      expect(result.logs[0].parts[0].value).toBe('color: CSSVar(--primary, #e63946)');
    });
  });

  // ── Composition with Color ─────────────────────────────────────────────

  describe('composition with Color', () => {
    it('Color fallback resolves to hex', () => {
      const result = compile('let v = CSSVar("--fg", Color("red")); log(v.fallback);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('Color fallback appears in .css output', () => {
      const result = compile('let v = CSSVar("--fg", Color("red")); log(v.css);');
      expect(result.logs[0].parts[0].value).toBe('var(--fg, #ff0000)');
    });

    it('Color fallback works in style blocks', () => {
      const result = compile(`
        let brand = Color("#e63946");
        let fg = CSSVar("--primary", brand);
        define PathLayer('main') \${ stroke: fg; }
        layer('main').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'var(--primary, #e63946)' });
    });

    it('Color(CSSVar(...)) preserves var() in direct style use', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toMatch(/^var\(--base, #[0-9a-f]{6}\)$/);
    });

    it('Color(CSSVar(...)) throws without fallback', () => {
      expect(() => compile("let c = Color(CSSVar('--x'));")).toThrow('requires a CSSVar with a fallback color');
    });
  });

  // ── CSS Relative Color Syntax (Tier 4.1) ──────────────────────────────

  describe('CSS relative color expressions', () => {
    it('lighten() outputs oklch(from var(...) calc(l + n) c h)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.lighten(0.2); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) calc(l + 0.2) c h)');
    });

    it('darken() outputs oklch(from var(...) calc(l - n) c h)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.darken(0.15); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) calc(l - 0.15) c h)');
    });

    it('saturate() outputs oklch(from var(...) l calc(c * f) h)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.saturate(1.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) l calc(c * 1.5) h)');
    });

    it('desaturate() outputs oklch(from var(...) l calc(c * f) h)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.desaturate(0.3); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) l calc(c * 0.3) h)');
    });

    it('alpha() outputs oklch(from var(...) l c h / a)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.alpha(0.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) l c h / 0.5)');
    });

    it('hueShift() outputs oklch(from var(...) l c calc(h + d))', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.hueShift(90); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) l c calc(h + 90))');
    });

    it('complement() outputs oklch(from var(...) l c calc(h + 180))', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.complement(); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('oklch(from var(--base, #cc6683) l c calc(h + 180))');
    });

    it('mix() outputs color-mix(in oklch, ...)', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        let target = Color('#457b9d');
        define PathLayer('a') \${ fill: c.mix(target, 0.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('color-mix(in oklch, var(--base, #cc6683), #457b9d 50%)');
    });

    it('mix() with two CSSVar-backed colors', () => {
      const result = compile(`
        let c1 = Color(CSSVar('--base', '#cc6683'));
        let c2 = Color(CSSVar('--target', '#457b9d'));
        define PathLayer('a') \${ fill: c1.mix(c2, 0.3); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('color-mix(in oklch, var(--base, #cc6683), var(--target, #457b9d) 30%)');
    });

    it('chaining nests CSS expressions', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.lighten(0.2).hueShift(90); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe(
        'oklch(from oklch(from var(--base, #cc6683) calc(l + 0.2) c h) l c calc(h + 90))'
      );
    });

    it('non-CSSVar Colors still produce baked values', () => {
      const result = compile(`
        let c = Color('#cc6683');
        define PathLayer('a') \${ fill: c.lighten(0.2); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('Color.mix() with CSSVar-backed colors', () => {
      const result = compile(`
        let c1 = Color(CSSVar('--a', '#cc6683'));
        let c2 = Color(CSSVar('--b', '#457b9d'));
        define PathLayer('a') \${ fill: Color.mix(c1, c2, 0.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('color-mix(in oklch, var(--a, #cc6683), var(--b, #457b9d) 50%)');
    });

    it('Color.mix() with one CSSVar-backed color', () => {
      const result = compile(`
        let c1 = Color(CSSVar('--a', '#cc6683'));
        let c2 = Color('#457b9d');
        define PathLayer('a') \${ fill: Color.mix(c1, c2, 0.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toBe('color-mix(in oklch, var(--a, #cc6683), #457b9d 50%)');
    });

    it('Color.mix() with no CSSVar-backed colors produces baked value', () => {
      const result = compile(`
        let c1 = Color('#cc6683');
        let c2 = Color('#457b9d');
        define PathLayer('a') \${ fill: Color.mix(c1, c2, 0.5); }
        layer('a').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['fill']).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
