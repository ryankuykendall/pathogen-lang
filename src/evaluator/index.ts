import { parseExpression as expressionParserFn } from '../parser/lezer-expression';
const expressionParser = { parse: (input: string) => { const v = expressionParserFn(input); return { status: v !== null, value: v }; } };
import { contextAwareFunctions, stdlib } from '../stdlib';
import { CALLBACK_METHODS } from '../callback-methods';
import { arrayMutationError, isArrayLocked, lockArray, unlockArray } from './iteration-lock';
import {
  contextToObject,
  createPathContext,
  createTransformState,
  setLastTangent,
  transformStateToSvg,
  updateContextForCommand,
} from './context';
import { formatNum, resetNumberFormat, setNumberFormat } from './format';
import { CHAR_CLASS_PREDICATES, isWhitespaceChar } from './char-class';
import { BUILTIN_ENUMS } from './builtin-enums';
import { assignGradientProperty, assignMarkerProperty, assignMeshPointProperty, assignPatternProperty } from './member-assign';
import { getStructDescriptor } from './struct-properties';

export { BUILTIN_ENUMS };
import { angle, angleMethod, callStdlibPreservingAngles, formatAngleForDisplay, isAngleValue, radiansToDegreesSnapped } from './angle';
import { checkAngleUnitMismatch, convertUnitSuffix } from './units';
import { validateCSSIdent, validateCSSValue } from './sanitize';
import { sanitizeSVGFragment } from './svg-sanitize';

/** Maximum iterations allowed per for-loop to prevent runaway programs. */
const MAX_ITERATIONS = 32000;
import {
  cssSourceExpr,
  darken,
  darkenCSS,
  desaturate,
  desaturateCSS,
  flattenColor,
  hueShift,
  hueShiftCSS,
  lighten,
  lightenCSS,
  mixColors,
  mixCSS,
  oklchToCSS,
  parseColor,
  saturate,
  saturateCSS,
  setAlpha,
  setAlphaCSS,
  setLightnessCSS,
} from '../color';
import {
  chamferCommands,
  computeBoundingBox,
  concatenateCommands,
  ellipticalFilletCommands,
  filletCommands,
  mirrorCommands,
  offsetCommands,
  type OffsetJoinOptions,
  reverseCommands,
  rotateAtVertexCommands,
  rotateAboutPointCommands,
  scaleCommands,
  subPathCommands,
} from './path-transforms';
import { pathCut, pathDifference, pathIntersection, pathUnion, pathXor } from './boolean-ops';
import { calculatePathLength, partitionPath, samplePathAtFraction } from './sampling';
import {
  buildSimpleVariableOffset,
  buildCompoundVariableOffset,
  continuityFromValue,
  type SimpleStop,
  type CompoundStop,
  type CapSpec,
} from './variable-offset-geometry';
import { estimateTextBoundingBox, bboxOverlaps, bboxPathIntersects, bboxPathIntersectionPoints, resolveFontFamily, resolveFontWeight, resolveEffectiveFontSize } from './font-metrics';
import { getFont, lookupGlyph, recordMissingGlyph, buildMissingGlyphReports, splitContours } from './font-provider';
import { normalizeCodeText, tokenizeLine, getTokenColor } from './code-snippet';

import type { PathContext, TransformState } from './context';
import type { OKLCH } from '../color';
import type {
  ArrayValue,
  BooleanValue,
  ClipPathOutput,
  ClipPathValue,
  ColorNamespace,
  ColorValue,
  CompileResult,
  CSSPropertyDeclaration,
  CSSVarValue,
  CyclerValue,
  ElevationShadowFilterValue,
  EmbossFilterValue,
  EvaluationState,
  FilterOutput,
  FilterValue,
  FontRegistry,
  GlowFilterValue,
  GlowModeName,
  InnerShadowFilterValue,
  PixelateFilterValue,
  MotionBlurFilterValue,
  MotionBlurTypeName,
  FragmentLayerState,
  GradientOutput,
  GradientStop,
  GradientValue,
  GridInterpolationMode,
  GridOutOfBoundsMode,
  GridValue,
  GroupLayerState,
  LayerOutput,
  LayerReference,
  LayerState,
  LayerStyle,
  LogEntry,
  LogPart,
  MarkerOutput,
  MarkerValue,
  MaskOutput,
  MaskValue,
  MeshPointValue,
  NoiseFilterStyleName,
  NoiseFilterValue,
  ObjectNamespace,
  ObjectValue,
  PathBlockCommand,
  PathBlockNamespace,
  PathBlockValue,
  PathLayerState,
  PathSegment,
  PatternOutput,
  PatternValue,
  PointValue,
  PolarVectorValue,
  CapValue,
  CapNamespace,
  VariableOffsetBuilderValue,
  ProjectedPathValue,
  ProjectedTextValue,
  Scope,
  StyleBlockValue,
  SVGFragmentValue,
  TextBlockElement,
  TextBlockValue,
  TextChild,
  TextElement,
  TextLayerState,
  UserFunction,
  Value,
  AngleValue,
  PathStore,
  VertexHandleValue,
} from './types';
import type {
  ArrayDestructuringPattern,
  Expression,
  FunctionCall,
  IndexExpression,
  LayerConstructorExpression,
  MemberExpression,
  MethodCallExpression,
  ObjectDestructuringPattern,
  PathArg,
  PathBlockExpression,
  PathCommand,
  Program,
  Statement,
  StyleBlockLiteral,
  TemplateLiteral,
  TextBlockExpression,
  TextBodyItem,
} from '../parser/ast';

// Re-export all types from the dedicated types module
export type {
  ArrayValue,
  BooleanValue,
  ClipPathOutput,
  ClipPathValue,
  ColorNamespace,
  ColorValue,
  CompileResult,
  ContextObject,
  CSSPropertyDeclaration,
  CSSVarValue,
  CyclerValue,
  EvaluationState,
  FontData,
  FontRegistry,
  FragmentLayerState,
  FreeformPoint,
  GradientOutput,
  GradientStop,
  GradientValue,
  GridInterpolationMode,
  GridOutOfBoundsMode,
  GridValue,
  GroupLayerState,
  LayerOutput,
  LayerReference,
  LayerState,
  LayerStyle,
  LogEntry,
  LogPart,
  MarkerOutput,
  MarkerValue,
  MaskOutput,
  MaskPathEntry,
  MaskValue,
  MeshPointValue,
  FilterValue,
  FilterOutput,
  NoiseFilterValue,
  NoiseFilterStyleName,
  ObjectNamespace,
  ObjectValue,
  PathBlockCommand,
  PathBlockNamespace,
  PathBlockValue,
  PathLayerState,
  PathSegment,
  PathWithResult,
  PatternOutput,
  PatternValue,
  PointValue,
  PolarVectorValue,
  CapValue,
  CapNamespace,
  VariableOffsetBuilderValue,
  ProjectedPathValue,
  ProjectedTextValue,
  Scope,
  StyleBlockValue,
  SVGFragmentValue,
  TextBlockElement,
  TextBlockValue,
  TextChild,
  TextElement,
  TextLayerState,
  TopoContour,
  TransformPropertyReference,
  TransformReference,
  UserFunction,
  Value,
  AngleValue,
  PathRecord,
  PathStore,
  PathCommandMeta,
  RecordedCornerOp,
  VertexHandleValue,
} from './types';
import {
  applyAnnotationsToStore,
  applyRecordedCornerOps,
  collectEndpointLabels,
  collectSegmentLabels,
  commandsToPathData,
  createPathStore,
  findEndpointCommands,
  findLabeledRuns,
  locateCornerPos,
  recordPath,
  recordsFromCommands,
  parsePathStringAt,
  parsePathStringToCommands,
  storeToPathData,
  derivedMeta,
} from './segments';
import { serializeRelativeAndTrack } from './path-data';
import { tryResolveCSSFunctionArgs as sharedTryResolveCSSFunctionArgs } from './css-function-resolve';
import { spliceTemplateFragments } from '../css-value-utils';

/** CSS properties that reference defs elements via url(#id) */
const URL_REF_PROPERTIES = new Set(['mask', 'clip-path', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end']);

export function isArrayValue(value: Value): value is ArrayValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ArrayValue';
}

export function isPointValue(value: Value): value is PointValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PointValue';
}

export function isPolarVectorValue(value: Value): value is PolarVectorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PolarVectorValue';
}

export function isCapValue(value: Value): value is CapValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CapValue';
}

export function isCyclerValue(value: Value): value is CyclerValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CyclerValue';
}

export function isSVGFragmentValue(value: Value): value is SVGFragmentValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'SVGFragmentValue';
}

export function isMaskValue(value: Value): value is MaskValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MaskValue';
}

export function isClipPathValue(value: Value): value is ClipPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ClipPathValue';
}

export function isPatternValue(value: Value): value is PatternValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PatternValue';
}

export function isMarkerValue(value: Value): value is MarkerValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MarkerValue';
}

export function isGridValue(value: Value): value is GridValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'GridValue';
}

// Resolve an integer cell index (r or c) under the grid's outOfBounds mode.
// Returns null when the mode is 'null' and the index is outside the range.
function gridResolveIndex(idx: number, size: number, mode: GridOutOfBoundsMode): number | null {
  if (idx >= 0 && idx < size) return idx;
  if (mode === 'clamp') return Math.max(0, Math.min(size - 1, idx));
  if (mode === 'wrap') {
    const m = ((idx % size) + size) % size;
    return m;
  }
  return null; // mode === 'null'
}

function gridSampleNearest(grid: GridValue, x: number, y: number): Value {
  const fc = (x - grid.origin.x) / grid.xDim - 0.5;
  const fr = (y - grid.origin.y) / grid.yDim - 0.5;
  const r = gridResolveIndex(Math.round(fr), grid.rows, grid.outOfBounds);
  const c = gridResolveIndex(Math.round(fc), grid.cols, grid.outOfBounds);
  if (r === null || c === null) return null;
  return grid.cells[r][c];
}

function gridSampleBilinear(grid: GridValue, x: number, y: number, mError: (msg: string) => Error): Value {
  const fc = (x - grid.origin.x) / grid.xDim - 0.5;
  const fr = (y - grid.origin.y) / grid.yDim - 0.5;
  const c0base = Math.floor(fc);
  const r0base = Math.floor(fr);
  const fx = fc - c0base;
  const fy = fr - r0base;
  const r0 = gridResolveIndex(r0base, grid.rows, grid.outOfBounds);
  const r1 = gridResolveIndex(r0base + 1, grid.rows, grid.outOfBounds);
  const c0 = gridResolveIndex(c0base, grid.cols, grid.outOfBounds);
  const c1 = gridResolveIndex(c0base + 1, grid.cols, grid.outOfBounds);
  if (r0 === null || r1 === null || c0 === null || c1 === null) return null;
  const v00 = grid.cells[r0][c0];
  const v01 = grid.cells[r0][c1];
  const v10 = grid.cells[r1][c0];
  const v11 = grid.cells[r1][c1];
  // Numeric scalars: standard bilinear
  if (typeof v00 === 'number' && typeof v01 === 'number' && typeof v10 === 'number' && typeof v11 === 'number') {
    const top = v00 * (1 - fx) + v01 * fx;
    const bottom = v10 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }
  // PointValues: interpolate x and y separately (the standard fix for direction sampling)
  if (
    typeof v00 === 'object' && v00 !== null && 'type' in v00 && v00.type === 'PointValue' &&
    typeof v01 === 'object' && v01 !== null && 'type' in v01 && v01.type === 'PointValue' &&
    typeof v10 === 'object' && v10 !== null && 'type' in v10 && v10.type === 'PointValue' &&
    typeof v11 === 'object' && v11 !== null && 'type' in v11 && v11.type === 'PointValue'
  ) {
    const xTop = v00.x * (1 - fx) + v01.x * fx;
    const xBot = v10.x * (1 - fx) + v11.x * fx;
    const yTop = v00.y * (1 - fx) + v01.y * fx;
    const yBot = v10.y * (1 - fx) + v11.y * fx;
    return {
      type: 'PointValue' as const,
      x: xTop * (1 - fy) + xBot * fy,
      y: yTop * (1 - fy) + yBot * fy,
    };
  }
  throw mError('Grid.sampleBilinear() requires cells to be numbers or Points');
}

export function isFilterValue(value: Value): value is FilterValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'FilterValue';
}

export function isNoiseFilterValue(value: Value): value is NoiseFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'noise'
  );
}

export function isGlowFilterValue(value: Value): value is GlowFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'glow'
  );
}

export function isEmbossFilterValue(value: Value): value is EmbossFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'emboss'
  );
}

export function isElevationShadowFilterValue(value: Value): value is ElevationShadowFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'elevation-shadow'
  );
}

export function isInnerShadowFilterValue(value: Value): value is InnerShadowFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'inner-shadow'
  );
}

export function isPixelateFilterValue(value: Value): value is PixelateFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'pixelate'
  );
}

export function isMotionBlurFilterValue(value: Value): value is MotionBlurFilterValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'FilterValue' &&
    'kind' in value &&
    value.kind === 'motion-blur'
  );
}

export function isMeshPointValue(value: Value): value is MeshPointValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MeshPointValue';
}

export function isGradientValue(value: Value): value is GradientValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'GradientValue';
}

export function isColorValue(value: Value): value is ColorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ColorValue';
}

export function isCSSVarValue(value: Value): value is CSSVarValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CSSVarValue';
}

export function isObjectValue(value: Value): value is ObjectValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ObjectValue';
}

export function isPathBlockValue(value: Value): value is PathBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathBlockValue';
}

export function isProjectedPathValue(value: Value): value is ProjectedPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedPathValue';
}

export function isVertexHandleValue(value: Value): value is VertexHandleValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'VertexHandleValue';
}

/** Error text for a failed label query, listing what the path actually has. */
function queryLabelError(kind: 'segment' | 'endpoint', name: string, commands: PathBlockCommand[]): string {
  const available = kind === 'segment' ? collectSegmentLabels(commands) : collectEndpointLabels(commands);
  const list = available.length > 0 ? available.map((l) => `'${l}'`).join(', ') : '(none)';
  return `No ${kind} named '${name}' — available: ${list}`;
}

export function isTextBlockValue(value: Value): value is TextBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'TextBlockValue';
}

export function isProjectedTextValue(value: Value): value is ProjectedTextValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedTextValue';
}

export function isBooleanValue(value: Value): value is BooleanValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'BooleanValue';
}

/** Create a BooleanValue from a JS boolean or truthy/falsy expression */
function boolVal(v: boolean | number): BooleanValue {
  return { type: 'BooleanValue', value: v ? 1 : 0 };
}

/**
 * Extract numeric value from a Value that is either a number or a BooleanValue.
 * Returns undefined if the value is neither.
 */
function toNumber(v: Value): number | undefined {
  if (typeof v === 'number') return v;
  if (isBooleanValue(v)) return v.value;
  if (isAngleValue(v)) return v.radians;
  return undefined;
}

/**
 * Read a color-method angle argument (hueShift/analogous/splitComplementary
 * and Color(L, C, H)'s hue): an Angle value converts to degrees exactly; a
 * bare number is already degrees. Returns undefined for non-numeric values.
 */
function colorAngleDegrees(v: Value): number | undefined {
  if (isAngleValue(v)) return radiansToDegreesSnapped(v.radians);
  if (typeof v === 'number') return v;
  if (isBooleanValue(v)) return v.value;
  return undefined;
}


/**
 * Convert an Expression AST node to its source text representation
 */
function expressionToSource(expr: Expression): string {
  switch (expr.type) {
    case 'NumberLiteral':
      return String(expr.value) + (expr.unit || '');
    case 'ColorLiteral':
      return expr.raw;
    case 'StringLiteral':
      return `"${expr.value}"`;
    case 'Identifier':
      return expr.name;
    case 'MemberExpression':
      return `${expressionToSource(expr.object)}.${expr.property}`;
    case 'FunctionCall':
      return `${expr.name}(${expr.args.map(expressionToSource).join(', ')})`;
    case 'CalcExpression':
      return `calc(${expressionToSource(expr.expression)})`;
    case 'TernaryExpression':
      return `(${expressionToSource(expr.condition)} ? ${expressionToSource(expr.consequent)} : ${expressionToSource(expr.alternate)})`;
    case 'BinaryExpression':
      return `(${expressionToSource(expr.left)} ${expr.operator} ${expressionToSource(expr.right)})`;
    case 'UnaryExpression':
      return `${expr.operator}${expressionToSource(expr.argument)}`;
    case 'TemplateLiteral':
      return `\`${expr.parts.map((p) => (typeof p === 'string' ? p : `\${${expressionToSource(p)}}`)).join('')}\``;
    case 'StyleBlockLiteral':
      return `\${ ${expr.properties.map((p) => `${p.name}: ${p.value};`).join(' ')} }`;
    case 'NullLiteral':
      return 'null';
    case 'BooleanLiteral':
      return expr.value ? 'true' : 'false';
    case 'ArrayLiteral':
      return `[${expr.elements.map((el) => el.type === 'SpreadElement' ? `...${expressionToSource(el.argument)}` : expressionToSource(el)).join(', ')}]`;
    case 'IndexExpression':
      return `${expressionToSource(expr.object)}[${expressionToSource(expr.index)}]`;
    case 'MethodCallExpression':
      return `${expressionToSource(expr.object)}.${expr.method}(${expr.args.map(expressionToSource).join(', ')})${expr.block ? ` {|${expr.block.params.join(', ')}| ...}` : ''}`;
    case 'ObjectLiteral':
      return `{${expr.properties.map((p) => {
        if (p.type === 'SpreadElement') return `...${expressionToSource(p.argument)}`;
        if (p.shorthand && p.value.type === 'Identifier' && p.value.name === p.key) return p.key;
        return `${p.key}: ${expressionToSource(p.value)}`;
      }).join(', ')}}`;
    case 'PathBlockExpression':
      return '@{ ... }';
    case 'LambdaExpression':
      return `{|${expr.params.join(', ')}| ...}`;
    default:
      return '?';
  }
}

/**
 * Deterministic 32-bit hash for filter id → seed derivation. djb2 variant —
 * cheap and stable across compiles, so the same source produces the same
 * noise unless the user assigns f.seed explicitly.
 */
function hashFilterId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 65536;
}

/** Allocate a fresh, conflict-free auto-id for an inline filter constructor. */
function nextAutoFilterId(state: EvaluationState, kind: string): string {
  let n = 1;
  // Bump until we land on a free id across all defs maps (auto-ids only ever collide with each other in practice).
  // Termination: the id space is unbounded — we walk until we find a gap.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const id = `pathogen-${kind}-${n}`;
    if (
      !state.masks.has(id) &&
      !state.clipPaths.has(id) &&
      !state.gradients.has(id) &&
      !state.patterns.has(id) &&
      !state.markers.has(id) &&
      !state.filters.has(id)
    ) {
      return id;
    }
    n++;
  }
}

interface NoiseFilterStyleDefaults {
  scale: number;
  octaves: number;
  amount: number;
  monochrome: boolean;
  blend: string;
  contrast: number;
  stitch: boolean;
}

/** Per-style baselines. Keep these in sync with docs/filters.md and the renderer. */
function noiseFilterDefaults(style: NoiseFilterStyleName): NoiseFilterStyleDefaults {
  switch (style) {
    case 'grain':
      return { scale: 5.0, octaves: 6, amount: 0.4, monochrome: true, blend: 'color-burn', contrast: 1.0, stitch: false };
    case 'paper':
      return { scale: 1.0, octaves: 3, amount: 0.5, monochrome: true, blend: 'multiply', contrast: 1.0, stitch: false };
    case 'speckle':
      return { scale: 0.3, octaves: 2, amount: 0.6, monochrome: false, blend: 'multiply', contrast: 1.0, stitch: false };
    case 'static':
      return { scale: 5.0, octaves: 8, amount: 0.7, monochrome: true, blend: 'hard-light', contrast: 1.0, stitch: false };
    case 'gradient':
      return { scale: 1.0, octaves: 3, amount: 0.6, monochrome: false, blend: 'overlay', contrast: 1.7, stitch: true };
  }
}

function makeDefaultNoiseFilter(id: string, style: NoiseFilterStyleName): NoiseFilterValue {
  const d = noiseFilterDefaults(style);
  return {
    type: 'FilterValue',
    kind: 'noise',
    id,
    style,
    scale: d.scale,
    octaves: d.octaves,
    amount: d.amount,
    monochrome: d.monochrome,
    seed: hashFilterId(id),
    blend: d.blend,
    contrast: d.contrast,
    stitch: d.stitch,
  };
}

function makeDefaultGlowFilter(id: string): GlowFilterValue {
  return {
    type: 'FilterValue',
    kind: 'glow',
    id,
    mode: 'outer',
    color: 'rgb(255, 255, 255)',
    radius: 4,
    spread: 0,
    opacity: 0.8,
  };
}

function makeDefaultEmbossFilter(id: string): EmbossFilterValue {
  return {
    type: 'FilterValue',
    kind: 'emboss',
    id,
    angle: (135 * Math.PI) / 180,
    elevation: (45 * Math.PI) / 180,
    depth: 2,
    strength: 0.8,
    shininess: 20,
    lightColor: 'rgb(255, 255, 255)',
    smooth: 1,
  };
}

function makeDefaultElevationShadowFilter(id: string): ElevationShadowFilterValue {
  return {
    type: 'FilterValue',
    kind: 'elevation-shadow',
    id,
    elevation: 4,
    color: 'rgb(0, 0, 0)',
    direction: Math.PI / 2,
    tightness: 1.0,
  };
}

function makeDefaultInnerShadowFilter(id: string): InnerShadowFilterValue {
  return {
    type: 'FilterValue',
    kind: 'inner-shadow',
    id,
    offsetX: 0,
    offsetY: 2,
    blur: 4,
    color: 'rgb(0, 0, 0)',
    opacity: 0.5,
  };
}

function makeDefaultPixelateFilter(id: string): PixelateFilterValue {
  return {
    type: 'FilterValue',
    kind: 'pixelate',
    id,
    width: 10,
    height: 10,
    radius: 5,
  };
}

function makeDefaultMotionBlurFilter(id: string): MotionBlurFilterValue {
  return {
    type: 'FilterValue',
    kind: 'motion-blur',
    id,
    motionType: 'linear',
    distance: 10,
    angle: 0,
    samples: 12,
  };
}

/**
 * Signal class used to propagate return values up the call stack.
 * Thrown by return statements and caught by function call evaluation.
 */
class ReturnSignal {
  constructor(public value: Value) {}
}

function createScope(parent: Scope | null = null): Scope {
  return {
    variables: new Map(),
    parent,
    evalState: parent?.evalState, // Inherit evaluation state from parent
  };
}

function formatError(message: string, line?: number, column?: number): string {
  if (line !== undefined && line > 0) {
    if (column !== undefined && column > 0) {
      return `Line ${line}, col ${column}: ${message}`;
    }
    return `Line ${line}: ${message}`;
  }
  return message;
}

function getLine(node: unknown): number | undefined {
  return (node as { loc?: { line: number } })?.loc?.line;
}

function getCol(node: unknown): number | undefined {
  return (node as { loc?: { column: number } })?.loc?.column;
}

/** Walk left children of a BinaryExpression to find the nearest node with loc */
function getLineDeep(node: unknown): number | undefined {
  const line = getLine(node);
  if (line) return line;
  const left = (node as { left?: unknown })?.left;
  if (left) return getLineDeep(left);
  return undefined;
}

function lookupVariable(scope: Scope, name: string, line?: number, column?: number): Value {
  if (scope.variables.has(name)) {
    return scope.variables.get(name)!;
  }
  if (scope.parent) {
    return lookupVariable(scope.parent, name, line, column);
  }
  // Object namespace
  if (name === 'Object') {
    return { type: 'ObjectNamespace' } as ObjectNamespace;
  }
  // Color namespace
  if (name === 'Color') {
    return { type: 'ColorNamespace' } as ColorNamespace;
  }
  // PathBlock namespace
  if (name === 'PathBlock') {
    return { type: 'PathBlockNamespace' } as PathBlockNamespace;
  }
  // Cap namespace (end caps for compoundVariableOffset)
  if (name === 'Cap') {
    return { type: 'CapNamespace' } as CapNamespace;
  }
  // Ambient viewbox global — fresh copy per read so the struct is read-only
  // and evalState's `loc` never leaks into user code.
  // NOTE: fallbacks run only at the ROOT scope (recursion above returns
  // through scope.parent first), whose evalState is the real one. Path/text
  // blocks put a synthetic evalState on the BLOCK scope, so reads inside
  // @{ } / &{ } correctly see the program's viewBox. Do not add `viewBox`
  // to the synthetic block-state field lists or short-circuit this lookup
  // at a non-root scope — either would silently break in-block reads.
  if (name === 'viewbox') {
    const vb = scope.evalState?.viewBox;
    if (!vb) {
      throw new Error(
        formatError('viewbox is not available until define ViewBox(...) has run', line, column),
      );
    }
    return {
      type: 'ViewBoxStructValue',
      originX: vb.originX,
      originY: vb.originY,
      width: vb.width,
      height: vb.height,
    };
  }
  // Built-in enums
  if (name in BUILTIN_ENUMS) {
    const props = new Map<string, Value>();
    for (const [k, v] of Object.entries(BUILTIN_ENUMS[name])) props.set(k, v);
    return { type: 'ObjectValue', properties: props } as ObjectValue;
  }
  // Check stdlib
  if (name in stdlib) {
    return stdlib[name as keyof typeof stdlib] as unknown as Value;
  }
  throw new Error(formatError(`Undefined variable: ${name}`, line, column));
}

function setVariable(scope: Scope, name: string, value: Value): void {
  scope.variables.set(name, value);
}

function updateVariable(scope: Scope, name: string, value: Value, line?: number): void {
  let current: Scope | null = scope;
  while (current) {
    if (current.variables.has(name)) {
      current.variables.set(name, value);
      return;
    }
    current = current.parent;
  }
  throw new Error(formatError(`Cannot assign to undeclared variable: ${name}`, line));
}

function isStyleBlock(value: Value): value is StyleBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'StyleBlockValue';
}

function isLayerReference(value: Value): value is LayerReference {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'LayerReference';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// --- Path length calculation utilities ---

/**
 * Extract vertices (start/end points of each segment) from commands
 */
function extractVertices(commands: PathBlockCommand[]): PointValue[] {
  if (commands.length === 0) return [];

  const vertices: PointValue[] = [];
  const seen = new Set<string>();

  for (const cmd of commands) {
    const startKey = `${cmd.start.x},${cmd.start.y}`;
    if (!seen.has(startKey)) {
      seen.add(startKey);
      vertices.push({ type: 'PointValue', x: cmd.start.x, y: cmd.start.y });
    }
    const endKey = `${cmd.end.x},${cmd.end.y}`;
    if (!seen.has(endKey)) {
      seen.add(endKey);
      vertices.push({ type: 'PointValue', x: cmd.end.x, y: cmd.end.y });
    }
  }

  return vertices;
}

/**
 * Count subpaths (separated by m commands after the first command)
 */
function countSubPaths(commands: PathBlockCommand[]): number {
  if (commands.length === 0) return 0;
  let count = 1;
  for (let i = 1; i < commands.length; i++) {
    if (commands[i].command === 'm') count++;
  }
  return count;
}

/**
 * Normalize a raw path-context history entry to the PathBlockCommand invariant:
 * command is lowercase, and positional args are relative to the command's start point.
 *
 * The context history preserves the original command character (so 'Q' stays 'Q') and
 * stores args exactly as the source wrote them. For uppercase (absolute) originals, the
 * args are absolute coordinates and must be converted to relative before the lowercased
 * command is stored on the PathBlockValue.
 *
 * After the stdlib-to-relative refactor, shape helpers (circle, rect, roundRect, polygon,
 * star, line, quadratic, cubic) emit absolute `M` + relative body, so this helper is a
 * no-op for their body commands. It still runs meaningfully for:
 *   - The initial absolute `M` those shapes emit (M → m: no arg read by the emitter, but
 *     we normalize for interface consistency).
 *   - Continuation helpers that stay uppercase: arc (A), moveTo (M), lineTo (L),
 *     closePath (Z) — for these, commandsToRelativeD reads only non-positional args or
 *     end/start deltas, but consistency of the interface still matters.
 */
function normalizeToRelativeArgs(
  command: string,
  args: number[],
  start: { x: number; y: number },
): number[] {
  // Already lowercase: args are already relative
  if (command === command.toLowerCase()) return [...args];
  const sx = start.x;
  const sy = start.y;
  const c = command.toUpperCase();
  switch (c) {
    case 'M':
    case 'L':
    case 'T':
      return [args[0] - sx, args[1] - sy];
    case 'H':
      return [args[0] - sx];
    case 'V':
      return [args[0] - sy];
    case 'C':
      return [
        args[0] - sx, args[1] - sy,
        args[2] - sx, args[3] - sy,
        args[4] - sx, args[5] - sy,
      ];
    case 'S':
    case 'Q':
      return [
        args[0] - sx, args[1] - sy,
        args[2] - sx, args[3] - sy,
      ];
    case 'A':
      // rx, ry, rotation, large-arc, sweep are non-positional; only end (args[5], args[6]) is positional
      return [args[0], args[1], args[2], args[3], args[4], args[5] - sx, args[6] - sy];
    case 'Z':
      return [];
    default:
      return [...args];
  }
}

/** Resolve cut()'s cutter argument: one PathBlock/ProjectedPath, or an
 *  array of them — array knives cut exactly as if their strokes lived in
 *  one block (chains split on coordinate discontinuity downstream). */
function resolveCutterCommands(cutterVal: Value, mkErr: (message: string) => Error): PathBlockCommand[] {
  if (isPathBlockValue(cutterVal) || isProjectedPathValue(cutterVal)) return cutterVal.commands;
  if (isArrayValue(cutterVal)) {
    if (cutterVal.elements.length === 0) throw mkErr('cut() cutter array must hold at least one cutter');
    const all: PathBlockCommand[] = [];
    for (const el of cutterVal.elements) {
      if (isPathBlockValue(el) || isProjectedPathValue(el)) all.push(...el.commands);
      else throw mkErr('cut() cutter array elements must each be a PathBlock or ProjectedPath');
    }
    return all;
  }
  throw mkErr('cut() argument must be a PathBlock or ProjectedPath (or an array of them)');
}

/** Validate offset()'s optional second argument: { join: 'miter' | 'bevel' | 'round' }. */
function parseOffsetJoinOptions(val: Value, mkErr: (message: string) => Error): OffsetJoinOptions {
  if (typeof val !== 'object' || val === null || (val as { type?: string }).type !== 'ObjectValue') {
    throw mkErr("offset() options must be an object, e.g. { join: 'round' }");
  }
  const props = (val as { properties: Map<string, Value> }).properties;
  const options: OffsetJoinOptions = {};
  for (const key of props.keys()) {
    if (key !== 'join') throw mkErr(`offset() options: unknown key '${key}' (supported: join)`);
  }
  const joinVal = props.get('join');
  if (joinVal !== undefined) {
    if (joinVal !== 'miter' && joinVal !== 'bevel' && joinVal !== 'round') {
      throw mkErr("offset() join must be 'miter', 'bevel', or 'round'");
    }
    options.join = joinVal;
  }
  return options;
}

function buildPathBlockFromCommands(cmds: PathBlockCommand[], origin?: { x: number; y: number }): PathBlockValue {
  if (cmds.length === 0) {
    return {
      type: 'PathBlockValue' as const,
      commands: [],
      records: [],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
    };
  }
  const originX = origin ? origin.x : cmds[0].start.x;
  const originY = origin ? origin.y : cmds[0].start.y;
  const normalized = cmds.map((cmd) => {
    const meta = derivedMeta(cmd.meta);
    return {
      command: cmd.command,
      args: [...cmd.args],
      start: { x: cmd.start.x - originX, y: cmd.start.y - originY },
      end: { x: cmd.end.x - originX, y: cmd.end.y - originY },
      ...(meta !== undefined ? { meta } : {}),
    };
  });
  const last = normalized[normalized.length - 1];
  return {
    type: 'PathBlockValue' as const,
    commands: normalized,
    records: recordsFromCommands(normalized),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: last.end.x, y: last.end.y },
  };
}

/**
 * Build a ProjectedPathValue from transform result commands.
 */
function buildProjectedPathFromCommands(cmds: PathBlockCommand[], original: ProjectedPathValue): ProjectedPathValue {
  if (cmds.length === 0) {
    return {
      type: 'ProjectedPathValue' as const,
      commands: [],
      startPoint: { ...original.startPoint },
      endPoint: { ...original.startPoint },
    };
  }
  const start = cmds[0].start;
  const end = cmds[cmds.length - 1].end;
  return {
    type: 'ProjectedPathValue' as const,
    commands: cmds,
    startPoint: { x: start.x, y: start.y },
    endPoint: { x: end.x, y: end.y },
  };
}

/**
 * Project a PathBlockValue's commands to absolute coordinates from a given origin
 */
function projectCommands(commands: PathBlockCommand[], originX: number, originY: number): PathBlockCommand[] {
  return commands.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { x: cmd.start.x + originX, y: cmd.start.y + originY },
    end: { x: cmd.end.x + originX, y: cmd.end.y + originY },
    ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
  }));
}

/**
 * Generate the GroupLayer, PathLayer (bg), and TextLayer (code) for toCodeSnippetBlock().
 */
function generateCodeSnippetLayers(
  name: string,
  codeLines: string[],
  fontSize: number,
  padding: number,
  evalState: EvaluationState,
): { groupLayer: GroupLayerState; bgLayer: PathLayerState; codeLayer: TextLayerState } {
  const lineHeight = fontSize * 1.6;
  const charWidth = fontSize * 0.6; // monospace approximation

  // Measure max line width
  let maxLineLen = 0;
  for (const line of codeLines) {
    if (line.length > maxLineLen) maxLineLen = line.length;
  }

  const bgWidth = maxLineLen * charWidth + 2 * padding;
  const bgHeight = codeLines.length * lineHeight + 2 * padding;

  // Create background PathLayer with roundRect
  const bgName = `${name}-bg`;
  const bgLayerState: PathLayerState = {
    name: bgName,
    layerType: 'PathLayer',
    isDefault: false,
    styles: { fill: '#1e293b', stroke: '#334155', 'stroke-width': '1' },
    pathContext: createPathContext(),
    accum: createPathStore(),
    transformState: createTransformState(),
  };
  // Generate roundRect path
  const r = 6;
  const rr = Math.min(r, bgWidth / 2, bgHeight / 2);
  const rrPath = `M ${rr} 0 L ${bgWidth - rr} 0 Q ${bgWidth} 0 ${bgWidth} ${rr} L ${bgWidth} ${bgHeight - rr} Q ${bgWidth} ${bgHeight} ${bgWidth - rr} ${bgHeight} L ${rr} ${bgHeight} Q 0 ${bgHeight} 0 ${bgHeight - rr} L 0 ${rr} Q 0 0 ${rr} 0 Z`;
  recordPath(bgLayerState.accum, rrPath, parsePathStringAt(rrPath, { x: 0, y: 0 }));

  // Create code TextLayer with tokenized text
  const codeName = `${name}-code`;
  const codeLayerState: TextLayerState = {
    name: codeName,
    layerType: 'TextLayer',
    isDefault: false,
    styles: { 'font-family': 'monospace', 'font-size': String(fontSize) },
    textElements: [],
  };

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    // Measure leading whitespace and convert to x-offset (SVG collapses whitespace in text)
    const leadingMatch = line.match(/^( *)/);
    const leadingSpaces = leadingMatch ? leadingMatch[1].length : 0;
    const trimmedLine = line.slice(leadingSpaces);
    const indentOffset = leadingSpaces * charWidth;

    const tokens = tokenizeLine(trimmedLine);
    const children: TextChild[] = [];
    for (const token of tokens) {
      const color = getTokenColor(token.type);
      children.push({
        type: 'tspan',
        text: token.value,
        styles: { fill: color },
      });
    }
    // If line is empty, add a single space run so the element exists
    if (children.length === 0) {
      children.push({ type: 'run', text: ' ' });
    }
    codeLayerState.textElements.push({
      x: padding + indentOffset,
      y: padding + i * lineHeight + fontSize,
      children,
    });
  }

  // Create GroupLayer containing both
  const groupLayer: GroupLayerState = {
    name,
    layerType: 'GroupLayer',
    isDefault: false as const,
    styles: {},
    transformState: createTransformState(),
    children: [bgName, codeName],
  };

  // Register all layers
  evalState.layers.set(bgName, bgLayerState);
  evalState.layers.set(codeName, codeLayerState);
  evalState.layers.set(name, groupLayer);
  evalState.layerOrder.push(name);
  // Don't push children to layerOrder — they're children of the group

  return { groupLayer, bgLayer: bgLayerState, codeLayer: codeLayerState };
}

/**
 * Serialize PathBlockCommands to a relative SVG d-attribute string.
 * Reconstructs relative commands from structured command data. Used by .draw()
 * so PathBlock geometry stays relative to the cursor position.
 *
 * When bridgeOriginGap is true, prepends a relative move `m dx dy` if the first
 * command doesn't start at (0,0). This compensates for closed-path fillet/chamfer
 * operations that cyclically shift the command start point away from the pathblock origin.
 */
/**
 * Serialize PathBlockCommands to an absolute SVG d-attribute string.
 * Commands have absolute start/end points; relative args are converted to absolute.
 */
function commandsToAbsoluteD(commands: PathBlockCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    const c = cmd.command;
    const abs = c.toUpperCase();
    if (c === 'z') {
      parts.push('Z');
    } else if (c === 'h') {
      parts.push(`H ${formatNum(cmd.end.x)}`);
    } else if (c === 'v') {
      parts.push(`V ${formatNum(cmd.end.y)}`);
    } else if (c === 'c') {
      // c dx1 dy1 dx2 dy2 dx dy → C x1 y1 x2 y2 x y
      const [dx1, dy1, dx2, dy2] = cmd.args;
      parts.push(
        `C ${formatNum(cmd.start.x + dx1)} ${formatNum(cmd.start.y + dy1)} ${formatNum(cmd.start.x + dx2)} ${formatNum(cmd.start.y + dy2)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`,
      );
    } else if (c === 's') {
      // s dx2 dy2 dx dy → S x2 y2 x y
      const [dx2, dy2] = cmd.args;
      parts.push(
        `S ${formatNum(cmd.start.x + dx2)} ${formatNum(cmd.start.y + dy2)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`,
      );
    } else if (c === 'q') {
      // q dx1 dy1 dx dy → Q x1 y1 x y
      const [dx1, dy1] = cmd.args;
      parts.push(
        `Q ${formatNum(cmd.start.x + dx1)} ${formatNum(cmd.start.y + dy1)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`,
      );
    } else if (c === 't') {
      parts.push(`T ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    } else if (c === 'a') {
      // a rx ry rotation largeArc sweep dx dy → A rx ry rotation largeArc sweep x y
      const [rx, ry, rotation, largeArc, sweep] = cmd.args;
      parts.push(
        `A ${formatNum(rx)} ${formatNum(ry)} ${formatNum(rotation)} ${formatNum(largeArc)} ${formatNum(sweep)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`,
      );
    } else {
      // m, l → M, L: use end point as absolute coordinates
      parts.push(`${abs} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    }
  }
  return parts.join(' ');
}

function evaluateStyleBlockLiteral(expr: StyleBlockLiteral, scope: Scope): StyleBlockValue {
  // A malformed declaration (e.g. a missing trailing `;`) is recorded leniently
  // during AST-building so the language service stays resilient; enforce it
  // strictly here so it fails compilation with a positioned error.
  if (expr.incomplete) {
    throw new Error(formatError(expr.incomplete.message, expr.incomplete.line, expr.incomplete.column));
  }
  const properties: Record<string, string> = {};
  for (const prop of expr.properties) {
    // Trust tracking: compiler-emitted strings (Color → hex, CSSVar → var(...),
    // gradient/pattern/marker → url(#id)) are validated at construction time;
    // they cannot be distinguished from user input by string shape, so we mark
    // them trusted here and skip the CSS-value validator. Plain string and
    // multi-token-fallback paths remain untrusted and get strict validation.
    let resolvedValue = prop.value;
    let trusted = false;
    let wasWholeValueTemplate = false;
    let structValueName: string | null = null;
    // var() strings this compiler emitted from validated CSSVarValue/Color
    // objects for THIS value — the validator allows exactly these tokens.
    const emittedVars: string[] = [];
    try {
      const parseResult = expressionParser.parse(prop.value);
      if (parseResult.status && parseResult.value) {
        // Bare color literal (#hex) — trusted (parser shape is restrictive).
        if (parseResult.value.type === 'ColorLiteral') {
          resolvedValue = parseResult.value.raw;
          properties[prop.name] = resolvedValue;
          continue;
        }
        const evaluated = evaluateExpression(parseResult.value, scope);
        if (typeof evaluated === 'number') {
          resolvedValue = formatNum(evaluated);
          trusted = true;
        } else if (isAngleValue(evaluated)) {
          // Angles emit their radians number (rotate: 45deg → rotate="0.785…"
          // downstream converts to degrees at the transform boundary)
          resolvedValue = formatNum(evaluated.radians);
          trusted = true;
        } else if (typeof evaluated === 'string') {
          resolvedValue = evaluated;
          // Untrusted: user-supplied string. Validation runs below.
          // A whole-value template is inline-authored CSS text: run the
          // function-arg resolver on its result (below) so `blur(${s}px)
          // brightness(level)` behaves identically to the fragment form.
          wasWholeValueTemplate = parseResult.value.type === 'TemplateLiteral';
        } else if (isColorValue(evaluated)) {
          resolvedValue = colorValueToCSS(evaluated);
          trusted = true;
        } else if (isCSSVarValue(evaluated)) {
          resolvedValue = cssVarValueToCSS(evaluated);
          trusted = true;
        } else if (isGradientValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
          trusted = true;
        } else if (isPatternValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
          trusted = true;
        } else if (isMarkerValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
          trusted = true;
        } else if (isFilterValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
          trusted = true;
        } else {
          // Struct values (ViewBox, Point, Grid, ctx, …) have no CSS form;
          // silently keeping the raw source text would emit a broken
          // attribute (e.g. stroke-width="viewbox"). Record the type name
          // and reject AFTER the try/catch — throwing here would be
          // swallowed by the catch below, whose keep-raw behavior is
          // load-bearing for eval failures (rgb(...), context-stroke, …).
          structValueName = getStructDescriptor(evaluated)?.name ?? null;
        }
        // For other non-struct types, keep raw string (untrusted)
      }
    } catch {
      // Parse or eval failed — keep raw string (handles rgb(...), #hex, multi-value strings, etc.)
    }
    if (structValueName) {
      const eLine = prop.valueLoc?.line ?? prop.loc?.line ?? getLine(expr);
      const eCol = prop.valueLoc?.column ?? prop.loc?.column ?? getCol(expr);
      throw new Error(
        formatError(
          `Style value for "${prop.name}": a ${structValueName} value has no CSS form — use one of its members instead`,
          eLine,
          eCol,
        ),
      );
    }
    // Backtick template fragments inside the value (e.g. blur(`${v}`px)):
    // evaluate each span and splice its text into the surrounding value.
    // The whole-value template case never reaches here (it parses above);
    // the spliced result stays untrusted and is validated below.
    let didSplice = false;
    if (resolvedValue === prop.value && prop.value.includes('`')) {
      try {
        const spliced = spliceTemplateFragments(prop.value, (templateSource) => {
          const parsed = expressionParser.parse(templateSource);
          if (!parsed.status || !parsed.value) {
            throw new Error(`could not parse template fragment ${templateSource}`);
          }
          const v = evaluateExpression(parsed.value, scope);
          if (typeof v === 'number') return formatNum(v);
          if (isAngleValue(v)) return formatNum(v.radians);
          if (typeof v === 'string') return v;
          // Typed values with a CSS form: var() strings from these are
          // compiler-emitted (validated at construction) — record them so
          // the validator can allow exactly these tokens. A var()-shaped
          // plain string result above is deliberately NOT recorded.
          if (isColorValue(v) || isCSSVarValue(v)) {
            const css = isColorValue(v) ? colorValueToCSS(v) : cssVarValueToCSS(v);
            if (css.startsWith('var(')) emittedVars.push(css);
            return css;
          }
          throw new Error(`template fragment ${templateSource} must produce a string or number`);
        });
        if (spliced !== null) {
          resolvedValue = spliced;
          didSplice = true;
        }
      } catch (e) {
        const eLine = prop.valueLoc?.line ?? prop.loc?.line ?? getLine(expr);
        const eCol = prop.valueLoc?.column ?? prop.loc?.column ?? getCol(expr);
        throw new Error(formatError(`Style value for "${prop.name}": ${(e as Error).message}`, eLine, eCol));
      }
    }
    // If the whole-value expression parse didn't resolve, try resolving
    // expressions embedded inside CSS function arguments (e.g., color args in
    // drop-shadow, numeric variables in brightness). Also runs on spliced
    // values and whole-value template results so remaining idents substitute
    // identically in every interpolation form.
    if (resolvedValue === prop.value || didSplice || wasWholeValueTemplate) {
      const cssResolved = tryResolveCSSFunctionArgs(resolvedValue, scope, emittedVars);
      if (cssResolved !== null) {
        resolvedValue = cssResolved;
      }
    }
    // Auto-wrap URL-reference properties with url(#...) — skip CSS function values (contain parentheses)
    if (URL_REF_PROPERTIES.has(prop.name) && typeof resolvedValue === 'string' && !/^url\(/i.test(resolvedValue) && !resolvedValue.includes('(')) {
      // The unwrapped value becomes a fragment ref — must be a valid ident.
      try {
        validateCSSIdent(resolvedValue, 'fragment-ref');
      } catch (e) {
        // Prefer the per-declaration position (prop.loc); the enclosing
        // StyleBlockLiteral carries no source location.
        const eLine = prop.loc?.line ?? getLine(expr);
        const eCol = prop.loc?.column ?? getCol(expr);
        throw new Error(formatError(`Style "${prop.name}" url() reference: ${(e as Error).message}`, eLine, eCol));
      }
      resolvedValue = `url(#${resolvedValue})`;
      trusted = true; // wrapped a validated ident
    }
    // Validate the final value against the strict CSS allow-list before
    // storing. Trusted (compiler-emitted) values bypass the validator —
    // they cannot escape the value string by shape (CSSVar/Color/Gradient
    // construction validates inputs and produces a fixed grammar).
    if (!trusted) {
      try {
        // Only var() tokens the compiler itself emitted (recorded in
        // emittedVars) may pass — never a var() that rode along in the text.
        validateCSSValue(resolvedValue, prop.name, {
          allowVar: emittedVars.length > 0 ? emittedVars : false,
        });
      } catch (e) {
        // Point at the value when we know its extent (valueLoc), else the name.
        const eLine = prop.valueLoc?.line ?? prop.loc?.line ?? getLine(expr);
        const eCol = prop.valueLoc?.column ?? prop.loc?.column ?? getCol(expr);
        throw new Error(formatError((e as Error).message, eLine, eCol));
      }
    }
    properties[prop.name] = resolvedValue;
  }
  return { type: 'StyleBlockValue', properties };
}

/**
 * Convert a ColorValue to its CSS string representation.
 */
function colorValueToCSS(color: ColorValue): string {
  if (color.lightDark) {
    return `light-dark(${color.lightDark.lightCSS}, ${color.lightDark.darkCSS})`;
  } else if (color.cssExpr) {
    return color.cssExpr;
  } else if (color.cssVar) {
    return `var(${color.cssVar.varName}, ${oklchToCSS(color.oklch)})`;
  }
  return oklchToCSS(color.oklch);
}

/**
 * Convert a CSSVarValue to its CSS string representation.
 */
function cssVarValueToCSS(v: CSSVarValue): string {
  return v.fallback ? `var(${v.varName}, ${v.fallback})` : `var(${v.varName})`;
}

/**
 * Resolve Pathogen expressions embedded within CSS function arguments (e.g.
 * color args in drop-shadow) via the shared resolver, using this evaluator's
 * expression parse/eval.
 */
function tryResolveCSSFunctionArgs(raw: string, scope: Scope, emittedVars?: string[]): string | null {
  return sharedTryResolveCSSFunctionArgs(raw, {
    parseExpression: (token) => {
      const parseResult = expressionParser.parse(token);
      return parseResult.status && parseResult.value ? parseResult.value : null;
    },
    resolveToCSS: (expr) => {
      // Literal tokens (2px, 1.4) must stay verbatim — substituting would
      // strip CSS units the Pathogen number parser consumed. (The resolver
      // also guards on the raw token text, which covers -90deg/-50% shapes
      // that parse as UnaryExpression rather than NumberLiteral.)
      if (expr.type === 'NumberLiteral') return null;
      const evaluated = evaluateExpression(expr, scope);
      if (isColorValue(evaluated)) return colorValueToCSS(evaluated);
      if (isCSSVarValue(evaluated)) return cssVarValueToCSS(evaluated);
      if (typeof evaluated === 'number') return formatNum(evaluated);
      // CSS angle slots (hue-rotate) need a unit — emit degrees
      if (isAngleValue(evaluated)) return `${formatNum(radiansToDegreesSnapped(evaluated.radians))}deg`;
      return null;
    },
  }, emittedVars);
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  switch (expr.type) {
    case 'NumberLiteral':
      if (expr.unit === 'deg' || expr.unit === 'rad' || expr.unit === 'pi') {
        return angle(convertUnitSuffix(expr.value, expr.unit), expr.unit);
      }
      return convertUnitSuffix(expr.value, expr.unit);

    case 'ColorLiteral': {
      const raw = expr.raw;
      if (raw.startsWith('#')) {
        const digits = raw.slice(1);
        if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
          throw new Error(
            formatError(
              `Invalid hex color: '${raw}' (must be 3, 4, 6, or 8 hex digits)`,
              getLine(expr),
              getCol(expr),
            ),
          );
        }
      }
      try {
        return { type: 'ColorValue' as const, oklch: parseColor(raw) };
      } catch (e) {
        throw new Error(formatError((e as Error).message, getLine(expr), getCol(expr)));
      }
    }

    case 'StringLiteral':
      return expr.value;

    case 'NullLiteral':
      return null;

    case 'BooleanLiteral':
      return boolVal(expr.value);

    case 'Identifier':
      return lookupVariable(scope, expr.name, getLine(expr), getCol(expr));

    case 'LambdaExpression':
      // Capture the live definition scope by reference: the lambda sees later
      // reassignments of captured variables, and loop bodies (fresh scope per
      // iteration) give each lambda its own iteration's bindings.
      return {
        type: 'UserFunction' as const,
        params: expr.params,
        body: expr.body,
        closure: scope,
        isLambda: true as const,
      };

    case 'ArrayLiteral': {
      const elements: Value[] = [];
      for (const el of expr.elements) {
        if (el.type === 'SpreadElement') {
          const val = evaluateExpression(el.argument, scope);
          if (!isArrayValue(val)) throw new Error(formatError('Spread argument must be an array', getLine(el.argument)));
          elements.push(...val.elements);
        } else {
          elements.push(evaluateExpression(el, scope));
        }
      }
      return { type: 'ArrayValue' as const, elements };
    }

    case 'ObjectLiteral': {
      const props = new Map<string, Value>();
      for (const prop of expr.properties) {
        if (prop.type === 'SpreadElement') {
          const val = evaluateExpression(prop.argument, scope);
          if (!isObjectValue(val)) throw new Error(formatError('Spread argument must be an object', getLine(prop.argument)));
          for (const [k, v] of val.properties) props.set(k, v);
        } else {
          props.set(prop.key, evaluateExpression(prop.value, scope));
        }
      }
      return { type: 'ObjectValue', properties: props } as ObjectValue;
    }

    case 'IndexExpression':
      return evaluateIndexExpression(expr, scope);

    case 'MethodCallExpression':
      return evaluateMethodCall(expr, scope);

    case 'TernaryExpression': {
      const condVal = evaluateExpression(expr.condition, scope);
      const condNum = toNumber(condVal);
      const truthValue = condNum !== undefined ? condNum !== 0 : condVal !== null;
      return truthValue ? evaluateExpression(expr.consequent, scope) : evaluateExpression(expr.alternate, scope);
    }

    case 'BinaryExpression': {
      // Check for angle unit misuse before evaluation (+/- mixing, angle × angle)
      if (expr.operator === '+' || expr.operator === '-' || expr.operator === '*') {
        checkAngleUnitMismatch(expr.left, expr.right, expr.operator);
      }

      // << worker application: a callback builtin written WITHOUT a trailing
      // block takes its callback from the right operand. Must run before the
      // eager operand evaluation below — the bare builtin call is not a
      // complete expression on its own. A block-bearing call falls through to
      // the merge path (vo() {|go,pb| ...} << edge is still concatenation).
      if (
        expr.operator === '<<' &&
        expr.left.type === 'MethodCallExpression' &&
        !expr.left.block &&
        CALLBACK_METHODS.has(expr.left.method)
      ) {
        return evaluateMethodCall(expr.left, scope, expr.right);
      }

      const left = evaluateExpression(expr.left, scope);
      const right = evaluateExpression(expr.right, scope);

      // << operator: merge (objects, style blocks, path blocks, text blocks)
      if (expr.operator === '<<') {
        if (isPathBlockValue(left) && isPathBlockValue(right)) {
          const concatCmds = concatenateCommands(left.commands, left.endPoint, right.commands);
          if (concatCmds.length === 0) {
            return {
              type: 'PathBlockValue' as const,
              commands: [],
              records: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
          }
          const lastCmd = concatCmds[concatCmds.length - 1];
          return {
            type: 'PathBlockValue' as const,
            commands: concatCmds,
            records: recordsFromCommands(concatCmds),
            startPoint: { x: 0, y: 0 },
            endPoint: { x: lastCmd.end.x, y: lastCmd.end.y },
          };
        }
        if (isTextBlockValue(left) && isStyleBlock(right)) {
          return { type: 'TextBlockValue' as const, elements: left.elements, styles: { ...left.styles, ...right.properties } };
        }
        if (isProjectedTextValue(left) && isStyleBlock(right)) {
          return { type: 'ProjectedTextValue' as const, elements: left.elements, styles: { ...left.styles, ...right.properties }, origin: left.origin };
        }
        if (isStyleBlock(left) && isStyleBlock(right)) {
          return { type: 'StyleBlockValue', properties: { ...left.properties, ...right.properties } };
        }
        if (isLayerReference(left) && isStyleBlock(right)) {
          // Merge styles into layer in place, return same ref for chaining
          Object.assign(left.layer.styles, right.properties);
          return left;
        }
        if (isObjectValue(left) && isObjectValue(right)) {
          const merged = new Map(left.properties);
          for (const [key, value] of right.properties) {
            merged.set(key, value);
          }
          return { type: 'ObjectValue', properties: merged };
        }
        if (isCallableValue(right)) {
          throw new Error(
            formatError(
              'Operator << can apply a function or lambda only to a callback builtin call written without a trailing block (e.g. arr.map() << f, spine.variableOffset() << f) — the left side here is already a value',
              getLine(expr),
            ),
          );
        }
        throw new Error(
          formatError(
            'Operator << requires matching operand types (both objects, both style blocks, both path blocks, or text block << style block)',
            getLine(expr),
          ),
        );
      }

      // Null equality checks
      if (expr.operator === '==' || expr.operator === '!=') {
        if (left === null || right === null) {
          if (expr.operator === '==') return boolVal(left === null && right === null);
          return boolVal(!(left === null && right === null));
        }
      }

      // String/BooleanValue equality: == and != (including cross-type with strings for enum interop)
      if (expr.operator === '==' || expr.operator === '!=') {
        const ls = typeof left === 'string' ? left : (isBooleanValue(left) ? (left.value ? 'true' : 'false') : undefined);
        const rs = typeof right === 'string' ? right : (isBooleanValue(right) ? (right.value ? 'true' : 'false') : undefined);
        if (ls !== undefined && rs !== undefined) {
          if (expr.operator === '==') return boolVal(ls === rs);
          return boolVal(ls !== rs);
        }
      }

      // Null in arithmetic
      if (left === null || right === null) {
        throw new Error(formatError('Cannot use null in arithmetic expression', getLineDeep(expr)));
      }

      // Extract numeric values (number or BooleanValue)
      const leftNum = toNumber(left);
      const rightNum = toNumber(right);

      if (leftNum === undefined || rightNum === undefined) {
        throw new Error(formatError(`Binary operator ${expr.operator} requires numeric operands`, getLineDeep(expr)));
      }

      // Angle propagation: an angle stays an angle through +/-, scaling, and
      // division by a plain number. Angle×angle and angle/angle cancel to a
      // plain number (the literal-visible cases are rejected statically above).
      const leftAngle = isAngleValue(left);
      const rightAngle = isAngleValue(right);
      if (leftAngle || rightAngle) {
        const unit = leftAngle ? (left as AngleValue).unit : (right as AngleValue).unit;
        switch (expr.operator) {
          case '+':
            return angle(leftNum + rightNum, unit);
          case '-':
            return angle(leftNum - rightNum, unit);
          case '*':
            if (leftAngle !== rightAngle) return angle(leftNum * rightNum, unit);
            break;
          case '/':
            if (leftAngle && !rightAngle) return angle(leftNum / rightNum, unit);
            break;
        }
      }

      switch (expr.operator) {
        case '+':
          return leftNum + rightNum;
        case '-':
          return leftNum - rightNum;
        case '*':
          return leftNum * rightNum;
        case '/':
          return leftNum / rightNum;
        case '%':
          return leftNum % rightNum;
        case '<':
          return boolVal(leftNum < rightNum);
        case '>':
          return boolVal(leftNum > rightNum);
        case '<=':
          return boolVal(leftNum <= rightNum);
        case '>=':
          return boolVal(leftNum >= rightNum);
        case '==':
          return boolVal(leftNum === rightNum);
        case '!=':
          return boolVal(leftNum !== rightNum);
        case '&&':
          return boolVal(leftNum && rightNum);
        case '||':
          return boolVal(leftNum || rightNum);
      }
    }
    // falls through

    case 'UnaryExpression': {
      const arg = evaluateExpression(expr.argument, scope);
      if (arg === null) {
        throw new Error(formatError('Cannot use null in arithmetic expression', getLine(expr)));
      }
      const argNum = toNumber(arg);
      if (argNum === undefined) {
        throw new Error(formatError(`Unary operator ${expr.operator} requires numeric operand`, getLine(expr)));
      }
      switch (expr.operator) {
        case '-':
          if (isAngleValue(arg)) return angle(-arg.radians, arg.unit);
          return -argNum;
        case '!':
          return boolVal(!argNum);
      }
    }
    // falls through

    case 'CalcExpression':
      return evaluateExpression(expr.expression, scope);

    case 'FunctionCall':
      return evaluateFunctionCall(expr, scope);

    case 'MemberExpression':
      return evaluateMemberExpression(expr, scope);

    case 'TemplateLiteral':
      return evaluateTemplateLiteral(expr, scope);

    case 'StyleBlockLiteral':
      return evaluateStyleBlockLiteral(expr, scope);

    case 'PathBlockExpression':
      return evaluatePathBlockExpression(expr, scope);

    case 'TextBlockExpression':
      return evaluateTextBlockExpression(expr, scope);

    case 'LayerConstructorExpression':
      return evaluateLayerConstructor(expr, scope);

    default:
      throw new Error(`Unknown expression type: ${(expr as Expression).type}`);
  }
}

/**
 * Evaluate a LayerConstructorExpression — creates a new layer and returns a LayerReference
 */
function evaluateLayerConstructor(expr: LayerConstructorExpression, scope: Scope): LayerReference {
  if (!scope.evalState) {
    throw new Error(formatError('Layer constructors require evaluation context', getLine(expr)));
  }
  const nameValue = evaluateExpression(expr.name, scope);
  if (typeof nameValue !== 'string') {
    throw new Error(formatError('Layer name must be a string', getLine(expr)));
  }
  try {
    validateCSSIdent(nameValue, 'layer-name');
  } catch (e) {
    throw new Error(formatError((e as Error).message, getLine(expr)));
  }
  if (scope.evalState.layers.has(nameValue)) {
    throw new Error(formatError(`Duplicate layer name: '${nameValue}'`, getLine(expr)));
  }

  let styles: LayerStyle = {};
  if (expr.styleExpr) {
    const styleValue = evaluateExpression(expr.styleExpr, scope);
    if (!isStyleBlock(styleValue)) {
      throw new Error(formatError('Layer style must be a style block', getLine(expr)));
    }
    styles = { ...styleValue.properties };
  }

  let layerState: LayerState;
  if (expr.layerType === 'TextLayer') {
    layerState = {
      name: nameValue,
      layerType: 'TextLayer',
      isDefault: false,
      styles,
      textElements: [],
    };
  } else if (expr.layerType === 'GroupLayer') {
    layerState = {
      name: nameValue,
      layerType: 'GroupLayer',
      isDefault: false as const,
      styles,
      transformState: createTransformState(),
      children: [],
    };
  } else {
    layerState = {
      name: nameValue,
      layerType: 'PathLayer',
      isDefault: false,
      styles,
      pathContext: createPathContext(),
      accum: createPathStore(),
      transformState: createTransformState(),
    };
  }

  scope.evalState.layers.set(nameValue, layerState);
  scope.evalState.layerOrder.push(nameValue);

  return { type: 'LayerReference', layer: layerState };
}

/**
 * Evaluate a PathBlockExpression — captures relative path commands into a PathBlockValue
 */
function evaluatePathBlockExpression(expr: PathBlockExpression, scope: Scope): PathBlockValue {
  // Runtime restriction: no nesting path blocks
  if (scope.evalState && (scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock) {
    throw new Error(formatError('Cannot nest path blocks', getLine(expr)));
  }

  // Create an isolated PathContext at origin (0, 0) with history tracking
  const blockContext = createPathContext({ trackHistory: true });

  // Create a child scope for the block body
  const blockScope = createScope(scope);

  // Create an isolated evaluation state for the block
  const blockEvalState: EvaluationState & { _insidePathBlock: boolean } = {
    pathContext: blockContext,
    logs: scope.evalState?.logs ?? [],
    calledStdlibFunctions: scope.evalState?.calledStdlibFunctions ?? new Set(),
    layers: new Map(), // Empty — layer definitions not allowed
    layerOrder: [],
    activeLayerName: null,
    defaultLayerName: null,
    transformState: createTransformState(),
    masks: scope.evalState?.masks ?? new Map(),
    clipPaths: scope.evalState?.clipPaths ?? new Map(),
    gradients: scope.evalState?.gradients ?? new Map(),
    patterns: scope.evalState?.patterns ?? new Map(),
    markers: scope.evalState?.markers ?? new Map(),
    filters: scope.evalState?.filters ?? new Map(),
    cssProperties: scope.evalState?.cssProperties ?? new Map(),
    _insidePathBlock: true,
  };
  blockScope.evalState = blockEvalState;

  // Set ctx variable for the block's context
  blockScope.variables.set('ctx', {
    type: 'ContextObject' as const,
    value: contextToObject(blockContext),
  });

  // Evaluate body, accumulating path command strings
  const accum = createPathStore();
  for (const stmt of expr.body) {
    // Runtime restrictions
    if (stmt.type === 'LayerDefinition') {
      throw new Error(formatError('Layer definitions are not allowed inside path blocks', getLine(stmt)));
    }
    if (stmt.type === 'LayerApplyBlock') {
      throw new Error(formatError('Layer apply blocks are not allowed inside path blocks', getLine(stmt)));
    }
    if (stmt.type === 'TextStatement') {
      throw new Error(formatError('Text statements are not allowed inside path blocks', getLine(stmt)));
    }
    if (stmt.type === 'ViewBoxDefinition') {
      throw new Error(formatError('ViewBox definitions are not allowed inside path blocks', getLine(stmt)));
    }

    // Evaluate with a wrapper that enforces relative-only commands
    evaluatePathBlockStatement(stmt, blockScope, accum);
  }

  // Build the PathBlockValue from accumulated commands
  const commands: PathBlockCommand[] = blockContext.commands.map((entry) => ({
    command: entry.command.toLowerCase(),
    args: normalizeToRelativeArgs(entry.command, entry.args, entry.start),
    start: { x: entry.start.x, y: entry.start.y },
    end: { x: entry.end.x, y: entry.end.y },
  }));

  // Transfer per-command metadata (labels, recorded corner ops) from the
  // authored records onto the normalized commands. The two lists track the
  // same evaluation 1:1; skip transfer defensively if counts ever diverge.
  const recordCommands = accum.records.flatMap((r) => r.commands);
  if (recordCommands.length === commands.length) {
    for (let i = 0; i < commands.length; i++) {
      if (recordCommands[i].meta !== undefined) commands[i].meta = recordCommands[i].meta;
    }
  } else if (recordCommands.some((c) => c.meta !== undefined)) {
    scope.evalState?.logs.push({
      line: null,
      parts: [
        {
          type: 'string',
          value: `[warn] path block annotation transfer skipped: ${recordCommands.length} recorded vs ${commands.length} tracked commands — labels/corner ops in this block were dropped`,
        },
      ],
    });
  }

  // Apply recorded corner ops at finalization (identity: authored records keep
  // their annotations; the finalized commands carry propagated labels).
  const finalized = applyRecordedCornerOps(commands);
  for (const w of finalized.warnings) {
    scope.evalState?.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
  }

  return {
    type: 'PathBlockValue',
    commands: finalized.commands,
    records: accum.records.filter((r) => r.raw.length > 0),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: blockContext.position.x, y: blockContext.position.y },
  };
}

/**
 * Evaluate a statement inside a path block, enforcing relative-only constraint
 */
function evaluatePathBlockStatement(stmt: Statement, scope: Scope, accum: PathStore): void {
  if (stmt.type === 'PathCommand' && stmt.command !== '') {
    // Enforce relative-only (lowercase) commands
    if (stmt.command !== stmt.command.toLowerCase()) {
      throw new Error(
        formatError(
          `Absolute path command '${stmt.command}' is not allowed inside path blocks. Use lowercase '${stmt.command.toLowerCase()}' for relative commands`,
          getLine(stmt),
        ),
      );
    }
  }
  // Path-block top level is a break/continue boundary (builder-enforced; defensive)
  const flow = evaluateStatementToAccum(stmt, scope, accum);
  if (flow) throw loopFlowBoundaryError(flow);
}

/**
 * Evaluate a TextBlockExpression — captures text elements into a TextBlockValue
 */
function evaluateTextBlockExpression(expr: TextBlockExpression, scope: Scope): TextBlockValue {
  // Runtime restriction: no nesting text blocks
  if (scope.evalState && (scope.evalState as EvaluationState & { _insideTextBlock?: boolean })._insideTextBlock) {
    throw new Error(formatError('Cannot nest text blocks', getLine(expr)));
  }

  // Create a child scope for the block body
  const blockScope = createScope(scope);

  // Create an isolated evaluation state for the block
  const blockEvalState: EvaluationState & { _insideTextBlock: boolean } = {
    pathContext: scope.evalState?.pathContext ?? createPathContext({}),
    logs: scope.evalState?.logs ?? [],
    calledStdlibFunctions: scope.evalState?.calledStdlibFunctions ?? new Set(),
    layers: new Map(), // Empty — layer definitions not allowed
    layerOrder: [],
    activeLayerName: null,
    defaultLayerName: null,
    transformState: createTransformState(),
    masks: scope.evalState?.masks ?? new Map(),
    clipPaths: scope.evalState?.clipPaths ?? new Map(),
    gradients: scope.evalState?.gradients ?? new Map(),
    patterns: scope.evalState?.patterns ?? new Map(),
    markers: scope.evalState?.markers ?? new Map(),
    filters: scope.evalState?.filters ?? new Map(),
    cssProperties: scope.evalState?.cssProperties ?? new Map(),
    _insideTextBlock: true,
  };
  blockScope.evalState = blockEvalState;

  // Accumulate TextBlockElements from text statements
  const elements: TextBlockElement[] = [];
  const blockStyles: Record<string, string> = {};

  // Text-block-expression top level is a break/continue boundary
  // (builder-enforced; defensive)
  const bodyFlow = evaluateTextBlockBody(expr.body, blockScope, elements);
  if (bodyFlow) throw loopFlowBoundaryError(bodyFlow);

  return {
    type: 'TextBlockValue',
    elements,
    styles: blockStyles,
  };
}

/**
 * Recursively evaluate statements inside a text block, accumulating TextBlockElements.
 * Handles text statements directly and recurses into for/if control flow.
 * Returns a LoopFlow signal when a break/continue executes so nested loops
 * inside &{ } bodies consume it — same contract as evaluateTextBody.
 */
function evaluateTextBlockBody(stmts: Statement[], scope: Scope, elements: TextBlockElement[]): LoopFlow {
  for (const stmt of stmts) {
    if (stmt.type === 'BreakStatement') {
      return { flow: 'break', line: getLine(stmt) ?? null };
    }
    if (stmt.type === 'ContinueStatement') {
      return { flow: 'continue', line: getLine(stmt) ?? null };
    }
    if (stmt.type === 'LayerDefinition') {
      throw new Error(formatError('Layer definitions are not allowed inside text blocks', getLine(stmt)));
    }
    if (stmt.type === 'LayerApplyBlock') {
      throw new Error(formatError('Layer apply blocks are not allowed inside text blocks', getLine(stmt)));
    }
    if (stmt.type === 'PathCommand') {
      throw new Error(formatError('Path commands are not allowed inside text blocks', getLine(stmt)));
    }
    if (stmt.type === 'ViewBoxDefinition') {
      throw new Error(formatError('ViewBox definitions are not allowed inside text blocks', getLine(stmt)));
    }

    if (stmt.type === 'TextStatement') {
      const x = requireNumber(evaluateExpression(stmt.x, scope), 'text() x');
      const y = requireNumber(evaluateExpression(stmt.y, scope), 'text() y');
      const rotation = stmt.rotation
        ? requireNumber(evaluateExpression(stmt.rotation, scope), 'text() rotation')
        : undefined;
      let textStyles: Record<string, string> | undefined;
      if (stmt.styles) {
        const sv = evaluateExpression(stmt.styles, scope);
        if (!isStyleBlock(sv)) throw new Error(formatError('text() styles must be a style block', getLine(stmt)));
        textStyles = sv.properties;
      }
      if (stmt.content) {
        const text = evaluateTemplateLiteral(stmt.content, scope);
        elements.push({ x, y, rotation, styles: textStyles, children: [{ type: 'run', text }] });
      } else if (stmt.body) {
        const children: TextChild[] = [];
        // Nested text-statement body top level is a boundary (defensive)
        const nestedFlow = evaluateTextBody(stmt.body, scope, children);
        if (nestedFlow) throw loopFlowBoundaryError(nestedFlow);
        elements.push({ x, y, rotation, styles: textStyles, children });
      }
      continue;
    }

    if (stmt.type === 'ForLoop') {
      const start = requireNumber(evaluateExpression(stmt.start, scope), 'for loop start');
      const end = requireNumber(evaluateExpression(stmt.end, scope), 'for loop end');
      if (!isFinite(start) || !isFinite(end)) throw new Error('for loop bounds must be finite');
      const count = Math.abs(end - start) + 1;
      if (count > 10000) throw new Error('for loop exceeds 10000 iteration limit');
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
        const loopScope = createScope(scope);
        loopScope.evalState = scope.evalState;
        setVariable(loopScope, stmt.variable, i);
        const flow = evaluateTextBlockBody(stmt.body, loopScope, elements);
        if (flow?.flow === 'break') break;
      }
      continue;
    }

    if (stmt.type === 'ForEachLoop') {
      const iterVal = evaluateExpression(stmt.iterable, scope);
      if (!isArrayValue(iterVal)) throw new Error('for-each requires an array');
      lockArray(iterVal);
      try {
        for (let idx = 0; idx < iterVal.elements.length; idx++) {
          const loopScope = createScope(scope);
          loopScope.evalState = scope.evalState;
          setVariable(loopScope, stmt.variable, iterVal.elements[idx]);
          if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, idx);
          const flow = evaluateTextBlockBody(stmt.body, loopScope, elements);
          if (flow?.flow === 'break') break;
        }
      } finally {
        unlockArray(iterVal);
      }
      continue;
    }

    if (stmt.type === 'IfStatement') {
      const cond = evaluateExpression(stmt.condition, scope);
      const truthValue = typeof cond === 'number' ? cond !== 0 : (isBooleanValue(cond) ? cond.value !== 0 : cond !== null);
      // Propagate loop flow out of the taken branch to the enclosing loop
      if (truthValue) {
        const flow = evaluateTextBlockBody(stmt.consequent, scope, elements);
        if (flow) return flow;
      } else if (stmt.alternate) {
        const flow = evaluateTextBlockBody(stmt.alternate, scope, elements);
        if (flow) return flow;
      }
      continue;
    }

    if (stmt.type === 'LetDeclaration') {
      const value = evaluateExpression(stmt.value, scope);
      if (stmt.pattern) {
        bindDestructuringPattern(stmt.pattern, value, scope, getLine(stmt));
      } else {
        setVariable(scope, stmt.name, value);
      }
      continue;
    }

    if (stmt.type === 'AssignmentStatement') {
      const value = evaluateExpression(stmt.value, scope);
      setVariable(scope, stmt.name, value);
      continue;
    }

    if (stmt.type === 'ExpressionStatement') {
      evaluateExpression(stmt.expression, scope);
      continue;
    }

    // Other statement types silently skipped (e.g., EnumDefinition, FunctionDefinition)
    if (stmt.type === 'FunctionDefinition') {
      setVariable(scope, stmt.name, { type: 'UserFunction' as const, params: stmt.params, body: stmt.body });
      continue;
    }
  }
  return undefined;
}

function evaluateIndexExpression(expr: IndexExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);
  const index = evaluateExpression(expr.index, scope);
  const line = getLine(expr);
  const col = getCol(expr);
  const iError = (message: string): Error => new Error(formatError(message, line, col));

  if (isObjectValue(obj)) {
    if (typeof index !== 'string') {
      throw iError('Object key must be a string');
    }
    return obj.properties.get(index) ?? null;
  }

  if (typeof obj === 'string') {
    if (typeof index !== 'number') {
      throw iError('String index must be a number');
    }
    if (!Number.isInteger(index) || index < 0 || index >= obj.length) {
      throw iError(`String index ${index} out of bounds (length ${obj.length})`);
    }
    return obj[index];
  }

  if (!isArrayValue(obj)) {
    throw iError('Index access requires an array, object, or string');
  }
  if (typeof index !== 'number') {
    throw iError('Array index must be a number');
  }
  if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length) {
    throw iError(`Array index ${index} out of bounds (length ${obj.elements.length})`);
  }
  return obj.elements[index];
}

function evaluateMethodCall(expr: MethodCallExpression, scope: Scope, workerExpr?: Expression): Value {
  const obj = evaluateExpression(expr.object, scope);
  const mLine = getLine(expr);
  const mCol = getCol(expr);
  function mError(message: string): Error {
    return new Error(formatError(message, mLine, mCol));
  }

  // TransformReference methods (ctx.transform.reset())
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformReference') {
    const transformRef = obj;
    if (expr.method === 'reset') {
      if (expr.args.length !== 0) throw mError('transform.reset() expects 0 arguments');
      transformRef.state.translate = null;
      transformRef.state.rotate = null;
      transformRef.state.scale = null;
      return 0;
    }
    throw mError(`Unknown transform method: ${expr.method}`);
  }

  // TransformPropertyReference methods (ctx.transform.translate.set(), .reset())
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformPropertyReference') {
    const propRef = obj;

    if (expr.method === 'reset') {
      if (expr.args.length !== 0) throw mError(`transform.${propRef.property}.reset() expects 0 arguments`);
      propRef.state[propRef.property] = null;
      return 0;
    }

    if (expr.method === 'set') {
      const args = expr.args.map((a) => {
        const v = toNumber(evaluateExpression(a, scope));
        if (v === undefined) throw mError(`transform.${propRef.property}.set() arguments must be numbers`);
        return v;
      });

      switch (propRef.property) {
        case 'translate':
          if (args.length !== 2) throw mError('translate.set() expects 2 arguments (x, y)');
          propRef.state.translate = { x: args[0], y: args[1] };
          return 0;
        case 'rotate':
          if (args.length === 1) {
            propRef.state.rotate = { angle: args[0] };
          } else if (args.length === 3) {
            propRef.state.rotate = { angle: args[0], cx: args[1], cy: args[2] };
          } else {
            throw mError('rotate.set() expects 1 or 3 arguments (angle) or (angle, cx, cy)');
          }
          return 0;
        case 'scale':
          if (args.length === 2) {
            propRef.state.scale = { x: args[0], y: args[1] };
          } else if (args.length === 4) {
            propRef.state.scale = { x: args[0], y: args[1], cx: args[2], cy: args[3] };
          } else {
            throw mError('scale.set() expects 2 or 4 arguments (sx, sy) or (sx, sy, cx, cy)');
          }
          return 0;
      }
    }

    throw mError(`Unknown transform.${propRef.property} method: ${expr.method}`);
  }

  // LayerReference methods: .append() for GroupLayer
  if (isLayerReference(obj)) {
    if (
      expr.method === 'segment' || expr.method === 'segmentAll' ||
      expr.method === 'point' || expr.method === 'pointAll' ||
      expr.method === 'vertex' || expr.method === 'vertexAll'
    ) {
      if (obj.layer.layerType !== 'PathLayer') {
        throw mError(`.${expr.method}() is only available on PathLayer references`);
      }
      if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
      const qName = evaluateExpression(expr.args[0], scope);
      if (typeof qName !== 'string') throw mError(`${expr.method}() name must be a string`);
      const layerState = obj.layer as PathLayerState;
      const authoredFlat = layerState.accum.records.flatMap((r) => r.commands);
      // Snapshot the finalized geometry on demand (non-destructive; the layer's
      // authored records keep their annotations for emit-time finalization).
      const fin = applyRecordedCornerOps(authoredFlat);
      const cmds = fin.commands;

      if (expr.method === 'segment' || expr.method === 'segmentAll') {
        const buildLayerSegment = (run: PathBlockCommand[]): ProjectedPathValue => {
          const copies = run.map((c) => ({
            command: c.command,
            args: [...c.args],
            start: { ...c.start },
            end: { ...c.end },
            ...(c.meta !== undefined ? { meta: c.meta } : {}),
          }));
          return {
            type: 'ProjectedPathValue' as const,
            commands: copies,
            startPoint: { ...copies[0].start },
            endPoint: { ...copies[copies.length - 1].end },
          };
        };
        const runs = findLabeledRuns(cmds, qName);
        if (expr.method === 'segmentAll') {
          return { type: 'ArrayValue' as const, elements: runs.map(buildLayerSegment) };
        }
        if (runs.length === 0) throw mError(queryLabelError('segment', qName, cmds));
        return buildLayerSegment(runs[0]);
      }
      if (expr.method === 'point' || expr.method === 'pointAll') {
        const matches = findEndpointCommands(authoredFlat, qName);
        if (expr.method === 'pointAll') {
          return {
            type: 'ArrayValue' as const,
            elements: matches.map((c) => ({ type: 'PointValue' as const, x: c.end.x, y: c.end.y })),
          };
        }
        if (matches.length === 0) throw mError(queryLabelError('endpoint', qName, authoredFlat));
        return { type: 'PointValue' as const, x: matches[0].end.x, y: matches[0].end.y };
      }
      const targets = findEndpointCommands(cmds, qName);
      // Same pairing guard as the PathBlock site: never zip diverging lists.
      const authoredMatches = findEndpointCommands(authoredFlat, qName);
      const paired = authoredMatches.length === targets.length ? authoredMatches : null;
      const buildLayerHandle = (target: PathBlockCommand, i: number): VertexHandleValue => ({
        type: 'VertexHandleValue' as const,
        sourceKind: 'layer' as const,
        source: obj,
        label: qName,
        point: { x: (paired ? paired[i] : target).end.x, y: (paired ? paired[i] : target).end.y },
        cornerIndex: locateCornerPos(cmds, target),
      });
      if (expr.method === 'vertexAll') {
        return { type: 'ArrayValue' as const, elements: targets.map(buildLayerHandle) };
      }
      if (targets.length === 0) throw mError(queryLabelError('endpoint', qName, cmds));
      return buildLayerHandle(targets[0], 0);
    }
    if (expr.method === 'append') {
      if (obj.layer.layerType !== 'GroupLayer') {
        throw mError(`.append() is only available on GroupLayer references`);
      }
      if (expr.args.length === 0) {
        throw mError('.append() requires at least 1 argument');
      }
      const groupLayer = obj.layer;
      if (!scope.evalState) throw mError('.append() requires evaluation context');

      for (const arg of expr.args) {
        const childValue = evaluateExpression(arg, scope);
        if (!isLayerReference(childValue)) {
          throw mError('.append() arguments must be layer references');
        }
        const childName = childValue.layer.name;

        // Self-reference check
        if (childName === groupLayer.name) {
          throw mError(`Cannot append group '${childName}' to itself`);
        }

        // Already a child of this group — no-op
        if (groupLayer.children.includes(childName)) {
          continue;
        }

        // Circular reference check for nested groups
        if (childValue.layer.layerType === 'GroupLayer') {
          const childGroup = childValue.layer;
          const checkCircular = (g: GroupLayerState, depth: number): void => {
            if (depth > 10) throw mError('GroupLayer nesting exceeds maximum depth of 10');
            for (const cn of g.children) {
              if (cn === groupLayer.name) {
                throw mError(
                  `Circular reference: appending '${childName}' to '${groupLayer.name}' would create a cycle`,
                );
              }
              const childLayer = scope.evalState!.layers.get(cn);
              if (childLayer?.layerType === 'GroupLayer') {
                checkCircular(childLayer, depth + 1);
              }
            }
          };
          checkCircular(childGroup, 1);
        }

        // Check nesting depth after append
        const getDepth = (name: string): number => {
          const l = scope.evalState!.layers.get(name);
          if (l?.layerType !== 'GroupLayer') return 0;
          const g = l;
          if (g.children.length === 0) return 0;
          return 1 + Math.max(...g.children.map((c) => getDepth(c)));
        };
        const parentDepth = ((): number => {
          // Walk up from groupLayer to find how deep it is nested
          const findParentDepth = (targetName: string): number => {
            for (const [, layer] of scope.evalState!.layers) {
              if (layer.layerType === 'GroupLayer') {
                const g = layer;
                if (g.children.includes(targetName)) {
                  return 1 + findParentDepth(g.name);
                }
              }
            }
            return 0;
          };
          return findParentDepth(groupLayer.name);
        })();
        const childDepth = getDepth(childName);
        if (parentDepth + 1 + childDepth + 1 > 10) {
          throw mError('GroupLayer nesting exceeds maximum depth of 10');
        }

        // If child is in another group, move it (remove from old group, log warning)
        for (const [, layer] of scope.evalState.layers) {
          if (layer.layerType === 'GroupLayer' && layer !== groupLayer) {
            const otherGroup = layer;
            const idx = otherGroup.children.indexOf(childName);
            if (idx !== -1) {
              otherGroup.children.splice(idx, 1);
              scope.evalState.logs.push({
                line: null,
                parts: [
                  {
                    type: 'string',
                    value: `Layer '${childName}' was moved from group '${otherGroup.name}' to group '${groupLayer.name}'`,
                  },
                ],
              });
            }
          }
        }

        groupLayer.children.push(childName);
        // Remove from top-level layer order (children aren't rendered at top level)
        const orderIdx = scope.evalState.layerOrder.indexOf(childName);
        if (orderIdx !== -1) {
          scope.evalState.layerOrder.splice(orderIdx, 1);
        }
      }
      return 0;
    }
    throw mError(`Unknown method '${expr.method}' on layer reference`);
  }

  // PathBlockValue methods: draw(), project()
  if (isPathBlockValue(obj)) {
    // Check if we're inside a path block — draw/project not allowed there
    if (scope.evalState && (scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock) {
      throw mError(`Cannot call .${expr.method}() inside a path block`);
    }

    switch (expr.method) {
      case 'draw': {
        if (expr.args.length !== 0) throw mError('draw() expects 0 arguments');
        if (!scope.evalState) throw mError('draw() requires evaluation context');

        // Get the current cursor position as the draw origin
        const activeCtx = scope.evalState.pathContext;
        const originX = activeCtx.position.x;
        const originY = activeCtx.position.y;

        // Emit relative commands from structured command data (not raw pathStrings).
        // Relative commands naturally work from the cursor position, so no projection
        // is needed for the emitted path. We reconstruct from structured commands
        // because stdlib functions like circle() store absolute coordinates in their
        // PathSegment strings, but the structured commands are already relative.
        // Serialize AND track in one walk — no serialize→reparse round-trip.
        const { d: emittedPath, tracked: emittedCommands } = serializeRelativeAndTrack(
          obj.commands,
          scope.evalState.pathContext,
          { bridgeOriginGap: true },
        );
        updateCtxVariable(scope);

        // Build the ProjectedPathValue with absolute coordinates for programmatic use
        const projectedCommands = projectCommands(obj.commands, originX, originY);
        const projected: ProjectedPathValue = {
          type: 'ProjectedPathValue',
          commands: projectedCommands,
          startPoint: { x: obj.startPoint.x + originX, y: obj.startPoint.y + originY },
          endPoint: { x: obj.endPoint.x + originX, y: obj.endPoint.y + originY },
        };

        // Return as PathWithResult — emits relative path AND returns ProjectedPath
        return {
          type: 'PathWithResult' as const,
          path: emittedPath,
          result: projected,
          commands: emittedCommands,
        };
      }

      case 'drawTo': {
        if (expr.args.length !== 2) throw mError('drawTo() expects 2 arguments (x, y)');
        if (!scope.evalState) throw mError('drawTo() requires evaluation context');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');

        // Emit M x y followed by relative commands, tracking in the same walk.
        const { d: emittedPath, tracked: emittedCommands } = serializeRelativeAndTrack(
          obj.commands,
          scope.evalState.pathContext,
          { bridgeOriginGap: true, moveTo: { x: dtX, y: dtY } },
        );
        updateCtxVariable(scope);

        // Build ProjectedPathValue with absolute coordinates
        const projectedCommands = projectCommands(obj.commands, dtX, dtY);
        const projected: ProjectedPathValue = {
          type: 'ProjectedPathValue',
          commands: projectedCommands,
          startPoint: { x: obj.startPoint.x + dtX, y: obj.startPoint.y + dtY },
          endPoint: { x: obj.endPoint.x + dtX, y: obj.endPoint.y + dtY },
        };

        return {
          type: 'PathWithResult' as const,
          path: emittedPath,
          result: projected,
          commands: emittedCommands,
        };
      }

      case 'project': {
        if (expr.args.length !== 2) throw mError('project() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number') throw mError('project() x must be a number');
        if (typeof y !== 'number') throw mError('project() y must be a number');

        return {
          type: 'ProjectedPathValue' as const,
          commands: projectCommands(obj.commands, x, y),
          startPoint: { x: obj.startPoint.x + x, y: obj.startPoint.y + y },
          endPoint: { x: obj.endPoint.x + x, y: obj.endPoint.y + y },
        };
      }

      case 'get': {
        if (expr.args.length !== 1) throw mError('get() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('get() argument must be a number');
        if (t < 0 || t > 1) throw mError(`get() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return { type: 'PointValue' as const, x: result.point.x, y: result.point.y };
      }

      case 'tangent': {
        if (expr.args.length !== 1) throw mError('tangent() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('tangent() argument must be a number');
        if (t < 0 || t > 1) throw mError(`tangent() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'PointValue' as const, x: result.point.x, y: result.point.y }],
            ['angle', result.tangent],
          ]),
        };
      }

      case 'normal': {
        if (expr.args.length !== 1) throw mError('normal() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('normal() argument must be a number');
        if (t < 0 || t > 1) throw mError(`normal() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'PointValue' as const, x: result.point.x, y: result.point.y }],
            ['angle', result.tangent - Math.PI / 2],
          ]),
        };
      }

      case 'partition': {
        if (expr.args.length !== 1) throw mError('partition() expects 1 argument (n)');
        const n = evaluateExpression(expr.args[0], scope);
        if (typeof n !== 'number') throw mError('partition() argument must be a number');
        if (!Number.isInteger(n) || n < 1) throw mError('partition() argument must be a positive integer');
        const points = partitionPath(obj.commands, n);
        return {
          type: 'ArrayValue' as const,
          elements: points.map((p, i) => ({
            type: 'ObjectValue' as const,
            properties: new Map<string, Value>([
              ['point', { type: 'PointValue' as const, x: p.point.x, y: p.point.y }],
              ['angle', p.tangent],
              ['t', i / n],
            ]),
          })),
        };
      }

      case 'segment':
      case 'segmentAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const segName = evaluateExpression(expr.args[0], scope);
        if (typeof segName !== 'string') throw mError(`${expr.method}() name must be a string`);
        const buildSubBlock = (run: PathBlockCommand[]): PathBlockValue => {
          const runStart = run[0].start;
          const rebased = run.map((c) => ({
            command: c.command,
            args: [...c.args],
            start: { x: c.start.x - runStart.x, y: c.start.y - runStart.y },
            end: { x: c.end.x - runStart.x, y: c.end.y - runStart.y },
            ...(c.meta !== undefined ? { meta: c.meta } : {}),
          }));
          return {
            type: 'PathBlockValue' as const,
            commands: rebased,
            records: recordsFromCommands(rebased),
            startPoint: { x: 0, y: 0 },
            endPoint: { x: rebased[rebased.length - 1].end.x, y: rebased[rebased.length - 1].end.y },
          };
        };
        const runs = findLabeledRuns(obj.commands, segName);
        if (expr.method === 'segmentAll') {
          return { type: 'ArrayValue' as const, elements: runs.map(buildSubBlock) };
        }
        if (runs.length === 0) throw mError(queryLabelError('segment', segName, obj.commands));
        return buildSubBlock(runs[0]);
      }

      case 'point':
      case 'pointAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const ptName = evaluateExpression(expr.args[0], scope);
        if (typeof ptName !== 'string') throw mError(`${expr.method}() name must be a string`);
        // Prefer the authored store: endpoint labels name the sharp corner the
        // user wrote, even if a corner op later trimmed it.
        const authoredFlat = obj.records.flatMap((r) => r.commands);
        const matches = findEndpointCommands(authoredFlat, ptName);
        const source = matches.length > 0 ? matches : findEndpointCommands(obj.commands, ptName);
        if (expr.method === 'pointAll') {
          return {
            type: 'ArrayValue' as const,
            elements: source.map((c) => ({ type: 'PointValue' as const, x: c.end.x, y: c.end.y })),
          };
        }
        if (source.length === 0) throw mError(queryLabelError('endpoint', ptName, obj.commands));
        return { type: 'PointValue' as const, x: source[0].end.x, y: source[0].end.y };
      }

      case 'vertex':
      case 'vertexAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const vName = evaluateExpression(expr.args[0], scope);
        if (typeof vName !== 'string') throw mError(`${expr.method}() name must be a string`);
        const targets = findEndpointCommands(obj.commands, vName);
        // Pair authored positions with finalized targets only when the counts
        // agree — a positional zip across diverging lists would silently hand
        // back the wrong vertex. On mismatch, fall back to finalized geometry
        // for every handle (correct commands, post-trim positions).
        const authoredMatches = findEndpointCommands(obj.records.flatMap((r) => r.commands), vName);
        const paired = authoredMatches.length === targets.length ? authoredMatches : null;
        const buildHandle = (target: PathBlockCommand, i: number): VertexHandleValue => {
          const authoredCmd = paired ? paired[i] : target;
          return {
            type: 'VertexHandleValue' as const,
            sourceKind: 'pathblock' as const,
            source: obj,
            label: vName,
            point: { x: authoredCmd.end.x, y: authoredCmd.end.y },
            cornerIndex: locateCornerPos(obj.commands, target),
          };
        };
        if (expr.method === 'vertexAll') {
          return { type: 'ArrayValue' as const, elements: targets.map(buildHandle) };
        }
        if (targets.length === 0) throw mError(queryLabelError('endpoint', vName, obj.commands));
        return buildHandle(targets[0], 0);
      }

      case 'reverse': {
        if (expr.args.length !== 0) throw mError('reverse() expects 0 arguments');
        const reversed = reverseCommands(obj.commands);
        return buildPathBlockFromCommands(reversed);
      }

      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = computeBoundingBox(obj.commands);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['x', bb.x],
            ['y', bb.y],
            ['width', bb.width],
            ['height', bb.height],
          ]),
        };
      }

      case 'offset': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('offset() expects 1-2 arguments (distance, options?)');
        const dist = evaluateExpression(expr.args[0], scope);
        if (typeof dist !== 'number') throw mError('offset() argument must be a number');
        const offsetOpts = expr.args.length === 2 ? parseOffsetJoinOptions(evaluateExpression(expr.args[1], scope), mError) : {};
        const offsetResult = offsetCommands(obj.commands, dist, offsetOpts);
        return buildPathBlockFromCommands(offsetResult);
      }

      case 'variableOffset': {
        const cb = resolveCallbackBlock(expr, scope, workerExpr);
        if (!cb)
          throw mError('variableOffset() requires a block or a << worker, e.g. variableOffset() {|go, pb| go.stop(50%, 10, CurveContinuity.G1); } or variableOffset() << f');
        if (cb.extraArgs !== 0)
          throw mError('variableOffset() takes no arguments besides the callback — use variableOffset() {|go, pb| ... } or variableOffset() << f');
        const builder: VariableOffsetBuilderValue = {
          type: 'VariableOffsetBuilderValue',
          compound: false,
          stops: [],
        };
        const blockScope = createScope(cb.closure ?? scope);
        const params = cb.params;
        if (params.length > 0) setVariable(blockScope, params[0], builder);
        // pb = the spine PathBlockValue itself (exposes get/tangent/normal/length/vertices).
        if (params.length > 1) setVariable(blockScope, params[1], obj);
        evaluateStatementsToAccum(cb.body, blockScope, createPathStore());
        if (builder.stops.length < 2)
          throw mError('variableOffset() needs at least 2 stops to trace a path (each go.stop() places one point)');

        const simpleStops: SimpleStop[] = builder.stops.map((s) => ({
          time: s.time,
          offset: s.offset1,
          continuity: continuityFromValue(s.continuity1),
        }));
        // PolarVectorValue ({angle, distance}) is structurally a PolarOverride.
        const { commands: voCmds, anchor: voAnchor } = buildSimpleVariableOffset(
          obj.commands,
          simpleStops,
          builder.startTangent,
          builder.endTangent,
        );
        if (voCmds.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const voLast = voCmds[voCmds.length - 1];
        const voBlock = {
          type: 'PathBlockValue' as const,
          commands: voCmds,
          records: recordsFromCommands(voCmds),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: voLast.end.x, y: voLast.end.y },
        };
        // The translation normalizeToOrigin subtracted, in spine coordinates.
        (voBlock as PathBlockValue & { anchor: { x: number; y: number } }).anchor = voAnchor;
        return voBlock;
      }

      case 'compoundVariableOffset': {
        const cb = resolveCallbackBlock(expr, scope, workerExpr);
        if (!cb)
          throw mError('compoundVariableOffset() requires a block or a << worker, e.g. compoundVariableOffset() {|go, pb| go.stop(50%, 10, CurveContinuity.G1, -10, CurveContinuity.G1); } or compoundVariableOffset() << f');
        if (cb.extraArgs !== 0)
          throw mError('compoundVariableOffset() takes no arguments besides the callback — use compoundVariableOffset() {|go, pb| ... } or compoundVariableOffset() << f');
        const builder: VariableOffsetBuilderValue = {
          type: 'VariableOffsetBuilderValue',
          compound: true,
          stops: [],
        };
        const blockScope = createScope(cb.closure ?? scope);
        const params = cb.params;
        if (params.length > 0) setVariable(blockScope, params[0], builder);
        if (params.length > 1) setVariable(blockScope, params[1], obj);
        evaluateStatementsToAccum(cb.body, blockScope, createPathStore());
        if (builder.stops.length < 2)
          throw mError('compoundVariableOffset() needs at least 2 stops to trace a ribbon (each go.stop() places one cross-section)');

        const compStops: CompoundStop[] = builder.stops.map((s) => ({
          time: s.time,
          offset1: s.offset1,
          continuity1: continuityFromValue(s.continuity1),
          offset2: s.offset2 ?? 0,
          continuity2: continuityFromValue(s.continuity2 ?? s.continuity1),
        }));
        const capToSpec = (c: CapValue | undefined): CapSpec | undefined =>
          c
            ? {
                cap: c.cap,
                projection: c.projection,
                length: c.length,
                continuity: c.continuity ? continuityFromValue(c.continuity) : undefined,
              }
            : undefined;
        // No tangent overrides here: go.startTangent/endTangent throw in compound
        // mode (ribbon ends are shaped by caps), so the builder fields are never set.
        const { commands: cvCmds, anchor: cvAnchor } = buildCompoundVariableOffset(obj.commands, compStops, {
          startCap: capToSpec(builder.startCap),
          endCap: capToSpec(builder.endCap),
        });
        if (cvCmds.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const cvLast = cvCmds[cvCmds.length - 1];
        const cvBlock = {
          type: 'PathBlockValue' as const,
          commands: cvCmds,
          records: recordsFromCommands(cvCmds),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: cvLast.end.x, y: cvLast.end.y },
        };
        // The translation normalizeToOrigin subtracted, in spine coordinates.
        (cvBlock as PathBlockValue & { anchor: { x: number; y: number } }).anchor = cvAnchor;
        return cvBlock;
      }

      case 'mirror': {
        if (expr.args.length !== 1) throw mError('mirror() expects 1 argument (angle)');
        const mAngle = toNumber(evaluateExpression(expr.args[0], scope));
        if (mAngle === undefined) throw mError('mirror() argument must be a number');
        const mirrored = mirrorCommands(obj.commands, mAngle, { x: 0, y: 0 });
        return buildPathBlockFromCommands(mirrored);
      }

      case 'rotate': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('rotate() expects 1-2 arguments (angle) or (angle, origin)');
        const rotAngle = toNumber(evaluateExpression(expr.args[0], scope));
        if (rotAngle === undefined) throw mError('rotate() angle must be a number');
        let rotPivot = { x: 0, y: 0 };
        if (expr.args.length === 2) {
          const rotOrigin = evaluateExpression(expr.args[1], scope);
          if (!isPointValue(rotOrigin)) throw mError('rotate() origin must be a Point');
          rotPivot = { x: rotOrigin.x, y: rotOrigin.y };
        }
        // Frame-preserving: rotate about the pivot in block-local coordinates
        // and keep the geometry where it lands (no re-base) — a cut piece
        // rotated in place keeps its placement inside the subject.
        const rotCmds = rotateAboutPointCommands(obj.commands, rotAngle, rotPivot);
        return buildPathBlockFromCommands(rotCmds, { x: 0, y: 0 });
      }

      case 'rotateAtVertexIndex': {
        if (expr.args.length !== 2) throw mError('rotateAtVertexIndex() expects 2 arguments (index, angle)');
        const rIdx = evaluateExpression(expr.args[0], scope);
        const rAngle = toNumber(evaluateExpression(expr.args[1], scope));
        if (typeof rIdx !== 'number') throw mError('rotateAtVertexIndex() index must be a number');
        if (rAngle === undefined) throw mError('rotateAtVertexIndex() angle must be a number');
        if (!Number.isInteger(rIdx)) throw mError('rotateAtVertexIndex() index must be an integer');
        const rotated = rotateAtVertexCommands(obj.commands, rIdx, rAngle);
        return buildPathBlockFromCommands(rotated);
      }

      case 'scale': {
        if (expr.args.length !== 2) throw mError('scale() expects 2 arguments (sx, sy)');
        const sSx = evaluateExpression(expr.args[0], scope);
        const sSy = evaluateExpression(expr.args[1], scope);
        if (typeof sSx !== 'number') throw mError('scale() sx must be a number');
        if (typeof sSy !== 'number') throw mError('scale() sy must be a number');
        const scaled = scaleCommands(obj.commands, sSx, sSy, { x: 0, y: 0 });
        if (scaled.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const sLast = scaled[scaled.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: scaled,
          records: recordsFromCommands(scaled),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: sLast.end.x, y: sLast.end.y },
        };
      }

      case 'subPath': {
        if (expr.args.length !== 2) throw mError('subPath() expects 2 arguments (startT, endT)');
        const spStart = evaluateExpression(expr.args[0], scope);
        const spEnd = evaluateExpression(expr.args[1], scope);
        if (typeof spStart !== 'number') throw mError('subPath() startT must be a number');
        if (typeof spEnd !== 'number') throw mError('subPath() endT must be a number');
        if (spStart < 0 || spStart > 1) throw mError('subPath() startT must be between 0 and 1');
        if (spEnd < 0 || spEnd > 1) throw mError('subPath() endT must be between 0 and 1');
        const subResult = subPathCommands(obj.commands, spStart, spEnd);
        return buildPathBlockFromCommands(subResult);
      }

      case 'chamfer': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('chamfer() expects 1-2 arguments (distance) or (d1, d2)');
        const cd1 = evaluateExpression(expr.args[0], scope);
        if (typeof cd1 !== 'number') throw mError('chamfer() distance must be a number');
        let cd2 = cd1;
        if (expr.args.length === 2) {
          cd2 = evaluateExpression(expr.args[1], scope) as number;
          if (typeof cd2 !== 'number') throw mError('chamfer() d2 must be a number');
        }
        const chamResult = chamferCommands(obj.commands, cd1, cd2, null);
        for (const w of chamResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(chamResult.commands, { x: 0, y: 0 });
      }

      case 'chamferAtVertex': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('chamferAtVertex() expects 2-3 arguments (index, distance) or (index, d1, d2)');
        const cvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof cvIdx !== 'number' || !Number.isInteger(cvIdx)) throw mError('chamferAtVertex() index must be an integer');
        const cvD1 = evaluateExpression(expr.args[1], scope);
        if (typeof cvD1 !== 'number') throw mError('chamferAtVertex() distance must be a number');
        let cvD2 = cvD1;
        if (expr.args.length === 3) {
          cvD2 = evaluateExpression(expr.args[2], scope) as number;
          if (typeof cvD2 !== 'number') throw mError('chamferAtVertex() d2 must be a number');
        }
        const cvResult = chamferCommands(obj.commands, cvD1, cvD2, [cvIdx]);
        for (const w of cvResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(cvResult.commands, { x: 0, y: 0 });
      }

      case 'fillet': {
        if (expr.args.length !== 1) throw mError('fillet() expects 1 argument (radius)');
        const fRadius = evaluateExpression(expr.args[0], scope);
        if (typeof fRadius !== 'number') throw mError('fillet() radius must be a number');
        const fResult = filletCommands(obj.commands, fRadius, null);
        for (const w of fResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(fResult.commands, { x: 0, y: 0 });
      }

      case 'filletAtVertex': {
        if (expr.args.length !== 2) throw mError('filletAtVertex() expects 2 arguments (index, radius)');
        const fvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof fvIdx !== 'number' || !Number.isInteger(fvIdx)) throw mError('filletAtVertex() index must be an integer');
        const fvRadius = evaluateExpression(expr.args[1], scope);
        if (typeof fvRadius !== 'number') throw mError('filletAtVertex() radius must be a number');
        const fvResult = filletCommands(obj.commands, fvRadius, [fvIdx]);
        for (const w of fvResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(fvResult.commands, { x: 0, y: 0 });
      }

      case 'ellipticalFillet': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('ellipticalFillet() expects 2-3 arguments (rx, ry) or (rx, ry, rotation)');
        const efRx = evaluateExpression(expr.args[0], scope);
        const efRy = evaluateExpression(expr.args[1], scope);
        if (typeof efRx !== 'number') throw mError('ellipticalFillet() rx must be a number');
        if (typeof efRy !== 'number') throw mError('ellipticalFillet() ry must be a number');
        let efRot = 0;
        if (expr.args.length === 3) {
          efRot = toNumber(evaluateExpression(expr.args[2], scope)) as number;
          if (typeof efRot !== 'number') throw mError('ellipticalFillet() rotation must be a number');
        }
        const efResult = ellipticalFilletCommands(obj.commands, efRx, efRy, efRot, null);
        for (const w of efResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(efResult.commands, { x: 0, y: 0 });
      }

      case 'ellipticalFilletAtVertex': {
        if (expr.args.length < 3 || expr.args.length > 4) throw mError('ellipticalFilletAtVertex() expects 3-4 arguments (index, rx, ry) or (index, rx, ry, rotation)');
        const efvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof efvIdx !== 'number' || !Number.isInteger(efvIdx)) throw mError('ellipticalFilletAtVertex() index must be an integer');
        const efvRx = evaluateExpression(expr.args[1], scope);
        const efvRy = evaluateExpression(expr.args[2], scope);
        if (typeof efvRx !== 'number') throw mError('ellipticalFilletAtVertex() rx must be a number');
        if (typeof efvRy !== 'number') throw mError('ellipticalFilletAtVertex() ry must be a number');
        let efvRot = 0;
        if (expr.args.length === 4) {
          efvRot = toNumber(evaluateExpression(expr.args[3], scope)) as number;
          if (typeof efvRot !== 'number') throw mError('ellipticalFilletAtVertex() rotation must be a number');
        }
        const efvResult = ellipticalFilletCommands(obj.commands, efvRx, efvRy, efvRot, [efvIdx]);
        for (const w of efvResult.warnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return buildPathBlockFromCommands(efvResult.commands, { x: 0, y: 0 });
      }

      case 'union':
      case 'difference':
      case 'intersection':
      case 'xor': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (other path)`);
        const otherVal = evaluateExpression(expr.args[0], scope);
        let otherCmds: PathBlockCommand[];
        if (isPathBlockValue(otherVal)) {
          otherCmds = otherVal.commands;
        } else if (isProjectedPathValue(otherVal)) {
          otherCmds = otherVal.commands;
        } else {
          throw mError(`${expr.method}() argument must be a PathBlock or ProjectedPath`);
        }
        // Project PathBlockValue commands to absolute (origin 0,0)
        const aCmds = obj.commands;
        const bCmds = otherCmds;
        let resultCmds: PathBlockCommand[];
        switch (expr.method) {
          case 'union': resultCmds = pathUnion(aCmds, bCmds); break;
          case 'difference': resultCmds = pathDifference(aCmds, bCmds); break;
          case 'intersection': resultCmds = pathIntersection(aCmds, bCmds); break;
          case 'xor': resultCmds = pathXor(aCmds, bCmds); break;
          default: resultCmds = [];
        }
        return buildPathBlockFromCommands(resultCmds, { x: 0, y: 0 });
      }

      case 'cut': {
        if (expr.args.length !== 1) throw mError('cut() expects 1 argument (cutter path or array of cutters)');
        const cutterVal = evaluateExpression(expr.args[0], scope);
        const cutterCmds: PathBlockCommand[] = resolveCutterCommands(cutterVal, mError);
        const cutWarnings: string[] = [];
        const pieceCmds = pathCut(obj.commands, cutterCmds, cutWarnings);
        for (const w of cutWarnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return {
          type: 'ArrayValue' as const,
          // Origin (0,0) keeps each piece's subject-local placement, so
          // drawing every piece at one position reassembles the shape.
          elements: pieceCmds.map(p => buildPathBlockFromCommands(p, { x: 0, y: 0 })),
        };
      }

      case 'intersects': {
        if (expr.args.length !== 1) throw mError('intersects() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = computeBoundingBox(obj.commands);
        if (isPathBlockValue(otherVal) || isProjectedPathValue(otherVal)) {
          const otherBB = computeBoundingBox(otherVal.commands);
          return boolVal(bboxOverlaps(myBB, otherBB));
        }
        if (isProjectedTextValue(otherVal)) {
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          return boolVal(bboxOverlaps(myBB, otherBB));
        }
        if (isObjectValue(otherVal)) {
          const ox = otherVal.properties.get('x');
          const oy = otherVal.properties.get('y');
          const ow = otherVal.properties.get('width');
          const oh = otherVal.properties.get('height');
          if (typeof ox === 'number' && typeof oy === 'number' && typeof ow === 'number' && typeof oh === 'number') {
            return boolVal(bboxOverlaps(myBB, { x: ox, y: oy, width: ow, height: oh }));
          }
        }
        throw mError('intersects() argument must be a PathBlock, ProjectedPath, ProjectedText, or {x, y, width, height} object');
      }

      case 'intersectionPoints': {
        if (expr.args.length !== 1) throw mError('intersectionPoints() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = computeBoundingBox(obj.commands);
        if (isPathBlockValue(otherVal) || isProjectedPathValue(otherVal)) {
          const pathSegs = otherVal.commands.map((c) => ({ start: c.start, end: c.end }));
          const pts = bboxPathIntersectionPoints(myBB, pathSegs);
          return {
            type: 'ArrayValue' as const,
            elements: pts.map((p) => ({ type: 'PointValue' as const, x: p.x, y: p.y })),
          };
        }
        if (isProjectedTextValue(otherVal)) {
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          if (!bboxOverlaps(myBB, otherBB)) {
            return { type: 'ArrayValue' as const, elements: [] };
          }
          const overlapX = Math.max(myBB.x, otherBB.x);
          const overlapY = Math.max(myBB.y, otherBB.y);
          const overlapX2 = Math.min(myBB.x + myBB.width, otherBB.x + otherBB.width);
          const overlapY2 = Math.min(myBB.y + myBB.height, otherBB.y + otherBB.height);
          return {
            type: 'ArrayValue' as const,
            elements: [
              { type: 'PointValue' as const, x: overlapX, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY2 },
              { type: 'PointValue' as const, x: overlapX, y: overlapY2 },
            ],
          };
        }
        throw mError('intersectionPoints() argument must be a PathBlock, ProjectedPath, or ProjectedText');
      }

      default:
        throw mError(`Unknown PathBlock method: ${expr.method}`);
    }
  }

  // ProjectedPathValue methods: draw(), drawTo(), get(), tangent(), normal(), partition()
  if (isProjectedPathValue(obj)) {
    // Check if we're inside a path block — draw/drawTo not allowed there
    if (scope.evalState && (scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock) {
      if (expr.method === 'drawTo' || expr.method === 'draw') {
        throw mError(`Cannot call .${expr.method}() inside a path block`);
      }
    }

    switch (expr.method) {
      case 'draw': {
        // A projected path knows where it lives: draw it exactly there,
        // anchored on its FIRST COMMAND (immune to the frame-origin vs
        // first-command distinction that makes drawTo(startPoint) a
        // footgun on cut pieces).
        if (expr.args.length !== 0) throw mError('draw() expects 0 arguments');
        if (!scope.evalState) throw mError('draw() requires evaluation context');
        const anchor = obj.commands.length > 0 ? obj.commands[0].start : obj.startPoint;
        const { d: emittedPath, tracked: emittedCommands } = serializeRelativeAndTrack(
          obj.commands,
          scope.evalState.pathContext,
          // startCursor: commands are world-space — seat the walk's cursor
          // at the anchor so mid-list `m` subpaths (boolean results, holed
          // pieces) compute correct deltas.
          { moveTo: { x: anchor.x, y: anchor.y }, startCursor: { x: anchor.x, y: anchor.y } },
        );
        updateCtxVariable(scope);
        return {
          type: 'PathWithResult' as const,
          path: emittedPath,
          result: obj,
          commands: emittedCommands,
        };
      }

      case 'drawTo': {
        if (expr.args.length !== 2) throw mError('drawTo() expects 2 arguments (x, y)');
        if (!scope.evalState) throw mError('drawTo() requires evaluation context');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');

        // Re-project commands from PPV origin to new drawTo origin
        const offsetX = dtX - obj.startPoint.x;
        const offsetY = dtY - obj.startPoint.y;
        const reProjectedCommands = obj.commands.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x + offsetX, y: cmd.start.y + offsetY },
          end: { x: cmd.end.x + offsetX, y: cmd.end.y + offsetY },
        }));

        // Emit M x y followed by relative commands, tracking in the same walk.
        // reProjectedCommands are world-space; the walk's deltas are unaffected.
        const { d: emittedPath, tracked: emittedCommands } = serializeRelativeAndTrack(
          reProjectedCommands,
          scope.evalState.pathContext,
          // startCursor: reprojected commands are world-space — see draw().
          { moveTo: { x: dtX, y: dtY }, startCursor: { x: dtX, y: dtY } },
        );
        updateCtxVariable(scope);

        // Build ProjectedPathValue with absolute coordinates
        const projected: ProjectedPathValue = {
          type: 'ProjectedPathValue',
          commands: reProjectedCommands,
          startPoint: { x: dtX, y: dtY },
          endPoint: { x: obj.endPoint.x + offsetX, y: obj.endPoint.y + offsetY },
        };

        return {
          type: 'PathWithResult' as const,
          path: emittedPath,
          result: projected,
          commands: emittedCommands,
        };
      }

      case 'get': {
        if (expr.args.length !== 1) throw mError('get() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('get() argument must be a number');
        if (t < 0 || t > 1) throw mError(`get() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return { type: 'PointValue' as const, x: result.point.x, y: result.point.y };
      }

      case 'tangent': {
        if (expr.args.length !== 1) throw mError('tangent() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('tangent() argument must be a number');
        if (t < 0 || t > 1) throw mError(`tangent() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'PointValue' as const, x: result.point.x, y: result.point.y }],
            ['angle', result.tangent],
          ]),
        };
      }

      case 'normal': {
        if (expr.args.length !== 1) throw mError('normal() expects 1 argument (t)');
        const t = evaluateExpression(expr.args[0], scope);
        if (typeof t !== 'number') throw mError('normal() argument must be a number');
        if (t < 0 || t > 1) throw mError(`normal() argument must be between 0 and 1, got ${t}`);
        const result = samplePathAtFraction(obj.commands, t);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'PointValue' as const, x: result.point.x, y: result.point.y }],
            ['angle', result.tangent - Math.PI / 2],
          ]),
        };
      }

      case 'partition': {
        if (expr.args.length !== 1) throw mError('partition() expects 1 argument (n)');
        const n = evaluateExpression(expr.args[0], scope);
        if (typeof n !== 'number') throw mError('partition() argument must be a number');
        if (!Number.isInteger(n) || n < 1) throw mError('partition() argument must be a positive integer');
        const points = partitionPath(obj.commands, n);
        return {
          type: 'ArrayValue' as const,
          elements: points.map((p, i) => ({
            type: 'ObjectValue' as const,
            properties: new Map<string, Value>([
              ['point', { type: 'PointValue' as const, x: p.point.x, y: p.point.y }],
              ['angle', p.tangent],
              ['t', i / n],
            ]),
          })),
        };
      }

      case 'segment':
      case 'segmentAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const segName = evaluateExpression(expr.args[0], scope);
        if (typeof segName !== 'string') throw mError(`${expr.method}() name must be a string`);
        const buildSubProjected = (run: PathBlockCommand[]): ProjectedPathValue => {
          const copies = run.map((c) => ({
            command: c.command,
            args: [...c.args],
            start: { ...c.start },
            end: { ...c.end },
            ...(c.meta !== undefined ? { meta: c.meta } : {}),
          }));
          return {
            type: 'ProjectedPathValue' as const,
            commands: copies,
            startPoint: { ...copies[0].start },
            endPoint: { ...copies[copies.length - 1].end },
          };
        };
        const runs = findLabeledRuns(obj.commands, segName);
        if (expr.method === 'segmentAll') {
          return { type: 'ArrayValue' as const, elements: runs.map(buildSubProjected) };
        }
        if (runs.length === 0) throw mError(queryLabelError('segment', segName, obj.commands));
        return buildSubProjected(runs[0]);
      }

      case 'point':
      case 'pointAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const ptName = evaluateExpression(expr.args[0], scope);
        if (typeof ptName !== 'string') throw mError(`${expr.method}() name must be a string`);
        const matches = findEndpointCommands(obj.commands, ptName);
        if (expr.method === 'pointAll') {
          return {
            type: 'ArrayValue' as const,
            elements: matches.map((c) => ({ type: 'PointValue' as const, x: c.end.x, y: c.end.y })),
          };
        }
        if (matches.length === 0) throw mError(queryLabelError('endpoint', ptName, obj.commands));
        return { type: 'PointValue' as const, x: matches[0].end.x, y: matches[0].end.y };
      }

      case 'vertex':
      case 'vertexAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const vName = evaluateExpression(expr.args[0], scope);
        if (typeof vName !== 'string') throw mError(`${expr.method}() name must be a string`);
        const targets = findEndpointCommands(obj.commands, vName);
        const buildProjectedHandle = (target: PathBlockCommand): VertexHandleValue => ({
          type: 'VertexHandleValue' as const,
          sourceKind: 'projected' as const,
          source: obj,
          label: vName,
          point: { x: target.end.x, y: target.end.y },
          cornerIndex: locateCornerPos(obj.commands, target),
        });
        if (expr.method === 'vertexAll') {
          return { type: 'ArrayValue' as const, elements: targets.map(buildProjectedHandle) };
        }
        if (targets.length === 0) throw mError(queryLabelError('endpoint', vName, obj.commands));
        return buildProjectedHandle(targets[0]);
      }

      case 'reverse': {
        if (expr.args.length !== 0) throw mError('reverse() expects 0 arguments');
        const reversed = reverseCommands(obj.commands);
        // ProjectedPathValue: starts at original endPoint, keeps absolute coords
        const projStartPoint = obj.endPoint;
        const projEndPoint = reversed.length > 0 ? reversed[reversed.length - 1].end : obj.startPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: reversed,
          startPoint: { x: projStartPoint.x, y: projStartPoint.y },
          endPoint: { x: projEndPoint.x, y: projEndPoint.y },
        };
      }

      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = computeBoundingBox(obj.commands);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['x', bb.x],
            ['y', bb.y],
            ['width', bb.width],
            ['height', bb.height],
          ]),
        };
      }

      case 'offset': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('offset() expects 1-2 arguments (distance, options?)');
        const dist = evaluateExpression(expr.args[0], scope);
        if (typeof dist !== 'number') throw mError('offset() argument must be a number');
        const offsetOpts = expr.args.length === 2 ? parseOffsetJoinOptions(evaluateExpression(expr.args[1], scope), mError) : {};
        const offsetResult = offsetCommands(obj.commands, dist, offsetOpts);
        const oStart = offsetResult.length > 0 ? offsetResult[0].start : obj.startPoint;
        const oEnd = offsetResult.length > 0 ? offsetResult[offsetResult.length - 1].end : obj.endPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: offsetResult,
          startPoint: { x: oStart.x, y: oStart.y },
          endPoint: { x: oEnd.x, y: oEnd.y },
        };
      }

      case 'mirror': {
        if (expr.args.length !== 1) throw mError('mirror() expects 1 argument (angle)');
        const mAngle = toNumber(evaluateExpression(expr.args[0], scope));
        if (mAngle === undefined) throw mError('mirror() argument must be a number');
        const mirrored = mirrorCommands(obj.commands, mAngle, obj.startPoint);
        const mStart = mirrored.length > 0 ? mirrored[0].start : obj.startPoint;
        const mEnd = mirrored.length > 0 ? mirrored[mirrored.length - 1].end : obj.endPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: mirrored,
          startPoint: { x: mStart.x, y: mStart.y },
          endPoint: { x: mEnd.x, y: mEnd.y },
        };
      }

      case 'rotate': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('rotate() expects 1-2 arguments (angle) or (angle, origin)');
        const rotAngle = toNumber(evaluateExpression(expr.args[0], scope));
        if (rotAngle === undefined) throw mError('rotate() angle must be a number');
        let rotPivot = { x: obj.startPoint.x, y: obj.startPoint.y };
        if (expr.args.length === 2) {
          const rotOrigin = evaluateExpression(expr.args[1], scope);
          if (!isPointValue(rotOrigin)) throw mError('rotate() origin must be a Point');
          rotPivot = { x: rotOrigin.x, y: rotOrigin.y };
        }
        const rotCmds = rotateAboutPointCommands(obj.commands, rotAngle, rotPivot);
        const rotFirst = rotCmds[0];
        const rotLast = rotCmds[rotCmds.length - 1];
        return {
          type: 'ProjectedPathValue' as const,
          commands: rotCmds,
          startPoint: rotFirst ? { ...rotFirst.start } : { ...obj.startPoint },
          endPoint: rotLast ? { ...rotLast.end } : { ...obj.endPoint },
        };
      }

      case 'rotateAtVertexIndex': {
        if (expr.args.length !== 2) throw mError('rotateAtVertexIndex() expects 2 arguments (index, angle)');
        const rIdx = evaluateExpression(expr.args[0], scope);
        const rAngle = toNumber(evaluateExpression(expr.args[1], scope));
        if (typeof rIdx !== 'number') throw mError('rotateAtVertexIndex() index must be a number');
        if (rAngle === undefined) throw mError('rotateAtVertexIndex() angle must be a number');
        if (!Number.isInteger(rIdx)) throw mError('rotateAtVertexIndex() index must be an integer');
        const rotated = rotateAtVertexCommands(obj.commands, rIdx, rAngle);
        const rStart = rotated.length > 0 ? rotated[0].start : obj.startPoint;
        const rEnd = rotated.length > 0 ? rotated[rotated.length - 1].end : obj.endPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: rotated,
          startPoint: { x: rStart.x, y: rStart.y },
          endPoint: { x: rEnd.x, y: rEnd.y },
        };
      }

      case 'scale': {
        if (expr.args.length !== 2) throw mError('scale() expects 2 arguments (sx, sy)');
        const sSx = evaluateExpression(expr.args[0], scope);
        const sSy = evaluateExpression(expr.args[1], scope);
        if (typeof sSx !== 'number') throw mError('scale() sx must be a number');
        if (typeof sSy !== 'number') throw mError('scale() sy must be a number');
        const scaled = scaleCommands(obj.commands, sSx, sSy, obj.startPoint);
        const sStart = scaled.length > 0 ? scaled[0].start : obj.startPoint;
        const sEnd = scaled.length > 0 ? scaled[scaled.length - 1].end : obj.endPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: scaled,
          startPoint: { x: sStart.x, y: sStart.y },
          endPoint: { x: sEnd.x, y: sEnd.y },
        };
      }

      case 'subPath': {
        if (expr.args.length !== 2) throw mError('subPath() expects 2 arguments (startT, endT)');
        const spStart = evaluateExpression(expr.args[0], scope);
        const spEnd = evaluateExpression(expr.args[1], scope);
        if (typeof spStart !== 'number') throw mError('subPath() startT must be a number');
        if (typeof spEnd !== 'number') throw mError('subPath() endT must be a number');
        if (spStart < 0 || spStart > 1) throw mError('subPath() startT must be between 0 and 1');
        if (spEnd < 0 || spEnd > 1) throw mError('subPath() endT must be between 0 and 1');
        const subResult = subPathCommands(obj.commands, spStart, spEnd);
        // Return PathBlockValue (normalized to 0,0) so result is drawable
        if (subResult.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const spOriginX = subResult[0].start.x;
        const spOriginY = subResult[0].start.y;
        const spNormalized = subResult.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - spOriginX, y: cmd.start.y - spOriginY },
          end: { x: cmd.end.x - spOriginX, y: cmd.end.y - spOriginY },
        }));
        const spLast = spNormalized[spNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: spNormalized,
          records: recordsFromCommands(spNormalized),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: spLast.end.x, y: spLast.end.y },
        };
      }

      case 'chamfer': {
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('chamfer() expects 1-2 arguments');
        const cd1 = evaluateExpression(expr.args[0], scope);
        if (typeof cd1 !== 'number') throw mError('chamfer() distance must be a number');
        let cd2 = cd1;
        if (expr.args.length === 2) {
          cd2 = evaluateExpression(expr.args[1], scope) as number;
          if (typeof cd2 !== 'number') throw mError('chamfer() d2 must be a number');
        }
        const chamResult = chamferCommands(obj.commands, cd1, cd2, null);
        for (const w of chamResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(chamResult.commands, obj);
      }

      case 'chamferAtVertex': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('chamferAtVertex() expects 2-3 arguments');
        const cvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof cvIdx !== 'number' || !Number.isInteger(cvIdx)) throw mError('chamferAtVertex() index must be an integer');
        const cvD1 = evaluateExpression(expr.args[1], scope);
        if (typeof cvD1 !== 'number') throw mError('chamferAtVertex() distance must be a number');
        let cvD2 = cvD1;
        if (expr.args.length === 3) {
          cvD2 = evaluateExpression(expr.args[2], scope) as number;
          if (typeof cvD2 !== 'number') throw mError('chamferAtVertex() d2 must be a number');
        }
        const cvResult = chamferCommands(obj.commands, cvD1, cvD2, [cvIdx]);
        for (const w of cvResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(cvResult.commands, obj);
      }

      case 'fillet': {
        if (expr.args.length !== 1) throw mError('fillet() expects 1 argument (radius)');
        const fRadius = evaluateExpression(expr.args[0], scope);
        if (typeof fRadius !== 'number') throw mError('fillet() radius must be a number');
        const fResult = filletCommands(obj.commands, fRadius, null);
        for (const w of fResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(fResult.commands, obj);
      }

      case 'filletAtVertex': {
        if (expr.args.length !== 2) throw mError('filletAtVertex() expects 2 arguments (index, radius)');
        const fvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof fvIdx !== 'number' || !Number.isInteger(fvIdx)) throw mError('filletAtVertex() index must be an integer');
        const fvRadius = evaluateExpression(expr.args[1], scope);
        if (typeof fvRadius !== 'number') throw mError('filletAtVertex() radius must be a number');
        const fvResult = filletCommands(obj.commands, fvRadius, [fvIdx]);
        for (const w of fvResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(fvResult.commands, obj);
      }

      case 'ellipticalFillet': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('ellipticalFillet() expects 2-3 arguments');
        const efRx = evaluateExpression(expr.args[0], scope);
        const efRy = evaluateExpression(expr.args[1], scope);
        if (typeof efRx !== 'number') throw mError('ellipticalFillet() rx must be a number');
        if (typeof efRy !== 'number') throw mError('ellipticalFillet() ry must be a number');
        let efRot = 0;
        if (expr.args.length === 3) {
          efRot = toNumber(evaluateExpression(expr.args[2], scope)) as number;
          if (typeof efRot !== 'number') throw mError('ellipticalFillet() rotation must be a number');
        }
        const efResult = ellipticalFilletCommands(obj.commands, efRx, efRy, efRot, null);
        for (const w of efResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(efResult.commands, obj);
      }

      case 'ellipticalFilletAtVertex': {
        if (expr.args.length < 3 || expr.args.length > 4) throw mError('ellipticalFilletAtVertex() expects 3-4 arguments');
        const efvIdx = evaluateExpression(expr.args[0], scope);
        if (typeof efvIdx !== 'number' || !Number.isInteger(efvIdx)) throw mError('ellipticalFilletAtVertex() index must be an integer');
        const efvRx = evaluateExpression(expr.args[1], scope);
        const efvRy = evaluateExpression(expr.args[2], scope);
        if (typeof efvRx !== 'number') throw mError('ellipticalFilletAtVertex() rx must be a number');
        if (typeof efvRy !== 'number') throw mError('ellipticalFilletAtVertex() ry must be a number');
        let efvRot = 0;
        if (expr.args.length === 4) {
          efvRot = toNumber(evaluateExpression(expr.args[3], scope)) as number;
          if (typeof efvRot !== 'number') throw mError('ellipticalFilletAtVertex() rotation must be a number');
        }
        const efvResult = ellipticalFilletCommands(obj.commands, efvRx, efvRy, efvRot, [efvIdx]);
        for (const w of efvResult.warnings) {
          if (scope.evalState) scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildProjectedPathFromCommands(efvResult.commands, obj);
      }

      case 'union':
      case 'difference':
      case 'intersection':
      case 'xor': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (other path)`);
        const otherVal = evaluateExpression(expr.args[0], scope);
        let otherCmds: PathBlockCommand[];
        if (isPathBlockValue(otherVal)) {
          otherCmds = otherVal.commands;
        } else if (isProjectedPathValue(otherVal)) {
          otherCmds = otherVal.commands;
        } else {
          throw mError(`${expr.method}() argument must be a PathBlock or ProjectedPath`);
        }
        const aCmds = obj.commands;
        const bCmds = otherCmds;
        let resultCmds: PathBlockCommand[];
        switch (expr.method) {
          case 'union': resultCmds = pathUnion(aCmds, bCmds); break;
          case 'difference': resultCmds = pathDifference(aCmds, bCmds); break;
          case 'intersection': resultCmds = pathIntersection(aCmds, bCmds); break;
          case 'xor': resultCmds = pathXor(aCmds, bCmds); break;
          default: resultCmds = [];
        }
        return buildPathBlockFromCommands(resultCmds, { x: 0, y: 0 });
      }

      case 'cut': {
        if (expr.args.length !== 1) throw mError('cut() expects 1 argument (cutter path or array of cutters)');
        const cutterVal = evaluateExpression(expr.args[0], scope);
        const cutterCmds: PathBlockCommand[] = resolveCutterCommands(cutterVal, mError);
        const cutWarnings: string[] = [];
        const pieceCmds = pathCut(obj.commands, cutterCmds, cutWarnings);
        for (const w of cutWarnings) {
          if (scope.evalState) {
            scope.evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
          }
        }
        return {
          type: 'ArrayValue' as const,
          // Origin (0,0) keeps each piece's subject-local placement, so
          // drawing every piece at one position reassembles the shape.
          elements: pieceCmds.map(p => buildPathBlockFromCommands(p, { x: 0, y: 0 })),
        };
      }

      case 'intersects': {
        if (expr.args.length !== 1) throw mError('intersects() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = computeBoundingBox(obj.commands);
        if (isPathBlockValue(otherVal) || isProjectedPathValue(otherVal)) {
          const otherBB = computeBoundingBox(otherVal.commands);
          return boolVal(bboxOverlaps(myBB, otherBB));
        }
        if (isProjectedTextValue(otherVal)) {
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          return boolVal(bboxOverlaps(myBB, otherBB));
        }
        if (isObjectValue(otherVal)) {
          const ox = otherVal.properties.get('x');
          const oy = otherVal.properties.get('y');
          const ow = otherVal.properties.get('width');
          const oh = otherVal.properties.get('height');
          if (typeof ox === 'number' && typeof oy === 'number' && typeof ow === 'number' && typeof oh === 'number') {
            return boolVal(bboxOverlaps(myBB, { x: ox, y: oy, width: ow, height: oh }));
          }
        }
        throw mError('intersects() argument must be a PathBlock, ProjectedPath, ProjectedText, or {x, y, width, height} object');
      }

      case 'intersectionPoints': {
        if (expr.args.length !== 1) throw mError('intersectionPoints() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = computeBoundingBox(obj.commands);
        if (isPathBlockValue(otherVal) || isProjectedPathValue(otherVal)) {
          const pathSegs = otherVal.commands.map((c) => ({ start: c.start, end: c.end }));
          const pts = bboxPathIntersectionPoints(myBB, pathSegs);
          return {
            type: 'ArrayValue' as const,
            elements: pts.map((p) => ({ type: 'PointValue' as const, x: p.x, y: p.y })),
          };
        }
        if (isProjectedTextValue(otherVal)) {
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          if (!bboxOverlaps(myBB, otherBB)) {
            return { type: 'ArrayValue' as const, elements: [] };
          }
          const overlapX = Math.max(myBB.x, otherBB.x);
          const overlapY = Math.max(myBB.y, otherBB.y);
          const overlapX2 = Math.min(myBB.x + myBB.width, otherBB.x + otherBB.width);
          const overlapY2 = Math.min(myBB.y + myBB.height, otherBB.y + otherBB.height);
          return {
            type: 'ArrayValue' as const,
            elements: [
              { type: 'PointValue' as const, x: overlapX, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY2 },
              { type: 'PointValue' as const, x: overlapX, y: overlapY2 },
            ],
          };
        }
        throw mError('intersectionPoints() argument must be a PathBlock, ProjectedPath, or ProjectedText');
      }

      default:
        throw mError(`Unknown ProjectedPath method: ${expr.method}`);
    }
  }

  // VertexHandleValue methods — corner ops on a named vertex
  if (isVertexHandleValue(obj)) {
    const handle = obj;
    switch (expr.method) {
      case 'fillet':
      case 'chamfer':
      case 'ellipticalFillet': {
        if (handle.sourceKind !== 'pathblock') {
          const what = handle.sourceKind === 'layer' ? 'layer' : 'projected path';
          throw mError(
            `${expr.method}() on a ${what} vertex handle is not supported yet — corner ops via vertex handles work on PathBlock values`,
          );
        }
        if (handle.cornerIndex === -1) {
          throw mError(`vertex('${handle.label}') is not at a corner (collinear edges) — nothing to ${expr.method}`);
        }
        const arity: Record<string, [number, number]> = { fillet: [1, 1], chamfer: [1, 2], ellipticalFillet: [2, 3] };
        const [min, max] = arity[expr.method];
        if (expr.args.length < min || expr.args.length > max) {
          throw mError(`${expr.method}() expects ${min === max ? min : `${min}-${max}`} argument${max > 1 ? 's' : ''}`);
        }
        const nums = expr.args.map((a, i) => {
          const v = evaluateExpression(a, scope);
          if (typeof v !== 'number' || !Number.isFinite(v)) throw mError(`${expr.method}() argument ${i + 1} must be a finite number`);
          return v;
        });
        const src = handle.source as PathBlockValue;
        let res: { commands: PathBlockCommand[]; warnings: string[] };
        if (expr.method === 'fillet') res = filletCommands(src.commands, nums[0], [handle.cornerIndex]);
        else if (expr.method === 'chamfer') res = chamferCommands(src.commands, nums[0], nums[1] ?? nums[0], [handle.cornerIndex]);
        else res = ellipticalFilletCommands(src.commands, nums[0], nums[1], nums[2] ?? 0, [handle.cornerIndex]);
        for (const w of res.warnings) {
          scope.evalState?.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
        }
        return buildPathBlockFromCommands(res.commands, { x: 0, y: 0 });
      }
      default:
        throw mError(`Unknown method '${expr.method}' on vertex handle`);
    }
  }

  // TextBlockValue methods
  if (isTextBlockValue(obj)) {
    switch (expr.method) {
      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
          ]),
        };
      }
      case 'polarProject': {
        if (expr.args.length !== 5) throw mError('polarProject() expects 5 arguments (px, py, angle, distance, anchor)');
        const ppx = evaluateExpression(expr.args[0], scope);
        const ppy = evaluateExpression(expr.args[1], scope);
        const ppAngle = toNumber(evaluateExpression(expr.args[2], scope));
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number') throw mError('polarProject() px must be a number');
        if (typeof ppy !== 'number') throw mError('polarProject() py must be a number');
        if (ppAngle === undefined) throw mError('polarProject() angle must be a number');
        if (typeof ppDist !== 'number') throw mError('polarProject() distance must be a number');
        if (typeof ppAnchor !== 'string') throw mError('polarProject() anchor must be a BBoxAnchor enum value');
        const targetX = ppx + ppDist * Math.cos(ppAngle);
        const targetY = ppy + ppDist * Math.sin(ppAngle);
        const originBB = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        const anchorOffset = resolveAnchorPoint(originBB, ppAnchor, mError);
        const projOriginX = targetX - anchorOffset.x;
        const projOriginY = targetY - anchorOffset.y;
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + projOriginX, y: el.y + projOriginY })),
          styles: { ...obj.styles },
          origin: { x: projOriginX, y: projOriginY },
        };
      }
      case 'radialProject': {
        // radialProject(cx, cy, angle, distance, anchor?, autoFlip?)
        // Positions text at polar coordinate, rotates along radial direction,
        // auto-flips on left hemisphere for readability, sets text-anchor.
        if (expr.args.length < 4 || expr.args.length > 7) {
          throw mError('radialProject() expects 4-7 arguments (cx, cy, angle, distance, anchor?, autoFlip?, verticalAlign?)');
        }
        const rpCx = evaluateExpression(expr.args[0], scope);
        const rpCy = evaluateExpression(expr.args[1], scope);
        const rpAngle = evaluateExpression(expr.args[2], scope);
        const rpDist = evaluateExpression(expr.args[3], scope);
        if (typeof rpCx !== 'number') throw mError('radialProject() cx must be a number');
        if (typeof rpCy !== 'number') throw mError('radialProject() cy must be a number');
        if (typeof rpAngle !== 'number') throw mError('radialProject() angle must be a number');
        if (typeof rpDist !== 'number') throw mError('radialProject() distance must be a number');

        // Optional anchor: 'start' (default) or 'end'
        let rpAnchor = 'start';
        if (expr.args.length >= 5) {
          const anchorVal = evaluateExpression(expr.args[4], scope);
          if (typeof anchorVal === 'string') rpAnchor = anchorVal;
        }

        // Optional autoFlip: default true
        let rpAutoFlip = true;
        if (expr.args.length >= 6) {
          const flipVal = evaluateExpression(expr.args[5], scope);
          if (typeof flipVal === 'number') rpAutoFlip = flipVal !== 0;
          else if (isBooleanValue(flipVal)) rpAutoFlip = flipVal.value !== 0;
        }

        // Target position
        let rpTargetX = rpCx + rpDist * Math.cos(rpAngle);
        let rpTargetY = rpCy + rpDist * Math.sin(rpAngle);

        // Base rotation aligns text along radial direction
        let rpRotation = rpAngle;
        let effectiveAnchor = rpAnchor;

        // Left hemisphere detection and flip
        const isLeftHemi = Math.cos(rpAngle) < -1e-10;
        if (rpAutoFlip && isLeftHemi) {
          rpRotation += Math.PI; // Flip 180° for readability
          // Swap anchor so text still extends away from center
          effectiveAnchor = rpAnchor === 'start' ? 'end' : 'start';
        }

        // Optional verticalAlign: default 'baseline'
        let rpVAlign = 'baseline';
        if (expr.args.length >= 7) {
          const vAlignVal = evaluateExpression(expr.args[6], scope);
          if (typeof vAlignVal === 'string') rpVAlign = vAlignVal;
        }

        // Compute perpendicular offset for vertical font metric alignment
        if (rpVAlign !== 'baseline') {
          const rpFontSize = typeof obj.styles['font-size'] === 'number'
            ? obj.styles['font-size']
            : (typeof obj.styles['font-size'] === 'string' ? parseFloat(obj.styles['font-size'] as string) : 16);

          let vOffset = 0;
          if (rpVAlign === 'midline') vOffset = -rpFontSize * 0.35;
          else if (rpVAlign === 'cap-height') vOffset = -rpFontSize * 0.7;
          else if (rpVAlign === 'descender') vOffset = rpFontSize * 0.2;

          if (vOffset !== 0) {
            const perpAngle = rpRotation - Math.PI / 2;
            rpTargetX += vOffset * Math.cos(perpAngle);
            rpTargetY += vOffset * Math.sin(perpAngle);
          }
        }

        // Text-anchor style
        const rpTextAnchor = effectiveAnchor === 'end' ? 'end' : 'start';

        // Project elements to target position with rotation and text-anchor
        const rpStyles = { ...obj.styles, 'text-anchor': rpTextAnchor };
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({
            ...el,
            x: el.x + rpTargetX,
            y: el.y + rpTargetY,
            rotation: rpRotation,
            styles: el.styles ? { ...el.styles, 'text-anchor': rpTextAnchor } : { 'text-anchor': rpTextAnchor },
          })),
          styles: rpStyles,
          origin: { x: rpTargetX, y: rpTargetY },
        };
      }
      case 'project': {
        if (expr.args.length !== 2) throw mError('project() expects 2 arguments (x, y)');
        const px = evaluateExpression(expr.args[0], scope);
        const py = evaluateExpression(expr.args[1], scope);
        if (typeof px !== 'number') throw mError('project() x must be a number');
        if (typeof py !== 'number') throw mError('project() y must be a number');
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + px, y: el.y + py })),
          styles: { ...obj.styles },
          origin: { x: px, y: py },
        };
      }
      case 'drawTo': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('drawTo() expects 2-3 arguments (x, y, rotation?)');
        if (!scope.evalState) throw mError('drawTo() requires evaluation context');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');
        let dtRotation: number | undefined;
        if (expr.args.length === 3) {
          dtRotation = toNumber(evaluateExpression(expr.args[2], scope)) as number;
          if (typeof dtRotation !== 'number') throw mError('drawTo() rotation must be a number');
        }
        const activeTextLayer = getActiveTextLayer(scope);
        if (!activeTextLayer) {
          throw mError('drawTo() can only be used inside a TextLayer apply block');
        }
        // Emit text elements to the active text layer
        for (const el of obj.elements) {
          const emitted: TextElement = {
            x: el.x + dtX,
            y: el.y + dtY,
            rotation: dtRotation ?? el.rotation,
            styles: el.styles ? { ...obj.styles, ...el.styles } : (Object.keys(obj.styles).length > 0 ? { ...obj.styles } : undefined),
            children: [...el.children],
          };
          activeTextLayer.textElements.push(emitted);
        }
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + dtX, y: el.y + dtY })),
          styles: { ...obj.styles },
          origin: { x: dtX, y: dtY },
        };
      }
      case 'toPathBlock': {
        if (expr.args.length !== 0) throw mError('toPathBlock() expects 0 arguments');
        const fontRegistry = scope.evalState?.fontRegistry;
        if (!fontRegistry) {
          throw mError('toPathBlock() requires fonts to be loaded — use @font directive or pass fonts in compile options');
        }

        const allCommands: PathBlockCommand[] = [];
        for (const el of obj.elements) {
          const mergedStyles = el.styles ? { ...obj.styles, ...el.styles } : { ...obj.styles };
          let cursorX = el.x;
          let cursorY = el.y;

          for (const child of el.children) {
            let childStyles = mergedStyles;
            let text: string;
            if (child.type === 'tspan') {
              if (child.dx !== undefined) cursorX += child.dx;
              if (child.dy !== undefined) cursorY += child.dy;
              childStyles = child.styles ? { ...mergedStyles, ...child.styles } : mergedStyles;
              text = child.text;
            } else {
              text = child.text;
            }

            const fontFamily = resolveFontFamily(childStyles);
            const fontWeight = resolveFontWeight(childStyles) ?? 400;
            const fontSize = resolveEffectiveFontSize(childStyles);
            const letterSpacing = parseFloat(childStyles['letter-spacing'] ?? '0') || 0;

            if (!fontFamily) {
              throw mError('toPathBlock() requires font-family to be set in styles');
            }
            if (!getFont(fontRegistry, fontFamily, fontWeight)) {
              const available = Array.from(fontRegistry.fonts.keys()).join(', ');
              throw mError(`toPathBlock() font '${fontFamily}' not loaded. Available: ${available || 'none'}`);
            }

            for (const char of text) {
              if (char === ' ' || char === '\t') {
                // Space: advance cursor without generating outline commands.
                // Still goes through lookupGlyph so the advance width comes
                // from a variant that actually maps the character, not from
                // whichever buffer happens to be registered first.
                const { advanceWidth } = lookupGlyph(fontRegistry, fontFamily, fontWeight, 'normal', char, fontSize)!;
                cursorX += advanceWidth + letterSpacing;
                continue;
              }
              const lookup = lookupGlyph(fontRegistry, fontFamily, fontWeight, 'normal', char, fontSize)!;
              const { commands: glyphCmds, advanceWidth } = lookup;
              if (lookup.missing && scope.evalState) {
                recordMissingGlyph(scope.evalState, fontFamily, fontWeight, char);
              }
              // Offset glyph commands by cursor position
              for (const cmd of glyphCmds) {
                allCommands.push({
                  command: cmd.command,
                  args: [...cmd.args],
                  start: { x: cmd.start.x + cursorX, y: cmd.start.y + cursorY },
                  end: { x: cmd.end.x + cursorX, y: cmd.end.y + cursorY },
                });
              }
              cursorX += advanceWidth + letterSpacing;
            }
          }
        }

        return buildPathBlockFromCommands(allCommands, { x: 0, y: 0 });
      }
      case 'toCodeSnippetBlock': {
        if (expr.args.length < 1 || expr.args.length > 3) throw mError('toCodeSnippetBlock() expects 1-3 arguments (name [, fontSize, padding])');
        if (!scope.evalState) throw mError('toCodeSnippetBlock() requires evaluation context');
        const snippetName = evaluateExpression(expr.args[0], scope);
        if (typeof snippetName !== 'string') throw mError('toCodeSnippetBlock() name must be a string');

        let snippetFontSize = 10;
        if (expr.args.length >= 2) {
          const fsVal = evaluateExpression(expr.args[1], scope);
          if (typeof fsVal !== 'number') throw mError('toCodeSnippetBlock() fontSize must be a number');
          snippetFontSize = fsVal;
        }
        let snippetPadding = 12;
        if (expr.args.length >= 3) {
          const padVal = evaluateExpression(expr.args[2], scope);
          if (typeof padVal !== 'number') throw mError('toCodeSnippetBlock() padding must be a number');
          snippetPadding = padVal;
        }

        // Check for layer name collision
        if (scope.evalState.layers.has(snippetName)) {
          throw mError(`toCodeSnippetBlock() layer name '${snippetName}' already exists`);
        }
        if (scope.evalState.layers.has(`${snippetName}-bg`)) {
          throw mError(`toCodeSnippetBlock() layer name '${snippetName}-bg' already exists`);
        }
        if (scope.evalState.layers.has(`${snippetName}-code`)) {
          throw mError(`toCodeSnippetBlock() layer name '${snippetName}-code' already exists`);
        }

        // Extract all text content from the TextBlock
        const textParts: string[] = [];
        for (const el of obj.elements) {
          for (const child of el.children) {
            textParts.push(child.text);
          }
        }
        const rawCode = textParts.join('');

        // Normalize: dedent, trim blank leading/trailing lines, tabs → 2 spaces
        const normalized = normalizeCodeText(rawCode);
        const codeLines = normalized.split('\n');

        // Tokenize and generate layers
        const { groupLayer } = generateCodeSnippetLayers(
          snippetName, codeLines, snippetFontSize, snippetPadding, scope.evalState,
        );

        return { type: 'LayerReference', layer: groupLayer };
      }
      default:
        throw mError(`Unknown TextBlock method: ${expr.method}`);
    }
  }

  // ProjectedTextValue methods
  if (isProjectedTextValue(obj)) {
    switch (expr.method) {
      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
          ]),
        };
      }
      case 'anchor': {
        if (expr.args.length !== 1) throw mError('anchor() expects 1 argument (BBoxAnchor)');
        const anchorVal = evaluateExpression(expr.args[0], scope);
        if (typeof anchorVal !== 'string') throw mError('anchor() argument must be a BBoxAnchor enum value');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        const pt = resolveAnchorPoint(bb, anchorVal, mError);
        return { type: 'PointValue' as const, x: pt.x, y: pt.y };
      }
      case 'polarProject': {
        if (expr.args.length !== 5) throw mError('polarProject() expects 5 arguments (px, py, angle, distance, anchor)');
        const ppx = evaluateExpression(expr.args[0], scope);
        const ppy = evaluateExpression(expr.args[1], scope);
        const ppAngle = toNumber(evaluateExpression(expr.args[2], scope));
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number') throw mError('polarProject() px must be a number');
        if (typeof ppy !== 'number') throw mError('polarProject() py must be a number');
        if (ppAngle === undefined) throw mError('polarProject() angle must be a number');
        if (typeof ppDist !== 'number') throw mError('polarProject() distance must be a number');
        if (typeof ppAnchor !== 'string') throw mError('polarProject() anchor must be a BBoxAnchor enum value');
        // Compute target point
        const targetX = ppx + ppDist * Math.cos(ppAngle);
        const targetY = ppy + ppDist * Math.sin(ppAngle);
        // Estimate bbox at origin to find anchor offset
        const originBB = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        const anchorOffset = resolveAnchorPoint(originBB, ppAnchor, mError);
        // Projection origin = target - anchorOffset
        const projOriginX = targetX - anchorOffset.x;
        const projOriginY = targetY - anchorOffset.y;
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + projOriginX, y: el.y + projOriginY })),
          styles: { ...obj.styles },
          origin: { x: projOriginX, y: projOriginY },
        };
      }
      case 'paddedBoundingBox': {
        if (expr.args.length !== 2) throw mError('paddedBoundingBox() expects 2 arguments (blockPad, inlinePad)');
        const blockPad = evaluateExpression(expr.args[0], scope);
        const inlinePad = evaluateExpression(expr.args[1], scope);
        if (typeof blockPad !== 'number') throw mError('paddedBoundingBox() blockPad must be a number');
        if (typeof inlinePad !== 'number') throw mError('paddedBoundingBox() inlinePad must be a number');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['x', bb.x - inlinePad],
            ['y', bb.y - blockPad],
            ['width', bb.width + 2 * inlinePad],
            ['height', bb.height + 2 * blockPad],
          ]),
        };
      }
      case 'intersects': {
        if (expr.args.length !== 1) throw mError('intersects() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        if (isProjectedTextValue(otherVal)) {
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          return boolVal(bboxOverlaps(myBB, otherBB));
        }
        if (isObjectValue(otherVal)) {
          const ox = otherVal.properties.get('x');
          const oy = otherVal.properties.get('y');
          const ow = otherVal.properties.get('width');
          const oh = otherVal.properties.get('height');
          if (typeof ox === 'number' && typeof oy === 'number' && typeof ow === 'number' && typeof oh === 'number') {
            return boolVal(bboxOverlaps(myBB, { x: ox, y: oy, width: ow, height: oh }));
          }
        }
        if (isProjectedPathValue(otherVal)) {
          const pathSegs = otherVal.commands.map((c) => ({ start: c.start, end: c.end }));
          return boolVal(bboxPathIntersects(myBB, pathSegs));
        }
        throw mError('intersects() argument must be a ProjectedText, ProjectedPath, or {x, y, width, height} object');
      }
      case 'intersectionPoints': {
        if (expr.args.length !== 1) throw mError('intersectionPoints() expects 1 argument');
        const otherVal = evaluateExpression(expr.args[0], scope);
        const myBB = estimateTextBoundingBox(obj.elements, obj.styles, scope.evalState?.fontRegistry);
        if (isProjectedPathValue(otherVal)) {
          const pathSegs = otherVal.commands.map((c) => ({ start: c.start, end: c.end }));
          const pts = bboxPathIntersectionPoints(myBB, pathSegs);
          return {
            type: 'ArrayValue' as const,
            elements: pts.map((p) => ({ type: 'PointValue' as const, x: p.x, y: p.y })),
          };
        }
        if (isProjectedTextValue(otherVal)) {
          // Two AABBs: intersection perimeter points are the overlap rectangle corners
          const otherBB = estimateTextBoundingBox(otherVal.elements, otherVal.styles, scope.evalState?.fontRegistry);
          if (!bboxOverlaps(myBB, otherBB)) {
            return { type: 'ArrayValue' as const, elements: [] };
          }
          // Return the 4 corners of the overlap rectangle
          const overlapX = Math.max(myBB.x, otherBB.x);
          const overlapY = Math.max(myBB.y, otherBB.y);
          const overlapX2 = Math.min(myBB.x + myBB.width, otherBB.x + otherBB.width);
          const overlapY2 = Math.min(myBB.y + myBB.height, otherBB.y + otherBB.height);
          return {
            type: 'ArrayValue' as const,
            elements: [
              { type: 'PointValue' as const, x: overlapX, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY },
              { type: 'PointValue' as const, x: overlapX2, y: overlapY2 },
              { type: 'PointValue' as const, x: overlapX, y: overlapY2 },
            ],
          };
        }
        throw mError('intersectionPoints() argument must be a ProjectedText or ProjectedPath');
      }
      case 'draw': {
        if (expr.args.length !== 0) throw mError('draw() expects 0 arguments');
        if (!scope.evalState) throw mError('draw() requires evaluation context');
        const activeTextLayer = getActiveTextLayer(scope);
        if (!activeTextLayer) {
          throw mError('draw() can only be used inside a TextLayer apply block');
        }
        for (const el of obj.elements) {
          const emitted: TextElement = {
            x: el.x,
            y: el.y,
            rotation: el.rotation,
            styles: el.styles ? { ...obj.styles, ...el.styles } : (Object.keys(obj.styles).length > 0 ? { ...obj.styles } : undefined),
            children: [...el.children],
          };
          activeTextLayer.textElements.push(emitted);
        }
        return obj;
      }
      case 'drawTo': {
        if (expr.args.length < 2 || expr.args.length > 3) throw mError('drawTo() expects 2-3 arguments (x, y, rotation?)');
        if (!scope.evalState) throw mError('drawTo() requires evaluation context');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');
        let dtRotation: number | undefined;
        if (expr.args.length === 3) {
          dtRotation = toNumber(evaluateExpression(expr.args[2], scope)) as number;
          if (typeof dtRotation !== 'number') throw mError('drawTo() rotation must be a number');
        }
        const activeTextLayer = getActiveTextLayer(scope);
        if (!activeTextLayer) {
          throw mError('drawTo() can only be used inside a TextLayer apply block');
        }
        // Re-project: compute offset from current origin to new position
        const offsetX = dtX - obj.origin.x;
        const offsetY = dtY - obj.origin.y;
        const reProjected = obj.elements.map((el) => ({ ...el, x: el.x + offsetX, y: el.y + offsetY }));
        for (const el of reProjected) {
          const emitted: TextElement = {
            x: el.x,
            y: el.y,
            rotation: dtRotation ?? el.rotation,
            styles: el.styles ? { ...obj.styles, ...el.styles } : (Object.keys(obj.styles).length > 0 ? { ...obj.styles } : undefined),
            children: [...el.children],
          };
          activeTextLayer.textElements.push(emitted);
        }
        return {
          type: 'ProjectedTextValue' as const,
          elements: reProjected,
          styles: { ...obj.styles },
          origin: { x: dtX, y: dtY },
        };
      }
      case 'translate': {
        if (expr.args.length !== 2) throw mError('translate() expects 2 arguments (dx, dy)');
        const dx = evaluateExpression(expr.args[0], scope);
        const dy = evaluateExpression(expr.args[1], scope);
        if (typeof dx !== 'number') throw mError('translate() dx must be a number');
        if (typeof dy !== 'number') throw mError('translate() dy must be a number');
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy })),
          styles: { ...obj.styles },
          origin: { x: obj.origin.x + dx, y: obj.origin.y + dy },
        };
      }
      default:
        throw mError(`Unknown ProjectedText method: ${expr.method}`);
    }
  }

  // Point methods
  if (isPointValue(obj)) {
    switch (expr.method) {
      case 'translate': {
        if (expr.args.length !== 2) throw mError('translate() expects 2 arguments');
        const dx = evaluateExpression(expr.args[0], scope);
        const dy = evaluateExpression(expr.args[1], scope);
        if (typeof dx !== 'number') throw mError('translate() dx must be a number');
        if (typeof dy !== 'number') throw mError('translate() dy must be a number');
        return { type: 'PointValue', x: obj.x + dx, y: obj.y + dy };
      }
      case 'polarTranslate': {
        if (expr.args.length !== 2) throw mError('polarTranslate() expects 2 arguments');
        const angle = toNumber(evaluateExpression(expr.args[0], scope));
        const distance = evaluateExpression(expr.args[1], scope);
        if (angle === undefined) throw mError('polarTranslate() angle must be a number');
        if (typeof distance !== 'number') throw mError('polarTranslate() distance must be a number');
        return { type: 'PointValue', x: obj.x + Math.cos(angle) * distance, y: obj.y + Math.sin(angle) * distance };
      }
      case 'midpoint': {
        if (expr.args.length !== 1) throw mError('midpoint() expects 1 argument');
        const other = evaluateExpression(expr.args[0], scope);
        if (!isPointValue(other)) throw mError('midpoint() argument must be a Point');
        return { type: 'PointValue', x: (obj.x + other.x) / 2, y: (obj.y + other.y) / 2 };
      }
      case 'lerp': {
        if (expr.args.length !== 2) throw mError('lerp() expects 2 arguments');
        const other = evaluateExpression(expr.args[0], scope);
        const t = evaluateExpression(expr.args[1], scope);
        if (!isPointValue(other)) throw mError('lerp() first argument must be a Point');
        if (typeof t !== 'number') throw mError('lerp() second argument (t) must be a number');
        return { type: 'PointValue', x: obj.x + (other.x - obj.x) * t, y: obj.y + (other.y - obj.y) * t };
      }
      case 'rotate': {
        if (expr.args.length !== 2) throw mError('rotate() expects 2 arguments');
        const angle = toNumber(evaluateExpression(expr.args[0], scope));
        const origin = evaluateExpression(expr.args[1], scope);
        if (angle === undefined) throw mError('rotate() angle must be a number');
        if (!isPointValue(origin)) throw mError('rotate() origin must be a Point');
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = obj.x - origin.x;
        const dy = obj.y - origin.y;
        return { type: 'PointValue', x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
      }
      case 'distanceTo': {
        if (expr.args.length !== 1) throw mError('distanceTo() expects 1 argument');
        const other = evaluateExpression(expr.args[0], scope);
        if (!isPointValue(other)) throw mError('distanceTo() argument must be a Point');
        const dx = other.x - obj.x;
        const dy = other.y - obj.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      case 'angleTo': {
        if (expr.args.length !== 1) throw mError('angleTo() expects 1 argument');
        const other = evaluateExpression(expr.args[0], scope);
        if (!isPointValue(other)) throw mError('angleTo() argument must be a Point');
        return Math.atan2(other.y - obj.y, other.x - obj.x);
      }
      case 'offset': {
        if (expr.args.length !== 1) throw mError('offset() expects 1 argument');
        const other = evaluateExpression(expr.args[0], scope);
        if (!isPointValue(other)) throw mError('offset() argument must be a Point');
        return {
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['dx', other.x - obj.x],
            ['dy', other.y - obj.y],
          ]),
        };
      }
      default:
        throw mError(`Unknown Point method: ${expr.method}`);
    }
  }

  // Angle methods (.toDeg/.toRad/.toPi/.toTurns — display re-tagging)
  if (isAngleValue(obj)) {
    const retagged = angleMethod(obj, expr.method, expr.args.length, (m): never => {
      throw mError(m);
    });
    if (retagged) return retagged;
    throw mError(`Unknown Angle method: ${expr.method}`);
  }

  // PolarVector methods
  if (isPolarVectorValue(obj)) {
    switch (expr.method) {
      case 'turn': {
        if (expr.args.length !== 1) throw mError('turn() expects 1 argument');
        const delta = toNumber(evaluateExpression(expr.args[0], scope));
        if (delta === undefined) throw mError('turn() argument must be a number');
        return { type: 'PolarVectorValue' as const, angle: obj.angle + delta, distance: obj.distance };
      }
      case 'scale': {
        if (expr.args.length !== 1) throw mError('scale() expects 1 argument');
        const factor = evaluateExpression(expr.args[0], scope);
        if (typeof factor !== 'number') throw mError('scale() argument must be a number');
        if (factor < 0) throw mError('scale() factor must be non-negative — use mirror() to flip direction');
        return { type: 'PolarVectorValue' as const, angle: obj.angle, distance: obj.distance * factor };
      }
      case 'mirror': {
        if (expr.args.length !== 0) throw mError('mirror() expects no arguments');
        return { type: 'PolarVectorValue' as const, angle: obj.angle + Math.PI, distance: obj.distance };
      }
      default:
        throw mError(`Unknown PolarVector method: ${expr.method}`);
    }
  }

  // VariableOffset builder methods (go.stop / go.startTangent / go.endTangent /
  // go.startCap / go.endCap). The methods mutate the builder accumulator in place.
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'VariableOffsetBuilderValue') {
    const b = obj as VariableOffsetBuilderValue;
    const validContinuity = (v: Value): v is string =>
      typeof v === 'string' && Object.values(BUILTIN_ENUMS.CurveContinuity).includes(v);
    switch (expr.method) {
      case 'stop': {
        const time = evaluateExpression(expr.args[0], scope);
        if (typeof time !== 'number') throw mError('go.stop() time must be a number');
        if (time < 0 || time > 1) throw mError(`go.stop() time must be between 0 and 1, got ${time}`);
        // Decreasing times silently flip the outward direction used by end caps —
        // reject them (equal times are tolerated; they add a zero-length segment).
        const prevStop = b.stops[b.stops.length - 1];
        if (prevStop && time < prevStop.time)
          throw mError(
            `go.stop() times must not decrease along the spine (got ${time} after ${prevStop.time})`,
          );
        if (!b.compound) {
          if (expr.args.length !== 3)
            throw mError('go.stop() expects 3 arguments (time, offset, continuity)');
          const offset = evaluateExpression(expr.args[1], scope);
          const cont = evaluateExpression(expr.args[2], scope);
          if (typeof offset !== 'number') throw mError('go.stop() offset must be a number');
          if (!validContinuity(cont)) throw mError('go.stop() continuity must be a CurveContinuity value');
          b.stops.push({ time, offset1: offset, continuity1: cont });
        } else {
          if (expr.args.length !== 5)
            throw mError('go.stop() expects 5 arguments (time, offset1, continuity1, offset2, continuity2)');
          const o1 = evaluateExpression(expr.args[1], scope);
          const c1 = evaluateExpression(expr.args[2], scope);
          const o2 = evaluateExpression(expr.args[3], scope);
          const c2 = evaluateExpression(expr.args[4], scope);
          if (typeof o1 !== 'number' || typeof o2 !== 'number') throw mError('go.stop() offsets must be numbers');
          if (!validContinuity(c1) || !validContinuity(c2))
            throw mError('go.stop() continuity arguments must be CurveContinuity values');
          b.stops.push({ time, offset1: o1, continuity1: c1, offset2: o2, continuity2: c2 });
        }
        return b;
      }
      case 'startTangent':
      case 'endTangent': {
        if (b.compound)
          throw mError(
            `go.${expr.method}() is only available in the simple variableOffset() — compoundVariableOffset() ends are shaped by startCap()/endCap()`,
          );
        if (expr.args.length !== 1) throw mError(`go.${expr.method}() expects 1 argument (PolarVector)`);
        const v = evaluateExpression(expr.args[0], scope);
        if (!isPolarVectorValue(v)) throw mError(`go.${expr.method}() argument must be a PolarVector`);
        if (expr.method === 'startTangent') b.startTangent = v;
        else b.endTangent = v;
        return b;
      }
      case 'startCap':
      case 'endCap': {
        if (!b.compound)
          throw mError(`go.${expr.method}() is only available inside compoundVariableOffset()`);
        if (expr.args.length !== 1) throw mError(`go.${expr.method}() expects 1 argument (Cap)`);
        const v = evaluateExpression(expr.args[0], scope);
        if (!isCapValue(v)) throw mError(`go.${expr.method}() argument must be a Cap (e.g. Cap.round())`);
        if (expr.method === 'startCap') b.startCap = v;
        else b.endCap = v;
        return b;
      }
      default:
        throw mError(`Unknown variableOffset builder method: ${expr.method}`);
    }
  }

  // Cycler methods
  if (isCyclerValue(obj)) {
    switch (expr.method) {
      case 'pick': {
        if (expr.args.length !== 0) throw mError('pick() expects 0 arguments');
        const value = obj.elements[obj.index];
        obj.index = (obj.index + 1) % obj.elements.length;
        return value;
      }
      default:
        throw mError(`Unknown Cycler method: ${expr.method}`);
    }
  }

  // SVGFragmentValue methods
  if (isSVGFragmentValue(obj)) {
    switch (expr.method) {
      case 'insert': {
        if (expr.args.length !== 0) throw mError('insert() expects 0 arguments');
        if (!scope.evalState) throw mError('insert() requires evaluation context');
        // Generate unique fragment layer name
        let counter = 1;
        let name = `__fragment_${counter}`;
        while (scope.evalState.layers.has(name)) {
          counter++;
          name = `__fragment_${counter}`;
        }
        const fragmentLayer: FragmentLayerState = {
          name,
          layerType: 'FragmentLayer',
          isDefault: false as const,
          styles: {},
          defsContent: obj.defsContent,
          visualContent: obj.visualContent,
        };
        scope.evalState.layers.set(name, fragmentLayer);
        scope.evalState.layerOrder.push(name);
        return 0;
      }
      default:
        throw mError(`Unknown SVGDocumentFragment method: ${expr.method}`);
    }
  }

  // MaskValue methods
  if (isMaskValue(obj)) {
    switch (expr.method) {
      case 'append': {
        if (expr.args.length < 1 || expr.args.length > 2)
          throw mError('Mask.append() expects 1-2 arguments (path, styles?)');
        const pathArg = evaluateExpression(expr.args[0], scope);
        let commands: PathBlockCommand[];
        if (isProjectedPathValue(pathArg)) {
          commands = pathArg.commands;
        } else if (isPathBlockValue(pathArg)) {
          commands = projectCommands(pathArg.commands, 0, 0);
        } else {
          throw mError('Mask.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commandsToAbsoluteD(commands);
        let styles: Record<string, string> = {};
        if (expr.args.length === 2) {
          const styleArg = evaluateExpression(expr.args[1], scope);
          if (!isStyleBlock(styleArg)) throw mError('Mask.append() second argument must be a style block');
          styles = { ...styleArg.properties };
        }
        obj.paths.push({ d, styles });
        return 0;
      }
      default:
        throw mError(`Unknown Mask method: ${expr.method}`);
    }
  }

  // ClipPathValue methods
  if (isClipPathValue(obj)) {
    switch (expr.method) {
      case 'append': {
        if (expr.args.length !== 1) throw mError('ClipPath.append() expects 1 argument (path)');
        const pathArg = evaluateExpression(expr.args[0], scope);
        let commands: PathBlockCommand[];
        if (isProjectedPathValue(pathArg)) {
          commands = pathArg.commands;
        } else if (isPathBlockValue(pathArg)) {
          commands = projectCommands(pathArg.commands, 0, 0);
        } else {
          throw mError('ClipPath.append() argument must be a PathBlock or ProjectedPath');
        }
        const d = commandsToAbsoluteD(commands);
        obj.paths.push(d);
        return 0;
      }
      default:
        throw mError(`Unknown ClipPath method: ${expr.method}`);
    }
  }

  // PatternValue methods
  if (isPatternValue(obj)) {
    switch (expr.method) {
      case 'append': {
        if (expr.args.length < 1 || expr.args.length > 2)
          throw mError('Pattern.append() expects 1-2 arguments (path, styles?)');
        const pathArg = evaluateExpression(expr.args[0], scope);
        let commands: PathBlockCommand[];
        if (isProjectedPathValue(pathArg)) {
          commands = pathArg.commands;
        } else if (isPathBlockValue(pathArg)) {
          commands = projectCommands(pathArg.commands, 0, 0);
        } else {
          throw mError('Pattern.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commandsToAbsoluteD(commands);
        let styles: Record<string, string> = {};
        if (expr.args.length === 2) {
          const styleArg = evaluateExpression(expr.args[1], scope);
          if (!isStyleBlock(styleArg)) throw mError('Pattern.append() second argument must be a style block');
          styles = { ...styleArg.properties };
        }
        obj.paths.push({ d, styles });
        return 0;
      }
      default:
        throw mError(`Unknown Pattern method: ${expr.method}`);
    }
  }

  // MarkerValue methods
  if (isMarkerValue(obj)) {
    switch (expr.method) {
      case 'append': {
        if (expr.args.length < 1 || expr.args.length > 2)
          throw mError('Marker.append() expects 1-2 arguments (path, styles?)');
        const pathArg = evaluateExpression(expr.args[0], scope);
        let commands: PathBlockCommand[];
        if (isProjectedPathValue(pathArg)) {
          commands = pathArg.commands;
        } else if (isPathBlockValue(pathArg)) {
          commands = projectCommands(pathArg.commands, 0, 0);
        } else {
          throw mError('Marker.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commandsToAbsoluteD(commands);
        let styles: Record<string, string> = {};
        if (expr.args.length === 2) {
          const styleArg = evaluateExpression(expr.args[1], scope);
          if (!isStyleBlock(styleArg)) throw mError('Marker.append() second argument must be a style block');
          styles = { ...styleArg.properties };
        }
        obj.paths.push({ d, styles });
        return 0;
      }
      default:
        throw mError(`Unknown Marker method: ${expr.method}`);
    }
  }

  // GridValue methods
  if (isGridValue(obj)) {
    switch (expr.method) {
      case 'get': {
        if (expr.args.length !== 2) throw mError('Grid.get() expects 2 arguments (row, col)');
        const r = evaluateExpression(expr.args[0], scope);
        const c = evaluateExpression(expr.args[1], scope);
        if (typeof r !== 'number' || typeof c !== 'number') throw mError('Grid.get() arguments must be numbers');
        if (!Number.isInteger(r) || !Number.isInteger(c)) throw mError('Grid.get() arguments must be integers');
        if (r < 0 || r >= obj.rows || c < 0 || c >= obj.cols) {
          throw mError(`Grid.get(${r}, ${c}) out of bounds for ${obj.rows}×${obj.cols} grid`);
        }
        return obj.cells[r][c];
      }
      case 'set': {
        if (expr.args.length !== 3) throw mError('Grid.set() expects 3 arguments (row, col, value)');
        const r = evaluateExpression(expr.args[0], scope);
        const c = evaluateExpression(expr.args[1], scope);
        const v = evaluateExpression(expr.args[2], scope);
        if (typeof r !== 'number' || typeof c !== 'number') throw mError('Grid.set() row/col must be numbers');
        if (!Number.isInteger(r) || !Number.isInteger(c)) throw mError('Grid.set() row/col must be integers');
        if (r < 0 || r >= obj.rows || c < 0 || c >= obj.cols) {
          throw mError(`Grid.set(${r}, ${c}) out of bounds for ${obj.rows}×${obj.cols} grid`);
        }
        obj.cells[r][c] = v;
        return obj;
      }
      case 'getPoint': {
        if (expr.args.length !== 2) throw mError('Grid.getPoint() expects 2 arguments (row, col)');
        const r = evaluateExpression(expr.args[0], scope);
        const c = evaluateExpression(expr.args[1], scope);
        if (typeof r !== 'number' || typeof c !== 'number') throw mError('Grid.getPoint() arguments must be numbers');
        if (!Number.isInteger(r) || !Number.isInteger(c)) throw mError('Grid.getPoint() arguments must be integers');
        if (r < 0 || r >= obj.rows || c < 0 || c >= obj.cols) {
          throw mError(`Grid.getPoint(${r}, ${c}) out of bounds for ${obj.rows}×${obj.cols} grid`);
        }
        return {
          type: 'PointValue' as const,
          x: obj.origin.x + (c + 0.5) * obj.xDim,
          y: obj.origin.y + (r + 0.5) * obj.yDim,
        };
      }
      case 'getRow': {
        if (expr.args.length !== 1) throw mError('Grid.getRow() expects 1 argument (row)');
        const r = evaluateExpression(expr.args[0], scope);
        if (typeof r !== 'number' || !Number.isInteger(r)) throw mError('Grid.getRow() argument must be an integer');
        if (r < 0 || r >= obj.rows) throw mError(`Grid.getRow(${r}) out of bounds for grid with ${obj.rows} rows`);
        return { type: 'ArrayValue' as const, elements: [...obj.cells[r]] };
      }
      case 'getCol': {
        if (expr.args.length !== 1) throw mError('Grid.getCol() expects 1 argument (col)');
        const c = evaluateExpression(expr.args[0], scope);
        if (typeof c !== 'number' || !Number.isInteger(c)) throw mError('Grid.getCol() argument must be an integer');
        if (c < 0 || c >= obj.cols) throw mError(`Grid.getCol(${c}) out of bounds for grid with ${obj.cols} columns`);
        return { type: 'ArrayValue' as const, elements: obj.cells.map((row) => row[c]) };
      }
      case 'cells': {
        if (expr.args.length !== 0) throw mError('Grid.cells() does not take arguments');
        const flat: Value[] = [];
        for (let r = 0; r < obj.rows; r++) for (let c = 0; c < obj.cols; c++) flat.push(obj.cells[r][c]);
        return { type: 'ArrayValue' as const, elements: flat };
      }
      case 'fill': {
        const cb = resolveCallbackBlock(expr, scope, workerExpr);
        if (!cb) throw mError('Grid.fill() requires a trailing block or a << worker: grid.fill {|row, col, center| return ...; } or grid.fill() << f');
        if (cb.extraArgs !== 0) throw mError('Grid.fill() takes no arguments besides the callback');
        const params = cb.params;
        const body = cb.body;
        const callLine = getLine(expr);
        // Commands emitted inside a fill body are discarded (fill computes cell
        // values). Reuse one throwaway accum rather than allocating per cell.
        const fillSink = createPathStore();
        for (let r = 0; r < obj.rows; r++) {
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], r);
            if (params.length > 1) setVariable(blockScope, params[1], c);
            if (params.length > 2) {
              const center: PointValue = {
                type: 'PointValue',
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              };
              setVariable(blockScope, params[2], center);
            }
            try {
              const res = evaluateGridCellBody(body, blockScope, fillSink);
              obj.cells[r][c] = res.returned ? res.value : null;
            } catch (e) {
              if (e instanceof ReturnSignal) {
                obj.cells[r][c] = e.value;
              } else {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(formatError(`Error in Grid.fill() callback at (${r}, ${c}): ${msg}`, callLine));
              }
            }
          }
        }
        return obj;
      }
      case 'forEach': {
        const cb = resolveCallbackBlock(expr, scope, workerExpr);
        if (!cb) throw mError('Grid.forEach() requires a trailing block or a << worker: grid.forEach {|cell, row, col| ... } or grid.forEach() << f');
        if (cb.extraArgs !== 0) throw mError('Grid.forEach() takes no arguments besides the callback');
        const params = cb.params;
        const callLine = getLine(expr);
        // Thread the active layer's accum so drawTo/path commands inside the block
        // emit to the surrounding layer.apply { ... }, matching for-loop semantics.
        let blockAccum = createPathStore();
        if (scope.evalState?.activeLayerName) {
          const activeLayer = scope.evalState.layers.get(scope.evalState.activeLayerName);
          if (activeLayer && activeLayer.layerType === 'PathLayer') {
            blockAccum = (activeLayer as PathLayerState).accum;
          }
        }
        for (let r = 0; r < obj.rows; r++) {
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], obj.cells[r][c]);
            if (params.length > 1) setVariable(blockScope, params[1], r);
            if (params.length > 2) setVariable(blockScope, params[2], c);
            if (params.length > 3) {
              const center: PointValue = {
                type: 'PointValue',
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              };
              setVariable(blockScope, params[3], center);
            }
            try {
              evaluateGridCellBody(cb.body, blockScope, blockAccum);
            } catch (e) {
              if (e instanceof ReturnSignal) {
                // forEach ignores returns
              } else {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(formatError(`Error in Grid.forEach() callback at (${r}, ${c}): ${msg}`, callLine));
              }
            }
          }
        }
        return null;
      }
      case 'map': {
        const cb = resolveCallbackBlock(expr, scope, workerExpr);
        if (!cb) throw mError('Grid.map() requires a trailing block or a << worker: grid.map {|cell, row, col| return ...; } or grid.map() << f');
        if (cb.extraArgs !== 0) throw mError('Grid.map() takes no arguments besides the callback');
        const params = cb.params;
        const callLine = getLine(expr);
        const newCells: Value[][] = [];
        // Commands emitted inside a map body are discarded (map computes cell
        // values). Reuse one throwaway accum rather than allocating per cell.
        const mapSink = createPathStore();
        for (let r = 0; r < obj.rows; r++) {
          const row: Value[] = [];
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], obj.cells[r][c]);
            if (params.length > 1) setVariable(blockScope, params[1], r);
            if (params.length > 2) setVariable(blockScope, params[2], c);
            if (params.length > 3) {
              const center: PointValue = {
                type: 'PointValue',
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              };
              setVariable(blockScope, params[3], center);
            }
            let cellResult: Value = null;
            try {
              const res = evaluateGridCellBody(cb.body, blockScope, mapSink);
              if (res.returned) cellResult = res.value;
            } catch (e) {
              if (e instanceof ReturnSignal) {
                cellResult = e.value;
              } else {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(formatError(`Error in Grid.map() callback at (${r}, ${c}): ${msg}`, callLine));
              }
            }
            row.push(cellResult);
          }
          newCells.push(row);
        }
        return {
          type: 'GridValue' as const,
          rows: obj.rows,
          cols: obj.cols,
          xDim: obj.xDim,
          yDim: obj.yDim,
          origin: obj.origin,
          outOfBounds: obj.outOfBounds,
          interpolation: obj.interpolation,
          cells: newCells,
        };
      }
      case 'sampleNearest': {
        if (expr.args.length !== 2) throw mError('Grid.sampleNearest() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number' || typeof y !== 'number') throw mError('Grid.sampleNearest() arguments must be numbers');
        return gridSampleNearest(obj, x, y);
      }
      case 'sampleBilinear': {
        if (expr.args.length !== 2) throw mError('Grid.sampleBilinear() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number' || typeof y !== 'number') throw mError('Grid.sampleBilinear() arguments must be numbers');
        return gridSampleBilinear(obj, x, y, mError);
      }
      case 'sample': {
        if (expr.args.length !== 2) throw mError('Grid.sample() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number' || typeof y !== 'number') throw mError('Grid.sample() arguments must be numbers');
        if (obj.interpolation === 'bilinear') return gridSampleBilinear(obj, x, y, mError);
        return gridSampleNearest(obj, x, y);
      }
      default:
        throw mError(`Unknown Grid method: ${expr.method}`);
    }
  }

  // GradientValue methods
  if (isGradientValue(obj)) {
    switch (expr.method) {
      case 'stop': {
        if (expr.args.length !== 2) throw mError('Gradient.stop() expects 2 arguments (offset, color)');
        const offset = evaluateExpression(expr.args[0], scope);
        const color = evaluateExpression(expr.args[1], scope);
        if (typeof offset !== 'number') throw mError('stop() offset must be a number');
        if (!isColorValue(color)) throw mError('stop() color must be a Color value');
        if (color.cssVar) {
          const fallbackCSS = oklchToCSS(color.oklch);
          obj.stops.push({ offset, color: `var(${color.cssVar.varName}, ${fallbackCSS})` });
        } else {
          obj.stops.push({ offset, color: oklchToCSS(color.oklch), oklch: { ...color.oklch } });
        }
        return 0;
      }
      case 'inherit': {
        if (expr.args.length !== 1) throw mError('Gradient.inherit() expects 1 argument (newId)');
        const newId = evaluateExpression(expr.args[0], scope);
        if (typeof newId !== 'string') throw mError('Gradient.inherit() argument must be a string');
        if (!scope.evalState) throw mError('Gradient.inherit() requires evaluation context');
        if (
          scope.evalState.masks.has(newId) ||
          scope.evalState.clipPaths.has(newId) ||
          scope.evalState.gradients.has(newId) ||
          scope.evalState.patterns.has(newId) ||
          scope.evalState.markers.has(newId) ||
          scope.evalState.filters.has(newId)
        ) {
          throw new Error(
            `Duplicate defs ID '${newId}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`,
          );
        }
        const child: GradientValue = {
          type: 'GradientValue',
          gradientType: obj.gradientType,
          id: newId,
          attrs: { ...obj.attrs },
          stops: [],
          href: obj.id,
          interpolation: obj.interpolation,
          steps: obj.steps,
          // Propagate conic fields
          from: obj.from,
          to: obj.to,
          direction: obj.direction,
          spread: obj.spread,
          innerRadius: obj.innerRadius,
          innerFill: obj.innerFill,
        };
        scope.evalState.gradients.set(newId, child);
        return child;
      }
      // Mesh-specific methods
      case 'getPoint': {
        if (obj.gradientType !== 'mesh') throw mError('getPoint() is only available on MeshGradient');
        if (expr.args.length !== 2) throw mError('getPoint() expects 2 arguments (row, col)');
        const row = evaluateExpression(expr.args[0], scope);
        const col = evaluateExpression(expr.args[1], scope);
        if (typeof row !== 'number' || typeof col !== 'number') throw mError('getPoint() arguments must be numbers');
        const grid = obj.meshGrid!;
        if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
          throw mError(`getPoint(${row}, ${col}) out of bounds for ${grid.length}×${grid[0].length} grid`);
        }
        return grid[row][col];
      }
      case 'getRow': {
        if (obj.gradientType !== 'mesh') throw mError('getRow() is only available on MeshGradient');
        if (expr.args.length !== 1) throw mError('getRow() expects 1 argument (row)');
        const row = evaluateExpression(expr.args[0], scope);
        if (typeof row !== 'number') throw mError('getRow() argument must be a number');
        const grid = obj.meshGrid!;
        if (row < 0 || row >= grid.length) {
          throw mError(`getRow(${row}) out of bounds for grid with ${grid.length} rows`);
        }
        return { type: 'ArrayValue' as const, elements: [...grid[row]] };
      }
      case 'getCol': {
        if (obj.gradientType !== 'mesh') throw mError('getCol() is only available on MeshGradient');
        if (expr.args.length !== 1) throw mError('getCol() expects 1 argument (col)');
        const col = evaluateExpression(expr.args[0], scope);
        if (typeof col !== 'number') throw mError('getCol() argument must be a number');
        const grid = obj.meshGrid!;
        if (col < 0 || col >= grid[0].length) {
          throw mError(`getCol(${col}) out of bounds for grid with ${grid[0].length} columns`);
        }
        return { type: 'ArrayValue' as const, elements: grid.map((r) => r[col]) };
      }
      case 'colorAll': {
        if (obj.gradientType !== 'mesh') throw mError('colorAll() is only available on MeshGradient');
        if (expr.args.length !== 1) throw mError('colorAll() expects 1 argument (color)');
        const color = evaluateExpression(expr.args[0], scope);
        if (!isColorValue(color)) throw mError('colorAll() argument must be a Color value');
        const css = oklchToCSS(color.oklch);
        for (const row of obj.meshGrid!) {
          for (const pt of row) {
            pt.color = { ...color.oklch };
            pt.colorCSS = css;
          }
        }
        return 0;
      }
      // Freeform-specific methods
      case 'point': {
        if (obj.gradientType !== 'freeform') throw mError('point() is only available on FreeformGradient');
        if (expr.args.length !== 3) throw mError('point() expects 3 arguments (x, y, color)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        const color = evaluateExpression(expr.args[2], scope);
        if (typeof x !== 'number' || typeof y !== 'number') throw mError('point() x and y must be numbers');
        if (!isColorValue(color)) throw mError('point() third argument must be a Color value');
        obj.freeformPoints!.push({
          x,
          y,
          color: { ...color.oklch },
          colorCSS: oklchToCSS(color.oklch),
        });
        return 0;
      }
      // Topo-specific methods
      case 'contour': {
        if (obj.gradientType !== 'topo') throw mError('.contour() is only available on TopoGradient');
        if (expr.args.length !== 3) throw mError('.contour() expects 3 arguments (path, elevation, color)');
        const pathVal = evaluateExpression(expr.args[0], scope);
        const elevation = evaluateExpression(expr.args[1], scope);
        const color = evaluateExpression(expr.args[2], scope);
        if (!isProjectedPathValue(pathVal))
          throw mError('.contour() first argument must be a ProjectedPathValue (use .project(x, y) on a path block)');
        if (typeof elevation !== 'number') throw mError('.contour() elevation must be a number');
        if (elevation < 0 || elevation > 1) throw mError('.contour() elevation must be between 0 and 1');
        if (!isColorValue(color)) throw mError('.contour() third argument must be a Color value');
        // Validate path is closed
        const cmds = pathVal.commands;
        if (cmds.length === 0 || cmds[cmds.length - 1].command !== 'z')
          throw mError('.contour() path must be closed (end with closePath())');
        const dString = commandsToAbsoluteD(cmds);
        obj.topoContours!.push({
          elevation,
          commands: cmds.map((c) => ({
            command: c.command,
            args: [...c.args],
            start: { ...c.start },
            end: { ...c.end },
          })),
          dString,
          color: { ...color.oklch },
          colorCSS: oklchToCSS(color.oklch),
        });
        return 0;
      }
      default:
        throw mError(`Unknown Gradient method: ${expr.method}`);
    }
  }

  // MeshPointValue methods
  if (isMeshPointValue(obj)) {
    switch (expr.method) {
      case 'translate': {
        if (expr.args.length !== 2) throw mError('translate() expects 2 arguments (dx, dy)');
        const dx = evaluateExpression(expr.args[0], scope);
        const dy = evaluateExpression(expr.args[1], scope);
        if (typeof dx !== 'number' || typeof dy !== 'number') throw mError('translate() arguments must be numbers');
        obj.x += dx;
        obj.y += dy;
        return 0;
      }
      default:
        throw mError(`Unknown MeshPoint method: ${expr.method}`);
    }
  }

  // Color methods
  if (isColorValue(obj)) {
    switch (expr.method) {
      case 'lighten': {
        if (expr.args.length !== 1) throw mError('lighten() expects 1 argument');
        const amount = evaluateExpression(expr.args[0], scope);
        if (typeof amount !== 'number') throw mError('lighten() amount must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: lighten(obj.oklch, amount),
          cssExpr: src ? lightenCSS(src, amount) : undefined,
        };
      }
      case 'darken': {
        if (expr.args.length !== 1) throw mError('darken() expects 1 argument');
        const amount = evaluateExpression(expr.args[0], scope);
        if (typeof amount !== 'number') throw mError('darken() amount must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: darken(obj.oklch, amount),
          cssExpr: src ? darkenCSS(src, amount) : undefined,
        };
      }
      case 'saturate': {
        if (expr.args.length !== 1) throw mError('saturate() expects 1 argument');
        const factor = evaluateExpression(expr.args[0], scope);
        if (typeof factor !== 'number') throw mError('saturate() factor must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: saturate(obj.oklch, factor),
          cssExpr: src ? saturateCSS(src, factor) : undefined,
        };
      }
      case 'desaturate': {
        if (expr.args.length !== 1) throw mError('desaturate() expects 1 argument');
        const factor = evaluateExpression(expr.args[0], scope);
        if (typeof factor !== 'number') throw mError('desaturate() factor must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: desaturate(obj.oklch, factor),
          cssExpr: src ? desaturateCSS(src, factor) : undefined,
        };
      }
      case 'alpha': {
        if (expr.args.length !== 1) throw mError('alpha() expects 1 argument');
        const a = evaluateExpression(expr.args[0], scope);
        if (typeof a !== 'number') throw mError('alpha() value must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return { type: 'ColorValue', oklch: setAlpha(obj.oklch, a), cssExpr: src ? setAlphaCSS(src, a) : undefined };
      }
      case 'hueShift': {
        if (expr.args.length !== 1) throw mError('hueShift() expects 1 argument');
        const raw = evaluateExpression(expr.args[0], scope);
        const degrees = colorAngleDegrees(raw);
        if (degrees === undefined) throw mError('hueShift() degrees must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: hueShift(obj.oklch, degrees),
          cssExpr: src ? hueShiftCSS(src, degrees) : undefined,
        };
      }
      case 'complement': {
        if (expr.args.length !== 0) throw mError('complement() expects 0 arguments');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        return {
          type: 'ColorValue',
          oklch: hueShift(obj.oklch, 180),
          cssExpr: src ? hueShiftCSS(src, 180) : undefined,
        };
      }
      case 'mix': {
        if (expr.args.length !== 2) throw mError('mix() expects 2 arguments');
        const other = evaluateExpression(expr.args[0], scope);
        const t = evaluateExpression(expr.args[1], scope);
        if (!isColorValue(other)) throw mError('mix() first argument must be a Color');
        if (typeof t !== 'number') throw mError('mix() second argument (ratio) must be a number');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        const otherSrc = cssSourceExpr(other.cssVar, other.cssExpr);
        const cssExpr = src ? mixCSS(src, otherSrc || oklchToCSS(other.oklch), t) : undefined;
        return { type: 'ColorValue', oklch: mixColors(obj.oklch, other.oklch, t), cssExpr };
      }
      case 'flatten': {
        if (expr.args.length > 1) throw mError('flatten() expects 0 or 1 arguments');
        let bg: ColorValue = { type: 'ColorValue', oklch: { L: 1, C: 0, H: 0, alpha: 1 } };
        if (expr.args.length === 1) {
          const arg = evaluateExpression(expr.args[0], scope);
          if (!isColorValue(arg)) throw mError('flatten() background must be a Color');
          bg = arg;
        }
        if (obj.cssVar || obj.cssExpr || obj.lightDark || bg.cssVar || bg.cssExpr || bg.lightDark) {
          throw mError(
            'flatten() cannot be used with theme-dynamic colors (CSSVar or Color.lightDark) — CSS has no alpha-compositing expression, so the result could not follow the theme. Flatten the underlying static color instead.'
          );
        }
        return { type: 'ColorValue', oklch: flattenColor(obj.oklch, bg.oklch) };
      }
      case 'analogous': {
        if (expr.args.length > 1) throw mError('analogous() expects 0 or 1 arguments');
        let angle = 30;
        if (expr.args.length === 1) {
          const a = evaluateExpression(expr.args[0], scope);
          const d = colorAngleDegrees(a);
          if (d === undefined) throw mError('analogous() angle must be a number');
          angle = d;
        }
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        const colors: ColorValue[] = [
          {
            type: 'ColorValue',
            oklch: hueShift(obj.oklch, -angle),
            cssExpr: src ? hueShiftCSS(src, -angle) : undefined,
          },
          { type: 'ColorValue', oklch: obj.oklch, cssVar: obj.cssVar, cssExpr: obj.cssExpr },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, angle), cssExpr: src ? hueShiftCSS(src, angle) : undefined },
        ];
        return { type: 'ArrayValue', elements: colors };
      }
      case 'triadic': {
        if (expr.args.length !== 0) throw mError('triadic() expects 0 arguments');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        const colors: ColorValue[] = [
          { type: 'ColorValue', oklch: obj.oklch, cssVar: obj.cssVar, cssExpr: obj.cssExpr },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, 120), cssExpr: src ? hueShiftCSS(src, 120) : undefined },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, 240), cssExpr: src ? hueShiftCSS(src, 240) : undefined },
        ];
        return { type: 'ArrayValue', elements: colors };
      }
      case 'tetradic': {
        if (expr.args.length !== 0) throw mError('tetradic() expects 0 arguments');
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        const colors: ColorValue[] = [
          { type: 'ColorValue', oklch: obj.oklch, cssVar: obj.cssVar, cssExpr: obj.cssExpr },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, 90), cssExpr: src ? hueShiftCSS(src, 90) : undefined },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, 180), cssExpr: src ? hueShiftCSS(src, 180) : undefined },
          { type: 'ColorValue', oklch: hueShift(obj.oklch, 270), cssExpr: src ? hueShiftCSS(src, 270) : undefined },
        ];
        return { type: 'ArrayValue', elements: colors };
      }
      case 'splitComplementary': {
        if (expr.args.length > 1) throw mError('splitComplementary() expects 0 or 1 arguments');
        let angle = 30;
        if (expr.args.length === 1) {
          const a = evaluateExpression(expr.args[0], scope);
          const d = colorAngleDegrees(a);
          if (d === undefined) throw mError('splitComplementary() angle must be a number');
          angle = d;
        }
        const src = cssSourceExpr(obj.cssVar, obj.cssExpr);
        const colors: ColorValue[] = [
          { type: 'ColorValue', oklch: obj.oklch, cssVar: obj.cssVar, cssExpr: obj.cssExpr },
          {
            type: 'ColorValue',
            oklch: hueShift(obj.oklch, 180 - angle),
            cssExpr: src ? hueShiftCSS(src, 180 - angle) : undefined,
          },
          {
            type: 'ColorValue',
            oklch: hueShift(obj.oklch, 180 + angle),
            cssExpr: src ? hueShiftCSS(src, 180 + angle) : undefined,
          },
        ];
        return { type: 'ArrayValue', elements: colors };
      }
      default:
        throw mError(`Unknown Color method: ${expr.method}`);
    }
  }

  // ColorNamespace methods (Color.mix, Color.palette)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ColorNamespace') {
    switch (expr.method) {
      case 'mix': {
        if (expr.args.length !== 3) throw mError('Color.mix() expects 3 arguments');
        const c1 = evaluateExpression(expr.args[0], scope);
        const c2 = evaluateExpression(expr.args[1], scope);
        const t = evaluateExpression(expr.args[2], scope);
        if (!isColorValue(c1)) throw mError('Color.mix() first argument must be a Color');
        if (!isColorValue(c2)) throw mError('Color.mix() second argument must be a Color');
        if (typeof t !== 'number') throw mError('Color.mix() third argument (ratio) must be a number');
        const src1 = cssSourceExpr(c1.cssVar, c1.cssExpr);
        const src2 = cssSourceExpr(c2.cssVar, c2.cssExpr);
        const cssExpr =
          src1 || src2 ? mixCSS(src1 || oklchToCSS(c1.oklch), src2 || oklchToCSS(c2.oklch), t) : undefined;
        return { type: 'ColorValue', oklch: mixColors(c1.oklch, c2.oklch, t), cssExpr };
      }
      case 'palette': {
        if (expr.args.length === 2) {
          // Lightness ramp: Color.palette(color, n)
          const c = evaluateExpression(expr.args[0], scope);
          const n = evaluateExpression(expr.args[1], scope);
          if (!isColorValue(c)) throw mError('Color.palette() first argument must be a Color');
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 2)
            throw mError('Color.palette() count must be an integer >= 2');
          const src = cssSourceExpr(c.cssVar, c.cssExpr);
          const colors: ColorValue[] = [];
          for (let i = 0; i < n; i++) {
            const L = Math.round((0.15 + 0.8 * (i / (n - 1))) * 1000) / 1000;
            colors.push({
              type: 'ColorValue',
              oklch: { ...c.oklch, L },
              cssExpr: src ? setLightnessCSS(src, L) : undefined,
            });
          }
          return { type: 'ArrayValue', elements: colors };
        }
        if (expr.args.length === 3) {
          // Interpolation: Color.palette(c1, c2, n)
          const c1 = evaluateExpression(expr.args[0], scope);
          const c2 = evaluateExpression(expr.args[1], scope);
          const n = evaluateExpression(expr.args[2], scope);
          if (!isColorValue(c1)) throw mError('Color.palette() first argument must be a Color');
          if (!isColorValue(c2)) throw mError('Color.palette() second argument must be a Color');
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 2)
            throw mError('Color.palette() count must be an integer >= 2');
          const src1 = cssSourceExpr(c1.cssVar, c1.cssExpr);
          const src2 = cssSourceExpr(c2.cssVar, c2.cssExpr);
          const colors: ColorValue[] = [];
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const cssExpr =
              src1 || src2 ? mixCSS(src1 || oklchToCSS(c1.oklch), src2 || oklchToCSS(c2.oklch), t) : undefined;
            colors.push({
              type: 'ColorValue',
              oklch: mixColors(c1.oklch, c2.oklch, t),
              cssExpr,
            });
          }
          return { type: 'ArrayValue', elements: colors };
        }
        throw mError('Color.palette() expects 2 or 3 arguments');
      }
      case 'lightDark': {
        if (expr.args.length !== 2) throw mError('Color.lightDark() expects 2 arguments');
        const light = evaluateExpression(expr.args[0], scope);
        const dark = evaluateExpression(expr.args[1], scope);
        if (!isColorValue(light)) throw mError('Color.lightDark() first argument must be a Color');
        if (!isColorValue(dark)) throw mError('Color.lightDark() second argument must be a Color');
        const lightCSS = cssSourceExpr(light.cssVar, light.cssExpr) || oklchToCSS(light.oklch);
        const darkCSS = cssSourceExpr(dark.cssVar, dark.cssExpr) || oklchToCSS(dark.oklch);
        return { type: 'ColorValue', oklch: light.oklch, lightDark: { lightCSS, darkCSS } };
      }
      default:
        throw mError(`Unknown Color method: ${expr.method}`);
    }
  }

  // ObjectNamespace methods (Object.keys, Object.values, Object.entries, Object.delete)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ObjectNamespace') {
    const args = expr.args.map((a) => evaluateExpression(a, scope));
    switch (expr.method) {
      case 'keys': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw mError('Object.keys() expects 1 object argument');
        return { type: 'ArrayValue', elements: Array.from(args[0].properties.keys()) };
      }
      case 'values': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw mError('Object.values() expects 1 object argument');
        return { type: 'ArrayValue', elements: Array.from(args[0].properties.values()) };
      }
      case 'entries': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw mError('Object.entries() expects 1 object argument');
        const entries = Array.from(args[0].properties.entries()).map(([k, v]) => ({
          type: 'ArrayValue' as const,
          elements: [k, v] as Value[],
        }));
        return { type: 'ArrayValue', elements: entries };
      }
      case 'delete': {
        if (args.length !== 2 || !isObjectValue(args[0]))
          throw mError('Object.delete() expects 2 arguments (object, key)');
        const key = args[1];
        if (typeof key !== 'string') throw mError('Object.delete() key must be a string');
        const val = args[0].properties.get(key) ?? null;
        args[0].properties.delete(key);
        return val;
      }
      default:
        throw mError(`Unknown Object method: ${expr.method}`);
    }
  }

  // CapNamespace methods (Cap.butt, Cap.round, Cap.elliptical, Cap.tapered)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'CapNamespace') {
    switch (expr.method) {
      case 'butt': {
        if (expr.args.length !== 0) throw mError('Cap.butt() expects 0 arguments');
        return { type: 'CapValue' as const, cap: 'butt' };
      }
      case 'round': {
        if (expr.args.length !== 0) throw mError('Cap.round() expects 0 arguments');
        return { type: 'CapValue' as const, cap: 'round' };
      }
      case 'elliptical': {
        if (expr.args.length !== 1) throw mError('Cap.elliptical() expects 1 argument (projection)');
        const projection = evaluateExpression(expr.args[0], scope);
        if (typeof projection !== 'number') throw mError('Cap.elliptical() projection must be a number');
        if (projection <= 0)
          throw mError('Cap.elliptical() projection must be positive (use Cap.butt() for a flat end)');
        return { type: 'CapValue' as const, cap: 'elliptical', projection };
      }
      case 'tapered': {
        if (expr.args.length < 1 || expr.args.length > 2)
          throw mError('Cap.tapered() expects 1 or 2 arguments (length, continuity?)');
        const length = evaluateExpression(expr.args[0], scope);
        if (typeof length !== 'number') throw mError('Cap.tapered() length must be a number');
        let continuity: string | undefined;
        if (expr.args.length === 2) {
          const c = evaluateExpression(expr.args[1], scope);
          if (typeof c !== 'string' || !Object.values(BUILTIN_ENUMS.CurveContinuity).includes(c))
            throw mError('Cap.tapered() second argument must be a CurveContinuity value');
          continuity = c;
        }
        return { type: 'CapValue' as const, cap: 'tapered', length, continuity };
      }
      default:
        throw mError(`Unknown Cap method: ${expr.method}`);
    }
  }

  // PathBlockNamespace methods (PathBlock.fromGlyph)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'PathBlockNamespace') {
    switch (expr.method) {
      case 'fromGlyph': {
        if (expr.args.length !== 2) throw mError('PathBlock.fromGlyph() expects 2 arguments (text, styles)');
        const textArg = evaluateExpression(expr.args[0], scope);
        const stylesArg = evaluateExpression(expr.args[1], scope);
        if (typeof textArg !== 'string') throw mError('PathBlock.fromGlyph() first argument must be a string');
        if (typeof stylesArg !== 'object' || stylesArg === null || !('type' in stylesArg) || stylesArg.type !== 'StyleBlockValue') {
          throw mError('PathBlock.fromGlyph() second argument must be a style block');
        }
        const styles = (stylesArg as StyleBlockValue).properties;
        const fontFamily = styles['font-family']?.split(',')[0]?.trim()?.replace(/^['"]|['"]$/g, '');
        const fontSize = parseFloat(styles['font-size'] ?? '16') || 16;
        const fontWeight = parseInt(styles['font-weight'] ?? '400', 10) || 400;

        if (!fontFamily) throw mError('PathBlock.fromGlyph() requires font-family in style block');

        const registry = scope.evalState?.fontRegistry;
        if (!registry) {
          throw mError(
            'PathBlock.fromGlyph() requires font data, but no fonts were loaded. ' +
              'If you wrote an @font directive, font loading may have failed earlier — ' +
              'look for a preceding font-loading error.',
          );
        }

        if (!getFont(registry, fontFamily, fontWeight)) {
          const available = Array.from(registry.fonts.keys()).join(', ');
          throw mError(`Font '${fontFamily}' not found in font registry. Available fonts: ${available || 'none'}`);
        }

        // Convert each character to a PathBlockValue
        const glyphs: Value[] = [];
        for (const char of textArg) {
          const lookup = lookupGlyph(registry, fontFamily, fontWeight, 'normal', char, fontSize)!;
          const { commands, advanceWidth } = lookup;
          if (lookup.missing && scope.evalState) {
            recordMissingGlyph(scope.evalState, fontFamily, fontWeight, char);
          }

          if (commands.length === 0) {
            // Space or empty glyph — return an empty PathBlockValue with advanceWidth
            const pb: PathBlockValue = {
              type: 'PathBlockValue' as const,
              commands: [],
              records: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
            // Store advanceWidth + source char as expando properties
            (pb as PathBlockValue & { advanceWidth: number; char: string }).advanceWidth = advanceWidth;
            (pb as PathBlockValue & { advanceWidth: number; char: string }).char = char;
            glyphs.push(pb);
            continue;
          }

          // Normalize to (0,0) origin
          const normalized = buildPathBlockFromCommands(commands, { x: 0, y: 0 });
          // Attach advanceWidth + source char as expando properties
          (normalized as PathBlockValue & { advanceWidth: number; char: string }).advanceWidth = advanceWidth;
          (normalized as PathBlockValue & { advanceWidth: number; char: string }).char = char;
          glyphs.push(normalized);
        }

        return { type: 'ArrayValue' as const, elements: glyphs };
      }
      default:
        throw mError(`Unknown PathBlock method: ${expr.method}`);
    }
  }

  // ObjectValue methods
  if (isObjectValue(obj)) {
    if (expr.method === 'has') {
      if (expr.args.length !== 1) throw mError('has() expects 1 argument');
      const key = evaluateExpression(expr.args[0], scope);
      if (typeof key !== 'string') throw mError('has() argument must be a string');
      return boolVal(obj.properties.has(key));
    }
    throw mError(`Unknown object method: ${expr.method}`);
  }

  // String methods
  if (typeof obj === 'string') {
    switch (expr.method) {
      case 'empty': {
        if (expr.args.length !== 0) throw mError('empty() expects 0 arguments');
        return boolVal(obj.length === 0);
      }
      case 'split': {
        if (expr.args.length !== 0) throw mError('split() expects 0 arguments');
        const chars = Array.from(obj);
        return { type: 'ArrayValue' as const, elements: chars };
      }
      case 'append': {
        if (expr.args.length !== 1) throw mError('append() expects 1 argument');
        const val = evaluateExpression(expr.args[0], scope);
        if (typeof val !== 'string') throw mError('append() argument must be a string');
        return obj + val;
      }
      case 'prepend': {
        if (expr.args.length !== 1) throw mError('prepend() expects 1 argument');
        const val = evaluateExpression(expr.args[0], scope);
        if (typeof val !== 'string') throw mError('prepend() argument must be a string');
        return val + obj;
      }
      case 'includes': {
        if (expr.args.length !== 1) throw mError('includes() expects 1 argument');
        const val = evaluateExpression(expr.args[0], scope);
        if (typeof val !== 'string') throw mError('includes() argument must be a string');
        return boolVal(obj.includes(val));
      }
      case 'slice': {
        if (expr.args.length !== 2) throw mError('slice() expects 2 arguments');
        const start = evaluateExpression(expr.args[0], scope);
        const end = evaluateExpression(expr.args[1], scope);
        if (typeof start !== 'number' || typeof end !== 'number') {
          throw mError('slice() arguments must be numbers');
        }
        return obj.slice(start, end);
      }
      default:
        throw mError(`Unknown string method: ${expr.method}`);
    }
  }

  // Array methods
  if (!isArrayValue(obj)) {
    throw mError(`Cannot call method '${expr.method}' on non-array value`);
  }

  switch (expr.method) {
    case 'push': {
      if (expr.args.length !== 1) throw mError('push() expects 1 argument');
      if (isArrayLocked(obj)) throw mError(arrayMutationError('call push() on'));
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.push(val);
      return obj.elements.length;
    }
    case 'pop': {
      if (expr.args.length !== 0) throw mError('pop() expects 0 arguments');
      if (isArrayLocked(obj)) throw mError(arrayMutationError('call pop() on'));
      if (obj.elements.length === 0) return null;
      return obj.elements.pop()!;
    }
    case 'shift': {
      if (expr.args.length !== 0) throw mError('shift() expects 0 arguments');
      if (isArrayLocked(obj)) throw mError(arrayMutationError('call shift() on'));
      if (obj.elements.length === 0) return null;
      return obj.elements.shift()!;
    }
    case 'unshift': {
      if (expr.args.length !== 1) throw mError('unshift() expects 1 argument');
      if (isArrayLocked(obj)) throw mError(arrayMutationError('call unshift() on'));
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.unshift(val);
      return obj.elements.length;
    }
    case 'empty': {
      if (expr.args.length !== 0) throw mError('empty() expects 0 arguments');
      return boolVal(obj.elements.length === 0);
    }
    case 'map': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb) throw mError('map() requires a trailing block or a << worker: array.map {|item| return ...; } or array.map() << f');
      if (cb.extraArgs !== 0) throw mError('map() takes no arguments besides the callback');
      const result: Value[] = [];
      const mapParams = cb.params;
      const mapLine = getLine(expr);
      lockArray(obj);
      try {
        for (let i = 0; i < obj.elements.length; i++) {
          const blockScope = createScope(cb.closure ?? scope);
          setVariable(blockScope, mapParams[0], obj.elements[i]);
          if (mapParams.length > 1) setVariable(blockScope, mapParams[1], i);
          if (mapParams.length > 2) setVariable(blockScope, mapParams[2], obj);
          try {
            for (const stmt of cb.body) {
              // Callback bodies are break/continue boundaries (builder-enforced; defensive)
              const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
              if (flow) throw loopFlowBoundaryError(flow);
            }
            result.push(null); // no return → null
          } catch (e) {
            if (e instanceof ReturnSignal) {
              result.push(e.value);
            } else {
              // Wrap error with map iteration context
              const msg = e instanceof Error ? e.message : String(e);
              throw new Error(formatError(
                `Error in .map() callback at index ${i}: ${msg}`,
                mapLine,
              ));
            }
          }
        }
      } finally {
        unlockArray(obj);
      }
      return { type: 'ArrayValue' as const, elements: result };
    }
    case 'filter': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb) throw mError('filter() requires a trailing block or a << worker: array.filter {|item| return ...; } or array.filter() << f');
      if (cb.extraArgs !== 0) throw mError('filter() takes no arguments besides the callback');
      const kept: Value[] = [];
      const filterParams = cb.params;
      const filterLine = getLine(expr);
      lockArray(obj);
      try {
        for (let i = 0; i < obj.elements.length; i++) {
          const blockScope = createScope(cb.closure ?? scope);
          setVariable(blockScope, filterParams[0], obj.elements[i]);
          if (filterParams.length > 1) setVariable(blockScope, filterParams[1], i);
          if (filterParams.length > 2) setVariable(blockScope, filterParams[2], obj);
          let verdict: Value = null;
          try {
            for (const stmt of cb.body) {
              // Callback bodies are break/continue boundaries (builder-enforced; defensive)
              const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
              if (flow) throw loopFlowBoundaryError(flow);
            }
            // no return → null → falsy → dropped
          } catch (e) {
            if (e instanceof ReturnSignal) {
              verdict = e.value;
            } else {
              const msg = e instanceof Error ? e.message : String(e);
              throw new Error(formatError(
                `Error in .filter() callback at index ${i}: ${msg}`,
                filterLine,
              ));
            }
          }
          const verdictNum = toNumber(verdict);
          if (verdict !== null && (verdictNum !== undefined ? verdictNum !== 0 : Boolean(verdict))) {
            kept.push(obj.elements[i]);
          }
        }
      } finally {
        unlockArray(obj);
      }
      return { type: 'ArrayValue' as const, elements: kept };
    }
    case 'reduce': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb) throw mError('reduce() requires a trailing block or a << worker: array.reduce(init) {|acc, item| return acc; } or array.reduce(init) << f');
      if (cb.extraArgs !== 1) throw mError('reduce() expects 1 argument (initial value) plus the callback');
      let accumulator: Value = cb.leadingArgs[0];
      const reduceParams = cb.params;
      const reduceLine = getLine(expr);
      lockArray(obj);
      try {
        for (let i = 0; i < obj.elements.length; i++) {
          const blockScope = createScope(cb.closure ?? scope);
          setVariable(blockScope, reduceParams[0], accumulator);
          if (reduceParams.length > 1) setVariable(blockScope, reduceParams[1], obj.elements[i]);
          if (reduceParams.length > 2) setVariable(blockScope, reduceParams[2], i);
          if (reduceParams.length > 3) setVariable(blockScope, reduceParams[3], obj);
          try {
            for (const stmt of cb.body) {
              // Callback bodies are break/continue boundaries (builder-enforced; defensive)
              const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
              if (flow) throw loopFlowBoundaryError(flow);
            }
            accumulator = null; // no return → null
          } catch (e) {
            if (e instanceof ReturnSignal) {
              accumulator = e.value;
            } else {
              const msg = e instanceof Error ? e.message : String(e);
              throw new Error(formatError(
                `Error in .reduce() callback at index ${i}: ${msg}`,
                reduceLine,
              ));
            }
          }
        }
      } finally {
        unlockArray(obj);
      }
      return accumulator;
    }
    case 'mapSlice': {
      if (expr.args.length !== 1) throw mError('mapSlice() expects 1 argument (slice length)');
      if (expr.block) throw mError('mapSlice() does not take a trailing block');
      const lengthVal = evaluateExpression(expr.args[0], scope);
      if (typeof lengthVal !== 'number') throw mError('mapSlice() length must be a number');
      const len = Math.round(lengthVal);
      if (len < 1) throw mError('mapSlice() length must be at least 1');
      const sliceResult: Value[] = [];
      for (let i = 0; i < obj.elements.length; i++) {
        sliceResult.push({ type: 'ArrayValue' as const, elements: obj.elements.slice(i, i + len) });
      }
      return { type: 'ArrayValue' as const, elements: sliceResult };
    }
    case 'slice': {
      if (expr.args.length < 1 || expr.args.length > 2) throw mError('slice() expects 1-2 arguments');
      const startVal = evaluateExpression(expr.args[0], scope);
      if (typeof startVal !== 'number') throw mError('slice() start must be a number');
      let s = Math.round(startVal);
      if (s < 0) s = Math.max(0, obj.elements.length + s);
      if (expr.args.length === 2) {
        const endVal = evaluateExpression(expr.args[1], scope);
        if (typeof endVal !== 'number') throw mError('slice() end must be a number');
        let e = Math.round(endVal);
        if (e < 0) e = obj.elements.length + e;
        if (e < 0) e = -1; // clamp: nothing before index 0 is valid
        return { type: 'ArrayValue' as const, elements: obj.elements.slice(s, e + 1) };
      }
      return { type: 'ArrayValue' as const, elements: obj.elements.slice(s) };
    }
    case 'reverse': {
      if (expr.args.length !== 0) throw mError('reverse() expects 0 arguments');
      if (expr.block) throw mError('reverse() does not take a trailing block');
      return { type: 'ArrayValue' as const, elements: [...obj.elements].reverse() };
    }
    case 'seams': {
      if (expr.args.length !== 0) throw mError('seams() expects 0 arguments');
      if (expr.block) throw mError('seams() does not take a trailing block');
      // Collect seamId-carrying stretches per (id, element): within one
      // element a given id is one contiguous stretch; across elements the
      // same id is either the seam's TWIN (reversed-identical geometry —
      // deduped) or, after chained cuts, a genuinely distinct fragment of
      // an inherited seam (kept as its own entry).
      const seamStretches = new Map<number, { owner: Value; cmds: PathBlockCommand[] }[]>();
      for (const el of obj.elements) {
        if (typeof el !== 'object' || el === null || !('type' in el) || (el.type !== 'PathBlockValue' && el.type !== 'ProjectedPathValue')) {
          throw mError('seams() elements must each be a PathBlock or ProjectedPath (call it on the array cut() returns)');
        }
        for (const cmd of (el as PathBlockValue | ProjectedPathValue).commands) {
          const seamId = cmd.meta?.seamId;
          if (seamId === undefined) continue;
          let stretches = seamStretches.get(seamId);
          if (!stretches) {
            stretches = [];
            seamStretches.set(seamId, stretches);
          }
          const last = stretches[stretches.length - 1];
          if (last && last.owner === el) last.cmds.push(cmd);
          else stretches.push({ owner: el, cmds: [cmd] });
        }
      }
      const seamClose = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
      const chordSum = (cmds: PathBlockCommand[]) => cmds.reduce((sum, c) => sum + Math.hypot(c.end.x - c.start.x, c.end.y - c.start.y), 0);
      const isReversedTwin = (a: PathBlockCommand[], b: PathBlockCommand[]) =>
        a.length === b.length &&
        seamClose(a[0].start, b[b.length - 1].end) &&
        seamClose(a[a.length - 1].end, b[0].start) &&
        Math.abs(chordSum(a) - chordSum(b)) < 1e-6;
      const seamResults: PathBlockCommand[][] = [];
      for (const seamId of [...seamStretches.keys()].sort((idA, idB) => idA - idB)) {
        const accepted: PathBlockCommand[][] = [];
        for (const stretch of seamStretches.get(seamId)!) {
          if (accepted.some((have) => isReversedTwin(have, stretch.cmds))) continue;
          accepted.push(stretch.cmds);
        }
        seamResults.push(...accepted);
      }
      return {
        type: 'ArrayValue' as const,
        elements: seamResults.map((cmds) => {
          // A closed ring seam (cookie) closes properly so dashes wrap
          // and joins render at the seam's wrap point.
          const first = cmds[0];
          const tail = cmds[cmds.length - 1];
          const ringClosed = cmds.length > 1 && seamClose(first.start, tail.end) && tail.command.toLowerCase() !== 'z';
          const withClose = ringClosed
            ? [...cmds, { command: 'z', args: [], start: { ...tail.end }, end: { ...first.start } }]
            : cmds;
          return buildPathBlockFromCommands(withClose, { x: 0, y: 0 });
        }),
      };
    }
    case 'sort': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb && expr.args.length !== 0) {
        throw mError('sort() does not take arguments — use sort {|a, b| return ...; } or sort() << cmp for a custom order');
      }
      if (cb && cb.extraArgs !== 0) {
        throw mError('sort() takes no arguments besides the comparator');
      }
      const sorted = [...obj.elements];
      if (!cb) {
        const allNumbers = sorted.every((e) => toNumber(e) !== undefined);
        const allStrings = !allNumbers && sorted.every((e) => typeof e === 'string');
        if (!allNumbers && !allStrings) {
          throw mError(
            'sort() without a comparator requires all-number or all-string elements — use sort {|a, b| return ...; } to define the order',
          );
        }
        if (allNumbers) {
          // NaN would be silently coerced to "equal" by the sort algorithm,
          // producing an arbitrary order instead of the documented ascending one.
          if (sorted.some((e) => Number.isNaN(toNumber(e)))) {
            throw mError('sort() without a comparator cannot order NaN elements — remove them before sorting');
          }
          sorted.sort((a, b) => (toNumber(a) as number) - (toNumber(b) as number));
        } else {
          sorted.sort((a, b) => ((a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0));
        }
        return { type: 'ArrayValue' as const, elements: sorted };
      }
      const sortParams = cb.params;
      const sortBody = cb.body;
      const sortLine = getLine(expr);
      // One shared sink for all comparator invocations — path output inside a
      // comparator is discarded (same semantics as Grid.fill). Hoisting the
      // store and short-circuiting top-level returns via evaluateGridCellBody
      // avoids the per-invocation throw/catch deopt; the comparator runs
      // O(n log n) times.
      const sortSink = createPathStore();
      // sort iterates a copy, but the receiver stays locked while comparators
      // run — mutating the array being sorted is still an iteration hazard.
      lockArray(obj);
      try {
        sorted.sort((a, b) => {
          const blockScope = createScope(cb.closure ?? scope);
          if (sortParams.length > 0) setVariable(blockScope, sortParams[0], a);
          if (sortParams.length > 1) setVariable(blockScope, sortParams[1], b);
          let cmp: Value = null;
          try {
            const res = evaluateGridCellBody(sortBody, blockScope, sortSink);
            cmp = res.returned ? res.value : null;
          } catch (e) {
            if (e instanceof ReturnSignal) {
              cmp = e.value;
            } else {
              const msg = e instanceof Error ? e.message : String(e);
              throw new Error(formatError(`Error in .sort() comparator: ${msg}`, sortLine));
            }
          }
          if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
            throw mError(
              'sort() comparator must return a number (negative = a first, positive = b first, zero = keep order) — e.g. return calc(a - b);',
            );
          }
          return cmp;
        });
      } finally {
        unlockArray(obj);
      }
      return { type: 'ArrayValue' as const, elements: sorted };
    }
    default:
      throw mError(`Unknown array method: ${expr.method}`);
  }
}

function formatValueForDisplay(val: Value): string {
  if (val === null) return 'null';
  if (isBooleanValue(val)) return val.value ? 'true' : 'false';
  if (isAngleValue(val)) return formatAngleForDisplay(val);
  if (typeof val === 'number') return formatNum(val);
  if (typeof val === 'string') return val;
  if (isPointValue(val)) {
    return `Point(${formatNum(val.x)}, ${formatNum(val.y)})`;
  }
  if (isPolarVectorValue(val)) {
    return `PolarVector(${formatNum(val.angle)}, ${formatNum(val.distance)})`;
  }
  if (typeof val === 'object' && 'type' in val && val.type === 'ViewBoxStructValue') {
    return `ViewBox(${formatNum(val.originX)}, ${formatNum(val.originY)}, ${formatNum(val.width)}, ${formatNum(val.height)})`;
  }
  if (isPathBlockValue(val)) {
    return `PathBlock(${val.commands.length} commands)`;
  }
  if (isVertexHandleValue(val)) {
    return `VertexHandle('${val.label}' at ${formatNum(val.point.x)}, ${formatNum(val.point.y)})`;
  }
  if (isProjectedPathValue(val)) {
    return `ProjectedPath(${formatNum(val.startPoint.x)}, ${formatNum(val.startPoint.y)} → ${formatNum(val.endPoint.x)}, ${formatNum(val.endPoint.y)})`;
  }
  if (isTextBlockValue(val)) {
    return `TextBlock(${val.elements.length} elements)`;
  }
  if (isProjectedTextValue(val)) {
    return `ProjectedText(${formatNum(val.origin.x)}, ${formatNum(val.origin.y)}, ${val.elements.length} elements)`;
  }
  if (isObjectValue(val)) {
    const entries = Array.from(val.properties.entries()).map(([k, v]) => `${k}: ${formatValueForDisplay(v)}`);
    return `{${entries.join(', ')}}`;
  }
  if (isCyclerValue(val)) {
    return `Cycler(${val.elements.length} items, index ${val.index})`;
  }
  if (isSVGFragmentValue(val)) {
    const preview = val.rawContent.length > 60 ? `${val.rawContent.slice(0, 60)}...` : val.rawContent;
    return `SVGDocumentFragment(${preview})`;
  }
  if (isMaskValue(val)) {
    return `Mask(${val.id}, ${val.paths.length} paths)`;
  }
  if (isClipPathValue(val)) {
    return `ClipPath(${val.id}, ${val.paths.length} paths)`;
  }
  if (isPatternValue(val)) {
    return `Pattern(${val.id}, ${val.paths.length} elements)`;
  }
  if (isMarkerValue(val)) {
    return `Marker(${val.id}, ${val.paths.length} elements)`;
  }
  if (isGradientValue(val)) {
    if (val.gradientType === 'mesh') {
      return `MeshGradient(${val.id}, ${val.meshCols}×${val.meshRows})`;
    }
    if (val.gradientType === 'freeform') {
      return `FreeformGradient(${val.id}, ${val.freeformPoints?.length ?? 0} points)`;
    }
    if (val.gradientType === 'topo') {
      return `TopoGradient(${val.id}, ${val.topoContours?.length ?? 0} contours)`;
    }
    return `${val.gradientType.charAt(0).toUpperCase() + val.gradientType.slice(1)}Gradient(${val.id}, ${val.stops.length} stops)`;
  }
  if (isMeshPointValue(val)) {
    return `MeshPoint(${val.gridRow},${val.gridCol} @ ${val.x.toFixed(1)},${val.y.toFixed(1)})`;
  }
  if (isColorValue(val)) {
    if (val.lightDark) {
      return `Color.lightDark(${val.lightDark.lightCSS}, ${val.lightDark.darkCSS})`;
    }
    return `Color(${oklchToCSS(val.oklch)})`;
  }
  if (isCSSVarValue(val)) {
    return val.fallback ? `CSSVar(${val.varName}, ${val.fallback})` : `CSSVar(${val.varName})`;
  }
  if (isArrayValue(val)) {
    return `[${val.elements.map(formatValueForDisplay).join(', ')}]`;
  }
  if (typeof val === 'object' && val !== null && 'type' in val && val.type === 'UserFunction') {
    return `${val.isLambda ? 'Lambda' : 'Function'}(${val.params.join(', ')})`;
  }
  return String(val);
}

function evaluateTemplateLiteral(tl: TemplateLiteral, scope: Scope): string {
  return tl.parts
    .map((part) => {
      if (typeof part === 'string') return part;
      const val = evaluateExpression(part, scope);
      return formatValueForDisplay(val);
    })
    .join('');
}

function evaluateMemberExpression(expr: MemberExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);

  // Context .transform is synthesized from _transformState, not a data property
  if (
    typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ContextObject' &&
    expr.property === 'transform'
  ) {
    const transformState = obj.value._transformState as TransformState | undefined;
    if (transformState) {
      return { type: 'TransformReference' as const, state: transformState };
    }
    throw new Error(`Property 'transform' does not exist on context object`);
  }

  // Data properties of built-in structs (Point, PolarVector, Grid, MeshPoint,
  // Color, context objects) resolve through the shared registry, which is also
  // what object destructuring reads.
  const struct = getStructDescriptor(obj);
  if (struct) {
    if (struct.has(obj, expr.property)) return struct.get(obj, expr.property);
    throw new Error(`Property '${expr.property}' does not exist on ${struct.name}`);
  }

  // Handle PathBlockValue property access
  if (isPathBlockValue(obj)) {
    switch (expr.property) {
      case 'length':
        return calculatePathLength(obj.commands);
      case 'vertices':
        return { type: 'ArrayValue' as const, elements: extractVertices(obj.commands) };
      case 'subPathCount':
        return countSubPaths(obj.commands);
      case 'subPathCommands':
        return {
          type: 'ArrayValue' as const,
          elements: obj.commands.map((cmd) => ({
            type: 'ObjectValue' as const,
            properties: new Map<string, Value>([
              ['command', cmd.command],
              ['args', { type: 'ArrayValue' as const, elements: cmd.args as Value[] }],
              ['start', { type: 'PointValue' as const, x: cmd.start.x, y: cmd.start.y }],
              ['end', { type: 'PointValue' as const, x: cmd.end.x, y: cmd.end.y }],
            ]),
          })),
        };
      case 'startPoint':
        return { type: 'PointValue' as const, x: obj.startPoint.x, y: obj.startPoint.y };
      case 'endPoint':
        return { type: 'PointValue' as const, x: obj.endPoint.x, y: obj.endPoint.y };
      case 'advanceWidth': {
        const aw = (obj as PathBlockValue & { advanceWidth?: number }).advanceWidth;
        return aw !== undefined ? aw : 0;
      }
      case 'anchor': {
        const anchor = (obj as PathBlockValue & { anchor?: { x: number; y: number } }).anchor;
        if (anchor === undefined)
          throw new Error(
            "'anchor' is only available on variableOffset/compoundVariableOffset results — it recovers the position removed by origin normalization. Composing or transforming a result produces a new block without it; read anchor before composing",
          );
        return { type: 'PointValue' as const, x: anchor.x, y: anchor.y };
      }
      case 'contours': {
        // Decompose a multi-contour glyph into individual PathBlockValues
        const contourGroups = splitContours(obj.commands);
        const contourBlocks: Value[] = contourGroups.map((cmds) =>
          buildPathBlockFromCommands(cmds, { x: 0, y: 0 }),
        );
        return { type: 'ArrayValue' as const, elements: contourBlocks };
      }
      case 'isEmpty':
        return boolVal(obj.commands.length === 0);
      case 'char': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            "'char' is only available on glyphs produced by PathBlock.fromGlyph() — it records the source character. Composing or transforming a glyph produces a new block without it",
          );
        return char;
      }
      case 'isWhitespace': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            "'isWhitespace' is only available on glyphs produced by PathBlock.fromGlyph() — it classifies the source character. Use 'isEmpty' to test whether any PathBlock has no commands",
          );
        return boolVal(isWhitespaceChar(char));
      }
      case 'codePoint': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            "'codePoint' is only available on glyphs produced by PathBlock.fromGlyph() — it reports the source character's Unicode code point. Composing or transforming a glyph produces a new block without it",
          );
        return char.codePointAt(0)!;
      }
      case 'isSpace':
      case 'isTab':
      case 'isNewline':
      case 'isMark': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            `'${expr.property}' is only available on glyphs produced by PathBlock.fromGlyph() — it classifies the source character. Use 'isEmpty' to test whether any PathBlock has no commands`,
          );
        return boolVal(CHAR_CLASS_PREDICATES[expr.property](char));
      }
      default:
        throw new Error(`Property '${expr.property}' does not exist on PathBlock`);
    }
  }

  // Handle TextBlockValue property access
  if (isTextBlockValue(obj)) {
    switch (expr.property) {
      case 'elementCount':
        return obj.elements.length;
      case 'styles':
        return { type: 'StyleBlockValue' as const, properties: { ...obj.styles } };
      default:
        throw new Error(`Property '${expr.property}' does not exist on TextBlock`);
    }
  }

  // Handle ProjectedTextValue property access
  if (isProjectedTextValue(obj)) {
    switch (expr.property) {
      case 'elementCount':
        return obj.elements.length;
      case 'styles':
        return { type: 'StyleBlockValue' as const, properties: { ...obj.styles } };
      case 'origin':
        return { type: 'PointValue' as const, x: obj.origin.x, y: obj.origin.y };
      default:
        throw new Error(`Property '${expr.property}' does not exist on ProjectedText`);
    }
  }

  // Handle ProjectedPathValue property access
  if (isProjectedPathValue(obj)) {
    switch (expr.property) {
      case 'length':
        return calculatePathLength(obj.commands);
      case 'vertices':
        return { type: 'ArrayValue' as const, elements: extractVertices(obj.commands) };
      case 'subPathCount':
        return countSubPaths(obj.commands);
      case 'subPathCommands':
        return {
          type: 'ArrayValue' as const,
          elements: obj.commands.map((cmd) => ({
            type: 'ObjectValue' as const,
            properties: new Map<string, Value>([
              ['command', cmd.command],
              ['args', { type: 'ArrayValue' as const, elements: cmd.args as Value[] }],
              ['start', { type: 'PointValue' as const, x: cmd.start.x, y: cmd.start.y }],
              ['end', { type: 'PointValue' as const, x: cmd.end.x, y: cmd.end.y }],
            ]),
          })),
        };
      case 'startPoint':
        return { type: 'PointValue' as const, x: obj.startPoint.x, y: obj.startPoint.y };
      case 'endPoint':
        return { type: 'PointValue' as const, x: obj.endPoint.x, y: obj.endPoint.y };
      case 'isEmpty':
        return boolVal(obj.commands.length === 0);
      default:
        throw new Error(`Property '${expr.property}' does not exist on ProjectedPath`);
    }
  }

  // Handle TransformReference property access
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformReference') {
    const transformRef = obj;
    if (expr.property === 'translate' || expr.property === 'rotate' || expr.property === 'scale') {
      return { type: 'TransformPropertyReference' as const, state: transformRef.state, property: expr.property };
    }
    throw new Error(`Property '${expr.property}' does not exist on transform`);
  }

  // Handle TransformPropertyReference property access (read)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformPropertyReference') {
    const propRef = obj;
    switch (propRef.property) {
      case 'translate': {
        if (expr.property === 'x') return propRef.state.translate?.x ?? 0;
        if (expr.property === 'y') return propRef.state.translate?.y ?? 0;
        throw new Error(`Property '${expr.property}' does not exist on transform.translate`);
      }
      case 'rotate': {
        if (expr.property === 'angle') return propRef.state.rotate?.angle ?? 0;
        if (expr.property === 'cx') return propRef.state.rotate?.cx ?? 0;
        if (expr.property === 'cy') return propRef.state.rotate?.cy ?? 0;
        throw new Error(`Property '${expr.property}' does not exist on transform.rotate`);
      }
      case 'scale': {
        if (expr.property === 'x') return propRef.state.scale?.x ?? 1;
        if (expr.property === 'y') return propRef.state.scale?.y ?? 1;
        if (expr.property === 'cx') return propRef.state.scale?.cx ?? 0;
        if (expr.property === 'cy') return propRef.state.scale?.cy ?? 0;
        throw new Error(`Property '${expr.property}' does not exist on transform.scale`);
      }
    }
  }

  // Handle MaskValue property access
  if (isMaskValue(obj)) {
    if (expr.property === 'id') return obj.id;
    throw new Error(`Property '${expr.property}' does not exist on Mask`);
  }

  // Handle ClipPathValue property access
  if (isClipPathValue(obj)) {
    if (expr.property === 'id') return obj.id;
    throw new Error(`Property '${expr.property}' does not exist on ClipPath`);
  }

  // Handle PatternValue property access
  if (isPatternValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'patternUnits':
        return obj.patternUnits ?? null;
      case 'patternTransform':
        return obj.patternTransform ?? null;
      case 'patternContentUnits':
        return obj.patternContentUnits ?? null;
      default:
        throw new Error(`Property '${expr.property}' does not exist on Pattern`);
    }
  }

  // Handle MarkerValue property access
  if (isMarkerValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'viewBox':
        return obj.viewBox;
      case 'markerWidth':
        return obj.markerWidth;
      case 'markerHeight':
        return obj.markerHeight;
      case 'refX':
        return typeof obj.refX === 'number' ? obj.refX : obj.refX;
      case 'refY':
        return typeof obj.refY === 'number' ? obj.refY : obj.refY;
      case 'markerUnits':
        return obj.markerUnits;
      case 'orient':
        return typeof obj.orient === 'number' ? obj.orient : obj.orient;
      case 'preserveAspectRatio':
        return obj.preserveAspectRatio;
      default:
        throw new Error(`Property '${expr.property}' does not exist on Marker`);
    }
  }

  // Handle NoiseFilterValue property access
  if (isNoiseFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'style':
        return obj.style;
      case 'scale':
        return obj.scale;
      case 'octaves':
        return obj.octaves;
      case 'amount':
        return obj.amount;
      case 'monochrome':
        return boolVal(obj.monochrome);
      case 'seed':
        return obj.seed;
      case 'blend':
        return obj.blend;
      case 'contrast':
        return obj.contrast;
      case 'stitch':
        return boolVal(obj.stitch);
      default:
        throw new Error(`Property '${expr.property}' does not exist on NoiseFilter`);
    }
  }

  if (isGlowFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'mode':
        return obj.mode;
      case 'color':
        return obj.color;
      case 'radius':
        return obj.radius;
      case 'spread':
        return obj.spread;
      case 'opacity':
        return obj.opacity;
      default:
        throw new Error(`Property '${expr.property}' does not exist on GlowFilter`);
    }
  }

  if (isEmbossFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'angle':
        return obj.angle;
      case 'elevation':
        return obj.elevation;
      case 'depth':
        return obj.depth;
      case 'strength':
        return obj.strength;
      case 'shininess':
        return obj.shininess;
      case 'lightColor':
        return obj.lightColor;
      case 'smooth':
        return obj.smooth;
      default:
        throw new Error(`Property '${expr.property}' does not exist on EmbossFilter`);
    }
  }

  if (isElevationShadowFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'elevation':
        return obj.elevation;
      case 'color':
        return obj.color;
      case 'direction':
        return obj.direction;
      case 'tightness':
        return obj.tightness;
      default:
        throw new Error(`Property '${expr.property}' does not exist on ElevationShadowFilter`);
    }
  }

  if (isInnerShadowFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'offsetX':
        return obj.offsetX;
      case 'offsetY':
        return obj.offsetY;
      case 'blur':
        return obj.blur;
      case 'color':
        return obj.color;
      case 'opacity':
        return obj.opacity;
      default:
        throw new Error(`Property '${expr.property}' does not exist on InnerShadowFilter`);
    }
  }

  if (isPixelateFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'width':
        return obj.width;
      case 'height':
        return obj.height;
      case 'radius':
        return obj.radius;
      default:
        throw new Error(`Property '${expr.property}' does not exist on PixelateFilter`);
    }
  }

  if (isMotionBlurFilterValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'type':
        return obj.motionType;
      case 'distance':
        return obj.distance;
      case 'angle':
        return obj.angle;
      case 'samples':
        return obj.samples;
      default:
        throw new Error(`Property '${expr.property}' does not exist on MotionBlurFilter`);
    }
  }

  // Handle GradientValue property access
  if (isGradientValue(obj)) {
    switch (expr.property) {
      case 'id':
        return obj.id;
      case 'spreadMethod':
        return obj.spreadMethod ?? null;
      case 'gradientUnits':
        return obj.gradientUnits ?? null;
      case 'gradientTransform':
        return obj.gradientTransform ?? null;
      case 'interpolation':
        return obj.interpolation ?? null;
      case 'steps':
        return obj.steps ?? null;
      // Conic-specific properties
      case 'from':
        return obj.from ?? 0;
      case 'to':
        return obj.to ?? 2 * Math.PI;
      case 'direction':
        return obj.direction ?? 'cw';
      case 'spread':
        return obj.spread ?? 'clamp';
      case 'innerRadius':
        return obj.innerRadius ?? 0;
      case 'innerFill':
        return obj.innerFill ?? 'transparent';
      // Mesh/Freeform-specific properties
      case 'falloff':
        return obj.falloff ?? 2.0;
      case 'cols':
        return obj.meshCols ?? 0;
      case 'rows':
        return obj.meshRows ?? 0;
      case 'width': {
        if (obj.gradientType === 'mesh') return obj.meshWidth!;
        if (obj.gradientType === 'freeform') return obj.freeformWidth!;
        if (obj.gradientType === 'topo') return obj.topoWidth!;
        throw new Error(`Property 'width' does not exist on ${obj.gradientType} gradient`);
      }
      case 'height': {
        if (obj.gradientType === 'mesh') return obj.meshHeight!;
        if (obj.gradientType === 'freeform') return obj.freeformHeight!;
        if (obj.gradientType === 'topo') return obj.topoHeight!;
        throw new Error(`Property 'height' does not exist on ${obj.gradientType} gradient`);
      }
      // Topo-specific properties
      case 'easing':
        return obj.topoEasing ?? 'linear';
      case 'method':
        return obj.topoMethod ?? 'distance';
      case 'iterations':
        return obj.topoIterations ?? 200;
      case 'blend':
        return obj.topoBlend ?? 1.0;
      case 'baseColor': {
        if (obj.topoBaseColor) {
          return { type: 'ColorValue', oklch: { ...obj.topoBaseColor } } as ColorValue;
        }
        return null;
      }
      default:
        throw new Error(`Property '${expr.property}' does not exist on Gradient`);
    }
  }

  // Handle CSSVarValue property access
  if (isCSSVarValue(obj)) {
    switch (expr.property) {
      case 'var':
        return obj.varName;
      case 'fallback':
        return obj.fallback;
      case 'css':
        return obj.fallback ? `var(${obj.varName}, ${obj.fallback})` : `var(${obj.varName})`;
      default:
        throw new Error(`Property '${expr.property}' does not exist on CSSVar`);
    }
  }

  // Handle StyleBlockValue property access (camelCase → kebab-case)
  if (isStyleBlock(obj)) {
    const kebabName = camelToKebab(expr.property);
    const value = obj.properties[kebabName] ?? obj.properties[expr.property];
    if (value === undefined) {
      throw new Error(`Property '${expr.property}' does not exist on style block`);
    }
    return value;
  }

  // Handle LayerReference property access
  if (isLayerReference(obj)) {
    const layerRef = obj;
    if (expr.property === 'ctx') {
      if (layerRef.layer.layerType === 'GroupLayer') {
        const groupLayer = layerRef.layer;
        return { type: 'ContextObject' as const, value: { _transformState: groupLayer.transformState } };
      }
      if (layerRef.layer.layerType !== 'PathLayer') {
        throw new Error(`Property 'ctx' is only available on PathLayer and GroupLayer references`);
      }
      const pathLayer = layerRef.layer;
      return {
        type: 'ContextObject' as const,
        value: contextToObject(pathLayer.pathContext, pathLayer.transformState),
      };
    }
    if (expr.property === 'name') {
      return layerRef.layer.name;
    }
    if (expr.property === 'styles') {
      return { type: 'StyleBlockValue' as const, properties: { ...layerRef.layer.styles } };
    }
    throw new Error(`Property '${expr.property}' does not exist on layer reference`);
  }

  // Handle ObjectValue property access (dot notation)
  if (isObjectValue(obj)) {
    if (expr.property === 'length') return obj.properties.size;
    return obj.properties.get(expr.property) ?? null;
  }

  // Handle CyclerValue property access
  if (isCyclerValue(obj)) {
    if (expr.property === 'length') return obj.elements.length;
    throw new Error(`Property '${expr.property}' does not exist on Cycler`);
  }

  // Handle ArrayValue property access
  if (isArrayValue(obj)) {
    if (expr.property === 'length') {
      return obj.elements.length;
    }
    if (expr.property === 'first') {
      return obj.elements.length === 0 ? null : obj.elements[0];
    }
    if (expr.property === 'last') {
      return obj.elements.length === 0 ? null : obj.elements[obj.elements.length - 1];
    }
    throw new Error(`Property '${expr.property}' does not exist on array. Use methods like .push(), .pop(), etc.`);
  }

  // Handle string property access
  if (typeof obj === 'string') {
    if (expr.property === 'length') {
      return obj.length;
    }
    throw new Error(`Property '${expr.property}' does not exist on string`);
  }

  throw new Error(`Cannot access property '${expr.property}' on non-object value`);
}

// Check if an expression looks like it's intended for math log (natural logarithm)
function isMathLogCandidate(arg: Expression): boolean {
  // Plain number literal without unit (like log(1), log(2.5)) → math log
  if (arg.type === 'NumberLiteral' && !arg.unit) {
    return true;
  }
  // Function call to known math functions that return numbers → math log
  // e.g., log(E()), log(sqrt(2))
  if (arg.type === 'FunctionCall' && arg.name in stdlib) {
    return true;
  }
  // Everything else (90deg, ctx.position.x, variables, expressions) → debug log
  return false;
}

function evaluateFunctionCall(call: FunctionCall, scope: Scope): Value {
  // Special handling for log() function - distinguish between debug log and math log
  // Math log: single arg that is a plain number or math function call (log(1), log(E()))
  // Debug log: everything else (log(ctx), log(90deg), log("msg"), log(x, y))
  if (call.name === 'log' && scope.evalState) {
    // Only use math log for clear math-log-like calls
    if (call.args.length === 1 && isMathLogCandidate(call.args[0])) {
      const argValue = evaluateExpression(call.args[0], scope);
      if (typeof argValue === 'number') {
        // It's a numeric value - use math log (natural logarithm)
        const fn = stdlib[call.name as keyof typeof stdlib];
        if (fn && typeof fn === 'function') {
          return (fn as (x: number) => number)(argValue);
        }
      }
    }

    // Debug log handling
    const lineNumber = call.loc?.line ?? null;
    const parts: LogPart[] = [];

    for (const arg of call.args) {
      const value = evaluateExpression(arg, scope);

      // String literals are displayed directly without a label
      if (arg.type === 'StringLiteral') {
        parts.push({
          type: 'string',
          value: arg.value,
        });
      } else {
        // Non-string expressions get a label showing what was logged
        const label = expressionToSource(arg);
        let stringValue: string;

        if (value === null) {
          stringValue = 'null';
        } else if (isBooleanValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isAngleValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPointValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPolarVectorValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (typeof value === 'object' && 'type' in value && value.type === 'ViewBoxStructValue') {
          stringValue = formatValueForDisplay(value);
        } else if (isObjectValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isArrayValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPathBlockValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isProjectedPathValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isVertexHandleValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isCyclerValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isMaskValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isClipPathValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPatternValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isMarkerValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isGradientValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isColorValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isCSSVarValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isTextBlockValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isProjectedTextValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (typeof value === 'object' && value !== null && 'type' in value) {
          const typed = value as { type: string; value?: unknown };
          if (typed.type === 'ContextObject' && typed.value) {
            stringValue = JSON.stringify(typed.value, null, 2);
          } else if (typed.type === 'PathSegment') {
            stringValue = (typed as PathSegment).value;
          } else if (typed.type === 'UserFunction') {
            stringValue = formatValueForDisplay(value);
          } else {
            stringValue = String(value);
          }
        } else if (typeof value === 'number') {
          stringValue = String(value);
        } else if (typeof value === 'string') {
          stringValue = value;
        } else {
          stringValue = String(value);
        }

        parts.push({
          type: 'value',
          label,
          value: stringValue,
        });
      }
    }

    scope.evalState.logs.push({ line: lineNumber, parts });
    return { type: 'PathSegment' as const, value: '' }; // Empty path segment
  }

  // Handle layer() function — returns a LayerReference
  if (call.name === 'layer' && scope.evalState) {
    if (call.args.length !== 1) {
      throw new Error(`layer() expects 1 argument, got ${call.args.length}`);
    }
    const nameValue = evaluateExpression(call.args[0], scope);
    if (typeof nameValue !== 'string') {
      throw new Error('Layer name must be a string');
    }
    const layerState = scope.evalState.layers.get(nameValue);
    if (!layerState) {
      throw new Error(`Undefined layer: '${nameValue}'`);
    }
    return { type: 'LayerReference' as const, layer: layerState };
  }

  // Handle Point() constructor
  if (call.name === 'Point') {
    if (call.args.length !== 2) {
      throw new Error(`Point() expects 2 arguments, got ${call.args.length}`);
    }
    const x = evaluateExpression(call.args[0], scope);
    const y = evaluateExpression(call.args[1], scope);
    if (typeof x !== 'number') throw new Error('Point() x must be a number');
    if (typeof y !== 'number') throw new Error('Point() y must be a number');
    return { type: 'PointValue' as const, x, y };
  }

  // Handle PolarVector() constructor
  if (call.name === 'PolarVector') {
    if (call.args.length !== 2) {
      throw new Error(`PolarVector() expects 2 arguments, got ${call.args.length}`);
    }
    const angle = toNumber(evaluateExpression(call.args[0], scope));
    const distance = evaluateExpression(call.args[1], scope);
    if (angle === undefined) throw new Error('PolarVector() angle must be a number');
    if (typeof distance !== 'number') throw new Error('PolarVector() distance must be a number');
    return { type: 'PolarVectorValue' as const, angle, distance };
  }

  // Handle Cycler() constructor
  if (call.name === 'Cycler') {
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(`Cycler() expects 1-2 arguments, got ${call.args.length}`);
    }
    const list = evaluateExpression(call.args[0], scope);
    if (!isArrayValue(list)) throw new Error('Cycler() first argument must be an array');
    if (list.elements.length === 0) throw new Error('Cycler() array must not be empty');

    const elements = [...list.elements]; // shallow copy

    if (call.args.length === 2) {
      const shuffle = evaluateExpression(call.args[1], scope);
      if (shuffle) {
        // Fisher-Yates shuffle
        for (let i = elements.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [elements[i], elements[j]] = [elements[j], elements[i]];
        }
      }
    }

    return { type: 'CyclerValue' as const, elements, index: 0 };
  }

  // Handle SVGDocumentFragment() constructor
  if (call.name === 'SVGDocumentFragment') {
    if (call.args.length !== 1) {
      throw new Error(`SVGDocumentFragment() expects 1 argument, got ${call.args.length}`);
    }
    const arg = evaluateExpression(call.args[0], scope);
    if (typeof arg !== 'string') {
      throw new Error('SVGDocumentFragment() argument must be a string');
    }
    const result = sanitizeSVGFragment(arg);
    return {
      type: 'SVGFragmentValue' as const,
      defsContent: result.defsContent,
      visualContent: result.visualContent,
      rawContent: result.rawContent,
    };
  }

  // Handle Mask() constructor
  if (call.name === 'Mask') {
    if (call.args.length !== 1) {
      throw new Error(`Mask() expects 1 argument (id), got ${call.args.length}`);
    }
    if (!scope.evalState) throw new Error('Mask() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string') throw new Error('Mask() argument must be a string');
    try { validateCSSIdent(id, 'mask-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const mask: MaskValue = { type: 'MaskValue', id, paths: [] };
    scope.evalState.masks.set(id, mask);
    return mask;
  }

  // Handle ClipPath() constructor
  if (call.name === 'ClipPath') {
    if (call.args.length !== 1) {
      throw new Error(`ClipPath() expects 1 argument (id), got ${call.args.length}`);
    }
    if (!scope.evalState) throw new Error('ClipPath() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string') throw new Error('ClipPath() argument must be a string');
    try { validateCSSIdent(id, 'clippath-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const clipPath: ClipPathValue = { type: 'ClipPathValue', id, paths: [] };
    scope.evalState.clipPaths.set(id, clipPath);
    return clipPath;
  }

  // Handle LinearGradient() constructor
  if (call.name === 'LinearGradient') {
    if (call.args.length !== 5) {
      throw new Error(
        formatError(
          `LinearGradient() expects 5 arguments (id, x1, y1, x2, y2), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('LinearGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('LinearGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const x1 = evaluateExpression(call.args[1], scope);
    const y1 = evaluateExpression(call.args[2], scope);
    const x2 = evaluateExpression(call.args[3], scope);
    const y2 = evaluateExpression(call.args[4], scope);
    if (typeof x1 !== 'number' || typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') {
      throw new Error(
        formatError('LinearGradient() coordinate arguments must be numbers', getLine(call), getCol(call)),
      );
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'linear',
      id,
      attrs: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) },
      stops: [],
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle RadialGradient() constructor
  if (call.name === 'RadialGradient') {
    if (call.args.length < 4 || call.args.length > 6) {
      throw new Error(
        formatError(
          `RadialGradient() expects 4-6 arguments (id, cx, cy, r [, fx, fy]), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('RadialGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('RadialGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const cx = evaluateExpression(call.args[1], scope);
    const cy = evaluateExpression(call.args[2], scope);
    const r = evaluateExpression(call.args[3], scope);
    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof r !== 'number') {
      throw new Error(
        formatError('RadialGradient() coordinate arguments must be numbers', getLine(call), getCol(call)),
      );
    }
    const attrs: Record<string, string> = { cx: String(cx), cy: String(cy), r: String(r) };
    if (call.args.length >= 5) {
      const fx = evaluateExpression(call.args[4], scope);
      if (typeof fx !== 'number')
        throw new Error(formatError('RadialGradient() fx must be a number', getLine(call), getCol(call)));
      attrs.fx = String(fx);
    }
    if (call.args.length === 6) {
      const fy = evaluateExpression(call.args[5], scope);
      if (typeof fy !== 'number')
        throw new Error(formatError('RadialGradient() fy must be a number', getLine(call), getCol(call)));
      attrs.fy = String(fy);
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'radial',
      id,
      attrs,
      stops: [],
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle Pattern() constructor
  if (call.name === 'Pattern') {
    if (call.args.length !== 5) {
      throw new Error(
        formatError(
          `Pattern() expects 5 arguments (id, x, y, width, height), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('Pattern() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('Pattern() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'pattern-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const x = evaluateExpression(call.args[1], scope);
    const y = evaluateExpression(call.args[2], scope);
    const w = evaluateExpression(call.args[3], scope);
    const h = evaluateExpression(call.args[4], scope);
    if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
      throw new Error(formatError('Pattern() coordinate arguments must be numbers', getLine(call), getCol(call)));
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const pattern: PatternValue = {
      type: 'PatternValue',
      id,
      x,
      y,
      width: w,
      height: h,
      paths: [],
    };
    scope.evalState.patterns.set(id, pattern);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], pattern);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return pattern;
  }

  // Handle Marker() constructor
  if (call.name === 'Marker') {
    if (call.args.length !== 3) {
      throw new Error(
        formatError(
          `Marker() expects 3 arguments (id, markerWidth, markerHeight), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('Marker() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('Marker() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'marker-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const markerWidth = evaluateExpression(call.args[1], scope);
    const markerHeight = evaluateExpression(call.args[2], scope);
    if (typeof markerWidth !== 'number' || typeof markerHeight !== 'number') {
      throw new Error(
        formatError('Marker() markerWidth and markerHeight arguments must be numbers', getLine(call), getCol(call)),
      );
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const marker: MarkerValue = {
      type: 'MarkerValue',
      id,
      viewBox: `0 0 ${markerWidth} ${markerHeight}`,
      markerWidth,
      markerHeight,
      refX: markerWidth / 2,
      refY: markerHeight / 2,
      markerUnits: 'strokeWidth',
      orient: 'auto',
      preserveAspectRatio: 'xMidYMid meet',
      paths: [],
    };
    scope.evalState.markers.set(id, marker);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], marker);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return marker;
  }

  // Handle Grid() constructor: Grid(rows, cols, options) {|g| ... }
  if (call.name === 'Grid') {
    if (call.args.length < 2 || call.args.length > 3) {
      throw new Error(
        formatError(
          `Grid() expects 2 or 3 arguments (rows, cols, options?), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    const rowsVal = evaluateExpression(call.args[0], scope);
    const colsVal = evaluateExpression(call.args[1], scope);
    if (typeof rowsVal !== 'number' || !Number.isInteger(rowsVal) || rowsVal <= 0) {
      throw new Error(formatError('Grid() rows must be a positive integer', getLine(call), getCol(call)));
    }
    if (typeof colsVal !== 'number' || !Number.isInteger(colsVal) || colsVal <= 0) {
      throw new Error(formatError('Grid() cols must be a positive integer', getLine(call), getCol(call)));
    }

    let xDim = 1;
    let yDim = 1;
    let origin: PointValue = { type: 'PointValue', x: 0, y: 0 };
    let defaultValue: Value = null;
    let outOfBounds: GridOutOfBoundsMode = 'clamp';
    let interpolation: GridInterpolationMode = 'nearest';

    if (call.args.length === 3) {
      const optsVal = evaluateExpression(call.args[2], scope);
      if (!isObjectValue(optsVal)) {
        throw new Error(formatError('Grid() options (3rd arg) must be an object literal', getLine(call), getCol(call)));
      }
      const opts = optsVal.properties;
      if (opts.has('xDim')) {
        const v = opts.get('xDim');
        if (typeof v !== 'number' || v <= 0) throw new Error(formatError('Grid() options.xDim must be a positive number', getLine(call), getCol(call)));
        xDim = v;
      }
      if (opts.has('yDim')) {
        const v = opts.get('yDim');
        if (typeof v !== 'number' || v <= 0) throw new Error(formatError('Grid() options.yDim must be a positive number', getLine(call), getCol(call)));
        yDim = v;
      }
      if (opts.has('origin')) {
        const v = opts.get('origin');
        if (!isPointValue(v as Value)) throw new Error(formatError('Grid() options.origin must be a Point', getLine(call), getCol(call)));
        origin = v as PointValue;
      }
      if (opts.has('defaultValue')) {
        defaultValue = opts.get('defaultValue') as Value;
      }
      if (opts.has('outOfBounds')) {
        const v = opts.get('outOfBounds');
        if (v !== 'clamp' && v !== 'wrap' && v !== 'null') {
          throw new Error(formatError(`Grid() options.outOfBounds must be 'clamp', 'wrap', or 'null'`, getLine(call), getCol(call)));
        }
        outOfBounds = v as GridOutOfBoundsMode;
      }
      if (opts.has('interpolation')) {
        const v = opts.get('interpolation');
        if (v !== 'nearest' && v !== 'bilinear') {
          throw new Error(formatError(`Grid() options.interpolation must be 'nearest' or 'bilinear'`, getLine(call), getCol(call)));
        }
        interpolation = v as GridInterpolationMode;
      }
    }

    const cells: Value[][] = [];
    for (let r = 0; r < rowsVal; r++) {
      const row: Value[] = [];
      for (let c = 0; c < colsVal; c++) row.push(defaultValue);
      cells.push(row);
    }

    const grid: GridValue = {
      type: 'GridValue',
      rows: rowsVal,
      cols: colsVal,
      xDim,
      yDim,
      origin,
      outOfBounds,
      interpolation,
      cells,
    };

    if (call.block) {
      if (call.block.params.length < 1) {
        throw new Error(formatError('Grid() trailing block requires a parameter binding, e.g. {|g| ... }', getLine(call), getCol(call)));
      }
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], grid);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return grid;
  }

  // Handle NoiseFilter() constructor
  if (call.name === 'NoiseFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `NoiseFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('NoiseFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'noise');
    const filter: NoiseFilterValue = makeDefaultNoiseFilter(id, 'grain');
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle GlowFilter() constructor
  if (call.name === 'GlowFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `GlowFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('GlowFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'glow');
    const filter: GlowFilterValue = makeDefaultGlowFilter(id);
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle EmbossFilter() constructor
  if (call.name === 'EmbossFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `EmbossFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('EmbossFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'emboss');
    const filter: EmbossFilterValue = makeDefaultEmbossFilter(id);
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle ElevationShadowFilter() constructor
  if (call.name === 'ElevationShadowFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `ElevationShadowFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('ElevationShadowFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'elevation-shadow');
    const filter: ElevationShadowFilterValue = makeDefaultElevationShadowFilter(id);
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle InnerShadowFilter() constructor
  if (call.name === 'InnerShadowFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `InnerShadowFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('InnerShadowFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'inner-shadow');
    const filter: InnerShadowFilterValue = makeDefaultInnerShadowFilter(id);
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle PixelateFilter() constructor — accepts 0 args (block-style) or 3 args (positional)
  if (call.name === 'PixelateFilter') {
    if (call.args.length !== 0 && call.args.length !== 3) {
      throw new Error(
        formatError(
          `PixelateFilter() expects 0 or 3 arguments (width, height, radius), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (call.args.length === 3 && call.block) {
      throw new Error(
        formatError(
          `PixelateFilter() cannot combine positional arguments with a trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('PixelateFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'pixelate');
    const filter: PixelateFilterValue = makeDefaultPixelateFilter(id);
    if (call.args.length === 3) {
      const w = evaluateExpression(call.args[0], scope);
      const h = evaluateExpression(call.args[1], scope);
      const r = evaluateExpression(call.args[2], scope);
      for (const [name, v] of [['width', w], ['height', h], ['radius', r]] as const) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          throw new Error(
            formatError(
              `PixelateFilter() arguments must be finite positive numbers; ${name} is ${String(v)}`,
              getLine(call),
              getCol(call),
            ),
          );
        }
      }
      filter.width = w as number;
      filter.height = h as number;
      filter.radius = r as number;
    }
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle MotionBlurFilter() constructor — directional/progressive blur.
  // No positional arguments; configure via the trailing block.
  if (call.name === 'MotionBlurFilter') {
    if (call.args.length !== 0) {
      throw new Error(
        formatError(
          `MotionBlurFilter() takes no positional arguments — configure via the trailing block`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('MotionBlurFilter() requires evaluation context');
    const id = nextAutoFilterId(scope.evalState, 'motion-blur');
    const filter: MotionBlurFilterValue = makeDefaultMotionBlurFilter(id);
    scope.evalState.filters.set(id, filter);
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return filter;
  }

  // Handle ConicGradient() constructor
  if (call.name === 'ConicGradient') {
    if (call.args.length !== 3) {
      throw new Error(
        formatError(
          `ConicGradient() expects 3 arguments (id, cx, cy), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('ConicGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('ConicGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const cx = evaluateExpression(call.args[1], scope);
    const cy = evaluateExpression(call.args[2], scope);
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      throw new Error(formatError('ConicGradient() coordinate arguments must be numbers', getLine(call), getCol(call)));
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'conic',
      id,
      attrs: { cx: String(cx), cy: String(cy) },
      stops: [],
      from: 0,
      to: 2 * Math.PI,
      direction: 'cw',
      spread: 'clamp',
      innerRadius: 0,
      innerFill: 'transparent',
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle MeshGradient() constructor
  if (call.name === 'MeshGradient') {
    if (call.args.length !== 5) {
      throw new Error(
        formatError(
          `MeshGradient() expects 5 arguments (id, width, height, cols, rows), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('MeshGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('MeshGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const width = evaluateExpression(call.args[1], scope);
    const height = evaluateExpression(call.args[2], scope);
    const cols = evaluateExpression(call.args[3], scope);
    const rows = evaluateExpression(call.args[4], scope);
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      typeof cols !== 'number' ||
      typeof rows !== 'number'
    ) {
      throw new Error(
        formatError('MeshGradient() width, height, cols, rows must be numbers', getLine(call), getCol(call)),
      );
    }
    if (cols < 2 || rows < 2) {
      throw new Error(
        formatError('MeshGradient() cols and rows must be >= 2 (need at least one patch)', getLine(call), getCol(call)),
      );
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    // Build grid: rows × cols MeshPointValue objects, evenly spaced
    const meshGrid: MeshPointValue[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: MeshPointValue[] = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          type: 'MeshPointValue',
          x: (c / (cols - 1)) * width,
          y: (r / (rows - 1)) * height,
          color: { L: 0, C: 0, H: 0, alpha: 0 },
          colorCSS: 'oklch(0 0 0 / 0)',
          gridRow: r,
          gridCol: c,
        });
      }
      meshGrid.push(row);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'mesh',
      id,
      attrs: {},
      stops: [],
      meshGrid,
      meshWidth: width,
      meshHeight: height,
      meshCols: cols,
      meshRows: rows,
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle FreeformGradient() constructor
  if (call.name === 'FreeformGradient') {
    if (call.args.length !== 3) {
      throw new Error(
        formatError(
          `FreeformGradient() expects 3 arguments (id, width, height), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('FreeformGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('FreeformGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const width = evaluateExpression(call.args[1], scope);
    const height = evaluateExpression(call.args[2], scope);
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(formatError('FreeformGradient() width and height must be numbers', getLine(call), getCol(call)));
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'freeform',
      id,
      attrs: {},
      stops: [],
      freeformPoints: [],
      freeformWidth: width,
      freeformHeight: height,
      falloff: 2.0,
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle TopoGradient() constructor
  if (call.name === 'TopoGradient') {
    if (call.args.length !== 3) {
      throw new Error(
        formatError(
          `TopoGradient() expects 3 arguments (id, width, height), got ${call.args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }
    if (!scope.evalState) throw new Error('TopoGradient() requires evaluation context');
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('TopoGradient() first argument must be a string', getLine(call), getCol(call)));
    try { validateCSSIdent(id, 'gradient-id'); } catch (e) { throw new Error(formatError((e as Error).message, getLine(call), getCol(call))); }
    const width = evaluateExpression(call.args[1], scope);
    const height = evaluateExpression(call.args[2], scope);
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(formatError('TopoGradient() width and height must be numbers', getLine(call), getCol(call)));
    }
    if (
      scope.evalState.masks.has(id) ||
      scope.evalState.clipPaths.has(id) ||
      scope.evalState.gradients.has(id) ||
      scope.evalState.patterns.has(id) ||
      scope.evalState.markers.has(id) ||
      scope.evalState.filters.has(id)
    ) {
      throw new Error(`Duplicate defs ID '${id}': a Mask, ClipPath, Gradient, Pattern, Marker, or Filter with this ID already exists`);
    }
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'topo',
      id,
      attrs: {},
      stops: [],
      topoContours: [],
      topoWidth: width,
      topoHeight: height,
      topoEasing: 'linear',
      topoMethod: 'distance',
      topoIterations: 200,
      topoBlend: 1.0,
    };
    scope.evalState.gradients.set(id, gradient);
    // Execute trailing block if present
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        // Callback bodies are break/continue boundaries (builder-enforced; defensive)
        {
          const flow = evaluateStatementToAccum(stmt, blockScope, createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
      }
    }
    return gradient;
  }

  // Handle Color() constructor
  if (call.name === 'Color') {
    const cLine = getLine(call);
    const cCol = getCol(call);
    if (call.args.length === 1) {
      // String-based: Color('#ff0000'), Color('red'), Color('rgb(...)'), etc.
      const arg = evaluateExpression(call.args[0], scope);
      if (isCSSVarValue(arg)) {
        // Color(CSSVar('--name', 'fallback')) — parse fallback for Color methods, preserve var ref for style output
        if (!arg.fallback)
          throw new Error(formatError('Color(CSSVar(...)) requires a CSSVar with a fallback color', cLine, cCol));
        const oklch = parseColor(arg.fallback);
        // Collect @property declaration for CSS custom property registration (dedup: first wins)
        if (scope.evalState && !scope.evalState.cssProperties.has(arg.varName)) {
          scope.evalState.cssProperties.set(arg.varName, {
            name: arg.varName,
            syntax: '<color>',
            inherits: true,
            initialValue: oklchToCSS(oklch),
          });
        }
        return { type: 'ColorValue' as const, oklch, cssVar: { varName: arg.varName, fallback: arg.fallback } };
      }
      if (isColorValue(arg)) return arg; // Color(#cc0000) → pass-through
      if (typeof arg !== 'string')
        throw new Error(formatError('Color() with 1 argument expects a color string, CSSVar, or Color', cLine, cCol));
      return { type: 'ColorValue' as const, oklch: parseColor(arg) };
    }
    if (call.args.length === 3 || call.args.length === 4) {
      // Numeric OKLCH: Color(L, C, H) or Color(L, C, H, alpha)
      const L = evaluateExpression(call.args[0], scope);
      const C = evaluateExpression(call.args[1], scope);
      // Hue is degrees for bare numbers; an Angle value converts exactly
      const H = colorAngleDegrees(evaluateExpression(call.args[2], scope));
      if (typeof L !== 'number') throw new Error(formatError('Color() L must be a number', cLine, cCol));
      if (typeof C !== 'number') throw new Error(formatError('Color() C must be a number', cLine, cCol));
      if (H === undefined) throw new Error(formatError('Color() H must be a number', cLine, cCol));
      let alpha = 1;
      if (call.args.length === 4) {
        const a = evaluateExpression(call.args[3], scope);
        if (typeof a !== 'number') throw new Error(formatError('Color() alpha must be a number', cLine, cCol));
        alpha = a;
      }
      return { type: 'ColorValue' as const, oklch: { L, C, H, alpha } };
    }
    throw new Error(formatError(`Color() expects 1, 3, or 4 arguments, got ${call.args.length}`, cLine, cCol));
  }

  // Handle CSSVar() constructor
  if (call.name === 'CSSVar') {
    const cvLine = getLine(call);
    const cvCol = getCol(call);
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(formatError(`CSSVar() expects 1 or 2 arguments, got ${call.args.length}`, cvLine, cvCol));
    }
    const name = evaluateExpression(call.args[0], scope);
    if (typeof name !== 'string')
      throw new Error(formatError('CSSVar() first argument must be a string', cvLine, cvCol));
    // Preserve the existing user-facing message for the common "no --" case
    // before invoking the strict ident check (which gives a more pedantic
    // error message).
    if (!name.startsWith('--'))
      throw new Error(formatError("CSSVar() variable name must start with '--'", cvLine, cvCol));
    try {
      validateCSSIdent(name, 'css-var');
    } catch (e) {
      throw new Error(formatError((e as Error).message, cvLine, cvCol));
    }
    let fallback: string | null = null;
    if (call.args.length === 2) {
      const fb = evaluateExpression(call.args[1], scope);
      if (typeof fb === 'number') {
        fallback = String(fb);
      } else if (typeof fb === 'string') {
        // Validate user-supplied string fallback against the CSS value
        // allow-list. Use a synthetic property name so URL_VALUED_PROPERTIES
        // and STRING_VALUED_PROPERTIES don't match — fallbacks are bound at
        // use-site, not at any specific property.
        try {
          validateCSSValue(fb, '__cssvar_fallback__');
        } catch (e) {
          throw new Error(formatError(`CSSVar() fallback rejected: ${(e as Error).message}`, cvLine, cvCol));
        }
        fallback = fb;
      } else if (isColorValue(fb)) {
        fallback = oklchToCSS(fb.oklch);
      } else {
        throw new Error(formatError('CSSVar() fallback must be a string, number, or Color', cvLine, cvCol));
      }
    }
    return { type: 'CSSVarValue' as const, varName: name, fallback };
  }

  // Check if it's a context-aware function
  if (contextAwareFunctions.has(call.name)) {
    if (!scope.evalState) {
      throw new Error(`Function '${call.name}' requires evaluation context`);
    }
    // Intentionally unwrap-only: context-aware functions consume angles into
    // geometry (heading() is documented plain radians) — no angle re-wrap.
    const args = call.args.map((arg) => {
      const v = evaluateExpression(arg, scope);
      return isAngleValue(v) ? v.radians : v;
    });
    return evaluateContextAwareFunction(call.name, args, scope, call.loc);
  }

  const fn = lookupVariable(scope, call.name, getLine(call), getCol(call));

  // Check if it's a stdlib function
  if (typeof fn === 'function') {
    // Track stdlib function usage
    if (scope.evalState) {
      scope.evalState.calledStdlibFunctions.add(call.name);
    }

    const result = callStdlibPreservingAngles(
      call.name,
      fn as (...ns: number[]) => unknown,
      call.args.map((arg) => evaluateExpression(arg, scope)),
    ) as Value;

    // If stdlib function returns a PathSegment, track its commands
    if (typeof result === 'object' && result !== null && 'type' in result) {
      const typed = result as PathSegment;
      if (typed.type === 'PathSegment' && typed.value && scope.evalState) {
        typed.commands = parseAndTrackPathString(typed.value, scope);
      }
    }

    return result;
  }

  // Check if it's a user-defined function
  if (isCallableValue(fn)) {
    const userFn = fn;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(
        formatError(
          `${userFn.isLambda ? 'Lambda' : 'Function'} ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }

    // Lambdas resolve free names against their captured definition scope
    // (lexical); named fns resolve against the caller's scope (dynamic).
    const fnScope = createScope((userFn.closure as Scope | undefined) ?? scope);
    userFn.params.forEach((param, i) => {
      setVariable(fnScope, param, args[i]);
    });

    try {
      const result = evaluateStatements(userFn.body, fnScope);
      // Return as PathSegment if it looks like a path (contains path-like content)
      if (result) {
        return { type: 'PathSegment' as const, value: result };
      }
      return result;
    } catch (e) {
      // Catch ReturnSignal and return its value
      if (e instanceof ReturnSignal) {
        return e.value;
      }
      throw e;
    }
  }

  throw new Error(formatError(`${call.name} is not a function`, getLine(call), getCol(call)));
}

function isCallableValue(v: Value): v is UserFunction {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'UserFunction';
}

// The callback for a block-consuming builtin: the literal trailing block, or a
// UserFunction value (lambda or named fn) applied with `<<` (the workerExpr,
// passed unevaluated from the BinaryExpression pre-dispatch). A lambda's
// `closure` makes the callback body resolve free names lexically; blocks and
// named fns leave it undefined and keep today's caller-scope resolution.
// Parenthesized args are evaluated here ONCE, left-to-right, BEFORE the worker
// expression (reduce's init runs before the worker); `leadingArgs` holds the
// evaluated values for the builtin, which must consume them from here rather
// than re-evaluating expr.args. The old argument form (map(f)) is gone: a
// callable in the parentheses is just an arg, and the builtin's own arity
// error points the user at `<<`.
function resolveCallbackBlock(
  expr: { block?: { params: string[]; body: Statement[] }; args: Expression[]; method: string },
  scope: Scope,
  workerExpr?: Expression,
): { params: string[]; body: Statement[]; closure?: Scope; leadingArgs: Value[]; extraArgs: number } | null {
  if (expr.block) {
    // Pre-dispatch never routes a worker to a block-bearing call.
    const leadingArgs = expr.args.map((a) => evaluateExpression(a, scope));
    return { params: expr.block.params, body: expr.block.body, leadingArgs, extraArgs: leadingArgs.length };
  }
  if (workerExpr) {
    const leadingArgs = expr.args.map((a) => evaluateExpression(a, scope));
    const worker = evaluateExpression(workerExpr, scope);
    if (!isCallableValue(worker)) {
      throw new Error(
        formatError(
          `${expr.method}() << expects a function or lambda on the right side`,
          getLine(workerExpr),
        ),
      );
    }
    // closure is typed unknown on UserFunction (parallel evaluator Scope
    // types); values in this evaluator always hold this evaluator's Scope.
    return {
      params: worker.params,
      body: worker.body,
      closure: worker.closure as Scope | undefined,
      leadingArgs,
      extraArgs: leadingArgs.length,
    };
  }
  return null;
}

function evaluatePathArg(arg: PathArg, scope: Scope): string {
  switch (arg.type) {
    case 'NumberLiteral':
      return formatNum(convertUnitSuffix(arg.value, arg.unit));

    case 'BooleanLiteral':
      return arg.value ? '1' : '0';

    case 'Identifier': {
      const value = lookupVariable(scope, arg.name, getLine(arg), getCol(arg));
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
      }
      const n = toNumber(value);
      if (n !== undefined) {
        return formatNum(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathSegment') {
        return value.value;
      }
      throw new Error(`Variable ${arg.name} cannot be used as path argument`);
    }

    case 'CalcExpression': {
      const value = evaluateExpression(arg.expression, scope);
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
      }
      const n = toNumber(value);
      if (n === undefined) {
        throw new Error('calc() must evaluate to a number');
      }
      return formatNum(n);
    }

    case 'FunctionCall': {
      const value = evaluateFunctionCall(arg, scope);
      // Void functions (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      const n = toNumber(value);
      if (n !== undefined) {
        return formatNum(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') {
          return value.value;
        }
        if (value.type === 'PathWithResult') {
          // Extract path from compound result (result is stored but path is emitted)
          return value.path;
        }
      }
      throw new Error(`Function ${arg.name} did not return a valid path value`);
    }

    case 'MemberExpression': {
      const value = evaluateMemberExpression(arg, scope);
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
      }
      const n = toNumber(value);
      if (n !== undefined) {
        return formatNum(n);
      }
      throw new Error(`Member expression did not evaluate to a number`);
    }

    case 'IndexExpression': {
      const value = evaluateIndexExpression(arg, scope);
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
      }
      const n = toNumber(value);
      if (n !== undefined) {
        return formatNum(n);
      }
      throw new Error('Index expression did not evaluate to a number');
    }

    case 'MethodCallExpression': {
      const value = evaluateMethodCall(arg, scope);
      // Void method calls (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      const n = toNumber(value);
      if (n !== undefined) {
        return formatNum(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') {
          return value.value;
        }
        if (value.type === 'PathWithResult') {
          return value.path;
        }
      }
      throw new Error(`Method call did not return a valid path value`);
    }

    default:
      throw new Error(`Unknown path argument type: ${(arg as PathArg).type}`);
  }
}

/**
 * Get numeric arguments from path args for context tracking
 */
function getNumericArgs(args: PathArg[], scope: Scope): number[] {
  const numericArgs: number[] = [];
  for (const arg of args) {
    if (arg.type === 'NumberLiteral') {
      numericArgs.push(convertUnitSuffix(arg.value, arg.unit));
    } else if (arg.type === 'BooleanLiteral') {
      numericArgs.push(arg.value ? 1 : 0);
    } else if (arg.type === 'Identifier') {
      const value = lookupVariable(scope, arg.name);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
    } else if (arg.type === 'CalcExpression') {
      const value = evaluateExpression(arg.expression, scope);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
    } else if (arg.type === 'MemberExpression') {
      const value = evaluateMemberExpression(arg, scope);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
    } else if (arg.type === 'FunctionCall') {
      const value = evaluateFunctionCall(arg, scope);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
      // PathSegments don't contribute to numeric args for context tracking
    } else if (arg.type === 'IndexExpression') {
      const value = evaluateIndexExpression(arg, scope);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
    } else if (arg.type === 'MethodCallExpression') {
      const value = evaluateMethodCall(arg, scope);
      const n = toNumber(value);
      if (n !== undefined) {
        numericArgs.push(n);
      }
    }
  }
  return numericArgs;
}

/**
 * Update the ctx variable in scope with current context state
 */
function updateCtxVariable(scope: Scope): void {
  if (scope.evalState) {
    // Find the root scope to update ctx
    let rootScope = scope;
    while (rootScope.parent) {
      rootScope = rootScope.parent;
    }

    // Determine active transform state
    let { transformState } = scope.evalState;
    if (scope.evalState.activeLayerName) {
      const layer = scope.evalState.layers.get(scope.evalState.activeLayerName);
      if (layer?.layerType === 'PathLayer') {
        transformState = layer.transformState;
      }
    }

    rootScope.variables.set('ctx', {
      type: 'ContextObject' as const,
      value: contextToObject(scope.evalState.pathContext, transformState),
    });
  }
}

/**
 * Resolve a BBoxAnchor string to a point within the given bounding box.
 */
function resolveAnchorPoint(
  bb: { x: number; y: number; width: number; height: number },
  anchor: string,
  mError: (msg: string) => Error,
): { x: number; y: number } {
  switch (anchor) {
    case 'top-left': return { x: bb.x, y: bb.y };
    case 'top': return { x: bb.x + bb.width / 2, y: bb.y };
    case 'top-right': return { x: bb.x + bb.width, y: bb.y };
    case 'right': return { x: bb.x + bb.width, y: bb.y + bb.height / 2 };
    case 'bottom-right': return { x: bb.x + bb.width, y: bb.y + bb.height };
    case 'bottom': return { x: bb.x + bb.width / 2, y: bb.y + bb.height };
    case 'bottom-left': return { x: bb.x, y: bb.y + bb.height };
    case 'left': return { x: bb.x, y: bb.y + bb.height / 2 };
    case 'center': return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    default: throw mError(`Invalid BBoxAnchor value: '${anchor}'. Expected one of: top-left, top, top-right, right, bottom-right, bottom, bottom-left, left, center`);
  }
}

function getActiveTextLayer(scope: Scope): TextLayerState | null {
  if (!scope.evalState?.activeLayerName) return null;
  const layer = scope.evalState.layers.get(scope.evalState.activeLayerName);
  if (layer?.layerType !== 'TextLayer') return null;
  return layer;
}

function requireNumber(value: Value, label: string): number {
  const n = toNumber(value);
  if (n === undefined) {
    throw new Error(`${label} must be a number`);
  }
  return n;
}

/**
 * Evaluate a context-aware function that needs access to path context
 */
function evaluateContextAwareFunction(
  name: string,
  args: Value[],
  scope: Scope,
  loc?: { line?: number; column?: number },
): Value {
  const ctx = scope.evalState!.pathContext;
  const inPathBlock = !!(scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock;

  switch (name) {
    case 'polarPoint': {
      // polarPoint(angle, distance) → ContextObject with absolute {x, y}
      const [angle, distance] = args as [number, number];
      return {
        type: 'ContextObject' as const,
        value: {
          x: ctx.position.x + Math.cos(angle) * distance,
          y: ctx.position.y + Math.sin(angle) * distance,
        },
      };
    }

    case 'polarOffset': {
      // polarOffset(angle, distance) → ContextObject with relative {dx, dy}
      const [angle, distance] = args as [number, number];
      return {
        type: 'ContextObject' as const,
        value: {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
        },
      };
    }

    case 'polarMove': {
      // polarMove(angle, distance, isMoveTo?) → PathSegment
      const [angle, distance, isMoveTo = 0] = args as number[];
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const x = ctx.position.x + dx;
      const y = ctx.position.y + dy;
      const command = isMoveTo ? 'M' : 'L';

      updateContextForCommand(ctx, command, [x, y]);
      setLastTangent(ctx, angle); // Set tangent to movement direction
      updateCtxVariable(scope);

      if (inPathBlock) {
        return { type: 'PathSegment' as const, value: `${command.toLowerCase()} ${formatNum(dx)} ${formatNum(dy)}` };
      }
      return { type: 'PathSegment' as const, value: `${command} ${formatNum(x)} ${formatNum(y)}` };
    }

    case 'polarLine': {
      // polarLine(angle, distance) → PathSegment (always L command)
      const [angle, distance] = args as [number, number];
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const x = ctx.position.x + dx;
      const y = ctx.position.y + dy;

      updateContextForCommand(ctx, 'L', [x, y]);
      setLastTangent(ctx, angle);
      updateCtxVariable(scope);

      if (inPathBlock) {
        return { type: 'PathSegment' as const, value: `l ${formatNum(dx)} ${formatNum(dy)}` };
      }
      return { type: 'PathSegment' as const, value: `L ${formatNum(x)} ${formatNum(y)}` };
    }

    case 'arcFromCenter': {
      // arcFromCenter(dcx, dcy, radius, startAngle, endAngle, clockwise) → PathWithResult
      // dcx, dcy are relative offsets from current position to the arc center
      //
      // WARNING: If current position doesn't match the calculated arc start point,
      // a visible line segment (L command) will be drawn to the arc start.
      // For guaranteed continuous arcs without extra line segments, use arcFromPolarOffset.
      const [dcx, dcy, radius, startAngle, endAngle, clockwise] = args as number[];

      // Calculate absolute center from current position + offset
      const centerX = ctx.position.x + dcx;
      const centerY = ctx.position.y + dcy;

      // Calculate start/end points from center
      const startX = centerX + radius * Math.cos(startAngle);
      const startY = centerY + radius * Math.sin(startAngle);
      const endX = centerX + radius * Math.cos(endAngle);
      const endY = centerY + radius * Math.sin(endAngle);

      // Calculate arc flags
      const sweep = clockwise ? 1 : 0;
      const angleDiff = clockwise ? endAngle - startAngle : startAngle - endAngle;
      // Normalize angle difference to handle wrap-around
      const normalizedDiff = ((angleDiff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const largeArc = normalizedDiff > Math.PI ? 1 : 0;

      // Tangent angle at endpoint (perpendicular to radius)
      const tangentAngle = clockwise ? endAngle + Math.PI / 2 : endAngle - Math.PI / 2;

      // Check if current position matches arc start (within tolerance)
      const tolerance = 1e-10;
      const positionMatches =
        Math.abs(ctx.position.x - startX) < tolerance && Math.abs(ctx.position.y - startY) < tolerance;

      // Generate path string - use L instead of M to keep path continuous
      let pathStr: string;
      if (inPathBlock) {
        if (positionMatches) {
          const adx = endX - ctx.position.x;
          const ady = endY - ctx.position.y;
          pathStr = `a ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(adx)} ${formatNum(ady)}`;
        } else {
          const ldx = startX - ctx.position.x;
          const ldy = startY - ctx.position.y;
          const adx = endX - startX;
          const ady = endY - startY;
          pathStr = `l ${formatNum(ldx)} ${formatNum(ldy)} a ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(adx)} ${formatNum(ady)}`;
        }
      } else if (positionMatches) {
        // Current position is at arc start - just emit arc
        pathStr = `A ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(endX)} ${formatNum(endY)}`;
      } else {
        // Position mismatch - draw line to arc start, then arc (keeps path continuous)
        pathStr = `L ${formatNum(startX)} ${formatNum(startY)} A ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(endX)} ${formatNum(endY)}`;
      }

      // Update context tracking
      const emittedCommands = parseAndTrackPathString(pathStr, scope);

      // Store tangent for tangentLine/tangentArc
      setLastTangent(ctx, tangentAngle);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
        commands: emittedCommands,
        result: {
          type: 'ContextObject' as const,
          value: {
            point: { x: endX, y: endY },
            angle: tangentAngle,
          },
        },
      };
    }

    case 'arcFromPolarOffset': {
      // arcFromPolarOffset(angle, radius, angleOfArc) → PathWithResult
      // Creates an arc where the center is at a polar offset from current position.
      // Current position is guaranteed to be on the circle, so only an A command is emitted.
      //
      // Parameters:
      // - angle: Direction from current position to arc center (radians)
      // - radius: Arc radius
      // - angleOfArc: Sweep angle (positive = clockwise, negative = counterclockwise)
      const [angle, radius, angleOfArc] = args as number[];

      // Center is at polar offset from current position
      const centerX = ctx.position.x + radius * Math.cos(angle);
      const centerY = ctx.position.y + radius * Math.sin(angle);

      // Current position is on circle at angle + π from center
      const startAngle = angle + Math.PI;
      const endAngle = startAngle + angleOfArc;

      // Calculate endpoint
      const endX = centerX + radius * Math.cos(endAngle);
      const endY = centerY + radius * Math.sin(endAngle);

      // Determine arc flags
      const largeArc = Math.abs(angleOfArc) > Math.PI ? 1 : 0;
      const sweep = angleOfArc > 0 ? 1 : 0; // positive = CW (sweep=1), negative = CCW (sweep=0)

      // Tangent angle at endpoint (perpendicular to radius)
      // For CW (positive angleOfArc), tangent is endAngle + π/2
      // For CCW (negative angleOfArc), tangent is endAngle - π/2
      const tangentAngle = angleOfArc > 0 ? endAngle + Math.PI / 2 : endAngle - Math.PI / 2;

      // No M or L command - current position is guaranteed on circle
      let pathStr: string;
      if (inPathBlock) {
        const adx = endX - ctx.position.x;
        const ady = endY - ctx.position.y;
        pathStr = `a ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(adx)} ${formatNum(ady)}`;
      } else {
        pathStr = `A ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(endX)} ${formatNum(endY)}`;
      }

      // Update context tracking
      const emittedCommands = parseAndTrackPathString(pathStr, scope);

      // Store tangent for tangentLine/tangentArc
      setLastTangent(ctx, tangentAngle);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
        commands: emittedCommands,
        result: {
          type: 'ContextObject' as const,
          value: {
            point: { x: endX, y: endY },
            angle: tangentAngle,
          },
        },
      };
    }

    case 'tangentLine': {
      // tangentLine(length) → PathSegment
      const [length] = args as [number];

      if (ctx.lastTangent === undefined) {
        throw new Error(
          formatError(
            'tangentLine requires a previous path command that establishes direction',
            loc?.line,
            loc?.column,
          ),
        );
      }

      const savedTangent = ctx.lastTangent;
      const dx = Math.cos(ctx.lastTangent) * length;
      const dy = Math.sin(ctx.lastTangent) * length;
      const x = ctx.position.x + dx;
      const y = ctx.position.y + dy;

      updateContextForCommand(ctx, 'L', [x, y]);
      setLastTangent(ctx, savedTangent);
      updateCtxVariable(scope);

      if (inPathBlock) {
        return { type: 'PathSegment' as const, value: `l ${formatNum(dx)} ${formatNum(dy)}` };
      }
      return { type: 'PathSegment' as const, value: `L ${formatNum(x)} ${formatNum(y)}` };
    }

    case 'tangentArc': {
      // tangentArc(radius, sweepAngle) → PathWithResult
      const [radius, sweepAngle] = args as [number, number];

      if (ctx.lastTangent === undefined) {
        throw new Error(
          formatError('tangentArc requires a previous path command that establishes direction', loc?.line, loc?.column),
        );
      }

      // Center is perpendicular to tangent direction
      // For positive sweep (turning right on screen): center is to the right (+π/2 from heading)
      // For negative sweep (turning left on screen): center is to the left (-π/2 from heading)
      const toCenter = ctx.lastTangent + (sweepAngle >= 0 ? Math.PI / 2 : -Math.PI / 2);
      const cx = ctx.position.x + Math.cos(toCenter) * radius;
      const cy = ctx.position.y + Math.sin(toCenter) * radius;

      // Start angle is from center to current position
      const startAngle = Math.atan2(ctx.position.y - cy, ctx.position.x - cx);
      const endAngle = startAngle + sweepAngle;

      // End point
      const endX = cx + radius * Math.cos(endAngle);
      const endY = cy + radius * Math.sin(endAngle);

      // Arc flags
      const sweep = sweepAngle >= 0 ? 1 : 0;
      const largeArc = Math.abs(sweepAngle) > Math.PI ? 1 : 0;

      // New tangent at endpoint
      const newTangent = sweepAngle >= 0 ? endAngle + Math.PI / 2 : endAngle - Math.PI / 2;

      // Generate path string
      let pathStr: string;
      if (inPathBlock) {
        const adx = endX - ctx.position.x;
        const ady = endY - ctx.position.y;
        pathStr = `a ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(adx)} ${formatNum(ady)}`;
      } else {
        pathStr = `A ${formatNum(radius)} ${formatNum(radius)} 0 ${largeArc} ${sweep} ${formatNum(endX)} ${formatNum(endY)}`;
      }

      // Update context tracking
      const emittedCommands = parseAndTrackPathString(pathStr, scope);

      setLastTangent(ctx, newTangent);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
        commands: emittedCommands,
        result: {
          type: 'ContextObject' as const,
          value: {
            point: { x: endX, y: endY },
            angle: newTangent,
          },
        },
      };
    }

    case 'heading': {
      // heading(angle) → set tangent direction without emitting commands or moving cursor
      const [angle] = args as [number];
      setLastTangent(ctx, angle);
      updateCtxVariable(scope);
      return { type: 'PathSegment' as const, value: '' };
    }

    case 'turn': {
      // turn(delta) → add delta to current tangent direction
      const [delta] = args as [number];
      if (ctx.lastTangent === undefined) {
        throw new Error(
          formatError('turn requires an existing heading — use heading(angle) first', loc?.line, loc?.column),
        );
      }
      setLastTangent(ctx, ctx.lastTangent + delta);
      updateCtxVariable(scope);
      return { type: 'PathSegment' as const, value: '' };
    }

    default:
      throw new Error(`Unknown context-aware function: ${name}`);
  }
}

function evaluatePathCommand(cmd: PathCommand, scope: Scope): { text: string; commands: PathBlockCommand[] } {
  // Empty command means it's a statement-level function call
  if (cmd.command === '') {
    // Context tracking for any emitted PathSegments happens during arg
    // evaluation, so derive structured commands from a scratch context seeded
    // at the pre-statement cursor rather than re-applying to the live one.
    const ctx = scope.evalState?.pathContext;
    const startPos = ctx ? { x: ctx.position.x, y: ctx.position.y } : { x: 0, y: 0 };
    const subpathStart = ctx ? { x: ctx.start.x, y: ctx.start.y } : undefined;
    const args = cmd.args.map((arg) => evaluatePathArg(arg, scope));
    const text = args.join(' ');
    const commands = text ? parsePathStringAt(text, startPos, subpathStart) : [];
    return { text, commands };
  }

  // Get string args for output
  const stringArgs = cmd.args.map((arg) => evaluatePathArg(arg, scope));
  const result = cmd.command + (stringArgs.length > 0 ? ` ${stringArgs.join(' ')}` : '');

  // Update path context if tracking is enabled
  let commands: PathBlockCommand[] = [];
  if (scope.evalState && cmd.command !== '') {
    const numericArgs = getNumericArgs(cmd.args, scope);
    const ctx = scope.evalState.pathContext;
    const start = { x: ctx.position.x, y: ctx.position.y };
    updateContextForCommand(ctx, cmd.command, numericArgs);
    commands = [
      { command: cmd.command, args: numericArgs, start, end: { x: ctx.position.x, y: ctx.position.y } },
    ];
    updateCtxVariable(scope);
  }

  return { text: result, commands };
}

/**
 * Parse a path string, update context for each command found, and return the
 * structured commands. Used for tracking context when stdlib functions and
 * draw()/drawTo() return path strings.
 */
function parseAndTrackPathString(pathStr: string, scope: Scope): PathBlockCommand[] {
  if (!scope.evalState) return [];
  const commands = parsePathStringToCommands(pathStr, scope.evalState.pathContext);
  updateCtxVariable(scope);
  return commands;
}

/**
 * Evaluate text body items (TemplateLiteral, TspanStatement, ForLoop, IfStatement, LetDeclaration)
 * into TextChild array. Used by TextStatement block form evaluation.
 */
function evaluateTextBody(items: TextBodyItem[], scope: Scope, children: TextChild[]): LoopFlow {
  for (const item of items) {
    if (item.type === 'BreakStatement') {
      return { flow: 'break', line: getLine(item) ?? null };
    } else if (item.type === 'ContinueStatement') {
      return { flow: 'continue', line: getLine(item) ?? null };
    } else if (item.type === 'TemplateLiteral') {
      const text = evaluateTemplateLiteral(item, scope);
      children.push({ type: 'run', text });
    } else if (item.type === 'TspanStatement') {
      const text = evaluateTemplateLiteral(item.content, scope);
      const dx = item.dx ? requireNumber(evaluateExpression(item.dx, scope), 'tspan() dx') : undefined;
      const dy = item.dy ? requireNumber(evaluateExpression(item.dy, scope), 'tspan() dy') : undefined;
      const rot = item.rotation
        ? requireNumber(evaluateExpression(item.rotation, scope), 'tspan() rotation')
        : undefined;
      let tspanStyles: Record<string, string> | undefined;
      if (item.styles) {
        const sv = evaluateExpression(item.styles, scope);
        if (!isStyleBlock(sv)) throw new Error('tspan() styles must be a style block');
        tspanStyles = sv.properties;
      }
      children.push({ type: 'tspan', text, dx, dy, rotation: rot, styles: tspanStyles });
    } else if (item.type === 'ForLoop') {
      const start = requireNumber(evaluateExpression(item.start, scope), 'for loop start');
      const end = requireNumber(evaluateExpression(item.end, scope), 'for loop end');

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error('for loop range must be finite (got Infinity or NaN)');
      }

      const ascending = start <= end;
      const iterations = ascending ? end - start + 1 : start - end + 1;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(`for loop would run ${iterations} iterations (max ${MAX_ITERATIONS})`);
      }

      if (ascending) {
        for (let i = start; i <= end; i++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          const flow = evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
          if (flow?.flow === 'break') break;
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          const flow = evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
          if (flow?.flow === 'break') break;
        }
      }
    } else if (item.type === 'ForEachLoop') {
      const iterable = evaluateExpression(item.iterable, scope);
      if (!isArrayValue(iterable)) {
        throw new Error('for-each requires an array');
      }
      lockArray(iterable);
      try {
        for (let i = 0; i < iterable.elements.length; i++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, iterable.elements[i]);
          if (item.indexVariable) {
            setVariable(loopScope, item.indexVariable, i);
          }
          const flow = evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
          if (flow?.flow === 'break') break;
        }
      } finally {
        unlockArray(iterable);
      }
    } else if (item.type === 'IfStatement') {
      const condition = evaluateExpression(item.condition, scope);
      const condNum = toNumber(condition);
      const isTruthy = condition !== null && (condNum !== undefined ? condNum !== 0 : Boolean(condition));
      // Propagate loop flow out of the taken branch to the enclosing loop
      if (isTruthy) {
        const flow = evaluateTextBody(item.consequent as TextBodyItem[], scope, children);
        if (flow) return flow;
      } else if (item.alternate) {
        const flow = evaluateTextBody(item.alternate as TextBodyItem[], scope, children);
        if (flow) return flow;
      }
    } else if (item.type === 'LetDeclaration') {
      const value = evaluateExpression(item.value, scope);
      if (item.pattern) {
        bindDestructuringPattern(item.pattern, value, scope, getLine(item));
      } else {
        setVariable(scope, item.name, value);
      }
    }
  }
  return undefined;
}

/**
 * Bind a destructuring pattern to a value, setting variables in the given scope.
 */
function bindDestructuringPattern(
  pattern: ArrayDestructuringPattern | ObjectDestructuringPattern,
  value: Value,
  scope: Scope,
  line?: number,
): void {
  if (pattern.type === 'ArrayDestructuringPattern') {
    if (!isArrayValue(value)) {
      throw new Error(formatError('Cannot destructure non-array value with array pattern', line));
    }
    for (let i = 0; i < pattern.elements.length; i++) {
      setVariable(scope, pattern.elements[i], value.elements[i] ?? null);
    }
    if (pattern.rest) {
      setVariable(scope, pattern.rest, {
        type: 'ArrayValue' as const,
        elements: value.elements.slice(pattern.elements.length),
      });
    }
  } else {
    if (isObjectValue(value)) {
      const usedKeys = new Set<string>();
      for (const { key, alias } of pattern.properties) {
        usedKeys.add(key);
        setVariable(scope, alias ?? key, value.properties.get(key) ?? null);
      }
      if (pattern.rest) {
        const remaining = new Map<string, Value>();
        for (const [k, v] of value.properties) {
          if (!usedKeys.has(k)) remaining.set(k, v);
        }
        setVariable(scope, pattern.rest, { type: 'ObjectValue' as const, properties: remaining });
      }
      return;
    }

    // Built-in structs (Point, PolarVector, Grid, MeshPoint, Color, context
    // objects) destructure through the shared registry. Unlike plain objects,
    // their property set is fixed, so a missing key is an error — the same
    // contract as dot access.
    const struct = getStructDescriptor(value);
    if (!struct) {
      throw new Error(formatError('Cannot destructure non-object value with object pattern', line));
    }
    const usedKeys = new Set<string>();
    for (const { key, alias } of pattern.properties) {
      if (!struct.has(value, key)) {
        throw new Error(formatError(`Property '${key}' does not exist on ${struct.name}`, line));
      }
      usedKeys.add(key);
      setVariable(scope, alias ?? key, struct.get(value, key));
    }
    if (pattern.rest) {
      const remaining = new Map<string, Value>();
      for (const key of struct.keys(value)) {
        if (!usedKeys.has(key)) remaining.set(key, struct.get(value, key));
      }
      setVariable(scope, pattern.rest, { type: 'ObjectValue' as const, properties: remaining });
    }
  }
}

/**
 * Evaluate a statement, appending output to the accumulator array.
 * Using an accumulator avoids O(n^2) string concatenation from nested joins.
 */
/**
 * Fast-path evaluation of a Grid cell-callback body (fill/map/forEach).
 *
 * A top-level `return` is handled by short-circuiting WITHOUT throwing — the
 * per-cell `throw new ReturnSignal(...)` / `catch` round-trip was the dominant
 * cost for large grids (it kept V8 from optimizing the loop, so a 64k-cell
 * grid took ~14s even when the body was a bare `return 0.5;`). Nested returns
 * (inside if/for) still throw ReturnSignal and are caught by the caller's
 * try/catch, preserving full early-return semantics.
 *
 * Returns { returned: true, value } when a top-level return fired (the rest of
 * the body is skipped), otherwise { returned: false, value: null }.
 */
function evaluateGridCellBody(
  body: Statement[],
  scope: Scope,
  accum: PathStore,
): { returned: boolean; value: Value } {
  for (const stmt of body) {
    if (stmt.type === 'ReturnStatement') {
      return { returned: true, value: evaluateExpression(stmt.value, scope) };
    }
    // Grid cell bodies are break/continue boundaries (builder-enforced; defensive)
    const flow = evaluateStatementToAccum(stmt, scope, accum);
    if (flow) throw loopFlowBoundaryError(flow);
  }
  return { returned: false, value: null };
}

/**
 * Evaluate a PathCommand's `with` / `as` clause expressions into plain values.
 * Validates label types and corner-op arity; placement validation happens in
 * applyAnnotationsToStore once the record exists.
 */
function evaluatePathAnnotations(
  stmt: PathCommand,
  scope: Scope,
): import('./segments').EvaluatedAnnotations | undefined {
  const ann = stmt.annotations;
  if (!ann) return undefined;
  const line = getLine(stmt);
  const result: import('./segments').EvaluatedAnnotations = {};

  if (ann.cornerOp) {
    const { kind, args } = ann.cornerOp;
    const arity: Record<string, [number, number]> = { fillet: [1, 1], chamfer: [1, 2], ellipticalFillet: [2, 3] };
    const [min, max] = arity[kind];
    if (args.length < min || args.length > max) {
      throw new Error(
        formatError(
          `${kind}() in a with clause expects ${min === max ? min : `${min}-${max}`} argument${max > 1 ? 's' : ''}, got ${args.length}`,
          line,
        ),
      );
    }
    const values = args.map((a, i) => {
      const v = evaluateExpression(a, scope);
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(formatError(`${kind}() argument ${i + 1} must be a finite number`, line));
      }
      return v;
    });
    result.cornerOp = { kind, args: values, loc: ann.cornerOp.loc };
  }

  for (const label of ann.labels ?? []) {
    const value = evaluateExpression(label.name, scope);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(formatError(`${label.kind}() label name must be a non-empty string`, line));
    }
    if (label.kind === 'segment') {
      if (result.segmentLabel !== undefined) {
        throw new Error(formatError('At most one segment() label per as clause', line));
      }
      result.segmentLabel = value;
    } else {
      if (result.endpointLabel !== undefined) {
        throw new Error(formatError('At most one endpoint() label per as clause', line));
      }
      result.endpointLabel = value;
    }
  }
  return result;
}

/**
 * Loop-control signal propagated by RETURN VALUE, never by throw: the Grid
 * callback fast path exists because per-cell throw/catch deopted V8 (~100x on
 * 64k cells), and for loops run up to MAX_ITERATIONS statements per pass.
 * `undefined` (the implicit return of every ordinary statement) means normal
 * completion, so the hot path allocates nothing; a flow object is created
 * only when a break/continue actually executes. Only statements that can
 * carry flow propagate it (Break/Continue themselves, IfStatement branches,
 * the statement-list driver); loops consume it. The AST builder guarantees
 * lexical placement, so flow reaching any other boundary is a bug guarded by
 * the defensive throws at those boundaries.
 */
type LoopFlow = { flow: 'continue' | 'break'; line: number | null } | undefined;

function loopFlowBoundaryError(flow: NonNullable<LoopFlow>): Error {
  return new Error(
    formatError(`'${flow.flow}' is only valid inside a for loop`, flow.line ?? undefined),
  );
}

function evaluateStatementToAccum(stmt: Statement, scope: Scope, accum: PathStore): LoopFlow {
  switch (stmt.type) {
    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      // Handle destructuring patterns
      if (stmt.pattern) {
        const bindValue = (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') ? value.result : value;
        bindDestructuringPattern(stmt.pattern, bindValue, scope, getLine(stmt));
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult' && value.path) {
          recordPath(accum, value.path, value.commands ?? [], { loc: stmt.loc });
        }
        return;
      }
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value;
        setVariable(scope, stmt.name, pwr.result);
        if (pwr.path) recordPath(accum, pwr.path, pwr.commands ?? [], { loc: stmt.loc });
        return;
      }
      setVariable(scope, stmt.name, value);
      return;
    }

    case 'AssignmentStatement': {
      const value = evaluateExpression(stmt.value, scope);
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value;
        updateVariable(scope, stmt.name, pwr.result, getLine(stmt));
        if (pwr.path) recordPath(accum, pwr.path, pwr.commands ?? [], { loc: stmt.loc });
        return;
      }
      updateVariable(scope, stmt.name, value, getLine(stmt));
      return;
    }

    case 'IndexedAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const index = evaluateExpression(stmt.index, scope);
      const value = evaluateExpression(stmt.value, scope);

      if (isObjectValue(obj)) {
        if (typeof index !== 'string') throw new Error(formatError('Object key must be a string', getLine(stmt)));
        obj.properties.set(index, value);
        return;
      }
      if (isArrayValue(obj)) {
        if (isArrayLocked(obj)) throw new Error(formatError(arrayMutationError('assign to an element of'), getLine(stmt)));
        if (typeof index !== 'number') throw new Error(formatError('Array index must be a number', getLine(stmt)));
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw new Error(formatError(`Array index ${index} out of bounds (length ${obj.elements.length})`, getLine(stmt)));
        obj.elements[index] = value;
        return;
      }
      throw new Error(formatError('Indexed assignment requires an object or array', getLine(stmt)));
    }

    case 'ForLoop': {
      const start = toNumber(evaluateExpression(stmt.start, scope));
      const end = toNumber(evaluateExpression(stmt.end, scope));

      if (start === undefined || end === undefined) {
        throw new Error(formatError('for loop range must be numeric', getLine(stmt)));
      }

      // Guard against infinite loops
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(formatError('for loop range must be finite (got Infinity or NaN)', getLine(stmt)));
      }

      const ascending = start <= end;
      // Inclusive ranges: both start and end are included
      const iterations = ascending ? end - start + 1 : start - end + 1;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(
          formatError(`for loop would run ${iterations} iterations (max ${MAX_ITERATIONS})`, getLine(stmt)),
        );
      }

      if (ascending) {
        for (let i = start; i <= end; i++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          const flow = evaluateStatementsToAccum(stmt.body, loopScope, accum);
          if (flow?.flow === 'break') break;
          // 'continue' already ended this iteration's body — fall through
        }
      } else {
        // Descending range
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          const flow = evaluateStatementsToAccum(stmt.body, loopScope, accum);
          if (flow?.flow === 'break') break;
        }
      }
      return;
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const condNum = toNumber(condition);
      const isTruthy = condition !== null && (condNum !== undefined ? condNum !== 0 : Boolean(condition));

      // Propagate loop flow out of the taken branch to the enclosing loop
      if (isTruthy) {
        return evaluateStatementsToAccum(stmt.consequent, createScope(scope), accum);
      } else if (stmt.alternate) {
        return evaluateStatementsToAccum(stmt.alternate, createScope(scope), accum);
      }
      return;
    }

    case 'ForEachLoop': {
      const iterable = evaluateExpression(stmt.iterable, scope);

      // Object iteration
      if (isObjectValue(iterable)) {
        const keys = Array.from(iterable.properties.keys());
        for (const key of keys) {
          const loopScope = createScope(scope);
          if (stmt.indexVariable) {
            // for ([key, value] in obj) — key-value pairs
            setVariable(loopScope, stmt.variable, key);
            setVariable(loopScope, stmt.indexVariable, iterable.properties.get(key)!);
          } else {
            // for (key in obj) — keys only
            setVariable(loopScope, stmt.variable, key);
          }
          const flow = evaluateStatementsToAccum(stmt.body, loopScope, accum);
          if (flow?.flow === 'break') break;
        }
        return;
      }

      // Array iteration (with smart destructuring)
      if (!isArrayValue(iterable)) {
        throw new Error(formatError('for-each requires an array or object', getLine(stmt)));
      }

      lockArray(iterable);
      try {
        for (let i = 0; i < iterable.elements.length; i++) {
          const loopScope = createScope(scope);
          const element = iterable.elements[i];
          setVariable(loopScope, stmt.variable, element);
          if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, i);
          const flow = evaluateStatementsToAccum(stmt.body, loopScope, accum);
          if (flow?.flow === 'break') break;
        }
      } finally {
        unlockArray(iterable);
      }
      return;
    }

    case 'FunctionDefinition': {
      const fn: UserFunction = {
        type: 'UserFunction',
        params: stmt.params,
        body: stmt.body,
      };
      setVariable(scope, stmt.name, fn);
      return;
    }

    case 'EnumDefinition': {
      if (scope.variables.has(stmt.name)) {
        throw new Error(formatError(`Enum '${stmt.name}' is already defined`, getLine(stmt)));
      }
      const props = new Map<string, Value>();
      for (const member of stmt.members) {
        const value = member.value
          ? evaluateExpression(member.value, scope)
          : member.name.toLowerCase(); // auto-value: lowercase string
        props.set(member.name, value);
      }
      setVariable(scope, stmt.name, { type: 'ObjectValue', properties: props } as ObjectValue);
      return;
    }

    case 'PathCommand': {
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodResult = evaluateMethodCall(stmt.args[0], scope);
        // If the method returns a PathWithResult (e.g., draw()), emit its path
        if (
          typeof methodResult === 'object' &&
          methodResult !== null &&
          'type' in methodResult &&
          methodResult.type === 'PathWithResult'
        ) {
          const pwr = methodResult;
          if (pwr.path) {
            // `accum` is the default layer's accumulator at top level (it adopts the
            // top-level accum) and the active layer's inside an apply block, so a
            // single push routes correctly in all cases.
            recordPath(accum, pwr.path, pwr.commands ?? [], { loc: stmt.loc });
            const annotations = evaluatePathAnnotations(stmt, scope);
            if (annotations) {
              applyAnnotationsToStore(accum, annotations, (msg) => {
                throw new Error(formatError(msg, getLine(stmt)));
              });
            }
          }
        }
        return;
      }

      // Validate path commands aren't targeting a TextLayer
      if (scope.evalState) {
        if (scope.evalState.activeLayerName) {
          const activeLayer = scope.evalState.layers.get(scope.evalState.activeLayerName);
          if (activeLayer?.layerType === 'TextLayer') {
            throw new Error(formatError('Path commands cannot be used inside a TextLayer apply block', getLine(stmt)));
          }
        } else if (scope.evalState.defaultLayerName) {
          const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName);
          if (defaultLayer?.layerType === 'TextLayer') {
            throw new Error(
              formatError(
                'Path commands cannot be routed to a TextLayer. Use a PathLayer as default or wrap in a layer().apply block',
                getLine(stmt),
              ),
            );
          }
        }
      }
      const result = evaluatePathCommand(stmt, scope);
      if (result.text) {
        // `accum` is the default layer's accumulator at top level (the default layer
        // adopts the top-level accum) and the active layer's accumulator inside an
        // apply block — a single push routes correctly in all cases.
        recordPath(accum, result.text, result.commands, { loc: stmt.loc });
        const annotations = evaluatePathAnnotations(stmt, scope);
        if (annotations) {
          applyAnnotationsToStore(accum, annotations, (msg) => {
            throw new Error(formatError(msg, getLine(stmt)));
          });
        }
      } else if (stmt.annotations) {
        throw new Error(formatError('with/as clauses require the statement to emit path data', getLine(stmt)));
      }
      return;
    }

    case 'ViewBoxDefinition': {
      if (!scope.evalState) {
        throw new Error(formatError('ViewBox definitions require evaluation context', getLine(stmt)));
      }
      // Guard at the case, not only in the block-body loops: a definition
      // nested in if/for inside a block reaches here with the block's
      // synthetic evalState (activeLayerName reset to null), so the flags
      // are the only reliable placement signal at any nesting depth.
      if ((scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock) {
        throw new Error(formatError('ViewBox definitions are not allowed inside path blocks', getLine(stmt)));
      }
      if ((scope.evalState as EvaluationState & { _insideTextBlock?: boolean })._insideTextBlock) {
        throw new Error(formatError('ViewBox definitions are not allowed inside text blocks', getLine(stmt)));
      }
      if (scope.evalState.activeLayerName !== null) {
        throw new Error(formatError('ViewBox must appear at top level', getLine(stmt)));
      }
      if (scope.evalState.viewBox) {
        const prev = scope.evalState.viewBox.loc?.line;
        const where = prev ? ` (first defined at line ${prev})` : '';
        throw new Error(formatError(`Duplicate ViewBox definition${where}`, getLine(stmt)));
      }
      const evalArg = (label: string, expr: typeof stmt.originX): number => {
        const v = evaluateExpression(expr, scope);
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new Error(formatError(`ViewBox ${label} must evaluate to a finite number`, getLine(stmt)));
        }
        return v;
      };
      const originX = evalArg('originX', stmt.originX);
      const originY = evalArg('originY', stmt.originY);
      const width = evalArg('width', stmt.width);
      const height = evalArg('height', stmt.height);
      if (width <= 0) {
        throw new Error(formatError(`ViewBox width must be greater than 0 (got ${width})`, getLine(stmt)));
      }
      if (height <= 0) {
        throw new Error(formatError(`ViewBox height must be greater than 0 (got ${height})`, getLine(stmt)));
      }
      scope.evalState.viewBox = { originX, originY, width, height, loc: stmt.loc };
      return;
    }

    case 'LayerDefinition': {
      if (!scope.evalState) {
        throw new Error(formatError('Layer definitions require evaluation context', getLine(stmt)));
      }
      const nameValue = evaluateExpression(stmt.name, scope);
      if (typeof nameValue !== 'string') {
        throw new Error(formatError('Layer name must be a string', getLine(stmt)));
      }
      try {
        validateCSSIdent(nameValue, 'layer-name');
      } catch (e) {
        throw new Error(formatError((e as Error).message, getLine(stmt)));
      }
      if (scope.evalState.layers.has(nameValue)) {
        throw new Error(formatError(`Duplicate layer name: '${nameValue}'`, getLine(stmt)));
      }
      if (stmt.isDefault && scope.evalState.defaultLayerName !== null) {
        throw new Error(
          formatError(
            `Cannot define multiple default layers. '${scope.evalState.defaultLayerName}' is already the default`,
            getLine(stmt),
          ),
        );
      }
      const styleValue = evaluateExpression(stmt.styleExpr, scope);
      if (!isStyleBlock(styleValue)) {
        throw new Error(formatError('Layer style must be a style block', getLine(stmt)));
      }
      const styles: LayerStyle = { ...styleValue.properties };
      if (stmt.layerType === 'GroupLayer') {
        if (stmt.isDefault) {
          throw new Error(formatError('GroupLayer cannot be the default layer', getLine(stmt)));
        }
        const layerState: GroupLayerState = {
          name: nameValue,
          layerType: 'GroupLayer',
          isDefault: false as const,
          styles,
          transformState: createTransformState(),
          children: [],
        };
        scope.evalState.layers.set(nameValue, layerState);
        scope.evalState.layerOrder.push(nameValue);
        return;
      }
      if (stmt.layerType === 'TextLayer') {
        const layerState: TextLayerState = {
          name: nameValue,
          layerType: 'TextLayer',
          isDefault: stmt.isDefault,
          styles,
          textElements: [],
        };
        scope.evalState.layers.set(nameValue, layerState);
        scope.evalState.layerOrder.push(nameValue);
        if (stmt.isDefault) {
          scope.evalState.defaultLayerName = nameValue;
        }
        return;
      }
      // The default layer IS the implicit/global layer — there is only ever one
      // default layer, not a separate "global" layer alongside it. So a default
      // PathLayer adopts the global pen context, transform state, and the top-level
      // (root) accumulator rather than forking its own. Bare top-level commands —
      // which write to those global objects and the root accum — thereby flow into
      // this layer automatically, and `define default PathLayer` simply names and
      // styles that single layer. We adopt `rootAccum` (the top-level accumulator
      // stored on evalState) rather than the `accum` parameter, because the `define`
      // may be evaluated where the threaded `accum` is a throwaway (function body,
      // map callback) or another layer's — only the root accum is the default layer's.
      // Non-default layers get their own fresh state.
      const layerState: PathLayerState = {
        name: nameValue,
        layerType: 'PathLayer',
        isDefault: stmt.isDefault,
        styles,
        pathContext: stmt.isDefault ? scope.evalState.pathContext : createPathContext(),
        accum: stmt.isDefault ? (scope.evalState.rootAccum ?? accum) : createPathStore(),
        transformState: stmt.isDefault ? scope.evalState.transformState : createTransformState(),
      };
      scope.evalState.layers.set(nameValue, layerState);
      scope.evalState.layerOrder.push(nameValue);
      if (stmt.isDefault) {
        scope.evalState.defaultLayerName = nameValue;
      }
      return;
    }

    case 'LayerApplyBlock': {
      if (!scope.evalState) {
        throw new Error(formatError('Layer apply blocks require evaluation context', getLine(stmt)));
      }
      const target = evaluateExpression(stmt.layerName, scope);
      let layer: LayerState;
      let nameValue: string;

      if (typeof target === 'string') {
        // Existing path: look up by name
        const found = scope.evalState.layers.get(target);
        if (!found) {
          throw new Error(formatError(`Undefined layer: '${target}'`, getLine(stmt)));
        }
        layer = found;
        nameValue = target;
      } else if (isLayerReference(target)) {
        // New path: use reference directly
        layer = target.layer;
        nameValue = layer.name;
      } else {
        throw new Error(formatError('layer apply target must be a string or layer reference', getLine(stmt)));
      }
      if (scope.evalState.activeLayerName !== null) {
        throw new Error(
          formatError(
            `Cannot nest layer apply blocks. Already inside layer '${scope.evalState.activeLayerName}'`,
            getLine(stmt),
          ),
        );
      }
      if (layer.layerType === 'GroupLayer') {
        throw new Error(
          formatError('GroupLayer does not support apply blocks. Use .append() to add children', getLine(stmt)),
        );
      }
      if (layer.layerType === 'TextLayer') {
        // TextLayer apply: set activeLayerName so TextStatements write here
        const prevActiveLayerName = scope.evalState.activeLayerName;
        scope.evalState.activeLayerName = nameValue;
        for (const bodyStmt of stmt.body) {
          // Apply blocks are break/continue boundaries (builder-enforced; defensive)
          const flow = evaluateStatementToAccum(bodyStmt, createScope(scope), createPathStore());
          if (flow) throw loopFlowBoundaryError(flow);
        }
        scope.evalState.activeLayerName = prevActiveLayerName;
        return;
      }
      // PathLayer apply: save current state, switch to layer's context
      const prevPathContext = scope.evalState.pathContext;
      const prevActiveLayerName = scope.evalState.activeLayerName;
      scope.evalState.pathContext = (layer as PathLayerState).pathContext;
      scope.evalState.activeLayerName = nameValue;
      updateCtxVariable(scope);
      // Apply blocks are break/continue boundaries (builder-enforced; defensive)
      const applyFlow = evaluateStatementsToAccum(stmt.body, createScope(scope), (layer as PathLayerState).accum);
      if (applyFlow) throw loopFlowBoundaryError(applyFlow);
      scope.evalState.pathContext = prevPathContext;
      scope.evalState.activeLayerName = prevActiveLayerName;
      updateCtxVariable(scope);
      return;
    }

    case 'TextStatement': {
      if (!scope.evalState) throw new Error(formatError('text() requires evaluation context', getLine(stmt)));
      const activeTextLayer = getActiveTextLayer(scope);
      if (!activeTextLayer) {
        throw new Error(formatError('text() can only be used inside a TextLayer apply block', getLine(stmt)));
      }

      const x = requireNumber(evaluateExpression(stmt.x, scope), 'text() x');
      const y = requireNumber(evaluateExpression(stmt.y, scope), 'text() y');
      const rotation = stmt.rotation
        ? requireNumber(evaluateExpression(stmt.rotation, scope), 'text() rotation')
        : undefined;
      let textStyles: Record<string, string> | undefined;
      if (stmt.styles) {
        const sv = evaluateExpression(stmt.styles, scope);
        if (!isStyleBlock(sv)) throw new Error('text() styles must be a style block');
        textStyles = sv.properties;
      }

      if (stmt.content) {
        // Inline form: text(x, y)`content`
        const text = evaluateTemplateLiteral(stmt.content, scope);
        activeTextLayer.textElements.push({ x, y, rotation, styles: textStyles, children: [{ type: 'run', text }] });
      } else if (stmt.body) {
        // Block form: text(x, y) { `text` tspan() for/if/let... }
        const children: TextChild[] = [];
        // Text-block top level is a break/continue boundary (builder-enforced; defensive)
        const textFlow = evaluateTextBody(stmt.body, scope, children);
        if (textFlow) throw loopFlowBoundaryError(textFlow);
        activeTextLayer.textElements.push({ x, y, rotation, styles: textStyles, children });
      }
      return;
    }

    case 'MemberAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const value = evaluateExpression(stmt.value, scope);
      if (isLayerReference(obj) && stmt.property === 'styles') {
        if (!isStyleBlock(value)) throw new Error(formatError('Layer styles must be a style block', getLine(stmt)));
        obj.layer.styles = { ...value.properties };
        return;
      }
      if (isPatternValue(obj)) {
        assignPatternProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
        return;
      }
      if (isMarkerValue(obj)) {
        assignMarkerProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
        return;
      }
      if (isNoiseFilterValue(obj)) {
        switch (stmt.property) {
          case 'style': {
            if (typeof value !== 'string')
              throw new Error(
                formatError(
                  `NoiseFilter.style must be a NoiseFilterStyle enum value`,
                  getLine(stmt),
                ),
              );
            const valid = Object.values(BUILTIN_ENUMS.NoiseFilterStyle);
            if (!valid.includes(value))
              throw new Error(
                formatError(
                  `Invalid value '${value}' for NoiseFilter.style. Valid values: ${valid.join(', ')}`,
                  getLine(stmt),
                ),
              );
            // Re-baseline parameters from the new preset's defaults, but
            // preserve the seed (it's keyed off the id, not the style).
            const seed = obj.seed;
            const reset = makeDefaultNoiseFilter(obj.id, value as NoiseFilterStyleName);
            obj.style = reset.style;
            obj.scale = reset.scale;
            obj.octaves = reset.octaves;
            obj.amount = reset.amount;
            obj.monochrome = reset.monochrome;
            obj.blend = reset.blend;
            obj.contrast = reset.contrast;
            obj.stitch = reset.stitch;
            obj.seed = seed;
            return;
          }
          case 'scale': {
            if (typeof value === 'number') {
              if (!Number.isFinite(value) || value <= 0)
                throw new Error(formatError(`NoiseFilter.scale must be a finite positive number`, getLine(stmt)));
              obj.scale = value;
            } else if (value === 'fine') {
              obj.scale = 5.0;
            } else if (value === 'medium') {
              obj.scale = 1.0;
            } else if (value === 'coarse') {
              obj.scale = 0.3;
            } else {
              throw new Error(
                formatError(
                  `NoiseFilter.scale must be a positive number or one of 'fine' | 'medium' | 'coarse'`,
                  getLine(stmt),
                ),
              );
            }
            return;
          }
          case 'octaves': {
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10)
              throw new Error(
                formatError(`NoiseFilter.octaves must be an integer between 1 and 10`, getLine(stmt)),
              );
            obj.octaves = value;
            return;
          }
          case 'amount': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
              throw new Error(formatError(`NoiseFilter.amount must be a number between 0 and 1`, getLine(stmt)));
            obj.amount = value;
            return;
          }
          case 'monochrome': {
            if (isBooleanValue(value)) {
              obj.monochrome = value.value === 1;
            } else if (typeof value === 'number') {
              obj.monochrome = value !== 0;
            } else {
              throw new Error(formatError(`NoiseFilter.monochrome must be a boolean`, getLine(stmt)));
            }
            return;
          }
          case 'seed': {
            if (typeof value !== 'number' || !Number.isFinite(value))
              throw new Error(formatError(`NoiseFilter.seed must be a finite number`, getLine(stmt)));
            obj.seed = value;
            return;
          }
          case 'blend': {
            if (typeof value !== 'string')
              throw new Error(formatError(`NoiseFilter.blend must be a BlendMode enum value`, getLine(stmt)));
            const valid = Object.values(BUILTIN_ENUMS.BlendMode);
            if (!valid.includes(value))
              throw new Error(
                formatError(
                  `Invalid value '${value}' for NoiseFilter.blend. Valid values: ${valid.join(', ')}`,
                  getLine(stmt),
                ),
              );
            obj.blend = value;
            return;
          }
          case 'contrast': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
              throw new Error(formatError(`NoiseFilter.contrast must be a finite non-negative number`, getLine(stmt)));
            obj.contrast = value;
            return;
          }
          case 'stitch': {
            if (isBooleanValue(value)) {
              obj.stitch = value.value === 1;
            } else if (typeof value === 'number') {
              obj.stitch = value !== 0;
            } else {
              throw new Error(formatError(`NoiseFilter.stitch must be a boolean`, getLine(stmt)));
            }
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to NoiseFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isGlowFilterValue(obj)) {
        switch (stmt.property) {
          case 'mode': {
            if (typeof value !== 'string') {
              throw new Error(formatError(`GlowFilter.mode must be a GlowMode enum value`, getLine(stmt)));
            }
            const valid = Object.values(BUILTIN_ENUMS.GlowMode);
            if (!valid.includes(value)) {
              throw new Error(
                formatError(
                  `Invalid value '${value}' for GlowFilter.mode. Valid values: ${valid.join(', ')}`,
                  getLine(stmt),
                ),
              );
            }
            obj.mode = value as GlowModeName;
            return;
          }
          case 'color': {
            if (!isColorValue(value)) {
              throw new Error(formatError(`GlowFilter.color must be a Color value`, getLine(stmt)));
            }
            obj.color = colorValueToCSS(value);
            return;
          }
          case 'radius': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`GlowFilter.radius must be a finite non-negative number`, getLine(stmt)));
            }
            obj.radius = value;
            return;
          }
          case 'spread': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`GlowFilter.spread must be a finite non-negative number`, getLine(stmt)));
            }
            obj.spread = value;
            return;
          }
          case 'opacity': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
              throw new Error(formatError(`GlowFilter.opacity must be a number between 0 and 1`, getLine(stmt)));
            }
            obj.opacity = value;
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to GlowFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isEmbossFilterValue(obj)) {
        switch (stmt.property) {
          case 'angle': {
            const n = toNumber(value);
            if (n === undefined || !Number.isFinite(n)) {
              throw new Error(formatError(`EmbossFilter.angle must be a finite number (with angle unit)`, getLine(stmt)));
            }
            obj.angle = n;
            return;
          }
          case 'elevation': {
            const n = toNumber(value);
            if (n === undefined || !Number.isFinite(n)) {
              throw new Error(formatError(`EmbossFilter.elevation must be a finite number (with angle unit)`, getLine(stmt)));
            }
            obj.elevation = n;
            return;
          }
          case 'depth': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`EmbossFilter.depth must be a finite non-negative number`, getLine(stmt)));
            }
            obj.depth = value;
            return;
          }
          case 'strength': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`EmbossFilter.strength must be a finite non-negative number`, getLine(stmt)));
            }
            obj.strength = value;
            return;
          }
          case 'shininess': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
              throw new Error(formatError(`EmbossFilter.shininess must be a finite number >= 1`, getLine(stmt)));
            }
            obj.shininess = value;
            return;
          }
          case 'lightColor': {
            if (!isColorValue(value)) {
              throw new Error(formatError(`EmbossFilter.lightColor must be a Color value`, getLine(stmt)));
            }
            obj.lightColor = colorValueToCSS(value);
            return;
          }
          case 'smooth': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`EmbossFilter.smooth must be a finite non-negative number`, getLine(stmt)));
            }
            obj.smooth = value;
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to EmbossFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isElevationShadowFilterValue(obj)) {
        switch (stmt.property) {
          case 'elevation': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 24) {
              throw new Error(
                formatError(`ElevationShadowFilter.elevation must be a finite number between 0 and 24`, getLine(stmt)),
              );
            }
            obj.elevation = value;
            return;
          }
          case 'color': {
            if (!isColorValue(value)) {
              throw new Error(formatError(`ElevationShadowFilter.color must be a Color value`, getLine(stmt)));
            }
            obj.color = colorValueToCSS(value);
            return;
          }
          case 'direction': {
            const n = toNumber(value);
            if (n === undefined || !Number.isFinite(n)) {
              throw new Error(
                formatError(`ElevationShadowFilter.direction must be a finite number (with angle unit)`, getLine(stmt)),
              );
            }
            obj.direction = n;
            return;
          }
          case 'tightness': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(
                formatError(`ElevationShadowFilter.tightness must be a finite non-negative number`, getLine(stmt)),
              );
            }
            obj.tightness = value;
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to ElevationShadowFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isInnerShadowFilterValue(obj)) {
        switch (stmt.property) {
          case 'offsetX': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(formatError(`InnerShadowFilter.offsetX must be a finite number`, getLine(stmt)));
            }
            obj.offsetX = value;
            return;
          }
          case 'offsetY': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(formatError(`InnerShadowFilter.offsetY must be a finite number`, getLine(stmt)));
            }
            obj.offsetY = value;
            return;
          }
          case 'blur': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              throw new Error(formatError(`InnerShadowFilter.blur must be a finite non-negative number`, getLine(stmt)));
            }
            obj.blur = value;
            return;
          }
          case 'color': {
            if (!isColorValue(value)) {
              throw new Error(formatError(`InnerShadowFilter.color must be a Color value`, getLine(stmt)));
            }
            obj.color = colorValueToCSS(value);
            return;
          }
          case 'opacity': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
              throw new Error(formatError(`InnerShadowFilter.opacity must be a number between 0 and 1`, getLine(stmt)));
            }
            obj.opacity = value;
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to InnerShadowFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isPixelateFilterValue(obj)) {
        const positiveFinite = (v: Value, name: string): number => {
          if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
            throw new Error(formatError(`PixelateFilter.${name} must be a finite positive number`, getLine(stmt)));
          }
          return v;
        };
        switch (stmt.property) {
          case 'width':
            obj.width = positiveFinite(value, 'width');
            return;
          case 'height':
            obj.height = positiveFinite(value, 'height');
            return;
          case 'radius':
            obj.radius = positiveFinite(value, 'radius');
            return;
          default:
            throw new Error(
              formatError(`Cannot assign to PixelateFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isMotionBlurFilterValue(obj)) {
        switch (stmt.property) {
          case 'type': {
            if (typeof value !== 'string')
              throw new Error(
                formatError(`MotionBlurFilter.type must be a MotionBlurType enum value`, getLine(stmt)),
              );
            const valid = Object.values(BUILTIN_ENUMS.MotionBlurType);
            if (!valid.includes(value))
              throw new Error(
                formatError(
                  `Invalid value '${value}' for MotionBlurFilter.type. Valid values: ${valid.join(', ')}`,
                  getLine(stmt),
                ),
              );
            obj.motionType = value as MotionBlurTypeName;
            return;
          }
          case 'distance': {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
              throw new Error(
                formatError(`MotionBlurFilter.distance must be a finite non-negative number`, getLine(stmt)),
              );
            obj.distance = value;
            return;
          }
          case 'angle': {
            const n = toNumber(value);
            if (n === undefined || !Number.isFinite(n))
              throw new Error(
                formatError(`MotionBlurFilter.angle must be a finite number (with angle unit)`, getLine(stmt)),
              );
            obj.angle = n;
            return;
          }
          case 'samples': {
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 2 || value > 32)
              throw new Error(
                formatError(`MotionBlurFilter.samples must be an integer between 2 and 32`, getLine(stmt)),
              );
            obj.samples = value;
            return;
          }
          default:
            throw new Error(
              formatError(`Cannot assign to MotionBlurFilter property '${stmt.property}'`, getLine(stmt)),
            );
        }
      }
      if (isMeshPointValue(obj)) {
        assignMeshPointProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
        return;
      }
      if (isGradientValue(obj)) {
        assignGradientProperty(obj, stmt.property, value, stmt.value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
        return;
      }
      throw new Error(formatError(`Cannot assign to property '${stmt.property}'`, getLine(stmt)));
    }

    case 'ExpressionStatement': {
      evaluateExpression(stmt.expression, scope);
      return;
    }

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

    case 'BreakStatement':
      return { flow: 'break', line: getLine(stmt) ?? null };

    case 'ContinueStatement':
      return { flow: 'continue', line: getLine(stmt) ?? null };

    case 'FontDirective':
      // Declarative metadata — font loading handled by host environment before compilation
      return;

    case 'Comment':
      // Comments are no-ops at runtime
      return;

    default:
      throw new Error(`Unknown statement type: ${(stmt as Statement).type}`);
  }
}

/**
 * Evaluate statements, appending output to the accumulator array.
 * Stops at (and returns) the first break/continue flow signal so the
 * enclosing loop can consume it; returns undefined on normal completion.
 */
function evaluateStatementsToAccum(stmts: Statement[], scope: Scope, accum: PathStore): LoopFlow {
  for (const stmt of stmts) {
    const flow = evaluateStatementToAccum(stmt, scope, accum);
    if (flow) return flow;
  }
  return undefined;
}

/**
 * Evaluate statements and return the joined result.
 * This is the public interface that uses the optimized accumulator internally.
 */
function evaluateStatements(stmts: Statement[], scope: Scope): string {
  const accum = createPathStore();
  const flow = evaluateStatementsToAccum(stmts, scope, accum);
  // Defensive: the AST builder rejects break/continue outside loops, so flow
  // can only surface here through a builder gap.
  if (flow) throw loopFlowBoundaryError(flow);
  // Corner ops recorded inside this body (e.g. a user function) finalize here,
  // since the joined string is this store's only output channel.
  const finalized = applyRecordedCornerOps(accum.records.flatMap((r) => r.commands));
  if (!finalized.changed) return storeToPathData(accum);
  for (const w of finalized.warnings) {
    scope.evalState?.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
  }
  return commandsToPathData(finalized.commands);
}

/**
 * Expand gradient stops using OKLCh interpolation.
 * Iterates adjacent stop pairs, generating intermediate stops via mixColors().
 * Skips pairs where either stop lacks oklch data (e.g., CSSVar stops).
 */
function expandOklchStops(stops: GradientStop[], stepsPerUnit: number): { offset: number; color: string }[] {
  if (stops.length < 2) return stops.map((s) => ({ offset: s.offset, color: s.color }));
  const result: { offset: number; color: string }[] = [];
  for (let i = 0; i < stops.length; i++) {
    // Always include the original stop
    result.push({ offset: stops[i].offset, color: stops[i].color });
    // Generate intermediates between this stop and the next
    if (i < stops.length - 1) {
      const a = stops[i];
      const b = stops[i + 1];
      // Skip if either stop lacks oklch (CSSVar stops)
      if (!a.oklch || !b.oklch) continue;
      const span = b.offset - a.offset;
      if (span <= 0) continue;
      const count = Math.ceil(stepsPerUnit * span) - 1;
      for (let j = 1; j <= count; j++) {
        const t = j / (count + 1);
        const offset = a.offset + span * t;
        const mixed = mixColors(a.oklch, b.oklch, t);
        result.push({ offset, color: oklchToCSS(mixed) });
      }
    }
  }
  // Sort by offset to ensure correct order after interleaving
  result.sort((a, b) => a.offset - b.offset);
  return result;
}

/**
 * Build the CompileResult from evaluation state
 */
/**
 * Emit a store's path data, applying any recorded corner ops at finalization.
 * Zero-op stores (all pre-existing programs) take the byte-exact raw join.
 */
function storeToFinalizedData(store: PathStore, evalState: EvaluationState): string {
  const flat = store.records.flatMap((r) => r.commands);
  const finalized = applyRecordedCornerOps(flat);
  if (!finalized.changed) return storeToPathData(store);
  for (const w of finalized.warnings) {
    evalState.logs.push({ line: null, parts: [{ type: 'string', value: `[warn] ${w}` }] });
  }
  return commandsToPathData(finalized.commands);
}

function buildCompileResult(mainAccum: PathStore, evalState: EvaluationState): CompileResult {
  const layers: LayerOutput[] = [];

  if (evalState.layerOrder.length === 0) {
    // No layers defined: single implicit default layer
    const transform = transformStateToSvg(evalState.transformState) ?? undefined;
    layers.push({
      name: 'default',
      type: 'path',
      data: storeToFinalizedData(mainAccum, evalState),
      styles: {},
      isDefault: true,
      transform,
    });
  } else {
    // Check if main accum has content that wasn't routed to a default layer
    const mainContent = storeToFinalizedData(mainAccum, evalState);
    if (mainContent && !evalState.defaultLayerName) {
      // Prepend implicit default layer for bare commands
      const transform = transformStateToSvg(evalState.transformState) ?? undefined;
      layers.push({
        name: 'default',
        type: 'path',
        data: mainContent,
        styles: {},
        isDefault: true,
        transform,
      });
    }
    // Extract transform convenience properties from a styles dict, returning
    // a transform string (or undefined) and mutating the dict to remove consumed keys.
    // Convenience properties: translate-x, translate-y, translate, scale-x, scale-y, scale, rotate
    const TRANSFORM_CONVENIENCE_KEYS = new Set([
      'translate-x',
      'translate-y',
      'translate',
      'scale-x',
      'scale-y',
      'scale',
      'rotate',
    ]);

    function extractConvenienceTransform(styles: Record<string, string>): string | undefined {
      const hasConvenience = Object.keys(styles).some((k) => TRANSFORM_CONVENIENCE_KEYS.has(k));
      if (!hasConvenience) return undefined;

      const parts: string[] = [];

      // Translate
      let tx: string | undefined;
      let ty: string | undefined;
      if (styles.translate) {
        const vals = styles.translate.split(/\s*,\s*/);
        tx = vals[0];
        ty = vals.length > 1 ? vals[1] : '0';
        delete styles.translate;
      }
      if (styles['translate-x']) {
        tx = styles['translate-x'];
        delete styles['translate-x'];
      }
      if (styles['translate-y']) {
        ty = styles['translate-y'];
        delete styles['translate-y'];
      }
      if (tx != null || ty != null) {
        parts.push(`translate(${tx ?? '0'}, ${ty ?? '0'})`);
      }

      // Rotate
      if (styles.rotate) {
        const angleRad = parseFloat(styles.rotate);
        if (!isNaN(angleRad)) {
          const angleDeg = (angleRad * 180) / Math.PI;
          parts.push(`rotate(${angleDeg})`);
        }
        delete styles.rotate;
      }

      // Scale
      let sx: string | undefined;
      let sy: string | undefined;
      if (styles.scale) {
        const vals = styles.scale.split(/\s*,\s*/);
        sx = vals[0];
        sy = vals.length > 1 ? vals[1] : vals[0];
        delete styles.scale;
      }
      if (styles['scale-x']) {
        sx = styles['scale-x'];
        delete styles['scale-x'];
      }
      if (styles['scale-y']) {
        sy = styles['scale-y'];
        delete styles['scale-y'];
      }
      if (sx != null || sy != null) {
        parts.push(`scale(${sx ?? '1'}, ${sy ?? '1'})`);
      }

      return parts.length > 0 ? parts.join(' ') : undefined;
    }

    // Helper to build a single layer's output (used for top-level and group children)
    function buildLayerOutput(layer: LayerState): LayerOutput {
      if (layer.layerType === 'FragmentLayer') {
        const fragmentLayer = layer;
        return {
          name: layer.name,
          type: 'fragment',
          data: '',
          fragmentDefs: fragmentLayer.defsContent,
          fragmentVisuals: fragmentLayer.visualContent,
          styles: { ...layer.styles },
          isDefault: false,
        };
      }
      if (layer.layerType === 'TextLayer') {
        const textLayer = layer;
        const textStyles = { ...layer.styles };
        const convenienceTransform = extractConvenienceTransform(textStyles);
        let transform: string | undefined;
        if (textStyles.transform) {
          transform = textStyles.transform;
          delete textStyles.transform;
        } else if (convenienceTransform) {
          transform = convenienceTransform;
        }
        const allText = textLayer.textElements.map((te) => te.children.map((c) => c.text).join('')).join(' ');
        return {
          name: layer.name,
          type: 'text',
          data: allText,
          textElements: textLayer.textElements,
          styles: textStyles,
          isDefault: layer.isDefault,
          transform,
        };
      }
      if (layer.layerType === 'GroupLayer') {
        const groupLayer = layer;
        const groupStyles = { ...groupLayer.styles };
        // Convenience transform properties → transform string
        const convenienceTransform = extractConvenienceTransform(groupStyles);
        // Explicit transform property takes highest precedence, then convenience, then imperative
        let transform: string | undefined;
        if (groupStyles.transform) {
          transform = groupStyles.transform;
          delete groupStyles.transform;
        } else if (convenienceTransform) {
          transform = convenienceTransform;
        } else {
          transform = transformStateToSvg(groupLayer.transformState) ?? undefined;
        }
        const children = groupLayer.children.map((childName) => {
          const childLayer = evalState.layers.get(childName)!;
          return buildLayerOutput(childLayer);
        });
        return {
          name: layer.name,
          type: 'group',
          data: '',
          children,
          styles: groupStyles,
          isDefault: false,
          transform,
        };
      }
      const pathLayer = layer;
      const pathStyles = { ...layer.styles };
      const convenienceTransform = extractConvenienceTransform(pathStyles);
      let transform: string | undefined;
      if (pathStyles.transform) {
        transform = pathStyles.transform;
        delete pathStyles.transform;
      } else if (convenienceTransform) {
        transform = convenienceTransform;
      } else {
        transform = transformStateToSvg(pathLayer.transformState) ?? undefined;
      }
      return {
        name: layer.name,
        type: 'path',
        data: storeToFinalizedData(pathLayer.accum, evalState),
        styles: pathStyles,
        isDefault: layer.isDefault,
        transform,
      };
    }

    // Add defined layers in definition order
    for (const name of evalState.layerOrder) {
      const layer = evalState.layers.get(name)!;
      layers.push(buildLayerOutput(layer));
    }
  }

  // Build masks output
  const masks: MaskOutput[] = [];
  for (const [, mask] of evalState.masks) {
    masks.push({
      id: mask.id,
      elements: mask.paths.map((p) => ({ pathData: p.d, styles: { ...p.styles } })),
    });
  }

  // Build clipPaths output
  const clipPaths: ClipPathOutput[] = [];
  for (const [, clip] of evalState.clipPaths) {
    clipPaths.push({
      id: clip.id,
      elements: clip.paths.map((d) => ({ pathData: d })),
    });
  }

  // Build gradients output
  const gradients: GradientOutput[] = [];
  for (const [, grad] of evalState.gradients) {
    // For inherited GPU-rendered gradients (conic, mesh, freeform, topo),
    // resolve stops from parent — these are rasterized and can't use SVG xlink:href inheritance
    const isGpuType =
      grad.gradientType === 'conic' ||
      grad.gradientType === 'mesh' ||
      grad.gradientType === 'freeform' ||
      grad.gradientType === 'topo';
    let resolvedStops = grad.stops;
    if (isGpuType && resolvedStops.length === 0 && grad.href) {
      const parent = evalState.gradients.get(grad.href);
      if (parent) resolvedStops = parent.stops;
    }
    const stepsPerUnit = grad.steps ?? 10;
    const stops =
      grad.interpolation === 'oklch'
        ? expandOklchStops(resolvedStops, stepsPerUnit)
        : resolvedStops.map((s) => ({ offset: s.offset, color: s.color }));
    const output: GradientOutput = {
      id: grad.id,
      type: grad.gradientType,
      attrs: { ...grad.attrs },
      stops,
    };
    if (grad.spreadMethod) output.spreadMethod = grad.spreadMethod;
    if (grad.gradientUnits) output.gradientUnits = grad.gradientUnits;
    if (grad.gradientTransform) output.gradientTransform = grad.gradientTransform;
    if (grad.href) output.href = grad.href;
    if (grad.interpolation === 'linearRGB') output.colorInterpolation = 'linearRGB';
    // Conic-specific output
    if (grad.gradientType === 'conic') {
      output.cx = parseFloat(grad.attrs.cx);
      output.cy = parseFloat(grad.attrs.cy);
      output.from = grad.from ?? 0;
      output.to = grad.to ?? 2 * Math.PI;
      output.direction = grad.direction ?? 'cw';
      output.spread = grad.spread ?? 'clamp';
      output.innerRadius = grad.innerRadius ?? 0;
      const fill = grad.innerFill;
      if (fill && typeof fill === 'object' && 'oklch' in fill) {
        output.innerFill = oklchToCSS(fill.oklch);
      } else {
        output.innerFill = fill ?? 'transparent';
      }
      // Warn if conic gradient has CSSVar stops — they are baked at compile time
      if (resolvedStops.some((s) => s.color.startsWith('var('))) {
        evalState.logs.push({
          line: null,
          parts: [
            {
              type: 'string',
              value: `Warning: Conic gradient '${grad.id}' has CSSVar stops — CSS variable changes won't update conic gradients (rasterized at compile time).`,
            },
          ],
        });
      }
      // Preserve oklch on stops for rendering.
      // For CSSVar stops, extract the fallback color from var(--name, fallback)
      // so Canvas 2D renderers have a concrete color to work with.
      output.stopsWithOklch = resolvedStops.map((s) => {
        let color: string;
        if (s.oklch) {
          color = oklchToCSS(s.oklch);
        } else if (s.color.startsWith('var(')) {
          // Extract fallback: "var(--name, #hex)" → "#hex"
          const commaIdx = s.color.indexOf(',');
          color = commaIdx >= 0 ? s.color.slice(commaIdx + 1, -1).trim() : '#000000';
        } else {
          color = s.color;
        }
        return {
          offset: s.offset,
          color,
          ...(s.oklch ? { oklch: { ...s.oklch } } : {}),
        };
      });
    }
    // Mesh-specific output
    if (grad.gradientType === 'mesh') {
      output.meshWidth = grad.meshWidth;
      output.meshHeight = grad.meshHeight;
      output.meshGrid = (grad.meshGrid ?? []).map((row) => row.map((p) => ({ x: p.x, y: p.y, color: p.colorCSS })));
    }
    // Freeform-specific output
    if (grad.gradientType === 'freeform') {
      output.freeformWidth = grad.freeformWidth;
      output.freeformHeight = grad.freeformHeight;
      output.falloff = grad.falloff ?? 2.0;
      output.freeformPoints = (grad.freeformPoints ?? []).map((p) => ({
        x: p.x,
        y: p.y,
        color: p.colorCSS,
      }));
      // Warn if freeform gradient has fewer than 2 points
      if ((grad.freeformPoints ?? []).length < 2) {
        evalState.logs.push({
          line: null,
          parts: [
            {
              type: 'string',
              value: `Warning: FreeformGradient '${grad.id}' has fewer than 2 points — gradient will be empty or uniform.`,
            },
          ],
        });
      }
    }
    // Topo-specific output
    if (grad.gradientType === 'topo') {
      output.topoWidth = grad.topoWidth;
      output.topoHeight = grad.topoHeight;
      output.topoEasing = grad.topoEasing ?? 'linear';
      output.topoMethod = grad.topoMethod ?? 'distance';
      output.topoIterations = grad.topoIterations ?? 200;
      output.topoBlend = grad.topoBlend ?? 1.0;
      output.topoContours = (grad.topoContours ?? []).map((c) => ({
        elevation: c.elevation,
        path: c.dString,
        color: c.colorCSS,
        oklch: { ...c.color },
      }));
      if (grad.topoBaseColor) {
        output.topoBaseColor = grad.topoBaseColorCSS;
        output.topoBaseColorOklch = { ...grad.topoBaseColor };
      }
      // Build stopsWithOklch from baseColor + contours (sorted by elevation) for rendering
      const contoursSorted = [...(grad.topoContours ?? [])].sort((a, b) => a.elevation - b.elevation);
      const rampStops: { offset: number; color: string; oklch?: OKLCH }[] = [];
      if (grad.topoBaseColor) {
        rampStops.push({ offset: 0, color: grad.topoBaseColorCSS!, oklch: { ...grad.topoBaseColor } });
      } else if (contoursSorted.length > 0) {
        // If no base color, use first contour's color at offset 0
        rampStops.push({ offset: 0, color: contoursSorted[0].colorCSS, oklch: { ...contoursSorted[0].color } });
      }
      for (const c of contoursSorted) {
        rampStops.push({ offset: c.elevation, color: c.colorCSS, oklch: { ...c.color } });
      }
      output.stopsWithOklch = rampStops;
      // Warnings
      if ((grad.topoContours ?? []).length < 1) {
        evalState.logs.push({
          line: null,
          parts: [
            { type: 'string', value: `Warning: TopoGradient '${grad.id}' has no contours — gradient will be uniform.` },
          ],
        });
      }
    }
    gradients.push(output);
  }

  // Build patterns output
  const patterns: PatternOutput[] = [];
  for (const [, pat] of evalState.patterns) {
    patterns.push({
      id: pat.id,
      x: pat.x,
      y: pat.y,
      width: pat.width,
      height: pat.height,
      elements: pat.paths.map((p) => ({ pathData: p.d, styles: { ...p.styles } })),
      patternUnits: pat.patternUnits,
      patternTransform: pat.patternTransform,
      patternContentUnits: pat.patternContentUnits,
    });
  }

  // Build markers output
  const markers: MarkerOutput[] = [];
  for (const [, marker] of evalState.markers) {
    // Convert refX/refY to output string: keyword stays as-is, number is stringified
    const refX = typeof marker.refX === 'number' ? formatNum(marker.refX) : marker.refX;
    const refY = typeof marker.refY === 'number' ? formatNum(marker.refY) : marker.refY;
    // orient: numeric values are radians → convert to degrees string; enum values stay as-is
    let orientOut: string;
    if (typeof marker.orient === 'number') {
      orientOut = formatNum((marker.orient * 180) / Math.PI);
    } else {
      orientOut = marker.orient;
    }
    const output: MarkerOutput = {
      id: marker.id,
      viewBox: marker.viewBox,
      markerWidth: marker.markerWidth,
      markerHeight: marker.markerHeight,
      refX,
      refY,
      elements: marker.paths.map((p) => ({ pathData: p.d, styles: { ...p.styles } })),
    };
    // Omit attrs that match SVG defaults
    if (marker.markerUnits !== 'strokeWidth') output.markerUnits = marker.markerUnits;
    // orient default in SVG is "0", but we default to "auto" (more useful); always emit
    output.orient = orientOut;
    if (marker.preserveAspectRatio !== 'xMidYMid meet') output.preserveAspectRatio = marker.preserveAspectRatio;
    markers.push(output);
  }

  // Build filters output
  const filters: FilterOutput[] = [];
  for (const [, filter] of evalState.filters) {
    if (filter.kind === 'noise') {
      filters.push({
        kind: 'noise',
        id: filter.id,
        style: filter.style,
        scale: filter.scale,
        octaves: filter.octaves,
        amount: filter.amount,
        monochrome: filter.monochrome,
        seed: filter.seed,
        blend: filter.blend,
        contrast: filter.contrast,
        stitch: filter.stitch,
      });
    } else if (filter.kind === 'glow') {
      filters.push({
        kind: 'glow',
        id: filter.id,
        mode: filter.mode,
        color: filter.color,
        radius: filter.radius,
        spread: filter.spread,
        opacity: filter.opacity,
      });
    } else if (filter.kind === 'emboss') {
      filters.push({
        kind: 'emboss',
        id: filter.id,
        angle: filter.angle,
        elevation: filter.elevation,
        depth: filter.depth,
        strength: filter.strength,
        shininess: filter.shininess,
        lightColor: filter.lightColor,
        smooth: filter.smooth,
      });
    } else if (filter.kind === 'elevation-shadow') {
      filters.push({
        kind: 'elevation-shadow',
        id: filter.id,
        elevation: filter.elevation,
        color: filter.color,
        direction: filter.direction,
        tightness: filter.tightness,
      });
    } else if (filter.kind === 'inner-shadow') {
      filters.push({
        kind: 'inner-shadow',
        id: filter.id,
        offsetX: filter.offsetX,
        offsetY: filter.offsetY,
        blur: filter.blur,
        color: filter.color,
        opacity: filter.opacity,
      });
    } else if (filter.kind === 'pixelate') {
      filters.push({
        kind: 'pixelate',
        id: filter.id,
        width: filter.width,
        height: filter.height,
        radius: filter.radius,
      });
    } else if (filter.kind === 'motion-blur') {
      filters.push({
        kind: 'motion-blur',
        id: filter.id,
        motionType: filter.motionType,
        distance: filter.distance,
        angle: filter.angle,
        samples: filter.samples,
      });
    } else {
      // Exhaustiveness guard — if a new filter kind is added to FilterValue
      // without a matching arm above, this fails at compile time and prevents
      // silent data loss between the evaluator and the renderer.
      const _exhaustive: never = filter;
      throw new Error(`Unsupported filter kind: ${String((_exhaustive as { kind: string }).kind)}`);
    }
  }

  // Build cssProperties output
  const cssProperties: CSSPropertyDeclaration[] = Array.from(evalState.cssProperties.values());

  const { reports: missingGlyphs, warnings: missingGlyphWarnings } = buildMissingGlyphReports(
    evalState.missingGlyphs,
  );
  for (const warning of missingGlyphWarnings) {
    evalState.logs.push({ line: null, parts: [{ type: 'string', value: warning }] });
  }

  return {
    layers,
    masks,
    clipPaths,
    gradients,
    patterns,
    markers,
    filters,
    cssProperties,
    logs: evalState.logs,
    calledStdlibFunctions: Array.from(evalState.calledStdlibFunctions),
    ...(missingGlyphs.length > 0 ? { missingGlyphs } : {}),
    viewBox: evalState.viewBox
      ? {
          originX: evalState.viewBox.originX,
          originY: evalState.viewBox.originY,
          width: evalState.viewBox.width,
          height: evalState.viewBox.height,
        }
      : undefined,
  };
}

export function evaluate(program: Program, options?: { toFixed?: number; fonts?: FontRegistry }): CompileResult {
  setNumberFormat(options?.toFixed);
  try {
    const pathContext = createPathContext();
    const logs: LogEntry[] = [];
    const transformState = createTransformState();
    const evalState: EvaluationState = {
      pathContext,
      logs,
      calledStdlibFunctions: new Set(),
      layers: new Map(),
      layerOrder: [],
      activeLayerName: null,
      defaultLayerName: null,
      transformState,
      masks: new Map(),
      clipPaths: new Map(),
      gradients: new Map(),
      patterns: new Map(),
      markers: new Map(),
      filters: new Map(),
      cssProperties: new Map(),
      fontRegistry: options?.fonts,
    };

    const scope = createScope();
    scope.evalState = evalState;

    // Initialize ctx variable
    scope.variables.set('ctx', {
      type: 'ContextObject' as const,
      value: contextToObject(pathContext, transformState),
    });

    const accum = createPathStore();
    evalState.rootAccum = accum;
    // Top level is a break/continue boundary (builder-enforced; defensive)
    const topFlow = evaluateStatementsToAccum(program.body, scope, accum);
    if (topFlow) throw loopFlowBoundaryError(topFlow);

    return buildCompileResult(accum, evalState);
  } finally {
    resetNumberFormat();
  }
}

/**
 * Result of context-aware evaluation
 */
export interface EvaluateWithContextResult {
  path: string;
  context: PathContext & { heading?: number };
  logs: LogEntry[];
  calledStdlibFunctions: string[]; // Stdlib function names invoked during evaluation
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  filters: FilterOutput[];
  cssProperties: CSSPropertyDeclaration[];
  viewBox?: import('./types').ViewBoxValue;
  missingGlyphs?: Array<{ family: string; weight: number; chars: string[] }>;
}

/**
 * Options for evaluateWithContext
 */
export interface EvaluateWithContextOptions {
  /** Whether to track command history (default: false for performance) */
  trackHistory?: boolean;
  /** Fixed decimal precision for number formatting */
  toFixed?: number;
  /** Font registry with loaded font data for precise metrics and glyph extraction */
  fonts?: import('./types').FontRegistry;
}

/**
 * Evaluate a program with path context tracking
 * Returns compile result with layers, context, and log() outputs
 */
export function evaluateWithContext(
  program: Program,
  options: EvaluateWithContextOptions = {},
): EvaluateWithContextResult {
  setNumberFormat(options.toFixed);
  try {
    const pathContext = createPathContext({ trackHistory: options.trackHistory ?? false });
    const logs: LogEntry[] = [];
    const calledStdlibFunctions = new Set<string>();
    const transformState = createTransformState();
    const evalState: EvaluationState = {
      pathContext,
      logs,
      calledStdlibFunctions,
      layers: new Map(),
      layerOrder: [],
      activeLayerName: null,
      defaultLayerName: null,
      transformState,
      masks: new Map(),
      clipPaths: new Map(),
      gradients: new Map(),
      patterns: new Map(),
      markers: new Map(),
      filters: new Map(),
      cssProperties: new Map(),
      fontRegistry: options.fonts,
    };

    const scope = createScope();
    scope.evalState = evalState;

    // Initialize ctx variable
    scope.variables.set('ctx', {
      type: 'ContextObject' as const,
      value: contextToObject(pathContext, transformState),
    });

    // Note: log() is handled specially in evaluateFunctionCall, not registered here

    const accum = createPathStore();
    evalState.rootAccum = accum;
    // Top level is a break/continue boundary (builder-enforced; defensive)
    const topFlow = evaluateStatementsToAccum(program.body, scope, accum);
    if (topFlow) throw loopFlowBoundaryError(topFlow);

    const compileResult = buildCompileResult(accum, evalState);

    // Expose heading as user-facing alias for internal lastTangent
    const context = Object.create(pathContext, {
      heading: {
        get() {
          return pathContext.lastTangent;
        },
        enumerable: true,
      },
    });

    return {
      path: compileResult.layers[0]?.data ?? '',
      context,
      logs,
      calledStdlibFunctions: Array.from(calledStdlibFunctions),
      layers: compileResult.layers,
      masks: compileResult.masks,
      clipPaths: compileResult.clipPaths,
      gradients: compileResult.gradients,
      patterns: compileResult.patterns,
      markers: compileResult.markers,
      filters: compileResult.filters,
      cssProperties: compileResult.cssProperties,
      viewBox: compileResult.viewBox,
      ...(compileResult.missingGlyphs ? { missingGlyphs: compileResult.missingGlyphs } : {}),
    };
  } finally {
    resetNumberFormat();
  }
}

// Re-export types from context module
export type { CommandHistoryEntry, PathContext, Point, TransformState } from './context';

// Re-export annotated evaluator and formatter
export { evaluateAnnotated, type AnnotatedLine, type AnnotatedOutput } from './annotated';
export { formatAnnotated, type FormatOptions } from './formatter';
