import {
  BLOCK_START_SNIPPETS,
  DECLARATION_SNIPPETS,
  INTERPOLATION_SNIPPET,
  KEYWORD_COMPLETIONS,
  STYLE_BLOCK_SNIPPET,
  STYLE_PROPERTY_COMPLETIONS,
  STYLE_PROPERTY_VALUES,
} from './completion-data-static';
import {
  ENUM_COMPLETIONS,
  ENUM_MEMBER_MAP,
  NAMESPACE_MEMBERS,
  STDLIB_COMPLETIONS,
  TYPE_MEMBERS,
  TYPE_METHOD_RETURNS,
} from './completion-data.generated';
import { analyzeScopes } from './scope-analysis';
import {
  escapeRegex,
  getMethodReturnType,
  inferBlockParamType,
  inferLoopVarType,
  inferRhsType,
  inferType,
} from './type-inference';

import type { CompletionEntry, MemberCompletionSet } from './completion-data-static';
import type { TextDocument } from './document';
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
        colonAhead ? toCompletionItem({ ...entry, insertText: undefined, isSnippet: undefined }) : toCompletionItem(entry),
      );
      return filterByPrefix(items, propPrefix);
    }
    // Value context: fall through to collect user variables + stdlib +
    // keywords via the normal path, then append style-value keywords below.
  }

  // Check for method call on expression: expr.method(...).
  // e.g., shape.boundingBox(). or Color('#f00').lighten(0.2).
  // When the receiver is a plain variable, prefer its per-type return map
  // (grid.getPoint() → Point vs mesh.getPoint() → MeshPoint).
  const chainMatch = /(\w+)?\.(\w+)\(\s*[^)]*\)\s*\.(\w*)$/.exec(textBefore);
  if (chainMatch) {
    const receiverName = chainMatch[1];
    const methodName = chainMatch[2];
    const memberPrefix = chainMatch[3];
    const receiverType = receiverName
      ? (inferType(receiverName, source) ?? inferBlockParamType(receiverName, source))
      : null;
    const perType = receiverType ? TYPE_METHOD_RETURNS[receiverType]?.[methodName] : undefined;
    const returnType = perType ?? getMethodReturnType(methodName);
    if (returnType && returnType in TYPE_MEMBERS) {
      return filterByPrefix(
        [...TYPE_MEMBERS[returnType].properties, ...TYPE_MEMBERS[returnType].methods].map(toCompletionItem),
        memberPrefix,
      );
    }
  }

  // Check for member access (dot completions)
  const dotMatch = /(\w+)\.(\w*)$/.exec(textBefore);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const memberPrefix = dotMatch[2];
    const members = getMembersForObject(objectName, source);
    if (members) {
      return filterByPrefix([...members.properties, ...members.methods].map(toCompletionItem), memberPrefix);
    }
  }

  // Check for deep property access (e.g., ctx.position.x, layer.ctx.position)
  const deepMatch = /(\w+)\.(\w+)\.(\w*)$/.exec(textBefore);
  if (deepMatch) {
    const [, obj, prop1, prefix] = deepMatch;
    const deepMembers = getDeepMembers(obj, prop1, source);
    if (deepMembers) {
      return filterByPrefix([...deepMembers.properties, ...deepMembers.methods].map(toCompletionItem), prefix);
    }
  }

  // Get the word prefix at cursor
  const prefixMatch = /[a-zA-Z_]\w*$/.exec(textBefore);
  let prefix = prefixMatch ? prefixMatch[0] : '';

  // Collect all completions
  const items: CompletionItem[] = [];
  const insideStyleValue = isInsideStyleBlock(textBefore) && !isStylePropertyNameContext(textBefore);

  if (insideStyleValue) {
    // Inside a style value position — rank the current property's enumerated
    // values first, then user variables, generic CSS value keywords, and
    // stdlib. Top-level keywords (let/for/fn/etc.) are never valid here.
    const propMatch = /([-\w]+)\s*:\s*[^;{}]*$/.exec(textBefore);
    const propertyValues = propMatch ? STYLE_PROPERTY_VALUES[propMatch[1]] : undefined;
    if (propertyValues) {
      items.push(...propertyValues.map(toCompletionItem));
      const covered = new Set(propertyValues.map((v) => v.label));
      items.push(...STYLE_VALUE_KEYWORDS.filter((k) => !covered.has(k.label)).map(toCompletionItem));
    } else {
      items.push(...STYLE_VALUE_KEYWORDS.map(toCompletionItem));
    }
    items.push(...STDLIB_COMPLETIONS.map(toCompletionItem));
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
  const scopeInfo = analyzeScopes(document);
  const seen = new Set<string>();
  const userDeclBoost = insideStyleValue ? 90 : 20;

  for (const decl of scopeInfo.declarations) {
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);

    // Check if declaration is visible at the cursor position
    // (simple heuristic: declaration line is before cursor line)
    if (decl.range.start.line <= position.line) {
      items.push({
        label: decl.name,
        kind: decl.kind === 'function' ? 'function' : 'variable',
        detail: decl.kind === 'function' ? `fn ${decl.name}(...)` : `${decl.kind}: ${decl.name}`,
        sortText: sortKey(userDeclBoost, decl.name),
      });
    }
  }

  return filterByPrefix(items, prefix);
}

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

function getMembersForObject(name: string, source: string): MemberCompletionSet | null {
  // Namespaces (Color, Object)
  if (name in NAMESPACE_MEMBERS) return NAMESPACE_MEMBERS[name];

  // Enum member access (GridPatternType.Shape, Easing.Linear, etc.)
  if (name in ENUM_MEMBER_MAP) {
    return { properties: ENUM_MEMBER_MAP[name], methods: [] };
  }

  // Special names with known types
  if (name === 'ctx' && 'PathContext' in TYPE_MEMBERS) return TYPE_MEMBERS.PathContext;

  // Try to infer type from source
  const type = inferType(name, source);
  if (type && type in TYPE_MEMBERS) return TYPE_MEMBERS[type];

  // Block parameter inference: name is a param in .map {|name| ...} or .reduce {|acc, name| ...}
  const blockParamType = inferBlockParamType(name, source);
  if (blockParamType && blockParamType in TYPE_MEMBERS) return TYPE_MEMBERS[blockParamType];

  // Loop variable inference: for (name in array) or for ([name, i] in array)
  const loopVarType = inferLoopVarType(name, source);
  if (loopVarType && loopVarType in TYPE_MEMBERS) return TYPE_MEMBERS[loopVarType];

  // Object literal properties: if we can find { name: ..., x: ..., y: ... } patterns
  // for the variable, offer those properties as completions
  const objProps = inferObjectProperties(name, source);
  if (objProps) return objProps;

  return null;
}

function getDeepMembers(obj: string, prop: string, source?: string): MemberCompletionSet | null {
  // ctx.position.x, ctx.start.y
  if (obj === 'ctx' && (prop === 'position' || prop === 'start')) {
    return TYPE_MEMBERS.Point ?? null;
  }
  // ctx.transform has its own members
  if (obj === 'ctx' && prop === 'transform') {
    return {
      properties: [
        { label: 'translate', kind: 'property', detail: 'Translation state {x, y}', boost: 10 },
        { label: 'rotate', kind: 'property', detail: 'Rotation state {angle, cx, cy}', boost: 10 },
        { label: 'scale', kind: 'property', detail: 'Scale state {x, y}', boost: 10 },
      ],
      methods: [
        { label: 'reset', kind: 'function', detail: 'reset() — Reset all transforms', boost: 8 },
        { label: 'set', kind: 'function', detail: 'set(property, value) — Set transform value', boost: 8 },
      ],
    };
  }

  // layer.ctx.position, layer.ctx.start — infer layer type, then check prop
  if (source && prop === 'ctx') {
    const type = inferType(obj, source);
    if (type === 'PathLayer' || type === 'GroupLayer') {
      return TYPE_MEMBERS.PathContext ?? null;
    }
  }

  return null;
}

/**
 * Infer object properties when a variable holds an object literal or comes from
 * an array of objects. Returns ad-hoc member completions based on property names.
 */
function inferObjectProperties(name: string, source: string): MemberCompletionSet | null {
  const esc = escapeRegex(name);

  // Direct object literal: let name = { x: ..., y: ..., ... };
  const objMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
  if (objMatch) {
    return extractObjectProps(objMatch[1]);
  }

  // Check if this is a loop/block param iterating over an array of objects
  // We already checked inferBlockParamType/inferLoopVarType — if those returned '_ObjectLiteral',
  // we need to find the actual array and extract props from the first element
  const blockParamType = inferBlockParamType(name, source);
  if (blockParamType === '_ObjectLiteral') {
    // Find the array variable
    const mapMatch = new RegExp(`(\\w+)\\.map\\s*\\(\\)\\s*\\{\\s*\\|\\s*${esc}`).exec(source);
    const loopMatch = new RegExp(
      `for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`,
    ).exec(source);
    const arrName = mapMatch?.[1] ?? loopMatch?.[1];
    if (arrName) {
      const arrEsc = escapeRegex(arrName);
      const arrInit = new RegExp(`let\\s+${arrEsc}\\s*=\\s*\\[\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
      if (arrInit) return extractObjectProps(arrInit[1]);
    }
  }

  const loopVarType = inferLoopVarType(name, source);
  if (loopVarType === '_ObjectLiteral') {
    const loopMatch = new RegExp(
      `for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`,
    ).exec(source);
    const arrName = loopMatch?.[1];
    if (arrName) {
      const arrEsc = escapeRegex(arrName);
      const arrInit = new RegExp(`let\\s+${arrEsc}\\s*=\\s*\\[\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
      if (arrInit) return extractObjectProps(arrInit[1]);
    }
  }

  return null;
}

/**
 * Extract property names from an object literal body string like "x: 10, y: 20, name: 'foo'"
 */
function extractObjectProps(body: string): MemberCompletionSet | null {
  const propPattern = /(\w+)\s*:/g;
  const props: CompletionEntry[] = [];
  const seen = new Set<string>();
  let m;
  while ((m = propPattern.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      props.push({ label: m[1], kind: 'property', detail: `property: ${m[1]}`, boost: 10 });
    }
  }
  if (props.length === 0) return null;
  return { properties: props, methods: [] };
}

/**
 * True when the cursor sits in style-block property-name position
 * (`${ stroke-w… }` before the `:`). Editor integrations use this to widen
 * their word/replacement range to include hyphens — CSS property names are
 * hyphenated, but general identifier patterns treat `-` as a boundary, which
 * makes accepting `stroke-width` after typing `stroke-w` double the prefix.
 */
export function isStylePropertyNamePosition(source: string, offset: number): boolean {
  const textBefore = source.slice(0, offset);
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
  const textBefore = source.slice(0, offset);
  if (isInsideBacktickString(textBefore)) return null;
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
