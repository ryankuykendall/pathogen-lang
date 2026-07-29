// Shared scope-analysis memo for editor decoration extensions.
//
// Both the style-value recolor extension (cm-style-ref-recolor.ts) and the
// color-chip extension (cm-color-picker.ts) need "which identifier ranges in
// style-block values resolve to user declarations" on every doc change.
// analyzeScopes is a full lenient parse + walk — running it once per keystroke
// is fine, twice is waste. This module memoizes the last (source → ranges)
// pair; ViewPlugin updates for the same document hit the cache.

import { perfSpan } from './perf-marks.js';

/** Absolute document offset range. */
export interface OffsetRange {
  from: number;
  to: number;
}

interface RangeLike {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface StyleRefLike {
  range: RangeLike;
  declaration: unknown;
  inStyleValue?: boolean;
}

/**
 * Pure conversion: resolved style-value references → document offset ranges.
 * (Separated from the window.PathogenLang wrapper so tests can drive it with
 * a real ScopeInfo + StringTextDocument.)
 */
export function resolvedStyleRefOffsetRanges(
  scopeInfo: { references: StyleRefLike[] },
  doc: { offsetAt(position: { line: number; character: number }): number },
): OffsetRange[] {
  const out: OffsetRange[] = [];
  for (const ref of scopeInfo.references) {
    if (!ref.inStyleValue || !ref.declaration) continue;
    out.push({ from: doc.offsetAt(ref.range.start), to: doc.offsetAt(ref.range.end) });
  }
  return out;
}

let cachedSource: string | null = null;
let cachedRanges: OffsetRange[] = [];

/**
 * Offset ranges of style-value identifiers that resolve to user declarations,
 * memoized on the exact source string. Returns [] (uncached) while the
 * language bundle hasn't loaded yet.
 */
export function getStyleRefRanges(source: string): OffsetRange[] {
  if (source === cachedSource) return cachedRanges;
  // Cheap guard: no style block (or template) opener → nothing to resolve.
  if (!source.includes('${')) {
    cachedSource = source;
    cachedRanges = [];
    return cachedRanges;
  }
  const lang = window.PathogenLang;
  if (!lang?.analyzeScopes || !lang?.StringTextDocument) return [];
  return perfSpan('analyze-scopes', () => {
    const doc = new lang.StringTextDocument(source);
    const info = lang.analyzeScopes(doc);
    cachedSource = source;
    cachedRanges = resolvedStyleRefOffsetRanges(info as { references: StyleRefLike[] }, doc);
    return cachedRanges;
  });
}
