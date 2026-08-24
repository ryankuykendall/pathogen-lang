import { describe, expect, it } from 'vitest';

import { compile } from '../src';
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

  it("a user's own 'cut' label merges into the seam group", () => {
    const { logs } = compileWithLogs(`
      let box = @{
        h 60 as segment('cut')
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
      for ([p, i] in pieces) {
        total = calc(total + p.segmentAll('cut').length);
      }
      log(total);
    `);
    // Seams from the knife PLUS the user's labeled top edge fragments.
    expect(Number(logs[0])).toBeGreaterThanOrEqual(3);
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
