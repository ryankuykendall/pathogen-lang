// Export brand chrome shared by the export modal and the breadcrumb size
// estimate: the "Created in pathogen.studio" brand text and the watermark
// group appended to legend-less exports. Extracted from export-modal.ts so
// the estimated default-export byte size stays byte-identical to the file
// the modal actually downloads — one code path, no drift.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Approximate glyph width as a fraction of font size (monospace layout heuristic). */
export const CHAR_WIDTH_FACTOR = 0.6;

// Base (unscaled) typography for the brand line.
const BASE_BRAND_FONT_SIZE = 9;
const BASE_SMALL_FONT_SIZE = 11;

/**
 * Legend/watermark scale factor derived from canvas dimensions:
 * clamp(0.2, 8, shortSide / 2000).
 */
export function computeExportScaleFactor(canvasWidth: number, canvasHeight: number): number {
  const shortSide = Math.min(canvasWidth, canvasHeight);
  return Math.max(0.2, Math.min(8, shortSide / 2000));
}

/**
 * "Created in pathogen.studio" as one <text> with two tspans (Inter +
 * Baumans). y is the text baseline. Shared by the legend footer and the
 * watermark; the PDF cover sheet keeps its own pt-coordinate copy.
 */
export function createBrandText(
  x: number,
  y: number,
  brandFontSize: number,
  pathogenFontSize: number,
  anchor?: string,
): SVGTextElement {
  const brandText = document.createElementNS(SVG_NS, 'text');
  brandText.setAttribute('x', String(x));
  brandText.setAttribute('y', String(y));
  brandText.setAttribute('dominant-baseline', 'auto');
  brandText.setAttribute('fill', '#94a3b8');
  if (anchor) brandText.setAttribute('text-anchor', anchor);

  const brandSpan1 = document.createElementNS(SVG_NS, 'tspan');
  brandSpan1.setAttribute('font-size', String(brandFontSize));
  brandSpan1.setAttribute('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
  brandSpan1.textContent = 'Created in';

  const brandSpan2 = document.createElementNS(SVG_NS, 'tspan');
  brandSpan2.setAttribute('font-size', String(pathogenFontSize));
  brandSpan2.setAttribute('font-weight', '400');
  brandSpan2.setAttribute('font-family', "'Baumans', cursive");
  brandSpan2.setAttribute('dx', String(brandFontSize * CHAR_WIDTH_FACTOR));
  brandSpan2.textContent = 'pathogen.studio';

  brandText.appendChild(brandSpan1);
  brandText.appendChild(brandSpan2);
  return brandText;
}

/**
 * Brand watermark for legend-less exports: the same two-tspan pattern as
 * the legend footer, tucked into the artwork's bottom-right corner. Fixed
 * and non-interactive — it IS the export's attribution.
 */
export function buildWatermarkGroup(canvasWidth: number, canvasHeight: number, scaleFactor: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', 'pathogen-watermark');

  const inset = 10 * scaleFactor;
  const brandText = createBrandText(
    canvasWidth - inset,
    canvasHeight - inset,
    BASE_BRAND_FONT_SIZE * scaleFactor,
    BASE_SMALL_FONT_SIZE * scaleFactor * 1.2,
    'end',
  );
  g.appendChild(brandText);
  return g;
}
