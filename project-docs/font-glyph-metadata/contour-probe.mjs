import { createRequire } from 'module';
const opentype = createRequire('/Users/ryan/claude-code-projects/svg-path-extended/package.json')('opentype.js');

const css = await (await fetch(
  'https://fonts.googleapis.com/css2?family=Raleway:wght@400&display=swap',
  { headers: { 'User-Agent': 'curl/8.0' } }
)).text();
const buf = await (await fetch(css.match(/url\(([^)]+)\)/)[1])).arrayBuffer();
const font = opentype.parse(buf);

const a = font.charToGlyph('a');
console.log('before forcing parse: a.points =', a.points === undefined ? 'undefined (lazy)' : 'present');
a.path; // touch the lazy getter — forces glyf parse
console.log('after touching .path: getContours() length =', a.getContours()?.length);
console.log('first 3 points of contour 0:', a.getContours()[0].slice(0, 3));
console.log('bbox:', JSON.stringify(a.getBoundingBox()));
console.log('metrics:', JSON.stringify(a.getMetrics()).slice(0, 200));
