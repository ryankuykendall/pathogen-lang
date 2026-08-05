// CST-to-AST converter: transforms Lezer parse tree into Pathogen AST nodes.
// The AST types are defined in ./ast.ts — this module produces identical output
// to the Parsimmon parser so the evaluator and language-services work unchanged.

import type { Tree, SyntaxNode, TreeCursor } from '@lezer/common';
import { matchFunctionNotation } from '../css-value-utils';
import type {
  Program,
  Statement,
  Expression,
  Comment,
  CornerOpAnnotation,
  LabelAnnotation,
  PathCommandAnnotations,
  LetDeclaration,
  AssignmentStatement,
  IndexedAssignmentStatement,
  MemberAssignmentStatement,
  ExpressionStatement,
  ForLoop,
  ForEachLoop,
  IfStatement,
  FunctionDefinition,
  ReturnStatement,
  BreakStatement,
  ContinueStatement,
  EnumDefinition,
  PathCommand,
  PathArg,
  CalcExpression,
  FunctionCall,
  TernaryExpression,
  BinaryExpression,
  UnaryExpression,
  MemberExpression,
  IndexExpression,
  MethodCallExpression,
  NullLiteral,
  BooleanLiteral,
  SpreadElement,
  ArrayLiteral,
  ObjectLiteral,
  ObjectProperty,
  ArrayDestructuringPattern,
  ObjectDestructuringPattern,
  LayerDefinition,
  ViewBoxDefinition,
  LayerApplyBlock,
  LayerConstructorExpression,
  TextStatement,
  TspanStatement,
  TemplateLiteral,
  StyleBlockLiteral,
  StyleProperty,
  PathBlockExpression,
  TextBlockExpression,
  ColorLiteral,
  Identifier,
  NumberLiteral,
  StringLiteral,
  FontDirective,
  SourceLocation,
  TextBodyItem,
} from './ast';

// --- Expression parser reference (set by index.ts to break circular dependency) ---
let _expressionParser: { parse(input: string): { status: boolean; value: any } } | null = null;

export function setExpressionParser(parser: { parse(input: string): { status: boolean; value: any } }): void {
  _expressionParser = parser;
}

function parseExpressionString(exprStr: string): Expression | null {
  if (!_expressionParser) return null;
  try {
    const result = _expressionParser.parse(exprStr);
    if (result.status) return result.value;
  } catch { /* ignore */ }
  return null;
}

/**
 * Parse an expression string and adjust all SourceLocations to be relative
 * to a position in the original source. Used when we extract sub-expressions
 * (e.g., calc() inner content, if-condition, return value) and parse them
 * with Parsimmon — the resulting locations are relative to the sub-string
 * and need to be adjusted to the original source position.
 */
function parseExpressionAt(exprStr: string, sourceOffset: number, source: string): Expression | null {
  const expr = parseExpressionString(exprStr);
  if (!expr) return null;
  // Calculate the line/column offset from the source position
  const targetLoc = offsetToLoc(sourceOffset, source);
  adjustLocations(expr, targetLoc.line - 1, targetLoc.column - 1);
  return expr;
}

// Wrapper offset: `let _ = ` is 8 characters
const WRAP_OFFSET = 8;

function adjustLocations(node: any, lineOffset: number, colOffset: number, seen: Set<object> = new Set()): void {
  if (!node || typeof node !== 'object') return;
  // AST nodes may share a single loc object (e.g. MethodCallExpression and its
  // object Identifier) — adjust each loc exactly once or lines drift.
  if (node.loc && !seen.has(node.loc)) {
    seen.add(node.loc);
    // For first line, adjust column accounting for the `let _ = ` wrapper
    if (node.loc.line === 1) {
      node.loc.line += lineOffset;
      node.loc.column = node.loc.column - WRAP_OFFSET + colOffset;
      node.loc.offset = node.loc.offset - WRAP_OFFSET + colOffset;
    } else {
      node.loc.line += lineOffset;
    }
  }
  // Recurse into all object properties that could contain AST nodes
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) adjustLocations(item, lineOffset, colOffset, seen);
    } else if (val && typeof val === 'object' && val.type) {
      adjustLocations(val, lineOffset, colOffset, seen);
    }
  }
}

// --- Public API ---

/**
 * Convert a Lezer parse tree into a Pathogen AST Program node.
 * This produces the same AST as the Parsimmon parser's `parse()` function.
 */
export function buildAST(tree: Tree, source: string): Program {
  // Save/zero/restore loopDepth rather than plain-resetting: buildAST is
  // re-entered mid-build via parseExpressionString (if-conditions, for-each
  // iterables wrap sub-expressions as `let _ = expr;`), and a plain reset
  // would clobber the enclosing build's depth. The zero also guarantees a
  // previously thrown parse error can't leak stale depth into this build.
  const savedLoopDepth = loopDepth;
  loopDepth = 0;
  try {
  const body: Statement[] = [];
  const cursor = tree.cursor();

  if (!cursor.firstChild()) return { type: 'Program', body };

  do {
    // Preserve comments in the AST so the formatter can round-trip them
    if (cursor.name === 'Comment' || cursor.name === 'LineComment') {
      body.push(buildComment(cursor, source));
      continue;
    }
    const stmt = buildStatement(cursor, source);
    if (stmt) body.push(stmt);
  } while (cursor.nextSibling());

  // Post-process: merge FontDirective + bare Number (Lezer splits them)
  for (let i = 0; i < body.length - 1; i++) {
    if (body[i].type === 'FontDirective' && !(body[i] as FontDirective).weight) {
      const next = body[i + 1];
      if (next.type === 'ExpressionStatement' &&
          (next as ExpressionStatement).expression.type === 'NumberLiteral') {
        (body[i] as FontDirective).weight =
          ((next as ExpressionStatement).expression as NumberLiteral).value;
        body.splice(i + 1, 1);
      }
    }
  }

  return { type: 'Program', body };
  } finally {
    loopDepth = savedLoopDepth;
  }
}

/**
 * Build a Program with comments interleaved in the body.
 * Used by compileAnnotated() — replaces the old parseWithComments().
 */
export function buildASTWithComments(tree: Tree, source: string): { program: Program; comments: Comment[] } {
  // Save/zero/restore — see buildAST for why (re-entrancy via parseExpressionString)
  const savedLoopDepth = loopDepth;
  loopDepth = 0;
  try {
    const body: Statement[] = [];
    const comments: Comment[] = [];
    const cursor = tree.cursor();

    if (!cursor.firstChild()) return { program: { type: 'Program', body }, comments };

    do {
      if (cursor.name === 'Comment') {
        const comment = buildComment(cursor, source);
        comments.push(comment);
      } else {
        const stmt = buildStatement(cursor, source);
        if (stmt) body.push(stmt);
      }
    } while (cursor.nextSibling());

    return { program: { type: 'Program', body }, comments };
  } finally {
    loopDepth = savedLoopDepth;
  }
}

// --- Helpers ---

function loc(cursor: TreeCursor, source: string): SourceLocation {
  const before = source.slice(0, cursor.from);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    offset: cursor.from,
  };
}

function text(cursor: TreeCursor, source: string): string {
  return source.slice(cursor.from, cursor.to);
}

/** Get all named children of the current node. */
function namedChildren(cursor: TreeCursor, source: string): Array<{ name: string; from: number; to: number; text: string }> {
  const children: Array<{ name: string; from: number; to: number; text: string }> = [];
  if (cursor.firstChild()) {
    do {
      children.push({ name: cursor.name, from: cursor.from, to: cursor.to, text: source.slice(cursor.from, cursor.to) });
    } while (cursor.nextSibling());
    cursor.parent();
  }
  return children;
}

/** Get the node at a given path (e.g., "VariableName/Identifier"). */
function childText(cursor: TreeCursor, source: string, name: string): string | null {
  if (cursor.firstChild()) {
    do {
      if (cursor.name === name) {
        const t = text(cursor, source);
        cursor.parent();
        return t;
      }
      // Check nested: VariableName > Identifier
      if (cursor.firstChild()) {
        do {
          if (cursor.name === name) {
            const t = text(cursor, source);
            cursor.parent();
            cursor.parent();
            return t;
          }
        } while (cursor.nextSibling());
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
  }
  return null;
}

// --- Loop-depth tracking for break/continue validation ---
//
// break/continue are valid only lexically inside a for-loop body (nested if
// branches included). fn bodies, lambdas/callback blocks, apply blocks, path
// blocks, and text-block top levels are boundaries: they reset the depth so
// a stray break/continue inside them errors at build time even when the
// surrounding source contains a loop. Depth is module state (the builder is
// synchronous and single-entry); buildAST/buildASTWithComments reset it so a
// previously thrown parse error cannot leave stale depth behind.
let loopDepth = 0;

function buildLoopBody(cursor: TreeCursor, source: string): Statement[] {
  loopDepth++;
  try {
    return buildBlock(cursor, source);
  } finally {
    loopDepth--;
  }
}

function atLoopBoundary<T>(build: () => T): T {
  const saved = loopDepth;
  loopDepth = 0;
  try {
    return build();
  } finally {
    loopDepth = saved;
  }
}

function buildLoopControl(
  cursor: TreeCursor,
  source: string,
  type: 'BreakStatement' | 'ContinueStatement',
): BreakStatement | ContinueStatement {
  const nodeLoc = loc(cursor, source);
  if (loopDepth === 0) {
    const keyword = type === 'BreakStatement' ? 'break' : 'continue';
    throw new Error(
      `Parse error at line ${nodeLoc.line}, column ${nodeLoc.column}: '${keyword}' is only valid inside a for loop`,
    );
  }
  return { type, loc: nodeLoc };
}

// --- Statement builders ---

function buildStatement(cursor: TreeCursor, source: string): Statement | null {
  switch (cursor.name) {
    case 'Comment': return buildComment(cursor, source);
    case 'LetDeclaration': return buildLetDeclaration(cursor, source);
    case 'ExpressionStatement': return buildExpressionStatement(cursor, source);
    case 'ForLoop': return buildForLoop(cursor, source);
    case 'ForEachLoop': return buildForEachLoop(cursor, source);
    case 'IfStatement': return buildIfStatement(cursor, source);
    case 'FunctionDefinition': return buildFunctionDefinition(cursor, source);
    case 'ReturnStatement': return buildReturnStatement(cursor, source);
    case 'BreakStatement': return buildLoopControl(cursor, source, 'BreakStatement');
    case 'ContinueStatement': return buildLoopControl(cursor, source, 'ContinueStatement');
    case 'EnumDefinition': return buildEnumDefinition(cursor, source);
    case 'PathCommand': return buildPathCommand(cursor, source);
    case 'TspanStatement': return buildTspanStatement(cursor, source);
    case 'LayerDefinition': return buildLayerDefinition(cursor, source);
    case 'ViewBoxDefinition': return buildViewBoxDefinition(cursor, source);
    case 'LayerApplyBlock': return buildLayerApplyBlock(cursor, source);
    case 'TextStatement': return buildTextStatement(cursor, source);
    case 'FontDirective': return buildFontDirective(cursor, source);
    default: return null;
  }
}

function buildComment(cursor: TreeCursor, source: string): Comment {
  return {
    type: 'Comment',
    text: text(cursor, source),
    loc: loc(cursor, source),
  };
}

function buildLetDeclaration(cursor: TreeCursor, source: string): LetDeclaration {
  const nodeLoc = loc(cursor, source);
  const children = namedChildren(cursor, source);

  let name = '';
  let pattern: ArrayDestructuringPattern | ObjectDestructuringPattern | undefined;
  let valueExpr: Expression | null = null;

  for (const child of children) {
    if (child.name === 'VariableName') {
      // Get the Identifier text inside VariableName
      name = child.text;
    } else if (child.name === 'ArrayDestructure') {
      pattern = buildArrayDestructure(cursor, source, child);
    } else if (child.name === 'ObjectDestructure') {
      pattern = buildObjectDestructure(cursor, source, child);
    }
  }

  // Build the value expression — it's the expression(s) after "="
  // May include postfix ops (ArgList, ".", "[") for function calls/member access
  cursor.firstChild();
  let foundEquals = false;
  do {
    if (cursor.name === '=') foundEquals = true;
    else if (foundEquals && cursor.name !== ';') {
      valueExpr = buildExpressionWithPostfix(cursor, source);
      break;
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return {
    type: 'LetDeclaration',
    name,
    pattern,
    value: valueExpr || { type: 'NullLiteral' },
    loc: nodeLoc,
  };
}

function buildArrayDestructure(_cursor: TreeCursor, source: string, _child: { from: number; to: number }): ArrayDestructuringPattern {
  // Parse the text "[a, b, ...rest]" manually since we have the range
  const raw = source.slice(_child.from, _child.to);
  const inner = raw.slice(1, -1).trim(); // Remove [ ]
  const parts = inner.split(',').map((s) => s.trim());
  const elements: string[] = [];
  let rest: string | undefined;

  for (const part of parts) {
    if (part.startsWith('...')) {
      rest = part.slice(3).trim();
    } else if (part) {
      elements.push(part);
    }
  }

  return { type: 'ArrayDestructuringPattern', elements, rest };
}

function buildObjectDestructure(_cursor: TreeCursor, source: string, _child: { from: number; to: number }): ObjectDestructuringPattern {
  const raw = source.slice(_child.from, _child.to);
  const inner = raw.slice(1, -1).trim();
  const parts = inner.split(',').map((s) => s.trim());
  const properties: Array<{ key: string; alias?: string }> = [];
  let rest: string | undefined;

  for (const part of parts) {
    if (part.startsWith('...')) {
      rest = part.slice(3).trim();
    } else if (part.includes(':')) {
      const [key, alias] = part.split(':').map((s) => s.trim());
      properties.push({ key, alias });
    } else if (part) {
      properties.push({ key: part });
    }
  }

  return { type: 'ObjectDestructuringPattern', properties, rest };
}

function buildExpressionStatement(cursor: TreeCursor, source: string): Statement {
  const nodeLoc = loc(cursor, source);

  // Check if this is an assignment: expression "=" expression ";"
  const children = namedChildren(cursor, source);
  const eqIdx = children.findIndex((c) => c.name === '=');

  if (eqIdx >= 0) {
    // Assignments cannot carry with/as clauses — reject rather than silently drop.
    if (children.some((c) => c.name === 'WithClause' || c.name === 'AsClause')) {
      throw new Error(
        `Parse error at line ${nodeLoc.line}: with/as clauses are only allowed on path commands and path-emitting function calls`,
      );
    }
    // This is an assignment. Build the LHS and RHS.
    const lhsChildren = children.slice(0, eqIdx);
    const rhsChildren = children.slice(eqIdx + 1).filter((c) => c.name !== ';');

    // Build LHS expression (with postfix for member/index assignment)
    cursor.firstChild();
    const lhs = buildExpressionWithPostfix(cursor, source);
    cursor.parent();

    // Build RHS expression — find the expression after "="
    cursor.firstChild();
    let rhs: Expression = { type: 'NullLiteral' };
    let foundEq = false;
    do {
      if (cursor.name === '=') foundEq = true;
      else if (foundEq && cursor.name !== ';') {
        rhs = buildExpressionWithPostfix(cursor, source);
        break;
      }
    } while (cursor.nextSibling());
    cursor.parent();

    // Determine assignment type based on LHS structure
    if (lhs.type === 'MemberExpression') {
      return {
        type: 'MemberAssignmentStatement',
        object: lhs.object,
        property: lhs.property,
        value: rhs,
        loc: nodeLoc,
      } as MemberAssignmentStatement;
    }
    if (lhs.type === 'IndexExpression') {
      return {
        type: 'IndexedAssignmentStatement',
        object: lhs.object,
        index: lhs.index,
        value: rhs,
        loc: nodeLoc,
      } as IndexedAssignmentStatement;
    }
    if (lhs.type === 'Identifier') {
      return {
        type: 'AssignmentStatement',
        name: lhs.name,
        value: rhs,
        loc: nodeLoc,
      } as AssignmentStatement;
    }
  }

  // Not an assignment — build as expression statement with postfix chain
  cursor.firstChild();
  const expression = buildExpressionWithPostfix(cursor, source);
  cursor.parent();

  const annotations = collectAnnotations(cursor, source);

  // Propagate the statement's location to the expression for error reporting
  if (expression && typeof expression === 'object' && !('loc' in expression && (expression as any).loc?.line > 1)) {
    (expression as any).loc = nodeLoc;
  }

  // Compatibility: Parsimmon wraps standalone function calls as PathCommand
  // with empty command, which the evaluator uses to accumulate path data.
  // e.g., circle(50, 50, 25) → PathCommand("", [FunctionCall("circle", ...)])
  if (expression.type === 'FunctionCall' || expression.type === 'MethodCallExpression') {
    return {
      type: 'PathCommand',
      command: '',
      args: [expression as PathArg],
      ...(annotations ? { annotations } : {}),
      loc: nodeLoc,
    } as PathCommand;
  }

  if (annotations) {
    throw new Error(
      `Parse error at line ${nodeLoc.line}: with/as clauses are only allowed on path commands and path-emitting function calls`,
    );
  }

  return {
    type: 'ExpressionStatement',
    expression,
    loc: nodeLoc,
  } as ExpressionStatement;
}

function buildForLoop(cursor: TreeCursor, source: string): ForLoop {
  const nodeLoc = loc(cursor, source);
  let variable = '';
  let start: Expression = { type: 'NumberLiteral', value: 0 };
  let end: Expression = { type: 'NumberLiteral', value: 0 };
  let body: Statement[] = [];

  cursor.firstChild();
  let phase = 0; // 0=before range, 1=after start, 2=after rangeOp
  do {
    if (cursor.name === 'VariableName') {
      variable = text(cursor, source);
    } else if (cursor.name === 'RangeOp') {
      phase = 2;
    } else if (phase === 0 && isExpressionNode(cursor.name)) {
      start = buildExpression(cursor, source);
      phase = 1;
    } else if (phase === 2 && isExpressionNode(cursor.name)) {
      end = buildExpression(cursor, source);
    } else if (cursor.name === 'Block') {
      body = buildLoopBody(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'ForLoop', variable, start, end, body, loc: nodeLoc };
}

function buildForEachLoop(cursor: TreeCursor, source: string): ForEachLoop {
  const nodeLoc = loc(cursor, source);
  let variable = '';
  let indexVariable: string | undefined;
  let iterable: Expression = { type: 'NullLiteral' };
  let body: Statement[] = [];

  cursor.firstChild();
  let foundIn = false;
  do {
    if (cursor.name === 'VariableName' && !foundIn) {
      variable = text(cursor, source);
    } else if (cursor.name === 'ForEachDestructure') {
      // [item, index]
      const vars = extractVariableNames(cursor, source);
      if (vars.length >= 1) variable = vars[0];
      if (vars.length >= 2) indexVariable = vars[1];
    } else if (cursor.name === 'in') {
      foundIn = true;
    } else if (foundIn && isExpressionNode(cursor.name)) {
      // The iterable may have postfix ops (.slice(), etc.) that span multiple siblings.
      // Extract from current position to ')' and parse with Parsimmon.
      const iterStart = cursor.from;
      let iterEnd = cursor.to;
      while (cursor.nextSibling()) {
        if (cursor.name === ')') break;
        iterEnd = cursor.to;
      }
      const iterStr = source.slice(iterStart, iterEnd).trim();
      const parsed = parseExpressionString(iterStr);
      if (parsed) iterable = parsed;
    } else if (cursor.name === 'Block') {
      body = buildLoopBody(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'ForEachLoop', variable, indexVariable, iterable, body, loc: nodeLoc };
}

function buildIfStatement(cursor: TreeCursor, source: string): IfStatement {
  const nodeLoc = loc(cursor, source);
  let condition: Expression = { type: 'BooleanLiteral', value: true };
  let consequent: Statement[] = [];
  let alternate: Statement[] | null = null;

  cursor.firstChild();
  do {
    if (cursor.name === '(') {
      // Build the condition from all tokens between ( and )
      // Use the source text range and parse it with Parsimmon for full fidelity
      const condStart = cursor.to; // After '('
      // Find the matching ')'
      let depth = 1;
      let condEnd = condStart;
      while (cursor.nextSibling()) {
        if (cursor.name === '(') depth++;
        else if (cursor.name === ')') {
          depth--;
          if (depth === 0) { condEnd = cursor.from; break; }
        }
      }
      const condStr = source.slice(condStart, condEnd).trim();
      if (condStr) {
        const condOffset = condStart + (source.slice(condStart, condEnd).length - source.slice(condStart, condEnd).trimStart().length);
        const parsed = parseExpressionAt(condStr, condOffset, source);
        if (parsed) condition = parsed;
      }
    } else if (cursor.name === 'Block' && consequent.length === 0 && !alternate) {
      consequent = buildBlock(cursor, source);
    } else if (cursor.name === 'ElseClause') {
      alternate = buildElseClause(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'IfStatement', condition, consequent, alternate, loc: nodeLoc };
}

function buildElseClause(cursor: TreeCursor, source: string): Statement[] {
  cursor.firstChild();
  let result: Statement[] = [];
  do {
    if (cursor.name === 'Block') {
      result = buildBlock(cursor, source);
    } else if (cursor.name === 'IfStatement') {
      result = [buildIfStatement(cursor, source)];
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return result;
}

function buildFunctionDefinition(cursor: TreeCursor, source: string): FunctionDefinition {
  const nodeLoc = loc(cursor, source);
  let name = '';
  const params: string[] = [];
  let body: Statement[] = [];

  cursor.firstChild();
  let foundParen = false;
  let closedParen = false;
  do {
    if (cursor.name === 'VariableName' && !foundParen) {
      name = text(cursor, source);
    } else if (cursor.name === '(') {
      foundParen = true;
    } else if (cursor.name === ')') {
      closedParen = true;
    } else if (cursor.name === 'VariableName' && foundParen && !closedParen) {
      params.push(text(cursor, source));
    } else if (cursor.name === 'Block') {
      body = atLoopBoundary(() => buildBlock(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'FunctionDefinition', name, params, body, loc: nodeLoc };
}

function buildReturnStatement(cursor: TreeCursor, source: string): ReturnStatement {
  // Extract text between 'return' and ';', parse with Parsimmon for full fidelity
  const stmtStart = cursor.from;
  const stmtEnd = cursor.to;
  const stmtText = source.slice(stmtStart, stmtEnd);
  // Remove 'return' prefix and trailing ';'
  const exprText = stmtText.replace(/^\s*return\s+/, '').replace(/;\s*$/, '').trim();

  let value: Expression = { type: 'NullLiteral' };
  if (exprText) {
    // Calculate the offset where the expression starts in the source
    const returnMatch = stmtText.match(/^\s*return\s+/);
    const exprOffset = stmtStart + (returnMatch ? returnMatch[0].length : 7);
    const parsed = parseExpressionAt(exprText, exprOffset, source);
    if (parsed) value = parsed;
  }

  return { type: 'ReturnStatement', value };
}

function buildEnumDefinition(cursor: TreeCursor, source: string): EnumDefinition {
  const nodeLoc = loc(cursor, source);
  let name = '';
  const members: Array<{ name: string; value?: Expression }> = [];

  cursor.firstChild();
  do {
    if (cursor.name === 'VariableName' && !name) {
      name = text(cursor, source);
    } else if (cursor.name === 'EnumMember') {
      cursor.firstChild();
      let memberName = '';
      let memberValue: Expression | undefined;
      do {
        if (cursor.name === 'VariableName') memberName = text(cursor, source);
        else if (cursor.name !== '=' && isExpressionNode(cursor.name)) {
          memberValue = buildExpressionWithPostfix(cursor, source);
        }
      } while (cursor.nextSibling());
      cursor.parent();
      members.push({ name: memberName, value: memberValue });
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'EnumDefinition', name, members, loc: nodeLoc };
}

const CORNER_OP_KINDS = new Set(['fillet', 'chamfer', 'ellipticalFillet']);
const LABEL_KINDS = new Set(['segment', 'endpoint']);

/** Build a `with <cornerOp>(...)` clause. Cursor must be on WithClause. */
function buildWithClause(cursor: TreeCursor, source: string): CornerOpAnnotation {
  const clauseLoc = loc(cursor, source);
  let kind = '';
  let args: Expression[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === 'CornerOpCall') {
      cursor.firstChild();
      do {
        if (cursor.name === 'Identifier') kind = text(cursor, source);
        else if (cursor.name === 'ArgList') args = buildArgList(cursor, source);
      } while (cursor.nextSibling());
      cursor.parent();
    }
  } while (cursor.nextSibling());
  cursor.parent();
  if (!CORNER_OP_KINDS.has(kind)) {
    throw new Error(
      `Parse error at line ${clauseLoc.line}: unknown corner operation '${kind}' in with clause — expected fillet, chamfer, or ellipticalFillet`,
    );
  }
  return { kind: kind as CornerOpAnnotation['kind'], args, loc: clauseLoc };
}

/** Build an `as segment('x'), endpoint('y')` clause. Cursor must be on AsClause. */
function buildAsClause(cursor: TreeCursor, source: string): LabelAnnotation[] {
  const labels: LabelAnnotation[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === 'LabelCall') {
      const labelLoc = loc(cursor, source);
      let kind = '';
      let args: Expression[] = [];
      cursor.firstChild();
      do {
        if (cursor.name === 'Identifier') kind = text(cursor, source);
        else if (cursor.name === 'ArgList') args = buildArgList(cursor, source);
      } while (cursor.nextSibling());
      cursor.parent();
      if (!LABEL_KINDS.has(kind)) {
        throw new Error(
          `Parse error at line ${labelLoc.line}: unknown label kind '${kind}' in as clause — expected segment or endpoint`,
        );
      }
      if (args.length !== 1) {
        throw new Error(
          `Parse error at line ${labelLoc.line}: ${kind}() label expects exactly 1 argument (the name), got ${args.length}`,
        );
      }
      labels.push({ kind: kind as LabelAnnotation['kind'], name: args[0], loc: labelLoc });
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return labels;
}

/**
 * Collect WithClause/AsClause children of the node the cursor points into.
 * Cursor must be positioned ON the parent; iterates children non-destructively.
 */
function collectAnnotations(cursor: TreeCursor, source: string): PathCommandAnnotations | undefined {
  let cornerOp: CornerOpAnnotation | undefined;
  let labels: LabelAnnotation[] | undefined;
  cursor.firstChild();
  do {
    if (cursor.name === 'WithClause') cornerOp = buildWithClause(cursor, source);
    else if (cursor.name === 'AsClause') labels = buildAsClause(cursor, source);
  } while (cursor.nextSibling());
  cursor.parent();
  if (!cornerOp && !labels) return undefined;
  return { ...(cornerOp ? { cornerOp } : {}), ...(labels ? { labels } : {}) };
}

function buildPathCommand(cursor: TreeCursor, source: string): Statement {
  const nodeLoc = loc(cursor, source);
  let command = '';
  let argsText = '';
  let argsFrom = 0;

  cursor.firstChild();
  do {
    if (cursor.name === 'PathCommandLetter') {
      command = text(cursor, source);
    } else if (cursor.name === 'PathArgs') {
      argsText = text(cursor, source);
      argsFrom = cursor.from;
    }
  } while (cursor.nextSibling());
  cursor.parent();

  const annotations = collectAnnotations(cursor, source);

  // Fixup: if a single lowercase letter is followed by "." (member access),
  // this is actually variable.method(), not a path command.
  // e.g., "m.draw()" should be PathCommand("", [MethodCallExpr]) not PathCommand("m", [draw arg]).
  if (command.length === 1 && argsText.trimStart().startsWith('.')) {
    const fullExpr = command + argsText;
    // Use parseExpressionAt to get correct source locations
    const cmdOffset = nodeLoc.offset;
    const parsed = parseExpressionAt(fullExpr, cmdOffset, source);
    if (parsed) {
      // Wrap as PathCommand with empty command — the evaluator needs this
      // format to accumulate path data from method calls like draw().
      return { type: 'PathCommand', command: '', args: [parsed as PathArg], ...(annotations ? { annotations } : {}), loc: nodeLoc } as PathCommand;
    }
  }

  const args: PathArg[] = [];
  const trimmedArgs = argsText.trimStart();
  const trimOffset = argsText.length - trimmedArgs.length; // Leading whitespace skipped
  if (trimmedArgs.trim()) {
    args.push(...parsePathArgs(trimmedArgs.trim(), argsFrom + trimOffset, source));
  }
  return { type: 'PathCommand', command, args, ...(annotations ? { annotations } : {}), loc: nodeLoc } as PathCommand;
}

/**
 * Parse the raw PathArgs text into individual PathArg AST nodes.
 * This handles: numbers, identifiers, calc(), booleans, function calls,
 * member access, and index access.
 */
function parsePathArgs(argsText: string, baseOffset: number, source: string): PathArg[] {
  // Simple tokenizer for path args
  const args: PathArg[] = [];
  let pos = 0;

  while (pos < argsText.length) {
    // Skip whitespace
    while (pos < argsText.length && /\s/.test(argsText[pos])) pos++;
    if (pos >= argsText.length) break;

    const ch = argsText[pos];

    // Number: digits, dots, minus
    if (/[\d.]/.test(ch) || (ch === '-' && pos + 1 < argsText.length && /[\d.]/.test(argsText[pos + 1]))) {
      const match = argsText.slice(pos).match(/^-?(?:\d+\.\d+|\.\d+|\d+)(deg|rad|pi|%)?/);
      if (match) {
        const numStr = match[0];
        const unitMatch = numStr.match(/(deg|rad|pi|%)$/);
        const unit = unitMatch ? unitMatch[1] as 'deg' | 'rad' | 'pi' | '%' : undefined;
        const valueStr = unit ? numStr.slice(0, -unit.length) : numStr;
        args.push({ type: 'NumberLiteral', value: parseFloat(valueStr), unit });
        pos += numStr.length;
        continue;
      }
    }

    // Boolean
    if (argsText.slice(pos).startsWith('true')) {
      args.push({ type: 'BooleanLiteral', value: true });
      pos += 4;
      continue;
    }
    if (argsText.slice(pos).startsWith('false')) {
      args.push({ type: 'BooleanLiteral', value: false });
      pos += 5;
      continue;
    }

    // Identifier (possibly followed by member access, function call, index access)
    if (/[a-zA-Z_]/.test(ch)) {
      const idMatch = argsText.slice(pos).match(/^[a-zA-Z_]\w*/);
      if (idMatch) {
        const name = idMatch[0];
        const argLoc = offsetToLoc(baseOffset + pos, source);
        pos += name.length;

        // Check for calc(...)
        if (name === 'calc' && pos < argsText.length && argsText[pos] === '(') {
          const parenContent = extractParenContent(argsText, pos);
          if (parenContent !== null) {
            // Parse the inner expression with location adjusted to source position
            const calcInnerOffset = baseOffset + pos + 1; // +1 for opening paren
            const innerExpr = parseExpressionAt(parenContent, calcInnerOffset, source)
              || { type: 'Identifier', name: parenContent } as Identifier;
            args.push({ type: 'CalcExpression', expression: innerExpr } as CalcExpression);
            pos += parenContent.length + 2;
            continue;
          }
        }

        // Check for function call name(...)
        if (pos < argsText.length && argsText[pos] === '(') {
          const parenContent = extractParenContent(argsText, pos);
          if (parenContent !== null) {
            // Parse function args
            const fnArgs = parseFunctionArgs(parenContent, baseOffset + pos + 1, source);
            args.push({
              type: 'FunctionCall',
              name,
              args: fnArgs,
              loc: argLoc,
            } as FunctionCall);
            pos += parenContent.length + 2;
            continue;
          }
        }

        // Build identifier, then check for member/index chains
        let expr: PathArg = { type: 'Identifier', name, loc: argLoc } as Identifier;

        // Handle .property chains, [index], and .method() calls
        while (pos < argsText.length) {
          if (argsText[pos] === '.') {
            // Member access or method call
            const propMatch = argsText.slice(pos + 1).match(/^[a-zA-Z_]\w*/);
            if (!propMatch) break;
            const propName = propMatch[0];
            pos += 1 + propName.length;

            // Check if followed by (args) — method call
            if (pos < argsText.length && argsText[pos] === '(') {
              const parenContent = extractParenContent(argsText, pos);
              if (parenContent !== null) {
                const methodArgs = parseFunctionArgs(parenContent, baseOffset + pos + 1, source);
                expr = {
                  type: 'MethodCallExpression',
                  object: expr as Expression,
                  method: propName,
                  args: methodArgs,
                  loc: (expr as { loc?: SourceLocation }).loc,
                } as MethodCallExpression;
                pos += parenContent.length + 2;
                continue;
              }
            }

            expr = {
              type: 'MemberExpression',
              object: expr as Expression,
              property: propName,
              loc: (expr as { loc?: SourceLocation }).loc,
            } as MemberExpression;
          } else if (argsText[pos] === '[') {
            // Index access
            const bracketContent = extractBracketContent(argsText, pos);
            if (bracketContent !== null) {
              // Parse the index expression
              const indexArgs = parsePathArgs(bracketContent, baseOffset + pos + 1, source);
              const indexExpr = indexArgs.length > 0 ? indexArgs[0] : { type: 'NumberLiteral', value: 0 } as NumberLiteral;
              expr = {
                type: 'IndexExpression',
                object: expr as Expression,
                index: indexExpr as Expression,
                loc: (expr as { loc?: SourceLocation }).loc,
              } as IndexExpression;
              pos += bracketContent.length + 2;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        args.push(expr);
        continue;
      }
    }

    // Color literal
    if (ch === '#') {
      const colorMatch = argsText.slice(pos).match(/^#[0-9a-fA-F]+/);
      if (colorMatch) {
        // Colors in path args aren't standard but handle gracefully
        args.push({ type: 'NumberLiteral', value: 0 });
        pos += colorMatch[0].length;
        continue;
      }
    }

    // Skip unknown characters
    pos++;
  }

  return args;
}

/**
 * Parse comma-separated function arguments from a string.
 */
function parseFunctionArgs(argsStr: string, baseOffset: number, source: string): Expression[] {
  if (!argsStr.trim()) return [];

  // Split on commas at depth 0
  const argStrings: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < argsStr.length; i++) {
    if (argsStr[i] === '(' || argsStr[i] === '[') depth++;
    else if (argsStr[i] === ')' || argsStr[i] === ']') depth--;
    else if (argsStr[i] === ',' && depth === 0) {
      argStrings.push(argsStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  argStrings.push(argsStr.slice(start).trim());

  // Parse each argument as a path arg (which handles numbers, identifiers, member chains)
  const result: Expression[] = [];
  let offset = 0;
  for (const argStr of argStrings) {
    if (!argStr) continue;
    const parsed = parsePathArgs(argStr, baseOffset + offset, source);
    if (parsed.length > 0) {
      result.push(parsed[0] as Expression);
    }
    offset += argStr.length + 1; // +1 for comma
  }
  return result;
}

function extractBracketContent(text: string, openPos: number): string | null {
  if (text[openPos] !== '[') return null;
  let depth = 1;
  let pos = openPos + 1;
  while (pos < text.length && depth > 0) {
    if (text[pos] === '[') depth++;
    else if (text[pos] === ']') depth--;
    pos++;
  }
  if (depth !== 0) return null;
  return text.slice(openPos + 1, pos - 1);
}

function extractParenContent(text: string, openPos: number): string | null {
  if (text[openPos] !== '(') return null;
  let depth = 1;
  let pos = openPos + 1;
  while (pos < text.length && depth > 0) {
    if (text[pos] === '(') depth++;
    else if (text[pos] === ')') depth--;
    pos++;
  }
  if (depth !== 0) return null;
  return text.slice(openPos + 1, pos - 1);
}

function buildLayerDefinition(cursor: TreeCursor, source: string): LayerDefinition {
  const nodeLoc = loc(cursor, source);
  let layerType: 'PathLayer' | 'TextLayer' | 'GroupLayer' = 'PathLayer';
  let isDefault = false;
  let name: Expression = { type: 'StringLiteral', value: '' };
  let styleExpr: Expression = { type: 'StyleBlockLiteral', properties: [] };

  cursor.firstChild();
  let foundLayerType = false;
  let foundName = false;
  do {
    if (cursor.name === 'default') isDefault = true;
    else if (cursor.name === 'LayerType') {
      layerType = text(cursor, source) as 'PathLayer' | 'TextLayer' | 'GroupLayer';
      foundLayerType = true;
    } else if (foundLayerType && !foundName && isExpressionNode(cursor.name)) {
      name = buildExpression(cursor, source);
      foundName = true;
    } else if (foundName && isExpressionNode(cursor.name)) {
      styleExpr = buildExpression(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'LayerDefinition', layerType, name, isDefault, styleExpr, loc: nodeLoc };
}

function buildViewBoxDefinition(cursor: TreeCursor, source: string): ViewBoxDefinition {
  const nodeLoc = loc(cursor, source);
  const args: Expression[] = [];

  cursor.firstChild();
  do {
    if (isExpressionNode(cursor.name)) {
      args.push(buildExpression(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  const zero: Expression = { type: 'NumberLiteral', value: 0 };
  return {
    type: 'ViewBoxDefinition',
    originX: args[0] ?? zero,
    originY: args[1] ?? zero,
    width: args[2] ?? zero,
    height: args[3] ?? zero,
    loc: nodeLoc,
  };
}

function buildLayerApplyBlock(cursor: TreeCursor, source: string): LayerApplyBlock {
  const nodeLoc = loc(cursor, source);
  let layerName: Expression = { type: 'StringLiteral', value: '' };
  let body: Statement[] = [];

  cursor.firstChild();
  let foundApply = false;
  do {
    if (cursor.name === 'apply') foundApply = true;
    else if (!foundApply && isExpressionNode(cursor.name) && cursor.name !== 'layer') {
      layerName = buildExpression(cursor, source);
    } else if (cursor.name === 'Block') {
      body = atLoopBoundary(() => buildBlock(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'LayerApplyBlock', layerName, body, loc: nodeLoc };
}

function buildTextStatement(cursor: TreeCursor, source: string): TextStatement {
  const nodeLoc = loc(cursor, source);
  let x: Expression = { type: 'NumberLiteral', value: 0 };
  let y: Expression = { type: 'NumberLiteral', value: 0 };
  let rotation: Expression | undefined;
  let styles: Expression | undefined;
  let content: TemplateLiteral | undefined;
  let body: TextBodyItem[] | undefined;

  // Extract expressions between parens, then template or block. Each argument
  // can be any expression — including function calls like `polarX(...)`,
  // method calls like `pt.x`, and member-chains like `p.point.x` — so we
  // delegate to buildExpressionWithPostfix which walks the postfix chain
  // (ArgList, ".", "[") at sibling level.
  cursor.firstChild();
  const exprs: Expression[] = [];
  let inParens = false;
  do {
    if (cursor.name === '(') { inParens = true; continue; }
    if (cursor.name === ')') { inParens = false; continue; }
    if (inParens && cursor.name === ',') continue;
    if (inParens && isExpressionNode(cursor.name)) {
      const expr = buildExpressionWithPostfix(cursor, source);
      // buildExpressionWithPostfix leaves the cursor on the last token
      // consumed; the outer do/while's nextSibling() advances from there.
      exprs.push(expr);
      // Sync the inParens flag if we're now at a ")"
      if (cursor.name === ')') inParens = false;
      continue;
    }
    if (!inParens && cursor.name === 'TemplateLiteral') {
      content = buildTemplateLiteral(cursor, source);
    } else if (!inParens && cursor.name === 'TextBlock') {
      body = atLoopBoundary(() => buildTextBlock(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  if (exprs.length >= 1) x = exprs[0];
  if (exprs.length >= 2) y = exprs[1];
  if (exprs.length >= 3) rotation = exprs[2];
  if (exprs.length >= 4) styles = exprs[3];

  return { type: 'TextStatement', x, y, rotation, styles, content, body, loc: nodeLoc };
}

function buildTspanStatement(cursor: TreeCursor, source: string): TspanStatement {
  const nodeLoc = loc(cursor, source);
  let dx: Expression | undefined;
  let dy: Expression | undefined;
  let rotation: Expression | undefined;
  let styles: Expression | undefined;
  let content: TemplateLiteral = { type: 'TemplateLiteral', parts: [] };

  cursor.firstChild();
  const args: Expression[] = [];
  let inParens = false;
  do {
    if (cursor.name === '(') { inParens = true; continue; }
    if (cursor.name === ')') { inParens = false; continue; }
    if (inParens && cursor.name === ',') continue;
    if (inParens && isExpressionNode(cursor.name)) {
      // Delegate to buildExpressionWithPostfix so each argument can be any
      // expression — function calls (`polarX(...)`), member chains
      // (`pt.x`), method calls, etc. — not just a bare primary.
      const expr = buildExpressionWithPostfix(cursor, source);
      args.push(expr);
      if (cursor.name === ')') inParens = false;
      continue;
    }
    if (!inParens && cursor.name === 'TemplateLiteral') {
      content = buildTemplateLiteral(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  if (args.length >= 1) dx = args[0];
  if (args.length >= 2) dy = args[1];
  if (args.length >= 3) rotation = args[2];
  if (args.length >= 4) styles = args[3];

  return { type: 'TspanStatement', dx, dy, rotation, styles, content, loc: nodeLoc };
}

function buildTextBlock(cursor: TreeCursor, source: string): TextBodyItem[] {
  const items: TextBodyItem[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === '{' || cursor.name === '}') continue;
    // Text blocks can contain text-specific nodes (TextForLoop, TextIfStatement, etc.)
    // as well as regular statements (LetDeclaration, TspanStatement)
    if (cursor.name === 'TextForLoop') {
      items.push(buildTextForLoop(cursor, source) as TextBodyItem);
    } else if (cursor.name === 'TextForEachLoop') {
      items.push(buildTextForEachLoop(cursor, source) as TextBodyItem);
    } else if (cursor.name === 'TextIfStatement') {
      items.push(buildTextIfStatement(cursor, source) as TextBodyItem);
    } else if (cursor.name === 'TemplateLiteral') {
      items.push(buildTemplateLiteral(cursor, source) as TextBodyItem);
    } else {
      const item = buildStatement(cursor, source);
      if (item) items.push(item as TextBodyItem);
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return items;
}

function buildTextForLoop(cursor: TreeCursor, source: string): ForLoop {
  const nodeLoc = loc(cursor, source);
  let variable = '';
  let start: Expression = { type: 'NumberLiteral', value: 0 };
  let end: Expression = { type: 'NumberLiteral', value: 0 };
  const body: Statement[] = [];

  cursor.firstChild();
  let phase = 0;
  do {
    if (cursor.name === 'VariableName') {
      variable = text(cursor, source);
    } else if (cursor.name === 'RangeOp') {
      phase = 2;
    } else if (phase === 0 && isExpressionNode(cursor.name) && cursor.name !== 'for' && cursor.name !== 'in') {
      start = buildExpression(cursor, source);
      phase = 1;
    } else if (phase === 2 && isExpressionNode(cursor.name)) {
      end = buildExpression(cursor, source);
    } else if (cursor.name === '{') {
      // Collect text body items (a loop body — break/continue become valid)
      loopDepth++;
      try {
        while (cursor.nextSibling() && cursor.name !== '}') {
          if (cursor.name === 'TspanStatement') body.push(buildTspanStatement(cursor, source));
          else if (cursor.name === 'TemplateLiteral') body.push(buildTemplateLiteral(cursor, source) as any);
          else if (cursor.name === 'TextForLoop') body.push(buildTextForLoop(cursor, source));
          else if (cursor.name === 'TextIfStatement') body.push(buildTextIfStatement(cursor, source));
          else { const s = buildStatement(cursor, source); if (s) body.push(s); }
        }
      } finally {
        loopDepth--;
      }
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'ForLoop', variable, start, end, body, loc: nodeLoc };
}

function buildTextForEachLoop(cursor: TreeCursor, source: string): ForEachLoop {
  const nodeLoc = loc(cursor, source);
  let variable = '';
  let indexVariable: string | undefined;
  let iterable: Expression = { type: 'NullLiteral' };
  const body: Statement[] = [];

  cursor.firstChild();
  let foundIn = false;
  do {
    if (cursor.name === 'VariableName' && !foundIn) variable = text(cursor, source);
    else if (cursor.name === 'ForEachDestructure') {
      const vars = extractVariableNames(cursor, source);
      if (vars.length >= 1) variable = vars[0];
      if (vars.length >= 2) indexVariable = vars[1];
    } else if (cursor.name === 'in') foundIn = true;
    else if (foundIn && isExpressionNode(cursor.name) && cursor.name !== ')') {
      iterable = buildExpressionWithPostfix(cursor, source);
    } else if (cursor.name === '{') {
      // Loop body — break/continue become valid
      loopDepth++;
      try {
        while (cursor.nextSibling() && cursor.name !== '}') {
          if (cursor.name === 'TspanStatement') body.push(buildTspanStatement(cursor, source));
          else if (cursor.name === 'TemplateLiteral') body.push(buildTemplateLiteral(cursor, source) as any);
          else { const s = buildStatement(cursor, source); if (s) body.push(s); }
        }
      } finally {
        loopDepth--;
      }
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'ForEachLoop', variable, indexVariable, iterable, body, loc: nodeLoc };
}

function buildTextIfStatement(cursor: TreeCursor, source: string): IfStatement {
  const nodeLoc = loc(cursor, source);
  let condition: Expression = { type: 'BooleanLiteral', value: true };
  let consequent: Statement[] = [];
  let alternate: Statement[] | null = null;

  cursor.firstChild();
  do {
    if (cursor.name === '(') {
      const condStart = cursor.to;
      let condEnd = condStart;
      while (cursor.nextSibling()) {
        if (cursor.name === ')') { condEnd = cursor.from; break; }
      }
      const condStr = source.slice(condStart, condEnd).trim();
      if (condStr) {
        const parsed = parseExpressionString(condStr);
        if (parsed) condition = parsed;
      }
    } else if (cursor.name === '{') {
      // Text block body — collect items until }
      const bodyItems: TextBodyItem[] = [];
      while (cursor.nextSibling() && cursor.name !== '}') {
        if (cursor.name === 'TspanStatement') {
          bodyItems.push(buildTspanStatement(cursor, source) as TextBodyItem);
        } else if (cursor.name === 'TemplateLiteral') {
          bodyItems.push(buildTemplateLiteral(cursor, source) as TextBodyItem);
        } else if (cursor.name === 'TextForLoop' || cursor.name === 'TextForEachLoop') {
          bodyItems.push(buildForLoop(cursor, source) as TextBodyItem);
        } else if (cursor.name === 'TextIfStatement') {
          bodyItems.push(buildTextIfStatement(cursor, source) as TextBodyItem);
        } else {
          const stmt = buildStatement(cursor, source);
          if (stmt) bodyItems.push(stmt as TextBodyItem);
        }
      }
      if (consequent.length === 0 && !alternate) {
        consequent = bodyItems as Statement[];
      } else {
        alternate = bodyItems as Statement[];
      }
    } else if (cursor.name === 'else') {
      // Next should be { or TextIfStatement
    } else if (cursor.name === 'TextIfStatement') {
      alternate = [buildTextIfStatement(cursor, source)];
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'IfStatement', condition, consequent, alternate, loc: nodeLoc };
}

function buildFontDirective(cursor: TreeCursor, source: string): FontDirective {
  const nodeLoc = loc(cursor, source);
  const directiveFrom = cursor.from;
  let fontSource = '';
  let sourceKind: FontDirective['sourceKind'];
  let weight: number | undefined;

  cursor.firstChild();
  do {
    if (cursor.name === 'String') {
      fontSource = parseStringContent(text(cursor, source));
    } else if (cursor.name === 'Identifier') {
      // `@font` is a single token, so `@fontFamily` would otherwise tokenize
      // as `@font` + `Family`. Require whitespace before an identifier source.
      if (cursor.from === directiveFrom + '@font'.length) {
        const typed = source.slice(directiveFrom, cursor.to);
        // `@fontFamily` was most likely meant as `@font fontFamily` — suggest
        // the full typed name (minus `@`), not the `Family` remainder token.
        throw new Error(
          `Parse error at line ${nodeLoc.line}, column ${nodeLoc.column}: unknown directive '${typed}' — did you mean '@font ${typed.slice(1)}'?`,
        );
      }
      fontSource = text(cursor, source);
      sourceKind = 'identifier';
    } else if (cursor.name === 'Number') {
      weight = parseFloat(text(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'FontDirective', source: fontSource, sourceKind, weight, loc: nodeLoc };
}

// --- Expression builders ---

function buildExpression(cursor: TreeCursor, source: string): Expression {
  switch (cursor.name) {
    case 'TernaryExpression': return buildTernaryExpression(cursor, source);
    case 'BinaryExpression': return buildBinaryExpression(cursor, source);
    case 'UnaryExpression': return buildUnaryExpression(cursor, source);
    case 'Number': return buildNumberLiteral(cursor, source);
    case 'String': return buildStringLiteral(cursor, source);
    case 'TemplateLiteral': return buildTemplateLiteral(cursor, source);
    case 'BooleanLiteral': return buildBooleanLiteral(cursor, source);
    case 'NullLiteral': return { type: 'NullLiteral' };
    case 'ColorLiteral': return buildColorLiteral(cursor, source);
    case 'CSSColorLiteral': return buildColorLiteral(cursor, source);
    case 'ArrayLiteral': return buildArrayLiteral(cursor, source);
    case 'ObjectLiteral': return buildObjectLiteral(cursor, source);
    case 'StyleBlockLiteral': return buildStyleBlockLiteral(cursor, source);
    case 'PathBlockExpression': return buildPathBlockExpression(cursor, source);
    case 'TextBlockExpression': return buildTextBlockExpression(cursor, source);
    case 'CalcExpression': return buildCalcExpression(cursor, source);
    case 'LayerConstructor': return buildLayerConstructor(cursor, source);
    case 'LayerCallExpression': return buildLayerCallExpression(cursor, source);
    case 'Identifier': return buildIdentifier(cursor, source);
    case 'ParenExpression': return buildParenExpression(cursor, source);
    // A TrailingBlock reached as an expression (not as a call suffix — those are
    // consumed by explicit peeks in buildExpressionWithPostfix) is a lambda literal.
    case 'TrailingBlock': {
      const nodeLoc = loc(cursor, source);
      const { params, body } = buildTrailingBlock(cursor, source);
      return { type: 'LambdaExpression', params, body, loc: nodeLoc };
    }
    case 'ArgList': return { type: 'NullLiteral' }; // ArgList is a postfix, handled in context
    default:
      // For postfix expressions, walk the chain
      if (cursor.name === 'postfixExpression' || isExpressionNode(cursor.name)) {
        return buildPostfixExpression(cursor, source);
      }
      return { type: 'Identifier', name: text(cursor, source) };
  }
}

/**
 * Build an expression, then check for postfix operations at the sibling level.
 * Handles: Identifier followed by ArgList, ".", "[" as siblings.
 * For compound nodes (BinaryExpression, etc.), just delegates to buildExpression.
 */
function buildExpressionWithPostfix(cursor: TreeCursor, source: string): Expression {
  // If the node is a compound expression, just build it directly
  const name = cursor.name;
  // These compound expressions never have postfix ops at the sibling level
  if (name === 'BinaryExpression' || name === 'TernaryExpression' ||
      name === 'UnaryExpression' || name === 'CalcExpression') {
    return buildExpression(cursor, source);
  }

  // For primary nodes (Identifier, Number, etc.), build and check for postfix siblings
  let expr = buildExpression(cursor, source);

  // Walk subsequent siblings for postfix ops.
  // Key invariant: after processing each op, the cursor must be on the LAST
  // token consumed by that op. The while loop's nextSibling() then advances
  // to the next unprocessed token. When an op peeks ahead and finds something
  // it doesn't consume, we use `needsAdvance = false` to skip the next
  // nextSibling() call.
  let needsAdvance = true;
  while (needsAdvance ? cursor.nextSibling() : true) {
    needsAdvance = true; // Reset for next iteration
    const sibName = cursor.name;

    if (sibName === 'ArgList') {
      const args = buildArgList(cursor, source);
      let block: { params: string[]; body: Statement[] } | undefined;
      // Peek for TrailingBlock
      if (cursor.nextSibling()) {
        if (cursor.name === 'TrailingBlock') {
          block = buildTrailingBlock(cursor, source);
        } else {
          needsAdvance = false; // Don't advance — cursor is on next unprocessed token
        }
      }
      if (expr.type === 'Identifier') {
        expr = { type: 'FunctionCall', name: expr.name, args, block, loc: (expr as Identifier).loc } as FunctionCall;
      }
    } else if (sibName === '.') {
      if (!cursor.nextSibling()) break;

      // Handle CSSColorLiteral after dot (e.g., Color.oklch(...) tokenized as one token)
      if (cursor.name === 'CSSColorLiteral' || cursor.name === '⚠') {
        const raw = text(cursor, source);
        // Extract method name and args from e.g., "oklch(0.7, 0.15, 200)".
        // Balanced-paren aware, so nested calls like `mix(a, b)` in an argument
        // are not truncated the way the old `[^)]*` capture was.
        const fnMatch = matchFunctionNotation(raw);
        if (fnMatch && /^[A-Za-z_]/.test(fnMatch.name)) {
          const methodArgs = parseFunctionArgs(fnMatch.args, cursor.from + fnMatch.name.length + 1, source);
          expr = { type: 'MethodCallExpression', object: expr, method: fnMatch.name, args: methodArgs, loc: (expr as { loc?: SourceLocation }).loc } as MethodCallExpression;
        } else {
          expr = {
            type: 'MemberExpression',
            object: expr,
            property: raw,
            loc: (expr as { loc?: SourceLocation }).loc,
          } as MemberExpression;
        }
        // Continue — cursor is on the CSSColorLiteral, next iteration will advance
        continue;
      }

      const propName = text(cursor, source);

      // Peek ahead for ArgList, TrailingBlock, or next op
      if (!cursor.nextSibling()) {
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: propName,
          loc: (expr as { loc?: SourceLocation }).loc,
        } as MemberExpression;
        break;
      }

      if (cursor.name === 'ArgList') {
        const args = buildArgList(cursor, source);
        let block: { params: string[]; body: Statement[] } | undefined;
        if (cursor.nextSibling()) {
          if (cursor.name === 'TrailingBlock') {
            block = buildTrailingBlock(cursor, source);
          } else {
            needsAdvance = false;
          }
        }
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args, block, loc: (expr as { loc?: SourceLocation }).loc } as MethodCallExpression;
      } else if (cursor.name === 'TrailingBlock') {
        const block = buildTrailingBlock(cursor, source);
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args: [], block, loc: (expr as { loc?: SourceLocation }).loc } as MethodCallExpression;
      } else {
        // Simple member access — cursor is already on the next token
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: propName,
          loc: (expr as { loc?: SourceLocation }).loc,
        } as MemberExpression;
        needsAdvance = false; // Don't skip the current token
      }
    } else if (sibName === '[') {
      if (!cursor.nextSibling()) break;
      const index = buildExpression(cursor, source);
      cursor.nextSibling(); // skip ']'
      expr = {
        type: 'IndexExpression',
        object: expr,
        index,
        loc: (expr as { loc?: SourceLocation }).loc,
      } as IndexExpression;
    } else if (sibName === 'TrailingBlock') {
      const block = buildTrailingBlock(cursor, source);
      if (expr.type === 'FunctionCall') {
        (expr as FunctionCall).block = block;
      }
    } else if (sibName === ';' || sibName === '⚠' || sibName === '=' || sibName === ',' || sibName === ')' || sibName === ']' ||
               sibName === '==' || sibName === '!=' || sibName === '<' || sibName === '>' ||
               sibName === '<=' || sibName === '>=' || sibName === '||' || sibName === '&&' ||
               sibName === '<<' || sibName === '+' || sibName === '-' || sibName === '*' ||
               sibName === '/' || sibName === '%' || sibName === '?' || sibName === ':') {
      break;
    } else {
      break;
    }
  }

  return expr;
}

function buildTrailingBlock(cursor: TreeCursor, source: string): { params: string[]; body: Statement[] } {
  const params: string[] = [];
  const body: Statement[] = [];

  // Lambda / callback bodies are break/continue boundaries
  const savedLoopDepth = loopDepth;
  loopDepth = 0;
  try {
    cursor.firstChild(); // Enter TrailingBlock
    let inParams = false;
    let passedParams = false;
    do {
      if (cursor.name === '||') {
        // Zero-param form {|| ... } — both pipes lex as one logical-or token
        passedParams = true;
      } else if (cursor.name === '|' && !inParams) {
        inParams = true;
      } else if (cursor.name === '|' && inParams) {
        inParams = false;
        passedParams = true;
      } else if (inParams && (cursor.name === 'VariableName' || cursor.name === 'Identifier')) {
        params.push(text(cursor, source));
      } else if (passedParams && cursor.name !== '{' && cursor.name !== '}') {
        const stmt = buildStatement(cursor, source);
        if (stmt) body.push(stmt);
      }
    } while (cursor.nextSibling());
    cursor.parent();
  } finally {
    loopDepth = savedLoopDepth;
  }

  return { params, body };
}

function buildPostfixExpression(cursor: TreeCursor, source: string): Expression {
  // A postfix expression is: primaryExpression followed by postfix ops
  // Walk through children building up the expression chain
  cursor.firstChild();
  let expr = buildExpression(cursor, source);

  while (cursor.nextSibling()) {
    const name = cursor.name;
    if (name === '.') {
      // Member access: expr.property or method call: expr.method(args)
      if (cursor.nextSibling()) {
        const propName = text(cursor, source);
        // Check if followed by ArgList
        if (cursor.nextSibling() && cursor.name === 'ArgList') {
          // Method call
          const args = buildArgList(cursor, source);
          expr = {
            type: 'MethodCallExpression',
            object: expr,
            method: propName,
            args,
            loc: (expr as { loc?: SourceLocation }).loc,
          } as MethodCallExpression;
        } else {
          // Simple member access
          expr = {
            type: 'MemberExpression',
            object: expr,
            property: propName,
            loc: (expr as { loc?: SourceLocation }).loc,
          } as MemberExpression;
          // We consumed too far — the cursor is on the next thing
          continue;
        }
      }
    } else if (name === 'ArgList') {
      // Function call: expr(args)
      const args = buildArgList(cursor, source);
      if (expr.type === 'Identifier') {
        expr = {
          type: 'FunctionCall',
          name: expr.name,
          args,
          loc: (expr as Identifier).loc,
        } as FunctionCall;
      }
    } else if (name === '[') {
      // Index access: expr[index]
      if (cursor.nextSibling()) {
        const index = buildExpression(cursor, source);
        cursor.nextSibling(); // skip ']'
        expr = {
          type: 'IndexExpression',
          object: expr,
          index,
          loc: (expr as { loc?: SourceLocation }).loc,
        } as IndexExpression;
      }
    } else if (name === ';' || name === '⚠') {
      break;
    }
  }
  cursor.parent();
  return expr;
}

function buildArgList(cursor: TreeCursor, source: string): Expression[] {
  const args: Expression[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === '(' || cursor.name === ')') continue;
    if (cursor.name === ',') continue;
    // Each argument may include postfix ops (member access, index, calls)
    args.push(buildExpressionWithPostfix(cursor, source));
  } while (cursor.nextSibling());
  cursor.parent();
  return args;
}

function buildTernaryExpression(cursor: TreeCursor, source: string): TernaryExpression {
  cursor.firstChild();
  const parts: Expression[] = [];
  // Same postfix-folding rationale as buildUnaryExpression: any of the
  // three ternary operands can be a function call / member chain, and
  // bare `buildExpression` would drop the ArgList sibling.
  do {
    if (cursor.name !== '?' && cursor.name !== ':' && isExpressionNode(cursor.name)) {
      parts.push(buildExpressionWithPostfix(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return {
    type: 'TernaryExpression',
    condition: parts[0] || { type: 'BooleanLiteral', value: true },
    consequent: parts[1] || { type: 'NullLiteral' },
    alternate: parts[2] || { type: 'NullLiteral' },
  };
}

function buildBinaryExpression(cursor: TreeCursor, source: string): BinaryExpression {
  cursor.firstChild();
  let left: Expression = { type: 'NullLiteral' };
  let operator = '+';
  let right: Expression = { type: 'NullLiteral' };

  // Collect all children, find the operator, then build left and right
  const children: Array<{ name: string; from: number; to: number }> = [];
  do {
    children.push({ name: cursor.name, from: cursor.from, to: cursor.to });
  } while (cursor.nextSibling());
  cursor.parent();

  // Find the operator
  const opIdx = children.findIndex(c => isOperator(c.name));
  if (opIdx >= 0) {
    operator = source.slice(children[opIdx].from, children[opIdx].to);

    // Build left side: if it's a single expression node, use buildExpression.
    // If multiple nodes (postfix chain), extract as raw text.
    if (opIdx === 1) {
      // Single node before operator — use tree
      cursor.firstChild();
      left = buildExpression(cursor, source);
      cursor.parent();
    } else if (opIdx > 1) {
      // Multiple nodes — postfix chain. Use tree walking.
      cursor.firstChild();
      left = buildExpressionWithPostfix(cursor, source);
      cursor.parent();
    }

    // Build right side: everything after operator
    const rightChildren = children.slice(opIdx + 1);
    if (rightChildren.length === 1) {
      cursor.firstChild();
      // Skip to the right operand
      for (let i = 0; i <= opIdx; i++) cursor.nextSibling();
      right = buildExpression(cursor, source);
      cursor.parent();
    } else if (rightChildren.length > 1) {
      // Multiple nodes — use buildExpressionWithPostfix from the right start
      cursor.firstChild();
      for (let i = 0; i <= opIdx; i++) cursor.nextSibling();
      right = buildExpressionWithPostfix(cursor, source);
      cursor.parent();
    }
  }

  return {
    type: 'BinaryExpression',
    operator: operator as BinaryExpression['operator'],
    left,
    right,
  };
}

function buildUnaryExpression(cursor: TreeCursor, source: string): UnaryExpression {
  cursor.firstChild();
  let operator: '-' | '!' = '-';
  let argument: Expression = { type: 'NullLiteral' };

  // Use buildExpressionWithPostfix so the unary's operand can be a
  // function call / member chain / index expression — not just a bare
  // primary. Without this, `-sin(0.5)` would parse `sin` as Identifier
  // and drop the ArgList, since `buildExpression` returns NullLiteral
  // for ArgList nodes (they're meant to be folded into a postfix chain).
  do {
    if (cursor.name === '-' || cursor.name === '!') {
      operator = text(cursor, source) as '-' | '!';
    } else if (isExpressionNode(cursor.name)) {
      argument = buildExpressionWithPostfix(cursor, source);
      break;
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'UnaryExpression', operator, argument };
}

// --- Literal builders ---

function buildNumberLiteral(cursor: TreeCursor, source: string): NumberLiteral {
  const raw = text(cursor, source);
  const unitMatch = raw.match(/(deg|rad|pi|%)$/);
  const unit = unitMatch ? unitMatch[1] as 'deg' | 'rad' | 'pi' | '%' : undefined;
  const valueStr = unit ? raw.slice(0, -unit.length) : raw;
  return { type: 'NumberLiteral', value: parseFloat(valueStr), unit };
}

function buildStringLiteral(cursor: TreeCursor, source: string): StringLiteral {
  return { type: 'StringLiteral', value: parseStringContent(text(cursor, source)) };
}

function buildBooleanLiteral(cursor: TreeCursor, source: string): BooleanLiteral {
  return { type: 'BooleanLiteral', value: text(cursor, source) === 'true' };
}

function buildColorLiteral(cursor: TreeCursor, source: string): ColorLiteral {
  return { type: 'ColorLiteral', raw: text(cursor, source), loc: loc(cursor, source) };
}

function buildIdentifier(cursor: TreeCursor, source: string): Identifier {
  return { type: 'Identifier', name: text(cursor, source), loc: loc(cursor, source) };
}

function buildTemplateLiteral(cursor: TreeCursor, source: string): TemplateLiteral {
  // Walk the CST. The grammar parses `${...}` interpolations INLINE as real
  // expression subtrees under TemplateInterpolation nodes — correct even for
  // hard cases like a `}` inside a string argument (`${ f("}") }`). Only the
  // literal text runs are structural gaps (the lowercase template tokens are
  // not node types), and those are recovered by range between children.
  //
  // History: this function previously discarded the tree and re-scanned the
  // raw text (commits 8c89ff4/0041d3e, reacting to the missing text nodes) —
  // which silently mis-parsed interpolations containing braces in strings and
  // re-parsed every expression a second time with offset-rewritten locations.
  // The raw scanner survives only as the error-recovery fallback below.
  const nodeFrom = cursor.from;
  const nodeTo = cursor.to;
  const raw = text(cursor, source);
  const opened = raw.startsWith('`');
  const closed = opened && raw.length >= 2 && raw.endsWith('`');
  // Unterminated templates (mid-typing, error recovery) have no closing
  // backtick — the literal content then runs to the node end.
  const contentEnd = closed ? nodeTo - 1 : nodeTo;

  const parts: (string | Expression)[] = [];
  let sawInterpolation = false;
  let prevEnd = nodeFrom + (opened ? 1 : 0);

  if (cursor.firstChild()) {
    do {
      if (cursor.name !== 'TemplateInterpolation') continue;
      sawInterpolation = true;
      // Literal gap before this interpolation (empty gaps push nothing —
      // matches the legacy parts contract for adjacent interpolations).
      if (cursor.from > prevEnd) {
        parts.push(unescapeTemplate(source.slice(prevEnd, cursor.from)));
      }
      let interpEnd = cursor.to;
      // Empty/mid-typing interpolation (`${}` — the auto-close intermediate
      // state on every keystroke): error recovery ends the node right after
      // `${`, leaving the `}` unconsumed — without this it would leak into
      // the following literal run. A well-formed interpolation's own span
      // already includes its `}`, so the end-check prevents double-consuming
      // a literal `}` that follows one (`` `${a}}` ``).
      if (!source.slice(cursor.from, cursor.to).endsWith('}') && source[interpEnd] === '}') {
        interpEnd += 1;
      }
      // The `${`/`}` delimiters are token-level (no nodes); the children are
      // the expression's node(s). Postfix operators (`(args)`, `.prop`,
      // `[idx]`) appear as SIBLINGS, so use the postfix-aware builder — same
      // pattern as buildCalcExpression.
      let expr: Expression | null = null;
      if (cursor.firstChild()) {
        do {
          if (isExpressionNode(cursor.name)) {
            expr = buildExpressionWithPostfix(cursor, source);
            break;
          }
        } while (cursor.nextSibling());
        cursor.parent();
      }
      // Mid-typing interpolation with no parsable expression contributes no
      // part (lenient) rather than a bogus Identifier.
      if (expr) parts.push(expr);
      prevEnd = interpEnd;
    } while (cursor.nextSibling());
    cursor.parent();
  }

  // Error-recovery fallback: the node has no structured interpolations but
  // its text contains `${` — an opaque/recovered shape (historically hit as
  // "TemplateLiteral with no children", commit 8c89ff4). Use the legacy raw
  // scanner so those degraded states still yield usable parts.
  if (!sawInterpolation && raw.includes('${') && opened) {
    const inner = closed ? raw.slice(1, -1) : raw.slice(1);
    return { type: 'TemplateLiteral', parts: parseTemplateString(inner, nodeFrom + 1, source) };
  }

  // Trailing literal run (or the entire content for interpolation-free templates)
  if (contentEnd > prevEnd) {
    parts.push(unescapeTemplate(source.slice(prevEnd, contentEnd)));
  }
  return { type: 'TemplateLiteral', parts };
}

/**
 * Parse a template string's inner content (between backticks) into parts.
 * Handles ${expr} interpolations by re-parsing the expression content.
 *
 * DEGRADED PATH ONLY — kept for error-recovered/opaque TemplateLiteral nodes
 * (no TemplateInterpolation children). The brace counter here is NOT
 * string-aware (`${ f("}") }` mis-splits); the primary CST walk above never
 * has that problem because the grammar already parsed the expression.
 */
function parseTemplateString(inner: string, baseOffset: number, source: string): (string | Expression)[] {
  const parts: (string | Expression)[] = [];
  let pos = 0;
  let textStart = 0;

  while (pos < inner.length) {
    if (inner[pos] === '\\' && pos + 1 < inner.length) {
      pos += 2; // Skip escape sequence
      continue;
    }
    if (inner[pos] === '$' && pos + 1 < inner.length && inner[pos + 1] === '{') {
      // Emit preceding text (with escape processing)
      if (pos > textStart) {
        parts.push(unescapeTemplate(inner.slice(textStart, pos)));
      }
      // Find matching }
      let depth = 1;
      let end = pos + 2;
      while (end < inner.length && depth > 0) {
        if (inner[end] === '{') depth++;
        else if (inner[end] === '}') depth--;
        end++;
      }
      const exprStr = inner.slice(pos + 2, end - 1);
      // Parse the interpolation expression using Parsimmon
      const parsed = parseExpressionString(exprStr);
      parts.push(parsed || { type: 'Identifier', name: exprStr } as Identifier);
      pos = end;
      textStart = pos;
      continue;
    }
    pos++;
  }
  // Emit remaining text (with escape processing)
  if (pos > textStart) {
    parts.push(unescapeTemplate(inner.slice(textStart, pos)));
  }
  return parts;
}

function unescapeTemplate(s: string): string {
  return s.replace(/\\`/g, '`').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function buildCalcExpression(cursor: TreeCursor, source: string): CalcExpression {
  cursor.firstChild();
  let expression: Expression = { type: 'NullLiteral' };
  // The body of `calc(expr)` is a single expression. We must use
  // buildExpressionWithPostfix so postfix operators (`(args)`, `.prop`,
  // `[idx]`) get folded into the expression — otherwise `calc(foo(5))`
  // builds as Identifier("foo") and the ArgList sibling falls through to
  // the `buildExpression` case 'ArgList' branch which returns NullLiteral,
  // clobbering the identifier. Break after the first real expression so a
  // trailing `)` doesn't trigger that bug.
  do {
    if (cursor.name !== 'calc' && cursor.name !== '(' && cursor.name !== ')' && isExpressionNode(cursor.name)) {
      expression = buildExpressionWithPostfix(cursor, source);
      break;
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'CalcExpression', expression };
}

function buildArrayLiteral(cursor: TreeCursor, source: string): ArrayLiteral {
  const elements: (Expression | SpreadElement)[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === 'SpreadElement') {
      cursor.firstChild();
      let arg: Expression = { type: 'NullLiteral' };
      do {
        // buildExpressionWithPostfix folds postfix operators (index, member,
        // call) into the argument so e.g. `...ramp[0]` parses as a spread
        // of an IndexExpression rather than leaking the `[0]` as siblings.
        if (cursor.name !== '...') arg = buildExpressionWithPostfix(cursor, source);
      } while (cursor.nextSibling());
      cursor.parent();
      elements.push({ type: 'SpreadElement', argument: arg });
    } else if (cursor.name !== '[' && cursor.name !== ']' && cursor.name !== ',') {
      // Use the postfix-aware builder so array elements like `ramp[2]`,
      // `obj.prop`, or `f(x)` fold their postfix operators into a single
      // element instead of leaking trailing tokens as extra siblings (issue #1).
      elements.push(buildExpressionWithPostfix(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'ArrayLiteral', elements };
}

function buildObjectLiteral(cursor: TreeCursor, source: string): ObjectLiteral {
  const properties: (ObjectProperty | SpreadElement)[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === 'ObjectProperty') {
      cursor.firstChild();
      let key = '';
      let keyLoc: SourceLocation | undefined;
      let keyIsString = false;
      let hasValue = false;
      let value: Expression = { type: 'NullLiteral' };
      // First pass: find the key (first Identifier or String before ':')
      do {
        if ((cursor.name === 'Identifier' || cursor.name === 'String') && !key) {
          keyIsString = cursor.name === 'String';
          key = keyIsString ? parseStringContent(text(cursor, source)) : text(cursor, source);
          keyLoc = loc(cursor, source);
        } else if (cursor.name === ':') {
          // After ':', the rest is the value expression — use buildExpressionWithPostfix
          // to correctly handle Identifier + ArgList (function calls), member chains, etc.
          // A ':' with no value yet (mid-typing, error recovery) is still longhand.
          hasValue = true;
          if (cursor.nextSibling()) {
            value = buildExpressionWithPostfix(cursor, source);
          }
          break;
        }
      } while (cursor.nextSibling());
      cursor.parent();
      if (!hasValue && !keyIsString) {
        // Shorthand { key } — desugar to key: key so downstream consumers
        // (evaluators, scope analysis) see an ordinary identifier reference.
        // The key's loc anchors the reference for rename/navigation.
        // A colonless STRING key ({ 'a' } — grammar-invalid, reachable only
        // via error recovery) must NOT fabricate a reference from the string
        // content; it keeps the longhand NullLiteral shape below.
        properties.push({
          type: 'ObjectProperty',
          key,
          value: { type: 'Identifier', name: key, loc: keyLoc },
          shorthand: true,
        });
      } else {
        properties.push({ type: 'ObjectProperty', key, value });
      }
    } else if (cursor.name === 'SpreadElement') {
      cursor.firstChild();
      let arg: Expression = { type: 'NullLiteral' };
      do {
        // Postfix-aware builder (same reason as buildArrayLiteral — issue #1).
        if (cursor.name !== '...') arg = buildExpressionWithPostfix(cursor, source);
      } while (cursor.nextSibling());
      cursor.parent();
      properties.push({ type: 'SpreadElement', argument: arg });
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'ObjectLiteral', properties };
}

function buildStyleBlockLiteral(cursor: TreeCursor, source: string): StyleBlockLiteral {
  cursor.firstChild();
  let raw = '';
  let contentFrom = -1;
  do {
    if (cursor.name === 'StyleContent') {
      raw = text(cursor, source);
      contentFrom = cursor.from;
    }
  } while (cursor.nextSibling());
  cursor.parent();

  const parsed = raw ? parseStyleDeclarations(raw, contentFrom, source) : { properties: [] };
  const node: StyleBlockLiteral = { type: 'StyleBlockLiteral', properties: parsed.properties };
  if (parsed.incomplete) node.incomplete = parsed.incomplete;
  return node;
}

const STYLE_NAME_START = /[a-zA-Z]/;
const STYLE_NAME_CHAR = /[a-zA-Z0-9-]/;

interface StyleIncomplete {
  message: string;
  line: number;
  column: number;
}

/** line/column (1-based) for an absolute source offset, matching loc(). */
function lineColAt(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function lineColLoc(source: string, offset: number): SourceLocation {
  const { line, column } = lineColAt(source, offset);
  return { line, column, offset };
}

/**
 * Parse the raw `${ … }` style-block content into structured declarations.
 * Replaces the old regex scrape: this is quote-, paren-, and comment-aware,
 * and — unlike the regex, which silently dropped any declaration lacking a
 * trailing `;` — it treats a missing `:` or `;` as a hard error.
 *
 * AST-building stays LENIENT: on the first malformed declaration it stops and
 * returns an `incomplete` marker (with source line/column) alongside the
 * complete declarations parsed so far, rather than throwing. This keeps the
 * language service resilient while a block is being typed (scope analysis,
 * completion). The evaluator throws the marker as a strict error, so a missing
 * `;` still fails compilation and shows as an editor diagnostic (Phase 3 eval).
 * `baseOffset` is the absolute offset of `raw` within `source`.
 */
function parseStyleDeclarations(
  raw: string,
  baseOffset: number,
  source: string,
): { properties: StyleProperty[]; incomplete?: StyleIncomplete } {
  const properties: StyleProperty[] = [];
  let i = 0;
  const len = raw.length;
  const isWs = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
  const skipTrivia = () => {
    for (;;) {
      while (i < len && isWs(raw[i])) i++;
      if (i + 1 < len && raw[i] === '/' && raw[i + 1] === '/') {
        while (i < len && raw[i] !== '\n') i++; // skip to end of line
        continue;
      }
      break;
    }
  };
  const incompleteAt = (offset: number, message: string): { properties: StyleProperty[]; incomplete: StyleIncomplete } => {
    const { line, column } = lineColAt(source, offset);
    return { properties, incomplete: { message, line, column } };
  };

  for (;;) {
    skipTrivia();
    if (i >= len) break;

    const nameStart = i;
    if (!STYLE_NAME_START.test(raw[i])) {
      return incompleteAt(baseOffset + i, `Unexpected '${raw[i]}' in style block — expected a property name`);
    }
    while (i < len && STYLE_NAME_CHAR.test(raw[i])) i++;
    const name = raw.slice(nameStart, i);

    skipTrivia();
    if (raw[i] !== ':') {
      return incompleteAt(baseOffset + i, `Missing ':' after style property '${name}'`);
    }
    i++; // consume ':'
    skipTrivia();

    // Read the value up to a top-level ';' — quote- and paren-aware, stopping
    // at a `//` comment. An unterminated value that reaches end-of-content (or
    // a comment) is the missing-';' error.
    const valueStart = i;
    let depth = 0;
    let quote = '';
    let inTemplate = false;
    let interpDepth = 0;
    let terminated = false;
    while (i < len) {
      const ch = raw[i];
      if (quote) {
        if (ch === quote) quote = '';
        i++;
        continue;
      }
      if (inTemplate) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (interpDepth === 0) {
          // Template text: `;`, newlines, and `//` are all content here.
          if (ch === '`') inTemplate = false;
          else if (ch === '$' && raw[i + 1] === '{') {
            interpDepth = 1;
            i++; // extra advance for '{'
          }
          i++;
          continue;
        }
        // Inside a ${...} interpolation expression
        if (ch === '"' || ch === "'") {
          quote = ch;
          i++;
          continue;
        }
        if (ch === '{') interpDepth++;
        else if (ch === '}') interpDepth--;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === '`') {
        inTemplate = true;
        i++;
        continue;
      }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') {
        if (depth > 0) depth--;
      } else if (depth === 0) {
        if (ch === ';') {
          terminated = true;
          break;
        }
        // A bare (unquoted, top-level) newline bounds the value, mirroring the
        // old regex's `[^;\n]+`. Without this, a declaration missing its `;`
        // would swallow the following declaration into a multi-line value
        // instead of being flagged — so a missing `;` on ANY declaration (not
        // just the last) is reported here.
        if (ch === '\n' || ch === '\r') break;
        if (ch === '/' && raw[i + 1] === '/') break; // comment before ';' → missing ';'
      }
      i++;
    }
    const rawValue = raw.slice(valueStart, i);
    const value = rawValue.trim();
    if (!terminated) {
      // Point just past the value's last non-whitespace char — where ';' was
      // expected — rather than at any trailing whitespace/newline consumed.
      return incompleteAt(
        baseOffset + valueStart + rawValue.trimEnd().length,
        inTemplate ? `Unterminated template literal in style value` : `Missing ';'`,
      );
    }
    i++; // consume ';'

    if (name) {
      const trimmedStart = valueStart + (rawValue.length - rawValue.trimStart().length);
      const trimmedEnd = valueStart + rawValue.trimEnd().length;
      properties.push({
        type: 'StyleProperty',
        name,
        value,
        loc: lineColLoc(source, baseOffset + nameStart),
        nameEnd: baseOffset + nameStart + name.length,
        valueLoc: lineColLoc(source, baseOffset + trimmedStart),
        valueEnd: baseOffset + trimmedEnd,
      });
    }
  }

  return { properties };
}

function buildPathBlockExpression(cursor: TreeCursor, source: string): PathBlockExpression {
  const nodeLoc = loc(cursor, source);
  // Path-block bodies are break/continue boundaries
  const body = atLoopBoundary(() => {
    const stmts: Statement[] = [];
    cursor.firstChild();
    do {
      if (cursor.name !== 'pathBlockOpen' && cursor.name !== '}') {
        const stmt = buildStatement(cursor, source);
        if (stmt) stmts.push(stmt);
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return stmts;
  });
  return { type: 'PathBlockExpression', body, loc: nodeLoc };
}

function buildTextBlockExpression(cursor: TreeCursor, source: string): TextBlockExpression {
  const nodeLoc = loc(cursor, source);
  // Text-block-expression bodies are break/continue boundaries
  const body = atLoopBoundary(() => {
    const stmts: Statement[] = [];
    cursor.firstChild();
    do {
      if (cursor.name !== 'textBlockOpen' && cursor.name !== '}') {
        const stmt = buildStatement(cursor, source);
        if (stmt) stmts.push(stmt);
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return stmts;
  });
  return { type: 'TextBlockExpression', body, loc: nodeLoc };
}

function buildLayerConstructor(cursor: TreeCursor, source: string): LayerConstructorExpression {
  const nodeLoc = loc(cursor, source);
  let layerType: 'PathLayer' | 'TextLayer' | 'GroupLayer' = 'PathLayer';
  let name: Expression = { type: 'StringLiteral', value: '' };
  let styleExpr: Expression | undefined;

  cursor.firstChild();
  let inParens = false;
  let foundName = false;
  do {
    if (cursor.name === 'LayerType') {
      layerType = text(cursor, source) as 'PathLayer' | 'TextLayer' | 'GroupLayer';
    } else if (cursor.name === '(') {
      inParens = true;
    } else if (cursor.name === ')') {
      inParens = false;
    } else if (inParens && !foundName && isExpressionNode(cursor.name)) {
      name = buildExpression(cursor, source);
      foundName = true;
    } else if (!inParens && cursor.name === 'StyleBlockLiteral') {
      styleExpr = buildStyleBlockLiteral(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'LayerConstructorExpression', layerType, name, styleExpr, loc: nodeLoc };
}

function buildLayerCallExpression(cursor: TreeCursor, source: string): FunctionCall {
  const nodeLoc = loc(cursor, source);
  const args: Expression[] = [];
  cursor.firstChild();
  let inParens = false;
  do {
    if (cursor.name === '(') inParens = true;
    else if (cursor.name === ')') inParens = false;
    else if (inParens && isExpressionNode(cursor.name)) {
      args.push(buildExpression(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'FunctionCall', name: 'layer', args, loc: nodeLoc };
}

function buildParenExpression(cursor: TreeCursor, source: string): Expression {
  cursor.firstChild();
  let expr: Expression = { type: 'NullLiteral' };
  do {
    if (cursor.name !== '(' && cursor.name !== ')') {
      // Use buildExpressionWithPostfix so that postfix tokens (`.`, ArgList, `[`)
      // flattened as siblings inside the ParenExpression are properly consumed
      // as part of the expression chain rather than overwriting it.
      expr = buildExpressionWithPostfix(cursor, source);
      break; // postfix siblings already consumed
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return expr;
}

// --- Block builder ---

function buildBlock(cursor: TreeCursor, source: string): Statement[] {
  const stmts: Statement[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === '{' || cursor.name === '}') continue;
    // Preserve comments in block bodies so the formatter can round-trip them
    if (cursor.name === 'Comment' || cursor.name === 'LineComment') {
      stmts.push(buildComment(cursor, source));
      continue;
    }
    const stmt = buildStatement(cursor, source);
    if (stmt) stmts.push(stmt);
  } while (cursor.nextSibling());
  cursor.parent();
  return stmts;
}

// --- Utility ---

function extractVariableNames(cursor: TreeCursor, source: string): string[] {
  const names: string[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === 'VariableName') names.push(text(cursor, source));
  } while (cursor.nextSibling());
  cursor.parent();
  return names;
}

function isExpressionNode(name: string): boolean {
  return name === 'TernaryExpression' || name === 'BinaryExpression' ||
    name === 'UnaryExpression' || name === 'Number' || name === 'String' ||
    name === 'TemplateLiteral' || name === 'BooleanLiteral' || name === 'NullLiteral' ||
    name === 'ColorLiteral' || name === 'CSSColorLiteral' || name === 'ArrayLiteral' ||
    name === 'ObjectLiteral' || name === 'StyleBlockLiteral' || name === 'PathBlockExpression' ||
    name === 'TextBlockExpression' || name === 'CalcExpression' || name === 'LayerConstructor' || name === 'LayerCallExpression' ||
    name === 'Identifier' || name === 'ParenExpression' || name === 'ArgList' ||
    name === 'TrailingBlock';
}

function isOperator(name: string): boolean {
  return name === '+' || name === '-' || name === '*' || name === '/' || name === '%' ||
    name === '==' || name === '!=' || name === '<=' || name === '>=' || name === '<' ||
    name === '>' || name === '||' || name === '&&' || name === '<<';
}

function parseStringContent(raw: string): string {
  // Remove surrounding quotes and unescape
  const inner = raw.slice(1, -1);
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function offsetToLoc(offset: number, source: string): SourceLocation {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    offset,
  };
}
