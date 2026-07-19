/**
 * Pure page-geometry math for the Export-with-Legend PDF path.
 *
 * All outputs are in PDF points (pt). No DOM access — fully unit-testable.
 *
 * Coordinate space: PDF page with origin at the top-left (jsPDF's default
 * when constructed with `unit: 'pt'`), x right, y down.
 *
 * Terminology (outside-in): page (MediaBox) ⊇ slug (crop-mark zone) ⊇ bleed ⊇ trim
 * (the final cut size) ⊇ printable (trim inset by margins) ⊇ content (the
 * placed artwork rect). Without print prep, page == trim and there is no
 * bleed/slug/crop-mark zone.
 */

export const PT_PER_IN = 72;
export const PT_PER_MM = 72 / 25.4;
export const PT_PER_CM = PT_PER_MM * 10;

export type Unit = 'in' | 'cm';
export type Orientation = 'portrait' | 'landscape';

export interface PagePreset {
  id: string;
  label: string;
  /** Portrait width in `unit` */
  w: number;
  /** Portrait height in `unit` */
  h: number;
  unit: 'in' | 'mm';
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'poster-18x24', label: '18 × 24 in poster', w: 18, h: 24, unit: 'in' },
  { id: 'poster-24x36', label: '24 × 36 in poster', w: 24, h: 36, unit: 'in' },
  { id: 'letter', label: 'Letter (8.5 × 11 in)', w: 8.5, h: 11, unit: 'in' },
  { id: 'tabloid', label: 'Tabloid (11 × 17 in)', w: 11, h: 17, unit: 'in' },
  { id: 'a4', label: 'A4 (210 × 297 mm)', w: 210, h: 297, unit: 'mm' },
  { id: 'a3', label: 'A3 (297 × 420 mm)', w: 297, h: 420, unit: 'mm' },
  { id: 'a2', label: 'A2 (420 × 594 mm)', w: 420, h: 594, unit: 'mm' },
  { id: 'a1', label: 'A1 (594 × 841 mm)', w: 594, h: 841, unit: 'mm' },
  { id: 'a0', label: 'A0 (841 × 1189 mm)', w: 841, h: 1189, unit: 'mm' },
];

/** Bleed the printer trims away: 0.125 in for inch-based sizes, 3 mm for metric. */
const BLEED_IN_PT = 0.125 * PT_PER_IN;
const BLEED_MM_PT = 3 * PT_PER_MM;
/** Slug zone beyond the bleed reserved for crop marks. */
const SLUG_PT = 0.25 * PT_PER_IN;
/** Crop-mark hairlines: gap past the bleed edge, then mark length. */
const CROP_MARK_GAP_PT = 2;
const CROP_MARK_LEN_PT = 16;
export const CROP_MARK_WIDTH_PT = 0.5;

/** Physical page-side limits (sanity bounds, in points). */
const MIN_SIDE_PT = 1 * PT_PER_IN;
const MAX_SIDE_PT = 100 * PT_PER_IN;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfLayoutInput {
  /**
   * 'match'  — width/height are the printed ARTWORK size; the page grows by
   *            the margin on every side (never letterboxed).
   * 'preset' — trim size comes from PAGE_PRESETS[presetId] + orientation.
   * 'custom' — width/height are the page (trim) size.
   */
  mode: 'match' | 'preset' | 'custom';
  presetId?: string;
  /** Preset mode only; presets store portrait dims. Default 'portrait'. */
  orientation?: Orientation;
  /** In `unit`. Match mode: artwork size. Custom mode: page size. */
  width?: number;
  height?: number;
  /** Single unit for width, height, and margin. */
  unit: Unit;
  /** Margin on each side, in `unit`. */
  margin: number;
  /** Add bleed + crop marks (print prep). */
  printPrep: boolean;
  /** Artwork dimensions in SVG user units. */
  svgWidth: number;
  svgHeight: number;
}

export interface PdfLayout {
  /** Full MediaBox size in pt (includes bleed + slug when printPrep). */
  pageW: number;
  pageH: number;
  /** Final cut size, positioned within the page. */
  trim: Rect;
  /** Trim expanded by the bleed; equals trim when !printPrep. Background fills to this rect. */
  bleed: Rect;
  /** Where the scaled artwork lands. */
  content: Rect;
  /** pt per SVG user unit. */
  scale: number;
  /** 8 hairlines (2 per corner) when printPrep; empty otherwise. */
  cropMarks: CropMark[];
}

function toPt(value: number, unit: Unit): number {
  return unit === 'in' ? value * PT_PER_IN : value * PT_PER_CM;
}

function presetToPt(value: number, unit: 'in' | 'mm'): number {
  return unit === 'in' ? value * PT_PER_IN : value * PT_PER_MM;
}

function assertFinitePositive(value: number | undefined, name: string): asserts value is number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function assertSideBounds(sidePt: number, name: string): void {
  if (sidePt < MIN_SIDE_PT || sidePt > MAX_SIDE_PT) {
    throw new Error(`${name} must be between 1 and 100 inches`);
  }
}

function buildCropMarks(trim: Rect, bleedPt: number): CropMark[] {
  const marks: CropMark[] = [];
  const start = bleedPt + CROP_MARK_GAP_PT;
  const end = start + CROP_MARK_LEN_PT;
  const corners = [
    { x: trim.x, y: trim.y, dx: -1, dy: -1 },
    { x: trim.x + trim.w, y: trim.y, dx: 1, dy: -1 },
    { x: trim.x, y: trim.y + trim.h, dx: -1, dy: 1 },
    { x: trim.x + trim.w, y: trim.y + trim.h, dx: 1, dy: 1 },
  ];
  for (const c of corners) {
    // Horizontal hairline aligned with the trim's top/bottom edge.
    marks.push({ x1: c.x + c.dx * start, y1: c.y, x2: c.x + c.dx * end, y2: c.y });
    // Vertical hairline aligned with the trim's left/right edge.
    marks.push({ x1: c.x, y1: c.y + c.dy * start, x2: c.x, y2: c.y + c.dy * end });
  }
  return marks;
}

export function computePdfLayout(input: PdfLayoutInput): PdfLayout {
  const { mode, unit, printPrep, svgWidth, svgHeight } = input;
  assertFinitePositive(svgWidth, 'svgWidth');
  assertFinitePositive(svgHeight, 'svgHeight');
  if (!Number.isFinite(input.margin) || input.margin < 0) {
    throw new Error('Margin must be zero or a positive number');
  }
  const marginPt = toPt(input.margin, unit);
  const bleedPt = printPrep ? (unit === 'cm' ? BLEED_MM_PT : BLEED_IN_PT) : 0;

  // --- Resolve trim size + content geometry per mode ---
  let trimW: number;
  let trimH: number;
  let contentW: number;
  let contentH: number;

  if (mode === 'match') {
    assertFinitePositive(input.width, 'Artwork width');
    assertFinitePositive(input.height, 'Artwork height');
    contentW = toPt(input.width, unit);
    contentH = toPt(input.height, unit);
    trimW = contentW + 2 * marginPt;
    trimH = contentH + 2 * marginPt;
    assertSideBounds(trimW, 'Page width (artwork + margins)');
    assertSideBounds(trimH, 'Page height (artwork + margins)');
  } else {
    if (mode === 'preset') {
      const preset = PAGE_PRESETS.find((p) => p.id === input.presetId);
      if (!preset) throw new Error(`Unknown page preset: ${input.presetId}`);
      const landscape = input.orientation === 'landscape';
      trimW = presetToPt(landscape ? preset.h : preset.w, preset.unit);
      trimH = presetToPt(landscape ? preset.w : preset.h, preset.unit);
    } else {
      assertFinitePositive(input.width, 'Page width');
      assertFinitePositive(input.height, 'Page height');
      trimW = toPt(input.width, unit);
      trimH = toPt(input.height, unit);
      assertSideBounds(trimW, 'Page width');
      assertSideBounds(trimH, 'Page height');
    }
    const printableW = trimW - 2 * marginPt;
    const printableH = trimH - 2 * marginPt;
    if (printableW <= 0 || printableH <= 0) {
      throw new Error('Margins are too large for the selected page size');
    }
    const scale = Math.min(printableW / svgWidth, printableH / svgHeight);
    contentW = svgWidth * scale;
    contentH = svgHeight * scale;
  }

  // --- Position everything on the page ---
  const slugPt = printPrep ? SLUG_PT : 0;
  const originOffset = bleedPt + slugPt;
  const pageW = trimW + 2 * originOffset;
  const pageH = trimH + 2 * originOffset;

  const trim: Rect = { x: originOffset, y: originOffset, w: trimW, h: trimH };
  const bleed: Rect = {
    x: trim.x - bleedPt,
    y: trim.y - bleedPt,
    w: trimW + 2 * bleedPt,
    h: trimH + 2 * bleedPt,
  };

  // Center the content in the printable area (exact fit in match mode).
  const content: Rect = {
    x: trim.x + marginPt + (trimW - 2 * marginPt - contentW) / 2,
    y: trim.y + marginPt + (trimH - 2 * marginPt - contentH) / 2,
    w: contentW,
    h: contentH,
  };

  return {
    pageW,
    pageH,
    trim,
    bleed,
    content,
    scale: contentW / svgWidth,
    cropMarks: printPrep ? buildCropMarks(trim, bleedPt) : [],
  };
}

/** Convert a value between display units (used by the modal for unit switching). */
export function convertUnit(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'in' ? value * 2.54 : value / 2.54;
}
