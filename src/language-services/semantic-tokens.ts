import { stdlib } from '../stdlib';
import { analyzeScopes } from './scope-analysis';
import {
  ENUM_MEMBER_MAP,
  STDLIB_COMPLETIONS,
  TYPE_MEMBERS,
} from './completion-data.generated';

import type { TextDocument } from './document';

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

// Derive constructor/type names from generated completion data (not hardcoded)
// TYPE_MEMBERS keys that start with uppercase are constructable types
const CONSTRUCTOR_TYPES = new Set(
  Object.keys(TYPE_MEMBERS).filter((k) => /^[A-Z]/.test(k)),
);
// Add gradient/mask/pattern constructors that appear in STDLIB_COMPLETIONS
// but don't have TYPE_MEMBERS entries (they construct resources, not value types)
for (const entry of STDLIB_COMPLETIONS) {
  if (/^[A-Z]/.test(entry.label)) CONSTRUCTOR_TYPES.add(entry.label);
}

// Derive enum names from generated enum member map
const ENUM_NAMES = new Set(Object.keys(ENUM_MEMBER_MAP));

const NAMESPACES = new Set(['ctx', 'Object', 'Color', 'PathBlock']);
const PATH_COMMANDS = new Set('M m L l H h V v C c S s Q q T t A a Z z'.split(' '));
/**
 * Get semantic tokens for enhanced syntax highlighting.
 * Returns tokens sorted by position (line, then character).
 */
export function getSemanticTokens(document: TextDocument): SemanticToken[] {
  const source = document.getText();
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
      // Classify builtins by category
      if (CONSTRUCTOR_TYPES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('type'), 0, tokens);
      } else if (ENUM_NAMES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('type'), modBit('readonly'), tokens);
      } else if (NAMESPACES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('namespace'), 0, tokens);
      } else if (STDLIB_NAMES.has(ref.name)) {
        addTokenForName(source, ref.name, ref.range.start.line, typeIndex('function'), 0, tokens);
      }
    }
  }

  // Classify SVG path commands (M, L, C, Z, etc.) — scan source directly
  // since these are not tracked by scope analysis
  classifyPathCommands(source, tokens);

  // Classify enum member access (e.g., Direction.CW, Easing.Linear)
  classifyEnumMembers(source, tokens);

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

/**
 * Classify SVG path commands (M, L, C, Z, etc.) as keyword tokens.
 * Path commands are single letters at statement position, followed by
 * space/number/identifier or end of line.
 */
function classifyPathCommands(source: string, tokens: SemanticToken[]): void {
  const lines = source.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const lineText = lines[line];
    // Match path commands at start of line (after optional whitespace)
    const match = lineText.match(/^(\s*)([MLHVCSQTAZmlhvcsqtaz])(?=\s|$|[0-9.(\-+])/);
    if (match) {
      const char = match[1].length;
      const cmd = match[2];
      if (PATH_COMMANDS.has(cmd)) {
        tokens.push({
          line,
          character: char,
          length: 1,
          type: typeIndex('keyword'),
          modifiers: 0,
        });
      }
    }
  }
}

/**
 * Classify enum member access patterns (e.g., Direction.CW, Easing.Linear).
 * The enum name is already classified as 'type'; this adds the member as 'enumMember'.
 */
function classifyEnumMembers(source: string, tokens: SemanticToken[]): void {
  const lines = source.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const lineText = lines[line];
    // Match EnumName.MemberName patterns
    const re = /\b([A-Z]\w+)\.([A-Z]\w+)\b/g;
    let m;
    while ((m = re.exec(lineText)) !== null) {
      if (ENUM_NAMES.has(m[1]) || CONSTRUCTOR_TYPES.has(m[1])) {
        // The dot-accessed member
        tokens.push({
          line,
          character: m.index + m[1].length + 1, // after "EnumName."
          length: m[2].length,
          type: typeIndex('enumMember'),
          modifiers: modBit('readonly'),
        });
      }
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
