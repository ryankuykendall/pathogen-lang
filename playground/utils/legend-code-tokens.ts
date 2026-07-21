// Pure layout pass for the export legend's source-code block.
//
// Turns raw source (plus optional pre-tokenized highlight lines from
// highlightPathogenTokens) into the exact per-line token runs the modal
// renders as <tspan>s: capped at maxLines, long lines truncated at token
// boundaries with a trailing '...', blank lines preserved as a single
// space so the line advance survives SVG rendering.
//
// DOM-free and dependency-free so it unit-tests without a browser or
// the Lezer parser (tests inject their own token lines).

export interface CodeToken {
  text: string;
  /** Highlight class (kw/num/str/id/fn/tp/op/cm) or null for plain text. */
  cls: string | null;
}

export interface LayoutCodeOptions {
  /** Hard cap on rendered lines; a '...' row is appended when exceeded. */
  maxLines: number;
  /** Character budget per line; longer lines truncate to `n-3` + '...'. */
  charsPerLine: number;
  /**
   * Pre-tokenized lines (one array per source line, round-tripping the
   * source). Null/undefined → monochrome fallback: each line becomes a
   * single cls-null token.
   */
  tokenLines?: CodeToken[][] | null;
}

const ELLIPSIS = '...';

/** Truncate one line's tokens to the character budget, at token boundaries. */
function truncateLine(tokens: CodeToken[], charsPerLine: number): CodeToken[] {
  const lineLength = tokens.reduce((n, t) => n + t.text.length, 0);
  if (lineLength <= charsPerLine) return tokens;

  const budget = Math.max(0, charsPerLine - ELLIPSIS.length);
  const out: CodeToken[] = [];
  let used = 0;
  for (const tok of tokens) {
    if (used >= budget) break;
    const room = budget - used;
    if (tok.text.length <= room) {
      out.push(tok);
      used += tok.text.length;
    } else {
      if (room > 0) out.push({ text: tok.text.slice(0, room), cls: tok.cls });
      used = budget;
    }
  }
  out.push({ text: ELLIPSIS, cls: null });
  return out;
}

export function layoutCodeLines(source: string, opts: LayoutCodeOptions): CodeToken[][] {
  const { maxLines, charsPerLine } = opts;

  // Monochrome fallback (no tokenizer, or its output doesn't match the
  // source): every line is one plain token. A token round-trip mismatch
  // would otherwise silently export wrong code — verify before trusting.
  let tokenLines = opts.tokenLines ?? null;
  if (tokenLines) {
    const roundTrip = tokenLines.map((ts) => ts.map((t) => t.text).join('')).join('\n');
    if (roundTrip !== source) tokenLines = null;
  }
  const lines: CodeToken[][] =
    tokenLines ?? source.split('\n').map((line) => (line.length > 0 ? [{ text: line, cls: null }] : []));

  const truncatedLineCount = lines.length > maxLines;
  const kept = truncatedLineCount ? lines.slice(0, maxLines) : lines;

  const out = kept.map((tokens) => {
    if (tokens.length === 0) return [{ text: ' ', cls: null }]; // preserve blank lines
    return truncateLine(tokens, charsPerLine);
  });

  if (truncatedLineCount) out.push([{ text: ELLIPSIS, cls: null }]);
  return out;
}
