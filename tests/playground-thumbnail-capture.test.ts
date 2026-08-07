// @vitest-environment jsdom
//
// buildRenderSnapshots: the synchronous capture step of thumbnail generation.
//
// Contract under test: BOTH raster sources (square-crop thumbnail + full-
// aspect hero) are serialized to strings in one synchronous pass from the
// live SVG element. On the workspace-switch path the preview pane's #preview
// node is emptied IN PLACE moments later (svg-preview-pane.clear() — the pane
// is a singleton across switches), so any part of the render read from the
// element after an await would show the next workspace's (or empty) content.
// This bit the hero render historically: it re-cloned the live element after
// the thumbnail-upload await, producing a blank hero that overwrote the old
// workspace's good one. The raster/upload stages are not testable in jsdom
// (SVG image decode is unavailable) — they're covered by scenario 6 of
// scripts/debug-workspace-switch-undo.ts.

import { describe, expect, it, vi } from 'vitest';

import { buildRenderSnapshots } from '../playground/services/thumbnail-service.js';

vi.mock('../playground/services/api.js', () => ({
  thumbnailApi: {},
}));

const SVG_NS = 'http://www.w3.org/2000/svg';

function makePreviewSvg(width: number, height: number): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', 'preview');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Grid chrome that createSvgSnapshot must strip from captures.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const pattern = document.createElementNS(SVG_NS, 'pattern');
  pattern.setAttribute('id', 'grid-pattern');
  defs.appendChild(pattern);
  svg.appendChild(defs);
  const gridRect = document.createElementNS(SVG_NS, 'rect');
  gridRect.setAttribute('fill', 'url(#grid-pattern)');
  svg.appendChild(gridRect);

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(width / 2));
  circle.setAttribute('cy', String(height / 2));
  circle.setAttribute('r', '40');
  svg.appendChild(circle);
  return svg;
}

describe('buildRenderSnapshots (synchronous thumbnail/hero capture)', () => {
  it('captures both render sources before the source element is cleared', () => {
    const svg = makePreviewSvg(300, 200);
    const { thumbSvgString, heroSvgString } = buildRenderSnapshots(svg, { width: 300, height: 200 });

    // Simulate svg-preview-pane.clear(): the SAME node is emptied in place.
    svg.innerHTML = '';

    expect(thumbSvgString).toContain('<circle');
    expect(heroSvgString).toContain('<circle');
  });

  it('thumbnail is the centered square crop at supersampled size', () => {
    const { thumbSvgString } = buildRenderSnapshots(makePreviewSvg(300, 200), { width: 300, height: 200 });
    // crop = min(300, 200) = 200, centered: x = (300-200)/2 = 50, y = 0.
    expect(thumbSvgString).toContain('viewBox="50 0 200 200"');
    // Raster floor is 1024 (crop of 200 units supersamples up).
    expect(thumbSvgString).toContain('width="1024"');
    expect(thumbSvgString).toContain('height="1024"');
  });

  it('an explicit crop region overrides the auto center-crop', () => {
    const { thumbSvgString } = buildRenderSnapshots(
      makePreviewSvg(300, 200),
      { width: 300, height: 200 },
      { x: 10, y: 20, size: 50 },
    );
    expect(thumbSvgString).toContain('viewBox="10 20 50 50"');
  });

  it('hero is the full uncropped viewBox at source size when under the cap', () => {
    const { heroSvgString, canvasWidth, canvasHeight } = buildRenderSnapshots(makePreviewSvg(300, 200), {
      width: 300,
      height: 200,
    });
    expect(canvasWidth).toBe(300);
    expect(canvasHeight).toBe(200);
    expect(heroSvgString).toContain('viewBox="0 0 300 200"');
    // scale = min(1, 1440/300) = 1 — never upscaled beyond source units.
    expect(heroSvgString).toContain('width="300"');
    expect(heroSvgString).toContain('height="200"');
  });

  it('hero aspect-fits large canvases to the 1440px longest edge', () => {
    const { heroSvgString } = buildRenderSnapshots(makePreviewSvg(2880, 1440), { width: 2880, height: 1440 });
    // scale = 1440/2880 = 0.5 → 1440×720, same aspect ratio, full viewBox.
    expect(heroSvgString).toContain('viewBox="0 0 2880 1440"');
    expect(heroSvgString).toContain('width="1440"');
    expect(heroSvgString).toContain('height="720"');
  });

  it('captures go through createSvgSnapshot (grid chrome stripped)', () => {
    const { thumbSvgString, heroSvgString } = buildRenderSnapshots(makePreviewSvg(300, 200), {
      width: 300,
      height: 200,
    });
    expect(thumbSvgString).not.toContain('grid-pattern');
    expect(heroSvgString).not.toContain('grid-pattern');
  });
});
