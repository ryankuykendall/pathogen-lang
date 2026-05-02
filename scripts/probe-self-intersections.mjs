#!/usr/bin/env node
// Renders a single glyph alone and counts self-intersections by walking
// the underlay path and pairing every non-adjacent segment combination.
// Reports raw count + first few self-intersection points for inspection.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const fontFile = args[0];
const glyphChar = args[1] ?? 'e';
const fontFamily = args[2] ?? 'PlayfairDisplay-Bold';

if (!fontFile) {
  console.error('Usage: probe-self-intersections.mjs <font-file> [glyph-char] [font-family]');
  process.exit(1);
}

const tmpFile = '/Users/ryan/claude-code-projects/svg-path-extended/.probe-glyph.pathogen';
const tmpSvg = '/tmp/probe-glyph.svg';
const source = `@font "${fontFile}"
let styles = \${ font-family: ${fontFamily}; font-size: 100; };
let glyphs = PathBlock.fromGlyph("${glyphChar}", styles);
let g0 = glyphs[0];
let bg = PathLayer('bg') \${ fill: '#fefce8'; stroke: none; };
layer('bg').apply { rect(0, 0, 400, 200); }
let glyph_layer = PathLayer('glyph') \${ fill: '#1e3a8a40'; stroke: '#06b6d4'; stroke-width: 0.3; };
layer('glyph').apply { g0.drawTo(80, 150); }
`;
writeFileSync(tmpFile, source);
spawnSync('npx', ['tsx', 'src/cli.ts', `--src=${tmpFile}`, `--output-svg-file=${tmpSvg}`,
  '--viewBox=0 0 400 200', '--width=400', '--height=200'], { stdio: 'inherit' });

const svg = readFileSync(tmpSvg, 'utf8');
const m = svg.match(/<path id="glyph" d="([^"]+)"/);
if (!m) { console.error('No glyph path'); process.exit(1); }
const d = m[1];

// Parse path into absolute-coord segments (lines and quadratics, since fonts
// generally produce only those).
const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [];
const segs = [];
let i = 0, x = 0, y = 0, sx = 0, sy = 0;
while (i < tokens.length) {
  const t = tokens[i];
  if (/[A-Za-z]/.test(t)) {
    if (t === 'M' || t === 'm') {
      const dx = +tokens[i+1], dy = +tokens[i+2];
      x = t === 'M' ? dx : x + dx;
      y = t === 'M' ? dy : y + dy;
      sx = x; sy = y;
      i += 3; continue;
    }
    if (t === 'l') { const ex = x + +tokens[i+1], ey = y + +tokens[i+2]; segs.push({type:'L', x0:x, y0:y, x1:ex, y1:ey}); x = ex; y = ey; i += 3; continue; }
    if (t === 'L') { const ex = +tokens[i+1], ey = +tokens[i+2]; segs.push({type:'L', x0:x, y0:y, x1:ex, y1:ey}); x = ex; y = ey; i += 3; continue; }
    if (t === 'q') { const cx = x + +tokens[i+1], cy = y + +tokens[i+2]; const ex = x + +tokens[i+3], ey = y + +tokens[i+4]; segs.push({type:'Q', x0:x, y0:y, cx, cy, x1:ex, y1:ey}); x = ex; y = ey; i += 5; continue; }
    if (t === 'Q') { const cx = +tokens[i+1], cy = +tokens[i+2]; const ex = +tokens[i+3], ey = +tokens[i+4]; segs.push({type:'Q', x0:x, y0:y, cx, cy, x1:ex, y1:ey}); x = ex; y = ey; i += 5; continue; }
    if (t === 'z' || t === 'Z') {
      if (Math.abs(x - sx) > 1e-6 || Math.abs(y - sy) > 1e-6) {
        segs.push({type:'L', x0:x, y0:y, x1:sx, y1:sy});
      }
      x = sx; y = sy; i++; continue;
    }
    i++;
  } else { i++; }
}

console.log(`Glyph "${glyphChar}" parsed: ${segs.length} segments`);

// Naive line-line intersection
function intersectLL(a, b) {
  const ax = a.x1 - a.x0, ay = a.y1 - a.y0;
  const bx = b.x1 - b.x0, by = b.y1 - b.y0;
  const denom = ax * by - ay * bx;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = b.x0 - a.x0, dy = b.y0 - a.y0;
  const tA = (dx * by - dy * bx) / denom;
  const tB = (dx * ay - dy * ax) / denom;
  if (tA < 1e-6 || tA > 1 - 1e-6 || tB < 1e-6 || tB > 1 - 1e-6) return null;
  return { tA, tB, point: { x: a.x0 + tA * ax, y: a.y0 + tA * ay } };
}

// Sample a quadratic curve into N points for crude intersection detection.
function sampleQ(s, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    pts.push({ x: u*u*s.x0 + 2*u*t*s.cx + t*t*s.x1, y: u*u*s.y0 + 2*u*t*s.cy + t*t*s.y1, t });
  }
  return pts;
}

function getLineSegmentsFromQuadratic(s, n=20) {
  const pts = sampleQ(s, n);
  const lines = [];
  for (let k = 0; k < pts.length - 1; k++) {
    lines.push({type:'L', x0:pts[k].x, y0:pts[k].y, x1:pts[k+1].x, y1:pts[k+1].y, _origT0: pts[k].t, _origT1: pts[k+1].t});
  }
  return lines;
}

function flattenSeg(s) { return s.type === 'L' ? [s] : getLineSegmentsFromQuadratic(s); }

const flatSegs = segs.map(flattenSeg); // array of arrays — flatSegs[i] = lines for original seg i

let crossings = [];
for (let i = 0; i < flatSegs.length; i++) {
  for (let j = i + 1; j < flatSegs.length; j++) {
    // Skip adjacency: j == i+1 in original sequence, OR i == 0 && j == flatSegs.length-1
    const adjacent = (j === i + 1) || (i === 0 && j === flatSegs.length - 1);
    if (adjacent) continue;
    for (const lineA of flatSegs[i]) {
      for (const lineB of flatSegs[j]) {
        const ix = intersectLL(lineA, lineB);
        if (ix) crossings.push({ origI: i, origJ: j, pt: ix.point });
      }
    }
  }
}

// Dedupe nearby crossings (likely sample artifacts of curve flattening)
const deduped = [];
for (const c of crossings) {
  let dup = false;
  for (const d of deduped) {
    if (Math.abs(c.pt.x - d.pt.x) < 0.5 && Math.abs(c.pt.y - d.pt.y) < 0.5 && c.origI === d.origI && c.origJ === d.origJ) { dup = true; break; }
  }
  if (!dup) deduped.push(c);
}
console.log(`Self-intersections (deduped): ${deduped.length}`);
deduped.slice(0, 10).forEach(c => {
  console.log(`  seg[${c.origI}] x seg[${c.origJ}] at (${c.pt.x.toFixed(3)}, ${c.pt.y.toFixed(3)})`);
});
