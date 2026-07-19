import { describe, it, expect } from 'vitest';
import {
  PAGE_PRESETS,
  PT_PER_CM,
  PT_PER_IN,
  computePdfLayout,
  convertUnit,
  type PdfLayoutInput,
} from '../playground/utils/pdf-page-layout';

const base: PdfLayoutInput = {
  mode: 'preset',
  presetId: 'poster-18x24',
  orientation: 'portrait',
  unit: 'in',
  margin: 0.5,
  printPrep: false,
  svgWidth: 800,
  svgHeight: 500,
};

describe('computePdfLayout — presets', () => {
  it('maps 18×24 in portrait to 1296×1728 pt', () => {
    const layout = computePdfLayout({ ...base, margin: 0 });
    expect(layout.trim.w).toBeCloseTo(1296, 6);
    expect(layout.trim.h).toBeCloseTo(1728, 6);
    expect(layout.pageW).toBeCloseTo(1296, 6);
    expect(layout.pageH).toBeCloseTo(1728, 6);
  });

  it('maps A4 portrait to 595.28×841.89 pt', () => {
    const layout = computePdfLayout({ ...base, presetId: 'a4', margin: 0 });
    expect(layout.trim.w).toBeCloseTo(595.28, 2);
    expect(layout.trim.h).toBeCloseTo(841.89, 2);
  });

  it('swaps width/height for landscape', () => {
    const portrait = computePdfLayout({ ...base, margin: 0 });
    const landscape = computePdfLayout({ ...base, margin: 0, orientation: 'landscape' });
    expect(landscape.trim.w).toBeCloseTo(portrait.trim.h, 6);
    expect(landscape.trim.h).toBeCloseTo(portrait.trim.w, 6);
  });

  it('throws on an unknown preset id', () => {
    expect(() => computePdfLayout({ ...base, presetId: 'nope' })).toThrow(/Unknown page preset/);
  });

  it('every preset id resolves', () => {
    for (const preset of PAGE_PRESETS) {
      expect(() => computePdfLayout({ ...base, presetId: preset.id })).not.toThrow();
    }
  });
});

describe('computePdfLayout — print prep (bleed + slug + crop marks)', () => {
  const BLEED = 0.125 * PT_PER_IN; // 9pt for inch units
  const SLUG = 0.25 * PT_PER_IN; // 18pt

  it('grows the page by 2·(bleed+slug) and offsets the trim', () => {
    const plain = computePdfLayout(base);
    const prepped = computePdfLayout({ ...base, printPrep: true });
    expect(prepped.pageW).toBeCloseTo(plain.pageW + 2 * (BLEED + SLUG), 6);
    expect(prepped.pageH).toBeCloseTo(plain.pageH + 2 * (BLEED + SLUG), 6);
    expect(prepped.trim.x).toBeCloseTo(BLEED + SLUG, 6);
    expect(prepped.trim.y).toBeCloseTo(BLEED + SLUG, 6);
    expect(prepped.trim.w).toBeCloseTo(plain.trim.w, 6);
  });

  it('expands the bleed rect around the trim', () => {
    const layout = computePdfLayout({ ...base, printPrep: true });
    expect(layout.bleed.x).toBeCloseTo(layout.trim.x - BLEED, 6);
    expect(layout.bleed.y).toBeCloseTo(layout.trim.y - BLEED, 6);
    expect(layout.bleed.w).toBeCloseTo(layout.trim.w + 2 * BLEED, 6);
    expect(layout.bleed.h).toBeCloseTo(layout.trim.h + 2 * BLEED, 6);
  });

  it('uses a 3mm bleed for cm units', () => {
    const layout = computePdfLayout({
      ...base,
      mode: 'custom',
      presetId: undefined,
      width: 30,
      height: 40,
      unit: 'cm',
      margin: 1,
      printPrep: true,
    });
    expect(layout.trim.x - layout.bleed.x).toBeCloseTo(3 * (PT_PER_CM / 10), 6);
  });

  it('without print prep: page == trim at origin, no bleed, no marks', () => {
    const layout = computePdfLayout(base);
    expect(layout.trim.x).toBe(0);
    expect(layout.trim.y).toBe(0);
    expect(layout.bleed).toEqual(layout.trim);
    expect(layout.cropMarks).toHaveLength(0);
  });

  it('emits 8 crop marks aligned to trim edges, entirely outside the bleed', () => {
    const layout = computePdfLayout({ ...base, printPrep: true });
    expect(layout.cropMarks).toHaveLength(8);
    const { trim, bleed } = layout;
    for (const m of layout.cropMarks) {
      const horizontal = m.y1 === m.y2;
      if (horizontal) {
        // Aligned with the trim's top or bottom edge
        expect([trim.y, trim.y + trim.h]).toContain(m.y1);
        // Fully left of the bleed or fully right of it
        const minX = Math.min(m.x1, m.x2);
        const maxX = Math.max(m.x1, m.x2);
        expect(maxX <= bleed.x || minX >= bleed.x + bleed.w).toBe(true);
      } else {
        expect(m.x1).toBe(m.x2);
        expect([trim.x, trim.x + trim.w]).toContain(m.x1);
        const minY = Math.min(m.y1, m.y2);
        const maxY = Math.max(m.y1, m.y2);
        expect(maxY <= bleed.y || minY >= bleed.y + bleed.h).toBe(true);
      }
      // Marks stay on the page
      for (const v of [m.x1, m.x2]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [m.y1, m.y2]) expect(v).toBeLessThanOrEqual(layout.pageH);
    }
  });
});

describe('computePdfLayout — fit + centering', () => {
  it('centers a square artwork horizontally on 18×24 with equal side gaps', () => {
    const layout = computePdfLayout({ ...base, svgWidth: 100, svgHeight: 100 });
    const leftGap = layout.content.x - layout.trim.x;
    const rightGap = layout.trim.x + layout.trim.w - (layout.content.x + layout.content.w);
    expect(leftGap).toBeCloseTo(rightGap, 6);
    // Width-limited: content fills printable width exactly
    expect(layout.content.w).toBeCloseTo(layout.trim.w - 2 * 0.5 * PT_PER_IN, 6);
    expect(layout.content.w).toBeCloseTo(layout.content.h, 6);
  });

  it('never overflows the printable area', () => {
    for (const preset of PAGE_PRESETS) {
      for (const [w, h] of [
        [800, 500],
        [500, 800],
        [1, 1000],
      ]) {
        const layout = computePdfLayout({ ...base, presetId: preset.id, svgWidth: w, svgHeight: h });
        const marginPt = 0.5 * PT_PER_IN;
        expect(layout.content.w).toBeLessThanOrEqual(layout.trim.w - 2 * marginPt + 1e-9);
        expect(layout.content.h).toBeLessThanOrEqual(layout.trim.h - 2 * marginPt + 1e-9);
      }
    }
  });

  it('reports scale in pt per SVG unit', () => {
    const layout = computePdfLayout({ ...base, margin: 0 });
    expect(layout.scale).toBeCloseTo(layout.content.w / 800, 9);
  });

  it('rejects margins that consume the page', () => {
    expect(() => computePdfLayout({ ...base, presetId: 'letter', margin: 4.5 })).toThrow(
      /Margins are too large/,
    );
  });
});

describe('computePdfLayout — match artwork mode', () => {
  const match: PdfLayoutInput = {
    mode: 'match',
    orientation: 'portrait',
    width: 24,
    height: 15,
    unit: 'in',
    margin: 0.5,
    printPrep: false,
    svgWidth: 800,
    svgHeight: 500,
  };

  it('content is exactly the requested artwork size; page adds margins', () => {
    const layout = computePdfLayout(match);
    expect(layout.content.w).toBeCloseTo(24 * PT_PER_IN, 6);
    expect(layout.content.h).toBeCloseTo(15 * PT_PER_IN, 6);
    expect(layout.trim.w).toBeCloseTo(25 * PT_PER_IN, 6);
    expect(layout.trim.h).toBeCloseTo(16 * PT_PER_IN, 6);
    expect(layout.scale).toBeCloseTo((24 * PT_PER_IN) / 800, 9);
  });

  it('content sits margin-distance from the trim on all sides', () => {
    const layout = computePdfLayout(match);
    const m = 0.5 * PT_PER_IN;
    expect(layout.content.x - layout.trim.x).toBeCloseTo(m, 6);
    expect(layout.content.y - layout.trim.y).toBeCloseTo(m, 6);
  });

  it('works in centimeters', () => {
    const layout = computePdfLayout({ ...match, width: 60, height: 37.5, unit: 'cm', margin: 2 });
    expect(layout.content.w).toBeCloseTo(60 * PT_PER_CM, 6);
    expect(layout.trim.w).toBeCloseTo(64 * PT_PER_CM, 6);
  });

  it('rejects non-positive artwork dimensions', () => {
    expect(() => computePdfLayout({ ...match, width: 0 })).toThrow(/positive/);
    expect(() => computePdfLayout({ ...match, height: Number.NaN })).toThrow(/positive/);
  });

  it('rejects pages outside the 1–100 inch bounds', () => {
    expect(() => computePdfLayout({ ...match, width: 120, height: 75 })).toThrow(/between 1 and 100/);
  });
});

describe('computePdfLayout — custom mode', () => {
  it('uses the given page size and fit-scales the artwork', () => {
    const layout = computePdfLayout({
      ...base,
      mode: 'custom',
      presetId: undefined,
      width: 30,
      height: 40,
      unit: 'cm',
      margin: 1,
    });
    expect(layout.trim.w).toBeCloseTo(30 * PT_PER_CM, 6);
    expect(layout.trim.h).toBeCloseTo(40 * PT_PER_CM, 6);
    // 800×500 artwork in a (28×38)cm printable area is width-limited
    expect(layout.content.w).toBeCloseTo(28 * PT_PER_CM, 6);
  });

  it('rejects out-of-bounds custom sizes', () => {
    expect(() =>
      computePdfLayout({ ...base, mode: 'custom', presetId: undefined, width: 0.5, height: 24 }),
    ).toThrow(/between 1 and 100/);
    expect(() =>
      computePdfLayout({ ...base, mode: 'custom', presetId: undefined, width: 24, height: 150 }),
    ).toThrow(/between 1 and 100/);
  });
});

describe('convertUnit', () => {
  it('converts between inches and centimeters', () => {
    expect(convertUnit(1, 'in', 'cm')).toBeCloseTo(2.54, 9);
    expect(convertUnit(2.54, 'cm', 'in')).toBeCloseTo(1, 9);
    expect(convertUnit(7, 'in', 'in')).toBe(7);
  });

  it('round-trips', () => {
    expect(convertUnit(convertUnit(18, 'in', 'cm'), 'cm', 'in')).toBeCloseTo(18, 9);
  });
});
