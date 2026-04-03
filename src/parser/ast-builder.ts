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

    // Build LHS expression
    cursor.firstChild();
    const lhs = buildExpression(cursor, source);
    cursor.parent();

    // Build RHS expression — find the expression after "="
    cursor.firstChild();
    let rhs: Expression = { type: 'NullLiteral' };
    let foundEq = false;
    do {
      if (cursor.name === '=') foundEq = true;
      else if (foundEq && cursor.name !== ';') {
        rhs = buildExpression(cursor, source);
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
      iterable = buildExpression(cursor, source);
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
  let inCondition = false;
  do {
    if (cursor.name === '(') inCondition = true;
    else if (cursor.name === ')') inCondition = false;
    else if (inCondition && isExpressionNode(cursor.name)) {
      condition = buildExpression(cursor, source);
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

    // Identifier (possibly followed by function call, member access, etc.)
    if (/[a-zA-Z_]/.test(ch)) {
      const idMatch = argsText.slice(pos).match(/^[a-zA-Z_]\w*/);
      if (idMatch) {
        const name = idMatch[0];
        pos += name.length;

        // Check for calc(...)
        if (name === 'calc' && pos < argsText.length && argsText[pos] === '(') {
          const parenContent = extractParenContent(argsText, pos);
          if (parenContent !== null) {
            // For now, store calc expression as a CalcExpression with a simple identifier
            // A full implementation would parse the inner expression
            args.push({
              type: 'CalcExpression',
              expression: { type: 'Identifier', name: parenContent },
            } as CalcExpression);
            pos += parenContent.length + 2; // +2 for parens
            continue;
          }
        }

        // Check for function call name(...)
        if (pos < argsText.length && argsText[pos] === '(') {
          const parenContent = extractParenContent(argsText, pos);
          if (parenContent !== null) {
            // Parse as function call with raw args
            args.push({
              type: 'FunctionCall',
              name,
              args: [], // Simplified — full implementation would parse args
              loc: offsetToLoc(baseOffset + pos - name.length, source),
            } as FunctionCall);
            pos += parenContent.length + 2;
            continue;
          }
        }

        // Simple identifier (possibly with member access)
        const argLoc = offsetToLoc(baseOffset + pos - name.length, source);
        args.push({ type: 'Identifier', name, loc: argLoc });
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

  // Walk subsequent siblings for postfix ops
  // Use a look-ahead approach: peek at next sibling without consuming
  while (cursor.nextSibling()) {
    const sibName = cursor.name;

    if (sibName === 'ArgList') {
      // Function call: expr(args) or method call continuation
      const args = buildArgList(cursor, source);
      // Check for TrailingBlock after ArgList
      let block: { params: string[]; body: Statement[] } | undefined;
      if (cursor.nextSibling() && cursor.name === 'TrailingBlock') {
        block = buildTrailingBlock(cursor, source);
      } else if (cursor.name !== 'TrailingBlock') {
        // We advanced past ArgList to a non-TrailingBlock — process this sibling in next iteration
        if (expr.type === 'Identifier') {
          expr = { type: 'FunctionCall', name: expr.name, args, block, loc: (expr as Identifier).loc } as FunctionCall;
        }
        continue; // Don't call nextSibling again — already on the next one
      }
      if (expr.type === 'Identifier') {
        expr = { type: 'FunctionCall', name: expr.name, args, block, loc: (expr as Identifier).loc } as FunctionCall;
      }
    } else if (sibName === '.') {
      // Member access or method call: expr.prop or expr.method(args)
      if (!cursor.nextSibling()) break;
      const propName = text(cursor, source);

      // Peek ahead for ArgList or TrailingBlock
      if (!cursor.nextSibling()) {
        // Last sibling — simple member access
        expr = { type: 'MemberExpression', object: expr, property: propName } as MemberExpression;
        break;
      }

      if (cursor.name === 'ArgList') {
        const args = buildArgList(cursor, source);
        // Check for TrailingBlock after ArgList
        let block: { params: string[]; body: Statement[] } | undefined;
        if (cursor.nextSibling() && cursor.name === 'TrailingBlock') {
          block = buildTrailingBlock(cursor, source);
        } else if (cursor.name !== 'TrailingBlock') {
          expr = { type: 'MethodCallExpression', object: expr, method: propName, args, block } as MethodCallExpression;
          continue; // Already on next sibling
        }
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args, block } as MethodCallExpression;
      } else if (cursor.name === 'TrailingBlock') {
        // Method with trailing block, no parens: .method {|x| ...}
        const block = buildTrailingBlock(cursor, source);
        expr = { type: 'MethodCallExpression', object: expr, method: propName, args: [], block } as MethodCallExpression;
      } else {
        // Simple member access — current cursor is the next token after .prop
        expr = { type: 'MemberExpression', object: expr, property: propName } as MemberExpression;
        continue; // Process current sibling in next iteration
      }
    } else if (sibName === '[') {
      // Index access: expr[index]
      if (!cursor.nextSibling()) break;
      const index = buildExpression(cursor, source);
      cursor.nextSibling(); // skip ']'
      expr = { type: 'IndexExpression', object: expr, index } as IndexExpression;
    } else if (sibName === 'TrailingBlock') {
      // Trailing block directly after expression (rare but possible)
      const block = buildTrailingBlock(cursor, source);
      if (expr.type === 'FunctionCall') {
        (expr as FunctionCall).block = block;
      }
    } else if (sibName === ';' || sibName === '⚠' || sibName === '=' || sibName === ',' || sibName === ')' || sibName === ']') {
      break;
    } else {
      break; // Unknown sibling — stop postfix chain
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
    if (cursor.name !== '(' && cursor.name !== ')' && cursor.name !== ',') {
      args.push(buildExpression(cursor, source));
    }
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
  cursor.firstChild();
  do {
    if (cursor.name === 'templateContent') {
      parts.push(text(cursor, source));
    } else if (cursor.name === 'TemplateInterpolation') {
      cursor.firstChild();
      do {
        if (cursor.name !== 'templateInterpStart' && cursor.name !== 'templateInterpEnd') {
          parts.push(buildExpression(cursor, source));
        }
      } while (cursor.nextSibling());
      cursor.parent();
    }
  } while (cursor.nextSibling());
  cursor.parent();
  return { type: 'TemplateLiteral', parts };
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
  let foundParen = false;
  do {
    if (cursor.name === 'LayerType') {
      layerType = text(cursor, source) as 'PathLayer' | 'TextLayer' | 'GroupLayer';
    } else if (cursor.name === '(') {
      foundParen = true;
    } else if (foundParen && cursor.name !== ')' && isExpressionNode(cursor.name)) {
      name = buildExpression(cursor, source);
    } else if (cursor.name === 'StyleBlockLiteral') {
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
