/**
 * Shared type definitions for the evaluator.
 *
 * All public interfaces consumed by the playground, CLI, tests, and library
 * users live here. Type guards remain in `./index.ts` alongside the
 * implementation since they are functions.
 */

import type { OKLCH } from '../color';
import type { PathContext, Point, TransformState } from './context';
import type { SourceLocation, Statement } from '../parser/ast';

// Re-export imported types that are part of the public API
export type { OKLCH } from '../color';
export type { PathContext, Point, TransformState } from './context';

// ---------------------------------------------------------------------------
// Value union
// ---------------------------------------------------------------------------

export type Value =
  | number
  | string
  | null
  | BooleanValue
  | AngleValue
  | PathSegment
  | UserFunction
  | ContextObject
  | PathWithResult
  | LayerReference
  | StyleBlockValue
  | ArrayValue
  | PointValue
  | PolarVectorValue
  | CapValue
  | CapNamespace
  | VariableOffsetBuilderValue
  | TransformReference
  | TransformPropertyReference
  | ObjectValue
  | ObjectNamespace
  | PathBlockValue
  | VertexHandleValue
  | PathBlockNamespace
  | ProjectedPathValue
  | CyclerValue
  | SVGFragmentValue
  | MaskValue
  | ClipPathValue
  | PatternValue
  | MarkerValue
  | GradientValue
  | FilterValue
  | MeshPointValue
  | GridValue
  | ColorValue
  | ColorNamespace
  | CSSVarValue
  | TextBlockValue
  | ProjectedTextValue
  | ViewBoxStructValue;

// ---------------------------------------------------------------------------
// Core value interfaces
// ---------------------------------------------------------------------------

/**
 * Represents a boolean value (semantic subtype of number: true=1, false=0)
 */
export interface BooleanValue {
  type: 'BooleanValue';
  value: 0 | 1;
}

/**
 * Represents an angle value (semantic subtype of number). Radians are the
 * canonical measure; the unit is remembered only for display — 'turns' has
 * no literal form and arises only from .toTurns() re-tagging.
 */
export interface AngleValue {
  type: 'AngleValue';
  radians: number;
  unit: 'deg' | 'rad' | 'pi' | 'turns';
}

/**
 * Represents an array value (reference semantics)
 */
export interface ArrayValue {
  type: 'ArrayValue';
  elements: Value[];
}

/**
 * Represents a 2D point value with geometric operations
 */
export interface PointValue {
  type: 'PointValue';
  x: number;
  y: number;
}

/**
 * Represents a polar vector (angle + distance) for defining bezier control points
 */
export interface PolarVectorValue {
  type: 'PolarVectorValue';
  angle: number;
  distance: number;
}

/**
 * End-cap value for compoundVariableOffset ribbons. Constructed via the `Cap`
 * namespace (Cap.butt / round / elliptical / tapered). See docs/variable-offset.md.
 */
export interface CapValue {
  type: 'CapValue';
  cap: 'butt' | 'round' | 'elliptical' | 'tapered';
  /** elliptical: along-path semi-axis length */
  projection?: number;
  /** tapered: apex distance outward from the cap midpoint */
  length?: number;
  /** tapered: CurveContinuity value ('position' | 'tangent' | 'curvature') for the flanks */
  continuity?: string;
}

/**
 * Represents a cycler that cycles through a list sequentially
 */
export interface CyclerValue {
  type: 'CyclerValue';
  elements: Value[];
  index: number;
}

/**
 * Represents a sanitized SVG document fragment for injection into the workspace
 */
export interface SVGFragmentValue {
  type: 'SVGFragmentValue';
  defsContent: string;
  visualContent: string;
  rawContent: string;
}

/**
 * Entry in a Mask — a path with optional styles
 */
export interface MaskPathEntry {
  d: string;
  styles: Record<string, string>;
}

/**
 * Represents a <mask> definition with appended path elements
 */
export interface MaskValue {
  type: 'MaskValue';
  id: string;
  paths: MaskPathEntry[];
}

/**
 * Represents a <clipPath> definition with appended path elements
 */
export interface ClipPathValue {
  type: 'ClipPathValue';
  id: string;
  paths: string[];
}

/**
 * Represents a <pattern> definition with appended path elements
 */
export interface PatternValue {
  type: 'PatternValue';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  paths: MaskPathEntry[]; // reuse {d, styles} type
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
}

/**
 * Represents a <marker> definition with appended path elements.
 *
 * Attribute string values are validated against BUILTIN_ENUMS at assignment
 * time. Numeric refX/refY/orient values are stored as numbers; orient numbers
 * are interpreted as radians internally and converted to degrees on output.
 */
export interface MarkerValue {
  type: 'MarkerValue';
  id: string;
  viewBox: string;
  markerWidth: number;
  markerHeight: number;
  refX: number | string; // number or MarkerRefX enum value ('left' | 'center' | 'right')
  refY: number | string; // number or MarkerRefY enum value ('top' | 'center' | 'bottom')
  markerUnits: string; // MarkerUnits enum value ('strokeWidth' | 'userSpaceOnUse')
  orient: number | string; // number (radians) or MarkerOrient enum value ('auto' | 'auto-start-reverse')
  preserveAspectRatio: string; // MarkerPreserveAspectRatio enum value
  paths: MaskPathEntry[]; // reuse {d, styles} type
}

export type GridOutOfBoundsMode = 'clamp' | 'wrap' | 'null';
export type GridInterpolationMode = 'nearest' | 'bilinear';

/**
 * Represents a fixed-shape, mutable, 2D container of values that maps cells
 * to canvas coordinates. Used for flow fields, heatmaps, lookup tables.
 *
 * Cell (r, c) center is at:
 *   origin.x + (c + 0.5) * xDim
 *   origin.y + (r + 0.5) * yDim
 */
export interface GridValue {
  type: 'GridValue';
  rows: number;
  cols: number;
  xDim: number;
  yDim: number;
  origin: PointValue;
  outOfBounds: GridOutOfBoundsMode;
  interpolation: GridInterpolationMode;
  cells: Value[][]; // row-major: cells[row][col]
}

/**
 * Represents a single control point in a mesh gradient grid
 */
export interface MeshPointValue {
  type: 'MeshPointValue';
  x: number;
  y: number;
  color: OKLCH;
  colorCSS: string;
  gridRow: number;
  gridCol: number;
}

/**
 * Represents a single point in a freeform gradient
 */
export interface FreeformPoint {
  x: number;
  y: number;
  color: OKLCH;
  colorCSS: string;
}

/**
 * Represents a single contour in a topological gradient
 */
export interface TopoContour {
  elevation: number; // 0–1 normalized elevation
  commands: PathBlockCommand[]; // absolute coordinates from ProjectedPathValue
  dString: string; // cached absolute SVG d-string
  color: OKLCH; // color at this elevation
  colorCSS: string; // CSS color string
}

/**
 * A color stop in a gradient
 */
export interface GradientStop {
  offset: number;
  color: string; // CSS color string from oklchToCSS() or var() for CSSVar stops
  oklch?: OKLCH; // preserved for interpolation; absent on CSSVar stops
}

/**
 * Represents a <linearGradient> or <radialGradient> definition
 */
export interface GradientValue {
  type: 'GradientValue';
  gradientType: 'linear' | 'radial' | 'conic' | 'mesh' | 'freeform' | 'topo';
  id: string;
  attrs: Record<string, string>; // x1,y1,x2,y2 or cx,cy,r,fx,fy or cx,cy for conic
  stops: GradientStop[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  href?: string;
  interpolation?: 'srgb' | 'oklch' | 'linearRGB';
  steps?: number;
  // Conic-specific (angles in radians):
  from?: number; // start angle in radians (default 0)
  to?: number; // end angle in radians (default from + 2*PI)
  direction?: 'cw' | 'ccw';
  spread?: string; // 'clamp' | 'repeat' | 'transparent'
  innerRadius?: number; // center plateau radius in px (default 0)
  innerFill?: 'transparent' | 'transparent-blend' | 'center' | ColorValue; // what fills inside innerRadius (default 'transparent')
  // Mesh-specific:
  meshGrid?: MeshPointValue[][];
  meshWidth?: number;
  meshHeight?: number;
  meshCols?: number;
  meshRows?: number;
  // Freeform-specific:
  freeformPoints?: FreeformPoint[];
  freeformWidth?: number;
  freeformHeight?: number;
  falloff?: number;
  // Topo-specific:
  topoContours?: TopoContour[];
  topoWidth?: number;
  topoHeight?: number;
  topoEasing?: string; // 'linear' | 'smoothstep' | 'ease-in' | 'ease-out' | 'ease-in-out'
  topoMethod?: string; // 'distance' | 'laplace'
  topoIterations?: number; // Jacobi iterations for laplace method (1-2000, default 200)
  topoBlend?: number; // Laplace diffusion spread (0-1, default 1.0)
  topoBaseColor?: OKLCH;
  topoBaseColorCSS?: string;
}

/**
 * Custom filter recipe — synthesizes a `<filter>` definition.
 *
 * Modelled as a tagged union so additional filter kinds can be added as new
 * `kind` arms without disturbing the defs-producer pipeline (style-block
 * url(#id) conversion, CompileResult emission, render/build-defs dispatch,
 * playground 5-file chain).
 */
export type FilterValue =
  | NoiseFilterValue
  | GlowFilterValue
  | EmbossFilterValue
  | ElevationShadowFilterValue
  | InnerShadowFilterValue
  | PixelateFilterValue
  | MotionBlurFilterValue;

export type NoiseFilterStyleName = 'grain' | 'paper' | 'speckle' | 'static' | 'gradient';
export type GlowModeName = 'outer' | 'inner';
export type MotionBlurTypeName = 'linear' | 'progressive';

export interface NoiseFilterValue {
  type: 'FilterValue';
  kind: 'noise';
  id: string;
  style: NoiseFilterStyleName;
  scale: number; // baseFrequency
  octaves: number;
  amount: number; // 0..1
  monochrome: boolean;
  seed: number;
  blend: string; // CSS blend-mode keyword
  contrast: number; // 1.0 = no pump
  stitch: boolean;
}

/**
 * Color storage shared by Glow/Emboss/ElevationShadow/InnerShadow. Mirrors the
 * shape evaluator uses for serialized colors (CSS expression with optional
 * OKLCH source for re-interpolation). Stored as a string after evaluation so
 * the renderer can drop it into flood-color / lighting-color directly.
 */

export interface GlowFilterValue {
  type: 'FilterValue';
  kind: 'glow';
  id: string;
  mode: GlowModeName;
  color: string; // CSS color expression
  radius: number; // feGaussianBlur stdDeviation
  spread: number; // feMorphology radius (0 = no morphology)
  opacity: number; // 0..1
}

export interface EmbossFilterValue {
  type: 'FilterValue';
  kind: 'emboss';
  id: string;
  angle: number; // radians internally; emitted as degrees on feDistantLight azimuth
  elevation: number; // radians internally; emitted as degrees on feDistantLight elevation
  depth: number; // surfaceScale
  strength: number; // specularConstant
  shininess: number; // specularExponent
  lightColor: string; // CSS color expression
  smooth: number; // pre-blur stdDeviation
}

export interface ElevationShadowFilterValue {
  type: 'FilterValue';
  kind: 'elevation-shadow';
  id: string;
  elevation: number; // 0..24
  color: string; // CSS color expression
  direction: number; // radians; 0=right, PI/2=down (default)
  tightness: number; // scales per-layer distance/blur ratios
}

export interface InnerShadowFilterValue {
  type: 'FilterValue';
  kind: 'inner-shadow';
  id: string;
  offsetX: number;
  offsetY: number;
  blur: number; // stdDeviation
  color: string; // CSS color expression
  opacity: number; // 0..1
}

export interface PixelateFilterValue {
  type: 'FilterValue';
  kind: 'pixelate';
  id: string;
  width: number; // tile stride x
  height: number; // tile stride y
  radius: number; // feMorphology dilate radius
}

/**
 * Directional/progressive blur, modeled on the CSS motion-blur proposal
 * (w3c/csswg-drafts#11134). Synthesized from SVG filter primitives:
 *  - 'linear': N centered feOffset taps along `angle`, alpha-averaged via
 *    feComponentTransfer (1/samples) + additive feComposite arithmetic.
 *  - 'progressive': a single feGaussianBlur gated by an feImage gradient mask
 *    (objectBoundingBox) so blur ramps across the element's own bounds.
 * `motionType` is the user-facing `type` property; the struct's own `type`
 * field is the 'FilterValue' discriminant, so the two never collide.
 */
export interface MotionBlurFilterValue {
  type: 'FilterValue';
  kind: 'motion-blur';
  id: string;
  motionType: MotionBlurTypeName;
  distance: number; // user-space units (smear length / max blur radius)
  angle: number; // radians; 0 = +x, PI/2 = +y (down)
  samples: number; // integer tap count — Linear only (Progressive ignores)
}

/**
 * Represents a color value with OKLCH internal representation
 */
export interface ColorValue {
  type: 'ColorValue';
  oklch: OKLCH;
  cssVar?: { varName: string; fallback: string };
  cssExpr?: string;
  lightDark?: { lightCSS: string; darkCSS: string };
}

/**
 * Represents a CSS custom property reference: var(--name, fallback)
 */
export interface CSSVarValue {
  type: 'CSSVarValue';
  varName: string;
  fallback: string | null;
}

/**
 * Sentinel for Color namespace (Color.mix, etc.)
 */
export interface ColorNamespace {
  type: 'ColorNamespace';
}

/**
 * Sentinel for Cap namespace (Cap.butt, Cap.round, Cap.elliptical, Cap.tapered)
 */
export interface CapNamespace {
  type: 'CapNamespace';
}

/** One accumulated stop inside a variableOffset / compoundVariableOffset block. */
export interface VariableOffsetStop {
  time: number;
  offset1: number;
  continuity1: string; // CurveContinuity enum value ('position' | 'tangent' | 'curvature')
  offset2?: number; // compound only
  continuity2?: string; // compound only
}

/**
 * Mutable builder handle (`go`) passed to a variableOffset / compoundVariableOffset
 * block. Its methods (stop / startTangent / endTangent / startCap / endCap) mutate
 * this accumulator; the surrounding method reads it after the block runs.
 */
export interface VariableOffsetBuilderValue {
  type: 'VariableOffsetBuilderValue';
  compound: boolean;
  stops: VariableOffsetStop[];
  startTangent?: PolarVectorValue;
  endTangent?: PolarVectorValue;
  startCap?: CapValue; // compound only
  endCap?: CapValue; // compound only
}

/**
 * Represents a plain key-value object (reference semantics)
 */
export interface ObjectValue {
  type: 'ObjectValue';
  properties: Map<string, Value>;
}

/**
 * Sentinel for Object namespace (Object.keys, Object.values, etc.)
 */
export interface ObjectNamespace {
  type: 'ObjectNamespace';
}

/**
 * Sentinel for PathBlock namespace (PathBlock.fromGlyph, etc.)
 */
export interface PathBlockNamespace {
  type: 'PathBlockNamespace';
}

// ---------------------------------------------------------------------------
// Path block types
// ---------------------------------------------------------------------------

/**
 * Structured command within a PathBlock — stores command letter, numeric args, and start/end points
 */
/** Authored corner-op intent recorded by a `with <op>(...)` clause; applied at finalization. */
export interface RecordedCornerOp {
  kind: 'fillet' | 'chamfer' | 'ellipticalFillet';
  args: number[]; // evaluated: fillet(r) → [r]; chamfer(d1, d2?) → [d1, d2]; ellipticalFillet(rx, ry, rot?) → [rx, ry, rot]
  loc?: SourceLocation;
}

/** Per-command metadata attached by `as` / `with` clauses. */
export interface PathCommandMeta {
  segmentLabel?: string; // inherited from the owning record's `as segment(...)`
  endVertex?: {
    label?: string; // `as endpoint(...)` on the command that creates this vertex
    cornerOp?: RecordedCornerOp; // `with <op>(...)` on the FOLLOWING command (this vertex is the joint)
  };
}

export interface PathBlockCommand {
  command: string; // command letter — lowercase inside PathBlocks; case-preserved in layer records
  args: number[]; // evaluated numeric arguments
  start: Point; // cursor position before command
  end: Point; // cursor position after command
  meta?: PathCommandMeta;
}

/**
 * One emitted path fragment: the byte-exact string pushed to the accumulator
 * paired with its structured commands. Statement granularity — a stdlib call
 * like circle() produces one record holding many commands.
 */
export interface PathRecord {
  raw: string; // exact fragment joined into LayerOutput.data
  commands: PathBlockCommand[];
  label?: string; // segment label ('as segment(...)')
  loc?: SourceLocation; // source location of the emitting statement
}

/**
 * The structured accumulator for a path context (layer, root, or path
 * block). All writes go through recordPath() in segments.ts; emit joins the
 * records' byte-exact raw fragments.
 */
export interface PathStore {
  records: PathRecord[];
}

/**
 * Represents a path block value — a reusable, introspectable path definition in relative coordinates
 */
/**
 * A named vertex handle returned by `.vertex('label')` — a structural handle
 * exposing corner operations, distinct from the plain Point that
 * `.point('label')` returns.
 */
export interface VertexHandleValue {
  type: 'VertexHandleValue';
  sourceKind: 'pathblock' | 'projected' | 'layer';
  /** The value the handle was created from (corner ops valid for pathblock sources only). */
  source: Value;
  label: string;
  point: Point; // authored vertex position
  cornerIndex: number; // resolved corner index in the source's command space (-1 if not a corner)
}

export interface PathBlockValue {
  type: 'PathBlockValue';
  commands: PathBlockCommand[]; // structured command list (finalized geometry)
  records: PathRecord[]; // statement-granularity authored store (raw fragments + commands)
  startPoint: Point; // origin (always 0,0 unless path begins with m)
  endPoint: Point; // final cursor position (relative)
}

/**
 * Represents a projected path — a PathBlock projected into absolute coordinate space
 */
export interface ProjectedPathValue {
  type: 'ProjectedPathValue';
  commands: PathBlockCommand[]; // commands with absolute coordinates
  startPoint: Point;
  endPoint: Point;
}

// ---------------------------------------------------------------------------
// Text block types
// ---------------------------------------------------------------------------

/**
 * A single text element within a TextBlock — position relative to block origin
 */
export interface TextBlockElement {
  x: number;
  y: number;
  rotation?: number; // radians
  styles?: Record<string, string>;
  children: TextChild[];
}

/**
 * Represents a text block value — a reusable, measurable text composition in relative coordinates
 */
export interface TextBlockValue {
  type: 'TextBlockValue';
  elements: TextBlockElement[];
  styles: Record<string, string>; // block-level styles (font-size, font-family, etc.)
}

/**
 * Represents a projected text block — a TextBlock projected into absolute coordinate space
 */
export interface ProjectedTextValue {
  type: 'ProjectedTextValue';
  elements: TextBlockElement[]; // elements with absolute coordinates
  styles: Record<string, string>;
  origin: Point; // projection origin
}

/**
 * Represents an object value that supports property access (like ctx)
 */
export interface ContextObject {
  type: 'ContextObject';
  value: Record<string, unknown>;
}

/**
 * Represents a function result that includes both path output AND a result value.
 * Used by functions like arcFromCenter that emit path and return arc info.
 */
export interface PathWithResult {
  type: 'PathWithResult';
  path: string; // The path string to emit
  result: Value; // The result value (for assignments)
  commands?: PathBlockCommand[]; // structured commands for `path`, captured at tracking time
}

/**
 * Represents a style block value (CSS-like key-value map)
 */
export interface StyleBlockValue {
  type: 'StyleBlockValue';
  properties: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Log types
// ---------------------------------------------------------------------------

/**
 * Represents a single log entry with metadata
 */
export interface LogEntry {
  line: number | null;
  parts: LogPart[];
}

/**
 * A single part of a log entry (either a label string or a labeled value)
 */
export interface LogPart {
  type: 'string' | 'value';
  label?: string; // For values: the expression that was logged (e.g., "ctx.position")
  value: string; // The stringified value
}

// ---------------------------------------------------------------------------
// Layer types
// ---------------------------------------------------------------------------

export type LayerStyle = Record<string, string>;

// --- Text element types ---

export type TextChild =
  | { type: 'run'; text: string }
  | { type: 'tspan'; text: string; dx?: number; dy?: number; rotation?: number; styles?: Record<string, string> }; // rotation in radians

export interface TextElement {
  x: number;
  y: number;
  rotation?: number; // Radians — converted to degrees at render time
  styles?: Record<string, string>;
  children: TextChild[];
}

// --- Layer state (discriminated union) ---

export interface PathLayerState {
  name: string;
  layerType: 'PathLayer';
  isDefault: boolean;
  styles: LayerStyle;
  pathContext: PathContext;
  accum: PathStore;
  transformState: TransformState;
}

export interface TextLayerState {
  name: string;
  layerType: 'TextLayer';
  isDefault: boolean;
  styles: LayerStyle;
  textElements: TextElement[];
}

export interface FragmentLayerState {
  name: string;
  layerType: 'FragmentLayer';
  isDefault: false;
  styles: LayerStyle;
  defsContent: string;
  visualContent: string;
}

export interface GroupLayerState {
  name: string;
  layerType: 'GroupLayer';
  isDefault: false;
  styles: LayerStyle;
  transformState: TransformState;
  children: string[]; // Child layer names, in append order
}

export type LayerState = PathLayerState | TextLayerState | FragmentLayerState | GroupLayerState;

export interface LayerReference {
  type: 'LayerReference';
  layer: LayerState;
}

export interface TransformReference {
  type: 'TransformReference';
  state: TransformState;
}

export interface TransformPropertyReference {
  type: 'TransformPropertyReference';
  state: TransformState;
  property: 'translate' | 'rotate' | 'scale';
}

// ---------------------------------------------------------------------------
// Layer output types
// ---------------------------------------------------------------------------

export interface LayerOutput {
  name: string;
  type: 'path' | 'text' | 'fragment' | 'group';
  data: string; // Path: d-attribute. Text: concatenated plain text. Fragment/Group: empty.
  textElements?: TextElement[]; // Only present when type === 'text'
  fragmentDefs?: string; // Only present when type === 'fragment'
  fragmentVisuals?: string; // Only present when type === 'fragment'
  children?: LayerOutput[]; // Only present when type === 'group'
  styles: Record<string, string>; // SVG attribute name → value
  isDefault: boolean;
  transform?: string; // SVG transform attribute value
}

export interface MaskOutput {
  id: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

export interface ClipPathOutput {
  id: string;
  elements: { pathData: string }[];
}

export interface CSSPropertyDeclaration {
  name: string; // '--base-color'
  syntax: string; // '<color>'
  inherits: boolean; // true
  initialValue: string; // '#e63946'
}

export interface PatternOutput {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  elements: { pathData: string; styles: Record<string, string> }[];
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
}

export interface MarkerOutput {
  id: string;
  viewBox: string;
  markerWidth: number;
  markerHeight: number;
  refX: string; // stringified number or keyword
  refY: string;
  markerUnits?: string; // omitted when value matches SVG default
  orient?: string; // stringified degrees or keyword; omitted when matches SVG default
  preserveAspectRatio?: string; // omitted when matches SVG default
  elements: { pathData: string; styles: Record<string, string> }[];
}

export interface GradientOutput {
  id: string;
  type: 'linear' | 'radial' | 'conic' | 'mesh' | 'freeform' | 'topo';
  attrs: Record<string, string>;
  stops: { offset: number; color: string }[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  href?: string;
  colorInterpolation?: string;
  // Conic-specific:
  cx?: number;
  cy?: number;
  from?: number;
  to?: number; // radians
  direction?: 'cw' | 'ccw';
  spread?: string;
  innerRadius?: number;
  innerFill?: string; // 'transparent' | 'center' | CSS color string
  stopsWithOklch?: { offset: number; color: string; oklch?: OKLCH }[];
  // Mesh-specific:
  meshGrid?: { x: number; y: number; color: string }[][];
  meshWidth?: number;
  meshHeight?: number;
  // Freeform-specific:
  freeformPoints?: { x: number; y: number; color: string }[];
  freeformWidth?: number;
  freeformHeight?: number;
  falloff?: number;
  // Topo-specific:
  topoContours?: { elevation: number; path: string; color: string; oklch?: OKLCH }[];
  topoWidth?: number;
  topoHeight?: number;
  topoEasing?: string;
  topoMethod?: string;
  topoIterations?: number;
  topoBlend?: number;
  topoBaseColor?: string;
  topoBaseColorOklch?: OKLCH;
}

/**
 * Renderer-facing shape for a custom filter. Mirrors each FilterValue minus
 * the `type` tag.
 */
export type FilterOutput =
  | NoiseFilterOutput
  | GlowFilterOutput
  | EmbossFilterOutput
  | ElevationShadowFilterOutput
  | InnerShadowFilterOutput
  | PixelateFilterOutput
  | MotionBlurFilterOutput;

export interface NoiseFilterOutput {
  kind: 'noise';
  id: string;
  style: NoiseFilterStyleName;
  scale: number;
  octaves: number;
  amount: number;
  monochrome: boolean;
  seed: number;
  blend: string;
  contrast: number;
  stitch: boolean;
}

export interface GlowFilterOutput {
  kind: 'glow';
  id: string;
  mode: GlowModeName;
  color: string;
  radius: number;
  spread: number;
  opacity: number;
}

export interface EmbossFilterOutput {
  kind: 'emboss';
  id: string;
  angle: number; // radians
  elevation: number; // radians
  depth: number;
  strength: number;
  shininess: number;
  lightColor: string;
  smooth: number;
}

export interface ElevationShadowFilterOutput {
  kind: 'elevation-shadow';
  id: string;
  elevation: number;
  color: string;
  direction: number; // radians
  tightness: number;
}

export interface InnerShadowFilterOutput {
  kind: 'inner-shadow';
  id: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface PixelateFilterOutput {
  kind: 'pixelate';
  id: string;
  width: number;
  height: number;
  radius: number;
}

export interface MotionBlurFilterOutput {
  kind: 'motion-blur';
  id: string;
  motionType: MotionBlurTypeName;
  distance: number;
  angle: number; // radians
  samples: number;
}

export interface ViewBoxValue {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Runtime struct returned by reads of the ambient `viewbox` global. Kept
 * separate from ViewBoxValue so the discriminant never leaks into the public
 * CompileResult.viewBox shape or EvaluationState storage.
 */
export interface ViewBoxStructValue extends ViewBoxValue {
  type: 'ViewBoxStructValue';
}

export interface CompileResult {
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  filters: FilterOutput[];
  cssProperties: CSSPropertyDeclaration[];
  logs: LogEntry[];
  calledStdlibFunctions: string[];
  viewBox?: ViewBoxValue;
}

// ---------------------------------------------------------------------------
// Font types
// ---------------------------------------------------------------------------

/**
 * Parsed font data from a font file (TTF/OTF/WOFF)
 */
export interface FontData {
  family: string;
  weight: number; // 100-900
  style: 'normal' | 'italic';
  buffer: ArrayBuffer;
  _parsed?: unknown; // lazily parsed opentype.js Font object
}

/**
 * Registry of loaded font data, injected into compilation via CompileOptions
 */
export interface FontRegistry {
  fonts: Map<string, FontData[]>; // family → variants
  get(family: string, weight?: number, style?: string): FontData | null;
}

// ---------------------------------------------------------------------------
// Function / evaluation types
// ---------------------------------------------------------------------------

export interface PathSegment {
  type: 'PathSegment';
  value: string;
  commands?: PathBlockCommand[]; // structured commands for `value`, captured at tracking time
}

export interface UserFunction {
  type: 'UserFunction';
  params: string[];
  body: Statement[];
}

/**
 * Evaluation state for context-aware evaluation
 */
export interface EvaluationState {
  pathContext: PathContext;
  logs: LogEntry[];
  calledStdlibFunctions: Set<string>; // Stdlib function names invoked during evaluation
  layers: Map<string, LayerState>; // Layer definitions by name
  layerOrder: string[]; // Definition order for z-index
  activeLayerName: string | null; // Currently inside layer().apply
  defaultLayerName: string | null; // Default layer name
  rootAccum?: PathStore; // Top-level command accumulator (the default layer adopts this)
  transformState: TransformState; // Transform state for implicit default layer
  masks: Map<string, MaskValue>; // Mask definitions by ID
  clipPaths: Map<string, ClipPathValue>; // ClipPath definitions by ID
  gradients: Map<string, GradientValue>; // Gradient definitions by ID
  patterns: Map<string, PatternValue>; // Pattern definitions by ID
  markers: Map<string, MarkerValue>; // Marker definitions by ID
  filters: Map<string, FilterValue>; // Filter definitions by ID
  cssProperties: Map<string, CSSPropertyDeclaration>; // @property declarations from Color(CSSVar(...))
  fontRegistry?: FontRegistry; // Loaded font data for precise metrics and glyph extraction
  viewBox?: ViewBoxValue & { loc?: SourceLocation }; // Resolved viewBox from `define ViewBox(...)`
}

export interface Scope {
  variables: Map<string, Value>;
  parent: Scope | null;
  evalState?: EvaluationState; // Shared across all scopes during evaluation
}
