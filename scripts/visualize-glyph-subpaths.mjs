#!/usr/bin/env node
// Reads an iter-2/iter-3 matrix SVG, splits each glyph in the
// underlay-fill layer into its subpaths, and re-emits each subpath
// as a separate <path> element colored by subpath INDEX within
// the glyph (0=blue, 1=orange, 2=green, 3=purple, ...).
//
// This makes the topological structure of each glyph visible:
// - 1 color = simple glyph (e.g. capital N, lowercase n)
// - 2 colors = outer + counter (e.g. lowercase a, p)
// - 3 colors = outer + 2 additive/decorative subpaths (e.g. PF capital E)
// - 4+ colors = complex (e.g. ampersand, italic letterforms)

import fs from 'node:fs';
import path from 'node:path';

const inputFile = process.argv[2];
const outputFile = process.argv[3] ?? inputFile.replace(/\.svg$/, '-subpaths.svg');
if (!inputFile) {
  console.error('Usage: visualize-glyph-subpaths.mjs <input.svg> [output.svg]');
  process.exit(1);
}

const svg = fs.readFileSync(inputFile, 'utf8');

// Palette: distinct hues, semi-transparent fill so overlapping subpaths
// blend visibly. Uses HCL-spaced hues for perceptual evenness.
const SUBPATH_COLORS = [
  '#3b82f6e0',  // 0: blue
  '#f97316e0',  // 1: orange
  '#22c55ee0',  // 2: green
  '#a855f7e0',  // 3: purple
  '#ec4899e0',  // 4: pink
  '#06b6d4e0',  // 5: cyan
  '#eab308e0',  // 6: yellow
  '#ef4444e0',  // 7: red
];

// Walk a path's d-attribute, emitting one entry per subpath with the
// subpath's d-string AND its index WITHIN ITS GLYPH (reset on every M).
function splitGlyphsAndSubpaths(d) {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [];
  const subpaths = [];
  let i = 0;
  let x = 0, y = 0, sx = 0, sy = 0;
  let glyphIdx = -1;
  let subpathIdxInGlyph = -1;
  let curD = null;
  let curIdx = 0;

  function pushSub() {
    if (curD && curD.length > 1) {  // skip just-M setup paths
      subpaths.push({ d: curD.join(' '), subpathIdxInGlyph: curIdx, glyphIdx });
    }
  }

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      if (t === 'M' || t === 'm') {
        const dx = +tokens[i + 1], dy = +tokens[i + 2];
        if (t === 'M') {
          // New glyph (absolute move). drawTo() always emits an
          // absolute M followed by a relative m; treat M as glyph
          // start, defer subpath start until the actual first m.
          pushSub();
          x = dx; y = dy;
          sx = x; sy = y;
          glyphIdx++;
          subpathIdxInGlyph = -1;
          curD = null;  // not yet in a subpath
          i += 3; continue;
        } else {
          // Relative m. Either:
          //   (a) the first m after an M (offset to subpath 0's first vertex), OR
          //   (b) a new subpath after a previous subpath's z.
          // In both cases we start a fresh curD; in (a) it's subpath 0,
          // in (b) it's subpath N+1.
          x += dx; y += dy;
          sx = x; sy = y;
          if (curD === null) {
            // Case (a): first m after M, this IS the start of subpath 0
            subpathIdxInGlyph = 0;
          } else {
            // Case (b): new subpath within same glyph
            pushSub();
            subpathIdxInGlyph++;
          }
          curIdx = subpathIdxInGlyph;
          curD = [`M ${x} ${y}`];
          i += 3; continue;
        }
      }
      if (t === 'l') { x += +tokens[i+1]; y += +tokens[i+2]; curD.push(`L ${x} ${y}`); i += 3; continue; }
      if (t === 'L') { x = +tokens[i+1]; y = +tokens[i+2]; curD.push(`L ${x} ${y}`); i += 3; continue; }
      if (t === 'q') {
        const cx = x + (+tokens[i+1]), cy = y + (+tokens[i+2]);
        x += +tokens[i+3]; y += +tokens[i+4];
        curD.push(`Q ${cx} ${cy} ${x} ${y}`);
        i += 5; continue;
      }
      if (t === 'Q') {
        const cx = +tokens[i+1], cy = +tokens[i+2];
        x = +tokens[i+3]; y = +tokens[i+4];
        curD.push(`Q ${cx} ${cy} ${x} ${y}`);
        i += 5; continue;
      }
      if (t === 'c') {
        const c1x = x + +tokens[i+1], c1y = y + +tokens[i+2];
        const c2x = x + +tokens[i+3], c2y = y + +tokens[i+4];
        x += +tokens[i+5]; y += +tokens[i+6];
        curD.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
        i += 7; continue;
      }
      if (t === 'C') {
        const c1x = +tokens[i+1], c1y = +tokens[i+2];
        const c2x = +tokens[i+3], c2y = +tokens[i+4];
        x = +tokens[i+5]; y = +tokens[i+6];
        curD.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
        i += 7; continue;
      }
      if (t === 'z' || t === 'Z') { x = sx; y = sy; curD.push('Z'); i++; continue; }
      i++;
    } else {
      i++;
    }
  }
  pushSub();
  return subpaths;
}

// Replace the underlay-fill path with per-subpath colored paths,
// hide the underlay-stroke and union-* layers entirely (visualization
// only; we want to see subpath structure cleanly).
const replaceLayer = (svgIn, layerId, replacement) => {
  const re = new RegExp(`<path id="${layerId}"[^/]*?/>`, 's');
  return svgIn.replace(re, replacement);
};

const dropLayer = (svgIn, layerId) => {
  const re = new RegExp(`<path id="${layerId}"[^/]*?/>`, 's');
  return svgIn.replace(re, '');
};

// Find the underlay-fill path
const m = svg.match(/<path id="underlay-fill"[^>]*?d="([^"]+)"[^>]*?\/>/);
if (!m) {
  console.error('Could not find underlay-fill path in input SVG');
  process.exit(1);
}
const dStr = m[1];

const allSubpaths = splitGlyphsAndSubpaths(dStr);
console.error(`Parsed ${allSubpaths.length} total subpaths`);

// Tally subpaths-per-glyph for diagnostic summary
const glyphSubpathCounts = {};
for (const s of allSubpaths) {
  glyphSubpathCounts[s.glyphIdx] = Math.max(glyphSubpathCounts[s.glyphIdx] ?? 0, s.subpathIdxInGlyph + 1);
}
const distribution = {};
for (const count of Object.values(glyphSubpathCounts)) {
  distribution[count] = (distribution[count] ?? 0) + 1;
}
console.error('Subpath count distribution:', distribution);

// Build replacement: one <path> per subpath, colored by subpath index
const subpathPaths = allSubpaths.map(s => {
  const color = SUBPATH_COLORS[s.subpathIdxInGlyph % SUBPATH_COLORS.length];
  return `<path d="${s.d}" fill="${color}" stroke="none"/>`;
}).join('\n  ');

let output = replaceLayer(svg, 'underlay-fill', subpathPaths);
// Drop the union and underlay-stroke layers — we want to see subpath
// structure in isolation, without union noise.
output = dropLayer(output, 'underlay-stroke');
output = dropLayer(output, 'union-fill');
output = dropLayer(output, 'union-stroke');

// Add a legend at the top of the SVG
const legendItems = SUBPATH_COLORS.map((c, idx) =>
  `<rect x="${340 + idx * 64}" y="14" width="14" height="14" fill="${c}"/>` +
  `<text x="${360 + idx * 64}" y="25" font-family="monospace" font-size="11" fill="#0f172a">subpath ${idx}</text>`
).join('\n  ');
output = output.replace('</svg>', `${legendItems}\n</svg>`);

// Update title to indicate this is the subpath visualization
output = output.replace(
  /text x="20" y="26"[^>]*>[^<]*</,
  m => m.replace(/>[^<]*</, '>Glyph subpath structure (each color = subpath index within glyph)<')
);
output = output.replace(
  /text x="20" y="44"[^>]*>[^<]*</,
  m => m.replace(/>[^<]*</, '>Same matrix layout as iter-2-en, but only the underlay glyph fills are shown, color-coded by subpath index.<')
);

fs.writeFileSync(outputFile, output);
console.error(`Wrote ${outputFile}`);
