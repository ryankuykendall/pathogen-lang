/**
 * Shared type definitions for the evaluator.
 *
 * All public interfaces consumed by the playground, CLI, tests, and library
 * users live here. Type guards remain in `./index.ts` alongside the
 * implementation since they are functions.
 */

import type { OKLCH } from '../color';
import type { PathContext, Point, TransformState } from './context';
import type { Statement } from '../parser/ast';

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
  | PathSegment
  | UserFunction
  | ContextObject
  | PathWithResult
  | LayerReference
  | StyleBlockValue
  | ArrayValue
  | PointValue
  | PolarVectorValue
  | TransformReference
  | TransformPropertyReference
  | ObjectValue
  | ObjectNamespace
  | PathBlockValue
  | PathBlockNamespace
  | ProjectedPathValue
  | CyclerValue
  | SVGFragmentValue
  | MaskValue
  | ClipPathValue
  | PatternValue
  | MarkerValue
  | GradientValue
  | MeshPointValue
  | ColorValue
  | ColorNamespace
  | CSSVarValue
  | TextBlockValue
  | ProjectedTextValue;

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
export interface PathBlockCommand {
  command: string; // lowercase letter (m, l, h, v, c, s, q, t, a, z)
  args: number[]; // evaluated numeric arguments
  start: Point; // cursor position before command
  end: Point; // cursor position after command
}

/**
 * Represents a path block value — a reusable, introspectable path definition in relative coordinates
 */
export interface PathBlockValue {
  type: 'PathBlockValue';
  commands: PathBlockCommand[]; // structured command list
  pathStrings: string[]; // raw path command strings (for emit)
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
  accum: string[];
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

export interface CompileResult {
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  cssProperties: CSSPropertyDeclaration[];
  logs: LogEntry[];
  calledStdlibFunctions: string[];
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
  transformState: TransformState; // Transform state for implicit default layer
  masks: Map<string, MaskValue>; // Mask definitions by ID
  clipPaths: Map<string, ClipPathValue>; // ClipPath definitions by ID
  gradients: Map<string, GradientValue>; // Gradient definitions by ID
  patterns: Map<string, PatternValue>; // Pattern definitions by ID
  markers: Map<string, MarkerValue>; // Marker definitions by ID
  cssProperties: Map<string, CSSPropertyDeclaration>; // @property declarations from Color(CSSVar(...))
  fontRegistry?: FontRegistry; // Loaded font data for precise metrics and glyph extraction
}

export interface Scope {
  variables: Map<string, Value>;
  parent: Scope | null;
  evalState?: EvaluationState; // Shared across all scopes during evaluation
}
