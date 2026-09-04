import { describe, expect, it } from 'vitest';

import { compile, parse } from '../src';
import { compilePath, parseSVGPath } from './helpers';

describe('Path Blocks', () => {
  describe('parser', () => {
    it('parses a basic path block expression', () => {
      const ast = parse('let p = @{ v 20 h 20 };');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('LetDeclaration');
      const letDecl = ast.body[0] as { type: string; value: { type: string; body: unknown[] } };
      expect(letDecl.value.type).toBe('PathBlockExpression');
      expect(letDecl.value.body).toHaveLength(2);
    });

    it('parses path block with control flow', () => {
      const ast = parse('let p = @{ for (i in 0..3) { v 10 } };');
      expect(ast.body).toHaveLength(1);
      const letDecl = ast.body[0] as { type: string; value: { type: string; body: unknown[] } };
      expect(letDecl.value.type).toBe('PathBlockExpression');
    });

    it('parses path block followed by method call', () => {
      const ast = parse('let p = @{ v 20 }.draw();');
      // Should parse as PathBlockExpression followed by .draw() postfix
      expect(ast.body).toHaveLength(1);
    });

    it('parses path block with variables', () => {
      const ast = parse('let p = @{ let d = 10; v d h d };');
      expect(ast.body).toHaveLength(1);
    });
  });

  describe('definition', () => {
    it('creates a PathBlockValue from simple commands', () => {
      const result = compile('let p = @{ v 20 h 20 }; log(p);');
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].parts[0].value).toContain('PathBlock');
    });

    it('captures relative path commands without emitting', () => {
      const result = compilePath('let p = @{ v 20 h 20 }; M 0 0');
      // Only M 0 0 should be emitted, not the path block contents
      expect(result).toBe('M 0 0');
    });

    it('supports variables inside path block', () => {
      const result = compile('let p = @{ let d = 10; v d h d }; log(p.endPoint);');
      expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
    });

    it('supports control flow inside path block', () => {
      const result = compile(`
        let p = @{
          for (i in 0..2) {
            v 10
          }
        };
        log(p.endPoint);
      `);
      // 3 iterations of v 10 → endPoint should be (0, 30)
      expect(result.logs[0].parts[0].value).toBe('Point(0, 30)');
    });

    it('reads outer variables', () => {
      const result = compile(`
        let size = 20;
        let p = @{ v size h size };
        log(p.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toBe('Point(20, 20)');
    });

    it('supports context-aware functions inside path block', () => {
      // arcFromPolarOffset works with the block's temporary PathContext
      const result = compile(`
        let p = @{
          v 20
          arcFromPolarOffset(1pi, 20, -0.5pi);
          h 20
        };
        log(p.endPoint);
      `);
      // Should compute endpoint based on relative path + arc + h 20
      expect(result.logs).toHaveLength(1);
    });
  });

  describe('properties', () => {
    it('length returns total path length', () => {
      const result = compile('let p = @{ v 20 h 30 }; log(p.length);');
      // v 20 = 20 units, h 30 = 30 units → total = 50
      expect(result.logs[0].parts[0].value).toBe('50');
    });

    it('startPoint of an on-origin block is (0, 0)', () => {
      const result = compile('let p = @{ v 20 h 30 }; log(p.startPoint);');
      expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
    });

    it('endPoint reflects final position', () => {
      const result = compile('let p = @{ v 20 h 30 }; log(p.endPoint);');
      expect(result.logs[0].parts[0].value).toBe('Point(30, 20)');
    });

    it('endPoint.x and endPoint.y are accessible', () => {
      const result = compile('let p = @{ h 10 v 5 }; log(p.endPoint.x, p.endPoint.y);');
      expect(result.logs[0].parts[0].value).toBe('10');
      expect(result.logs[0].parts[1].value).toBe('5');
    });

    it('vertices returns array of Points', () => {
      const result = compile('let p = @{ v 20 h 30 }; log(p.vertices.length);');
      // vertices: (0,0), (0,20), (30,20) → 3 unique vertices
      expect(result.logs[0].parts[0].value).toBe('3');
    });

    it('subPathCount returns 1 for simple path', () => {
      const result = compile('let p = @{ v 20 h 30 }; log(p.subPathCount);');
      expect(result.logs[0].parts[0].value).toBe('1');
    });

    it('subPathCount returns 2 with m command', () => {
      const result = compile('let p = @{ v 20 m 10 0 h 30 }; log(p.subPathCount);');
      expect(result.logs[0].parts[0].value).toBe('2');
    });

    it('subPathCommands returns structured command list', () => {
      const result = compile(`
        let p = @{ v 20 h 30 };
        log(p.subPathCommands.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('2');
    });

    it('subPathCommands entries have command, args, start, end', () => {
      const result = compile(`
        let p = @{ v 20 };
        let cmd = p.subPathCommands[0];
        log(cmd.command, cmd.start, cmd.end);
      `);
      expect(result.logs[0].parts[0].value).toBe('v');
      expect(result.logs[0].parts[1].value).toBe('Point(0, 0)');
      expect(result.logs[0].parts[2].value).toBe('Point(0, 20)');
    });
  });

  describe('draw()', () => {
    it('emits relative path commands at current cursor', () => {
      const result = compilePath(`
        let p = @{ v 20 h 20 };
        M 10 10
        p.draw()
      `);
      expect(result).toBe('M 10 10 v 20 h 20');
    });

    it('advances cursor position', () => {
      const result = compilePath(`
        let p = @{ v 20 h 20 };
        M 10 10
        p.draw()
        l 5 5
      `);
      // After draw(), cursor is at (30, 30) relative to (10, 10)
      // l 5 5 continues from that position
      expect(result).toBe('M 10 10 v 20 h 20 l 5 5');
    });

    it('can be called multiple times', () => {
      const result = compilePath(`
        let p = @{ v 20 h 20 };
        M 10 10
        p.draw()
        M 50 50
        p.draw()
      `);
      expect(result).toBe('M 10 10 v 20 h 20 M 50 50 v 20 h 20');
    });

    it('returns a ProjectedPathValue', () => {
      const result = compile(`
        let p = @{ v 20 h 20 };
        M 10 10
        let proj = p.draw();
        log(proj.startPoint, proj.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
      expect(result.logs[0].parts[1].value).toBe('Point(30, 30)');
    });

    it('works inside for loop', () => {
      const result = compilePath(`
        let p = @{ v 10 h 10 };
        for (i in 0..2) {
          M calc(i * 30) 0
          p.draw()
        }
      `);
      expect(result).toBe('M 0 0 v 10 h 10 M 30 0 v 10 h 10 M 60 0 v 10 h 10');
    });

    it('works with layers', () => {
      const result = compile(
        "define default PathLayer('main') #{ stroke: black; }\n" +
          'let p = @{ v 20 h 20 };\n' +
          'M 10 10\n' +
          'p.draw()',
      );
      expect(result.layers[0].data).toBe('M 10 10 v 20 h 20');
    });
  });

  describe('project()', () => {
    it('computes absolute coordinates without emitting', () => {
      const result = compile(`
        let p = @{ v 20 h 30 };
        let proj = p.project(10, 10);
        log(proj.startPoint, proj.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
      expect(result.logs[0].parts[1].value).toBe('Point(40, 30)');
    });

    it('does not emit path commands', () => {
      const result = compilePath(`
        let p = @{ v 20 h 30 };
        let proj = p.project(10, 10);
        M 0 0
      `);
      expect(result).toBe('M 0 0');
    });

    it('does not affect cursor position', () => {
      const result = compilePath(`
        let p = @{ v 20 h 30 };
        M 10 10
        let proj = p.project(50, 50);
        l 5 5
      `);
      // project() doesn't move cursor, so l 5 5 continues from (10, 10)
      expect(result).toBe('M 10 10 l 5 5');
    });

    it('projected path has correct length', () => {
      const result = compile(`
        let p = @{ v 20 h 30 };
        let proj = p.project(10, 10);
        log(proj.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('50');
    });

    it('projected path has correct vertices', () => {
      const result = compile(`
        let p = @{ v 20 h 30 };
        let proj = p.project(10, 10);
        log(proj.vertices.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('3');
    });
  });

  describe('ProjectedPath draw() — in place', () => {
    it('a seam run draws itself exactly where it lies (byte-equal to the drawTo anchor idiom)', () => {
      const base = `
let plate = @{
  h 140 as segment('top')
  v 100
  h -140
  z
};
let pieces = plate.cut(@{
  m 70 -15
  l 0 130
});
let placed = pieces[0].project(30, 40);
for (seam in placed.segmentAll('cut')) {
  SEAM_DRAW
}`;
      const viaDraw = compile(base.replace('SEAM_DRAW', 'seam.draw();')).layers[0].data;
      const viaAnchor = compile(
        base.replace('SEAM_DRAW', 'seam.drawTo(seam.startPoint.x, seam.startPoint.y);'),
      ).layers[0].data;
      expect(viaDraw).toBe(viaAnchor);
    });

    it('a whole projected cut piece draws in place (matches the M + block draw form)', () => {
      const base = `
let plate = @{
  h 140 as segment('top')
  v 100
  h -140
  z
};
let pieces = plate.cut(@{
  m 70 -15
  l 0 130
});
DRAW_FORM`;
      const viaProjected = compile(
        base.replace(
          'DRAW_FORM',
          'let placed = pieces[1].project(30, 40);\nplaced.draw();',
        ),
      ).layers[0].data;
      const viaBlock = compile(
        base.replace('DRAW_FORM', 'M 30 40\npieces[1].draw();'),
      ).layers[0].data;
      // Same geometry: the projected form anchors the first command
      // directly, the block form bridges from the cursor — normalize by
      // collapsing the leading "M x y m dx dy" into one absolute M.
      const collapse = (d: string) => {
        const m = d.match(/^M (-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) (.*)$/);
        if (!m) return d;
        return `M ${Number(m[1]) + Number(m[3])} ${Number(m[2]) + Number(m[4])} ${m[5]}`;
      };
      expect(collapse(viaProjected)).toBe(collapse(viaBlock));
    });

    it('advances the cursor to the path end (relative commands continue from there)', () => {
      const result = compile(`
let shape = @{
  h 50
  v 30
};
let placed = shape.project(10, 20);
placed.draw();
l 5 0`);
      expect(result.layers[0].data).toBe('M 10 20 h 50 v 30 l 5 0');
    });

    it('returns the projected value for chaining', () => {
      const result = compile(`
let shape = @{
  h 50
  v 30
};
let placed = shape.project(10, 20);
let out = placed.draw();
log(out.endPoint.x);
log(out.endPoint.y);`);
      expect(Number(result.logs[0].parts[0].value)).toBe(60);
      expect(Number(result.logs[1].parts[0].value)).toBe(50);
    });

    // Multi-contour values carry mid-list `m` commands (boolean results,
    // holed cut pieces). The serializer walk must seat its cursor at the
    // emitted anchor or every subsequent subpath double-offsets — the
    // review-caught regression class. Ground truth is the block form
    // (M x y + block.draw()), whose local-frame walk was always correct.
    const collapseLeadingMove = (d: string) => {
      const m = d.match(/^M (-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) (.*)$/);
      const collapsed = m
        ? `M ${Number(m[1]) + Number(m[3])} ${Number(m[2]) + Number(m[4])} ${m[5]}`
        : d;
      // Translated arithmetic rounds differently in the last ulp; compare
      // at 6 decimals.
      return collapsed.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(6));
    };

    it('union result (two contours) draws in place at a non-zero position', () => {
      const base = `
let a = @{ circle(0, 0, 30); };
let b = @{ circle(35, 0, 30); };
let merged = a.union(b);
DRAW_FORM`;
      const viaProjected = compile(
        base.replace('DRAW_FORM', 'let placed = merged.project(150, 28);\nplaced.draw();'),
      ).layers[0].data;
      const viaBlock = compile(base.replace('DRAW_FORM', 'M 150 28\nmerged.draw();')).layers[0]
        .data;
      expect(collapseLeadingMove(viaProjected)).toBe(collapseLeadingMove(viaBlock));
    });

    it('difference result with a hole draws in place at a non-zero position', () => {
      const base = `
let big = @{ circle(0, 0, 40); };
let small = @{ circle(0, 0, 15); };
let donut = big.difference(small);
DRAW_FORM`;
      const viaProjected = compile(
        base.replace('DRAW_FORM', 'let placed = donut.project(150, 28);\nplaced.draw();'),
      ).layers[0].data;
      const viaBlock = compile(base.replace('DRAW_FORM', 'M 150 28\ndonut.draw();')).layers[0]
        .data;
      expect(collapseLeadingMove(viaProjected)).toBe(collapseLeadingMove(viaBlock));
    });

    it('a cut piece that carries a hole draws in place at a non-zero position', () => {
      const base = `
let plate = @{
  h 200 as segment('rim')
  v 200
  h -200
  z
};
let stamped = plate.cut(@{ circle(100, 100, 30); });
for (piece in stamped) {
  if (piece.segmentAll('rim').length > 0) {
    DRAW_FORM
  }
}`;
      const viaProjected = compile(
        base.replace('DRAW_FORM', 'let placed = piece.project(150, 28);\nplaced.draw();'),
      ).layers[0].data;
      const viaBlock = compile(base.replace('DRAW_FORM', 'M 150 28\npiece.draw();')).layers[0]
        .data;
      expect(collapseLeadingMove(viaProjected)).toBe(collapseLeadingMove(viaBlock));
    });

    it('drawTo places the INKED start at the target and keeps multi-contour geometry rigid (B2)', () => {
      // B2 changed this contract deliberately: drawTo(x, y) anchors the
      // first inked point AT (x, y) — the garment-footgun fix — while
      // `M x y` + draw() seats the pen and lets a leading m offset from
      // it. The two forms now agree everywhere except that anchor, so
      // rigidity is pinned by comparing everything after the first move.
      const base = `
let a = @{ circle(0, 0, 30); };
let b = @{ circle(35, 0, 30); };
let merged = a.union(b);
DRAW_FORM`;
      const viaDrawTo = compile(
        base.replace('DRAW_FORM', 'let proj = merged.project(0, 0);\nproj.drawTo(150, 28);'),
      ).layers[0].data;
      const viaBlock = compile(base.replace('DRAW_FORM', 'M 150 28\nmerged.draw();')).layers[0]
        .data;
      expect(viaDrawTo.startsWith('M 150 28 ')).toBe(true); // ink AT the target
      // Strip the anchor M plus any residual leading-move run (drawTo
      // serializes the consumed leading m as `m 0 0`); the drawing
      // commands after it must match — rigidity, with float tolerance
      // (the two serializations differ by 1 ulp on one coordinate).
      const afterAnchor = (d: string) => d.replace(/^M [\d.e-]+ [\d.e-]+ (m [\d.e-]+ [\d.e-]+ )*/, '');
      const a = parseSVGPath(afterAnchor(viaDrawTo));
      const b = parseSVGPath(afterAnchor(viaBlock));
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].command).toBe(b[i].command);
        for (let j = 0; j < a[i].args.length; j++) {
          expect(a[i].args[j]).toBeCloseTo(b[i].args[j], 6);
        }
      }
    });

    it('draw() on an empty projection degrades gracefully', () => {
      const result = compile(`
let empty = @{ h 10 };
let sub = empty.subPath(0.5, 0.5);
let pr = sub.project(10, 20);
pr.draw();
l 5 0`);
      expect(result.layers[0].data).toContain('l 5 0');
    });

    it('rejects arguments', () => {
      expect(() =>
        compile('let p = @{ h 10 }; let pr = p.project(0, 0); pr.draw(5);'),
      ).toThrow(/0 arguments/);
    });

    it('is rejected inside a path block, like drawTo', () => {
      expect(() =>
        compile('let p = @{ h 10 }; let pr = p.project(0, 0); let q = @{ pr.draw(); };'),
      ).toThrow(/inside a path block/);
    });
  });

  describe('drawTo()', () => {
    it('emits M followed by relative commands', () => {
      const result = compilePath(`
        let shape = @{ v 20 h 20 v -20 z };
        shape.drawTo(10, 10);
      `);
      expect(result).toBe('M 10 10 v 20 h 20 v -20 z');
    });

    it('returns ProjectedPath with correct coordinates', () => {
      const result = compile(`
        let shape = @{ v 20 h 30 };
        let proj = shape.drawTo(10, 10);
        log(proj.startPoint);
        log(proj.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
      expect(result.logs[1].parts[0].value).toBe('Point(40, 30)');
    });

    it('can be called multiple times at different positions', () => {
      const result = compilePath(`
        let shape = @{ h 20 v 10 };
        shape.drawTo(0, 0);
        shape.drawTo(50, 50);
      `);
      expect(result).toBe('M 0 0 h 20 v 10 M 50 50 h 20 v 10');
    });

    it('updates cursor position', () => {
      const result = compile(`
        let shape = @{ h 30 v 20 };
        shape.drawTo(10, 10);
        log(ctx.position);
      `);
      expect(result.logs[0].parts[0].value).toBe('{\n  "x": 40,\n  "y": 30\n}');
    });

    it('works with stdlib path functions', () => {
      const result = compilePath(`
        let c = @{ circle(10); };
        c.drawTo(50, 50);
      `);
      // Should emit M 50 50 followed by the circle's relative commands
      expect(result).toMatch(/^M 50 50 /);
    });

    it('works on ProjectedPathValue', () => {
      const result = compilePath(`
        let shape = @{ h 50 v 30 };
        let proj = shape.project(0, 0);
        proj.drawTo(100, 100);
      `);
      expect(result).toMatch(/^M 100 100 /);
    });

    it('ProjectedPathValue drawTo returns correct coordinates', () => {
      const result = compile(`
        let shape = @{ h 50 v 30 };
        let proj = shape.project(0, 0);
        let drawn = proj.drawTo(100, 100);
        log(drawn.startPoint);
        log(drawn.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toContain('100');
      expect(result.logs[1].parts[0].value).toContain('150');
      expect(result.logs[1].parts[0].value).toContain('130');
    });

    it('requires exactly 2 arguments', () => {
      expect(() => compilePath('let p = @{ h 10 }; p.drawTo(10);')).toThrow(/drawTo\(\) expects 2 arguments/);
      expect(() => compilePath('let p = @{ h 10 }; p.drawTo(10, 20, 30);')).toThrow(/drawTo\(\) expects 2 arguments/);
    });

    it('requires numeric arguments', () => {
      expect(() => compilePath('let p = @{ h 10 }; p.drawTo("a", 10);')).toThrow(/must be a number/);
    });

    it('cannot be called inside a path block', () => {
      expect(() => compilePath('let p = @{ h 10 }; let q = @{ p.drawTo(0, 0); };')).toThrow(/Cannot call.*inside a path block/);
    });

    it('works with closed paths', () => {
      const result = compilePath(`
        let box = @{ h 30 v 30 h -30 z };
        box.drawTo(10, 10);
      `);
      expect(result).toBe('M 10 10 h 30 v 30 h -30 z');
    });

    it('works with curve commands', () => {
      const result = compilePath(`
        let curve = @{ c 0 -40 50 -40 50 0 };
        curve.drawTo(20, 60);
      `);
      expect(result).toMatch(/^M 20 60 c 0 -40 50 -40 50 0$/);
    });

    it('sets cursor to drawTo position before path', () => {
      // Verify cursor is at endpoint after drawTo
      const result = compile(`
        M 0 0
        let shape = @{ h 50 };
        shape.drawTo(100, 200);
        // cursor should now be at (150, 200) = drawTo origin + shape endpoint
        log(ctx.position);
      `);
      expect(result.logs[0].parts[0].value).toContain('150');
      expect(result.logs[0].parts[0].value).toContain('200');
    });
  });

  describe('restrictions', () => {
    it('rejects absolute path commands', () => {
      expect(() => compilePath('let p = @{ V 20 };')).toThrow(/Absolute path command.*not allowed.*path blocks/);
    });

    it('rejects uppercase M', () => {
      expect(() => compilePath('let p = @{ M 10 20 };')).toThrow(/Absolute path command.*not allowed.*path blocks/);
    });

    it('rejects layer definitions inside path block', () => {
      expect(() => compilePath("let p = @{ define PathLayer('x') #{ stroke: red; } };")).toThrow(
        /Layer definitions.*not allowed.*path blocks/,
      );
    });

    it('rejects layer apply blocks inside path block', () => {
      expect(() =>
        compilePath("define PathLayer('x') #{ stroke: red; }\nlet p = @{ layer('x').apply { v 10 } };"),
      ).toThrow(/Layer apply blocks.*not allowed.*path blocks/);
    });

    it('rejects text statements inside path block', () => {
      expect(() => compilePath('let p = @{ text(0, 0)`hello` };')).toThrow(/Text statements.*not allowed.*path blocks/);
    });

    it('rejects nested path blocks', () => {
      expect(() => compilePath('let p = @{ let inner = @{ v 10 }; };')).toThrow(/nest.*path blocks/);
    });

    it('rejects draw() inside path block', () => {
      expect(() =>
        compilePath(`
        let p = @{ v 20 };
        let q = @{ p.draw(); };
      `),
      ).toThrow(/Cannot call .draw\(\) inside a path block/);
    });

    it('rejects project() inside path block', () => {
      expect(() =>
        compilePath(`
        let p = @{ v 20 };
        let q = @{ p.project(0, 0); };
      `),
      ).toThrow(/Cannot call .project\(\) inside a path block/);
    });

    it('allows z (closePath)', () => {
      const result = compile('let p = @{ v 20 h 20 z }; log(p.endPoint);');
      // z returns to subpath start (0, 0)
      expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
    });

    it('allows lowercase m for subpath', () => {
      const result = compile('let p = @{ v 20 m 10 0 h 20 }; log(p.subPathCount);');
      expect(result.logs[0].parts[0].value).toBe('2');
    });
  });

  describe('first-class values', () => {
    it('can be passed as function argument', () => {
      const result = compilePath(`
        fn drawAt(path, x, y) {
          M x y
          path.draw()
        }
        let p = @{ v 20 h 20 };
        drawAt(p, 10, 10);
      `);
      expect(result).toBe('M 10 10 v 20 h 20');
    });

    it('can be returned from function', () => {
      const result = compilePath(`
        fn makeLine(dx, dy) {
          return @{ l dx dy };
        }
        let p = makeLine(30, 40);
        M 0 0
        p.draw()
      `);
      expect(result).toBe('M 0 0 l 30 40');
    });

    it('can reference other PathBlock properties', () => {
      const result = compile(`
        let p1 = @{ v 20 };
        let p2 = @{ h p1.length };
        log(p2.endPoint);
      `);
      // p1.length is 20, so p2 does h 20 → endPoint (20, 0)
      expect(result.logs[0].parts[0].value).toBe('Point(20, 0)');
    });
  });

  describe('parametric sampling', () => {
    describe('get(t)', () => {
      it('get(0) returns startPoint', () => {
        const result = compile('let p = @{ v 20 h 30 }; let pt = p.get(0); log(pt);');
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('get(1) returns endPoint', () => {
        const result = compile('let p = @{ v 20 h 30 }; let pt = p.get(1); log(pt);');
        expect(result.logs[0].parts[0].value).toBe('Point(30, 20)');
      });

      it('get(0.5) on a straight line returns midpoint', () => {
        const result = compile('let p = @{ h 100 }; let pt = p.get(0.5); log(pt.x, pt.y);');
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('0');
      });

      it('get() on multi-segment path', () => {
        // v 20 (length 20) then h 30 (length 30) → total 50
        // t = 0.4 → distance 20 → end of first segment
        const result = compile('let p = @{ v 20 h 30 }; let pt = p.get(0.4); log(pt.x, pt.y);');
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('20');
      });

      it('get() midpoint of multi-segment path', () => {
        // v 50 h 50 → total 100, t=0.5 → distance 50 → exactly at the corner
        const result = compile('let p = @{ v 50 h 50 }; let pt = p.get(0.5); log(pt.x, pt.y);');
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('50');
      });

      it('get() within second segment of multi-segment path', () => {
        // v 20 h 30 → total 50, t=0.6 → distance 30 → 10 into h 30 segment
        const result = compile('let p = @{ v 20 h 30 }; let pt = p.get(0.6); log(pt.x, pt.y);');
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('20');
      });

      it('returns PointValue with accessible x and y', () => {
        const result = compile(`
          let p = @{ h 100 };
          let pt = p.get(0.25);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('25');
        expect(result.logs[0].parts[1].value).toBe('0');
      });
    });

    describe('tangent(t)', () => {
      it('tangent on horizontal line points right', () => {
        const result = compile('let p = @{ h 100 }; let t = p.tangent(0.5); log(t.angle);');
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
      });

      it('tangent on vertical line (downward) points down', () => {
        const result = compile('let p = @{ v 100 }; let t = p.tangent(0.5); log(t.angle);');
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(Math.PI / 2, 5);
      });

      it('tangent on leftward horizontal line', () => {
        const result = compile('let p = @{ h -100 }; let t = p.tangent(0.5); log(t.angle);');
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(Math.PI, 4);
      });

      it('tangent on upward vertical line', () => {
        const result = compile('let p = @{ v -100 }; let t = p.tangent(0.5); log(t.angle);');
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-Math.PI / 2, 5);
      });

      it('tangent returns point and angle', () => {
        const result = compile(`
          let p = @{ h 100 };
          let t = p.tangent(0.5);
          log(t.point.x, t.point.y, t.angle);
        `);
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('0');
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(0, 5);
      });

      it('tangent on quadratic bezier curve', () => {
        // q 50 0 50 50 — starts going right, ends going down
        const result = compile(`
          let p = @{ q 50 0 50 50 };
          let t0 = p.tangent(0);
          let t1 = p.tangent(1);
          log(t0.angle, t1.angle);
        `);
        // At t=0, tangent points right (angle ~ 0)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 1);
        // At t=1, tangent points down (angle ~ π/2)
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(Math.PI / 2, 1);
      });
    });

    describe('normal(t)', () => {
      it('normal is tangent minus π/2', () => {
        const result = compile(`
          let p = @{ h 100 };
          let n = p.normal(0.5);
          log(n.angle);
        `);
        // Tangent is 0 (rightward), normal should be -π/2 (upward)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-Math.PI / 2, 5);
      });

      it('normal on downward vertical line', () => {
        const result = compile(`
          let p = @{ v 100 };
          let n = p.normal(0.5);
          log(n.angle);
        `);
        // Tangent is π/2, normal = π/2 - π/2 = 0 (rightward)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
      });

      it('normal returns point and angle', () => {
        const result = compile(`
          let p = @{ h 100 };
          let n = p.normal(0.25);
          log(n.point.x, n.point.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('25');
        expect(result.logs[0].parts[1].value).toBe('0');
      });
    });

    describe('partition(n)', () => {
      it('partition(1) returns start and end', () => {
        const result = compile(`
          let p = @{ h 100 };
          let pts = p.partition(1);
          log(pts.length, pts[0].point, pts[1].point);
        `);
        expect(result.logs[0].parts[0].value).toBe('2');
        expect(result.logs[0].parts[1].value).toBe('Point(0, 0)');
        expect(result.logs[0].parts[2].value).toBe('Point(100, 0)');
      });

      it('partition(4) returns 5 evenly spaced points', () => {
        const result = compile(`
          let p = @{ h 100 };
          let pts = p.partition(4);
          log(pts.length);
          log(pts[0].point.x, pts[1].point.x, pts[2].point.x, pts[3].point.x, pts[4].point.x);
        `);
        expect(result.logs[0].parts[0].value).toBe('5');
        expect(result.logs[1].parts[0].value).toBe('0');
        expect(result.logs[1].parts[1].value).toBe('25');
        expect(result.logs[1].parts[2].value).toBe('50');
        expect(result.logs[1].parts[3].value).toBe('75');
        expect(result.logs[1].parts[4].value).toBe('100');
      });

      it('partition points have angle property', () => {
        const result = compile(`
          let p = @{ h 100 };
          let pts = p.partition(2);
          log(pts[0].angle);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
      });

      it('partition on multi-segment path', () => {
        const result = compile(`
          let p = @{ v 50 h 50 };
          let pts = p.partition(2);
          log(pts[0].point, pts[1].point, pts[2].point);
        `);
        // total length 100, partition(2): t=0, t=0.5, t=1
        // t=0 → (0,0), t=0.5 → (0,50) [end of v 50], t=1 → (50,50)
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
        expect(result.logs[0].parts[1].value).toBe('Point(0, 50)');
        expect(result.logs[0].parts[2].value).toBe('Point(50, 50)');
      });

      it('partition can be iterated with for-in', () => {
        const result = compile(`
          let p = @{ h 100 };
          let pts = p.partition(2);
          for (pt in pts) {
            log(pt.point.x);
          }
        `);
        expect(result.logs).toHaveLength(3);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('50');
        expect(result.logs[2].parts[0].value).toBe('100');
      });
    });

    describe('smooth commands (t / s) sample on the curve, not the chord', () => {
      // A smooth quadratic `t` has an implicit control point = reflection of the
      // previous quadratic control point about the current point. Sampling must
      // honor that reflected control point, exactly like the explicit `q` form.
      //
      //   start (0,0) → q cp(0,100) end(100,100) → t end(200,0)
      //   reflected cp for t = 2*(100,100) - (0,100) = (200,100)
      // so `t 100 -100` is identical to the explicit `q 100 0 100 -100`.
      const T_PATH = '@{ m 0 0 q 0 100 100 100 t 100 -100 }';
      const T_PATH_EXPLICIT = '@{ m 0 0 q 0 100 100 100 q 100 0 100 -100 }';

      it('t segment matches the equivalent explicit q at every sampled t', () => {
        for (const tv of [0.5, 0.7, 0.85, 1]) {
          const result = compile(`
            let a = ${T_PATH};
            let b = ${T_PATH_EXPLICIT};
            log(a.get(${tv}).x, a.get(${tv}).y, b.get(${tv}).x, b.get(${tv}).y);
          `);
          const [ax, ay, bx, by] = result.logs[0].parts.map((p) => Number(p.value));
          expect(ax).toBeCloseTo(bx, 4);
          expect(ay).toBeCloseTo(by, 4);
        }
      });

      it('t sample bulges off the chord (regression for straight-line sampling)', () => {
        // The chord of the t segment runs (100,100)→(200,0); its quadratic
        // bulges to the +x/+y side. A point sampled inside the t segment must
        // lie off that chord. Before the fix the sample sat exactly on it.
        const result = compile(`
          let a = ${T_PATH};
          let pt = a.get(0.85);
          log(pt.x, pt.y);
        `);
        const x = Number(result.logs[0].parts[0].value);
        const y = Number(result.logs[0].parts[1].value);
        // Chord (100,100)→(200,0): points satisfy x + y = 200. The curve is
        // strictly outside, so x + y > 200 for an interior sample.
        expect(x + y).toBeGreaterThan(201);
      });

      it('length of a t path equals its explicit-q equivalent (curve, not chord)', () => {
        const result = compile(`
          let a = ${T_PATH};
          let b = ${T_PATH_EXPLICIT};
          log(a.length, b.length);
        `);
        const aLen = Number(result.logs[0].parts[0].value);
        const bLen = Number(result.logs[0].parts[1].value);
        expect(aLen).toBeCloseTo(bLen, 3);
        // The t segment's chord is hypot(100,100) ≈ 141.42; its curve is longer,
        // so the whole-path length must exceed the q-segment length + chord.
        const qSegmentChord = Math.hypot(100, 100); // (0,0)->(100,100)
        const tSegmentChord = Math.hypot(100, 100); // (100,100)->(200,0)
        expect(aLen).toBeGreaterThan(qSegmentChord + tSegmentChord + 1);
      });

      it('partition over a t segment matches the explicit-q partition pointwise', () => {
        const result = compile(`
          let a = ${T_PATH};
          let b = ${T_PATH_EXPLICIT};
          let pa = a.partition(8);
          let pb = b.partition(8);
          for (i in 0..8) {
            log(pa[i].point.x, pa[i].point.y, pb[i].point.x, pb[i].point.y);
          }
        `);
        expect(result.logs).toHaveLength(9);
        for (const entry of result.logs) {
          const [ax, ay, bx, by] = entry.parts.map((p) => Number(p.value));
          expect(ax).toBeCloseTo(bx, 4);
          expect(ay).toBeCloseTo(by, 4);
        }
      });

      it('t tangent matches the curve tangent, not the chord direction', () => {
        // Chord direction of the t segment is atan2(-100,100) = -PI/4.
        // The curve tangent at an interior point differs from the chord.
        const result = compile(`
          let a = ${T_PATH};
          let b = ${T_PATH_EXPLICIT};
          log(a.tangent(0.85).angle, b.tangent(0.85).angle);
        `);
        const aAngle = Number(result.logs[0].parts[0].value);
        const bAngle = Number(result.logs[0].parts[1].value);
        expect(aAngle).toBeCloseTo(bAngle, 4);
        expect(Math.abs(aAngle - -Math.PI / 4)).toBeGreaterThan(0.05);
      });

      it('smooth cubic s matches the equivalent explicit c at every sampled t', () => {
        // Geometry chosen so the reflected first control point does NOT coincide
        // with the segment start (otherwise a degenerate cp1=start would pass too):
        //   start(0,0) → c cp1(20,60) cp2(40,60) end(60,0) → s cp2(100,-60) end(120,0)
        //   reflected cp1 for s = 2*(60,0) - (40,60) = (80,-60); relative to start
        //   (60,0) that is (20,-60). So `s 40 -60 60 0` == explicit `c 20 -60 40 -60 60 0`.
        const S_PATH = '@{ m 0 0 c 20 60 40 60 60 0 s 40 -60 60 0 }';
        const S_PATH_EXPLICIT = '@{ m 0 0 c 20 60 40 60 60 0 c 20 -60 40 -60 60 0 }';
        for (const tv of [0.5, 0.75, 0.9]) {
          const result = compile(`
            let a = ${S_PATH};
            let b = ${S_PATH_EXPLICIT};
            log(a.get(${tv}).x, a.get(${tv}).y, b.get(${tv}).x, b.get(${tv}).y);
          `);
          const [ax, ay, bx, by] = result.logs[0].parts.map((p) => Number(p.value));
          expect(ax).toBeCloseTo(bx, 4);
          expect(ay).toBeCloseTo(by, 4);
        }
      });
    });

    describe('on ProjectedPathValue', () => {
      it('get() on projected path uses absolute coordinates', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(10, 20);
          let pt = proj.get(0.5);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('60');
        expect(result.logs[0].parts[1].value).toBe('20');
      });

      it('tangent() on projected path', () => {
        const result = compile(`
          let p = @{ v 100 };
          let proj = p.project(10, 20);
          let t = proj.tangent(0.5);
          log(t.point.x, t.point.y, t.angle);
        `);
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('70');
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(Math.PI / 2, 5);
      });

      it('normal() on projected path', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(5, 5);
          let n = proj.normal(0);
          log(n.angle);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-Math.PI / 2, 5);
      });

      it('partition() on projected path', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(10, 10);
          let pts = proj.partition(2);
          log(pts[0].point, pts[1].point, pts[2].point);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
        expect(result.logs[0].parts[1].value).toBe('Point(60, 10)');
        expect(result.logs[0].parts[2].value).toBe('Point(110, 10)');
      });

      it('sampling on draw() result', () => {
        const result = compile(`
          let p = @{ h 100 };
          M 10 20
          let proj = p.draw();
          let mid = proj.get(0.5);
          log(mid.x, mid.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('60');
        expect(result.logs[0].parts[1].value).toBe('20');
      });
    });

    describe('errors', () => {
      it('get() with t < 0 throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.get(-0.1);')).toThrow(/between 0 and 1/);
      });

      it('get() with t > 1 throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.get(1.5);')).toThrow(/between 0 and 1/);
      });

      it('tangent() with out-of-range t throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.tangent(-0.1);')).toThrow(/between 0 and 1/);
      });

      it('normal() with out-of-range t throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.normal(2);')).toThrow(/between 0 and 1/);
      });

      it('partition() with 0 throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(0);')).toThrow(/positive integer/);
      });

      it('partition() with negative throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(-1);')).toThrow(/positive integer/);
      });

      it('partition() with non-integer throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(2.5);')).toThrow(/positive integer/);
      });
    });

    describe('edge cases', () => {
      it('single-command path', () => {
        const result = compile(`
          let p = @{ h 50 };
          let pt = p.get(0.5);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('25');
        expect(result.logs[0].parts[1].value).toBe('0');
      });

      it('zero-length path returns start point', () => {
        // m 0 0 creates a zero-length path
        const result = compile(`
          let p = @{ m 0 0 };
          let pt = p.get(0);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
      });

      it('diagonal line midpoint', () => {
        const result = compile(`
          let p = @{ l 30 40 };
          let pt = p.get(0.5);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('15');
        expect(result.logs[0].parts[1].value).toBe('20');
      });

      it('path with closePath (z)', () => {
        const result = compile(`
          let p = @{ h 30 v 40 z };
          let pt = p.get(0);
          log(pt.x, pt.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
      });
    });
  });

  describe('transforms', () => {
    describe('reverse()', () => {
      it('reverses a horizontal line', () => {
        const result = compile(`
          let p = @{ h 50 };
          let r = p.reverse();
          log(r.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(-50, 0)');
      });

      it('reverses a multi-segment path', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let r = p.reverse();
          log(r.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(-50, -30)');
      });

      it('preserves total length', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          log(p.length, p.reverse().length);
        `);
        expect(result.logs[0].parts[0].value).toBe(result.logs[0].parts[1].value);
      });

      it('startPoint of reversed PathBlock is (0, 0) — reverse self-rebases', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let r = p.reverse();
          log(r.startPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('preserves z on closed path', () => {
        const result = compile(`
          let p = @{ h 30 v 30 h -30 z };
          let r = p.reverse();
          M 10 10
          r.draw()
        `);
        const path = compilePath(`
          let p = @{ h 30 v 30 h -30 z };
          let r = p.reverse();
          M 10 10
          r.draw()
        `);
        expect(path).toContain('z');
      });

      it('reverses cubic bezier', () => {
        const result = compile(`
          let p = @{ c 0 -40 50 -40 50 0 };
          log(p.length, p.reverse().length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const revLen = Number(result.logs[0].parts[1].value);
        expect(revLen).toBeCloseTo(origLen, 0);
      });

      it('reverses quadratic bezier', () => {
        const result = compile(`
          let p = @{ q 25 -40 50 0 };
          log(p.length, p.reverse().length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const revLen = Number(result.logs[0].parts[1].value);
        expect(revLen).toBeCloseTo(origLen, 0);
      });

      it('reverses arc', () => {
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          log(p.length, p.reverse().length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const revLen = Number(result.logs[0].parts[1].value);
        expect(revLen).toBeCloseTo(origLen, 0);
      });

      it('converts S to C before reversal', () => {
        const result = compile(`
          let p = @{ c 10 -20 30 -20 40 0 s 30 20 40 0 };
          let r = p.reverse();
          log(r.endPoint);
          log(r.length);
        `);
        // Reversed endpoint should be (-80, 0) — the negation of original endpoint
        expect(result.logs[0].parts[0].value).toBe('Point(-80, 0)');
        // Reversed path should have positive length
        expect(Number(result.logs[1].parts[0].value)).toBeGreaterThan(0);
      });

      it('can draw reversed path', () => {
        const path = compilePath(`
          let p = @{ h 50 v 30 };
          let r = p.reverse();
          M 100 100
          r.draw()
        `);
        expect(path).toContain('M 100 100');
        expect(path.length).toBeGreaterThan('M 100 100'.length);
      });

      it('works on ProjectedPathValue', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let proj = p.project(10, 20);
          let r = proj.reverse();
          log(r.startPoint, r.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(60, 50)');
        expect(result.logs[0].parts[1].value).toBe('Point(10, 20)');
      });

      it('throws error with arguments', () => {
        expect(() => compile('let p = @{ h 50 }; p.reverse(1);')).toThrow(/0 arguments/);
      });
    });

    describe('boundingBox()', () => {
      it('bounding box of horizontal line', () => {
        const result = compile(`
          let p = @{ h 100 };
          let bb = p.boundingBox();
          log(bb.x, bb.y, bb.width, bb.height);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
        expect(result.logs[0].parts[2].value).toBe('100');
        expect(result.logs[0].parts[3].value).toBe('0');
      });

      it('bounding box of L-shaped path', () => {
        const result = compile(`
          let p = @{ v 30 h 50 };
          let bb = p.boundingBox();
          log(bb.x, bb.y, bb.width, bb.height);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
        expect(result.logs[0].parts[2].value).toBe('50');
        expect(result.logs[0].parts[3].value).toBe('30');
      });

      it('bounding box with negative coords', () => {
        const result = compile(`
          let p = @{ h -50 v -30 };
          let bb = p.boundingBox();
          log(bb.x, bb.y, bb.width, bb.height);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBe(-50);
        expect(Number(result.logs[0].parts[1].value)).toBe(-30);
        expect(result.logs[0].parts[2].value).toBe('50');
        expect(result.logs[0].parts[3].value).toBe('30');
      });

      it('cubic bezier extrema extend beyond endpoints', () => {
        const result = compile(`
          let p = @{ c 0 -40 50 -40 50 0 };
          let bb = p.boundingBox();
          log(bb.y);
        `);
        // Curve extends above (negative y) beyond the endpoints
        expect(Number(result.logs[0].parts[0].value)).toBeLessThan(0);
      });

      it('bounding box of closed path', () => {
        const result = compile(`
          let p = @{ h 40 v 20 h -40 z };
          let bb = p.boundingBox();
          log(bb.x, bb.y, bb.width, bb.height);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
        expect(result.logs[0].parts[2].value).toBe('40');
        expect(result.logs[0].parts[3].value).toBe('20');
      });

      it('bounding box on ProjectedPath has absolute coords', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(10, 20);
          let bb = proj.boundingBox();
          log(bb.x, bb.y, bb.width, bb.height);
        `);
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('20');
        expect(result.logs[0].parts[2].value).toBe('100');
        expect(result.logs[0].parts[3].value).toBe('0');
      });

      it('throws error with arguments', () => {
        expect(() => compile('let p = @{ h 50 }; p.boundingBox(1);')).toThrow(/0 arguments/);
      });
    });

    describe('centerPoint()', () => {
      it('center of horizontal line', () => {
        const result = compile(`
          let p = @{ h 100 };
          log(p.centerPoint());
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(50, 0)');
      });

      it('center of closed rectangle', () => {
        const result = compile(`
          let p = @{ h 40 v 20 h -40 z };
          log(p.centerPoint());
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(20, 10)');
      });

      it('docs example: the plate pivots on its center when drawn', () => {
        const result = compile(`
          let plate = @{
            h 60
            v 40
            h -60
            z
          };
          let center = plate.centerPoint();
          log(center);
          M 20 20
          let spun = plate.rotate(15deg, center).draw();
          log(spun.centerPoint());
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(30, 20)');
        // A rectangle rotated about its bbox center keeps that center: pen (20, 20) + (30, 20)
        const spun = /Point\(([-\d.]+), ([-\d.]+)\)/.exec(result.logs[1].parts[0].value)!;
        expect(Number(spun[1])).toBeCloseTo(50, 10);
        expect(Number(spun[2])).toBeCloseTo(40, 10);
      });

      it('center with negative coords', () => {
        const result = compile(`
          let p = @{ h -50 v -30 };
          let c = p.centerPoint();
          log(c.x, c.y);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBe(-25);
        expect(Number(result.logs[0].parts[1].value)).toBe(-15);
      });

      it('center accounts for cubic bezier extrema', () => {
        // y(t) = -120·t·(1-t) bottoms out at t = 0.5 → bbox y = -30, height = 30
        const result = compile(`
          let p = @{ c 0 -40 50 -40 50 0 };
          let c = p.centerPoint();
          log(c.x, c.y);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(25, 6);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(-15, 6);
      });

      it('center is the midpoint of boundingBox()', () => {
        const result = compile(`
          let p = @{ q 30 -50 60 0 v 20 h -20 a 10 10 0 0 1 -20 10 };
          let bb = p.boundingBox();
          let c = p.centerPoint();
          log(bb.x, bb.width, bb.y, bb.height, c.x, c.y);
        `);
        const [bx, bw, by, bh, cx, cy] = result.logs[0].parts.map((part) => Number(part.value));
        expect(cx).toBeCloseTo(bx + bw / 2, 10);
        expect(cy).toBeCloseTo(by + bh / 2, 10);
      });

      it('centerPoint on ProjectedPath has absolute coords', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(10, 20);
          log(proj.centerPoint());
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(60, 20)');
      });

      it('returns a real Point with members and methods', () => {
        const result = compile(`
          let p = @{ h 100 v 10 };
          let c = p.centerPoint();
          log(c.x, c.y, c.translate(5, 5), c.distanceTo(Point(50, 5)));
        `);
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('5');
        expect(result.logs[0].parts[2].value).toBe('Point(55, 10)');
        expect(result.logs[0].parts[3].value).toBe('0');
      });

      it('center of empty path block is the origin', () => {
        const result = compile(`
          let p = @{};
          log(p.centerPoint());
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('rotating about centerPoint keeps each cut piece centered (docs example)', () => {
        const result = compile(`
          let plate = @{ h 60 v 40 h -60 z };
          let knife = @{ m 30 -10 l 0 60 };
          let pieces = plate.cut(knife);
          for (piece in pieces) {
            let center = piece.centerPoint();
            let spunPiece = piece.rotate(5deg, center);
            log(center.x, center.y, spunPiece.centerPoint().x, spunPiece.centerPoint().y);
            M 20 20
            spunPiece.draw();
          }
        `);
        expect(result.logs).toHaveLength(2);
        for (const entry of result.logs) {
          const [cx, cy, sx, sy] = entry.parts.map((part) => Number(part.value));
          // A rectangle rotated about its bbox center stays centered on it
          expect(sx).toBeCloseTo(cx, 10);
          expect(sy).toBeCloseTo(cy, 10);
        }
        // One draw per piece, each starting from the shared pen position
        expect(result.layers[0].data.match(/M 20 20/g)).toHaveLength(2);
        expect(result.layers[0].data).toHaveSVGCommandCount('z', 2);
      });

      it('throws error with arguments', () => {
        expect(() => compile('let p = @{ h 50 }; p.centerPoint(1);')).toThrow(/0 arguments/);
      });

      it('PathBlock and ProjectedPath centers both feed path arguments', () => {
        const result = compile(`
          let p = @{ h 100 v 20 };
          let c = p.centerPoint();
          M calc(c.x) calc(c.y)
          let proj = p.project(10, 20);
          let pc = proj.centerPoint();
          M calc(pc.x) calc(pc.y)
        `);
        expect(result.layers[0].data).toBe('M 50 10 M 60 30');
      });
    });

    describe('offset()', () => {
      it('horizontal line offset preserves length', () => {
        const result = compile(`
          let p = @{ h 100 };
          let o = p.offset(5);
          log(p.length, o.length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const offLen = Number(result.logs[0].parts[1].value);
        expect(offLen).toBeCloseTo(origLen, 0);
      });

      it('L-shaped path offset has positive length', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let o = p.offset(5);
          log(o.length);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
      });

      it('negative offset goes to the right', () => {
        // For a rightward horizontal line projected at (0, 50):
        // positive offset = above (left-hand), negative = below (right-hand)
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(0, 50);
          let pos = proj.offset(5);
          let neg = proj.offset(-5);
          log(pos.startPoint.y, neg.startPoint.y);
        `);
        // Positive offset: y should be less than 50 (above for rightward path)
        expect(Number(result.logs[0].parts[0].value)).toBeLessThan(50);
        // Negative offset: y should be greater than 50 (below)
        expect(Number(result.logs[0].parts[1].value)).toBeGreaterThan(50);
      });

      it('can draw offset path', () => {
        const path = compilePath(`
          let p = @{ h 60 v 40 };
          let o = p.offset(5);
          M 10 10
          o.draw()
        `);
        expect(path).toContain('M 10 10');
        expect(path.length).toBeGreaterThan('M 10 10'.length);
      });

      it('works on ProjectedPathValue', () => {
        const result = compile(`
          let p = @{ h 100 };
          let proj = p.project(10, 20);
          let o = proj.offset(5);
          log(o.startPoint.x, o.startPoint.y);
        `);
        // Offset of rightward line by +5 moves start up (y - 5)
        expect(Number(result.logs[0].parts[0].value)).toBe(10);
        expect(Number(result.logs[0].parts[1].value)).toBe(15);
      });

      it('throws error with 0 arguments', () => {
        expect(() => compile('let p = @{ h 50 }; p.offset();')).toThrow(/argument/);
      });

      it('throws error with non-number argument', () => {
        expect(() => compile('let p = @{ h 50 }; p.offset("abc");')).toThrow(/must be a number/);
      });
    });

    describe('offset() joins and curve quality', () => {
      // The yoke contour from the Cutting Room garment post, authored
      // directly: a fold line entering a bowed neck curve at a ~48°
      // corner. The historical defect baked the corner's miter spike
      // into the neck cubic's frame, over-growing the offset ring.
      const YOKE = `let yoke = @{
  l 0 -31.86
  c 16 18 34 20 46 6
  l 22 8
  c -5.38 7.17 -6.34 13.94 -4.68 20.13
  c -21.27 -0.55 -41 -0.07 -63.32 -2.27
  z
};`;

      it('sharp line-to-curve corner: offset ring grows ~2d, no miter spike', () => {
        const result = compile(`${YOKE}
let placed = yoke.project(100, 100);
let ring = placed.offset(7);
let b1 = placed.boundingBox();
let b2 = ring.boundingBox();
log(b2.width - b1.width);
log(b2.height - b1.height);
M 0 0`);
        // Bevels legitimately truncate sharp-corner extremes, so growth
        // sits a little under 2d — but never spikes past it (the
        // historical defect grew height by 25.7 for d=7).
        const growW = Number(result.logs[0].parts[0].value);
        const growH = Number(result.logs[1].parts[0].value);
        expect(growW).toBeGreaterThan(11);
        expect(growW).toBeLessThan(15);
        expect(growH).toBeGreaterThan(11);
        expect(growH).toBeLessThan(15);
      });

      it("with { join: 'round' } the ring grows exactly 2d in both axes", () => {
        const result = compile(`${YOKE}
let placed = yoke.project(100, 100);
let ring = placed.offset(7, { join: 'round' });
let b1 = placed.boundingBox();
let b2 = ring.boundingBox();
log(b2.width - b1.width);
log(b2.height - b1.height);
M 0 0`);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(14, 0);
        expect(Number(result.logs[1].parts[0].value)).toBeCloseTo(14, 0);
      });

      it('cut yoke piece: offset allowance grows ~2d in both axes (regression)', () => {
        const result = compile(`
let bodice = @{
  c 16 18 34 20 46 6 as segment('neck')
  l 22 8
  c -12 16 -2 30 10 40
  l 6 96
  h -84
  z
};
let pieces = bodice.cut(@{
  m -15 30
  c 40 6 70 2 110 6
});
for (piece in pieces) {
  let placed = piece.project(60, 40);
  if (placed.segmentAll('neck').length > 0) {
    let ring = placed.offset(7);
    let b1 = placed.boundingBox();
    let b2 = ring.boundingBox();
    log(b2.width - b1.width);
    log(b2.height - b1.height);
  }
}
M 0 0`);
        const growW = Number(result.logs[0].parts[0].value);
        const growH = Number(result.logs[1].parts[0].value);
        expect(growW).toBeGreaterThan(11);
        expect(growW).toBeLessThan(15);
        expect(growH).toBeGreaterThan(11);
        expect(growH).toBeLessThan(15);
      });

      it('closed rectangle offset is a clean expanded rectangle with miter corners', () => {
        const result = compile(`
let p = @{
  h 60
  v 40
  h -60
  z
};
let ring = p.offset(5);
ring.drawTo(10, 10);`);
        // A 60x40 rectangle offset outward by 5 is a symmetric 70x50
        // rectangle — every corner mitred, including the closure corner.
        expect(result.layers[0].data).toBe('M 10 10 l 70 0 l 0 50 l -70 0 z');
      });

      it('deep cubic scoop offsets as a true parallel curve (midpoint at distance d)', () => {
        const result = compile(`
let curve = @{
  c 0 -40 50 -40 50 0
};
let placed = curve.project(0, 100);
let par = placed.offset(3);
let cm = placed.get(0.5);
let pm = par.get(0.5);
let gapSq = calc((pm.x - cm.x) * (pm.x - cm.x) + (pm.y - cm.y) * (pm.y - cm.y));
log(gapSq);
M 0 0`);
        // distance² ≈ 9 — the offset midpoint sits d away from the curve's
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(9, 0);
      });

      it("offset(d, { join: 'round' }) inserts arc connectors at sharp corners", () => {
        const result = compile(`
let bracket = @{
  h 40
  l -30 30
};
let ring = bracket.offset(6, { join: 'round' });
ring.drawTo(50, 50);`);
        expect(result.layers[0].data).toMatch(/ a /);
      });

      it("offset(d, { join: 'bevel' }) forces bevels at right-angle corners", () => {
        const result = compile(`
let p = @{
  h 60
  v 40
};
let ring = p.offset(5, { join: 'bevel' });
ring.drawTo(10, 10);`);
        // two offset lines plus one bevel connector
        const lineCount = (result.layers[0].data.match(/ l /g) || []).length;
        expect(lineCount).toBeGreaterThanOrEqual(3);
      });

      it('rejects an unknown join value', () => {
        expect(() => compile("let p = @{ h 50 v 20 }; p.offset(5, { join: 'fancy' });")).toThrow(/join/);
      });

      // A straight top edge with a cubic dip cut into it, offset toward
      // the concave side: the offset sides cross at the two line-curve
      // junctions, and the ring must be trimmed there — never given an
      // external connector that loops outside the silhouette.
      const NOTCH = `let notch = @{
  h 20
  c 5 15 15 15 20 0
  h 20
  v 30
  h -60
  z
};`;

      for (const joinMode of ['miter', 'bevel', 'round']) {
        it(`concave line-curve junctions trim cleanly with join: '${joinMode}'`, () => {
          const result = compile(`${NOTCH}
let placed = notch.project(100, 100);
let ring = placed.offset(-5, { join: '${joinMode}' });
let b1 = placed.boundingBox();
let b2 = ring.boundingBox();
log(b2.x - b1.x);
log(b2.y - b1.y);
log(b1.width - b2.width);
M 0 0`);
          // The inward ring sits strictly inside the original: ~5 in from
          // every side. An untrimmed junction spikes outside those bounds.
          expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(4);
          expect(Number(result.logs[1].parts[0].value)).toBeGreaterThan(4);
          expect(Number(result.logs[2].parts[0].value)).toBeGreaterThan(9);
        });
      }

      it('a donut (two-subpath) path offsets both rings', () => {
        const result = compile(`
let donut = @{
  circle(0, 0, 40);
  circle(0, 0, 15);
};
let placed = donut.project(100, 100);
let grown = placed.offset(5);
let b1 = placed.boundingBox();
let b2 = grown.boundingBox();
log(b2.width - b1.width);
M 0 0`);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(10, 0);
      });

      it('zero-length interior segments are dropped, not offset by a fallback normal', () => {
        const result = compile(`
let p = @{
  h 30
  l 0 0
  v 20
};
let ring = p.offset(5);
ring.drawTo(10, 10);`);
        // The degenerate l 0 0 must not survive as a stray segment; the
        // corner between h and v joins as if it were never there.
        const withZero = result.layers[0].data;
        const clean = compile(`
let p = @{
  h 30
  v 20
};
let ring = p.offset(5);
ring.drawTo(10, 10);`).layers[0].data;
        expect(withZero).toBe(clean);
      });

      it('a labeled edge that turns a sharp corner stays one queryable run', () => {
        const result = compile(`
let p = @{
  h 40 as segment('edge')
  l -30 30 as segment('edge')
};
let placed = p.project(50, 50);
let ring = placed.offset(6);
log(ring.segmentAll('edge').length);
M 0 0`);
        expect(Number(result.logs[0].parts[0].value)).toBe(1);
      });
    });

    describe('mirror()', () => {
      it('horizontal line mirrored across vertical axis', () => {
        const result = compile(`
          let p = @{ h 50 };
          let m = p.mirror(calc(90 * 3.14159265358979 / 180));
          log(m.endPoint);
        `);
        const ep = result.logs[0].parts[0].value;
        // mirror(90deg) across vertical: x → -x, y → y
        expect(ep).toMatch(/Point\(-50/);
      });

      it('L-shaped path mirrored across 45deg swaps x and y', () => {
        const result = compile(`
          let p = @{ h 30 v 0 };
          let m = p.mirror(calc(45 * 3.14159265358979 / 180));
          log(m.endPoint.x, m.endPoint.y);
        `);
        // mirror(45deg): swaps x and y → (30, 0) → (0, 30)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(30, 5);
      });

      it('preserves total length', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          log(p.length, p.mirror(calc(90 * 3.14159265358979 / 180)).length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const mirLen = Number(result.logs[0].parts[1].value);
        expect(mirLen).toBeCloseTo(origLen, 5);
      });

      it('startPoint (0,0) for the self-rebased PathBlockValue result', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let m = p.mirror(calc(90 * 3.14159265358979 / 180));
          log(m.startPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('mirrors cubic bezier (length preserved)', () => {
        const result = compile(`
          let p = @{ c 0 -40 50 -40 50 0 };
          let m = p.mirror(calc(90 * 3.14159265358979 / 180));
          log(p.length, m.length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const mirLen = Number(result.logs[0].parts[1].value);
        expect(mirLen).toBeCloseTo(origLen, 0);
      });

      it('arc sweep flag flips', () => {
        // a 25 25 0 0 1 50 0 → after mirror, sweep should be 0
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          let m = p.mirror(calc(90 * 3.14159265358979 / 180));
          log(m.length);
        `);
        // Should not throw and length should be positive
        expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
      });

      it('can draw result', () => {
        const path = compilePath(`
          let p = @{ h 50 v 30 };
          let m = p.mirror(calc(90 * 3.14159265358979 / 180));
          M 100 100
          m.draw();
        `);
        expect(path).toContain('M 100 100');
        expect(path.length).toBeGreaterThan('M 100 100'.length);
      });

      it('works on ProjectedPathValue (mirror line through startPoint)', () => {
        const result = compile(`
          let p = @{ h 50 };
          let proj = p.project(100, 100);
          let m = proj.mirror(calc(90 * 3.14159265358979 / 180));
          log(m.startPoint.x, m.startPoint.y, m.endPoint.x, m.endPoint.y);
        `);
        // Mirror across vertical through (100,100): startPoint stays, endPoint.x reflects
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(100, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(100, 5);
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(50, 5);
        expect(Number(result.logs[0].parts[3].value)).toBeCloseTo(100, 5);
      });

      it('throws error with 0 arguments', () => {
        expect(() => compile('let p = @{ h 50 }; p.mirror();')).toThrow(/1 argument/);
      });

      it('throws error with non-number argument', () => {
        expect(() => compile('let p = @{ h 50 }; p.mirror("abc");')).toThrow(/must be a number/);
      });
    });

    describe('rotate()', () => {
      it('rotates about the block origin by default and preserves the frame', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotate(0.5pi);
          log(r.vertices[0].x, r.vertices[0].y, r.endPoint.x, r.endPoint.y);
        `);
        // (0,0),(50,0),(50,50) about (0,0) by +90°: (0,0),(0,50),(-50,50).
        // Frame-preserving: vertex 0 stays at the origin, no re-base needed.
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(0, 5);
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(-50, 5);
        expect(Number(result.logs[0].parts[3].value)).toBeCloseTo(50, 5);
      });

      it('rotate(a) matches rotateAtVertexIndex(0, a) for origin-starting paths', () => {
        const a = compilePath(`
          let p = @{ h 50 v 50 };
          p.rotate(0.5pi).drawTo(10, 10);
        `);
        const b = compilePath(`
          let p = @{ h 50 v 50 };
          p.rotateAtVertexIndex(0, 0.5pi).drawTo(10, 10);
        `);
        expect(a).toBe(b);
      });

      it('rotates about an explicit Point pivot without re-basing', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotate(0.5pi, Point(25, 25));
          log(r.vertices[0].x, r.vertices[0].y, r.vertices[2].x, r.vertices[2].y);
        `);
        // About (25,25) by +90°: (0,0)→(50,0); (50,50)→(0,50).
        // Frame preserved: vertex 0 lands at (50,0), NOT re-based to origin.
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(50, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(0, 5);
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(0, 5);
        expect(Number(result.logs[0].parts[3].value)).toBeCloseTo(50, 5);
      });

      it('adjusts the arc rotation parameter', () => {
        const result = compilePath(`
          let p = @{ a 20 10 0 0 1 40 0 };
          p.rotate(0.5pi).drawTo(0, 0);
        `);
        // The ellipse's x-axis rotation gains 90 degrees.
        const parsed = parseSVGPath(result);
        const arc = parsed.find(c => c.command.toLowerCase() === 'a')!;
        expect(arc.args[2]).toBeCloseTo(90, 5);
      });

      it('ProjectedPath: default pivot is the projection start point', () => {
        const result = compile(`
          let p = @{ h 50 };
          let r = p.project(100, 100).rotate(0.5pi);
          log(r.endPoint.x, r.endPoint.y, r.startPoint.x, r.startPoint.y);
        `);
        // (150,100) about (100,100) by +90° → (100,150); start stays put.
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(100, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(150, 5);
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(100, 5);
        expect(Number(result.logs[0].parts[3].value)).toBeCloseTo(100, 5);
      });

      it('ProjectedPath: explicit absolute pivot', () => {
        const result = compile(`
          let p = @{ h 50 };
          let r = p.project(100, 100).rotate(0.5pi, Point(150, 100));
          log(r.startPoint.x, r.startPoint.y, r.endPoint.x, r.endPoint.y);
        `);
        // Pivot at the projected end: start (100,100) → (150,50); end fixed.
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(150, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(50, 5);
        expect(Number(result.logs[0].parts[2].value)).toBeCloseTo(150, 5);
        expect(Number(result.logs[0].parts[3].value)).toBeCloseTo(100, 5);
      });

      it('accepts Angle values', () => {
        const deg = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotate(90deg);
          log(r.endPoint.x, r.endPoint.y);
        `);
        expect(Number(deg.logs[0].parts[0].value)).toBeCloseTo(-50, 5);
        expect(Number(deg.logs[0].parts[1].value)).toBeCloseTo(50, 5);
      });

      it('validates arguments', () => {
        expect(() => compile('let p = @{ h 10 };\nlet r = p.rotate();')).toThrow(/expects 1-2 arguments/);
        expect(() => compile('let p = @{ h 10 };\nlet r = p.rotate(1, 5);')).toThrow(/origin must be a Point/);
      });
    });

    describe('rotateAtVertexIndex()', () => {
      it('rotate L-shape around vertex 0 (origin) by 90deg', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotateAtVertexIndex(0, calc(90 * 3.14159265358979 / 180));
          log(r.endPoint.x, r.endPoint.y);
        `);
        // Original vertices: (0,0), (50,0), (50,50)
        // Rotated around (0,0): (0,0), (0,50), (-50,50) → endPoint = (-50, 50)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-50, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(50, 5);
      });

      it('rotate around vertex 1 (corner) by 90deg', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotateAtVertexIndex(1, calc(90 * 3.14159265358979 / 180));
          log(r.endPoint.x, r.endPoint.y);
        `);
        // Vertices: (0,0)→idx0, (50,0)→idx1, (50,50)→idx2
        // Rotate around (50,0): (0,0)→(50,-50), (50,0)→(50,0), (50,50)→(0,0)
        // Normalized: origin at first cmd start (50,-50), endPoint = (0,0)-(50,-50) = (-50,50)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-50, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(50, 5);
      });

      it('rotate around last vertex by 180deg', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotateAtVertexIndex(2, calc(180 * 3.14159265358979 / 180));
          log(r.endPoint.x, r.endPoint.y);
        `);
        // Vertices: (0,0), (50,0), (50,50)
        // Rotate around (50,50) by 180: (0,0)→(100,100), (50,0)→(50,100), (50,50)→(50,50)
        // Normalized: origin at (100,100), endPoint = (50,50)-(100,100) = (-50,-50)
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(-50, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(-50, 5);
      });

      it('preserves total length', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          log(p.length, p.rotateAtVertexIndex(0, calc(45 * 3.14159265358979 / 180)).length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const rotLen = Number(result.logs[0].parts[1].value);
        expect(rotLen).toBeCloseTo(origLen, 5);
      });

      it('arc rotation parameter adjusts', () => {
        // Arc with 0 rotation, rotated by 45deg should have rotation ~45
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          let r = p.rotateAtVertexIndex(0, calc(45 * 3.14159265358979 / 180));
          log(r.length);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
      });

      it('startPoint (0,0) for the self-rebased PathBlockValue result', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let r = p.rotateAtVertexIndex(1, calc(90 * 3.14159265358979 / 180));
          log(r.startPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('can draw result', () => {
        const path = compilePath(`
          let p = @{ h 50 v 50 };
          let r = p.rotateAtVertexIndex(0, calc(45 * 3.14159265358979 / 180));
          M 100 100
          r.draw()
        `);
        expect(path).toContain('M 100 100');
        expect(path.length).toBeGreaterThan('M 100 100'.length);
      });

      it('works on ProjectedPathValue', () => {
        const result = compile(`
          let p = @{ h 50 v 50 };
          let proj = p.project(100, 100);
          let r = proj.rotateAtVertexIndex(0, calc(90 * 3.14159265358979 / 180));
          log(r.startPoint);
        `);
        // Vertex 0 for projected is (100,100), rotation around it keeps it fixed
        expect(result.logs[0].parts[0].value).toBe('Point(100, 100)');
      });

      it('throws error with negative index', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(-1, 0);')).toThrow(/out of range/);
      });

      it('throws error with out-of-range index', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(5, 0);')).toThrow(/out of range/);
      });

      it('throws error with non-integer index', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(1.5, 0);')).toThrow(/must be an integer/);
      });

      it('throws error with wrong arg count', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(0);')).toThrow(/2 arguments/);
      });

      it('throws error with non-number angle', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(0, "abc");')).toThrow(/must be a number/);
      });
    });

    describe('scale()', () => {
      it('uniform scale doubles horizontal line endpoint', () => {
        const result = compile(`
          let p = @{ h 50 };
          let s = p.scale(2, 2);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(100, 0)');
      });

      it('non-uniform scale stretches one axis', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(3, 1);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(150, 30)');
      });

      it('scale(1, 1) returns identical path', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(1, 1);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(50, 30)');
      });

      it('negative sx mirrors horizontally', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(-1, 1);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(-50, 30)');
      });

      it('length scales proportionally under uniform scale', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(2, 2);
          log(p.length, s.length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const scaledLen = Number(result.logs[0].parts[1].value);
        expect(scaledLen).toBeCloseTo(origLen * 2, 5);
      });

      it('startPoint (0,0) for the self-rebased PathBlockValue result', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(2, 3);
          log(s.startPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('scales cubic bezier endpoint', () => {
        const result = compile(`
          let p = @{ c 0 -40 50 -40 50 0 };
          let s = p.scale(2, 2);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(100, 0)');
      });

      it('scales arc with uniform factor (length check)', () => {
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          let s = p.scale(2, 2);
          log(p.length, s.length);
        `);
        const origLen = Number(result.logs[0].parts[0].value);
        const scaledLen = Number(result.logs[0].parts[1].value);
        expect(scaledLen).toBeCloseTo(origLen * 2, 0);
      });

      it('non-uniform scale on arc (endpoint check)', () => {
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          let s = p.scale(2, 1);
          log(s.endPoint.x, s.endPoint.y);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(100, 5);
        expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(0, 5);
      });

      it('negative scale flips arc sweep', () => {
        // scale(-1, 1) is a reflection → sweep should flip
        const result = compile(`
          let p = @{ a 25 25 0 0 1 50 0 };
          let s = p.scale(-1, 1);
          log(s.length);
        `);
        // Should not throw and length should be positive
        expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
      });

      it('can draw scaled path', () => {
        const path = compilePath(`
          let p = @{ h 50 v 30 };
          let s = p.scale(2, 2);
          M 10 10
          s.draw();
        `);
        expect(path).toContain('M 10 10');
        expect(path.length).toBeGreaterThan('M 10 10'.length);
      });

      it('works on ProjectedPathValue (startPoint preserved, endPoint scaled)', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let proj = p.project(10, 20);
          let s = proj.scale(2, 2);
          log(s.startPoint, s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(10, 20)');
        expect(result.logs[0].parts[1].value).toBe('Point(110, 80)');
      });

      it('scale(0, 1) collapses x-axis', () => {
        const result = compile(`
          let p = @{ h 50 v 30 };
          let s = p.scale(0, 1);
          log(s.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 30)');
      });

      it('throws error with 0 args', () => {
        expect(() => compile('let p = @{ h 50 }; p.scale();')).toThrow(/2 arguments/);
      });

      it('throws error with 1 arg', () => {
        expect(() => compile('let p = @{ h 50 }; p.scale(2);')).toThrow(/2 arguments/);
      });

      it('throws error with non-number arg', () => {
        expect(() => compile('let p = @{ h 50 }; p.scale("a", 1);')).toThrow(/must be a number/);
      });
    });

    describe('<< concatenation', () => {
      it('concatenates two simple paths (endpoint check)', () => {
        const result = compile(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b);
          log(c.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(50, 30)');
      });

      it('combined length equals sum', () => {
        const result = compile(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b);
          log(a.length, b.length, c.length);
        `);
        const aLen = Number(result.logs[0].parts[0].value);
        const bLen = Number(result.logs[0].parts[1].value);
        const cLen = Number(result.logs[0].parts[2].value);
        expect(cLen).toBeCloseTo(aLen + bLen, 5);
      });

      it('can draw concatenated path', () => {
        const path = compilePath(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b);
          M 10 10
          c.draw();
        `);
        expect(path).toContain('M 10 10');
        expect(path).toContain('h 50');
        expect(path).toContain('v 30');
      });

      it('startPoint (0,0) for the self-rebased result', () => {
        const result = compile(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b);
          log(c.startPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
      });

      it('chaining a << b << c', () => {
        const result = compile(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b << a);
          log(c.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(100, 30)');
      });

      it('self-concatenation p << p', () => {
        const result = compile(`
          let p = @{ h 50 };
          let c = calc(p << p);
          log(c.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(100, 0)');
      });

      it('empty left returns right', () => {
        const result = compile(`
          let empty = @{ };
          let b = @{ h 50 };
          let c = calc(empty << b);
          log(c.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(50, 0)');
      });

      it('empty right returns left', () => {
        const result = compile(`
          let a = @{ h 50 };
          let empty = @{ };
          let c = calc(a << empty);
          log(c.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(50, 0)');
      });

      it('preserves curve commands', () => {
        const result = compile(`
          let a = @{ c 0 -40 50 -40 50 0 };
          let b = @{ q 25 40 50 0 };
          let c = calc(a << b);
          log(c.length);
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeGreaterThan(0);
      });

      it('concatenation then transform', () => {
        const result = compile(`
          let a = @{ h 50 };
          let b = @{ v 30 };
          let c = calc(a << b);
          let r = c.reverse();
          log(r.endPoint);
        `);
        expect(result.logs[0].parts[0].value).toBe('Point(-50, -30)');
      });

      it('style block merge still works (regression)', () => {
        const result = compile(`
          let base = #{ stroke: red; stroke-width: 2; };
          let extra = #{ fill: blue; };
          let merged = calc(base << extra);
          log(merged.fill);
        `);
        expect(result.logs[0].parts[0].value).toBe('blue');
      });

      it('throws error for mixed PathBlock/StyleBlock types', () => {
        expect(() =>
          compile(`
          let p = @{ h 50 };
          let s = #{ stroke: red; };
          let x = calc(p << s);
        `),
        ).toThrow(/matching operand types/);
      });
    });
  });

  describe('context-aware functions emit relative commands', () => {
    it('tangentArc emits relative a command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          l 20 0
          tangentArc(20, 0.5pi);
        };
        M 100 100
        p.draw()
      `);
      // Should NOT contain uppercase A with absolute coords
      expect(result).not.toMatch(/A /);
      // Should contain lowercase a (relative arc)
      expect(result).toMatch(/a /);
      // The path should start at 100,100 and all commands should be relative
      expect(result).toContain('M 100 100');
    });

    it('tangentLine emits relative l command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          l 20 0
          tangentLine(30);
        };
        M 100 100
        p.draw()
      `);
      expect(result).not.toMatch(/L /);
      expect(result).toContain('M 100 100');
      // All line commands should be relative
      expect(result).toMatch(/l 20 0/);
      expect(result).toMatch(/l 30 /);
    });

    it('polarLine emits relative l command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          polarLine(0, 30);
        };
        M 100 100
        p.draw()
      `);
      expect(result).not.toMatch(/L /);
      expect(result).toMatch(/l /);
      expect(result).toContain('M 100 100');
    });

    it('polarMove emits relative command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          polarMove(0, 30);
        };
        M 100 100
        p.draw()
      `);
      expect(result).not.toMatch(/L /);
      expect(result).toMatch(/l /);
      expect(result).toContain('M 100 100');
    });

    it('arcFromPolarOffset emits relative a command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          v 20
          arcFromPolarOffset(1pi, 20, -0.5pi);
        };
        p.drawTo(100, 100);
      `);
      expect(result).not.toMatch(/A /);
      expect(result).toMatch(/a /);
      expect(result).toContain('M 100 100');
    });

    it('arcFromCenter emits relative commands inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          arcFromCenter(0, 20, 20, -0.5pi, 0, 1);
        };
        M 100 100
        p.draw()
      `);
      expect(result).not.toMatch(/A /);
      expect(result).toMatch(/a /);
      expect(result).toContain('M 100 100');
    });

    it('tangentArc produces correct geometry when drawn at non-origin', () => {
      // The key test: verify the arc endpoint is correct relative to draw position
      const result = compile(`
        let p = @{
          l 20 0
          tangentArc(20, 0.5pi);
        };
        moveTo(100, 100);
        p.draw();
        log(ctx.position.x);
        log(ctx.position.y);
      `);
      // Position after: start at (100,100), l 20 0 → (120, 100), tangentArc(20, 90°) → (140, 120)
      const x = parseFloat(result.logs[0].parts[0].value);
      const y = parseFloat(result.logs[1].parts[0].value);
      expect(x).toBeCloseTo(140, 0);
      expect(y).toBeCloseTo(120, 0);
    });

    it('chained tangentArc + tangentLine in PathBlock all use relative coords', () => {
      const result = compilePath(`
        let p = @{
          l 20 0
          tangentArc(20, 0.5pi);
          tangentLine(30);
        };
        M 50 50
        p.draw()
      `);
      // No uppercase absolute commands should appear in the PathBlock portion
      const afterMove = result.substring(result.indexOf('M 50 50') + 7);
      expect(afterMove).not.toMatch(/[ALCHVQST] /);
    });
  });

  describe('partition t property', () => {
    it('partition points have correct t values', () => {
      const result = compile(`
        let p = @{ h 100 };
        let pts = p.partition(4);
        for (pt in pts) {
          log(pt.t);
        }
      `);
      expect(result.logs).toHaveLength(5);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 10);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.25, 10);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(0.5, 10);
      expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(0.75, 10);
      expect(parseFloat(result.logs[4].parts[0].value)).toBeCloseTo(1, 10);
    });

    it('partition t works with n=1', () => {
      const result = compile(`
        let p = @{ h 100 };
        let pts = p.partition(1);
        log(pts[0].t);
        log(pts[1].t);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 10);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(1, 10);
    });

    it('partition t works on ProjectedPath', () => {
      const result = compile(`
        let p = @{ h 100 };
        let proj = p.project(10, 20);
        let pts = proj.partition(2);
        log(pts[0].t);
        log(pts[1].t);
        log(pts[2].t);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 10);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.5, 10);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(1, 10);
    });

    it('partition t is 0 at the first sample and 1 at the last', () => {
      const result = compile(`
        let p = @{ h 100 };
        let pts = p.partition(2);
        log(pts[0].t);
        log(pts[2].t);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 10);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(1, 10);
    });
  });

  describe('subPath', () => {
    it('subPath(0, 1) returns approximately the original path', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 1);
        log(sub.endPoint.x);
        log(sub.endPoint.y);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(100, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0, 1);
    });

    it('subPath(0, 0.5) returns first half of a line', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0.5);
        log(sub.endPoint.x);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(50, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(50, 1);
    });

    it('subPath(0.5, 1) returns second half of a line', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0.5, 1);
        log(sub.endPoint.x);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(50, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(50, 1);
    });

    it('subPath(t, t) returns empty path', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0.5, 0.5);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 1);
    });

    it('subPath(0, 0) returns empty path', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 1);
    });

    it('subPath with reversed range reverses direction', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(1, 0);
        log(sub.endPoint.x);
      `);
      // Reversed full path: ends at -100 (back to origin relative to new start)
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(-100, 1);
    });

    it('subPath on multi-segment path', () => {
      const result = compile(`
        let p = @{ h 50 v 50 };
        // Total length = 100, first half is all h 50
        let sub = p.subPath(0, 0.5);
        log(sub.endPoint.x);
        log(sub.endPoint.y);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(50, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0, 1);
    });

    it('subPath spanning two commands', () => {
      const result = compile(`
        let p = @{ h 50 v 50 };
        // Total length = 100, subPath(0.25, 0.75) spans h and v
        let sub = p.subPath(0.25, 0.75);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(50, 1);
    });

    it('subPath on cubic Bézier curve', () => {
      const result = compile(`
        let p = @{ c 0 -40 50 -40 50 0 };
        let sub = p.subPath(0, 0.5);
        let full = p.length;
        let half = sub.length;
        log(full);
        log(half);
      `);
      const full = parseFloat(result.logs[0].parts[0].value);
      const half = parseFloat(result.logs[1].parts[0].value);
      expect(half).toBeCloseTo(full / 2, 0);
    });

    it('subPath on quadratic Bézier curve', () => {
      const result = compile(`
        let p = @{ q 25 -40 50 0 };
        let sub = p.subPath(0, 0.5);
        let full = p.length;
        let half = sub.length;
        log(full);
        log(half);
      `);
      const full = parseFloat(result.logs[0].parts[0].value);
      const half = parseFloat(result.logs[1].parts[0].value);
      expect(half).toBeCloseTo(full / 2, 0);
    });

    it('subPath two halves reconstruct original length', () => {
      const result = compile(`
        let p = @{ h 50 v 50 h -30 };
        let a = p.subPath(0, 0.5);
        let b = p.subPath(0.5, 1);
        log(p.length);
        log(a.length);
        log(b.length);
      `);
      const full = parseFloat(result.logs[0].parts[0].value);
      const aLen = parseFloat(result.logs[1].parts[0].value);
      const bLen = parseFloat(result.logs[2].parts[0].value);
      expect(aLen + bLen).toBeCloseTo(full, 0);
    });

    it('subPath on ProjectedPath returns drawable PathBlock', () => {
      const result = compile(`
        let p = @{ h 100 };
        let proj = p.project(10, 20);
        let sub = proj.subPath(0, 0.5);
        // Returns PathBlock normalized to (0,0)
        log(sub.startPoint.x);
        log(sub.startPoint.y);
        log(sub.endPoint.x);
        log(sub.endPoint.y);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0, 1);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0, 1);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(50, 1);
      expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(0, 1);
    });

    it('subPath on ProjectedPath result can be drawn', () => {
      const result = compilePath(`
        let p = @{ h 100 };
        let proj = p.project(10, 20);
        let sub = proj.subPath(0, 0.5);
        let start = proj.get(0);
        M start.x start.y
        sub.draw()
      `);
      expect(result).toContain('M 10 20');
    });

    it('subPath result can be drawn', () => {
      const result = compilePath(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0.5);
        M 10 10
        sub.draw()
      `);
      expect(result).toContain('M 10 10');
    });

    it('subPath result can be chained with reverse', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0.5).reverse();
        log(sub.endPoint.x);
      `);
      // subPath(0, 0.5) gives h 50 (endpoint 50, 0)
      // reverse gives endpoint (-50, 0)
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(-50, 1);
    });

    it('subPath result supports length property', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0.25, 0.75);
        log(sub.length);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(50, 1);
    });

    it('subPath result supports get()', () => {
      const result = compile(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0.5);
        let mid = sub.get(0.5);
        log(mid.x);
      `);
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(25, 1);
    });

    it('subPath error: wrong arg count', () => {
      expect(() => compile('let p = @{ h 100 }; p.subPath(0.5);')).toThrow('subPath() expects 2 arguments');
    });

    it('subPath error: non-number', () => {
      expect(() => compile('let p = @{ h 100 }; p.subPath("a", 1);')).toThrow('subPath() startT must be a number');
    });

    it('subPath error: out of range startT', () => {
      expect(() => compile('let p = @{ h 100 }; p.subPath(-0.5, 1);')).toThrow(
        'subPath() startT must be between 0 and 1',
      );
    });

    it('subPath error: out of range endT', () => {
      expect(() => compile('let p = @{ h 100 }; p.subPath(0, 1.5);')).toThrow('subPath() endT must be between 0 and 1');
    });

    it('subPath on arc command', () => {
      const result = compile(`
        let p = @{ a 25 25 0 0 1 50 0 };
        let a = p.subPath(0, 0.5);
        let b = p.subPath(0.5, 1);
        log(a.length);
        log(b.length);
        log(a.endPoint.x);
        log(a.endPoint.y);
      `);
      const aLen = parseFloat(result.logs[0].parts[0].value);
      const bLen = parseFloat(result.logs[1].parts[0].value);
      // Two halves should have equal lengths
      expect(aLen).toBeCloseTo(bLen, 1);
      // Each half covers a quarter-circle (r=25), so arc length ≈ π*25/2 ≈ 39.27
      expect(aLen).toBeCloseTo((Math.PI * 25) / 2, 0);
      // First half endpoint should be at the top of the semicircle
      const endX = parseFloat(result.logs[2].parts[0].value);
      const endY = parseFloat(result.logs[3].parts[0].value);
      expect(endX).toBeCloseTo(25, 0);
      expect(endY).toBeCloseTo(-25, 0);
    });

    it('subPath on path with z (closePath)', () => {
      const result = compile(`
        let p = @{ h 50 v 50 h -50 z };
        let full = p.length;
        let sub = p.subPath(0, 0.5);
        log(full);
        log(sub.length);
      `);
      const full = parseFloat(result.logs[0].parts[0].value);
      const half = parseFloat(result.logs[1].parts[0].value);
      expect(half).toBeCloseTo(full / 2, 0);
    });
  });

  describe('non-context-aware stdlib functions in PathBlock with .draw()', () => {
    // Helper: check that draw() emits only relative commands (no uppercase A, L, Q, C, H, V, M, S, T)
    // after the initial M that positions the cursor.
    function assertRelativeAfterMove(path: string) {
      // Path should start with M (the cursor position), then only lowercase commands
      const afterMove = path.replace(/^M\s+[\d.e+-]+\s+[\d.e+-]+\s*/, '');
      // Should not contain any uppercase commands except Z (closePath is uppercase in SVG spec,
      // but commandsToRelativeD uses lowercase z)
      expect(afterMove).not.toMatch(/[ACLQHVSMT]\s/);
    }

    it('circle() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ circle(50, 50, 10); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\ba\b/); // relative arc commands
    });

    it('rect() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ rect(10, 10, 30, 20); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/); // relative line commands
    });

    it('roundRect() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ roundRect(10, 10, 40, 30, 5); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bq\b/); // relative quadratic for rounded corners
      expect(result).toMatch(/\bl\b/); // relative lines for sides
    });

    it('roundRect() emits correct quadratic control points (relative, not absolute)', () => {
      // Regression: stdlib roundRect emits uppercase Q commands; path-block
      // construction must convert args from absolute to relative.
      // Expected shape drawn from cursor (50, 100) with rect (0, 0, 100, 50, 8):
      //   start: M 50 100 m 8 0  (to (58, 100) = (8, 0) local)
      //   top edge: l 84 0       (to (92, 0))
      //   top-right corner: q 8 0 8 8  (CP (+8,0), end (+8,+8) = (100, 8))
      //   right edge: l 0 34     (to (100, 42))
      //   bottom-right corner: q 0 8 -8 8  (CP (+0,+8), end (-8,+8) = (92, 50))
      //   bottom edge: l -84 0   (to (8, 50))
      //   bottom-left corner: q -8 0 -8 -8  (CP (-8,0), end (-8,-8) = (0, 42))
      //   left edge: l 0 -34     (to (0, 8))
      //   top-left corner: q 0 -8 8 -8  (CP (0,-8), end (+8,-8) = (8, 0))
      //   z
      const result = compilePath(`
        let p = @{ roundRect(0, 0, 100, 50, 8); };
        M 50 100
        p.draw()
      `);
      expect(result).toBe(
        'M 50 100 m 8 0 l 84 0 q 8 0 8 8 l 0 34 q 0 8 -8 8 l -84 0 q -8 0 -8 -8 l 0 -34 q 0 -8 8 -8 z',
      );
    });

    it('cubic() emits correct control points (relative, not absolute)', () => {
      // cubic(0, 0, 10, -20, 40, -20, 50, 0) → M 0 0 C 10 -20 40 -20 50 0
      // Drawn from cursor (100, 100): m 0 0 (redundant), then relative c
      //   start: (0, 0) local → (100, 100) abs
      //   CP1: (10, -20) local, relative from start: (+10, -20)
      //   CP2: (40, -20) local, relative from start: (+40, -20)
      //   end: (50, 0) local, relative from start: (+50, 0)
      const result = compilePath(`
        let p = @{ cubic(0, 0, 10, -20, 40, -20, 50, 0); };
        M 100 100
        p.draw()
      `);
      // Should produce: `m 0 0 c 10 -20 40 -20 50 0`
      expect(result).toContain('c 10 -20 40 -20 50 0');
    });

    it('quadratic() emits correct control point (relative, not absolute)', () => {
      // quadratic(0, 0, 25, -30, 50, 0) → M 0 0 Q 25 -30 50 0
      // From cursor (100, 100): CP (25, -30) relative, end (50, 0) relative
      const result = compilePath(`
        let p = @{ quadratic(0, 0, 25, -30, 50, 0); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('q 25 -30 50 0');
    });

    it('polygon() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ polygon(50, 50, 20, 6); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('star() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ star(50, 50, 20, 10, 5); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('line() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ line(10, 10, 40, 50); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('quadratic() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ quadratic(0, 0, 25, -30, 50, 0); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bq\b/);
    });

    it('cubic() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ cubic(0, 0, 10, -20, 40, -20, 50, 0); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bc\b/);
    });

    it('arc() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ arc(25, 25, 0, 0, 1, 50, 0); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\ba\b/);
    });

    it('moveTo() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ moveTo(30, 40); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bm\b/);
    });

    it('lineTo() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ lineTo(30, 40); };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('closePath() emits z via .draw()', () => {
      const result = compilePath(`
        let p = @{ l 20 20 l 20 -20 closePath(); };
        p.drawTo(100, 100);
      `);
      expect(result).toContain('M 100 100');
      expect(result).toContain('z');
    });

    it('circle drawn at offset produces correct end position', () => {
      const result = compile(`
        let p = @{ circle(50, 50, 10); };
        M 100 100
        let proj = p.draw();
        log(proj.endPoint);
      `);
      // circle(50,50,10) starts at M 40 50, arc to 60 50, arc back to 40 50
      // Relative end = (40, 50). Projected from (100, 100) → (140, 150)
      expect(result.logs[0].parts[0].value).toBe('Point(140, 150)');
    });
  });

  describe('chamfer()', () => {
    it('chamfers all vertices of a rectangle', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamfer(5);
        M 10 10
        c.draw();
      `);
      // Should have line segments connecting trim points
      expect(result).toContain('M 10 10');
      // Should not have the original sharp corners
      expect(result).toMatch(/l /);
    });

    it('preserves path closedness', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamfer(5);
        M 10 10
        c.draw();
      `);
      expect(result).toMatch(/z$/);
    });

    it('symmetric chamfer produces expected geometry', () => {
      // Simple right angle: h 40 v 40 — one corner at (40, 0)
      const result = compile(`
        let path = @{ h 40 v 40 };
        let c = path.chamfer(10);
        log(c.vertices.length);
      `);
      // Original: 3 vertices, after chamfering the corner vertex we get 4 vertices
      expect(result.logs[0].parts[0].value).toBe('4');
    });

    it('asymmetric chamfer uses different distances', () => {
      const result = compile(`
        let path = @{ h 40 v 40 };
        let c = path.chamfer(5, 15);
        log(c.vertices.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('4');
    });

    it('chamferAtVertex chamfers only the specified vertex', () => {
      const result = compile(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamferAtVertex(1, 10);
        // Original 4 corners, only 1 chamfered → 5 vertices (4 original - 1 + 2 new)
        log(c.vertices.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('5');
    });

    it('chamferAtVertex with asymmetric distances', () => {
      const result = compile(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamferAtVertex(1, 5, 15);
        log(c.vertices.length);
      `);
      expect(result.logs[0].parts[0].value).toBe('5');
    });

    it('throws on out-of-range vertex index', () => {
      expect(() => compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamferAtVertex(10, 5);
        M 10 10
        c.draw();
      `)).toThrow(/vertex index.*out of range/i);
    });

    it('clamps chamfer distance to edge length with warning', () => {
      const result = compile(`
        let small = @{ h 10 v 10 };
        let c = small.chamfer(100);
        log(c.length);
      `);
      // Should not throw, but should produce a path
      expect(result.logs.length).toBeGreaterThan(0);
    });

    it('works on ProjectedPathValue', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let proj = box.project(10, 10);
        let c = proj.chamfer(5);
        c.drawTo(0, 0);
      `);
      expect(result).toContain('M 0 0');
    });

    it('requires at least 1 argument', () => {
      expect(() => compilePath('let p = @{ h 40 v 40 }; p.chamfer();')).toThrow(/chamfer\(\) expects/);
    });

    it('requires numeric arguments', () => {
      expect(() => compilePath('let p = @{ h 40 v 40 }; p.chamfer("x");')).toThrow(/must be a number/);
    });

    it('works with open paths', () => {
      const result = compilePath(`
        let path = @{ h 40 v 40 h -40 };
        let c = path.chamfer(5);
        M 10 10
        c.draw();
      `);
      // Open path with interior corners should still be chamfered
      expect(result).toContain('M 10 10');
    });

    it('handles zero-distance chamfer (no-op)', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let c = box.chamfer(0);
        M 10 10
        c.draw();
      `);
      expect(result).toContain('M 10 10');
    });
  });

  describe('fillet()', () => {
    it('fillets all vertices of a rectangle', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.fillet(5);
        M 10 10
        f.draw()
      `);
      expect(result).toContain('M 10 10');
      // Should contain arc commands for the rounded corners
      expect(result).toMatch(/a /);
    });

    it('preserves closedness', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.fillet(5);
        M 10 10
        f.draw()
      `);
      expect(result).toMatch(/z$/);
    });

    it('filletAtVertex rounds only one corner', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.filletAtVertex(1, 8);
        M 10 10
        f.draw()
      `);
      // Should have exactly one arc command
      const arcCount = (result.match(/\ba /g) || []).length;
      expect(arcCount).toBe(1);
    });

    it('clamps radius to edge length with warning', () => {
      const result = compile(`
        let small = @{ h 10 v 10 };
        let f = small.fillet(100);
        log(f.length);
      `);
      expect(result.logs.length).toBeGreaterThan(0);
    });

    it('throws on out-of-range vertex index', () => {
      expect(() => compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.filletAtVertex(10, 5);
        M 10 10
        f.draw()
      `)).toThrow(/vertex index.*out of range/i);
    });

    it('works on ProjectedPathValue', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let proj = box.project(10, 10);
        let f = proj.fillet(5);
        f.drawTo(0, 0);
      `);
      expect(result).toMatch(/a /);
    });

    it('requires exactly 1 argument', () => {
      expect(() => compilePath('let p = @{ h 40 v 40 }; p.fillet();')).toThrow(/fillet\(\) expects/);
    });

    it('requires numeric argument', () => {
      expect(() => compilePath('let p = @{ h 40 v 40 }; p.fillet("x");')).toThrow(/must be a number/);
    });

    it('arc has correct radius', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.fillet(10);
        M 0 0
        f.draw()
      `);
      // Arc commands should contain radius 10
      expect(result).toMatch(/a 10 10/);
    });

    it('works with open paths', () => {
      const result = compilePath(`
        let path = @{ h 40 v 40 h -40 };
        let f = path.fillet(5);
        M 10 10
        f.draw()
      `);
      expect(result).toMatch(/a /);
    });

    it('skips curve junctions with warning', () => {
      const result = compile(`
        let path = @{ c 0 -20 20 -20 20 0 h 20 };
        let f = path.fillet(5);
        log(f.length);
      `);
      // Should not throw, should produce a result
      expect(result.logs.length).toBeGreaterThan(0);
    });
  });

  describe('ellipticalFillet()', () => {
    it('fillets all vertices of a rectangle with elliptical arcs', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.ellipticalFillet(12, 6);
        M 10 10
        f.draw()
      `);
      expect(result).toMatch(/a /);
      // Arc should have rx != ry
      expect(result).toMatch(/a 12 6/);
    });

    it('supports rotation parameter', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.ellipticalFillet(12, 6, 0.3);
        M 10 10
        f.draw()
      `);
      expect(result).toMatch(/a /);
    });

    it('ellipticalFilletAtVertex rounds only one corner', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.ellipticalFilletAtVertex(1, 12, 6);
        M 10 10
        f.draw()
      `);
      const arcCount = (result.match(/\ba /g) || []).length;
      expect(arcCount).toBe(1);
    });

    it('ellipticalFilletAtVertex with rotation', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.ellipticalFilletAtVertex(2, 15, 8, 0.5);
        M 10 10
        f.draw()
      `);
      expect(result).toMatch(/a /);
    });

    it('throws on out-of-range vertex index', () => {
      expect(() => compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let f = box.ellipticalFilletAtVertex(10, 12, 6);
        M 10 10
        f.draw()
      `)).toThrow(/vertex index.*out of range/i);
    });

    it('works on ProjectedPathValue', () => {
      const result = compilePath(`
        let box = @{ h 60 v 40 h -60 z };
        let proj = box.project(10, 10);
        let f = proj.ellipticalFillet(12, 6);
        f.drawTo(0, 0);
      `);
      expect(result).toMatch(/a /);
    });

    it('requires at least 2 arguments', () => {
      expect(() => compilePath('let p = @{ h 40 v 40 }; p.ellipticalFillet(12);')).toThrow(/ellipticalFillet\(\) expects/);
    });

    describe('trim distance correctness', () => {
      // Helper: parse the d-string into segments for analysis
      function parseSegments(d: string) {
        const segments: { cmd: string; args: number[] }[] = [];
        const re = /([a-zA-Z])([^a-zA-Z]*)/g;
        let m;
        while ((m = re.exec(d)) !== null) {
          const cmd = m[1];
          const args = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
          segments.push({ cmd, args });
        }
        return segments;
      }

      it('90° corner: trims rx on horizontal edges and ry on vertical edges', () => {
        // box: h 60 v 40 h -60 z → 4 right-angle corners
        // ellipticalFillet(15, 8) should trim 15 from horizontal edges, 8 from vertical
        const result = compilePath(`
          let box = @{ h 60 v 40 h -60 z };
          let f = box.ellipticalFillet(15, 8);
          M 0 0
          f.draw()
        `);
        const segs = parseSegments(result);

        // After M 0 0: first segment is a line (horizontal, trimmed)
        // For a 60-wide, 40-tall box with rx=15, ry=8:
        // Horizontal edges (length 60): trimmed by 15 from each end → 30 remaining
        // Vertical edges (length 40): trimmed by 8 from each end → 24 remaining
        const lines = segs.filter(s => s.cmd === 'l');
        const arcs = segs.filter(s => s.cmd === 'a');

        expect(arcs.length).toBe(4);
        // All arcs should have rx=15, ry=8
        for (const arc of arcs) {
          expect(arc.args[0]).toBeCloseTo(15, 5);
          expect(arc.args[1]).toBeCloseTo(8, 5);
        }

        // Horizontal lines: should have |dx|=30, dy=0
        const horizontalLines = lines.filter(l => Math.abs(l.args[1]) < 0.001);
        for (const hl of horizontalLines) {
          expect(Math.abs(hl.args[0])).toBeCloseTo(30, 3);
        }

        // Vertical lines: should have dx=0, |dy|=24
        const verticalLines = lines.filter(l => Math.abs(l.args[0]) < 0.001);
        for (const vl of verticalLines) {
          expect(Math.abs(vl.args[1])).toBeCloseTo(24, 3);
        }
      });

      it('ellipticalFillet(r, r) matches circular fillet(r)', () => {
        const circular = compilePath(`
          let box = @{ h 60 v 40 h -60 z };
          let f = box.fillet(10);
          M 0 0
          f.draw()
        `);
        const elliptical = compilePath(`
          let box = @{ h 60 v 40 h -60 z };
          let f = box.ellipticalFillet(10, 10);
          M 0 0
          f.draw()
        `);

        // Parse and compare segment by segment (allow floating point tolerance)
        const cSegs = parseSegments(circular);
        const eSegs = parseSegments(elliptical);
        expect(eSegs.length).toBe(cSegs.length);
        for (let i = 0; i < cSegs.length; i++) {
          expect(eSegs[i].cmd).toBe(cSegs[i].cmd);
          for (let j = 0; j < cSegs[i].args.length; j++) {
            expect(eSegs[i].args[j]).toBeCloseTo(cSegs[i].args[j], 3);
          }
        }
      });

      it('arc stays within original shape bounds', () => {
        // A 100×80 box filleted with rx=20, ry=10
        // The result should not exceed the bounding box of the original
        const result = compilePath(`
          let box = @{ h 100 v 80 h -100 z };
          let f = box.ellipticalFillet(20, 10);
          M 0 0
          f.draw()
        `);
        const segs = parseSegments(result);

        // Walk the path and track position
        let x = 0, y = 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const seg of segs) {
          if (seg.cmd === 'M') {
            x = seg.args[0]; y = seg.args[1];
          } else if (seg.cmd === 'm') {
            x += seg.args[0]; y += seg.args[1];
          } else if (seg.cmd === 'l') {
            x += seg.args[0]; y += seg.args[1];
          } else if (seg.cmd === 'a') {
            x += seg.args[5]; y += seg.args[6];
          } else if (seg.cmd === 'z') {
            // back to start
          }
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }

        // Endpoints should be within [0, 100] × [0, 80]
        expect(minX).toBeGreaterThanOrEqual(-0.01);
        expect(minY).toBeGreaterThanOrEqual(-0.01);
        expect(maxX).toBeLessThanOrEqual(100.01);
        expect(maxY).toBeLessThanOrEqual(80.01);
      });

      it('non-90° angles: produces valid fillets at various angles', () => {
        // Test angles from acute to obtuse
        const angles = [-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4];
        for (const angleFraction of angles) {
          const angle = angleFraction * Math.PI;
          const result = compilePath(`
            let shape = @{
              h 40
              l calc(cos(${angle}) * 30) calc(sin(${angle}) * 30)
            };
            let f = shape.ellipticalFillet(8, 5);
            M 50 50
            f.draw()
          `);
          // Should produce exactly 1 arc
          const arcCount = (result.match(/\ba /g) || []).length;
          expect(arcCount).toBe(1);
          // Arc should have correct radii
          expect(result).toMatch(/a 8 5/);
        }
      });
    });
  });

  describe('intersects and intersectionPoints', () => {
    describe('intersects()', () => {
      it('PathBlock vs PathBlock — overlapping shapes at origin → true', () => {
        const result = compile(`
          let a = @{ h 60 v 40 h -60 z };
          let b = @{ h 40 v 30 h -40 z };
          log(a.intersects(b));
        `);
        expect(result.logs[0].parts[0].value).toBe('true');
      });

      it('PathBlock vs ProjectedPath — non-overlapping shapes → false', () => {
        const result = compile(`
          let a = @{ h 10 v 10 h -10 z };
          let b = @{ h 10 v 10 h -10 z };
          let pb = b.project(100, 100);
          log(a.intersects(pb));
        `);
        expect(result.logs[0].parts[0].value).toBe('false');
      });

      it('PathBlock vs {x, y, width, height} object — overlapping → true', () => {
        const result = compile(`
          let a = @{ h 60 v 40 h -60 z };
          log(a.intersects({x: 10, y: 10, width: 20, height: 20}));
        `);
        expect(result.logs[0].parts[0].value).toBe('true');
      });

      it('PathBlock vs {x, y, width, height} object — non-overlapping → false', () => {
        const result = compile(`
          let a = @{ h 60 v 40 h -60 z };
          log(a.intersects({x: 200, y: 200, width: 10, height: 10}));
        `);
        expect(result.logs[0].parts[0].value).toBe('false');
      });

      it('ProjectedPath vs ProjectedPath — overlapping → true', () => {
        const result = compile(`
          let a = @{ h 60 v 40 h -60 z };
          let b = @{ h 40 v 30 h -40 z };
          let pa = a.project(0, 0);
          let pb = b.project(10, 10);
          log(pa.intersects(pb));
        `);
        expect(result.logs[0].parts[0].value).toBe('true');
      });

      it('ProjectedPath vs ProjectedPath — non-overlapping → false', () => {
        const result = compile(`
          let a = @{ h 50 v 50 h -50 z };
          let b = @{ h 10 v 10 h -10 z };
          let pa = a.project(0, 0);
          let pb = b.project(200, 200);
          log(pa.intersects(pb));
        `);
        expect(result.logs[0].parts[0].value).toBe('false');
      });

      it('PathBlock vs ProjectedPath — cross-type → true', () => {
        const result = compile(`
          let a = @{ h 60 v 40 h -60 z };
          let b = @{ h 40 v 30 h -40 z };
          let pb = b.project(5, 5);
          log(a.intersects(pb));
        `);
        expect(result.logs[0].parts[0].value).toBe('true');
      });

      it('error: wrong argument count', () => {
        expect(() => compile(`
          let a = @{ h 60 v 40 };
          log(a.intersects());
        `)).toThrow(/intersects\(\) expects 1 argument/);
      });

      it('error: invalid argument type (string)', () => {
        expect(() => compile(`
          let a = @{ h 60 v 40 };
          log(a.intersects("hello"));
        `)).toThrow(/intersects\(\) argument must be/);
      });
    });

    describe('intersectionPoints()', () => {
      it('PathBlock bbox vs another ProjectedPath segments — returns crossing points', () => {
        // Box bbox (0,0,100,100). Line projected from (-10,50) going h 120 → (110,50)
        // Should cross left edge at (0,50) and right edge at (100,50)
        const result = compile(`
          let box = @{ h 100 v 100 h -100 z };
          let line = @{ h 120 };
          let pLine = line.project(-10, 50);
          let pts = box.intersectionPoints(pLine);
          log(pts.length);
          for (p in pts) {
            log(p.x, p.y);
          }
        `);
        expect(result.logs[0].parts[0].value).toBe('2');
        const pts = result.logs.slice(1).map(l => ({
          x: Number(l.parts[0].value),
          y: Number(l.parts[1].value),
        }));
        const sorted = pts.sort((a, b) => a.x - b.x);
        expect(sorted[0].x).toBeCloseTo(0, 5);
        expect(sorted[0].y).toBeCloseTo(50, 5);
        expect(sorted[1].x).toBeCloseTo(100, 5);
        expect(sorted[1].y).toBeCloseTo(50, 5);
      });

      it('ProjectedPath bbox vs another ProjectedPath segments — absolute coords', () => {
        // Box projected at (10,10), bbox (10,10,100,100)
        // Line projected at (-10,60), goes h 130 → (120,60)
        // Crosses left edge at x=10 and right edge at x=110, both at y=60
        const result = compile(`
          let box = @{ h 100 v 100 h -100 z };
          let line = @{ h 130 };
          let pBox = box.project(10, 10);
          let pLine = line.project(-10, 60);
          let pts = pBox.intersectionPoints(pLine);
          log(pts.length);
          for (p in pts) {
            log(p.x, p.y);
          }
        `);
        expect(result.logs[0].parts[0].value).toBe('2');
        const pts = result.logs.slice(1).map(l => ({
          x: Number(l.parts[0].value),
          y: Number(l.parts[1].value),
        }));
        const sorted = pts.sort((a, b) => a.x - b.x);
        expect(sorted[0].x).toBeCloseTo(10, 5);
        expect(sorted[0].y).toBeCloseTo(60, 5);
        expect(sorted[1].x).toBeCloseTo(110, 5);
        expect(sorted[1].y).toBeCloseTo(60, 5);
      });

      it('non-overlapping → returns empty array', () => {
        const result = compile(`
          let a = @{ h 50 v 50 h -50 z };
          let b = @{ h 10 v 10 h -10 z };
          let pa = a.project(0, 0);
          let pb = b.project(200, 200);
          let pts = pa.intersectionPoints(pb);
          log(pts.length);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
      });

      it('error: wrong argument count', () => {
        expect(() => compile(`
          let a = @{ h 60 v 40 };
          log(a.intersectionPoints());
        `)).toThrow(/intersectionPoints\(\) expects 1 argument/);
      });
    });
  });
});

describe('truthful startPoint = first inked point (B2)', () => {
  // startPoint was hardcoded (0,0) at every construction site while
  // commands could keep off-origin coordinates — the day-one comment
  // specified an m-exception that was never implemented. The rule now:
  // last leading-m's end, else the first command's start.
  it('@{} literal with a leading m reports the inked start', () => {
    const result = compile('let p = @{ m 10 15 h 30 }; log(p.startPoint);');
    expect(result.logs[0].parts[0].value).toBe('Point(10, 15)');
  });
  it('chained leading moves: the LAST m wins', () => {
    const result = compile('let p = @{ m 4 4 m 6 6 h 30 }; log(p.startPoint);');
    expect(result.logs[0].parts[0].value).toBe('Point(10, 10)');
  });
  it('no leading move: stays (0,0) for on-origin blocks', () => {
    const result = compile('let p = @{ v 20 h 30 }; log(p.startPoint);');
    expect(result.logs[0].parts[0].value).toBe('Point(0, 0)');
  });
  it('.contours[i] reports each contour\'s in-block position (the reported bug)', () => {
    // Second contour starts at (20, 5) inside the block; its leading m
    // used to carry a STALE start and startPoint was hardcoded (0,0).
    const result = compile(`
      let twoRings = @{
        h 10
        v 10
        h -10
        z
        m 20 5
        h 4
        v 4
        h -4
        z
      };
      let ring = twoRings.contours;
      log(ring.length);
      let inner = ring[1];
      let sp = inner.startPoint;
      let g0 = inner.get(0);
      log(sp);
      log(calc(abs(sp.x - g0.x) < 0.001 && abs(sp.y - g0.y) < 0.001));
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toBe('2');
    expect(vals[1]).toBe('Point(20, 5)');
    expect(vals[2]).toBe('true'); // get(0) == startPoint
  });
  it('drawTo on an off-origin projected piece anchors the first inked point (the garment footgun)', () => {
    // A piece whose first command starts away from its frame origin:
    // drawTo(x, y) must place the INK at (x, y), not the frame corner.
    const { layers } = compile(`
      let box = @{ h 60 v 40 h -60 z };
      let knife = @{ m 30 -10 l 0 60 };
      let pieces = box.cut(knife);
      for ([p, i] in pieces) {
        let placed = p.project(0, 0);
        let sp = placed.startPoint;
        let g0 = placed.get(0);
        log(calc(abs(sp.x - g0.x) < 0.001 && abs(sp.y - g0.y) < 0.001));
      }
    `);
    const result = compile(`
      let box = @{ h 60 v 40 h -60 z };
      let knife = @{ m 30 -10 l 0 60 };
      let pieces = box.cut(knife);
      log(pieces[0].startPoint);
      log(pieces[1].startPoint);
    `);
    // The two halves of the box start their rings at different inked
    // points — at least one is off-origin, and neither is a hardcoded lie.
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals.some((v) => v !== 'Point(0, 0)')).toBe(true);
  });
});

describe('truthful startPoint survives the transform-method family (review-critical)', () => {
  // The first B2 sweep patched every PathBlockValue construction but
  // missed the ProjectedPathValue transform branches and both segment
  // builders — reintroducing the footgun for chained transforms. The
  // invariant pinned here: startPoint == get(0), through every chain.
  const proj = `let p = @{ m 10 15 h 30 };\nlet proj = p.project(0, 0);\n`;
  const invariant = (expr: string) => `
      ${proj}let v = ${expr};
      let sp = v.startPoint;
      let g0 = v.get(0);
      log(calc(abs(sp.x - g0.x) < 0.001 && abs(sp.y - g0.y) < 0.001));
    `;
  for (const [name, expr] of [
    ['mirror', 'proj.mirror(0)'],
    ['offset', 'proj.offset(2)'],
    ['rotate', 'proj.rotate(1.5707963)'],
    ['rotateAtVertexIndex', 'proj.rotateAtVertexIndex(0, 1.5707963)'],
    ['scale', 'proj.scale(2, 2)'],
  ] as const) {
    it(`${name}() on a leading-move projected value keeps startPoint == get(0)`, () => {
      const result = compile(invariant(expr));
      expect(result.logs[0].parts.map((p) => String(p.value)).join('')).toBe('true');
    });
  }

  it('layer segment queries report the inked start, not the pre-call cursor', () => {
    const result = compile(`
      define default PathLayer('main') #{}
      M 10 10
      circle(50, 50, 20) as segment('c1');
      let seg = layer('main').segment('c1');
      log(seg.startPoint);
      let g0 = seg.get(0);
      log(calc(abs(seg.startPoint.x - g0.x) < 0.001 && abs(seg.startPoint.y - g0.y) < 0.001));
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toBe('Point(30, 50)');
    expect(vals[1]).toBe('true');
  });

  it('projected segment queries keep the invariant too', () => {
    const result = compile(`
      let p = @{
        h 20
        circle(50, 5, 10) as segment('ring');
      };
      let placed = p.project(100, 100);
      let seg = placed.segment('ring');
      let g0 = seg.get(0);
      log(calc(abs(seg.startPoint.x - g0.x) < 0.001 && abs(seg.startPoint.y - g0.y) < 0.001));
    `);
    expect(result.logs[0].parts.map((p) => String(p.value)).join('')).toBe('true');
  });

  it('drawTo after a layer-segment query anchors the ink at the target', () => {
    const { layers } = compile(`
      define default PathLayer('main') #{}
      M 10 10
      circle(50, 50, 20) as segment('c1');
      let seg = layer('main').segment('c1');
      seg.drawTo(100, 100);
    `);
    expect(layers[0].data).toContain('M 100 100');
  });
});

// Pinned main-evaluator geometry that used to be asserted only by equality
// with the (now removed) annotated evaluator.
describe('pinned derived-path output (formerly annotated parity)', () => {
  const round3 = (str: string) => str.replace(/-?\d+\.\d+/g, (m) => Number(m).toFixed(3));

  it.each([
    ['round', 'M 50 50 l 40 0 a 6 6 0 0 1 4.243 10.243 l -30 30'],
    ['miter', 'M 50 50 l 40 0 l 4.243 10.243 l -30 30'],
    ['bevel', 'M 50 50 l 40 0 l 4.243 10.243 l -30 30'],
  ])('offset() with %s joins on an open bracket', (join, expected) => {
    const src = `let bracket = @{
  h 40
  l -30 30
};
let ring = bracket.offset(6, { join: '${join}' });
ring.drawTo(50, 50);`;
    expect(round3(compile(src).layers[0].data)).toBe(expected);
  });

  it('multi-contour union draw() keeps world coordinates', () => {
    const src = `let left = @{
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
let merged = left.union(right.project(60, 0));
let placed = merged.project(150, 28);
placed.draw();`;
    expect(compile(src).layers[0].data).toBe('M 150 28 h 40 v 40 h -40 z h 40 v 40 h -40 z');
  });

  it('in-place ProjectedPath draw() continues the cursor for following commands', () => {
    const src = `let plate = @{
  h 140
  v 100
  c 10 -20 30 -20 40 -40
};
let placed = plate.project(30, 40);
placed.draw();
l 5 0`;
    expect(compile(src).layers[0].data).toBe('M 30 40 h 140 v 100 c 10 -20 30 -20 40 -40 l 5 0');
  });

  it('rotate() about a point re-origins the block before drawTo()', () => {
    const src = 'let p = @{ h 50 v 50 };\nlet r = p.rotate(0.5pi, Point(25, 25));\nr.drawTo(10, 10);';
    expect(compile(src).layers[0].data).toBe('M 10 10 m 50 0 l 0 50 l -50 0');
  });
});

describe('introspection: d, commands, and log() display', () => {
  const BOX = 'let box = @{\n  h 40\n  v 40\n  h -40\n  z\n};';

  it('.d is the relative data .draw() emits at the origin', () => {
    const result = compile(`${BOX}\nlog(box.d);\nM 0 0\nbox.draw();`);
    expect(result.logs[0].parts[0].value).toBe('h 40 v 40 h -40 z');
    expect(result.layers[0].data).toBe('M 0 0 h 40 v 40 h -40 z');
  });

  it('.d bridges an off-origin start the same way .draw() does', () => {
    const result = compile('let ring = @{\n  circle(0, 0, 10);\n};\nlog(ring.d);\nM 50 50\nring.draw();');
    const d = result.logs[0].parts[0].value;
    expect(d.startsWith('m -10 0 a 10 10')).toBe(true);
    expect(result.layers[0].data).toBe(`M 50 50 ${d}`);
  });

  it('.commands lists every executed command with cursor positions', () => {
    const result = compile(`${BOX}\nlog(box.commands.length);\nlog(box.commands[1]);`);
    expect(result.logs[0].parts[0].value).toBe('4');
    expect(result.logs[1].parts[0].value).toBe('{command: v, args: [40], start: Point(40, 0), end: Point(40, 40)}');
  });

  it('a ProjectedPath answers .d in absolute coordinates and .commands in world space', () => {
    const result = compile(
      `${BOX}\nlet placed = box.project(100, 50);\nlog(placed.d);\nlog(placed.commands[0].start);`,
    );
    expect(result.logs[0].parts[0].value).toBe('M 100 50 H 140 V 90 H 100 Z');
    expect(result.logs[1].parts[0].value).toBe('Point(100, 50)');
  });

  it('log(block) previews the first commands', () => {
    const result = compile(
      `${BOX}\nlog(box);\nlet long = @{\n  h 1\n  h 2\n  h 3\n  h 4\n  h 5\n  h 6\n  h 7\n};\nlog(long);\nlog(@{ h 5 });`,
    );
    expect(result.logs[0].parts[0].value).toBe('PathBlock(4 commands: h 40 v 40 h -40 z)');
    expect(result.logs[1].parts[0].value).toBe('PathBlock(7 commands: h 1 h 2 h 3 h 4 h 5 h 6 …)');
    expect(result.logs[2].parts[0].value).toBe('PathBlock(1 command: h 5)');
  });
});
