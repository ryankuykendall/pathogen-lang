/**
 * Pathogen Language API Surface
 *
 * Formal TypeScript declarations of all runtime-accessible functions, types, and namespaces.
 * Used by scripts/generate-completions.ts to produce completion data.
 *
 * When adding a new stdlib function or evaluator feature, declare it here.
 * Run `npm run generate:completions` to update the generated completion data.
 */
/* eslint-disable @typescript-eslint/method-signature-style --
 * The completion generator distinguishes methods (get snippet templates via
 * iface.getMethods()) from properties. Converting `m(a): R` to `m: (a) => R`
 * silently empties every method set — keep method signature style here. */

// =============================================================================
// Pathogen Type System
// =============================================================================

/** Angle values accept number literals with deg/rad/pi suffixes */
type AngleSuffix = 'deg' | 'rad' | 'pi';
type AngleValue = `${number}${AngleSuffix}` | number;

/**
 * First-class Angle runtime value, produced by angle-suffixed literals
 * (90deg, 1.5pi, 2rad). Coerces to radians in numeric contexts.
 * @type Angle
 */
export interface PathogenAngle {
  /** The angle in degrees */
  readonly deg: number;
  /** The angle in radians */
  readonly rad: number;
  /** The angle in multiples of π (90deg → 0.5) */
  readonly pi: number;
  /** The angle in full circles (1 = 360°) */
  readonly turns: number;
  /** toDeg() — Same angle, displayed in degrees */
  toDeg(): PathogenAngle;
  /** toRad() — Same angle, displayed in radians */
  toRad(): PathogenAngle;
  /** toPi() — Same angle, displayed in multiples of π */
  toPi(): PathogenAngle;
  /** toTurns() — Same angle, displayed in full circles */
  toTurns(): PathogenAngle;
}

// Forward-declared types (interfaces for runtime types defined at end of file)
declare interface PathSegment {
  __brand: 'PathSegment';
}
declare interface ColorValue {
  __brand: 'ColorValue';
}
declare interface CapValue {
  __brand: 'CapValue';
}
declare type Value = string | number | boolean | null;

// =============================================================================
// Constructors
// =============================================================================

/** Point(x, y) — Create a 2D point @boost 15 */
export declare function Point(x: number, y: number): PathogenPoint;
/** PolarVector(angle, distance) — Polar direction/distance @boost 14 */
export declare function PolarVector(angle: AngleValue, distance: number): PathogenPolarVector;
/** Cycler(array, shuffle?) — Round-robin iterator @boost 12 */
export declare function Cycler(array: PathogenArray, shuffle?: boolean): PathogenCycler;
/** CSSVar('name', fallback?) — CSS custom property @boost 10 */
export declare function CSSVar(name: string, fallback?: Value): PathogenCSSVar;

// Layer constructors
/** PathLayer('name') — Path layer constructor @boost 12 */
export declare function PathLayer(name: string): PathogenPathLayer | PathogenTextLayer | PathogenGroupLayer;
/** TextLayer('name') — Text layer constructor @boost 12 */
export declare function TextLayer(name: string): PathogenPathLayer | PathogenTextLayer | PathogenGroupLayer;
/** GroupLayer('name') — Group layer constructor @boost 12 */
export declare function GroupLayer(name: string): PathogenPathLayer | PathogenTextLayer | PathogenGroupLayer;

// Filter constructors — see docs/filters.md
/** NoiseFilter() — Grain/paper/speckle/static/grainy-gradient noise filter @boost 11 @snippet NoiseFilter() {|${1:f}|\n\t$0\n} */
export declare function NoiseFilter(): PathogenNoiseFilter;
/** GlowFilter() — Outer or inner soft glow @boost 11 @snippet GlowFilter() {|${1:f}|\n\t$0\n} */
export declare function GlowFilter(): PathogenGlowFilter;
/** EmbossFilter() — Light-source-based embossed surface @boost 11 @snippet EmbossFilter() {|${1:f}|\n\t$0\n} */
export declare function EmbossFilter(): PathogenEmbossFilter;
/** ElevationShadowFilter() — Material-style layered depth shadow @boost 11 @snippet ElevationShadowFilter() {|${1:f}|\n\t$0\n} */
export declare function ElevationShadowFilter(): PathogenElevationShadowFilter;
/** InnerShadowFilter() — Inset shadow (capability CSS drop-shadow() lacks) @boost 11 @snippet InnerShadowFilter() {|${1:f}|\n\t$0\n} */
export declare function InnerShadowFilter(): PathogenInnerShadowFilter;
/** PixelateFilter(width?, height?, radius?) — Mosaic / pixelation filter @boost 11 @snippet PixelateFilter() {|${1:f}|\n\t$0\n} */
export declare function PixelateFilter(width?: number, height?: number, radius?: number): PathogenPixelateFilter;
/** MotionBlurFilter() — Directional (linear) or progressive blur; configure via trailing block @boost 11 @snippet MotionBlurFilter() {|${1:f}|\n\t$0\n} */
export declare function MotionBlurFilter(): PathogenMotionBlurFilter;

/** Grid(rows, cols, options?) — 2D mutable grid of values mapped to canvas coords. Trailing block runs at construction. @boost 12 @snippet Grid(${1:rows}, ${2:cols}) {|${3:g}|\n\t$0\n} */
export declare function Grid(rows: number, cols: number, options?: PathogenGridOptions): PathogenGrid;

// Defs constructors — masks, clip paths, gradients, patterns, markers
// (see docs/masks.md, docs/gradients.md, docs/markers.md)
/** SVGDocumentFragment(svg) — Parse an SVG string into an insertable fragment @boost 8 */
export declare function SVGDocumentFragment(svg: string): PathogenSVGFragment;
/** Mask('id') — Luminance mask; add shapes with .append(path, styles?) @boost 10 */
export declare function Mask(id: string): PathogenMask;
/** ClipPath('id') — Clipping region; add shapes with .append(path) @boost 10 */
export declare function ClipPath(id: string): PathogenClipPath;
/** LinearGradient('id', x1, y1, x2, y2) {|g| ...} — Linear gradient between two points @boost 11 @snippet LinearGradient('${1:id}', ${2:0}, ${3:0}, ${4:1}, ${5:1}) {|${6:g}|\n\t$0\n} */
export declare function LinearGradient(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): PathogenLinearGradient;
/** RadialGradient('id', cx, cy, r, fx?, fy?) {|g| ...} — Radial gradient from a center point @boost 11 @snippet RadialGradient('${1:id}', ${2:0.5}, ${3:0.5}, ${4:0.5}) {|${5:g}|\n\t$0\n} */
export declare function RadialGradient(
  id: string,
  cx: number,
  cy: number,
  r: number,
  fx?: number,
  fy?: number,
): PathogenRadialGradient;
/** ConicGradient('id', cx, cy) {|g| ...} — Angular sweep gradient (rasterized) @boost 10 @snippet ConicGradient('${1:id}', ${2:cx}, ${3:cy}) {|${4:g}|\n\t$0\n} */
export declare function ConicGradient(id: string, cx: number, cy: number): PathogenConicGradient;
/** MeshGradient('id', width, height, cols, rows) {|g| ...} — Grid of color control points (rasterized; cols/rows >= 2) @boost 10 @snippet MeshGradient('${1:id}', ${2:width}, ${3:height}, ${4:2}, ${5:2}) {|${6:g}|\n\t$0\n} */
export declare function MeshGradient(
  id: string,
  width: number,
  height: number,
  cols: number,
  rows: number,
): PathogenMeshGradient;
/** FreeformGradient('id', width, height) {|g| ...} — Scattered color points with distance falloff (rasterized) @boost 10 @snippet FreeformGradient('${1:id}', ${2:width}, ${3:height}) {|${4:g}|\n\t$0\n} */
export declare function FreeformGradient(id: string, width: number, height: number): PathogenFreeformGradient;
/** TopoGradient('id', width, height) {|g| ...} — Elevation contours blended into a color field (rasterized) @boost 10 @snippet TopoGradient('${1:id}', ${2:width}, ${3:height}) {|${4:g}|\n\t$0\n} */
export declare function TopoGradient(id: string, width: number, height: number): PathogenTopoGradient;
/** Pattern('id', x, y, width, height) {|p| ...} — Repeating tile; add shapes with .append(path, styles?) @boost 10 @snippet Pattern('${1:id}', ${2:0}, ${3:0}, ${4:10}, ${5:10}) {|${6:p}|\n\t$0\n} */
export declare function Pattern(id: string, x: number, y: number, width: number, height: number): PathogenPattern;
/** Marker('id', markerWidth, markerHeight) {|m| ...} — Arrowhead/vertex marker; styles support context-stroke and context-fill @boost 10 @snippet Marker('${1:id}', ${2:10}, ${3:10}) {|${4:m}|\n\t$0\n} */
export declare function Marker(id: string, markerWidth: number, markerHeight: number): PathogenMarker;

// =============================================================================
// Context-Aware Functions (implemented in evaluator, not stdlib)
// =============================================================================

/** polarPoint(angle, distance) — Point at polar offset @boost 14 */
export declare function polarPoint(angle: AngleValue, distance: number): PathogenPoint;
/** polarOffset(angle, distance) — Relative polar offset @boost 14 */
export declare function polarOffset(angle: AngleValue, distance: number): PathogenPoint;
/** polarMove(angle, distance) — Move in polar direction @boost 14 */
export declare function polarMove(angle: AngleValue, distance: number): PathSegment;
/** polarLine(angle, distance) — Line in polar direction @boost 14 */
export declare function polarLine(angle: AngleValue, distance: number): PathSegment;
/** arcFromCenter(dcx, dcy, r, start, end, cw) — Arc from center @boost 12 */
export declare function arcFromCenter(
  dcx: number,
  dcy: number,
  r: number,
  start: AngleValue,
  end: AngleValue,
  cw: boolean,
): PathSegment;
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
export declare function cubic(
  x1: number,
  y1: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x2: number,
  y2: number,
): PathSegment;
/** arc(rx, ry, rot, large, sweep, x, y) — Arc command @boost 10 */
export declare function arc(
  rx: number,
  ry: number,
  rot: AngleValue,
  large: number,
  sweep: number,
  x: number,
  y: number,
): PathSegment;
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
export declare function quadSpline(start: PathogenObject, points: PathogenArray, end: PathogenObject): PathSegment;
/** clippedQuadSpline(start, points, end) — Clipped quad spline @boost 8 */
export declare function clippedQuadSpline(
  start: PathogenObject,
  points: PathogenArray,
  end: PathogenObject,
): PathSegment;
/** polarCubicBezier(start, pv1, pv2, end) — Polar cubic bezier @boost 8 */
export declare function polarCubicBezier(
  start: PathogenPoint,
  pv1: PathogenPolarVector,
  pv2: PathogenPolarVector,
  end: PathogenPoint,
): PathSegment;

// =============================================================================
// Stdlib: Radial Wedge
// =============================================================================

/** radialWedge(innerR, outerR, fromAngle, toAngle, cornerR) — Annular sector @boost 8 */
export declare function radialWedge(
  innerR: number,
  outerR: number,
  fromAngle: AngleValue,
  toAngle: AngleValue,
  cornerR: number,
): PathSegment;

// =============================================================================
// Stdlib: Grids
// =============================================================================

/** squareGrid(type, x, y, w, h, cellSize) — Square grid @boost 8 */
export declare function squareGrid(
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number,
): PathSegment;
/** triangleGrid(type, x, y, w, h, cellSize) — Triangle grid @boost 8 */
export declare function triangleGrid(
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number,
): PathSegment;
/** hexagonGrid(type, x, y, w, h, cellSize, orient?) — Hex grid @boost 8 */
export declare function hexagonGrid(
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number,
  orient?: string,
): PathSegment;

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
/** normalizeAngle(angle) — Normalize to [0, 2pi); angle-preserving @boost 6 */
export declare function normalizeAngle(angle: AngleValue): number;

// =============================================================================
// Stdlib: Interpolation
// =============================================================================

/** lerp(a, b, t) — Linear interpolation; angle-preserving (a, b) @boost 14 */
export declare function lerp(a: number, b: number, t: number): number;
/** clamp(value, min, max) — Constrain to range; angle-preserving @boost 14 */
export declare function clamp(value: number, min: number, max: number): number;
/** map(val, inMin, inMax, outMin, outMax) — Map between ranges; angle-preserving (outMin, outMax) @boost 12 */
export declare function map(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
/** smoothstep(edge0, edge1, x) — Hermite ease from 0 to 1 between edges @boost 12 */
export declare function smoothstep(edge0: number, edge1: number, x: number): number;
/** bump(t, center, spread) — Raised-cosine kernel: 1 at center, easing to 0 at center ± spread @boost 10 */
export declare function bump(t: number, center: number, spread: number): number;
/** easeIn(t) — Quadratic ease-in: t² over clamped [0, 1] @boost 8 */
export declare function easeIn(t: number): number;
/** easeOut(t) — Quadratic ease-out: 1 − (1−t)² over clamped [0, 1] @boost 8 */
export declare function easeOut(t: number): number;
/** easeInOut(t) — Quadratic ease-in-out over clamped [0, 1] @boost 8 */
export declare function easeInOut(t: number): number;

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

/** abs(x) — Absolute value; angle-preserving @boost 10 */
export declare function abs(x: number): number;
/** sign(x) — Sign (-1, 0, or 1) @boost 6 */
export declare function sign(x: number): number;
/** min(a, b, ...) — Minimum; angle-preserving @boost 10 */
export declare function min(...values: number[]): number;
/** max(a, b, ...) — Maximum; angle-preserving @boost 10 */
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
/** randomRange(min, max) — Random in range; angle-preserving @boost 8 */
export declare function randomRange(min: number, max: number): number;

// =============================================================================
// Stdlib: Hash & Noise
// =============================================================================

/** hash01(n, seed?) — Deterministic hash of integer n to [0, 1) @boost 12 */
export declare function hash01(n: number, seed?: number): number;
/** noise(x, seed?) — 1D value noise: smooth deterministic wobble of continuous x, [0, 1) @boost 10 */
export declare function noise(x: number, seed?: number): number;
/** noise2(x, y, seed?) — 2D value noise on the unit lattice, [0, 1) @boost 8 */
export declare function noise2(x: number, y: number, seed?: number): number;
/** hash11(n, seed?) — Deterministic hash of integer n to [-1, 1) @boost 8 */
export declare function hash11(n: number, seed?: number): number;
/** hashRange(n, min, max, seed?) — Deterministic hash of integer n to [min, max); angle-preserving (min, max) @boost 10 */
export declare function hashRange(n: number, min: number, max: number, seed?: number): number;

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

/** Object — Static methods (keys, values, entries) @boost 6 @kind variable */
export declare namespace Object {
  /** Object.keys(obj) — Get keys */
  function keys(obj: PathogenObject): string[];
  /** Object.values(obj) — Get values */
  function values(obj: PathogenObject): Value[];
  /** Object.entries(obj) — Key-value pairs */
  function entries(obj: PathogenObject): [string, Value][];
  /** Object.delete(obj, key) — Remove key */
  function delete_(obj: PathogenObject, key: string): Value;
  /** Object.has(obj, key) — Check if key exists */
  function has(obj: PathogenObject, key: string): boolean;
}

/** Color — Color creation and manipulation @boost 8 @kind variable */
export declare namespace Color {
  /** Color.mix(c1, c2, t) — Interpolate colors */
  function mix(c1: ColorValue, c2: ColorValue, t: number): ColorValue;
  /** Color.palette(color, n) — Generate palette */
  function palette(color: ColorValue, n: number): ColorValue[];
  /** Color.lightDark(light, dark) — Theme-aware color */
  function lightDark(light: ColorValue, dark: ColorValue): ColorValue;
}

/** End-cap constructors for compoundVariableOffset ribbons @boost 6 */
export declare namespace Cap {
  /** Cap.butt() — straight line between the two profile endpoints */
  function butt(): CapValue;
  /** Cap.round() — semicircle bulging outward */
  function round(): CapValue;
  /** Cap.elliptical(projection) — half-ellipse projecting `projection` units outward */
  function elliptical(projection: number): CapValue;
  /** Cap.tapered(length, continuity?) — apex `length` units out; optional CurveContinuity smooths the flanks */
  function tapered(length: number, continuity?: string): CapValue;
}

/** PathBlock — Glyph-outline namespace; path-block literals use @{ ... } syntax @boost 10 @kind variable */
export declare namespace PathBlock {
  /** PathBlock.fromGlyph(text, styles) — Array of glyph-outline PathBlocks (requires font-family in styles) */
  function fromGlyph(text: string, styles: Value): PathogenArray<PathogenPathBlock>;
}

/** @type ColorInstance */
export interface PathogenColorInstance {
  /** CSS color string */
  readonly css: string;
  /** Hex color value */
  readonly hex: string;
  /** OKLCH representation */
  readonly oklch: string;
  /** HSL representation */
  readonly hsl: string;
  /** RGB representation */
  readonly rgb: string;
  /** OKLCH lightness (0-1) */
  readonly lightness: number;
  /** OKLCH chroma */
  readonly chroma: number;
  /** OKLCH hue (degrees) */
  readonly hue: number;
  /** Alpha channel (0-1) */
  readonly a: number;
  /** lighten(amount) — Lighten color */
  lighten(amount: number): PathogenColorInstance;
  /** darken(amount) — Darken color */
  darken(amount: number): PathogenColorInstance;
  /** saturate(factor) — Increase saturation */
  saturate(factor: number): PathogenColorInstance;
  /** desaturate(factor) — Decrease saturation */
  desaturate(factor: number): PathogenColorInstance;
  /** alpha(value) — Set alpha channel */
  alpha(value: number): PathogenColorInstance;
  /** hueShift(degrees) — Rotate hue (degrees; angle-suffixed values like 90deg auto-convert) */
  hueShift(degrees: number): PathogenColorInstance;
  /** complement() — Complementary color */
  complement(): PathogenColorInstance;
  /** mix(other, t) — Mix with another color */
  mix(other: PathogenColorInstance, t: number): PathogenColorInstance;
  /** flatten(background?) — Alpha-composite onto a background color (default white), baking transparency into the result */
  flatten(background?: PathogenColorInstance): PathogenColorInstance;
  /** analogous(angle?) — Analogous color harmony (3 colors; degrees, default 30; angle-suffixed values auto-convert) */
  analogous(angle?: number): PathogenColorInstance[];
  /** triadic() — Triadic color harmony (3 colors) */
  triadic(): PathogenColorInstance[];
  /** tetradic() — Tetradic color harmony (4 colors) */
  tetradic(): PathogenColorInstance[];
  /** splitComplementary(angle?) — Split complementary harmony (3 colors; degrees, default 30; angle-suffixed values auto-convert) */
  splitComplementary(angle?: number): PathogenColorInstance[];
}

/** @type ViewBox */
export interface PathogenViewBox {
  /** ViewBox origin X */
  readonly originX: number;
  /** ViewBox origin Y */
  readonly originY: number;
  /** ViewBox width */
  readonly width: number;
  /** ViewBox height */
  readonly height: number;
}

/** @type BoundingBox */
export interface PathogenBoundingBox {
  /** X position */
  readonly x: number;
  /** Y position */
  readonly y: number;
  /** Width */
  readonly width: number;
  /** Height */
  readonly height: number;
}

// =============================================================================
// Built-in Variables
// =============================================================================

/** ctx — Path context (position, start, heading) @boost 16 @kind variable */
export declare const ctx: PathContext;

/** viewbox — Read-only viewBox set by define ViewBox(...) @boost 14 @kind variable */
export declare const viewbox: PathogenViewBox;

// =============================================================================
// Type Interfaces — extracted by generation script for member completions
// =============================================================================

/** Options object for Grid() constructor */
export interface PathogenGridOptions {
  /** Cell width in canvas units (default 1) */
  xDim?: number;
  /** Cell height in canvas units (default 1) */
  yDim?: number;
  /** Top-left corner of the grid in canvas space (default Point(0, 0)) */
  origin?: PathogenPoint;
  /** Initial value for every cell (default null) */
  defaultValue?: Value;
  /** Out-of-bounds sampling behavior: 'clamp' | 'wrap' | 'null' (default 'clamp') */
  outOfBounds?: string;
  /** Default sample() interpolation mode: 'nearest' | 'bilinear' (default 'nearest') */
  interpolation?: string;
}

/** @type Grid */
export interface PathogenGrid {
  /** Row count */
  readonly rows: number;
  /** Column count */
  readonly cols: number;
  /** Cell width */
  readonly xDim: number;
  /** Cell height */
  readonly yDim: number;
  /** Grid top-left in canvas space */
  readonly origin: PathogenPoint;
  /** Total spatial width (cols * xDim) */
  readonly width: number;
  /** Total spatial height (rows * yDim) */
  readonly height: number;
  /** get(row, col) — Return cell value; throws on out-of-bounds */
  get(row: number, col: number): Value;
  /** set(row, col, value) — Mutate cell; returns the grid */
  set(row: number, col: number, value: Value): PathogenGrid;
  /** getPoint(row, col) — Return cell center as a Point */
  getPoint(row: number, col: number): PathogenPoint;
  /** getRow(row) — Array of cell values across the row */
  getRow(row: number): PathogenArray;
  /** getCol(col) — Array of cell values down the column */
  getCol(col: number): PathogenArray;
  /** cells() — Flat row-major array of every cell */
  cells(): PathogenArray;
  /** fill {|row, col, center| return ...} — Populate every cell from a block (mutates); or fill() << worker @snippet fill {|${1:row}, ${2:col}, ${3:center}|\n\treturn $0;\n} */
  fill(): PathogenGrid;
  /** forEach {|cell, row, col, center| ...} — Side-effect iteration in row-major order; or forEach() << worker @snippet forEach {|${1:cell}, ${2:row}, ${3:col}, ${4:center}|\n\t$0\n} */
  forEach(): void;
  /** map {|cell, row, col, center| return ...} — Return a new grid with transformed cells; or map() << worker @snippet map {|${1:cell}, ${2:row}, ${3:col}, ${4:center}|\n\treturn $0;\n} */
  map(): PathogenGrid;
  /** sample(x, y) — Lookup using grid's default interpolation mode */
  sample(x: number, y: number): Value;
  /** sampleNearest(x, y) — Lookup snapping to nearest cell */
  sampleNearest(x: number, y: number): Value;
  /** sampleBilinear(x, y) — Lookup with bilinear interpolation (numeric or Point cells) */
  sampleBilinear(x: number, y: number): Value;
}

/** @type Point */
export interface PathogenPoint {
  /** X coordinate */
  readonly x: number;
  /** Y coordinate */
  readonly y: number;
  /** translate(dx, dy) — Offset point */
  translate(dx: number, dy: number): PathogenPoint;
  /** rotate(angle, origin?) — Rotate around point */
  rotate(angle: AngleValue, origin?: PathogenPoint): PathogenPoint;
  /** distanceTo(other) — Euclidean distance */
  distanceTo(other: PathogenPoint): number;
  /** angleTo(other) — Angle to other point */
  angleTo(other: PathogenPoint): number;
  /** lerp(other, t) — Interpolate toward point */
  lerp(other: PathogenPoint, t: number): PathogenPoint;
  /** midpoint(other) — Midpoint between two points */
  midpoint(other: PathogenPoint): PathogenPoint;
  /** polarTranslate(angle, distance) — Polar offset */
  polarTranslate(angle: AngleValue, distance: number): PathogenPoint;
  /** offset(other) — Get {dx, dy} delta */
  offset(other: PathogenPoint): { dx: number; dy: number };
}

/** @type array */
export interface PathogenArray<T = Value> {
  /** Number of elements */
  readonly length: number;
  /** First element, or null if the array is empty (non-mutating) */
  readonly first: T | null;
  /** Last element, or null if the array is empty (non-mutating) */
  readonly last: T | null;
  /** push(item) — Add to end; throws while the array is being iterated */
  push(item: T): number;
  /** pop() — Remove and return last element; throws while the array is being iterated */
  pop(): T | null;
  /** shift() — Remove and return first element; throws while the array is being iterated */
  shift(): T | null;
  /** unshift(item) — Add to beginning; throws while the array is being iterated */
  unshift(item: T): number;
  /** empty() — Check if array is empty */
  empty(): boolean;
  /** map {|item| ...} — Transform elements; or map() << worker @snippet map {|${1:item}|\n\treturn $0;\n} */
  map(): PathogenArray;
  /** filter {|item| ...} — Keep elements whose block returns truthy; or filter() << worker @snippet filter {|${1:item}|\n\treturn $0;\n} */
  filter(): PathogenArray<T>;
  /** reduce(init) {|acc, item| ...} — Reduce; or reduce(init) << worker @snippet reduce(${1:init}) {|${2:acc}, ${3:item}|\n\treturn $0;\n} */
  reduce(init: Value): Value;
  /** mapSlice(length) — Sliding window slices */
  mapSlice(length: number): PathogenArray;
  /** slice(start, end?) — Get sub-array */
  slice(start: number, end?: number): PathogenArray<T>;
  /** reverse() — Reversed copy (non-mutating) */
  reverse(): PathogenArray<T>;
  /** sort() — Sorted copy, ascending; comparator via trailing block or sort() << cmp */
  sort(): PathogenArray<T>;
}

/** @type string */
export interface PathogenString {
  /** String length */
  readonly length: number;
  /** split() — Split into character array */
  split(): PathogenArray<string>;
  /** append(str) — Concatenate */
  append(str: string): string;
  /** prepend(str) — Prepend string */
  prepend(str: string): string;
  /** includes(str) — Check if contains */
  includes(str: string): boolean;
  /** slice(start, end?) — Get substring */
  slice(start: number, end?: number): string;
  /** empty() — Check if empty */
  empty(): boolean;
}

/** @type PathBlock */
export interface PathogenPathBlock {
  // Properties
  /** Path length */
  readonly length: number;
  /** Vertex points */
  readonly vertices: PathogenArray<PathogenPoint>;
  /** Number of subpaths */
  readonly subPathCount: number;
  /** Array of command objects */
  readonly subPathCommands: PathogenArray;
  /** First point */
  readonly startPoint: PathogenPoint;
  /** Last point */
  readonly endPoint: PathogenPoint;
  /** Glyph advance width */
  readonly advanceWidth: number;
  /** Spine-space position of a variableOffset/compoundVariableOffset result (the translation removed by origin normalization) */
  readonly anchor: PathogenPoint;
  /** Per-contour PathBlocks */
  readonly contours: PathogenArray<PathogenPathBlock>;
  /** True when the block has no path commands (e.g. a space glyph) */
  readonly isEmpty: boolean;
  /** Source character of a fromGlyph() glyph (fromGlyph results only) */
  readonly char: string;
  /** True when the fromGlyph() source character is whitespace (fromGlyph results only) */
  readonly isWhitespace: boolean;
  /** True when the fromGlyph() source character is a horizontal space — space, no-break space, ideographic space, … (fromGlyph results only) */
  readonly isSpace: boolean;
  /** True when the fromGlyph() source character is a tab (fromGlyph results only) */
  readonly isTab: boolean;
  /** True when the fromGlyph() source character is a line break — \n, \r, U+2028, … (fromGlyph results only) */
  readonly isNewline: boolean;
  /** True when the fromGlyph() source character is a combining mark that overlays the previous glyph (fromGlyph results only) */
  readonly isMark: boolean;
  /** Unicode code point of the fromGlyph() source character (fromGlyph results only) */
  readonly codePoint: number;

  // Core methods
  /** draw() — Emit path at the current pen position; returns a ProjectedPath */
  draw(): PathogenProjectedPath;
  /** drawTo(x, y) — Draw path translated to (x, y); returns a ProjectedPath */
  drawTo(x: number, y: number): PathogenProjectedPath;
  /** get(t) — Sample point at t */
  get(t: number): PathogenPoint;
  /** tangent(t) — Tangent angle at t */
  tangent(t: number): { point: PathogenPoint; angle: number };
  /** normal(t) — Normal angle at t */
  normal(t: number): { point: PathogenPoint; angle: number };
  /** partition(n) — Split into segments */
  partition(n: number): PathogenArray;
  /** reverse() — Reverse direction */
  reverse(): PathogenPathBlock;
  /** boundingBox() — Get bounding box */
  boundingBox(): { x: number; y: number; width: number; height: number };

  // Transforms
  /** offset(distance) — Offset path */
  offset(distance: number): PathogenPathBlock;
  /** variableOffset() {|go, pb| ...} — Trace a smooth offset path with per-stop distance + continuity; or variableOffset() << worker @blockparams VariableOffsetBuilder, PathBlock @snippet variableOffset() {|${1:go}, ${2:pb}|\n\t$0\n} */
  variableOffset(): PathogenPathBlock;
  /** compoundVariableOffset() {|go, pb| ...} — Trace a two-profile (closeable) offset ribbon; or compoundVariableOffset() << worker @blockparams CompoundVariableOffsetBuilder, PathBlock @snippet compoundVariableOffset() {|${1:go}, ${2:pb}|\n\t$0\n} */
  compoundVariableOffset(): PathogenPathBlock;
  /** mirror(angle) — Mirror path */
  mirror(angle: AngleValue): PathogenPathBlock;
  /** scale(sx, sy) — Scale path */
  scale(sx: number, sy?: number): PathogenPathBlock;
  /** rotateAtVertexIndex(index, angle) — Rotate at vertex */
  rotateAtVertexIndex(index: number, angle: AngleValue): PathogenPathBlock;
  /** subPath(startT, endT) — Extract sub-path */
  subPath(startT: number, endT: number): PathogenPathBlock;
  /** project(x, y) — Project to absolute position without drawing; returns a ProjectedPath */
  project(x: number, y: number): PathogenProjectedPath;

  // Fillets and chamfers
  /** chamfer(distance) — Chamfer all corners */
  chamfer(distance: number): PathogenPathBlock;
  /** chamferAtVertex(index, distance) — Chamfer at vertex */
  chamferAtVertex(index: number, distance: number): PathogenPathBlock;
  /** fillet(radius) — Round all corners */
  fillet(radius: number): PathogenPathBlock;
  /** filletAtVertex(index, radius) — Round at vertex */
  filletAtVertex(index: number, radius: number): PathogenPathBlock;
  /** ellipticalFillet(rx, ry, rotation?) — Elliptical fillet */
  ellipticalFillet(rx: number, ry: number, rotation?: AngleValue): PathogenPathBlock;
  /** ellipticalFilletAtVertex(index, rx, ry, rotation?) — Elliptical fillet at vertex */
  ellipticalFilletAtVertex(index: number, rx: number, ry: number, rotation?: AngleValue): PathogenPathBlock;

  // Boolean operations
  /** union(other) — Boolean union */
  union(other: PathogenPathBlock): PathogenPathBlock;
  /** difference(other) — Boolean difference */
  difference(other: PathogenPathBlock): PathogenPathBlock;
  /** intersection(other) — Boolean intersection */
  intersection(other: PathogenPathBlock): PathogenPathBlock;
  /** xor(other) — Boolean XOR */
  xor(other: PathogenPathBlock): PathogenPathBlock;
  /** intersects(other) — Check for intersections */
  intersects(other: PathogenPathBlock): boolean;
  /** intersectionPoints(other) — Get intersection points */
  intersectionPoints(other: PathogenPathBlock): PathogenArray<PathogenPoint>;
  /** cut(cutter) — Slice along the cutter's open or closed strokes; returns the healed pieces */
  cut(cutter: PathogenPathBlock): PathogenArray<PathogenPathBlock>;

  // Named queries — look up geometry labeled via `as segment('...')` / `as endpoint('...')`
  /** segment(name) — First labeled sub-path matching name; returns a PathBlock */
  segment(name: string): PathogenPathBlock;
  /** segmentAll(name) — Every labeled sub-path matching name (querySelectorAll-style); returns an array */
  segmentAll(name: string): PathogenArray<PathogenPathBlock>;
  /** point(name) — First labeled point matching name; returns a Point */
  point(name: string): PathogenPoint;
  /** pointAll(name) — Every labeled point matching name; returns an array of Points */
  pointAll(name: string): PathogenArray<PathogenPoint>;
  /** vertex(name) — First labeled vertex matching name; returns a VertexHandle */
  vertex(name: string): PathogenVertexHandle;
  /** vertexAll(name) — Every labeled vertex matching name; returns an array of VertexHandles */
  vertexAll(name: string): PathogenArray<PathogenVertexHandle>;
}

/** @type VariableOffsetBuilder */
export interface PathogenVariableOffsetBuilder {
  /** stop(time, offset, continuity) — Place an offset stop along the spine (time 0..1, non-decreasing; continuity is a CurveContinuity value) @snippet stop(${1:time}, ${2:offset}, ${3:CurveContinuity.G2})$0 */
  stop(time: number, offset: number, continuity: string): PathogenVariableOffsetBuilder;
  /** startTangent(vector) — Force the offset path's launch direction at the spine start */
  startTangent(vector: PathogenPolarVector): PathogenVariableOffsetBuilder;
  /** endTangent(vector) — Force the offset path's arrival direction at the spine end */
  endTangent(vector: PathogenPolarVector): PathogenVariableOffsetBuilder;
}

/** @type CompoundVariableOffsetBuilder */
export interface PathogenCompoundVariableOffsetBuilder {
  /** stop(time, offset1, continuity1, offset2, continuity2) — Place a two-profile stop along the spine (time 0..1, non-decreasing; continuities are CurveContinuity values) @snippet stop(${1:time}, ${2:offset1}, ${3:CurveContinuity.G2}, ${4:offset2}, ${5:CurveContinuity.G2})$0 */
  stop(
    time: number,
    offset1: number,
    continuity1: string,
    offset2: number,
    continuity2: string,
  ): PathogenCompoundVariableOffsetBuilder;
  /** startCap(cap) — Shape the ribbon's start end (Cap.butt/round/elliptical/tapered) */
  startCap(cap: CapValue): PathogenCompoundVariableOffsetBuilder;
  /** endCap(cap) — Shape the ribbon's end (Cap.butt/round/elliptical/tapered) */
  endCap(cap: CapValue): PathogenCompoundVariableOffsetBuilder;
}

/** @type PolarVector */
export interface PathogenPolarVector {
  /** Angle in radians */
  readonly angle: number;
  /** Distance magnitude */
  readonly distance: number;
  /** turn(delta) — Turn by angle delta */
  turn(delta: AngleValue): PathogenPolarVector;
  /** scale(factor) — Scale distance */
  scale(factor: number): PathogenPolarVector;
  /** mirror() — Flip direction */
  mirror(): PathogenPolarVector;
}

/** @type Cycler */
export interface PathogenCycler {
  /** Number of elements */
  readonly length: number;
  /** pick() — Get next element */
  pick(): Value;
}

/** @type SVGFragment */
export interface PathogenSVGFragment {
  /** insert() — Insert fragment into layer */
  insert(): void;
}

/** @type TextLayer */
export interface PathogenTextLayer {
  /** Layer name */
  readonly name: string;
  /** Style block */
  readonly styles: Value;
  /** apply { } — Send text commands to this layer @snippet apply {\n\t$0\n} */
  apply(): void;
}

/** @type PathLayer */
export interface PathogenPathLayer {
  /** Layer name */
  readonly name: string;
  /** Style block */
  readonly styles: Value;
  /** Path context (position, heading, transform) */
  readonly ctx: PathContext;
  /** apply { } — Send path commands to this layer @snippet apply {\n\t$0\n} */
  apply(): void;

  // Named queries — look up geometry labeled via `as segment('...')` / `as endpoint('...')`
  /** segment(name) — First labeled sub-path matching name; returns a ProjectedPath (absolute coords) */
  segment(name: string): PathogenProjectedPath;
  /** segmentAll(name) — Every labeled sub-path matching name (querySelectorAll-style); returns an array */
  segmentAll(name: string): PathogenArray<PathogenProjectedPath>;
  /** point(name) — First labeled point matching name; returns a Point */
  point(name: string): PathogenPoint;
  /** pointAll(name) — Every labeled point matching name; returns an array of Points */
  pointAll(name: string): PathogenArray<PathogenPoint>;
  /** vertex(name) — First labeled vertex matching name; returns a VertexHandle */
  vertex(name: string): PathogenVertexHandle;
  /** vertexAll(name) — Every labeled vertex matching name; returns an array of VertexHandles */
  vertexAll(name: string): PathogenArray<PathogenVertexHandle>;
}

/** @type GroupLayer */
export interface PathogenGroupLayer {
  /** Layer name */
  readonly name: string;
  /** Style block */
  readonly styles: Value;
  /** Path context (position, heading, transform) */
  readonly ctx: PathContext;
  /** apply { } — Send commands to this layer @snippet apply {\n\t$0\n} */
  apply(): void;
  /** append(layer) — Add child layer */
  append(layer: PathogenPathLayer | PathogenTextLayer | PathogenGroupLayer): void;
}

/** @type PathContext */
export interface PathContext {
  /** Current pen position {x, y} */
  readonly position: PathogenPoint;
  /** Subpath start position {x, y} */
  readonly start: PathogenPoint;
  /** Current heading angle @boost 10 */
  readonly heading: number;
  /** Tangent angle at current position */
  readonly tangentAngle: number;
  /** Layer transform state */
  readonly transform: Value;
  /** Array of executed commands */
  readonly commands: PathogenArray;
}

/** @type ObjectValue */
export interface PathogenObject {
  /** Number of properties */
  readonly length: number;
  /** has(key) — Check if key exists */
  has(key: string): boolean;
}

/** @type ProjectedText */
export interface PathogenProjectedText {
  /** Number of text elements */
  readonly elementCount: number;
  /** Style block */
  readonly styles: Value;
  /** Origin point */
  readonly origin: PathogenPoint;
  /** translate(dx, dy) — Offset projected text */
  translate(dx: number, dy: number): PathogenProjectedText;
}

/** @type CSSVar */
export interface PathogenCSSVar {
  // CSSVar values are opaque — no member access
}

// =============================================================================
// Filter types — bound-parameter shape inside `FilterCtor() {|f| ... }`
// =============================================================================

/** @type NoiseFilter */
export interface PathogenNoiseFilter {
  /** Filter id (auto-generated as pathogen-noise-N) */
  readonly id: string;
  /** Preset chain + parameter baseline */
  style: Value;
  /** baseFrequency — 'fine' | 'medium' | 'coarse' | number */
  scale: Value;
  /** numOctaves — 1..10 */
  octaves: number;
  /** Visible intensity 0..1 */
  amount: number;
  /** Strip color variance via luminanceToAlpha */
  monochrome: boolean;
  /** feTurbulence seed (auto-derived from id by default) */
  seed: number;
  /** Final blend mode against SourceGraphic */
  blend: Value;
  /** Post-noise contrast pump (1 = no pump) */
  contrast: number;
  /** stitchTiles toggle */
  stitch: boolean;
}

/** @type GlowFilter */
export interface PathogenGlowFilter {
  /** Filter id (auto-generated as pathogen-glow-N) */
  readonly id: string;
  /** Outer halo or inner edge light */
  mode: Value;
  /** Glow color */
  color: ColorValue;
  /** Blur stdDeviation */
  radius: number;
  /** Pre-blur morphology radius (0 = no morphology) */
  spread: number;
  /** Glow strength 0..1 */
  opacity: number;
}

/** @type EmbossFilter */
export interface PathogenEmbossFilter {
  /** Filter id (auto-generated as pathogen-emboss-N) */
  readonly id: string;
  /** Light azimuth */
  angle: AngleValue;
  /** Light elevation @boost 10 */
  elevation: AngleValue;
  /** surfaceScale — visual depth of the bevel */
  depth: number;
  /** specularConstant — highlight brightness */
  strength: number;
  /** specularExponent — highlight sharpness (>= 1) */
  shininess: number;
  /** Simulated light color */
  lightColor: ColorValue;
  /** Pre-blur stdDeviation for softer bevel edges */
  smooth: number;
}

/** @type ElevationShadowFilter */
export interface PathogenElevationShadowFilter {
  /** Filter id (auto-generated as pathogen-elevation-shadow-N) */
  readonly id: string;
  /** Depth from the surface, 0..24 */
  elevation: number;
  /** Shadow color */
  color: ColorValue;
  /** Shadow direction (default 90deg = down) */
  direction: AngleValue;
  /** Scales the per-layer distance/blur ratios (1.0 = Material defaults) */
  tightness: number;
}

/** @type InnerShadowFilter */
export interface PathogenInnerShadowFilter {
  /** Filter id (auto-generated as pathogen-inner-shadow-N) */
  readonly id: string;
  /** Horizontal offset */
  offsetX: number;
  /** Vertical offset */
  offsetY: number;
  /** Blur stdDeviation */
  blur: number;
  /** Shadow color */
  color: ColorValue;
  /** Shadow strength 0..1 */
  opacity: number;
}

/** @type PixelateFilter */
export interface PathogenPixelateFilter {
  /** Filter id (auto-generated as pathogen-pixelate-N) */
  readonly id: string;
  /** Horizontal stride between samples */
  width: number;
  /** Vertical stride between samples */
  height: number;
  /** Dilation radius */
  radius: number;
}

/** @type MotionBlurFilter */
export interface PathogenMotionBlurFilter {
  /** Filter id (auto-generated as pathogen-motion-blur-N) */
  readonly id: string;
  /** MotionBlurType.Linear (directional smear) or MotionBlurType.Progressive (spatial ramp) */
  type: string;
  /** Smear length (Linear) / max blur radius (Progressive), in user-space units */
  distance: number;
  /** Direction angle (use a unit, e.g. 30deg); 0deg = horizontal, 90deg = down */
  angle: number;
  /** Tap count / quality — Linear only (2–32, default 12) */
  samples: number;
}

// =============================================================================
// Defs types — masks, clip paths, gradients, patterns, markers
// =============================================================================

/** @type ProjectedPath */
export interface PathogenProjectedPath {
  /** Path length */
  readonly length: number;
  /** Vertex points */
  readonly vertices: PathogenArray<PathogenPoint>;
  /** Number of subpaths */
  readonly subPathCount: number;
  /** Array of command objects */
  readonly subPathCommands: PathogenArray;
  /** First point (absolute) */
  readonly startPoint: PathogenPoint;
  /** Last point (absolute) */
  readonly endPoint: PathogenPoint;
  /** True when the path has no commands */
  readonly isEmpty: boolean;
  /** drawTo(x, y) — Re-draw translated to a new origin; returns a ProjectedPath */
  drawTo(x: number, y: number): PathogenProjectedPath;
  /** get(t) — Sample point at t */
  get(t: number): PathogenPoint;
  /** tangent(t) — Tangent angle at t */
  tangent(t: number): { point: PathogenPoint; angle: number };
  /** normal(t) — Normal angle at t */
  normal(t: number): { point: PathogenPoint; angle: number };
  /** partition(n) — Split into segments */
  partition(n: number): PathogenArray;
  /** reverse() — Reverse direction */
  reverse(): PathogenProjectedPath;
  /** boundingBox() — Get bounding box */
  boundingBox(): { x: number; y: number; width: number; height: number };
  /** offset(distance) — Offset path */
  offset(distance: number): PathogenProjectedPath;
  /** mirror(angle) — Mirror path */
  mirror(angle: AngleValue): PathogenProjectedPath;
  /** rotateAtVertexIndex(index, angle) — Rotate at vertex */
  rotateAtVertexIndex(index: number, angle: AngleValue): PathogenProjectedPath;
  /** scale(sx, sy) — Scale path */
  scale(sx: number, sy?: number): PathogenProjectedPath;
  /** subPath(startT, endT) — Extract sub-path */
  subPath(startT: number, endT: number): PathogenProjectedPath;
  /** chamfer(distance) — Chamfer all corners */
  chamfer(distance: number): PathogenProjectedPath;
  /** chamferAtVertex(index, distance) — Chamfer at vertex */
  chamferAtVertex(index: number, distance: number): PathogenProjectedPath;
  /** fillet(radius) — Round all corners */
  fillet(radius: number): PathogenProjectedPath;
  /** filletAtVertex(index, radius) — Round at vertex */
  filletAtVertex(index: number, radius: number): PathogenProjectedPath;
  /** ellipticalFillet(rx, ry, rotation?) — Elliptical fillet */
  ellipticalFillet(rx: number, ry: number, rotation?: AngleValue): PathogenProjectedPath;
  /** ellipticalFilletAtVertex(index, rx, ry, rotation?) — Elliptical fillet at vertex */
  ellipticalFilletAtVertex(index: number, rx: number, ry: number, rotation?: AngleValue): PathogenProjectedPath;
  /** union(other) — Boolean union */
  union(other: PathogenPathBlock): PathogenProjectedPath;
  /** difference(other) — Boolean difference */
  difference(other: PathogenPathBlock): PathogenProjectedPath;
  /** intersection(other) — Boolean intersection */
  intersection(other: PathogenPathBlock): PathogenProjectedPath;
  /** xor(other) — Boolean XOR */
  xor(other: PathogenPathBlock): PathogenProjectedPath;
  /** cut(cutter) — Slice along the cutter's open or closed strokes; returns the healed pieces */
  cut(cutter: PathogenPathBlock): PathogenArray<PathogenPathBlock>;

  // Named queries — look up geometry labeled via `as segment('...')` / `as endpoint('...')`
  /** segment(name) — First labeled sub-path matching name; returns a ProjectedPath (absolute coords) */
  segment(name: string): PathogenProjectedPath;
  /** segmentAll(name) — Every labeled sub-path matching name (querySelectorAll-style); returns an array */
  segmentAll(name: string): PathogenArray<PathogenProjectedPath>;
  /** point(name) — First labeled point matching name; returns a Point */
  point(name: string): PathogenPoint;
  /** pointAll(name) — Every labeled point matching name; returns an array of Points */
  pointAll(name: string): PathogenArray<PathogenPoint>;
  /** vertex(name) — First labeled vertex matching name; returns a VertexHandle */
  vertex(name: string): PathogenVertexHandle;
  /** vertexAll(name) — Every labeled vertex matching name; returns an array of VertexHandles */
  vertexAll(name: string): PathogenArray<PathogenVertexHandle>;
}

/** @type VertexHandle */
export interface PathogenVertexHandle {
  /** X coordinate */
  readonly x: number;
  /** Y coordinate */
  readonly y: number;
  /** Vertex position as a Point */
  readonly point: PathogenPoint;
  /** Label assigned via `as endpoint('...')` */
  readonly label: string;
  /** fillet(radius) — Round this corner; returns a PathBlock */
  fillet(radius: number): PathogenPathBlock;
  /** chamfer(d1, d2?) — Bevel this corner; returns a PathBlock */
  chamfer(d1: number, d2?: number): PathogenPathBlock;
  /** ellipticalFillet(rx, ry, rotation?) — Elliptical round of this corner; returns a PathBlock */
  ellipticalFillet(rx: number, ry: number, rotation?: AngleValue): PathogenPathBlock;
}

/** @type Mask */
export interface PathogenMask {
  /** Mask id (reference with mask: 'id' in a style block) */
  readonly id: string;
  /** append(path, styles?) — Add a PathBlock/ProjectedPath shape to the mask (white reveals, black hides) */
  append(path: PathogenPathBlock, styles?: Value): void;
}

/** @type ClipPath */
export interface PathogenClipPath {
  /** ClipPath id (reference with clip-path: 'id' in a style block) */
  readonly id: string;
  /** append(path) — Add a PathBlock/ProjectedPath shape to the clipping region */
  append(path: PathogenPathBlock): void;
}

/** @type LinearGradient */
export interface PathogenLinearGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** stop(offset, color) — Add a color stop at offset 0..1 */
  stop(offset: number, color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one's stops */
  inherit(newId: string): PathogenLinearGradient;
  /** 'pad' | 'reflect' | 'repeat' */
  spreadMethod: string;
  /** 'objectBoundingBox' | 'userSpaceOnUse' */
  gradientUnits: string;
  /** SVG transform list string */
  gradientTransform: string;
  /** Color interpolation space: 'srgb' | 'oklch' | 'linearRGB' */
  interpolation: string;
  /** Quantize into N discrete bands */
  steps: number;
}

/** @type RadialGradient */
export interface PathogenRadialGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** stop(offset, color) — Add a color stop at offset 0..1 */
  stop(offset: number, color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one's stops */
  inherit(newId: string): PathogenRadialGradient;
  /** 'pad' | 'reflect' | 'repeat' */
  spreadMethod: string;
  /** 'objectBoundingBox' | 'userSpaceOnUse' */
  gradientUnits: string;
  /** SVG transform list string */
  gradientTransform: string;
  /** Color interpolation space: 'srgb' | 'oklch' | 'linearRGB' */
  interpolation: string;
  /** Quantize into N discrete bands */
  steps: number;
}

/** @type ConicGradient */
export interface PathogenConicGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** stop(offset, color) — Add a color stop at offset 0..1 */
  stop(offset: number, color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one's stops */
  inherit(newId: string): PathogenConicGradient;
  /** Start angle (requires angle unit, e.g. 0deg) */
  from: AngleValue;
  /** End angle (requires angle unit, e.g. 360deg) */
  to: AngleValue;
  /** Sweep direction: 'cw' | 'ccw' */
  direction: string;
  /** Out-of-range behavior: 'clamp' | 'repeat' | 'transparent' */
  spread: string;
  /** Inner radius of the swept ring (>= 0) */
  innerRadius: number;
  /** Center fill: 'transparent' | 'transparent-blend' | 'center' | Color */
  innerFill: Value;
  /** Color interpolation space: 'srgb' | 'oklch' | 'linearRGB' */
  interpolation: string;
  /** Quantize into N discrete bands */
  steps: number;
}

/** @type MeshGradient */
export interface PathogenMeshGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** Control-point columns */
  readonly cols: number;
  /** Control-point rows */
  readonly rows: number;
  /** Mesh width in user units */
  readonly width: number;
  /** Mesh height in user units */
  readonly height: number;
  /** getPoint(row, col) — Control point (set .color, call .translate()) */
  getPoint(row: number, col: number): PathogenMeshPoint;
  /** getRow(row) — Array of control points across a row */
  getRow(row: number): PathogenArray<PathogenMeshPoint>;
  /** getCol(col) — Array of control points down a column */
  getCol(col: number): PathogenArray<PathogenMeshPoint>;
  /** colorAll(color) — Set every control point to one color */
  colorAll(color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one */
  inherit(newId: string): PathogenMeshGradient;
}

/** @type MeshPoint */
export interface PathogenMeshPoint {
  /** X position in mesh space */
  readonly x: number;
  /** Y position in mesh space */
  readonly y: number;
  /** Control-point color (assignable) */
  color: ColorValue;
  /** translate(dx, dy) — Move the control point (mutates) */
  translate(dx: number, dy: number): void;
}

/** @type FreeformGradient */
export interface PathogenFreeformGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** Canvas width in user units */
  readonly width: number;
  /** Canvas height in user units */
  readonly height: number;
  /** Distance falloff exponent (> 0, default 2) */
  falloff: number;
  /** point(x, y, color) — Add a color point to the field */
  point(x: number, y: number, color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one */
  inherit(newId: string): PathogenFreeformGradient;
}

/** @type TopoGradient */
export interface PathogenTopoGradient {
  /** Gradient id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** Canvas width in user units */
  readonly width: number;
  /** Canvas height in user units */
  readonly height: number;
  /** Elevation easing: 'linear' | 'smoothstep' | 'ease-in' | 'ease-out' | 'ease-in-out' */
  easing: string;
  /** Solver: 'distance' | 'laplace' */
  method: string;
  /** Laplace solver iterations (1–2000, default 200) */
  iterations: number;
  /** Contour blend strength 0..1 */
  blend: number;
  /** Base color beneath all contours */
  baseColor: ColorValue;
  /** contour(projectedPath, elevation, color) — Add a closed contour at elevation 0..1 (use .project(x, y)) */
  contour(projectedPath: PathogenProjectedPath, elevation: number, color: ColorValue): void;
  /** inherit(newId) — New gradient that href-inherits this one */
  inherit(newId: string): PathogenTopoGradient;
}

/** @type Pattern */
export interface PathogenPattern {
  /** Pattern id (reference with fill: 'id' or stroke: 'id') */
  readonly id: string;
  /** 'userSpaceOnUse' | 'objectBoundingBox' */
  patternUnits: string;
  /** SVG transform list string */
  patternTransform: string;
  /** 'userSpaceOnUse' | 'objectBoundingBox' */
  patternContentUnits: string;
  /** append(path, styles?) — Add a PathBlock/ProjectedPath shape to the tile */
  append(path: PathogenPathBlock, styles?: Value): void;
}

/** @type Marker */
export interface PathogenMarker {
  /** Marker id (reference with marker-start/mid/end: 'id') */
  readonly id: string;
  /** Marker viewport width */
  readonly markerWidth: number;
  /** Marker viewport height */
  readonly markerHeight: number;
  /** Marker viewBox (default '0 0 markerWidth markerHeight') */
  viewBox: string;
  /** Anchor X within the viewBox (default markerWidth / 2) */
  refX: number;
  /** Anchor Y within the viewBox (default markerHeight / 2) */
  refY: number;
  /** 'strokeWidth' | 'userSpaceOnUse' */
  markerUnits: string;
  /** 'auto' | 'auto-start-reverse' | angle */
  orient: Value;
  /** SVG preserveAspectRatio value */
  preserveAspectRatio: string;
  /** append(path, styles?) — Add a PathBlock/ProjectedPath shape; styles support context-stroke and context-fill */
  append(path: PathogenPathBlock, styles?: Value): void;
}
