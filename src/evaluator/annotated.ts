// Annotated evaluator - produces human-readable output with comments and annotations
import { contextAwareFunctions, stdlib } from '../stdlib';
import { CALLBACK_METHODS } from '../callback-methods';
import { pathDifference, pathIntersection, pathUnion, pathXor } from './boolean-ops';
import { CHAR_CLASS_PREDICATES, isWhitespaceChar } from './char-class';
import { DEFS_CONSTRUCTORS } from './constructor-registry';
import { contextToObject, createPathContext, setLastTangent, updateContextForCommand } from './context';
import { estimateTextBoundingBox } from './font-metrics';
import { getFont, lookupGlyph, recordMissingGlyph, splitContours } from './font-provider';
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
import { partitionPath, samplePathAtFraction } from './sampling';
import { recordsFromCommands } from './segments';
import {
  commandsToRelativeD,
  parsePathStringToCommands,
  serializeRelativeAndTrack,
  splitPathCommands,
} from './path-data';
import { validateCSSIdent, validateCSSValue } from './sanitize';
import { BUILTIN_ENUMS } from './builtin-enums';
import { assignGradientProperty, assignMarkerProperty, assignMeshPointProperty, assignPatternProperty } from './member-assign';
import { angle, angleMethod, formatAngleForDisplay, isAngleValue, radiansToDegreesSnapped } from './angle';
import { checkAngleUnitMismatch, convertUnitSuffix } from './units';
import { tryResolveCSSFunctionArgs } from './css-function-resolve';
import { spliceTemplateFragments } from '../css-value-utils';
import { formatNum } from './format';
import { sanitizeSVGFragment } from './svg-sanitize';
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
import { parseExpression as expressionParserFn } from '../parser/lezer-expression';
import { getStructDescriptor } from './struct-properties';

import type { PathContext } from './context';
import type { OKLCH } from '../color';
import type {
  AngleValue,
  BooleanValue,
  ClipPathValue,
  ColorNamespace,
  ColorValue,
  ContextObject,
  CSSVarValue,
  GridInterpolationMode,
  GridOutOfBoundsMode,
  MarkerValue,
  MaskValue,
  MeshPointValue,
  ObjectNamespace,
  PathBlockCommand,
  PathBlockNamespace,
  PathBlockValue,
  PathSegment,
  PatternValue,
  PointValue,
  PolarVectorValue,
  ProjectedPathValue,
  ProjectedTextValue,
  StyleBlockValue,
  SVGFragmentValue,
  TextBlockElement,
  TextBlockValue,
  TextChild,
  UserFunction,
  ViewBoxStructValue,
  ViewBoxValue,
} from './types';
import type {
  ArrayDestructuringPattern,
  Comment,
  Expression,
  FunctionCall,
  IndexExpression,
  MemberExpression,
  MethodCallExpression,
  ObjectDestructuringPattern,
  PathArg,
  PathBlockExpression,
  Program,
  SourceLocation,
  Statement,
  StyleBlockLiteral,
  TemplateLiteral,
  TextBlockExpression,
  TextBodyItem,
  ViewBoxDefinition,
} from '../parser/ast';

/** Maximum iterations allowed per for-loop to prevent runaway programs. */
const MAX_ITERATIONS = 32000;
const expressionParser = {
  parse: (input: string) => {
    const v = expressionParserFn(input);
    return { status: v !== null, value: v };
  },
};

// Types for annotated output
export type AnnotatedLine =
  | { type: 'comment'; text: string }
  | { type: 'path_command'; command: string; args: string; line?: number }
  | { type: 'loop_start'; variable: string; start: number; end: number; line: number }
  | { type: 'foreach_start'; variable: string; length: number; line: number }
  | { type: 'iteration'; index: number }
  | { type: 'iteration_skip'; count: number }
  | { type: 'loop_end' }
  | { type: 'function_call'; name: string; args: string; line: number }
  | { type: 'function_call_end' };

export interface AnnotatedOutput {
  lines: AnnotatedLine[];
}

function isBooleanValue(value: Value): value is BooleanValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'BooleanValue';
}

function boolVal(v: boolean | number): BooleanValue {
  return { type: 'BooleanValue', value: v ? 1 : 0 };
}

function toNumber(v: Value): number | undefined {
  if (typeof v === 'number') return v;
  if (isBooleanValue(v)) return v.value;
  if (isAngleValue(v)) return v.radians;
  return undefined;
}

function isCallableValue(v: Value): v is UserFunction {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'UserFunction';
}

// Mirror of evaluator/index.ts resolveCallbackBlock: the callback for a
// block-consuming builtin is the literal trailing block, or a UserFunction
// value (lambda or named fn) applied with `<<` (workerExpr, passed
// unevaluated from the BinaryExpression pre-dispatch). Lambda `closure`
// makes the body resolve lexically; blocks/named fns keep caller-scope.
// Parenthesized args evaluate here ONCE, left-to-right, BEFORE the worker;
// builtins consume `leadingArgs`. The old argument form (map(f)) is gone.
function resolveCallbackBlock(
  expr: { block?: { params: string[]; body: Statement[] }; args: Expression[]; method: string },
  scope: Scope,
  workerExpr?: Expression,
): { params: string[]; body: Statement[]; closure?: Scope; leadingArgs: Value[]; extraArgs: number } | null {
  if (expr.block) {
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

/** Display a value in annotated output (Angles keep their written unit). */
function displayArg(v: Value): string {
  if (isAngleValue(v)) return formatAngleForDisplay(v);
  if (typeof v === 'object' && v !== null && 'type' in v && v.type === 'UserFunction') {
    return `${v.isLambda ? 'Lambda' : 'Function'}(${v.params.join(', ')})`;
  }
  return String(v);
}

/**
 * Read a color-method angle argument (parity with index.ts colorAngleDegrees):
 * an Angle value converts to degrees exactly; a bare number is already degrees.
 */
function colorAngleDegrees(v: Value): number | undefined {
  if (isAngleValue(v)) return radiansToDegreesSnapped(v.radians);
  if (typeof v === 'number') return v;
  if (isBooleanValue(v)) return v.value;
  return undefined;
}


// Value types (same as main evaluator)
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
  | AnnotatedLayerRef
  | StyleBlockValue
  | ArrayValue
  | ObjectValue
  | ObjectNamespace
  | PathBlockNamespace
  | PathBlockValue
  | ProjectedPathValue
  | SVGFragmentValue
  | GradientValue
  | MeshPointValue
  | MaskValue
  | ClipPathValue
  | PatternValue
  | MarkerValue
  | AnnotatedFilterValue
  | ColorValue
  | ColorNamespace
  | CSSVarValue
  | PointValue
  | PolarVectorValue
  | CyclerValue
  | GridValue
  | TextBlockValue
  | ProjectedTextValue
  | ViewBoxStructValue;

function isSVGFragmentValue(value: Value): value is SVGFragmentValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'SVGFragmentValue';
}

export interface GradientValue {
  type: 'GradientValue';
  gradientType: 'linear' | 'radial' | 'conic' | 'mesh' | 'freeform' | 'topo';
  id: string;
  attrs: Record<string, string>;
  stops: { offset: number; color: string }[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  href?: string;
  interpolation?: 'srgb' | 'oklch' | 'linearRGB';
  steps?: number;
  from?: number;
  to?: number;
  direction?: 'cw' | 'ccw';
  spread?: string;
  innerRadius?: number;
  innerFill?: 'transparent' | 'transparent-blend' | 'center' | ColorValue;
  // Mesh-specific
  meshGrid?: MeshPointValue[][];
  meshWidth?: number;
  meshHeight?: number;
  meshCols?: number;
  meshRows?: number;
  // Freeform-specific
  freeformPoints?: { x: number; y: number; color: OKLCH; colorCSS: string }[];
  freeformWidth?: number;
  freeformHeight?: number;
  falloff?: number;
  // Topo-specific
  topoContours?: { elevation: number; dString: string; color: OKLCH; colorCSS: string }[];
  topoWidth?: number;
  topoHeight?: number;
  topoEasing?: string;
  topoMethod?: string;
  topoIterations?: number;
  topoBlend?: number;
  topoBaseColor?: OKLCH;
  topoBaseColorCSS?: string;
}

function isGradientValue(value: Value): value is GradientValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'GradientValue';
}

function isMeshPointValue(value: Value): value is MeshPointValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MeshPointValue';
}

function isMaskValue(value: Value): value is MaskValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MaskValue';
}

function isClipPathValue(value: Value): value is ClipPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ClipPathValue';
}

function isPatternValue(value: Value): value is PatternValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PatternValue';
}

function isMarkerValue(value: Value): value is MarkerValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MarkerValue';
}

// GridValue/CyclerValue/ArrayValue/ObjectValue embed this module's Value union
// recursively (cells/elements/properties), so they must stay local — importing
// them from ./types would rebind their payloads to types.ts's wider Value.
export interface GridValue {
  type: 'GridValue';
  rows: number;
  cols: number;
  xDim: number;
  yDim: number;
  origin: PointValue;
  outOfBounds: GridOutOfBoundsMode;
  interpolation: GridInterpolationMode;
  cells: Value[][];
}

function isGridValue(value: Value): value is GridValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'GridValue';
}

function isPolarVectorValue(value: Value): value is PolarVectorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PolarVectorValue';
}

export interface CyclerValue {
  type: 'CyclerValue';
  elements: Value[];
  index: number;
}

function isCyclerValue(value: Value): value is CyclerValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CyclerValue';
}

function annGridResolveIndex(idx: number, size: number, mode: GridOutOfBoundsMode): number | null {
  if (idx >= 0 && idx < size) return idx;
  if (mode === 'clamp') return Math.max(0, Math.min(size - 1, idx));
  if (mode === 'wrap') return ((idx % size) + size) % size;
  return null;
}

function annGridSampleNearest(grid: GridValue, x: number, y: number): Value {
  const fc = (x - grid.origin.x) / grid.xDim - 0.5;
  const fr = (y - grid.origin.y) / grid.yDim - 0.5;
  const r = annGridResolveIndex(Math.round(fr), grid.rows, grid.outOfBounds);
  const c = annGridResolveIndex(Math.round(fc), grid.cols, grid.outOfBounds);
  if (r === null || c === null) return null;
  return grid.cells[r][c];
}

function annGridSampleBilinear(grid: GridValue, x: number, y: number, throwErr: (msg: string) => Error): Value {
  const fc = (x - grid.origin.x) / grid.xDim - 0.5;
  const fr = (y - grid.origin.y) / grid.yDim - 0.5;
  const c0base = Math.floor(fc);
  const r0base = Math.floor(fr);
  const fx = fc - c0base;
  const fy = fr - r0base;
  const r0 = annGridResolveIndex(r0base, grid.rows, grid.outOfBounds);
  const r1 = annGridResolveIndex(r0base + 1, grid.rows, grid.outOfBounds);
  const c0 = annGridResolveIndex(c0base, grid.cols, grid.outOfBounds);
  const c1 = annGridResolveIndex(c0base + 1, grid.cols, grid.outOfBounds);
  if (r0 === null || r1 === null || c0 === null || c1 === null) return null;
  const v00 = grid.cells[r0][c0];
  const v01 = grid.cells[r0][c1];
  const v10 = grid.cells[r1][c0];
  const v11 = grid.cells[r1][c1];
  if (typeof v00 === 'number' && typeof v01 === 'number' && typeof v10 === 'number' && typeof v11 === 'number') {
    const top = v00 * (1 - fx) + v01 * fx;
    const bottom = v10 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }
  if (
    typeof v00 === 'object' &&
    v00 !== null &&
    'type' in v00 &&
    v00.type === 'PointValue' &&
    typeof v01 === 'object' &&
    v01 !== null &&
    'type' in v01 &&
    v01.type === 'PointValue' &&
    typeof v10 === 'object' &&
    v10 !== null &&
    'type' in v10 &&
    v10.type === 'PointValue' &&
    typeof v11 === 'object' &&
    v11 !== null &&
    'type' in v11 &&
    v11.type === 'PointValue'
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
  throw throwErr('Grid.sampleBilinear() requires cells to be numbers or Points');
}

export interface AnnotatedFilterValue {
  type: 'FilterValue';
  kind: 'noise' | 'glow' | 'emboss' | 'elevation-shadow' | 'inner-shadow' | 'pixelate' | 'motion-blur';
  id: string;
}

function isFilterValue(value: Value): value is AnnotatedFilterValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'FilterValue';
}

/** Filter constructor name → annotated stub kind. */
const ANNOTATED_FILTER_KINDS: Record<string, AnnotatedFilterValue['kind']> = {
  NoiseFilter: 'noise',
  GlowFilter: 'glow',
  EmbossFilter: 'emboss',
  ElevationShadowFilter: 'elevation-shadow',
  InnerShadowFilter: 'inner-shadow',
  PixelateFilter: 'pixelate',
  MotionBlurFilter: 'motion-blur',
};

let annotatedFilterCounter = 0;

function isColorValue(value: Value): value is ColorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ColorValue';
}

function isCSSVarValue(value: Value): value is CSSVarValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CSSVarValue';
}

export interface ArrayValue {
  type: 'ArrayValue';
  elements: Value[];
}

function isArrayValue(value: Value): value is ArrayValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ArrayValue';
}

export interface ObjectValue {
  type: 'ObjectValue';
  properties: Map<string, Value>;
}

function isObjectValue(value: Value): value is ObjectValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ObjectValue';
}

function isPathBlockValue(value: Value): value is PathBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathBlockValue';
}

function isProjectedPathValue(value: Value): value is ProjectedPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedPathValue';
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
    records: recordsFromCommands(normalized),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: last.end.x, y: last.end.y },
  };
}

function isTextBlockValue(value: Value): value is TextBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'TextBlockValue';
}

function isProjectedTextValue(value: Value): value is ProjectedTextValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedTextValue';
}

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
 * Annotated mode's historical number formatting: toFixed(4) with trailing
 * zeros trimmed. Passed to the shared path-data serializer to keep annotated
 * output byte-stable; convergence on formatNum is a separate, deliberate step.
 */
const annotatedFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));

export interface AnnotatedLayerRef {
  type: 'LayerReference';
}

/**
 * Represents a function result that includes both path output AND a result value.
 * Used by functions like arcFromCenter that emit path and return arc info.
 */
export interface PathWithResult {
  type: 'PathWithResult';
  path: string; // The path string to emit
  result: ContextObject; // The result value (for assignments)
}

/**
 * Signal class used to propagate return values up the call stack.
 * Thrown by return statements and caught by function call evaluation.
 */
class ReturnSignal {
  constructor(public value: Value) {}
}

// Pending break/continue signal. Unlike index.ts (whose statement drivers
// return a LoopFlow code), the annotated walkers return strings consumed at
// ~25 sites, so a module-level flag avoids a signature churn. Safe because
// evaluation is synchronous: the flag is set only by executing a
// Break/ContinueStatement, and every statement loop between that point and
// the enclosing for-loop driver checks-and-stops, so the driver consumes it
// before any unrelated statement runs. Reset at evaluateAnnotated entry as a
// belt-and-braces guard; boundary walkers (top level, fn bodies, grid cells)
// clear-and-throw if it ever reaches them (the AST builder makes that
// unreachable for valid programs).
let pendingFlow: 'continue' | 'break' | null = null;

function consumePendingFlowAtBoundary(): void {
  if (pendingFlow) {
    const keyword = pendingFlow;
    pendingFlow = null;
    throw new Error(`'${keyword}' is only valid inside a for loop`);
  }
}

/**
 * Evaluation state for context-aware evaluation
 */
export interface EvaluationState {
  pathContext: PathContext;
  fontRegistry?: import('./types').FontRegistry;
  missingGlyphs?: Map<string, Set<string>>; // "family:weight" → chars with no glyph in any variant
  viewBox?: ViewBoxValue & { loc?: SourceLocation };
  insideLayerApply?: boolean;
}

export interface Scope {
  variables: Map<string, Value>;
  parent: Scope | null;
  evalState?: EvaluationState; // Shared across all scopes during evaluation
}

function createScope(parent: Scope | null = null): Scope {
  return {
    variables: new Map(),
    parent,
    evalState: parent?.evalState, // Inherit evaluation state from parent
  };
}

function lookupVariable(scope: Scope, name: string, line?: number, column?: number): Value {
  if (scope.variables.has(name)) {
    return scope.variables.get(name)!;
  }
  if (scope.parent) {
    return lookupVariable(scope.parent, name, line, column);
  }
  if (name === 'Object') {
    return { type: 'ObjectNamespace' } as ObjectNamespace;
  }
  if (name === 'Color') {
    return { type: 'ColorNamespace' } as ColorNamespace;
  }
  if (name === 'PathBlock') {
    return { type: 'PathBlockNamespace' } as PathBlockNamespace;
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
  if (name in stdlib) {
    return stdlib[name as keyof typeof stdlib] as unknown as Value;
  }
  throw new Error(formatError(`Undefined variable: ${name}`, line, column));
}

function setVariable(scope: Scope, name: string, value: Value): void {
  scope.variables.set(name, value);
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
    rootScope.variables.set('ctx', {
      type: 'ContextObject' as const,
      value: contextToObject(scope.evalState.pathContext),
    });
  }
}

/**
 * Parse a path string and update context for each command found.
 * Used for tracking context when stdlib functions return path strings.
 */
function parseAndTrackPathString(pathStr: string, scope: Scope): void {
  if (!scope.evalState) return;
  // Shared cursor-based tokenizer (path-data.ts) — unlike the old inline
  // regex, it handles exponent notation and implicit decimals correctly.
  parsePathStringToCommands(pathStr, scope.evalState.pathContext);
  updateCtxVariable(scope);
}

/**
 * Get numeric arguments from path args for context tracking
 */
function getNumericArgs(args: PathArg[], scope: Scope): number[] {
  const numericArgs: number[] = [];
  for (const arg of args) {
    if (arg.type === 'NumberLiteral') {
      numericArgs.push(convertUnitSuffix(arg.value, arg.unit));
    } else if (arg.type === 'Identifier') {
      const value = toNumber(lookupVariable(scope, arg.name));
      if (value !== undefined) {
        numericArgs.push(value);
      }
    } else if (arg.type === 'CalcExpression') {
      const value = toNumber(evaluateExpression(arg.expression, scope));
      if (value !== undefined) {
        numericArgs.push(value);
      }
    } else if (arg.type === 'MemberExpression') {
      const value = toNumber(evaluateMemberExpression(arg, scope));
      if (value !== undefined) {
        numericArgs.push(value);
      }
    } else if (arg.type === 'FunctionCall') {
      const value = toNumber(evaluateFunctionCall(arg, scope, null));
      if (value !== undefined) {
        numericArgs.push(value);
      }
      // PathSegments don't contribute to numeric args for context tracking
    } else if (arg.type === 'IndexExpression') {
      const value = toNumber(evaluateIndexExpression(arg, scope));
      if (value !== undefined) {
        numericArgs.push(value);
      }
    } else if (arg.type === 'MethodCallExpression') {
      const value = toNumber(evaluateMethodCall(arg, scope));
      if (value !== undefined) {
        numericArgs.push(value);
      }
    }
  }
  return numericArgs;
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
        return { type: 'PathSegment' as const, value: `${command.toLowerCase()} ${dx} ${dy}` };
      }
      return { type: 'PathSegment' as const, value: `${command} ${x} ${y}` };
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
        return { type: 'PathSegment' as const, value: `l ${dx} ${dy}` };
      }
      return { type: 'PathSegment' as const, value: `L ${x} ${y}` };
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
          pathStr = `a ${radius} ${radius} 0 ${largeArc} ${sweep} ${adx} ${ady}`;
        } else {
          const ldx = startX - ctx.position.x;
          const ldy = startY - ctx.position.y;
          const adx = endX - startX;
          const ady = endY - startY;
          pathStr = `l ${ldx} ${ldy} a ${radius} ${radius} 0 ${largeArc} ${sweep} ${adx} ${ady}`;
        }
      } else if (positionMatches) {
        // Current position is at arc start - just emit arc
        pathStr = `A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
      } else {
        // Position mismatch - draw line to arc start, then arc (keeps path continuous)
        pathStr = `L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
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
        pathStr = `a ${radius} ${radius} 0 ${largeArc} ${sweep} ${adx} ${ady}`;
      } else {
        pathStr = `A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
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
        return { type: 'PathSegment' as const, value: `l ${dx} ${dy}` };
      }
      return { type: 'PathSegment' as const, value: `L ${x} ${y}` };
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
        pathStr = `a ${radius} ${radius} 0 ${largeArc} ${sweep} ${adx} ${ady}`;
      } else {
        pathStr = `A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
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

// Context for annotated evaluation
interface AnnotatedContext {
  output: AnnotatedLine[];
  comments: Comment[];
  currentOffset: number;
  indentLevel: number;
}

function emitCommentsUpTo(ctx: AnnotatedContext, targetOffset: number): void {
  while (ctx.comments.length > 0 && ctx.comments[0].loc.offset < targetOffset) {
    const comment = ctx.comments.shift()!;
    ctx.output.push({ type: 'comment', text: comment.text });
  }
}

// Helper to format error messages with line numbers
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

function isStyleBlock(value: Value): value is StyleBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'StyleBlockValue';
}

function isAnnotatedLayerRef(value: Value): value is AnnotatedLayerRef {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'LayerReference';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Serialize a typed Value with a CSS representation (Color, CSSVar) to its
 * CSS string; null for everything else. Shared by the CSS-function-arg hooks
 * and the template-fragment splicer below (twin of index.ts helpers).
 */
function styleValueToCSS(evaluated: Value): string | null {
  if (isColorValue(evaluated)) {
    if (evaluated.lightDark) return `light-dark(${evaluated.lightDark.lightCSS}, ${evaluated.lightDark.darkCSS})`;
    if (evaluated.cssExpr) return evaluated.cssExpr;
    if (evaluated.cssVar) return `var(${evaluated.cssVar.varName}, ${oklchToCSS(evaluated.oklch)})`;
    return oklchToCSS(evaluated.oklch);
  }
  if (isCSSVarValue(evaluated)) {
    return evaluated.fallback
      ? `var(${evaluated.varName}, ${evaluated.fallback})`
      : `var(${evaluated.varName})`;
  }
  // CSS angle slots (hue-rotate) need a unit — emit degrees (parity with index.ts)
  if (isAngleValue(evaluated)) return `${formatNum(radiansToDegreesSnapped(evaluated.radians))}deg`;
  return null;
}

function evaluateStyleBlockLiteral(expr: StyleBlockLiteral, scope: Scope): StyleBlockValue {
  // Strict enforcement of a malformed declaration recorded leniently during
  // AST-building (see the index.ts twin for the rationale).
  if (expr.incomplete) {
    throw new Error(formatError(expr.incomplete.message, expr.incomplete.line, expr.incomplete.column));
  }
  const properties: Record<string, string> = {};
  for (const prop of expr.properties) {
    let resolvedValue = prop.value;
    let trusted = false;
    let wasWholeValueTemplate = false;
    // var() strings this compiler emitted from validated CSSVarValue/Color
    // objects for THIS value — the validator allows exactly these tokens.
    const emittedVars: string[] = [];
    try {
      const parseResult = expressionParser.parse(prop.value);
      if (parseResult.status && parseResult.value) {
        const evaluated = evaluateExpression(parseResult.value, scope);
        if (typeof evaluated === 'number') {
          resolvedValue = String(evaluated);
          trusted = true;
        } else if (isAngleValue(evaluated)) {
          resolvedValue = String(evaluated.radians);
          trusted = true;
        } else if (typeof evaluated === 'string') {
          resolvedValue = evaluated;
          // Whole-value template results also get function-arg resolution
          // below, mirroring index.ts.
          wasWholeValueTemplate = parseResult.value.type === 'TemplateLiteral';
        } else if (isColorValue(evaluated)) {
          if (evaluated.lightDark) {
            resolvedValue = `light-dark(${evaluated.lightDark.lightCSS}, ${evaluated.lightDark.darkCSS})`;
          } else if (evaluated.cssExpr) {
            resolvedValue = evaluated.cssExpr;
          } else if (evaluated.cssVar) {
            resolvedValue = `var(${evaluated.cssVar.varName}, ${oklchToCSS(evaluated.oklch)})`;
          } else {
            resolvedValue = oklchToCSS(evaluated.oklch);
          }
          trusted = true;
        } else if (isCSSVarValue(evaluated)) {
          resolvedValue = evaluated.fallback
            ? `var(${evaluated.varName}, ${evaluated.fallback})`
            : `var(${evaluated.varName})`;
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
      }
    } catch {
      // Keep raw string
    }
    // Backtick template fragments inside the value (e.g. blur(`${v}`px)):
    // evaluate each span and splice its text in, mirroring index.ts. The
    // spliced result stays untrusted and is validated below.
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
          // Typed values only: record compiler-emitted var() strings so the
          // validator allows exactly these tokens (never a var()-shaped
          // plain string result).
          const css = styleValueToCSS(v);
          if (css !== null) {
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
    // Whole-value expression parse didn't resolve — try resolving expressions
    // embedded inside CSS function arguments (e.g. color args in drop-shadow,
    // numeric variables in brightness), matching the primary evaluator so both
    // surfaces emit the same CSS. Also runs on spliced values and whole-value
    // template results.
    if (resolvedValue === prop.value || didSplice || wasWholeValueTemplate) {
      const cssResolved = tryResolveCSSFunctionArgs(resolvedValue, {
        parseExpression: (token) => {
          const parseResult = expressionParser.parse(token);
          return parseResult.status && parseResult.value ? parseResult.value : null;
        },
        resolveToCSS: (e) => {
          // Literal tokens (2px, 1.4) stay verbatim — substitution would
          // strip CSS units the Pathogen number parser consumed. (The shared
          // resolver also guards on raw token text for -90deg/-50% shapes.)
          if (e.type === 'NumberLiteral') return null;
          const evaluated = evaluateExpression(e, scope);
          const css = styleValueToCSS(evaluated);
          if (css !== null) return css;
          if (typeof evaluated === 'number') return formatNum(evaluated);
          return null;
        },
      }, emittedVars);
      if (cssResolved !== null) {
        resolvedValue = cssResolved;
      }
    }
    if (!trusted) {
      try {
        // Only compiler-emitted var() tokens (emittedVars) may pass.
        validateCSSValue(resolvedValue, prop.name, {
          allowVar: emittedVars.length > 0 ? emittedVars : false,
        });
      } catch (e) {
        const eLine = prop.valueLoc?.line ?? prop.loc?.line;
        const eCol = prop.valueLoc?.column ?? prop.loc?.column;
        if (eLine !== undefined) {
          throw new Error(formatError((e as Error).message, eLine, eCol));
        }
        throw e;
      }
    }
    properties[prop.name] = resolvedValue;
  }
  return { type: 'StyleBlockValue', properties };
}

function evaluateIndexExpression(expr: IndexExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);
  const index = evaluateExpression(expr.index, scope);
  const line = getLine(expr);
  const iError = (message: string): Error => new Error(formatError(message, line));

  if (isObjectValue(obj)) {
    if (typeof index !== 'string') throw iError('Object key must be a string');
    return obj.properties.get(index) ?? null;
  }
  if (!isArrayValue(obj)) throw iError('Index access requires an array or object');
  if (typeof index !== 'number') throw iError('Array index must be a number');
  if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length) {
    throw iError(`Array index ${index} out of bounds (length ${obj.elements.length})`);
  }
  return obj.elements[index];
}

interface SamplingCmd {
  command: string;
  args: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function evaluateAnnotatedPathSampling(
  commands: SamplingCmd[],
  expr: MethodCallExpression,
  scope: Scope,
): Value | null {
  switch (expr.method) {
    case 'get': {
      if (expr.args.length !== 1) throw new Error('get() expects 1 argument (t)');
      const t = evaluateExpression(expr.args[0], scope);
      if (typeof t !== 'number') throw new Error('get() argument must be a number');
      if (t < 0 || t > 1) throw new Error(`get() argument must be between 0 and 1, got ${t}`);
      const result = samplePathAtFraction(commands, t);
      return { type: 'ContextObject' as const, value: { x: result.point.x, y: result.point.y } };
    }
    case 'tangent': {
      if (expr.args.length !== 1) throw new Error('tangent() expects 1 argument (t)');
      const t = evaluateExpression(expr.args[0], scope);
      if (typeof t !== 'number') throw new Error('tangent() argument must be a number');
      if (t < 0 || t > 1) throw new Error(`tangent() argument must be between 0 and 1, got ${t}`);
      const result = samplePathAtFraction(commands, t);
      return {
        type: 'ObjectValue' as const,
        properties: new Map<string, Value>([
          [
            'point',
            { type: 'ContextObject' as const, value: { x: result.point.x, y: result.point.y } } as unknown as Value,
          ],
          ['angle', result.tangent],
        ]),
      };
    }
    case 'normal': {
      if (expr.args.length !== 1) throw new Error('normal() expects 1 argument (t)');
      const t = evaluateExpression(expr.args[0], scope);
      if (typeof t !== 'number') throw new Error('normal() argument must be a number');
      if (t < 0 || t > 1) throw new Error(`normal() argument must be between 0 and 1, got ${t}`);
      const result = samplePathAtFraction(commands, t);
      return {
        type: 'ObjectValue' as const,
        properties: new Map<string, Value>([
          [
            'point',
            { type: 'ContextObject' as const, value: { x: result.point.x, y: result.point.y } } as unknown as Value,
          ],
          ['angle', result.tangent - Math.PI / 2],
        ]),
      };
    }
    case 'partition': {
      if (expr.args.length !== 1) throw new Error('partition() expects 1 argument (n)');
      const n = evaluateExpression(expr.args[0], scope);
      if (typeof n !== 'number') throw new Error('partition() argument must be a number');
      if (!Number.isInteger(n) || n < 1) throw new Error('partition() argument must be a positive integer');
      const points = partitionPath(commands, n);
      return {
        type: 'ArrayValue' as const,
        elements: points.map((p, i) => ({
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'ContextObject' as const, value: { x: p.point.x, y: p.point.y } } as unknown as Value],
            ['angle', p.tangent],
            ['t', i / n],
          ]),
        })),
      };
    }
    default:
      return null;
  }
}

function evaluateAnnotatedPathTransforms(
  obj: PathBlockValue | ProjectedPathValue,
  expr: MethodCallExpression,
  scope: Scope,
): Value | null {
  const isBlock = obj.type === 'PathBlockValue';

  switch (expr.method) {
    case 'reverse': {
      if (expr.args.length !== 0) throw new Error('reverse() expects 0 arguments');
      const reversed = reverseCommands(obj.commands);
      if (isBlock) {
        if (reversed.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
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
          records: recordsFromCommands(normalizedCmds),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: lastCmd.end.x, y: lastCmd.end.y },
        };
      }
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
      if (expr.args.length !== 0) throw new Error('boundingBox() expects 0 arguments');
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
      if (expr.args.length !== 1) throw new Error('offset() expects 1 argument (distance)');
      const dist = evaluateExpression(expr.args[0], scope);
      if (typeof dist !== 'number') throw new Error('offset() argument must be a number');
      const offsetResult = offsetCommands(obj.commands, dist);
      if (isBlock) {
        if (offsetResult.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
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
          records: recordsFromCommands(oNormalized),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: oLast.end.x, y: oLast.end.y },
        };
      }
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
      if (expr.args.length !== 1) throw new Error('mirror() expects 1 argument (angle)');
      const mAngle = toNumber(evaluateExpression(expr.args[0], scope));
      if (mAngle === undefined) throw new Error('mirror() argument must be a number');
      if (isBlock) {
        const mirrored = mirrorCommands(obj.commands, mAngle, { x: 0, y: 0 });
        if (mirrored.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
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
          records: recordsFromCommands(mNormalized),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: mLast.end.x, y: mLast.end.y },
        };
      }
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
      if (expr.args.length !== 2) throw new Error('rotateAtVertexIndex() expects 2 arguments (index, angle)');
      const rIdx = evaluateExpression(expr.args[0], scope);
      const rAngle = toNumber(evaluateExpression(expr.args[1], scope));
      if (typeof rIdx !== 'number') throw new Error('rotateAtVertexIndex() index must be a number');
      if (rAngle === undefined) throw new Error('rotateAtVertexIndex() angle must be a number');
      if (!Number.isInteger(rIdx)) throw new Error('rotateAtVertexIndex() index must be an integer');
      if (isBlock) {
        const rotated = rotateAtVertexCommands(obj.commands, rIdx, rAngle);
        if (rotated.length === 0) {
          return {
            type: 'PathBlockValue' as const,
            commands: [],
            records: [],
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
          records: recordsFromCommands(rNormalized),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: rLast.end.x, y: rLast.end.y },
        };
      }
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
      if (expr.args.length !== 2) throw new Error('scale() expects 2 arguments (sx, sy)');
      const sSx = evaluateExpression(expr.args[0], scope);
      const sSy = evaluateExpression(expr.args[1], scope);
      if (typeof sSx !== 'number') throw new Error('scale() sx must be a number');
      if (typeof sSy !== 'number') throw new Error('scale() sy must be a number');
      if (isBlock) {
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
      if (expr.args.length !== 2) throw new Error('subPath() expects 2 arguments (startT, endT)');
      const spStart = evaluateExpression(expr.args[0], scope);
      const spEnd = evaluateExpression(expr.args[1], scope);
      if (typeof spStart !== 'number') throw new Error('subPath() startT must be a number');
      if (typeof spEnd !== 'number') throw new Error('subPath() endT must be a number');
      if (spStart < 0 || spStart > 1) throw new Error('subPath() startT must be between 0 and 1');
      if (spEnd < 0 || spEnd > 1) throw new Error('subPath() endT must be between 0 and 1');
      const subResult = subPathCommands(obj.commands, spStart, spEnd);
      if (isBlock) {
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
      if (expr.args.length < 1 || expr.args.length > 2) throw new Error('chamfer() expects 1-2 arguments');
      const cd1 = evaluateExpression(expr.args[0], scope);
      if (typeof cd1 !== 'number') throw new Error('chamfer() distance must be a number');
      let cd2 = cd1;
      if (expr.args.length === 2) {
        cd2 = evaluateExpression(expr.args[1], scope) as number;
        if (typeof cd2 !== 'number') throw new Error('chamfer() d2 must be a number');
      }
      const chamResult = chamferCommands(obj.commands, cd1, cd2, null);
      return buildAnnotatedResult(chamResult.commands, isBlock, obj);
    }

    case 'chamferAtVertex': {
      if (expr.args.length < 2 || expr.args.length > 3) throw new Error('chamferAtVertex() expects 2-3 arguments');
      const cvIdx = evaluateExpression(expr.args[0], scope);
      if (typeof cvIdx !== 'number' || !Number.isInteger(cvIdx))
        throw new Error('chamferAtVertex() index must be an integer');
      const cvD1 = evaluateExpression(expr.args[1], scope);
      if (typeof cvD1 !== 'number') throw new Error('chamferAtVertex() distance must be a number');
      let cvD2 = cvD1;
      if (expr.args.length === 3) {
        cvD2 = evaluateExpression(expr.args[2], scope) as number;
        if (typeof cvD2 !== 'number') throw new Error('chamferAtVertex() d2 must be a number');
      }
      const cvResult = chamferCommands(obj.commands, cvD1, cvD2, [cvIdx]);
      return buildAnnotatedResult(cvResult.commands, isBlock, obj);
    }

    case 'fillet': {
      if (expr.args.length !== 1) throw new Error('fillet() expects 1 argument (radius)');
      const fRadius = evaluateExpression(expr.args[0], scope);
      if (typeof fRadius !== 'number') throw new Error('fillet() radius must be a number');
      const fResult = filletCommands(obj.commands, fRadius, null);
      return buildAnnotatedResult(fResult.commands, isBlock, obj);
    }

    case 'filletAtVertex': {
      if (expr.args.length !== 2) throw new Error('filletAtVertex() expects 2 arguments (index, radius)');
      const fvIdx = evaluateExpression(expr.args[0], scope);
      if (typeof fvIdx !== 'number' || !Number.isInteger(fvIdx))
        throw new Error('filletAtVertex() index must be an integer');
      const fvRadius = evaluateExpression(expr.args[1], scope);
      if (typeof fvRadius !== 'number') throw new Error('filletAtVertex() radius must be a number');
      const fvResult = filletCommands(obj.commands, fvRadius, [fvIdx]);
      return buildAnnotatedResult(fvResult.commands, isBlock, obj);
    }

    case 'ellipticalFillet': {
      if (expr.args.length < 2 || expr.args.length > 3) throw new Error('ellipticalFillet() expects 2-3 arguments');
      const efRx = evaluateExpression(expr.args[0], scope);
      const efRy = evaluateExpression(expr.args[1], scope);
      if (typeof efRx !== 'number') throw new Error('ellipticalFillet() rx must be a number');
      if (typeof efRy !== 'number') throw new Error('ellipticalFillet() ry must be a number');
      let efRot = 0;
      if (expr.args.length === 3) {
        efRot = toNumber(evaluateExpression(expr.args[2], scope)) as number;
        if (typeof efRot !== 'number') throw new Error('ellipticalFillet() rotation must be a number');
      }
      const efResult = ellipticalFilletCommands(obj.commands, efRx, efRy, efRot, null);
      return buildAnnotatedResult(efResult.commands, isBlock, obj);
    }

    case 'ellipticalFilletAtVertex': {
      if (expr.args.length < 3 || expr.args.length > 4)
        throw new Error('ellipticalFilletAtVertex() expects 3-4 arguments');
      const efvIdx = evaluateExpression(expr.args[0], scope);
      if (typeof efvIdx !== 'number' || !Number.isInteger(efvIdx))
        throw new Error('ellipticalFilletAtVertex() index must be an integer');
      const efvRx = evaluateExpression(expr.args[1], scope);
      const efvRy = evaluateExpression(expr.args[2], scope);
      if (typeof efvRx !== 'number') throw new Error('ellipticalFilletAtVertex() rx must be a number');
      if (typeof efvRy !== 'number') throw new Error('ellipticalFilletAtVertex() ry must be a number');
      let efvRot = 0;
      if (expr.args.length === 4) {
        efvRot = toNumber(evaluateExpression(expr.args[3], scope)) as number;
        if (typeof efvRot !== 'number') throw new Error('ellipticalFilletAtVertex() rotation must be a number');
      }
      const efvResult = ellipticalFilletCommands(obj.commands, efvRx, efvRy, efvRot, [efvIdx]);
      return buildAnnotatedResult(efvResult.commands, isBlock, obj);
    }

    case 'union':
    case 'difference':
    case 'intersection':
    case 'xor': {
      if (expr.args.length !== 1) throw new Error(`${expr.method}() expects 1 argument (other path)`);
      const otherVal = evaluateExpression(expr.args[0], scope);
      let otherCmds: PathBlockCommand[];
      if (isPathBlockValue(otherVal)) {
        otherCmds = otherVal.commands;
      } else if (isProjectedPathValue(otherVal)) {
        otherCmds = otherVal.commands;
      } else {
        throw new Error(`${expr.method}() argument must be a PathBlock or ProjectedPath`);
      }
      let resultCmds: PathBlockCommand[];
      switch (expr.method) {
        case 'union':
          resultCmds = pathUnion(obj.commands, otherCmds);
          break;
        case 'difference':
          resultCmds = pathDifference(obj.commands, otherCmds);
          break;
        case 'intersection':
          resultCmds = pathIntersection(obj.commands, otherCmds);
          break;
        case 'xor':
          resultCmds = pathXor(obj.commands, otherCmds);
          break;
        default:
          resultCmds = [];
      }
      return buildAnnotatedResult(resultCmds, true, obj);
    }

    default:
      return null;
  }
}

/**
 * Build PathBlockValue or ProjectedPathValue from transform result commands.
 */
function buildAnnotatedResult(
  cmds: PathBlockCommand[],
  isBlock: boolean,
  original: PathBlockValue | ProjectedPathValue,
): PathBlockValue | ProjectedPathValue {
  if (cmds.length === 0) {
    if (isBlock) {
      return {
        type: 'PathBlockValue' as const,
        commands: [],
        records: [],
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 },
      };
    }
    return {
      type: 'ProjectedPathValue' as const,
      commands: [],
      startPoint: { ...original.startPoint },
      endPoint: { ...original.startPoint },
    };
  }
  if (isBlock) {
    const originX = cmds[0].start.x;
    const originY = cmds[0].start.y;
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
      records: recordsFromCommands(normalized),
      startPoint: { x: 0, y: 0 },
      endPoint: { x: last.end.x, y: last.end.y },
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

function evaluateMethodCall(expr: MethodCallExpression, scope: Scope, workerExpr?: Expression): Value {
  const obj = evaluateExpression(expr.object, scope);

  const mLine = (expr as { loc?: { line: number } })?.loc?.line;
  const mCol = (expr as { loc?: { column: number } })?.loc?.column;
  function mError(message: string): Error {
    return new Error(formatError(message, mLine, mCol));
  }

  // PathBlockValue methods: draw(), project()
  if (isPathBlockValue(obj)) {
    if (expr.method === 'draw') {
      // In annotated mode, draw() emits relative commands from structured data
      const ctx = scope.evalState?.pathContext;
      const originX = ctx?.position.x ?? 0;
      const originY = ctx?.position.y ?? 0;

      // Emit relative commands (naturally work from cursor position),
      // tracking in the same walk when a context is live.
      const emittedPath = scope.evalState
        ? serializeRelativeAndTrack(obj.commands, scope.evalState.pathContext, { format: annotatedFmt }).d
        : commandsToRelativeD(obj.commands, { format: annotatedFmt });
      if (scope.evalState) {
        updateCtxVariable(scope);
      }

      // Build ProjectedPathValue with absolute coordinates for programmatic use
      const projectedCommands = projectCommands(obj.commands, originX, originY);
      const projected: ProjectedPathValue = {
        type: 'ProjectedPathValue',
        commands: projectedCommands,
        startPoint: { x: obj.startPoint.x + originX, y: obj.startPoint.y + originY },
        endPoint: { x: obj.endPoint.x + originX, y: obj.endPoint.y + originY },
      };

      return {
        type: 'PathWithResult' as const,
        path: emittedPath,
        result: projected as unknown as ContextObject,
      };
    }
    if (expr.method === 'drawTo') {
      if (expr.args.length !== 2) throw new Error('drawTo() expects 2 arguments (x, y)');
      const dtX = evaluateExpression(expr.args[0], scope);
      const dtY = evaluateExpression(expr.args[1], scope);
      if (typeof dtX !== 'number') throw new Error('drawTo() x must be a number');
      if (typeof dtY !== 'number') throw new Error('drawTo() y must be a number');

      const emittedPath = scope.evalState
        ? serializeRelativeAndTrack(obj.commands, scope.evalState.pathContext, {
            format: annotatedFmt,
            moveTo: { x: dtX, y: dtY },
          }).d
        : `M ${annotatedFmt(dtX)} ${annotatedFmt(dtY)} ${commandsToRelativeD(obj.commands, { format: annotatedFmt })}`;
      if (scope.evalState) {
        updateCtxVariable(scope);
      }

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
        result: projected as unknown as ContextObject,
      };
    }
    if (expr.method === 'project') {
      const args = expr.args.map((a) => evaluateExpression(a, scope));
      const x = typeof args[0] === 'number' ? args[0] : 0;
      const y = typeof args[1] === 'number' ? args[1] : 0;
      return {
        type: 'ProjectedPathValue' as const,
        commands: obj.commands.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x + x, y: cmd.start.y + y },
          end: { x: cmd.end.x + x, y: cmd.end.y + y },
        })),
        startPoint: { x: obj.startPoint.x + x, y: obj.startPoint.y + y },
        endPoint: { x: obj.endPoint.x + x, y: obj.endPoint.y + y },
      };
    }
    // Sampling methods: get, tangent, normal, partition
    const pathSamplingResult = evaluateAnnotatedPathSampling(obj.commands, expr, scope);
    if (pathSamplingResult !== null) return pathSamplingResult;
    // Transform methods: reverse, boundingBox, offset
    const pathTransformResult = evaluateAnnotatedPathTransforms(obj, expr, scope);
    if (pathTransformResult !== null) return pathTransformResult;
    if (
      expr.method === 'variableOffset' ||
      expr.method === 'compoundVariableOffset' ||
      expr.method === 'segment' ||
      expr.method === 'segmentAll' ||
      expr.method === 'point' ||
      expr.method === 'pointAll' ||
      expr.method === 'vertex' ||
      expr.method === 'vertexAll'
    ) {
      throw mError(
        `${expr.method}() is not supported in --annotated debug mode yet; compile normally (it works in the CLI, playground, and VS Code preview).`,
      );
    }
    throw mError(`Unknown PathBlock method: ${expr.method}`);
  }

  // ProjectedPathValue methods: drawTo(), get(), tangent(), normal(), partition()
  if (isProjectedPathValue(obj)) {
    if (expr.method === 'drawTo') {
      if (expr.args.length !== 2) throw new Error('drawTo() expects 2 arguments (x, y)');
      const dtX = evaluateExpression(expr.args[0], scope);
      const dtY = evaluateExpression(expr.args[1], scope);
      if (typeof dtX !== 'number') throw new Error('drawTo() x must be a number');
      if (typeof dtY !== 'number') throw new Error('drawTo() y must be a number');

      const offsetX = dtX - obj.startPoint.x;
      const offsetY = dtY - obj.startPoint.y;
      const reProjectedCommands = obj.commands.map((cmd) => ({
        command: cmd.command,
        args: [...cmd.args],
        start: { x: cmd.start.x + offsetX, y: cmd.start.y + offsetY },
        end: { x: cmd.end.x + offsetX, y: cmd.end.y + offsetY },
      }));

      const emittedPath = scope.evalState
        ? serializeRelativeAndTrack(reProjectedCommands, scope.evalState.pathContext, {
            format: annotatedFmt,
            moveTo: { x: dtX, y: dtY },
          }).d
        : `M ${annotatedFmt(dtX)} ${annotatedFmt(dtY)} ${commandsToRelativeD(reProjectedCommands, { format: annotatedFmt })}`;
      if (scope.evalState) {
        updateCtxVariable(scope);
      }

      const projected: ProjectedPathValue = {
        type: 'ProjectedPathValue',
        commands: reProjectedCommands,
        startPoint: { x: dtX, y: dtY },
        endPoint: { x: obj.endPoint.x + offsetX, y: obj.endPoint.y + offsetY },
      };

      return {
        type: 'PathWithResult' as const,
        path: emittedPath,
        result: projected as unknown as ContextObject,
      };
    }
    const pathSamplingResult = evaluateAnnotatedPathSampling(obj.commands, expr, scope);
    if (pathSamplingResult !== null) return pathSamplingResult;
    // Transform methods: reverse, boundingBox, offset
    const pathTransformResult = evaluateAnnotatedPathTransforms(obj, expr, scope);
    if (pathTransformResult !== null) return pathTransformResult;
    throw mError(`Unknown ProjectedPath method: ${expr.method}`);
  }

  // TextBlockValue methods
  if (isTextBlockValue(obj)) {
    switch (expr.method) {
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
        // In annotated mode, no actual layer emit — just return ProjectedTextValue
        if (expr.args.length < 2) throw mError('drawTo() expects at least 2 arguments (x, y)');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + dtX, y: el.y + dtY })),
          styles: { ...obj.styles },
          origin: { x: dtX, y: dtY },
        };
      }
      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles);
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
      case 'polarProject': {
        if (expr.args.length !== 5) throw mError('polarProject() expects 5 arguments');
        const ppx = evaluateExpression(expr.args[0], scope);
        const ppy = evaluateExpression(expr.args[1], scope);
        const ppAngle = toNumber(evaluateExpression(expr.args[2], scope));
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (
          typeof ppx !== 'number' ||
          typeof ppy !== 'number' ||
          ppAngle === undefined ||
          typeof ppDist !== 'number'
        ) {
          throw mError('polarProject() numeric arguments must be numbers');
        }
        if (typeof ppAnchor !== 'string') throw mError('polarProject() anchor must be a string');
        const targetX = ppx + ppDist * Math.cos(ppAngle);
        const targetY = ppy + ppDist * Math.sin(ppAngle);
        // Simplified: project to target without anchor resolution (annotated mode is minimal)
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + targetX, y: el.y + targetY })),
          styles: { ...obj.styles },
          origin: { x: targetX, y: targetY },
        };
      }
      case 'toPathBlock': {
        // In annotated mode, return an empty PathBlock (no font registry available)
        return {
          type: 'PathBlockValue' as const,
          commands: [],
          records: [],
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 0, y: 0 },
        };
      }
      case 'toCodeSnippetBlock': {
        // In annotated mode, return a dummy LayerReference
        return { type: 'LayerReference' } as Value;
      }
      default:
        throw mError(`Unknown TextBlock method: ${expr.method}`);
    }
  }

  // ProjectedTextValue methods
  if (isProjectedTextValue(obj)) {
    switch (expr.method) {
      case 'draw': {
        // In annotated mode, no actual layer emit — just return the projected value
        return obj;
      }
      case 'drawTo': {
        if (expr.args.length < 2) throw mError('drawTo() expects at least 2 arguments (x, y)');
        const dtX = evaluateExpression(expr.args[0], scope);
        const dtY = evaluateExpression(expr.args[1], scope);
        if (typeof dtX !== 'number') throw mError('drawTo() x must be a number');
        if (typeof dtY !== 'number') throw mError('drawTo() y must be a number');
        const offsetX = dtX - obj.origin.x;
        const offsetY = dtY - obj.origin.y;
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + offsetX, y: el.y + offsetY })),
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
      case 'boundingBox': {
        if (expr.args.length !== 0) throw mError('boundingBox() expects 0 arguments');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles);
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
      case 'anchor': {
        if (expr.args.length !== 1) throw mError('anchor() expects 1 argument');
        // In annotated mode, return a dummy point
        evaluateExpression(expr.args[0], scope);
        return { type: 'ContextObject' as const, value: { x: obj.origin.x, y: obj.origin.y } };
      }
      case 'polarProject': {
        if (expr.args.length !== 5) throw mError('polarProject() expects 5 arguments');
        const ppx = evaluateExpression(expr.args[0], scope);
        const ppy = evaluateExpression(expr.args[1], scope);
        const ppAngle = toNumber(evaluateExpression(expr.args[2], scope));
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (
          typeof ppx !== 'number' ||
          typeof ppy !== 'number' ||
          ppAngle === undefined ||
          typeof ppDist !== 'number'
        ) {
          throw mError('polarProject() numeric arguments must be numbers');
        }
        if (typeof ppAnchor !== 'string') throw mError('polarProject() anchor must be a string');
        const targetX = ppx + ppDist * Math.cos(ppAngle);
        const targetY = ppy + ppDist * Math.sin(ppAngle);
        return {
          type: 'ProjectedTextValue' as const,
          elements: obj.elements.map((el) => ({ ...el, x: el.x + targetX, y: el.y + targetY })),
          styles: { ...obj.styles },
          origin: { x: targetX, y: targetY },
        };
      }
      case 'intersects': {
        // Evaluate argument but return false in annotated mode (minimal)
        if (expr.args.length !== 1) throw mError('intersects() expects 1 argument');
        evaluateExpression(expr.args[0], scope);
        return boolVal(false);
      }
      case 'intersectionPoints': {
        if (expr.args.length !== 1) throw mError('intersectionPoints() expects 1 argument');
        evaluateExpression(expr.args[0], scope);
        return { type: 'ArrayValue' as const, elements: [] };
      }
      case 'paddedBoundingBox': {
        if (expr.args.length !== 2) throw mError('paddedBoundingBox() expects 2 arguments (blockPad, inlinePad)');
        const blockPad = evaluateExpression(expr.args[0], scope);
        const inlinePad = evaluateExpression(expr.args[1], scope);
        if (typeof blockPad !== 'number') throw mError('paddedBoundingBox() blockPad must be a number');
        if (typeof inlinePad !== 'number') throw mError('paddedBoundingBox() inlinePad must be a number');
        const bb = estimateTextBoundingBox(obj.elements, obj.styles);
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
      default:
        throw mError(`Unknown ProjectedText method: ${expr.method}`);
    }
  }

  // PatternValue methods
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
          commands = pathArg.commands.map((cmd) => ({
            command: cmd.command,
            args: [...cmd.args],
            start: { x: cmd.start.x, y: cmd.start.y },
            end: { x: cmd.end.x, y: cmd.end.y },
          }));
        } else {
          throw mError('Mask.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commands.map((c) => commandToPathString(c)).join(' ');
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
          commands = pathArg.commands.map((cmd) => ({
            command: cmd.command,
            args: [...cmd.args],
            start: { x: cmd.start.x, y: cmd.start.y },
            end: { x: cmd.end.x, y: cmd.end.y },
          }));
        } else {
          throw mError('ClipPath.append() argument must be a PathBlock or ProjectedPath');
        }
        const d = commands.map((c) => commandToPathString(c)).join(' ');
        obj.paths.push(d);
        return 0;
      }
      default:
        throw mError(`Unknown ClipPath method: ${expr.method}`);
    }
  }

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
          commands = pathArg.commands.map((cmd) => ({
            command: cmd.command,
            args: [...cmd.args],
            start: { x: cmd.start.x, y: cmd.start.y },
            end: { x: cmd.end.x, y: cmd.end.y },
          }));
        } else {
          throw mError('Pattern.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commands.map((c) => commandToPathString(c)).join(' ');
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
          commands = pathArg.commands.map((cmd) => ({
            command: cmd.command,
            args: [...cmd.args],
            start: { x: cmd.start.x, y: cmd.start.y },
            end: { x: cmd.end.x, y: cmd.end.y },
          }));
        } else {
          throw mError('Marker.append() first argument must be a PathBlock or ProjectedPath');
        }
        const d = commands.map((c) => commandToPathString(c)).join(' ');
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
        for (let r = 0; r < obj.rows; r++) {
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], r);
            if (params.length > 1) setVariable(blockScope, params[1], c);
            if (params.length > 2) {
              setVariable(blockScope, params[2], {
                type: 'PointValue' as const,
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              });
            }
            try {
              for (const stmt of cb.body) {
                evaluateStatementPlain(stmt, blockScope);
              }
              obj.cells[r][c] = null;
            } catch (e) {
              if (e instanceof ReturnSignal) {
                obj.cells[r][c] = e.value;
              } else {
                throw e;
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
        for (let r = 0; r < obj.rows; r++) {
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], obj.cells[r][c]);
            if (params.length > 1) setVariable(blockScope, params[1], r);
            if (params.length > 2) setVariable(blockScope, params[2], c);
            if (params.length > 3) {
              setVariable(blockScope, params[3], {
                type: 'PointValue' as const,
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              });
            }
            try {
              for (const stmt of cb.body) {
                evaluateStatementPlain(stmt, blockScope);
              }
            } catch (e) {
              if (e instanceof ReturnSignal) {
                // ignore
              } else {
                throw e;
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
        const newCells: Value[][] = [];
        for (let r = 0; r < obj.rows; r++) {
          const row: Value[] = [];
          for (let c = 0; c < obj.cols; c++) {
            const blockScope = createScope(cb.closure ?? scope);
            if (params.length > 0) setVariable(blockScope, params[0], obj.cells[r][c]);
            if (params.length > 1) setVariable(blockScope, params[1], r);
            if (params.length > 2) setVariable(blockScope, params[2], c);
            if (params.length > 3) {
              setVariable(blockScope, params[3], {
                type: 'PointValue' as const,
                x: obj.origin.x + (c + 0.5) * obj.xDim,
                y: obj.origin.y + (r + 0.5) * obj.yDim,
              });
            }
            let cellResult: Value = null;
            try {
              for (const stmt of cb.body) {
                evaluateStatementPlain(stmt, blockScope);
              }
            } catch (e) {
              if (e instanceof ReturnSignal) {
                cellResult = e.value;
              } else {
                throw e;
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
        if (typeof x !== 'number' || typeof y !== 'number')
          throw mError('Grid.sampleNearest() arguments must be numbers');
        return annGridSampleNearest(obj, x, y);
      }
      case 'sampleBilinear': {
        if (expr.args.length !== 2) throw mError('Grid.sampleBilinear() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number' || typeof y !== 'number')
          throw mError('Grid.sampleBilinear() arguments must be numbers');
        return annGridSampleBilinear(obj, x, y, mError);
      }
      case 'sample': {
        if (expr.args.length !== 2) throw mError('Grid.sample() expects 2 arguments (x, y)');
        const x = evaluateExpression(expr.args[0], scope);
        const y = evaluateExpression(expr.args[1], scope);
        if (typeof x !== 'number' || typeof y !== 'number') throw mError('Grid.sample() arguments must be numbers');
        if (obj.interpolation === 'bilinear') return annGridSampleBilinear(obj, x, y, mError);
        return annGridSampleNearest(obj, x, y);
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
          obj.stops.push({ offset, color: oklchToCSS(color.oklch) });
        }
        return 0;
      }
      case 'inherit': {
        if (expr.args.length !== 1) throw mError('Gradient.inherit() expects 1 argument (newId)');
        const newId = evaluateExpression(expr.args[0], scope);
        if (typeof newId !== 'string') throw mError('Gradient.inherit() argument must be a string');
        return {
          type: 'GradientValue' as const,
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
        };
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
        if (row < 0 || row >= grid.length)
          throw mError(`getRow(${row}) out of bounds for grid with ${grid.length} rows`);
        return { type: 'ArrayValue' as const, elements: [...grid[row]] };
      }
      case 'getCol': {
        if (obj.gradientType !== 'mesh') throw mError('getCol() is only available on MeshGradient');
        if (expr.args.length !== 1) throw mError('getCol() expects 1 argument (col)');
        const col = evaluateExpression(expr.args[0], scope);
        if (typeof col !== 'number') throw mError('getCol() argument must be a number');
        const grid = obj.meshGrid!;
        if (col < 0 || col >= grid[0].length)
          throw mError(`getCol(${col}) out of bounds for grid with ${grid[0].length} columns`);
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
        obj.freeformPoints!.push({ x, y, color: { ...color.oklch }, colorCSS: oklchToCSS(color.oklch) });
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
        const cmds = pathVal.commands;
        if (cmds.length === 0 || cmds[cmds.length - 1].command !== 'z')
          throw mError('.contour() path must be closed (end with closePath())');
        const dString = cmds.map((c) => commandToPathString(c)).join(' ');
        obj.topoContours!.push({
          elevation,
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

  // Angle methods (.toDeg/.toRad/.toPi/.toTurns — display re-tagging, parity)
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

  // ObjectNamespace methods
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
        if (
          typeof stylesArg !== 'object' ||
          stylesArg === null ||
          !('type' in stylesArg) ||
          stylesArg.type !== 'StyleBlockValue'
        ) {
          throw mError('PathBlock.fromGlyph() second argument must be a style block');
        }
        const styles = stylesArg.properties;
        const fontFamily = styles['font-family']
          ?.split(',')[0]
          ?.trim()
          ?.replace(/^['"]|['"]$/g, '');
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

        const glyphs: Value[] = [];
        for (const char of textArg) {
          const lookup = lookupGlyph(registry, fontFamily, fontWeight, 'normal', char, fontSize)!;
          const { commands, advanceWidth } = lookup;
          // Recorded for parity with the main evaluator, but currently inert:
          // compileAnnotated() returns only the formatted line output and has
          // no logs/missingGlyphs channel to surface these through.
          if (lookup.missing && scope.evalState) {
            recordMissingGlyph(scope.evalState, fontFamily, fontWeight, char);
          }
          if (commands.length === 0) {
            const pb: PathBlockValue = {
              type: 'PathBlockValue' as const,
              commands: [],
              records: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
            (pb as PathBlockValue & { advanceWidth: number; char: string }).advanceWidth = advanceWidth;
            (pb as PathBlockValue & { advanceWidth: number; char: string }).char = char;
            glyphs.push(pb);
            continue;
          }
          const normalized = buildPathBlockFromCommands(commands, { x: 0, y: 0 });
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

  // SVGFragmentValue methods
  if (isSVGFragmentValue(obj)) {
    if (expr.method === 'insert') {
      if (expr.args.length !== 0) throw mError('insert() expects 0 arguments');
      return 0; // No-op in annotated mode
    }
    throw mError(`Unknown SVGDocumentFragment method: ${expr.method}`);
  }

  // ObjectValue methods
  if (isObjectValue(obj)) {
    if (expr.method === 'has') {
      if (expr.args.length !== 1) throw mError('has() expects 1 argument');
      const key = evaluateExpression(expr.args[0], scope);
      if (typeof key !== 'string') throw mError('has() argument must be a string');
      return obj.properties.has(key) ? 1 : 0;
    }
    throw mError(`Unknown object method: ${expr.method}`);
  }

  if (!isArrayValue(obj)) throw mError(`Cannot call method '${expr.method}' on non-array value`);
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
      return obj.elements.length === 0 ? 1 : 0;
    }
    case 'map': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb) throw mError('map() requires a trailing block or a << worker: array.map {|item| return ...; } or array.map() << f');
      if (cb.extraArgs !== 0) throw mError('map() takes no arguments besides the callback');
      const result: Value[] = [];
      const mapParams = cb.params;
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(cb.closure ?? scope);
        setVariable(blockScope, mapParams[0], obj.elements[i]);
        if (mapParams.length > 1) setVariable(blockScope, mapParams[1], i);
        if (mapParams.length > 2) setVariable(blockScope, mapParams[2], obj);
        try {
          for (const stmt of cb.body) {
            evaluateStatementPlain(stmt, blockScope);
          }
          result.push(null);
        } catch (e) {
          if (e instanceof ReturnSignal) {
            result.push(e.value);
          } else {
            throw e;
          }
        }
      }
      return { type: 'ArrayValue' as const, elements: result };
    }
    case 'reduce': {
      const cb = resolveCallbackBlock(expr, scope, workerExpr);
      if (!cb)
        throw mError('reduce() requires a trailing block or a << worker: array.reduce(init) {|acc, item| return acc; } or array.reduce(init) << f');
      if (cb.extraArgs !== 1) throw mError('reduce() expects 1 argument (initial value) plus the callback');
      let accumulator: Value = cb.leadingArgs[0];
      const reduceParams = cb.params;
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(cb.closure ?? scope);
        setVariable(blockScope, reduceParams[0], accumulator);
        if (reduceParams.length > 1) setVariable(blockScope, reduceParams[1], obj.elements[i]);
        if (reduceParams.length > 2) setVariable(blockScope, reduceParams[2], i);
        if (reduceParams.length > 3) setVariable(blockScope, reduceParams[3], obj);
        try {
          for (const stmt of cb.body) {
            evaluateStatementPlain(stmt, blockScope);
          }
          accumulator = null;
        } catch (e) {
          if (e instanceof ReturnSignal) {
            accumulator = e.value;
          } else {
            throw e;
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
    case 'reverse': {
      if (expr.args.length !== 0) throw mError('reverse() expects 0 arguments');
      if (expr.block) throw mError('reverse() does not take a trailing block');
      return { type: 'ArrayValue' as const, elements: [...obj.elements].reverse() };
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
      sorted.sort((a, b) => {
        const blockScope = createScope(cb.closure ?? scope);
        if (sortParams.length > 0) setVariable(blockScope, sortParams[0], a);
        if (sortParams.length > 1) setVariable(blockScope, sortParams[1], b);
        let cmp: Value = null;
        try {
          const res = evaluateBlockBodyPlain(sortBody, blockScope);
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
      return { type: 'ArrayValue' as const, elements: sorted };
    }
    default:
      throw mError(`Unknown array method: ${expr.method}`);
  }
}

/**
 * Fast-path evaluation of a trailing-block body (mirrors the main evaluator's
 * evaluateGridCellBody): a top-level `return` short-circuits WITHOUT throwing,
 * avoiding the per-invocation ReturnSignal throw/catch cost. Nested returns
 * (inside if/for) still throw and are caught by the caller.
 */
function evaluateBlockBodyPlain(body: Statement[], scope: Scope): { returned: boolean; value: Value } {
  for (const stmt of body) {
    if (stmt.type === 'ReturnStatement') {
      return { returned: true, value: evaluateExpression(stmt.value, scope) };
    }
    evaluateStatementPlain(stmt, scope);
    // Callback bodies are break/continue boundaries (builder-enforced; defensive)
    consumePendingFlowAtBoundary();
  }
  return { returned: false, value: null };
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  const line = (expr as { loc?: { line: number } }).loc?.line;

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
          throw new Error(`Invalid hex color: '${raw}' (must be 3, 4, 6, or 8 hex digits)`);
        }
      }
      return { type: 'ColorValue' as const, oklch: parseColor(raw) };
    }

    case 'NullLiteral':
      return null;

    case 'BooleanLiteral':
      return boolVal(expr.value);

    case 'Identifier': {
      const idLoc = (expr as { loc?: { line: number; column: number } }).loc;
      return lookupVariable(scope, expr.name, idLoc?.line, idLoc?.column);
    }

    case 'LambdaExpression':
      // Mirrors evaluator/index.ts: capture the live definition scope.
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
          if (!isArrayValue(val))
            throw new Error(formatError('Spread argument must be an array', getLine(el.argument)));
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
          if (!isObjectValue(val))
            throw new Error(formatError('Spread argument must be an object', getLine(prop.argument)));
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

      // << worker application (mirror of evaluator/index.ts): a callback
      // builtin written WITHOUT a trailing block takes its callback from the
      // right operand. Must run before eager operand evaluation — the bare
      // builtin call is not a complete expression on its own.
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

      // << operator: PathBlock concatenation or style block merge
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
          return {
            type: 'TextBlockValue' as const,
            elements: left.elements,
            styles: { ...left.styles, ...right.properties },
          };
        }
        if (isProjectedTextValue(left) && isStyleBlock(right)) {
          return {
            type: 'ProjectedTextValue' as const,
            elements: left.elements,
            styles: { ...left.styles, ...right.properties },
            origin: left.origin,
          };
        }
        if (isStyleBlock(left) && isStyleBlock(right)) {
          return { type: 'StyleBlockValue', properties: { ...left.properties, ...right.properties } };
        }
        if (isAnnotatedLayerRef(left) && isStyleBlock(right)) {
          return left; // Return same ref, no real layer state in annotated mode
        }
        if (isObjectValue(left) && isObjectValue(right)) {
          // Parity with evaluator/index.ts object merge
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
              line,
            ),
          );
        }
        throw new Error(
          formatError(
            'Operator << requires matching operand types (both objects, both style blocks, both path blocks, or text block << style block)',
            line,
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

      // String/BooleanValue equality
      if (expr.operator === '==' || expr.operator === '!=') {
        const ls = typeof left === 'string' ? left : isBooleanValue(left) ? (left.value ? 'true' : 'false') : undefined;
        const rs =
          typeof right === 'string' ? right : isBooleanValue(right) ? (right.value ? 'true' : 'false') : undefined;
        if (ls !== undefined && rs !== undefined) {
          if (expr.operator === '==') return boolVal(ls === rs);
          return boolVal(ls !== rs);
        }
      }

      // Null in arithmetic
      if (left === null || right === null) {
        throw new Error(formatError('Cannot use null in arithmetic expression', line));
      }

      const leftNum = toNumber(left);
      const rightNum = toNumber(right);

      if (leftNum === undefined || rightNum === undefined) {
        throw new Error(formatError(`Binary operator ${expr.operator} requires numeric operands`, line));
      }

      // Angle propagation (parity with index.ts): an angle stays an angle
      // through +/-, scaling, and division by a plain number.
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
        throw new Error(formatError('Cannot use null in arithmetic expression', line));
      }
      const argNum = toNumber(arg);
      if (argNum === undefined) {
        throw new Error(formatError(`Unary operator ${expr.operator} requires numeric operand`, line));
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
      return evaluateFunctionCall(expr, scope, null); // No context for nested calls

    case 'StringLiteral':
      return expr.value;

    case 'MemberExpression':
      return evaluateMemberExpression(expr, scope);

    case 'TemplateLiteral':
      return expr.parts
        .map((part) => {
          if (typeof part === 'string') return part;
          const val = evaluateExpression(part, scope);
          if (val === null) return 'null';
          if (isBooleanValue(val)) return val.value ? 'true' : 'false';
          if (isAngleValue(val)) return formatAngleForDisplay(val);
          if (typeof val === 'number') return String(val);
          if (typeof val === 'string') return val;
          if (isObjectValue(val)) {
            const entries = Array.from(val.properties.entries()).map(
              ([k, v]) => `${k}: ${v === null ? 'null' : isAngleValue(v) ? formatAngleForDisplay(v) : String(v)}`,
            );
            return `{${entries.join(', ')}}`;
          }
          if (isArrayValue(val))
            return `[${val.elements
              .map((e) => {
                if (e === null) return 'null';
                if (isAngleValue(e)) return formatAngleForDisplay(e);
                if (typeof e === 'number') return String(e);
                if (typeof e === 'string') return e;
                return String(e);
              })
              .join(', ')}]`;
          if (isTextBlockValue(val)) return `TextBlock(${val.elements.length} elements)`;
          if (isProjectedTextValue(val))
            return `ProjectedText(${val.origin.x}, ${val.origin.y}, ${val.elements.length} elements)`;
          return String(val);
        })
        .join('');

    case 'StyleBlockLiteral':
      return evaluateStyleBlockLiteral(expr, scope);

    case 'PathBlockExpression':
      return evaluatePathBlockExpression(expr, scope);

    case 'TextBlockExpression':
      return evaluateTextBlockExpression(expr, scope);

    case 'LayerConstructorExpression':
      // In annotated mode, return a dummy LayerReference
      return { type: 'LayerReference' } as AnnotatedLayerRef;

    default:
      throw new Error(formatError(`Unknown expression type: ${(expr as Expression).type}`, line));
  }
}

/**
 * Evaluate a PathBlockExpression in annotated mode
 */
function evaluatePathBlockExpression(expr: PathBlockExpression, scope: Scope): PathBlockValue {
  // Create an isolated PathContext at origin (0, 0) with history tracking
  const blockContext = createPathContext({ trackHistory: true });

  // Create a child scope for the block body
  const blockScope = createScope(scope);
  const blockEvalState: EvaluationState & { _insidePathBlock: boolean } = {
    pathContext: blockContext,
    _insidePathBlock: true,
  };
  blockScope.evalState = blockEvalState;

  blockScope.variables.set('ctx', {
    type: 'ContextObject' as const,
    value: contextToObject(blockContext),
  });

  for (const stmt of expr.body) {
    if (stmt.type === 'LayerDefinition' || stmt.type === 'LayerApplyBlock' || stmt.type === 'TextStatement' || stmt.type === 'ViewBoxDefinition') {
      continue; // silently skip in annotated mode
    }
    if (stmt.type === 'PathCommand' && stmt.command !== '' && stmt.command !== stmt.command.toLowerCase()) {
      continue; // skip absolute commands in annotated mode
    }
    evaluateStatementPlain(stmt, blockScope);
  }

  const commands: PathBlockCommand[] = blockContext.commands.map((entry) => ({
    command: entry.command.toLowerCase(),
    args: [...entry.args],
    start: { x: entry.start.x, y: entry.start.y },
    end: { x: entry.end.x, y: entry.end.y },
  }));

  return {
    type: 'PathBlockValue',
    commands,
    records: recordsFromCommands(commands),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: blockContext.position.x, y: blockContext.position.y },
  };
}

/**
 * Evaluate a TextBlockExpression in annotated mode — minimal state, silent skip for forbidden constructs
 */
function evaluateTextBlockExpression(expr: TextBlockExpression, scope: Scope): TextBlockValue {
  // Create a child scope with _insideTextBlock flag
  const blockScope = createScope(scope);
  const blockEvalState = {
    ...(scope.evalState || { pathContext: createPathContext() }),
    _insideTextBlock: true,
  };
  blockScope.evalState = blockEvalState as EvaluationState;

  const elements: TextBlockElement[] = [];
  const blockStyles: Record<string, string> = {};

  for (const stmt of expr.body) {
    // Silently skip forbidden constructs (annotated mode pattern)
    if (stmt.type === 'LayerDefinition' || stmt.type === 'LayerApplyBlock' || stmt.type === 'PathCommand' || stmt.type === 'ViewBoxDefinition') {
      continue;
    }

    // TextStatement: accumulate elements
    if (stmt.type === 'TextStatement') {
      const x = evaluateExpression(stmt.x, blockScope);
      const y = evaluateExpression(stmt.y, blockScope);
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const rotation = stmt.rotation ? (toNumber(evaluateExpression(stmt.rotation, blockScope)) as number) : undefined;
      let textStyles: Record<string, string> | undefined;
      if (stmt.styles) {
        const sv = evaluateExpression(stmt.styles, blockScope);
        if (isStyleBlock(sv)) textStyles = sv.properties;
      }

      if (stmt.content) {
        const text = evaluateAnnotatedTemplateLiteral(stmt.content, blockScope);
        elements.push({ x, y, rotation, styles: textStyles, children: [{ type: 'run', text }] });
      } else if (stmt.body) {
        const children: TextChild[] = [];
        evaluateAnnotatedTextBody(stmt.body, blockScope, children);
        // Text-block top level is a break/continue boundary (builder-enforced; defensive)
        consumePendingFlowAtBoundary();
        elements.push({ x, y, rotation, styles: textStyles, children });
      }
      continue;
    }

    // Other statements (let, for, if, expression) for control flow
    evaluateStatementPlain(stmt, blockScope);
  }

  return {
    type: 'TextBlockValue',
    elements,
    styles: blockStyles,
  };
}

/**
 * Evaluate a TemplateLiteral to string in annotated mode
 */
function evaluateAnnotatedTemplateLiteral(tl: TemplateLiteral, scope: Scope): string {
  return tl.parts
    .map((part) => {
      if (typeof part === 'string') return part;
      const val = evaluateExpression(part, scope);
      if (val === null) return 'null';
      if (isBooleanValue(val)) return val.value ? 'true' : 'false';
      if (isAngleValue(val)) return formatAngleForDisplay(val);
      if (typeof val === 'number') return String(val);
      if (typeof val === 'string') return val;
      if (isTextBlockValue(val)) return `TextBlock(${val.elements.length} elements)`;
      if (isProjectedTextValue(val))
        return `ProjectedText(${val.origin.x}, ${val.origin.y}, ${val.elements.length} elements)`;
      return String(val);
    })
    .join('');
}

/**
 * Evaluate text body items (TemplateLiteral, TspanStatement, loops, etc.) in annotated mode
 */
function evaluateAnnotatedTextBody(items: TextBodyItem[], scope: Scope, children: TextChild[]): void {
  for (const item of items) {
    if (pendingFlow) return; // stop this body; the enclosing loop consumes the flag
    if (item.type === 'BreakStatement') {
      pendingFlow = 'break';
      return;
    } else if (item.type === 'ContinueStatement') {
      pendingFlow = 'continue';
      return;
    } else if (item.type === 'TemplateLiteral') {
      const text = evaluateAnnotatedTemplateLiteral(item, scope);
      children.push({ type: 'run', text });
    } else if (item.type === 'TspanStatement') {
      const text = evaluateAnnotatedTemplateLiteral(item.content, scope);
      const dx = item.dx ? (evaluateExpression(item.dx, scope) as number) : undefined;
      const dy = item.dy ? (evaluateExpression(item.dy, scope) as number) : undefined;
      const rot = item.rotation ? (toNumber(evaluateExpression(item.rotation, scope)) as number) : undefined;
      let tspanStyles: Record<string, string> | undefined;
      if (item.styles) {
        const sv = evaluateExpression(item.styles, scope);
        if (isStyleBlock(sv)) tspanStyles = sv.properties;
      }
      children.push({ type: 'tspan', text, dx, dy, rotation: rot, styles: tspanStyles });
    } else if (item.type === 'ForLoop') {
      const start = evaluateExpression(item.start, scope);
      const end = evaluateExpression(item.end, scope);
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      const ascending = start <= end;
      if (ascending) {
        for (let i = start; i <= end; i++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          evaluateAnnotatedTextBody(item.body as TextBodyItem[], loopScope, children);
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          evaluateAnnotatedTextBody(item.body as TextBodyItem[], loopScope, children);
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
      }
    } else if (item.type === 'ForEachLoop') {
      const arr = evaluateExpression(item.iterable, scope);
      if (isArrayValue(arr)) {
        for (let idx = 0; idx < arr.elements.length; idx++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, arr.elements[idx]);
          if (item.indexVariable) setVariable(loopScope, item.indexVariable, idx);
          evaluateAnnotatedTextBody(item.body as TextBodyItem[], loopScope, children);
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
      }
    } else if (item.type === 'IfStatement') {
      const condition = evaluateExpression(item.condition, scope);
      const condNum = toNumber(condition);
      const isTruthy = condition !== null && (condNum !== undefined ? condNum !== 0 : Boolean(condition));
      if (isTruthy) {
        evaluateAnnotatedTextBody(item.consequent as TextBodyItem[], scope, children);
      } else if (item.alternate) {
        evaluateAnnotatedTextBody(item.alternate as TextBodyItem[], scope, children);
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
}

function evaluateMemberExpression(expr: MemberExpression, scope: Scope): Value {
  const line = (expr as { loc?: { line: number } }).loc?.line;
  const obj = evaluateExpression(expr.object, scope);

  // Data properties of built-in structs (Point, PolarVector, Grid, MeshPoint,
  // Color, context objects) resolve through the shared registry, which is also
  // what object destructuring reads.
  const struct = getStructDescriptor(obj);
  if (struct) {
    if (struct.has(obj, expr.property)) return struct.get(obj, expr.property) as Value;
    throw new Error(formatError(`Property '${expr.property}' does not exist on ${struct.name}`, line));
  }

  // Handle PathBlockValue property access
  if (isPathBlockValue(obj)) {
    switch (expr.property) {
      case 'length': {
        let total = 0;
        for (const cmd of obj.commands) {
          const dx = cmd.end.x - cmd.start.x;
          const dy = cmd.end.y - cmd.start.y;
          if (cmd.command.toUpperCase() !== 'M') {
            total += Math.sqrt(dx * dx + dy * dy);
          }
        }
        return total;
      }
      case 'startPoint':
        return { type: 'ContextObject' as const, value: { x: obj.startPoint.x, y: obj.startPoint.y } };
      case 'endPoint':
        return { type: 'ContextObject' as const, value: { x: obj.endPoint.x, y: obj.endPoint.y } };
      case 'subPathCount': {
        if (obj.commands.length === 0) return 0;
        let count = 1;
        for (let i = 1; i < obj.commands.length; i++) {
          if (obj.commands[i].command === 'm') count++;
        }
        return count;
      }
      case 'vertices':
        return { type: 'ArrayValue' as const, elements: [] };
      case 'subPathCommands':
        return { type: 'ArrayValue' as const, elements: [] };
      case 'advanceWidth': {
        const aw = (obj as PathBlockValue & { advanceWidth?: number }).advanceWidth;
        return aw !== undefined ? aw : 0;
      }
      case 'anchor':
        // variableOffset/compoundVariableOffset (the only anchor producers) are
        // unsupported in --annotated mode, so anchor can never be present here.
        throw new Error(
          formatError(
            "'anchor' is only available on variableOffset/compoundVariableOffset results, which are not supported in --annotated debug mode yet",
            line,
          ),
        );
      case 'contours': {
        const contourGroups = splitContours(obj.commands);
        const contourBlocks: Value[] = contourGroups.map((cmds) => buildPathBlockFromCommands(cmds, { x: 0, y: 0 }));
        return { type: 'ArrayValue' as const, elements: contourBlocks };
      }
      case 'isEmpty':
        return boolVal(obj.commands.length === 0);
      case 'char': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            formatError(
              "'char' is only available on glyphs produced by PathBlock.fromGlyph() — it records the source character. Composing or transforming a glyph produces a new block without it",
              line,
            ),
          );
        return char;
      }
      case 'isWhitespace': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            formatError(
              "'isWhitespace' is only available on glyphs produced by PathBlock.fromGlyph() — it classifies the source character. Use 'isEmpty' to test whether any PathBlock has no commands",
              line,
            ),
          );
        return boolVal(isWhitespaceChar(char));
      }
      case 'codePoint': {
        const char = (obj as PathBlockValue & { char?: string }).char;
        if (char === undefined)
          throw new Error(
            formatError(
              "'codePoint' is only available on glyphs produced by PathBlock.fromGlyph() — it reports the source character's Unicode code point. Composing or transforming a glyph produces a new block without it",
              line,
            ),
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
            formatError(
              `'${expr.property}' is only available on glyphs produced by PathBlock.fromGlyph() — it classifies the source character. Use 'isEmpty' to test whether any PathBlock has no commands`,
              line,
            ),
          );
        return boolVal(CHAR_CLASS_PREDICATES[expr.property](char));
      }
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on PathBlock`, line));
    }
  }

  // Handle ProjectedPathValue property access
  if (isProjectedPathValue(obj)) {
    switch (expr.property) {
      case 'startPoint':
        return { type: 'ContextObject' as const, value: { x: obj.startPoint.x, y: obj.startPoint.y } };
      case 'endPoint':
        return { type: 'ContextObject' as const, value: { x: obj.endPoint.x, y: obj.endPoint.y } };
      case 'length': {
        let total = 0;
        for (const cmd of obj.commands) {
          const dx = cmd.end.x - cmd.start.x;
          const dy = cmd.end.y - cmd.start.y;
          if (cmd.command.toUpperCase() !== 'M') {
            total += Math.sqrt(dx * dx + dy * dy);
          }
        }
        return total;
      }
      case 'vertices':
        return { type: 'ArrayValue' as const, elements: [] };
      case 'subPathCommands':
        return { type: 'ArrayValue' as const, elements: [] };
      case 'isEmpty':
        return boolVal(obj.commands.length === 0);
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on ProjectedPath`, line));
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
        throw new Error(formatError(`Property '${expr.property}' does not exist on TextBlock`, line));
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
        return { type: 'ContextObject' as const, value: { x: obj.origin.x, y: obj.origin.y } };
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on ProjectedText`, line));
    }
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
        throw new Error(formatError(`Property '${expr.property}' does not exist on Pattern`, line));
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
        return obj.refX;
      case 'refY':
        return obj.refY;
      case 'markerUnits':
        return obj.markerUnits;
      case 'orient':
        return obj.orient;
      case 'preserveAspectRatio':
        return obj.preserveAspectRatio;
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on Marker`, line));
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
        throw new Error(formatError(`Property 'width' does not exist on ${obj.gradientType} gradient`, line));
      }
      case 'height': {
        if (obj.gradientType === 'mesh') return obj.meshHeight!;
        if (obj.gradientType === 'freeform') return obj.freeformHeight!;
        if (obj.gradientType === 'topo') return obj.topoHeight!;
        throw new Error(formatError(`Property 'height' does not exist on ${obj.gradientType} gradient`, line));
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
          return { type: 'ColorValue' as const, oklch: { ...obj.topoBaseColor } };
        }
        return null;
      }
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on Gradient`, line));
    }
  }

  // Handle MaskValue property access
  if (isMaskValue(obj)) {
    if (expr.property === 'id') return obj.id;
    throw new Error(formatError(`Property '${expr.property}' does not exist on Mask`, line));
  }

  // Handle FilterValue property access (annotated stub tracks only id)
  if (isFilterValue(obj)) {
    if (expr.property === 'id') return obj.id;
    throw new Error(formatError(`Property '${expr.property}' does not exist on Filter in annotated mode`, line));
  }

  // Handle ClipPathValue property access
  if (isClipPathValue(obj)) {
    if (expr.property === 'id') return obj.id;
    throw new Error(formatError(`Property '${expr.property}' does not exist on ClipPath`, line));
  }

  // Handle CyclerValue property access
  if (isCyclerValue(obj)) {
    if (expr.property === 'length') return obj.elements.length;
    throw new Error(formatError(`Property '${expr.property}' does not exist on Cycler`, line));
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
        throw new Error(formatError(`Property '${expr.property}' does not exist on CSSVar`, line));
    }
  }

  // Handle StyleBlockValue property access (camelCase → kebab-case)
  if (isStyleBlock(obj)) {
    const kebabName = camelToKebab(expr.property);
    const value = obj.properties[kebabName] ?? obj.properties[expr.property];
    if (value === undefined) {
      throw new Error(formatError(`Property '${expr.property}' does not exist on style block`, line));
    }
    return value;
  }

  // Handle ObjectValue property access (dot notation)
  if (isObjectValue(obj)) {
    if (expr.property === 'length') return obj.properties.size;
    return obj.properties.get(expr.property) ?? null;
  }

  // Handle ArrayValue property access
  if (isArrayValue(obj)) {
    if (expr.property === 'length') return obj.elements.length;
    throw new Error(formatError(`Property '${expr.property}' does not exist on array`, line));
  }

  // Handle LayerReference — minimal support in annotated mode
  if (isAnnotatedLayerRef(obj)) {
    // In annotated mode, return dummy values
    if (expr.property === 'name') return '';
    if (expr.property === 'ctx')
      return {
        type: 'ContextObject' as const,
        value: { position: { x: 0, y: 0 }, start: { x: 0, y: 0 }, commands: [] },
      };
    if (expr.property === 'styles') return { type: 'StyleBlockValue' as const, properties: {} };
    throw new Error(formatError(`Property '${expr.property}' does not exist on layer reference`, line));
  }

  throw new Error(formatError(`Cannot access property '${expr.property}' on non-object value`, line));
}

function evaluateFunctionCall(call: FunctionCall, scope: Scope, ctx: AnnotatedContext | null): Value {
  // Handle layer() function — return a dummy LayerReference in annotated mode
  if (call.name === 'layer') {
    call.args.forEach((arg) => evaluateExpression(arg, scope));
    return { type: 'LayerReference' as const };
  }

  // Special handling for log() function - just evaluate args and return empty
  if (call.name === 'log') {
    // Evaluate args to check for errors, but don't produce output in annotated mode
    call.args.forEach((arg) => evaluateExpression(arg, scope));
    return { type: 'PathSegment' as const, value: '' };
  }

  // Handle Color() constructor
  if (call.name === 'Color') {
    const cLine = call.loc?.line;
    const cCol = call.loc?.column;
    if (call.args.length === 1) {
      const arg = evaluateExpression(call.args[0], scope);
      if (isCSSVarValue(arg)) {
        if (!arg.fallback)
          throw new Error(formatError('Color(CSSVar(...)) requires a CSSVar with a fallback color', cLine, cCol));
        return {
          type: 'ColorValue' as const,
          oklch: parseColor(arg.fallback),
          cssVar: { varName: arg.varName, fallback: arg.fallback },
        };
      }
      if (isColorValue(arg)) return arg; // Color(#cc0000) → pass-through
      if (typeof arg !== 'string')
        throw new Error(formatError('Color() with 1 argument expects a color string, CSSVar, or Color', cLine, cCol));
      return { type: 'ColorValue' as const, oklch: parseColor(arg) };
    }
    if (call.args.length === 3 || call.args.length === 4) {
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
    const cvLine = call.loc?.line;
    const cvCol = call.loc?.column;
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(formatError(`CSSVar() expects 1 or 2 arguments, got ${call.args.length}`, cvLine, cvCol));
    }
    const name = evaluateExpression(call.args[0], scope);
    if (typeof name !== 'string')
      throw new Error(formatError('CSSVar() first argument must be a string', cvLine, cvCol));
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

  // Handle LinearGradient() constructor
  if (call.name === 'LinearGradient') {
    if (call.args.length !== 5) {
      throw new Error(
        formatError(
          `LinearGradient() expects 5 arguments (id, x1, y1, x2, y2), got ${call.args.length}`,
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(
        formatError('LinearGradient() first argument must be a string', call.loc?.line, call.loc?.column),
      );
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const x1 = evaluateExpression(call.args[1], scope);
    const y1 = evaluateExpression(call.args[2], scope);
    const x2 = evaluateExpression(call.args[3], scope);
    const y2 = evaluateExpression(call.args[4], scope);
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'linear',
      id,
      attrs: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) },
      stops: [],
    };
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(
        formatError('RadialGradient() first argument must be a string', call.loc?.line, call.loc?.column),
      );
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const cx = evaluateExpression(call.args[1], scope);
    const cy = evaluateExpression(call.args[2], scope);
    const r = evaluateExpression(call.args[3], scope);
    const attrs: Record<string, string> = { cx: String(cx), cy: String(cy), r: String(r) };
    if (call.args.length >= 5) attrs.fx = String(evaluateExpression(call.args[4], scope));
    if (call.args.length === 6) attrs.fy = String(evaluateExpression(call.args[5], scope));
    const gradient: GradientValue = {
      type: 'GradientValue',
      gradientType: 'radial',
      id,
      attrs,
      stops: [],
    };
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
      }
    }
    return gradient;
  }

  // Handle ConicGradient() constructor
  if (call.name === 'ConicGradient') {
    if (call.args.length !== 3) {
      throw new Error(
        formatError(
          `ConicGradient() expects 3 arguments (id, cx, cy), got ${call.args.length}`,
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('ConicGradient() first argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const cx = evaluateExpression(call.args[1], scope);
    const cy = evaluateExpression(call.args[2], scope);
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      throw new Error(
        formatError('ConicGradient() coordinate arguments must be numbers', call.loc?.line, call.loc?.column),
      );
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
    };
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('MeshGradient() first argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
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
        formatError('MeshGradient() width, height, cols, rows must be numbers', call.loc?.line, call.loc?.column),
      );
    }
    if (cols < 2 || rows < 2) {
      throw new Error(
        formatError(
          'MeshGradient() cols and rows must be >= 2 (need at least one patch)',
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
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
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(
        formatError('FreeformGradient() first argument must be a string', call.loc?.line, call.loc?.column),
      );
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const width = evaluateExpression(call.args[1], scope);
    const height = evaluateExpression(call.args[2], scope);
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(
        formatError('FreeformGradient() width and height must be numbers', call.loc?.line, call.loc?.column),
      );
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
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('TopoGradient() first argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'gradient-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const width = evaluateExpression(call.args[1], scope);
    const height = evaluateExpression(call.args[2], scope);
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(formatError('TopoGradient() width and height must be numbers', call.loc?.line, call.loc?.column));
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
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], gradient);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
      }
    }
    return gradient;
  }

  // Handle Mask() constructor
  if (call.name === 'Mask') {
    if (call.args.length !== 1) {
      throw new Error(
        formatError(`Mask() expects 1 argument (id), got ${call.args.length}`, call.loc?.line, call.loc?.column),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('Mask() argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'mask-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const mask: MaskValue = { type: 'MaskValue', id, paths: [] };
    return mask;
  }

  // Handle ClipPath() constructor
  if (call.name === 'ClipPath') {
    if (call.args.length !== 1) {
      throw new Error(
        formatError(`ClipPath() expects 1 argument (id), got ${call.args.length}`, call.loc?.line, call.loc?.column),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('ClipPath() argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'clippath-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const clipPath: ClipPathValue = { type: 'ClipPathValue', id, paths: [] };
    return clipPath;
  }

  // Filter constructors — annotated mode has no defs output, so filters are
  // stub values: the trailing block executes (property assignments are
  // lenient no-ops) and the value carries only kind + id.
  if (call.name in ANNOTATED_FILTER_KINDS) {
    const kind = ANNOTATED_FILTER_KINDS[call.name];
    annotatedFilterCounter += 1;
    const filter: AnnotatedFilterValue = {
      type: 'FilterValue',
      kind,
      id: `pathogen-${kind}-${annotatedFilterCounter}`,
    };
    // Evaluate args for errors (PixelateFilter accepts optional numbers)
    call.args.forEach((arg) => evaluateExpression(arg, scope));
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], filter);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
      }
    }
    return filter;
  }

  // Handle Pattern() constructor
  if (call.name === 'Pattern') {
    if (call.args.length !== 5) {
      throw new Error(
        formatError(
          `Pattern() expects 5 arguments (id, x, y, width, height), got ${call.args.length}`,
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('Pattern() first argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'pattern-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const x = evaluateExpression(call.args[1], scope);
    const y = evaluateExpression(call.args[2], scope);
    const w = evaluateExpression(call.args[3], scope);
    const h = evaluateExpression(call.args[4], scope);
    if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
      throw new Error(formatError('Pattern() coordinate arguments must be numbers', call.loc?.line, call.loc?.column));
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
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], pattern);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const id = evaluateExpression(call.args[0], scope);
    if (typeof id !== 'string')
      throw new Error(formatError('Marker() first argument must be a string', call.loc?.line, call.loc?.column));
    try {
      validateCSSIdent(id, 'marker-id');
    } catch (e) {
      throw new Error(formatError((e as Error).message, call.loc?.line, call.loc?.column));
    }
    const markerWidth = evaluateExpression(call.args[1], scope);
    const markerHeight = evaluateExpression(call.args[2], scope);
    if (typeof markerWidth !== 'number' || typeof markerHeight !== 'number') {
      throw new Error(
        formatError(
          'Marker() markerWidth and markerHeight arguments must be numbers',
          call.loc?.line,
          call.loc?.column,
        ),
      );
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
    if (call.block) {
      const blockScope = createScope(scope);
      setVariable(blockScope, call.block.params[0], marker);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
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
          call.loc?.line,
          call.loc?.column,
        ),
      );
    }
    const rowsVal = evaluateExpression(call.args[0], scope);
    const colsVal = evaluateExpression(call.args[1], scope);
    if (typeof rowsVal !== 'number' || !Number.isInteger(rowsVal) || rowsVal <= 0) {
      throw new Error(formatError('Grid() rows must be a positive integer', call.loc?.line, call.loc?.column));
    }
    if (typeof colsVal !== 'number' || !Number.isInteger(colsVal) || colsVal <= 0) {
      throw new Error(formatError('Grid() cols must be a positive integer', call.loc?.line, call.loc?.column));
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
        throw new Error(
          formatError('Grid() options (3rd arg) must be an object literal', call.loc?.line, call.loc?.column),
        );
      }
      const opts = optsVal.properties;
      if (opts.has('xDim')) {
        const v = opts.get('xDim');
        if (typeof v !== 'number' || v <= 0)
          throw new Error(
            formatError('Grid() options.xDim must be a positive number', call.loc?.line, call.loc?.column),
          );
        xDim = v;
      }
      if (opts.has('yDim')) {
        const v = opts.get('yDim');
        if (typeof v !== 'number' || v <= 0)
          throw new Error(
            formatError('Grid() options.yDim must be a positive number', call.loc?.line, call.loc?.column),
          );
        yDim = v;
      }
      if (opts.has('origin')) {
        const v = opts.get('origin');
        if (typeof v !== 'object' || v === null || !('type' in v) || v.type !== 'PointValue') {
          throw new Error(formatError('Grid() options.origin must be a Point', call.loc?.line, call.loc?.column));
        }
        origin = v;
      }
      if (opts.has('defaultValue')) {
        defaultValue = opts.get('defaultValue') as Value;
      }
      if (opts.has('outOfBounds')) {
        const v = opts.get('outOfBounds');
        if (v !== 'clamp' && v !== 'wrap' && v !== 'null') {
          throw new Error(
            formatError(
              `Grid() options.outOfBounds must be 'clamp', 'wrap', or 'null'`,
              call.loc?.line,
              call.loc?.column,
            ),
          );
        }
        outOfBounds = v as GridOutOfBoundsMode;
      }
      if (opts.has('interpolation')) {
        const v = opts.get('interpolation');
        if (v !== 'nearest' && v !== 'bilinear') {
          throw new Error(
            formatError(
              `Grid() options.interpolation must be 'nearest' or 'bilinear'`,
              call.loc?.line,
              call.loc?.column,
            ),
          );
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
      const blockScope = createScope(scope);
      if (call.block.params.length < 1) {
        throw new Error(
          formatError(
            'Grid() trailing block requires a parameter binding, e.g. {|g| ... }',
            call.loc?.line,
            call.loc?.column,
          ),
        );
      }
      setVariable(blockScope, call.block.params[0], grid);
      for (const stmt of call.block.body) {
        evaluateStatementPlain(stmt, blockScope);
      }
    }
    return grid;
  }

  // Handle Point() constructor (used by Grid origins and bilinear-sampled directions)
  if (call.name === 'Point') {
    if (call.args.length !== 2) {
      throw new Error(
        formatError(`Point() expects 2 arguments, got ${call.args.length}`, call.loc?.line, call.loc?.column),
      );
    }
    const x = evaluateExpression(call.args[0], scope);
    const y = evaluateExpression(call.args[1], scope);
    if (typeof x !== 'number')
      throw new Error(formatError('Point() x must be a number', call.loc?.line, call.loc?.column));
    if (typeof y !== 'number')
      throw new Error(formatError('Point() y must be a number', call.loc?.line, call.loc?.column));
    return { type: 'PointValue' as const, x, y };
  }

  // Handle PolarVector() constructor
  if (call.name === 'PolarVector') {
    if (call.args.length !== 2) {
      throw new Error(
        formatError(`PolarVector() expects 2 arguments, got ${call.args.length}`, call.loc?.line, call.loc?.column),
      );
    }
    const angle = toNumber(evaluateExpression(call.args[0], scope));
    const distance = evaluateExpression(call.args[1], scope);
    if (angle === undefined)
      throw new Error(formatError('PolarVector() angle must be a number', call.loc?.line, call.loc?.column));
    if (typeof distance !== 'number')
      throw new Error(formatError('PolarVector() distance must be a number', call.loc?.line, call.loc?.column));
    return { type: 'PolarVectorValue' as const, angle, distance };
  }

  // Handle Cycler() constructor
  if (call.name === 'Cycler') {
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(
        formatError(`Cycler() expects 1-2 arguments, got ${call.args.length}`, call.loc?.line, call.loc?.column),
      );
    }
    const list = evaluateExpression(call.args[0], scope);
    if (!isArrayValue(list))
      throw new Error(formatError('Cycler() first argument must be an array', call.loc?.line, call.loc?.column));
    if (list.elements.length === 0)
      throw new Error(formatError('Cycler() array must not be empty', call.loc?.line, call.loc?.column));
    const elements = [...list.elements];
    if (call.args.length === 2) {
      const shuffle = evaluateExpression(call.args[1], scope);
      if (shuffle) {
        for (let i = elements.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [elements[i], elements[j]] = [elements[j], elements[i]];
        }
      }
    }
    return { type: 'CyclerValue' as const, elements, index: 0 };
  }

  // Handle SVGDocumentFragment() — evaluate args and call sanitizer
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

  // Check if it's a context-aware function
  if (contextAwareFunctions.has(call.name)) {
    if (!scope.evalState) {
      throw new Error(`Function '${call.name}' requires evaluation context`);
    }
    const args = call.args.map((arg) => {
      const v = evaluateExpression(arg, scope);
      return isAngleValue(v) ? v.radians : v;
    });
    return evaluateContextAwareFunction(call.name, args, scope, call.loc);
  }

  const fn = lookupVariable(scope, call.name);

  if (typeof fn === 'function') {
    const args = call.args.map((arg) => {
      const v = evaluateExpression(arg, scope);
      return isAngleValue(v) ? v.radians : v;
    });
    return (fn as (...args: number[]) => number)(...(args as number[]));
  }

  if (typeof fn === 'object' && fn !== null && 'type' in fn && fn.type === 'UserFunction') {
    const userFn = fn;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(`${userFn.isLambda ? 'Lambda' : 'Function'} ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`);
    }

    // Lambdas resolve free names lexically via their captured scope; named
    // fns keep dynamic (caller-scope) resolution — mirrors evaluator/index.ts.
    const fnScope = createScope((userFn.closure as Scope | undefined) ?? scope);
    userFn.params.forEach((param, i) => {
      setVariable(fnScope, param, args[i]);
    });

    // For annotated output, evaluate with context if available
    if (ctx) {
      const argsStr = args.map((a) => displayArg(a)).join(', ');
      ctx.output.push({
        type: 'function_call',
        name: call.name,
        args: argsStr,
        line: call.loc?.line ?? 0,
      });
      ctx.indentLevel++;
      try {
        evaluateStatementsAnnotated(userFn.body, fnScope, ctx);
      } catch (e) {
        if (e instanceof ReturnSignal) {
          // Return statement encountered - return the value
          ctx.indentLevel--;
          ctx.output.push({ type: 'function_call_end' });
          return e.value;
        }
        throw e;
      }
      ctx.indentLevel--;
      ctx.output.push({ type: 'function_call_end' });
      return 0; // Return value not used for annotated output
    }

    try {
      const results: string[] = [];
      for (const stmt of userFn.body) {
        const result = evaluateStatementPlain(stmt, fnScope);
        if (result) results.push(result);
      }
      const resultStr = results.join(' ');
      if (resultStr) {
        return { type: 'PathSegment' as const, value: resultStr };
      }
      return resultStr;
    } catch (e) {
      if (e instanceof ReturnSignal) {
        return e.value;
      }
      throw e;
    }
  }

  throw new Error(`${call.name} is not a function`);
}

function evaluatePathArg(arg: PathArg, scope: Scope): string {
  switch (arg.type) {
    case 'NumberLiteral':
      return String(convertUnitSuffix(arg.value, arg.unit));

    case 'BooleanLiteral':
      return arg.value ? '1' : '0';

    case 'Identifier': {
      const argLoc = (arg as { loc?: { line: number; column: number } }).loc;
      const value = lookupVariable(scope, arg.name, argLoc?.line, argLoc?.column);
      if (value === null) throw new Error('Cannot use null as a path argument');
      {
        const n = toNumber(value);
        if (n !== undefined) return String(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathSegment') {
        return value.value;
      }
      throw new Error(`Variable ${arg.name} cannot be used as path argument`);
    }

    case 'CalcExpression': {
      const value = evaluateExpression(arg.expression, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      const n = toNumber(value);
      if (n === undefined) {
        throw new Error('calc() must evaluate to a number');
      }
      return String(n);
    }

    case 'FunctionCall': {
      const value = evaluateFunctionCall(arg, scope, null);
      // Void functions (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      {
        const n = toNumber(value);
        if (n !== undefined) return String(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') {
          return value.value;
        }
        if (value.type === 'PathWithResult') {
          return value.path;
        }
      }
      throw new Error(`Function ${arg.name} did not return a valid path value`);
    }

    case 'MemberExpression': {
      const value = evaluateMemberExpression(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      const n = toNumber(value);
      if (n !== undefined) {
        return String(n);
      }
      throw new Error(`Member expression did not evaluate to a number`);
    }

    case 'IndexExpression': {
      const value = evaluateIndexExpression(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      const n = toNumber(value);
      if (n !== undefined) return String(n);
      throw new Error('Index expression did not evaluate to a number');
    }

    case 'MethodCallExpression': {
      const value = evaluateMethodCall(arg, scope);
      // Void method calls (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      {
        const n = toNumber(value);
        if (n !== undefined) return String(n);
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') return value.value;
        if (value.type === 'PathWithResult') return value.path;
      }
      throw new Error('Method call did not return a valid path value');
    }

    default:
      throw new Error(`Unknown path argument type: ${(arg as PathArg).type}`);
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
      setVariable(scope, alias ?? key, struct.get(value, key) as Value);
    }
    if (pattern.rest) {
      const remaining = new Map<string, Value>();
      for (const key of struct.keys(value)) {
        if (!usedKeys.has(key)) remaining.set(key, struct.get(value, key) as Value);
      }
      setVariable(scope, pattern.rest, { type: 'ObjectValue' as const, properties: remaining });
    }
  }
}

// Plain evaluation (no annotations) for nested contexts
/**
 * Evaluate `define ViewBox(...)` with the same guards as the main evaluator
 * (index.ts ViewBoxDefinition case) so the `viewbox` global and error
 * behavior stay in parity. The top-level check uses `insideLayerApply`
 * because the annotated evaluator has no activeLayerName tracking.
 */
function evaluateViewBoxDefinition(stmt: ViewBoxDefinition, scope: Scope): void {
  if (!scope.evalState) {
    throw new Error(formatError('ViewBox definitions require evaluation context', getLine(stmt)));
  }
  if (scope.evalState.insideLayerApply) {
    throw new Error(formatError('ViewBox must appear at top level', getLine(stmt)));
  }
  if (scope.evalState.viewBox) {
    const prev = scope.evalState.viewBox.loc?.line;
    const where = prev ? ` (first defined at line ${prev})` : '';
    throw new Error(formatError(`Duplicate ViewBox definition${where}`, getLine(stmt)));
  }
  const evalArg = (label: string, expr: Expression): number => {
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
}

function evaluateStatementPlain(stmt: Statement, scope: Scope): string {
  switch (stmt.type) {
    case 'Comment':
      return '';

    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      if (stmt.pattern) {
        const bindValue =
          typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult'
            ? value.result
            : value;
        bindDestructuringPattern(stmt.pattern, bindValue, scope, getLine(stmt));
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult')
          return value.path;
        return '';
      }
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value;
        setVariable(scope, stmt.name, pwr.result);
        return pwr.path; // Emit the path
      }
      setVariable(scope, stmt.name, value);
      return '';
    }

    case 'ForLoop': {
      const start = toNumber(evaluateExpression(stmt.start, scope));
      const end = toNumber(evaluateExpression(stmt.end, scope));

      if (start === undefined || end === undefined) {
        throw new Error('for loop range must be numeric');
      }

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error('for loop range must be finite');
      }

      const ascending = start <= end;
      const iterations = ascending ? end - start + 1 : start - end + 1;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(`for loop would run ${iterations} iterations (max ${MAX_ITERATIONS})`);
      }

      const results: string[] = [];
      if (ascending) {
        for (let i = start; i <= end; i++) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          for (const bodyStmt of stmt.body) {
            const result = evaluateStatementPlain(bodyStmt, loopScope);
            if (result) results.push(result);
            if (pendingFlow) break;
          }
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
            // 'continue' → next iteration
          }
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          for (const bodyStmt of stmt.body) {
            const result = evaluateStatementPlain(bodyStmt, loopScope);
            if (result) results.push(result);
            if (pendingFlow) break;
          }
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
      }
      return results.join(' ');
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const condNum = toNumber(condition);
      const isTruthy = condition !== null && (condNum !== undefined ? condNum !== 0 : Boolean(condition));

      // pendingFlow checks let a break/continue in a branch stop the branch
      // and propagate (flag stays set) to the enclosing loop driver.
      if (isTruthy) {
        const results: string[] = [];
        for (const bodyStmt of stmt.consequent) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
          if (pendingFlow) break;
        }
        return results.join(' ');
      }
      if (stmt.alternate) {
        const results: string[] = [];
        for (const bodyStmt of stmt.alternate) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
          if (pendingFlow) break;
        }
        return results.join(' ');
      }
      return '';
    }

    case 'IndexedAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const index = evaluateExpression(stmt.index, scope);
      const value = evaluateExpression(stmt.value, scope);
      const line = getLine(stmt);
      const aError = (message: string): Error => new Error(formatError(message, line));
      if (isObjectValue(obj)) {
        if (typeof index !== 'string') throw aError('Object key must be a string');
        obj.properties.set(index, value);
      } else if (isArrayValue(obj)) {
        if (typeof index !== 'number') throw aError('Array index must be a number');
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw aError(`Array index ${index} out of bounds (length ${obj.elements.length})`);
        obj.elements[index] = value;
      } else {
        throw aError('Indexed assignment requires an object or array');
      }
      return '';
    }

    case 'ForEachLoop': {
      const iterable = evaluateExpression(stmt.iterable, scope);

      // Object iteration
      if (isObjectValue(iterable)) {
        const results: string[] = [];
        const keys = Array.from(iterable.properties.keys());
        for (const key of keys) {
          const loopScope = createScope(scope);
          if (stmt.indexVariable) {
            setVariable(loopScope, stmt.variable, key);
            setVariable(loopScope, stmt.indexVariable, iterable.properties.get(key)!);
          } else {
            setVariable(loopScope, stmt.variable, key);
          }
          for (const bodyStmt of stmt.body) {
            const result = evaluateStatementPlain(bodyStmt, loopScope);
            if (result) results.push(result);
            if (pendingFlow) break;
          }
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
        return results.join(' ');
      }

      if (!isArrayValue(iterable)) throw new Error('for-each requires an array or object');
      const results: string[] = [];
      for (let i = 0; i < iterable.elements.length; i++) {
        const loopScope = createScope(scope);
        const element = iterable.elements[i];
        setVariable(loopScope, stmt.variable, element);
        if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, i);
        for (const bodyStmt of stmt.body) {
          const result = evaluateStatementPlain(bodyStmt, loopScope);
          if (result) results.push(result);
          if (pendingFlow) break;
        }
        if (pendingFlow) {
          const flow = pendingFlow;
          pendingFlow = null;
          if (flow === 'break') break;
        }
      }
      return results.join(' ');
    }

    case 'FunctionDefinition': {
      const fn: UserFunction = {
        type: 'UserFunction',
        params: stmt.params,
        body: stmt.body,
      };
      setVariable(scope, stmt.name, fn);
      return '';
    }

    case 'EnumDefinition': {
      if (scope.variables.has(stmt.name)) {
        throw new Error(
          formatError(`Enum '${stmt.name}' is already defined`, (stmt as { loc?: { line: number } }).loc?.line),
        );
      }
      const enumProps = new Map<string, Value>();
      for (const member of stmt.members) {
        const val = member.value ? evaluateExpression(member.value, scope) : member.name.toLowerCase();
        enumProps.set(member.name, val);
      }
      setVariable(scope, stmt.name, { type: 'ObjectValue', properties: enumProps } as ObjectValue);
      return '';
    }

    case 'PathCommand': {
      if (stmt.annotations?.cornerOp) {
        throw new Error(
          'with clauses are not supported in --annotated debug mode yet; compile normally (they work in the CLI, playground, and VS Code preview).',
        );
      }
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodResult = evaluateMethodCall(stmt.args[0], scope);
        if (
          typeof methodResult === 'object' &&
          methodResult !== null &&
          'type' in methodResult &&
          methodResult.type === 'PathWithResult'
        ) {
          return methodResult.path;
        }
        return '';
      }

      if (stmt.command === '') {
        const args = stmt.args.map((arg) => evaluatePathArg(arg, scope));
        return args.join(' ');
      }
      const args = stmt.args.map((arg) => evaluatePathArg(arg, scope));
      const result = stmt.command + (args.length > 0 ? ` ${args.join(' ')}` : '');

      // Update path context if tracking is enabled
      if (scope.evalState && stmt.command !== '') {
        const numericArgs = getNumericArgs(stmt.args, scope);
        updateContextForCommand(scope.evalState.pathContext, stmt.command, numericArgs);
        updateCtxVariable(scope);
      }

      return result;
    }

    case 'LayerDefinition':
      // Layer definitions are no-ops in annotated mode
      return '';

    case 'ViewBoxDefinition':
      // Metadata-only: stores evalState.viewBox (read via the `viewbox`
      // global) and validates, but emits no path output.
      evaluateViewBoxDefinition(stmt, scope);
      return '';

    case 'LayerApplyBlock': {
      // In annotated mode, just evaluate the body normally
      const results: string[] = [];
      const prevInsideApply = scope.evalState?.insideLayerApply;
      if (scope.evalState) scope.evalState.insideLayerApply = true;
      try {
        for (const bodyStmt of stmt.body) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
        }
      } finally {
        if (scope.evalState) scope.evalState.insideLayerApply = prevInsideApply;
      }
      return results.join(' ');
    }

    case 'TextStatement':
      // In annotated plain mode, text statements are no-ops (no path output)
      return '';

    case 'MemberAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const value = evaluateExpression(stmt.value, scope);
      // The viewbox global is read-only — parity with the main evaluator's
      // 'Cannot assign to property' rejection.
      if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ViewBoxStructValue') {
        throw new Error(formatError(`Cannot assign to property '${stmt.property}'`, getLine(stmt)));
      }
      // Handle Pattern property assignment
      if (isPatternValue(obj)) {
        assignPatternProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      // Handle Marker property assignment
      if (isMarkerValue(obj)) {
        assignMarkerProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      // Handle Gradient property assignment (including conic/freeform/topo fields)
      if (isGradientValue(obj)) {
        assignGradientProperty(obj, stmt.property, value, stmt.value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      // Handle MeshPoint property assignment (g.getPoint(r, c).color = ...)
      if (isMeshPointValue(obj)) {
        assignMeshPointProperty(obj, stmt.property, value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      return '';
    }

    case 'ExpressionStatement': {
      evaluateExpression(stmt.expression, scope);
      return '';
    }

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

    case 'BreakStatement':
      pendingFlow = 'break';
      return '';

    case 'ContinueStatement':
      pendingFlow = 'continue';
      return '';

    case 'FontDirective':
      return '';

    case 'Comment':
      return '';

    default:
      throw new Error(`Unknown statement type: ${(stmt as Statement).type}`);
  }
}

// Annotated evaluation
function evaluateStatementAnnotated(stmt: Statement, scope: Scope, ctx: AnnotatedContext): void {
  // Emit any comments that appear before this statement
  if (stmt.type !== 'Comment' && 'loc' in stmt && stmt.loc) {
    emitCommentsUpTo(ctx, stmt.loc.offset);
  }

  switch (stmt.type) {
    case 'Comment':
      // Comments are handled via emitCommentsUpTo
      break;

    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      if (stmt.pattern) {
        const bindValue =
          typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult'
            ? value.result
            : value;
        bindDestructuringPattern(stmt.pattern, bindValue, scope, getLine(stmt));
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
          emitPathString(value.path, ctx);
        }
      } else if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        // Handle PathWithResult: assign the result to variable, emit the path
        const pwr = value;
        setVariable(scope, stmt.name, pwr.result);
        // Emit annotated draw() call if the value came from a method call
        if (stmt.value.type === 'MethodCallExpression') {
          const methodExpr = stmt.value;
          const callName = `${exprSourceName(methodExpr.object)}.${methodExpr.method}`;
          const argsStr = methodExpr.args.map((a) => displayArg(evaluateExpression(a, scope))).join(', ');
          const methodLine = (methodExpr.object as { loc?: { line: number } }).loc?.line ?? stmt.loc?.line ?? 0;
          ctx.output.push({
            type: 'function_call',
            name: callName,
            args: argsStr,
            line: methodLine,
          });
          ctx.indentLevel++;
          emitPathString(pwr.path, ctx);
          ctx.indentLevel--;
          ctx.output.push({ type: 'function_call_end' });
        } else {
          emitPathString(pwr.path, ctx);
        }
      } else {
        setVariable(scope, stmt.name, value);
      }
      break;
    }

    case 'ForLoop': {
      const start = toNumber(evaluateExpression(stmt.start, scope));
      const end = toNumber(evaluateExpression(stmt.end, scope));

      if (start === undefined || end === undefined) {
        throw new Error('for loop range must be numeric');
      }

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error('for loop range must be finite');
      }

      const ascending = start <= end;
      const totalIterations = ascending ? end - start + 1 : start - end + 1;
      if (totalIterations > MAX_ITERATIONS) {
        throw new Error(`for loop would run ${totalIterations} iterations (max ${MAX_ITERATIONS})`);
      }

      ctx.output.push({
        type: 'loop_start',
        variable: stmt.variable,
        start,
        end,
        line: stmt.loc?.line ?? 0,
      });

      ctx.indentLevel++;

      // Loop truncation: show first 3, skip, last 3 if > 10 iterations
      const TRUNCATE_THRESHOLD = 10;
      const SHOW_COUNT = 3;

      // Build iteration values array (handles both ascending and descending)
      const iterValues: number[] = [];
      if (ascending) {
        for (let i = start; i <= end; i++) iterValues.push(i);
      } else {
        for (let i = start; i >= end; i--) iterValues.push(i);
      }

      for (let iterIndex = 0; iterIndex < iterValues.length; iterIndex++) {
        const i = iterValues[iterIndex];

        // Determine if we should show this iteration
        const isFirstFew = iterIndex < SHOW_COUNT;
        const isLastFew = iterIndex >= totalIterations - SHOW_COUNT;
        const shouldShow = totalIterations <= TRUNCATE_THRESHOLD || isFirstFew || isLastFew;

        // Emit skip message when transitioning
        if (totalIterations > TRUNCATE_THRESHOLD && iterIndex === SHOW_COUNT) {
          const skipCount = totalIterations - SHOW_COUNT * 2;
          ctx.output.push({ type: 'iteration_skip', count: skipCount });
        }

        if (shouldShow) {
          ctx.output.push({ type: 'iteration', index: i });

          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);

          for (const bodyStmt of stmt.body) {
            evaluateStatementAnnotated(bodyStmt, loopScope, ctx);
            if (pendingFlow) break;
          }
        } else {
          // Still need to evaluate for side effects (variable assignments, etc.)
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          for (const bodyStmt of stmt.body) {
            evaluateStatementPlain(bodyStmt, loopScope);
            if (pendingFlow) break;
          }
        }
        if (pendingFlow) {
          const flow = pendingFlow;
          pendingFlow = null;
          // break falls through to the loop_end epilogue below — the
          // indent/loop_end events must still emit
          if (flow === 'break') break;
        }
      }

      ctx.indentLevel--;
      ctx.output.push({ type: 'loop_end' });
      break;
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const condNum = toNumber(condition);
      const isTruthy = condition !== null && (condNum !== undefined ? condNum !== 0 : Boolean(condition));

      // pendingFlow stops the branch and propagates to the enclosing loop
      if (isTruthy) {
        for (const bodyStmt of stmt.consequent) {
          evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
          if (pendingFlow) break;
        }
      } else if (stmt.alternate) {
        for (const bodyStmt of stmt.alternate) {
          evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
          if (pendingFlow) break;
        }
      }
      break;
    }

    case 'IndexedAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const index = evaluateExpression(stmt.index, scope);
      const value = evaluateExpression(stmt.value, scope);
      const line = getLine(stmt);
      const aError = (message: string): Error => new Error(formatError(message, line));
      if (isObjectValue(obj)) {
        if (typeof index !== 'string') throw aError('Object key must be a string');
        obj.properties.set(index, value);
      } else if (isArrayValue(obj)) {
        if (typeof index !== 'number') throw aError('Array index must be a number');
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw aError(`Array index ${index} out of bounds (length ${obj.elements.length})`);
        obj.elements[index] = value;
      } else {
        throw aError('Indexed assignment requires an object or array');
      }
      break;
    }

    case 'ForEachLoop': {
      const iterable = evaluateExpression(stmt.iterable, scope);

      // Object iteration in annotated mode
      if (isObjectValue(iterable)) {
        const keys = Array.from(iterable.properties.keys());
        ctx.output.push({
          type: 'foreach_start',
          variable: stmt.variable,
          length: keys.length,
          line: stmt.loc?.line ?? 0,
        });
        ctx.indentLevel++;
        for (let i = 0; i < keys.length; i++) {
          ctx.output.push({ type: 'iteration', index: i });
          const loopScope = createScope(scope);
          if (stmt.indexVariable) {
            setVariable(loopScope, stmt.variable, keys[i]);
            setVariable(loopScope, stmt.indexVariable, iterable.properties.get(keys[i])!);
          } else {
            setVariable(loopScope, stmt.variable, keys[i]);
          }
          for (const bodyStmt of stmt.body) {
            evaluateStatementAnnotated(bodyStmt, loopScope, ctx);
            if (pendingFlow) break;
          }
          if (pendingFlow) {
            const flow = pendingFlow;
            pendingFlow = null;
            if (flow === 'break') break;
          }
        }
        ctx.indentLevel--;
        ctx.output.push({ type: 'loop_end' });
        break;
      }

      if (!isArrayValue(iterable)) throw new Error('for-each requires an array or object');

      ctx.output.push({
        type: 'foreach_start',
        variable: stmt.variable,
        length: iterable.elements.length,
        line: stmt.loc?.line ?? 0,
      });
      ctx.indentLevel++;

      const TRUNCATE_THRESHOLD = 10;
      const SHOW_COUNT = 3;
      const totalIterations = iterable.elements.length;

      for (let i = 0; i < totalIterations; i++) {
        const isFirstFew = i < SHOW_COUNT;
        const isLastFew = i >= totalIterations - SHOW_COUNT;
        const shouldShow = totalIterations <= TRUNCATE_THRESHOLD || isFirstFew || isLastFew;

        if (totalIterations > TRUNCATE_THRESHOLD && i === SHOW_COUNT) {
          const skipCount = totalIterations - SHOW_COUNT * 2;
          ctx.output.push({ type: 'iteration_skip', count: skipCount });
        }

        if (shouldShow) {
          ctx.output.push({ type: 'iteration', index: i });
          const loopScope = createScope(scope);
          const element = iterable.elements[i];
          if (stmt.indexVariable && isArrayValue(element)) {
            setVariable(loopScope, stmt.variable, element.elements[0] ?? null);
            setVariable(loopScope, stmt.indexVariable, element.elements[1] ?? null);
          } else {
            setVariable(loopScope, stmt.variable, element);
            if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, i);
          }
          for (const bodyStmt of stmt.body) {
            evaluateStatementAnnotated(bodyStmt, loopScope, ctx);
            if (pendingFlow) break;
          }
        } else {
          const loopScope = createScope(scope);
          const element = iterable.elements[i];
          if (stmt.indexVariable && isArrayValue(element)) {
            setVariable(loopScope, stmt.variable, element.elements[0] ?? null);
            setVariable(loopScope, stmt.indexVariable, element.elements[1] ?? null);
          } else {
            setVariable(loopScope, stmt.variable, element);
            if (stmt.indexVariable) setVariable(loopScope, stmt.indexVariable, i);
          }
          for (const bodyStmt of stmt.body) {
            evaluateStatementPlain(bodyStmt, loopScope);
            if (pendingFlow) break;
          }
        }
        if (pendingFlow) {
          const flow = pendingFlow;
          pendingFlow = null;
          if (flow === 'break') break; // loop_end epilogue still emits below
        }
      }

      ctx.indentLevel--;
      ctx.output.push({ type: 'loop_end' });
      break;
    }

    case 'FunctionDefinition': {
      const fn: UserFunction = {
        type: 'UserFunction',
        params: stmt.params,
        body: stmt.body,
      };
      setVariable(scope, stmt.name, fn);
      // Function definitions don't produce output
      break;
    }

    case 'EnumDefinition': {
      if (scope.variables.has(stmt.name)) {
        throw new Error(
          formatError(`Enum '${stmt.name}' is already defined`, (stmt as { loc?: { line: number } }).loc?.line),
        );
      }
      const enumAnnotatedProps = new Map<string, Value>();
      for (const member of stmt.members) {
        const val = member.value ? evaluateExpression(member.value, scope) : member.name.toLowerCase();
        enumAnnotatedProps.set(member.name, val);
      }
      setVariable(scope, stmt.name, { type: 'ObjectValue', properties: enumAnnotatedProps } as ObjectValue);
      break;
    }

    case 'PathCommand': {
      if (stmt.annotations?.cornerOp) {
        throw new Error(
          'with clauses are not supported in --annotated debug mode yet; compile normally (they work in the CLI, playground, and VS Code preview).',
        );
      }
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodExpr = stmt.args[0];
        const methodResult = evaluateMethodCall(methodExpr, scope);
        if (
          typeof methodResult === 'object' &&
          methodResult !== null &&
          'type' in methodResult &&
          methodResult.type === 'PathWithResult'
        ) {
          const pwr = methodResult;
          if (pwr.path) {
            const callName = `${exprSourceName(methodExpr.object)}.${methodExpr.method}`;
            const argsStr = methodExpr.args.map((a) => displayArg(evaluateExpression(a, scope))).join(', ');
            const methodLine = (methodExpr.object as { loc?: { line: number } }).loc?.line ?? stmt.loc?.line ?? 0;
            ctx.output.push({
              type: 'function_call',
              name: callName,
              args: argsStr,
              line: methodLine,
            });
            ctx.indentLevel++;
            emitPathString(pwr.path, ctx);
            ctx.indentLevel--;
            ctx.output.push({ type: 'function_call_end' });
          }
        }
        break;
      }

      if (stmt.command === '') {
        // Statement-level function call
        const funcCall = stmt.args[0] as FunctionCall;

        // Built-in defs/filter constructors reached as bare statements
        // (`Marker('m', 10, 10) {|m| ... };`) are not valid path output in
        // the main evaluator either ("did not return a valid path value") —
        // but the annotated fallback below would misreport them as
        // "Undefined variable". Match the main evaluator's error instead.
        if (
          (DEFS_CONSTRUCTORS as readonly string[]).includes(funcCall.name) ||
          funcCall.name in ANNOTATED_FILTER_KINDS
        ) {
          evaluateFunctionCall(funcCall, scope, ctx);
          throw new Error(`Function ${funcCall.name} did not return a valid path value`);
        }

        // Check for context-aware functions first
        if (contextAwareFunctions.has(funcCall.name)) {
          if (!scope.evalState) {
            throw new Error(`Function '${funcCall.name}' requires evaluation context`);
          }
          const rawArgs = funcCall.args.map((arg) => evaluateExpression(arg, scope));
          const args = rawArgs.map((v) => (isAngleValue(v) ? v.radians : v));
          const result = evaluateContextAwareFunction(funcCall.name, args, scope, funcCall.loc);
          const argsStr = rawArgs.map((a) => displayArg(a)).join(', ');
          ctx.output.push({
            type: 'function_call',
            name: funcCall.name,
            args: argsStr,
            line: funcCall.loc?.line ?? 0,
          });
          ctx.indentLevel++;
          // Extract path string from result
          let pathStr = '';
          if (typeof result === 'object' && result !== null && 'type' in result) {
            if (result.type === 'PathSegment') {
              pathStr = result.value;
            } else if (result.type === 'PathWithResult') {
              pathStr = result.path;
            }
          }
          if (pathStr) {
            emitPathString(pathStr, ctx);
          }
          ctx.indentLevel--;
          ctx.output.push({ type: 'function_call_end' });
          break;
        }

        const fn = lookupVariable(scope, funcCall.name);

        if (typeof fn === 'function') {
          // Stdlib function - evaluate and emit result
          const args = funcCall.args.map((arg) => evaluateExpression(arg, scope));
          const callArgs = args.map((v) => (isAngleValue(v) ? v.radians : v));
          const result = (fn as (...args: number[]) => number)(...(callArgs as number[]));
          if (
            typeof result === 'object' &&
            result !== null &&
            'type' in result &&
            (result as PathSegment).type === 'PathSegment'
          ) {
            // Split path segment into individual commands for better formatting
            const pathStr = (result as PathSegment).value;
            const argsStr = args.map((a) => displayArg(a)).join(', ');
            ctx.output.push({
              type: 'function_call',
              name: funcCall.name,
              args: argsStr,
              line: funcCall.loc?.line ?? 0,
            });
            ctx.indentLevel++;
            // Emit the path data as individual path commands
            emitPathString(pathStr, ctx);
            ctx.indentLevel--;
            ctx.output.push({ type: 'function_call_end' });
          } else if (typeof result === 'string') {
            const argsStr = args.map((a) => displayArg(a)).join(', ');
            ctx.output.push({
              type: 'function_call',
              name: funcCall.name,
              args: argsStr,
              line: funcCall.loc?.line ?? 0,
            });
            ctx.indentLevel++;
            emitPathString(result, ctx);
            ctx.indentLevel--;
            ctx.output.push({ type: 'function_call_end' });
          }
        } else if (typeof fn === 'object' && fn !== null && 'type' in fn && fn.type === 'UserFunction') {
          // User-defined function
          evaluateFunctionCall(funcCall, scope, ctx);
        }
      } else {
        // Regular path command — check for draw() method call args that need annotation
        const leadingArgs: string[] = [];
        let drawMethodFound = false;

        for (const arg of stmt.args) {
          if (arg.type === 'MethodCallExpression') {
            const methodExpr = arg;
            const methodResult = evaluateMethodCall(methodExpr, scope);
            if (
              typeof methodResult === 'object' &&
              methodResult !== null &&
              'type' in methodResult &&
              methodResult.type === 'PathWithResult'
            ) {
              const pwr = methodResult;
              // Emit leading path command with its args first
              if (stmt.command && leadingArgs.length > 0) {
                ctx.output.push({
                  type: 'path_command',
                  command: stmt.command,
                  args: leadingArgs.join(' '),
                  line: stmt.loc?.line,
                });
              } else if (stmt.command && leadingArgs.length === 0) {
                ctx.output.push({
                  type: 'path_command',
                  command: stmt.command,
                  args: '',
                  line: stmt.loc?.line,
                });
              }
              // Emit annotated draw() call
              if (pwr.path) {
                const callName = `${exprSourceName(methodExpr.object)}.${methodExpr.method}`;
                const argsStr = methodExpr.args.map((a) => displayArg(evaluateExpression(a, scope))).join(', ');
                const methodLine = (methodExpr.object as { loc?: { line: number } }).loc?.line ?? stmt.loc?.line ?? 0;
                ctx.output.push({
                  type: 'function_call',
                  name: callName,
                  args: argsStr,
                  line: methodLine,
                });
                ctx.indentLevel++;
                emitPathString(pwr.path, ctx);
                ctx.indentLevel--;
                ctx.output.push({ type: 'function_call_end' });
              }
              drawMethodFound = true;
              // Clear leading args since we already emitted the command
              leadingArgs.length = 0;
            } else if (typeof methodResult === 'number') {
              leadingArgs.push(String(methodResult));
            } else if (
              typeof methodResult === 'object' &&
              methodResult !== null &&
              'type' in methodResult &&
              (methodResult as PathSegment).type === 'PathSegment'
            ) {
              leadingArgs.push((methodResult as PathSegment).value);
            }
          } else {
            leadingArgs.push(evaluatePathArg(arg, scope));
          }
        }

        // Emit any remaining args if no draw method was found
        if (!drawMethodFound) {
          ctx.output.push({
            type: 'path_command',
            command: stmt.command,
            args: leadingArgs.join(' '),
            line: stmt.loc?.line,
          });
        }

        // Update path context if tracking is enabled
        if (scope.evalState && stmt.command !== '') {
          const numericArgs = getNumericArgs(stmt.args, scope);
          updateContextForCommand(scope.evalState.pathContext, stmt.command, numericArgs);
          updateCtxVariable(scope);
        }
      }
      break;
    }

    case 'LayerDefinition':
      // Layer definitions are no-ops in annotated mode
      break;

    case 'ViewBoxDefinition':
      // Metadata-only: stores evalState.viewBox (read via the `viewbox`
      // global) and validates, but emits no output line.
      evaluateViewBoxDefinition(stmt, scope);
      break;

    case 'LayerApplyBlock': {
      // In annotated mode, just evaluate the body into the annotated output
      const prevInsideApply = scope.evalState?.insideLayerApply;
      if (scope.evalState) scope.evalState.insideLayerApply = true;
      try {
        for (const bodyStmt of stmt.body) {
          evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
        }
      } finally {
        if (scope.evalState) scope.evalState.insideLayerApply = prevInsideApply;
      }
      break;
    }

    case 'TextStatement':
      // In annotated mode, text statements are no-ops (no path output)
      break;

    case 'MemberAssignmentStatement': {
      const maObj = evaluateExpression(stmt.object, scope);
      const maValue = evaluateExpression(stmt.value, scope);
      // The viewbox global is read-only — parity with the main evaluator's
      // 'Cannot assign to property' rejection.
      if (typeof maObj === 'object' && maObj !== null && 'type' in maObj && maObj.type === 'ViewBoxStructValue') {
        throw new Error(formatError(`Cannot assign to property '${stmt.property}'`, getLine(stmt)));
      }
      // Handle Pattern property assignment
      if (isPatternValue(maObj)) {
        assignPatternProperty(maObj, stmt.property, maValue, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      // Handle Marker property assignment (previously missing here entirely)
      if (isMarkerValue(maObj)) {
        assignMarkerProperty(maObj, stmt.property, maValue, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      // Handle Gradient property assignment (including conic fields)
      if (isGradientValue(maObj)) {
        assignGradientProperty(maObj, stmt.property, maValue, stmt.value, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      if (isMeshPointValue(maObj)) {
        assignMeshPointProperty(maObj, stmt.property, maValue, (message) => {
          throw new Error(formatError(message, getLine(stmt)));
        });
      }
      break;
    }

    case 'ExpressionStatement': {
      evaluateExpression(stmt.expression, scope);
      break;
    }

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

    case 'BreakStatement':
      pendingFlow = 'break';
      break;

    case 'ContinueStatement':
      pendingFlow = 'continue';
      break;

    case 'FontDirective':
      // Declarative metadata — no annotated output
      break;

    case 'Comment':
      // Comments are no-ops at runtime
      break;

    default:
      throw new Error(`Unknown statement type: ${(stmt as Statement).type}`);
  }
}

// Helper to emit a path string as individual commands
function exprSourceName(expr: Expression): string {
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type === 'MemberExpression') return `${exprSourceName(expr.object)}.${expr.property}`;
  if (expr.type === 'MethodCallExpression') return `${exprSourceName(expr.object)}.${expr.method}`;
  if (expr.type === 'LambdaExpression') return `{|${expr.params.join(', ')}| ...}`;
  return '?';
}

function emitPathString(pathStr: string, ctx: AnnotatedContext): void {
  for (const { command, argsText } of splitPathCommands(pathStr)) {
    ctx.output.push({
      type: 'path_command',
      command,
      args: argsText,
    });
  }
}

function evaluateStatementsAnnotated(stmts: Statement[], scope: Scope, ctx: AnnotatedContext): void {
  for (const stmt of stmts) {
    evaluateStatementAnnotated(stmt, scope, ctx);
    // Top level is a break/continue boundary (builder-enforced; defensive)
    consumePendingFlowAtBoundary();
  }
}

export function evaluateAnnotated(program: Program, comments: Comment[]): AnnotatedOutput {
  pendingFlow = null; // belt-and-braces: a prior thrown eval can't leak flow
  const scope = createScope();

  // Initialize path context and evaluation state
  const pathContext = createPathContext();
  const evalState: EvaluationState = { pathContext };
  scope.evalState = evalState;

  // Initialize ctx variable with a path context
  scope.variables.set('ctx', {
    type: 'ContextObject' as const,
    value: contextToObject(pathContext),
  });

  const ctx: AnnotatedContext = {
    output: [],
    comments: [...comments], // Copy to avoid mutating original
    currentOffset: 0,
    indentLevel: 0,
  };

  evaluateStatementsAnnotated(program.body, scope, ctx);

  // Emit any remaining comments
  while (ctx.comments.length > 0) {
    const comment = ctx.comments.shift()!;
    ctx.output.push({ type: 'comment', text: comment.text });
  }

  return { lines: ctx.output };
}
