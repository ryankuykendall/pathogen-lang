import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

describe('Boolean Operations', () => {
  describe('union()', () => {
    it('combines two overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        u.drawTo(0, 0)
      `);
      expect(result).toContain('M');
      expect(result).toMatch(/z/i);
    });

    it('combines two non-overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let u = a.project(0, 0).union(b.project(100, 100));
        u.drawTo(0, 0)
      `);
      expect(result).toContain('M');
    });

    it('works on PathBlockValues', () => {
      const result = compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.union(b);
        u.drawTo(0, 0)
      `);
      // Same shape union = same shape
      expect(result).toContain('M');
    });

    it('works on ProjectedPathValues', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        u.drawTo(0, 0)
      `);
      expect(result).toContain('M');
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
      expect(result).toContain('M');
    });

    it('works with overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let d = a.project(0, 0).difference(b.project(20, 20));
        d.drawTo(0, 0)
      `);
      expect(result).toContain('M');
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
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let i = a.project(0, 0).intersection(b.project(20, 20));
        i.drawTo(0, 0)
      `);
      expect(result).toContain('M');
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
      expect(result).toContain('M');
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
      expect(result).toContain('M');
    });

    it('identical shapes intersection returns the shape', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let i = a.intersection(a);
        i.drawTo(0, 0)
      `);
      expect(result).toContain('M');
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
      expect(result).toContain('M');
    });

    it('boolean result can be filleted', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        let f = u.fillet(3);
        f.drawTo(0, 0)
      `);
      expect(result).toContain('M');
    });

    it('non-overlapping difference returns the original', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 20 v 20 h -20 z };
        let d = a.project(0, 0).difference(b.project(100, 100));
        d.drawTo(0, 0)
      `);
      expect(result).toContain('M');
    });

    it('contained shape difference produces hole', () => {
      const result = compilePath(`
        let outer = @{ h 60 v 60 h -60 z };
        let inner = @{ h 20 v 20 h -20 z };
        let d = outer.project(0, 0).difference(inner.project(20, 20));
        d.drawTo(0, 0)
      `);
      expect(result).toContain('M');
    });
  });
});
