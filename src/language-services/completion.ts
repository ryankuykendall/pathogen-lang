import { analyzeScopes } from './scope-analysis';
import {
  KEYWORD_COMPLETIONS,
  STYLE_PROPERTY_COMPLETIONS,
  BLOCK_START_SNIPPETS,
  DECLARATION_SNIPPETS,
  INTERPOLATION_SNIPPET,
  STYLE_BLOCK_SNIPPET,
} from './completion-data-static';
import {
  ENUM_COMPLETIONS,
  ENUM_MEMBER_MAP,
  STDLIB_COMPLETIONS,
  TYPE_MEMBERS,
  NAMESPACE_MEMBERS,
} from './completion-data.generated';

import type { TextDocument } from './document';
import type { Position } from './types';
import type { CompletionEntry, MemberCompletionSet } from './completion-data-static';

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
    const prefixMatch = textBefore.match(/[a-zA-Z_$]\w*$|\$\{?$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    return filterByPrefix(items, prefix);
  }

  // Leading `@` or `&` — surface block-start snippets. Two valid contexts:
  //   • Statement start  → @font directive, @{ } PathBlock, &{ } TextBlock
  //   • Expression value → @{ } PathBlock, &{ } TextBlock (e.g. `let x = @{`)
  // `@font` is a top-level directive and is filtered out of expression
  // contexts where it would not parse.
  const blockStartMatch = textBefore.match(/[@&]\w*$/);
  if (blockStartMatch) {
    const before = textBefore.slice(0, textBefore.length - blockStartMatch[0].length);
    const stmtStart = isAtStatementStart(before);
    const exprPos = isInExpressionPosition(before);
    if (stmtStart || exprPos) {
      const snippets = stmtStart
        ? BLOCK_START_SNIPPETS
        : BLOCK_START_SNIPPETS.filter((s) => s.label !== '@font');
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
      return STYLE_PROPERTY_COMPLETIONS.map(toCompletionItem);
    }
    // Value context: fall through to collect user variables + stdlib +
    // keywords via the normal path, then append style-value keywords below.
  }

  // Check for method call on expression: expr.method(...).
  // e.g., shape.boundingBox(). or Color('#f00').lighten(0.2).
  const chainMatch = textBefore.match(/\.(\w+)\(\s*[^)]*\)\s*\.(\w*)$/);
  if (chainMatch) {
    const methodName = chainMatch[1];
    const memberPrefix = chainMatch[2];
    const returnType = getMethodReturnType(methodName);
    if (returnType && returnType in TYPE_MEMBERS) {
      return filterByPrefix(
        [...TYPE_MEMBERS[returnType].properties, ...TYPE_MEMBERS[returnType].methods].map(toCompletionItem),
        memberPrefix,
      );
    }
  }

  // Check for member access (dot completions)
  const dotMatch = textBefore.match(/(\w+)\.(\w*)$/);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const memberPrefix = dotMatch[2];
    const members = getMembersForObject(objectName, source);
    if (members) {
      return filterByPrefix(
        [...members.properties, ...members.methods].map(toCompletionItem),
        memberPrefix,
      );
    }
  }

  // Check for deep property access (e.g., ctx.position.x, layer.ctx.position)
  const deepMatch = textBefore.match(/(\w+)\.(\w+)\.(\w*)$/);
  if (deepMatch) {
    const [, obj, prop1, prefix] = deepMatch;
    const deepMembers = getDeepMembers(obj, prop1, source);
    if (deepMembers) {
      return filterByPrefix(
        [...deepMembers.properties, ...deepMembers.methods].map(toCompletionItem),
        prefix,
      );
    }
  }

  // Get the word prefix at cursor
  const prefixMatch = textBefore.match(/[a-zA-Z_]\w*$/);
  const prefix = prefixMatch ? prefixMatch[0] : '';

  // Collect all completions
  const items: CompletionItem[] = [];
  const insideStyleValue = isInsideStyleBlock(textBefore) && !isStylePropertyNameContext(textBefore);

  if (insideStyleValue) {
    // Inside a style value position — rank user variables highest, add CSS
    // value keywords, and skip noisy top-level keywords (let/for/fn/etc.)
    // that are never valid inside a value expression.
    items.push(...STYLE_VALUE_KEYWORDS.map(toCompletionItem));
    items.push(...STDLIB_COMPLETIONS.map(toCompletionItem));
    items.push(...ENUM_COMPLETIONS.map(toCompletionItem));
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
  if (name === 'ctx' && 'PathContext' in TYPE_MEMBERS) return TYPE_MEMBERS['PathContext'];

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
    return TYPE_MEMBERS['Point'] ?? null;
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
      return TYPE_MEMBERS['PathContext'] ?? null;
    }
  }

  return null;
}

/**
 * Map method names to their return types.
 * Used for chained completions like shape.boundingBox().width
 */
function getMethodReturnType(method: string): string | null {
  const METHOD_RETURN_TYPES: Record<string, string> = {
    // PathBlock methods returning PathBlock
    offset: 'PathBlock', reverse: 'PathBlock', mirror: 'PathBlock',
    subPath: 'PathBlock', chamfer: 'PathBlock', chamferAtVertex: 'PathBlock',
    fillet: 'PathBlock', filletAtVertex: 'PathBlock',
    ellipticalFillet: 'PathBlock', ellipticalFilletAtVertex: 'PathBlock',
    union: 'PathBlock', difference: 'PathBlock', intersection: 'PathBlock', xor: 'PathBlock',
    scale: 'PathBlock', rotateAtVertexIndex: 'PathBlock',
    toPathBlock: 'PathBlock',

    // PathBlock methods returning BoundingBox
    boundingBox: 'BoundingBox', paddedBoundingBox: 'BoundingBox',

    // PathBlock methods returning Point
    get: 'Point', anchor: 'Point',

    // Color methods returning ColorInstance
    lighten: 'ColorInstance', darken: 'ColorInstance',
    saturate: 'ColorInstance', desaturate: 'ColorInstance',
    alpha: 'ColorInstance', hueShift: 'ColorInstance',
    complement: 'ColorInstance', mix: 'ColorInstance',

    // Point methods returning Point
    translate: 'Point', polarTranslate: 'Point',
    midpoint: 'Point', lerp: 'Point', rotate: 'Point',

    // PolarVector methods returning PolarVector
    turn: 'PolarVector',
    // Note: 'mirror' maps to PathBlock (defined above) — PolarVector.mirror() also exists
    // but PathBlock is more common, so we keep that mapping

    // Cycler
    pick: 'any',

    // Array methods
    slice: 'array', map: 'array', mapSlice: 'array',
  };

  return METHOD_RETURN_TYPES[method] ?? null;
}

/**
 * Lightweight type inference from source text.
 * Matches patterns like `let x = Point(...)`, `let x = @{...}`, `let x = [...]`, etc.
 */
function inferType(name: string, source: string): string | null {
  const esc = escapeRegex(name);

  // let name = Point(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*Point\\s*\\(`).test(source)) return 'Point';

  // let name = PolarVector(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*PolarVector\\s*\\(`).test(source)) return 'PolarVector';

  // let name = Cycler(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*Cycler\\s*\\(`).test(source)) return 'Cycler';

  // let name = PathLayer(...) or define PathLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*PathLayer\\s*\\(`).test(source)) return 'PathLayer';

  // let name = TextLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*TextLayer\\s*\\(`).test(source)) return 'TextLayer';

  // let name = GroupLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*GroupLayer\\s*\\(`).test(source)) return 'GroupLayer';

  // let name = layer('...')  — returns a layer reference (same as PathLayer)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*layer\\s*\\(`).test(source)) return 'PathLayer';

  // let name = Color(...) or let name = #hex or let name = rgb(...) or let name = oklch(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*(?:Color\\s*\\(|#[0-9a-fA-F]|rgb\\(|hsl\\(|oklch\\(|hwb\\(|lab\\(|lch\\(|oklab\\()`).test(source)) return 'ColorInstance';

  // let name = @{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*@\\s*\\{`).test(source)) return 'PathBlock';

  // let name = &{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*&\\s*\\{`).test(source)) return 'ProjectedText';

  // let name = CSSVar(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*CSSVar\\s*\\(`).test(source)) return 'CSSVar';

  // Filter constructors — `let f = FilterCtor(...)` or `let f = FilterCtor(...) {|x| ...}`
  // (See docs/filters.md and pathogen-api.ts for the six filter type interfaces.)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*NoiseFilter\\s*\\(`).test(source)) return 'NoiseFilter';
  if (new RegExp(`let\\s+${esc}\\s*=\\s*GlowFilter\\s*\\(`).test(source)) return 'GlowFilter';
  if (new RegExp(`let\\s+${esc}\\s*=\\s*EmbossFilter\\s*\\(`).test(source)) return 'EmbossFilter';
  if (new RegExp(`let\\s+${esc}\\s*=\\s*ElevationShadowFilter\\s*\\(`).test(source)) return 'ElevationShadowFilter';
  if (new RegExp(`let\\s+${esc}\\s*=\\s*InnerShadowFilter\\s*\\(`).test(source)) return 'InnerShadowFilter';
  if (new RegExp(`let\\s+${esc}\\s*=\\s*PixelateFilter\\s*\\(`).test(source)) return 'PixelateFilter';

  // let name = [...]  or method returning array
  if (new RegExp(`let\\s+${esc}\\s*=\\s*\\[`).test(source)) return 'array';

  // let name = "..." or let name = '...' or let name = `...`
  if (new RegExp(`let\\s+${esc}\\s*=\\s*["'\`]`).test(source)) return 'string';

  // let name = something.boundingBox() — infer from method return type
  const methodAssignMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\w+\\.([a-zA-Z]+)\\s*\\(`).exec(source);
  if (methodAssignMatch) {
    const returnType = getMethodReturnType(methodAssignMatch[1]);
    if (returnType && returnType !== 'any') return returnType;
  }

  // Stdlib path functions return PathBlock-like path segments
  if (new RegExp(`let\\s+${esc}\\s*=\\s*(?:circle|rect|roundRect|polygon|star|line|arc|quadratic|cubic|cubicSpline|quadSpline)\\s*\\(`).test(source)) {
    return 'PathBlock';
  }

  // Assignment from another variable: let x = y; — propagate y's type to x
  const assignMatch = new RegExp(`let\\s+${esc}\\s*=\\s*([a-zA-Z_]\\w*)\\s*;`).exec(source);
  if (assignMatch) {
    const sourceVar = assignMatch[1];
    // Avoid infinite recursion by not re-inferring the same name
    if (sourceVar !== name) {
      return inferType(sourceVar, source);
    }
  }

  return null;
}

/**
 * Infer type for a block parameter (e.g., item in arr.map {|item| ...}).
 * Looks for the array variable the .map/.reduce is called on, then infers
 * the element type of that array.
 */
function inferBlockParamType(paramName: string, source: string): string | null {
  const esc = escapeRegex(paramName);

  // Match: arrayVar.map() {|paramName| or arrayVar.map() {|paramName, index|
  const mapMatch = new RegExp(`(\\w+)\\.map\\s*\\(\\)\\s*\\{\\s*\\|\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\|`).exec(source);
  if (mapMatch) {
    return inferArrayElementType(mapMatch[1], source);
  }

  // Match: arrayVar.reduce(init) {|acc, paramName| — param is 2nd arg (the element)
  const reduceItemMatch = new RegExp(`(\\w+)\\.reduce\\s*\\([^)]*\\)\\s*\\{\\s*\\|\\s*\\w+\\s*,\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\|`).exec(source);
  if (reduceItemMatch) {
    return inferArrayElementType(reduceItemMatch[1], source);
  }

  // Match: FilterCtor(...) {|paramName| — bound parameter inside a filter trailing block
  const filterCtorMatch = new RegExp(
    `(NoiseFilter|GlowFilter|EmbossFilter|ElevationShadowFilter|InnerShadowFilter|PixelateFilter)\\s*\\([^)]*\\)\\s*\\{\\s*\\|\\s*${esc}\\s*\\|`,
  ).exec(source);
  if (filterCtorMatch) {
    return filterCtorMatch[1];
  }

  return null;
}

/**
 * Infer type for a loop variable (e.g., d in for ([d, i] in data) or item in for (item in arr)).
 */
function inferLoopVarType(varName: string, source: string): string | null {
  const esc = escapeRegex(varName);

  // Match: for ([varName, ...] in arrayVar) — destructured iteration
  const destructuredMatch = new RegExp(`for\\s*\\(\\s*\\[\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\]\\s+in\\s+(\\w+)\\s*\\)`).exec(source);
  if (destructuredMatch) {
    return inferArrayElementType(destructuredMatch[1], source);
  }

  // Match: for (varName in arrayVar) — simple iteration
  const simpleMatch = new RegExp(`for\\s*\\(\\s*${esc}\\s+in\\s+(\\w+)\\s*\\)`).exec(source);
  if (simpleMatch) {
    return inferArrayElementType(simpleMatch[1], source);
  }

  return null;
}

/**
 * Infer the element type of an array variable by looking at its initialization.
 * e.g., let arr = [Point(0,0), Point(1,1)] → element type is 'Point'
 *       let arr = [{ x: 0, y: 0 }] → element type might be an inline object
 */
function inferArrayElementType(arrayName: string, source: string): string | null {
  const esc = escapeRegex(arrayName);

  // Look for array initializer: let arrayName = [ ... ]
  const arrMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\[\\s*([^\\]]{1,200})`).exec(source);
  if (!arrMatch) return null;

  const firstContent = arrMatch[1].trim();

  // Check first element type
  if (/^Point\s*\(/.test(firstContent)) return 'Point';
  if (/^PolarVector\s*\(/.test(firstContent)) return 'PolarVector';
  if (/^Color\s*\(/.test(firstContent) || /^#[0-9a-fA-F]/.test(firstContent)) return 'ColorInstance';
  if (/^@\s*\{/.test(firstContent)) return 'PathBlock';
  if (/^PathLayer\s*\(/.test(firstContent)) return 'PathLayer';
  if (/^TextLayer\s*\(/.test(firstContent)) return 'TextLayer';
  if (/^GroupLayer\s*\(/.test(firstContent)) return 'GroupLayer';

  // Array of objects: let arr = [{ x: 0, y: 0 }, ...] — return a marker type
  if (/^\{/.test(firstContent)) return '_ObjectLiteral';

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
    const loopMatch = new RegExp(`for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`).exec(source);
    const arrName = mapMatch?.[1] ?? loopMatch?.[1];
    if (arrName) {
      const arrEsc = escapeRegex(arrName);
      const arrInit = new RegExp(`let\\s+${arrEsc}\\s*=\\s*\\[\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
      if (arrInit) return extractObjectProps(arrInit[1]);
    }
  }

  const loopVarType = inferLoopVarType(name, source);
  if (loopVarType === '_ObjectLiteral') {
    const loopMatch = new RegExp(`for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`).exec(source);
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (ch === '\\') { i++; continue; }
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
  return ch === '=' || ch === '(' || ch === ',' || ch === '['
    || ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === ':';
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
