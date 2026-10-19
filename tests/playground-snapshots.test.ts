// @vitest-environment jsdom
//
// Workspace snapshots, playground side (docs/snapshots.md):
//   - captureSnapshot clones the live preview SYNCHRONOUSLY into the stored
//     SVG + a card-sized copy, with the editor chrome stripped, and pairs it
//     with the rendered code (not the editor's newer text). Emptying the
//     preview right after the call (what a workspace switch does) must not
//     change what was captured.
//   - firstChangedLine drives the "you've edited line N" note.
//   - parseSnapshotSvg turns stored (untrusted) SVG into an element with
//     nothing able to run or navigate before it enters the app document.

import { describe, expect, it } from 'vitest';

import { captureSnapshot, firstChangedLine, SNAPSHOT_CARD_MAX } from '../playground/services/snapshot-capture.js';
import { parseSnapshotSvg } from '../playground/utils/sanitize-svg-dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makePreview(width: number, height: number): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `<svg xmlns="${SVG_NS}" id="preview" width="${width}" height="${height}" viewBox="40 20 100 50" style="transform: scale(2)">
    <defs><pattern id="grid-pattern"><path id="grid-path" d="M 0 0 L 10 0"/></pattern></defs>
    <rect id="preview-bg" width="100%" height="100%" fill="#ffffff"/>
    <rect id="preview-grid" width="100%" height="100%" fill="url(#grid-pattern)"/>
    <path id="art" d="M 10 10 L 90 90" stroke="black"/>
    <circle data-interactive="true" cx="5" cy="5" r="3"/>
    <g id="crop-overlay"><rect width="10" height="10"/></g>
  </svg>`;
  document.body.appendChild(host);
  return host.querySelector('svg') as unknown as SVGSVGElement;
}

describe('captureSnapshot', () => {
  it('returns null without a successful render', () => {
    const preview = makePreview(400, 200);
    expect(captureSnapshot(preview, { renderedCode: null, width: 400, height: 200, background: '#fff' })).toBeNull();
    expect(captureSnapshot(null, { renderedCode: 'x', width: 400, height: 200, background: '#fff' })).toBeNull();
  });

  it('stores an export-ready SVG: full viewBox, chosen background, no grid / chrome / pan-zoom', () => {
    const preview = makePreview(400, 200);
    const cap = captureSnapshot(preview, {
      renderedCode: 'circle(1, 1, 1);',
      width: 400,
      height: 200,
      background: '#123456',
    })!;
    const doc = new DOMParser().parseFromString(cap.svg, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(svg.hasAttribute('style')).toBe(false);
    expect(svg.hasAttribute('id')).toBe(false);
    expect(doc.querySelector('#preview-bg')!.getAttribute('fill')).toBe('#123456');
    expect(doc.querySelector('#preview-grid')).toBeNull();
    expect(doc.querySelector('#grid-pattern')).toBeNull();
    expect(doc.querySelector('[data-interactive]')).toBeNull();
    expect(doc.querySelector('#crop-overlay')).toBeNull();
    expect(doc.querySelector('#art')!.getAttribute('d')).toBe('M 10 10 L 90 90');
    expect(cap.svg.startsWith('<svg')).toBe(true); // what the API's SVG check accepts
    expect(cap).toMatchObject({ code: 'circle(1, 1, 1);', width: 400, height: 200, background: '#123456' });
  });

  it('sizes the card copy to fit 512 px on the long edge, keeping the aspect ratio', () => {
    const cap = captureSnapshot(makePreview(400, 200), { renderedCode: 'x', width: 1600, height: 800, background: '#fff' })!;
    expect([cap.cardWidth, cap.cardHeight]).toEqual([SNAPSHOT_CARD_MAX, 256]);
    const card = new DOMParser().parseFromString(cap.cardSvg, 'image/svg+xml').documentElement;
    expect([card.getAttribute('width'), card.getAttribute('height')]).toEqual(['512', '256']);
    // Small artwork is never upscaled.
    const small = captureSnapshot(makePreview(100, 50), { renderedCode: 'x', width: 100, height: 50, background: '#fff' })!;
    expect([small.cardWidth, small.cardHeight]).toEqual([100, 50]);
  });

  it('is unaffected by the preview being emptied right after the call', () => {
    const preview = makePreview(400, 200);
    const cap = captureSnapshot(preview, { renderedCode: 'x', width: 400, height: 200, background: '#fff' })!;
    preview.replaceChildren(); // svg-preview-pane.clear() on workspace switch
    expect(cap.svg).toContain('M 10 10 L 90 90');
    expect(cap.cardSvg).toContain('M 10 10 L 90 90');
  });
});

describe('firstChangedLine', () => {
  it('is null when the editor matches the render', () => {
    expect(firstChangedLine('a\nb\nc', 'a\nb\nc')).toBeNull();
  });
  it('reports the first differing line, 1-based, including added and removed lines', () => {
    expect(firstChangedLine('a\nb\nc', 'a\nB\nc')).toBe(2);
    expect(firstChangedLine('a\nb', 'a\nb\nc')).toBe(3);
    expect(firstChangedLine('a\nb\nc', 'a\nb')).toBe(3);
    expect(firstChangedLine('a', 'x')).toBe(1);
  });
});

describe('parseSnapshotSvg', () => {
  const hostile = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10" onload="alert(1)">
    <script>alert(2)</script>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
    <a href="javascript:alert(3)"><rect width="5" height="5" onclick="alert(4)"/></a>
    <use xlink:href="https://evil.example/x.svg#a"/>
    <use href="#keep"/>
    <image href="data:image/png;base64,AAAA"/>
    <animate attributeName="href" to="javascript:alert(5)"/>
    <set attributeName="fill" to="red"/>
    <path id="keep" d="M 0 0 L 5 5"/>
  </svg>`;

  it('removes scripts, foreignObject, handlers, javascript: and external hrefs', () => {
    const svg = parseSnapshotSvg(hostile);
    expect(svg.ownerDocument).toBe(document);
    expect(svg.querySelector('script')).toBeNull();
    expect(svg.querySelector('foreignObject')).toBeNull();
    expect(svg.getAttribute('onload')).toBeNull();
    expect(svg.querySelector('rect')!.getAttribute('onclick')).toBeNull();
    expect(svg.querySelector('a')!.getAttribute('href')).toBeNull();
    const uses = svg.querySelectorAll('use');
    expect(uses[0].getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBeNull();
    expect(uses[1].getAttribute('href')).toBe('#keep');
    expect(svg.querySelector('image')!.getAttribute('href')).toBe('data:image/png;base64,AAAA');
    // An animation that would rewrite an href goes; a harmless one stays.
    expect(svg.querySelectorAll('animate')).toHaveLength(0);
    expect(svg.querySelector('set')!.getAttribute('attributeName')).toBe('fill');
    expect(svg.querySelector('#keep')!.getAttribute('d')).toBe('M 0 0 L 5 5');
  });

  it('strips @import and external url() from styles, keeping fragment and data: references', () => {
    const svg = parseSnapshotSvg(`<svg xmlns="${SVG_NS}">
      <style>@import url(https://evil.example/a.css); .a { fill: url("#grad"); background: url(https://evil.example/p.png); } .b { mask: url('data:image/svg+xml,x'); }</style>
      <rect style="fill: url('#g2'); background-image: url( http://evil.example/t.gif )" width="1" height="1"/>
    </svg>`);
    const css = svg.querySelector('style')!.textContent!;
    expect(css).not.toContain('@import');
    expect(css).not.toContain('evil.example');
    expect(css).toContain('url("#grad")');
    expect(css).toContain("url('data:image/svg+xml,x')");
    const style = svg.querySelector('rect')!.getAttribute('style')!;
    expect(style).toContain("url('#g2')");
    expect(style).not.toContain('evil.example');
  });

  it('rejects text that is not an SVG document', () => {
    expect(() => parseSnapshotSvg('<html><body/></html>')).toThrow('not a valid SVG');
    expect(() => parseSnapshotSvg('<svg')).toThrow('not a valid SVG');
  });
});
