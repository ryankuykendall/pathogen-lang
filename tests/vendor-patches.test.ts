// svg2pdf's data-URI regex overflows V8's regex stack on multi-megabyte
// images (rasterized gradients in vector-mode PDF export: "Maximum call stack
// size exceeded" from String.match, 2026-09-05). The vendor build rewrites the
// payload group; these tests pin that the patch still applies to the
// installed svg2pdf, that the rewritten regex is equivalent, and that it
// survives a 40 MB payload.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  applyVendorPatches,
  patchSvg2pdfDataUriRegex,
  SVG2PDF_DATA_URI_PAYLOAD_GROUP,
  SVG2PDF_DATA_URI_PAYLOAD_GROUP_PATCHED,
} from '../scripts/lib/vendor-patches.js';

const require = createRequire(import.meta.url);
const svg2pdfSource = readFileSync(require.resolve('svg2pdf.js'), 'utf8');

/** The regex literal svg2pdf ships, extracted from its source so the test tracks upgrades. */
function shippedDataUriRegex(): RegExp {
  const idx = svg2pdfSource.indexOf(SVG2PDF_DATA_URI_PAYLOAD_GROUP);
  expect(idx).toBeGreaterThan(0);
  const start = svg2pdfSource.lastIndexOf('/^', idx);
  const literal = svg2pdfSource.slice(start, idx + SVG2PDF_DATA_URI_PAYLOAD_GROUP.length);
  return new RegExp(literal.slice(2, -2).replace(/^\^?/, '^'), 'i');
}

function patchedDataUriRegex(): RegExp {
  const patched = patchSvg2pdfDataUriRegex(svg2pdfSource).source;
  const idx = patched.indexOf(SVG2PDF_DATA_URI_PAYLOAD_GROUP_PATCHED);
  const start = patched.lastIndexOf('/^', idx);
  const literal = patched.slice(start, idx + SVG2PDF_DATA_URI_PAYLOAD_GROUP_PATCHED.length);
  return new RegExp(literal.slice(2, -2).replace(/^\^?/, '^'), 'i');
}

describe('svg2pdf data-URI regex patch', () => {
  it('applies exactly once to the installed svg2pdf', () => {
    expect(patchSvg2pdfDataUriRegex(svg2pdfSource).applied).toBe(1);
    expect(applyVendorPatches('pdf-export', svg2pdfSource).labels).toHaveLength(1);
    expect(applyVendorPatches('opentype.js', 'unrelated').labels).toEqual([]);
  });

  it('refuses a bundle where the anchor is missing or duplicated', () => {
    expect(() => applyVendorPatches('pdf-export', 'nothing here')).toThrow(/applied 0×/);
    const twice = `${SVG2PDF_DATA_URI_PAYLOAD_GROUP} ${SVG2PDF_DATA_URI_PAYLOAD_GROUP}`;
    expect(() => applyVendorPatches('pdf-export', twice)).toThrow(/applied 2×/);
  });

  it('matches the same groups as the shipped regex', () => {
    const shipped = shippedDataUriRegex();
    const patched = patchedDataUriRegex();
    const samples = [
      'data:image/png;base64,iVBORw0KGgo=',
      ' data:image/jpeg;charset=utf-8;base64,/9j/4AAQ',
      'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
      'data:image/png;base64,AAAA\nBBBB',
      'data:,',
      'https://example.com/a.png',
    ];
    for (const s of samples) {
      const a = shipped.exec(s);
      const b = patched.exec(s);
      expect(b === null).toBe(a === null);
      if (a && b) expect(Array.from(b)).toEqual(Array.from(a));
    }
  });

  it('handles a 40 MB base64 payload without overflowing the stack', () => {
    const payload = 'A'.repeat(40 * 1024 * 1024);
    const m = patchedDataUriRegex().exec(`data:image/png;base64,${payload}`);
    expect(m).not.toBeNull();
    expect(m![2]).toBe('image/png');
    expect(m![4]).toBe('base64');
    expect(m![5].length).toBe(payload.length);
  });
});
