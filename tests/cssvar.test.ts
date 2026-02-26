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

    it('Color(CSSVar(...)) uses fallback for color methods', () => {
      const result = compile(`
        let c = Color(CSSVar('--base', '#cc6683'));
        define PathLayer('a') \${ fill: c.lighten(0.2); }
        layer('a').apply { M 0 0 }
      `);
      // lighten() produces a concrete color (no var wrapper)
      expect(result.layers[0].styles['fill']).toMatch(/^#[0-9a-f]{6}$/);
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
});
