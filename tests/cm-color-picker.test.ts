import { describe, expect, it } from 'vitest';

import { findColorRanges } from '../playground/utils/cm-color-picker.js';
import { colorspaceToFormat } from '../playground/utils/color.js';
import { parseLezer } from '../src';
import { editorParser } from '../src/parser/editor-parser';

function ranges(source: string) {
  const { tree } = parseLezer(source);
  return findColorRanges(tree, source);
}

describe('findColorRanges (AST-based)', () => {
  describe('bare color literals', () => {
    it('detects bare hex literal', () => {
      const src = 'let c = #ff0000;';
      const r = ranges(src);
      expect(r).toEqual([{ from: src.indexOf('#ff0000'), to: src.indexOf('#ff0000') + 7, color: '#ff0000' }]);
    });

    it('detects short hex literal', () => {
      const src = 'let c = #f00;';
      expect(ranges(src)).toEqual([{ from: src.indexOf('#f00'), to: src.indexOf('#f00') + 4, color: '#f00' }]);
    });

    it('detects CSS color function (rgb)', () => {
      const src = 'let c = rgb(255, 0, 0);';
      const call = 'rgb(255, 0, 0)';
      expect(ranges(src)).toEqual([{ from: src.indexOf(call), to: src.indexOf(call) + call.length, color: call }]);
    });

    it('detects CSS color function (oklch)', () => {
      const src = 'let c = oklch(0.7 0.15 30);';
      const call = 'oklch(0.7 0.15 30)';
      expect(ranges(src)).toEqual([{ from: src.indexOf(call), to: src.indexOf(call) + call.length, color: call }]);
    });
  });

  describe('exclusions', () => {
    it('does NOT detect a color-shaped substring inside an unrelated string literal', () => {
      // log() takes a string; the contents are not a color even if they look like one.
      const src = 'log("rgb(255,0,0)");';
      expect(ranges(src)).toEqual([]);
    });

    it('does NOT detect a hex-shaped substring inside a comment', () => {
      const src = '// note: use #ff0000 here\nlet a = 1;';
      expect(ranges(src)).toEqual([]);
    });

    it('does NOT detect a hex-shaped substring inside a plain string', () => {
      const src = 'let s = "#ff0000";';
      expect(ranges(src)).toEqual([]);
    });
  });

  describe('Color() constructor calls', () => {
    it('detects color inside Color("...") — range is inside the quotes', () => {
      const src = "let c = Color('#ff0000');";
      const inner = '#ff0000';
      const r = ranges(src);
      expect(r).toHaveLength(1);
      const [{ from, to, color }] = r;
      expect(color).toBe(inner);
      expect(src.slice(from, to)).toBe(inner);
    });

    it('skips Color() argument that is not a parseable color', () => {
      const src = 'let c = Color("not a color");';
      expect(ranges(src)).toEqual([]);
    });

    it('replacing at the detected range preserves the surrounding quotes', () => {
      // Simulates what the chip's onChange dispatch does: take the range
      // from findColorRanges and splice a new color into it. The Color() call
      // and its quotes must survive the edit.
      const src = "let c = Color('#ff0000');";
      const r = ranges(src);
      expect(r).toHaveLength(1);
      const [{ from, to }] = r;
      const replaced = src.slice(0, from) + 'oklch(0.7 0.15 30)' + src.slice(to);
      expect(replaced).toBe("let c = Color('oklch(0.7 0.15 30)');");
    });
  });

  describe('CSSVar fallback colors', () => {
    it('detects fallback color in CSSVar("--name", "#...")', () => {
      const src = "let c = CSSVar('--accent', '#ff0000');";
      const inner = '#ff0000';
      const r = ranges(src);
      expect(r).toHaveLength(1);
      const [{ from, to, color }] = r;
      expect(color).toBe(inner);
      expect(src.slice(from, to)).toBe(inner);
    });

    it('detects oklch fallback in CSSVar', () => {
      const src = "let c = CSSVar('--accent', 'oklch(0.7 0.15 30)');";
      const inner = 'oklch(0.7 0.15 30)';
      const r = ranges(src);
      expect(r).toHaveLength(1);
      expect(r[0].color).toBe(inner);
    });
  });

  describe('style block property values', () => {
    it('detects hex color in a style-block stroke value', () => {
      const src = 'let s = ${stroke: #ff0000;};';
      const r = ranges(src);
      expect(r).toHaveLength(1);
      expect(r[0].color).toBe('#ff0000');
      expect(src.slice(r[0].from, r[0].to)).toBe('#ff0000');
    });

    it('detects multiple colors in a style block', () => {
      const src = 'let s = ${stroke: #ff0000; fill: rgb(0, 0, 0);};';
      const r = ranges(src);
      expect(r).toHaveLength(2);
      const colors = r.map((x) => x.color).sort();
      expect(colors).toEqual(['#ff0000', 'rgb(0, 0, 0)']);
    });

    it('does not detect non-color-accepting property values', () => {
      const src = 'let s = ${stroke-width: 2;};';
      expect(ranges(src)).toEqual([]);
    });
  });

  describe('style blocks with the mounted inner grammar (editorParser)', () => {
    function mountedRanges(source: string) {
      return findColorRanges(editorParser.parse(source), source);
    }

    it('detects a hex color nested inside drop-shadow() on the filter property', () => {
      // The original user report: no chip for #c00 inside drop-shadow.
      const src = 'let s = ${ filter: drop-shadow(4px 4px 4px #c00); };';
      const r = mountedRanges(src);
      expect(r).toHaveLength(1);
      expect(src.slice(r[0].from, r[0].to)).toBe('#c00');
    });

    it('detects a color function nested inside drop-shadow()', () => {
      const src = 'let s = ${ filter: drop-shadow(4px 4px 8px rgba(0, 0, 0, 0.5)); };';
      const r = mountedRanges(src);
      expect(r).toHaveLength(1);
      expect(src.slice(r[0].from, r[0].to)).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('detects whole-value colors on any property, same as the fallback', () => {
      const src = 'let s = ${ stroke: #ff0000; fill: oklch(0.7 0.15 30); };';
      const r = mountedRanges(src);
      expect(r.map((x) => x.color)).toEqual(['#ff0000', 'oklch(0.7 0.15 30)']);
    });

    it('chips a bare named color only as the whole value of a color property', () => {
      const src = 'let s = ${ stroke: tomato; };';
      const r = mountedRanges(src);
      expect(r).toHaveLength(1);
      expect(r[0].color).toBe('tomato');
    });

    it('KNOWN LIMITATION: a variable literally named after a CSS color still chips', () => {
      // The scanner has no scope info, so `tomato` here is chipped as the CSS
      // named color even though it is a variable reference the compiler would
      // resolve to oklch(...). Interacting with the chip would overwrite the
      // reference with a literal color. Same behavior as the legacy regex
      // fallback; scope-aware exclusion is a recorded follow-up
      // (project-docs/style-block-structure/primer.md). This test documents
      // the limitation — if it starts failing because the chip disappeared,
      // the follow-up landed and this test should be inverted.
      const src = 'let tomato = oklch(0.63 0.24 30);\nlet s = ${ stroke: tomato; };';
      const r = mountedRanges(src);
      const styleChip = r.find((x) => x.color === 'tomato');
      expect(styleChip).toBeDefined();
    });

    it('does not chip identifiers that merely contain a color name', () => {
      const src = 'let s = ${ stroke: tomatoJuice; };';
      expect(mountedRanges(src)).toEqual([]);
    });

    it('does not chip identifiers on non-color properties (variable references)', () => {
      // `card` is a Pathogen variable holding a filter — rewriting it as a
      // named color would corrupt the program.
      const src = 'let s = ${ filter: card; font-family: serif; };';
      expect(mountedRanges(src)).toEqual([]);
    });

    it('does not chip none/inherit/currentColor', () => {
      const src = 'let s = ${ stroke: none; fill: currentColor; };';
      expect(mountedRanges(src)).toEqual([]);
    });

    it('does not chip variable references inside function args', () => {
      const src = 'let s = ${ filter: drop-shadow(4px 4px 4px shadowColor); };';
      expect(mountedRanges(src)).toEqual([]);
    });

    it('chips template-free multi-value declarations without false positives', () => {
      const src = 'let s = ${ stroke-dasharray: 4 1 2 3; font-family: "Inter", serif; };';
      expect(mountedRanges(src)).toEqual([]);
    });

    it('still detects colors outside style blocks in the same document', () => {
      const src = 'let c = #00ff00;\nlet s = ${ filter: drop-shadow(1px 1px #c00); };';
      const r = mountedRanges(src);
      expect(r.map((x) => x.color)).toEqual(['#00ff00', '#c00']);
    });
  });
});

describe('colorspaceToFormat', () => {
  it('maps supported colorspaces to ColorFormats', () => {
    expect(colorspaceToFormat('hex')).toBe('hex');
    expect(colorspaceToFormat('srgb')).toBe('rgb');
    expect(colorspaceToFormat('hsl')).toBe('hsl');
    expect(colorspaceToFormat('oklch')).toBe('oklch');
    expect(colorspaceToFormat('oklab')).toBe('oklab');
  });

  it('upgrades to alpha variants when hasAlpha=true', () => {
    expect(colorspaceToFormat('srgb', true)).toBe('rgba');
    expect(colorspaceToFormat('hsl', true)).toBe('hsla');
  });

  it('returns null for colorspaces with no ColorFormat equivalent', () => {
    // caller should keep the source format when mapping fails
    expect(colorspaceToFormat('hwb')).toBeNull();
    expect(colorspaceToFormat('lab')).toBeNull();
    expect(colorspaceToFormat('lch')).toBeNull();
    expect(colorspaceToFormat('display-p3')).toBeNull();
    expect(colorspaceToFormat('rec2020')).toBeNull();
    expect(colorspaceToFormat('a98-rgb')).toBeNull();
    expect(colorspaceToFormat('prophoto')).toBeNull();
    expect(colorspaceToFormat('xyz')).toBeNull();
  });
});
