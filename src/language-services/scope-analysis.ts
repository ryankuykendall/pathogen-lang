import { parseLezer } from '../parser';
import { parser as styleParser } from '../parser/style.generated';
import { parseExpressionAtOffset } from '../parser/lezer-expression';
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
  StyleBlockLiteral,
} from '../parser/ast';

// --- Built-in names that are always in scope ---

const BUILTIN_NAMESPACES = new Set(['Object', 'Color', 'PathBlock', 'Cap']);

const BUILTIN_ENUMS = new Set([
  'Easing', 'Interpolation', 'SpreadMethod', 'GradientUnits', 'Direction',
  'CurveContinuity',
  'ConicSpread', 'InnerFill', 'TopoMethod', 'BBoxAnchor', 'GridPatternType',
  'HexagonOrientation', 'VerticalAnchor',
  'MarkerUnits', 'MarkerOrient', 'MarkerRefX', 'MarkerRefY', 'MarkerPreserveAspectRatio',
]);

const STDLIB_NAMES = new Set(Object.keys(stdlib));

const BUILTIN_GLOBALS = new Set(['ctx', 'PI', 'E', 'TAU', 'Infinity', 'NaN']);

// --- Types ---

export type DeclarationKind = 'variable' | 'function' | 'parameter' | 'loopVar' | 'enum' | 'blockParam';

/**
 * How a declared name gets its value — the AST context type inference needs.
 * Carried on the Declaration so inference works on real expression nodes
 * instead of regex probes over source text (regex-audit Phase 5b).
 */
export type DeclTypeContext =
  /** let x = expr; */
  | { kind: 'init'; expr: Expression }
  /** let [a, b] = expr; — binding at position `index` */
  | { kind: 'arrayElement'; expr: Expression; index: number }
  /** let { key: a } = expr; — binding of property `key` */
  | { kind: 'objectProp'; expr: Expression; key: string }
  /** for (x in iterable) / for ([x, i] in iterable) — the element binding */
  | { kind: 'loopElement'; iterable: Expression }
  /** for (i in 0..10) counter, or the index binding of for ([x, i] in arr) — always a number */
  | { kind: 'loopIndex' }
  /** {|p| ...} trailing-block param at position `index` of a call */
  | { kind: 'blockParam'; call: FunctionCall | MethodCallExpression; index: number };

export interface Declaration {
  name: string;
  kind: DeclarationKind;
  range: Range;
  scope: Scope;
  /** AST context for type inference; absent when the value is uninferable (fn params, enums, rest bindings) */
  typeContext?: DeclTypeContext;
}

export interface Reference {
  name: string;
  range: Range;
  declaration: Declaration | null;
  isBuiltin: boolean;
  /**
   * Set when the reference sits inside a style-block value (`${ fill: c; }`).
   * These references carry FULL-WIDTH ranges (end > start, exact extents from
   * the inner style parser) unlike ordinary references, whose ranges are
   * zero-width and consumed via line-scan heuristics. `end > start` is the
   * discriminator consumers branch on.
   */
  inStyleValue?: true;
  /**
   * Set when the reference is the desugared value of a shorthand object
   * property (`{ x }` for `{ x: x }`). Rename must expand the shorthand
   * (`{ x: newName }`) instead of replacing the span, which would silently
   * rename the property key too.
   */
  inShorthandProperty?: true;
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
  /** Full source + document — style-block value sub-parsing needs exact offsets. */
  source: string;
  document: TextDocument;
}

// --- Analysis ---

export function analyzeScopes(document: TextDocument): ScopeInfo {
  const source = document.getText();

  // Lenient parse: Lezer's error recovery + the lenient AST builder keep the
  // scope tree usable while the user is mid-keystroke (an unterminated `vo.`
  // must not blank out completions/hover for the whole document). Strict
  // errors stay the diagnostics engine's job.
  let ast: Program;
  try {
    ast = parseLezer(source).ast;
  } catch {
    return { root: mkScope(null), declarations: [], references: [] };
  }

  const col: Collector = { decls: [], refs: [], source, document };
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

function addDecl(
  scope: Scope,
  name: string,
  kind: DeclarationKind,
  loc: SourceLocation | undefined,
  col: Collector,
  typeContext?: DeclTypeContext,
): Declaration {
  const range = locToRange(loc);
  const decl: Declaration = { name, kind, range, scope, ...(typeContext ? { typeContext } : {}) };
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
          stmt.pattern.elements.forEach((elem, index) =>
            addDecl(scope, elem, 'variable', stmt.loc, col, { kind: 'arrayElement', expr: stmt.value, index }),
          );
          if (stmt.pattern.rest) addDecl(scope, stmt.pattern.rest, 'variable', stmt.loc, col);
        } else if (stmt.pattern.type === 'ObjectDestructuringPattern') {
          for (const prop of stmt.pattern.properties) {
            addDecl(scope, prop.alias || prop.key, 'variable', stmt.loc, col, {
              kind: 'objectProp',
              expr: stmt.value,
              key: prop.key,
            });
          }
          if (stmt.pattern.rest) addDecl(scope, stmt.pattern.rest, 'variable', stmt.loc, col);
        }
      } else {
        addDecl(scope, stmt.name, 'variable', stmt.loc, col, { kind: 'init', expr: stmt.value });
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
      addDecl(loopScope, stmt.variable, 'loopVar', stmt.loc, col, { kind: 'loopIndex' });
      walkStatements(stmt.body, loopScope, col);
      break;
    }
    case 'ForEachLoop': {
      walkExpr(stmt.iterable, scope, col);
      const eachScope = mkScope(scope);
      addDecl(eachScope, stmt.variable, 'loopVar', stmt.loc, col, { kind: 'loopElement', iterable: stmt.iterable });
      if (stmt.indexVariable) addDecl(eachScope, stmt.indexVariable, 'loopVar', stmt.loc, col, { kind: 'loopIndex' });
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
    case 'ViewBoxDefinition':
      walkExpr(stmt.originX, scope, col);
      walkExpr(stmt.originY, scope, col);
      walkExpr(stmt.width, scope, col);
      walkExpr(stmt.height, scope, col);
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
      for (const p of expr.properties) {
        if (p.type === 'SpreadElement') {
          walkExpr(p.argument, scope, col);
          continue;
        }
        const before = col.refs.length;
        walkExpr(p.value, scope, col);
        // A shorthand property's value is a single desugared Identifier —
        // tag its reference so rename expands rather than replaces.
        if (p.shorthand && col.refs.length === before + 1 && col.refs[before].name === p.key) {
          col.refs[before].inShorthandProperty = true;
        }
      }
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
    case 'StyleBlockLiteral':
      collectStyleBlockReferences(expr, scope, col);
      break;
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'ColorLiteral':
      break;
  }
}

// --- Style-block value references ---

const STYLE_VALUE_WRAP_PREFIX = '_: ';

/** `${...}` interpolations inside a template token — one brace-nesting level,
 * mirroring the inner grammar's `interp` token definition. */
const TEMPLATE_INTERP_RE = /\$\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/**
 * Emit references for identifiers inside style-block values, using the
 * `StyleProperty.valueLoc`/`valueEnd` extents for exact document offsets.
 *
 * Value text is parsed with the INNER style grammar (the same tokenizer the
 * editor mounts over `StyleContent`), wrapped as `_: <value>;` so it reads as
 * one declaration. Reference rule (matches evaluator semantics — resolved
 * identifiers substitute, unresolved ones pass through as raw CSS):
 *   - bare identifiers and Member HEADS → a Reference only when the scope
 *     chain resolves to a USER declaration (builtins don't count: in
 *     `stroke-linejoin: round;` the evaluator keeps `round` as CSS);
 *   - Call callees (`drop-shadow`, `.alpha`) and Member tails → never;
 *   - template `${...}` interpolations are real Pathogen expressions and use
 *     normal reference semantics (builtins included).
 *
 * Unlike ordinary references (zero-width ranges), these carry FULL-WIDTH
 * ranges so rename/semantic-tokens/find-references can use them directly.
 */
function collectStyleBlockReferences(expr: StyleBlockLiteral, scope: Scope, col: Collector): void {
  for (const prop of expr.properties) {
    if (!prop.valueLoc || prop.valueEnd === undefined || prop.valueEnd <= prop.valueLoc.offset) continue;
    const valueText = col.source.slice(prop.valueLoc.offset, prop.valueEnd);
    const wrapped = STYLE_VALUE_WRAP_PREFIX + valueText + ';';
    const baseOffset = prop.valueLoc.offset - STYLE_VALUE_WRAP_PREFIX.length;

    styleParser.parse(wrapped).iterate({
      enter: (n) => {
        if (n.name === 'Template') {
          collectTemplateInterpRefs(wrapped.slice(n.from, n.to), baseOffset + n.from, scope, col);
          return false;
        }
        if (n.name !== 'Identifier') return true;

        const parent = n.node.parent;
        if (parent) {
          // Call callee (`drop-shadow(`, `.alpha(`) — a function name, not a value ref.
          if (parent.name === 'Call' && parent.firstChild?.from === n.from) return true;
          // Member tail (`c.alpha`, `a.b`) — property/method name, not a value ref.
          if (parent.name === 'Member' && parent.firstChild?.from !== n.from) return true;
        }

        const name = wrapped.slice(n.from, n.to);
        const decl = resolveInChain(name, scope);
        if (!decl) return true; // unresolved → CSS keyword/token, not a reference

        const from = baseOffset + n.from;
        const to = baseOffset + n.to;
        col.refs.push({
          name,
          range: { start: col.document.positionAt(from), end: col.document.positionAt(to) },
          declaration: decl,
          isBuiltin: false,
          inStyleValue: true,
        });
        return true;
      },
    });
  }
}

/**
 * References inside a style-value template's `${...}` interpolations. These
 * are full Pathogen expressions — parse each with the standard expression
 * parser (locations adjusted to the document; NOTE: consume only line/column
 * from the adjusted locs — adjustLocs' `.offset` math is unreliable on
 * multi-line documents) and reuse walkExpr, keeping resolved + builtin refs.
 */
function collectTemplateInterpRefs(templateText: string, templateDocFrom: number, scope: Scope, col: Collector): void {
  TEMPLATE_INTERP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEMPLATE_INTERP_RE.exec(templateText)) !== null) {
    const exprText = m[1];
    if (!exprText.trim()) continue;
    const exprDocFrom = templateDocFrom + m.index + 2; // past `${`
    const parsed = parseExpressionAtOffset(exprText, exprDocFrom, col.source);
    if (!parsed) continue;

    const temp: Collector = { decls: [], refs: [], source: col.source, document: col.document };
    walkExpr(parsed, scope, temp);
    for (const ref of temp.refs) {
      if (!ref.declaration && !ref.isBuiltin) continue;
      const start = ref.range.start;
      col.refs.push({
        ...ref,
        range: { start, end: { line: start.line, character: start.character + ref.name.length } },
        inStyleValue: true,
      });
    }
  }
}

/** Walk the scope chain for a user declaration; null when unresolved. */
function resolveInChain(name: string, scope: Scope): Declaration | null {
  let current: Scope | null = scope;
  while (current) {
    const decl = current.declarations.get(name);
    if (decl) return decl;
    current = current.parent;
  }
  return null;
}

function walkFnCall(expr: FunctionCall, scope: Scope, col: Collector): void {
  resolveId(expr.name, expr.loc, scope, col);
  for (const arg of expr.args) walkExpr(arg, scope, col);
  if (expr.block) {
    const blockScope = mkScope(scope);
    expr.block.params.forEach((p, index) =>
      addDecl(blockScope, p, 'blockParam', expr.loc, col, { kind: 'blockParam', call: expr, index }),
    );
    walkStatements(expr.block.body, blockScope, col);
  }
}

function walkMethodCall(expr: MethodCallExpression, scope: Scope, col: Collector): void {
  walkExpr(expr.object, scope, col);
  for (const arg of expr.args) walkExpr(arg, scope, col);
  if (expr.block) {
    const blockScope = mkScope(scope);
    expr.block.params.forEach((p, index) =>
      addDecl(blockScope, p, 'blockParam', expr.loc, col, { kind: 'blockParam', call: expr, index }),
    );
    walkStatements(expr.block.body, blockScope, col);
  }
}

// --- Helpers ---

function locToRange(loc: SourceLocation | undefined): Range {
  if (!loc) return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  const pos = { line: loc.line - 1, character: loc.column - 1 };
  return { start: pos, end: pos };
}
