import { createRequire } from 'module';
const opentype = createRequire('/Users/ryan/claude-code-projects/svg-path-extended/package.json')('opentype.js');

async function loadFont(family) {
  const css = await (await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`,
    { headers: { 'User-Agent': 'curl/8.0' } }
  )).text();
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
  const buf = await (await fetch(urls[0])).arrayBuffer();
  return { font: opentype.parse(buf), cssBlocks: urls.length, bytes: buf.byteLength };
}

const SCRIPTS = ['Han','Hiragana','Katakana','Arabic','Cyrillic','Latin','Greek','Hangul'];
function classify(cp) {
  if (cp === undefined) return 'UNENCODED (GSUB-only)';
  const ch = String.fromCodePoint(cp);
  for (const s of SCRIPTS) if (new RegExp(`\\p{Script=${s}}`, 'u').test(ch)) {
    if (/\p{Nd}/u.test(ch)) return s + ' digit';
    return s;
  }
  if (/\p{Nd}/u.test(ch)) return 'digit (common)';
  if (/\p{P}/u.test(ch)) return 'punctuation';
  if (/\p{S}/u.test(ch)) return 'symbol';
  if (/\p{M}/u.test(ch)) return 'combining mark';
  return 'other';
}

for (const family of ['Noto Sans SC', 'Noto Naskh Arabic', 'Roboto']) {
  const { font, bytes } = await loadFont(family);
  console.log(`\n========== ${family} (${(bytes/1024).toFixed(0)} KB) ==========`);
  console.log('numGlyphs:', font.numGlyphs,
    '| cmap encoded:', Object.keys(font.tables.cmap.glyphIndexMap).length,
    '| outlines:', font.tables.cff ? 'CFF (cubic)' : 'glyf (quadratic)',
    '| GSUB:', !!font.tables.gsub);
  const hist = {};
  for (let i = 0; i < font.numGlyphs; i++) {
    const k = classify(font.glyphs.get(i).unicode);
    hist[k] = (hist[k] ?? 0) + 1;
  }
  console.log(Object.entries(hist).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${v}`).join(' | '));

  if (family === 'Noto Naskh Arabic') {
    // Show what the unencoded glyphs actually are: contextual forms + ligatures
    const unenc = [];
    for (let i = 0; i < font.numGlyphs && unenc.length < 14; i++) {
      const g = font.glyphs.get(i);
      if (g.unicode === undefined && g.name && g.name !== '.notdef') unenc.push(g.name);
    }
    console.log('sample UNENCODED glyph names:', unenc.join(', '));
    // Naive charToGlyph on an Arabic word — does it pick contextual forms? (spoiler: no)
    const word = 'محمد';
    const glyphs = [...word].map(c => font.charToGlyph(c));
    console.log(`charToGlyph per char of "${word}":`, glyphs.map(g => g.name).join(', '));
    console.log('(these are the ISOLATED forms - correct Arabic needs initial/medial/final forms picked by GSUB)');
  }
  if (family === 'Noto Sans SC') {
    const g = font.charToGlyph('的');
    g.path;
    console.log(`glyph for 的: name=${g.name ?? '(none)'} adv=${g.advanceWidth} contours=${g.getPath(0,0,72).commands.filter(c=>c.type==='M').length}`);
  }
}

// Finally: what does the BROWSER css look like for CJK? (the subsetting trap)
const browserCss = await (await fetch(
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC&display=swap',
  { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } }
)).text();
const blocks = [...browserCss.matchAll(/unicode-range:/g)].length;
const hasLatinLabel = /\/\*\s*latin\s*\*\//.test(browserCss);
console.log(`\n========== Browser-UA CSS for Noto Sans SC ==========`);
console.log(`@font-face blocks: ${blocks} | has "/* latin */" label: ${hasLatinLabel}`);
