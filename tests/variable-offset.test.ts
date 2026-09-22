import { describe, it, expect } from 'vitest';
import { compile } from '../src';
import { compilePath, parseSVGPath } from './helpers';
import { StringTextDocument } from '../src/language-services/document';
import { getCompletions } from '../src/language-services/completion';
import {
  buildContinuitySpline,
  buildSimpleVariableOffset,
  buildCompoundVariableOffset,
  continuityFromValue,
  projectStop,
  type Knot,
  type GeomCmd,
  type SimpleStop,
  type CompoundStop,
} from '../src/evaluator/variable-offset-geometry';
import { BUILTIN_ENUMS } from '../src/evaluator';

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

  it('rejects a single stop — a path needs at least two points', () => {
    expect(() =>
      compilePath(`
      let spine = @{ h 100 };
      let e = spine.variableOffset() {|go, pb| go.stop(50%, 10, CurveContinuity.G1); };
      e.drawTo(0, 0);
    `),
    ).toThrow(/at least 2 stops/);
  });

  it('rejects a tangent handle on the compound form', () => {
    expect(() =>
      compilePath(
        'let s = @{ h 100 }; let r = s.compoundVariableOffset() {|go, pb| go.startTangent(PolarVector(0deg, 5)); go.stop(10%, 5, CurveContinuity.G1, -5, CurveContinuity.G1); go.stop(90%, 5, CurveContinuity.G1, -5, CurveContinuity.G1); }; r.drawTo(0,0);',
      ),
    ).toThrow(/simple variableOffset/);
  });

  it('coincident stops do not crash or emit NaN', () => {
    const result = compilePath(`
      let s = @{ h 100 };
      let e = s.variableOffset() {|go, pb|
        go.stop(50%, 10, CurveContinuity.G1);
        go.stop(50%, 10, CurveContinuity.G1);
        go.stop(90%, 20, CurveContinuity.G1);
      };
      e.drawTo(0, 0);
    `);
    expect(result).not.toContain('NaN');
    expect(result.trim().startsWith('M')).toBe(true);
  });

  it('rejects missing block / no stops / out-of-range time / non-CurveContinuity', () => {
    expect(() => compilePath('let s = @{ h 100 }; let e = s.variableOffset(); e.drawTo(0,0);')).toThrow();
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| }; e.drawTo(0,0);'),
    ).toThrow(/at least 2 stops/);
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.stop(150%, 5, CurveContinuity.G1); }; e.drawTo(0,0);'),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      compilePath('let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.stop(50%, 5, 3); }; e.drawTo(0,0);'),
    ).toThrow(/CurveContinuity/);
  });

  it('rejects decreasing stop times (they silently flip cap direction)', () => {
    expect(() =>
      compilePath(
        'let s = @{ h 100 }; let e = s.variableOffset() {|go, pb| go.stop(80%, 5, CurveContinuity.G1); go.stop(20%, 5, CurveContinuity.G1); }; e.drawTo(0,0);',
      ),
    ).toThrow(/must not decrease/);
  });

  it('rejects a non-positive Cap.elliptical projection', () => {
    expect(() => compilePath('let c = Cap.elliptical(0); M 0 0')).toThrow(/positive/);
    expect(() => compilePath('let c = Cap.elliptical(-6); M 0 0')).toThrow(/positive/);
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

describe('variableOffset — editor completions (playground + VS Code LSP)', () => {
  const completeAtEnd = (src: string): string[] => {
    const lines = src.split('\n');
    return getCompletions(new StringTextDocument(src), { line: lines.length - 1, character: lines[lines.length - 1].length }).map(
      (i) => i.label,
    );
  };

  it('offers variableOffset / compoundVariableOffset on a PathBlock', () => {
    const labels = completeAtEnd('let s = @{ h 100 };\ns.');
    expect(labels).toContain('variableOffset');
    expect(labels).toContain('compoundVariableOffset');
  });

  it('offers the Cap constructors', () => {
    const labels = completeAtEnd('Cap.');
    expect(labels).toEqual(expect.arrayContaining(['butt', 'round', 'elliptical', 'tapered']));
  });

  it('offers the CurveContinuity members', () => {
    const labels = completeAtEnd('CurveContinuity.');
    expect(labels).toEqual(expect.arrayContaining(['G0', 'G1', 'G2']));
  });

  it('offers anchor on a PathBlock', () => {
    const labels = completeAtEnd('let s = @{ h 100 };\ns.');
    expect(labels).toContain('anchor');
  });
});

describe('anchor — placement recovery (origin normalization)', () => {
  // Straight horizontal spine (0,0)→(100,0): left normal points up (0,-1),
  // so a positive offset o at time t anchors at (100t, -o).

  it('simple: M anchor + draw() reproduces the un-normalized first point', () => {
    const result = compilePath(`
      let s = @{ h 100 };
      let e = s.variableOffset() {|go, pb|
        go.stop(10%, 5, CurveContinuity.G1);
        go.stop(90%, 5, CurveContinuity.G1);
      };
      M calc(20 + e.anchor.x) calc(30 + e.anchor.y)
      e.draw();
    `);
    // anchor = (10, -5) → cursor at (30, 25); the spine's own placement (20,30)
    // plus the anchor registers the curve where the un-normalized spline sat.
    const parsed = parseSVGPath(result);
    expect(parsed[0].command).toBe('M');
    expect(parsed[0].args[0]).toBeCloseTo(30, 4);
    expect(parsed[0].args[1]).toBeCloseTo(25, 4);
  });

  it('compound: anchor is profile 1\'s first knot (spine@t0 + offset1·normal)', () => {
    const result = compilePath(`
      let s = @{ h 100 };
      let r = s.compoundVariableOffset() {|go, pb|
        go.startCap(Cap.butt());
        go.stop(10%, 6, CurveContinuity.G1, -6, CurveContinuity.G1);
        go.stop(90%, 6, CurveContinuity.G1, -6, CurveContinuity.G1);
        go.endCap(Cap.butt());
      };
      M calc(r.anchor.x) calc(r.anchor.y)
      r.draw();
    `);
    // anchor = (10, -6): the ribbon starts exactly on its own profile-1 knot.
    const parsed = parseSVGPath(result);
    expect(parsed[0].command).toBe('M');
    expect(parsed[0].args[0]).toBeCloseTo(10, 4);
    expect(parsed[0].args[1]).toBeCloseTo(-6, 4);
  });

  it('anchor is unchanged by startTangent/endTangent overrides (they shape handles, not knots)', () => {
    const spine: GeomCmd[] = [
      { command: 'M', args: [0, 0], start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      { command: 'L', args: [100, 0], start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    ];
    const stops: SimpleStop[] = [
      { time: 0.1, offset: 5, continuity: 'G1' },
      { time: 0.9, offset: 5, continuity: 'G1' },
    ];
    const base = buildSimpleVariableOffset(spine, stops);
    const overridden = buildSimpleVariableOffset(
      spine,
      stops,
      { angle: -Math.PI / 2, distance: 8 },
      { angle: 0, distance: 6 },
    );
    expect(overridden.anchor).toEqual(base.anchor);
    expect(base.anchor.x).toBeCloseTo(10, 6);
    expect(base.anchor.y).toBeCloseTo(-5, 6);
  });

  it('anchor destructures like any Point', () => {
    const result = compilePath(`
      let s = @{ h 100 };
      let e = s.variableOffset() {|go, pb|
        go.stop(10%, 5, CurveContinuity.G1);
        go.stop(90%, 5, CurveContinuity.G1);
      };
      let {x, y} = e.anchor;
      M x y
    `);
    const parsed = parseSVGPath(result);
    expect(parsed[0].command).toBe('M');
    expect(parsed[0].args[0]).toBeCloseTo(10, 4);
    expect(parsed[0].args[1]).toBeCloseTo(-5, 4);
  });

  it('anchor on a plain PathBlock is a clear error, not (0,0)', () => {
    expect(() => compilePath('let s = @{ h 100 }; let p = s.anchor; M 0 0')).toThrow(
      /anchor.*variableOffset/,
    );
  });
});

describe('variable-offset orchestration builders (exact coordinates)', () => {
  // Straight horizontal spine (0,0)→(100,0).
  const spine: GeomCmd[] = [
    { command: 'M', args: [0, 0], start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    { command: 'L', args: [100, 0], start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  ];

  it('buildSimpleVariableOffset emits one normalized cubic with natural ⅓-chord handles', () => {
    const stops: SimpleStop[] = [
      { time: 0.1, offset: 10, continuity: 'G1' },
      { time: 0.9, offset: 10, continuity: 'G1' },
    ];
    const { commands: cmds, anchor } = buildSimpleVariableOffset(spine, stops);
    // knots (10,-10)→(90,-10); normalized to origin (10,-10) → segment (0,0)→(80,0).
    // The subtracted origin is reported back as the anchor.
    expect(anchor.x).toBeCloseTo(10, 6);
    expect(anchor.y).toBeCloseTo(-10, 6);
    // spine-derived flat tangents, natural handle = chord/3 = 80/3.
    expect(cmds.length).toBe(1);
    expect(cmds[0].command).toBe('c');
    const [c1x, c1y, c2x, c2y, ex, ey] = cmds[0].args;
    expect(c1x).toBeCloseTo(80 / 3, 4);
    expect(c1y).toBeCloseTo(0, 6);
    expect(c2x).toBeCloseTo((2 * 80) / 3, 4);
    expect(c2y).toBeCloseTo(0, 6);
    expect(ex).toBeCloseTo(80, 6);
    expect(ey).toBeCloseTo(0, 6);
  });

  it('buildCompoundVariableOffset follows the §4.8 traversal and closes with both caps', () => {
    const stops: CompoundStop[] = [
      { time: 0.1, offset1: 10, continuity1: 'G1', offset2: -10, continuity2: 'G1' },
      { time: 0.9, offset1: 10, continuity1: 'G1', offset2: -10, continuity2: 'G1' },
    ];
    const { commands: cmds, anchor } = buildCompoundVariableOffset(spine, stops, {
      startCap: { cap: 'butt' },
      endCap: { cap: 'butt' },
    });
    // Traversal starts at profile 1's first knot (10,-10) — that is the anchor.
    expect(anchor.x).toBeCloseTo(10, 6);
    expect(anchor.y).toBeCloseTo(-10, 6);
    // profile1 fwd → end butt cap → profile2 reversed → start butt cap → close.
    expect(cmds.map((c) => c.command)).toEqual(['c', 'l', 'c', 'l', 'z']);
    // end cap bridges p1End(90,-10)→p2End(90,10): a vertical line of +20 (relative).
    expect(cmds[1].args).toEqual([0, 20]);
    // start cap bridges p2Start(10,10)→p1Start(10,-10): vertical line of -20.
    expect(cmds[3].args).toEqual([0, -20]);
  });

  it('buildCompoundVariableOffset with no caps emits two separate subpaths (relative m)', () => {
    const stops: CompoundStop[] = [
      { time: 0.1, offset1: 10, continuity1: 'G1', offset2: -10, continuity2: 'G1' },
      { time: 0.9, offset1: 10, continuity1: 'G1', offset2: -10, continuity2: 'G1' },
    ];
    const { commands: cmds } = buildCompoundVariableOffset(spine, stops);
    // profile1 cubic, then a lowercase RELATIVE m for the profile-2 subpath, then its
    // cubic. An uppercase 'M' here serialized as a literal absolute "M 0 0"
    // (commandsToRelativeD catch-all), teleporting profile 2 to the canvas origin.
    expect(cmds.map((c) => c.command)).toEqual(['c', 'm', 'c']);
    // m delta: from p1End (90,-10 normalized → (80,0)) to p2End (90,10 → (80,20)).
    const m = cmds[1];
    expect(m.args).toEqual([0, 20]);
    expect(m.end.x - m.start.x).toBeCloseTo(0, 6);
    expect(m.end.y - m.start.y).toBeCloseTo(20, 6);
    expect(cmds.some((c) => c.command === 'z')).toBe(false);
  });

  it('REGRESSION: uncapped compound drawn away from the origin keeps profile 2 attached', () => {
    // The uppercase-M bug only bit at serialization: drawTo(200,300) emitted
    // "... M 0 0 ..." — profile 2 jumped to the canvas origin. Assert the second
    // subpath's move lands near the drawTo position, not at (0,0).
    const result = compilePath(`
      let s = @{ h 100 };
      let two = s.compoundVariableOffset() {|go, pb|
        go.stop(10%, 6, CurveContinuity.G1, -6, CurveContinuity.G1);
        go.stop(90%, 12, CurveContinuity.G1, -4, CurveContinuity.G1);
      };
      two.drawTo(200, 300);
    `);
    const parsed = parseSVGPath(result);
    const moves = parsed.filter((c) => c.command.toLowerCase() === 'm');
    expect(moves.length).toBe(2);
    // Track the absolute position of the second subpath start.
    let x = 0;
    let y = 0;
    let secondSubpathStart: { x: number; y: number } | null = null;
    for (const c of parsed) {
      if (c.command === 'M') {
        x = c.args[0];
        y = c.args[1];
      } else if (c.command === 'm') {
        x += c.args[0];
        y += c.args[1];
        secondSubpathStart = { x, y };
      } else if (c.command === 'c') {
        x += c.args[4];
        y += c.args[5];
      }
    }
    expect(secondSubpathStart).not.toBeNull();
    // p2 (reversed) starts at spine@90% offset -6/-4 side → near (280, 302-ish),
    // absolutely NOT the canvas origin.
    expect(Math.hypot(secondSubpathStart!.x, secondSubpathStart!.y)).toBeGreaterThan(100);
    expect(secondSubpathStart!.x).toBeGreaterThan(200);
    expect(secondSubpathStart!.y).toBeGreaterThan(290);
  });
});

describe('CurveContinuity value mapping stays in sync with BUILTIN_ENUMS', () => {
  it('continuityFromValue accepts every enum value and maps to the right G-level', () => {
    for (const v of Object.values(BUILTIN_ENUMS.CurveContinuity)) {
      expect(() => continuityFromValue(v)).not.toThrow();
    }
    expect(continuityFromValue(BUILTIN_ENUMS.CurveContinuity.G0)).toBe('G0');
    expect(continuityFromValue(BUILTIN_ENUMS.CurveContinuity.G1)).toBe('G1');
    expect(continuityFromValue(BUILTIN_ENUMS.CurveContinuity.G2)).toBe('G2');
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

/**
 * variableOffset / compoundVariableOffset on a ProjectedPath receiver.
 *
 * The PathBlock form origin-normalizes and hands the position back as `anchor`.
 * A ProjectedPath already lives in page coordinates, so the projected form comes
 * back registered on its spine: `draw()` lands it there with no `M` in front.
 * Contract: docs/variable-offset.md "On a projected spine".
 */
/** log() output, one joined string per call. */
function compileLogs(src: string): string[] {
  return compile(src).logs.map((l) => l.parts.map((part) => String(part.value)).join(' '));
}

describe('variableOffset on a ProjectedPath', () => {
  // `@{ h 100 }` runs east, so the left normal is (0,-1): a stop at time t with
  // offset o sits at (100t, -o) relative to the spine's own start.
  const STOPS = `go.stop(10%, 5, CurveContinuity.G1);\n  go.stop(90%, 5, CurveContinuity.G1);`;

  it('registers the result on its spine, so draw() needs no M', () => {
    const d = compilePath(`
      let spine = @{ h 100 };
      let placed = spine.project(200, 300);
      let edge = placed.variableOffset() {|go, pb|
        ${STOPS}
      };
      edge.draw();
    `);
    const cmds = parseSVGPath(d);
    expect(cmds[0].command).toBe('M');
    // 200 + 100 * 0.1 along the spine, 300 - 5 out along the left normal.
    expect(cmds[0].args[0]).toBeCloseTo(210, 6);
    expect(cmds[0].args[1]).toBeCloseTo(295, 6);
  });

  it('changes position only — the same curve as the PathBlock form placed by hand', () => {
    // The load-bearing test: the projected form round-trips the normalization by
    // its own anchor, so it must reproduce the block form placed at the same
    // point. The spline itself is solved at page-coordinate magnitudes rather
    // than around the origin, so the two agree to floating-point tolerance and
    // not bit-for-bit — hence toBeCloseTo rather than a string compare.
    const asBlock = compilePath(`
      let spine = @{ h 100 };
      let edge = spine.variableOffset() {|go, pb|
        ${STOPS}
      };
      edge.drawTo(210, 295);
    `);
    const asProjected = compilePath(`
      let spine = @{ h 100 };
      let edge = spine.project(200, 300).variableOffset() {|go, pb|
        ${STOPS}
      };
      edge.draw();
    `);
    const a = parseSVGPath(asBlock);
    const b = parseSVGPath(asProjected);
    expect(b.map((c) => c.command)).toEqual(a.map((c) => c.command));
    a.forEach((cmd, i) => {
      expect(b[i].args).toHaveLength(cmd.args.length);
      cmd.args.forEach((arg, j) => expect(b[i].args[j]).toBeCloseTo(arg, 9));
    });
  });

  it('answers anchor, equal to its own startPoint', () => {
    const logs = compileLogs(`
      let placed = @{ h 100 }.project(200, 300);
      let edge = placed.variableOffset() {|go, pb|
        ${STOPS}
      };
      log(edge.anchor, edge.startPoint);
      M 0 0
    `);
    expect(logs[0]).toBe('Point(210, 295) Point(210, 295)');
  });

  it('rejects anchor on a projected path that is not an offset result', () => {
    expect(() =>
      compilePath(`
        let placed = @{ h 100 }.project(0, 0);
        log(placed.anchor);
        M 0 0
      `),
    ).toThrow(/anchor.*variableOffset/);
  });

  it('accepts a << worker, the same as the PathBlock receiver', () => {
    const d = compilePath(`
      let profile = {|go, pb|
        ${STOPS}
      };
      let edge = @{ h 100 }.project(200, 300).variableOffset() << profile;
      edge.draw();
    `);
    const cmds = parseSVGPath(d);
    expect(cmds[0].command).toBe('M');
    expect(cmds[0].args[0]).toBeCloseTo(210, 6);
    expect(cmds[0].args[1]).toBeCloseTo(295, 6);
  });

  it('binds pb to the projected spine, so it samples in page coordinates', () => {
    const logs = compileLogs(`
      let placed = @{ h 100 }.project(200, 300);
      let edge = placed.variableOffset() {|go, pb|
        log(pb.length, pb.get(0));
        ${STOPS}
      };
      M 0 0
    `);
    expect(logs[0]).toBe('100 Point(200, 300)');
  });

  it('builds a compound ribbon in page coordinates', () => {
    const d = compilePath(`
      let edge = @{ h 100 }.project(200, 300).compoundVariableOffset() {|go, pb|
        go.startCap(Cap.butt());
        go.stop(10%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
        go.stop(90%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
        go.endCap(Cap.butt());
      };
      edge.draw();
    `);
    const cmds = parseSVGPath(d);
    expect(cmds[0].command).toBe('M');
    expect(cmds[0].args[0]).toBeCloseTo(210, 6);
    expect(cmds[0].args[1]).toBeCloseTo(295, 6);
    expect(d).toContain('z');
  });

  it('registers a capped compound ribbon correctly', () => {
    // The subtle case for the un-normalization round-trip: caps are appended
    // AFTER the profile traversal, so the first command still starts at profile
    // 1's first knot — the point `anchor` names. If that stopped holding, a
    // capped ribbon would land somewhere else.
    const caps = `
      go.startCap(Cap.tapered(10, CurveContinuity.G0));
      go.stop(10%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
      go.stop(90%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
      go.endCap(Cap.tapered(10, CurveContinuity.G0));`;
    const logs = compileLogs(`
      let spine = @{ h 100 };
      let projected = spine.project(200, 300).compoundVariableOffset() {|go, pb| ${caps}
      };
      let block = spine.compoundVariableOffset() {|go, pb| ${caps}
      };
      log(projected.anchor, projected.startPoint, block.anchor, block.startPoint);
      M 0 0
    `);
    // Projected: registered on the spine, anchor == startPoint.
    // Block: normalized to (0,0), anchor holding the removed translation.
    // The two anchors differ by exactly the projection origin.
    expect(logs[0]).toBe('Point(210, 295) Point(210, 295) Point(10, -5) Point(0, 0)');
  });

  it('rejects a spine with no arc length, on either receiver', () => {
    const stops = `go.stop(10%, 5, CurveContinuity.G1); go.stop(90%, 5, CurveContinuity.G1);`;
    expect(() => compilePath(`let e = @{ }.variableOffset() {|go, pb| ${stops} }; M 0 0`)).toThrow(/arc length/);
    expect(() =>
      compilePath(`let e = @{ m 10 10 }.project(0, 0).variableOffset() {|go, pb| ${stops} }; M 0 0`),
    ).toThrow(/arc length/);
    const compoundStops = `go.stop(10%, 5, CurveContinuity.G1, -5, CurveContinuity.G1); go.stop(90%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);`;
    expect(() =>
      compilePath(`let e = @{ m 10 10 }.compoundVariableOffset() {|go, pb| ${compoundStops} }; M 0 0`),
    ).toThrow(/arc length/);
  });

  it('still reports too-few-stops first, so existing errors keep their message', () => {
    // Check order matters: a degenerate spine AND too few stops must report the
    // stop error, which is what the PathBlock form has always said.
    expect(() => compilePath(`let e = @{ m 10 10 }.variableOffset() {|go, pb| }; M 0 0`)).toThrow(/at least 2 stops/);
  });

  it('offers the methods in completions on a ProjectedPath', () => {
    const src = `let pp = @{ h 100 }.project(0, 0);\npp.`;
    const lines = src.split('\n');
    const items = getCompletions(new StringTextDocument(src), {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    }).map((i) => i.label);
    expect(items).toContain('variableOffset');
    expect(items).toContain('compoundVariableOffset');
    expect(items).toContain('anchor');
    expect(items).toContain('toPathBlock');
  });
});
