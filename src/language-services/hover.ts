import { STDLIB_COMPLETIONS, TYPE_ELEMENT_TYPES, TYPE_PROPERTY_TYPES } from './completion-data.generated';
import { regexNameResolver, resolveMemberAccess } from './member-resolution';
import { analyzeScopes } from './scope-analysis';
import { inferBlockParamType, inferLoopVarType, inferType } from './type-inference';
import { findDeclaration, inferDeclType, inferExprElementType } from './type-inference-ast';
import { lezerParser } from '../parser';

import type { TextDocument } from './document';
import type { Declaration, ScopeInfo } from './scope-analysis';
import type { Position, Range } from './types';

export interface HoverInfo {
  contents: string; // Markdown content
  range?: Range;
}

// --- Hover data for keywords ---

export const KEYWORD_HOVER: Record<string, string> = {
  let: '**let** — Declare a variable\n```\nlet name = expression;\n```',
  for: '**for** — Loop over a range or collection\n```\nfor (i in 0..10) { ... }\nfor (item in array) { ... }\n```',
  if: '**if** — Conditional execution\n```\nif (condition) { ... } else { ... }\n```',
  else: '**else** — Alternate branch of an if statement',
  in: '**in** — Separates the loop variable from its range or collection\n```\nfor (i in 0..10) { ... }\nfor (item in array) { ... }\nfor ([item, i] in array) { ... }\n```',
  apply:
    "**apply** — Route a block's output to a layer\n```\nlayer('name').apply { ... }\nmyLayer.apply { ... }\n```\nCommands inside the block draw on that layer instead of the default layer.",
  // NOTE: no 'lambda' entry here — `lambda` is NOT a grammar keyword, just a
  // completion-snippet prefix. A KEYWORD_HOVER entry would shadow the hover of
  // any user variable literally named `lambda` (KEYWORD_HOVER is checked
  // before scope resolution). Discoverability rides the fn entry + snippet.
  fn: '**fn** — Define a function\n```\nfn name(params) { ... }\n```\nNamed functions resolve free names in the *caller\'s* scope (dynamic scoping). For lexical capture, use a lambda: `let f = {|x| ... };`',
  return: '**return** — Return a value from a function\n```\nreturn expression;\n```',
  continue:
    '**continue** — Skip the rest of the current loop iteration\n```\nfor (i in 0..10) {\n  if (i == 3) { continue; }\n  ...\n}\n```\nValid only inside a for loop body (or `if` branches and `switch` cases nested in it); controls the innermost enclosing loop. A switch never catches it — inside a `case` body it still targets the loop.',
  break:
    '**break** — Exit the innermost enclosing for loop\n```\nfor (i in 0..10) {\n  if (done) { break; }\n  ...\n}\n```\nValid only inside a for loop body (or `if` branches and `switch` cases nested in it). A switch never catches it — inside a `case` body it exits the loop, not the switch.',
  switch:
    '**switch** — Match a value against case patterns\n```\nswitch (kind) {\n  case "circle" { ... }\n  case 0..<10 { ... }\n  case { x, y } where x > y { ... }\n  default { ... }\n}\n```\nPatterns: values (comma-separated alternatives), ranges (`0..10` inclusive, `0..<10` half-open, `..<0` / `100..` open-ended), and `[a, ...rest]` / `{ x, y: alias }` destructuring with an optional `where` guard. No fallthrough: the first matching case runs and the switch ends.',
  case:
    '**case** — One clause of a switch\n```\ncase "a", "b" { ... }\ncase 0..<0.25 { ... }\ncase [first, ...others] { ... }\ncase { x, y } where x > y { ... }\n```\nValue, range, or destructuring pattern; comma alternatives share the body. Bodies are braced — no `:` and no fallthrough.',
  where:
    '**where** — Guard condition on a case clause\n```\ncase { x, y } where x > y { ... }\n```\nEvaluated after the pattern binds its names; the case matches only when the guard is truthy.',
  default:
    '**default** — Fallback clause of a switch, or the default layer\n```\nswitch (n) {\n  case 1 { ... }\n  default { ... }\n}\ndefine default PathLayer(\'main\') ${ ... }\n```\nIn a switch it runs when no case matches and must be the last clause (at most one).',
  define:
    "**define** — Define a layer (PathLayer / TextLayer / GroupLayer) or the SVG viewBox\n```\ndefine PathLayer('name') ${ stroke: #000; }\ndefine TextLayer('name') ${ font-size: 14; }\ndefine ViewBox(0, 0, 200, 200);\n```",
  ViewBox:
    '**ViewBox** — Declare the SVG viewBox in source code\n```\ndefine ViewBox(originX, originY, width, height);\n```\nSource-defined viewBox overrides any CLI `--viewBox` flag.',
  viewbox:
    '**viewbox** — Read-only global exposing the viewBox set by `define ViewBox(…)`\n```\nlet {width, height} = viewbox;\nrect(viewbox.originX, viewbox.originY, width, height);\n```\nMembers: `originX`, `originY`, `width`, `height`. Reading it before `define ViewBox(…)` has run is an error.',
  layer: "**layer** — Apply block to route output to a layer\n```\nlayer('name').apply { ... }\n```",
  text: '**text** — Create a text element\n```\ntext(x, y)`content`\n```',
  tspan: '**tspan** — Text span inside a text block\n```\ntspan(dx, dy)`content`\n```',
  enum: '**enum** — Define an enumeration\n```\nenum Name { MEMBER1, MEMBER2 }\n```',
  calc: '**calc()** — Wrap arithmetic expressions for path arguments\n```\nM calc(x + 10) calc(y * 2)\n```',
  true: '**true** — Boolean literal (evaluates to 1)',
  false: '**false** — Boolean literal (evaluates to 0)',
  null: '**null** — Null value',
};

// --- SVG path command hover ---

/** SVG path command hover descriptions. Keys are the single-letter commands. */
export const PATH_COMMAND_HOVER: Record<string, string> = {
  M: '**M** x y — Move to (absolute)',
  m: '**m** dx dy — Move to (relative)',
  L: '**L** x y — Line to (absolute)',
  l: '**l** dx dy — Line to (relative)',
  H: '**H** x — Horizontal line to (absolute)',
  h: '**h** dx — Horizontal line to (relative)',
  V: '**V** y — Vertical line to (absolute)',
  v: '**v** dy — Vertical line to (relative)',
  C: '**C** x1 y1 x2 y2 x y — Cubic bezier (absolute)',
  c: '**c** dx1 dy1 dx2 dy2 dx dy — Cubic bezier (relative)',
  S: '**S** x2 y2 x y — Smooth cubic bezier (absolute)',
  s: '**s** dx2 dy2 dx dy — Smooth cubic bezier (relative)',
  Q: '**Q** x1 y1 x y — Quadratic bezier (absolute)',
  q: '**q** dx1 dy1 dx dy — Quadratic bezier (relative)',
  T: '**T** x y — Smooth quadratic bezier (absolute)',
  t: '**t** dx dy — Smooth quadratic bezier (relative)',
  A: '**A** rx ry rotation large-arc sweep x y — Arc (absolute)',
  a: '**a** rx ry rotation large-arc sweep dx dy — Arc (relative)',
  Z: '**Z** — Close path',
  z: '**z** — Close path',
};

/** Set of all single-letter SVG path commands, derived from PATH_COMMAND_HOVER. */
export const PATH_COMMAND_SET = new Set(Object.keys(PATH_COMMAND_HOVER));

// Build stdlib hover map from completion data
const STDLIB_HOVER = new Map<string, string>();
for (const entry of STDLIB_COMPLETIONS) {
  STDLIB_HOVER.set(entry.label, `**${entry.label}**\n\n${entry.detail}`);
}

/**
 * Get hover information at a position in a document.
 */
export function getHoverInfo(document: TextDocument, position: Position): HoverInfo | null {
  const source = document.getText();
  const offset = document.offsetAt(position);

  // Extract the word at the cursor position
  const word = getWordAt(source, offset);
  if (!word) return null;

  // 1. Check if it's a keyword
  if (KEYWORD_HOVER[word.text]) {
    return { contents: KEYWORD_HOVER[word.text], range: word.range };
  }

  // 2. Check if it's a path command (single letter at statement level).
  // A single letter can also be a VARIABLE (`let m = 25;`): at a
  // declaration or expression site the tree says VariableName/Identifier
  // — fall through so the scope-based hover answers with the variable.
  // In path-argument position the reparse honestly yields a command
  // node, and command hover is the right answer there (the shadowing
  // diagnostic tells the rest of that story).
  if (PATH_COMMAND_HOVER[word.text] && word.text.length === 1) {
    const node = lezerParser.parse(source).resolveInner(word.startOffset, 1);
    const isVariableSite = node.name === 'VariableName' || node.name === 'Identifier';
    // calc() contents live inside the opaque PathArgs token, so the tree
    // can't see them — a paren scan answers "is this letter an argument
    // of calc()?" instead.
    const insideCalc = (() => {
      let depth = 0;
      for (let i = word.startOffset - 1; i >= 0; i--) {
        const ch = source[i];
        if (ch === ')') depth++;
        else if (ch === '(') {
          if (depth > 0) {
            depth--;
          } else if (/calc\s*$/.test(source.slice(Math.max(0, i - 8), i))) {
            return true;
          }
          // An unmatched non-calc '(' (e.g. sin() around the letter) —
          // keep walking out; calc() may still enclose it.
        }
      }
      return false;
    })();
    if (!isVariableSite && !insideCalc) {
      return { contents: PATH_COMMAND_HOVER[word.text], range: word.range };
    }
  }

  // Scope analysis is lazily computed once — keyword/stdlib/color hovers
  // above and below never pay for a parse.
  let cachedScopeInfo: ScopeInfo | null = null;
  const getScopeInfo = () => {
    cachedScopeInfo ??= analyzeScopes(document);
    return cachedScopeInfo;
  };

  // AST-first name typing shared with completion (regex fallback inside).
  const resolveName = (name: string): string | null => {
    const decl = findDeclaration(getScopeInfo(), name, position);
    return (decl ? inferDeclType(decl) : null) ?? regexNameResolver(name, source);
  };

  // 3. Member access — the word follows a `.`: resolve the receiver through
  // the same path as member completion and describe the matched member.
  // A member position that doesn't resolve returns null rather than falling
  // through — the flat stdlib lookup would otherwise show e.g. the stdlib
  // `map(value, ...)` doc for `xs.map`, which describes a different function.
  if (word.startOffset > 0 && source[word.startOffset - 1] === '.') {
    const resolution = resolveMemberAccess(source.slice(0, word.endOffset), source, resolveName);
    if (resolution) {
      const member =
        [...resolution.members.properties, ...resolution.members.methods].find((m) => m.label === word.text) ?? null;
      if (member) {
        const kindLabel = member.kind === 'function' ? 'method' : member.kind === 'constant' ? 'constant' : 'property';
        const owner = resolution.typeName ? `${displayTypeName(resolution.typeName)} ` : '';
        let valueType = '';
        if (member.kind !== 'function' && resolution.typeName) {
          const propType = TYPE_PROPERTY_TYPES[resolution.typeName]?.[member.label];
          const elementType = TYPE_ELEMENT_TYPES[resolution.typeName]?.[member.label];
          const display = elementType
            ? `array<${displayTypeName(elementType)}>`
            : propType
              ? displayTypeName(propType)
              : null;
          if (display) valueType = `: ${display}`;
        }
        return {
          contents: `**${member.label}** — *${owner}${kindLabel}${valueType}*\n\n${member.detail}`,
          range: word.range,
        };
      }
    }
    return null;
  }

  // 4. Check if it's a stdlib function
  if (STDLIB_HOVER.has(word.text)) {
    return { contents: STDLIB_HOVER.get(word.text)!, range: word.range };
  }

  // 5. Check if it's a color literal
  const colorMatch = getColorAt(source, offset);
  if (colorMatch) {
    return { contents: `**Color** \`${colorMatch.text}\``, range: colorMatch.range };
  }

  // 6. Try scope analysis for user-defined symbols — references first, then
  // declarations, so hovering a name at its declaration site (let x, fn
  // params, loop vars, {|block params|}) also resolves.
  let matched: Declaration | null = null;
  for (const ref of getScopeInfo().references) {
    if (ref.name !== word.text || !ref.declaration) continue;
    if (!matched) matched = ref.declaration;
    // Prefer the reference at the hovered position — shadowed names resolve
    // to the declaration that actually governs this occurrence.
    if (ref.range.start.line === word.range.start.line && ref.range.start.character === word.range.start.character) {
      matched = ref.declaration;
      break;
    }
  }
  if (!matched) matched = findDeclaration(getScopeInfo(), word.text, position);
  if (matched) {
    const inferred = inferSymbolType(matched, word.text, source);
    const kindWithType = inferred ? `${KIND_LABELS[matched.kind]}: ${inferred}` : KIND_LABELS[matched.kind];
    return {
      contents: `**${matched.name}** — *${kindWithType}*\n\nDefined at line ${matched.range.start.line + 1}`,
      range: word.range,
    };
  }

  return null;
}

const KIND_LABELS: Record<Declaration['kind'], string> = {
  function: 'function',
  parameter: 'parameter',
  loopVar: 'loop variable',
  enum: 'enum',
  blockParam: 'block parameter',
  variable: 'variable',
};

/** Internal inference type names → user-facing display names. */
const DISPLAY_TYPE_NAMES: Record<string, string> = {
  ColorInstance: 'Color',
  _ObjectLiteral: 'object',
};

function displayTypeName(typeName: string): string {
  return DISPLAY_TYPE_NAMES[typeName] ?? typeName;
}

/**
 * Infer a display type for a scope-resolved symbol: the AST-based path first
 * (typing the declaration's real initializer/iterable/block context), then the
 * legacy regex chain — the same order as the completion engine, so hover and
 * completions always agree on a name's type. Returns null when nothing can be
 * inferred — the hover then renders exactly as before. Functions and enums
 * have no inferable value type.
 */
function inferSymbolType(decl: Declaration, name: string, source: string): string | null {
  if (decl.kind === 'function' || decl.kind === 'enum') return null;
  const inferred =
    inferDeclType(decl) ??
    inferType(name, source) ??
    inferBlockParamType(name, source) ??
    inferLoopVarType(name, source);
  if (!inferred) return null;
  // Arrays with a known element type display as array<Element>
  if (inferred === 'array' && decl.typeContext?.kind === 'init') {
    const elementType = inferExprElementType(decl.typeContext.expr, decl.scope);
    if (elementType) return `array<${displayTypeName(elementType)}>`;
  }
  return displayTypeName(inferred);
}

// --- Helpers ---

interface WordAtPosition {
  text: string;
  range: Range;
  startOffset: number;
  endOffset: number;
}

function getWordAt(source: string, offset: number): WordAtPosition | null {
  // Expand left and right to find the word boundary
  let start = offset;
  let end = offset;

  while (start > 0 && /[a-zA-Z0-9_]/.test(source[start - 1])) start--;
  while (end < source.length && /[a-zA-Z0-9_]/.test(source[end])) end++;

  if (start === end) return null;

  const text = source.slice(start, end);
  const lines = source.slice(0, start).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const endLines = source.slice(0, end).split('\n');
  const endLine = endLines.length - 1;
  const endCharacter = endLines[endLines.length - 1].length;

  return {
    text,
    range: {
      start: { line, character },
      end: { line: endLine, character: endCharacter },
    },
    startOffset: start,
    endOffset: end,
  };
}

function getColorAt(source: string, offset: number): Omit<WordAtPosition, 'startOffset' | 'endOffset'> | null {
  // Check if we're on a #hex color literal
  let start = offset;
  while (start > 0 && /[a-fA-F0-9]/.test(source[start - 1])) start--;
  if (start > 0 && source[start - 1] === '#') start--;
  else return null;

  let end = start + 1; // skip #
  while (end < source.length && /[a-fA-F0-9]/.test(source[end])) end++;

  const text = source.slice(start, end);
  if (!/^#[0-9a-fA-F]{3,8}$/.test(text)) return null;

  const lines = source.slice(0, start).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const endLines = source.slice(0, end).split('\n');

  return {
    text,
    range: {
      start: { line, character },
      end: { line: endLines.length - 1, character: endLines[endLines.length - 1].length },
    },
  };
}
