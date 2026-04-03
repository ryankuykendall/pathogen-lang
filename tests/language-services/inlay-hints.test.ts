import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getInlayHints, InlayHintKind } from '../../src/language-services/inlay-hints';
import type { InlayHint } from '../../src/language-services/inlay-hints';

function hints(source: string): InlayHint[] {
  const doc = new StringTextDocument(source);
  const fullRange = {
    start: { line: 0, character: 0 },
    end: doc.positionAt(source.length),
  };
  return getInlayHints(doc, fullRange);
}

function paramHints(source: string): InlayHint[] {
  return hints(source).filter((h) => h.kind === InlayHintKind.Parameter);
}

function typeHints(source: string): InlayHint[] {
  return hints(source).filter((h) => h.kind === InlayHintKind.Type);
}

describe('getInlayHints', () => {
  it('returns empty for empty source', () => {
    expect(hints('')).toEqual([]);
  });

  it('returns empty for unparseable source', () => {
    expect(hints('let x = ')).toEqual([]);
  });

  describe('parameter hints', () => {
    it('shows parameter names for lerp()', () => {
      const h = paramHints('let x = lerp(0, 100, 0.5);');
      expect(h.length).toBe(3);
      expect(h[0].label).toBe('a:');
      expect(h[1].label).toBe('b:');
      expect(h[2].label).toBe('t:');
    });

    it('shows parameter names for circle()', () => {
      const h = paramHints('circle(50, 50, 25)');
      expect(h.length).toBe(3);
      expect(h[0].label).toBe('cx:');
      expect(h[1].label).toBe('cy:');
      expect(h[2].label).toBe('r:');
    });

    it('shows parameter names for clamp()', () => {
      const h = paramHints('let y = clamp(x, 0, 100);');
      // clamp has 3 params: value, min, max
      // But first arg is 'x' which doesn't match 'value', so it gets a hint
      expect(h.length).toBe(3);
      expect(h[0].label).toBe('value:');
      expect(h[1].label).toBe('min:');
      expect(h[2].label).toBe('max:');
    });

    it('does not show hints for single-arg functions', () => {
      const h = paramHints('let y = sin(1.5);');
      expect(h).toHaveLength(0); // sin has only 1 param
    });

    it('does not show hints for unknown functions', () => {
      const h = paramHints('myFunc(1, 2, 3)');
      expect(h).toHaveLength(0);
    });

    it('skips hint when arg name matches param name', () => {
      // If the arg is an identifier named 'cx', and the param is 'cx', skip
      const h = paramHints('circle(cx, cy, r)');
      // All three params match their arg names — no hints needed
      expect(h).toHaveLength(0);
    });

    it('has correct positions', () => {
      const h = paramHints('lerp(0, 100, 0.5)');
      // 'a:' before the 0 at position (0, 5)
      expect(h[0].position).toEqual({ line: 0, character: 5 });
    });
  });

  describe('type hints', () => {
    it('shows type for Point constructor', () => {
      const h = typeHints('let p = Point(10, 20);');
      expect(h.length).toBe(1);
      expect(h[0].label).toBe(': Point');
      expect(h[0].kind).toBe(InlayHintKind.Type);
    });

    it('shows type for array literal', () => {
      const h = typeHints('let items = [1, 2, 3];');
      expect(h.length).toBe(1);
      expect(h[0].label).toBe(': Array');
    });

    it('shows type for path block', () => {
      const h = typeHints('let shape = @{\n  M 0 0\n};');
      expect(h.length).toBe(1);
      expect(h[0].label).toBe(': PathBlock');
    });

    it('shows type for color literal', () => {
      const h = typeHints('let c = #ff0000;');
      expect(h.length).toBe(1);
      expect(h[0].label).toBe(': Color');
    });

    it('does not show type for simple numbers', () => {
      const h = typeHints('let x = 10;');
      expect(h).toHaveLength(0);
    });

    it('does not show type for string literals', () => {
      const h = typeHints('let s = "hello";');
      expect(h).toHaveLength(0);
    });

    it('type hint position is after variable name', () => {
      const h = typeHints('let p = Point(10, 20);');
      // 'p' is at character 4, so type hint at character 5
      expect(h[0].position.character).toBe(5);
    });
  });

  describe('range filtering', () => {
    it('only returns hints within the requested range', () => {
      const source = 'lerp(0, 100, 0.5)\nlerp(1, 200, 0.8)';
      const doc = new StringTextDocument(source);
      // Only request hints for line 0
      const h = getInlayHints(doc, {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 999 },
      });
      const paramH = h.filter((hint) => hint.kind === InlayHintKind.Parameter);
      // Should only have hints from line 0
      expect(paramH.every((hint) => hint.position.line === 0)).toBe(true);
    });
  });
});
