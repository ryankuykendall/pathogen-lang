// Annotated evaluator - produces human-readable output with comments and annotations
import type {
  Program,
  Statement,
  Expression,
  PathArg,
  PathCommand,
  LetDeclaration,
  ForLoop,
  ForEachLoop,
  IfStatement,
  FunctionDefinition,
  ReturnStatement,
  FunctionCall,
  MemberExpression,
  IndexExpression,
  IndexedAssignmentStatement,
  MethodCallExpression,
  Comment,
  LayerDefinition,
  LayerApplyBlock,
  TemplateLiteral,
  TextStatement,
  TspanStatement,
  StyleBlockLiteral,
  PathBlockExpression,
} from '../parser/ast';
import { stdlib, contextAwareFunctions } from '../stdlib';
import { createPathContext, contextToObject, updateContextForCommand, setLastTangent, type PathContext } from './context';
import { expression as expressionParser } from '../parser';
import { samplePathAtFraction, partitionPath } from './sampling';
import { reverseCommands, computeBoundingBox, offsetCommands, commandToPathString, mirrorCommands, rotateAtVertexCommands, scaleCommands, concatenateCommands } from './path-transforms';

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

// Value types (same as main evaluator)
export type Value = number | string | null | PathSegment | UserFunction | ContextObject | PathWithResult | AnnotatedLayerRef | StyleBlockValue | ArrayValue | ObjectValue | ObjectNamespace | PathBlockValue | ProjectedPathValue;

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

export interface ObjectNamespace {
  type: 'ObjectNamespace';
}

interface Point {
  x: number;
  y: number;
}

export interface PathBlockCommand {
  command: string;
  args: number[];
  start: Point;
  end: Point;
}

export interface PathBlockValue {
  type: 'PathBlockValue';
  commands: PathBlockCommand[];
  pathStrings: string[];
  startPoint: Point;
  endPoint: Point;
}

function isPathBlockValue(value: Value): value is PathBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathBlockValue';
}

export interface ProjectedPathValue {
  type: 'ProjectedPathValue';
  commands: PathBlockCommand[];
  startPoint: Point;
  endPoint: Point;
}

function isProjectedPathValue(value: Value): value is ProjectedPathValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ProjectedPathValue';
}

export interface StyleBlockValue {
  type: 'StyleBlockValue';
  properties: Record<string, string>;
}

export interface AnnotatedLayerRef {
  type: 'LayerReference';
}

export interface PathSegment {
  type: 'PathSegment';
  value: string;
}

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
  result: ContextObject;  // The result value (for assignments)
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
  if (name in stdlib) {
    return stdlib[name as keyof typeof stdlib] as unknown as Value;
  }
  throw new Error(formatError(`Undefined variable: ${name}`, line, column));
}

function setVariable(scope: Scope, name: string, value: Value): void {
  scope.variables.set(name, value);
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
      const value = evaluateFunctionCall(arg, scope, null);
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
        Math.abs(ctx.position.x - startX) < tolerance &&
        Math.abs(ctx.position.y - startY) < tolerance;

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
        return { type: 'PathSegment' as const, value: `l ${dx} ${dy}` };
      }
      return { type: 'PathSegment' as const, value: `L ${x} ${y}` };
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

function isStyleBlock(value: Value): value is StyleBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'StyleBlockValue';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

function evaluateStyleBlockLiteral(expr: StyleBlockLiteral, scope: Scope): StyleBlockValue {
  const properties: Record<string, string> = {};
  for (const prop of expr.properties) {
    let resolvedValue = prop.value;
    try {
      const parseResult = expressionParser.parse(prop.value);
      if (parseResult.status) {
        const evaluated = evaluateExpression(parseResult.value, scope);
        if (typeof evaluated === 'number') {
          resolvedValue = String(evaluated);
        } else if (typeof evaluated === 'string') {
          resolvedValue = evaluated;
        }
      }
    } catch {
      // Keep raw string
    }
    properties[prop.name] = resolvedValue;
  }
  return { type: 'StyleBlockValue', properties };
}

function evaluateIndexExpression(expr: IndexExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);
  const index = evaluateExpression(expr.index, scope);
  if (isObjectValue(obj)) {
    if (typeof index !== 'string') throw new Error('Object key must be a string');
    return obj.properties.get(index) ?? null;
  }
  if (!isArrayValue(obj)) throw new Error('Index access requires an array or object');
  if (typeof index !== 'number') throw new Error('Array index must be a number');
  if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length) {
    throw new Error(`Array index ${index} out of bounds (length ${obj.elements.length})`);
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
  scope: Scope
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
          ['point', { type: 'ContextObject' as const, value: { x: result.point.x, y: result.point.y } } as unknown as Value],
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
          ['point', { type: 'ContextObject' as const, value: { x: result.point.x, y: result.point.y } } as unknown as Value],
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
        elements: points.map(p => ({
          type: 'ObjectValue' as const,
          properties: new Map<string, Value>([
            ['point', { type: 'ContextObject' as const, value: { x: p.point.x, y: p.point.y } } as unknown as Value],
            ['angle', p.tangent],
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
  scope: Scope
): Value | null {
  const isBlock = obj.type === 'PathBlockValue';

  switch (expr.method) {
    case 'reverse': {
      if (expr.args.length !== 0) throw new Error('reverse() expects 0 arguments');
      const reversed = reverseCommands(obj.commands);
      if (isBlock) {
        if (reversed.length === 0) {
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const originX = reversed[0].start.x;
        const originY = reversed[0].start.y;
        const normalizedCmds = reversed.map(cmd => ({
          command: cmd.command, args: [...cmd.args],
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
      } else {
        const projStartPoint = obj.endPoint;
        const projEndPoint = reversed.length > 0 ? reversed[reversed.length - 1].end : obj.startPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: reversed,
          startPoint: { x: projStartPoint.x, y: projStartPoint.y },
          endPoint: { x: projEndPoint.x, y: projEndPoint.y },
        };
      }
    }

    case 'boundingBox': {
      if (expr.args.length !== 0) throw new Error('boundingBox() expects 0 arguments');
      const bb = computeBoundingBox(obj.commands);
      return {
        type: 'ObjectValue' as const,
        properties: new Map<string, Value>([
          ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
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
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const oOriginX = offsetResult[0].start.x;
        const oOriginY = offsetResult[0].start.y;
        const oNormalized = offsetResult.map(cmd => ({
          command: cmd.command, args: [...cmd.args],
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
      } else {
        const oStart = offsetResult.length > 0 ? offsetResult[0].start : obj.startPoint;
        const oEnd = offsetResult.length > 0 ? offsetResult[offsetResult.length - 1].end : obj.endPoint;
        return {
          type: 'ProjectedPathValue' as const,
          commands: offsetResult,
          startPoint: { x: oStart.x, y: oStart.y },
          endPoint: { x: oEnd.x, y: oEnd.y },
        };
      }
    }

    case 'mirror': {
      if (expr.args.length !== 1) throw new Error('mirror() expects 1 argument (angle)');
      const mAngle = evaluateExpression(expr.args[0], scope);
      if (typeof mAngle !== 'number') throw new Error('mirror() argument must be a number');
      if (isBlock) {
        const mirrored = mirrorCommands(obj.commands, mAngle, { x: 0, y: 0 });
        if (mirrored.length === 0) {
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const mOriginX = mirrored[0].start.x;
        const mOriginY = mirrored[0].start.y;
        const mNormalized = mirrored.map(cmd => ({
          command: cmd.command, args: [...cmd.args],
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
      } else {
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
    }

    case 'rotateAtVertexIndex': {
      if (expr.args.length !== 2) throw new Error('rotateAtVertexIndex() expects 2 arguments (index, angle)');
      const rIdx = evaluateExpression(expr.args[0], scope);
      const rAngle = evaluateExpression(expr.args[1], scope);
      if (typeof rIdx !== 'number') throw new Error('rotateAtVertexIndex() index must be a number');
      if (typeof rAngle !== 'number') throw new Error('rotateAtVertexIndex() angle must be a number');
      if (!Number.isInteger(rIdx)) throw new Error('rotateAtVertexIndex() index must be an integer');
      if (isBlock) {
        const rotated = rotateAtVertexCommands(obj.commands, rIdx, rAngle);
        if (rotated.length === 0) {
          return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
        }
        const rOriginX = rotated[0].start.x;
        const rOriginY = rotated[0].start.y;
        const rNormalized = rotated.map(cmd => ({
          command: cmd.command, args: [...cmd.args],
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
      } else {
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
      } else {
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
    }

    default:
      return null;
  }
}

function evaluateMethodCall(expr: MethodCallExpression, scope: Scope): Value {
  const obj = evaluateExpression(expr.object, scope);

  // PathBlockValue methods: draw(), project()
  if (isPathBlockValue(obj)) {
    if (expr.method === 'draw') {
      // In annotated mode, draw() emits relative commands and returns a ProjectedPath
      const ctx = scope.evalState?.pathContext;
      const originX = ctx?.position.x ?? 0;
      const originY = ctx?.position.y ?? 0;

      // Track context updates
      for (const pathStr of obj.pathStrings) {
        if (scope.evalState) {
          parseAndTrackPathString(pathStr, scope);
        }
      }

      const projected: ProjectedPathValue = {
        type: 'ProjectedPathValue',
        commands: obj.commands.map(cmd => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x + originX, y: cmd.start.y + originY },
          end: { x: cmd.end.x + originX, y: cmd.end.y + originY },
        })),
        startPoint: { x: obj.startPoint.x + originX, y: obj.startPoint.y + originY },
        endPoint: { x: obj.endPoint.x + originX, y: obj.endPoint.y + originY },
      };

      return {
        type: 'PathWithResult' as const,
        path: obj.pathStrings.join(' '),
        result: projected as unknown as ContextObject,
      };
    }
    if (expr.method === 'project') {
      const args = expr.args.map(a => evaluateExpression(a, scope));
      const x = typeof args[0] === 'number' ? args[0] : 0;
      const y = typeof args[1] === 'number' ? args[1] : 0;
      return {
        type: 'ProjectedPathValue' as const,
        commands: obj.commands.map(cmd => ({
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
    throw new Error(`Unknown PathBlock method: ${expr.method}`);
  }

  // ProjectedPathValue methods: get(), tangent(), normal(), partition()
  if (isProjectedPathValue(obj)) {
    const pathSamplingResult = evaluateAnnotatedPathSampling(obj.commands, expr, scope);
    if (pathSamplingResult !== null) return pathSamplingResult;
    // Transform methods: reverse, boundingBox, offset
    const pathTransformResult = evaluateAnnotatedPathTransforms(obj, expr, scope);
    if (pathTransformResult !== null) return pathTransformResult;
    throw new Error(`Unknown ProjectedPath method: ${expr.method}`);
  }

  // ObjectNamespace methods
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ObjectNamespace') {
    const args = expr.args.map(a => evaluateExpression(a, scope));
    switch (expr.method) {
      case 'keys': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw new Error('Object.keys() expects 1 object argument');
        return { type: 'ArrayValue', elements: Array.from(args[0].properties.keys()) };
      }
      case 'values': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw new Error('Object.values() expects 1 object argument');
        return { type: 'ArrayValue', elements: Array.from(args[0].properties.values()) };
      }
      case 'entries': {
        if (args.length !== 1 || !isObjectValue(args[0])) throw new Error('Object.entries() expects 1 object argument');
        const entries = Array.from(args[0].properties.entries()).map(
          ([k, v]) => ({ type: 'ArrayValue' as const, elements: [k, v] as Value[] })
        );
        return { type: 'ArrayValue', elements: entries };
      }
      case 'delete': {
        if (args.length !== 2 || !isObjectValue(args[0])) throw new Error('Object.delete() expects 2 arguments (object, key)');
        const key = args[1];
        if (typeof key !== 'string') throw new Error('Object.delete() key must be a string');
        const val = args[0].properties.get(key) ?? null;
        args[0].properties.delete(key);
        return val;
      }
      default:
        throw new Error(`Unknown Object method: ${expr.method}`);
    }
  }

  // ObjectValue methods
  if (isObjectValue(obj)) {
    if (expr.method === 'has') {
      if (expr.args.length !== 1) throw new Error('has() expects 1 argument');
      const key = evaluateExpression(expr.args[0], scope);
      if (typeof key !== 'string') throw new Error('has() argument must be a string');
      return obj.properties.has(key) ? 1 : 0;
    }
    throw new Error(`Unknown object method: ${expr.method}`);
  }

  if (!isArrayValue(obj)) throw new Error(`Cannot call method '${expr.method}' on non-array value`);
  switch (expr.method) {
    case 'push': {
      if (expr.args.length !== 1) throw new Error('push() expects 1 argument');
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.push(val);
      return obj.elements.length;
    }
    case 'pop': {
      if (expr.args.length !== 0) throw new Error('pop() expects 0 arguments');
      if (obj.elements.length === 0) return null;
      return obj.elements.pop()!;
    }
    case 'shift': {
      if (expr.args.length !== 0) throw new Error('shift() expects 0 arguments');
      if (obj.elements.length === 0) return null;
      return obj.elements.shift()!;
    }
    case 'unshift': {
      if (expr.args.length !== 1) throw new Error('unshift() expects 1 argument');
      const val = evaluateExpression(expr.args[0], scope);
      obj.elements.unshift(val);
      return obj.elements.length;
    }
    case 'empty': {
      if (expr.args.length !== 0) throw new Error('empty() expects 0 arguments');
      return obj.elements.length === 0 ? 1 : 0;
    }
    default:
      throw new Error(`Unknown array method: ${expr.method}`);
  }
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  const line = (expr as { loc?: { line: number } }).loc?.line;

  switch (expr.type) {
    case 'NumberLiteral':
      return convertAngleUnit(expr.value, expr.unit);

    case 'NullLiteral':
      return null;

    case 'Identifier': {
      const idLoc = (expr as { loc?: { line: number; column: number } }).loc;
      return lookupVariable(scope, expr.name, idLoc?.line, idLoc?.column);
    }

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
        throw new Error(formatError('Operator << requires matching operand types (both style blocks or both path blocks)', line));
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
        throw new Error(formatError('Cannot use null in arithmetic expression', line));
      }

      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new Error(formatError(`Binary operator ${expr.operator} requires numeric operands`, line));
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
        throw new Error(formatError('Cannot use null in arithmetic expression', line));
      }
      if (typeof arg !== 'number') {
        throw new Error(formatError(`Unary operator ${expr.operator} requires numeric operand`, line));
      }
      switch (expr.operator) {
        case '-': return -arg;
        case '!': return arg ? 0 : 1;
      }
    }

    case 'CalcExpression':
      return evaluateExpression(expr.expression, scope);

    case 'FunctionCall':
      return evaluateFunctionCall(expr, scope, null); // No context for nested calls

    case 'StringLiteral':
      return expr.value;

    case 'MemberExpression':
      return evaluateMemberExpression(expr, scope);

    case 'TemplateLiteral':
      return expr.parts.map(part => {
        if (typeof part === 'string') return part;
        const val = evaluateExpression(part, scope);
        if (val === null) return 'null';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'string') return val;
        if (isObjectValue(val)) {
          const entries = Array.from(val.properties.entries())
            .map(([k, v]) => `${k}: ${v === null ? 'null' : String(v)}`);
          return '{' + entries.join(', ') + '}';
        }
        if (isArrayValue(val)) return '[' + val.elements.map(e => {
          if (e === null) return 'null';
          if (typeof e === 'number') return String(e);
          if (typeof e === 'string') return e;
          return String(e);
        }).join(', ') + ']';
        return String(val);
      }).join('');

    case 'StyleBlockLiteral':
      return evaluateStyleBlockLiteral(expr, scope);

    case 'PathBlockExpression':
      return evaluatePathBlockExpression(expr as PathBlockExpression, scope);

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

  const accum: string[] = [];
  for (const stmt of expr.body) {
    if (stmt.type === 'LayerDefinition' || stmt.type === 'LayerApplyBlock' || stmt.type === 'TextStatement') {
      continue; // silently skip in annotated mode
    }
    if (stmt.type === 'PathCommand' && stmt.command !== '' && stmt.command !== stmt.command.toLowerCase()) {
      continue; // skip absolute commands in annotated mode
    }
    const result = evaluateStatementPlain(stmt, blockScope);
    if (result) accum.push(result);
  }

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

function evaluateMemberExpression(expr: MemberExpression, scope: Scope): Value {
  const line = (expr as { loc?: { line: number } }).loc?.line;
  const obj = evaluateExpression(expr.object, scope);

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
      case 'startPoint': return { type: 'ContextObject' as const, value: { x: obj.startPoint.x, y: obj.startPoint.y } };
      case 'endPoint': return { type: 'ContextObject' as const, value: { x: obj.endPoint.x, y: obj.endPoint.y } };
      case 'subPathCount': {
        if (obj.commands.length === 0) return 0;
        let count = 1;
        for (let i = 1; i < obj.commands.length; i++) {
          if (obj.commands[i].command === 'm') count++;
        }
        return count;
      }
      case 'vertices': return { type: 'ArrayValue' as const, elements: [] };
      case 'subPathCommands': return { type: 'ArrayValue' as const, elements: [] };
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on PathBlock`, line));
    }
  }

  // Handle ProjectedPathValue property access
  if (isProjectedPathValue(obj)) {
    switch (expr.property) {
      case 'startPoint': return { type: 'ContextObject' as const, value: { x: obj.startPoint.x, y: obj.startPoint.y } };
      case 'endPoint': return { type: 'ContextObject' as const, value: { x: obj.endPoint.x, y: obj.endPoint.y } };
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
      case 'vertices': return { type: 'ArrayValue' as const, elements: [] };
      case 'subPathCommands': return { type: 'ArrayValue' as const, elements: [] };
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on ProjectedPath`, line));
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

  // Handle ContextObject property access
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ContextObject') {
    const contextObj = obj as ContextObject;
    const propValue = contextObj.value[expr.property];

    if (propValue === undefined) {
      throw new Error(formatError(`Property '${expr.property}' does not exist on context object`, line));
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

    throw new Error(formatError(`Cannot access property '${expr.property}' of type ${typeof propValue}`, line));
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
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'LayerReference') {
    // In annotated mode, return dummy values
    if (expr.property === 'name') return '';
    if (expr.property === 'ctx') return { type: 'ContextObject' as const, value: { position: { x: 0, y: 0 }, start: { x: 0, y: 0 }, commands: [] } };
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

  // Check if it's a context-aware function
  if (contextAwareFunctions.has(call.name)) {
    if (!scope.evalState) {
      throw new Error(`Function '${call.name}' requires evaluation context`);
    }
    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    return evaluateContextAwareFunction(call.name, args, scope, call.loc);
  }

  const fn = lookupVariable(scope, call.name);

  if (typeof fn === 'function') {
    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    return (fn as (...args: number[]) => number)(...args as number[]);
  }

  if (typeof fn === 'object' && fn !== null && 'type' in fn && fn.type === 'UserFunction') {
    const userFn = fn as UserFunction;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(
        `Function ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`
      );
    }

    const fnScope = createScope(scope);
    userFn.params.forEach((param, i) => {
      setVariable(fnScope, param, args[i]);
    });

    // For annotated output, evaluate with context if available
    if (ctx) {
      const argsStr = args.map(a => String(a)).join(', ');
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
      return String(convertAngleUnit(arg.value, arg.unit));

    case 'Identifier': {
      const argLoc = (arg as { loc?: { line: number; column: number } }).loc;
      const value = lookupVariable(scope, arg.name, argLoc?.line, argLoc?.column);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value === 'number') {
        return String(value);
      }
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathSegment') {
        return value.value;
      }
      throw new Error(`Variable ${arg.name} cannot be used as path argument`);
    }

    case 'CalcExpression': {
      const value = evaluateExpression(arg.expression, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value !== 'number') {
        throw new Error('calc() must evaluate to a number');
      }
      return String(value);
    }

    case 'FunctionCall': {
      const value = evaluateFunctionCall(arg, scope, null);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value === 'number') {
        return String(value);
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') {
          return value.value;
        }
        if (value.type === 'PathWithResult') {
          return (value as PathWithResult).path;
        }
      }
      throw new Error(`Function ${arg.name} did not return a valid path value`);
    }

    case 'MemberExpression': {
      const value = evaluateMemberExpression(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value === 'number') {
        return String(value);
      }
      throw new Error(`Member expression did not evaluate to a number`);
    }

    case 'IndexExpression': {
      const value = evaluateIndexExpression(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value === 'number') return String(value);
      throw new Error('Index expression did not evaluate to a number');
    }

    case 'MethodCallExpression': {
      const value = evaluateMethodCall(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (typeof value === 'number') return String(value);
      if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'PathSegment') return (value as PathSegment).value;
        if (value.type === 'PathWithResult') return (value as PathWithResult).path;
      }
      throw new Error('Method call did not return a valid path value');
    }

    default:
      throw new Error(`Unknown path argument type: ${(arg as PathArg).type}`);
  }
}

// Plain evaluation (no annotations) for nested contexts
function evaluateStatementPlain(stmt: Statement, scope: Scope): string {
  switch (stmt.type) {
    case 'Comment':
      return '';

    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value as PathWithResult;
        setVariable(scope, stmt.name, pwr.result);
        return pwr.path;  // Emit the path
      }
      setVariable(scope, stmt.name, value);
      return '';
    }

    case 'ForLoop': {
      const start = evaluateExpression(stmt.start, scope);
      const end = evaluateExpression(stmt.end, scope);

      if (typeof start !== 'number' || typeof end !== 'number') {
        throw new Error('for loop range must be numeric');
      }

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error('for loop range must be finite');
      }

      const MAX_ITERATIONS = 10000;
      const ascending = start <= end;
      const iterations = ascending ? (end - start + 1) : (start - end + 1);
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
          }
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          for (const bodyStmt of stmt.body) {
            const result = evaluateStatementPlain(bodyStmt, loopScope);
            if (result) results.push(result);
          }
        }
      }
      return results.join(' ');
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const isTruthy = condition !== null && (typeof condition === 'number' ? condition !== 0 : Boolean(condition));

      if (isTruthy) {
        const results: string[] = [];
        for (const bodyStmt of stmt.consequent) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
        }
        return results.join(' ');
      } else if (stmt.alternate) {
        const results: string[] = [];
        for (const bodyStmt of stmt.alternate) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
        }
        return results.join(' ');
      }
      return '';
    }

    case 'IndexedAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const index = evaluateExpression(stmt.index, scope);
      const value = evaluateExpression(stmt.value, scope);
      if (isObjectValue(obj)) {
        if (typeof index !== 'string') throw new Error('Object key must be a string');
        obj.properties.set(index, value);
      } else if (isArrayValue(obj)) {
        if (typeof index !== 'number') throw new Error('Array index must be a number');
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw new Error(`Array index ${index} out of bounds`);
        obj.elements[index] = value;
      } else {
        throw new Error('Indexed assignment requires an object or array');
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

    case 'PathCommand': {
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodResult = evaluateMethodCall(stmt.args[0] as MethodCallExpression, scope);
        if (typeof methodResult === 'object' && methodResult !== null && 'type' in methodResult && methodResult.type === 'PathWithResult') {
          return (methodResult as PathWithResult).path;
        }
        return '';
      }

      if (stmt.command === '') {
        const args = stmt.args.map((arg) => evaluatePathArg(arg, scope));
        return args.join(' ');
      }
      const args = stmt.args.map((arg) => evaluatePathArg(arg, scope));
      const result = stmt.command + (args.length > 0 ? ' ' + args.join(' ') : '');

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

    case 'LayerApplyBlock': {
      // In annotated mode, just evaluate the body normally
      const results: string[] = [];
      for (const bodyStmt of stmt.body) {
        const result = evaluateStatementPlain(bodyStmt, createScope(scope));
        if (result) results.push(result);
      }
      return results.join(' ');
    }

    case 'TextStatement':
      // In annotated plain mode, text statements are no-ops (no path output)
      return '';

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

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
      // Handle PathWithResult: assign the result to variable, emit the path
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') {
        const pwr = value as PathWithResult;
        setVariable(scope, stmt.name, pwr.result);
        // Emit annotated draw() call if the value came from a method call
        if (stmt.value.type === 'MethodCallExpression') {
          const methodExpr = stmt.value as MethodCallExpression;
          const callName = `${exprSourceName(methodExpr.object)}.${methodExpr.method}`;
          const argsStr = methodExpr.args.map(a => String(evaluateExpression(a, scope))).join(', ');
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
      const start = evaluateExpression(stmt.start, scope);
      const end = evaluateExpression(stmt.end, scope);

      if (typeof start !== 'number' || typeof end !== 'number') {
        throw new Error('for loop range must be numeric');
      }

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error('for loop range must be finite');
      }

      const MAX_ITERATIONS = 10000;
      const ascending = start <= end;
      const totalIterations = ascending ? (end - start + 1) : (start - end + 1);
      if (totalIterations > MAX_ITERATIONS) {
        throw new Error(`for loop would run ${totalIterations} iterations (max ${MAX_ITERATIONS})`);
      }

      ctx.output.push({
        type: 'loop_start',
        variable: stmt.variable,
        start: start,
        end: end,
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
          const skipCount = totalIterations - (SHOW_COUNT * 2);
          ctx.output.push({ type: 'iteration_skip', count: skipCount });
        }

        if (shouldShow) {
          ctx.output.push({ type: 'iteration', index: i });

          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);

          for (const bodyStmt of stmt.body) {
            evaluateStatementAnnotated(bodyStmt, loopScope, ctx);
          }
        } else {
          // Still need to evaluate for side effects (variable assignments, etc.)
          const loopScope = createScope(scope);
          setVariable(loopScope, stmt.variable, i);
          for (const bodyStmt of stmt.body) {
            evaluateStatementPlain(bodyStmt, loopScope);
          }
        }
      }

      ctx.indentLevel--;
      ctx.output.push({ type: 'loop_end' });
      break;
    }

    case 'IfStatement': {
      const condition = evaluateExpression(stmt.condition, scope);
      const isTruthy = condition !== null && (typeof condition === 'number' ? condition !== 0 : Boolean(condition));

      if (isTruthy) {
        for (const bodyStmt of stmt.consequent) {
          evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
        }
      } else if (stmt.alternate) {
        for (const bodyStmt of stmt.alternate) {
          evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
        }
      }
      break;
    }

    case 'IndexedAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const index = evaluateExpression(stmt.index, scope);
      const value = evaluateExpression(stmt.value, scope);
      if (isObjectValue(obj)) {
        if (typeof index !== 'string') throw new Error('Object key must be a string');
        obj.properties.set(index, value);
      } else if (isArrayValue(obj)) {
        if (typeof index !== 'number') throw new Error('Array index must be a number');
        if (!Number.isInteger(index) || index < 0 || index >= obj.elements.length)
          throw new Error(`Array index ${index} out of bounds`);
        obj.elements[index] = value;
      } else {
        throw new Error('Indexed assignment requires an object or array');
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
          const skipCount = totalIterations - (SHOW_COUNT * 2);
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
          }
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

    case 'PathCommand': {
      // Method call statements: evaluate for side effects, emit path if PathWithResult
      if (stmt.command === '' && stmt.args.length === 1 && stmt.args[0].type === 'MethodCallExpression') {
        const methodExpr = stmt.args[0] as MethodCallExpression;
        const methodResult = evaluateMethodCall(methodExpr, scope);
        if (typeof methodResult === 'object' && methodResult !== null && 'type' in methodResult && methodResult.type === 'PathWithResult') {
          const pwr = methodResult as PathWithResult;
          if (pwr.path) {
            const callName = `${exprSourceName(methodExpr.object)}.${methodExpr.method}`;
            const argsStr = methodExpr.args.map(a => String(evaluateExpression(a, scope))).join(', ');
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

        // Check for context-aware functions first
        if (contextAwareFunctions.has(funcCall.name)) {
          if (!scope.evalState) {
            throw new Error(`Function '${funcCall.name}' requires evaluation context`);
          }
          const args = funcCall.args.map((arg) => evaluateExpression(arg, scope));
          const result = evaluateContextAwareFunction(funcCall.name, args, scope, funcCall.loc);
          const argsStr = args.map(a => String(a)).join(', ');
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
              pathStr = (result as PathSegment).value;
            } else if (result.type === 'PathWithResult') {
              pathStr = (result as PathWithResult).path;
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
          const result = (fn as (...args: number[]) => number)(...args as number[]);
          if (typeof result === 'object' && result !== null && 'type' in result && (result as PathSegment).type === 'PathSegment') {
            // Split path segment into individual commands for better formatting
            const pathStr = (result as PathSegment).value;
            const argsStr = args.map(a => String(a)).join(', ');
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
            const argsStr = args.map(a => String(a)).join(', ');
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
            const methodExpr = arg as MethodCallExpression;
            const methodResult = evaluateMethodCall(methodExpr, scope);
            if (typeof methodResult === 'object' && methodResult !== null && 'type' in methodResult && methodResult.type === 'PathWithResult') {
              const pwr = methodResult as PathWithResult;
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
                const argsStr = methodExpr.args.map(a => String(evaluateExpression(a, scope))).join(', ');
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
            } else {
              // Non-draw method call, just get string value
              if (typeof methodResult === 'number') {
                leadingArgs.push(String(methodResult));
              } else if (typeof methodResult === 'object' && methodResult !== null && 'type' in methodResult) {
                if ((methodResult as PathSegment).type === 'PathSegment') leadingArgs.push((methodResult as PathSegment).value);
              }
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

    case 'LayerApplyBlock': {
      // In annotated mode, just evaluate the body into the annotated output
      for (const bodyStmt of stmt.body) {
        evaluateStatementAnnotated(bodyStmt, createScope(scope), ctx);
      }
      break;
    }

    case 'TextStatement':
      // In annotated mode, text statements are no-ops (no path output)
      break;

    case 'ReturnStatement': {
      const value = evaluateExpression(stmt.value, scope);
      throw new ReturnSignal(value);
    }

    default:
      throw new Error(`Unknown statement type: ${(stmt as Statement).type}`);
  }
}

// Helper to emit a path string as individual commands
function exprSourceName(expr: Expression): string {
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type === 'MemberExpression') return `${exprSourceName(expr.object)}.${expr.property}`;
  if (expr.type === 'MethodCallExpression') return `${exprSourceName(expr.object)}.${expr.method}`;
  return '?';
}

function emitPathString(pathStr: string, ctx: AnnotatedContext): void {
  // Simple parsing: split on command letters
  const commandRegex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let match;
  while ((match = commandRegex.exec(pathStr)) !== null) {
    const command = match[1];
    const args = match[2].trim();
    ctx.output.push({
      type: 'path_command',
      command,
      args,
    });
  }
}

function evaluateStatementsAnnotated(stmts: Statement[], scope: Scope, ctx: AnnotatedContext): void {
  for (const stmt of stmts) {
    evaluateStatementAnnotated(stmt, scope, ctx);
  }
}

export function evaluateAnnotated(program: Program, comments: Comment[]): AnnotatedOutput {
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
