// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { outlineSvgText, type OutlineOptions } from '../playground/utils/svg-text-outliner';

const __dirname = dirname(fileURLToPath(import.meta.url));

let interBuffer: ArrayBuffer;
let opentypeModule: OutlineOptions['opentype'];

beforeAll(async () => {
  const buf = readFileSync(join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf'));
  interBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

  // opentype.js ships a UMD dist that breaks under vitest's jsdom ESM
  // interop (frozen namespace) — require the CJS build directly instead.
  const require = createRequire(import.meta.url);
  const mod = require('opentype.js') as {
    parse?: (b: ArrayBuffer) => unknown;
    default?: { parse: (b: ArrayBuffer) => unknown };
  };
  opentypeModule = (typeof mod.default?.parse === 'function' ? mod.default : mod) as OutlineOptions['opentype'];
});

/** loadFont stub: resolves 'Inter' from the fixture, everything else fails. */
const loadInterOnly = async (family: string): Promise<ArrayBuffer | null> =>
  family === 'Inter' ? interBuffer : null;

function makeSvg(inner: string): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">${inner}</svg>`;
  return host.querySelector('svg') as SVGSVGElement;
}

async function outline(inner: string, opts: Partial<OutlineOptions> = {}) {
  const svg = makeSvg(inner);
  const result = await outlineSvgText(svg, {
    loadFont: loadInterOnly,
    opentype: opentypeModule,
    fallbackFamily: 'Inter',
    ...opts,
  });
  return { svg, result };
}

/** First M x/y of a path's d attribute. */
function firstMove(pathEl: Element): { x: number; y: number } {
  const d = pathEl.getAttribute('d') ?? '';
  const m = /M(-?[\d.]+)[ ,](-?[\d.]+)/.exec(d);
  expect(m, `path has a move command: ${d.slice(0, 40)}`).toBeTruthy();
  return { x: parseFloat(m![1]), y: parseFloat(m![2]) };
}

describe('outlineSvgText — basics', () => {
  it('replaces <text> with a <g> of non-empty <path> outlines', async () => {
    const { svg, result } = await outline(
      `<text x="10" y="50" font-family="Inter" font-size="16" fill="#334155" data-layer-name="caption">Hello</text>`,
    );
    expect(result.outlinedCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(svg.querySelector('text')).toBeNull();

    const group = svg.querySelector('g[data-outlined-text]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute('fill')).toBe('#334155');
    expect(group!.getAttribute('data-layer-name')).toBe('caption');

    const path = group!.querySelector('path');
    expect(path).not.toBeNull();
    expect((path!.getAttribute('d') ?? '').length).toBeGreaterThan(10);
  });

  it('removes empty <text> elements without counting them', async () => {
    const { svg, result } = await outline(`<text x="10" y="50" font-family="Inter"></text>`);
    expect(result.outlinedCount).toBe(0);
    expect(svg.querySelector('text')).toBeNull();
  });

  it('leaves no <text> behind across multiple elements', async () => {
    const { svg, result } = await outline(
      `<text x="0" y="20" font-family="Inter" font-size="12">one</text>
       <text x="0" y="40" font-family="Inter" font-size="12">two</text>`,
    );
    expect(result.outlinedCount).toBe(2);
    expect(svg.querySelectorAll('text')).toHaveLength(0);
    expect(svg.querySelectorAll('g[data-outlined-text]')).toHaveLength(2);
  });

  it('preserves per-tspan fill overrides on the run path', async () => {
    const { svg } = await outline(
      `<text x="10" y="50" font-family="Inter" font-size="14" fill="#111111"><tspan>plain</tspan><tspan fill="#ff0000" dx="4">red</tspan></text>`,
    );
    const paths = svg.querySelectorAll('g[data-outlined-text] path');
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('fill')).toBeNull();
    expect(paths[1].getAttribute('fill')).toBe('#ff0000');
  });
});

describe('outlineSvgText — layout', () => {
  it('offsets multi-line tspans (x reset + dy) vertically', async () => {
    const { svg } = await outline(
      `<text x="10" y="20" font-family="Inter" font-size="12"><tspan x="10">line one</tspan><tspan x="10" dy="16">line two</tspan></text>`,
    );
    const paths = svg.querySelectorAll('g[data-outlined-text] path');
    expect(paths).toHaveLength(2);
    const first = firstMove(paths[0]);
    const second = firstMove(paths[1]);
    expect(second.y).toBeGreaterThan(first.y + 8);
  });

  it('shifts outlines down for dominant-baseline="hanging"', async () => {
    const alphabetic = await outline(`<text x="10" y="50" font-family="Inter" font-size="16">Ag</text>`);
    const hanging = await outline(
      `<text x="10" y="50" font-family="Inter" font-size="16" dominant-baseline="hanging">Ag</text>`,
    );
    const yAlpha = firstMove(alphabetic.svg.querySelector('g[data-outlined-text] path')!).y;
    const yHang = firstMove(hanging.svg.querySelector('g[data-outlined-text] path')!).y;
    // Hanging baseline sits ~1 ascender below the alphabetic position
    expect(yHang - yAlpha).toBeGreaterThan(8);
    expect(yHang - yAlpha).toBeLessThan(20);
  });

  it('shifts text-anchor="end" left by the advance width', async () => {
    const plain = await outline(`<text x="100" y="50" font-family="Inter" font-size="14">Anchor me</text>`);
    const end = await outline(
      `<text x="100" y="50" font-family="Inter" font-size="14" text-anchor="end">Anchor me</text>`,
    );
    const xPlain = firstMove(plain.svg.querySelector('g[data-outlined-text] path')!).x;
    const xEnd = firstMove(end.svg.querySelector('g[data-outlined-text] path')!).x;
    expect(xEnd).toBeLessThan(xPlain - 20);
  });

  it('widens the advance with letter-spacing', async () => {
    const normal = await outline(
      `<text x="100" y="50" font-family="Inter" font-size="14" text-anchor="end">Spacing</text>`,
    );
    const spaced = await outline(
      `<text x="100" y="50" font-family="Inter" font-size="14" text-anchor="end" letter-spacing="3">Spacing</text>`,
    );
    const xNormal = firstMove(normal.svg.querySelector('g[data-outlined-text] path')!).x;
    const xSpaced = firstMove(spaced.svg.querySelector('g[data-outlined-text] path')!).x;
    // 6 inter-glyph gaps × 3px — anchored at the same end point, so the start shifts left
    expect(xNormal - xSpaced).toBeGreaterThan(10);
  });

  it('outlines highlighted-code lines: multi-tspan runs with per-token fills', async () => {
    // The export legend's highlighted code block: each line's FIRST tspan
    // carries x (+ dy after line 0); sibling tspans continue the pen and
    // carry their own fill attribute.
    const { svg, result } = await outline(
      `<text x="10" y="20" font-family="Inter" font-size="12" fill="#1c1722" style="white-space: pre">` +
        `<tspan x="10" fill="#6d3aa6">let</tspan><tspan> rings = </tspan><tspan fill="#d97a6e">5</tspan>` +
        `<tspan x="10" dy="14" fill="#9087a0">// note</tspan>` +
        `</text>`,
    );
    expect(result.warnings).toEqual([]);
    const paths = svg.querySelectorAll('g[data-outlined-text] path');
    expect(paths).toHaveLength(4);

    // Per-token fills survive (group carries the base #1c1722)
    expect(svg.querySelector('g[data-outlined-text]')!.getAttribute('fill')).toBe('#1c1722');
    expect(paths[0].getAttribute('fill')).toBe('#6d3aa6');
    expect(paths[1].getAttribute('fill')).toBeNull();
    expect(paths[2].getAttribute('fill')).toBe('#d97a6e');
    expect(paths[3].getAttribute('fill')).toBe('#9087a0');

    // Pen advances across the first line's three runs…
    const x0 = firstMove(paths[0]).x;
    const x1 = firstMove(paths[1]).x;
    const x2 = firstMove(paths[2]).x;
    expect(x1).toBeGreaterThan(x0);
    expect(x2).toBeGreaterThan(x1);

    // …and the second line resets to x=10, one line-gap lower.
    const line2 = firstMove(paths[3]);
    expect(line2.x).toBeLessThan(x1);
    expect(line2.y).toBeGreaterThan(firstMove(paths[0]).y + 8);
  });

  it('preserves leading whitespace in white-space: pre runs', async () => {
    const flush = await outline(
      `<text x="10" y="50" font-family="Inter" font-size="12" style="white-space: pre"><tspan x="10">code</tspan></text>`,
    );
    const indented = await outline(
      `<text x="10" y="50" font-family="Inter" font-size="12" style="white-space: pre"><tspan x="10">    code</tspan></text>`,
    );
    const xFlush = firstMove(flush.svg.querySelector('g[data-outlined-text] path')!).x;
    const xIndented = firstMove(indented.svg.querySelector('g[data-outlined-text] path')!).x;
    expect(xIndented).toBeGreaterThan(xFlush + 5);
  });
});

describe('outlineSvgText — fallbacks', () => {
  it('falls back to the fallback family with a warning', async () => {
    const { svg, result } = await outline(
      `<text x="10" y="50" font-family="'NoSuchFont', sans-serif" font-size="14">fallback</text>`,
    );
    expect(result.outlinedCount).toBe(1);
    expect(svg.querySelector('text')).toBeNull();
    expect(result.warnings.some((w) => w.includes('NoSuchFont') && w.includes('Inter'))).toBe(true);
  });

  it('leaves <text> in place with a warning when no font loads at all', async () => {
    const { svg, result } = await outline(
      `<text x="10" y="50" font-family="NoSuchFont" font-size="14">stuck</text>`,
      { loadFont: async () => null },
    );
    expect(result.outlinedCount).toBe(0);
    expect(svg.querySelector('text')).not.toBeNull();
    expect(result.warnings.some((w) => w.includes('left as live text'))).toBe(true);
  });

  it('uses a same-family regular weight when the requested weight is unavailable', async () => {
    const loadFont = async (family: string, weight: number): Promise<ArrayBuffer | null> =>
      family === 'Inter' && weight === 400 ? interBuffer : null;
    const { result } = await outline(
      `<text x="10" y="50" font-family="Inter" font-weight="600" font-size="14">bold-ish</text>`,
      { loadFont },
    );
    expect(result.outlinedCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});
