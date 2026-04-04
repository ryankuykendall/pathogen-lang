// CST-to-AST converter: transforms Lezer parse tree into Pathogen AST nodes.
// The AST types are defined in ./ast.ts — this module produces identical output
// to the Parsimmon parser so the evaluator and language-services work unchanged.

import type { Tree, SyntaxNode, TreeCursor } from '@lezer/common';
import type {
  Program,
  Statement,
  Expression,
  Comment,
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

// --- Public API ---

/**
 * Convert a Lezer parse tree into a Pathogen AST Program node.
 * This produces the same AST as the Parsimmon parser's `parse()` function.
 */
export function buildAST(tree: Tree, source: string): Program {
  const body: Statement[] = [];
  const cursor = tree.cursor();

  if (!cursor.firstChild()) return { type: 'Program', body };

  do {
    // Skip comments in the main AST (Parsimmon's parse() also strips them)
    if (cursor.name === 'Comment' || cursor.name === 'LineComment') continue;
    const stmt = buildStatement(cursor, source);
    if (stmt && stmt.type !== 'Comment') body.push(stmt);
  } while (cursor.nextSibling());

  return { type: 'Program', body };
}

/**
 * Build a Program with comments interleaved in the body.
 * Used by compileAnnotated() — replaces the old parseWithComments().
 */
export function buildASTWithComments(tree: Tree, source: string): { program: Program; comments: Comment[] } {
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
    case 'EnumDefinition': return buildEnumDefinition(cursor, source);
    case 'PathCommand': return buildPathCommand(cursor, source);
    case 'LayerDefinition': return buildLayerDefinition(cursor, source);
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
      body = buildBlock(cursor, source);
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
      body = buildBlock(cursor, source);
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
        const parsed = parseExpressionString(condStr);
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
      body = buildBlock(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'FunctionDefinition', name, params, body, loc: nodeLoc };
}

function buildReturnStatement(cursor: TreeCursor, source: string): ReturnStatement {
  cursor.firstChild();
  let value: Expression = { type: 'NullLiteral' };
  do {
    if (cursor.name !== 'return' && cursor.name !== ';' && isExpressionNode(cursor.name)) {
      value = buildExpression(cursor, source);
      break;
    }
  } while (cursor.nextSibling());
  cursor.parent();
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
          memberValue = buildExpression(cursor, source);
        }
      } while (cursor.nextSibling());
      cursor.parent();
      members.push({ name: memberName, value: memberValue });
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'EnumDefinition', name, members, loc: nodeLoc };
}

function buildPathCommand(cursor: TreeCursor, source: string): PathCommand {
  const nodeLoc = loc(cursor, source);
  let command = '';
  const args: PathArg[] = [];

  cursor.firstChild();
  do {
    if (cursor.name === 'PathCommandLetter') {
      command = text(cursor, source);
    } else if (cursor.name === 'PathArgs') {
      // PathArgs is an opaque token — parse its content manually
      const argsText = text(cursor, source).trim();
      args.push(...parsePathArgs(argsText, cursor.from, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'PathCommand', command, args, loc: nodeLoc };
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
            // Parse the inner expression using Parsimmon for full fidelity
            const innerExpr = parseExpressionString(parenContent)
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
                } as MethodCallExpression;
                pos += parenContent.length + 2;
                continue;
              }
            }

            expr = {
              type: 'MemberExpression',
              object: expr as Expression,
              property: propName,
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
      body = buildBlock(cursor, source);
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

  // Extract expressions between parens, then template or block
  cursor.firstChild();
  const exprs: Expression[] = [];
  let inParens = false;
  do {
    if (cursor.name === '(') inParens = true;
    else if (cursor.name === ')') inParens = false;
    else if (inParens && isExpressionNode(cursor.name)) {
      exprs.push(buildExpression(cursor, source));
    } else if (cursor.name === 'TemplateLiteral') {
      content = buildTemplateLiteral(cursor, source);
    } else if (cursor.name === 'TextBlock') {
      body = buildTextBlock(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  if (exprs.length >= 1) x = exprs[0];
  if (exprs.length >= 2) y = exprs[1];
  if (exprs.length >= 3) rotation = exprs[2];
  if (exprs.length >= 4) styles = exprs[3];

  return { type: 'TextStatement', x, y, rotation, styles, content, body, loc: nodeLoc };
}

function buildTextBlock(cursor: TreeCursor, source: string): TextBodyItem[] {
  const items: TextBodyItem[] = [];
  cursor.firstChild();
  do {
    if (cursor.name === '{' || cursor.name === '}') continue;
    const item = buildStatement(cursor, source);
    if (item) items.push(item as TextBodyItem);
  } while (cursor.nextSibling());
  cursor.parent();
  return items;
}

function buildFontDirective(cursor: TreeCursor, source: string): FontDirective {
  const nodeLoc = loc(cursor, source);
  let fontSource = '';
  let weight: number | undefined;

  cursor.firstChild();
  do {
    if (cursor.name === 'String') {
      fontSource = parseStringContent(text(cursor, source));
    } else if (cursor.name === 'Number') {
      weight = parseFloat(text(cursor, source));
    }
  } while (cursor.nextSibling());
  cursor.parent();

  return { type: 'FontDirective', source: fontSource, weight, loc: nodeLoc };
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
    case 'Identifier': return buildIdentifier(cursor, source);
    case 'ParenExpression': return buildParenExpression(cursor, source);
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
  if (name === 'BinaryExpression' || name === 'TernaryExpression' ||
      name === 'UnaryExpression' || name === 'ArrayLiteral' ||
      name === 'ObjectLiteral' || name === 'CalcExpression' ||
      name === 'StyleBlockLiteral' || name === 'PathBlockExpression' ||
      name === 'TextBlockExpression' || name === 'LayerConstructor' ||
      name === 'TemplateLiteral' || name === 'ParenExpression') {
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
        // Extract method name and args from e.g., "oklch(0.7, 0.15, 200)"
        const fnMatch = raw.match(/^(\w+)\(([^)]*)\)$/);
        if (fnMatch) {
          const methodArgs = parseFunctionArgs(fnMatch[2], cursor.from + fnMatch[1].length + 1, source);
          expr = { type: 'MethodCallExpression', object: expr, method: fnMatch[1], args: methodArgs } as MethodCallExpression;
        } else {
          expr = { type: 'MemberExpression', object: expr, property: raw } as MemberExpression;
        }
        // Continue — cursor is on the CSSColorLiteral, next iteration will advance
        continue;
      }

      const propName = text(cursor, source);

      // Peek ahead for ArgList, TrailingBlock, or next op
      if (!cursor.nextSibling()) {
        expr = { type: 'MemberExpression', object: expr, property: propName } as MemberExpression;
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
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args, block } as MethodCallExpression;
      } else if (cursor.name === 'TrailingBlock') {
        const block = buildTrailingBlock(cursor, source);
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args: [], block } as MethodCallExpression;
      } else {
        // Simple member access — cursor is already on the next token
        expr = { type: 'MemberExpression', object: expr, property: propName } as MemberExpression;
        needsAdvance = false; // Don't skip the current token
      }
    } else if (sibName === '[') {
      if (!cursor.nextSibling()) break;
      const index = buildExpression(cursor, source);
      cursor.nextSibling(); // skip ']'
      expr = { type: 'IndexExpression', object: expr, index } as IndexExpression;
    } else if (sibName === 'TrailingBlock') {
      const block = buildTrailingBlock(cursor, source);
      if (expr.type === 'FunctionCall') {
        (expr as FunctionCall).block = block;
      }
    } else if (sibName === ';' || sibName === '⚠' || sibName === '=' || sibName === ',' || sibName === ')' || sibName === ']') {
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

  cursor.firstChild(); // Enter TrailingBlock
  let inParams = false;
  let passedParams = false;
  do {
    if (cursor.name === '|' && !inParams) {
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
          } as MethodCallExpression;
        } else {
          // Simple member access
          expr = {
            type: 'MemberExpression',
            object: expr,
            property: propName,
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
  do {
    if (cursor.name !== '?' && cursor.name !== ':' && isExpressionNode(cursor.name)) {
      parts.push(buildExpression(cursor, source));
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
  let phase = 0;

  do {
    const n = cursor.name;
    if (phase === 0 && isExpressionNode(n)) {
      left = buildExpression(cursor, source);
      phase = 1;
    } else if (phase === 1 && isOperator(n)) {
      operator = text(cursor, source);
      phase = 2;
    } else if (phase === 2 && isExpressionNode(n)) {
      right = buildExpression(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

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

  do {
    if (cursor.name === '-' || cursor.name === '!') {
      operator = text(cursor, source) as '-' | '!';
    } else if (isExpressionNode(cursor.name)) {
      argument = buildExpression(cursor, source);
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
  const parts: (string | Expression)[] = [];

  // Try to walk children (works when Lezer properly tokenizes template parts)
  if (cursor.firstChild()) {
    do {
      if (cursor.name === 'templateContent') {
        parts.push(text(cursor, source));
      } else if (cursor.name === 'TemplateInterpolation') {
        cursor.firstChild();
        do {
          if (cursor.name !== 'templateInterpStart' && cursor.name !== 'templateInterpEnd') {
            parts.push(buildExpressionWithPostfix(cursor, source));
          }
        } while (cursor.nextSibling());
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
  } else {
    // Fallback: TemplateLiteral is an opaque node (no child tokens).
    // Extract content from the raw text between backticks.
    const raw = text(cursor, source);
    if (raw.startsWith('`') && raw.endsWith('`')) {
      const inner = raw.slice(1, -1);
      // Parse ${...} interpolations from the raw string
      const templateParts = parseTemplateString(inner, cursor.from + 1, source);
      parts.push(...templateParts);
    }
  }
  return { type: 'TemplateLiteral', parts };
}

/**
 * Parse a template string's inner content (between backticks) into parts.
 * Handles ${expr} interpolations by re-parsing the expression content.
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
      // Emit preceding text
      if (pos > textStart) {
        parts.push(inner.slice(textStart, pos));
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
  // Emit remaining text
  if (pos > textStart) {
    parts.push(inner.slice(textStart, pos));
  }
  return parts;
}

function buildCalcExpression(cursor: TreeCursor, source: string): CalcExpression {
  cursor.firstChild();
  let expression: Expression = { type: 'NullLiteral' };
  do {
    if (cursor.name !== 'calc' && cursor.name !== '(' && cursor.name !== ')') {
      expression = buildExpression(cursor, source);
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
        if (cursor.name !== '...') arg = buildExpression(cursor, source);
      } while (cursor.nextSibling());
      cursor.parent();
      elements.push({ type: 'SpreadElement', argument: arg });
    } else if (cursor.name !== '[' && cursor.name !== ']' && cursor.name !== ',') {
      elements.push(buildExpression(cursor, source));
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
      let value: Expression = { type: 'NullLiteral' };
      do {
        if (cursor.name === 'Identifier' || cursor.name === 'String') {
          if (!key) key = cursor.name === 'String' ? parseStringContent(text(cursor, source)) : text(cursor, source);
          else value = buildExpression(cursor, source);
        } else if (cursor.name !== ':') {
          value = buildExpression(cursor, source);
        }
      } while (cursor.nextSibling());
      cursor.parent();
      properties.push({ key, value });
    } else if (cursor.name === 'SpreadElement') {
      cursor.firstChild();
      let arg: Expression = { type: 'NullLiteral' };
      do {
        if (cursor.name !== '...') arg = buildExpression(cursor, source);
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
  do {
    if (cursor.name === 'StyleContent') {
      raw = text(cursor, source);
    }
  } while (cursor.nextSibling());
  cursor.parent();

  // Parse CSS-like style declarations from raw text
  const properties: StyleProperty[] = [];
  const stripped = raw.replace(/\/\/[^\n]*/g, ''); // Strip comments
  const re = /([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;\n]+);/g;
  let match;
  while ((match = re.exec(stripped)) !== null) {
    properties.push({ type: 'StyleProperty', name: match[1], value: match[2].trim() });
  }

  return { type: 'StyleBlockLiteral', properties };
}

function buildPathBlockExpression(cursor: TreeCursor, source: string): PathBlockExpression {
  const nodeLoc = loc(cursor, source);
  const body: Statement[] = [];
  cursor.firstChild();
  do {
    if (cursor.name !== 'pathBlockOpen' && cursor.name !== '}') {
      const stmt = buildStatement(cursor, source);
      if (stmt) body.push(stmt);
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'PathBlockExpression', body, loc: nodeLoc };
}

function buildTextBlockExpression(cursor: TreeCursor, source: string): TextBlockExpression {
  const nodeLoc = loc(cursor, source);
  const body: Statement[] = [];
  cursor.firstChild();
  do {
    if (cursor.name !== 'textBlockOpen' && cursor.name !== '}') {
      const stmt = buildStatement(cursor, source);
      if (stmt) body.push(stmt);
    }
  } while (cursor.nextSibling());
  cursor.parent();
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

function buildParenExpression(cursor: TreeCursor, source: string): Expression {
  cursor.firstChild();
  let expr: Expression = { type: 'NullLiteral' };
  do {
    if (cursor.name !== '(' && cursor.name !== ')') {
      expr = buildExpression(cursor, source);
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
    if (cursor.name !== '{' && cursor.name !== '}') {
      const stmt = buildStatement(cursor, source);
      if (stmt) stmts.push(stmt);
    }
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
    name === 'TextBlockExpression' || name === 'CalcExpression' || name === 'LayerConstructor' ||
    name === 'Identifier' || name === 'ParenExpression' || name === 'ArgList';
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
