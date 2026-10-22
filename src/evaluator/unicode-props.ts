/**
 * Unicode lookups behind the Font namespace and the glyph `script` / `block`
 * / `category` properties (docs/fonts.md): which script, block and category a
 * character belongs to, and name resolution for selections.
 *
 * Scripts and blocks come from the generated tables
 * (unicode-data.generated.ts — `npm run generate:unicode-data`); categories
 * come straight from the JS engine's Unicode general-category data. Pure and
 * synchronous: shared by every surface.
 */

import { BLOCKS, SCRIPT_NAMES, SCRIPT_RANGES } from './unicode-data.generated';

export const CHAR_CATEGORIES = [
  'letter',
  'mark',
  'digit',
  'number',
  'punctuation',
  'symbol',
  'whitespace',
  'other',
] as const;
export type CharCategory = (typeof CHAR_CATEGORIES)[number];

// White_Space characters: separators plus tab, line feed, vertical tab,
// form feed, carriage return and next-line. (Not \s, which also matches
// U+FEFF, a formatting character.)
const WHITESPACE = /^[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u0085]$/u;
const LETTER = /^\p{L}$/u;
const MARK = /^\p{M}$/u;
const DIGIT = /^\p{Nd}$/u;
const NUMBER = /^\p{N}$/u;
const PUNCTUATION = /^\p{P}$/u;
const SYMBOL = /^\p{S}$/u;

/** One category per character, from its Unicode general category. */
export function categoryOf(char: string): CharCategory {
  if (WHITESPACE.test(char)) return 'whitespace';
  if (LETTER.test(char)) return 'letter';
  if (MARK.test(char)) return 'mark';
  if (DIGIT.test(char)) return 'digit';
  if (NUMBER.test(char)) return 'number';
  if (PUNCTUATION.test(char)) return 'punctuation';
  if (SYMBOL.test(char)) return 'symbol';
  return 'other';
}

/** Script id of a code point (index into SCRIPT_NAMES), or -1 for Unknown. */
function scriptIdOf(cp: number): number {
  let lo = 0;
  let hi = SCRIPT_RANGES.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = SCRIPT_RANGES[mid * 3];
    const end = SCRIPT_RANGES[mid * 3 + 1];
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return SCRIPT_RANGES[mid * 3 + 2];
  }
  return -1;
}

/** The writing system of a code point, e.g. "Latin", "Han", "Common". */
export function scriptOf(cp: number): string {
  const id = scriptIdOf(cp);
  return id < 0 ? 'Unknown' : SCRIPT_NAMES[id];
}

/** The Unicode block of a code point, e.g. "Latin-1 Supplement". */
export function blockOf(cp: number): string {
  const block = blockEntryOf(cp);
  return block ? block[2] : 'No Block';
}

function blockEntryOf(cp: number): readonly [number, number, string] | null {
  let lo = 0;
  let hi = BLOCKS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = BLOCKS[mid];
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return BLOCKS[mid];
  }
  return null;
}

/** [start, end, name] of the block holding `cp`, for Font.info's `blocks`. */
export function blockRangeOf(cp: number): { name: string; start: number; end: number } | null {
  const block = blockEntryOf(cp);
  return block ? { name: block[2], start: block[0], end: block[1] } : null;
}

// ─── Name resolution (selections) ─────────────────────────────────────────

/** Case-, space-, underscore- and hyphen-insensitive key. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '');
}

const SCRIPT_BY_KEY = new Map<string, number>(SCRIPT_NAMES.map((n, i) => [normalizeName(n), i]));
const BLOCK_BY_KEY = new Map<string, readonly [number, number, string]>(BLOCKS.map((b) => [normalizeName(b[2]), b]));
const CATEGORY_BY_KEY = new Map<string, CharCategory>(CHAR_CATEGORIES.map((c) => [c, c]));

export function findCategory(name: string): CharCategory | null {
  return CATEGORY_BY_KEY.get(normalizeName(name)) ?? null;
}

export function findScript(name: string): { name: string; ranges: [number, number][] } | null {
  const id = SCRIPT_BY_KEY.get(normalizeName(name));
  if (id === undefined) return null;
  const ranges: [number, number][] = [];
  for (let i = 0; i < SCRIPT_RANGES.length; i += 3) {
    if (SCRIPT_RANGES[i + 2] === id) ranges.push([SCRIPT_RANGES[i], SCRIPT_RANGES[i + 1]]);
  }
  return { name: SCRIPT_NAMES[id], ranges };
}

export function findBlock(name: string): { name: string; start: number; end: number } | null {
  const block = BLOCK_BY_KEY.get(normalizeName(name));
  return block ? { name: block[2], start: block[0], end: block[1] } : null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Up to `limit` known script / block / category names closest to `name`. */
export function suggestNames(name: string, limit = 3): string[] {
  const key = normalizeName(name);
  const candidates = [...CHAR_CATEGORIES, ...SCRIPT_NAMES, ...BLOCKS.map((b) => b[2])];
  return [...new Set(candidates)]
    .map((c) => ({ c, d: editDistance(key, normalizeName(c)) }))
    .filter(({ d, c }) => d <= Math.max(2, Math.floor(normalizeName(c).length / 3)))
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, limit)
    .map(({ c }) => c);
}
