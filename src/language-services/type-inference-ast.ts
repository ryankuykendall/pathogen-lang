/**
 * AST-based type inference — the tree-first path prescribed by the regex
 * audit (project-docs/regex-audit/STATUS.md, Phase 5b item 3).
 *
 * Types a declaration through its AST context (scope-analysis `DeclTypeContext`)
 * and types expressions structurally, resolving identifiers through the real
 * scope chain — position-aware where the regex engine in type-inference.ts is
 * whole-source and first-match-wins. Consumers try this path first and fall
 * back to the regex rules only when it returns null (e.g. code too broken to
 * produce a scope tree).
 *
 * Type *names* still come from the generated metadata maps
 * (completion-data.generated.ts) — the AST knows shapes, the maps know types.
 */
import {
  CONSTRUCTOR_RETURN_TYPES,
  METHOD_BLOCK_PARAMS,
  NAMESPACE_METHOD_RETURNS,
  TYPE_ELEMENT_TYPES,
  TYPE_METHOD_RETURNS,
  TYPE_PROPERTY_TYPES,
} from './completion-data.generated';
import { getMethodReturnType } from './type-inference';
import { inferUnit } from '../evaluator/units';
import { CALLBACK_METHODS } from '../callback-methods';

import type { Declaration, Scope, ScopeInfo } from './scope-analysis';
import type { Position } from './types';
import type { Expression, FunctionCall, MethodCallExpression } from '../parser/ast';

/** Stdlib path helpers whose return value draws like a PathBlock (mirrors the regex rule). */
const PATH_FUNCTION_NAMES = new Set([
  'circle',
  'rect',
  'roundRect',
  'polygon',
  'star',
  'line',
  'arc',
  'quadratic',
  'cubic',
  'cubicSpline',
  'quadSpline',
]);

/** Builtin numeric globals (kept in sync with scope-analysis BUILTIN_GLOBALS). */
const NUMERIC_GLOBALS = new Set(['PI', 'E', 'TAU', 'Infinity', 'NaN']);

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '%']);

/**
 * Infer the Pathogen type of a declared name from its AST context.
 * `seen` breaks reference cycles (let x = x; mutually-defined loops).
 */
export function inferDeclType(decl: Declaration, seen?: Set<Declaration>): string | null {
  const ctx = decl.typeContext;
  if (!ctx) return null;
  const visited = seen ?? new Set<Declaration>();
  if (visited.has(decl)) return null;
  visited.add(decl);

  switch (ctx.kind) {
    case 'init':
      return inferExprType(ctx.expr, decl.scope, visited);

    case 'arrayElement': {
      if (ctx.expr.type === 'ArrayLiteral') {
        // Positional match — bail if a spread shifts positions before ours
        const elements = ctx.expr.elements;
        for (let i = 0; i <= ctx.index && i < elements.length; i++) {
          if (elements[i].type === 'SpreadElement') return null;
        }
        const element = elements[ctx.index];
        return element ? inferExprType(element as Expression, decl.scope, visited) : null;
      }
      return inferExprElementType(ctx.expr, decl.scope, visited);
    }

    case 'objectProp': {
      if (ctx.expr.type === 'ObjectLiteral') {
        for (const prop of ctx.expr.properties) {
          if (prop.type === 'ObjectProperty' && prop.key === ctx.key) {
            return inferExprType(prop.value, decl.scope, visited);
          }
        }
        return null;
      }
      const objType = inferExprType(ctx.expr, decl.scope, visited);
      return objType ? (TYPE_PROPERTY_TYPES[objType]?.[ctx.key] ?? null) : null;
    }

    case 'loopElement':
      return inferExprElementType(ctx.iterable, decl.scope, visited);

    case 'loopIndex':
      return 'number';

    case 'blockParam':
      return inferBlockParam(ctx.call, ctx.index, decl.scope, visited);

    case 'lambdaParam':
      // A lambda literal has no owning call site, so its param types are
      // uninferable (documented row in the hover binding matrix). The one
      // exception — a literal applied as a `<<` worker — is bound as
      // blockParam by scope-analysis and never reaches this branch.
      return null;
  }
}

/** Type of a `{|...|}` block param at `index` of the given call. */
function inferBlockParam(
  call: FunctionCall | MethodCallExpression,
  index: number,
  scope: Scope,
  seen: Set<Declaration>,
): string | null {
  if (call.type === 'FunctionCall') {
    // Constructor binding blocks (Grid, Pattern, Marker, filters, ...) bind
    // the constructed object as the sole param.
    const info = CONSTRUCTOR_RETURN_TYPES[call.name];
    return info?.hasBindingBlock && index === 0 ? info.type : null;
  }

  // Array iteration blocks: element and numeric index positions
  if (call.method === 'map' || call.method === 'mapSlice' || call.method === 'filter') {
    if (index === 0) return inferExprElementType(call.object, scope, seen);
    if (index === 1) return 'number';
    return null;
  }
  if (call.method === 'reduce') {
    if (index === 1) return inferExprElementType(call.object, scope, seen);
    if (index === 2) return 'number';
    return null; // the accumulator's type is the block's own business
  }
  // sort comparator: both params are elements (unlike map, index 1 is NOT a number)
  if (call.method === 'sort') {
    if (index === 0 || index === 1) return inferExprElementType(call.object, scope, seen);
    return null;
  }

  // Method trailing blocks typed via @blockparams metadata
  // (spine.variableOffset() {|go, pb|} → VariableOffsetBuilder, PathBlock)
  const receiverType = inferExprType(call.object, scope, seen);
  return receiverType ? (METHOD_BLOCK_PARAMS[receiverType]?.[call.method]?.[index] ?? null) : null;
}

/**
 * Structurally infer the Pathogen type of an expression, resolving
 * identifiers through the scope chain.
 */
export function inferExprType(expr: Expression, scope: Scope, seen?: Set<Declaration>): string | null {
  const visited = seen ?? new Set<Declaration>();

  switch (expr.type) {
    case 'NumberLiteral':
      return expr.unit === 'deg' || expr.unit === 'rad' || expr.unit === 'pi' ? 'Angle' : 'number';
    case 'StringLiteral':
    case 'TemplateLiteral':
      return 'string';
    case 'BooleanLiteral':
      return 'boolean';
    case 'ColorLiteral':
      return 'ColorInstance';
    case 'StyleBlockLiteral':
      return 'StyleBlock';
    case 'PathBlockExpression':
      return 'PathBlock';
    case 'TextBlockExpression':
      return 'ProjectedText';
    case 'ArrayLiteral':
      return 'array';
    case 'ObjectLiteral':
      return '_ObjectLiteral';
    case 'NullLiteral':
      return null;
    case 'CalcExpression':
      // Written-expression unit inference (calc(2 * 45deg)) or structural
      // inference through variables (let a = 90deg; calc(a * 2))
      if (inferUnit(expr.expression) === 'angle') return 'Angle';
      return inferExprType(expr.expression, scope, visited) === 'Angle' ? 'Angle' : 'number';
    case 'LayerConstructorExpression':
      return expr.layerType;

    case 'UnaryExpression':
      return expr.operator === '!' ? 'boolean' : inferExprType(expr.argument, scope, visited);

    case 'BinaryExpression': {
      if (expr.operator === '<<') {
        // Worker application: the expression types as the completed builtin
        // call. Otherwise << is merge/concat, which preserves the left type.
        if (
          expr.left.type === 'MethodCallExpression' &&
          !expr.left.block &&
          CALLBACK_METHODS.has(expr.left.method)
        ) {
          const method = expr.left.method;
          if (method === 'fill') return 'Grid';
          if (method === 'variableOffset' || method === 'compoundVariableOffset') return 'PathBlock';
          if (method === 'map' || method === 'sort' || method === 'filter') {
            const recv = inferExprType(expr.left.object, scope, visited);
            return recv === 'Grid' ? 'Grid' : recv === 'array' ? 'array' : recv;
          }
          return null; // reduce (worker-determined) / forEach (void)
        }
        return inferExprType(expr.left, scope, visited);
      }
      if (!ARITHMETIC_OPS.has(expr.operator)) return null;
      const left = inferExprType(expr.left, scope, visited);
      const right = left === 'string' ? null : inferExprType(expr.right, scope, visited);
      // Angle propagation mirrors the evaluator: angle±any → Angle,
      // angle×scalar → Angle, angle/scalar → Angle; angle/angle and
      // angle×angle drop to number
      if (left === 'Angle' || right === 'Angle') {
        const bothAngle = left === 'Angle' && right === 'Angle';
        if (expr.operator === '+' || expr.operator === '-') return 'Angle';
        if (expr.operator === '*') return bothAngle ? 'number' : 'Angle';
        if (expr.operator === '/') return left === 'Angle' && right !== 'Angle' ? 'Angle' : 'number';
        return 'number';
      }
      if (left === 'number' || left === 'string') return left;
      return right === 'number' || right === 'string' ? right : null;
    }

    case 'TernaryExpression':
      return inferExprType(expr.consequent, scope, visited) ?? inferExprType(expr.alternate, scope, visited);

    case 'Identifier': {
      const decl = resolveInScope(expr.name, scope);
      if (decl) return inferDeclType(decl, visited);
      if (expr.name === 'ctx') return 'PathContext';
      if (NUMERIC_GLOBALS.has(expr.name)) return 'number';
      return null;
    }

    case 'MemberExpression': {
      const objType = inferExprType(expr.object, scope, visited);
      return objType ? (TYPE_PROPERTY_TYPES[objType]?.[expr.property] ?? null) : null;
    }

    case 'IndexExpression':
      return inferExprElementType(expr.object, scope, visited);

    case 'FunctionCall': {
      const info = CONSTRUCTOR_RETURN_TYPES[expr.name];
      if (info) return info.type;
      if (expr.name === 'layer') return 'PathLayer';
      if (PATH_FUNCTION_NAMES.has(expr.name)) return 'PathBlock';
      if (expr.name === 'calc') return 'number';
      return null;
    }

    case 'MethodCallExpression': {
      const ns = namespaceOf(expr.object, scope);
      if (ns) return NAMESPACE_METHOD_RETURNS[ns]?.[expr.method]?.type ?? null;
      const objType = inferExprType(expr.object, scope, visited);
      const perType = objType ? TYPE_METHOD_RETURNS[objType]?.[expr.method] : undefined;
      const returnType = perType ?? getMethodReturnType(expr.method);
      return returnType && returnType !== 'any' ? returnType : null;
    }

    default:
      return null;
  }
}

/**
 * Infer the element type of an array-valued expression (what a loop over it,
 * an index into it, or a `.map` block param binds).
 */
export function inferExprElementType(expr: Expression, scope: Scope, seen?: Set<Declaration>): string | null {
  const visited = seen ?? new Set<Declaration>();

  switch (expr.type) {
    case 'ArrayLiteral': {
      const first = expr.elements[0];
      if (!first) return null;
      if (first.type === 'SpreadElement') return inferExprElementType(first.argument, scope, visited);
      return inferExprType(first, scope, visited);
    }

    case 'CalcExpression':
      return inferExprElementType(expr.expression, scope, visited);

    case 'Identifier': {
      const decl = resolveInScope(expr.name, scope);
      if (!decl || visited.has(decl)) return null;
      const ctx = decl.typeContext;
      if (ctx?.kind === 'init') {
        visited.add(decl);
        return inferExprElementType(ctx.expr, decl.scope, visited);
      }
      return null;
    }

    case 'MemberExpression': {
      const objType = inferExprType(expr.object, scope, visited);
      return objType ? (TYPE_ELEMENT_TYPES[objType]?.[expr.property] ?? null) : null;
    }

    case 'MethodCallExpression': {
      const ns = namespaceOf(expr.object, scope);
      if (ns) return NAMESPACE_METHOD_RETURNS[ns]?.[expr.method]?.elementType ?? null;
      const objType = inferExprType(expr.object, scope, visited);
      return objType ? (TYPE_ELEMENT_TYPES[objType]?.[expr.method] ?? null) : null;
    }

    default:
      return null;
  }
}

/**
 * Namespace receiver check: an identifier naming a generated namespace
 * (PathBlock, Color, Object) that no local declaration shadows.
 */
function namespaceOf(object: Expression, scope: Scope): string | null {
  if (object.type !== 'Identifier') return null;
  if (!(object.name in NAMESPACE_METHOD_RETURNS)) return null;
  return resolveInScope(object.name, scope) ? null : object.name;
}

/** Walk the scope chain for a name's declaration. */
function resolveInScope(name: string, scope: Scope): Declaration | null {
  let current: Scope | null = scope;
  while (current) {
    const decl = current.declarations.get(name);
    if (decl) return decl;
    current = current.parent;
  }
  return null;
}

/**
 * Best-effort declaration lookup for consumers that only have a name and a
 * cursor position (completion's member-access path): the closest declaration
 * of that name at or before the position, falling back to the first one.
 */
export function findDeclaration(scopeInfo: ScopeInfo, name: string, before?: Position): Declaration | null {
  let best: Declaration | null = null;
  for (const decl of scopeInfo.declarations) {
    if (decl.name !== name) continue;
    if (!before) return decl;
    const at = decl.range.start;
    if (at.line < before.line || (at.line === before.line && at.character <= before.character)) {
      best = decl; // declarations arrive in document order — keep the latest preceding one
    } else if (!best) {
      best = decl; // nothing precedes the cursor yet — keep the first following one as fallback
      break;
    }
  }
  return best;
}
