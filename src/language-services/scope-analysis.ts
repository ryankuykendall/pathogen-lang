import { parse } from '../parser';
import { stdlib } from '../stdlib';

import type { TextDocument } from './document';
import type { Range } from './types';
import type {
  Program,
  Statement,
  Expression,
  SourceLocation,
  FunctionCall,
  MethodCallExpression,
  PathArg,
} from '../parser/ast';

// --- Built-in names that are always in scope ---

const BUILTIN_NAMESPACES = new Set(['Object', 'Color', 'PathBlock']);

const BUILTIN_ENUMS = new Set([
  'Easing', 'Interpolation', 'SpreadMethod', 'GradientUnits', 'Direction',
  'ConicSpread', 'InnerFill', 'TopoMethod', 'BBoxAnchor', 'GridPatternType',
  'HexagonOrientation', 'VerticalAnchor',
]);

const STDLIB_NAMES = new Set(Object.keys(stdlib));

const BUILTIN_GLOBALS = new Set(['ctx', 'PI', 'E', 'TAU', 'Infinity', 'NaN']);

// --- Types ---

export type DeclarationKind = 'variable' | 'function' | 'parameter' | 'loopVar' | 'enum' | 'blockParam';

export interface Declaration {
  name: string;
  kind: DeclarationKind;
  range: Range;
  scope: Scope;
}

export interface Reference {
  name: string;
  range: Range;
  declaration: Declaration | null;
  isBuiltin: boolean;
}

export interface Scope {
  parent: Scope | null;
  declarations: Map<string, Declaration>;
  children: Scope[];
}

export interface ScopeInfo {
  root: Scope;
  declarations: Declaration[];
  references: Reference[];
}

/** Collector passed through the walk to accumulate declarations and references. */
interface Collector {
  decls: Declaration[];
  refs: Reference[];
}

// --- Analysis ---

export function analyzeScopes(document: TextDocument): ScopeInfo {
  const source = document.getText();

  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    return { root: mkScope(null), declarations: [], references: [] };
  }

  const col: Collector = { decls: [], refs: [] };
  const rootScope = mkScope(null);

  walkStatements(ast.body, rootScope, col);

  return { root: rootScope, declarations: col.decls, references: col.refs };
}

// --- Scope helpers ---

function mkScope(parent: Scope | null): Scope {
  const scope: Scope = { parent, declarations: new Map(), children: [] };
  if (parent) parent.children.push(scope);
  return scope;
}

function addDecl(scope: Scope, name: string, kind: DeclarationKind, loc: SourceLocation | undefined, col: Collector): Declaration {
  const range = locToRange(loc);
  const decl: Declaration = { name, kind, range, scope };
  scope.declarations.set(name, decl);
  col.decls.push(decl);
  return decl;
}

function resolveId(name: string, loc: SourceLocation | undefined, scope: Scope, col: Collector): void {
  const range = locToRange(loc);
  let current: Scope | null = scope;
  while (current) {
    if (current.declarations.has(name)) {
      col.refs.push({ name, range, declaration: current.declarations.get(name)!, isBuiltin: false });
      return;
    }
    current = current.parent;
  }
  const isBuiltin = BUILTIN_NAMESPACES.has(name) || BUILTIN_ENUMS.has(name) ||
    STDLIB_NAMES.has(name) || BUILTIN_GLOBALS.has(name);
  col.refs.push({ name, range, declaration: null, isBuiltin });
}

// --- Statement walking ---

function walkStatements(stmts: Statement[], scope: Scope, col: Collector): void {
  for (const stmt of stmts) walkStatement(stmt, scope, col);
}

function walkStatement(stmt: Statement, scope: Scope, col: Collector): void {
  switch (stmt.type) {
    case 'LetDeclaration': {
      // Walk value first (before name is in scope)
      walkExpr(stmt.value, scope, col);
      // Bind names
      if (stmt.pattern) {
        if (stmt.pattern.type === 'ArrayDestructuringPattern') {
          for (const elem of stmt.pattern.elements) addDecl(scope, elem, 'variable', stmt.loc, col);
          if (stmt.pattern.rest) addDecl(scope, stmt.pattern.rest, 'variable', stmt.loc, col);
        } else if (stmt.pattern.type === 'ObjectDestructuringPattern') {
          for (const prop of stmt.pattern.properties) addDecl(scope, prop.alias || prop.key, 'variable', stmt.loc, col);
          if (stmt.pattern.rest) addDecl(scope, stmt.pattern.rest, 'variable', stmt.loc, col);
        }
      } else {
        addDecl(scope, stmt.name, 'variable', stmt.loc, col);
      }
      break;
    }
    case 'AssignmentStatement':
      walkExpr(stmt.value, scope, col);
      resolveId(stmt.name, stmt.loc, scope, col);
      break;
    case 'FunctionDefinition': {
      addDecl(scope, stmt.name, 'function', stmt.loc, col);
      const fnScope = mkScope(scope);
      for (const p of stmt.params) addDecl(fnScope, p, 'parameter', stmt.loc, col);
      walkStatements(stmt.body, fnScope, col);
      break;
    }
    case 'EnumDefinition':
      addDecl(scope, stmt.name, 'enum', stmt.loc, col);
      for (const m of stmt.members) { if (m.value) walkExpr(m.value, scope, col); }
      break;
    case 'ForLoop': {
      walkExpr(stmt.start, scope, col);
      walkExpr(stmt.end, scope, col);
      const loopScope = mkScope(scope);
      addDecl(loopScope, stmt.variable, 'loopVar', stmt.loc, col);
      walkStatements(stmt.body, loopScope, col);
      break;
    }
    case 'ForEachLoop': {
      walkExpr(stmt.iterable, scope, col);
      const eachScope = mkScope(scope);
      addDecl(eachScope, stmt.variable, 'loopVar', stmt.loc, col);
      if (stmt.indexVariable) addDecl(eachScope, stmt.indexVariable, 'loopVar', stmt.loc, col);
      walkStatements(stmt.body, eachScope, col);
      break;
    }
    case 'IfStatement': {
      walkExpr(stmt.condition, scope, col);
      const thenScope = mkScope(scope);
      walkStatements(stmt.consequent, thenScope, col);
      if (stmt.alternate) {
        const elseScope = mkScope(scope);
        walkStatements(stmt.alternate, elseScope, col);
      }
      break;
    }
    case 'LayerApplyBlock': {
      walkExpr(stmt.layerName, scope, col);
      const blockScope = mkScope(scope);
      walkStatements(stmt.body, blockScope, col);
      break;
    }
    case 'LayerDefinition':
      walkExpr(stmt.name, scope, col);
      walkExpr(stmt.styleExpr, scope, col);
      break;
    case 'PathCommand':
      for (const arg of stmt.args) walkPathArg(arg, scope, col);
      break;
    case 'ExpressionStatement':
      walkExpr(stmt.expression, scope, col);
      break;
    case 'ReturnStatement':
      walkExpr(stmt.value, scope, col);
      break;
    case 'TextStatement':
      walkExpr(stmt.x, scope, col);
      walkExpr(stmt.y, scope, col);
      if (stmt.rotation) walkExpr(stmt.rotation, scope, col);
      if (stmt.styles) walkExpr(stmt.styles, scope, col);
      if (stmt.content) walkExpr(stmt.content, scope, col);
      if (stmt.body) for (const item of stmt.body) walkStatement(item as Statement, scope, col);
      break;
    case 'IndexedAssignmentStatement':
      walkExpr(stmt.object, scope, col);
      walkExpr(stmt.index, scope, col);
      walkExpr(stmt.value, scope, col);
      break;
    case 'MemberAssignmentStatement':
      walkExpr(stmt.object, scope, col);
      walkExpr(stmt.value, scope, col);
      break;
    case 'Comment':
    case 'FontDirective':
      break;
  }
}

// --- Path arg walking ---

function walkPathArg(arg: PathArg, scope: Scope, col: Collector): void {
  switch (arg.type) {
    case 'Identifier':
      resolveId(arg.name, arg.loc, scope, col);
      break;
    case 'CalcExpression':
      walkExpr(arg.expression, scope, col);
      break;
    case 'FunctionCall':
      walkFnCall(arg, scope, col);
      break;
    case 'MemberExpression':
      walkExpr(arg, scope, col);
      break;
    case 'IndexExpression':
      walkExpr(arg.object, scope, col);
      walkExpr(arg.index, scope, col);
      break;
    case 'MethodCallExpression':
      walkMethodCall(arg, scope, col);
      break;
    case 'NumberLiteral':
    case 'BooleanLiteral':
      break;
  }
}

// --- Expression walking ---

function walkExpr(expr: Expression, scope: Scope, col: Collector): void {
  switch (expr.type) {
    case 'Identifier':
      resolveId(expr.name, expr.loc, scope, col);
      break;
    case 'FunctionCall':
      walkFnCall(expr, scope, col);
      break;
    case 'MethodCallExpression':
      walkMethodCall(expr, scope, col);
      break;
    case 'MemberExpression':
      walkExpr(expr.object, scope, col);
      break;
    case 'IndexExpression':
      walkExpr(expr.object, scope, col);
      walkExpr(expr.index, scope, col);
      break;
    case 'BinaryExpression':
      walkExpr(expr.left, scope, col);
      walkExpr(expr.right, scope, col);
      break;
    case 'UnaryExpression':
      walkExpr(expr.argument, scope, col);
      break;
    case 'TernaryExpression':
      walkExpr(expr.condition, scope, col);
      walkExpr(expr.consequent, scope, col);
      walkExpr(expr.alternate, scope, col);
      break;
    case 'CalcExpression':
      walkExpr(expr.expression, scope, col);
      break;
    case 'ArrayLiteral':
      for (const el of expr.elements) walkExpr(el.type === 'SpreadElement' ? el.argument : el, scope, col);
      break;
    case 'ObjectLiteral':
      for (const p of expr.properties) walkExpr(p.type === 'SpreadElement' ? p.argument : p.value, scope, col);
      break;
    case 'TemplateLiteral':
      for (const part of expr.parts) { if (typeof part !== 'string') walkExpr(part, scope, col); }
      break;
    case 'LayerConstructorExpression':
      walkExpr(expr.name, scope, col);
      if (expr.styleExpr) walkExpr(expr.styleExpr, scope, col);
      break;
    case 'PathBlockExpression':
      walkStatements(expr.body as Statement[], scope, col);
      break;
    case 'TextBlockExpression':
      walkStatements(expr.body as Statement[], scope, col);
      break;
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'ColorLiteral':
    case 'StyleBlockLiteral':
      break;
  }
}

function walkFnCall(expr: FunctionCall, scope: Scope, col: Collector): void {
  resolveId(expr.name, expr.loc, scope, col);
  for (const arg of expr.args) walkExpr(arg, scope, col);
  if (expr.block) {
    const blockScope = mkScope(scope);
    for (const p of expr.block.params) addDecl(blockScope, p, 'blockParam', expr.loc, col);
    walkStatements(expr.block.body, blockScope, col);
  }
}

function walkMethodCall(expr: MethodCallExpression, scope: Scope, col: Collector): void {
  walkExpr(expr.object, scope, col);
  for (const arg of expr.args) walkExpr(arg, scope, col);
  if (expr.block) {
    const blockScope = mkScope(scope);
    for (const p of expr.block.params) addDecl(blockScope, p, 'blockParam', expr.loc, col);
    walkStatements(expr.block.body, blockScope, col);
  }
}

// --- Helpers ---

function locToRange(loc: SourceLocation | undefined): Range {
  if (!loc) return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  const pos = { line: loc.line - 1, character: loc.column - 1 };
  return { start: pos, end: pos };
}
