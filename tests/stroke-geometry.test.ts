import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

/**
 * Tests for PathBlock stroke geometry: dash(styles), outline(styles),
 * startAt(t) — turning stroke styling concepts into real path geometry.
 *
 * Contracts under test (docs/path-blocks.md "Stroke Geometry"):
 * - dash() partitions into alternating dash/gap pieces that keep their
 *   subject-local placement (origin {0,0} — the cut() convention), so
 *   drawing every piece at one anchor reassembles the source.
 * - outline() returns a CLOSED path (boolean-ready) straddling the
 *   source centerline.
 * - startAt() re-anchors a path at an arc-length fraction: seamless on
 *   closed paths, two-run (with a jump) on open ones.
 */

/** Compile and return both the default layer path and stringified log lines. */
function compileWithLogs(source: string): { path: string; logs: string[] } {
  const result = compile(source);
  const logs = result.logs.map((entry) => entry.parts.map((p) => String(p.value)).join(''));
  return { path: result.layers[0]?.data ?? '', logs };
}

function zCount(d: string): number {
  return (d.match(/z/gi) || []).length;
}

const num = (s: string): number => parseFloat(s);

describe('PathBlock.dash()', () => {
  describe('basic partitioning', () => {
    it('splits a line into alternating dash/gap pieces of the given lengths', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[1].kind);
        log(pieces[0].path.length);
        log(pieces[9].kind);
      `);
      expect(logs[0]).toBe('10');
      expect(logs[1]).toBe('dash');
      expect(logs[2]).toBe('gap');
      expect(num(logs[3])).toBeCloseTo(10, 5);
      expect(logs[4]).toBe('gap');
    });

    it('reports t0/t1 as arc-length fractions covering the path contiguously', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; });
        log(pieces[0].t0);
        log(pieces[0].t1);
        log(pieces[3].t0);
        log(pieces[3].t1);
        log(pieces[9].t1);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 6);
      expect(num(logs[1])).toBeCloseTo(0.1, 6);
      expect(num(logs[2])).toBeCloseTo(0.3, 6);
      expect(num(logs[3])).toBeCloseTo(0.4, 6);
      expect(num(logs[4])).toBeCloseTo(1, 6);
    });

    it('doubles an odd-count dash array (SVG rule)', () => {
      // "25" behaves as "25 25": 100 / 25 = 4 pieces
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 25; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[1].kind);
        log(pieces[1].path.length);
      `);
      expect(logs[0]).toBe('4');
      expect(logs[1]).toBe('dash');
      expect(logs[2]).toBe('gap');
      expect(num(logs[3])).toBeCloseTo(25, 5);
    });

    it('resolves percentage entries against total path length', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 25% 25%; });
        log(pieces.length);
        log(pieces[0].path.length);
      `);
      expect(logs[0]).toBe('4');
      expect(num(logs[1])).toBeCloseTo(25, 5);
    });

    it('returns the whole path as one dash when every entry is zero', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 0 0; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[0].t0);
        log(pieces[0].t1);
      `);
      expect(logs[0]).toBe('1');
      expect(logs[1]).toBe('dash');
      expect(num(logs[2])).toBeCloseTo(0, 6);
      expect(num(logs[3])).toBeCloseTo(1, 6);
    });
  });

  describe('stroke-dashoffset', () => {
    it('advances the pattern start (partial leading dash)', () => {
      // offset 5 into "10 10": leading dash of 5, then full gaps/dashes, trailing dash of 5
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; stroke-dashoffset: 5; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[0].path.length);
        log(pieces[10].kind);
        log(pieces[10].path.length);
      `);
      expect(logs[0]).toBe('11');
      expect(logs[1]).toBe('dash');
      expect(num(logs[2])).toBeCloseTo(5, 5);
      expect(logs[3]).toBe('dash');
      expect(num(logs[4])).toBeCloseTo(5, 5);
    });

    it('wraps negative offsets modulo the pattern length', () => {
      // -5 ≡ 15 into "10 10": starts 5 units into the gap entry
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; stroke-dashoffset: -5; });
        log(pieces[0].kind);
        log(pieces[0].path.length);
        log(pieces[1].kind);
        log(pieces[1].path.length);
      `);
      expect(logs[0]).toBe('gap');
      expect(num(logs[1])).toBeCloseTo(5, 5);
      expect(logs[2]).toBe('dash');
      expect(num(logs[3])).toBeCloseTo(10, 5);
    });

    it('accepts a percentage offset resolved against total path length', () => {
      // 10% of 100 = 10 → boundary lands exactly on the first dash end
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; stroke-dashoffset: 10%; });
        log(pieces[0].kind);
        log(pieces[0].path.length);
      `);
      expect(logs[0]).toBe('gap');
      expect(num(logs[1])).toBeCloseTo(10, 5);
    });
  });

  describe('placement (the cut() convention)', () => {
    it('pieces keep subject-local placement across commands and corners', () => {
      // Square perimeter 400; dash [200,300] starts at corner (100,100)
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let pieces = p.dash(#{ stroke-dasharray: 100 100; });
        log(pieces.length);
        log(pieces[2].kind);
        log(pieces[2].path.startPoint.x);
        log(pieces[2].path.startPoint.y);
        log(pieces[2].path.endPoint.x);
        log(pieces[2].path.endPoint.y);
      `);
      expect(logs[0]).toBe('4');
      expect(logs[1]).toBe('dash');
      expect(num(logs[2])).toBeCloseTo(100, 4);
      expect(num(logs[3])).toBeCloseTo(100, 4);
      expect(num(logs[4])).toBeCloseTo(0, 4);
      expect(num(logs[5])).toBeCloseTo(100, 4);
    });

    it('drawing every piece at one anchor reassembles the source geometry', () => {
      const { path, logs } = compileWithLogs(`
        let p = @{ h 60 v 40 };
        let pieces = p.dash(#{ stroke-dasharray: 30 20; });
        let total = 0;
        for ([piece, i] in pieces) {
          total = calc(total + piece.path.length);
          M 0 0
          piece.path.draw();
        }
        log(total);
      `);
      expect(num(logs[0])).toBeCloseTo(100, 4);
      expect(path).not.toMatch(/NaN|Infinity/);
    });

    it('piece boundaries are contiguous: t1[i] == t0[i+1]', () => {
      const { logs } = compileWithLogs(`
        let p = @{ c 0 -40 50 -40 50 0 h 30 };
        let pieces = p.dash(#{ stroke-dasharray: 7 5; });
        let contiguous = true;
        let last = calc(pieces.length - 1);
        for (i in 1..last) {
          if (calc(abs(pieces[i].t0 - pieces[calc(i - 1)].t1)) > 0.000001) {
            contiguous = false;
          }
        }
        log(contiguous);
        log(pieces[0].t0);
        log(pieces[calc(pieces.length - 1)].t1);
      `);
      expect(logs[0]).toBe('true');
      expect(num(logs[1])).toBeCloseTo(0, 6);
      expect(num(logs[2])).toBeCloseTo(1, 6);
    });
  });

  describe('multi-subpath sources', () => {
    it('restarts the pattern at each subpath (SVG behavior)', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 30 m 10 0 h 30 };
        let pieces = p.dash(#{ stroke-dasharray: 10 10; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[3].kind);
        log(pieces[3].path.startPoint.x);
      `);
      // Each 30-long subpath: dash, gap, dash → 6 pieces; piece 3 restarts
      // as a dash at the second subpath's start x = 40.
      expect(logs[0]).toBe('6');
      expect(logs[1]).toBe('dash');
      expect(logs[2]).toBe('dash');
      expect(num(logs[3])).toBeCloseTo(40, 4);
    });

    it('resolves % against the combined length of all subpaths', () => {
      // Total length 60 → 50% = 30 = each subpath exactly one dash
      const { logs } = compileWithLogs(`
        let p = @{ h 30 m 10 0 h 30 };
        let pieces = p.dash(#{ stroke-dasharray: 50%; });
        log(pieces.length);
        log(pieces[0].kind);
        log(pieces[1].kind);
      `);
      expect(logs[0]).toBe('2');
      expect(logs[1]).toBe('dash');
      expect(logs[2]).toBe('dash');
    });
  });

  describe('argument validation', () => {
    it('requires a style block argument', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(5);
      `)).toThrow(/style block/);
    });

    it('requires stroke-dasharray', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(#{ stroke-dashoffset: 5; });
      `)).toThrow(/stroke-dasharray/);
    });

    it('rejects negative dash array entries', () => {
      // Comma-separated: a space-separated "10 -5" parses as the arithmetic
      // expression 10 - 5 (style values are live expressions).
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(#{ stroke-dasharray: 10, -5; });
      `)).toThrow(/negative/i);
    });

    it('rejects non-numeric dash array entries', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(#{ stroke-dasharray: 10 wide; });
      `)).toThrow(/stroke-dasharray/);
    });

    it('rejects stroke-width with a hint pointing at outline()', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(#{ stroke-dasharray: 10 10; stroke-width: 4; });
      `)).toThrow(/outline\(\)/);
    });

    it('rejects unrelated style properties', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.dash(#{ stroke-dasharray: 10 10; fill: red; });
      `)).toThrow(/fill/);
    });

    it('rejects patterns that explode into absurd piece counts', () => {
      expect(() => compilePath(`
        let p = @{ h 10000 };
        p.dash(#{ stroke-dasharray: 0.001, 0.001; });
      `)).toThrow(/pieces/);
    });
  });

  describe('dash-seam', () => {
    // Square perimeter 400, pattern "80 40" (cycle 120): the walk ends with
    // a 40-long dash truncated at the seam, and the path begins with an
    // 80-long dash — the mergeable configuration.
    const seamSrc = (extra: string): string => `
      let p = @{ h 100 v 100 h -100 z };
      let pieces = p.dash(#{ stroke-dasharray: 80 40; ${extra} });
      log(pieces.length);
    `;

    it('defaults to split (trailing and leading dashes stay separate)', () => {
      const { logs } = compileWithLogs(seamSrc(''));
      expect(logs[0]).toBe('7');
    });

    it('dash-seam: split is the explicit default', () => {
      const { logs } = compileWithLogs(seamSrc('dash-seam: split;'));
      expect(logs[0]).toBe('7');
    });

    it('dash-seam: merge joins the seam-crossing dash into one piece', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let pieces = p.dash(#{ stroke-dasharray: 80 40; dash-seam: merge; });
        let last = pieces[calc(pieces.length - 1)];
        log(pieces.length);
        log(last.kind);
        log(last.path.length);
        log(last.t0);
        log(last.t1);
        log(last.path.startPoint.y);
        log(last.path.endPoint.x);
      `);
      expect(logs[0]).toBe('6');
      expect(logs[1]).toBe('dash');
      expect(num(logs[2])).toBeCloseTo(120, 3); // 40 before the seam + 80 after
      expect(num(logs[3])).toBeCloseTo(0.9, 6);
      expect(num(logs[4])).toBeCloseTo(1.2, 6); // t1 > 1 signals the wrap
      expect(num(logs[5])).toBeCloseTo(40, 3); // starts at (0, 40) on the closing edge
      expect(num(logs[6])).toBeCloseTo(80, 3); // ends at (80, 0) past the seam
    });

    it('does not merge when the pattern ends in a gap at the seam', () => {
      // Cycle 100 divides the perimeter exactly: last piece is a gap
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let pieces = p.dash(#{ stroke-dasharray: 60 40; dash-seam: merge; });
        log(pieces.length);
        log(pieces[calc(pieces.length - 1)].kind);
      `);
      expect(logs[0]).toBe('8');
      expect(logs[1]).toBe('gap');
    });

    it('is a no-op on open paths', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let pieces = p.dash(#{ stroke-dasharray: 30 20; dash-seam: merge; });
        log(pieces.length);
        log(pieces[0].t0);
      `);
      expect(logs[0]).toBe('4');
      expect(num(logs[1])).toBeCloseTo(0, 6);
    });

    it('rejects invalid values', () => {
      expect(() => compilePath(`
        let p = @{ h 100 v 100 h -100 z };
        p.dash(#{ stroke-dasharray: 80 40; dash-seam: fancy; });
      `)).toThrow(/dash-seam/);
    });
  });

  describe('percent literals in style blocks (scoping)', () => {
    it('preserves % only for the dash-pattern properties', () => {
      const result = compile(`
        let l = PathLayer('a') #{ fill: red; stroke-dasharray: 50%; };
        l.apply { M 0 0 h 10 }
      `);
      expect(result.layers.find((x) => x.name === 'a')!.styles['stroke-dasharray']).toBe('50%');
    });

    it('still bakes % to a fraction for every other property', () => {
      // The historical behavior — a regression here would change SVG output
      // for all existing percent-valued styles (opacity, etc.)
      const result = compile(`
        let l = PathLayer('a') #{ fill: red; fill-opacity: 50%; opacity: 60%; };
        l.apply { M 0 0 h 10 }
      `);
      const styles = result.layers.find((x) => x.name === 'a')!.styles;
      expect(styles['fill-opacity']).toBe('0.5');
      expect(styles['opacity']).toBe('0.6');
    });
  });
});

describe('PathBlock.outline()', () => {
  describe('open paths', () => {
    it('butt caps: closed outline hugging the segment ends', () => {
      const { path, logs } = compileWithLogs(`
        let p = @{ h 100 };
        let solid = p.outline(#{ stroke-width: 10; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.y); log(bb.width); log(bb.height);
        M 0 50
        solid.draw();
      `);
      expect(num(logs[0])).toBeCloseTo(0, 3);
      expect(num(logs[1])).toBeCloseTo(-5, 3);
      expect(num(logs[2])).toBeCloseTo(100, 3);
      expect(num(logs[3])).toBeCloseTo(10, 3);
      expect(path).toClosePath();
      expect(zCount(path)).toBe(1);
    });

    it('round caps extend half the stroke width past each end', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let solid = p.outline(#{ stroke-width: 10; stroke-linecap: round; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.width); log(bb.height);
      `);
      expect(num(logs[0])).toBeCloseTo(-5, 2);
      expect(num(logs[1])).toBeCloseTo(110, 2);
      expect(num(logs[2])).toBeCloseTo(10, 2);
    });

    it('square caps extend half the stroke width past each end', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let solid = p.outline(#{ stroke-width: 10; stroke-linecap: square; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.width);
      `);
      expect(num(logs[0])).toBeCloseTo(-5, 3);
      expect(num(logs[1])).toBeCloseTo(110, 3);
    });

    it('straddles the source centerline (placement invariant)', () => {
      // Vertical segment from (20, 30): outline spans x in [15, 25]
      const { logs } = compileWithLogs(`
        let p = @{ m 20 30 v 50 };
        let solid = p.outline(#{ stroke-width: 10; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.y); log(bb.width); log(bb.height);
      `);
      expect(num(logs[0])).toBeCloseTo(15, 3);
      expect(num(logs[1])).toBeCloseTo(30, 3);
      expect(num(logs[2])).toBeCloseTo(10, 3);
      expect(num(logs[3])).toBeCloseTo(50, 3);
    });
  });

  describe('joins', () => {
    it('right-angle miter join reaches the outer corner', () => {
      // Spine (0,0)→(50,0)→(50,50), width 10: outer corner at (55,-5), bevel-free
      const { logs } = compileWithLogs(`
        let p = @{ h 50 v 50 };
        let solid = p.outline(#{ stroke-width: 10; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.y); log(bb.width); log(bb.height);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 2);
      expect(num(logs[1])).toBeCloseTo(-5, 2);
      expect(num(logs[2])).toBeCloseTo(55, 2);
      expect(num(logs[3])).toBeCloseTo(55, 2);
    });

    it('miterlimit clips sharp spikes; a raised limit keeps them', () => {
      // Near-reversing turn: miter ratio ≈ 8 — over the SVG default of 4
      const src = (styles: string): string => `
        let p = @{ h 50 l -40 10 };
        let solid = p.outline(#{ ${styles} });
        let bb = solid.boundingBox();
        log(bb.width);
      `;
      const clipped = num(compileWithLogs(src('stroke-width: 10;')).logs[0]);
      const spiked = num(compileWithLogs(src('stroke-width: 10; stroke-miterlimit: 12;')).logs[0]);
      expect(spiked).toBeGreaterThan(clipped + 10);
      expect(clipped).toBeLessThan(75);
    });

    it('round join emits an arc connector at the corner', () => {
      const { path } = compileWithLogs(`
        let p = @{ h 50 v 50 };
        let solid = p.outline(#{ stroke-width: 10; stroke-linejoin: round; });
        M 0 0
        solid.draw();
      `);
      expect(path).toMatch(/a/i);
      expect(path).toClosePath();
    });
  });

  describe('closed paths', () => {
    it('produces two concentric rings (outer and inner stroke edges)', () => {
      const { path, logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let solid = p.outline(#{ stroke-width: 10; });
        let bb = solid.boundingBox();
        log(bb.x); log(bb.y); log(bb.width); log(bb.height);
        M 0 0
        solid.draw();
      `);
      expect(num(logs[0])).toBeCloseTo(-5, 2);
      expect(num(logs[1])).toBeCloseTo(-5, 2);
      expect(num(logs[2])).toBeCloseTo(110, 2);
      expect(num(logs[3])).toBeCloseTo(110, 2);
      expect(zCount(path)).toBe(2);
    });
  });

  describe('degenerate spines', () => {
    it('a near-zero spine with round caps outlines to a dot', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 0.001 };
        let dot = p.outline(#{ stroke-width: 10; stroke-linecap: round; });
        let bb = dot.boundingBox();
        log(bb.width); log(bb.height);
      `);
      expect(num(logs[0])).toBeCloseTo(10, 1);
      expect(num(logs[1])).toBeCloseTo(10, 1);
    });

    it('a near-zero spine with butt caps produces no visible area', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 0.001 };
        let ghost = p.outline(#{ stroke-width: 10; });
        let bb = ghost.boundingBox();
        log(bb.width);
      `);
      // A hairline sliver at most: the outline never grows past the spine
      expect(num(logs[0])).toBeLessThan(0.01);
    });
  });

  describe('boolean composability', () => {
    it('outlines participate in union (closed-path requirement satisfied)', () => {
      const { path } = compileWithLogs(`
        let stem = @{ h 60 };
        let solid = stem.outline(#{ stroke-width: 10; });
        let box = @{ m 20 -20 h 20 v 40 h -20 z };
        let merged = solid.union(box);
        M 0 0
        merged.draw();
      `);
      expect(path).toClosePath();
      expect(path).not.toMatch(/NaN|Infinity/);
    });

    it('fat dashes cut holes via difference', () => {
      const { path } = compileWithLogs(`
        let plate = @{ h 120 v 80 h -120 z };
        let wave = @{ m 10 40 h 100 };
        let pieces = wave.dash(#{ stroke-dasharray: 20 20; });
        let slot = pieces[1].path.outline(#{ stroke-width: 10; });
        let plaque = plate.difference(slot);
        M 0 0
        plaque.draw();
      `);
      expect(zCount(path)).toBeGreaterThanOrEqual(2);
      expect(path).not.toMatch(/NaN|Infinity/);
    });
  });

  describe('argument validation', () => {
    it('requires a style block argument', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(10);
      `)).toThrow(/style block/);
    });

    it('requires stroke-width', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-linecap: round; });
      `)).toThrow(/stroke-width/);
    });

    it('rejects non-positive stroke-width', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-width: 0; });
      `)).toThrow(/positive/);
    });

    it('rejects invalid linecap values', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-width: 10; stroke-linecap: fancy; });
      `)).toThrow(/stroke-linecap/);
    });

    it('rejects stroke-miterlimit with a non-miter join', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-width: 10; stroke-linejoin: round; stroke-miterlimit: 8; });
      `)).toThrow(/miter/);
    });

    it('rejects stroke-dasharray with a hint pointing at dash()', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-width: 10; stroke-dasharray: 4 2; });
      `)).toThrow(/dash\(\)/);
    });
  });

  describe('outline-overlap', () => {
    // Two crossing strokes: raw outlining gives two separate closed
    // contours; union dissolves them into one boundary.
    const crossSrc = (extra: string): string => `
      let p = @{ h 60 m -40 -20 v 40 };
      let solid = p.outline(#{ stroke-width: 8; ${extra} });
      M 0 0
      solid.draw();
    `;

    it('defaults to raw contours (one per stroke)', () => {
      const { path } = compileWithLogs(crossSrc(''));
      expect(zCount(path)).toBe(2);
    });

    it('outline-overlap: raw is the explicit default', () => {
      const { path } = compileWithLogs(crossSrc('outline-overlap: raw;'));
      expect(zCount(path)).toBe(2);
    });

    it('outline-overlap: union dissolves overlapping contours into one boundary', () => {
      const { path } = compileWithLogs(crossSrc('outline-overlap: union;'));
      expect(zCount(path)).toBe(1);
      expect(path).toClosePath();
      expect(path).not.toMatch(/NaN|Infinity/);
    });

    it('union output still participates in boolean operations', () => {
      const { path } = compileWithLogs(`
        let p = @{ h 60 m -40 -20 v 40 };
        let solid = p.outline(#{ stroke-width: 8; outline-overlap: union; });
        let box = @{ m -10 -30 h 90 v 60 h -90 z };
        let merged = box.difference(solid);
        M 0 0
        merged.draw();
      `);
      expect(path).toClosePath();
      expect(path).not.toMatch(/NaN|Infinity/);
    });

    it('rejects invalid values', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.outline(#{ stroke-width: 8; outline-overlap: fancy; });
      `)).toThrow(/outline-overlap/);
    });
  });
});

describe('PathBlock.startAt()', () => {
  describe('closed paths (seamless)', () => {
    it('re-anchors a square at 25% — the next corner', () => {
      const { path, logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let rotated = p.startAt(0.25);
        log(rotated.startPoint.x);
        log(rotated.startPoint.y);
        log(rotated.length);
        M 0 0
        rotated.draw();
      `);
      expect(num(logs[0])).toBeCloseTo(100, 3);
      expect(num(logs[1])).toBeCloseTo(0, 3);
      expect(num(logs[2])).toBeCloseTo(400, 2);
      expect(path).toClosePath();
      expect(zCount(path)).toBe(1);
    });

    it('accepts percent literals: startAt(25%) == startAt(0.25)', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        log(p.startAt(25%).startPoint.x);
        log(p.startAt(0.25).startPoint.x);
      `);
      expect(num(logs[0])).toBeCloseTo(num(logs[1]), 6);
    });

    it('wraps t outside 0..1', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        log(p.startAt(1.25).startPoint.x);
        log(p.startAt(-0.75).startPoint.x);
      `);
      expect(num(logs[0])).toBeCloseTo(100, 3);
      expect(num(logs[1])).toBeCloseTo(100, 3);
    });

    it('preserves overall geometry (bounding box unchanged)', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let bb = p.startAt(0.4).boundingBox();
        log(bb.x); log(bb.y); log(bb.width); log(bb.height);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 2);
      expect(num(logs[1])).toBeCloseTo(0, 2);
      expect(num(logs[2])).toBeCloseTo(100, 2);
      expect(num(logs[3])).toBeCloseTo(100, 2);
    });

    it('startAt(0) returns an equivalent path', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let same = p.startAt(0);
        log(same.startPoint.x);
        log(same.length);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 3);
      expect(num(logs[1])).toBeCloseTo(400, 2);
    });
  });

  describe('open paths (two runs)', () => {
    it('draws t→end first, then jumps back for the remainder', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let shifted = p.startAt(0.25);
        log(shifted.startPoint.x);
        log(shifted.endPoint.x);
        log(shifted.length);
      `);
      expect(num(logs[0])).toBeCloseTo(25, 3);
      expect(num(logs[1])).toBeCloseTo(25, 3);
      expect(num(logs[2])).toBeCloseTo(100, 2);
    });

    it('keeps both runs in original placement', () => {
      const { logs } = compileWithLogs(`
        let p = @{ h 100 };
        let bb = p.startAt(0.25).boundingBox();
        log(bb.x); log(bb.width);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 3);
      expect(num(logs[1])).toBeCloseTo(100, 3);
    });
  });

  describe('composition with dash()', () => {
    it('slides a dash pattern around a closed loop', () => {
      // Rotating the start by half a dash entry shifts every boundary
      const { logs } = compileWithLogs(`
        let p = @{ h 100 v 100 h -100 z };
        let plain = p.dash(#{ stroke-dasharray: 100 100; });
        let slid = p.startAt(0.125).dash(#{ stroke-dasharray: 100 100; });
        log(plain[0].path.startPoint.x);
        log(slid[0].path.startPoint.x);
        log(slid[0].path.startPoint.y);
      `);
      expect(num(logs[0])).toBeCloseTo(0, 3);
      // 12.5% around the 400 perimeter = (50, 0)
      expect(num(logs[1])).toBeCloseTo(50, 3);
      expect(num(logs[2])).toBeCloseTo(0, 3);
    });
  });

  describe('argument validation', () => {
    it('requires a numeric argument', () => {
      expect(() => compilePath(`
        let p = @{ h 100 };
        p.startAt('quarter');
      `)).toThrow(/number/);
    });

    it('rejects multi-subpath sources', () => {
      expect(() => compilePath(`
        let p = @{ h 30 m 10 0 h 30 };
        p.startAt(0.5);
      `)).toThrow(/subpath/i);
    });
  });
});

describe('ProjectedPath receivers', () => {
  it('dash() pieces come back as ProjectedPaths in absolute coordinates', () => {
    const { logs } = compileWithLogs(`
      let p = @{ h 100 };
      let proj = p.project(10, 20);
      let pieces = proj.dash(#{ stroke-dasharray: 25 25; });
      log(pieces.length);
      log(pieces[2].path.startPoint.x);
      log(pieces[2].path.startPoint.y);
    `);
    expect(logs[0]).toBe('4');
    expect(num(logs[1])).toBeCloseTo(60, 3);
    expect(num(logs[2])).toBeCloseTo(20, 3);
  });

  it('outline() on a ProjectedPath stays in absolute coordinates', () => {
    const { logs } = compileWithLogs(`
      let p = @{ h 100 };
      let proj = p.project(10, 20);
      let solid = proj.outline(#{ stroke-width: 10; });
      let bb = solid.boundingBox();
      log(bb.x); log(bb.y);
    `);
    expect(num(logs[0])).toBeCloseTo(10, 3);
    expect(num(logs[1])).toBeCloseTo(15, 3);
  });

  it('startAt() on a ProjectedPath re-anchors in absolute coordinates', () => {
    const { logs } = compileWithLogs(`
      let p = @{ h 100 v 100 h -100 z };
      let proj = p.project(10, 20);
      let rotated = proj.startAt(0.25);
      log(rotated.startPoint.x);
      log(rotated.startPoint.y);
    `);
    expect(num(logs[0])).toBeCloseTo(110, 3);
    expect(num(logs[1])).toBeCloseTo(20, 3);
  });
});
