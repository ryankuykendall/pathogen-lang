import { parse } from '../parser';
import { STDLIB_COMPLETIONS } from './completion-data.generated';
import { CALLBACK_METHODS } from '../callback-methods';

import type { TextDocument } from './document';
import type { Position, Range } from './types';
import type {
  Program,
  Statement,
  Expression,
  FunctionCall,
  PathArg,
  SourceLocation,
} from '../parser/ast';

export enum InlayHintKind {
  Parameter = 1,
  Type = 2,
}

export interface InlayHint {
  position: Position;
  label: string;
  kind: InlayHintKind;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

// --- Function parameter data ---

interface FunctionParams {
  params: string[];
}

const FUNCTION_PARAMS = new Map<string, FunctionParams>();

for (const entry of STDLIB_COMPLETIONS) {
  if (entry.kind !== 'function') continue;
  const match = entry.detail.match(/^(\w+)\(([^)]*)\)/);
  if (match) {
    const name = match[1];
    const paramsStr = match[2].trim();
    const params = paramsStr ? paramsStr.split(/,\s*/) : [];
    if (params.length > 0) {
      FUNCTION_PARAMS.set(name, { params });
    }
  }
}

/**
 * Get inlay hints for a range in a document.
 * Shows parameter name hints for function calls with 2+ arguments,
 * and type hints for variable declarations with inferred types.
 */
export function getInlayHints(document: TextDocument, range: Range): InlayHint[] {
  const source = document.getText();

  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    return [];
  }

  const hints: InlayHint[] = [];
  walkStatements(ast.body, source, range, hints);
  return hints;
}

// --- AST Walking ---

function walkStatements(stmts: Statement[], source: string, range: Range, hints: InlayHint[]): void {
  for (const stmt of stmts) walkStatement(stmt, source, range, hints);
}

function walkStatement(stmt: Statement, source: string, range: Range, hints: InlayHint[]): void {
  switch (stmt.type) {
    case 'LetDeclaration':
      walkExpr(stmt.value, source, range, hints);
      // Type hint for the variable
      addTypeHint(stmt.name, stmt.value, stmt.loc, source, range, hints);
      break;
    case 'AssignmentStatement':
      walkExpr(stmt.value, source, range, hints);
      break;
    case 'FunctionDefinition':
      walkStatements(stmt.body, source, range, hints);
      break;
    case 'ForLoop':
      walkExpr(stmt.start, source, range, hints);
      walkExpr(stmt.end, source, range, hints);
      walkStatements(stmt.body, source, range, hints);
      break;
    case 'ForEachLoop':
      walkExpr(stmt.iterable, source, range, hints);
      walkStatements(stmt.body, source, range, hints);
      break;
    case 'IfStatement':
      walkExpr(stmt.condition, source, range, hints);
      walkStatements(stmt.consequent, source, range, hints);
      if (stmt.alternate) walkStatements(stmt.alternate, source, range, hints);
      break;
    case 'SwitchStatement':
      walkExpr(stmt.discriminant, source, range, hints);
      for (const c of stmt.cases) {
        for (const pattern of c.patterns) {
          if (pattern.type === 'ValuePattern') walkExpr(pattern.value, source, range, hints);
          else if (pattern.type === 'RangePattern') {
            if (pattern.start) walkExpr(pattern.start, source, range, hints);
            if (pattern.end) walkExpr(pattern.end, source, range, hints);
          }
          // Destructuring patterns bind names only — nothing to hint.
        }
        if (c.guard) walkExpr(c.guard, source, range, hints);
        walkStatements(c.body, source, range, hints);
      }
      if (stmt.defaultCase) walkStatements(stmt.defaultCase.body, source, range, hints);
      break;
    case 'PathCommand':
      for (const arg of stmt.args) walkPathArg(arg, source, range, hints);
      break;
    case 'ExpressionStatement':
      walkExpr(stmt.expression, source, range, hints);
      break;
    case 'ReturnStatement':
      walkExpr(stmt.value, source, range, hints);
      break;
    case 'BreakStatement':
    case 'ContinueStatement':
      // No child expressions
      break;
    case 'LayerApplyBlock':
      walkStatements(stmt.body, source, range, hints);
      break;
    case 'LayerDefinition':
      walkExpr(stmt.name, source, range, hints);
      walkExpr(stmt.styleExpr, source, range, hints);
      break;
    case 'ViewBoxDefinition':
      walkExpr(stmt.originX, source, range, hints);
      walkExpr(stmt.originY, source, range, hints);
      walkExpr(stmt.width, source, range, hints);
      walkExpr(stmt.height, source, range, hints);
      break;
    case 'TextStatement':
      walkExpr(stmt.x, source, range, hints);
      walkExpr(stmt.y, source, range, hints);
      if (stmt.body) for (const item of stmt.body) walkStatement(item as Statement, source, range, hints);
      break;
    default:
      break;
  }
}

function walkPathArg(arg: PathArg, source: string, range: Range, hints: InlayHint[]): void {
  if (arg.type === 'FunctionCall') addParamHints(arg, source, range, hints);
  if (arg.type === 'CalcExpression') walkExpr(arg.expression, source, range, hints);
}

function walkExpr(expr: Expression, source: string, range: Range, hints: InlayHint[]): void {
  switch (expr.type) {
    case 'FunctionCall':
      addParamHints(expr, source, range, hints);
      break;
    case 'MethodCallExpression':
      walkExpr(expr.object, source, range, hints);
      for (const arg of expr.args) walkExpr(arg, source, range, hints);
      break;
    case 'BinaryExpression':
      walkExpr(expr.left, source, range, hints);
      walkExpr(expr.right, source, range, hints);
      break;
    case 'UnaryExpression':
      walkExpr(expr.argument, source, range, hints);
      break;
    case 'TernaryExpression':
      walkExpr(expr.condition, source, range, hints);
      walkExpr(expr.consequent, source, range, hints);
      walkExpr(expr.alternate, source, range, hints);
      break;
    case 'SwitchExpression':
      walkExpr(expr.discriminant, source, range, hints);
      for (const arm of expr.arms) {
        for (const pattern of arm.patterns) {
          if (pattern.type === 'ValuePattern') walkExpr(pattern.value, source, range, hints);
          else if (pattern.type === 'RangePattern') {
            if (pattern.start) walkExpr(pattern.start, source, range, hints);
            if (pattern.end) walkExpr(pattern.end, source, range, hints);
          }
        }
        if (arm.guard) walkExpr(arm.guard, source, range, hints);
        walkExpr(arm.value, source, range, hints);
      }
      walkExpr(expr.defaultValue, source, range, hints);
      break;
    case 'CalcExpression':
      walkExpr(expr.expression, source, range, hints);
      break;
    case 'ArrayLiteral':
      for (const el of expr.elements) {
        if (el.type === 'SpreadElement') walkExpr(el.argument, source, range, hints);
        else walkExpr(el, source, range, hints);
      }
      break;
    case 'IndexExpression':
      walkExpr(expr.object, source, range, hints);
      walkExpr(expr.index, source, range, hints);
      break;
    case 'LambdaExpression':
      // Calls inside a lambda body get param-name hints like any other body.
      walkStatements(expr.body, source, range, hints);
      break;
    default:
      break;
  }
}

// --- Hint generation ---

/**
 * Add parameter name hints for function calls with 2+ named arguments.
 */
function addParamHints(call: FunctionCall, source: string, range: Range, hints: InlayHint[]): void {
  // Also walk child expressions
  for (const arg of call.args) walkExpr(arg, source, range, hints);

  const sig = FUNCTION_PARAMS.get(call.name);
  if (!sig || sig.params.length < 2) return;
  if (call.args.length === 0) return;

  // Find argument positions from source by scanning from the call's loc
  const callLoc = (call as { loc?: SourceLocation }).loc;
  if (!callLoc) return;

  const argPositions = findArgPositions(source, callLoc);
  if (!argPositions) return;

  for (let i = 0; i < Math.min(call.args.length, sig.params.length, argPositions.length); i++) {
    const pos = argPositions[i];
    if (!isInRange(pos, range)) continue;

    // Don't show hint if the argument is already a named identifier matching the param
    const arg = call.args[i];
    if (arg.type === 'Identifier' && arg.name === sig.params[i]) continue;

    hints.push({
      position: pos,
      label: `${sig.params[i]}:`,
      kind: InlayHintKind.Parameter,
      paddingRight: true,
    });
  }
}

/**
 * Find the source positions where each argument starts in a function call.
 * Scans from the function call's loc to find the opening paren and each comma.
 */
function findArgPositions(source: string, callLoc: SourceLocation): Position[] | null {
  const lines = source.split('\n');
  const line = callLoc.line - 1;
  if (line < 0 || line >= lines.length) return null;

  // Find the opening paren on the call's line
  const lineText = lines[line];
  const parenIdx = lineText.indexOf('(', callLoc.column - 1);
  if (parenIdx === -1) return null;

  // Scan from after '(' to find each arg start
  const positions: Position[] = [];
  let depth = 0;
  let i = parenIdx + 1;

  // Skip whitespace to find first arg
  while (i < lineText.length && /\s/.test(lineText[i])) i++;
  if (i < lineText.length && lineText[i] !== ')') {
    positions.push({ line, character: i });
  }

  // Scan for commas to find subsequent args
  for (; i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) {
      // Skip whitespace after comma
      let j = i + 1;
      while (j < lineText.length && /\s/.test(lineText[j])) j++;
      if (j < lineText.length) {
        positions.push({ line, character: j });
      }
    }
  }

  return positions;
}

/**
 * Add a type hint for a let declaration when the type is non-obvious.
 */
function addTypeHint(
  name: string,
  value: Expression,
  loc: SourceLocation | undefined,
  source: string,
  range: Range,
  hints: InlayHint[],
): void {
  if (!loc) return;

  const inferredType = inferExprType(value);
  if (!inferredType) return;

  // Find position right after the variable name on its line
  const lines = source.split('\n');
  const line = loc.line - 1;
  if (line < 0 || line >= lines.length) return;

  const lineText = lines[line];
  const nameIndex = lineText.indexOf(name, loc.column - 1);
  if (nameIndex === -1) return;

  const pos: Position = { line, character: nameIndex + name.length };
  if (!isInRange(pos, range)) return;

  hints.push({
    position: pos,
    label: `: ${inferredType}`,
    kind: InlayHintKind.Type,
    paddingLeft: true,
  });
}

function inferExprType(expr: Expression): string | null {
  switch (expr.type) {
    case 'FunctionCall':
      // Constructors
      if (expr.name === 'Point') return 'Point';
      if (expr.name === 'PolarVector') return 'PolarVector';
      if (expr.name === 'Cycler') return 'Cycler';
      if (expr.name === 'CSSVar') return 'CSSVar';
      if (expr.name === 'Color') return 'Color';
      if (expr.name === 'Mask') return 'Mask';
      if (expr.name === 'ClipPath') return 'ClipPath';
      if (expr.name === 'Pattern') return 'Pattern';
      if (expr.name === 'Marker') return 'Marker';
      if (expr.name === 'SVGDocumentFragment') return 'SVGFragment';
      // Gradient constructors
      if (expr.name === 'LinearGradient') return 'LinearGradient';
      if (expr.name === 'RadialGradient') return 'RadialGradient';
      if (expr.name === 'ConicGradient') return 'ConicGradient';
      if (expr.name === 'MeshGradient') return 'MeshGradient';
      if (expr.name === 'FreeformGradient') return 'FreeformGradient';
      if (expr.name === 'TopoGradient') return 'TopoGradient';
      // Stdlib path functions return path segments (not useful as type hint)
      return null;
    case 'MethodCallExpression':
      // Common method return types
      if (expr.method === 'boundingBox' || expr.method === 'paddedBoundingBox') return 'BBox';
      if (expr.method === 'get' || expr.method === 'anchor' || expr.method === 'centerPoint') return 'Point';
      if (expr.method === 'slice' || expr.method === 'map' || expr.method === 'mapSlice' ||
          expr.method === 'sort' || expr.method === 'filter') return 'Array';
      if (expr.method === 'pick') return inferExprType(expr.object) === 'Cycler' ? null : null;
      // reverse() exists on Array AND PathBlock/ProjectedPath. This function is
      // scope-less, so an Identifier receiver infers null and keeps the
      // historical PathBlock fallback (same ambiguity slice already has).
      if (expr.method === 'reverse') {
        return inferExprType(expr.object) === 'Array' ? 'Array' : 'PathBlock';
      }
      if (expr.method === 'offset' || expr.method === 'subPath' ||
          expr.method === 'chamfer' || expr.method === 'fillet' || expr.method === 'union' ||
          expr.method === 'difference' || expr.method === 'intersection' || expr.method === 'xor') return 'PathBlock';
      if (expr.method === 'lighten' || expr.method === 'darken' || expr.method === 'alpha' ||
          expr.method === 'hueShift' || expr.method === 'complement' || expr.method === 'mix' ||
          expr.method === 'saturate' || expr.method === 'desaturate' ||
          expr.method === 'flatten') return 'Color';
      if (expr.method === 'toPathBlock') return 'PathBlock';
      return null;
    case 'ArrayLiteral':
      return 'Array';
    case 'ObjectLiteral':
      return 'Object';
    case 'PathBlockExpression':
      return 'PathBlock';
    case 'TextBlockExpression':
      return 'TextBlock';
    case 'ColorLiteral':
      return 'Color';
    case 'StyleBlockLiteral':
      return 'StyleBlock';
    case 'LayerConstructorExpression':
      return expr.layerType;
    case 'BinaryExpression':
      if (expr.operator === '<<') {
        // Worker application types as the completed builtin call; plain
        // merges preserve the left type.
        if (
          expr.left.type === 'MethodCallExpression' &&
          !expr.left.block &&
          CALLBACK_METHODS.has(expr.left.method)
        ) {
          const method = expr.left.method;
          if (method === 'fill') return 'Grid';
          if (method === 'variableOffset' || method === 'compoundVariableOffset') return 'PathBlock';
          if (method === 'map' || method === 'sort' || method === 'filter') {
            const recv = inferExprType(expr.left.object);
            return recv === 'Grid' ? 'Grid' : recv === 'Array' ? 'Array' : recv;
          }
          return null; // reduce (worker-determined) / forEach (void)
        }
        return inferExprType(expr.left); // merge preserves left type
      }
      return null;
    default:
      return null;
  }
}

// --- Helpers ---

function isInRange(pos: Position, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) return false;
  return true;
}
