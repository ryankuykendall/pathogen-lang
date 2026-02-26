import type {
  Program,
  Statement,
  Expression,
  PathArg,
  PathCommand,
  LetDeclaration,
  AssignmentStatement,
  IndexedAssignmentStatement,
  ForLoop,
  ForEachLoop,
  IfStatement,
  FunctionDefinition,
  ReturnStatement,
  FunctionCall,
  MemberExpression,
  IndexExpression,
  MethodCallExpression,
  LayerDefinition,
  LayerApplyBlock,
  TemplateLiteral,
  TextStatement,
  TspanStatement,
  TextBodyItem,
  StyleBlockLiteral,
  PathBlockExpression,
} from '../parser/ast';
import { expression as expressionParser } from '../parser';
import { stdlib, contextAwareFunctions } from '../stdlib';
import {
  type PathContext,
  type Point,
  type CommandHistoryEntry,
  type TransformState,
  createPathContext,
  createTransformState,
  updateContextForCommand,
  contextToObject,
  setLastTangent,
  transformStateToSvg,
} from './context';
import { formatNum, setNumberFormat, resetNumberFormat } from './format';
import { sanitizeSVGFragment } from './svg-sanitize';
import { type OKLCH, parseColor, oklchToCSS, oklchToHex, oklchToRGBString, oklchToHSLString, oklchToOKLCHString, lighten, darken, saturate, desaturate, setAlpha, hueShift, mixColors } from '../color';
import { calculateCommandLength, calculatePathLength, samplePathAtFraction, partitionPath } from './sampling';
import { reverseCommands, computeBoundingBox, offsetCommands, commandToPathString, mirrorCommands, rotateAtVertexCommands, scaleCommands, concatenateCommands, subPathCommands } from './path-transforms';

/** CSS properties that reference defs elements via url(#id) */
const URL_REF_PROPERTIES = new Set(['mask', 'clip-path', 'filter', 'marker-start', 'marker-mid', 'marker-end']);

export type Value = number | string | null | PathSegment | UserFunction | ContextObject | PathWithResult | LayerReference | StyleBlockValue | ArrayValue | PointValue | TransformReference | TransformPropertyReference | ObjectValue | ObjectNamespace | PathBlockValue | ProjectedPathValue | CyclerValue | SVGFragmentValue | MaskValue | ClipPathValue | ColorValue | ColorNamespace | CSSVarValue;

/**
 * Represents an array value (reference semantics)
 */
export interface ArrayValue {
  type: 'ArrayValue';
  elements: Value[];
}

export function isArrayValue(value: Value): value is ArrayValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ArrayValue';
}

/**
 * Represents a 2D point value with geometric operations
 */
export interface PointValue {
  type: 'PointValue';
  x: number;
  y: number;
}

export function isPointValue(value: Value): value is PointValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PointValue';
}

/**
 * Represents a cycler that cycles through a list sequentially
 */
export interface CyclerValue {
  type: 'CyclerValue';
  elements: Value[];
  index: number;
}

export function isCyclerValue(value: Value): value is CyclerValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CyclerValue';
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

export function isSVGFragmentValue(value: Value): value is SVGFragmentValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'SVGFragmentValue';
}

/**
 * Entry in a Mask — a path with optional styles
 */
export interface MaskPathEntry { d: string; styles: Record<string, string>; }

/**
 * Represents a <mask> definition with appended path elements
 */
export interface MaskValue {
  type: 'MaskValue';
  id: string;
  paths: MaskPathEntry[];
}

export function isMaskValue(value: Value): value is MaskValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'MaskValue';
}

/**
 * Represents a <clipPath> definition with appended path elements
 */
export interface ClipPathValue {
  type: 'ClipPathValue';
  id: string;
  paths: string[];
}

export function isClipPathValue(value: Value): value is ClipPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ClipPathValue';
}

/**
 * Represents a color value with OKLCH internal representation
 */
export interface ColorValue {
  type: 'ColorValue';
  oklch: OKLCH;
}

export function isColorValue(value: Value): value is ColorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ColorValue';
}

/**
 * Represents a CSS custom property reference: var(--name, fallback)
 */
export interface CSSVarValue {
  type: 'CSSVarValue';
  varName: string;
  fallback: string | null;
}

export function isCSSVarValue(value: Value): value is CSSVarValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'CSSVarValue';
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

export function isObjectValue(value: Value): value is ObjectValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ObjectValue';
}

/**
 * Sentinel for Object namespace (Object.keys, Object.values, etc.)
 */
export interface ObjectNamespace {
  type: 'ObjectNamespace';
}

/**
 * Structured command within a PathBlock — stores command letter, numeric args, and start/end points
 */
export interface PathBlockCommand {
  command: string;     // lowercase letter (m, l, h, v, c, s, q, t, a, z)
  args: number[];      // evaluated numeric arguments
  start: Point;        // cursor position before command
  end: Point;          // cursor position after command
}

/**
 * Represents a path block value — a reusable, introspectable path definition in relative coordinates
 */
export interface PathBlockValue {
  type: 'PathBlockValue';
  commands: PathBlockCommand[];  // structured command list
  pathStrings: string[];         // raw path command strings (for emit)
  startPoint: Point;             // origin (always 0,0 unless path begins with m)
  endPoint: Point;               // final cursor position (relative)
}

export function isPathBlockValue(value: Value): value is PathBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathBlockValue';
}

/**
 * Represents a projected path — a PathBlock projected into absolute coordinate space
 */
export interface ProjectedPathValue {
  type: 'ProjectedPathValue';
  commands: PathBlockCommand[];  // commands with absolute coordinates
  startPoint: Point;
  endPoint: Point;
}

export function isProjectedPathValue(value: Value): value is ProjectedPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedPathValue';
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
  path: string;      // The path string to emit
  result: Value;     // The result value (for assignments)
}

/**
 * Represents a style block value (CSS-like key-value map)
 */
export interface StyleBlockValue {
  type: 'StyleBlockValue';
  properties: Record<string, string>;
}

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
  label?: string;  // For values: the expression that was logged (e.g., "ctx.position")
  value: string;   // The stringified value
}

// --- Layer types ---

export interface LayerStyle {
  [key: string]: string;  // CSS property name (kebab-case stored as-is) → value
}

// --- Text element types ---

export type TextChild =
  | { type: 'run'; text: string }
  | { type: 'tspan'; text: string; dx?: number; dy?: number; rotation?: number; styles?: Record<string, string> };  // rotation in radians

export interface TextElement {
  x: number;
  y: number;
  rotation?: number;  // Radians — converted to degrees at render time
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

export type LayerState = PathLayerState | TextLayerState | FragmentLayerState;

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

// --- Layer output types ---

export interface LayerOutput {
  name: string;
  type: 'path' | 'text' | 'fragment';
  data: string;                    // Path: d-attribute. Text: concatenated plain text. Fragment: empty.
  textElements?: TextElement[];    // Only present when type === 'text'
  fragmentDefs?: string;           // Only present when type === 'fragment'
  fragmentVisuals?: string;        // Only present when type === 'fragment'
  styles: Record<string, string>;  // SVG attribute name → value
  isDefault: boolean;
  transform?: string;              // SVG transform attribute value
}

export interface MaskOutput {
  id: string;
  elements: Array<{ pathData: string; styles: Record<string, string> }>;
}

export interface ClipPathOutput {
  id: string;
  elements: Array<{ pathData: string }>;
}

export interface CompileResult {
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  logs: LogEntry[];
  calledStdlibFunctions: string[];
}

/**
 * Convert an Expression AST node to its source text representation
 */
function expressionToSource(expr: Expression): string {
  switch (expr.type) {
    case 'NumberLiteral':
      return String(expr.value) + (expr.unit || '');
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
    case 'BinaryExpression':
      return `(${expressionToSource(expr.left)} ${expr.operator} ${expressionToSource(expr.right)})`;
    case 'UnaryExpression':
      return `${expr.operator}${expressionToSource(expr.argument)}`;
    case 'TemplateLiteral':
      return '`' + expr.parts.map(p =>
        typeof p === 'string' ? p : '${' + expressionToSource(p) + '}'
      ).join('') + '`';
    case 'StyleBlockLiteral':
      return '${ ' + expr.properties.map(p => `${p.name}: ${p.value};`).join(' ') + ' }';
    case 'NullLiteral':
      return 'null';
    case 'ArrayLiteral':
      return '[' + expr.elements.map(expressionToSource).join(', ') + ']';
    case 'IndexExpression':
      return `${expressionToSource(expr.object)}[${expressionToSource(expr.index)}]`;
    case 'MethodCallExpression':
      return `${expressionToSource(expr.object)}.${expr.method}(${expr.args.map(expressionToSource).join(', ')})`;
    case 'ObjectLiteral':
      return '{' + expr.properties.map(p => `${p.key}: ${expressionToSource(p.value)}`).join(', ') + '}';
    case 'PathBlockExpression':
      return '@{ ... }';
    default:
      return '?';
  }
}

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
 * Signal class used to propagate return values up the call stack.
 * Thrown by return statements and caught by function call evaluation.
 */
class ReturnSignal {
  constructor(public value: Value) {}
}

/**
 * Evaluation state for context-aware evaluation
 */
export interface EvaluationState {
  pathContext: PathContext;
  logs: LogEntry[];
  calledStdlibFunctions: Set<string>;  // Stdlib function names invoked during evaluation
  layers: Map<string, LayerState>;     // Layer definitions by name
  layerOrder: string[];                // Definition order for z-index
  activeLayerName: string | null;      // Currently inside layer().apply
  defaultLayerName: string | null;     // Default layer name
  transformState: TransformState;      // Transform state for implicit default layer
  masks: Map<string, MaskValue>;       // Mask definitions by ID
  clipPaths: Map<string, ClipPathValue>; // ClipPath definitions by ID
}

export interface Scope {
  variables: Map<string, Value>;
  parent: Scope | null;
  evalState?: EvaluationState;  // Shared across all scopes during evaluation
}

function createScope(parent: Scope | null = null): Scope {
  return {
    variables: new Map(),
    parent,
    evalState: parent?.evalState,  // Inherit evaluation state from parent
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
 * Convert angle value based on unit suffix
 * - 'deg': converts degrees to radians
 * - 'rad' or undefined: returns value unchanged (radians are internal standard)
 */
function convertAngleUnit(value: number, unit?: 'deg' | 'rad' | 'pi'): number {
  if (unit === 'deg') {
    return value * Math.PI / 180;
  }
  if (unit === 'pi') {
    return value * Math.PI;
  }
  return value; // rad or no unit = radians (internal standard)
}

/**
 * Check if an expression is a NumberLiteral with an angle unit (deg/rad)
 */
function hasAngleUnit(expr: Expression): boolean {
  if (expr.type === 'NumberLiteral') {
    return expr.unit !== undefined;
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
  const leftIsLiteral = left.type === 'NumberLiteral' ||
    (left.type === 'UnaryExpression' && left.argument.type === 'NumberLiteral');
  const rightIsLiteral = right.type === 'NumberLiteral' ||
    (right.type === 'UnaryExpression' && right.argument.type === 'NumberLiteral');

  if (leftIsLiteral && rightIsLiteral && leftHasUnit !== rightHasUnit) {
    const op = operator === '+' ? 'add' : 'subtract';
    const withUnit = leftHasUnit ? 'left' : 'right';
    const withoutUnit = leftHasUnit ? 'right' : 'left';
    throw new Error(
      `Cannot ${op} a number with angle unit (${withUnit}) and a number without unit (${withoutUnit}). ` +
      `Use explicit units: e.g., 90deg + 5deg or 1.57rad + 0.5rad`
    );
  }
}

function isStyleBlock(value: Value): value is StyleBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'StyleBlockValue';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
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
 * Project a PathBlockValue's commands to absolute coordinates from a given origin
 */
function projectCommands(commands: PathBlockCommand[], originX: number, originY: number): PathBlockCommand[] {
  return commands.map(cmd => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { x: cmd.start.x + originX, y: cmd.start.y + originY },
    end: { x: cmd.end.x + originX, y: cmd.end.y + originY },
  }));
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
      parts.push(`C ${formatNum(cmd.start.x + dx1)} ${formatNum(cmd.start.y + dy1)} ${formatNum(cmd.start.x + dx2)} ${formatNum(cmd.start.y + dy2)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    } else if (c === 's') {
      // s dx2 dy2 dx dy → S x2 y2 x y
      const [dx2, dy2] = cmd.args;
      parts.push(`S ${formatNum(cmd.start.x + dx2)} ${formatNum(cmd.start.y + dy2)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    } else if (c === 'q') {
      // q dx1 dy1 dx dy → Q x1 y1 x y
      const [dx1, dy1] = cmd.args;
      parts.push(`Q ${formatNum(cmd.start.x + dx1)} ${formatNum(cmd.start.y + dy1)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    } else if (c === 't') {
      parts.push(`T ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
    } else if (c === 'a') {
      // a rx ry rotation largeArc sweep dx dy → A rx ry rotation largeArc sweep x y
      const [rx, ry, rotation, largeArc, sweep] = cmd.args;
      parts.push(`A ${formatNum(rx)} ${formatNum(ry)} ${formatNum(rotation)} ${formatNum(largeArc)} ${formatNum(sweep)} ${formatNum(cmd.end.x)} ${formatNum(cmd.end.y)}`);
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
    // Try to evaluate the raw value string as an expression
    let resolvedValue = prop.value;
    try {
      const parseResult = expressionParser.parse(prop.value);
      if (parseResult.status) {
        const evaluated = evaluateExpression(parseResult.value, scope);
        if (typeof evaluated === 'number') {
          resolvedValue = formatNum(evaluated);
        } else if (typeof evaluated === 'string') {
          resolvedValue = evaluated;
        } else if (isColorValue(evaluated)) {
          resolvedValue = oklchToCSS(evaluated.oklch);
        } else if (isCSSVarValue(evaluated)) {
          resolvedValue = evaluated.fallback ? `var(${evaluated.varName}, ${evaluated.fallback})` : `var(${evaluated.varName})`;
        }
        // For other types, keep raw string
      }
    } catch {
      // Parse or eval failed — keep raw string (handles rgb(...), #hex, multi-value strings, etc.)
    }
    // Auto-wrap URL-reference properties with url(#...)
    if (URL_REF_PROPERTIES.has(prop.name) && typeof resolvedValue === 'string' && !(/^url\(/i).test(resolvedValue)) {
      resolvedValue = `url(#${resolvedValue})`;
    }
    properties[prop.name] = resolvedValue;
  }
  return { type: 'StyleBlockValue', properties };
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  switch (expr.type) {
    case 'NumberLiteral':
      return convertAngleUnit(expr.value, expr.unit);

    case 'StringLiteral':
      return expr.value;

    case 'NullLiteral':
      return null;

    case 'Identifier':
      return lookupVariable(scope, expr.name, getLine(expr), getCol(expr));

    case 'ArrayLiteral': {
      const elements = expr.elements.map((el) => evaluateExpression(el, scope));
      return { type: 'ArrayValue' as const, elements };
    }

    case 'ObjectLiteral': {
      const props = new Map<string, Value>();
      for (const { key, value } of expr.properties) {
        props.set(key, evaluateExpression(value, scope));
      }
      return { type: 'ObjectValue', properties: props } as ObjectValue;
    }

    case 'IndexExpression':
      return evaluateIndexExpression(expr, scope);

    case 'MethodCallExpression':
      return evaluateMethodCall(expr, scope);

    case 'BinaryExpression': {
      // Check for angle unit mismatch before evaluation for +/-
      if (expr.operator === '+' || expr.operator === '-') {
        checkAngleUnitMismatch(expr.left, expr.right, expr.operator);
      }

      const left = evaluateExpression(expr.left, scope);
      const right = evaluateExpression(expr.right, scope);

      // << operator: PathBlock concatenation or style block merge
      if (expr.operator === '<<') {
        if (isPathBlockValue(left) && isPathBlockValue(right)) {
          const concatCmds = concatenateCommands(left.commands, left.endPoint, right.commands);
          if (concatCmds.length === 0) {
            return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
          }
          const lastCmd = concatCmds[concatCmds.length - 1];
          return {
            type: 'PathBlockValue' as const,
            commands: concatCmds,
            pathStrings: concatCmds.map(c => commandToPathString(c)),
            startPoint: { x: 0, y: 0 },
            endPoint: { x: lastCmd.end.x, y: lastCmd.end.y },
          };
        }
        if (isStyleBlock(left) && isStyleBlock(right)) {
          return { type: 'StyleBlockValue', properties: { ...left.properties, ...right.properties } };
        }
        throw new Error(formatError('Operator << requires matching operand types (both style blocks or both path blocks)', getLine(expr)));
      }

      // Null equality checks
      if (expr.operator === '==' || expr.operator === '!=') {
        if (left === null || right === null) {
          if (expr.operator === '==') return (left === null && right === null) ? 1 : 0;
          return (left === null && right === null) ? 0 : 1;
        }
      }

      // String equality: == and != work for strings
      if ((expr.operator === '==' || expr.operator === '!=') &&
          typeof left === 'string' && typeof right === 'string') {
        if (expr.operator === '==') return left === right ? 1 : 0;
        return left !== right ? 1 : 0;
      }

      // Null in arithmetic
      if (left === null || right === null) {
        throw new Error(formatError('Cannot use null in arithmetic expression', getLine(expr)));
      }

      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new Error(formatError(`Binary operator ${expr.operator} requires numeric operands`, getLine(expr)));
      }

      switch (expr.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '<': return left < right ? 1 : 0;
        case '>': return left > right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
        case '&&': return left && right ? 1 : 0;
        case '||': return left || right ? 1 : 0;
      }
    }

    case 'UnaryExpression': {
      const arg = evaluateExpression(expr.argument, scope);
      if (arg === null) {
        throw new Error(formatError('Cannot use null in arithmetic expression', getLine(expr)));
      }
      if (typeof arg !== 'number') {
        throw new Error(formatError(`Unary operator ${expr.operator} requires numeric operand`, getLine(expr)));
      }
      switch (expr.operator) {
        case '-': return -arg;
        case '!': return arg ? 0 : 1;
      }
    }

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
      return evaluatePathBlockExpression(expr as PathBlockExpression, scope);

    default:
      throw new Error(`Unknown expression type: ${(expr as Expression).type}`);
  }
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
  const commands: PathBlockCommand[] = blockContext.commands.map(entry => ({
    command: entry.command,
    args: [...entry.args],
    start: { x: entry.start.x, y: entry.start.y },
    end: { x: entry.end.x, y: entry.end.y },
  }));

  return {
    type: 'PathBlockValue',
    commands,
    pathStrings: accum.filter(s => s.length > 0),
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
      throw new Error(formatError(
        `Absolute path command '${stmt.command}' is not allowed inside path blocks. Use lowercase '${stmt.command.toLowerCase()}' for relative commands`,
        getLine(stmt)
      ));
    }
  }
  evaluateStatementToAccum(stmt, scope, accum);
}

function evaluateIndexExpression(expr: IndexExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);
  const index = evaluateExpression(expr.index, scope);

  if (isObjectValue(obj)) {
    if (typeof index !== 'string') {
      throw new Error('Object key must be a string');
    }
    return obj.properties.get(index) ?? null;
  }

  if (typeof obj === 'string') {
    if (typeof index !== 'number') {
      throw new Error('String index must be a number');
    }
    if (!Number.isInteger(index) || index < 0 || index >= obj.length) {
      throw new Error(`String index ${index} out of bounds (length ${obj.length})`);
    }
    return obj[index];
  }

  if (!isArrayValue(obj)) {
    throw new Error('Index access requires an array, object, or string');
  }
  if (typeof index !== 'number') {
    throw new Error('Array index must be a number');
  }
  if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length) {
    throw new Error(`Array index ${index} out of bounds (length ${obj.elements.length})`);
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
    const transformRef = obj as TransformReference;
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
    const propRef = obj as TransformPropertyReference;

    if (expr.method === 'reset') {
      if (expr.args.length !== 0) throw mError(`transform.${propRef.property}.reset() expects 0 arguments`);
      propRef.state[propRef.property] = null;
      return 0;
    }

    if (expr.method === 'set') {
      const args = expr.args.map(a => {
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
            activeCtx = (defaultLayer as PathLayerState).pathContext;
          }
        }

        const originX = activeCtx.position.x;
        const originY = activeCtx.position.y;

        // Emit relative path commands to the active accumulator
        // The path strings are already relative, so we emit them directly
        // The context tracking will handle position updates
        const emittedCommands: string[] = [];
        for (const pathStr of obj.pathStrings) {
          emittedCommands.push(pathStr);
          // Parse and track context for each command string
          parseAndTrackPathString(pathStr, scope);
        }

        // Build the ProjectedPathValue with absolute coordinates
        const projected: ProjectedPathValue = {
          type: 'ProjectedPathValue',
          commands: projectCommands(obj.commands, originX, originY),
          startPoint: { x: obj.startPoint.x + originX, y: obj.startPoint.y + originY },
          endPoint: { x: obj.endPoint.x + originX, y: obj.endPoint.y + originY },
        };

        // Return as PathWithResult — emits path AND returns ProjectedPath
        return {
          type: 'PathWithResult' as const,
          path: emittedCommands.join(' '),
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const originX = reversed[0].start.x;
        const originY = reversed[0].start.y;
        const normalizedCmds = reversed.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - originX, y: cmd.start.y - originY },
          end: { x: cmd.end.x - originX, y: cmd.end.y - originY },
        }));
        const lastCmd = normalizedCmds[normalizedCmds.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: normalizedCmds,
          pathStrings: normalizedCmds.map(c => commandToPathString(c)),
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
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const oOriginX = offsetResult[0].start.x;
        const oOriginY = offsetResult[0].start.y;
        const oNormalized = offsetResult.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - oOriginX, y: cmd.start.y - oOriginY },
          end: { x: cmd.end.x - oOriginX, y: cmd.end.y - oOriginY },
        }));
        const oLast = oNormalized[oNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: oNormalized,
          pathStrings: oNormalized.map(c => commandToPathString(c)),
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const mOriginX = mirrored[0].start.x;
        const mOriginY = mirrored[0].start.y;
        const mNormalized = mirrored.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - mOriginX, y: cmd.start.y - mOriginY },
          end: { x: cmd.end.x - mOriginX, y: cmd.end.y - mOriginY },
        }));
        const mLast = mNormalized[mNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: mNormalized,
          pathStrings: mNormalized.map(c => commandToPathString(c)),
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const rOriginX = rotated[0].start.x;
        const rOriginY = rotated[0].start.y;
        const rNormalized = rotated.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - rOriginX, y: cmd.start.y - rOriginY },
          end: { x: cmd.end.x - rOriginX, y: cmd.end.y - rOriginY },
        }));
        const rLast = rNormalized[rNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: rNormalized,
          pathStrings: rNormalized.map(c => commandToPathString(c)),
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const sLast = scaled[scaled.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: scaled,
          pathStrings: scaled.map(c => commandToPathString(c)),
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        // Normalize to (0,0) origin for PathBlockValue
        const spOriginX = subResult[0].start.x;
        const spOriginY = subResult[0].start.y;
        const spNormalized = subResult.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - spOriginX, y: cmd.start.y - spOriginY },
          end: { x: cmd.end.x - spOriginX, y: cmd.end.y - spOriginY },
        }));
        const spLast = spNormalized[spNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: spNormalized,
          pathStrings: spNormalized.map(c => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: spLast.end.x, y: spLast.end.y },
        };
      }

      default:
        throw mError(`Unknown PathBlock method: ${expr.method}`);
    }
  }

  // ProjectedPathValue methods: get(), tangent(), normal(), partition()
  if (isProjectedPathValue(obj)) {
    switch (expr.method) {
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
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const spOriginX = subResult[0].start.x;
        const spOriginY = subResult[0].start.y;
        const spNormalized = subResult.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x - spOriginX, y: cmd.start.y - spOriginY },
          end: { x: cmd.end.x - spOriginX, y: cmd.end.y - spOriginY },
        }));
        const spLast = spNormalized[spNormalized.length - 1];
        return {
          type: 'PathBlockValue' as const,
          commands: spNormalized,
          pathStrings: spNormalized.map(c => commandToPathString(c)),
          startPoint: { x: 0, y: 0 },
          endPoint: { x: spLast.end.x, y: spLast.end.y },
        };
      }

      default:
        throw mError(`Unknown ProjectedPath method: ${expr.method}`);
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
      default:
        throw mError(`Unknown Point method: ${expr.method}`);
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
        if (expr.args.length < 1 || expr.args.length > 2) throw mError('Mask.append() expects 1-2 arguments (path, styles?)');
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

  // Color methods
  if (isColorValue(obj)) {
    switch (expr.method) {
      case 'lighten': {
        if (expr.args.length !== 1) throw mError('lighten() expects 1 argument');
        const amount = evaluateExpression(expr.args[0], scope);
        if (typeof amount !== 'number') throw mError('lighten() amount must be a number');
        return { type: 'ColorValue', oklch: lighten(obj.oklch, amount) };
      }
      case 'darken': {
        if (expr.args.length !== 1) throw mError('darken() expects 1 argument');
        const amount = evaluateExpression(expr.args[0], scope);
        if (typeof amount !== 'number') throw mError('darken() amount must be a number');
        return { type: 'ColorValue', oklch: darken(obj.oklch, amount) };
      }
      case 'saturate': {
        if (expr.args.length !== 1) throw mError('saturate() expects 1 argument');
        const factor = evaluateExpression(expr.args[0], scope);
        if (typeof factor !== 'number') throw mError('saturate() factor must be a number');
        return { type: 'ColorValue', oklch: saturate(obj.oklch, factor) };
      }
      case 'desaturate': {
        if (expr.args.length !== 1) throw mError('desaturate() expects 1 argument');
        const factor = evaluateExpression(expr.args[0], scope);
        if (typeof factor !== 'number') throw mError('desaturate() factor must be a number');
        return { type: 'ColorValue', oklch: desaturate(obj.oklch, factor) };
      }
      case 'alpha': {
        if (expr.args.length !== 1) throw mError('alpha() expects 1 argument');
        const a = evaluateExpression(expr.args[0], scope);
        if (typeof a !== 'number') throw mError('alpha() value must be a number');
        return { type: 'ColorValue', oklch: setAlpha(obj.oklch, a) };
      }
      case 'hueShift': {
        if (expr.args.length !== 1) throw mError('hueShift() expects 1 argument');
        const degrees = evaluateExpression(expr.args[0], scope);
        if (typeof degrees !== 'number') throw mError('hueShift() degrees must be a number');
        return { type: 'ColorValue', oklch: hueShift(obj.oklch, degrees) };
      }
      case 'complement': {
        if (expr.args.length !== 0) throw mError('complement() expects 0 arguments');
        return { type: 'ColorValue', oklch: hueShift(obj.oklch, 180) };
      }
      case 'mix': {
        if (expr.args.length !== 2) throw mError('mix() expects 2 arguments');
        const other = evaluateExpression(expr.args[0], scope);
        const t = evaluateExpression(expr.args[1], scope);
        if (!isColorValue(other)) throw mError('mix() first argument must be a Color');
        if (typeof t !== 'number') throw mError('mix() second argument (ratio) must be a number');
        return { type: 'ColorValue', oklch: mixColors(obj.oklch, other.oklch, t) };
      }
      default:
        throw mError(`Unknown Color method: ${expr.method}`);
    }
  }

  // ColorNamespace methods (Color.mix)
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
        return { type: 'ColorValue', oklch: mixColors(c1.oklch, c2.oklch, t) };
      }
      default:
        throw mError(`Unknown Color method: ${expr.method}`);
    }
  }

  // ObjectNamespace methods (Object.keys, Object.values, Object.entries, Object.delete)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ObjectNamespace') {
    const args = expr.args.map(a => evaluateExpression(a, scope));
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
        const entries = Array.from(args[0].properties.entries()).map(
          ([k, v]) => ({ type: 'ArrayValue' as const, elements: [k, v] as Value[] })
        );
        return { type: 'ArrayValue', elements: entries };
      }
      case 'delete': {
        if (args.length !== 2 || !isObjectValue(args[0])) throw mError('Object.delete() expects 2 arguments (object, key)');
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

  // String methods
  if (typeof obj === 'string') {
    switch (expr.method) {
      case 'empty': {
        if (expr.args.length !== 0) throw mError('empty() expects 0 arguments');
        return obj.length === 0 ? 1 : 0;
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
        return obj.includes(val) ? 1 : 0;
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
      return obj.elements.length === 0 ? 1 : 0;
    }
    default:
      throw mError(`Unknown array method: ${expr.method}`);
  }
}

function formatValueForDisplay(val: Value): string {
  if (val === null) return 'null';
  if (typeof val === 'number') return formatNum(val);
  if (typeof val === 'string') return val;
  if (isPointValue(val)) {
    return `Point(${formatNum(val.x)}, ${formatNum(val.y)})`;
  }
  if (isPathBlockValue(val)) {
    return `PathBlock(${val.commands.length} commands)`;
  }
  if (isProjectedPathValue(val)) {
    return `ProjectedPath(${formatNum(val.startPoint.x)}, ${formatNum(val.startPoint.y)} → ${formatNum(val.endPoint.x)}, ${formatNum(val.endPoint.y)})`;
  }
  if (isObjectValue(val)) {
    const entries = Array.from(val.properties.entries())
      .map(([k, v]) => `${k}: ${formatValueForDisplay(v)}`);
    return '{' + entries.join(', ') + '}';
  }
  if (isCyclerValue(val)) {
    return `Cycler(${val.elements.length} items, index ${val.index})`;
  }
  if (isSVGFragmentValue(val)) {
    const preview = val.rawContent.length > 60
      ? val.rawContent.slice(0, 60) + '...'
      : val.rawContent;
    return `SVGDocumentFragment(${preview})`;
  }
  if (isMaskValue(val)) {
    return `Mask(${val.id}, ${val.paths.length} paths)`;
  }
  if (isClipPathValue(val)) {
    return `ClipPath(${val.id}, ${val.paths.length} paths)`;
  }
  if (isColorValue(val)) {
    return `Color(${oklchToCSS(val.oklch)})`;
  }
  if (isCSSVarValue(val)) {
    return val.fallback ? `CSSVar(${val.varName}, ${val.fallback})` : `CSSVar(${val.varName})`;
  }
  if (isArrayValue(val)) {
    return '[' + val.elements.map(formatValueForDisplay).join(', ') + ']';
  }
  return String(val);
}

function evaluateTemplateLiteral(tl: TemplateLiteral, scope: Scope): string {
  return tl.parts.map(part => {
    if (typeof part === 'string') return part;
    const val = evaluateExpression(part, scope);
    return formatValueForDisplay(val);
  }).join('');
}

function evaluateMemberExpression(expr: MemberExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);

  // Handle PointValue property access
  if (isPointValue(obj)) {
    if (expr.property === 'x') return obj.x;
    if (expr.property === 'y') return obj.y;
    throw new Error(`Property '${expr.property}' does not exist on Point`);
  }

  // Handle PathBlockValue property access
  if (isPathBlockValue(obj)) {
    switch (expr.property) {
      case 'length': return calculatePathLength(obj.commands);
      case 'vertices': return { type: 'ArrayValue' as const, elements: extractVertices(obj.commands) };
      case 'subPathCount': return countSubPaths(obj.commands);
      case 'subPathCommands': return {
        type: 'ArrayValue' as const,
        elements: obj.commands.map(cmd => ({
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['command', cmd.command],
            ['args', { type: 'ArrayValue' as const, elements: cmd.args as Value[] }],
            ['start', { type: 'PointValue' as const, x: cmd.start.x, y: cmd.start.y }],
            ['end', { type: 'PointValue' as const, x: cmd.end.x, y: cmd.end.y }],
          ]),
        })),
      };
      case 'startPoint': return { type: 'PointValue' as const, x: obj.startPoint.x, y: obj.startPoint.y };
      case 'endPoint': return { type: 'PointValue' as const, x: obj.endPoint.x, y: obj.endPoint.y };
      default:
        throw new Error(`Property '${expr.property}' does not exist on PathBlock`);
    }
  }

  // Handle ProjectedPathValue property access
  if (isProjectedPathValue(obj)) {
    switch (expr.property) {
      case 'length': return calculatePathLength(obj.commands);
      case 'vertices': return { type: 'ArrayValue' as const, elements: extractVertices(obj.commands) };
      case 'subPathCount': return countSubPaths(obj.commands);
      case 'subPathCommands': return {
        type: 'ArrayValue' as const,
        elements: obj.commands.map(cmd => ({
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['command', cmd.command],
            ['args', { type: 'ArrayValue' as const, elements: cmd.args as Value[] }],
            ['start', { type: 'PointValue' as const, x: cmd.start.x, y: cmd.start.y }],
            ['end', { type: 'PointValue' as const, x: cmd.end.x, y: cmd.end.y }],
          ]),
        })),
      };
      case 'startPoint': return { type: 'PointValue' as const, x: obj.startPoint.x, y: obj.startPoint.y };
      case 'endPoint': return { type: 'PointValue' as const, x: obj.endPoint.x, y: obj.endPoint.y };
      default:
        throw new Error(`Property '${expr.property}' does not exist on ProjectedPath`);
    }
  }

  // Handle TransformReference property access
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformReference') {
    const transformRef = obj as TransformReference;
    if (expr.property === 'translate' || expr.property === 'rotate' || expr.property === 'scale') {
      return { type: 'TransformPropertyReference' as const, state: transformRef.state, property: expr.property };
    }
    throw new Error(`Property '${expr.property}' does not exist on transform`);
  }

  // Handle TransformPropertyReference property access (read)
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'TransformPropertyReference') {
    const propRef = obj as TransformPropertyReference;
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
    const contextObj = obj as ContextObject;

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

  // Handle ColorValue property access
  if (isColorValue(obj)) {
    switch (expr.property) {
      case 'css': return oklchToCSS(obj.oklch);
      case 'hex': return oklchToHex(obj.oklch);
      case 'oklch': return oklchToOKLCHString(obj.oklch);
      case 'hsl': return oklchToHSLString(obj.oklch);
      case 'rgb': return oklchToRGBString(obj.oklch);
      case 'lightness': return obj.oklch.L;
      case 'chroma': return obj.oklch.C;
      case 'hue': return obj.oklch.H;
      case 'a': return obj.oklch.alpha;
      default:
        throw new Error(`Property '${expr.property}' does not exist on Color`);
    }
  }

  // Handle CSSVarValue property access
  if (isCSSVarValue(obj)) {
    switch (expr.property) {
      case 'var': return obj.varName;
      case 'fallback': return obj.fallback;
      case 'css': return obj.fallback ? `var(${obj.varName}, ${obj.fallback})` : `var(${obj.varName})`;
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
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'LayerReference') {
    const layerRef = obj as LayerReference;
    if (expr.property === 'ctx') {
      if (layerRef.layer.layerType !== 'PathLayer') {
        throw new Error(`Property 'ctx' is only available on PathLayer references`);
      }
      const pathLayer = layerRef.layer as PathLayerState;
      return { type: 'ContextObject' as const, value: contextToObject(pathLayer.pathContext, pathLayer.transformState) };
    }
    if (expr.property === 'name') {
      return layerRef.layer.name;
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
        } else if (isPointValue(value)) {
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
        } else if (isColorValue(value)) {
          stringValue = formatValueForDisplay(value);
        } else if (isCSSVarValue(value)) {
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

    scope.evalState!.logs.push({ line: lineNumber, parts });
    return { type: 'PathSegment' as const, value: '' };  // Empty path segment
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

  // Handle Cycler() constructor
  if (call.name === 'Cycler') {
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(`Cycler() expects 1-2 arguments, got ${call.args.length}`);
    }
    const list = evaluateExpression(call.args[0], scope);
    if (!isArrayValue(list)) throw new Error('Cycler() first argument must be an array');
    if (list.elements.length === 0) throw new Error('Cycler() array must not be empty');

    let elements = [...list.elements]; // shallow copy

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
    if (scope.evalState.masks.has(id) || scope.evalState.clipPaths.has(id)) {
      throw new Error(`Duplicate defs ID '${id}': a Mask or ClipPath with this ID already exists`);
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
    if (scope.evalState.masks.has(id) || scope.evalState.clipPaths.has(id)) {
      throw new Error(`Duplicate defs ID '${id}': a Mask or ClipPath with this ID already exists`);
    }
    const clipPath: ClipPathValue = { type: 'ClipPathValue', id, paths: [] };
    scope.evalState.clipPaths.set(id, clipPath);
    return clipPath;
  }

  // Handle Color() constructor
  if (call.name === 'Color') {
    if (call.args.length === 1) {
      // String-based: Color('#ff0000'), Color('red'), Color('rgb(...)'), etc.
      const arg = evaluateExpression(call.args[0], scope);
      if (typeof arg !== 'string') throw new Error('Color() with 1 argument expects a color string');
      return { type: 'ColorValue' as const, oklch: parseColor(arg) };
    } else if (call.args.length === 3 || call.args.length === 4) {
      // Numeric OKLCH: Color(L, C, H) or Color(L, C, H, alpha)
      const L = evaluateExpression(call.args[0], scope);
      const C = evaluateExpression(call.args[1], scope);
      const H = evaluateExpression(call.args[2], scope);
      if (typeof L !== 'number') throw new Error('Color() L must be a number');
      if (typeof C !== 'number') throw new Error('Color() C must be a number');
      if (typeof H !== 'number') throw new Error('Color() H must be a number');
      let alpha = 1;
      if (call.args.length === 4) {
        const a = evaluateExpression(call.args[3], scope);
        if (typeof a !== 'number') throw new Error('Color() alpha must be a number');
        alpha = a;
      }
      return { type: 'ColorValue' as const, oklch: { L, C, H, alpha } };
    } else {
      throw new Error(`Color() expects 1, 3, or 4 arguments, got ${call.args.length}`);
    }
  }

  // Handle CSSVar() constructor
  if (call.name === 'CSSVar') {
    if (call.args.length < 1 || call.args.length > 2) {
      throw new Error(`CSSVar() expects 1 or 2 arguments, got ${call.args.length}`);
    }
    const name = evaluateExpression(call.args[0], scope);
    if (typeof name !== 'string') throw new Error('CSSVar() first argument must be a string');
    if (!name.startsWith('--')) throw new Error("CSSVar() variable name must start with '--'");
    let fallback: string | null = null;
    if (call.args.length === 2) {
      const fb = evaluateExpression(call.args[1], scope);
      if (typeof fb === 'string') {
        fallback = fb;
      } else if (isColorValue(fb)) {
        fallback = oklchToCSS(fb.oklch);
      } else {
        throw new Error('CSSVar() fallback must be a string or Color');
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
    const result = (fn as (...args: number[]) => number)(...args as number[]);

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
    const userFn = fn as UserFunction;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(formatError(
        `Function ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`,
        getLine(call),
        getCol(call)
      ));
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
      return formatNum(convertAngleUnit(arg.value, arg.unit));

    case 'Identifier': {
      const value = lookupVariable(scope, arg.name, getLine(arg), getCol(arg));
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
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
          return (value as PathWithResult).path;
        }
      }
      throw new Error(`Function ${arg.name} did not return a valid path value`);
    }

    case 'MemberExpression': {
      const value = evaluateMemberExpression(arg, scope);
      if (value === null) {
        throw new Error('Cannot use null as a path argument');
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
          return (value as PathSegment).value;
        }
        if (value.type === 'PathWithResult') {
          return (value as PathWithResult).path;
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
      numericArgs.push(convertAngleUnit(arg.value, arg.unit));
    } else if (arg.type === 'Identifier') {
      const value = lookupVariable(scope, arg.name);
      if (typeof value === 'number') {
        numericArgs.push(value);
      }
    } else if (arg.type === 'CalcExpression') {
      const value = evaluateExpression(arg.expression, scope);
      if (typeof value === 'number') {
        numericArgs.push(value);
      }
    } else if (arg.type === 'MemberExpression') {
      const value = evaluateMemberExpression(arg, scope);
      if (typeof value === 'number') {
        numericArgs.push(value);
      }
    } else if (arg.type === 'FunctionCall') {
      const value = evaluateFunctionCall(arg, scope);
      if (typeof value === 'number') {
        numericArgs.push(value);
      }
      // PathSegments don't contribute to numeric args for context tracking
    } else if (arg.type === 'IndexExpression') {
      const value = evaluateIndexExpression(arg, scope);
      if (typeof value === 'number') {
        numericArgs.push(value);
      }
    } else if (arg.type === 'MethodCallExpression') {
      const value = evaluateMethodCall(arg, scope);
      if (typeof value === 'number') {
        numericArgs.push(value);
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
    let transformState = scope.evalState.transformState;
    if (scope.evalState.activeLayerName) {
      const layer = scope.evalState.layers.get(scope.evalState.activeLayerName);
      if (layer && layer.layerType === 'PathLayer') {
        transformState = (layer as PathLayerState).transformState;
      }
    }

    rootScope.variables.set('ctx', {
      type: 'ContextObject' as const,
      value: contextToObject(scope.evalState.pathContext, transformState),
    });
  }
}

function getActiveTextLayer(scope: Scope): TextLayerState | null {
  if (!scope.evalState?.activeLayerName) return null;
  const layer = scope.evalState.layers.get(scope.evalState.activeLayerName);
  if (!layer || layer.layerType !== 'TextLayer') return null;
  return layer as TextLayerState;
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
function evaluateContextAwareFunction(name: string, args: Value[], scope: Scope, loc?: { line?: number; column?: number }): Value {
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
      setLastTangent(ctx, angle);  // Set tangent to movement direction
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
        Math.abs(ctx.position.x - startX) < tolerance &&
        Math.abs(ctx.position.y - startY) < tolerance;

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
        throw new Error(formatError('tangentLine requires a previous path command that establishes direction', loc?.line, loc?.column));
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
        throw new Error(formatError('tangentArc requires a previous path command that establishes direction', loc?.line, loc?.column));
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
  const result = cmd.command + (stringArgs.length > 0 ? ' ' + stringArgs.join(' ') : '');

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
  const commandRegex = /([MLHVCSQTAZmlhvcsqtaz])\s*([\d\s.,-]*)/g;
  let match;

  while ((match = commandRegex.exec(pathStr)) !== null) {
    const command = match[1];
    const argsStr = match[2].trim();

    // Parse numeric arguments
    const args: number[] = [];
    if (argsStr) {
      const numMatches = argsStr.match(/-?[\d.]+/g);
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
      const rot = item.rotation ? requireNumber(evaluateExpression(item.rotation, scope), 'tspan() rotation') : undefined;
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

      const MAX_ITERATIONS = 10000;
      const ascending = start <= end;
      const iterations = ascending ? (end - start + 1) : (start - end + 1);
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
      const isTruthy = condition !== null && (typeof condition === 'number' ? condition !== 0 : Boolean(condition));
      if (isTruthy) {
        evaluateTextBody(item.consequent as TextBodyItem[], scope, children);
      } else if (item.alternate) {
        evaluateTextBody(item.alternate as TextBodyItem[], scope, children);
      }
    } else if (item.type === 'LetDeclaration') {
      const value = evaluateExpression(item.value, scope);
      setVariable(scope, item.name, value);
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
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value as PathWithResult;
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
        const pwr = value as PathWithResult;
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
          throw new Error(formatError(`Array index ${index} out of bounds`, getLine(stmt)));
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

      const MAX_ITERATIONS = 10000;
      const ascending = start <= end;
      // Inclusive ranges: both start and end are included
      const iterations = ascending ? (end - start + 1) : (start - end + 1);
      if (iterations > MAX_ITERATIONS) {
        throw new Error(formatError(`for loop would run ${iterations} iterations (max ${MAX_ITERATIONS})`, getLine(stmt)));
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
      const isTruthy = condition !== null && (typeof condition === 'number' ? condition !== 0 : Boolean(condition));

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

    case 'PathCommand': {
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodResult = evaluateMethodCall(stmt.args[0] as MethodCallExpression, scope);
        // If the method returns a PathWithResult (e.g., draw()), emit its path
        if (typeof methodResult === 'object' && methodResult !== null && 'type' in methodResult && methodResult.type === 'PathWithResult') {
          const pwr = methodResult as PathWithResult;
          if (pwr.path) {
            if (scope.evalState && scope.evalState.defaultLayerName && !scope.evalState.activeLayerName) {
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
            throw new Error(formatError('Path commands cannot be routed to a TextLayer. Use a PathLayer as default or wrap in a layer().apply block', getLine(stmt)));
          }
        }
      }
      const result = evaluatePathCommand(stmt, scope);
      if (result) {
        // Route path commands to default layer if one is defined and we're not in an apply block
        if (scope.evalState && scope.evalState.defaultLayerName && !scope.evalState.activeLayerName) {
          const defaultLayer = scope.evalState.layers.get(scope.evalState.defaultLayerName)! as PathLayerState;
          defaultLayer.accum.push(result);
        } else {
          accum.push(result);
        }
      }
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
      if (scope.evalState.layers.has(nameValue)) {
        throw new Error(formatError(`Duplicate layer name: '${nameValue}'`, getLine(stmt)));
      }
      if (stmt.isDefault && scope.evalState.defaultLayerName !== null) {
        throw new Error(formatError(`Cannot define multiple default layers. '${scope.evalState.defaultLayerName}' is already the default`, getLine(stmt)));
      }
      const styleValue = evaluateExpression(stmt.styleExpr, scope);
      if (!isStyleBlock(styleValue)) {
        throw new Error(formatError('Layer style must be a style block', getLine(stmt)));
      }
      const styles: LayerStyle = { ...styleValue.properties };
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
      const nameValue = evaluateExpression(stmt.layerName, scope);
      if (typeof nameValue !== 'string') {
        throw new Error(formatError('Layer name must be a string', getLine(stmt)));
      }
      const layer = scope.evalState.layers.get(nameValue);
      if (!layer) {
        throw new Error(formatError(`Undefined layer: '${nameValue}'`, getLine(stmt)));
      }
      if (scope.evalState.activeLayerName !== null) {
        throw new Error(formatError(`Cannot nest layer apply blocks. Already inside layer '${scope.evalState.activeLayerName}'`, getLine(stmt)));
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

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

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
    // Add defined layers in definition order
    for (const name of evalState.layerOrder) {
      const layer = evalState.layers.get(name)!;
      if (layer.layerType === 'FragmentLayer') {
        const fragmentLayer = layer as FragmentLayerState;
        layers.push({
          name: layer.name,
          type: 'fragment',
          data: '',
          fragmentDefs: fragmentLayer.defsContent,
          fragmentVisuals: fragmentLayer.visualContent,
          styles: { ...layer.styles },
          isDefault: false,
        });
      } else if (layer.layerType === 'TextLayer') {
        const textLayer = layer as TextLayerState;
        const allText = textLayer.textElements
          .map(te => te.children.map(c => c.text).join(''))
          .join(' ');
        layers.push({
          name: layer.name,
          type: 'text',
          data: allText,
          textElements: textLayer.textElements,
          styles: { ...layer.styles },
          isDefault: layer.isDefault,
        });
      } else {
        const pathLayer = layer as PathLayerState;
        const transform = transformStateToSvg(pathLayer.transformState) ?? undefined;
        layers.push({
          name: layer.name,
          type: 'path',
          data: pathLayer.accum.join(' '),
          styles: { ...layer.styles },
          isDefault: layer.isDefault,
          transform,
        });
      }
    }
  }

  // Build masks output
  const masks: MaskOutput[] = [];
  for (const [, mask] of evalState.masks) {
    masks.push({
      id: mask.id,
      elements: mask.paths.map(p => ({ pathData: p.d, styles: { ...p.styles } })),
    });
  }

  // Build clipPaths output
  const clipPaths: ClipPathOutput[] = [];
  for (const [, clip] of evalState.clipPaths) {
    clipPaths.push({
      id: clip.id,
      elements: clip.paths.map(d => ({ pathData: d })),
    });
  }

  return {
    layers,
    masks,
    clipPaths,
    logs: evalState.logs,
    calledStdlibFunctions: Array.from(evalState.calledStdlibFunctions),
  };
}

export function evaluate(program: Program, options?: { toFixed?: number }): CompileResult {
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
  context: PathContext;
  logs: LogEntry[];
  calledStdlibFunctions: string[];  // Stdlib function names invoked during evaluation
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
}

/**
 * Options for evaluateWithContext
 */
export interface EvaluateWithContextOptions {
  /** Whether to track command history (default: false for performance) */
  trackHistory?: boolean;
  /** Fixed decimal precision for number formatting */
  toFixed?: number;
}

/**
 * Evaluate a program with path context tracking
 * Returns compile result with layers, context, and log() outputs
 */
export function evaluateWithContext(program: Program, options: EvaluateWithContextOptions = {}): EvaluateWithContextResult {
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

    return {
      path: compileResult.layers[0]?.data ?? '',
      context: pathContext,
      logs,
      calledStdlibFunctions: Array.from(calledStdlibFunctions),
      layers: compileResult.layers,
      masks: compileResult.masks,
      clipPaths: compileResult.clipPaths,
    };
  } finally {
    resetNumberFormat();
  }
}

// Re-export types from context module
export type { PathContext, Point, CommandHistoryEntry, TransformState } from './context';


// Re-export annotated evaluator and formatter
export { evaluateAnnotated, type AnnotatedOutput, type AnnotatedLine } from './annotated';
export { formatAnnotated, type FormatOptions } from './formatter';
