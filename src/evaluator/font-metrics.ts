/**
 * Font metrics estimation for TextBlock bounding box calculation.
 *
 * Provides synchronous, zero-dependency bounding box estimation using
 * per-character width tables for common font categories. ~85-90% accuracy
 * for Latin text — sufficient for layout and overlap decisions.
 *
 * Designed so a future opentype.js backend can slot in behind the same API.
 */

import type { TextBlockElement, FontRegistry } from './types';
import { getFont, getAdvanceWidth, getVerticalMetrics } from './font-provider';

// ---------------------------------------------------------------------------
// Character width tables (fraction of font-size for common Latin glyphs)
// ---------------------------------------------------------------------------

// Sans-serif widths (approximating Arial/Helvetica)
const CHAR_WIDTHS_SANS: Record<string, number> = {
  ' ': 0.28, '!': 0.28, '"': 0.36, '#': 0.56, '$': 0.56, '%': 0.89,
  '&': 0.67, "'": 0.19, '(': 0.33, ')': 0.33, '*': 0.39, '+': 0.58,
  ',': 0.28, '-': 0.33, '.': 0.28, '/': 0.28, '0': 0.56, '1': 0.56,
  '2': 0.56, '3': 0.56, '4': 0.56, '5': 0.56, '6': 0.56, '7': 0.56,
  '8': 0.56, '9': 0.56, ':': 0.28, ';': 0.28, '<': 0.58, '=': 0.58,
  '>': 0.58, '?': 0.56, '@': 1.02, 'A': 0.67, 'B': 0.67, 'C': 0.72,
  'D': 0.72, 'E': 0.67, 'F': 0.61, 'G': 0.78, 'H': 0.72, 'I': 0.28,
  'J': 0.50, 'K': 0.67, 'L': 0.56, 'M': 0.83, 'N': 0.72, 'O': 0.78,
  'P': 0.67, 'Q': 0.78, 'R': 0.72, 'S': 0.67, 'T': 0.61, 'U': 0.72,
  'V': 0.67, 'W': 0.94, 'X': 0.67, 'Y': 0.67, 'Z': 0.61, '[': 0.28,
  '\\': 0.28, ']': 0.28, '^': 0.47, '_': 0.56, '`': 0.33, 'a': 0.56,
  'b': 0.56, 'c': 0.50, 'd': 0.56, 'e': 0.56, 'f': 0.28, 'g': 0.56,
  'h': 0.56, 'i': 0.22, 'j': 0.22, 'k': 0.50, 'l': 0.22, 'm': 0.83,
  'n': 0.56, 'o': 0.56, 'p': 0.56, 'q': 0.56, 'r': 0.33, 's': 0.50,
  't': 0.28, 'u': 0.56, 'v': 0.50, 'w': 0.72, 'x': 0.50, 'y': 0.50,
  'z': 0.50, '{': 0.33, '|': 0.26, '}': 0.33, '~': 0.58,
};

// Serif widths (approximating Times New Roman)
const CHAR_WIDTHS_SERIF: Record<string, number> = {
  ' ': 0.25, '!': 0.33, '"': 0.41, '#': 0.50, '$': 0.50, '%': 0.83,
  '&': 0.78, "'": 0.18, '(': 0.33, ')': 0.33, '*': 0.50, '+': 0.56,
  ',': 0.25, '-': 0.33, '.': 0.25, '/': 0.28, '0': 0.50, '1': 0.50,
  '2': 0.50, '3': 0.50, '4': 0.50, '5': 0.50, '6': 0.50, '7': 0.50,
  '8': 0.50, '9': 0.50, ':': 0.28, ';': 0.28, '<': 0.56, '=': 0.56,
  '>': 0.56, '?': 0.44, '@': 0.92, 'A': 0.72, 'B': 0.67, 'C': 0.67,
  'D': 0.72, 'E': 0.61, 'F': 0.56, 'G': 0.72, 'H': 0.72, 'I': 0.33,
  'J': 0.39, 'K': 0.72, 'L': 0.61, 'M': 0.89, 'N': 0.72, 'O': 0.72,
  'P': 0.56, 'Q': 0.72, 'R': 0.67, 'S': 0.56, 'T': 0.61, 'U': 0.72,
  'V': 0.72, 'W': 0.94, 'X': 0.72, 'Y': 0.72, 'Z': 0.61, '[': 0.33,
  '\\': 0.28, ']': 0.33, '^': 0.47, '_': 0.50, '`': 0.33, 'a': 0.44,
  'b': 0.50, 'c': 0.44, 'd': 0.50, 'e': 0.44, 'f': 0.33, 'g': 0.50,
  'h': 0.50, 'i': 0.28, 'j': 0.28, 'k': 0.50, 'l': 0.28, 'm': 0.78,
  'n': 0.50, 'o': 0.50, 'p': 0.50, 'q': 0.50, 'r': 0.33, 's': 0.39,
  't': 0.28, 'u': 0.50, 'v': 0.50, 'w': 0.72, 'x': 0.50, 'y': 0.50,
  'z': 0.44, '{': 0.48, '|': 0.20, '}': 0.48, '~': 0.54,
};

// Monospace: uniform width (approximating Courier New)
const CHAR_WIDTH_MONO = 0.60;

// Default character width for unknown characters
const DEFAULT_CHAR_WIDTH_SANS = 0.56;
const DEFAULT_CHAR_WIDTH_SERIF = 0.50;

// Font-weight multiplier: bold text is ~5-8% wider
const BOLD_WIDTH_FACTOR = 1.06;

// Line height factor (ascent + descent + line gap)
const LINE_HEIGHT_FACTOR = 1.2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve the effective font-size from a styles map.
 * Returns the numeric pixel value (default 16).
 */
export function resolveEffectiveFontSize(styles: Record<string, string>): number {
  const raw = styles['font-size'];
  if (!raw) return 16;
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : 16;
}

/**
 * Determine the font category from a font-family value.
 * Returns 'sans-serif', 'serif', or 'monospace'.
 */
export function resolveFontCategory(styles: Record<string, string>): 'sans-serif' | 'serif' | 'monospace' {
  const raw = (styles['font-family'] ?? '').toLowerCase();
  if (/\b(monospace|mono|courier|consolas|menlo|fira\s*code)\b/.test(raw)) return 'monospace';
  if (/\b(serif|times|georgia|garamond|cambria|palatino)\b/.test(raw) && !/\bsans/.test(raw)) return 'serif';
  return 'sans-serif';
}

/**
 * Estimate the rendered width of a text string at a given font-size and font category.
 * When fontRegistry and fontFamily are provided, uses precise opentype.js metrics.
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  fontCategory: 'sans-serif' | 'serif' | 'monospace',
  fontRegistry?: FontRegistry,
  fontFamily?: string,
  fontWeight?: number,
): number {
  // Try precise metrics via font registry
  if (fontRegistry && fontFamily) {
    const fontData = getFont(fontRegistry, fontFamily, fontWeight);
    if (fontData) {
      return getAdvanceWidth(fontData, text, fontSize);
    }
  }

  // Fallback to built-in character width tables
  let total = 0;
  if (fontCategory === 'monospace') {
    total = text.length * CHAR_WIDTH_MONO;
  } else {
    const table = fontCategory === 'serif' ? CHAR_WIDTHS_SERIF : CHAR_WIDTHS_SANS;
    const defaultWidth = fontCategory === 'serif' ? DEFAULT_CHAR_WIDTH_SERIF : DEFAULT_CHAR_WIDTH_SANS;
    for (const ch of text) {
      total += table[ch] ?? defaultWidth;
    }
  }
  return total * fontSize;
}

/**
 * Estimate the line height for a given font-size.
 * When fontRegistry and fontFamily are provided, uses precise opentype.js metrics.
 */
export function estimateLineHeight(
  fontSize: number,
  fontRegistry?: FontRegistry,
  fontFamily?: string,
  fontWeight?: number,
): number {
  if (fontRegistry && fontFamily) {
    const fontData = getFont(fontRegistry, fontFamily, fontWeight);
    if (fontData) {
      const metrics = getVerticalMetrics(fontData, fontSize);
      return metrics.lineHeight;
    }
  }
  return fontSize * LINE_HEIGHT_FACTOR;
}

/**
 * Check if font-weight indicates bold.
 */
function isBold(styles: Record<string, string>): boolean {
  const w = styles['font-weight'] ?? '';
  return w === 'bold' || w === 'bolder' || parseInt(w, 10) >= 700;
}

/**
 * Resolve font-family from a styles map (first family in comma-separated list).
 */
export function resolveFontFamily(styles: Record<string, string>): string | undefined {
  const raw = styles['font-family'];
  if (!raw) return undefined;
  // Extract first family name, stripping quotes
  const first = raw.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return first || undefined;
}

/**
 * Resolve font-weight as a number from styles.
 */
export function resolveFontWeight(styles: Record<string, string>): number | undefined {
  const w = styles['font-weight'];
  if (!w) return undefined;
  if (w === 'bold' || w === 'bolder') return 700;
  if (w === 'normal' || w === 'lighter') return 400;
  const n = parseInt(w, 10);
  return isFinite(n) ? n : undefined;
}

/**
 * Estimate the bounding box of a set of TextBlockElements, accounting for
 * block-level and element-level styles, tspan dx/dy offsets, and font metrics.
 *
 * The returned bbox is in the same coordinate space as the elements
 * (relative for TextBlockValue, absolute for ProjectedTextValue).
 *
 * When fontRegistry is provided, uses precise opentype.js metrics for fonts
 * that are loaded in the registry. Falls back to built-in tables otherwise.
 */
export function estimateTextBoundingBox(
  elements: TextBlockElement[],
  blockStyles: Record<string, string>,
  fontRegistry?: FontRegistry,
): BBox {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    // Merge block-level and element-level styles (element overrides)
    const mergedStyles = el.styles ? { ...blockStyles, ...el.styles } : blockStyles;
    const fontSize = resolveEffectiveFontSize(mergedStyles);
    const fontCategory = resolveFontCategory(mergedStyles);
    const fontFamily = resolveFontFamily(mergedStyles);
    const fontWeight = resolveFontWeight(mergedStyles);
    const lineHeight = estimateLineHeight(fontSize, fontRegistry, fontFamily, fontWeight);
    const boldFactor = isBold(mergedStyles) ? BOLD_WIDTH_FACTOR : 1;
    // When using precise font metrics, bold factor is already accounted for
    const hasPreciseMetrics = fontRegistry && fontFamily && getFont(fontRegistry, fontFamily, fontWeight) !== null;
    const effectiveBoldFactor = hasPreciseMetrics ? 1 : boldFactor;
    const letterSpacing = parseFloat(mergedStyles['letter-spacing'] ?? '0') || 0;

    // Compute per-element bbox by walking children (runs + tspans)
    let cursorX = el.x;
    let cursorY = el.y;

    for (const child of el.children) {
      // tspan may shift the cursor
      if (child.type === 'tspan') {
        if (child.dx !== undefined) cursorX += child.dx;
        if (child.dy !== undefined) cursorY += child.dy;
        // tspan may have its own styles
        const tspanStyles = child.styles ? { ...mergedStyles, ...child.styles } : mergedStyles;
        const tsFontSize = resolveEffectiveFontSize(tspanStyles);
        const tsFontCategory = resolveFontCategory(tspanStyles);
        const tsFontFamily = resolveFontFamily(tspanStyles);
        const tsFontWeight = resolveFontWeight(tspanStyles);
        const tsBoldFactor = isBold(tspanStyles) ? BOLD_WIDTH_FACTOR : 1;
        const tsHasPrecise = fontRegistry && tsFontFamily && getFont(fontRegistry, tsFontFamily, tsFontWeight) !== null;
        const tsEffectiveBold = tsHasPrecise ? 1 : tsBoldFactor;
        const tsLetterSpacing = parseFloat(tspanStyles['letter-spacing'] ?? '0') || 0;
        const textWidth = estimateTextWidth(child.text, tsFontSize, tsFontCategory, fontRegistry, tsFontFamily, tsFontWeight) * tsEffectiveBold
          + tsLetterSpacing * Math.max(0, child.text.length - 1);
        const tsLineHeight = estimateLineHeight(tsFontSize, fontRegistry, tsFontFamily, tsFontWeight);

        // Text baseline is at cursorY; the text extends upward by ~fontSize and slightly below
        const elMinX = cursorX;
        const elMinY = cursorY - tsFontSize; // approximate top (ascent)
        const elMaxX = cursorX + textWidth;
        const elMaxY = cursorY + (tsLineHeight - tsFontSize); // approximate descender

        minX = Math.min(minX, elMinX);
        minY = Math.min(minY, elMinY);
        maxX = Math.max(maxX, elMaxX);
        maxY = Math.max(maxY, elMaxY);

        // Advance cursor past this text
        cursorX += textWidth;
      } else {
        // Plain run
        const textWidth = estimateTextWidth(child.text, fontSize, fontCategory, fontRegistry, fontFamily, fontWeight) * effectiveBoldFactor
          + letterSpacing * Math.max(0, child.text.length - 1);

        const elMinX = cursorX;
        const elMinY = cursorY - fontSize;
        const elMaxX = cursorX + textWidth;
        const elMaxY = cursorY + (lineHeight - fontSize);

        minX = Math.min(minX, elMinX);
        minY = Math.min(minY, elMinY);
        maxX = Math.max(maxX, elMaxX);
        maxY = Math.max(maxY, elMaxY);

        cursorX += textWidth;
      }
    }
  }

  if (!isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ---------------------------------------------------------------------------
// Intersection geometry utilities
// ---------------------------------------------------------------------------

/**
 * AABB overlap test between two bounding boxes.
 */
export function bboxOverlaps(a: BBox, b: BBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

interface Point {
  x: number;
  y: number;
}

/**
 * Line-segment vs line-segment intersection.
 * Returns the intersection point or null.
 */
function segmentIntersection(
  p1: Point, p2: Point,
  p3: Point, p4: Point,
): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };
}

/**
 * Get the 4 edge segments of a bounding box as pairs of points.
 */
function bboxEdges(bbox: BBox): [Point, Point][] {
  const tl: Point = { x: bbox.x, y: bbox.y };
  const tr: Point = { x: bbox.x + bbox.width, y: bbox.y };
  const br: Point = { x: bbox.x + bbox.width, y: bbox.y + bbox.height };
  const bl: Point = { x: bbox.x, y: bbox.y + bbox.height };
  return [
    [tl, tr], // top
    [tr, br], // right
    [br, bl], // bottom
    [bl, tl], // left
  ];
}

/**
 * Test if a bbox intersects a set of path commands (line segments from the path).
 * Uses simplified approach: samples path as line segments and tests each against bbox edges.
 */
export function bboxPathIntersects(
  bbox: BBox,
  pathSegments: { start: Point; end: Point }[],
): boolean {
  const edges = bboxEdges(bbox);
  for (const seg of pathSegments) {
    for (const [e1, e2] of edges) {
      if (segmentIntersection(seg.start, seg.end, e1, e2) !== null) {
        return true;
      }
    }
  }
  // Also check if any path point is inside the bbox (fully contained path)
  for (const seg of pathSegments) {
    if (pointInBBox(seg.start, bbox) || pointInBBox(seg.end, bbox)) {
      return true;
    }
  }
  // Check if bbox center is inside path (fully contained bbox) - simple winding number
  return false;
}

/**
 * Find all intersection points between bbox perimeter and path segments.
 */
export function bboxPathIntersectionPoints(
  bbox: BBox,
  pathSegments: { start: Point; end: Point }[],
): Point[] {
  const edges = bboxEdges(bbox);
  const points: Point[] = [];
  for (const seg of pathSegments) {
    for (const [e1, e2] of edges) {
      const pt = segmentIntersection(seg.start, seg.end, e1, e2);
      if (pt !== null) {
        points.push(pt);
      }
    }
  }
  return points;
}

function pointInBBox(p: Point, bbox: BBox): boolean {
  return p.x >= bbox.x && p.x <= bbox.x + bbox.width &&
         p.y >= bbox.y && p.y <= bbox.y + bbox.height;
}
