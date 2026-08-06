// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { buildDefaultExportSvgString, computeDefaultExportSvgBytes } from '../playground/utils/svg-export-size.ts';

const NS = 'http://www.w3.org/2000/svg';

/**
 * A minimal stand-in for the playground's live preview <svg id="preview">:
 * defs with the grid pattern plus a surviving gradient, background rect,
 * grid rect, and one artwork path.
 */
function buildPreviewFixture(): SVGElement {
  const svg = document.createElementNS(NS, 'svg') as SVGElement;
  svg.setAttribute('id', 'preview');
  svg.setAttribute('width', '300');
  svg.setAttribute('height', '200');
  svg.setAttribute('viewBox', '0 0 300 200');

  const defs = document.createElementNS(NS, 'defs');
  const gridPattern = document.createElementNS(NS, 'pattern');
  gridPattern.setAttribute('id', 'grid-pattern');
  defs.appendChild(gridPattern);
  // Non-grid defs content so <defs> survives the snapshot's grid strip
  const gradient = document.createElementNS(NS, 'linearGradient');
  gradient.setAttribute('id', 'g1');
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('id', 'preview-bg');
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);

  const gridRect = document.createElementNS(NS, 'rect');
  gridRect.setAttribute('id', 'preview-grid');
  gridRect.setAttribute('fill', 'url(#grid-pattern)');
  svg.appendChild(gridRect);

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M 0 0 L 100 0 L 100 100 Z');
  svg.appendChild(path);

  return svg;
}

const baseOpts = { width: 300, height: 200, background: '#f5f5f5', fontRules: [] };

describe('buildDefaultExportSvgString', () => {
  it('produces the export file shape: prolog, no grid, watermark, background override, reset viewBox', () => {
    const out = buildDefaultExportSvgString(buildPreviewFixture(), baseOpts);

    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
    // Grid pattern and grid rect are stripped (default export forces grid off)
    expect(out).not.toContain('grid-pattern');
    expect(out).not.toContain('preview-grid');
    // Watermark chrome is appended — it is part of the exported bytes
    expect(out).toContain('id="pathogen-watermark"');
    expect(out).toContain('Created in');
    expect(out).toContain('pathogen.studio');
    // Store background overrides the live #preview-bg fill
    expect(out).toContain('fill="#f5f5f5"');
    expect(out).not.toContain('#ffffff');
    // viewBox reset from store dims; artwork untouched
    expect(out).toContain('viewBox="0 0 300 200"');
    expect(out).toContain('d="M 0 0 L 100 0 L 100 100 Z"');
    // Snapshot strips the live element's id
    expect(out).not.toContain('id="preview"');
  });

  it('does not mutate the source SVG', () => {
    const fixture = buildPreviewFixture();
    const before = fixture.outerHTML;
    buildDefaultExportSvgString(fixture, baseOpts);
    expect(fixture.outerHTML).toBe(before);
  });
});

describe('computeDefaultExportSvgBytes', () => {
  it('counts UTF-8 bytes of the built string', () => {
    const fixture = buildPreviewFixture();
    const str = buildDefaultExportSvgString(fixture, baseOpts);
    expect(computeDefaultExportSvgBytes(buildPreviewFixture(), baseOpts)).toBe(new TextEncoder().encode(str).length);
  });

  it('counts multi-byte characters as their UTF-8 length, not UTF-16 code units', () => {
    const fixture = buildPreviewFixture();
    const text = document.createElementNS(NS, 'text');
    text.textContent = '日本語'; // 3 chars, 9 UTF-8 bytes
    fixture.appendChild(text);

    const plain = computeDefaultExportSvgBytes(buildPreviewFixture(), baseOpts);
    const withText = computeDefaultExportSvgBytes(fixture, baseOpts);
    // <text>日本語</text> = tags "<text>"+"</text>" (13 bytes) + 3 CJK chars
    // at 3 UTF-8 bytes each (9) — 22 total, not the 16 String.length implies.
    expect(withText - plain).toBe(13 + 9);
  });

  it('changes when the background changes', () => {
    const a = computeDefaultExportSvgBytes(buildPreviewFixture(), baseOpts);
    const b = computeDefaultExportSvgBytes(buildPreviewFixture(), {
      ...baseOpts,
      background: 'oklch(0.7 0.1 200)',
    });
    const delta = 'oklch(0.7 0.1 200)'.length - '#f5f5f5'.length;
    expect(b - a).toBe(delta);
  });

  it('grows by exactly the injected font rule plus its <style> wrapper', () => {
    const rule = "@font-face {\n  font-family: 'Baumans';\n  src: url(data:font/woff2;base64,AAAA) format('woff2');\n}";
    const without = computeDefaultExportSvgBytes(buildPreviewFixture(), baseOpts);
    const withRule = computeDefaultExportSvgBytes(buildPreviewFixture(), {
      ...baseOpts,
      fontRules: [rule],
    });
    // The fixture's <defs> survives (gradient), so injection adds one
    // <style>…</style> child — nothing else moves.
    const wrapperBytes = new TextEncoder().encode(`<style>${rule}</style>`).length;
    expect(withRule - without).toBe(wrapperBytes);
  });
});
