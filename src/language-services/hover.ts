import { analyzeScopes } from './scope-analysis';
import { STDLIB_COMPLETIONS } from './completion-data.generated';

import type { TextDocument } from './document';
import type { Position, Range } from './types';

export interface HoverInfo {
  contents: string; // Markdown content
  range?: Range;
}

// --- Hover data for keywords ---

const KEYWORD_HOVER: Record<string, string> = {
  let: '**let** — Declare a variable\n```\nlet name = expression;\n```',
  for: '**for** — Loop over a range or collection\n```\nfor (i in 0..10) { ... }\nfor (item in array) { ... }\n```',
  if: '**if** — Conditional execution\n```\nif (condition) { ... } else { ... }\n```',
  else: '**else** — Alternate branch of an if statement',
  fn: '**fn** — Define a function\n```\nfn name(params) { ... }\n```',
  return: '**return** — Return a value from a function\n```\nreturn expression;\n```',
  define: '**define** — Define a layer (PathLayer / TextLayer / GroupLayer) or the SVG viewBox\n```\ndefine PathLayer(\'name\') ${ stroke: #000; }\ndefine TextLayer(\'name\') ${ font-size: 14; }\ndefine ViewBox(0, 0, 200, 200);\n```',
  ViewBox: '**ViewBox** — Declare the SVG viewBox in source code\n```\ndefine ViewBox(originX, originY, width, height);\n```\nSource-defined viewBox overrides any CLI `--viewBox` flag.',
  layer: '**layer** — Apply block to route output to a layer\n```\nlayer(\'name\').apply { ... }\n```',
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

  // 2. Check if it's a path command (single letter at statement level)
  if (PATH_COMMAND_HOVER[word.text] && word.text.length === 1) {
    return { contents: PATH_COMMAND_HOVER[word.text], range: word.range };
  }

  // 3. Check if it's a stdlib function
  if (STDLIB_HOVER.has(word.text)) {
    return { contents: STDLIB_HOVER.get(word.text)!, range: word.range };
  }

  // 4. Check if it's a color literal
  const colorMatch = getColorAt(source, offset);
  if (colorMatch) {
    return { contents: `**Color** \`${colorMatch.text}\``, range: colorMatch.range };
  }

  // 5. Try scope analysis for user-defined symbols
  const scopeInfo = analyzeScopes(document);
  for (const ref of scopeInfo.references) {
    if (ref.name === word.text && ref.declaration) {
      const decl = ref.declaration;
      const kindLabel = decl.kind === 'function' ? 'function' : decl.kind === 'parameter' ? 'parameter' : decl.kind === 'loopVar' ? 'loop variable' : decl.kind === 'enum' ? 'enum' : 'variable';
      return {
        contents: `**${decl.name}** — *${kindLabel}*\n\nDefined at line ${decl.range.start.line + 1}`,
        range: word.range,
      };
    }
  }

  return null;
}

// --- Helpers ---

interface WordAtPosition {
  text: string;
  range: Range;
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
  };
}

function getColorAt(source: string, offset: number): WordAtPosition | null {
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
