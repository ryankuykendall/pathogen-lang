import { parse } from '../parser';

import type { TextDocument } from './document';
import type { Position, Range } from './types';
import type {
  Program,
  Statement,
  SourceLocation,
  LetDeclaration,
  FunctionDefinition,
  EnumDefinition,
  LayerDefinition,
  ForLoop,
  ForEachLoop,
} from '../parser/ast';

/**
 * Symbol kinds matching LSP SymbolKind values.
 * Using numeric values for direct LSP compatibility.
 */
export enum SymbolKind {
  Function = 12,
  Variable = 13,
  Enum = 10,
  EnumMember = 22,
  Struct = 23,    // Used for layers
  Key = 20,       // Used for loop variables
}

export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

/**
 * Extract document symbols for outline/breadcrumb support.
 * Walks the AST and returns symbols for: let declarations, function definitions,
 * enum definitions, layer definitions, and for/forEach loops (with loop variable children).
 */
export function getDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const source = document.getText();

  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    // If the source doesn't parse, return no symbols
    return [];
  }

  return extractSymbols(ast.body, document);
}

function extractSymbols(statements: Statement[], document: TextDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const stmt of statements) {
    switch (stmt.type) {
      case 'LetDeclaration':
        symbols.push(letSymbol(stmt, document));
        break;
      case 'FunctionDefinition':
        symbols.push(functionSymbol(stmt, document));
        break;
      case 'EnumDefinition':
        symbols.push(enumSymbol(stmt, document));
        break;
      case 'LayerDefinition':
        symbols.push(layerSymbol(stmt, document));
        break;
      case 'ForLoop':
        symbols.push(forLoopSymbol(stmt, document));
        break;
      case 'ForEachLoop':
        symbols.push(forEachLoopSymbol(stmt, document));
        break;
    }
  }

  return symbols;
}

function letSymbol(node: LetDeclaration, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  return {
    name: node.pattern ? formatPattern(node) : node.name,
    kind: SymbolKind.Variable,
    range,
    selectionRange: range,
  };
}

function functionSymbol(node: FunctionDefinition, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  const params = node.params.join(', ');
  return {
    name: `${node.name}(${params})`,
    kind: SymbolKind.Function,
    range,
    selectionRange: range,
    children: extractSymbols(node.body, document),
  };
}

function enumSymbol(node: EnumDefinition, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  return {
    name: node.name,
    kind: SymbolKind.Enum,
    range,
    selectionRange: range,
    children: node.members.map((m) => ({
      name: m.name,
      kind: SymbolKind.EnumMember,
      range,
      selectionRange: range,
    })),
  };
}

function layerSymbol(node: LayerDefinition, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  // Extract the layer name from the name expression
  const name = node.name.type === 'StringLiteral' ? node.name.value : node.layerType;
  return {
    name: `${node.layerType}('${name}')`,
    kind: SymbolKind.Struct,
    range,
    selectionRange: range,
  };
}

function forLoopSymbol(node: ForLoop, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  return {
    name: `for (${node.variable} in ...)`,
    kind: SymbolKind.Key,
    range,
    selectionRange: range,
    children: extractSymbols(node.body, document),
  };
}

function forEachLoopSymbol(node: ForEachLoop, document: TextDocument): DocumentSymbol {
  const range = locToRange(node.loc, document);
  const varName = node.indexVariable
    ? `[${node.variable}, ${node.indexVariable}]`
    : node.variable;
  return {
    name: `for (${varName} in ...)`,
    kind: SymbolKind.Key,
    range,
    selectionRange: range,
    children: extractSymbols(node.body, document),
  };
}

function formatPattern(node: LetDeclaration): string {
  if (node.pattern?.type === 'ArrayDestructuringPattern') {
    const elements = node.pattern.elements.join(', ');
    const rest = node.pattern.rest ? `, ...${node.pattern.rest}` : '';
    return `[${elements}${rest}]`;
  }
  if (node.pattern?.type === 'ObjectDestructuringPattern') {
    const props = node.pattern.properties.map((p) =>
      p.alias ? `${p.key}: ${p.alias}` : p.key,
    ).join(', ');
    const rest = node.pattern.rest ? `, ...${node.pattern.rest}` : '';
    return `{ ${props}${rest} }`;
  }
  return node.name;
}

/**
 * Convert a 1-based SourceLocation to a 0-based Range.
 * Falls back to document start if loc is undefined.
 */
function locToRange(loc: SourceLocation | undefined, document: TextDocument): Range {
  if (!loc) {
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }
  const start: Position = {
    line: loc.line - 1,
    character: loc.column - 1,
  };
  // Use the same position for both start and end (single point).
  // A more precise range would require end-of-node tracking in the parser.
  return { start, end: start };
}
