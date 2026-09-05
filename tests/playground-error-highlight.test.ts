// The editor's error/warning highlighter must never build one decoration per
// warning: a program that fillets every glyph contour emits thousands of
// warnings at ONE call site, and CodeMirror nests a <span> per identical mark
// and recurses through them — that overflowed the call stack in production on
// 2026-09-05 ("Maximum call stack size exceeded" with a correct render and no
// layers). Positions are deduplicated and capped before decorations exist.

import { describe, expect, it } from 'vitest';

import { dedupeHighlightPositions, MAX_HIGHLIGHT_POSITIONS } from '../playground/utils/cm-error-highlight.js';

import type { ErrorPosition } from '../playground/utils/cm-error-highlight.js';

describe('dedupeHighlightPositions', () => {
  it('collapses thousands of warnings at one call site to a single position', () => {
    const many: ErrorPosition[] = Array.from({ length: 5000 }, () => ({ line: 76, column: 12, severity: 'warning' }));
    expect(dedupeHighlightPositions(many)).toEqual([{ line: 76, column: 12, severity: 'warning' }]);
  });

  it('keeps distinct positions in first-seen order and treats severity as part of the key', () => {
    const positions: ErrorPosition[] = [
      { line: 3, column: 6, severity: 'warning' },
      { line: 1, column: 1 },
      { line: 3, column: 6, severity: 'warning' },
      { line: 3, column: 6 },
      { line: 1, column: 1, severity: 'error' },
    ];
    expect(dedupeHighlightPositions(positions)).toEqual([
      { line: 3, column: 6, severity: 'warning' },
      { line: 1, column: 1 },
      { line: 3, column: 6 },
    ]);
  });

  it('caps the number of distinct positions', () => {
    const spread: ErrorPosition[] = Array.from({ length: MAX_HIGHLIGHT_POSITIONS + 50 }, (_, i) => ({
      line: i + 1,
      column: 1,
    }));
    const out = dedupeHighlightPositions(spread);
    expect(out).toHaveLength(MAX_HIGHLIGHT_POSITIONS);
    expect(out[0]).toEqual({ line: 1, column: 1 });
    expect(out[out.length - 1]).toEqual({ line: MAX_HIGHLIGHT_POSITIONS, column: 1 });
    expect(dedupeHighlightPositions(spread, 3)).toHaveLength(3);
  });

  it('passes an empty list through', () => {
    expect(dedupeHighlightPositions([])).toEqual([]);
  });
});
