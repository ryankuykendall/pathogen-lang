/**
 * Which parameters are ANGLES — the single source of truth.
 *
 * Radians are pathogen's internal measure, so for most of the language's life a
 * bare number in an angle position simply meant radians. That is easy to get
 * catastrophically wrong: `#{ rotate: 45; }` renders as `rotate(2578.31)` and
 * nothing complains. Every position listed here therefore requires an explicit
 * unit on a literal — `45deg`, `1.5rad`, `0.25pi` — while any value that is not
 * a literal (a variable, a member access, a call) still flows through and is
 * read as radians.
 *
 * INVARIANT: every key must name a real dispatch target, and every angle
 * parameter in the language should appear here or in the exclusion list below.
 * When you add a parameter that is an angle, add it here; when you add one that
 * merely sounds like an angle, add it to the exclusions with a reason.
 *
 * What the coverage matrix (tests/angle-params.test.ts) does and does not
 * prove: it compiles every registered radians position twice, so a key listed
 * here but NOT actually enforced fails, and it rejects overlap between the two
 * lists. It cannot find a parameter missing from BOTH lists — that needs a
 * static scan of the evaluator. A passing matrix means "everything claimed here
 * is true", not "nothing is missing".
 *
 * This is NOT ANGLE_PRESERVING_ARGS (src/stdlib/angle-preserving.ts). That map
 * says which arguments carry angle-ness THROUGH a math helper (`lerp`, `clamp`,
 * `abs`); this one says which parameters ARE angles. `normalizeAngle` is the
 * one name in both.
 *
 * ## unit
 *
 * `unit` is required, because two positions read DEGREES rather than radians
 * and a blanket "append rad" migration would silently break them:
 *   - `arc()`'s rotation and the raw SVG `A`/`a` rotation slot, degrees by spec
 *   - the OKLCH colour hue family
 * It also drives conversion, not just validation: the consumer is handed the
 * unit it actually wants, which is what keeps the two conventions from being
 * confused again.
 *
 * ## keys
 *
 * Receiver-qualified (`PathBlock.rotate`, not `rotate`), because the same
 * method name has different signatures on different receivers:
 * `PathBlock.drawTo(x, y)` has no rotation while `TextBlock.drawTo(x, y, rot?)`
 * does, and `PolarVector.mirror()` takes no arguments at all where
 * `PathBlock.mirror(angle)` takes one. A bare name-set (the CALLBACK_METHODS
 * shape) would demand an angle where none exists.
 */

export interface AngleParamSpec {
  /** Positional argument indices that are angles. */
  args?: readonly number[];
  /** Assigned property names that are angles (`marker.orient = …`). */
  props?: readonly string[];
  /** Fields of a structured argument that are angles (`{ x, y, angle: … }`). */
  fields?: readonly string[];
  /** The unit the CONSUMER wants. Radians unless the slot is written into SVG or CSS as degrees. */
  unit: 'rad' | 'deg';
}

export const ANGLE_PARAMS: Readonly<Record<string, AngleParamSpec>> = {
  // ---- stdlib, plain functions (src/stdlib/) ----
  // arc's rotation is written verbatim into the SVG `A` command, which the spec
  // defines as degrees. Args 3 and 4 are the large-arc and sweep FLAGS.
  arc: { args: [2], unit: 'deg' },
  radialWedge: { args: [2, 3], unit: 'rad' }, // fromAngle, toAngle
  polarX: { args: [1], unit: 'rad' },
  polarY: { args: [1], unit: 'rad' },
  normalizeAngle: { args: [0], unit: 'rad' },
  cubicSpline: { fields: ['angle'], unit: 'rad' },
  quadSpline: { fields: ['angle'], unit: 'rad' },
  clippedQuadSpline: { fields: ['angle'], unit: 'rad' },

  // ---- context-aware functions (src/stdlib/index.ts contextAwareFunctions) ----
  polarPoint: { args: [0], unit: 'rad' },
  polarOffset: { args: [0], unit: 'rad' },
  polarMove: { args: [0], unit: 'rad' },
  polarLine: { args: [0], unit: 'rad' },
  arcFromCenter: { args: [3, 4], unit: 'rad' }, // startAngle, endAngle
  arcFromPolarOffset: { args: [0, 2], unit: 'rad' }, // angle, sweepAngle
  tangentArc: { args: [1], unit: 'rad' }, // sweepAngle; arg 0 is a radius
  heading: { args: [0], unit: 'rad' },
  turn: { args: [0], unit: 'rad' }, // an angle DELTA, despite the name

  // ---- PathBlock / ProjectedPath (the two duplicated dispatch switches) ----
  'PathBlock.mirror': { args: [0], unit: 'rad' },
  'PathBlock.rotate': { args: [0], unit: 'rad' },
  'PathBlock.rotateAtVertexIndex': { args: [1], unit: 'rad' },
  'PathBlock.ellipticalFillet': { args: [2], unit: 'rad' },
  'PathBlock.ellipticalFilletAtVertex': { args: [3], unit: 'rad' },
  'ProjectedPath.mirror': { args: [0], unit: 'rad' },
  'ProjectedPath.rotate': { args: [0], unit: 'rad' },
  'ProjectedPath.rotateAtVertexIndex': { args: [1], unit: 'rad' },
  'ProjectedPath.ellipticalFillet': { args: [2], unit: 'rad' },
  'ProjectedPath.ellipticalFilletAtVertex': { args: [3], unit: 'rad' },

  // ---- other value types ----
  PolarVector: { args: [0], unit: 'rad' },
  'Point.polarTranslate': { args: [0], unit: 'rad' },
  'Point.rotate': { args: [0], unit: 'rad' },
  'PolarVector.turn': { args: [0], unit: 'rad' },
  'Endpoint.ellipticalFillet': { args: [2], unit: 'rad' },
  'transform.rotate.set': { args: [0], unit: 'rad' }, // args 1-2 are a centre point

  // ---- colour: OKLCH hue is degrees ----
  Color: { args: [2], unit: 'deg' }, // Color(L, C, H[, alpha])
  'Color.hueShift': { args: [0], unit: 'deg' },
  'Color.analogous': { args: [0], unit: 'deg' },
  'Color.splitComplementary': { args: [0], unit: 'deg' },

  // ---- text surfaces (all radians; converted to degrees at render) ----
  text: { args: [2], unit: 'rad' }, // text(x, y, rotation?)
  tspan: { args: [2], unit: 'rad' }, // tspan(dx, dy, rotation?)
  'TextBlock.polarProject': { args: [2], unit: 'rad' },
  'TextBlock.radialProject': { args: [2], unit: 'rad' },
  'TextBlock.drawTo': { args: [2], unit: 'rad' },
  'ProjectedText.polarProject': { args: [2], unit: 'rad' },
  'ProjectedText.drawTo': { args: [2], unit: 'rad' },

  // ---- property assignments ----
  Marker: { props: ['orient'], unit: 'rad' },
  // Enforced by its OWN older check in evaluator/member-assign.ts, not by the
  // generic receiver path: every gradient shares the runtime tag
  // `GradientValue` and is told apart by `gradientType`, so `receiverTypeName`
  // yields 'Gradient' and never matches this key. Listed anyway because it IS
  // an angle parameter, and the coverage matrix compiles it — so deleting that
  // older check fails the build rather than silently reopening the trap.
  ConicGradient: { props: ['from', 'to'], unit: 'rad' },
  EmbossFilter: { props: ['angle', 'elevation'], unit: 'rad' },
  ElevationShadowFilter: { props: ['direction'], unit: 'rad' },
  MotionBlurFilter: { props: ['angle'], unit: 'rad' },

  // ---- layer style shorthand ----
  'style.rotate': { args: [0], unit: 'rad' },
};

/**
 * Parameters that are NOT angles, each with the reason. Without this list the
 * rule looks arbitrary, and the coverage matrix uses it as the other half of an
 * exhaustive partition: a new stdlib function must land in one list or the
 * other.
 */
export const ANGLE_PARAM_EXCLUSIONS: Readonly<Record<string, string>> = {
  // --- angle in, ratio out; angle out, number in ---
  sin: 'consumes an angle into a ratio; docs/syntax.md documents sin(45deg) === sin(rad(45))',
  cos: 'consumes an angle into a ratio',
  tan: 'consumes an angle into a ratio',
  asin: 'PRODUCES plain radians',
  acos: 'PRODUCES plain radians',
  atan: 'PRODUCES plain radians',
  atan2: 'PRODUCES plain radians',
  sinh: 'hyperbolic; the argument is not an angle',
  cosh: 'hyperbolic; the argument is not an angle',
  tanh: 'hyperbolic; the argument is not an angle',
  mpi: 'the argument is a plain multiplier of pi; the result is plain radians',

  // --- the converters themselves ---
  deg: 'a unit converter: radians in, a plain number of degrees out. Requiring a unit inverts its purpose',
  rad: 'a unit converter: degrees in, a plain number of radians out',

  // --- flags, counts, ratios and lengths that read like angles ---
  'arc.flags': 'arc args 3 and 4 are the large-arc and sweep FLAGS, 0 or 1',
  'PathBlock.startAt': 'an arc-length FRACTION, despite calling rotateStartCommands internally',
  'PathBlock.tangent': 't is a fraction; the returned .angle is a plain number by documented contract',
  'PathBlock.normal': 't is a fraction; the returned .angle is a plain number',
  'PathBlock.partition': 'a count',
  'PathBlock.fillet': 'a radius — a length',
  'PathBlock.chamfer': 'distances — lengths',
  'Grid.orientation': "an 'edge' | 'vertex' enum string",
  'go.stop': 'time is 0..1 and offset is a length',
  'Cap.elliptical': 'a projection length',
  'Cap.tapered': 'a length and a continuity enum',
  'TopoGradient.contour': 'an elevation HEIGHT, not an angle',

  // --- the elevation name collision, which costs a reader real time ---
  'ElevationShadowFilter.elevation':
    'a Material depth 0-24, NOT an angle — unlike EmbossFilter.elevation, which is a light elevation angle and IS in the registry',
};

/** Zero is exempt everywhere: 0 is 0 in any unit, and `sanitize.ts` already takes that line. */
export const ANGLE_UNIT_ZERO_EXEMPT = true;
