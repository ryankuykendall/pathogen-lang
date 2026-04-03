import { parse } from '../parser';
import { stdlib } from '../stdlib';
import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type {
  Program,
  Statement,
  Expression,
  PathCommand,
  PathArg,
  SourceLocation,
} from '../parser/ast';

// --- Token types (indices must match the legend sent during LSP initialization) ---

export const TOKEN_TYPES = [
  'variable',      // 0
  'parameter',     // 1
  'function',      // 2
  'keyword',       // 3
  'number',        // 4
  'string',        // 5
  'operator',      // 6
  'comment',       // 7
  'property',      // 8
  'enumMember',    // 9
  'type',          // 10 — for PathLayer, TextLayer, GroupLayer
  'namespace',     // 11 — for ctx, Object, Color
] as const;

export const TOKEN_MODIFIERS = [
  'declaration',   // 0
  'definition',    // 1
  'readonly',      // 2
] as const;

export type TokenType = typeof TOKEN_TYPES[number];
export type TokenModifier = typeof TOKEN_MODIFIERS[number];

export interface SemanticToken {
  line: number;       // 0-based
  character: number;  // 0-based
  length: number;
  type: number;       // index into TOKEN_TYPES
  modifiers: number;  // bitmask of TOKEN_MODIFIERS
}

const STDLIB_NAMES = new Set(Object.keys(stdlib));
const LAYER_TYPES = new Set(['PathLayer', 'TextLayer', 'GroupLayer']);
const NAMESPACES = new Set(['ctx', 'Object', 'Color', 'PathBlock']);
const KEYWORDS = new Set([
  'let', 'for', 'in', 'if', 'else', 'fn', 'return', 'define', 'default',
  'layer', 'apply', 'text', 'tspan', 'null', 'true', 'false', 'enum', 'calc', 'log',
]);

/**
 * Get semantic tokens for enhanced syntax highlighting.
 * Returns tokens sorted by position (line, then character).
 */
export function getSemanticTokens(document: TextDocument): SemanticToken[] {
  const source = document.getText();

  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    return [];
  }

  const tokens: SemanticToken[] = [];
  const scopeInfo = analyzeScopes(document);

  // Classify declarations
  for (const decl of scopeInfo.declarations) {
    if (decl.range.start.line === 0 && decl.range.start.character === 0 && !decl.scope.parent) {
      // Skip declarations without real locations
    }
    const mod = modBit('declaration');
    switch (decl.kind) {
      case 'function':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('function'), mod, tokens);
        break;
      case 'parameter':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('parameter'), mod, tokens);
        break;
      case 'variable':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('variable'), mod, tokens);
        break;
      case 'loopVar':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('variable'), mod | modBit('readonly'), tokens);
        break;
      case 'enum':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('type'), mod, tokens);
        break;
      case 'blockParam':
        addTokenForName(source, decl.name, decl.range.start.line, typeIndex('parameter'), mod, tokens);
        break;
    }
  }

  // Classify references
  for (const ref of scopeInfo.references) {
    if (ref.declaration) {
      // User-defined reference — classify by declaration kind
      switch (ref.declaration.kind) {
        case 'function':
          addTokenForName(source, ref.name, ref.range.start.line, typeIndex('function'), 0, tokens);
          break;
        case 'parameter':
        case 'blockParam':
          addTokenForName(source, ref.name, ref.range.start.line, typeIndex('parameter'), 0, tokens);
          break;
        case 'loopVar':
          addTokenForName(source, ref.name, ref.range.start.line, typeIndex('variable'), modBit('readonly'), tokens);
          break;
        case 'enum':
          addTokenForName(source, ref.name, ref.range.start.line, typeIndex('type'), 0, tokens);
          break;
        default:
          addTokenForName(source, ref.name, ref.range.start.line, typeIndex('variable'), 0, tokens);
          break;
      }
    } else if (ref.isBuiltin) {
      // Classify builtins
      if (LAYER_TYPES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('type'), 0, tokens);
      } else if (NAMESPACES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('namespace'), 0, tokens);
      } else if (STDLIB_NAMES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('function'), 0, tokens);
      }
    }
  }

  // Sort by position
  tokens.sort((a, b) => a.line !== b.line ? a.line - b.line : a.character - b.character);

  // Deduplicate (same position)
  const deduped: SemanticToken[] = [];
  for (const t of tokens) {
    const last = deduped[deduped.length - 1];
    if (last && last.line === t.line && last.character === t.character) continue;
    deduped.push(t);
  }

  return deduped;
}

/**
 * Encode semantic tokens as the delta-encoded flat array expected by LSP.
 */
export function encodeSemanticTokens(tokens: SemanticToken[]): number[] {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;

  for (const t of tokens) {
    const deltaLine = t.line - prevLine;
    const deltaChar = deltaLine === 0 ? t.character - prevChar : t.character;
    data.push(deltaLine, deltaChar, t.length, t.type, t.modifiers);
    prevLine = t.line;
    prevChar = t.character;
  }

  return data;
}

// --- Helpers ---

function typeIndex(type: TokenType): number {
  return TOKEN_TYPES.indexOf(type);
}

function modBit(mod: TokenModifier): number {
  return 1 << TOKEN_MODIFIERS.indexOf(mod);
}

/**
 * Find a name on a given line and add a token for it.
 * Uses word-boundary matching to find the correct occurrence.
 */
function addTokenForName(
  source: string,
  name: string,
  line: number,
  type: number,
  modifiers: number,
  tokens: SemanticToken[],
): void {
  const lines = source.split('\n');
  if (line < 0 || line >= lines.length) return;

  const lineText = lines[line];
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
  let match;
  while ((match = re.exec(lineText)) !== null) {
    tokens.push({
      line,
      character: match.index,
      length: name.length,
      type,
      modifiers,
    });
    break; // Take the first match on the line
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
