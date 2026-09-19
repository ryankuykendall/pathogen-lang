import { describe, expect, it } from 'vitest';

import { svgPathCompletions } from '../playground/utils/codemirror-setup';

// The editor registers TWO completion sources — the shared language-services
// engine and this legacy one — and CodeMirror MERGES their results. The legacy
// source must therefore return null wherever the shared engine owns the
// answer, or its keyword list buries the real options. Member access is one
// such place. The `.` trigger character opens the popup explicitly, so the
// legacy source's "nothing typed yet" guard does not apply.

/** The slice of CodeMirror's CompletionContext that svgPathCompletions reads. */
function contextFor(textBeforeCursor: string, explicit = true) {
  const pos = textBeforeCursor.length;
  return {
    pos,
    explicit,
    state: { doc: { toString: () => textBeforeCursor, sliceString: (from: number, to: number) => textBeforeCursor.slice(from, to) } },
    matchBefore(regexp: RegExp) {
      const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const line = textBeforeCursor.slice(lineStart);
      const anchored = new RegExp(`(?:${regexp.source})$`, regexp.flags.replace('g', ''));
      const match = anchored.exec(line);
      if (!match) return null;
      return { from: pos - match[0].length, to: pos, text: match[0] };
    },
  };
}

function legacyLabels(textBeforeCursor: string): string[] | null {
  const result = svgPathCompletions(contextFor(textBeforeCursor) as never);
  return result ? result.options.map((o) => o.label) : null;
}

describe('legacy completion source defers on member access', () => {
  it.each([
    ['a range value', 'let doubled = (1..100).'],
    ['a range value with a typed prefix', 'let doubled = (1..100).ma'],
    ['a call result', "let bg = layer('main')."],
    ['an indexed element', 'let first = points[0].'],
    ['an array literal', 'let count = [1, 2].'],
  ])('%s: returns null so the shared engine owns the popup', (_label, text) => {
    expect(legacyLabels(text)).toBeNull();
  });

  it('still offers its word completions outside member access', () => {
    const labels = legacyLabels('let total = ca');
    expect(labels).not.toBeNull();
    expect(labels).toContain('calc');
  });

  it('a decimal point is not member access', () => {
    // `1.` ends in a digit, not `)` or `]` — the guard must not swallow it.
    expect(() => legacyLabels('M 1.')).not.toThrow();
  });
});
