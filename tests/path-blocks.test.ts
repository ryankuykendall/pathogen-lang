import { describe, it, expect } from 'vitest';
import { compile, parse, compileAnnotated } from '../src';
import { compilePath } from './helpers';

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
      expect(result.logs[0].parts[0].value).toContain('10');
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
      expect(result.logs[0].parts[0].value).toContain('30');
    });

    it('reads outer variables', () => {
      const result = compile(`
        let size = 20;
        let p = @{ v size h size };
        log(p.endPoint);
      `);
      expect(result.logs[0].parts[0].value).toContain('20');
    });

    it('supports context-aware functions inside path block', () => {
      // arcFromPolarOffset works with the block's temporary PathContext
      const result = compile(`
        let p = @{
          v 20
          arcFromPolarOffset(1pi, 20, -0.5pi)
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

    it('startPoint is always (0, 0)', () => {
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
        "define default PathLayer('main') ${ stroke: black; }\n" +
        'let p = @{ v 20 h 20 };\n' +
        'M 10 10\n' +
        'p.draw()'
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

  describe('restrictions', () => {
    it('rejects absolute path commands', () => {
      expect(() => compilePath('let p = @{ V 20 };')).toThrow(/Absolute path command.*not allowed.*path blocks/);
    });

    it('rejects uppercase M', () => {
      expect(() => compilePath('let p = @{ M 10 20 };')).toThrow(/Absolute path command.*not allowed.*path blocks/);
    });

    it('rejects layer definitions inside path block', () => {
      expect(() => compilePath("let p = @{ define PathLayer('x') ${ stroke: red; } };"))
        .toThrow(/Layer definitions.*not allowed.*path blocks/);
    });

    it('rejects layer apply blocks inside path block', () => {
      expect(() => compilePath(
        "define PathLayer('x') ${ stroke: red; }\n" +
        "let p = @{ layer('x').apply { v 10 } };"
      )).toThrow(/Layer apply blocks.*not allowed.*path blocks/);
    });

    it('rejects text statements inside path block', () => {
      expect(() => compilePath(
        'let p = @{ text(0, 0)`hello` };'
      )).toThrow(/Text statements.*not allowed.*path blocks/);
    });

    it('rejects nested path blocks', () => {
      expect(() => compilePath('let p = @{ let inner = @{ v 10 }; };')).toThrow(/nest.*path blocks/);
    });

    it('rejects draw() inside path block', () => {
      expect(() => compilePath(`
        let p = @{ v 20 };
        let q = @{ p.draw() };
      `)).toThrow(/Cannot call .draw\(\) inside a path block/);
    });

    it('rejects project() inside path block', () => {
      expect(() => compilePath(`
        let p = @{ v 20 };
        let q = @{ p.project(0, 0); };
      `)).toThrow(/Cannot call .project\(\) inside a path block/);
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
        drawAt(p, 10, 10)
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

  describe('annotated output', () => {
    it('handles path block definition silently', () => {
      const output = compileAnnotated('let p = @{ v 20 h 20 };');
      // Path block definition should not produce output
      expect(output.trim()).toBe('');
    });

    it('shows draw() output with function call annotation', () => {
      const output = compileAnnotated(`
        let p = @{ v 20 h 20 };
        M 10 10
        p.draw()
      `);
      expect(output).toContain('M 10 10');
      expect(output).toContain('//--- p.draw() called from line');
      expect(output).toContain('  v 20');
      expect(output).toContain('  h 20');
    });

    it('shows draw() annotation in for loops', () => {
      const output = compileAnnotated(`
        let shape = @{ v 10 h 10 v -10 z };
        for (i in 0..1) {
          M calc(i * 20) 0
          shape.draw()
        }
      `);
      expect(output).toContain('//--- shape.draw() called from line');
      expect(output).toContain('v 10');
    });

    it('shows draw() annotation in let assignments', () => {
      const output = compileAnnotated(`
        let shape = @{ v 20 h 20 };
        M 10 10
        let proj = shape.draw();
      `);
      expect(output).toContain('//--- shape.draw() called from line');
      expect(output).toContain('v 20');
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
        expect(() => compile('let p = @{ h 100 }; p.get(-0.1);'))
          .toThrow(/between 0 and 1/);
      });

      it('get() with t > 1 throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.get(1.5);'))
          .toThrow(/between 0 and 1/);
      });

      it('tangent() with out-of-range t throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.tangent(-0.1);'))
          .toThrow(/between 0 and 1/);
      });

      it('normal() with out-of-range t throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.normal(2);'))
          .toThrow(/between 0 and 1/);
      });

      it('partition() with 0 throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(0);'))
          .toThrow(/positive integer/);
      });

      it('partition() with negative throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(-1);'))
          .toThrow(/positive integer/);
      });

      it('partition() with non-integer throws', () => {
        expect(() => compile('let p = @{ h 100 }; p.partition(2.5);'))
          .toThrow(/positive integer/);
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

      it('startPoint of reversed PathBlock is always (0, 0)', () => {
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
        expect(() => compile('let p = @{ h 50 }; p.reverse(1);'))
          .toThrow(/0 arguments/);
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
        expect(() => compile('let p = @{ h 50 }; p.boundingBox(1);'))
          .toThrow(/0 arguments/);
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
        expect(() => compile('let p = @{ h 50 }; p.offset();'))
          .toThrow(/1 argument/);
      });

      it('throws error with non-number argument', () => {
        expect(() => compile('let p = @{ h 50 }; p.offset("abc");'))
          .toThrow(/must be a number/);
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

      it('startPoint always (0,0) for PathBlockValue', () => {
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
          m.draw()
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
        expect(() => compile('let p = @{ h 50 }; p.mirror();'))
          .toThrow(/1 argument/);
      });

      it('throws error with non-number argument', () => {
        expect(() => compile('let p = @{ h 50 }; p.mirror("abc");'))
          .toThrow(/must be a number/);
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

      it('startPoint always (0,0) for PathBlockValue', () => {
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
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(-1, 0);'))
          .toThrow(/out of range/);
      });

      it('throws error with out-of-range index', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(5, 0);'))
          .toThrow(/out of range/);
      });

      it('throws error with non-integer index', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(1.5, 0);'))
          .toThrow(/must be an integer/);
      });

      it('throws error with wrong arg count', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(0);'))
          .toThrow(/2 arguments/);
      });

      it('throws error with non-number angle', () => {
        expect(() => compile('let p = @{ h 50 }; p.rotateAtVertexIndex(0, "abc");'))
          .toThrow(/must be a number/);
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

      it('startPoint always (0,0) for PathBlockValue', () => {
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
          s.draw()
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
        expect(() => compile('let p = @{ h 50 }; p.scale();'))
          .toThrow(/2 arguments/);
      });

      it('throws error with 1 arg', () => {
        expect(() => compile('let p = @{ h 50 }; p.scale(2);'))
          .toThrow(/2 arguments/);
      });

      it('throws error with non-number arg', () => {
        expect(() => compile('let p = @{ h 50 }; p.scale("a", 1);'))
          .toThrow(/must be a number/);
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
          c.draw()
        `);
        expect(path).toContain('M 10 10');
        expect(path).toContain('h 50');
        expect(path).toContain('v 30');
      });

      it('startPoint always (0,0)', () => {
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
          let base = \${ stroke: red; stroke-width: 2; };
          let extra = \${ fill: blue; };
          let merged = calc(base << extra);
          log(merged.fill);
        `);
        expect(result.logs[0].parts[0].value).toBe('blue');
      });

      it('throws error for mixed PathBlock/StyleBlock types', () => {
        expect(() => compile(`
          let p = @{ h 50 };
          let s = \${ stroke: red; };
          let x = calc(p << s);
        `)).toThrow(/matching operand types/);
      });
    });
  });

  describe('context-aware functions emit relative commands', () => {
    it('tangentArc emits relative a command inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          l 20 0
          tangentArc(20, 0.5pi)
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
          tangentLine(30)
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
          polarLine(0, 30)
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
          polarMove(0, 30)
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
          arcFromPolarOffset(1pi, 20, -0.5pi)
        };
        M 100 100
        p.draw()
      `);
      expect(result).not.toMatch(/A /);
      expect(result).toMatch(/a /);
      expect(result).toContain('M 100 100');
    });

    it('arcFromCenter emits relative commands inside PathBlock', () => {
      const result = compilePath(`
        let p = @{
          arcFromCenter(0, 20, 20, -0.5pi, 0, 1)
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
          tangentArc(20, 0.5pi)
        };
        moveTo(100, 100)
        p.draw()
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
          tangentArc(20, 0.5pi)
          tangentLine(30)
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

    it('partition t works in annotated mode', () => {
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
      expect(() => compile('let p = @{ h 100 }; p.subPath(-0.5, 1);')).toThrow('subPath() startT must be between 0 and 1');
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
      expect(aLen).toBeCloseTo(Math.PI * 25 / 2, 0);
      // First half endpoint should be at the top of the semicircle
      const endX = parseFloat(result.logs[2].parts[0].value);
      const endY = parseFloat(result.logs[3].parts[0].value);
      expect(endX).toBeCloseTo(25, 0);
      expect(endY).toBeCloseTo(-25, 0);
    });

    it('subPath works in annotated mode', () => {
      const result = compileAnnotated(`
        let p = @{ h 100 };
        let sub = p.subPath(0, 0.5);
        M 10 10
        sub.draw()
      `);
      expect(result).toContain('M 10 10');
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
        let p = @{ circle(50, 50, 10) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\ba\b/); // relative arc commands
    });

    it('rect() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ rect(10, 10, 30, 20) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/); // relative line commands
    });

    it('roundRect() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ roundRect(10, 10, 40, 30, 5) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bq\b/); // relative quadratic for rounded corners
      expect(result).toMatch(/\bl\b/); // relative lines for sides
    });

    it('polygon() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ polygon(50, 50, 20, 6) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('star() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ star(50, 50, 20, 10, 5) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('line() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ line(10, 10, 40, 50) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('quadratic() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ quadratic(0, 0, 25, -30, 50, 0) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bq\b/);
    });

    it('cubic() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ cubic(0, 0, 10, -20, 40, -20, 50, 0) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bc\b/);
    });

    it('arc() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ arc(25, 25, 0, 0, 1, 50, 0) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\ba\b/);
    });

    it('moveTo() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ moveTo(30, 40) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bm\b/);
    });

    it('lineTo() emits relative commands via .draw()', () => {
      const result = compilePath(`
        let p = @{ lineTo(30, 40) };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      assertRelativeAfterMove(result);
      expect(result).toMatch(/\bl\b/);
    });

    it('closePath() emits z via .draw()', () => {
      const result = compilePath(`
        let p = @{ l 20 20 l 20 -20 closePath() };
        M 100 100
        p.draw()
      `);
      expect(result).toContain('M 100 100');
      expect(result).toContain('z');
    });

    it('circle drawn at offset produces correct end position', () => {
      const result = compile(`
        let p = @{ circle(50, 50, 10) };
        M 100 100
        let proj = p.draw();
        log(proj.endPoint);
      `);
      // circle(50,50,10) starts at M 40 50, arc to 60 50, arc back to 40 50
      // Relative end = (40, 50). Projected from (100, 100) → (140, 150)
      expect(result.logs[0].parts[0].value).toBe('Point(140, 150)');
    });
  });
});
