import { parseExpression as expressionParserFn } from '../parser/lezer-expression';
const expressionParser = { parse: (input: string) => { const v = expressionParserFn(input); return { status: v !== null, value: v }; } };
import { contextAwareFunctions, stdlib } from '../stdlib';
import {
  contextToObject,
  createPathContext,
  createTransformState,
  setLastTangent,
  transformStateToSvg,
  updateContextForCommand,
} from './context';
import { formatNum, resetNumberFormat, setNumberFormat } from './format';
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
  hueShift,
  hueShiftCSS,
  lighten,
  lightenCSS,
  mixColors,
  mixCSS,
  oklchToCSS,
  oklchToHex,
  oklchToHSLString,
  oklchToOKLCHString,
  oklchToRGBString,
  parseColor,
  saturate,
  saturateCSS,
  setAlpha,
  setAlphaCSS,
  setLightnessCSS,
} from '../color';
import {
  chamferCommands,
  commandToPathString,
  computeBoundingBox,
  concatenateCommands,
  ellipticalFilletCommands,
  filletCommands,
  mirrorCommands,
  offsetCommands,
  reverseCommands,
  rotateAtVertexCommands,
  scaleCommands,
  subPathCommands,
} from './path-transforms';
import { pathDifference, pathIntersection, pathUnion, pathXor } from './boolean-ops';
import { calculatePathLength, partitionPath, samplePathAtFraction } from './sampling';
import { estimateTextBoundingBox, bboxOverlaps, bboxPathIntersects, bboxPathIntersectionPoints, resolveFontFamily, resolveFontWeight, resolveEffectiveFontSize } from './font-metrics';
import { getFont, glyphToPathBlockCommands, splitContours } from './font-provider';
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
  FragmentLayerState,
  GradientOutput,
  GradientStop,
  GradientValue,
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
} from './types';

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
  return undefined;
}

/** Built-in enum definitions — constant map of enum name → member name → string value */
export const BUILTIN_ENUMS: Record<string, Record<string, string>> = {
  Easing: { Linear: 'linear', Smoothstep: 'smoothstep', EaseIn: 'ease-in', EaseOut: 'ease-out', EaseInOut: 'ease-in-out' },
  Interpolation: { SRGB: 'srgb', OKLCH: 'oklch', LinearRGB: 'linearRGB' },
  SpreadMethod: { Pad: 'pad', Reflect: 'reflect', Repeat: 'repeat' },
  GradientUnits: { ObjectBoundingBox: 'objectBoundingBox', UserSpaceOnUse: 'userSpaceOnUse' },
  Direction: { CW: 'cw', CCW: 'ccw' },
  ConicSpread: { Clamp: 'clamp', Repeat: 'repeat', Transparent: 'transparent' },
  InnerFill: { Transparent: 'transparent', TransparentBlend: 'transparent-blend', Center: 'center' },
  TopoMethod: { Distance: 'distance', Laplace: 'laplace' },
  BBoxAnchor: { TopLeft: 'top-left', Top: 'top', TopRight: 'top-right', Right: 'right', BottomRight: 'bottom-right', Bottom: 'bottom', BottomLeft: 'bottom-left', Left: 'left', Center: 'center' },
  GridPatternType: { Shape: 'shape', Dot: 'dot', Intersection: 'intersection', Partial: 'partial' },
  HexagonOrientation: { Edge: 'edge', Vertex: 'vertex' },
  VerticalAnchor: { Descender: 'descender', Baseline: 'baseline', Midline: 'midline', CapHeight: 'cap-height' },
  MarkerUnits: { StrokeWidth: 'strokeWidth', UserSpaceOnUse: 'userSpaceOnUse' },
  MarkerOrient: { Auto: 'auto', AutoStartReverse: 'auto-start-reverse' },
  MarkerRefX: { Left: 'left', Center: 'center', Right: 'right' },
  MarkerRefY: { Top: 'top', Center: 'center', Bottom: 'bottom' },
  NoiseFilterStyle: {
    Grain: 'grain',
    Paper: 'paper',
    Speckle: 'speckle',
    Static: 'static',
    Gradient: 'gradient',
  },
  NoiseFilterScale: {
    Fine: 'fine',
    Medium: 'medium',
    Coarse: 'coarse',
  },
  GlowMode: {
    Outer: 'outer',
    Inner: 'inner',
  },
  BlendMode: {
    Normal: 'normal',
    Multiply: 'multiply',
    Screen: 'screen',
    Overlay: 'overlay',
    ColorBurn: 'color-burn',
    ColorDodge: 'color-dodge',
    HardLight: 'hard-light',
    SoftLight: 'soft-light',
    Darken: 'darken',
    Lighten: 'lighten',
    Difference: 'difference',
    Exclusion: 'exclusion',
  },
  MarkerPreserveAspectRatio: {
    None: 'none',
    XMinYMinMeet: 'xMinYMin meet',
    XMinYMinSlice: 'xMinYMin slice',
    XMidYMinMeet: 'xMidYMin meet',
    XMidYMinSlice: 'xMidYMin slice',
    XMaxYMinMeet: 'xMaxYMin meet',
    XMaxYMinSlice: 'xMaxYMin slice',
    XMinYMidMeet: 'xMinYMid meet',
    XMinYMidSlice: 'xMinYMid slice',
    XMidYMidMeet: 'xMidYMid meet',
    XMidYMidSlice: 'xMidYMid slice',
    XMaxYMidMeet: 'xMaxYMid meet',
    XMaxYMidSlice: 'xMaxYMid slice',
    XMinYMaxMeet: 'xMinYMax meet',
    XMinYMaxSlice: 'xMinYMax slice',
    XMidYMaxMeet: 'xMidYMax meet',
    XMidYMaxSlice: 'xMidYMax slice',
    XMaxYMaxMeet: 'xMaxYMax meet',
    XMaxYMaxSlice: 'xMaxYMax slice',
  },
};

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
      return `{${expr.properties.map((p) => p.type === 'SpreadElement' ? `...${expressionToSource(p.argument)}` : `${p.key}: ${expressionToSource(p.value)}`).join(', ')}}`;
    case 'PathBlockExpression':
      return '@{ ... }';
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

/**
 * Convert value based on unit suffix
 * - 'deg': converts degrees to radians
 * - 'pi': multiplies by Math.PI
 * - '%': divides by 100 (20% → 0.2)
 * - 'rad' or undefined: returns value unchanged (radians are internal standard)
 */
function convertUnitSuffix(value: number, unit?: 'deg' | 'rad' | 'pi' | '%'): number {
  if (unit === 'deg') {
    return (value * Math.PI) / 180;
  }
  if (unit === 'pi') {
    return value * Math.PI;
  }
  if (unit === '%') {
    return value / 100;
  }
  return value; // rad or no unit = radians (internal standard)
}

/**
 * Check if an expression is a NumberLiteral with an angle unit (deg/rad/pi)
 */
function hasAngleUnit(expr: Expression): boolean {
  if (expr.type === 'NumberLiteral') {
    return expr.unit === 'deg' || expr.unit === 'rad' || expr.unit === 'pi';
  }
  // For unary minus on a number with unit: -45deg
  if (expr.type === 'UnaryExpression' && expr.operator === '-') {
    return hasAngleUnit(expr.argument);
  }
  return false;
}

/**
 * Check if adding/subtracting expressions with mismatched angle units
 * Throws an error if one operand has an angle unit and the other doesn't
 */
function checkAngleUnitMismatch(left: Expression, right: Expression, operator: string): void {
  const leftHasUnit = hasAngleUnit(left);
  const rightHasUnit = hasAngleUnit(right);

  // If both are NumberLiterals (or unary negations of them), check for mismatch
  const leftIsLiteral =
    left.type === 'NumberLiteral' || (left.type === 'UnaryExpression' && left.argument.type === 'NumberLiteral');
  const rightIsLiteral =
    right.type === 'NumberLiteral' || (right.type === 'UnaryExpression' && right.argument.type === 'NumberLiteral');

  if (leftIsLiteral && rightIsLiteral && leftHasUnit !== rightHasUnit) {
    const op = operator === '+' ? 'add' : 'subtract';
    const withUnit = leftHasUnit ? 'left' : 'right';
    const withoutUnit = leftHasUnit ? 'right' : 'left';
    throw new Error(
      `Cannot ${op} a number with angle unit (${withUnit}) and a number without unit (${withoutUnit}). ` +
        `Use explicit units: e.g., 90deg + 5deg or 1.57rad + 0.5rad`,
    );
  }
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

/**
 * Build a PathBlockValue from transform result commands, normalizing to (0,0) origin.
 */
function buildPathBlockFromCommands(cmds: PathBlockCommand[], origin?: { x: number; y: number }): PathBlockValue {
  if (cmds.length === 0) {
    return {
      type: 'PathBlockValue' as const,
      commands: [],
      pathStrings: [],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
    };
  }
  const originX = origin ? origin.x : cmds[0].start.x;
  const originY = origin ? origin.y : cmds[0].start.y;
  const normalized = cmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { x: cmd.start.x - originX, y: cmd.start.y - originY },
    end: { x: cmd.end.x - originX, y: cmd.end.y - originY },
  }));
  const last = normalized[normalized.length - 1];
  return {
    type: 'PathBlockValue' as const,
    commands: normalized,
    pathStrings: normalized.map((c) => commandToPathString(c)),
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
    accum: [],
    transformState: createTransformState(),
  };
  // Generate roundRect path
  const r = 6;
  const rr = Math.min(r, bgWidth / 2, bgHeight / 2);
  const rrPath = `M ${rr} 0 L ${bgWidth - rr} 0 Q ${bgWidth} 0 ${bgWidth} ${rr} L ${bgWidth} ${bgHeight - rr} Q ${bgWidth} ${bgHeight} ${bgWidth - rr} ${bgHeight} L ${rr} ${bgHeight} Q 0 ${bgHeight} 0 ${bgHeight - rr} L 0 ${rr} Q 0 0 ${rr} 0 Z`;
  bgLayerState.accum.push(rrPath);

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
function commandsToRelativeD(commands: PathBlockCommand[], bridgeOriginGap = false): string {
  const parts: string[] = [];
  // Track actual SVG cursor position — needed because after `z` the cursor
  // jumps to the subpath start, which may differ from the next command's `start`.
  let cursorX = 0;
  let cursorY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  if (bridgeOriginGap && commands.length > 0) {
    const s = commands[0].start;
    if (Math.abs(s.x) > 1e-10 || Math.abs(s.y) > 1e-10) {
      parts.push(`m ${formatNum(s.x)} ${formatNum(s.y)}`);
      cursorX = s.x;
      cursorY = s.y;
      subpathStartX = s.x;
      subpathStartY = s.y;
    }
  }
  for (const cmd of commands) {
    const c = cmd.command;
    if (c === 'z') {
      parts.push('z');
      cursorX = subpathStartX;
      cursorY = subpathStartY;
    } else if (c === 'm') {
      // Move: compute relative displacement from actual cursor position
      const mx = cmd.end.x - cursorX;
      const my = cmd.end.y - cursorY;
      parts.push(`m ${formatNum(mx)} ${formatNum(my)}`);
      cursorX = cmd.end.x;
      cursorY = cmd.end.y;
      subpathStartX = cmd.end.x;
      subpathStartY = cmd.end.y;
    } else {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      if (c === 'h') {
        parts.push(`h ${formatNum(dx)}`);
      } else if (c === 'v') {
        parts.push(`v ${formatNum(dy)}`);
      } else if (c === 'c') {
        const [dx1, dy1, dx2, dy2] = cmd.args;
        parts.push(
          `c ${formatNum(dx1)} ${formatNum(dy1)} ${formatNum(dx2)} ${formatNum(dy2)} ${formatNum(dx)} ${formatNum(dy)}`,
        );
      } else if (c === 's') {
        const [dx2, dy2] = cmd.args;
        parts.push(`s ${formatNum(dx2)} ${formatNum(dy2)} ${formatNum(dx)} ${formatNum(dy)}`);
      } else if (c === 'q') {
        const [dx1, dy1] = cmd.args;
        parts.push(`q ${formatNum(dx1)} ${formatNum(dy1)} ${formatNum(dx)} ${formatNum(dy)}`);
      } else if (c === 't') {
        parts.push(`t ${formatNum(dx)} ${formatNum(dy)}`);
      } else if (c === 'a') {
        const [rx, ry, rotation, largeArc, sweep] = cmd.args;
        parts.push(
          `a ${formatNum(rx)} ${formatNum(ry)} ${formatNum(rotation)} ${formatNum(largeArc)} ${formatNum(sweep)} ${formatNum(dx)} ${formatNum(dy)}`,
        );
      } else {
        // l → relative line
        parts.push(`${c} ${formatNum(dx)} ${formatNum(dy)}`);
      }
      cursorX = cmd.end.x;
      cursorY = cmd.end.y;
    }
  }
  return parts.join(' ');
}

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
  const properties: Record<string, string> = {};
  for (const prop of expr.properties) {
    // Trust tracking: compiler-emitted strings (Color → hex, CSSVar → var(...),
    // gradient/pattern/marker → url(#id)) are validated at construction time;
    // they cannot be distinguished from user input by string shape, so we mark
    // them trusted here and skip the CSS-value validator. Plain string and
    // multi-token-fallback paths remain untrusted and get strict validation.
    let resolvedValue = prop.value;
    let trusted = false;
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
        } else if (typeof evaluated === 'string') {
          resolvedValue = evaluated;
          // Untrusted: user-supplied string. Validation runs below.
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
        }
        // For other types, keep raw string (untrusted)
      }
    } catch {
      // Parse or eval failed — keep raw string (handles rgb(...), #hex, multi-value strings, etc.)
    }
    // If the whole-value expression parse didn't resolve, try resolving
    // expressions embedded inside CSS function arguments (e.g., color args in drop-shadow)
    let allowVar = false;
    if (resolvedValue === prop.value) {
      const cssResolved = tryResolveCSSFunctionArgs(prop.value, scope);
      if (cssResolved !== null) {
        resolvedValue = cssResolved;
        // The substituted tokens are typed values pre-validated at construction
        // (Color, CSSVar). The remaining literal tokens still need validation,
        // but we permit well-formed var(--ident,...) refs in the result since
        // they were produced by the substitution itself.
        allowVar = true;
      }
    }
    // Auto-wrap URL-reference properties with url(#...) — skip CSS function values (contain parentheses)
    if (URL_REF_PROPERTIES.has(prop.name) && typeof resolvedValue === 'string' && !/^url\(/i.test(resolvedValue) && !resolvedValue.includes('(')) {
      // The unwrapped value becomes a fragment ref — must be a valid ident.
      try {
        validateCSSIdent(resolvedValue, 'fragment-ref');
      } catch (e) {
        const eLine = getLine(expr);
        const eCol = getCol(expr);
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
        validateCSSValue(resolvedValue, prop.name, { allowVar });
      } catch (e) {
        const eLine = getLine(expr);
        const eCol = getCol(expr);
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
 * Split a string by whitespace while respecting nested parentheses.
 * e.g., "16px 16px 20px rgba(0,0,0,0.5)" → ["16px", "16px", "20px", "rgba(0,0,0,0.5)"]
 */
function splitCSSArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Try to resolve Pathogen expressions embedded within CSS function arguments.
 * Only substitutes tokens that evaluate to ColorValue or CSSVarValue —
 * CSS values like "16px" or "blue" are left untouched.
 */
function tryResolveCSSFunctionArgs(raw: string, scope: Scope): string | null {
  const match = raw.match(/^([\w-]+)\((.+)\)$/s);
  if (!match) return null;

  const funcName = match[1];
  const tokens = splitCSSArgs(match[2]);

  let anyResolved = false;
  const resolved = tokens.map((token) => {
    try {
      const parseResult = expressionParser.parse(token);
      if (!parseResult.status || !parseResult.value) return token;

      // Preserve raw hex color literals
      if (parseResult.value.type === 'ColorLiteral') {
        anyResolved = true;
        return parseResult.value.raw;
      }

      const evaluated = evaluateExpression(parseResult.value, scope);

      if (isColorValue(evaluated)) {
        anyResolved = true;
        return colorValueToCSS(evaluated);
      }
      if (isCSSVarValue(evaluated)) {
        anyResolved = true;
        return cssVarValueToCSS(evaluated);
      }

      // Don't substitute other types — they're CSS values
      return token;
    } catch {
      return token;
    }
  });

  if (!anyResolved) return null;
  return `${funcName}(${resolved.join(' ')})`;
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  switch (expr.type) {
    case 'NumberLiteral':
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
      const truthValue = typeof condVal === 'number' ? condVal !== 0 : (isBooleanValue(condVal) ? condVal.value !== 0 : condVal !== null);
      return truthValue ? evaluateExpression(expr.consequent, scope) : evaluateExpression(expr.alternate, scope);
    }

    case 'BinaryExpression': {
      // Check for angle unit mismatch before evaluation for +/-
      if (expr.operator === '+' || expr.operator === '-') {
        checkAngleUnitMismatch(expr.left, expr.right, expr.operator);
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
              pathStrings: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
          }
          const lastCmd = concatCmds[concatCmds.length - 1];
          return {
            type: 'PathBlockValue' as const,
            commands: concatCmds,
            pathStrings: concatCmds.map((c) => commandToPathString(c)),
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
      accum: [],
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
  const accum: string[] = [];
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

  return {
    type: 'PathBlockValue',
    commands,
    pathStrings: accum.filter((s) => s.length > 0),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: blockContext.position.x, y: blockContext.position.y },
  };
}

/**
 * Evaluate a statement inside a path block, enforcing relative-only constraint
 */
function evaluatePathBlockStatement(stmt: Statement, scope: Scope, accum: string[]): void {
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
  evaluateStatementToAccum(stmt, scope, accum);
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

  evaluateTextBlockBody(expr.body, blockScope, elements);

  return {
    type: 'TextBlockValue',
    elements,
    styles: blockStyles,
  };
}

/**
 * Recursively evaluate statements inside a text block, accumulating TextBlockElements.
 * Handles text statements directly and recurses into for/if control flow.
 */
function evaluateTextBlockBody(stmts: Statement[], scope: Scope, elements: TextBlockElement[]): void {
  for (const stmt of stmts) {
    if (stmt.type === 'LayerDefinition') {
      throw new Error(formatError('Layer definitions are not allowed inside text blocks', getLine(stmt)));
    }
    if (stmt.type === 'LayerApplyBlock') {
      throw new Error(formatError('Layer apply blocks are not allowed inside text blocks', getLine(stmt)));
    }
    if (stmt.type === 'PathCommand') {
      throw new Error(formatError('Path commands are not allowed inside text blocks', getLine(stmt)));
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
        evaluateTextBody(stmt.body, scope, children);
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
        evaluateTextBlockBody(stmt.body, loopScope, elements);
      }
      continue;
    }

    if (stmt.type === 'ForEachLoop') {
      const iterVal = evaluateExpression(stmt.iterable, scope);
      if (!isArrayValue(iterVal)) throw new Error('for-each requires an array');
      for (let idx = 0; idx < iterVal.elements.length; idx++) {
        const loopScope = createScope(scope);
        loopScope.evalState = scope.evalState;
        setVariable(loopScope, stmt.variable, iterVal.elements[idx]);
        if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, idx);
        evaluateTextBlockBody(stmt.body, loopScope, elements);
      }
      continue;
    }

    if (stmt.type === 'IfStatement') {
      const cond = evaluateExpression(stmt.condition, scope);
      const truthValue = typeof cond === 'number' ? cond !== 0 : (isBooleanValue(cond) ? cond.value !== 0 : cond !== null);
      if (truthValue) {
        evaluateTextBlockBody(stmt.consequent, scope, elements);
      } else if (stmt.alternate) {
        evaluateTextBlockBody(stmt.alternate, scope, elements);
      }
      continue;
    }

    if (stmt.type === 'LetDeclaration') {
      const value = evaluateExpression(stmt.value, scope);
      if (stmt.pattern) {
        bindDestructuringPattern(stmt.pattern, value, scope);
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

function evaluateMethodCall(expr: MethodCallExpression, scope: Scope): Value {
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
        const v = evaluateExpression(a, scope);
        if (typeof v !== 'number') throw mError(`transform.${propRef.property}.set() arguments must be numbers`);
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
        const ctx = scope.evalState.pathContext;
        // If there's a default layer active, use its context
        let activeCtx = ctx;
        if (scope.evalState.defaultLayerName && !scope.evalState.activeLayerName) {
          const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName);
          if (defaultLayer?.layerType === 'PathLayer') {
            activeCtx = defaultLayer.pathContext;
          }
        }

        const originX = activeCtx.position.x;
        const originY = activeCtx.position.y;

        // Emit relative commands from structured command data (not raw pathStrings).
        // Relative commands naturally work from the cursor position, so no projection
        // is needed for the emitted path. We reconstruct from structured commands
        // because stdlib functions like circle() store absolute coordinates in their
        // PathSegment strings, but the structured commands are already relative.
        const emittedPath = commandsToRelativeD(obj.commands, true);

        // Track the relative path in context (updates cursor from current position)
        parseAndTrackPathString(emittedPath, scope);

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
        };
      }

      case 'drawTo': {
        if (expr.args.length !== 2) throw mError('drawTo() expects 2 arguments (x, y)');
        if (!scope.evalState) throw mError('drawTo() requires evaluation context');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');

        // Emit M x y followed by relative commands
        const moveCmd = `M ${formatNum(dtX)} ${formatNum(dtY)}`;
        const relativeD = commandsToRelativeD(obj.commands, true);
        const emittedPath = `${moveCmd} ${relativeD}`;

        // Track in path context
        parseAndTrackPathString(emittedPath, scope);

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

      case 'reverse': {
        if (expr.args.length !== 0) throw mError('reverse() expects 0 arguments');
        const reversed = reverseCommands(obj.commands);
        // Normalize to (0,0) origin for PathBlockValue
        if (reversed.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const originX = reversed[0].start.x;
        const originY = reversed[0].start.y;
        const normalizedCmds = reversed.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - originX, y: cmd.start.y - originY },
          end: { x: cmd.end.x - originX, y: cmd.end.y - originY },
        }));
        const lastCmd = normalizedCmds[normalizedCmds.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: normalizedCmds,
          pathStrings: normalizedCmds.map((c) => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: lastCmd.end.x, y: lastCmd.end.y },
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
        if (expr.args.length !== 1) throw mError('offset() expects 1 argument (distance)');
        const dist = evaluateExpression(expr.args[0], scope);
        if (typeof dist !== 'number') throw mError('offset() argument must be a number');
        const offsetResult = offsetCommands(obj.commands, dist);
        // Normalize to (0,0) origin for PathBlockValue
        if (offsetResult.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const oOriginX = offsetResult[0].start.x;
        const oOriginY = offsetResult[0].start.y;
        const oNormalized = offsetResult.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - oOriginX, y: cmd.start.y - oOriginY },
          end: { x: cmd.end.x - oOriginX, y: cmd.end.y - oOriginY },
        }));
        const oLast = oNormalized[oNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: oNormalized,
          pathStrings: oNormalized.map((c) => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: oLast.end.x, y: oLast.end.y },
        };
      }

      case 'mirror': {
        if (expr.args.length !== 1) throw mError('mirror() expects 1 argument (angle)');
        const mAngle = evaluateExpression(expr.args[0], scope);
        if (typeof mAngle !== 'number') throw mError('mirror() argument must be a number');
        const mirrored = mirrorCommands(obj.commands, mAngle, { x: 0, y: 0 });
        if (mirrored.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const mOriginX = mirrored[0].start.x;
        const mOriginY = mirrored[0].start.y;
        const mNormalized = mirrored.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - mOriginX, y: cmd.start.y - mOriginY },
          end: { x: cmd.end.x - mOriginX, y: cmd.end.y - mOriginY },
        }));
        const mLast = mNormalized[mNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: mNormalized,
          pathStrings: mNormalized.map((c) => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: mLast.end.x, y: mLast.end.y },
        };
      }

      case 'rotateAtVertexIndex': {
        if (expr.args.length !== 2) throw mError('rotateAtVertexIndex() expects 2 arguments (index, angle)');
        const rIdx = evaluateExpression(expr.args[0], scope);
        const rAngle = evaluateExpression(expr.args[1], scope);
        if (typeof rIdx !== 'number') throw mError('rotateAtVertexIndex() index must be a number');
        if (typeof rAngle !== 'number') throw mError('rotateAtVertexIndex() angle must be a number');
        if (!Number.isInteger(rIdx)) throw mError('rotateAtVertexIndex() index must be an integer');
        const rotated = rotateAtVertexCommands(obj.commands, rIdx, rAngle);
        if (rotated.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const rOriginX = rotated[0].start.x;
        const rOriginY = rotated[0].start.y;
        const rNormalized = rotated.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - rOriginX, y: cmd.start.y - rOriginY },
          end: { x: cmd.end.x - rOriginX, y: cmd.end.y - rOriginY },
        }));
        const rLast = rNormalized[rNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: rNormalized,
          pathStrings: rNormalized.map((c) => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: rLast.end.x, y: rLast.end.y },
        };
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
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        const sLast = scaled[scaled.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: scaled,
          pathStrings: scaled.map((c) => commandToPathString(c)),
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
        if (subResult.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            pathStrings: [],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 0, y: 0 },
          };
        }
        // Normalize to (0,0) origin for PathBlockValue
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
          pathStrings: spNormalized.map((c) => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: spLast.end.x, y: spLast.end.y },
        };
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
          efRot = evaluateExpression(expr.args[2], scope) as number;
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
          efvRot = evaluateExpression(expr.args[3], scope) as number;
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

  // ProjectedPathValue methods: drawTo(), get(), tangent(), normal(), partition()
  if (isProjectedPathValue(obj)) {
    // Check if we're inside a path block — drawTo not allowed there
    if (scope.evalState && (scope.evalState as EvaluationState & { _insidePathBlock?: boolean })._insidePathBlock) {
      if (expr.method === 'drawTo') {
        throw mError(`Cannot call .${expr.method}() inside a path block`);
      }
    }

    switch (expr.method) {
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

        // Emit M x y followed by relative commands
        const moveCmd = `M ${formatNum(dtX)} ${formatNum(dtY)}`;
        const relativeD = commandsToRelativeD(reProjectedCommands);
        const emittedPath = `${moveCmd} ${relativeD}`;

        // Track in path context
        parseAndTrackPathString(emittedPath, scope);

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
        if (expr.args.length !== 1) throw mError('offset() expects 1 argument (distance)');
        const dist = evaluateExpression(expr.args[0], scope);
        if (typeof dist !== 'number') throw mError('offset() argument must be a number');
        const offsetResult = offsetCommands(obj.commands, dist);
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
        const mAngle = evaluateExpression(expr.args[0], scope);
        if (typeof mAngle !== 'number') throw mError('mirror() argument must be a number');
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

      case 'rotateAtVertexIndex': {
        if (expr.args.length !== 2) throw mError('rotateAtVertexIndex() expects 2 arguments (index, angle)');
        const rIdx = evaluateExpression(expr.args[0], scope);
        const rAngle = evaluateExpression(expr.args[1], scope);
        if (typeof rIdx !== 'number') throw mError('rotateAtVertexIndex() index must be a number');
        if (typeof rAngle !== 'number') throw mError('rotateAtVertexIndex() angle must be a number');
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
            pathStrings: [],
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
          pathStrings: spNormalized.map((c) => commandToPathString(c)),
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
          efRot = evaluateExpression(expr.args[2], scope) as number;
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
          efvRot = evaluateExpression(expr.args[3], scope) as number;
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
        const ppAngle = evaluateExpression(expr.args[2], scope);
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number') throw mError('polarProject() px must be a number');
        if (typeof ppy !== 'number') throw mError('polarProject() py must be a number');
        if (typeof ppAngle !== 'number') throw mError('polarProject() angle must be a number');
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
          dtRotation = evaluateExpression(expr.args[2], scope) as number;
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
            const fontData = getFont(fontRegistry, fontFamily, fontWeight);
            if (!fontData) {
              const available = Array.from(fontRegistry.fonts.keys()).join(', ');
              throw mError(`toPathBlock() font '${fontFamily}' not loaded. Available: ${available || 'none'}`);
            }

            for (const char of text) {
              if (char === ' ' || char === '\t') {
                // Space: advance cursor without generating outline commands
                const { advanceWidth } = glyphToPathBlockCommands(fontData, char, fontSize);
                cursorX += advanceWidth + letterSpacing;
                continue;
              }
              const { commands: glyphCmds, advanceWidth } = glyphToPathBlockCommands(fontData, char, fontSize);
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
        const ppAngle = evaluateExpression(expr.args[2], scope);
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number') throw mError('polarProject() px must be a number');
        if (typeof ppy !== 'number') throw mError('polarProject() py must be a number');
        if (typeof ppAngle !== 'number') throw mError('polarProject() angle must be a number');
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
          dtRotation = evaluateExpression(expr.args[2], scope) as number;
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
        const angle = evaluateExpression(expr.args[0], scope);
        const distance = evaluateExpression(expr.args[1], scope);
        if (typeof angle !== 'number') throw mError('polarTranslate() angle must be a number');
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
        const angle = evaluateExpression(expr.args[0], scope);
        const origin = evaluateExpression(expr.args[1], scope);
        if (typeof angle !== 'number') throw mError('rotate() angle must be a number');
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

  // PolarVector methods
  if (isPolarVectorValue(obj)) {
    switch (expr.method) {
      case 'turn': {
        if (expr.args.length !== 1) throw mError('turn() expects 1 argument');
        const delta = evaluateExpression(expr.args[0], scope);
        if (typeof delta !== 'number') throw mError('turn() argument must be a number');
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
        const degrees = evaluateExpression(expr.args[0], scope);
        if (typeof degrees !== 'number') throw mError('hueShift() degrees must be a number');
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
      case 'analogous': {
        if (expr.args.length > 1) throw mError('analogous() expects 0 or 1 arguments');
        let angle = 30;
        if (expr.args.length === 1) {
          const a = evaluateExpression(expr.args[0], scope);
          if (typeof a !== 'number') throw mError('analogous() angle must be a number');
          angle = a;
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
          if (typeof a !== 'number') throw mError('splitComplementary() angle must be a number');
          angle = a;
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

        const fontData = getFont(registry, fontFamily, fontWeight);
        if (!fontData) {
          const available = Array.from(registry.fonts.keys()).join(', ');
          throw mError(`Font '${fontFamily}' not found in font registry. Available fonts: ${available || 'none'}`);
        }

        // Convert each character to a PathBlockValue
        const glyphs: Value[] = [];
        for (const char of textArg) {
          const { commands, advanceWidth } = glyphToPathBlockCommands(fontData, char, fontSize);

          if (commands.length === 0) {
            // Space or empty glyph — return an empty PathBlockValue with advanceWidth
            const pb: PathBlockValue = {
              type: 'PathBlockValue' as const,
              commands: [],
              pathStrings: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
            // Store advanceWidth as expando property
            (pb as PathBlockValue & { advanceWidth: number }).advanceWidth = advanceWidth;
            glyphs.push(pb);
            continue;
          }

          // Normalize to (0,0) origin
          const normalized = buildPathBlockFromCommands(commands, { x: 0, y: 0 });
          // Attach advanceWidth as expando property
          (normalized as PathBlockValue & { advanceWidth: number }).advanceWidth = advanceWidth;
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
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.push(val);
      return obj.elements.length;
    }
    case 'pop': {
      if (expr.args.length !== 0) throw mError('pop() expects 0 arguments');
      if (obj.elements.length === 0) return null;
      return obj.elements.pop()!;
    }
    case 'shift': {
      if (expr.args.length !== 0) throw mError('shift() expects 0 arguments');
      if (obj.elements.length === 0) return null;
      return obj.elements.shift()!;
    }
    case 'unshift': {
      if (expr.args.length !== 1) throw mError('unshift() expects 1 argument');
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.unshift(val);
      return obj.elements.length;
    }
    case 'empty': {
      if (expr.args.length !== 0) throw mError('empty() expects 0 arguments');
      return boolVal(obj.elements.length === 0);
    }
    case 'map': {
      if (expr.args.length !== 0) throw mError('map() does not take arguments — use map {|item| ... }');
      if (!expr.block) throw mError('map() requires a trailing block: array.map {|item| return ...; }');
      const result: Value[] = [];
      const mapParams = expr.block.params;
      const mapLine = getLine(expr);
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(scope);
        setVariable(blockScope, mapParams[0], obj.elements[i]);
        if (mapParams.length > 1) setVariable(blockScope, mapParams[1], i);
        if (mapParams.length > 2) setVariable(blockScope, mapParams[2], obj);
        try {
          for (const stmt of expr.block.body) {
            evaluateStatementToAccum(stmt, blockScope, []);
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
      return { type: 'ArrayValue' as const, elements: result };
    }
    case 'reduce': {
      if (expr.args.length !== 1) throw mError('reduce() expects 1 argument (initial value)');
      if (!expr.block) throw mError('reduce() requires a trailing block: array.reduce(init) {|acc, item| return acc; }');
      let accumulator: Value = evaluateExpression(expr.args[0], scope);
      const reduceParams = expr.block.params;
      const reduceLine = getLine(expr);
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(scope);
        setVariable(blockScope, reduceParams[0], accumulator);
        if (reduceParams.length > 1) setVariable(blockScope, reduceParams[1], obj.elements[i]);
        if (reduceParams.length > 2) setVariable(blockScope, reduceParams[2], i);
        if (reduceParams.length > 3) setVariable(blockScope, reduceParams[3], obj);
        try {
          for (const stmt of expr.block.body) {
            evaluateStatementToAccum(stmt, blockScope, []);
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
    default:
      throw mError(`Unknown array method: ${expr.method}`);
  }
}

function formatValueForDisplay(val: Value): string {
  if (val === null) return 'null';
  if (isBooleanValue(val)) return val.value ? 'true' : 'false';
  if (typeof val === 'number') return formatNum(val);
  if (typeof val === 'string') return val;
  if (isPointValue(val)) {
    return `Point(${formatNum(val.x)}, ${formatNum(val.y)})`;
  }
  if (isPolarVectorValue(val)) {
    return `PolarVector(${formatNum(val.angle)}, ${formatNum(val.distance)})`;
  }
  if (isPathBlockValue(val)) {
    return `PathBlock(${val.commands.length} commands)`;
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

  // Handle PointValue property access
  if (isPointValue(obj)) {
    if (expr.property === 'x') return obj.x;
    if (expr.property === 'y') return obj.y;
    throw new Error(`Property '${expr.property}' does not exist on Point`);
  }

  // Handle PolarVectorValue property access
  if (isPolarVectorValue(obj)) {
    if (expr.property === 'angle') return obj.angle;
    if (expr.property === 'distance') return obj.distance;
    throw new Error(`Property '${expr.property}' does not exist on PolarVector`);
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
      case 'contours': {
        // Decompose a multi-contour glyph into individual PathBlockValues
        const contourGroups = splitContours(obj.commands);
        const contourBlocks: Value[] = contourGroups.map((cmds) =>
          buildPathBlockFromCommands(cmds, { x: 0, y: 0 }),
        );
        return { type: 'ArrayValue' as const, elements: contourBlocks };
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

  // Handle ContextObject property access
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ContextObject') {
    const contextObj = obj;

    // Handle .transform access — returns TransformReference if transform state is attached
    if (expr.property === 'transform') {
      const transformState = contextObj.value._transformState as TransformState | undefined;
      if (transformState) {
        return { type: 'TransformReference' as const, state: transformState };
      }
      throw new Error(`Property 'transform' does not exist on context object`);
    }

    const propValue = contextObj.value[expr.property];

    if (propValue === undefined) {
      throw new Error(`Property '${expr.property}' does not exist on context object`);
    }

    // If the property is an object (like position or start), wrap it as ContextObject
    if (typeof propValue === 'object' && propValue !== null && !Array.isArray(propValue)) {
      return { type: 'ContextObject' as const, value: propValue as Record<string, unknown> };
    }

    // If it's a number, return it directly
    if (typeof propValue === 'number') {
      return propValue;
    }

    // If it's an array (like commands), wrap it as ContextObject
    if (Array.isArray(propValue)) {
      return { type: 'ContextObject' as const, value: { length: propValue.length, items: propValue } };
    }

    throw new Error(`Cannot access property '${expr.property}' of type ${typeof propValue}`);
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

  // Handle MeshPointValue property access
  if (isMeshPointValue(obj)) {
    switch (expr.property) {
      case 'x':
        return obj.x;
      case 'y':
        return obj.y;
      case 'color':
        return { type: 'ColorValue', oklch: { ...obj.color } } as ColorValue;
      default:
        throw new Error(`Property '${expr.property}' does not exist on MeshPoint`);
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

  // Handle ColorValue property access
  if (isColorValue(obj)) {
    switch (expr.property) {
      case 'css':
        return oklchToCSS(obj.oklch);
      case 'hex':
        return oklchToHex(obj.oklch);
      case 'oklch':
        return oklchToOKLCHString(obj.oklch);
      case 'hsl':
        return oklchToHSLString(obj.oklch);
      case 'rgb':
        return oklchToRGBString(obj.oklch);
      case 'lightness':
        return obj.oklch.L;
      case 'chroma':
        return obj.oklch.C;
      case 'hue':
        return obj.oklch.H;
      case 'a':
        return obj.oklch.alpha;
      default:
        throw new Error(`Property '${expr.property}' does not exist on Color`);
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
        } else if (isPointValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPolarVectorValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isObjectValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isArrayValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isPathBlockValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isProjectedPathValue(value)) {
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
    const angle = evaluateExpression(call.args[0], scope);
    const distance = evaluateExpression(call.args[1], scope);
    if (typeof angle !== 'number') throw new Error('PolarVector() angle must be a number');
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
      }
    }
    return marker;
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
        evaluateStatementToAccum(stmt, blockScope, []);
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
      const H = evaluateExpression(call.args[2], scope);
      if (typeof L !== 'number') throw new Error(formatError('Color() L must be a number', cLine, cCol));
      if (typeof C !== 'number') throw new Error(formatError('Color() C must be a number', cLine, cCol));
      if (typeof H !== 'number') throw new Error(formatError('Color() H must be a number', cLine, cCol));
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
    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    return evaluateContextAwareFunction(call.name, args, scope, call.loc);
  }

  const fn = lookupVariable(scope, call.name, getLine(call), getCol(call));

  // Check if it's a stdlib function
  if (typeof fn === 'function') {
    // Track stdlib function usage
    if (scope.evalState) {
      scope.evalState.calledStdlibFunctions.add(call.name);
    }

    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    const result = (fn as (...args: number[]) => number)(...(args as number[]));

    // If stdlib function returns a PathSegment, track its commands
    if (typeof result === 'object' && result !== null && 'type' in result) {
      const typed = result as { type: string; value?: string };
      if (typed.type === 'PathSegment' && typed.value && scope.evalState) {
        parseAndTrackPathString(typed.value, scope);
      }
    }

    return result;
  }

  // Check if it's a user-defined function
  if (typeof fn === 'object' && fn !== null && 'type' in fn && fn.type === 'UserFunction') {
    const userFn = fn;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(
        formatError(
          `Function ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`,
          getLine(call),
          getCol(call),
        ),
      );
    }

    const fnScope = createScope(scope);
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
      if (isBooleanValue(value)) {
        return formatNum(value.value);
      }
      if (typeof value === 'number') {
        return formatNum(value);
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
      if (isBooleanValue(value)) {
        return formatNum(value.value);
      }
      if (typeof value !== 'number') {
        throw new Error('calc() must evaluate to a number');
      }
      return formatNum(value);
    }

    case 'FunctionCall': {
      const value = evaluateFunctionCall(arg, scope);
      // Void functions (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      if (typeof value === 'number') {
        return formatNum(value);
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
      if (isBooleanValue(value)) {
        return formatNum(value.value);
      }
      if (typeof value === 'number') {
        return formatNum(value);
      }
      throw new Error(`Member expression did not evaluate to a number`);
    }

    case 'IndexExpression': {
      const value = evaluateIndexExpression(arg, scope);
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
      }
      if (isBooleanValue(value)) {
        return formatNum(value.value);
      }
      if (typeof value === 'number') {
        return formatNum(value);
      }
      throw new Error('Index expression did not evaluate to a number');
    }

    case 'MethodCallExpression': {
      const value = evaluateMethodCall(arg, scope);
      // Void method calls (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      if (typeof value === 'number') {
        return formatNum(value);
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
  if (typeof value !== 'number') {
    throw new Error(`${label} must be a number`);
  }
  return value;
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
      parseAndTrackPathString(pathStr, scope);

      // Store tangent for tangentLine/tangentArc
      setLastTangent(ctx, tangentAngle);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
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
      parseAndTrackPathString(pathStr, scope);

      // Store tangent for tangentLine/tangentArc
      setLastTangent(ctx, tangentAngle);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
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
      parseAndTrackPathString(pathStr, scope);

      setLastTangent(ctx, newTangent);
      updateCtxVariable(scope);

      // Return both path and result info
      return {
        type: 'PathWithResult' as const,
        path: pathStr,
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

function evaluatePathCommand(cmd: PathCommand, scope: Scope): string {
  // Empty command means it's a statement-level function call
  if (cmd.command === '') {
    const args = cmd.args.map((arg) => evaluatePathArg(arg, scope));
    return args.join(' ');
  }

  // Get string args for output
  const stringArgs = cmd.args.map((arg) => evaluatePathArg(arg, scope));
  const result = cmd.command + (stringArgs.length > 0 ? ` ${stringArgs.join(' ')}` : '');

  // Update path context if tracking is enabled
  if (scope.evalState && cmd.command !== '') {
    const numericArgs = getNumericArgs(cmd.args, scope);
    // If bare command (not in apply block) with a default layer, update that layer's context
    if (scope.evalState.defaultLayerName && !scope.evalState.activeLayerName) {
      const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName)! as PathLayerState;
      updateContextForCommand(defaultLayer.pathContext, cmd.command, numericArgs);
    } else {
      updateContextForCommand(scope.evalState.pathContext, cmd.command, numericArgs);
    }
    updateCtxVariable(scope);
  }

  return result;
}

/**
 * Parse a path string and update context for each command found.
 * Used for tracking context when stdlib functions return path strings.
 */
function parseAndTrackPathString(pathStr: string, scope: Scope): void {
  if (!scope.evalState) return;

  // Parse path commands from string: M 10 20 L 30 40 A 5 5 0 1 1 50 50 etc.
  const commandRegex = /([MLHVCSQTAZmlhvcsqtaz])\s*([\d\s.,eE+-]*)/g;
  let match;

  while ((match = commandRegex.exec(pathStr)) !== null) {
    const command = match[1];
    const argsStr = match[2].trim();

    // Parse numeric arguments
    const args: number[] = [];
    if (argsStr) {
      const numMatches = argsStr.match(/-?[\d.]+(?:e[+-]?\d+)?/gi);
      if (numMatches) {
        for (const num of numMatches) {
          args.push(parseFloat(num));
        }
      }
    }

    updateContextForCommand(scope.evalState.pathContext, command, args);
  }

  updateCtxVariable(scope);
}

/**
 * Evaluate text body items (TemplateLiteral, TspanStatement, ForLoop, IfStatement, LetDeclaration)
 * into TextChild array. Used by TextStatement block form evaluation.
 */
function evaluateTextBody(items: TextBodyItem[], scope: Scope, children: TextChild[]): void {
  for (const item of items) {
    if (item.type === 'TemplateLiteral') {
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
          evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
        }
      }
    } else if (item.type === 'ForEachLoop') {
      const iterable = evaluateExpression(item.iterable, scope);
      if (!isArrayValue(iterable)) {
        throw new Error('for-each requires an array');
      }
      for (let i = 0; i < iterable.elements.length; i++) {
        const loopScope = createScope(scope);
        setVariable(loopScope, item.variable, iterable.elements[i]);
        if (item.indexVariable) {
          setVariable(loopScope, item.indexVariable, i);
        }
        evaluateTextBody(item.body as TextBodyItem[], loopScope, children);
      }
    } else if (item.type === 'IfStatement') {
      const condition = evaluateExpression(item.condition, scope);
      const isTruthy = condition !== null && (isBooleanValue(condition) ? condition.value !== 0 : typeof condition === 'number' ? condition !== 0 : Boolean(condition));
      if (isTruthy) {
        evaluateTextBody(item.consequent as TextBodyItem[], scope, children);
      } else if (item.alternate) {
        evaluateTextBody(item.alternate as TextBodyItem[], scope, children);
      }
    } else if (item.type === 'LetDeclaration') {
      const value = evaluateExpression(item.value, scope);
      if (item.pattern) {
        bindDestructuringPattern(item.pattern, value, scope);
      } else {
        setVariable(scope, item.name, value);
      }
    }
  }
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
    if (!isObjectValue(value)) {
      throw new Error(formatError('Cannot destructure non-object value with object pattern', line));
    }
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
  }
}

/**
 * Evaluate a statement, appending output to the accumulator array.
 * Using an accumulator avoids O(n^2) string concatenation from nested joins.
 */
function evaluateStatementToAccum(stmt: Statement, scope: Scope, accum: string[]): void {
  switch (stmt.type) {
    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      // Handle destructuring patterns
      if (stmt.pattern) {
        const bindValue = (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') ? value.result : value;
        bindDestructuringPattern(stmt.pattern, bindValue, scope, getLine(stmt));
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult' && value.path) {
          accum.push(value.path);
        }
        return;
      }
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value;
        setVariable(scope, stmt.name, pwr.result);
        if (pwr.path) accum.push(pwr.path);
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
        if (pwr.path) accum.push(pwr.path);
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
        if (typeof index !== 'number') throw new Error(formatError('Array index must be a number', getLine(stmt)));
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw new Error(formatError(`Array index ${index} out of bounds (length ${obj.elements.length})`, getLine(stmt)));
        obj.elements[index] = value;
        return;
      }
      throw new Error(formatError('Indexed assignment requires an object or array', getLine(stmt)));
    }

    case 'ForLoop': {
      const start = evaluateExpression(stmt.start, scope);
      const end = evaluateExpression(stmt.end, scope);

      if (typeof start !== 'number' || typeof end !== 'number') {
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
          evaluateStatementsToAccum(stmt.body, loopScope, accum);
        }
      } else {
        // Descending range
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          evaluateStatementsToAccum(stmt.body, loopScope, accum);
        }
      }
      return;
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const isTruthy = condition !== null && (isBooleanValue(condition) ? condition.value !== 0 : typeof condition === 'number' ? condition !== 0 : Boolean(condition));

      if (isTruthy) {
        evaluateStatementsToAccum(stmt.consequent, createScope(scope), accum);
      } else if (stmt.alternate) {
        evaluateStatementsToAccum(stmt.alternate, createScope(scope), accum);
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
          evaluateStatementsToAccum(stmt.body, loopScope, accum);
        }
        return;
      }

      // Array iteration (with smart destructuring)
      if (!isArrayValue(iterable)) {
        throw new Error(formatError('for-each requires an array or object', getLine(stmt)));
      }

      for (let i = 0; i < iterable.elements.length; i++) {
        const loopScope = createScope(scope);
        const element = iterable.elements[i];
        setVariable(loopScope, stmt.variable, element);
        if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, i);
        evaluateStatementsToAccum(stmt.body, loopScope, accum);
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
            if (scope.evalState?.defaultLayerName && !scope.evalState.activeLayerName) {
              const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName)! as PathLayerState;
              defaultLayer.accum.push(pwr.path);
            } else {
              accum.push(pwr.path);
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
      if (result) {
        // Route path commands to default layer if one is defined and we're not in an apply block
        if (scope.evalState?.defaultLayerName && !scope.evalState.activeLayerName) {
          const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName)! as PathLayerState;
          defaultLayer.accum.push(result);
        } else {
          accum.push(result);
        }
      }
      return;
    }

    case 'ViewBoxDefinition': {
      if (!scope.evalState) {
        throw new Error(formatError('ViewBox definitions require evaluation context', getLine(stmt)));
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
      const layerState: PathLayerState = {
        name: nameValue,
        layerType: 'PathLayer',
        isDefault: stmt.isDefault,
        styles,
        pathContext: createPathContext(),
        accum: [],
        transformState: createTransformState(),
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
          evaluateStatementToAccum(bodyStmt, createScope(scope), []);
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
      evaluateStatementsToAccum(stmt.body, createScope(scope), (layer as PathLayerState).accum);
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
        evaluateTextBody(stmt.body, scope, children);
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
        if (typeof value !== 'string')
          throw new Error(formatError(`Pattern property '${stmt.property}' must be a string`, getLine(stmt)));
        switch (stmt.property) {
          case 'patternUnits':
            obj.patternUnits = value;
            return;
          case 'patternTransform':
            obj.patternTransform = value;
            return;
          case 'patternContentUnits':
            obj.patternContentUnits = value;
            return;
          default:
            throw new Error(formatError(`Cannot assign to Pattern property '${stmt.property}'`, getLine(stmt)));
        }
      }
      if (isMarkerValue(obj)) {
        const validateEnum = (enumName: string, val: string): string => {
          const enumObj = BUILTIN_ENUMS[enumName];
          const validValues = Object.values(enumObj);
          if (!validValues.includes(val)) {
            throw new Error(
              formatError(
                `Invalid value '${val}' for Marker.${stmt.property}. Valid values: ${validValues.join(', ')}`,
                getLine(stmt),
              ),
            );
          }
          return val;
        };
        switch (stmt.property) {
          case 'viewBox': {
            if (typeof value !== 'string')
              throw new Error(formatError(`Marker.viewBox must be a string`, getLine(stmt)));
            obj.viewBox = value;
            return;
          }
          case 'refX': {
            if (typeof value === 'number') {
              obj.refX = value;
            } else if (typeof value === 'string') {
              obj.refX = validateEnum('MarkerRefX', value);
            } else {
              throw new Error(formatError(`Marker.refX must be a number or MarkerRefX enum value`, getLine(stmt)));
            }
            return;
          }
          case 'refY': {
            if (typeof value === 'number') {
              obj.refY = value;
            } else if (typeof value === 'string') {
              obj.refY = validateEnum('MarkerRefY', value);
            } else {
              throw new Error(formatError(`Marker.refY must be a number or MarkerRefY enum value`, getLine(stmt)));
            }
            return;
          }
          case 'orient': {
            if (typeof value === 'number') {
              obj.orient = value;
            } else if (typeof value === 'string') {
              obj.orient = validateEnum('MarkerOrient', value);
            } else {
              throw new Error(formatError(`Marker.orient must be a number or MarkerOrient enum value`, getLine(stmt)));
            }
            return;
          }
          case 'markerUnits': {
            if (typeof value !== 'string')
              throw new Error(formatError(`Marker.markerUnits must be a MarkerUnits enum value`, getLine(stmt)));
            obj.markerUnits = validateEnum('MarkerUnits', value);
            return;
          }
          case 'preserveAspectRatio': {
            if (typeof value !== 'string')
              throw new Error(
                formatError(`Marker.preserveAspectRatio must be a MarkerPreserveAspectRatio enum value`, getLine(stmt)),
              );
            obj.preserveAspectRatio = validateEnum('MarkerPreserveAspectRatio', value);
            return;
          }
          default:
            throw new Error(formatError(`Cannot assign to Marker property '${stmt.property}'`, getLine(stmt)));
        }
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
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(formatError(`EmbossFilter.angle must be a finite number (with angle unit)`, getLine(stmt)));
            }
            obj.angle = value;
            return;
          }
          case 'elevation': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(formatError(`EmbossFilter.elevation must be a finite number (with angle unit)`, getLine(stmt)));
            }
            obj.elevation = value;
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
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(
                formatError(`ElevationShadowFilter.direction must be a finite number (with angle unit)`, getLine(stmt)),
              );
            }
            obj.direction = value;
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
      if (isMeshPointValue(obj)) {
        switch (stmt.property) {
          case 'color': {
            if (!isColorValue(value))
              throw new Error(formatError('MeshPoint color must be a Color value', getLine(stmt)));
            obj.color = { ...value.oklch };
            obj.colorCSS = oklchToCSS(value.oklch);
            return;
          }
          case 'x': {
            if (typeof value !== 'number') throw new Error(formatError('MeshPoint x must be a number', getLine(stmt)));
            obj.x = value;
            return;
          }
          case 'y': {
            if (typeof value !== 'number') throw new Error(formatError('MeshPoint y must be a number', getLine(stmt)));
            obj.y = value;
            return;
          }
          default:
            throw new Error(formatError(`Cannot assign to MeshPoint property '${stmt.property}'`, getLine(stmt)));
        }
      }
      if (isGradientValue(obj)) {
        switch (stmt.property) {
          case 'spreadMethod':
          case 'gradientUnits':
          case 'gradientTransform': {
            if (typeof value !== 'string')
              throw new Error(formatError(`Gradient property '${stmt.property}' must be a string`, getLine(stmt)));
            if (stmt.property === 'spreadMethod') obj.spreadMethod = value;
            else if (stmt.property === 'gradientUnits') obj.gradientUnits = value;
            else obj.gradientTransform = value;
            return;
          }
          case 'interpolation': {
            if (typeof value !== 'string')
              throw new Error(formatError(`Gradient property 'interpolation' must be a string`, getLine(stmt)));
            if (value !== 'srgb' && value !== 'oklch' && value !== 'linearRGB') {
              throw new Error(
                formatError(`Gradient interpolation must be 'srgb', 'oklch', or 'linearRGB'`, getLine(stmt)),
              );
            }
            obj.interpolation = value;
            return;
          }
          case 'steps': {
            if (typeof value !== 'number')
              throw new Error(formatError(`Gradient property 'steps' must be a number`, getLine(stmt)));
            obj.steps = value;
            return;
          }
          // Conic-specific properties
          case 'from':
          case 'to': {
            // Enforce angle unit on literal numbers
            if (stmt.value.type === 'NumberLiteral' && !stmt.value.unit) {
              throw new Error(
                formatError(
                  `ConicGradient '${stmt.property}' requires an angle unit. Use e.g. ${stmt.value.value}deg, ${((stmt.value.value * Math.PI) / 180).toFixed(2)}rad, or ${(stmt.value.value / 180).toFixed(2)}pi`,
                  getLine(stmt),
                ),
              );
            }
            // Also check negative unary on bare number
            if (stmt.value.type === 'UnaryExpression' && stmt.value.operator === '-' && !hasAngleUnit(stmt.value)) {
              throw new Error(formatError(`ConicGradient '${stmt.property}' requires an angle unit`, getLine(stmt)));
            }
            if (typeof value !== 'number')
              throw new Error(
                formatError(`ConicGradient '${stmt.property}' must be a number (with angle unit)`, getLine(stmt)),
              );
            obj[stmt.property] = value;
            return;
          }
          case 'direction': {
            if (value !== 'cw' && value !== 'ccw')
              throw new Error(formatError(`ConicGradient direction must be 'cw' or 'ccw'`, getLine(stmt)));
            obj.direction = value;
            return;
          }
          case 'spread': {
            if (typeof value !== 'string' || !['clamp', 'repeat', 'transparent'].includes(value)) {
              throw new Error(
                formatError(`ConicGradient spread must be 'clamp', 'repeat', or 'transparent'`, getLine(stmt)),
              );
            }
            obj.spread = value;
            return;
          }
          case 'innerRadius': {
            if (typeof value !== 'number') {
              throw new Error(formatError(`ConicGradient innerRadius must be a number`, getLine(stmt)));
            }
            if (value < 0) {
              throw new Error(formatError(`ConicGradient innerRadius must be >= 0`, getLine(stmt)));
            }
            obj.innerRadius = value;
            return;
          }
          case 'innerFill': {
            if (value === 'transparent' || value === 'center' || value === 'transparent-blend') {
              obj.innerFill = value;
            } else if (isColorValue(value)) {
              obj.innerFill = value;
            } else {
              throw new Error(
                formatError(
                  `ConicGradient innerFill must be 'transparent', 'transparent-blend', 'center', or a Color value`,
                  getLine(stmt),
                ),
              );
            }
            return;
          }
          case 'falloff': {
            if (obj.gradientType !== 'freeform')
              throw new Error(formatError(`Property 'falloff' is only available on FreeformGradient`, getLine(stmt)));
            if (typeof value !== 'number')
              throw new Error(formatError(`FreeformGradient falloff must be a number`, getLine(stmt)));
            if (value <= 0) throw new Error(formatError(`FreeformGradient falloff must be positive`, getLine(stmt)));
            obj.falloff = value;
            return;
          }
          // Topo-specific properties
          case 'easing': {
            if (obj.gradientType !== 'topo')
              throw new Error(formatError(`Property 'easing' is only available on TopoGradient`, getLine(stmt)));
            const valid = ['linear', 'smoothstep', 'ease-in', 'ease-out', 'ease-in-out'];
            if (typeof value !== 'string' || !valid.includes(value)) {
              throw new Error(formatError(`TopoGradient easing must be one of: ${valid.join(', ')}`, getLine(stmt)));
            }
            obj.topoEasing = value;
            return;
          }
          case 'method': {
            if (obj.gradientType !== 'topo')
              throw new Error(formatError(`Property 'method' is only available on TopoGradient`, getLine(stmt)));
            if (value !== 'distance' && value !== 'laplace') {
              throw new Error(formatError(`TopoGradient method must be 'distance' or 'laplace'`, getLine(stmt)));
            }
            obj.topoMethod = value as string;
            return;
          }
          case 'iterations': {
            if (obj.gradientType !== 'topo')
              throw new Error(formatError(`Property 'iterations' is only available on TopoGradient`, getLine(stmt)));
            if (typeof value !== 'number')
              throw new Error(formatError(`TopoGradient iterations must be a number`, getLine(stmt)));
            if (value < 1 || value > 2000)
              throw new Error(formatError(`TopoGradient iterations must be between 1 and 2000`, getLine(stmt)));
            obj.topoIterations = Math.round(value);
            return;
          }
          case 'blend': {
            if (obj.gradientType !== 'topo')
              throw new Error(formatError(`Property 'blend' is only available on TopoGradient`, getLine(stmt)));
            if (typeof value !== 'number')
              throw new Error(formatError(`TopoGradient blend must be a number`, getLine(stmt)));
            if (value < 0 || value > 1)
              throw new Error(formatError(`TopoGradient blend must be between 0 and 1`, getLine(stmt)));
            obj.topoBlend = value;
            return;
          }
          case 'baseColor': {
            if (obj.gradientType !== 'topo')
              throw new Error(formatError(`Property 'baseColor' is only available on TopoGradient`, getLine(stmt)));
            if (!isColorValue(value))
              throw new Error(formatError(`TopoGradient baseColor must be a Color value`, getLine(stmt)));
            obj.topoBaseColor = { ...value.oklch };
            obj.topoBaseColorCSS = oklchToCSS(value.oklch);
            return;
          }
          default:
            throw new Error(formatError(`Cannot assign to Gradient property '${stmt.property}'`, getLine(stmt)));
        }
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
 */
function evaluateStatementsToAccum(stmts: Statement[], scope: Scope, accum: string[]): void {
  for (const stmt of stmts) {
    evaluateStatementToAccum(stmt, scope, accum);
  }
}

/**
 * Evaluate statements and return the joined result.
 * This is the public interface that uses the optimized accumulator internally.
 */
function evaluateStatements(stmts: Statement[], scope: Scope): string {
  const accum: string[] = [];
  evaluateStatementsToAccum(stmts, scope, accum);
  return accum.join(' ');
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
function buildCompileResult(mainAccum: string[], evalState: EvaluationState): CompileResult {
  const layers: LayerOutput[] = [];

  if (evalState.layerOrder.length === 0) {
    // No layers defined: single implicit default layer
    const transform = transformStateToSvg(evalState.transformState) ?? undefined;
    layers.push({
      name: 'default',
      type: 'path',
      data: mainAccum.join(' '),
      styles: {},
      isDefault: true,
      transform,
    });
  } else {
    // Check if main accum has content that wasn't routed to a default layer
    const mainContent = mainAccum.join(' ');
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
        data: pathLayer.accum.join(' '),
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

    const accum: string[] = [];
    evaluateStatementsToAccum(program.body, scope, accum);

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

    const accum: string[] = [];
    evaluateStatementsToAccum(program.body, scope, accum);

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
