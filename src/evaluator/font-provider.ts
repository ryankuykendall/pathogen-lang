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

import type { FontData, FontRegistry, PathBlockCommand } from './types';
import type { Point } from './context';

// opentype.js has CJS/ESM interop issues with static imports in vitest.
// Use a lazy require/import pattern that works across all environments.
let _opentype: typeof import('opentype.js') | null = null;

function getOpentype(): typeof import('opentype.js') {
  if (!_opentype) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _opentype = require('opentype.js');
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
): void {
  const fontData: FontData = { family, weight, style, buffer };
  const existing = registry.fonts.get(family);
  if (existing) {
    existing.push(fontData);
  } else {
    registry.fonts.set(family, [fontData]);
  }
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
  const variants = registry.fonts.get(family);
  if (!variants || variants.length === 0) return null;

  // Exact match first
  const exact = variants.find((v) => v.weight === weight && v.style === style);
  if (exact) return exact;

  // Match style, nearest weight
  const sameStyle = variants.filter((v) => v.style === style);
  if (sameStyle.length > 0) {
    return sameStyle.reduce((best, v) =>
      Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best,
    );
  }

  // Any variant, nearest weight
  return variants.reduce((best, v) =>
    Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best,
  );
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
 * Get all contour command groups from a glyph's commands.
 * Each contour is a sequence of commands starting with 'm' and ending with 'z'.
 */
export function splitContours(commands: PathBlockCommand[]): PathBlockCommand[][] {
  if (commands.length === 0) return [];

  const contours: PathBlockCommand[][] = [];
  let current: PathBlockCommand[] = [];

  for (const cmd of commands) {
    current.push(cmd);
    if (cmd.command === 'z') {
      contours.push(current);
      current = [];
    }
  }

  // If there are trailing commands without z, include them
  if (current.length > 0) {
    contours.push(current);
  }

  return contours;
}
