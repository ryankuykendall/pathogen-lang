import { createRequire } from 'module'; const opentype = createRequire('/Users/ryan/claude-code-projects/svg-path-extended/package.json')('opentype.js');

// Same fetch path as playground font-loader.ts, but Node lets us set a UA
// that gets a plain TTF (no WOFF2 decode needed for this probe).
const css = await (await fetch(
  'https://fonts.googleapis.com/css2?family=Raleway:wght@400&display=swap',
  { headers: { 'User-Agent': 'curl/8.0' } }
)).text();
const url = css.match(/url\(([^)]+)\)/)[1];
const buf = await (await fetch(url)).arrayBuffer();
const font = opentype.parse(buf);

console.log('=== Font-level metadata ===');
console.log('numGlyphs:', font.numGlyphs);
console.log('unitsPerEm:', font.unitsPerEm, '| ascender:', font.ascender, '| descender:', font.descender);
console.log('names.fontFamily:', JSON.stringify(font.names.fontFamily));
console.log('tables present:', Object.keys(font.tables).join(', '));
console.log('OS/2 usWeightClass:', font.tables.os2?.usWeightClass, '| sFamilyClass:', font.tables.os2?.sFamilyClass);
console.log('ulUnicodeRange1 (block coverage bits):', font.tables.os2?.ulUnicodeRange1?.toString(2));
console.log('cmap entries (encoded chars):', Object.keys(font.tables.cmap.glyphIndexMap).length);

console.log('\n=== Iterating the glyph set blind (first 12 + some picks) ===');
const classify = (cp) => {
  if (cp === undefined) return 'unencoded (GSUB-only: ligature/alternate)';
  const ch = String.fromCodePoint(cp);
  if (/\p{Nd}/u.test(ch)) return 'digit';
  if (/\p{P}/u.test(ch)) return 'punctuation';
  if (/\p{Lu}/u.test(ch)) return 'uppercase letter';
  if (/\p{Ll}/u.test(ch)) return 'lowercase letter';
  if (/\p{S}/u.test(ch)) return 'symbol';
  if (/\p{Z}/u.test(ch)) return 'space';
  return 'other';
};
let shown = 0;
for (let i = 0; i < font.numGlyphs && shown < 12; i++) {
  const g = font.glyphs.get(i);
  const path = g.getPath(0, 0, 72);
  const contours = path.commands.filter(c => c.type === 'M').length;
  console.log(
    `#${String(i).padStart(3)} name=${(g.name ?? '?').padEnd(12)} ` +
    `U+${g.unicode?.toString(16).toUpperCase().padStart(4, '0') ?? '----'} ` +
    `adv=${g.advanceWidth} contours=${contours} cmds=${path.commands.length} ` +
    `[${classify(g.unicode)}]`
  );
  shown++;
}

console.log('\n=== Category histogram over the whole glyph set ===');
const hist = {};
for (let i = 0; i < font.numGlyphs; i++) {
  const g = font.glyphs.get(i);
  const k = classify(g.unicode);
  hist[k] = (hist[k] ?? 0) + 1;
}
console.log(hist);

console.log('\n=== A glyph found blind: raw contour points (glyph "a") ===');
const a = font.charToGlyph('a');
a.path; // force the lazy glyf parse — getContours() is undefined before this (opentype.js v1 quirk)
const contours = a.getContours();
console.log(`name=${a.name} contours=${contours.length}, first contour first 4 pts:`,
  contours[0].slice(0, 4));
