/**
 * Font provider — opentype.js wrapper for precise font metrics and glyph extraction.
 *
 * Provides:
 * - FontRegistry management (create, add, get)
 * - Kerning-aware advance width calculation
 * - Vertical metrics (ascender, descender, lineGap)
 * - Glyph outline → PathBlockCommand[] conversion
 *
 * All functions are synchronous. Font loading (async I/O) is handled by the
 * host environment (CLI, playground, tests) before compilation.
 */

import { splitSubpathCommands } from './subpaths';

import type { FontData, FontRegistry, PathBlockCommand } from './types';
import type { Point } from './context';

// opentype.js lazy loader — works across vitest, tsx (ESM), and tsup bundle.
// Uses dynamic import() with a synchronous cache. The first call to
// ensureOpentype() must be awaited; subsequent calls to getOpentype() are sync.
let _opentype: typeof import('opentype.js') | null = null;

export async function ensureOpentype(): Promise<void> {
  if (!_opentype) {
    _opentype = await import('opentype.js');
    // Handle CJS default export wrapping
    if (_opentype && typeof (_opentype as any).default?.parse === 'function') {
      _opentype = (_opentype as any).default;
    }
  }
}

function getOpentype(): typeof import('opentype.js') {
  if (!_opentype) {
    // Fallback for environments where ensureOpentype() wasn't called first
    // (e.g., vitest which handles ESM/CJS interop natively)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _opentype = require('opentype.js');
    } catch {
      throw new Error(
        'opentype.js not loaded. Call ensureOpentype() before using font features.',
      );
    }
  }
  return _opentype!;
}

// ---------------------------------------------------------------------------
// Registry management
// ---------------------------------------------------------------------------

/**
 * Create an empty FontRegistry.
 */
export function createFontRegistry(): FontRegistry {
  const fonts = new Map<string, FontData[]>();

  return {
    fonts,
    get(family: string, weight = 400, style = 'normal'): FontData | null {
      return getFont({ fonts, get: this.get }, family, weight, style);
    },
  };
}

/**
 * Add a font to the registry. Lazily parsed on first use.
 */
export function addFont(
  registry: FontRegistry,
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  buffer: ArrayBuffer,
  unicodeRanges?: Array<[number, number]>,
  partial?: boolean,
): void {
  const fontData: FontData = { family, weight, style, buffer };
  if (unicodeRanges) fontData.unicodeRanges = unicodeRanges;
  if (partial) fontData.partial = true;
  const existing = registry.fonts.get(family);
  if (existing) {
    existing.push(fontData);
  } else {
    registry.fonts.set(family, [fontData]);
  }
}

/**
 * All variants of a family ordered by match quality: exact weight+style
 * matches first (insertion order — several subset slices can share one
 * weight), then same-style by weight distance, then the rest by weight
 * distance. Stable, so ties keep registration order.
 */
export function getFontVariants(
  registry: FontRegistry,
  family: string,
  weight = 400,
  style = 'normal',
): FontData[] {
  const variants = registry.fonts.get(family);
  if (!variants || variants.length === 0) return [];

  const exact: FontData[] = [];
  const sameStyle: FontData[] = [];
  const rest: FontData[] = [];
  for (const v of variants) {
    if (v.weight === weight && v.style === style) exact.push(v);
    else if (v.style === style) sameStyle.push(v);
    else rest.push(v);
  }
  const byDistance = (a: FontData, b: FontData) =>
    Math.abs(a.weight - weight) - Math.abs(b.weight - weight);
  sameStyle.sort(byDistance);
  rest.sort(byDistance);
  return [...exact, ...sameStyle, ...rest];
}

/**
 * Best-match font lookup: exact weight → nearest weight.
 */
export function getFont(
  registry: FontRegistry,
  family: string,
  weight = 400,
  style = 'normal',
): FontData | null {
  return getFontVariants(registry, family, weight, style)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Lazy parsing
// ---------------------------------------------------------------------------

/**
 * Get or lazily parse the opentype.js Font object from a FontData.
 */
function getParsedFont(fontData: FontData): import('opentype.js').Font {
  if (!fontData._parsed) {
    const ot = getOpentype();
    fontData._parsed = ot.parse(fontData.buffer);
  }
  return fontData._parsed as import('opentype.js').Font;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Get kerning-aware advance width for a text string.
 */
export function getAdvanceWidth(
  fontData: FontData,
  text: string,
  fontSize: number,
): number {
  const font = getParsedFont(fontData);
  return font.getAdvanceWidth(text, fontSize);
}

/**
 * Get vertical metrics scaled to a given font size.
 */
export function getVerticalMetrics(
  fontData: FontData,
  fontSize: number,
): { ascender: number; descender: number; lineGap: number; lineHeight: number } {
  const font = getParsedFont(fontData);
  const scale = fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = font.descender * scale; // negative
  const lineGap = (font.tables.os2?.sTypoLineGap ?? 0) * scale;
  return {
    ascender,
    descender,
    lineGap,
    lineHeight: ascender - descender + lineGap,
  };
}

// ---------------------------------------------------------------------------
// Glyph → PathBlockCommand[] conversion
// ---------------------------------------------------------------------------

/**
 * Convert a single glyph's outline to PathBlockCommand[].
 * Returns commands in relative coordinates, normalized to (0,0) origin.
 * Also returns the scaled advance width for positioning.
 */
export function glyphToPathBlockCommands(
  fontData: FontData,
  char: string,
  fontSize: number,
): { commands: PathBlockCommand[]; advanceWidth: number } {
  const font = getParsedFont(fontData);
  const glyph = font.charToGlyph(char);
  const scale = fontSize / font.unitsPerEm;
  const advanceWidth = (glyph.advanceWidth ?? 0) * scale;

  // Get the glyph path at origin (0, 0) with the given font size
  const glyphPath = glyph.getPath(0, 0, fontSize);
  const opentypeCmds = glyphPath.commands;

  if (opentypeCmds.length === 0) {
    return { commands: [], advanceWidth };
  }

  // Convert opentype commands to PathBlockCommands
  // opentype.js gives absolute coordinates, so we convert to relative
  const pbCommands: PathBlockCommand[] = [];
  let cursorX = 0;
  let cursorY = 0;

  for (const cmd of opentypeCmds) {
    const start: Point = { x: cursorX, y: cursorY };

    switch (cmd.type) {
      case 'M': {
        const dx = cmd.x - cursorX;
        const dy = cmd.y - cursorY;
        pbCommands.push({
          command: 'm',
          args: [dx, dy],
          start,
          end: { x: cmd.x, y: cmd.y },
        });
        cursorX = cmd.x;
        cursorY = cmd.y;
        break;
      }
      case 'L': {
        const dx = cmd.x - cursorX;
        const dy = cmd.y - cursorY;
        pbCommands.push({
          command: 'l',
          args: [dx, dy],
          start,
          end: { x: cmd.x, y: cmd.y },
        });
        cursorX = cmd.x;
        cursorY = cmd.y;
        break;
      }
      case 'C': {
        const dx1 = cmd.x1 - cursorX;
        const dy1 = cmd.y1 - cursorY;
        const dx2 = cmd.x2 - cursorX;
        const dy2 = cmd.y2 - cursorY;
        const dx = cmd.x - cursorX;
        const dy = cmd.y - cursorY;
        pbCommands.push({
          command: 'c',
          args: [dx1, dy1, dx2, dy2, dx, dy],
          start,
          end: { x: cmd.x, y: cmd.y },
        });
        cursorX = cmd.x;
        cursorY = cmd.y;
        break;
      }
      case 'Q': {
        const dx1 = cmd.x1 - cursorX;
        const dy1 = cmd.y1 - cursorY;
        const dx = cmd.x - cursorX;
        const dy = cmd.y - cursorY;
        pbCommands.push({
          command: 'q',
          args: [dx1, dy1, dx, dy],
          start,
          end: { x: cmd.x, y: cmd.y },
        });
        cursorX = cmd.x;
        cursorY = cmd.y;
        break;
      }
      case 'Z': {
        pbCommands.push({
          command: 'z',
          args: [],
          start,
          end: start, // z returns to subpath start, but we track that via normalization
        });
        break;
      }
    }
  }

  return { commands: pbCommands, advanceWidth };
}

/**
 * Whether a variant's cmap actually maps this character. opentype.js
 * `hasChar` is unusable here: the cmap lookup returns `|| 0` and hasChar
 * tests `!== null`, so it is true for every input. Glyph index 0 is .notdef
 * by the OpenType spec, so `> 0` is the real coverage test.
 */
function variantCoversChar(fontData: FontData, char: string): boolean {
  return getParsedFont(fontData).charToGlyphIndex(char) > 0;
}

export interface GlyphLookupResult {
  commands: PathBlockCommand[];
  advanceWidth: number;
  /** True when no registered variant has a glyph for this character (rendered as .notdef). */
  missing: boolean;
  fontData: FontData;
}

/**
 * Coverage-aware glyph lookup across all registered variants of a family.
 *
 * Google Fonts serves one buffer per unicode-range subset, so a single
 * family+weight can have many buffers each covering a different script.
 * Variants that declare unicodeRanges are consulted first (cheap gate that
 * avoids parsing buffers that can't cover the char), then range-less
 * variants; the cmap is always the final arbiter. If nothing covers the
 * char, the best-match variant renders its .notdef and `missing` is set —
 * except for whitespace, which many fonts legitimately leave unmapped.
 *
 * Returns null when the family has no variants at all (callers surface
 * their own "font not found" errors).
 */
export function lookupGlyph(
  registry: FontRegistry,
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  char: string,
  fontSize: number,
): GlyphLookupResult | null {
  const variants = getFontVariants(registry, family, weight, style);
  if (variants.length === 0) return null;

  const codePoint = char.codePointAt(0) ?? 0;

  for (const v of variants) {
    if (!v.unicodeRanges) continue;
    const inRange = v.unicodeRanges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
    if (inRange && variantCoversChar(v, char)) {
      return { ...glyphToPathBlockCommands(v, char, fontSize), missing: false, fontData: v };
    }
  }

  for (const v of variants) {
    if (v.unicodeRanges) continue;
    if (variantCoversChar(v, char)) {
      return { ...glyphToPathBlockCommands(v, char, fontSize), missing: false, fontData: v };
    }
  }

  const fallback = variants[0];
  const missing = !/\s/.test(char);
  return { ...glyphToPathBlockCommands(fallback, char, fontSize), missing, fontData: fallback };
}

/**
 * Record a character that no variant of `family` could render, keyed
 * "family:weight" on the shared evaluation state (lazily created — most
 * programs never miss).
 */
export function recordMissingGlyph(
  state: { missingGlyphs?: Map<string, Set<string>> },
  family: string,
  weight: number,
  char: string,
): void {
  if (!state.missingGlyphs) state.missingGlyphs = new Map();
  const key = `${family}:${weight}`;
  let chars = state.missingGlyphs.get(key);
  if (!chars) {
    chars = new Set();
    state.missingGlyphs.set(key, chars);
  }
  chars.add(char);
}

const MISSING_GLYPH_WARN_LIMIT = 20;

/**
 * Convert the recorded misses into the CompileResult report plus one [warn]
 * log line per family:weight group. Shared by the evaluator's result
 * assembly so the wording can't drift.
 */
export function buildMissingGlyphReports(
  missingGlyphs: Map<string, Set<string>> | undefined,
): { reports: Array<{ family: string; weight: number; chars: string[] }>; warnings: string[] } {
  const reports: Array<{ family: string; weight: number; chars: string[] }> = [];
  const warnings: string[] = [];
  if (!missingGlyphs) return { reports, warnings };

  for (const [key, charSet] of missingGlyphs) {
    const sep = key.lastIndexOf(':');
    const family = key.slice(0, sep);
    const weight = parseInt(key.slice(sep + 1), 10) || 400;
    const chars = Array.from(charSet);
    reports.push({ family, weight, chars });

    const shown = chars.slice(0, MISSING_GLYPH_WARN_LIMIT).join(', ');
    const more = chars.length > MISSING_GLYPH_WARN_LIMIT
      ? ` … and ${chars.length - MISSING_GLYPH_WARN_LIMIT} more`
      : '';
    warnings.push(
      `[warn] Font '${family}' (weight ${weight}) has no loaded glyph for: ${shown}${more} — rendered as placeholder boxes`,
    );
  }
  return { reports, warnings };
}

/**
 * Get all contour command groups from a glyph's commands.
 * Each contour is a sequence of commands starting with 'm' and ending with 'z'.
 */
export function splitContours(commands: PathBlockCommand[]): PathBlockCommand[][] {
  // One rule for contours, subpaths, and the `subpath` query noun: the SVG
  // subpath rule in subpaths.ts. Glyph outlines always read `m … z`, so this
  // matches the former z-split exactly for fonts.
  return splitSubpathCommands(commands);
}

// ---------------------------------------------------------------------------
// Font inventory (Font namespace — docs/fonts.md)
// ---------------------------------------------------------------------------

export interface FontCoverage {
  /** The variants that make up this family+weight+style (one, or many slices). */
  variants: FontData[];
  /** The variant names and metrics are read from. */
  primary: FontData;
  /** Every mapped code point, ascending, de-duplicated across slices. */
  codePoints: number[];
  /** Glyphs no code point maps to (alternates, ligatures, contextual forms). */
  unmappedCount: number;
  /** All glyphs: .notdef + mapped glyphs + unmapped glyphs. */
  glyphCount: number;
  /** True when the family arrived (or is still arriving) as unicode-range slices (playground Google Fonts). */
  isSplit: boolean;
}

/**
 * The characters a family+weight can draw, read from the cmap of every
 * variant at the best-matching weight and style. Slices are gated by their
 * declared unicodeRanges, like lookupGlyph. For sliced families the glyph
 * counts are summed per slice (a glyph shared by two slices counts twice);
 * a single complete file gives exact counts.
 */
export function getFontCoverage(
  registry: FontRegistry,
  family: string,
  weight = 400,
  style: 'normal' | 'italic' = 'normal',
): FontCoverage | null {
  const ordered = getFontVariants(registry, family, weight, style);
  if (ordered.length === 0) return null;
  const best = ordered[0];
  const variants = ordered.filter((v) => v.weight === best.weight && v.style === best.style);
  const primary = variants.find((v) => !v.unicodeRanges) ?? variants[0];

  const codePoints = new Set<number>();
  let unmappedCount = 0;
  let glyphCount = 1; // .notdef, once
  for (const v of variants) {
    const font = getParsedFont(v);
    const map = (font.tables.cmap?.glyphIndexMap ?? {}) as Record<string, number>;
    const mappedGlyphs = new Set<number>();
    for (const [key, glyphIndex] of Object.entries(map)) {
      if (!glyphIndex) continue;
      const cp = Number(key);
      if (v.unicodeRanges && !v.unicodeRanges.some(([lo, hi]) => cp >= lo && cp <= hi)) continue;
      codePoints.add(cp);
      mappedGlyphs.add(glyphIndex);
    }
    const allMapped = new Set(Object.values(map).filter((g) => g > 0));
    unmappedCount += Math.max(0, font.numGlyphs - 1 - allMapped.size);
    glyphCount += Math.max(0, font.numGlyphs - 1 - allMapped.size) + mappedGlyphs.size;
  }

  return {
    variants,
    primary,
    codePoints: [...codePoints].sort((a, b) => a - b),
    unmappedCount,
    glyphCount,
    isSplit: variants.some((v) => !!v.unicodeRanges || !!v.partial),
  };
}

export interface FontIdentity {
  family: string;
  style: string;
  fullName: string;
  version: string;
  designer: string | null;
  designerUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  weight: number;
  isItalic: boolean;
  isMonospace: boolean;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
}

function englishName(font: import('opentype.js').Font, ...keys: string[]): string | null {
  const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
  for (const key of keys) {
    const entry = names[key];
    const value = entry?.en ?? (entry ? Object.values(entry)[0] : undefined);
    if (value) return value;
  }
  return null;
}

/** Height of a glyph's ink above the baseline, in font units (0 when absent). */
function glyphTop(font: import('opentype.js').Font, char: string): number {
  if (font.charToGlyphIndex(char) <= 0) return 0;
  const box = font.charToGlyph(char).getBoundingBox();
  return Number.isFinite(box.y2) ? box.y2 : 0;
}

/**
 * The family and full name Font.info reports. The font's name table is the
 * source, with one exception: Google Fonts cuts each weight from a variable
 * font and some files keep the default instance's name, so Raleway Bold
 * says its family is "Raleway Thin". When the table's family is the family
 * that was loaded plus extra words, the loaded name wins and the full name
 * is rebuilt from it. A table name unrelated to the loaded one (a local file
 * registered under its file name) is kept as the font's own.
 */
export function resolveFamilyNames(
  loadedFamily: string,
  tableFamily: string | null,
  tableFullName: string | null,
  style: string,
): { family: string; fullName: string } {
  if (!tableFamily) return { family: loadedFamily, fullName: tableFullName ?? `${loadedFamily} ${style}` };
  const leaked = tableFamily !== loadedFamily && tableFamily.toLowerCase().startsWith(`${loadedFamily.toLowerCase()} `);
  if (leaked) return { family: loadedFamily, fullName: `${loadedFamily} ${style}` };
  return { family: tableFamily, fullName: tableFullName ?? `${tableFamily} ${style}` };
}

/**
 * Names, style flags and metrics from the `name`, `OS/2`, `post`, `head` and
 * `hhea` tables. Metrics other than unitsPerEm are scaled to `fontSize`.
 * Cap height and x-height fall back to measuring `H` / `x` when OS/2 omits
 * them (older fonts).
 */
export function getFontIdentity(fontData: FontData, fontSize: number): FontIdentity {
  const font = getParsedFont(fontData);
  const os2 = font.tables.os2 as
    | { usWeightClass?: number; fsSelection?: number; sTypoLineGap?: number; sCapHeight?: number; sxHeight?: number }
    | undefined;
  const post = font.tables.post as { isFixedPitch?: number; italicAngle?: number } | undefined;
  const head = font.tables.head as { macStyle?: number } | undefined;
  const scale = fontSize / font.unitsPerEm;
  const style = englishName(font, 'preferredSubfamily', 'fontSubfamily') ?? 'Regular';
  const { family, fullName } = resolveFamilyNames(
    fontData.family,
    englishName(font, 'preferredFamily', 'fontFamily'),
    englishName(font, 'fullName'),
    style,
  );
  const capUnits = os2?.sCapHeight && os2.sCapHeight > 0 ? os2.sCapHeight : glyphTop(font, 'H');
  const xUnits = os2?.sxHeight && os2.sxHeight > 0 ? os2.sxHeight : glyphTop(font, 'x');
  return {
    family,
    style,
    fullName,
    version: englishName(font, 'version') ?? '',
    designer: englishName(font, 'designer'),
    designerUrl: englishName(font, 'designerURL'),
    license: englishName(font, 'license'),
    licenseUrl: englishName(font, 'licenseURL'),
    weight: os2?.usWeightClass ?? fontData.weight,
    isItalic:
      ((os2?.fsSelection ?? 0) & 1) === 1 || ((head?.macStyle ?? 0) & 2) === 2 || (post?.italicAngle ?? 0) !== 0,
    isMonospace: (post?.isFixedPitch ?? 0) !== 0,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender * scale,
    descender: font.descender * scale,
    lineGap: (os2?.sTypoLineGap ?? 0) * scale,
    capHeight: capUnits * scale,
    xHeight: xUnits * scale,
  };
}

/** The font's own name for the glyph a character maps to; null when the font omits names. */
export function getGlyphName(fontData: FontData, char: string): string | null {
  const font = getParsedFont(fontData);
  if (font.charToGlyphIndex(char) <= 0) return null;
  const name = font.charToGlyph(char).name;
  return name || null;
}
