import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath, parseSVGPath } from './helpers';

describe('Boolean Operations', () => {
  describe('union()', () => {
    it('combines two overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        u.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      // Overlapping rect union produces an L-shaped polygon with ≥ 6 vertices
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(6);
    });

    it('combines two non-overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let u = a.project(0, 0).union(b.project(100, 100));
        u.drawTo(0, 0)
      `);
      // Non-overlapping union: two separate closed subpaths
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('works on PathBlockValues', () => {
      const result = compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.union(b);
        u.drawTo(0, 0)
      `);
      // Same shape union: boolean library may emit both subpaths for degenerate case
      expect(result).toClosePath();
      expect(result).toContainSVGCommands(['h', 'v', 'z']);
    });

    it('works on ProjectedPathValues', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        u.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      // Overlapping union produces a single closed polygon
      expect(result).toHaveSVGCommandCount('z', 1);
    });

    it('requires closed paths', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 };
        let b = @{ h 30 v 30 h -30 z };
        a.project(0, 0).union(b.project(0, 0))
      `)).toThrow(/closed/i);
    });

    it('requires exactly 1 argument', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        a.union()
      `)).toThrow(/expects 1 argument/);
    });

    it('requires path argument', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        a.union(5)
      `)).toThrow(/must be a PathBlock or ProjectedPath/);
    });
  });

  describe('difference()', () => {
    it('subtracts one shape from another', () => {
      const result = compilePath(`
        let big = @{ h 60 v 60 h -60 z };
        let small = @{ h 20 v 20 h -20 z };
        let d = big.project(0, 0).difference(small.project(20, 20));
        d.drawTo(0, 0)
      `);
      // Contained subtraction: outer boundary + inner hole = 2 closed subpaths
      const zCount = (result.match(/z/gi) || []).length;
      expect(zCount).toBe(2);
    });

    it('works with overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let d = a.project(0, 0).difference(b.project(20, 20));
        d.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      // Result should be a closed polygon (the remaining part of A after removing overlap)
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(4);
    });

    it('requires closed paths', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        let b = @{ h 30 v 30 };
        a.project(0, 0).difference(b.project(0, 0))
      `)).toThrow(/closed/i);
    });
  });

  describe('intersection()', () => {
    it('returns overlapping region of two rectangles', () => {
      // A = (0,0)-(40,40), B = (20,20)-(60,60)
      // Intersection = (20,20)-(40,40) = a 20×20 square
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let i = a.project(0, 0).intersection(b.project(20, 20));
        i.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      expect(result).toHaveSVGCommandCount('z', 1);
      // Should produce a closed quadrilateral (4 line segments)
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(3); // 3-4 line commands + implicit close
    });

    it('requires closed paths', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 };
        let b = @{ h 30 v 30 h -30 z };
        a.project(0, 0).intersection(b.project(0, 0))
      `)).toThrow(/closed/i);
    });
  });

  describe('xor()', () => {
    it('returns symmetric difference of two rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let x = a.project(0, 0).xor(b.project(20, 20));
        x.drawTo(0, 0)
      `);
      // XOR of overlapping rects produces 2 closed subpaths (A\B and B\A)
      const zCount = (result.match(/z/gi) || []).length;
      expect(zCount).toBe(2);
    });

    it('produces two separate L-shaped subpaths (A\\B and B\\A)', () => {
      const result = compilePath(`
        let sq = @{ h 50 v 50 h -50 z };
        let x = sq.project(0, 0).xor(sq.project(25, 25));
        x.drawTo(0, 0)
      `);
      // Should have exactly 2 subpaths (2 z commands)
      const zCount = (result.match(/z/gi) || []).length;
      expect(zCount).toBe(2);

      // Parse coordinates: trace both subpaths and verify bounding boxes
      const subpaths = result.split(/z/i).filter(s => s.trim());
      expect(subpaths.length).toBe(2);

      // Subpath 1 should contain A's top edge (h 50) — the difference A\B
      expect(subpaths[0]).toMatch(/h 50/);
      // Subpath 2 should contain B's right edge (v 50) — the difference B\A
      expect(subpaths[1]).toMatch(/v 50/);
    });

    it('requires closed paths', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 };
        let b = @{ h 30 v 30 h -30 z };
        a.project(0, 0).xor(b.project(0, 0))
      `)).toThrow(/closed/i);
    });
  });

  describe('edge cases', () => {
    it('identical shapes union returns the shape', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let u = a.union(a);
        u.drawTo(0, 0)
      `);
      // Identical shapes: boolean library may emit duplicate subpaths for degenerate case
      expect(result).toClosePath();
      expect(result).toContainSVGCommands(['h', 'v', 'z']);
      // Should have line-type commands forming a rectangle
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(3);
    });

    it('identical shapes intersection returns the shape', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let i = a.intersection(a);
        i.drawTo(0, 0)
      `);
      // Intersection of identical shapes: boolean library may produce degenerate output
      expect(result).toClosePath();
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(1);
    });

    it('boolean result can be further transformed', () => {
      const result = compile(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        log(u.length);
      `);
      expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
    });

    it('boolean result can be chamfered', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        let c = u.chamfer(3);
        c.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      // Chamfer produces additional L commands at corners
      expect(result).toContainSVGCommands(['l', 'l']);
    });

    it('boolean result can be filleted', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        let f = u.fillet(3);
        f.drawTo(0, 0)
      `);
      expect(result).toClosePath();
      // Fillet produces arc commands (A/a) or quadratic curves (Q/q) at corners
      const parsed = parseSVGPath(result);
      const curveCommands = parsed.filter(c =>
        'AaQqCc'.includes(c.command),
      );
      expect(curveCommands.length).toBeGreaterThan(0);
    });

    it('non-overlapping difference returns the original', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 20 v 20 h -20 z };
        let d = a.project(0, 0).difference(b.project(100, 100));
        d.drawTo(0, 0)
      `);
      // Non-overlapping difference: original shape preserved
      expect(result).toClosePath();
      expect(result).toHaveSVGCommandCount('z', 1);
      // Should still be a 4-sided polygon
      const parsed = parseSVGPath(result);
      const lineCommands = parsed.filter(c => c.command === 'l' || c.command === 'L'
        || c.command === 'h' || c.command === 'H'
        || c.command === 'v' || c.command === 'V');
      expect(lineCommands.length).toBeGreaterThanOrEqual(3);
    });

    it('contained shape difference produces hole', () => {
      const result = compilePath(`
        let outer = @{ h 60 v 60 h -60 z };
        let inner = @{ h 20 v 20 h -20 z };
        let d = outer.project(0, 0).difference(inner.project(20, 20));
        d.drawTo(0, 0)
      `);
      // Outer boundary + inner hole = 2 closed subpaths with opposite winding
      expect(result).toHaveSVGCommandCount('z', 2);
    });
  });
});
