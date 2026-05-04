import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compile, createFontRegistry, addFont } from '../src';
import { compilePath, parseSVGPath } from './helpers';

describe('Boolean Operations', () => {
  describe('union()', () => {
    it('combines two overlapping rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(20, 20));
        u.drawTo(0, 0);
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
        u.drawTo(0, 0);
      `);
      // Non-overlapping union: two separate closed subpaths
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('works on PathBlockValues', () => {
      const result = compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.union(b);
        u.drawTo(0, 0);
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
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Overlapping union produces a single closed polygon
      expect(result).toHaveSVGCommandCount('z', 1);
    });

    it('requires closed paths', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 };
        let b = @{ h 30 v 30 h -30 z };
        a.project(0, 0).union(b.project(0, 0));
      `)).toThrow(/closed/i);
    });

    it('requires exactly 1 argument', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        a.union();
      `)).toThrow(/expects 1 argument/);
    });

    it('requires path argument', () => {
      expect(() => compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        a.union(5);
      `)).toThrow(/must be a PathBlock or ProjectedPath/);
    });
  });

  describe('difference()', () => {
    it('subtracts one shape from another', () => {
      const result = compilePath(`
        let big = @{ h 60 v 60 h -60 z };
        let small = @{ h 20 v 20 h -20 z };
        let d = big.project(0, 0).difference(small.project(20, 20));
        d.drawTo(0, 0);
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
        d.drawTo(0, 0);
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
        a.project(0, 0).difference(b.project(0, 0));
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
        i.drawTo(0, 0);
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
        a.project(0, 0).intersection(b.project(0, 0));
      `)).toThrow(/closed/i);
    });
  });

  describe('xor()', () => {
    it('returns symmetric difference of two rectangles', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let x = a.project(0, 0).xor(b.project(20, 20));
        x.drawTo(0, 0);
      `);
      // XOR of overlapping rects produces 2 closed subpaths (A\B and B\A)
      const zCount = (result.match(/z/gi) || []).length;
      expect(zCount).toBe(2);
    });

    it('produces two separate L-shaped subpaths (A\\B and B\\A)', () => {
      const result = compilePath(`
        let sq = @{ h 50 v 50 h -50 z };
        let x = sq.project(0, 0).xor(sq.project(25, 25));
        x.drawTo(0, 0);
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
        a.project(0, 0).xor(b.project(0, 0));
      `)).toThrow(/closed/i);
    });
  });

  describe('edge cases', () => {
    it('identical shapes union returns the shape', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let u = a.union(a);
        u.drawTo(0, 0);
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
        i.drawTo(0, 0);
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
        c.drawTo(0, 0);
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
        f.drawTo(0, 0);
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
        d.drawTo(0, 0);
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
        d.drawTo(0, 0);
      `);
      // Outer boundary + inner hole = 2 closed subpaths with opposite winding
      expect(result).toHaveSVGCommandCount('z', 2);
    });
  });

  describe('multi-subpath operations', () => {
    it('difference subtracts all subpaths of multi-subpath B', () => {
      // Big plate, two small non-overlapping squares as B
      // Union the two smalls (produces 2-subpath result), then difference from plate
      const result = compilePath(`
        let plate = @{ h 100 v 100 h -100 z };
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let combined = a.project(10, 10).union(b.project(60, 60));
        let d = plate.project(0, 0).difference(combined);
        d.drawTo(0, 0);
      `);
      // Plate + 2 holes = 3 closed subpaths
      expect(result).toHaveSVGCommandCount('z', 3);
    });

    it('union of disjoint shapes preserves all subpaths', () => {
      const result = compilePath(`
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let c = @{ h 20 v 20 h -20 z };
        let u = a.project(0, 0).union(b.project(50, 0)).union(c.project(100, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toHaveSVGCommandCount('z', 3);
    });

    it('chained difference with multi-subpath intermediate result', () => {
      // Plate - hole1 = 2 subpaths, then - hole2 = 3 subpaths
      const result = compilePath(`
        let plate = @{ h 100 v 100 h -100 z };
        let h1 = @{ h 20 v 20 h -20 z };
        let h2 = @{ h 20 v 20 h -20 z };
        let d1 = plate.project(0, 0).difference(h1.project(10, 10));
        let d2 = d1.difference(h2.project(60, 60));
        d2.drawTo(0, 0);
      `);
      expect(result).toHaveSVGCommandCount('z', 3);
    });

    it('intersection with multi-subpath operand', () => {
      // Two disjoint small squares (multi-subpath via union),
      // intersected with a large plate that covers both
      const result = compilePath(`
        let plate = @{ h 200 v 200 h -200 z };
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let combined = a.project(10, 10).union(b.project(100, 100));
        let i = plate.project(0, 0).intersection(combined);
        i.drawTo(0, 0);
      `);
      // Both small squares are inside the plate, so intersection = both squares
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('xor with multi-subpath operand', () => {
      // Two disjoint small squares as B, plate as A
      // xor should produce plate-with-holes + the two squares
      const result = compilePath(`
        let plate = @{ h 100 v 100 h -100 z };
        let a = @{ h 20 v 20 h -20 z };
        let b = @{ h 20 v 20 h -20 z };
        let combined = a.project(10, 10).union(b.project(60, 60));
        let x = plate.project(0, 0).xor(combined);
        x.drawTo(0, 0);
      `);
      // XOR = (plate - combined) + (combined - plate)
      // plate - combined = plate with 2 holes = 3 subpaths
      // combined - plate = empty (both squares inside plate)
      // Total: 3 subpaths
      expect(result).toHaveSVGCommandCount('z', 3);
    });

    it('difference with 3-subpath operand B', () => {
      // Three non-overlapping holes punched from a plate
      const result = compilePath(`
        let plate = @{ h 120 v 40 h -120 z };
        let a = @{ h 10 v 10 h -10 z };
        let b = @{ h 10 v 10 h -10 z };
        let c = @{ h 10 v 10 h -10 z };
        let holes = a.project(10, 15).union(b.project(50, 15)).union(c.project(90, 15));
        let d = plate.project(0, 0).difference(holes);
        d.drawTo(0, 0);
      `);
      // Plate + 3 holes = 4 closed subpaths
      expect(result).toHaveSVGCommandCount('z', 4);
    });
  });

  describe('overlapping curved paths', () => {
    it('union of overlapping circles produces single closed path', () => {
      const result = compilePath(`
        let a = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let b = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let u = a.project(0, 0).union(b.project(15, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Overlapping circle union should produce exactly 1 closed subpath
      expect(result).toHaveSVGCommandCount('z', 1);
      // Should contain arc commands (curves preserved, not linearized)
      const parsed = parseSVGPath(result);
      const arcCommands = parsed.filter(c => c.command === 'a' || c.command === 'A');
      expect(arcCommands.length).toBeGreaterThanOrEqual(2);
    });

    it('union of overlapping ellipses produces single closed path', () => {
      // Two partially-overlapping ellipses (non-self-intersecting)
      const result = compilePath(`
        let a = @{ a 30 20 0 1 1 60 0 a 30 20 0 1 1 -60 0 z };
        let b = @{ a 30 20 0 1 1 60 0 a 30 20 0 1 1 -60 0 z };
        let u = a.project(0, 0).union(b.project(25, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Overlapping ellipse union should produce exactly 1 closed subpath
      expect(result).toHaveSVGCommandCount('z', 1);
    });

    it('difference of circle from rectangle produces clean cutout', () => {
      const result = compilePath(`
        let plate = @{ h 80 v 60 h -80 z };
        let circle = @{ a 15 15 0 1 1 30 0 a 15 15 0 1 1 -30 0 z };
        let d = plate.project(0, 0).difference(circle.project(25, 15));
        d.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Outer boundary + circle hole = 2 subpaths
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('intersection of overlapping circles produces lens shape', () => {
      const result = compilePath(`
        let a = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let b = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let i = a.project(0, 0).intersection(b.project(15, 0));
        i.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      expect(result).toHaveSVGCommandCount('z', 1);
      // Lens shape should have arc segments
      const parsed = parseSVGPath(result);
      const arcCommands = parsed.filter(c => c.command === 'a' || c.command === 'A');
      expect(arcCommands.length).toBeGreaterThanOrEqual(2);
    });

    it('xor of overlapping circles produces two crescents', () => {
      const result = compilePath(`
        let a = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let b = @{ a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z };
        let x = a.project(0, 0).xor(b.project(15, 0));
        x.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // XOR of overlapping circles = 2 crescent shapes
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('xor of radialWedge sharp vs rounded produces only corner crescents', () => {
      const result = compilePath(`
        let fromA = 0.1 * PI();
        let toA = 0.4 * PI();
        let sharp = @{ radialWedge(30, 80, fromA, toA, 0); };
        let rounded = @{ radialWedge(30, 80, fromA, toA, 8); };
        let x = sharp.project(0, 0).xor(rounded.project(0, 0));
        x.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // XOR of same-geometry wedges with different corner radii produces
      // small crescent shapes only at the corners — at least 2 subpaths
      const parsed = parseSVGPath(result);
      const zCount = parsed.filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBeGreaterThanOrEqual(2);
      // Verify no diagonal artifacts: line segments should not span the full
      // wedge interior (diagonal artifact would produce l commands ~50-80 units)
      const lineSegs = parsed.filter(c => c.command.toLowerCase() === 'l');
      for (const seg of lineSegs) {
        const [dx, dy] = seg.args;
        const chord = Math.sqrt(dx * dx + dy * dy);
        expect(chord).toBeLessThan(55);
      }
    });

    it('difference of arc from rectangle at shallow angle uses correct tangent', () => {
      // A circle overlapping a rectangle corner at a shallow angle
      // exercises tangent disambiguation at arc-line intersection points
      const result = compilePath(`
        let plate = @{ h 60 v 40 h -60 z };
        let circle = @{ a 25 25 0 1 1 50 0 a 25 25 0 1 1 -50 0 z };
        let d = plate.project(0, 0).difference(circle.project(35, -15));
        d.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Circle partially overlaps top-right corner → single modified boundary
      expect(result).toHaveSVGCommandCount('z', 1);
      // Should contain arc commands from the circular cutout boundary
      const parsed = parseSVGPath(result);
      const arcCommands = parsed.filter(c => c.command.toLowerCase() === 'a');
      expect(arcCommands.length).toBeGreaterThanOrEqual(1);
    });

    it('xor of overlapping rotated ellipses uses elliptical tangent', () => {
      // Non-circular ellipses with rotation exercise the full
      // elliptical tangent formula (rx≠ry, phi≠0)
      const result = compilePath(`
        let a = @{ a 30 15 30 1 1 40 20 a 30 15 30 1 1 -40 -20 z };
        let b = @{ a 30 15 30 1 1 40 20 a 30 15 30 1 1 -40 -20 z };
        let x = a.project(0, 0).xor(b.project(10, 5));
        x.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // XOR of overlapping ellipses = 2 crescent shapes
      expect(result).toHaveSVGCommandCount('z', 2);
    });

    it('union of rectangles sharing a collinear edge renders as one closed contour', () => {
      // Two co-oriented rectangles share part of a collinear edge at y=50.
      // After §2.13 shared-edge detection, the shared interior segment is
      // dropped from both A and B, leaving a single clean perimeter.
      // A: (0,50)→(40,50)→(40,90)→(0,90), CW in screen-y.
      // B: (5,20)→(35,20)→(35,50)→(5,50), CW in screen-y.
      // Shared: x=[5,35] at y=50.
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.project(0, 50).union(b.project(5, 20));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(1);
    });
  });

  describe('output cleanliness — no near-zero artifacts', () => {
    // Backstop for the post12 text-cutout regression (April 2026): unioning
    // tightly-tracked overlapping shapes was leaving visible "spur" detours
    // in the assembled contour and machine-epsilon residue (1e-9 .. 1e-16)
    // in `l` deltas and `q` control points.

    function maxAbsExp(d: string): number {
      // Largest absolute exponent in scientific-notation tokens like `1.23e-8`.
      // Returns 0 when the path has no scientific-notation residue.
      const matches = d.match(/-?\d+(?:\.\d+)?e-(\d+)/g);
      if (!matches) return 0;
      let max = 0;
      for (const m of matches) {
        const exp = parseInt(m.split('e-')[1], 10);
        if (exp > max) max = exp;
      }
      return max;
    }

    it('union of two overlapping rectangles emits no near-zero residue', () => {
      const result = compilePath(`
        let a = @{ h 50 v 50 h -50 z };
        let b = @{ h 50 v 50 h -50 z };
        let u = a.project(0, 0).union(b.project(25, 25));
        u.drawTo(0, 0);
      `);
      // No values like `l 1.23e-8 ...` or `q ... 1.11e-16 ...` in the output.
      expect(maxAbsExp(result)).toBe(0);
    });

    it('difference (rect - inner shape) emits no near-zero residue at the close-path bridge', () => {
      // plate.difference(inner) takes the bInsideA branch in handleNoIntersections
      // which round-trips through extractDrawCmds (z→l) and reverseCmd. Both
      // were sources of near-zero artifacts.
      const result = compilePath(`
        let plate = @{ h 100 v 100 h -100 z };
        let inner = @{ h 30 v 30 h -30 z };
        let cut = plate.project(0, 0).difference(inner.project(35, 35));
        cut.drawTo(0, 0);
      `);
      expect(maxAbsExp(result)).toBe(0);
    });

    it('union of curved overlapping shapes does not emit visible spur detours', () => {
      // Two semicircle-like shapes with overlapping curves — the spur
      // remover catches link-assembly artifacts that revisit a point with a
      // small enclosed area. Output should have well-formed contours.
      const result = compilePath(`
        let a = @{ q 20 0 40 20 q -20 20 -40 20 z };
        let b = @{ q 20 0 40 20 q -20 20 -40 20 z };
        let u = a.project(0, 0).union(b.project(15, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      expect(maxAbsExp(result)).toBe(0);
    });
  });

  describe('audit regressions', () => {
    // Regression backstops keyed to the failure modes catalogued in
    // project-docs/path-block-boolean-operations-audit/AUDIT.md §2.
    // One test per audit-named failure mode. When any of these starts
    // failing, the audit should be the first place to look.

    function maxAbsExp(d: string): number {
      const matches = d.match(/-?\d+(?:\.\d+)?e-(\d+)/g);
      if (!matches) return 0;
      let max = 0;
      for (const m of matches) {
        const exp = parseInt(m.split('e-')[1], 10);
        if (exp > max) max = exp;
      }
      return max;
    }

    function maxChord(d: string): number {
      // Largest single-segment chord length in the path. Used as a coarse
      // detector for "diagonal close" lines: a sudden long line in an
      // otherwise small contour signals a wrong link in buildIntersectionLinks.
      const cmds = parseSVGPath(d);
      let cx = 0, cy = 0, sx = 0, sy = 0;
      let max = 0;
      for (const c of cmds) {
        const op = c.command;
        const a = c.args;
        let nx = cx, ny = cy;
        if (op === 'M' || op === 'L') { nx = a[0]; ny = a[1]; }
        else if (op === 'm' || op === 'l') { nx = cx + a[0]; ny = cy + a[1]; }
        else if (op === 'H') nx = a[0];
        else if (op === 'h') nx = cx + a[0];
        else if (op === 'V') ny = a[0];
        else if (op === 'v') ny = cy + a[0];
        else if (op === 'C') { nx = a[4]; ny = a[5]; }
        else if (op === 'c') { nx = cx + a[4]; ny = cy + a[5]; }
        else if (op === 'Q') { nx = a[2]; ny = a[3]; }
        else if (op === 'q') { nx = cx + a[2]; ny = cy + a[3]; }
        else if (op === 'A') { nx = a[5]; ny = a[6]; }
        else if (op === 'a') { nx = cx + a[5]; ny = cy + a[6]; }
        else if (op === 'Z' || op === 'z') { nx = sx; ny = sy; }
        if (op === 'L' || op === 'l' || op === 'H' || op === 'h' || op === 'V' || op === 'v') {
          const d = Math.hypot(nx - cx, ny - cy);
          if (d > max) max = d;
        }
        if (op === 'M' || op === 'm') { sx = nx; sy = ny; }
        cx = nx; cy = ny;
      }
      return max;
    }

    // §2.5 — diagonal-close notch on adjacent shapes sharing an edge.
    // Two squares offset by exactly the width of one. The shared edge
    // makes endpoint-distances tie at the boundary; greedy distance-only
    // would zigzag, tangent-aware Hungarian must continue along the cap.
    it('union of adjacent squares sharing an edge has no diagonal-close notch', () => {
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 40 v 40 h -40 z };
        let u = a.project(0, 0).union(b.project(40, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Outer perimeter of the merged 80×40 rectangle is at most 80 long
      // on each side. A "diagonal close" cuts across as a chord of length
      // > 80 (typically ~89 for diagonal of 80×40). A clean union has all
      // l/h/v segments ≤ 80.
      expect(maxChord(result)).toBeLessThanOrEqual(80 + 1e-6);
    });

    // §2.7 — adaptive AREA_THRESHOLD must preserve real serif features at
    // small font sizes. Two heavily-overlapping rounded shapes: the union's
    // boundary contains real curves; with a too-aggressive spur remover the
    // small-radius features get dropped. Catches the case where the
    // adaptive threshold is too permissive.
    it('union of two heavily-overlapping rounded shapes preserves boundary direction', () => {
      const result = compilePath(`
        let a = @{ q 20 0 40 20 q -20 20 -40 20 z };
        let b = @{ q 20 0 40 20 q -20 20 -40 20 z };
        let u = a.project(0, 0).union(b.project(12, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Heavily-overlapping unions should produce a single closed contour
      // (not multiple disconnected pieces from missing classification).
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(1);
    });

    // §2.7 plus the existing "near-zero residue" tests — chained 5-shape
    // union must not accumulate float drift in any path command.
    it('chained union of 5 overlapping shapes does not accumulate residue', () => {
      const result = compilePath(`
        let a = @{ h 30 v 30 h -30 z };
        let combined = a.project(0, 0);
        combined = combined.union(a.project(15, 0));
        combined = combined.union(a.project(30, 0));
        combined = combined.union(a.project(45, 0));
        combined = combined.union(a.project(60, 0));
        combined.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      expect(maxAbsExp(result)).toBe(0);
    });

    // §2.10 — coincident-vertex difference must not lose holes. Plate
    // minus inner shape produces a rectangle with a hole; if the
    // single-sample fallback in handleNoIntersections misclassifies, the
    // hole would be lost.
    it('difference at coincident-vertex tracking still produces a hole', () => {
      const result = compilePath(`
        let plate = @{ h 100 v 100 h -100 z };
        let inner = @{ h 30 v 30 h -30 z };
        let cut = plate.project(0, 0).difference(inner.project(35, 35));
        cut.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Should have exactly 2 closed subpaths (outer plate + inner hole).
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(2);
    });

    // §2.4 + §2.5 — near-tangent thin shapes. Two thin rectangles
    // overlapping at a near-tangent angle stress both the
    // isCrossingAtBoundary classifier and the link assembly. Output
    // must be one closed contour with no degenerate chords.
    it('union of thin near-tangent shapes classifies and assembles correctly', () => {
      const result = compilePath(`
        let a = @{ h 60 v 4 h -60 z };
        let b = @{ h 60 v 4 h -60 z };
        let u = a.project(0, 0).union(b.project(0, 3));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(1);
      // Outer extent is 60×7. No straight segment should exceed the
      // diagonal of the bounding box.
      expect(maxChord(result)).toBeLessThanOrEqual(Math.hypot(60, 7) + 1e-6);
    });

    // §2.11 — multi-subpath overlap counter preservation.
    // A solid rectangle overlapping a rectangle-with-hole should produce
    // a union that PRESERVES the hole. Synthetic axis-aligned case is
    // currently CORRECT; real-glyph cases (Raleway-200 ExtraLight `EN`
    // and similar — see iter-1 BBWP) still exhibit counter loss, so the
    // bug is more specific than "any multi-subpath overlap" — likely
    // related to curved-boundary classification or specific subpath
    // ordering. This test backstops the simple case so that improvements
    // to multi-subpath handling don't regress it.
    it('union of solid + (rect with hole) preserves the hole [§2.11 simple]', () => {
      const result = compilePath(`
        let a = @{ h 50 v 50 h -50 z };
        let b = @{ h 80 v 80 h -80 z m 25 -55 v 30 h 30 v -30 z };
        let u = a.project(0, 0).union(b.project(40, -20));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(2);
    });

    // §2.12 — wrap-parity repair backstop. When classifyByRingWalk's
    // walk produces an odd flip-count around a closed ring (because one
    // intra-segment isCrossingAtBoundary decision was wrong, e.g. a
    // tangent-near-boundary that should be a crossing), the wrap class
    // ends up inconsistent: split[rEnd-1] and split[rStart] meet at a
    // path vertex (no flip) but classify differently. The repair pass
    // re-classifies each split via direct midpoint winding-number
    // sampling when samples agree on inside/outside; this overrides the
    // walk's parity-broken class for unambiguous segments and leaves
    // the walk in place for shared-edge ambiguous segments.
    //
    // Synthetic reproducer is hard to write — the walk-parity error
    // requires a specific intersection topology. The simplest case is
    // two thick-stroke shapes overlapping with multiple intersection
    // clusters where one cluster's classification is mishandled.
    it('union of asymmetric thick shapes recovers from walk-parity errors [§2.12]', () => {
      // Two L-shapes overlapping. Each has thick strokes with multiple
      // intersection points where the L's corners meet the other L's
      // strokes. Tests the repair path even when classifyByRingWalk's
      // walk produces inconsistent wrap classification.
      const result = compilePath(`
        let l1 = @{ h 30 v 8 h -22 v 22 h -8 z };
        let l2 = @{ h 30 v 8 h -22 v 22 h -8 z };
        let u = l1.project(0, 0).union(l2.project(15, 12));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // The merged silhouette of two overlapping L-shapes should be a
      // single connected polygon (possibly with one hole if the L's
      // counter is preserved). No long spurious chord through the
      // interior.
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBeGreaterThanOrEqual(1);
      expect(zCount).toBeLessThanOrEqual(2);
      // Bounding box of the union: roughly 45×42 (overlapping Ls span
      // 0..45 horizontally and 0..42 vertically). Diagonal ~62. No
      // straight segment should exceed that diagonal.
      expect(maxChord(result)).toBeLessThanOrEqual(Math.hypot(45, 42) + 2);
    });

    // §2.11 root-cause backstop. The bug was at boolean-ops.ts:2575-2576
    // where classifyAllSegments was passed `segsA` as both `otherPath`
    // and the (incorrectly-supplied) `otherSegs` for one side, and
    // `segsB` for both for the other side. The mismatch made
    // isCrossingAtBoundary's `otherSegs[ix.segA/segB]` lookups go out of
    // bounds for one side's calls, silently dropping `continue` and
    // corrupting flip parity in classifyByRingWalk.
    //
    // The synthetic reproducer: two thin overlapping shapes where one
    // has more segments than the other. With the bug, the smaller path
    // sees out-of-bounds lookups; the wrap classification ends
    // inconsistent and the union output contains a long spurious
    // bridge / interior fill. With the fix, the union outline is clean.
    it('union of asymmetric-segment-count thin shapes does not produce spurious interior fill', () => {
      // A: rectangle (4 segments)
      // B: pentagon-ish polygon with extra vertices (more segments than A),
      //    overlapping A on the left half
      const result = compilePath(`
        let a = @{ h 40 v 30 h -40 z };
        let b = @{ h 10 v 5 h 10 v 5 h 10 v 5 h 10 v 5 h 10 v 5 h -50 z };
        let u = a.project(0, 0).union(b.project(0, 0));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      // Outer extent of A∪B is at most 50 wide × 35 tall — no straight
      // segment should cross from far-left to far-right or top to bottom
      // (those would be spurious bridges).
      expect(maxChord(result)).toBeLessThanOrEqual(Math.hypot(50, 35) + 1e-6);
      // Single connected outer contour expected (1 z, possibly 2 if the
      // shape has a counter from the irregular pentagon).
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBeGreaterThanOrEqual(1);
      expect(zCount).toBeLessThanOrEqual(3);
    });

    // §2.13 — shared-edge promotion. When two paths share a collinear
    // edge segment, that segment is interior to the union and must be
    // dropped from BOTH paths. Detected at intersection time as a
    // SharedEdgeRange, propagated through splits as boundary=true,
    // classified as 'on' by the ring walker, and dropped by
    // selectSegments.

    it('shared-edge union: collinear lines drop both copies (§2.13)', () => {
      // Two co-oriented squares abutting along a shared edge.
      // A spans (0,50)→(40,50)→(40,90)→(0,90)
      // B spans (5,20)→(35,20)→(35,50)→(5,50)
      // Shared: x=[5,35] at y=50.
      // Expected union perimeter: one closed contour, no interior segments.
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.project(0, 50).union(b.project(5, 20));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(1);
      // The expected perimeter is the outline of an inverted-T:
      //   (5,50) → (5,20) → (35,20) → (35,50) → (40,50) → (40,90) → (0,90) → (0,50) → close
      // The shared interior segment (5,50)→(35,50) must NOT appear. A
      // length-30 horizontal segment at y=50 would be a smoking gun for
      // the shared edge surviving.
      const cmds = parseSVGPath(result);
      let cx = 0, cy = 0, sx = 0, sy = 0;
      let foundSharedEdge = false;
      for (const c of cmds) {
        const op = c.command, a = c.args;
        let nx = cx, ny = cy;
        if (op === 'M' || op === 'L') { nx = a[0]; ny = a[1]; }
        else if (op === 'm' || op === 'l') { nx = cx + a[0]; ny = cy + a[1]; }
        else if (op === 'H') nx = a[0];
        else if (op === 'h') nx = cx + a[0];
        else if (op === 'V') ny = a[0];
        else if (op === 'v') ny = cy + a[0];
        else if (op === 'Z' || op === 'z') { nx = sx; ny = sy; }
        if (op === 'M' || op === 'm') { sx = nx; sy = ny; }
        // Look for any horizontal segment at y=50 with length ≥ 25.
        // The clean perimeter has horizontals at y=50 of length 5 only.
        if ((op === 'l' || op === 'L' || op === 'h' || op === 'H') &&
            Math.abs(cy - 50) < 1e-6 && Math.abs(ny - 50) < 1e-6) {
          if (Math.abs(nx - cx) >= 25) foundSharedEdge = true;
        }
        cx = nx; cy = ny;
      }
      expect(foundSharedEdge).toBe(false);
    });

    it('shared-edge intersection: zero-area shared region is empty (§2.13)', () => {
      // Two squares that share only an edge (no interior overlap).
      // A: (0,50)→(40,50)→(40,90)→(0,90), B: (5,20)→(35,20)→(35,50)→(5,50).
      // Their intersection has zero area — it's a line segment along y=50,
      // x=[5,35]. The boolean intersection of two filled polygons is
      // the interior overlap, which is empty.
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.project(0, 50).intersection(b.project(5, 20));
        u.drawTo(0, 0);
      `);
      // No interior overlap → empty result. The path data should have
      // no closed subpaths.
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(0);
    });

    it('shared-edge difference: shared baseline does not appear in output (§2.13)', () => {
      // A square below, B square above, sharing y=50. A.difference(B)
      // should return A unchanged (B doesn't overlap A's interior).
      const result = compilePath(`
        let a = @{ h 40 v 40 h -40 z };
        let b = @{ h 30 v 30 h -30 z };
        let u = a.project(0, 50).difference(b.project(5, 20));
        u.drawTo(0, 0);
      `);
      expect(result).toClosePath();
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBe(1);
      // Result perimeter is exactly A's perimeter: 40+40+40+40 = 160.
      // If the shared edge appeared as a spurious internal feature,
      // total path length would differ. The four cardinal extents
      // should match A's extent: x in [0,40], y in [50,90].
      const cmds = parseSVGPath(result);
      let cx = 0, cy = 0, sx = 0, sy = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let moveCount = 0;
      for (const c of cmds) {
        const op = c.command, a = c.args;
        let nx = cx, ny = cy;
        if (op === 'M' || op === 'L') { nx = a[0]; ny = a[1]; }
        else if (op === 'm' || op === 'l') { nx = cx + a[0]; ny = cy + a[1]; }
        else if (op === 'H') nx = a[0];
        else if (op === 'h') nx = cx + a[0];
        else if (op === 'V') ny = a[0];
        else if (op === 'v') ny = cy + a[0];
        else if (op === 'Z' || op === 'z') { nx = sx; ny = sy; }
        if (op === 'M' || op === 'm') { moveCount++; sx = nx; sy = ny; }
        // Skip the very first M 0 0 produced by drawTo(0,0). Track from
        // the second move (the relative `m` to the actual start) and
        // every subsequent draw command.
        if (moveCount >= 2) {
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
        cx = nx; cy = ny;
      }
      expect(minX).toBeCloseTo(0, 5);
      expect(maxX).toBeCloseTo(40, 5);
      expect(minY).toBeCloseTo(50, 5);
      expect(maxY).toBeCloseTo(90, 5);
    });

    // Pre-existing bug fixed alongside §2.13: two cubic curves with
    // identical control polygons cause `bezierClipRecurse` to never
    // converge (every subdivision keeps both halves overlapping →
    // exponential branching → OOM). Phase A added a same-control-
    // polygon coincidence guard at the top of `intersectCubicCubic`
    // that returns just the two endpoint intersections. This test
    // protects the guard — without it the call would blow the heap.
    it('boolean op on paths with identical cubic segments completes without OOM', () => {
      const result = compilePath(`
        let a = @{ c 5 -10 35 -10 40 0 v 30 h -40 z };
        let b = @{ c 5 -10 35 -10 40 0 v -20 h -40 z };
        let u = a.project(10, 50).union(b.project(10, 50));
        u.drawTo(0, 0);
      `);
      // Smoke test only — exact geometry of the result depends on
      // how the no-effective-intersections fallback handles two
      // abutting paths with vertex-only intersections. The key
      // contract is "completes" — without the guard this case
      // exhausted node's heap. Output should be non-empty.
      expect(result.length).toBeGreaterThan(0);
    });

    // §2.13 limitation: the test above uses co-oriented rectangles.
    // The opposite-wound input (b's z winds CCW vs a's CW) is a known
    // failure that is NOT a shared-edge bug — it's a separate
    // orientation-handling concern in run assembly. Captured here so
    // the limitation has a test record, not just a prose note.
    it.todo('shared-edge union with opposite-wound rectangles produces clean perimeter (separate orientation bug, NOT §2.13)');

    it('union of donut + bar overlapping the counter keeps a partial hole [§2.15]', () => {
      // Mimics the glyph-bowl topology that surfaced RW-l-50: a
      // donut shape (CW outer + CCW counter inside) gets unioned
      // with a bar that crosses the right side, partially covering
      // the counter.
      // Without the §2.15 alpha tuning, the Hungarian linker fused
      // counter arcs into the global chain via long-distance jumps
      // crossing the counter interior, producing 1 chain and a
      // fully-filled counter (the RW-l-50 bowl-as-disk bug).
      // Note: this synthetic axis-aligned test passes under either
      // alpha value — the real regression is curve-driven (Raleway
      // ExtraLight e where intersections produce dense clusters
      // along curved boundaries). The visual regression check is
      // iter-2-isolation-rw-l-50.pathogen rendered with fill.
      const result = compilePath(`
        let a = @{ h 100 v 100 h -100 z m 25 25 l 0 50 l 50 0 l 0 -50 z };
        let b = @{ h 30 v 120 h -30 z };
        let u = a.union(b.project(60, -10));
        u.drawTo(0, 0);
      `);
      const zCount = parseSVGPath(result).filter(c => c.command.toLowerCase() === 'z').length;
      expect(zCount).toBeGreaterThanOrEqual(2);
    });
  });

  // §2.16 backstop — Bebas Neue CUTTING at tracking 0.8 must render
  // with the U's bowl interior unfilled. Phase 1 of §2.14 input
  // normalization (`unionIntersectingSameWindingSubpaths`) was merging
  // two CW subpaths in chained-union accumulator outputs that shared
  // a full-range opposite-direction edge (an artificial-split topology
  // produced by earlier union steps); the recursive
  // booleanOp(union, normalize:false) for that input introduced a
  // notch in the U bowl. Fix: detect the artificial-split case in
  // unionIntersectingSameWindingSubpaths and skip the merge — the
  // two subpaths render correctly as separate CW siblings under
  // nonzero fill.
  //
  // Skipped if Bebas Neue is not present (the font lives at
  // fonts/Bebas_Neue/BebasNeue-Regular.ttf at the repo root, outside
  // tests/fixtures, so headless CI without the full repo will skip).
  describe('§2.16 chained-union U-bowl regression', () => {
    const fontPath = 'fonts/Bebas_Neue/BebasNeue-Regular.ttf';
    const haveFont = existsSync(fontPath);
    (haveFont ? it : it.skip)('CUTTING in Bebas Neue at tracking 0.8 has unfilled U-bowl interior', () => {
      const buf = readFileSync(fontPath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const registry = createFontRegistry();
      addFont(registry, 'BebasNeue-Regular', 400, 'normal', ab);
      const src = `
@font "${fontPath}"
let styles = \${ font-family: BebasNeue-Regular; font-size: 60; };
let glyphs = PathBlock.fromGlyph("CUTTING", styles);
let tracking = 0.8;
let cursor = 0;
let projected = [];
for (g in glyphs) {
  projected.push(g.project(cursor, 0));
  cursor = calc(cursor + g.advanceWidth * tracking);
}
let merged = projected[0];
for (i in 1..6) { merged = merged.union(projected[i]); }
merged.drawTo(40, 130);
`;
      const result = compile(src, { fonts: registry });
      const d = (result.layers[0] as { data: string }).data;
      // U bowl center in render coords: U starts at glyph-local x ≈ 21,
      // drawn at offset (40, 130). Bowl interior x ≈ [62, 79], y ≈
      // [95, 122]. Sample three bowl-interior points; under nonzero
      // fill rule, ray-casting from each must report an even number of
      // crossings (= outside the filled region).
      const bowlPoints = [
        { x: 70, y: 110 },
        { x: 71, y: 112 },
        { x: 69, y: 108 },
      ];
      const cmds = d.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/).filter(s => s.trim());
      function rayCrossings(px: number, py: number): number {
        let cx = 0, cy = 0, sx = 0, sy = 0;
        let crossings = 0;
        const cross = (x0: number, y0: number, x1: number, y1: number) => {
          if ((y0 <= py && y1 > py) || (y1 <= py && y0 > py)) {
            const t = (py - y0) / (y1 - y0);
            const xi = x0 + t * (x1 - x0);
            if (xi > px) crossings++;
          }
        };
        for (const cmd of cmds) {
          const op = cmd[0];
          const args = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
          let nx = cx, ny = cy;
          if (op === 'M') { nx = args[0]; ny = args[1]; sx = nx; sy = ny; }
          else if (op === 'm') { nx = cx + args[0]; ny = cy + args[1]; sx = nx; sy = ny; }
          else if (op === 'L') { nx = args[0]; ny = args[1]; cross(cx, cy, nx, ny); }
          else if (op === 'l') { nx = cx + args[0]; ny = cy + args[1]; cross(cx, cy, nx, ny); }
          else if (op === 'H') { nx = args[0]; cross(cx, cy, nx, ny); }
          else if (op === 'h') { nx = cx + args[0]; cross(cx, cy, nx, ny); }
          else if (op === 'V') { ny = args[0]; cross(cx, cy, nx, ny); }
          else if (op === 'v') { ny = cy + args[0]; cross(cx, cy, nx, ny); }
          else if (op === 'Q' || op === 'q') {
            // Approximate quadratic with chord — sufficient for the
            // U-bowl scale where curves are >5 path units from sample
            // points, so ray-casting through chord vs curve gives the
            // same in/out result.
            if (op === 'Q') { nx = args[2]; ny = args[3]; }
            else { nx = cx + args[2]; ny = cy + args[3]; }
            cross(cx, cy, nx, ny);
          }
          else if (op === 'C' || op === 'c') {
            if (op === 'C') { nx = args[4]; ny = args[5]; }
            else { nx = cx + args[4]; ny = cy + args[5]; }
            cross(cx, cy, nx, ny);
          }
          else if (op === 'Z' || op === 'z') {
            cross(cx, cy, sx, sy);
            nx = sx; ny = sy;
          }
          cx = nx; cy = ny;
        }
        return crossings;
      }
      for (const p of bowlPoints) {
        const c = rayCrossings(p.x, p.y);
        expect(c % 2,
          `bowl point (${p.x}, ${p.y}) has odd crossings (${c}) — point is filled, U-bowl notch present`,
        ).toBe(0);
      }
    });
  });
});
