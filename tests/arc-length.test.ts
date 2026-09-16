import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/**
 * ISSUE-021: arc length honours the flags. A half circle is π·r, not its
 * diameter; a large arc is the major sweep, not the minor complement;
 * elliptical arcs integrate the true speed. Values are computed from the
 * geometry, never copied from output.
 */

function logNumbers(src: string): number[] {
  return compile(src).logs.map((l) => Number(l.parts[0].value));
}

/** Reference elliptical arc length by fine midpoint integration over the parameter. */
function ellipseArc(rx: number, ry: number, from: number, to: number): number {
  const n = 20000;
  const h = (to - from) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = from + (i + 0.5) * h;
    sum += Math.hypot(rx * Math.sin(t), ry * Math.cos(t));
  }
  return sum * h;
}

describe('arc length (ISSUE-021)', () => {
  it('a circle() measures its circumference', () => {
    const [len] = logNumbers('let ring = @{\n  circle(0, 0, 25);\n};\nlog(ring.length);');
    expect(len).toBeCloseTo(2 * Math.PI * 25, 6);
  });

  it('half, quarter, and three-quarter circular arcs', () => {
    const src = [
      'let half = @{\n  a 10 10 0 0 1 20 0;\n};',
      'let quarter = @{\n  a 10 10 0 0 1 10 10;\n};',
      'let major = @{\n  a 10 10 0 1 1 10 10;\n};',
      'log(half.length);\nlog(quarter.length);\nlog(major.length);',
    ].join('\n');
    const [half, quarter, major] = logNumbers(src);
    expect(half).toBeCloseTo(Math.PI * 10, 6);
    expect(quarter).toBeCloseTo((Math.PI / 2) * 10, 6);
    expect(major).toBeCloseTo(1.5 * Math.PI * 10, 6);
  });

  it('elliptical arcs integrate the true speed', () => {
    // From (0,0) to (20,10) on the ellipse rx=20, ry=10 centred at (0,10): a quarter turn from −π/2 to 0.
    const [len] = logNumbers('let quarter = @{\n  a 20 10 0 0 1 20 10;\n};\nlog(quarter.length);');
    expect(len).toBeCloseTo(ellipseArc(20, 10, -Math.PI / 2, 0), 4);
  });

  it('get(t) weights a line and a half circle by their true lengths', () => {
    // h 10 (length 10) then a half circle of radius 10 (length 10π): the arc starts at t = 10 / (10 + 10π).
    const src =
      'let p = @{\n  h 10;\n  a 10 10 0 0 1 20 0;\n};\nlog(p.get(10 / (10 + 10 * PI())).x);\nlog(p.get(10 / (10 + 10 * PI())).y);';
    const [x, y] = logNumbers(src);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('query results and filters see the same lengths', () => {
    const src =
      "let ring = @{\n  circle(0, 0, 25);\n};\nlog(ring.query('call(circle)').block.length);\nlog(ring.queryAll('command(a)[length>78]').length);";
    const [len, count] = logNumbers(src);
    expect(len).toBeCloseTo(2 * Math.PI * 25, 6);
    expect(count).toBe(2); // each half circle is 25π ≈ 78.5
  });
});
