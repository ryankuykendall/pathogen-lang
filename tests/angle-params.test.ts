import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { ANGLE_PARAM_EXCLUSIONS, ANGLE_PARAMS } from '../src/angle-params';
import { contextAwareFunctions, stdlib } from '../src/stdlib';
import { ANGLE_PRESERVING_ARGS } from '../src/stdlib/angle-preserving';

/**
 * The coverage matrix for src/angle-params.ts.
 *
 * A registry is only worth having if it cannot drift from the code, so every
 * key below is exercised BEHAVIOURALLY rather than grepped: the invocation is
 * compiled twice, once with a bare literal (must throw) and once with a unit
 * (must compile). That proves in one step that the key names a real dispatch
 * target, that the enforcement is actually wired to it, and that the message
 * is the one users will see.
 *
 * `INVOCATIONS` must cover every radians key. The completeness test below
 * fails when a key is added without one, which is the whole point: a new angle
 * parameter cannot be added without either registering it or excluding it.
 *
 * Audit: project-docs/placement-audit/ (D7).
 */

const PRELUDE = `define ViewBox(0, 0, 400, 400);\ndefine default PathLayer('p') #{ fill: none; }\n`;

/** `%A%` is replaced by the angle under test. One invocation per registry key. */
const INVOCATIONS: Readonly<Record<string, string>> = {
  // stdlib
  radialWedge: `radialWedge(10, 20, %A%, 1rad, 2);`,
  polarX: `let px = polarX(10, %A%, 20); M px 0;`,
  polarY: `let py = polarY(10, %A%, 20); M 0 py;`,
  normalizeAngle: `let na = normalizeAngle(%A%); M 0 0;`,
  cubicSpline: `M 0 0; cubicSpline([{x: 0, y: 0, angle: %A%}, {x: 50, y: 50, angle: %A%}]);`,
  quadSpline: `M 0 0; quadSpline({x: 0, y: 0, angle: %A%, exit: 30}, [{x: 60, y: 0, exit: 30}], {x: 120, y: 0});`,
  clippedQuadSpline: `M 0 0; clippedQuadSpline({x: 0, y: 0, angle: %A%, exit: 100, exitTime: 0.5}, [], {x: 200, y: 0, entryTime: 0.5});`,

  // context-aware
  polarPoint: `M 0 0; let t = polarPoint(%A%, 10); L t.x t.y;`,
  polarOffset: `M 0 0; let po = polarOffset(%A%, 10); l po.dx po.dy;`,
  polarMove: `M 0 0; polarMove(%A%, 10);`,
  polarLine: `M 0 0; polarLine(%A%, 10);`,
  arcFromCenter: `M 0 0; arcFromCenter(10, 10, 5, %A%, 1rad, true);`,
  arcFromPolarOffset: `M 0 0; arcFromPolarOffset(%A%, 10, 1rad);`,
  tangentArc: `M 0 0; h 10; tangentArc(20, %A%);`,
  heading: `M 0 0; heading(%A%); tangentLine(10);`,
  turn: `M 0 0; h 10; turn(%A%); tangentLine(10);`,

  // PathBlock / ProjectedPath — both switches carry the same five names
  'PathBlock.mirror': `@{ m 0 0 h 40 v 40 }.mirror(%A%).draw();`,
  'PathBlock.rotate': `@{ m 0 0 h 40 v 40 }.rotate(%A%).draw();`,
  'PathBlock.rotateAtVertexIndex': `@{ m 0 0 h 40 v 40 }.rotateAtVertexIndex(1, %A%).draw();`,
  'PathBlock.ellipticalFillet': `@{ m 0 0 h 40 v 40 }.ellipticalFillet(8, 4, %A%).draw();`,
  'PathBlock.ellipticalFilletAtVertex': `@{ m 0 0 h 40 v 40 h -40 }.ellipticalFilletAtVertex(1, 8, 4, %A%).draw();`,
  'ProjectedPath.mirror': `@{ m 0 0 h 40 v 40 }.project(10, 10).mirror(%A%).draw();`,
  'ProjectedPath.rotate': `@{ m 0 0 h 40 v 40 }.project(10, 10).rotate(%A%).draw();`,
  'ProjectedPath.rotateAtVertexIndex': `@{ m 0 0 h 40 v 40 }.project(10, 10).rotateAtVertexIndex(1, %A%).draw();`,
  'ProjectedPath.ellipticalFillet': `@{ m 0 0 h 40 v 40 }.project(10, 10).ellipticalFillet(8, 4, %A%).draw();`,
  'ProjectedPath.ellipticalFilletAtVertex': `@{ m 0 0 h 40 v 40 h -40 }.project(10, 10).ellipticalFilletAtVertex(1, 8, 4, %A%).draw();`,

  // other value types
  PolarVector: `let v = PolarVector(%A%, 10); M 0 0;`,
  'Point.polarTranslate': `let q = Point(1, 2).polarTranslate(%A%, 10); M q.x q.y;`,
  'Point.rotate': `let q = Point(1, 2).rotate(%A%, Point(0, 0)); M q.x q.y;`,
  'PolarVector.turn': `let v = PolarVector(1rad, 10).turn(%A%); M 0 0;`,
  'Endpoint.ellipticalFillet': `@{ m 0 0 h 40 as endpoint('c') v 40 }.vertex('c').ellipticalFillet(8, 4, %A%).draw();`,
  'transform.rotate.set': `M 0 0; ctx.transform.rotate.set(%A%);`,

  // text surfaces
  text: `let t = TextLayer('t') #{ font-size: 10; };\nt.apply { text(10, 20, %A%)\`hi\`; }\nM 0 0;`,
  'TextBlock.polarProject': `let b = &{ text(0, 10)\`hi\` }; let q = b.polarProject(10, 10, %A%, 20, BBoxAnchor.Left); M 0 0;`,
  'TextBlock.radialProject': `let b = &{ text(0, 10)\`hi\` }; let q = b.radialProject(10, 10, %A%, 20); M 0 0;`,
  'TextBlock.drawTo': `let tl = TextLayer('t') #{ font-size: 10; };\nlet b = &{ text(0, 10)\`hi\` };\ntl.apply { b.drawTo(10, 10, %A%); }\nM 0 0;`,
  'ProjectedText.polarProject': `let b = &{ text(0, 10)\`hi\` }.project(5, 5); let q = b.polarProject(10, 10, %A%, 20, BBoxAnchor.Left); M 0 0;`,
  'ProjectedText.drawTo': `let tl = TextLayer('t') #{ font-size: 10; };\nlet b = &{ text(0, 10)\`hi\` }.project(5, 5);\ntl.apply { b.drawTo(10, 10, %A%); }\nM 0 0;`,

  tspan: `let tl = TextLayer('t') #{ font-size: 10; };\ntl.apply { text(10, 20) { tspan(0, 0, %A%)\`hi\`; } }\nM 0 0;`,

  // property assignments
  Marker: `let m = Marker('mk', 10, 10); m.orient = %A%; M 0 0;`,
  ConicGradient: `let g = ConicGradient('cg', 50, 50); g.from = %A%; M 0 0;`,
  EmbossFilter: `let ef = EmbossFilter() {|f| f.angle = %A%; };\nM 0 0;`,
  ElevationShadowFilter: `let sf = ElevationShadowFilter() {|f| f.direction = %A%; };\nM 0 0;`,
  MotionBlurFilter: `let mf = MotionBlurFilter() {|f| f.angle = %A%; };\nM 0 0;`,

  // layer style shorthand
  'style.rotate': `define default PathLayer('q') #{ fill: none; rotate: %A%; }\nM 0 0; h 10;`,
};

/** The registry entries the rule actually validates. Degrees slots are exempt. */
const RADIANS_KEYS = Object.keys(ANGLE_PARAMS).filter((key) => ANGLE_PARAMS[key].unit === 'rad');
const DEGREES_KEYS = Object.keys(ANGLE_PARAMS).filter((key) => ANGLE_PARAMS[key].unit === 'deg');

/** `style.rotate` supplies its own `define default`, so it must not get a second. */
function program(key: string, angle: string): string {
  const body = INVOCATIONS[key].replace(/%A%/g, angle);
  return key === 'style.rotate' ? `define ViewBox(0, 0, 400, 400);\n${body}` : PRELUDE + body;
}

describe('the angle-parameter registry stays in step with the code', () => {
  it('covers every radians key with an invocation', () => {
    const missing = RADIANS_KEYS.filter((key) => !INVOCATIONS[key]);
    expect(missing, `add an INVOCATIONS entry for each: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no invocation for a key that is not in the registry', () => {
    const extra = Object.keys(INVOCATIONS).filter((key) => !ANGLE_PARAMS[key]);
    expect(extra).toEqual([]);
  });

  it.each(RADIANS_KEYS)('%s: a bare literal is an error', (key) => {
    expect(() => compile(program(key, '0.3'))).toThrow(/takes an angle|requires an angle unit/);
  });

  it.each(RADIANS_KEYS)('%s: the same literal with a unit compiles', (key) => {
    expect(() => compile(program(key, '0.3rad'))).not.toThrow();
  });

  it.each(RADIANS_KEYS)('%s: zero stays legal without a unit', (key) => {
    // 0 is 0 in any unit; sanitize.ts takes the same line for CSS angles.
    expect(() => compile(program(key, '0'))).not.toThrow();
  });

  it.each(RADIANS_KEYS)('%s: a variable is not a literal, so it passes', (key) => {
    // The rule is static: it closes the LITERAL trap, not the variable trap.
    const src = program(key, 'spin').replace(/^define ViewBox[^\n]*\n/, (m) => `${m}let spin = 0.3;\n`);
    expect(() => compile(src)).not.toThrow();
  });
});

describe('a more fundamental error still wins', () => {
  // Where a call validates its own arity or rejects null, that error is the one
  // to report: the angle-unit check runs after it. Pinning the cases that were
  // reordered to make this true, so the ordering cannot silently regress.
  it('PolarVector reports the argument count, not the missing unit', () => {
    expect(() => compile(`${PRELUDE}let pv = PolarVector(45); M 0 0;`)).toThrow(/PolarVector\(\) expects 2 arguments/);
  });

  it('transform.rotate.set reports the argument count, not the missing unit', () => {
    expect(() => compile(`${PRELUDE}M 0 0; ctx.transform.rotate.set(45, 1);`)).toThrow(
      /rotate\.set\(\) expects 1 or 3 arguments/,
    );
  });

  it('a context-aware function reports a null argument, not the missing unit', () => {
    expect(() => compile(`${PRELUDE}let missing = null;\nM 0 0 h 10 tangentArc(missing, 45);`)).toThrow(
      /tangentArc\(\).*argument 1.*null/,
    );
  });

  it('but the unit error still fires once the call itself is well formed', () => {
    expect(() => compile(`${PRELUDE}let pv = PolarVector(45, 10); M 0 0;`)).toThrow(/takes an angle/);
    expect(() => compile(`${PRELUDE}M 0 0; ctx.transform.rotate.set(45);`)).toThrow(/takes an angle/);
  });
});

describe('the registry names real things', () => {
  it('every bare key is a stdlib export or a context-aware function', () => {
    // Dotted keys are receiver-qualified methods; the behavioural matrix above
    // already proves those reach a real dispatch target.
    for (const key of Object.keys(ANGLE_PARAMS).filter((name) => !name.includes('.'))) {
      const isStdlib = typeof (stdlib as Record<string, unknown>)[key] === 'function';
      const isCtx = contextAwareFunctions.has(key);
      const isConstructorOrStatement = [
        'Color',
        'PolarVector',
        'Marker',
        'ConicGradient',
        'EmbossFilter',
        'ElevationShadowFilter',
        'MotionBlurFilter',
        'text',
        'tspan',
      ].includes(key);
      expect(isStdlib || isCtx || isConstructorOrStatement, `${key} names nothing`).toBe(true);
    }
  });

  it('every entry declares a unit', () => {
    for (const [key, spec] of Object.entries(ANGLE_PARAMS)) {
      expect(['rad', 'deg'], `${key} has no unit`).toContain(spec.unit);
    }
  });

  it('every entry names at least one parameter', () => {
    for (const [key, spec] of Object.entries(ANGLE_PARAMS)) {
      const named = (spec.args?.length ?? 0) + (spec.props?.length ?? 0) + (spec.fields?.length ?? 0);
      expect(named, `${key} names no parameter`).toBeGreaterThan(0);
    }
  });
});

describe('the registry and ANGLE_PRESERVING_ARGS stay distinct', () => {
  it('overlaps only at normalizeAngle', () => {
    // ANGLE_PRESERVING_ARGS says which arguments carry angle-ness THROUGH a
    // math helper; ANGLE_PARAMS says which parameters ARE angles. Every other
    // preserving entry is value-space polymorphic, not angle-specific.
    const overlap = Object.keys(ANGLE_PRESERVING_ARGS).filter((name) => ANGLE_PARAMS[name]);
    expect(overlap).toEqual(['normalizeAngle']);
  });

  it('no excluded name is also registered', () => {
    const both = Object.keys(ANGLE_PARAM_EXCLUSIONS).filter((name) => ANGLE_PARAMS[name]);
    expect(both).toEqual([]);
  });

  it('every exclusion states a reason', () => {
    for (const [name, reason] of Object.entries(ANGLE_PARAM_EXCLUSIONS)) {
      expect(reason.length, `${name} has no reason`).toBeGreaterThan(5);
    }
  });
});

describe('degrees slots are deliberately exempt', () => {
  it.each(DEGREES_KEYS)('%s is a degrees slot', (key) => {
    expect(ANGLE_PARAMS[key].unit).toBe('deg');
  });

  it('a bare hue is still legal, because it already means degrees', () => {
    expect(() => compile(`${PRELUDE}let c = Color(0.7, 0.2, 240); M 0 0;`)).not.toThrow();
    expect(() => compile(`${PRELUDE}let c = Color(0.7, 0.2, 240).hueShift(30); M 0 0;`)).not.toThrow();
  });

  it('a bare arc rotation is still legal, because SVG defines that slot as degrees', () => {
    expect(() => compile(`${PRELUDE}M 0 0; arc(50, 50, 45, 1, 1, 150, 100);`)).not.toThrow();
  });
});
