import { describe, it, expect } from 'vitest';
import {
  coverManifestEntries,
  coverNotes,
  coverPageSize,
  coverTechnicalLine,
  previewFitRect,
  type CoverManifestInput,
} from '../playground/utils/pdf-cover-sheet';
import { computePdfLayout } from '../playground/utils/pdf-page-layout';

const matchLayout = computePdfLayout({
  mode: 'match',
  orientation: 'portrait',
  width: 24,
  height: 15,
  unit: 'in',
  margin: 0.5,
  printPrep: true,
  svgWidth: 800,
  svgHeight: 500,
});

const baseInput: CoverManifestInput = {
  layout: matchLayout,
  unit: 'in',
  margin: 0.5,
  printPrep: true,
  artworkVector: true,
  detail: 'standard',
  exportPrecision: null,
  workspaceToFixed: null,
  reduction: { removed: 2447, total: 4007 },
  date: '2026-07-19',
  creator: 'Ryan Kuykendall',
};

const entryMap = (input: CoverManifestInput): Record<string, string> =>
  Object.fromEntries(coverManifestEntries(input).map((e) => [e.label, e.value]));

describe('coverPageSize', () => {
  it('is Letter for inches and A4 for centimeters', () => {
    expect(coverPageSize('in')).toEqual({ w: 612, h: 792, label: 'Letter' });
    expect(coverPageSize('cm')).toEqual({ w: 595.28, h: 841.89, label: 'A4' });
  });
});

describe('previewFitRect', () => {
  const box = { x: 54, y: 100, w: 504, h: 290 };

  it('width-bounds very wide artwork and centers vertically', () => {
    // Aspect 4 ≫ box aspect 1.74 → width-bound
    const fit = previewFitRect(2000, 500, box);
    expect(fit.w).toBeCloseTo(box.w, 6);
    expect(fit.y).toBeGreaterThan(box.y);
    expect(fit.y).toBeCloseTo(box.y + (box.h - fit.h) / 2, 6);
  });

  it('height-bounds 800×500 in the cover preview box and centers horizontally', () => {
    // Aspect 1.6 < box aspect 1.74 → height-bound
    const fit = previewFitRect(800, 500, box);
    expect(fit.h).toBeCloseTo(box.h, 6);
    expect(fit.w).toBeCloseTo(464, 0);
    expect(fit.x).toBeCloseTo(box.x + (box.w - fit.w) / 2, 6);
  });

  it('height-bounds portrait artwork and centers horizontally', () => {
    const fit = previewFitRect(800, 1000, box);
    expect(fit.h).toBeCloseTo(290, 6);
    expect(fit.x).toBeGreaterThan(box.x);
    expect(fit.x + fit.w).toBeLessThanOrEqual(box.x + box.w + 1e-9);
  });

  it('fills the box exactly for matching aspect', () => {
    const fit = previewFitRect(504, 290, box);
    expect(fit).toEqual(box);
  });

  it('never exceeds the box', () => {
    for (const [w, h] of [[1, 1000], [1000, 1], [3, 2]]) {
      const fit = previewFitRect(w, h, box);
      expect(fit.w).toBeLessThanOrEqual(box.w + 1e-9);
      expect(fit.h).toBeLessThanOrEqual(box.h + 1e-9);
    }
  });
});

describe('coverManifestEntries', () => {
  it('reports trim/page/margins in inches for a match-mode layout', () => {
    const map = entryMap(baseInput);
    expect(map['Trim size']).toBe('25 × 16 in');
    expect(map['Page size']).toBe('25.75 × 16.75 in incl. bleed');
    expect(map['Margins']).toBe('0.5 in');
    expect(map['Bleed + crop marks']).toBe('Yes — 0.125 in bleed');
    expect(map['Export date']).toBe('2026-07-19');
  });

  it('converts to centimeters and uses the 3 mm bleed wording', () => {
    const cmLayout = computePdfLayout({
      mode: 'match', orientation: 'portrait', width: 60, height: 37.5,
      unit: 'cm', margin: 1.5, printPrep: true, svgWidth: 800, svgHeight: 500,
    });
    const map = entryMap({ ...baseInput, layout: cmLayout, unit: 'cm', margin: 1.5 });
    expect(map['Trim size']).toBe('63 × 40.5 cm');
    expect(map['Bleed + crop marks']).toBe('Yes — 3 mm bleed');
    expect(map['Margins']).toBe('1.5 cm');
  });

  it('printPrep off: page equals trim, no bleed wording', () => {
    const plainLayout = computePdfLayout({
      mode: 'match', orientation: 'portrait', width: 24, height: 15,
      unit: 'in', margin: 0.5, printPrep: false, svgWidth: 800, svgHeight: 500,
    });
    const map = entryMap({ ...baseInput, layout: plainLayout, printPrep: false });
    expect(map['Page size']).toBe('25 × 16 in');
    expect(map['Bleed + crop marks']).toBe('No');
  });

  it('artwork row: vector with reduction, vector full, raster', () => {
    expect(entryMap(baseInput)['Artwork']).toBe('Vector — Detail: Standard (2,447 of 4,007 segments removed)');
    expect(entryMap({ ...baseInput, detail: 'fine', reduction: { removed: 12, total: 100 } })['Artwork']).toBe(
      'Vector — Detail: Fine (12 of 100 segments removed)',
    );
    expect(entryMap({ ...baseInput, detail: 'full', reduction: null })['Artwork']).toBe('Vector — full detail');
    expect(entryMap({ ...baseInput, reduction: { removed: 0, total: 100 } })['Artwork']).toBe('Vector — full detail');
    expect(entryMap({ ...baseInput, artworkVector: false })['Artwork']).toBe('Raster — 300 DPI image at print size');
  });

  it('precision row variants', () => {
    expect(entryMap({ ...baseInput, workspaceToFixed: 3 })['Precision']).toBe('Match workspace (3)');
    expect(entryMap(baseInput)['Precision']).toBe('Match workspace (off)');
    expect(entryMap({ ...baseInput, workspaceToFixed: undefined })['Precision']).toBe('Match workspace (off)');
    expect(entryMap({ ...baseInput, exportPrecision: 2 })['Precision']).toBe('2 decimals');
    expect(entryMap({ ...baseInput, exportPrecision: 1 })['Precision']).toBe('1 decimal');
  });

  it('omits the creator row when empty', () => {
    expect(entryMap(baseInput)['Creator']).toBe('Ryan Kuykendall');
    const labels = coverManifestEntries({ ...baseInput, creator: '  ' }).map((e) => e.label);
    expect(labels).not.toContain('Creator');
  });
});

describe('coverTechnicalLine', () => {
  it('formats vector reduction with locale separators', () => {
    expect(coverTechnicalLine(baseInput)).toBe(
      'Vector artwork: 1,560 path segments (2,447 removed below print resolution)',
    );
  });

  it('vector full-detail and raster variants', () => {
    expect(coverTechnicalLine({ ...baseInput, reduction: null })).toBe(
      'Vector artwork: full detail — every path segment preserved',
    );
    expect(coverTechnicalLine({ ...baseInput, artworkVector: false })).toBe(
      'Raster artwork: 300 DPI JPEG sized for the printed page',
    );
  });
});

describe('coverNotes', () => {
  it('vector gets the slow-render warning, raster does not', () => {
    const vector = coverNotes(true);
    expect(vector).toHaveLength(2);
    expect(vector[0]).toContain('page 2 only');
    expect(vector[1]).toContain('may take a minute');
    expect(coverNotes(false)).toHaveLength(1);
  });
});
