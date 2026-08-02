import { parse, parseLezer } from '../parser';

import type { TextDocument } from './document';
import type { Range } from './types';
import type {
  Program,
  Statement,
  Expression,
  PathCommand,
  PathArg,
  FunctionCall,
  MethodCallExpression,
  TernaryExpression,
  BinaryExpression,
  TextBodyItem,
} from '../parser/ast';

export interface FormatOptions {
  /** Indentation string (default: '  ' — two spaces) */
  indent?: string;
}

export interface FormatEdit {
  range: Range;
  newText: string;
}

/**
 * Format a Pathogen document.
 * Returns a single edit that replaces the entire document content.
 * Returns empty array if the source cannot be parsed.
 */
export function formatDocument(document: TextDocument, options?: FormatOptions): FormatEdit[] {
  const source = document.getText();
  const indent = options?.indent ?? '  ';

  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    // parse() is strict — it rejects code with missing semicolons.
    // Fall back to Lezer's error-recovery parse so the formatter can still
    // work on code that has minor issues (like missing semicolons).
    try {
      const lezerResult = parseLezer(source);
      ast = lezerResult.ast;
    } catch {
      return []; // Can't format at all
    }
  }

  const raw = formatStatements(ast.body, 0, indent, source);

  // Strip trailing whitespace on every line
  const stripped = raw.split('\n').map((line) => line.trimEnd()).join('\n');
  // Preserve final newline if the source had one
  const sourceEndsWithNewline = source.endsWith('\n');
  const formatted = sourceEndsWithNewline && !stripped.endsWith('\n') ? stripped + '\n' : stripped;

  // If already formatted, return no edits
  if (formatted === source) return [];

  return [{
    range: {
      start: { line: 0, character: 0 },
      end: document.positionAt(source.length),
    },
    newText: formatted,
  }];
}

// --- Blank line helpers ---

function countBlankLinesBetween(source: string, fromOffset: number, toOffset: number): number {
  const segment = source.slice(fromOffset, toOffset);
  const lines = segment.split('\n');
  // Skip first line (belongs to previous stmt) and last line (belongs to current stmt)
  let blanks = 0;
  for (let i = 1; i < lines.length - 1; i++) {
    if (lines[i].trim() === '') blanks++;
  }
  return blanks;
}

// --- Formatting ---

function formatStatements(stmts: Statement[], depth: number, indent: string, source?: string): string {
  const lines: string[] = [];
  const prefix = indent.repeat(depth);

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];

    // Preserve blank lines from source, normalize 3+ → 2
    if (source && i > 0) {
      const prevLoc = (stmts[i - 1] as any).loc;
      const currLoc = (stmt as any).loc;
      if (prevLoc?.offset != null && currLoc?.offset != null) {
        const blanks = countBlankLinesBetween(source, prevLoc.offset, currLoc.offset);
        const normalized = Math.min(blanks, 2);
        for (let j = 0; j < normalized; j++) {
          lines.push('');
        }
      }
    }

    lines.push(formatStatement(stmt, depth, indent, prefix, source));
  }

  return lines.join('\n');
}

function formatStatement(stmt: Statement, depth: number, indent: string, prefix: string, source?: string): string {
  switch (stmt.type) {
    case 'LetDeclaration': {
      const value = formatExpression(stmt.value, depth, indent, source);
      if (stmt.pattern) {
        if (stmt.pattern.type === 'ArrayDestructuringPattern') {
          const elements = stmt.pattern.elements.join(', ');
          const rest = stmt.pattern.rest ? `, ...${stmt.pattern.rest}` : '';
          return `${prefix}let [${elements}${rest}] = ${value};`;
        }
        if (stmt.pattern.type === 'ObjectDestructuringPattern') {
          const props = stmt.pattern.properties.map((p) =>
            p.alias ? `${p.key}: ${p.alias}` : p.key,
          ).join(', ');
          const rest = stmt.pattern.rest ? `, ...${stmt.pattern.rest}` : '';
          return `${prefix}let { ${props}${rest} } = ${value};`;
        }
      }
      return `${prefix}let ${stmt.name} = ${value};`;
    }
    case 'AssignmentStatement':
      return `${prefix}${stmt.name} = ${formatExpression(stmt.value, depth, indent, source)};`;
    case 'FunctionDefinition': {
      const paramStr = formatParamList(stmt.params, depth, indent);
      const body = formatStatements(stmt.body, depth + 1, indent, source);
      return `${prefix}fn ${stmt.name}(${paramStr}) {\n${body}\n${prefix}}`;
    }
    case 'EnumDefinition': {
      const members = stmt.members.map((m) => {
        const val = m.value ? ` = ${formatExpression(m.value, depth + 1, indent, source)}` : '';
        return `${indent.repeat(depth + 1)}${m.name}${val},`;
      }).join('\n');
      return `${prefix}enum ${stmt.name} {\n${members}\n${prefix}}`;
    }
    case 'ForLoop': {
      const start = formatExpression(stmt.start, depth, indent, source);
      const end = formatExpression(stmt.end, depth, indent, source);
      const body = formatStatements(stmt.body, depth + 1, indent, source);
      return `${prefix}for (${stmt.variable} in ${start}..${end}) {\n${body}\n${prefix}}`;
    }
    case 'ForEachLoop': {
      const iterable = formatExpression(stmt.iterable, depth, indent, source);
      const varName = stmt.indexVariable
        ? `[${stmt.variable}, ${stmt.indexVariable}]`
        : stmt.variable;
      const body = formatStatements(stmt.body, depth + 1, indent, source);
      return `${prefix}for (${varName} in ${iterable}) {\n${body}\n${prefix}}`;
    }
    case 'IfStatement': {
      const condition = formatExpression(stmt.condition, depth, indent, source);
      const consequent = formatStatements(stmt.consequent, depth + 1, indent, source);
      let result = `${prefix}if (${condition}) {\n${consequent}\n${prefix}}`;
      if (stmt.alternate) {
        const alternate = formatStatements(stmt.alternate, depth + 1, indent, source);
        result += ` else {\n${alternate}\n${prefix}}`;
      }
      return result;
    }
    case 'PathCommand': {
      const formatted = formatPathCommand(stmt, depth, indent, source);
      // Function calls and method calls wrapped as PathCommand (no command letter)
      // need semicolons — the parser requires them inside .apply blocks and at
      // statement level. Only actual SVG path commands (M, L, C, Z, etc.) skip them.
      const isStatementCall = !stmt.command && stmt.args.length > 0 &&
        (stmt.args[0].type === 'FunctionCall' || stmt.args[0].type === 'MethodCallExpression');
      // Commands carrying suffix clauses (`with fillet(...)` / `as segment(...)`)
      // also take a trailing semicolon so the clauses terminate cleanly — EXCEPT
      // close-path (`z`/`Z`), where the suffix is unambiguous without the
      // terminator, so we emit the terser form. (An earlier GLR ambiguity made
      // `z <suffix>;` mid-document unparseable; fixed via @dynamicPrecedence on
      // PathCommand and pinned by parser.test.ts regressions — this branch is
      // now purely stylistic and safe either way.)
      const isClosePath = stmt.command === 'z' || stmt.command === 'Z';
      const needsSemicolon = isStatementCall || (stmt.annotations != null && !isClosePath);
      return `${prefix}${formatted}${needsSemicolon ? ';' : ''}`;
    }
    case 'ReturnStatement':
      return `${prefix}return ${formatExpression(stmt.value, depth, indent, source)};`;
    case 'ExpressionStatement':
      return `${prefix}${formatExpression(stmt.expression, depth, indent, source)};`;
    case 'LayerDefinition': {
      const name = formatExpression(stmt.name, depth, indent, source);
      const style = formatExpression(stmt.styleExpr, depth, indent, source);
      const def = stmt.isDefault ? 'default ' : '';
      return `${prefix}define ${def}${stmt.layerType}(${name}) ${style}`;
    }
    case 'ViewBoxDefinition': {
      const ox = formatExpression(stmt.originX, depth, indent, source);
      const oy = formatExpression(stmt.originY, depth, indent, source);
      const w = formatExpression(stmt.width, depth, indent, source);
      const h = formatExpression(stmt.height, depth, indent, source);
      return `${prefix}define ViewBox(${ox}, ${oy}, ${w}, ${h});`;
    }
    case 'LayerApplyBlock': {
      const body = formatStatements(stmt.body, depth + 1, indent, source);
      if (stmt.layerName.type === 'Identifier') {
        const name = formatExpression(stmt.layerName, depth, indent, source);
        return `${prefix}${name}.apply {\n${body}\n${prefix}}`;
      }
      const name = formatExpression(stmt.layerName, depth, indent, source);
      return `${prefix}layer(${name}).apply {\n${body}\n${prefix}}`;
    }
    case 'TextStatement': {
      const args: string[] = [
        formatExpression(stmt.x, depth, indent, source),
        formatExpression(stmt.y, depth, indent, source),
      ];
      if (stmt.rotation) args.push(formatExpression(stmt.rotation, depth, indent, source));
      if (stmt.styles) args.push(formatExpression(stmt.styles, depth, indent, source));
      if (stmt.content) {
        return `${prefix}text(${args.join(', ')})${formatExpression(stmt.content, depth, indent, source)};`;
      }
      if (stmt.body) {
        const body = stmt.body.map((item) =>
          formatTextBodyItem(item, depth + 1, indent, source),
        ).join('\n');
        return `${prefix}text(${args.join(', ')}) {\n${body}\n${prefix}}`;
      }
      return `${prefix}text(${args.join(', ')});`;
    }
    case 'Comment':
      return `${prefix}${stmt.text}`;
    case 'IndexedAssignmentStatement':
      return `${prefix}${formatExpression(stmt.object, depth, indent, source)}[${formatExpression(stmt.index, depth, indent, source)}] = ${formatExpression(stmt.value, depth, indent, source)};`;
    case 'MemberAssignmentStatement':
      return `${prefix}${formatExpression(stmt.object, depth, indent, source)}.${stmt.property} = ${formatExpression(stmt.value, depth, indent, source)};`;
    case 'FontDirective': {
      const src = stmt.sourceKind === 'identifier' ? stmt.source : `"${stmt.source}"`;
      return `${prefix}@font ${src}${stmt.weight ? ` ${stmt.weight}` : ''};`;
    }
    default:
      return prefix;
  }
}

// --- Text body item formatting ---

function formatTextBodyItem(item: TextBodyItem, depth: number, indent: string, source?: string): string {
  const prefix = indent.repeat(depth);
  if (item.type === 'TspanStatement') {
    const args: string[] = [];
    if (item.dx) args.push(formatExpression(item.dx, depth, indent, source));
    if (item.dy) args.push(formatExpression(item.dy, depth, indent, source));
    if (item.rotation) args.push(formatExpression(item.rotation, depth, indent, source));
    if (item.styles) args.push(formatExpression(item.styles, depth, indent, source));
    const content = formatExpression(item.content, depth, indent, source);
    return `${prefix}tspan(${args.join(', ')})${content};`;
  }
  if (item.type === 'TemplateLiteral') {
    const content = formatExpression(item, depth, indent, source);
    return `${prefix}${content};`;
  }
  // ForLoop, ForEachLoop, IfStatement, LetDeclaration are Statement types
  return formatStatement(item as Statement, depth, indent, prefix, source);
}

// --- Function param wrapping ---

function formatParamList(params: string[], depth: number, indent: string): string {
  if (params.length < 5) return params.join(', ');
  // Break after every 4th param, 4-space continuation indent
  const contIndent = indent.repeat(depth) + '    ';
  const chunks: string[][] = [];
  for (let i = 0; i < params.length; i += 4) {
    chunks.push(params.slice(i, i + 4));
  }
  return chunks.map((chunk, i) =>
    i === 0 ? chunk.join(', ') : `${contIndent}${chunk.join(', ')}`,
  ).join(',\n');
}

// --- Path commands ---

function formatPathCommand(cmd: PathCommand, depth: number, indent: string, source?: string): string {
  const suffix = formatPathAnnotations(cmd.annotations, depth, indent, source);
  if (cmd.args.length === 0) return `${cmd.command}${suffix}`;
  const args = cmd.args.map((a) => formatPathArg(a, depth, indent, source)).join(' ');
  // Empty command (e.g., standalone function call like circle(cx, cy, r))
  if (!cmd.command) return `${args}${suffix}`;
  return `${cmd.command} ${args}${suffix}`;
}

// `with <cornerOp>(...)` then comma-separated `as segment('x'), endpoint('y')`.
// Order is fixed (with before as) to match the grammar.
function formatPathAnnotations(
  annotations: PathCommand['annotations'],
  depth: number,
  indent: string,
  source?: string,
): string {
  if (!annotations) return '';
  let result = '';
  if (annotations.cornerOp) {
    const args = annotations.cornerOp.args
      .map((a) => formatExpression(a, depth, indent, source))
      .join(', ');
    result += ` with ${annotations.cornerOp.kind}(${args})`;
  }
  if (annotations.labels && annotations.labels.length > 0) {
    const labels = annotations.labels
      .map((l) => `${l.kind}(${formatExpression(l.name, depth, indent, source)})`)
      .join(', ');
    result += ` as ${labels}`;
  }
  return result;
}

function formatPathArg(arg: PathArg, depth: number, indent: string, source?: string): string {
  switch (arg.type) {
    case 'NumberLiteral': {
      const unit = arg.unit ?? '';
      return `${arg.value}${unit}`;
    }
    case 'BooleanLiteral':
      return arg.value ? '1' : '0';
    case 'Identifier':
      return arg.name;
    case 'CalcExpression':
      return `calc(${formatExpression(arg.expression, depth, indent, source)})`;
    case 'FunctionCall':
      return formatFunctionCallExpr(arg as FunctionCall, depth, indent, source);
    case 'MemberExpression':
      return formatExpression(arg as any, depth, indent, source);
    case 'IndexExpression':
      return `${formatExpression((arg as any).object, depth, indent, source)}[${formatExpression((arg as any).index, depth, indent, source)}]`;
    case 'MethodCallExpression':
      return formatExpression(arg as any, depth, indent, source);
    default:
      return '';
  }
}

// --- Method chain helpers ---

function countMethodChainDepth(expr: Expression): number {
  let count = 0;
  let current: Expression = expr;
  while (current.type === 'MethodCallExpression') {
    count++;
    current = (current as MethodCallExpression).object;
  }
  return count;
}

function formatMethodChain(expr: MethodCallExpression, depth: number, indent: string, source?: string): string {
  // Collect chain steps from innermost to outermost
  const steps: { method: string; args: Expression[]; block?: { params: string[]; body: Statement[] } }[] = [];
  let base: Expression = expr;
  while (base.type === 'MethodCallExpression') {
    const mce = base as MethodCallExpression;
    steps.unshift({ method: mce.method, args: mce.args, block: mce.block });
    base = mce.object;
  }

  const baseStr = formatExpression(base, depth, indent, source);
  const contIndent = indent.repeat(depth) + '    ';

  let result = baseStr;
  for (const step of steps) {
    const argStr = formatArgList(step.args, depth, indent, source);
    const blockStr = step.block ? formatTrailingBlock(step.block, depth, indent, source) : '';
    result += `\n${contIndent}.${step.method}(${argStr})${blockStr}`;
  }
  return result;
}

// --- Trailing block ---

function formatTrailingBlock(
  block: { params: string[]; body: Statement[] },
  depth: number,
  indent: string,
  source?: string,
): string {
  const paramStr = block.params.length > 0 ? `|${block.params.join(', ')}|` : '';
  if (block.body.length === 0) {
    return ` {${paramStr}}`;
  }
  const bodyLines = formatStatements(block.body, depth + 1, indent, source);

  // Attempt gradient stop column alignment
  const aligned = alignGradientStops(bodyLines, indent.repeat(depth + 1));

  return ` {${paramStr}\n${aligned}\n${indent.repeat(depth)}}`;
}

// --- Gradient stop alignment ---

function alignGradientStops(bodyText: string, _innerIndent: string): string {
  const lines = bodyText.split('\n');
  // Check if all non-empty lines match the stop pattern
  const stopPattern = /^(\s*\S+\.stop\()([^,]+)(,\s*.+);$/;
  const matches = lines.map((line) => line.trim() === '' ? null : stopPattern.exec(line));
  const allStops = matches.every((m, i) => m !== null || lines[i].trim() === '');

  if (!allStops || matches.filter(Boolean).length < 2) return bodyText;

  const maxOffsetWidth = Math.max(...matches.map((m) => m ? m[2].length : 0));

  return lines.map((line, i) => {
    const m = matches[i];
    if (!m) return line;
    const padded = m[2].padEnd(maxOffsetWidth);
    return `${m[1]}${padded}${m[3]};`;
  }).join('\n');
}

// --- Function call formatting ---

function shouldWrapArgs(args: Expression[]): boolean {
  // Style guide: wrap if 5+ args
  if (args.length >= 5) return true;
  // Also wrap if 4 args and any is a complex expression (calc, function call, method call)
  if (args.length >= 4) {
    return args.some((a) =>
      a.type === 'FunctionCall' || a.type === 'CalcExpression' || a.type === 'MethodCallExpression',
    );
  }
  return false;
}

function formatArgList(args: Expression[], depth: number, indent: string, source?: string): string {
  return args.map((a) => formatExpression(a, depth, indent, source)).join(', ');
}

function formatFunctionCallExpr(
  expr: FunctionCall,
  depth: number,
  indent: string,
  source?: string,
): string {
  const args = expr.args.map((a) => formatExpression(a, depth, indent, source));

  let result: string;
  if (shouldWrapArgs(expr.args) && expr.args.length > 0) {
    const contIndent = indent.repeat(depth) + '    ';
    const wrapped = args.map((a, i) =>
      i === 0 ? a : `${contIndent}${a}`,
    );
    result = `${expr.name}(${wrapped[0]},\n${wrapped.slice(1).join(',\n')})`;
  } else {
    result = `${expr.name}(${args.join(', ')})`;
  }

  if (expr.block) {
    result += formatTrailingBlock(expr.block, depth, indent, source);
  }

  return result;
}

// --- Ternary helpers ---

function countLogicalOps(expr: Expression): number {
  if (expr.type !== 'BinaryExpression') return 0;
  const be = expr as BinaryExpression;
  if (be.operator === '||' || be.operator === '&&') {
    return 1 + countLogicalOps(be.left) + countLogicalOps(be.right);
  }
  return 0;
}

function formatTernary(expr: TernaryExpression, depth: number, indent: string, source?: string): string {
  const cond = formatExpression(expr.condition, depth, indent, source);
  const cons = formatExpression(expr.consequent, depth, indent, source);
  const alt = formatExpression(expr.alternate, depth, indent, source);

  const isNestedAlternate = expr.alternate.type === 'TernaryExpression';

  if (isNestedAlternate) {
    const contIndent = indent.repeat(depth + 1);
    const altFormatted = formatExpression(expr.alternate, depth + 1, indent, source);
    return `${cond} ?\n${contIndent}${cons} : ${altFormatted}`;
  }

  const logicalOpCount = countLogicalOps(expr.condition);
  if (logicalOpCount >= 3) {
    const contIndent = indent.repeat(depth + 1);
    // Break the condition at top-level || or && operators
    const condParts = splitAtLogicalOps(expr.condition, depth, indent, source);
    const firstPart = condParts[0];
    const restParts = condParts.slice(1).map((p) => `${contIndent}${p}`);
    const allParts = [firstPart, ...restParts];
    return `${allParts.join('\n')} ? ${cons} : ${alt}`;
  }

  return `${cond} ? ${cons} : ${alt}`;
}

function splitAtLogicalOps(expr: Expression, depth: number, indent: string, source?: string): string[] {
  if (expr.type !== 'BinaryExpression') return [formatExpression(expr, depth, indent, source)];
  const be = expr as BinaryExpression;
  if (be.operator === '||' || be.operator === '&&') {
    const leftParts = splitAtLogicalOps(be.left, depth, indent, source);
    const rightParts = splitAtLogicalOps(be.right, depth, indent, source);
    // Append operator to last part of left
    leftParts[leftParts.length - 1] += ` ${be.operator}`;
    return [...leftParts, ...rightParts];
  }
  return [formatExpression(expr, depth, indent, source)];
}

// --- Expression formatting ---

/**
 * Binary operator precedence, mirroring pathogen.grammar's @precedence block
 * (times > plus > compare > merge > equality > and > or; all left-associative).
 * Higher number binds tighter.
 */
const OP_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<<': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
};

/** Operators where (a op b) op c === a op (b op c) — equal-precedence right children need no parens. */
const ASSOCIATIVE_OPS = new Set(['+', '*', '&&', '||', '<<']);

/**
 * Format one operand of a binary expression, parenthesizing when required to
 * preserve the parse. Dropping these parens silently changes semantics —
 * `(i + 0.5) / 28` is NOT `i + 0.5 / 28`.
 */
function formatBinaryOperand(
  child: Expression,
  parentOp: string,
  isRight: boolean,
  depth: number,
  indent: string,
  source?: string,
): string {
  const text = formatExpression(child, depth, indent, source);
  if (child.type === 'TernaryExpression') return `(${text})`;
  if (child.type !== 'BinaryExpression') return text;
  const childPrec = OP_PRECEDENCE[(child as BinaryExpression).operator] ?? 0;
  const parentPrec = OP_PRECEDENCE[parentOp] ?? 0;
  if (childPrec < parentPrec) return `(${text})`;
  // Left-associative grammar: an equal-precedence RIGHT child re-parses as the
  // parent's left unless the operator is associative (a - (b - c), a / (b * c)).
  if (isRight && childPrec === parentPrec && !ASSOCIATIVE_OPS.has(parentOp)) return `(${text})`;
  return text;
}

/**
 * Re-quote a string literal, choosing the quote that minimizes escaping and
 * re-escaping what parseStringContent unescapes. Naive `'${value}'` corrupts
 * any value containing a single quote.
 */
function formatStringValue(value: string): string {
  const escapeCommon = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
  if (value.includes("'") && !value.includes('"')) {
    return `"${escapeCommon(value)}"`;
  }
  return `'${escapeCommon(value).replace(/'/g, "\\'")}'`;
}

function formatExpression(expr: Expression, depth: number, indent: string, source?: string): string {
  switch (expr.type) {
    case 'NumberLiteral': {
      const unit = expr.unit ?? '';
      return `${expr.value}${unit}`;
    }
    case 'StringLiteral':
      return formatStringValue(expr.value);
    case 'TemplateLiteral': {
      const parts = expr.parts.map((p) =>
        typeof p === 'string' ? p : `\${${formatExpression(p, depth, indent, source)}}`,
      );
      return `\`${parts.join('')}\``;
    }
    case 'BooleanLiteral':
      return expr.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    case 'Identifier':
      return expr.name;
    case 'LambdaExpression': {
      // Zero-param lambdas MUST print as {|| ...} — a bare {} would reparse
      // as an ObjectLiteral.
      const paramStr = expr.params.length > 0 ? `|${expr.params.join(', ')}|` : '||';
      if (expr.body.length === 0) return `{${paramStr}}`;
      const bodyLines = formatStatements(expr.body, depth + 1, indent, source);
      return `{${paramStr}\n${bodyLines}\n${indent.repeat(depth)}}`;
    }
    case 'ColorLiteral':
      return expr.raw;
    case 'BinaryExpression': {
      const left = formatBinaryOperand(expr.left, expr.operator, false, depth, indent, source);
      const right = formatBinaryOperand(expr.right, expr.operator, true, depth, indent, source);
      return `${left} ${expr.operator} ${right}`;
    }
    case 'UnaryExpression': {
      const arg = formatExpression(expr.argument, depth, indent, source);
      // -(a + b) must not print as -a + b.
      if (expr.argument.type === 'BinaryExpression' || expr.argument.type === 'TernaryExpression') {
        return `${expr.operator}(${arg})`;
      }
      return `${expr.operator}${arg}`;
    }
    case 'TernaryExpression':
      return formatTernary(expr, depth, indent, source);
    case 'CalcExpression':
      return `calc(${formatExpression(expr.expression, depth, indent, source)})`;
    case 'FunctionCall':
      return formatFunctionCallExpr(expr, depth, indent, source);
    case 'MethodCallExpression': {
      const chainDepth = countMethodChainDepth(expr);
      if (chainDepth >= 3) {
        return formatMethodChain(expr, depth, indent, source);
      }
      const obj = formatExpression(expr.object, depth, indent, source);
      const args = expr.args.map((a) => formatExpression(a, depth, indent, source));
      let argStr: string;
      if (shouldWrapArgs(expr.args) && expr.args.length > 0) {
        const contIndent = indent.repeat(depth) + '    ';
        const wrapped = args.map((a, i) =>
          i === 0 ? a : `${contIndent}${a}`,
        );
        argStr = `${wrapped[0]},\n${wrapped.slice(1).join(',\n')}`;
      } else {
        argStr = args.join(', ');
      }
      let result = `${obj}.${expr.method}(${argStr})`;
      if (expr.block) {
        result += formatTrailingBlock(expr.block, depth, indent, source);
      }
      return result;
    }
    case 'MemberExpression':
      return `${formatExpression(expr.object, depth, indent, source)}.${expr.property}`;
    case 'IndexExpression':
      return `${formatExpression(expr.object, depth, indent, source)}[${formatExpression(expr.index, depth, indent, source)}]`;
    case 'ArrayLiteral': {
      if (expr.elements.length === 0) return '[]';
      const inner = indent.repeat(depth + 1);
      const close = indent.repeat(depth);
      const elements = expr.elements.map((e) => {
        const formatted = e.type === 'SpreadElement'
          ? `...${formatExpression(e.argument, depth + 1, indent, source)}`
          : formatExpression(e, depth + 1, indent, source);
        return `${inner}${formatted},`;
      });
      return `[\n${elements.join('\n')}\n${close}]`;
    }
    case 'ObjectLiteral': {
      if (expr.properties.length === 0) return '{}';
      const inner = indent.repeat(depth + 1);
      const close = indent.repeat(depth);
      const props = expr.properties.map((p) => {
        if (p.type === 'SpreadElement') {
          return `${inner}...${formatExpression(p.argument, depth + 1, indent, source)},`;
        }
        if (p.shorthand && p.value.type === 'Identifier' && p.value.name === p.key) {
          return `${inner}${p.key},`;
        }
        return `${inner}${p.key}: ${formatExpression(p.value, depth + 1, indent, source)},`;
      });
      return `{\n${props.join('\n')}\n${close}}`;
    }
    case 'StyleBlockLiteral': {
      if (expr.properties.length === 0) return '${}';
      const inner = indent.repeat(depth + 1);
      const close = indent.repeat(depth);
      const props = expr.properties.map((p) => `${inner}${p.name}: ${p.value};`);
      return `\${\n${props.join('\n')}\n${close}}`;
    }
    case 'LayerConstructorExpression': {
      const name = formatExpression(expr.name, depth, indent, source);
      const style = expr.styleExpr ? ` ${formatExpression(expr.styleExpr, depth, indent, source)}` : '';
      return `${expr.layerType}(${name})${style}`;
    }
    case 'PathBlockExpression': {
      const body = formatStatements(expr.body as Statement[], depth + 1, indent, source);
      return `@{\n${body}\n${indent.repeat(depth)}}`;
    }
    case 'TextBlockExpression': {
      const body = (expr.body as any[]).map((item: any) =>
        formatTextBodyItem(item, depth + 1, indent, source),
      ).join('\n');
      return `&{\n${body}\n${indent.repeat(depth)}}`;
    }
    default:
      return '';
  }
}
