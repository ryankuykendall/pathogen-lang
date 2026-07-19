/**
 * Pure content/geometry helpers for the PDF cover sheet (page 1 job ticket).
 * No DOM — mirrors pdf-page-layout.ts so everything string- and math-shaped
 * is unit-testable. The SVG assembly lives in the export modal
 * (_buildCoverSvg), which consumes these.
 */
import { PT_PER_CM, PT_PER_IN, type PdfLayout, type Rect, type Unit } from './pdf-page-layout.js';

export interface CoverPageSize {
  w: number;
  h: number;
  label: 'Letter' | 'A4';
}

/** Letter for inch users, A4 for centimeter users — both in pt. */
export function coverPageSize(unit: Unit): CoverPageSize {
  return unit === 'cm'
    ? { w: 595.28, h: 841.89, label: 'A4' }
    : { w: 612, h: 792, label: 'Letter' };
}

export interface CoverManifestEntry {
  label: string;
  value: string;
}

export interface CoverManifestInput {
  layout: PdfLayout;
  unit: Unit;
  /** Margin in `unit`. */
  margin: number;
  printPrep: boolean;
  /** Effective mode: false when the user chose Raster OR masks/filters forced it. */
  artworkVector: boolean;
  detail: 'full' | 'fine' | 'standard';
  exportPrecision: number | null;
  workspaceToFixed: number | null | undefined;
  reduction: { removed: number; total: number } | null;
  date: string;
  creator: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function ptToUnit(pt: number, unit: Unit): number {
  return round2(pt / (unit === 'cm' ? PT_PER_CM : PT_PER_IN));
}

function sizeString(wPt: number, hPt: number, unit: Unit): string {
  return `${ptToUnit(wPt, unit)} × ${ptToUnit(hPt, unit)} ${unit}`;
}

const DETAIL_LABEL: Record<'fine' | 'standard', string> = {
  fine: 'Fine',
  standard: 'Standard',
};

function artworkValue(input: CoverManifestInput): string {
  if (!input.artworkVector) return 'Raster — 300 DPI image at print size';
  if (input.detail === 'full' || !input.reduction || input.reduction.removed === 0) {
    return 'Vector — full detail';
  }
  const { removed, total } = input.reduction;
  return `Vector — Detail: ${DETAIL_LABEL[input.detail]} (${removed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} segments removed)`;
}

function precisionValue(input: CoverManifestInput): string {
  if (input.exportPrecision != null) {
    return input.exportPrecision === 1 ? '1 decimal' : `${input.exportPrecision} decimals`;
  }
  const ws = input.workspaceToFixed;
  return `Match workspace (${ws != null ? ws : 'off'})`;
}

/** The spec rows printed on the cover, in order. Creator row omitted when empty. */
export function coverManifestEntries(input: CoverManifestInput): CoverManifestEntry[] {
  const { layout, unit, printPrep } = input;
  const entries: CoverManifestEntry[] = [
    { label: 'Trim size', value: sizeString(layout.trim.w, layout.trim.h, unit) },
    {
      label: 'Page size',
      value: printPrep
        ? `${sizeString(layout.pageW, layout.pageH, unit)} incl. bleed`
        : sizeString(layout.pageW, layout.pageH, unit),
    },
    { label: 'Margins', value: `${input.margin} ${unit}` },
    {
      label: 'Bleed + crop marks',
      value: printPrep ? (unit === 'cm' ? 'Yes — 3 mm bleed' : 'Yes — 0.125 in bleed') : 'No',
    },
    { label: 'Artwork', value: artworkValue(input) },
    { label: 'Precision', value: precisionValue(input) },
    { label: 'Export date', value: input.date },
  ];
  if (input.creator.trim().length > 0) {
    entries.push({ label: 'Creator', value: input.creator });
  }
  return entries;
}

/** One-line technical summary under the manifest. */
export function coverTechnicalLine(input: CoverManifestInput): string {
  if (!input.artworkVector) return 'Raster artwork: 300 DPI JPEG sized for the printed page';
  if (!input.reduction || input.reduction.removed === 0) {
    return 'Vector artwork: full detail — every path segment preserved';
  }
  const { removed, total } = input.reduction;
  const kept = total - removed;
  return `Vector artwork: ${kept.toLocaleString('en-US')} path segments (${removed.toLocaleString('en-US')} removed below print resolution)`;
}

/** Handling notes; the slow-render warning applies only to vector artwork. */
export function coverNotes(artworkVector: boolean): string[] {
  const notes = ['Page 2 is the print-ready artwork — print or send page 2 only.'];
  if (artworkVector) {
    notes.push(
      'The artwork page contains dense vector geometry and may take a minute to render in PDF viewers; it prints correctly.',
    );
  }
  return notes;
}

/** Aspect-fit an artW:artH rectangle into `box`, centered on both axes. */
export function previewFitRect(artW: number, artH: number, box: Rect): Rect {
  const scale = Math.min(box.w / artW, box.h / artH);
  const w = artW * scale;
  const h = artH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
