/**
 * Code snippet tokenizer and layer generator for TextBlock.toCodeSnippetBlock().
 *
 * Provides Pathogen-aware syntax highlighting with a GitHub dark mode palette,
 * and generates GroupLayer/PathLayer/TextLayer structures.
 */

// ---------------------------------------------------------------------------
// Token types and color palette (GitHub dark mode inspired)
// ---------------------------------------------------------------------------

export interface CodeToken {
  type: 'comment' | 'string' | 'keyword' | 'builtin' | 'function' | 'number' | 'unit' | 'operator' | 'punctuation' | 'text';
  value: string;
}

const TOKEN_COLORS: Record<CodeToken['type'], string> = {
  comment: '#64748b',
  string: '#22c55e',
  keyword: '#c084fc',
  builtin: '#c084fc',
  function: '#f59e0b',
  number: '#f59e0b',
  unit: '#e2e8f0',
  operator: '#94a3b8',
  punctuation: '#64748b',
  text: '#e2e8f0',
};

// ---------------------------------------------------------------------------
// Tokenizer — regex-based, first-match-wins, per-line
// ---------------------------------------------------------------------------

const KEYWORDS = new Set([
  'let', 'for', 'forEach', 'if', 'else', 'define', 'in', 'fn', 'return',
]);

const BUILTINS = new Set([
  'PathLayer', 'TextLayer', 'GroupLayer', 'PathBlock', 'TextBlock',
  'Color', 'LinearGradient', 'RadialGradient', 'ConicGradient',
  'MeshGradient', 'FreeformGradient', 'TopoGradient',
  'BBoxAnchor', 'Math', 'log', 'calc',
  'circle', 'rect', 'roundRect', 'polygon', 'star', 'line',
  'arc', 'moveTo', 'lineTo', 'closePath',
]);

interface TokenRule {
  pattern: RegExp;
  type: CodeToken['type'];
}

const TOKEN_RULES: TokenRule[] = [
  // 1. Comments: // to EOL
  { pattern: /^\/\/.*/, type: 'comment' },
  // 2. Backtick strings
  { pattern: /^`[^`]*`/, type: 'string' },
  // 3. Single-quoted strings
  { pattern: /^'[^']*'/, type: 'string' },
  // 4. Double-quoted strings
  { pattern: /^"[^"]*"/, type: 'string' },
  // 5. Numbers (int, float — no unit suffix)
  { pattern: /^-?\d+\.?\d*/, type: 'number' },
  // 5b. Unit suffixes immediately after numbers
  { pattern: /^(?:deg|rad|pi|%)/, type: 'unit' },
  // 6. Sigil blocks: @{}, &{}, ${}
  { pattern: /^[@&$]\{/, type: 'punctuation' },
  // 7. Operators
  { pattern: /^(?:<<|<=|>=|==|!=|&&|\|\||[=+\-*/<>!])/, type: 'operator' },
  // 8. Punctuation
  { pattern: /^[{}()[\];,.:@&#$]/, type: 'punctuation' },
  // 9. Identifiers (keyword/builtin/function/text — classified after match)
  { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*/, type: 'text' },
  // 10. Whitespace
  { pattern: /^\s+/, type: 'text' },
];

/**
 * Tokenize a single line of Pathogen code.
 */
export function tokenizeLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    let matched = false;
    for (const rule of TOKEN_RULES) {
      const m = remaining.match(rule.pattern);
      if (m) {
        let tokenType = rule.type;
        const value = m[0];

        // Classify identifiers
        if (rule.type === 'text' && /^[a-zA-Z_]/.test(value)) {
          if (KEYWORDS.has(value)) {
            tokenType = 'keyword';
          } else if (BUILTINS.has(value)) {
            tokenType = 'builtin';
          } else {
            // Check if followed by '(' → function call
            const afterIdent = remaining.slice(value.length);
            if (/^\s*\(/.test(afterIdent)) {
              tokenType = 'function';
            }
          }
        }

        tokens.push({ type: tokenType, value });
        remaining = remaining.slice(value.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Consume one character as text
      tokens.push({ type: 'text', value: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

/**
 * Get the fill color for a token type.
 */
export function getTokenColor(type: CodeToken['type']): string {
  return TOKEN_COLORS[type];
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

/**
 * Normalize raw code text: dedent, trim blank leading/trailing lines, tabs → 2 spaces.
 */
export function normalizeCodeText(raw: string): string {
  // Tabs → 2 spaces
  let text = raw.replace(/\t/g, '  ');

  // Split into lines
  let lines = text.split('\n');

  // Trim blank leading lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  // Trim blank trailing lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) return '';

  // Dedent: find minimum leading whitespace across non-empty lines
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = line.match(/^( *)/)?.[1].length ?? 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (isFinite(minIndent) && minIndent > 0) {
    lines = lines.map((line) => line.slice(minIndent));
  }

  return lines.join('\n');
}
