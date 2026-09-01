import {
  BLOCK_START_SNIPPETS,
  DECLARATION_SNIPPETS,
  INTERPOLATION_SNIPPET,
  KEYWORD_COMPLETIONS,
  STYLE_BLOCK_SNIPPET,
  STYLE_PROPERTY_COMPLETIONS,
  STYLE_PROPERTY_VALUES,
} from './completion-data-static';
import { CONSTRUCTOR_RETURN_TYPES, ENUM_COMPLETIONS, STDLIB_COMPLETIONS, TYPE_MEMBERS } from './completion-data.generated';
import { inferObjectProperties, regexNameResolver, resolveMemberAccess } from './member-resolution';
import { analyzeScopes } from './scope-analysis';
import { inferRhsType } from './type-inference';
import { findDeclaration, inferDeclType } from './type-inference-ast';
import { FILTER_CONSTRUCTORS } from '../evaluator/constructor-registry';

import type { CompletionEntry } from './completion-data-static';
import type { TextDocument } from './document';
import type { ScopeInfo } from './scope-analysis';
import type { Position } from './types';

export interface CompletionItem {
  label: string;
  kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
  detail: string;
  sortText: string;
  insertText?: string;
  isSnippet?: boolean;
}

/**
 * Get completion items at a position in a document.
 */
export function getCompletions(document: TextDocument, position: Position): CompletionItem[] {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const textBefore = source.slice(0, offset);

  // Scope analysis is lazily computed once and shared between the member-access
  // resolver and the user-declaration collection below.
  let cachedScopeInfo: ScopeInfo | null = null;
  const getScopeInfo = () => {
    cachedScopeInfo ??= analyzeScopes(document);
    return cachedScopeInfo;
  };

  // AST-first name typing (regex-audit Phase 5b): resolve the declaration
  // through the scope tree and type it from its AST context; fall back to the
  // legacy regex chain when the tree yields nothing.
  const resolveName = (name: string): string | null => {
    const decl = findDeclaration(getScopeInfo(), name, position);
    return (decl ? inferDeclType(decl) : null) ?? regexNameResolver(name, source);
  };

  // Inside a backtick template literal: offer the ${expr} interpolation
  // snippet plus normal scope-aware expression completions. Must run BEFORE
  // the style-block branch — otherwise an unmatched `${` inside a backtick
  // string is misclassified as a style block and we'd surface CSS property
  // completions where they don't belong.
  if (isInsideBacktickString(textBefore)) {
    const items: CompletionItem[] = [toCompletionItem(INTERPOLATION_SNIPPET)];
    items.push(...STDLIB_COMPLETIONS.map(toCompletionItem));
    items.push(...ENUM_COMPLETIONS.map(toCompletionItem));
    items.push(...collectScopeDeclarations(document, position));
    const prefixMatch = /[a-zA-Z_$]\w*$|\$\{?$/.exec(textBefore);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    return filterByPrefix(items, prefix);
  }

  // Inside an object-destructuring pattern: `let { | } = rhs;` — offer the
  // RHS type's data properties as pattern keys. The `{` must directly follow
  // `let`, so object literals (`let x = {`), apply/fn/for blocks, and `${ }`
  // style blocks are all structurally excluded. The character class cannot
  // cross `}` `=` `;` `(` `)`, keeping the match inside one pattern; the RHS
  // sits AFTER the cursor, so it is read with a forward scan of the source.
  // The (^|[^\w$]) prefix keeps identifiers that merely END in "let"
  // (outlet, violet, …) from triggering the pattern context.
  const patternMatch = /(^|[^\w$])let\s*\{([^}=;()]{0,300})$/.exec(textBefore);
  if (patternMatch) {
    const ahead = /^([^}=;()]{0,300})\}\s*=\s*([^;\n]{1,200})/.exec(source.slice(offset));
    if (!ahead) return [];
    const rhs = ahead[2];
    const rhsType = inferRhsType(rhs, source);

    let candidates: CompletionEntry[] = [];
    if (rhsType && TYPE_MEMBERS[rhsType]) {
      // Data properties only — methods are not destructurable (mirrors the
      // runtime struct-properties registry, which exposes data props only).
      candidates = TYPE_MEMBERS[rhsType].properties;
    } else {
      const rhsIdent = /^\s*([a-zA-Z_]\w*)\s*$/.exec(rhs);
      const literalProps = rhsIdent ? inferObjectProperties(rhsIdent[1], source) : null;
      if (literalProps) candidates = literalProps.properties;
    }
    if (candidates.length === 0) return [];

    // Exclude keys already used in the pattern (the KEY side of `key: alias`
    // entries), minus the partial word at the cursor.
    const prefixMatch = /[a-zA-Z_]\w*$/.exec(textBefore);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const patternText = patternMatch[2].slice(0, patternMatch[2].length - prefix.length) + ahead[1];
    const usedKeys = new Set(
      patternText
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e !== '' && !e.startsWith('...'))
        .map((e) => e.split(':')[0].trim()),
    );
    const available = candidates.filter((c) => !usedKeys.has(c.label));
    return filterByPrefix(available.map(toCompletionItem), prefix);
  }

  // Leading `@` or `&` — surface block-start snippets. Two valid contexts:
  //   • Statement start  → @font directive, @{ } PathBlock, &{ } TextBlock
  //   • Expression value → @{ } PathBlock, &{ } TextBlock (e.g. `let x = @{`)
  // `@font` is a top-level directive and is filtered out of expression
  // contexts where it would not parse.
  const blockStartMatch = /[@&]\w*$/.exec(textBefore);
  if (blockStartMatch) {
    const before = textBefore.slice(0, textBefore.length - blockStartMatch[0].length);
    const stmtStart = isAtStatementStart(before);
    const exprPos = isInExpressionPosition(before);
    if (stmtStart || exprPos) {
      const snippets = stmtStart ? BLOCK_START_SNIPPETS : BLOCK_START_SNIPPETS.filter((s) => s.label !== '@font');
      return filterByPrefix(snippets.map(toCompletionItem), blockStartMatch[0]);
    }
  }

  // Trailing `$` outside of style/backtick contexts. Two routings:
  //   • At statement start  → declaration snippets (let, PathLayer, TextLayer)
  //   • In expression value → style-block snippet (`${ … }`)
  // The expression case covers `let foo = $` where the user is reaching for
  // an inline style block — we surface the balanced-brace snippet so they
  // don't have to remember the exact `${ }` syntax.
  if (textBefore.endsWith('$')) {
    const before = textBefore.slice(0, -1);
    if (isAtStatementStart(before)) {
      return DECLARATION_SNIPPETS.map(toCompletionItem);
    }
    if (isInExpressionPosition(before)) {
      return [toCompletionItem(STYLE_BLOCK_SNIPPET)];
    }
  }

  // Check if we're inside a style block ${ ... }. Style blocks have two
  // completion contexts:
  //   1. Property-name position (before `:`)  → offer CSS property names
  //   2. Value position (after `:`, before `;` or `}`)  → offer user-defined
  //      variables (color, number, string), stdlib functions, and common
  //      CSS value keywords
  // For the value position, we fall through to the general completion
  // logic below so the user gets scope-aware variable completions
  // (e.g. `Color` variables in scope), then append style value keywords.
  if (isInsideStyleBlock(textBefore)) {
    if (isStylePropertyNameContext(textBefore)) {
      // Property names are hyphenated (`stroke-width`) — match the typed
      // prefix with a hyphen-aware pattern so filtering narrows correctly.
      const propPrefix = /[-\w]*$/.exec(textBefore)?.[0] ?? '';
      // Entries carry a `name: $0;` template so accepting lands the cursor in
      // value position. When a `:` already follows the cursor (retyping a
      // property name over an existing declaration), insert just the name —
      // otherwise the colon and semicolon would double up.
      const colonAhead = /^[ \t]*:/.test(source.slice(offset));
      const items = STYLE_PROPERTY_COMPLETIONS.map((entry) =>
        colonAhead
          ? toCompletionItem({ ...entry, insertText: undefined, isSnippet: undefined })
          : toCompletionItem(entry),
      );
      return filterByPrefix(items, propPrefix);
    }
    // Value context: fall through to collect user variables + stdlib +
    // keywords via the normal path, then append style-value keywords below.
  }

  // Member access (dot completions, call chains, deep property access) —
  // shared with hover via member-resolution.ts.
  const memberAccess = resolveMemberAccess(textBefore, source, resolveName);
  if (memberAccess) {
    return filterByPrefix(
      [...memberAccess.members.properties, ...memberAccess.members.methods].map(toCompletionItem),
      memberAccess.memberPrefix,
    );
  }

  // Get the word prefix at cursor
  const prefixMatch = /[a-zA-Z_]\w*$/.exec(textBefore);
  let prefix = prefixMatch ? prefixMatch[0] : '';

  // Collect all completions
  const items: CompletionItem[] = [];
  const insideStyleValue = isInsideStyleBlock(textBefore) && !isStylePropertyNameContext(textBefore);
  let styleValueProp: string | null = null;

  if (insideStyleValue) {
    // Inside a style value position — rank the current property's enumerated
    // values first, then user variables, generic CSS value keywords, and
    // stdlib. Top-level keywords (let/for/fn/etc.) are never valid here.
    const propMatch = /([-\w]+)\s*:\s*[^;{}]*$/.exec(textBefore);
    styleValueProp = propMatch ? propMatch[1] : null;
    const propertyValues = propMatch ? STYLE_PROPERTY_VALUES[propMatch[1]] : undefined;
    if (propertyValues) {
      items.push(...propertyValues.map(toCompletionItem));
      const covered = new Set(propertyValues.map((v) => v.label));
      items.push(...STYLE_VALUE_KEYWORDS.filter((k) => !covered.has(k.label)).map(toCompletionItem));
    } else {
      items.push(...STYLE_VALUE_KEYWORDS.map(toCompletionItem));
    }
    // Constructor snippets with binding blocks (`NoiseFilter() {|f| ...}`) are
    // declaration-shaped and invalid in value position — offer those entries
    // as plain names instead so `filter: N` can still complete the reference.
    // hasBindingBlock comes from the generated constructor table (single
    // source of truth) rather than sniffing the snippet text.
    items.push(
      ...STDLIB_COMPLETIONS.map((entry) =>
        CONSTRUCTOR_RETURN_TYPES[entry.label]?.hasBindingBlock
          ? toCompletionItem({ ...entry, insertText: undefined, isSnippet: undefined })
          : toCompletionItem(entry),
      ),
    );
    items.push(...ENUM_COMPLETIONS.map(toCompletionItem));
    // Value keywords are hyphenated (`line-through`, `text-top`) — filter by
    // the full keyword run so the popup narrows correctly across the hyphen.
    const valueRun = getStyleValueKeywordRun(source, offset);
    if (valueRun) prefix = valueRun;
  } else {
    // Normal completion context — keywords, stdlib, enums.
    items.push(...KEYWORD_COMPLETIONS.map(toCompletionItem));
    items.push(...STDLIB_COMPLETIONS.map(toCompletionItem));
    items.push(...ENUM_COMPLETIONS.map(toCompletionItem));
  }

  // Scope-aware user definitions. When inside a style value position we
  // boost user variables so they rank above stdlib items — the user is
  // almost always trying to reference a defined color/number variable.
  const scopeInfo = getScopeInfo();
  const seen = new Set<string>();
  const userDeclBoost = insideStyleValue ? 90 : 20;

  // Declarations whose inferred type matches the current style property's
  // reference type (e.g. a NoiseFilter variable after `filter:`) rank above
  // everything else — referencing a defs-producing variable is the idiom.
  const expectedRefTypes = insideStyleValue && styleValueProp ? STYLE_VALUE_REF_TYPES[styleValueProp] : undefined;

  for (const decl of scopeInfo.declarations) {
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);

    // Check if declaration is visible at the cursor position
    // (simple heuristic: declaration line is before cursor line)
    if (decl.range.start.line <= position.line) {
      const declType = expectedRefTypes ? inferDeclType(decl) : null;
      const isRefTyped = declType !== null && expectedRefTypes!.has(declType);
      items.push({
        label: decl.name,
        kind: decl.kind === 'function' ? 'function' : 'variable',
        detail: isRefTyped
          ? `${declType} — renders as url(#id)`
          : decl.kind === 'function' ? `fn ${decl.name}(...)` : `${decl.kind}: ${decl.name}`,
        sortText: sortKey(isRefTyped ? 95 : userDeclBoost, decl.name),
      });
    }
  }

  return filterByPrefix(items, prefix);
}

/**
 * Style properties that reference defs-producing values by variable, mapped
 * to the inferred type names that qualify (constructor return types from
 * CONSTRUCTOR_RETURN_TYPES — names match the constructors).
 */
const STYLE_VALUE_REF_TYPES: Record<string, Set<string>> = {
  filter: new Set(FILTER_CONSTRUCTORS),
  mask: new Set(['Mask']),
  'clip-path': new Set(['ClipPath']),
};

/**
 * CSS value keywords valid inside a style block value position. Includes
 * the universal keywords (`none`, `transparent`, etc.) that apply to most
 * properties as well as `currentColor` for color-valued properties.
 */
const STYLE_VALUE_KEYWORDS: CompletionEntry[] = [
  { label: 'none', kind: 'constant', detail: 'CSS keyword — no value', boost: 10 },
  { label: 'transparent', kind: 'constant', detail: 'CSS keyword — fully transparent color', boost: 10 },
  { label: 'currentColor', kind: 'constant', detail: 'CSS keyword — inherit color property', boost: 10 },
  { label: 'inherit', kind: 'constant', detail: 'CSS keyword — inherit from parent', boost: 10 },
  { label: 'initial', kind: 'constant', detail: 'CSS keyword — initial value', boost: 9 },
  { label: 'unset', kind: 'constant', detail: 'CSS keyword — unset value', boost: 9 },
];

// --- Helpers ---

/**
 * Blank out balanced bare `${...}` interpolation spans that occur AFTER the
 * last style-block opener, so the backward context scanners below don't
 * mistake an interp's braces for block/entry boundaries. An UNCLOSED
 * trailing `${` is left in place — callers treat that as expression
 * context and suppress style completions.
 */
function blankBalancedInterps(textBefore: string): string {
  const opener = textBefore.lastIndexOf('${');
  if (opener < 0) return textBefore;
  let out = '';
  let i = 0;
  while (i < textBefore.length) {
    if (textBefore[i] === '$' && textBefore[i + 1] === '{' && i !== opener) {
      // Potential interp start (never the style-block opener itself when it
      // is the LAST `${` — that one is handled by the scanners). Find a
      // balanced close on one nesting level.
      let j = i + 2;
      let depth = 1;
      while (j < textBefore.length && depth > 0) {
        if (textBefore[j] === '{') depth++;
        else if (textBefore[j] === '}') depth--;
        j++;
      }
      if (depth === 0) {
        out += ' '.repeat(j - i);
        i = j;
        continue;
      }
    }
    out += textBefore[i];
    i++;
  }
  return out;
}

/** True when the text ends inside an UNCLOSED bare `${...}` interpolation
 *  in style-value position (an interp opener after the block opener, after
 *  a `:`, with no closing `}` yet). */
function isInsideOpenInterp(textBefore: string): boolean {
  const blanked = blankBalancedInterps(textBefore);
  const lastOpen = blanked.lastIndexOf('${');
  if (lastOpen < 0) return false;
  // The style-block opener itself doesn't count — an interp opener must
  // have a `:` between the block opener and it, with no `;`/`}` after.
  const between = blanked.slice(lastOpen + 2);
  if (between.includes('}')) return false;
  const before = blanked.slice(0, lastOpen);
  const blockOpen = before.lastIndexOf('${');
  if (blockOpen < 0) return false;
  const decl = before.slice(blockOpen + 2);
  const lastColon = Math.max(decl.lastIndexOf(':'));
  if (lastColon < 0) return false;
  const afterColon = decl.slice(lastColon + 1);
  return !afterColon.includes(';');
}

function isInsideStyleBlock(textBefore: string): boolean {
  // Find the last ${ and check if there's a matching } after it
  let depth = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    if (textBefore[i] === '}') depth++;
    if (textBefore[i] === '{' && i > 0 && textBefore[i - 1] === '$') {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

/**
 * Given that we're inside a style block, determine whether the cursor is
 * in a property-name position (before `:`) vs a value position (after `:`,
 * before `;` or the closing `}`). Walks backward from the cursor to the
 * nearest statement boundary (`;`, `${`, or end of current style entry).
 * If a `:` is encountered first, we're in a value position; otherwise a
 * property-name position.
 */
function isStylePropertyNameContext(textBefore: string): boolean {
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const ch = textBefore[i];
    // Entry terminators and style-block opener both reset to property context.
    if (ch === ';' || ch === '}') return true;
    if (ch === '{' && i > 0 && textBefore[i - 1] === '$') return true;
    // A colon before any terminator means we're in the value position.
    if (ch === ':') return false;
  }
  return true;
}

/**
 * True when the cursor sits in style-block property-name position
 * (`${ stroke-w… }` before the `:`). Editor integrations use this to widen
 * their word/replacement range to include hyphens — CSS property names are
 * hyphenated, but general identifier patterns treat `-` as a boundary, which
 * makes accepting `stroke-width` after typing `stroke-w` double the prefix.
 */
export function isStylePropertyNamePosition(source: string, offset: number): boolean {
  const raw = source.slice(0, offset);
  if (isInsideOpenInterp(raw)) return false; // inside `${...` — expression context
  const textBefore = blankBalancedInterps(raw);
  return (
    !isInsideBacktickString(textBefore) && isInsideStyleBlock(textBefore) && isStylePropertyNameContext(textBefore)
  );
}

/**
 * When the cursor sits in style-block VALUE position typing an enumerated
 * keyword (`text-decoration: line-t…`), returns the letters-and-hyphens run
 * between the `:` and the cursor ('' right after the colon). Returns null
 * outside that context — including when the value is expression-like
 * (`4 2`, `#ff0`, `w - 2`), so editors keep normal word handling there.
 * Editor integrations use this to widen their word/replacement range across
 * hyphens, mirroring isStylePropertyNamePosition for property names.
 */
export function getStyleValueKeywordRun(source: string, offset: number): string | null {
  const raw = source.slice(0, offset);
  if (isInsideBacktickString(raw)) return null;
  if (isInsideOpenInterp(raw)) return null; // inside `${...` — expression context
  const textBefore = blankBalancedInterps(raw);
  if (!isInsideStyleBlock(textBefore) || isStylePropertyNameContext(textBefore)) return null;
  const m = /:\s*([-a-zA-Z]*)$/.exec(textBefore);
  return m ? m[1] : null;
}

function toCompletionItem(entry: CompletionEntry): CompletionItem {
  return {
    label: entry.label,
    kind: entry.kind,
    detail: entry.detail,
    sortText: sortKey(entry.boost, entry.label),
    insertText: entry.insertText,
    isSnippet: entry.isSnippet,
  };
}

function sortKey(boost: number, label: string): string {
  // Lower sortText = higher priority. Pad boost inverted to 2 digits.
  return String(99 - boost).padStart(2, '0') + label;
}

function filterByPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(lower));
}

/**
 * Walk forward through `textBefore` toggling on unescaped backticks while
 * respecting `'…'` and `"…"` quote states. Returns true if the cursor is
 * currently inside a backtick template literal (no closing backtick seen
 * before the end of textBefore).
 */
function isInsideBacktickString(textBefore: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < textBefore.length; i++) {
    const ch = textBefore[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === '`') inBacktick = true;
    else if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
  }
  return inBacktick;
}

/**
 * Returns true if `textBefore` ends in a position where a new statement may
 * begin: at the start of the file, or after `;`, `{`, or `}` (with optional
 * whitespace and newlines in between).
 */
function isAtStatementStart(textBefore: string): boolean {
  let i = textBefore.length - 1;
  while (i >= 0 && /\s/.test(textBefore[i])) i--;
  if (i < 0) return true;
  const ch = textBefore[i];
  return ch === ';' || ch === '{' || ch === '}';
}

/**
 * Returns true if `textBefore` ends in a position where a new expression
 * value may begin: after `=`, `(`, `,`, `[`, `+`, `-`, `*`, `/`, or `:`
 * (with optional whitespace). Used to surface the `${ … }` style-block
 * snippet on `$` keystroke in expression context.
 */
function isInExpressionPosition(textBefore: string): boolean {
  let i = textBefore.length - 1;
  while (i >= 0 && /\s/.test(textBefore[i])) i--;
  if (i < 0) return false;
  const ch = textBefore[i];
  return (
    ch === '=' ||
    ch === '(' ||
    ch === ',' ||
    ch === '[' ||
    ch === '+' ||
    ch === '-' ||
    ch === '*' ||
    ch === '/' ||
    ch === ':'
  );
}

/**
 * Collect scope-aware user declarations (let bindings, fn definitions) as
 * CompletionItems. Used by branches that need scope-aware completions
 * without falling through to the main path.
 */
function collectScopeDeclarations(document: TextDocument, position: Position): CompletionItem[] {
  const scopeInfo = analyzeScopes(document);
  const seen = new Set<string>();
  const items: CompletionItem[] = [];
  for (const decl of scopeInfo.declarations) {
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);
    if (decl.range.start.line <= position.line) {
      items.push({
        label: decl.name,
        kind: decl.kind === 'function' ? 'function' : 'variable',
        detail: decl.kind === 'function' ? `fn ${decl.name}(...)` : `${decl.kind}: ${decl.name}`,
        sortText: sortKey(20, decl.name),
      });
    }
  }
  return items;
}
