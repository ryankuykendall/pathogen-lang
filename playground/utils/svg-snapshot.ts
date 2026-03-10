/**
 * Create a clean SVG snapshot by cloning the live preview SVG.
 *
 * Strips grid elements, UI chrome (crop overlay), inline styles, and ID
 * collisions. Resets viewBox to full canvas (removing zoom/pan state).
 */

interface SnapshotOptions {
  includeGrid?: boolean;
  gridColor?: string;
  width?: number;
  height?: number;
  viewBox?: string;
  background?: string;
}

export function createSvgSnapshot(svgElement: SVGElement, options: SnapshotOptions = {}): SVGElement {
  const clone = svgElement.cloneNode(true) as SVGElement;

  // Strip grid elements — or make them visible if includeGrid
  if (options.includeGrid) {
    const gridRect = clone.querySelector('#preview-grid') as SVGElement | null;
    if (gridRect) gridRect.style.display = 'block';

    // Rename grid pattern ID to avoid collision with live SVG across shadow DOMs
    // (Chrome resolves url(#id) at document level, not per shadow root)
    const gridPattern = clone.querySelector('#grid-pattern');
    if (gridPattern) {
      gridPattern.setAttribute('id', 'snapshot-grid');
      if (gridRect) gridRect.setAttribute('fill', 'url(#snapshot-grid)');
    }

    if (options.gridColor) {
      const gridPath = clone.querySelector('#grid-path');
      if (gridPath) gridPath.setAttribute('stroke', options.gridColor);
    }
  } else {
    // Remove grid pattern from defs
    const defs = clone.querySelector('defs');
    if (defs) {
      const gridPattern = defs.querySelector('pattern[id*="grid"]');
      if (gridPattern) gridPattern.remove();
      if (defs.children.length === 0) defs.remove();
    }
    // Remove grid rect
    clone.querySelectorAll('rect[fill^="url(#"]').forEach((rect) => {
      const fill = rect.getAttribute('fill');
      if (fill && fill.includes('grid')) rect.remove();
    });
  }

  // Strip UI chrome
  const cropOverlay = clone.querySelector('#crop-overlay');
  if (cropOverlay) cropOverlay.remove();

  // Strip inline positioning styles from DOM placement
  clone.removeAttribute('style');

  // Prevent ID collision with live SVG
  clone.removeAttribute('id');

  // Derive canvas dimensions from the SVG's own attributes
  const canvasWidth = parseInt(clone.getAttribute('width') || '') || 200;
  const canvasHeight = parseInt(clone.getAttribute('height') || '') || 200;

  // Reset viewBox (removes zoom/pan state), or use override
  clone.setAttribute('viewBox', options.viewBox || `0 0 ${canvasWidth} ${canvasHeight}`);

  // Apply dimension overrides
  if (options.width != null) clone.setAttribute('width', String(options.width));
  if (options.height != null) clone.setAttribute('height', String(options.height));

  // Apply background override
  if (options.background != null) {
    const bg = clone.querySelector('#preview-bg');
    if (bg) bg.setAttribute('fill', options.background);
  }

  return clone;
}
