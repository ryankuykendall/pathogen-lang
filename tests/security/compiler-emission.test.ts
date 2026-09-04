/**
 * Security: compiler-emission contract tests.
 *
 * Asserts that compiled SVG output (CompileResult → buildSvgTree → toSvgString)
 * never contains tokens that would let it phone home, restyle the host page,
 * or execute script when embedded inline or served as image/svg+xml.
 *
 * Vectors covered correspond to the article inventory in
 * project-docs/security/svg-attack-fixtures.md (rows C1–C10).
 *
 * Tests fail today for vectors C1, C2, C3, C4, C5, C6, C7 — Phase 1 closes them.
 * Tests for C8–C10 verify identifier validation across def-id surfaces.
 */

import { describe, expect, it } from 'vitest';

import { buildSvgTree, compile, toSvgString } from '../../src';

function compileToSvg(source: string): string {
  const result = compile(source);
  const tree = buildSvgTree(result);
  return toSvgString(tree);
}

const FORBIDDEN_TOKENS = [
  /url\s*\(\s*['"]?https?:/i, // remote url() — IP leak
  /url\s*\(\s*['"]?\/\//, // protocol-relative url()
  /url\s*\(\s*['"]?javascript:/i, // javascript url()
  /image-set\s*\(/i, // image-set() — bypass for url() filters
  /\bsrc\s*\(/i, // future CSS src()
  /\bimage\s*\(\s*['"]?https?:/i, // future CSS image() with URL
  /@import\b/i, // CSS @import
  /\bexpression\s*\(/i, // legacy IE CSS expression
  /\bbehavior\s*:/i, // legacy IE CSS behavior
  /<script\b/i, // <script> element
  /\son\w+\s*=/i, // on* event handler attribute
  /<foreignObject\b/i, // foreignObject element
  /<iframe\b/i,
  /\\[0-9a-fA-F]/, // CSS escape sequence (raw \xx)
];

function expectSafeSvg(svg: string): void {
  for (const pattern of FORBIDDEN_TOKENS) {
    expect(svg).not.toMatch(pattern);
  }
}

describe('Security · compiler emission', () => {
  // ── C1: CSS injection via @property name ───────────────────────────────

  describe('C1: CSSVar name cannot break out of @property rule', () => {
    it('rejects a CSSVar name that closes the @property block', () => {
      expect(() =>
        compile(`
          let v = CSSVar("--x}; @import url(https://evil.example/log); /*", Color("#ff0000"));
          define PathLayer('a') #{ stroke: v; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });

    it('rejects a CSSVar name with whitespace', () => {
      expect(() => compile('let v = CSSVar("--my var", "red");')).toThrow();
    });

    it('rejects a CSSVar name with quotes', () => {
      expect(() => compile('let v = CSSVar("--x\\"y", "red");')).toThrow();
    });
  });

  // ── C2: CSS injection via @property initial-value ──────────────────────

  describe('C2: CSSVar initial-value cannot inject CSS rules', () => {
    it('rejects a fallback containing url()', () => {
      expect(() =>
        compile(`
          let v = CSSVar("--brand", "url(https://evil.example/log)");
          define PathLayer('a') #{ stroke: v; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });

    it('rejects a fallback that closes and re-opens braces', () => {
      expect(() =>
        compile(`
          let v = CSSVar("--brand", "} @import url(https://evil.example/log) {");
          define PathLayer('a') #{ stroke: v; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  // ── C3–C7: style { … } block value validation ──────────────────────────

  // Note: the AST builder strips `//` as a line comment before regex-extracting
  // properties (parser/ast-builder.ts:1704), so `https://` URLs already get
  // truncated and the property silently drops. The fixtures below avoid `//`
  // so they hit the validator directly; we also add an explicit regression
  // test confirming the `//`-containing form does not reach the output.

  describe('C3: url() with remote URL in style block', () => {
    it('rejects url(https:host/path) without // (validator path)', () => {
      expect(() =>
        compile(`
          define PathLayer('a') #{ background-image: "url(https:evil.example/log)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });

    it('rejects url() even on properties that take URLs natively', () => {
      // url() on filter/mask/clip-path is allowed via local fragment refs,
      // but a remote URL must be rejected.
      expect(() =>
        compile(`
          define PathLayer('a') #{ filter: "url(https:evil.example/log)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });

    it('rejects url(https://...) in a style value', () => {
      // Previously this was silently dropped as a side effect of the AST
      // builder's comment-strip eating the `//` in `https://`. The declaration
      // parser now keeps the value intact and validateCSSValue rejects it.
      expect(() =>
        compile(`
          define PathLayer('a') #{ background-image: "url(https://evil.example/log)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow(/url\(/);
    });
  });

  describe('C4: url() with CSS escape codes', () => {
    it('rejects backslash-escaped url() (\\75\\72\\6c)', () => {
      expect(() =>
        compile(`
          define PathLayer('a') #{ fill: "\\\\75\\\\72\\\\6c(test)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  describe('C5: image-set() bypass', () => {
    it('rejects image-set() in style block', () => {
      expect(() =>
        compile(`
          define PathLayer('a') #{ background-image: "image-set('test' 1x)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  describe('C6: raw var() in style block', () => {
    it('rejects raw var() — direct users to CSSVar()', () => {
      expect(() =>
        compile(`
          define PathLayer('a') #{ fill: "var(--evil)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  describe('C7: calc() in style block', () => {
    it('rejects calc() in style block values', () => {
      expect(() =>
        compile(`
          define PathLayer('a') #{ stroke-width: "calc(2 + 3)"; }
          layer('a').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  // ── C8–C10: identifier validation on layer/def IDs ─────────────────────

  describe('C8: layer name with CSS-breakout characters', () => {
    it('rejects layer name with closing brace + injection', () => {
      expect(() =>
        compile(`
          define PathLayer('a}; @import url(x); /*') #{}
          layer('a}; @import url(x); /*').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });

    it('rejects layer name with quotes', () => {
      expect(() =>
        compile(`
          define PathLayer('a"b') #{}
          layer('a"b').apply { M 0 0 L 10 10 }
        `),
      ).toThrow();
    });
  });

  describe('C9: Mask/ClipPath/Pattern/Marker id with breakout', () => {
    it('rejects Mask() id with breakout characters', () => {
      expect(() =>
        compile(`
          let m = Mask("a}.b{") { M 0 0 L 10 10 };
        `),
      ).toThrow();
    });

    it('rejects Marker() id with whitespace', () => {
      expect(() =>
        compile(`
          let m = Marker("my marker") { M 0 0 L 10 10 };
        `),
      ).toThrow();
    });
  });

  describe('C10: Gradient id with breakout', () => {
    it('rejects LinearGradient() id with quote', () => {
      expect(() =>
        compile(`
          let g = LinearGradient('a"x', { x1: 0, y1: 0, x2: 1, y2: 0, stops: [[0, "#000"], [1, "#fff"]] });
        `),
      ).toThrow();
    });

    it('rejects RadialGradient() id with breakout sequence', () => {
      expect(() =>
        compile(`
          let g = RadialGradient('a}.b{', { cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, "#000"], [1, "#fff"]] });
        `),
      ).toThrow();
    });
  });

  // ── End-to-end emission contract ───────────────────────────────────────

  describe('end-to-end: clean source produces clean SVG', () => {
    it('emits no forbidden tokens for a benign program', () => {
      const svg = compileToSvg(`
        define PathLayer('main') #{ fill: "#e63946"; stroke: oklch(0.7 0.15 240); stroke-width: 2; }
        layer('main').apply { M 0 0 L 100 0 L 100 100 L 0 100 Z }
      `);
      expectSafeSvg(svg);
    });

    it('emits no forbidden tokens for CSSVar with proper identifier', () => {
      const svg = compileToSvg(`
        let brand = CSSVar('--brand', '#e63946');
        define PathLayer('main') #{ stroke: brand; }
        layer('main').apply { M 0 0 L 100 0 }
      `);
      expectSafeSvg(svg);
    });

    it('emits no forbidden tokens for gradient + path layer', () => {
      const svg = compileToSvg(`
        let g = LinearGradient('grad1', 0, 0, 1, 0) {|gr|
          gr.stop(0, Color('#000000'));
          gr.stop(1, Color('#ffffff'));
        };
        define PathLayer('main') #{ fill: g; }
        layer('main').apply { M 0 0 L 100 0 L 100 100 L 0 100 Z }
      `);
      expectSafeSvg(svg);
    });
  });
});
