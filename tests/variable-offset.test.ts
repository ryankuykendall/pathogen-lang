import { describe, it, expect } from 'vitest';
import { compilePath, parseSVGPath } from './helpers';
import {
  buildContinuitySpline,
  projectStop,
  type Knot,
  type GeomCmd,
} from '../src/evaluator/variable-offset-geometry';

// ---- cubic sampling helpers (reconstruct absolute control points from relative-`c`) ----

interface Cubic {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

function toCubic(cmd: GeomCmd): Cubic {
  expect(cmd.command).toBe('c');
  const [c1x, c1y, c2x, c2y, ex, ey] = cmd.args;
  const s = cmd.start;
  return {
    p0: { x: s.x, y: s.y },
    p1: { x: s.x + c1x, y: s.y + c1y },
    p2: { x: s.x + c2x, y: s.y + c2y },
    p3: { x: s.x + ex, y: s.y + ey },
  };
}

const V = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x - b.x, y: a.y - b.y });

/** First derivative of a cubic at parameter u. */
function deriv1(c: Cubic, u: number) {
  const mu = 1 - u;
  const a = V(c.p1, c.p0);
  const b = V(c.p2, c.p1);
  const d = V(c.p3, c.p2);
  return {
    x: 3 * mu * mu * a.x + 6 * mu * u * b.x + 3 * u * u * d.x,
    y: 3 * mu * mu * a.y + 6 * mu * u * b.y + 3 * u * u * d.y,
  };
}

/** Second derivative of a cubic at parameter u. */
function deriv2(c: Cubic, u: number) {
  const mu = 1 - u;
  const a = { x: c.p2.x - 2 * c.p1.x + c.p0.x, y: c.p2.y - 2 * c.p1.y + c.p0.y };
  const b = { x: c.p3.x - 2 * c.p2.x + c.p1.x, y: c.p3.y - 2 * c.p2.y + c.p1.y };
  return { x: 6 * mu * a.x + 6 * u * b.x, y: 6 * mu * a.y + 6 * u * b.y };
}

function tangentAngle(c: Cubic, u: number): number {
  const d = deriv1(c, u);
  return Math.atan2(d.y, d.x);
}

function curvature(c: Cubic, u: number): number {
  const d1 = deriv1(c, u);
  const d2 = deriv2(c, u);
  const cross = d1.x * d2.y - d1.y * d2.x;
  const sp = Math.hypot(d1.x, d1.y);
  return cross / (sp * sp * sp);
}

/** Signed smallest angular difference, for comparing tangent directions. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Extract just the cubic segments (drop the leading M).
const cubics = (cmds: GeomCmd[]) => cmds.filter((c) => c.command === 'c').map(toCubic);

const knot = (x: number, y: number, continuity: Knot['continuity']): Knot => ({
  point: { x, y },
  continuity,
  spineTangent: 0,
});

describe('variable-offset geometry: spline construction', () => {
  it('emits a leading M to the first knot, then cubic segments', () => {
    const cmds = buildContinuitySpline([knot(0, 0, 'G1'), knot(10, 10, 'G1'), knot(20, 0, 'G1')]);
    expect(cmds[0].command).toBe('M');
    expect(cmds[0].args).toEqual([0, 0]);
    expect(cmds.slice(1).every((c) => c.command === 'c')).toBe(true);
    expect(cmds.length).toBe(3); // M + 2 cubics
  });

  it('G1 knot: tangent DIRECTION is continuous across the join', () => {
    const cmds = buildContinuitySpline([knot(0, 0, 'G1'), knot(10, 10, 'G1'), knot(25, 5, 'G1')]);
    const segs = cubics(cmds);
    const before = tangentAngle(segs[0], 1);
    const after = tangentAngle(segs[1], 0);
    expect(Math.abs(angleDiff(before, after))).toBeLessThan(1e-6);
  });

  it('G2 knot: tangent AND curvature are continuous across the join', () => {
    const cmds = buildContinuitySpline([knot(0, 0, 'G2'), knot(10, 10, 'G2'), knot(25, 5, 'G2'), knot(35, 12, 'G2')]);
    const segs = cubics(cmds);
    // interior knots are between seg0/seg1 and seg1/seg2
    for (const [i, j] of [[0, 1], [1, 2]] as const) {
      const tBefore = tangentAngle(segs[i], 1);
      const tAfter = tangentAngle(segs[j], 0);
      expect(Math.abs(angleDiff(tBefore, tAfter))).toBeLessThan(1e-6);
      const kBefore = curvature(segs[i], 1);
      const kAfter = curvature(segs[j], 0);
      expect(Math.abs(kBefore - kAfter)).toBeLessThan(1e-6);
    }
  });

  it('G0 knot: creates a corner (tangent direction is NOT continuous)', () => {
    // symmetric V so a smooth spline would be straight-through; G0 must break it.
    const cmds = buildContinuitySpline([knot(0, 0, 'G1'), knot(10, 10, 'G0'), knot(20, 0, 'G1')]);
    const segs = cubics(cmds);
    const before = tangentAngle(segs[0], 1);
    const after = tangentAngle(segs[1], 0);
    expect(Math.abs(angleDiff(before, after))).toBeGreaterThan(0.1);
  });

  it('clamped endpoint: first segment leaves along the supplied start direction', () => {
    const cmds = buildContinuitySpline(
      [knot(0, 0, 'G2'), knot(10, 10, 'G2'), knot(25, 5, 'G2')],
      { start: { dir: Math.PI / 2 } }, // straight up
    );
    const segs = cubics(cmds);
    const t0 = tangentAngle(segs[0], 0);
    expect(Math.abs(angleDiff(t0, Math.PI / 2))).toBeLessThan(1e-6);
  });

  it('collinear G2 knots stay (near) straight — near-zero curvature throughout', () => {
    const cmds = buildContinuitySpline([knot(0, 0, 'G2'), knot(10, 0, 'G2'), knot(20, 0, 'G2'), knot(30, 0, 'G2')]);
    for (const c of cubics(cmds)) {
      for (const u of [0, 0.5, 1]) expect(Math.abs(curvature(c, u))).toBeLessThan(1e-6);
    }
  });
});

describe('CurveContinuity enum + Cap constructors (Phase 2 scaffolding)', () => {
  it('CurveContinuity members resolve to their string values', () => {
    expect(() => compilePath('let c = CurveContinuity.G0; M 0 0 L 10 10')).not.toThrow();
    expect(() => compilePath('let c = CurveContinuity.G1; M 0 0 L 10 10')).not.toThrow();
    expect(() => compilePath('let c = CurveContinuity.G2; M 0 0 L 10 10')).not.toThrow();
  });

  // NOTE: like all builtin enums, unknown member ACCESS (CurveContinuity.G3) does
  // not throw — it yields undefined. Invalid continuity is rejected at the
  // consumption site (Cap.tapered below; go.stop in Phase 3), not at access time.

  it('all four Cap constructors evaluate', () => {
    expect(() =>
      compilePath(
        'let a = Cap.butt(); let b = Cap.round(); let e = Cap.elliptical(5); let t = Cap.tapered(12, CurveContinuity.G2); M 0 0 L 10 10',
      ),
    ).not.toThrow();
  });

  it('Cap.tapered accepts an optional continuity and rejects a non-CurveContinuity one', () => {
    expect(() => compilePath('let t = Cap.tapered(12); M 0 0 L 10 10')).not.toThrow();
    expect(() => compilePath('let t = Cap.tapered(12, 3); M 0 0')).toThrow();
  });

  it('Cap arity + unknown-method errors', () => {
    expect(() => compilePath('let b = Cap.round(5); M 0 0')).toThrow();
    expect(() => compilePath('let e = Cap.elliptical(); M 0 0')).toThrow();
    expect(() => compilePath('let x = Cap.bevel(); M 0 0')).toThrow();
  });
});

describe('variableOffset — language surface (Phase 3)', () => {
  const cubicCount = (d: string) => parseSVGPath(d).filter((c) => c.command.toLowerCase() === 'c').length;

  it('produces a smooth offset path (M + cubic segments) drawn via drawTo', () => {
    const result = compilePath(`
      let spine = @{ h 100 };
      let e = spine.variableOffset() {|go, pb|
        go.stop(10%, 5, CurveContinuity.G1);
        go.stop(50%, 15, CurveContinuity.G2);
        go.stop(90%, 20, CurveContinuity.G1);
      };
      e.drawTo(0, 0);
    `);
    expect(result.trim().startsWith('M')).toBe(true);
    expect(cubicCount(result)).toBe(2); // 3 knots → 2 cubic segments
  });

  it('accepts pb sampling (spine-relative endTangent) and PolarVector handles', () => {
    expect(() =>
      compilePath(`
      let spine = @{ h 100 };
      let e = spine.variableOffset() {|go, pb|
        go.startTangent(PolarVector(-90deg, 8));
        go.stop(10%, 5, CurveContinuity.G2);
        go.stop(90%, 20, CurveContinuity.G2);
        go.endTangent(PolarVector(0deg, 6).turn(pb.tangent(90%).angle));
      };
      e.drawTo(0, 0);
    `),
    ).not.toThrow();
  });

  it('a single stop yields just a move (no cubics)', () => {
    const result = compilePath(`
      let spine = @{ h 100 };
      let e = spine.variableOffset() {|go, pb| go.stop(50%, 10, CurveContinuity.G1); };
      e.drawTo(0, 0);
    `);
    expect(cubicCount(result)).toBe(0);
  });

  it('rejects missing block / no stops / out-of-range time / non-CurveContinuity', () => {
    expect(() => compilePath('let s = @{ h 100 }; let e = s.variableOffset(); e.drawTo(0,0);')).toThrow();
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| }; e.drawTo(0,0);'),
    ).toThrow(/at least one/);
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.stop(150%, 5, CurveContinuity.G1); }; e.drawTo(0,0);'),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.stop(50%, 5, 3); }; e.drawTo(0,0);'),
    ).toThrow(/CurveContinuity/);
  });

  it('rejects a cap on the simple form', () => {
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.startCap(Cap.round()); go.stop(50%, 5, CurveContinuity.G1); }; e.drawTo(0,0);'),
    ).toThrow(/compoundVariableOffset/);
  });
});

describe('compoundVariableOffset — ribbons + caps (Phase 4)', () => {
  const moveCount = (d: string) => parseSVGPath(d).filter((c) => c.command.toLowerCase() === 'm').length;

  it('with both caps, produces a single closed ribbon', () => {
    const result = compilePath(`
      let spine = @{ h 100 };
      let ribbon = spine.compoundVariableOffset() {|go, pb|
        go.startCap(Cap.round());
        go.stop(10%,  6, CurveContinuity.G2, -6, CurveContinuity.G2);
        go.stop(50%, 12, CurveContinuity.G2, -4, CurveContinuity.G2);
        go.stop(90%, 18, CurveContinuity.G2, -8, CurveContinuity.G2);
        go.endCap(Cap.tapered(10, CurveContinuity.G2));
      };
      ribbon.drawTo(0, 0);
    `);
    expect(result).toClosePath();
    expect(moveCount(result)).toBe(1); // single subpath
  });

  it('with no caps, produces two separate (unclosed) profiles', () => {
    const result = compilePath(`
      let spine = @{ h 100 };
      let two = spine.compoundVariableOffset() {|go, pb|
        go.stop(10%, 6, CurveContinuity.G1, -6, CurveContinuity.G1);
        go.stop(90%, 12, CurveContinuity.G1, -4, CurveContinuity.G1);
      };
      two.drawTo(0, 0);
    `);
    expect(result).not.toClosePath();
    expect(moveCount(result)).toBe(2); // two subpaths (drawTo move + the profile-2 move)
  });

  it('every cap style evaluates', () => {
    for (const cap of ['Cap.butt()', 'Cap.round()', 'Cap.elliptical(6)', 'Cap.tapered(10)', 'Cap.tapered(10, CurveContinuity.G2)']) {
      expect(() =>
        compilePath(`
        let s = @{ h 100 };
        let r = s.compoundVariableOffset() {|go, pb|
          go.startCap(${cap});
          go.stop(20%, 8, CurveContinuity.G1, -8, CurveContinuity.G1);
          go.stop(80%, 8, CurveContinuity.G1, -8, CurveContinuity.G1);
          go.endCap(${cap});
        };
        r.drawTo(0, 0);
      `),
      ).not.toThrow();
    }
  });

  it('compound go.stop requires 5 args; a cap requires a Cap value', () => {
    expect(() =>
      compilePath('let s = @{ h 100 }; let r = s.compoundVariableOffset() {|go, pb| go.stop(50%, 5, CurveContinuity.G1); }; r.drawTo(0,0);'),
    ).toThrow(/5 arguments/);
    expect(() =>
      compilePath('let s = @{ h 100 }; let r = s.compoundVariableOffset() {|go, pb| go.startCap(5); go.stop(50%, 5, CurveContinuity.G1, -5, CurveContinuity.G1); }; r.drawTo(0,0);'),
    ).toThrow(/Cap/);
  });
});

describe('variable-offset geometry: stop projection', () => {
  // A straight horizontal spine from (0,0) to (100,0): L command.
  const spine: GeomCmd[] = [
    { command: 'M', args: [0, 0], start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    { command: 'L', args: [100, 0], start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  ];

  it('projects a stop perpendicular to the spine by the offset distance', () => {
    const { point, spineTangent } = projectStop(spine, 0.5, 8);
    // midpoint is (50,0); left-hand normal of rightward tangent is (0,-1) → up 8.
    expect(point.x).toBeCloseTo(50, 6);
    expect(point.y).toBeCloseTo(-8, 6);
    expect(spineTangent).toBeCloseTo(0, 6); // pointing +x
  });

  it('negative offset projects to the other side', () => {
    const { point } = projectStop(spine, 0.25, -6);
    expect(point.x).toBeCloseTo(25, 6);
    expect(point.y).toBeCloseTo(6, 6);
  });
});
