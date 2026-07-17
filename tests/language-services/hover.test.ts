import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getHoverInfo } from '../../src/language-services/hover';

function hover(source: string, line: number, character: number) {
  return getHoverInfo(new StringTextDocument(source), { line, character });
}

describe('getHoverInfo', () => {
  describe('keywords', () => {
    it('shows hover for let', () => {
      const result = hover('let x = 10;', 0, 1); // cursor on "let"
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**let**');
      expect(result!.contents).toContain('Declare a variable');
    });

    it('shows hover for for', () => {
      const result = hover('for (i in 0..5) {\n  M i 0\n}', 0, 1);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**for**');
    });

    it('shows hover for fn', () => {
      const result = hover('fn draw() {\n  M 0 0\n}', 0, 1);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**fn**');
    });

    it('shows hover for calc', () => {
      const result = hover('M calc(10 + 5) 0', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**calc()**');
    });

    it('shows hover for true/false/null', () => {
      expect(hover('let x = true;', 0, 9)!.contents).toContain('**true**');
      expect(hover('let x = false;', 0, 9)!.contents).toContain('**false**');
      expect(hover('let x = null;', 0, 9)!.contents).toContain('**null**');
    });
  });

  describe('SVG path commands', () => {
    it('shows hover for M command', () => {
      const result = hover('M 10 20', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**M**');
      expect(result!.contents).toContain('Move to');
    });

    it('shows hover for A command', () => {
      const result = hover('A 50 50 0 1 1 100 0', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**A**');
      expect(result!.contents).toContain('Arc');
    });

    it('shows hover for Z command', () => {
      const result = hover('M 0 0 L 100 0 Z', 0, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Close path');
    });
  });

  describe('stdlib functions', () => {
    it('shows hover for circle', () => {
      const result = hover('circle(50, 50, 25)', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**circle**');
      expect(result!.contents).toContain('circle(cx, cy, r)');
    });

    it('shows hover for lerp', () => {
      const result = hover('let x = lerp(0, 100, 0.5);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**lerp**');
    });

    it('shows hover for sin', () => {
      const result = hover('let y = sin(1.5);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**sin**');
    });

    it('shows hover for ctx', () => {
      const result = hover('let pos = ctx;', 0, 11);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**ctx**');
    });
  });

  describe('user-defined symbols', () => {
    it('shows hover for user variable', () => {
      const result = hover('let radius = 50;\ncircle(0, 0, radius);', 1, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**radius**');
      expect(result!.contents).toContain('variable');
    });

    it('shows hover for function parameter', () => {
      const result = hover('fn draw(cx, cy) {\n  M cx cy\n}', 1, 4);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**cx**');
      expect(result!.contents).toContain('parameter');
    });

    it('shows hover for user function', () => {
      const result = hover('fn draw() {\n  M 0 0\n}\ndraw();', 3, 2);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**draw**');
      expect(result!.contents).toContain('function');
    });
  });

  describe('inferred variable types', () => {
    it('shows the inferred type for a constructor-typed variable', () => {
      const result = hover('let p = Point(10, 20);\ncircle(p.x, p.y, 5);', 1, 7);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('shows the inferred type for a destructured struct binding', () => {
      const result = hover(
        'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin } = g;\ncircle(origin.x, origin.y, 5);',
        2,
        8,
      );
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('shows the Color display name for ColorInstance bindings', () => {
      const result = hover('let col = oklch(0.7 0.15 200);\nlog(col);', 1, 5);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Color*');
      expect(result!.contents).not.toContain('ColorInstance');
    });

    it('shows the inferred type for an aliased destructured binding', () => {
      const result = hover(
        'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin: o } = g;\ncircle(o.x, o.y, 5);',
        2,
        7,
      );
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('keeps the plain hover text for un-inferable variables', () => {
      const result = hover('let radius = 50;\ncircle(0, 0, radius);', 1, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toBe('**radius** — *variable*\n\nDefined at line 1');
    });

    it('keeps the plain hover text for numeric destructured bindings', () => {
      const result = hover('let { x } = Point(1, 2);\ncircle(x, 0, 5);', 1, 7);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable*');
      expect(result!.contents).not.toContain('variable:');
    });

    it('shows the inferred type for a loop variable over a typed array', () => {
      const result = hover('let pts = [Point(0, 0), Point(1, 1)];\nfor (pt in pts) {\n  circle(pt.x, pt.y, 2);\n}', 2, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*loop variable: Point*');
    });
  });

  describe('no hover', () => {
    it('returns null for empty space far from any word', () => {
      // Position in the middle of lots of whitespace
      expect(hover('M     10', 0, 3)).toBeNull();
    });

    it('returns null for numbers', () => {
      // Numbers are digits, getWordAt will find them, but they won't match any hover
      const result = hover('M 10 20', 0, 3);
      // 10 is not a keyword, stdlib, or user symbol — no hover
      expect(result).toBeNull();
    });
  });

  describe('hover range', () => {
    it('returns range covering the word', () => {
      const result = hover('circle(50, 50, 25)', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.range).toBeDefined();
      expect(result!.range!.start).toEqual({ line: 0, character: 0 });
      expect(result!.range!.end).toEqual({ line: 0, character: 6 });
    });
  });

  // 2026-07-13 audit: defs constructors flow into hover via STDLIB_COMPLETIONS.
  describe('defs constructor hover', () => {
    it('shows hover for Marker with its real signature', () => {
      const result = hover("let mk = Marker('dot', 10, 10);", 0, 10); // cursor on "Marker"
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Marker');
      expect(result!.contents).toContain('markerWidth');
    });

    it('shows hover for LinearGradient', () => {
      const result = hover("let g = LinearGradient('fade', 0, 0, 1, 1);", 0, 12);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('LinearGradient');
      expect(result!.contents).toContain('x1, y1, x2, y2');
    });

    it('shows hover for Mask', () => {
      const result = hover("let m = Mask('fade');", 0, 9);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Mask');
      expect(result!.contents).toContain('append');
    });

    it('shows hover for Pattern', () => {
      const result = hover("let p = Pattern('dots', 0, 0, 10, 10);", 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Pattern');
    });
  });
});
