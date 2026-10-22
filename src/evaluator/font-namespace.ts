/**
 * The Font namespace (docs/fonts.md): Font.info(styles),
 * Font.characters(styles, selection?) and Font.glyphs(styles, selection?).
 *
 * Everything is read from the loaded font file(s) plus the Unicode tables in
 * unicode-props.ts, so the CLI (one complete file) and the playground (Google
 * Fonts unicode-range slices) agree once the playground has every slice the
 * call needs. To get them there, a call on a sliced family records what it
 * looked at in `evalState.fontCoverageRequests`; the playground host fetches
 * the slices covering those ranges and recompiles (playground/services/
 * compiler-worker.ts), the same loop that fills in missing glyphs.
 */

import { getFontCoverage, getFontIdentity } from './font-provider';
import {
  blockRangeOf,
  categoryOf,
  CHAR_CATEGORIES,
  findBlock,
  findCategory,
  findScript,
  scriptOf,
  suggestNames,
} from './unicode-props';

import type { ArrayValue, BooleanValue, EvaluationState, ObjectValue, StyleBlockValue, Value } from './types';
import type { CharCategory } from './unicode-props';

/** One call returning more glyphs than this logs a warning (docs/fonts.md). */
export const FONT_GLYPHS_WARN_LIMIT = 5000;

const MAX_CODE_POINT = 0x10ffff;

/** Code-point ranges a call needs, or null for "the whole font". */
type Ranges = [number, number][] | null;

interface Selection {
  test: (cp: number, char: string) => boolean;
  ranges: Ranges;
}

export interface FontNamespaceDeps {
  evalState: EvaluationState | undefined;
  /** Builds glyph PathBlocks exactly as PathBlock.fromGlyph does. */
  makeGlyphs: (chars: string[], family: string, weight: number, fontSize: number) => Value[];
  /** Emit a compiler warning at the call site. */
  warnLargeSelection: (message: string) => void;
  /** Glyph count above which Font.glyphs warns (default FONT_GLYPHS_WARN_LIMIT; tests lower it). */
  warnLimit?: number;
}

function boolVal(v: boolean): BooleanValue {
  return { type: 'BooleanValue', value: v ? 1 : 0 };
}

function obj(entries: [string, Value][]): ObjectValue {
  return { type: 'ObjectValue', properties: new Map(entries) };
}

function arr(elements: Value[]): ArrayValue {
  return { type: 'ArrayValue', elements };
}

function isStyleBlock(v: Value): v is StyleBlockValue {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'StyleBlockValue';
}

function intersectRanges(a: Ranges, b: Ranges): Ranges {
  if (a === null) return b;
  if (b === null) return a;
  const out: [number, number][] = [];
  for (const [alo, ahi] of a) {
    for (const [blo, bhi] of b) {
      const lo = Math.max(alo, blo);
      const hi = Math.min(ahi, bhi);
      if (lo <= hi) out.push([lo, hi]);
    }
  }
  return out;
}

function rangesFromCodePoints(cps: number[]): [number, number][] {
  const sorted = [...new Set(cps)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const cp of sorted) {
    const last = out[out.length - 1];
    if (last && cp === last[1] + 1) last[1] = cp;
    else out.push([cp, cp]);
  }
  return out;
}

function unknownName(fn: string, name: string): Error {
  const suggestions = suggestNames(name);
  const hint = suggestions.length ? ` Did you mean ${suggestions.map((s) => `'${s}'`).join(' or ')}?` : '';
  return new Error(`${fn}: no script, block or category named '${name}'.${hint}`);
}

function codePointsSelection(fn: string, value: Value): Selection {
  if (!(typeof value === 'object' && value !== null && 'type' in value && value.type === 'ArrayValue')) {
    throw new Error(`${fn}: codePoints must be an array of whole numbers, such as (48..57)`);
  }
  const cps: number[] = [];
  for (const el of value.elements) {
    if (typeof el !== 'number' || !Number.isInteger(el) || el < 0 || el > MAX_CODE_POINT) {
      throw new Error(`${fn}: codePoints must be whole numbers from 0 to ${MAX_CODE_POINT}`);
    }
    cps.push(el);
  }
  const set = new Set(cps);
  return { test: (cp) => set.has(cp), ranges: rangesFromCodePoints(cps) };
}

function categorySelection(category: CharCategory): Selection {
  return { test: (_cp, char) => categoryOf(char) === category, ranges: null };
}

/** A bare string: category, then script, then block (docs/fonts.md "Selections"). */
function nameSelection(fn: string, name: string): Selection {
  const category = findCategory(name);
  if (category) return categorySelection(category);
  const script = findScript(name);
  if (script) return { test: (cp) => scriptOf(cp) === script.name, ranges: script.ranges };
  const block = findBlock(name);
  if (block) return { test: (cp) => cp >= block.start && cp <= block.end, ranges: [[block.start, block.end]] };
  throw unknownName(fn, name);
}

const SELECTION_KEYS = ['script', 'block', 'category', 'codePoints'];

export function parseSelection(fn: string, value: Value | undefined): Selection {
  if (value === undefined) return { test: () => true, ranges: null };
  if (typeof value === 'string') return nameSelection(fn, value);
  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'ArrayValue') {
    return codePointsSelection(fn, value);
  }
  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'ObjectValue') {
    if (value.properties.size === 0) {
      throw new Error(`${fn}: a selection object needs at least one of script, block, category or codePoints`);
    }
    const parts: Selection[] = [];
    for (const [key, v] of value.properties) {
      if (!SELECTION_KEYS.includes(key)) {
        throw new Error(`${fn}: selection keys are script, block, category and codePoints — got '${key}'`);
      }
      if (key === 'codePoints') {
        parts.push(codePointsSelection(fn, v));
        continue;
      }
      if (typeof v !== 'string') throw new Error(`${fn}: selection '${key}' must be a name (a string)`);
      if (key === 'category') {
        const category = findCategory(v);
        if (!category) {
          throw new Error(`${fn}: no category named '${v}'. Categories are ${CHAR_CATEGORIES.join(', ')}`);
        }
        parts.push(categorySelection(category));
      } else if (key === 'script') {
        const script = findScript(v);
        if (!script) throw unknownName(fn, v);
        parts.push({ test: (cp) => scriptOf(cp) === script.name, ranges: script.ranges });
      } else {
        const block = findBlock(v);
        if (!block) throw unknownName(fn, v);
        parts.push({ test: (cp) => cp >= block.start && cp <= block.end, ranges: [[block.start, block.end]] });
      }
    }
    return {
      test: (cp, char) => parts.every((p) => p.test(cp, char)),
      ranges: parts.reduce<Ranges>((acc, p) => intersectRanges(acc, p.ranges), null),
    };
  }
  throw new Error(
    `${fn}: selection must be a name, an array of code points, or an object such as { script: "Cyrillic" }`,
  );
}

interface ResolvedFont {
  family: string;
  weight: number;
  fontSize: number;
}

function resolveStyles(fn: string, styles: Value | undefined): ResolvedFont {
  if (styles === undefined || !isStyleBlock(styles)) {
    throw new Error(`${fn}: first argument must be a style block, e.g. #{ font-family: Inter; }`);
  }
  const p = styles.properties;
  const family = p['font-family']
    ?.split(',')[0]
    ?.trim()
    ?.replace(/^['"]|['"]$/g, '');
  if (!family) throw new Error(`${fn} requires font-family in the style block`);
  return {
    family,
    weight: parseInt(p['font-weight'] ?? '400', 10) || 400,
    fontSize: parseFloat(p['font-size'] ?? '16') || 16,
  };
}

/** Tell the playground host which slices this call needs (no-op for whole files). */
function recordCoverageRequest(
  evalState: EvaluationState | undefined,
  family: string,
  weight: number,
  ranges: Ranges,
): void {
  if (!evalState) return;
  if (!evalState.fontCoverageRequests) evalState.fontCoverageRequests = new Map();
  const key = `${family}:${weight}`;
  const existing = evalState.fontCoverageRequests.get(key);
  if (existing === null) return; // already "everything"
  if (ranges === null) {
    evalState.fontCoverageRequests.set(key, null);
    return;
  }
  evalState.fontCoverageRequests.set(key, mergeRanges([...(existing ?? []), ...ranges]));
}

/** Sort and coalesce overlapping or touching ranges (a loop of Font calls stays one short list). */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/**
 * getFontCoverage scans the whole cmap; a program can call Font.* in a loop,
 * so keep one result per family+weight for the compile.
 */
const coverageCache = new WeakMap<EvaluationState, Map<string, ReturnType<typeof getFontCoverage>>>();
function cachedCoverage(
  evalState: EvaluationState,
  registry: NonNullable<EvaluationState['fontRegistry']>,
  family: string,
  weight: number,
) {
  let perState = coverageCache.get(evalState);
  if (!perState) {
    perState = new Map();
    coverageCache.set(evalState, perState);
  }
  const key = `${family}:${weight}`;
  if (!perState.has(key)) perState.set(key, getFontCoverage(registry, family, weight));
  return perState.get(key)!;
}

function loadCoverage(fn: string, deps: FontNamespaceDeps, font: ResolvedFont, ranges: Ranges) {
  const registry = deps.evalState?.fontRegistry;
  if (!registry) {
    // No fonts at all: the editor's fontless diagnostics pass (and the VS Code
    // preview, which loads none yet). Same wording as fromGlyph, so
    // getDiagnostics recognises it as a font-availability error, not the user's.
    throw new Error(
      `${fn}: no fonts were loaded. Add @font "${font.family}"; — if you already have, look for a font-loading error above.`,
    );
  }
  const coverage = cachedCoverage(deps.evalState!, registry, font.family, font.weight);
  if (!coverage) {
    throw new Error(`${fn}: font '${font.family}' is not loaded. Add @font "${font.family}";`);
  }
  // Keyed by the weight the family is registered at (what the host indexed
  // its slices under), not the style's font-weight — @font "X" 700 with a
  // style that omits font-weight must still ask for the 700 slices.
  if (coverage.isSplit) recordCoverageRequest(deps.evalState, font.family, coverage.primary.weight, ranges);
  return coverage;
}

function selectedCharacters(
  fn: string,
  deps: FontNamespaceDeps,
  args: Value[],
): { font: ResolvedFont; chars: string[] } {
  if (args.length < 1 || args.length > 2) throw new Error(`${fn} expects 1 or 2 arguments (styles, selection?)`);
  const font = resolveStyles(fn, args[0]);
  const selection = parseSelection(fn, args[1]);
  const coverage = loadCoverage(fn, deps, font, selection.ranges);
  const chars: string[] = [];
  for (const cp of coverage.codePoints) {
    const char = String.fromCodePoint(cp);
    if (selection.test(cp, char)) chars.push(char);
  }
  return { font, chars };
}

export function fontCharacters(deps: FontNamespaceDeps, args: Value[]): string {
  return selectedCharacters('Font.characters()', deps, args).chars.join('');
}

export function fontGlyphs(deps: FontNamespaceDeps, args: Value[]): ArrayValue {
  const fn = 'Font.glyphs()';
  const { font, chars } = selectedCharacters(fn, deps, args);
  if (chars.length > (deps.warnLimit ?? FONT_GLYPHS_WARN_LIMIT)) {
    deps.warnLargeSelection(
      `${fn} returned ${chars.length.toLocaleString('en-US')} glyphs from '${font.family}' — pass a selection to draw fewer`,
    );
  }
  return arr(deps.makeGlyphs(chars, font.family, font.weight, font.fontSize));
}

export function fontInfo(deps: FontNamespaceDeps, args: Value[]): ObjectValue {
  const fn = 'Font.info()';
  if (args.length !== 1) throw new Error(`${fn} expects 1 argument (styles)`);
  const font = resolveStyles(fn, args[0]);
  const coverage = loadCoverage(fn, deps, font, null);
  const id = getFontIdentity(coverage.primary, font.fontSize);

  const scriptCounts = new Map<string, number>();
  const blockCounts = new Map<string, { name: string; start: number; end: number; count: number }>();
  const categoryCounts = new Map<CharCategory, number>();
  for (const cp of coverage.codePoints) {
    const char = String.fromCodePoint(cp);
    const script = scriptOf(cp);
    scriptCounts.set(script, (scriptCounts.get(script) ?? 0) + 1);
    const block = blockRangeOf(cp);
    if (block) {
      const entry = blockCounts.get(block.name) ?? { ...block, count: 0 };
      entry.count++;
      blockCounts.set(block.name, entry);
    }
    const category = categoryOf(char);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const scripts = [...scriptCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) =>
      obj([
        ['name', name],
        ['count', count],
      ]),
    );
  const blocks = [...blockCounts.values()]
    .sort((a, b) => a.start - b.start)
    .map((b) =>
      obj([
        ['name', b.name],
        ['count', b.count],
        ['size', b.end - b.start + 1],
        ['start', b.start],
        ['end', b.end],
      ]),
    );
  const categories = CHAR_CATEGORIES.filter((c) => categoryCounts.has(c)).map((c) =>
    obj([
      ['name', c],
      ['count', categoryCounts.get(c)!],
    ]),
  );

  return obj([
    ['family', id.family],
    ['style', id.style],
    ['fullName', id.fullName],
    ['version', id.version],
    ['designer', id.designer],
    ['designerUrl', id.designerUrl],
    ['license', id.license],
    ['licenseUrl', id.licenseUrl],
    ['weight', id.weight],
    ['isItalic', boolVal(id.isItalic)],
    ['isMonospace', boolVal(id.isMonospace)],
    ['unitsPerEm', id.unitsPerEm],
    ['ascender', id.ascender],
    ['descender', id.descender],
    ['lineGap', id.lineGap],
    ['capHeight', id.capHeight],
    ['xHeight', id.xHeight],
    ['glyphCount', coverage.glyphCount],
    ['characterCount', coverage.codePoints.length],
    ['unmappedCount', coverage.unmappedCount],
    ['scripts', arr(scripts)],
    ['blocks', arr(blocks)],
    ['categories', arr(categories)],
  ]);
}

/** CompileResult form of the recorded requests, for the playground host. */
export function buildFontCoverageRequests(
  requests: Map<string, [number, number][] | null> | undefined,
): { family: string; weight: number; ranges: [number, number][] | null }[] {
  if (!requests) return [];
  return [...requests].map(([key, ranges]) => {
    const sep = key.lastIndexOf(':');
    return { family: key.slice(0, sep), weight: parseInt(key.slice(sep + 1), 10) || 400, ranges };
  });
}
