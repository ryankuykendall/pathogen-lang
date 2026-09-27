// Compare two PNG renders of the same program at sampled points: a ring of
// radius 60 (of 200 user units, i.e. 120 px at scale 2) around the picture
// centre, 5° steps that never land on a 1° wedge boundary. Prints mean / p95 /
// max per-channel difference (premultiplied) and the alpha at the four corners,
// which is where a tile anchored at (0, 0) instead of the origin shows up first.
//   node project-docs/placement-audit/verify/d5/compare-png.mjs a.png b.png
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [a, b] = process.argv.slice(2).map((f) => PNG.sync.read(readFileSync(f)));
if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch');
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
const cx = a.width / 2, cy = a.height / 2, r = a.width * 0.3;
const d = [];
for (let deg = 2.5; deg < 360; deg += 5) {
  const x = Math.round(cx + r * Math.cos((deg * Math.PI) / 180));
  const y = Math.round(cy + r * Math.sin((deg * Math.PI) / 180));
  const pa = px(a, x, y), pb = px(b, x, y);
  for (let ch = 0; ch < 3; ch++) d.push(Math.abs((pa[ch] * pa[3]) / 255 - (pb[ch] * pb[3]) / 255));
  d.push(Math.abs(pa[3] - pb[3]));
}
d.sort((m, n) => m - n);
const mean = d.reduce((m, n) => m + n, 0) / d.length;
console.log(`ring: mean ${mean.toFixed(1)}, p95 ${d[Math.floor(d.length * 0.95)]}, max ${d[d.length - 1]} (of 255)`);
const corners = [[2, 2], [a.width - 3, 2], [2, a.height - 3], [a.width - 3, a.height - 3]];
console.log('corner alpha A:', corners.map(([x, y]) => px(a, x, y)[3]).join(' '), ' B:', corners.map(([x, y]) => px(b, x, y)[3]).join(' '));
