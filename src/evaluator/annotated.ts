// Annotated evaluator - produces human-readable output with comments and annotations
import { contextAwareFunctions, stdlib } from '../stdlib';
import { contextToObject, createPathContext, setLastTangent, updateContextForCommand } from './context';
import {
  commandToPathString,
  computeBoundingBox,
  chamferCommands,
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
import { sanitizeSVGFragment } from './svg-sanitize';
import { parseExpression as expressionParserFn } from '../parser/lezer-expression';
const expressionParser = { parse: (input: string) => { const v = expressionParserFn(input); return { status: v !== null, value: v }; } };
import { partitionPath, samplePathAtFraction } from './sampling';
import { estimateTextBoundingBox } from './font-metrics';
import { getFont, glyphToPathBlockCommands, splitContours } from './font-provider';
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

import type { PathContext } from './context';
import type { OKLCH } from '../color';
import type { PathBlockCommand, Point, TextBlockElement, TextBlockValue, ProjectedTextValue, TextChild } from './types';
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
  Statement,
  StyleBlockLiteral,
  TemplateLiteral,
  TextBlockExpression,
  TextBodyItem,
} from '../parser/ast';

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

// BooleanValue type (mirrors main evaluator)
export interface BooleanValue {
  type: 'BooleanValue';
  value: 0 | 1;
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
  return undefined;
}

/** Built-in enum definitions */
const BUILTIN_ENUMS: Record<string, Record<string, string>> = {
  Easing: { Linear: 'linear', Smoothstep: 'smoothstep', EaseIn: 'ease-in', EaseOut: 'ease-out', EaseInOut: 'ease-in-out' },
  Interpolation: { SRGB: 'srgb', OKLCH: 'oklch', LinearRGB: 'linearRGB' },
  SpreadMethod: { Pad: 'pad', Reflect: 'reflect', Repeat: 'repeat' },
  GradientUnits: { ObjectBoundingBox: 'objectBoundingBox', UserSpaceOnUse: 'userSpaceOnUse' },
  Direction: { CW: 'cw', CCW: 'ccw' },
  ConicSpread: { Clamp: 'clamp', Repeat: 'repeat', Transparent: 'transparent' },
  InnerFill: { Transparent: 'transparent', TransparentBlend: 'transparent-blend', Center: 'center' },
  TopoMethod: { Distance: 'distance', Laplace: 'laplace' },
};

// Value types (same as main evaluator)
export type Value =
  | number
  | string
  | null
  | BooleanValue
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
  | PatternValue
  | ColorValue
  | ColorNamespace
  | CSSVarValue
  | TextBlockValue
  | ProjectedTextValue;

export interface SVGFragmentValue {
  type: 'SVGFragmentValue';
  defsContent: string;
  visualContent: string;
  rawContent: string;
}

function isSVGFragmentValue(value: Value): value is SVGFragmentValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'SVGFragmentValue';
}

export interface GradientValue {
  type: 'GradientValue';
  gradientType: 'linear' | 'radial' | 'conic';
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
}

function isGradientValue(value: Value): value is GradientValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'GradientValue';
}

export interface PatternValue {
  type: 'PatternValue';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  paths: { d: string; styles: Record<string, string> }[];
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
}

function isPatternValue(value: Value): value is PatternValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'PatternValue';
}

export interface ColorValue {
  type: 'ColorValue';
  oklch: OKLCH;
  cssVar?: { varName: string; fallback: string };
  cssExpr?: string;
  lightDark?: { lightCSS: string; darkCSS: string };
}

function isColorValue(value: Value): value is ColorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ColorValue';
}

export interface ColorNamespace {
  type: 'ColorNamespace';
}

export interface CSSVarValue {
  type: 'CSSVarValue';
  varName: string;
  fallback: string | null;
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

export interface ObjectNamespace {
  type: 'ObjectNamespace';
}

export interface PathBlockNamespace {
  type: 'PathBlockNamespace';
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

function buildPathBlockFromCommands(cmds: PathBlockCommand[], origin?: { x: number; y: number }): PathBlockValue {
  if (cmds.length === 0) {
    return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
  }
  const originX = origin ? origin.x : cmds[0].start.x;
  const originY = origin ? origin.y : cmds[0].start.y;
  const normalized = cmds.map((cmd) => ({
    command: cmd.command, args: [...cmd.args],
    start: { x: cmd.start.x - originX, y: cmd.start.y - originY },
    end: { x: cmd.end.x - originX, y: cmd.end.y - originY },
  }));
  const last = normalized[normalized.length - 1];
  return {
    type: 'PathBlockValue' as const, commands: normalized,
    pathStrings: normalized.map((c) => commandToPathString(c)),
    startPoint: { x: 0, y: 0 }, endPoint: { x: last.end.x, y: last.end.y },
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
  }));
}

function commandsToRelativeD(commands: PathBlockCommand[]): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
  const parts: string[] = [];
  for (const cmd of commands) {
    const c = cmd.command;
    const dx = cmd.end.x - cmd.start.x;
    const dy = cmd.end.y - cmd.start.y;
    if (c === 'z') {
      parts.push('z');
    } else if (c === 'h') {
      parts.push(`h ${fmt(dx)}`);
    } else if (c === 'v') {
      parts.push(`v ${fmt(dy)}`);
    } else if (c === 'c') {
      const [dx1, dy1, dx2, dy2] = cmd.args;
      parts.push(`c ${fmt(dx1)} ${fmt(dy1)} ${fmt(dx2)} ${fmt(dy2)} ${fmt(dx)} ${fmt(dy)}`);
    } else if (c === 's') {
      const [dx2, dy2] = cmd.args;
      parts.push(`s ${fmt(dx2)} ${fmt(dy2)} ${fmt(dx)} ${fmt(dy)}`);
    } else if (c === 'q') {
      const [dx1, dy1] = cmd.args;
      parts.push(`q ${fmt(dx1)} ${fmt(dy1)} ${fmt(dx)} ${fmt(dy)}`);
    } else if (c === 't') {
      parts.push(`t ${fmt(dx)} ${fmt(dy)}`);
    } else if (c === 'a') {
      const [rx, ry, rotation, largeArc, sweep] = cmd.args;
      parts.push(`a ${fmt(rx)} ${fmt(ry)} ${fmt(rotation)} ${fmt(largeArc)} ${fmt(sweep)} ${fmt(dx)} ${fmt(dy)}`);
    } else {
      // m, l → relative move/line
      parts.push(`${c} ${fmt(dx)} ${fmt(dy)}`);
    }
  }
  return parts.join(' ');
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
  path: string; // The path string to emit
  result: ContextObject; // The result value (for assignments)
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
  fontRegistry?: import('./types').FontRegistry;
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
      numericArgs.push(convertUnitSuffix(arg.value, arg.unit));
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

function isStyleBlock(value: Value): value is StyleBlockValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'StyleBlockValue';
}

function isAnnotatedLayerRef(value: Value): value is AnnotatedLayerRef {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'LayerReference';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
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
        } else if (isCSSVarValue(evaluated)) {
          resolvedValue = evaluated.fallback
            ? `var(${evaluated.varName}, ${evaluated.fallback})`
            : `var(${evaluated.varName})`;
        } else if (isGradientValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
        } else if (isPatternValue(evaluated)) {
          resolvedValue = `url(#${evaluated.id})`;
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
      const mAngle = evaluateExpression(expr.args[0], scope);
      if (typeof mAngle !== 'number') throw new Error('mirror() argument must be a number');
      if (isBlock) {
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
      const rAngle = evaluateExpression(expr.args[1], scope);
      if (typeof rIdx !== 'number') throw new Error('rotateAtVertexIndex() index must be a number');
      if (typeof rAngle !== 'number') throw new Error('rotateAtVertexIndex() angle must be a number');
      if (!Number.isInteger(rIdx)) throw new Error('rotateAtVertexIndex() index must be an integer');
      if (isBlock) {
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
      if (typeof cvIdx !== 'number' || !Number.isInteger(cvIdx)) throw new Error('chamferAtVertex() index must be an integer');
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
      if (typeof fvIdx !== 'number' || !Number.isInteger(fvIdx)) throw new Error('filletAtVertex() index must be an integer');
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
        efRot = evaluateExpression(expr.args[2], scope) as number;
        if (typeof efRot !== 'number') throw new Error('ellipticalFillet() rotation must be a number');
      }
      const efResult = ellipticalFilletCommands(obj.commands, efRx, efRy, efRot, null);
      return buildAnnotatedResult(efResult.commands, isBlock, obj);
    }

    case 'ellipticalFilletAtVertex': {
      if (expr.args.length < 3 || expr.args.length > 4) throw new Error('ellipticalFilletAtVertex() expects 3-4 arguments');
      const efvIdx = evaluateExpression(expr.args[0], scope);
      if (typeof efvIdx !== 'number' || !Number.isInteger(efvIdx)) throw new Error('ellipticalFilletAtVertex() index must be an integer');
      const efvRx = evaluateExpression(expr.args[1], scope);
      const efvRy = evaluateExpression(expr.args[2], scope);
      if (typeof efvRx !== 'number') throw new Error('ellipticalFilletAtVertex() rx must be a number');
      if (typeof efvRy !== 'number') throw new Error('ellipticalFilletAtVertex() ry must be a number');
      let efvRot = 0;
      if (expr.args.length === 4) {
        efvRot = evaluateExpression(expr.args[3], scope) as number;
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
        case 'union': resultCmds = pathUnion(obj.commands, otherCmds); break;
        case 'difference': resultCmds = pathDifference(obj.commands, otherCmds); break;
        case 'intersection': resultCmds = pathIntersection(obj.commands, otherCmds); break;
        case 'xor': resultCmds = pathXor(obj.commands, otherCmds); break;
        default: resultCmds = [];
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
      return { type: 'PathBlockValue' as const, commands: [], pathStrings: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
    }
    return { type: 'ProjectedPathValue' as const, commands: [], startPoint: { ...original.startPoint }, endPoint: { ...original.startPoint } };
  }
  if (isBlock) {
    const originX = cmds[0].start.x;
    const originY = cmds[0].start.y;
    const normalized = cmds.map((cmd) => ({
      command: cmd.command, args: [...cmd.args],
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
  const start = cmds[0].start;
  const end = cmds[cmds.length - 1].end;
  return {
    type: 'ProjectedPathValue' as const,
    commands: cmds,
    startPoint: { x: start.x, y: start.y },
    endPoint: { x: end.x, y: end.y },
  };
}

function evaluateMethodCall(expr: MethodCallExpression, scope: Scope): Value {
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

      // Emit relative commands (naturally work from cursor position)
      const emittedPath = commandsToRelativeD(obj.commands);

      // Track the relative path in context
      if (scope.evalState) {
        parseAndTrackPathString(emittedPath, scope);
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

      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
      const moveCmd = `M ${fmt(dtX)} ${fmt(dtY)}`;
      const relativeD = commandsToRelativeD(obj.commands);
      const emittedPath = `${moveCmd} ${relativeD}`;

      if (scope.evalState) {
        parseAndTrackPathString(emittedPath, scope);
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

      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
      const moveCmd = `M ${fmt(dtX)} ${fmt(dtY)}`;
      const relativeD = commandsToRelativeD(reProjectedCommands);
      const emittedPath = `${moveCmd} ${relativeD}`;

      if (scope.evalState) {
        parseAndTrackPathString(emittedPath, scope);
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
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
          ]),
        };
      }
      case 'polarProject': {
        if (expr.args.length !== 5) throw mError('polarProject() expects 5 arguments');
        const ppx = evaluateExpression(expr.args[0], scope);
        const ppy = evaluateExpression(expr.args[1], scope);
        const ppAngle = evaluateExpression(expr.args[2], scope);
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number' || typeof ppy !== 'number' || typeof ppAngle !== 'number' || typeof ppDist !== 'number') {
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
          pathStrings: [],
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
            ['x', bb.x], ['y', bb.y], ['width', bb.width], ['height', bb.height],
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
        const ppAngle = evaluateExpression(expr.args[2], scope);
        const ppDist = evaluateExpression(expr.args[3], scope);
        const ppAnchor = evaluateExpression(expr.args[4], scope);
        if (typeof ppx !== 'number' || typeof ppy !== 'number' || typeof ppAngle !== 'number' || typeof ppDist !== 'number') {
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
      default:
        throw mError(`Unknown Gradient method: ${expr.method}`);
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
          throw mError('PathBlock.fromGlyph() requires font data. Use @font directive to load a font.');
        }

        const fontData = getFont(registry, fontFamily, fontWeight);
        if (!fontData) {
          const available = Array.from(registry.fonts.keys()).join(', ');
          throw mError(`Font '${fontFamily}' not found in font registry. Available fonts: ${available || 'none'}`);
        }

        const glyphs: Value[] = [];
        for (const char of textArg) {
          const { commands, advanceWidth } = glyphToPathBlockCommands(fontData, char, fontSize);
          if (commands.length === 0) {
            const pb: PathBlockValue = {
              type: 'PathBlockValue' as const,
              commands: [],
              pathStrings: [],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
            };
            (pb as PathBlockValue & { advanceWidth: number }).advanceWidth = advanceWidth;
            glyphs.push(pb);
            continue;
          }
          const normalized = buildPathBlockFromCommands(commands, { x: 0, y: 0 });
          (normalized as PathBlockValue & { advanceWidth: number }).advanceWidth = advanceWidth;
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
      if (expr.args.length !== 0) throw mError('map() does not take arguments — use map {|item| ... }');
      if (!expr.block) throw mError('map() requires a trailing block: array.map {|item| return ...; }');
      const result: Value[] = [];
      const mapParams = expr.block.params;
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(scope);
        setVariable(blockScope, mapParams[0], obj.elements[i]);
        if (mapParams.length > 1) setVariable(blockScope, mapParams[1], i);
        if (mapParams.length > 2) setVariable(blockScope, mapParams[2], obj);
        try {
          for (const stmt of expr.block.body) {
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
      if (expr.args.length !== 1) throw mError('reduce() expects 1 argument (initial value)');
      if (!expr.block) throw mError('reduce() requires a trailing block: array.reduce(init) {|acc, item| return acc; }');
      let accumulator: Value = evaluateExpression(expr.args[0], scope);
      const reduceParams = expr.block.params;
      for (let i = 0; i < obj.elements.length; i++) {
        const blockScope = createScope(scope);
        setVariable(blockScope, reduceParams[0], accumulator);
        if (reduceParams.length > 1) setVariable(blockScope, reduceParams[1], obj.elements[i]);
        if (reduceParams.length > 2) setVariable(blockScope, reduceParams[2], i);
        if (reduceParams.length > 3) setVariable(blockScope, reduceParams[3], obj);
        try {
          for (const stmt of expr.block.body) {
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
    default:
      throw mError(`Unknown array method: ${expr.method}`);
  }
}

function evaluateExpression(expr: Expression, scope: Scope): Value {
  const line = (expr as { loc?: { line: number } }).loc?.line;

  switch (expr.type) {
    case 'NumberLiteral':
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
        if (isAnnotatedLayerRef(left) && isStyleBlock(right)) {
          return left; // Return same ref, no real layer state in annotated mode
        }
        throw new Error(
          formatError('Operator << requires matching operand types (both style blocks, both path blocks, or text block << style block)', line),
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
        const ls = typeof left === 'string' ? left : (isBooleanValue(left) ? (left.value ? 'true' : 'false') : undefined);
        const rs = typeof right === 'string' ? right : (isBooleanValue(right) ? (right.value ? 'true' : 'false') : undefined);
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
          if (typeof val === 'number') return String(val);
          if (typeof val === 'string') return val;
          if (isObjectValue(val)) {
            const entries = Array.from(val.properties.entries()).map(
              ([k, v]) => `${k}: ${v === null ? 'null' : String(v)}`,
            );
            return `{${entries.join(', ')}}`;
          }
          if (isArrayValue(val))
            return `[${val.elements
              .map((e) => {
                if (e === null) return 'null';
                if (typeof e === 'number') return String(e);
                if (typeof e === 'string') return e;
                return String(e);
              })
              .join(', ')}]`;
          if (isTextBlockValue(val)) return `TextBlock(${val.elements.length} elements)`;
          if (isProjectedTextValue(val)) return `ProjectedText(${val.origin.x}, ${val.origin.y}, ${val.elements.length} elements)`;
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

  const commands: PathBlockCommand[] = blockContext.commands.map((entry) => ({
    command: entry.command.toLowerCase(),
    args: [...entry.args],
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
    if (stmt.type === 'LayerDefinition' || stmt.type === 'LayerApplyBlock' || stmt.type === 'PathCommand') {
      continue;
    }

    // TextStatement: accumulate elements
    if (stmt.type === 'TextStatement') {
      const x = evaluateExpression(stmt.x, blockScope);
      const y = evaluateExpression(stmt.y, blockScope);
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const rotation = stmt.rotation
        ? (evaluateExpression(stmt.rotation, blockScope) as number)
        : undefined;
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
      if (typeof val === 'number') return String(val);
      if (typeof val === 'string') return val;
      if (isTextBlockValue(val)) return `TextBlock(${val.elements.length} elements)`;
      if (isProjectedTextValue(val)) return `ProjectedText(${val.origin.x}, ${val.origin.y}, ${val.elements.length} elements)`;
      return String(val);
    })
    .join('');
}

/**
 * Evaluate text body items (TemplateLiteral, TspanStatement, loops, etc.) in annotated mode
 */
function evaluateAnnotatedTextBody(items: TextBodyItem[], scope: Scope, children: TextChild[]): void {
  for (const item of items) {
    if (item.type === 'TemplateLiteral') {
      const text = evaluateAnnotatedTemplateLiteral(item, scope);
      children.push({ type: 'run', text });
    } else if (item.type === 'TspanStatement') {
      const text = evaluateAnnotatedTemplateLiteral(item.content, scope);
      const dx = item.dx ? (evaluateExpression(item.dx, scope) as number) : undefined;
      const dy = item.dy ? (evaluateExpression(item.dy, scope) as number) : undefined;
      const rot = item.rotation ? (evaluateExpression(item.rotation, scope) as number) : undefined;
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
        }
      } else {
        for (let i = start; i >= end; i--) {
          const loopScope = createScope(scope);
          setVariable(loopScope, item.variable, i);
          evaluateAnnotatedTextBody(item.body as TextBodyItem[], loopScope, children);
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
        }
      }
    } else if (item.type === 'IfStatement') {
      const condition = evaluateExpression(item.condition, scope);
      const isTruthy = condition !== null && (isBooleanValue(condition) ? condition.value !== 0 : typeof condition === 'number' ? condition !== 0 : Boolean(condition));
      if (isTruthy) {
        evaluateAnnotatedTextBody(item.consequent as TextBodyItem[], scope, children);
      } else if (item.alternate) {
        evaluateAnnotatedTextBody(item.alternate as TextBodyItem[], scope, children);
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
      case 'contours': {
        const contourGroups = splitContours(obj.commands);
        const contourBlocks: Value[] = contourGroups.map((cmds) =>
          buildPathBlockFromCommands(cmds, { x: 0, y: 0 }),
        );
        return { type: 'ArrayValue' as const, elements: contourBlocks };
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
      default:
        throw new Error(formatError(`Property '${expr.property}' does not exist on Gradient`, line));
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
        throw new Error(formatError(`Property '${expr.property}' does not exist on Color`, line));
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

  // Handle ContextObject property access
  if (typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'ContextObject') {
    const contextObj = obj;
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
    let fallback: string | null = null;
    if (call.args.length === 2) {
      const fb = evaluateExpression(call.args[1], scope);
      if (typeof fb === 'number') {
        fallback = String(fb);
      } else if (typeof fb === 'string') {
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
    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    return evaluateContextAwareFunction(call.name, args, scope, call.loc);
  }

  const fn = lookupVariable(scope, call.name);

  if (typeof fn === 'function') {
    const args = call.args.map((arg) => evaluateExpression(arg, scope));
    return (fn as (...args: number[]) => number)(...(args as number[]));
  }

  if (typeof fn === 'object' && fn !== null && 'type' in fn && fn.type === 'UserFunction') {
    const userFn = fn;
    const args = call.args.map((arg) => evaluateExpression(arg, scope));

    if (args.length !== userFn.params.length) {
      throw new Error(`Function ${call.name} expects ${userFn.params.length} arguments, got ${args.length}`);
    }

    const fnScope = createScope(scope);
    userFn.params.forEach((param, i) => {
      setVariable(fnScope, param, args[i]);
    });

    // For annotated output, evaluate with context if available
    if (ctx) {
      const argsStr = args.map((a) => String(a)).join(', ');
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
      if (isBooleanValue(value)) return String(value.value);
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
      if (isBooleanValue(value)) return String(value.value);
      if (typeof value !== 'number') {
        throw new Error('calc() must evaluate to a number');
      }
      return String(value);
    }

    case 'FunctionCall': {
      const value = evaluateFunctionCall(arg, scope, null);
      // Void functions (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      if (typeof value === 'number') {
        return String(value);
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
      if (isBooleanValue(value)) return String(value.value);
      if (typeof value === 'number') {
        return String(value);
      }
      throw new Error(`Member expression did not evaluate to a number`);
    }

    case 'IndexExpression': {
      const value = evaluateIndexExpression(arg, scope);
      if (value === null) throw new Error('Cannot use null as a path argument');
      if (isBooleanValue(value)) return String(value.value);
      if (typeof value === 'number') return String(value);
      throw new Error('Index expression did not evaluate to a number');
    }

    case 'MethodCallExpression': {
      const value = evaluateMethodCall(arg, scope);
      // Void method calls (side-effect only) return undefined/null/'' — treat as empty path
      if (value === undefined || value === null || value === '') {
        return '';
      }
      if (typeof value === 'number') return String(value);
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

// Plain evaluation (no annotations) for nested contexts
function evaluateStatementPlain(stmt: Statement, scope: Scope): string {
  switch (stmt.type) {
    case 'Comment':
      return '';

    case 'LetDeclaration': {
      const value = evaluateExpression(stmt.value, scope);
      if (stmt.pattern) {
        const bindValue = (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') ? value.result : value;
        bindDestructuringPattern(stmt.pattern, bindValue, scope, getLine(stmt));
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') return value.path;
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
      const isTruthy = condition !== null && (isBooleanValue(condition) ? condition.value !== 0 : typeof condition === 'number' ? condition !== 0 : Boolean(condition));

      if (isTruthy) {
        const results: string[] = [];
        for (const bodyStmt of stmt.consequent) {
          const result = evaluateStatementPlain(bodyStmt, createScope(scope));
          if (result) results.push(result);
        }
        return results.join(' ');
      }
      if (stmt.alternate) {
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

    case 'EnumDefinition': {
      if (scope.variables.has(stmt.name)) {
        throw new Error(formatError(`Enum '${stmt.name}' is already defined`, (stmt as { loc?: { line: number } }).loc?.line));
      }
      const enumProps = new Map<string, Value>();
      for (const member of stmt.members) {
        const val = member.value
          ? evaluateExpression(member.value, scope)
          : member.name.toLowerCase();
        enumProps.set(member.name, val);
      }
      setVariable(scope, stmt.name, { type: 'ObjectValue', properties: enumProps } as ObjectValue);
      return '';
    }

    case 'PathCommand': {
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

    case 'MemberAssignmentStatement': {
      const obj = evaluateExpression(stmt.object, scope);
      const value = evaluateExpression(stmt.value, scope);
      // Handle Pattern property assignment
      if (isPatternValue(obj)) {
        if (typeof value === 'string') {
          switch (stmt.property) {
            case 'patternUnits':
              obj.patternUnits = value;
              break;
            case 'patternTransform':
              obj.patternTransform = value;
              break;
            case 'patternContentUnits':
              obj.patternContentUnits = value;
              break;
          }
        }
      }
      // Handle Gradient property assignment (including conic fields)
      if (isGradientValue(obj)) {
        switch (stmt.property) {
          case 'spreadMethod':
          case 'gradientUnits':
          case 'gradientTransform': {
            if (typeof value === 'string') {
              if (stmt.property === 'spreadMethod') obj.spreadMethod = value;
              else if (stmt.property === 'gradientUnits') obj.gradientUnits = value;
              else obj.gradientTransform = value;
            }
            break;
          }
          case 'interpolation': {
            if (typeof value === 'string' && (value === 'srgb' || value === 'oklch' || value === 'linearRGB')) {
              obj.interpolation = value;
            }
            break;
          }
          case 'steps': {
            if (typeof value === 'number') obj.steps = value;
            break;
          }
          case 'from':
          case 'to': {
            if (typeof value === 'number') obj[stmt.property] = value;
            break;
          }
          case 'direction': {
            if (value === 'cw' || value === 'ccw') obj.direction = value;
            break;
          }
          case 'spread': {
            if (typeof value === 'string') obj.spread = value;
            break;
          }
        }
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

    case 'FontDirective':
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
        const bindValue = (typeof value === 'object' && value !== null && 'type' in value && value.type === 'PathWithResult') ? value.result : value;
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
          const argsStr = methodExpr.args.map((a) => String(evaluateExpression(a, scope))).join(', ');
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
      const isTruthy = condition !== null && (isBooleanValue(condition) ? condition.value !== 0 : typeof condition === 'number' ? condition !== 0 : Boolean(condition));

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

    case 'EnumDefinition': {
      if (scope.variables.has(stmt.name)) {
        throw new Error(formatError(`Enum '${stmt.name}' is already defined`, (stmt as { loc?: { line: number } }).loc?.line));
      }
      const enumAnnotatedProps = new Map<string, Value>();
      for (const member of stmt.members) {
        const val = member.value
          ? evaluateExpression(member.value, scope)
          : member.name.toLowerCase();
        enumAnnotatedProps.set(member.name, val);
      }
      setVariable(scope, stmt.name, { type: 'ObjectValue', properties: enumAnnotatedProps } as ObjectValue);
      break;
    }

    case 'PathCommand': {
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
            const argsStr = methodExpr.args.map((a) => String(evaluateExpression(a, scope))).join(', ');
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
          const argsStr = args.map((a) => String(a)).join(', ');
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
          const result = (fn as (...args: number[]) => number)(...(args as number[]));
          if (
            typeof result === 'object' &&
            result !== null &&
            'type' in result &&
            (result as PathSegment).type === 'PathSegment'
          ) {
            // Split path segment into individual commands for better formatting
            const pathStr = (result as PathSegment).value;
            const argsStr = args.map((a) => String(a)).join(', ');
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
            const argsStr = args.map((a) => String(a)).join(', ');
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
                const argsStr = methodExpr.args.map((a) => String(evaluateExpression(a, scope))).join(', ');
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

    case 'MemberAssignmentStatement': {
      const maObj = evaluateExpression(stmt.object, scope);
      const maValue = evaluateExpression(stmt.value, scope);
      // Handle Pattern property assignment
      if (isPatternValue(maObj)) {
        if (typeof maValue === 'string') {
          switch (stmt.property) {
            case 'patternUnits':
              maObj.patternUnits = maValue;
              break;
            case 'patternTransform':
              maObj.patternTransform = maValue;
              break;
            case 'patternContentUnits':
              maObj.patternContentUnits = maValue;
              break;
          }
        }
      }
      // Handle Gradient property assignment (including conic fields)
      if (isGradientValue(maObj)) {
        switch (stmt.property) {
          case 'spreadMethod':
          case 'gradientUnits':
          case 'gradientTransform': {
            if (typeof maValue === 'string') {
              if (stmt.property === 'spreadMethod') maObj.spreadMethod = maValue;
              else if (stmt.property === 'gradientUnits') maObj.gradientUnits = maValue;
              else maObj.gradientTransform = maValue;
            }
            break;
          }
          case 'interpolation': {
            if (typeof maValue === 'string' && (maValue === 'srgb' || maValue === 'oklch' || maValue === 'linearRGB')) {
              maObj.interpolation = maValue;
            }
            break;
          }
          case 'steps': {
            if (typeof maValue === 'number') maObj.steps = maValue;
            break;
          }
          case 'from':
          case 'to': {
            if (typeof maValue === 'number') maObj[stmt.property] = maValue;
            break;
          }
          case 'direction': {
            if (maValue === 'cw' || maValue === 'ccw') maObj.direction = maValue;
            break;
          }
          case 'spread': {
            if (typeof maValue === 'string') maObj.spread = maValue;
            break;
          }
        }
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

    case 'FontDirective':
      // Declarative metadata — no annotated output
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
