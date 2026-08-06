// Byte size of the default-settings Export → SVG file, computed without
// opening the export modal. Mirrors export-modal's download pipeline exactly
// (snapshot → watermark → font <style> → XML prolog + XMLSerializer) so the
// number is byte-identical to the downloaded file once the chrome fonts are
// cached. Path optimization is legitimately skipped: the default export has
// exportPrecision null, which makes _optimizeArtworkPaths a no-op.

import { createSvgSnapshot } from './svg-snapshot.js';
import { buildWatermarkGroup, computeExportScaleFactor } from './export-chrome.js';
import { injectFontRules } from './export-fonts.js';

export interface ExportSizeOptions {
  width: number;
  height: number;
  background: string;
  /** Resolved chrome @font-face rules; pass [] while the fetch is pending. */
  fontRules: string[];
}

/**
 * The exact file content that Export → SVG with default settings (watermark,
 * no legend, grid off, precision off) would download right now.
 */
export function buildDefaultExportSvgString(previewSvg: SVGElement, opts: ExportSizeOptions): string {
  const { width, height, background, fontRules } = opts;

  const clone = createSvgSnapshot(previewSvg, {
    includeGrid: false,
    background,
    viewBox: `0 0 ${width} ${height}`,
  });

  clone.appendChild(buildWatermarkGroup(width, height, computeExportScaleFactor(width, height)));

  // Parity with _prepareExportClone (a no-op for the watermark, which has no
  // interactive chrome — only the legend does).
  clone.querySelectorAll('[data-interactive="true"]').forEach((el) => el.remove());

  injectFontRules(clone, fontRules);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** UTF-8 byte length of that file — matches the download's Blob.size. */
export function computeDefaultExportSvgBytes(previewSvg: SVGElement, opts: ExportSizeOptions): number {
  return new TextEncoder().encode(buildDefaultExportSvgString(previewSvg, opts)).length;
}
