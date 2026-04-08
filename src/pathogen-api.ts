/**
 * Pathogen Language API Surface
 *
 * Formal TypeScript declarations of all runtime-accessible functions, types, and namespaces.
 * Used by scripts/generate-completions.ts to produce completion data.
 *
 * When adding a new stdlib function or evaluator feature, declare it here.
 * Run `npm run generate:completions` to update the generated completion data.
 */

// =============================================================================
// Pathogen Type System
// =============================================================================

/** Angle values accept number literals with deg/rad/pi suffixes */
type AngleSuffix = 'deg' | 'rad' | 'pi';
type AngleValue = `${number}${AngleSuffix}` | number;

// Branded types for Pathogen runtime values
declare type PathSegment = { __brand: 'PathSegment' };
declare type PointValue = { __brand: 'PointValue' };
declare type PolarVectorValue = { __brand: 'PolarVectorValue' };
declare type ColorValue = { __brand: 'ColorValue' };
declare type CyclerValue = { __brand: 'CyclerValue' };
declare type CSSVarValue = { __brand: 'CSSVarValue' };
declare type LayerReference = { __brand: 'LayerReference' };
declare type PathContext = { __brand: 'PathContext' };
declare type ObjectValue = { __brand: 'ObjectValue' };
declare type PathogenArray<T = unknown> = { __brand: 'ArrayValue' };
declare type Value = string | number | boolean | null | ObjectValue;

// =============================================================================
// Constructors
// =============================================================================

/** Point(x, y) — Create a 2D point @boost 15 */
export declare function Point(x: number, y: number): PointValue;
/** PolarVector(angle, distance) — Polar direction/distance @boost 14 */
export declare function PolarVector(angle: AngleValue, distance: number): PolarVectorValue;
/** Cycler(array, shuffle?) — Round-robin iterator @boost 12 */
export declare function Cycler(array: PathogenArray, shuffle?: boolean): CyclerValue;
/** CSSVar('name', fallback?) — CSS custom property @boost 10 */
export declare function CSSVar(name: string, fallback?: Value): CSSVarValue;

// Layer constructors
/** PathLayer('name') — Path layer constructor @boost 12 */
export declare function PathLayer(name: string): LayerReference;
/** TextLayer('name') — Text layer constructor @boost 12 */
export declare function TextLayer(name: string): LayerReference;
/** GroupLayer('name') — Group layer constructor @boost 12 */
export declare function GroupLayer(name: string): LayerReference;

// =============================================================================
// Context-Aware Functions (implemented in evaluator, not stdlib)
// =============================================================================

/** polarPoint(angle, distance) — Point at polar offset @boost 14 */
export declare function polarPoint(angle: AngleValue, distance: number): PointValue;
/** polarOffset(angle, distance) — Relative polar offset @boost 14 */
export declare function polarOffset(angle: AngleValue, distance: number): PointValue;
/** polarMove(angle, distance) — Move in polar direction @boost 14 */
export declare function polarMove(angle: AngleValue, distance: number): PathSegment;
/** polarLine(angle, distance) — Line in polar direction @boost 14 */
export declare function polarLine(angle: AngleValue, distance: number): PathSegment;
/** arcFromCenter(dcx, dcy, r, start, end, cw) — Arc from center @boost 12 */
export declare function arcFromCenter(dcx: number, dcy: number, r: number, start: AngleValue, end: AngleValue, cw: boolean): PathSegment;
/** arcFromPolarOffset(angle, radius, sweepAngle) — Arc from polar center @boost 12 */
export declare function arcFromPolarOffset(angle: AngleValue, radius: number, sweepAngle: AngleValue): PathSegment;
/** tangentLine(length) — Line following tangent @boost 12 */
export declare function tangentLine(length: number): PathSegment;
/** tangentArc(radius, sweepAngle) — Arc from tangent @boost 12 */
export declare function tangentArc(radius: number, sweepAngle: AngleValue): PathSegment;
/** heading(angle) — Set heading direction @boost 10 */
export declare function heading(angle: AngleValue): void;
/** turn(delta) — Turn heading by delta @boost 10 */
export declare function turn(delta: AngleValue): void;

// =============================================================================
// Stdlib: Shapes
// =============================================================================

/** circle(cx, cy, r) — Draw circle @boost 15 */
export declare function circle(cx: number, cy: number, r: number): PathSegment;
/** rect(x, y, w, h) — Draw rectangle @boost 15 */
export declare function rect(x: number, y: number, w: number, h: number): PathSegment;
/** roundRect(x, y, w, h, r) — Rounded rectangle @boost 13 */
export declare function roundRect(x: number, y: number, w: number, h: number, r: number): PathSegment;
/** polygon(cx, cy, r, sides) — Regular polygon @boost 13 */
export declare function polygon(cx: number, cy: number, r: number, sides: number): PathSegment;
/** star(cx, cy, outer, inner, points) — Star shape @boost 13 */
export declare function star(cx: number, cy: number, outer: number, inner: number, points: number): PathSegment;

// =============================================================================
// Stdlib: Curves & Path Commands
// =============================================================================

/** quadratic(x1, y1, cx, cy, x2, y2) — Quadratic bezier @boost 10 */
export declare function quadratic(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): PathSegment;
/** cubic(x1, y1, c1x, c1y, c2x, c2y, x2, y2) — Cubic bezier @boost 10 */
export declare function cubic(x1: number, y1: number, c1x: number, c1y: number, c2x: number, c2y: number, x2: number, y2: number): PathSegment;
/** arc(rx, ry, rot, large, sweep, x, y) — Arc command @boost 10 */
export declare function arc(rx: number, ry: number, rot: AngleValue, large: number, sweep: number, x: number, y: number): PathSegment;
/** line(x1, y1, x2, y2) — Line segment @boost 10 */
export declare function line(x1: number, y1: number, x2: number, y2: number): PathSegment;
/** moveTo(x, y) — Move command @boost 8 */
export declare function moveTo(x: number, y: number): PathSegment;
/** lineTo(x, y) — Line command @boost 8 */
export declare function lineTo(x: number, y: number): PathSegment;
/** closePath() — Close path (Z) @boost 8 */
export declare function closePath(): PathSegment;

// =============================================================================
// Stdlib: Splines
// =============================================================================

/** cubicSpline(points) — Smooth cubic spline @boost 8 */
export declare function cubicSpline(points: PathogenArray): PathSegment;
/** quadSpline(start, points, end) — Smooth quad spline @boost 8 */
export declare function quadSpline(start: ObjectValue, points: PathogenArray, end: ObjectValue): PathSegment;
/** clippedQuadSpline(start, points, end) — Clipped quad spline @boost 8 */
export declare function clippedQuadSpline(start: ObjectValue, points: PathogenArray, end: ObjectValue): PathSegment;
/** polarCubicBezier(start, pv1, pv2, end) — Polar cubic bezier @boost 8 */
export declare function polarCubicBezier(start: PointValue, pv1: PolarVectorValue, pv2: PolarVectorValue, end: PointValue): PathSegment;

// =============================================================================
// Stdlib: Radial Wedge
// =============================================================================

/** radialWedge(innerR, outerR, fromAngle, toAngle, cornerR) — Annular sector @boost 8 */
export declare function radialWedge(innerR: number, outerR: number, fromAngle: AngleValue, toAngle: AngleValue, cornerR: number): PathSegment;

// =============================================================================
// Stdlib: Grids
// =============================================================================

/** squareGrid(type, x, y, w, h, cellSize) — Square grid @boost 8 */
export declare function squareGrid(type: string, x: number, y: number, w: number, h: number, cellSize: number): PathSegment;
/** triangleGrid(type, x, y, w, h, cellSize) — Triangle grid @boost 8 */
export declare function triangleGrid(type: string, x: number, y: number, w: number, h: number, cellSize: number): PathSegment;
/** hexagonGrid(type, x, y, w, h, cellSize, orient?) — Hex grid @boost 8 */
export declare function hexagonGrid(type: string, x: number, y: number, w: number, h: number, cellSize: number, orient?: string): PathSegment;

// =============================================================================
// Stdlib: Trig (angles in radians)
// =============================================================================

/** sin(x) — Sine @boost 12 */
export declare function sin(x: AngleValue): number;
/** cos(x) — Cosine @boost 12 */
export declare function cos(x: AngleValue): number;
/** tan(x) — Tangent @boost 8 */
export declare function tan(x: AngleValue): number;
/** asin(x) — Arc sine @boost 6 */
export declare function asin(x: number): number;
/** acos(x) — Arc cosine @boost 6 */
export declare function acos(x: number): number;
/** atan(x) — Arc tangent @boost 6 */
export declare function atan(x: number): number;
/** atan2(y, x) — Two-argument arc tangent @boost 8 */
export declare function atan2(y: number, x: number): number;

// =============================================================================
// Stdlib: Hyperbolic
// =============================================================================

/** sinh(x) — Hyperbolic sine @boost 6 */
export declare function sinh(x: number): number;
/** cosh(x) — Hyperbolic cosine @boost 6 */
export declare function cosh(x: number): number;
/** tanh(x) — Hyperbolic tangent @boost 6 */
export declare function tanh(x: number): number;

// =============================================================================
// Stdlib: Constants
// =============================================================================

/** PI() — Returns pi @boost 12 */
export declare function PI(): number;
/** TAU() — Returns 2*pi @boost 12 */
export declare function TAU(): number;
/** E() — Returns e @boost 8 */
export declare function E(): number;
/** mpi(x) — Multiply by pi @boost 6 */
export declare function mpi(x: number): number;

// =============================================================================
// Stdlib: Angle Conversion
// =============================================================================

/** deg(radians) — Convert radians to degrees @boost 10 */
export declare function deg(radians: AngleValue): number;
/** rad(degrees) — Convert degrees to radians @boost 10 */
export declare function rad(degrees: AngleValue): number;
/** normalizeAngle(angle) — Normalize to [0, 2pi) @boost 6 */
export declare function normalizeAngle(angle: AngleValue): number;

// =============================================================================
// Stdlib: Interpolation
// =============================================================================

/** lerp(a, b, t) — Linear interpolation @boost 14 */
export declare function lerp(a: number, b: number, t: number): number;
/** clamp(value, min, max) — Constrain to range @boost 14 */
export declare function clamp(value: number, min: number, max: number): number;
/** map(val, inMin, inMax, outMin, outMax) — Map between ranges @boost 12 */
export declare function map(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number;

// =============================================================================
// Stdlib: Rounding
// =============================================================================

/** floor(x) — Round down @boost 8 */
export declare function floor(x: number): number;
/** ceil(x) — Round up @boost 8 */
export declare function ceil(x: number): number;
/** round(x) — Round to nearest @boost 8 */
export declare function round(x: number): number;
/** trunc(x) — Truncate decimal @boost 6 */
export declare function trunc(x: number): number;

// =============================================================================
// Stdlib: Utility
// =============================================================================

/** abs(x) — Absolute value @boost 10 */
export declare function abs(x: number): number;
/** sign(x) — Sign (-1, 0, or 1) @boost 6 */
export declare function sign(x: number): number;
/** min(a, b, ...) — Minimum @boost 10 */
export declare function min(...values: number[]): number;
/** max(a, b, ...) — Maximum @boost 10 */
export declare function max(...values: number[]): number;

// =============================================================================
// Stdlib: Polar Coordinates
// =============================================================================

/** polarX(cx, angle, radius) — X component of polar coordinate @boost 8 */
export declare function polarX(cx: number, angle: AngleValue, radius: number): number;
/** polarY(cy, angle, radius) — Y component of polar coordinate @boost 8 */
export declare function polarY(cy: number, angle: AngleValue, radius: number): number;

// =============================================================================
// Stdlib: Random
// =============================================================================

/** random() — Random 0-1 @boost 8 */
export declare function random(): number;
/** randomRange(min, max) — Random in range @boost 8 */
export declare function randomRange(min: number, max: number): number;

// =============================================================================
// Stdlib: Exp/Log
// =============================================================================

/** exp(x) — e^x @boost 6 */
export declare function exp(x: number): number;
/** log(...) — Natural log or debug log @boost 8 */
export declare function log(x: number): number;
/** log10(x) — Base-10 log @boost 6 */
export declare function log10(x: number): number;
/** log2(x) — Base-2 log @boost 6 */
export declare function log2(x: number): number;
/** pow(x, y) — x^y @boost 8 */
export declare function pow(x: number, y: number): number;
/** sqrt(x) — Square root @boost 10 */
export declare function sqrt(x: number): number;
/** cbrt(x) — Cube root @boost 6 */
export declare function cbrt(x: number): number;

// =============================================================================
// Namespaces
// =============================================================================

/** Color — Color creation and manipulation @boost 8 @kind variable */
export declare namespace Color {
  /** Color.mix(c1, c2, t) — Interpolate colors */
  function mix(c1: ColorValue, c2: ColorValue, t: number): ColorValue;
  /** Color.palette(color, n) — Generate palette */
  function palette(color: ColorValue, n: number): ColorValue[];
  /** Color.lightDark(light, dark) — Theme-aware color */
  function lightDark(light: ColorValue, dark: ColorValue): ColorValue;
}

// =============================================================================
// Built-in Variables
// =============================================================================

/** ctx — Path context (position, start, heading) @boost 16 @kind variable */
export declare const ctx: PathContext;
