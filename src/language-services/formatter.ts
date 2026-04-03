import { parse } from '../parser';

import type { TextDocument } from './document';
import type { Range } from './types';
import type {
  Program,
  Statement,
  Expression,
  PathCommand,
  PathArg,
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
    return []; // Can't format unparseable source
  }

  const formatted = formatStatements(ast.body, 0, indent);

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

// --- Formatting ---

function formatStatements(stmts: Statement[], depth: number, indent: string): string {
  const lines: string[] = [];
  const prefix = indent.repeat(depth);

  for (const stmt of stmts) {
    lines.push(formatStatement(stmt, depth, indent, prefix));
  }

  return lines.join('\n');
}

function formatStatement(stmt: Statement, depth: number, indent: string, prefix: string): string {
  switch (stmt.type) {
    case 'LetDeclaration': {
      const value = formatExpression(stmt.value);
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
      return `${prefix}${stmt.name} = ${formatExpression(stmt.value)};`;
    case 'FunctionDefinition': {
      const params = stmt.params.join(', ');
      const body = formatStatements(stmt.body, depth + 1, indent);
      return `${prefix}fn ${stmt.name}(${params}) {\n${body}\n${prefix}}`;
    }
    case 'EnumDefinition': {
      const members = stmt.members.map((m) => {
        if (m.value) return `${indent.repeat(depth + 1)}${m.name} = ${formatExpression(m.value)}`;
        return `${indent.repeat(depth + 1)}${m.name}`;
      }).join(',\n');
      return `${prefix}enum ${stmt.name} {\n${members}\n${prefix}}`;
    }
    case 'ForLoop': {
      const start = formatExpression(stmt.start);
      const end = formatExpression(stmt.end);
      const body = formatStatements(stmt.body, depth + 1, indent);
      return `${prefix}for (${stmt.variable} in ${start}..${end}) {\n${body}\n${prefix}}`;
    }
    case 'ForEachLoop': {
      const iterable = formatExpression(stmt.iterable);
      const varName = stmt.indexVariable
        ? `[${stmt.variable}, ${stmt.indexVariable}]`
        : stmt.variable;
      const body = formatStatements(stmt.body, depth + 1, indent);
      return `${prefix}for (${varName} in ${iterable}) {\n${body}\n${prefix}}`;
    }
    case 'IfStatement': {
      const condition = formatExpression(stmt.condition);
      const consequent = formatStatements(stmt.consequent, depth + 1, indent);
      let result = `${prefix}if (${condition}) {\n${consequent}\n${prefix}}`;
      if (stmt.alternate) {
        const alternate = formatStatements(stmt.alternate, depth + 1, indent);
        result += ` else {\n${alternate}\n${prefix}}`;
      }
      return result;
    }
    case 'PathCommand':
      return `${prefix}${formatPathCommand(stmt)}`;
    case 'ReturnStatement':
      return `${prefix}return ${formatExpression(stmt.value)};`;
    case 'ExpressionStatement':
      return `${prefix}${formatExpression(stmt.expression)}`;
    case 'LayerDefinition': {
      const name = formatExpression(stmt.name);
      const style = formatExpression(stmt.styleExpr);
      const def = stmt.isDefault ? 'default ' : '';
      return `${prefix}define ${def}${stmt.layerType}(${name}) ${style}`;
    }
    case 'LayerApplyBlock': {
      const name = formatExpression(stmt.layerName);
      const body = formatStatements(stmt.body, depth + 1, indent);
      return `${prefix}layer(${name}).apply {\n${body}\n${prefix}}`;
    }
    case 'TextStatement': {
      const x = formatExpression(stmt.x);
      const y = formatExpression(stmt.y);
      if (stmt.content) {
        return `${prefix}text(${x}, ${y})${formatExpression(stmt.content)}`;
      }
      if (stmt.body) {
        const body = stmt.body.map((item) =>
          formatStatement(item as Statement, depth + 1, indent, indent.repeat(depth + 1)),
        ).join('\n');
        return `${prefix}text(${x}, ${y}) {\n${body}\n${prefix}}`;
      }
      return `${prefix}text(${x}, ${y})`;
    }
    case 'Comment':
      return `${prefix}${stmt.text}`;
    case 'IndexedAssignmentStatement':
      return `${prefix}${formatExpression(stmt.object)}[${formatExpression(stmt.index)}] = ${formatExpression(stmt.value)};`;
    case 'MemberAssignmentStatement':
      return `${prefix}${formatExpression(stmt.object)}.${stmt.property} = ${formatExpression(stmt.value)};`;
    case 'FontDirective':
      return `${prefix}@font "${stmt.source}"${stmt.weight ? ` ${stmt.weight}` : ''}`;
    default:
      return prefix;
  }
}

function formatPathCommand(cmd: PathCommand): string {
  if (cmd.args.length === 0) return cmd.command;
  const args = cmd.args.map(formatPathArg).join(' ');
  // Empty command (e.g., standalone function call like circle(cx, cy, r))
  if (!cmd.command) return args;
  return `${cmd.command} ${args}`;
}

function formatPathArg(arg: PathArg): string {
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
      return `calc(${formatExpression(arg.expression)})`;
    case 'FunctionCall':
      return formatFunctionCall(arg);
    case 'MemberExpression':
      return formatExpression(arg);
    case 'IndexExpression':
      return `${formatExpression(arg.object)}[${formatExpression(arg.index)}]`;
    case 'MethodCallExpression':
      return formatExpression(arg);
    default:
      return '';
  }
}

function formatExpression(expr: Expression): string {
  switch (expr.type) {
    case 'NumberLiteral': {
      const unit = expr.unit ?? '';
      return `${expr.value}${unit}`;
    }
    case 'StringLiteral':
      return `'${expr.value}'`;
    case 'TemplateLiteral': {
      const parts = expr.parts.map((p) =>
        typeof p === 'string' ? p : `\${${formatExpression(p)}}`,
      );
      return `\`${parts.join('')}\``;
    }
    case 'BooleanLiteral':
      return expr.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    case 'Identifier':
      return expr.name;
    case 'ColorLiteral':
      return expr.raw;
    case 'BinaryExpression':
      return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
    case 'UnaryExpression':
      return `${expr.operator}${formatExpression(expr.argument)}`;
    case 'TernaryExpression':
      return `${formatExpression(expr.condition)} ? ${formatExpression(expr.consequent)} : ${formatExpression(expr.alternate)}`;
    case 'CalcExpression':
      return `calc(${formatExpression(expr.expression)})`;
    case 'FunctionCall':
      return formatFunctionCall(expr);
    case 'MethodCallExpression': {
      const obj = formatExpression(expr.object);
      const args = expr.args.map(formatExpression).join(', ');
      return `${obj}.${expr.method}(${args})`;
    }
    case 'MemberExpression':
      return `${formatExpression(expr.object)}.${expr.property}`;
    case 'IndexExpression':
      return `${formatExpression(expr.object)}[${formatExpression(expr.index)}]`;
    case 'ArrayLiteral': {
      const elements = expr.elements.map((e) =>
        e.type === 'SpreadElement' ? `...${formatExpression(e.argument)}` : formatExpression(e),
      );
      return `[${elements.join(', ')}]`;
    }
    case 'ObjectLiteral': {
      const props = expr.properties.map((p) =>
        p.type === 'SpreadElement' ? `...${formatExpression(p.argument)}` : `${p.key}: ${formatExpression(p.value)}`,
      );
      return `{ ${props.join(', ')} }`;
    }
    case 'StyleBlockLiteral': {
      const props = expr.properties.map((p) => `${p.name}: ${p.value}`).join('; ');
      return '${ ' + props + '; }';
    }
    case 'LayerConstructorExpression': {
      const name = formatExpression(expr.name);
      const style = expr.styleExpr ? ` ${formatExpression(expr.styleExpr)}` : '';
      return `${expr.layerType}(${name})${style}`;
    }
    case 'PathBlockExpression': {
      const body = formatStatements(expr.body as Statement[], 1, '  ');
      return `@{\n${body}\n}`;
    }
    case 'TextBlockExpression': {
      const body = formatStatements(expr.body as Statement[], 1, '  ');
      return `&{\n${body}\n}`;
    }
    default:
      return '';
  }
}

function formatFunctionCall(expr: { name: string; args: Expression[] }): string {
  const args = expr.args.map(formatExpression).join(', ');
  return `${expr.name}(${args})`;
}
