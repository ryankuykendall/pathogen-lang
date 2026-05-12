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

// Forward-declared types (interfaces for runtime types defined at end of file)
declare type PathSegment = { __brand: 'PathSegment' };
declare type ColorValue = { __brand: 'ColorValue' };
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
/** NoiseFilter() — Grain/paper/speckle/static/grainy-gradient noise filter @boost 11 */
export declare function NoiseFilter(): PathogenNoiseFilter;
/** GlowFilter() — Outer or inner soft glow @boost 11 */
export declare function GlowFilter(): PathogenGlowFilter;
/** EmbossFilter() — Light-source-based embossed surface @boost 11 */
export declare function EmbossFilter(): PathogenEmbossFilter;
/** ElevationShadowFilter() — Material-style layered depth shadow @boost 11 */
export declare function ElevationShadowFilter(): PathogenElevationShadowFilter;
/** InnerShadowFilter() — Inset shadow (capability CSS drop-shadow() lacks) @boost 11 */
export declare function InnerShadowFilter(): PathogenInnerShadowFilter;
/** PixelateFilter(width?, height?, radius?) — Mosaic / pixelation filter @boost 11 */
export declare function PixelateFilter(width?: number, height?: number, radius?: number): PathogenPixelateFilter;

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
export declare function quadSpline(start: PathogenObject, points: PathogenArray, end: PathogenObject): PathSegment;
/** clippedQuadSpline(start, points, end) — Clipped quad spline @boost 8 */
export declare function clippedQuadSpline(start: PathogenObject, points: PathogenArray, end: PathogenObject): PathSegment;
/** polarCubicBezier(start, pv1, pv2, end) — Polar cubic bezier @boost 8 */
export declare function polarCubicBezier(start: PathogenPoint, pv1: PathogenPolarVector, pv2: PathogenPolarVector, end: PathogenPoint): PathSegment;

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
  /** hueShift(degrees) — Rotate hue */
  hueShift(degrees: number): PathogenColorInstance;
  /** complement() — Complementary color */
  complement(): PathogenColorInstance;
  /** mix(other, t) — Mix with another color */
  mix(other: PathogenColorInstance, t: number): PathogenColorInstance;
  /** analogous(angle?) — Analogous color harmony (3 colors) */
  analogous(angle?: number): PathogenColorInstance[];
  /** triadic() — Triadic color harmony (3 colors) */
  triadic(): PathogenColorInstance[];
  /** tetradic() — Tetradic color harmony (4 colors) */
  tetradic(): PathogenColorInstance[];
  /** splitComplementary(angle?) — Split complementary harmony (3 colors) */
  splitComplementary(angle?: number): PathogenColorInstance[];
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

// =============================================================================
// Type Interfaces — extracted by generation script for member completions
// =============================================================================

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
  /** push(item) — Add to end */
  push(item: T): number;
  /** pop() — Remove and return last element */
  pop(): T | null;
  /** shift() — Remove and return first element */
  shift(): T | null;
  /** unshift(item) — Add to beginning */
  unshift(item: T): number;
  /** empty() — Check if array is empty */
  empty(): boolean;
  /** map {|item| ...} — Transform elements */
  map(block: (item: T, index?: number) => unknown): PathogenArray;
  /** reduce(init) {|acc, item| ...} — Reduce */
  reduce(init: Value, block: (acc: Value, item: T) => Value): Value;
  /** mapSlice(length) — Sliding window slices */
  mapSlice(length: number): PathogenArray;
  /** slice(start, end?) — Get sub-array */
  slice(start: number, end?: number): PathogenArray<T>;
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
  /** Per-contour PathBlocks */
  readonly contours: PathogenArray<PathogenPathBlock>;

  // Core methods
  /** draw() — Emit path data */
  draw(): void;
  /** drawTo(layerName) — Emit to layer */
  drawTo(layerName: string): void;
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
  /** mirror(angle) — Mirror path */
  mirror(angle: AngleValue): PathogenPathBlock;
  /** scale(sx, sy) — Scale path */
  scale(sx: number, sy?: number): PathogenPathBlock;
  /** rotateAtVertexIndex(index, angle) — Rotate at vertex */
  rotateAtVertexIndex(index: number, angle: AngleValue): PathogenPathBlock;
  /** subPath(startT, endT) — Extract sub-path */
  subPath(startT: number, endT: number): PathogenPathBlock;
  /** project(x, y) — Project to position */
  project(x: number, y: number): PathogenPathBlock;

  // Fillets and chamfers
  /** chamfer(distance) — Chamfer all corners */
  chamfer(distance: number): PathogenPathBlock;
  /** chamferAtVertex(index, distance) — Chamfer at vertex */
  chamferAtVertex(index: number, distance: number): PathogenPathBlock;
  /** fillet(radius) — Round all corners */
  fillet(radius: number): PathogenPathBlock;
  /** filletAtVertex(index, radius) — Round at vertex */
  filletAtVertex(index: number, radius: number): PathogenPathBlock;
  /** ellipticalFillet(rx, ry) — Elliptical fillet */
  ellipticalFillet(rx: number, ry: number): PathogenPathBlock;
  /** ellipticalFilletAtVertex(index, rx, ry) — Elliptical fillet at vertex */
  ellipticalFilletAtVertex(index: number, rx: number, ry: number): PathogenPathBlock;

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
  /** apply { } — Send text commands to this layer */
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
  /** apply { } — Send path commands to this layer */
  apply(): void;
}

/** @type GroupLayer */
export interface PathogenGroupLayer {
  /** Layer name */
  readonly name: string;
  /** Style block */
  readonly styles: Value;
  /** Path context (position, heading, transform) */
  readonly ctx: PathContext;
  /** apply { } — Send commands to this layer */
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
