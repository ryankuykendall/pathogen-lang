import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { bridgeSeamLabel } from '../src/evaluator/boolean-ops';
import { compilePath } from './helpers';

/**
 * Tests for PathBlock.cut(cutter) — slicing a subject path with open (or
 * closed) cutter strokes, returning an array of healed pieces.
 *
 * Piece order is deterministic but unspecified, so assertions sort derived
 * values (bbox coordinates, subpath counts) rather than assuming which
 * index is which.
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

describe('PathBlock.cut()', () => {
  describe('closed subjects', () => {
    it('slices a rectangle in two with a vertical line (rotation-sign lock)', () => {
      // Box (0,0)-(60,40), knife x=30 from y=-10 to y=50: full crossing.
      const { path, logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 30 -10 l 0 60 };
        let pieces = box.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          let bb = piece.boundingBox();
          log(bb.x);
          log(bb.width);
          log(bb.height);
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('2');
      // Two pieces: (0,0)-(30,40) and (30,0)-(60,40).
      const xs = [Number(logs[1]), Number(logs[4])].sort((a, b) => a - b);
      const widths = [Number(logs[2]), Number(logs[5])];
      const heights = [Number(logs[3]), Number(logs[6])];
      expect(xs[0]).toBeCloseTo(0, 4);
      expect(xs[1]).toBeCloseTo(30, 4);
      expect(widths[0]).toBeCloseTo(30, 4);
      expect(widths[1]).toBeCloseTo(30, 4);
      expect(heights[0]).toBeCloseTo(40, 4);
      expect(heights[1]).toBeCloseTo(40, 4);
      // Both pieces healed shut.
      expect(zCount(path)).toBe(2);
      expect(path).toClosePath();
    });

    it('handles a reverse-wound (CCW-drawn) subject identically', () => {
      const { logs } = compileWithLogs(`
        let box = @{ v 40 h 60 v -40 h -60 z };
        let knife = @{ m 30 -10 l 0 60 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('2');
    });

    it('cuts a circle with a line, preserving arc commands', () => {
      // circle(20) at block origin; horizontal knife through the center.
      const { path, logs } = compileWithLogs(`
        let disc = @{ circle(0, 0, 20); };
        let knife = @{ m -30 0 l 60 0 };
        let pieces = disc.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          let bb = piece.boundingBox();
          log(bb.width);
          log(bb.height);
          piece.drawTo(50, 50);
        }
      `);
      expect(logs[0]).toBe('2');
      // Two half-discs: each 40 wide, 20 tall.
      expect(Number(logs[1])).toBeCloseTo(40, 3);
      expect(Number(logs[2])).toBeCloseTo(20, 3);
      expect(Number(logs[3])).toBeCloseTo(40, 3);
      expect(Number(logs[4])).toBeCloseTo(20, 3);
      // Curve-preserving: healed pieces keep their arcs.
      expect(path.toLowerCase()).toContain('a');
      expect(zCount(path)).toBe(2);
    });

    it('returns the original untouched when the cutter misses entirely', () => {
      const original = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        box.drawTo(0, 0);
      `);
      const { path, logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 200 200 l 10 0 };
        let pieces = box.cut(knife);
        log(pieces.length);
        pieces[0].drawTo(0, 0);
      `);
      expect(logs[0]).toBe('1');
      expect(path).toBe(original);
    });

    it('treats a grazing tangent as no cut', () => {
      // Line y=-20 touches circle(20) only at its top point (0,-20).
      const { logs } = compileWithLogs(`
        let disc = @{ circle(0, 0, 20); };
        let knife = @{ m -40 -20 l 80 0 };
        let pieces = disc.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('1');
    });
  });

  describe('endpoint tolerance (snap + ignore)', () => {
    it('completes a cut whose endpoint lands exactly on the boundary (T-junction)', () => {
      // Knife enters through the top edge, ends exactly at (30,40) on the bottom edge.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 30 -10 l 0 50 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('2');
    });

    it('snaps an endpoint just short of the boundary onto it', () => {
      // Ends at (30, 39.7) — 0.3 inside, within the snap tolerance.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 30 -10 l 0 49.7 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('2');
    });

    it('ignores a stab that dead-ends deep inside the shape', () => {
      // Ends at (30,20) — mid-shape; the stroke contributes nothing.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 30 -10 l 0 30 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('1');
    });

    it('cuts through a subject corner vertex', () => {
      // Diagonal through the (0,0) corner, exiting mid-bottom-edge at (40,40).
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m -10 -10 l 80 80 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('2');
    });

    it('treats a cutter collinear with an edge as no cut', () => {
      // Knife runs along the top edge (y=0), overhanging both ends.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m -10 0 l 80 0 };
        let pieces = box.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('1');
    });
  });

  describe('multi-contour subjects (holes and islands)', () => {
    it('cuts a donut crossing both contours into two C-shapes', () => {
      // Donut centered (50,50): outer r=30, hole r=12. Vertical knife x=50.
      const { path, logs } = compileWithLogs(`
        let big = @{ circle(0, 0, 30); };
        let small = @{ circle(0, 0, 12); };
        let donut = big.project(50, 50).difference(small.project(50, 50));
        let knife = @{ m 50 0 l 0 100 };
        let pieces = donut.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('2');
      // Each C-shape is a single closed contour: 2 z's total.
      expect(zCount(path)).toBe(2);
    });

    it('keeps a missed hole riding inside its piece', () => {
      // Vertical knife at x=30 crosses only the outer circle (hole spans x 38..62).
      const { path, logs } = compileWithLogs(`
        let big = @{ circle(0, 0, 30); };
        let small = @{ circle(0, 0, 12); };
        let donut = big.project(50, 50).difference(small.project(50, 50));
        let knife = @{ m 30 0 l 0 100 };
        let pieces = donut.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          log(piece.subPathCount);
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('2');
      // One lens piece (1 subpath) + the remainder carrying the hole (2 subpaths).
      const subpaths = [Number(logs[1]), Number(logs[2])].sort((a, b) => a - b);
      expect(subpaths).toEqual([1, 2]);
      expect(zCount(path)).toBe(3);
    });

    it('leaves an untouched island whole while cutting its neighbor', () => {
      const { logs } = compileWithLogs(`
        let islands = @{ h 20 v 20 h -20 z m 40 0 h 20 v 20 h -20 z };
        let knife = @{ m 10 -5 l 0 30 };
        let pieces = islands.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('3');
    });
  });

  describe('crossing and closed cutters', () => {
    it('quarters a region with two crossing strokes', () => {
      // Vertical x=30 and horizontal y=15, crossing inside the box.
      const { path, logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knives = @{ m 30 -10 l 0 60 m -45 -35 l 90 0 };
        let pieces = box.cut(knives);
        log(pieces.length);
        for ([piece, i] in pieces) {
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('4');
      expect(zCount(path)).toBe(4);
    });

    it('stamps with a closed cutter loop (cookie cutter)', () => {
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let stamp = @{ circle(0, 0, 10); };
        let pieces = box.cut(stamp.project(30, 20));
        log(pieces.length);
        for ([piece, i] in pieces) {
          log(piece.subPathCount);
        }
      `);
      expect(logs[0]).toBe('2');
      // The stamped-out disk (1 subpath) + the box with a hole (2 subpaths).
      const subpaths = [Number(logs[1]), Number(logs[2])].sort((a, b) => a - b);
      expect(subpaths).toEqual([1, 2]);
    });
  });

  describe('open subjects', () => {
    it('severs an open path at one crossing into two open fragments', () => {
      const { path, logs } = compileWithLogs(`
        let bent = @{ h 60 v 40 };
        let knife = @{ m 30 -10 l 0 20 };
        let pieces = bent.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('2');
      // Open fragments — no healing, no z anywhere.
      expect(zCount(path)).toBe(0);
    });

    it('splits an open path at two crossings into three fragments', () => {
      const { path, logs } = compileWithLogs(`
        let wire = @{ h 60 };
        let knives = @{ m 20 -10 l 0 20 m 20 -20 l 0 20 };
        let pieces = wire.cut(knives);
        log(pieces.length);
        for ([piece, i] in pieces) {
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('3');
      expect(zCount(path)).toBe(0);
    });
  });

  describe('drawing pieces', () => {
    it('supports exploded redraws of the pieces', () => {
      const { path, logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 30 -10 l 0 60 };
        let pieces = box.cut(knife);
        log(pieces.length);
        for ([piece, i] in pieces) {
          M calc(20 + i * 80) 20
          piece.draw();
        }
      `);
      expect(logs[0]).toBe('2');
      expect(zCount(path)).toBe(2);
      expect(path).not.toMatch(/NaN|Infinity/);
      expect(path).toClosePath();
    });
  });

  describe('argument validation', () => {
    it('requires exactly 1 argument', () => {
      expect(() => compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        box.cut();
      `)).toThrow(/expects 1 argument/);
    });

    it('requires a path argument', () => {
      expect(() => compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        box.cut(5);
      `)).toThrow(/must be a PathBlock or ProjectedPath/);
    });

    it('returns an empty array for an empty subject', () => {
      const { logs } = compileWithLogs(`
        let empty = @{ };
        let knife = @{ m 0 0 l 10 10 };
        let pieces = empty.cut(knife);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('0');
    });

    it('returns the original for a cutter with no draw commands', () => {
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let ghost = @{ m 5 5 };
        let pieces = box.cut(ghost);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('1');
    });
  });

  describe('density, scale, and composition', () => {
    it('decomposes a box into an exact grid under crossing knife sets', () => {
      // 3 vertical + 3 horizontal full-crossing knives → (3+1)² = 16 cells.
      const { logs } = compileWithLogs(`
        let box = @{ h 80 v 80 h -80 z };
        let knives = @{
          m 20 -10 l 0 100 m 20 -100 l 0 100 m 20 -100 l 0 100
          m -70 -75 l 100 0 m -100 20 l 100 0 m -100 20 l 100 0
        };
        let pieces = box.cut(knives);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('16');
    });

    it('slices a circle into sectors with many radial strokes through one point', () => {
      // 4 diameters through the center → 8 sectors; all strokes cross each
      // other at one shared node (stress for node clustering + arc subjects).
      const { logs } = compileWithLogs(`
        let disc = @{ circle(0, 0, 30); };
        let knives = @{
          m -40 0 l 80 0
          m -40 -40 l 0 80
          m -40 -80 l 80 80
          m -80 0 l 80 -80
        };
        let pieces = disc.cut(knives);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('8');
    });

    it('keeps distinct cuts distinct at tiny coordinate scales', () => {
      // 3×2 box with knives 0.3 apart — well inside the old absolute 0.5
      // node-merge radius, which used to swallow one cut.
      const { logs } = compileWithLogs(`
        let box = @{ h 3 v 2 h -3 z };
        let knives = @{ m 1.2 -0.5 l 0 3 m 0.3 -3 l 0 3 };
        let pieces = box.cut(knives);
        log(pieces.length);
      `);
      expect(logs[0]).toBe('3');
    });

    it('treats a loop assembled from separate strokes as a cookie cutter', () => {
      // Four SEPARATE open strokes (drawn non-sequentially, so they are four
      // distinct chains, not one contiguous run) meet endpoint-to-endpoint
      // to form a closed square loop inside the box — closure is discovered
      // geometrically, not authored via z.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let loop = @{
          m 20 10 l 20 0
          m -20 20 l 20 0
          m -20 -20 l 0 20
          m 20 -20 l 0 20
        };
        let pieces = box.cut(loop);
        log(pieces.length);
        for ([piece, i] in pieces) {
          log(piece.subPathCount);
        }
      `);
      expect(logs[0]).toBe('2');
      const subpaths = [Number(logs[1]), Number(logs[2])].sort((a, b) => a - b);
      expect(subpaths).toEqual([1, 2]);
    });

    it('stamps with a cookie cutter straddling the subject boundary', () => {
      // Circle centered on the box's right edge: a bite + the remainder.
      const { logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let stamp = @{ circle(0, 0, 10); };
        let pieces = box.cut(stamp.project(60, 20));
        log(pieces.length);
        for ([piece, i] in pieces) {
          log(piece.subPathCount);
        }
      `);
      expect(logs[0]).toBe('2');
      // Straddling stamp: both pieces are simple contours (no hole).
      expect(Number(logs[1])).toBe(1);
      expect(Number(logs[2])).toBe(1);
    });

    it('cuts a mixed open + closed subject', () => {
      // A closed box plus a separate open polyline; the knife crosses both.
      const { logs } = compileWithLogs(`
        let mixed = @{ h 60 v 40 h -60 z m 0 20 h 60 };
        let knife = @{ m 30 -10 l 0 80 };
        let pieces = mixed.cut(knife);
        log(pieces.length);
      `);
      // 2 box halves + 2 open fragments.
      expect(logs[0]).toBe('4');
    });
  });

  describe('ProjectedPath receiver', () => {
    it('cuts a projected subject with a projected cutter', () => {
      const { path, logs } = compileWithLogs(`
        let box = @{ h 60 v 40 h -60 z };
        let knife = @{ m 0 -10 l 0 60 };
        let pieces = box.project(50, 50).cut(knife.project(80, 50));
        log(pieces.length);
        for ([piece, i] in pieces) {
          piece.drawTo(0, 0);
        }
      `);
      expect(logs[0]).toBe('2');
      expect(zCount(path)).toBe(2);
    });
  });
});

describe('labels through cut()', () => {
  it('pieces keep subject labels and every piece answers segmentAll("cut")', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60 as segment('top')
        v 40
        h -60 as segment('bottom')
        z
      };
      let knife = @{
        m 30 -10
        l 0 60
      };
      let pieces = box.cut(knife);
      log(pieces.length);
      for ([p, i] in pieces) {
        log(p.segmentAll('cut').length);
        log(calc(p.segmentAll('top').length + p.segmentAll('bottom').length));
      }
    `);
    expect(logs[0]).toBe('2');
    // Each piece has at least one healed seam...
    expect(Number(logs[1])).toBeGreaterThanOrEqual(1);
    expect(Number(logs[3])).toBeGreaterThanOrEqual(1);
    // ...and keeps some of the subject's own labels on its boundary.
    expect(Number(logs[2])).toBeGreaterThanOrEqual(1);
    expect(Number(logs[4])).toBeGreaterThanOrEqual(1);
  });

  it('cookie-cutter seams are labeled in both pieces', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let stamp = @{ circle(0, 0, 10); };
      let pieces = box.cut(stamp.project(30, 20));
      log(pieces.length);
      for ([p, i] in pieces) {
        log(p.segmentAll('cut').length);
      }
    `);
    expect(logs[0]).toBe('2');
    expect(Number(logs[1])).toBeGreaterThanOrEqual(1);
    expect(Number(logs[2])).toBeGreaterThanOrEqual(1);
  });

  it("authoring bare 'cut' is a compile error pointing at the opt-in", () => {
    expect(() =>
      compileWithLogs(`
        let box = @{
          h 60 as segment('cut')
          v 40
          h -60
          z
        };
      `),
    ).toThrow(/reserved.*cut\.<name>/s);
  });

  it("the explicit 'cut.<name>' opt-in joins the user's geometry to the seam group", () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60 as segment('cut.top')
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60
      };
      let pieces = box.cut(knife);
      let total = 0;
      let topFragments = 0;
      for ([p, i] in pieces) {
        total = calc(total + p.segmentAll('cut').length);
        topFragments = calc(topFragments + p.segmentAll('cut.top').length);
      }
      log(total);
      log(topFragments);
    `);
    // Seams from the knife PLUS the user's opted-in top edge fragments —
    // and the fragments stay individually addressable via the sub-label.
    expect(Number(logs[0])).toBeGreaterThanOrEqual(3);
    expect(Number(logs[1])).toBe(2);
  });

  it('labels never change cut geometry (byte guard)', () => {
    const mk = (labels: boolean) => compileWithLogs(`
      let box = @{
        h 60${labels ? " as segment('top'), endpoint('ne')" : ''}
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60
      };
      let pieces = box.cut(knife);
      for ([p, i] in pieces) {
        p.drawTo(0, 0);
      }
    `).path;
    expect(mk(true)).toBe(mk(false));
  });
});

describe('endpoint labels on zero-length z through cut()', () => {
  it('a label on a zero-length z lands on exactly one piece', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        v -40
        z as endpoint('home')
      };
      let knife = @{
        m 30 -10
        l 0 60
      };
      let pieces = box.cut(knife);
      log(pieces.length);
      for ([p, i] in pieces) {
        log(p.pointAll('home').length);
      }
    `);
    expect(logs[0]).toBe('2');
    const counts = [Number(logs[1]), Number(logs[2])];
    expect(counts[0] + counts[1]).toBe(1);
  });
});

describe('cut() with an array of cutters', () => {
  it('an array of knives cuts identically to one combined block', () => {
    const combined = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 20 -10
        l 0 60
        m 20 -60
        l 0 60
      };
      let pieces = box.cut(knife);
      log(pieces.length);
      for (piece in pieces) {
        piece.drawTo(0, 0);
      }
    `);
    const arrayForm = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let k1 = @{
        m 20 -10
        l 0 60
      };
      let k2 = @{
        m 40 -10
        l 0 60
      };
      let pieces = box.cut([k1, k2]);
      log(pieces.length);
      for (piece in pieces) {
        piece.drawTo(0, 0);
      }
    `);
    expect(arrayForm.logs[0]).toBe('3');
    expect(arrayForm.logs[0]).toBe(combined.logs[0]);
    expect(arrayForm.path).toBe(combined.path);
  });

  it('knives built in a loop cut in one call (spokes + ring)', () => {
    const { logs } = compileWithLogs(`
      let disc = @{
        circle(0, 0, 60);
      };
      let knives = [];
      for (k in 0..7) {
        let spokeAngle = calc(k * PI() / 4);
        knives.push(@{
          m calc(25 * cos(spokeAngle)) calc(25 * sin(spokeAngle))
          l calc(45 * cos(spokeAngle)) calc(45 * sin(spokeAngle))
        });
      }
      knives.push(@{
        circle(0, 0, 25);
      });
      let panes = disc.cut(knives);
      log(panes.length);
    `);
    // eight ring panes + the stamped medallion
    expect(logs[0]).toBe('9');
  });

  it('accepts mixed PathBlock and ProjectedPath cutters', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let k1 = @{
        m 20 -10
        l 0 60
      };
      let k2 = @{
        m 0 -10
        l 0 60
      };
      let pieces = box.cut([k1, k2.project(40, 0)]);
      log(pieces.length);
    `);
    expect(logs[0]).toBe('3');
  });

  it('works on a ProjectedPath receiver too', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let k1 = @{
        m 70 40
        l 0 60
      };
      let pieces = box.project(50, 50).cut([k1]);
      log(pieces.length);
    `);
    expect(logs[0]).toBe('2');
  });

  it('rejects an empty cutter array', () => {
    expect(() =>
      compile('let b = @{ h 10 v 10 h -10 z }; b.cut([]);'),
    ).toThrow(/at least one cutter/);
  });

  it('rejects arrays holding non-path elements', () => {
    expect(() =>
      compile('let b = @{ h 10 v 10 h -10 z }; b.cut([5]);'),
    ).toThrow(/PathBlock or ProjectedPath/);
  });
});

  // (review follow-up) knives that touch end-to-start must behave the
  // same whether they arrive as an array or as one authored block — the
  // chain splitter sees only coordinate continuity either way.
describe('cut() array equivalence for touching knives', () => {
  it('a knife starting where another ends is equivalent in both forms', () => {
    const combined = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 30
        l 20 30
      };
      let pieces = box.cut(knife);
      log(pieces.length);
      for (piece in pieces) {
        piece.drawTo(0, 0);
      }
    `);
    const arrayForm = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let k1 = @{
        m 30 -10
        l 0 30
      };
      let k2 = @{
        m 30 20
        l 20 30
      };
      let pieces = box.cut([k1, k2]);
      log(pieces.length);
      for (piece in pieces) {
        piece.drawTo(0, 0);
      }
    `);
    expect(arrayForm.logs[0]).toBe(combined.logs[0]);
    expect(arrayForm.path).toBe(combined.path);
  });
});

describe('pieces.seams() — each physical seam once', () => {
  it('a single straight cut yields one seam', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let pieces = box.cut(@{
        m 30 -10
        l 0 60
      });
      log(pieces.seams().length);
    `);
    expect(logs[0]).toBe('1');
  });

  it('a 3x3 wavy grid yields 12 physical seams', () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        h 198
        v 198
        h -198
        z
      };
      let knives = [];
      for (k in 0..1) {
        let lane = calc(66 + k * 66);
        knives.push(@{
          m lane -15
          c 18 60 -18 118 6 228
        });
        knives.push(@{
          m -15 lane
          c 60 18 118 -18 228 6
        });
      }
      let pieces = plate.cut(knives);
      log(pieces.length);
      log(pieces.seams().length);
    `);
    expect(logs[0]).toBe('9');
    // 4 knives, each split into 3 fragments by the 2 crossing knives
    expect(logs[1]).toBe('12');
  });

  it('the hex medallion yields 6 spokes — the merged-V case', () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        polygon(0, 0, 62, 6);
      };
      let knives = [];
      for (k in 0..2) {
        let knifeAngle = calc(k * PI() / 3);
        let dirX = cos(knifeAngle);
        let dirY = sin(knifeAngle);
        knives.push(@{
          m calc(0 - 78 * dirX) calc(0 - 78 * dirY)
          l calc(156 * dirX) calc(156 * dirY)
        });
      }
      let wedges = plate.cut(knives);
      log(wedges.length);
      log(wedges.seams().length);
    `);
    expect(logs[0]).toBe('6');
    // 3 knives through the center = 6 crossing-bounded spokes; each
    // wedge's own segmentAll('cut') merges its two spokes into one
    // V-run, which is exactly why seams() pairs by identity, not
    // geometry
    expect(logs[1]).toBe('6');
  });

  it('a cookie cutter yields one closed ring seam', () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        h 200
        v 200
        h -200
        z
      };
      let stamped = plate.cut(@{
        circle(100, 100, 30);
      });
      log(stamped.length);
      log(stamped.seams().length);
    `);
    expect(logs[0]).toBe('2');
    expect(logs[1]).toBe('1');
  });

  it('drawn seams() output equals the ownership-rule dedupe (fold-lines equivalence)', () => {
    const base = `
      let card = @{
        h 288
        v 96
        h -288
        z
      };
      let creases = @{
        m 72 -15
        l 0 126
        m 72 -126
        l 0 126
        m 72 -126
        l 0 126
      };
      let panels = card.cut(creases);
      DRAW_FORM
    `;
    const viaOwnership = compileWithLogs(
      base.replace(
        'DRAW_FORM',
        `for (panel in panels) {
        let placed = panel.project(96, 48);
        let bounds = placed.boundingBox();
        let panelCenterX = calc(bounds.x + bounds.width / 2);
        for (seam in placed.segmentAll('cut')) {
          let mid = seam.get(0.5);
          if (mid.x > panelCenterX) {
            seam.draw();
          }
        }
      }`,
      ),
    );
    const viaSeams = compileWithLogs(
      base.replace(
        'DRAW_FORM',
        `for (seam in panels.seams()) {
        seam.project(96, 48).draw();
      }`,
      ),
    );
    // Same drawn set; per-seam direction may differ (unspecified), so
    // compare each M-delimited stroke normalized to its sorted endpoints.
    const strokes = (d: string) =>
      d
        .split('M ')
        .filter((s) => s.trim().length > 0)
        .map((s) => {
          const [x, y, cmd, , dy] = s.trim().split(/[ ]+/);
          return cmd === 'l' ? `${Math.min(Number(y), Number(y) + Number(dy))}@${x}` : s.trim();
        })
        .sort()
        .join('|');
    expect(strokes(viaSeams.path)).toBe(strokes(viaOwnership.path));
  });

  it('plain arrays without cut identity return an empty seams list', () => {
    const { logs } = compileWithLogs(`
      let a = @{
        h 10
        v 10
      };
      let arr = [a, a];
      log(arr.seams().length);
    `);
    expect(logs[0]).toBe('0');
  });

  it('rejects non-path elements', () => {
    expect(() => compile('let arr = [5]; arr.seams();')).toThrow(/PathBlock or ProjectedPath/);
  });
});

describe('seams() across chained cuts and transforms (review round)', () => {
  it('chained cuts: inherited seam fragments and new seams each come back whole', () => {
    const { logs, path } = compileWithLogs(`
      let card = @{
        h 100
        v 100
        h -100
        z
      };
      let panels = card.cut(@{
        m 50 -10
        l 0 120
      });
      let subPanels = panels[0].cut(@{
        m -20 25
        l 170 0
      });
      let subSeams = subPanels.seams();
      log(subSeams.length);
      for (seam in subSeams) {
        seam.drawTo(0, 0);
      }
    `);
    // The new horizontal seam, plus the inherited vertical seam now
    // split into two genuine fragments (one per sub-panel). Before the
    // module-wide id counter, colliding ids silently spliced an old
    // boundary edge onto the new seam.
    expect(logs[0]).toBe('3');
    // Every seam here is one straight stroke (each drawTo body carries
    // exactly one l after its placement moves) — the historical id
    // collision spliced an unrelated boundary edge on, showing up as a
    // second l in one body.
    const bodies = path.split('M ').filter((s) => s.trim().length > 0);
    expect(bodies.length).toBe(3);
    for (const body of bodies) {
      expect((body.match(/l /g) || []).length).toBe(1);
    }
  });

  it('cookie ring seams close properly (dash patterns wrap)', () => {
    const { path } = compileWithLogs(`
      let plate = @{
        h 200
        v 200
        h -200
        z
      };
      let stamped = plate.cut(@{
        circle(100, 100, 30);
      });
      stamped.seams()[0].drawTo(0, 0);
    `);
    expect(path.trim().endsWith('z')).toBe(true);
  });

  it('offset pieces keep seam identity (both sides return, now distinct curves)', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let pieces = box.cut(@{
        m 30 -10
        l 0 60
      });
      let grown = [pieces[0].offset(2), pieces[1].offset(2)];
      log(grown.seams().length);
    `);
    // After offsetting, the two sides of the seam are genuinely
    // different curves, so both return — documented behavior.
    expect(Number(logs[0])).toBeGreaterThanOrEqual(1);
    expect(Number(logs[0])).toBeLessThanOrEqual(2);
  });

  it('open-subject cuts report no seams (severing creates no healed boundary)', () => {
    const { logs } = compileWithLogs(`
      let wire = @{
        h 80
      };
      let bits = wire.cut(@{
        m 40 -10
        l 0 20
      });
      log(bits.length);
      log(bits.seams().length);
    `);
    expect(logs[0]).toBe('2');
    expect(logs[1]).toBe('0');
  });
});

describe('seam normals face outward (documented guarantee)', () => {
  // cut() canonicalizes winding so material lies on a fixed side of
  // travel; normal(t) is a fixed rotation of travel — so seam normals
  // point away from the piece's material by construction. This pins
  // the documented contract so a future winding change cannot silently
  // break it.
  it('both pieces of a curved cut: every sampled seam normal points away from the piece', () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        h 150
        v 110
        h -150
        z
      };
      let pieces = plate.cut(@{
        m 92 -15
        c -26 45 26 75 -10 140
      });
      for (piece in pieces) {
        let placed = piece.project(20, 20);
        let bb = placed.boundingBox();
        let cx = calc(bb.x + bb.width / 2);
        let cy = calc(bb.y + bb.height / 2);
        for (seam in placed.segmentAll('cut')) {
          for (k in 0..4) {
            let t = calc(k / 4 * 0.9 + 0.05);
            let n = seam.normal(t);
            let toCenter = calc(cos(n.angle) * (cx - n.point.x) + sin(n.angle) * (cy - n.point.y));
            log(toCenter);
          }
        }
      }
    `);
    expect(logs.length).toBe(10);
    for (const value of logs) {
      expect(Number(value)).toBeLessThan(0);
    }
  });

  it("a holed piece's ring seam normals point into the hole (out of the material)", () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        h 200
        v 200
        h -200
        z
      };
      let stamped = plate.cut(@{
        circle(100, 100, 30);
      });
      for (piece in stamped) {
        let placed = piece.project(0, 0);
        let bb = placed.boundingBox();
        // The host piece is the big one; its ring seam's outward normal
        // aims at the hole center (100,100).
        if (bb.width > 100) {
          for (seam in placed.segmentAll('cut')) {
            for (k in 0..4) {
              let t = calc(k / 4 * 0.9 + 0.05);
              let n = seam.normal(t);
              let toHole = calc(cos(n.angle) * (100 - n.point.x) + sin(n.angle) * (100 - n.point.y));
              log(toHole);
            }
          }
        }
      }
    `);
    expect(logs.length).toBe(5);
    for (const value of logs) {
      expect(Number(value)).toBeGreaterThan(0);
    }
  });
});

  // The boolean ops canonicalize winding through a DIFFERENT code path
  // than cut() (assembleResult / handleNoIntersections vs
  // canonicalizeRingWindings) — pin the documented guarantee on that
  // side too, or a regression there would ship silently.
describe('boolean-result normals face outward (documented guarantee)', () => {
  it('a union of overlapping squares: sampled boundary normals point away from the shape', () => {
    const { logs } = compileWithLogs(`
      let left = @{
        h 40
        v 40
        h -40
        z
      };
      let right = @{
        h 40
        v 40
        h -40
        z
      };
      let merged = left.union(right.project(25, 0));
      let placed = merged.project(50, 50);
      let bb = placed.boundingBox();
      let cx = calc(bb.x + bb.width / 2);
      let cy = calc(bb.y + bb.height / 2);
      for (k in 0..9) {
        let t = calc(k / 9 * 0.9 + 0.05);
        let n = placed.normal(t);
        let toCenter = calc(cos(n.angle) * (cx - n.point.x) + sin(n.angle) * (cy - n.point.y));
        log(toCenter);
      }
    `);
    expect(logs.length).toBe(10);
    for (const value of logs) {
      expect(Number(value)).toBeLessThan(0);
    }
  });

  it("a difference's hole ring: sampled normals point into the hole", () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        circle(0, 0, 50);
      };
      let hole = @{
        circle(0, 0, 18);
      };
      let ring = plate.project(100, 100).difference(hole.project(100, 100));
      // Walk the whole two-contour boundary and classify samples by
      // radius: outer-ring samples must aim away from (100,100), hole
      // samples toward it.
      for (k in 0..19) {
        let t = calc(k / 19 * 0.9 + 0.05);
        let n = ring.normal(t);
        let dx = calc(n.point.x - 100);
        let dy = calc(n.point.y - 100);
        let radius = calc(sqrt(dx * dx + dy * dy));
        let toCenter = calc(cos(n.angle) * (100 - n.point.x) + sin(n.angle) * (100 - n.point.y));
        log(radius);
        log(toCenter);
      }
    `);
    for (let k = 0; k < 20; k++) {
      const radius = Number(logs[k * 2]);
      const toCenter = Number(logs[k * 2 + 1]);
      if (radius > 30) {
        expect(toCenter).toBeLessThan(0); // outer boundary: outward
      } else {
        expect(toCenter).toBeGreaterThan(0); // hole ring: into the hole
      }
    }
  });
});

describe('cutter label propagation (cut.<name> sub-labels)', () => {
  it("a labeled knife stamps its seams 'cut.<name>' on BOTH adjacent pieces", () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60 as segment('valley');
      };
      let pieces = box.cut(knife);
      for ([p, i] in pieces) {
        log(p.segmentAll('cut.valley').length);
        log(p.segmentAll('cut').length);
      }
    `);
    expect(logs.length).toBe(4);
    // Each piece: exactly one valley seam, and the umbrella sees it too.
    expect(logs[0]).toBe('1');
    expect(logs[2]).toBe('1');
    expect(Number(logs[1])).toBeGreaterThanOrEqual(1);
    expect(Number(logs[3])).toBeGreaterThanOrEqual(1);
  });

  it('two differently-named knives in one array cut distinguishable seams', () => {
    const { logs } = compileWithLogs(`
      let sheet = @{
        rect(0, 0, 90, 90);
      };
      let mountain = @{
        m 30 -10
        l 0 110 as segment('mountain');
      };
      let valley = @{
        m 60 -10
        l 0 110 as segment('valley');
      };
      let pieces = sheet.cut([mountain, valley]);
      let mountainSeams = 0;
      let valleySeams = 0;
      for ([p, i] in pieces) {
        mountainSeams = calc(mountainSeams + p.segmentAll('cut.mountain').length);
        valleySeams = calc(valleySeams + p.segmentAll('cut.valley').length);
      }
      log(pieces.length);
      log(mountainSeams);
      log(valleySeams);
    `);
    expect(logs[0]).toBe('3');
    // Each interior seam answers twice (once per adjacent piece).
    expect(logs[1]).toBe('2');
    expect(logs[2]).toBe('2');
  });

  it('umbrella keeps the merged V-run; sub-label queries unmerge it (friction #8 escape hatch)', () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        polygon(0, 0, 50, 6);
      };
      let kA = @{
        m -60 0
        l 120 0 as segment('kA');
      };
      let kB = @{
        m calc(-60 * cos(PI() / 3)) calc(-60 * sin(PI() / 3))
        l calc(120 * cos(PI() / 3)) calc(120 * sin(PI() / 3)) as segment('kB');
      };
      let wedges = plate.cut([kA, kB]);
      // Find a wedge whose two radial edges came from the two DIFFERENT
      // knives: umbrella returns them merged into one V-run, exact
      // sub-label queries return one straight edge each.
      let found = 0;
      for (w in wedges) {
        let a = w.segmentAll('cut.kA').length;
        let b = w.segmentAll('cut.kB').length;
        if (a == 1) {
          if (b == 1) {
            if (found == 0) {
              found = 1;
              log(w.segmentAll('cut').length);
              log(a);
              log(b);
            }
          }
        }
      }
      log(found);
    `);
    expect(logs[logs.length - 1]).toBe('1');
    expect(logs[0]).toBe('1'); // merged V-run under the umbrella
    expect(logs[1]).toBe('1');
    expect(logs[2]).toBe('1');
  });

  it("an unlabeled knife still stamps plain 'cut' — no sub-labels invented", () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60
      };
      let pieces = box.cut(knife);
      log(pieces[0].segmentAll('cut').length);
      log(pieces[0].segmentAll('cut.knife').length);
    `);
    expect(Number(logs[0])).toBeGreaterThanOrEqual(1);
    expect(logs[1]).toBe('0');
  });

  it('a labeled cookie cutter sub-labels the stamped boundary in piece AND hole', () => {
    const { logs } = compileWithLogs(`
      let slab = @{
        rect(0, 0, 100, 100);
      };
      let cookie = @{
        circle(50, 50, 20) as segment('stamp');
      };
      let pieces = slab.cut(cookie);
      let stamped = 0;
      for ([p, i] in pieces) {
        stamped = calc(stamped + p.segmentAll('cut.stamp').length);
      }
      log(pieces.length);
      log(stamped);
    `);
    expect(logs[0]).toBe('2');
    expect(Number(logs[1])).toBeGreaterThanOrEqual(2);
  });

  it("a knife already labeled with the opt-in form 'cut.x' is not double-prefixed", () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60 as segment('cut.x');
      };
      let pieces = box.cut(knife);
      log(pieces[0].segmentAll('cut.x').length);
      log(pieces[0].segmentAll('cut.cut.x').length);
    `);
    expect(logs[0]).toBe('1');
    expect(logs[1]).toBe('0');
  });

  it('seams() results keep the sub-labels', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60 as segment('valley');
      };
      let pieces = box.cut(knife);
      let physical = pieces.seams();
      log(physical.length);
      log(physical[0].segmentAll('cut.valley').length);
    `);
    expect(logs[0]).toBe('1');
    expect(logs[1]).toBe('1');
  });

  it('chained cuts: inherited sub-labels survive, new knife adds its own', () => {
    const { logs } = compileWithLogs(`
      let box = @{
        rect(0, 0, 80, 80);
      };
      let first = @{
        m 40 -10
        l 0 100 as segment('a');
      };
      let second = @{
        m -10 40
        l 100 0 as segment('b');
      };
      let halves = box.cut(first);
      let quarters = halves[0].cut(second);
      let inheritedA = 0;
      let freshB = 0;
      for ([q, i] in quarters) {
        inheritedA = calc(inheritedA + q.segmentAll('cut.a').length);
        freshB = calc(freshB + q.segmentAll('cut.b').length);
      }
      log(quarters.length);
      log(inheritedA);
      log(freshB);
    `);
    expect(logs[0]).toBe('2');
    expect(Number(logs[1])).toBeGreaterThanOrEqual(2);
    expect(logs[2]).toBe('2');
  });

  it('knife labels never change cut geometry (byte guard)', () => {
    const mk = (labeled: boolean) => compileWithLogs(`
      let box = @{
        h 60
        v 40
        h -60
        z
      };
      let knife = @{
        m 30 -10
        l 0 60${labeled ? " as segment('valley')" : ''}
      };
      let pieces = box.cut(knife);
      for ([p, i] in pieces) {
        M 10 10 p.draw()
      }
    `).path;
    expect(mk(true)).toBe(mk(false));
  });
});

describe('bridgeSeamLabel (face-walk bridge label choice)', () => {
  // The bridge fires only on numerically imperfect arrangements — no
  // deterministic repro exists (verified: zero firings across this
  // suite and all published samples) — so the rule is pinned directly.
  it('inherits the sub-label when both neighbors are the same named knife', () => {
    expect(bridgeSeamLabel('cut.valley', 'cut.valley')).toBe('cut.valley');
  });
  it("stays plain 'cut' between different knives", () => {
    expect(bridgeSeamLabel('cut.valley', 'cut.mountain')).toBe('cut');
  });
  it("stays plain 'cut' beside unlabeled seams, subject labels, or bare ends", () => {
    expect(bridgeSeamLabel('cut', 'cut')).toBe('cut');
    expect(bridgeSeamLabel('rim', 'rim')).toBe('cut');
    expect(bridgeSeamLabel(undefined, 'cut.valley')).toBe('cut');
    expect(bridgeSeamLabel('cut.valley', undefined)).toBe('cut');
  });
});

describe('pseudo-selectors compose with the seam namespace', () => {
  it("'cut:first' selects from merged umbrella runs; 'cut.k0:each' decomposes one knife's seams", () => {
    const { logs } = compileWithLogs(`
      let plate = @{
        polygon(0, 0, 50, 6);
      };
      let kA = @{
        m -60 0
        l 120 0 as segment('kA');
      };
      let kB = @{
        m calc(-60 * cos(PI() / 3)) calc(-60 * sin(PI() / 3))
        l calc(120 * cos(PI() / 3)) calc(120 * sin(PI() / 3)) as segment('kB');
      };
      let wedges = plate.cut([kA, kB]);
      for (w in wedges) {
        if (w.segmentAll('cut.kA').length == 1) {
          if (w.segmentAll('cut.kB').length == 1) {
            // Umbrella: one merged V-run; :first selects it whole.
            log(w.segmentAll('cut:first').length);
            let vRun = w.segment('cut:first');
            let edge = w.segment('cut.kA');
            log(calc(abs(vRun.length - edge.length * 2) < 0.01));
            // One knife's seam decomposed per command.
            log(w.segmentAll('cut.kA:each').length);
          }
        }
      }
    `);
    expect(logs[0]).toBe('1');
    expect(logs[1]).toBe('true');
    expect(logs[2]).toBe('1');
  });
});
