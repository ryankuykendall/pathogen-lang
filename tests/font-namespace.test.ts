// Font namespace (docs/fonts.md): Font.info / Font.characters / Font.glyphs,
// selections, and the script / block / category / glyphName glyph properties.
//
// Expected values are computed from the font file with opentype.js and from
// the JS engine's Unicode data, not copied from the implementation:
//   - the character set is the cmap (glyph index > 0)
//   - categories / scripts come from \p{…} regexes
// A second fixture registers the same file as two unicode-range "slices" to
// cover the playground's split-family path: coverage gating and the
// fontCoverageRequests the host uses to fetch slices.

import { existsSync, readFileSync } from 'fs';

import opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';

import { addFont, compile, createFontRegistry } from '../src';
import { FONT_GLYPHS_WARN_LIMIT, fontGlyphs } from '../src/evaluator/font-namespace';
import { resolveFamilyNames } from '../src/evaluator/font-provider';
import { blockOf, categoryOf, findScript, scriptOf, suggestNames } from '../src/evaluator/unicode-props';

const FONT_PATH = 'fonts/Raleway/Raleway-Bold.ttf';
const haveFont = existsSync(FONT_PATH);

function fontBuffer(): ArrayBuffer {
  const buf = readFileSync(FONT_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function registry(slices?: [number, number][][]) {
  const r = createFontRegistry();
  if (slices) for (const ranges of slices) addFont(r, 'Raleway', 700, 'normal', fontBuffer(), ranges);
  else addFont(r, 'Raleway', 700, 'normal', fontBuffer());
  return r;
}

/** The font's mapped code points, straight from its cmap. */
function cmapCodePoints(): number[] {
  const font = opentype.parse(fontBuffer());
  const map = font.tables.cmap.glyphIndexMap as Record<string, number>;
  return Object.entries(map)
    .filter(([, g]) => g > 0)
    .map(([cp]) => Number(cp))
    .sort((a, b) => a - b);
}

const STYLES = '#{ font-family: Raleway; font-weight: 700; font-size: 48; }';

function logs(src: string, fonts = registry()): string[] {
  const result = compile(`let styles = ${STYLES};\n${src}`, { fonts });
  return result.logs.map((l) => l.parts.map((p) => ('value' in p ? String(p.value) : '')).join(' '));
}

function logValue(src: string, fonts = registry()): string {
  const out = logs(src, fonts);
  return out[out.length - 1];
}

describe.skipIf(!haveFont)('Font.characters', () => {
  it('without a selection returns every mapped character in code-point order', () => {
    const expected = cmapCodePoints()
      .map((cp) => String.fromCodePoint(cp))
      .join('');
    const result = compile(`let styles = ${STYLES};\nlet s = Font.characters(styles);\nlog(s.length);`, {
      fonts: registry(),
    });
    // Pathogen string .length counts characters (code points).
    expect(result.logs[0].parts.find((p) => 'value' in p)).toMatchObject({ value: String([...expected].length) });
  });

  it('selects a category', () => {
    const digits = cmapCodePoints()
      .map((cp) => String.fromCodePoint(cp))
      .filter((c) => /^\p{Nd}$/u.test(c))
      .join('');
    expect(logValue('log(Font.characters(styles, "digit"));')).toContain(digits);
  });

  it('selects a script (all its blocks) vs a block (one range)', () => {
    const cps = cmapCodePoints();
    const cyrillicScript = cps.filter((cp) => /^\p{Script=Cyrillic}$/u.test(String.fromCodePoint(cp))).length;
    const cyrillicBlock = cps.filter((cp) => cp >= 0x400 && cp <= 0x4ff).length;
    expect(cyrillicScript).not.toBe(cyrillicBlock); // the fixture has Cyrillic Supplement too
    expect(logValue('log(Font.characters(styles, "Cyrillic").length);')).toContain(String(cyrillicScript));
    expect(logValue('log(Font.characters(styles, { block: "Cyrillic" }).length);')).toContain(String(cyrillicBlock));
  });

  it('selects code points (only those the font has) and combines object keys', () => {
    expect(logValue('log(Font.characters(styles, (48..57)));')).toContain('0123456789');
    // 0x10FFFF is not in the font: silently absent, no placeholder.
    expect(logValue('log(Font.characters(styles, [65, 1114111]));')).toContain('A');
    const latinUpper = cmapCodePoints().filter((cp) => {
      const c = String.fromCodePoint(cp);
      return /^\p{Script=Latin}$/u.test(c) && /^\p{L}$/u.test(c) && cp < 0x80;
    }).length;
    expect(
      logValue('log(Font.characters(styles, { script: "latin", category: "letter", block: "basic_latin" }).length);'),
    ).toContain(String(latinUpper));
  });
});

describe.skipIf(!haveFont)('Font.glyphs', () => {
  it('returns the same glyphs PathBlock.fromGlyph builds for those characters', () => {
    const src = `
      let a = Font.glyphs(styles, "digit");
      let b = PathBlock.fromGlyph(Font.characters(styles, "digit"), styles);
      log(a.length == b.length);
      for ([g, i] in a) { log(g.char == b[i].char, g.advanceWidth == b[i].advanceWidth, g.commands.length == b[i].commands.length); }
    `;
    const out = logs(src);
    expect(out.every((line) => !line.includes('false'))).toBe(true);
    expect(out.length).toBe(11);
  });

  it('carries script / block / category / is* / glyphName', () => {
    const out = logs(`
      for (g in Font.glyphs(styles, [65, 1078, 48, 46, 43])) {
        log(g.char, g.script, g.block, g.category, g.isLetter, g.isDigit, g.isPunctuation, g.isSymbol, g.glyphName);
      }
    `);
    const font = opentype.parse(fontBuffer());
    const expected = ['A', 'ж', '0', '.', '+'].map((c) => {
      const cp = c.codePointAt(0)!;
      const cat = categoryOf(c);
      return [
        c,
        scriptOf(cp),
        blockOf(cp),
        cat,
        cat === 'letter',
        cat === 'digit',
        cat === 'punctuation',
        cat === 'symbol',
        font.charToGlyph(c).name,
      ].map(String);
    });
    // Logs come out in code-point order: + . 0 A ж
    const order = ['+', '.', '0', 'A', 'ж'];
    order.forEach((c, i) => {
      const exp = expected.find((e) => e[0] === c)!;
      for (const part of exp) expect(out[i]).toContain(part);
    });
    expect(out[3]).toContain('Latin');
    expect(out[3]).toContain('Basic Latin');
    expect(out[4]).toContain('Cyrillic');
  });

  it('the new properties also work on PathBlock.fromGlyph glyphs and are refused elsewhere', () => {
    expect(logValue('log(PathBlock.fromGlyph("é", styles)[0].block);')).toContain('Latin-1 Supplement');
    expect(() => compile(`let b = @{ h 10 }; log(b.script);`)).toThrow(/only available on glyphs/);
  });

  it('warns when one call returns more glyphs than the limit, naming the count', () => {
    const fonts = registry();
    const messages: string[] = [];
    const glyphs = fontGlyphs(
      {
        evalState: { fontRegistry: fonts } as unknown as Parameters<typeof fontGlyphs>[0]['evalState'],
        makeGlyphs: (chars) => chars,
        warnLargeSelection: (m) => messages.push(m),
        warnLimit: 5,
      },
      [{ type: 'StyleBlockValue', properties: { 'font-family': 'Raleway', 'font-weight': '700' } }, 'digit'],
    );
    expect(glyphs.elements).toHaveLength(10);
    expect(messages).toEqual(["Font.glyphs() returned 10 glyphs from 'Raleway' — pass a selection to draw fewer"]);
    expect(FONT_GLYPHS_WARN_LIMIT).toBe(5000);
    // At the real limit a normal call is silent.
    const result = compile(`let styles = ${STYLES};\nlet g = Font.glyphs(styles);`, { fonts });
    expect(result.warnings.filter((w) => w.message.includes('glyphs from'))).toEqual([]);
  });
});

describe.skipIf(!haveFont)('Font.info', () => {
  it('reports names, metrics and coverage from the file', () => {
    const font = opentype.parse(fontBuffer());
    const cps = cmapCodePoints();
    const mapped = new Set(
      Object.values(font.tables.cmap.glyphIndexMap as Record<string, number>).filter((g) => g > 0),
    );
    const out = logs(`
      let i = Font.info(styles);
      log(i.family); log(i.style); log(i.weight); log(i.characterCount); log(i.glyphCount); log(i.unmappedCount);
      log(i.unitsPerEm); log(i.capHeight); log(i.xHeight); log(i.isItalic); log(i.isMonospace);
    `);
    const os2 = font.tables.os2;
    const scale = 48 / font.unitsPerEm;
    const expected = [
      'Raleway',
      'Bold',
      String(os2.usWeightClass),
      String(cps.length),
      String(font.numGlyphs),
      String(font.numGlyphs - 1 - mapped.size),
      String(font.unitsPerEm),
      String(os2.sCapHeight * scale),
      String(os2.sxHeight * scale),
      'false',
      'false',
    ];
    expected.forEach((e, idx) => expect(out[idx]).toContain(e));
  });

  it('lists categories, scripts and blocks with counts that sum to the character count', () => {
    const out = logs(`
      let i = Font.info(styles);
      let c = 0; for (x in i.categories) { c = c + x.count; } log(c);
      let s = 0; for (x in i.scripts) { s = s + x.count; } log(s);
      let b = 0; for (x in i.blocks) { b = b + x.count; } log(b);
      log(i.characterCount);
      log(i.categories[0].name);
      log(i.blocks[0].name, i.blocks[0].size, i.blocks[0].start, i.blocks[0].end);
    `);
    const n = cmapCodePoints().length;
    for (let k = 0; k < 4; k++) expect(out[k]).toContain(String(n));
    expect(out[4]).toContain('letter');
    expect(out[5]).toContain('Basic Latin');
    expect(out[5]).toContain('128');
  });
});

describe.skipIf(!haveFont)('selection errors', () => {
  const run = (sel: string) => () =>
    compile(`let styles = ${STYLES};\nFont.glyphs(styles, ${sel});`, { fonts: registry() });
  it('unknown names suggest the closest', () => {
    expect(run('"Cyrilic"')).toThrow(/no script, block or category named 'Cyrilic'\. Did you mean 'Cyrillic'/);
  });
  it('an empty selection object is an error, not the whole font', () => {
    expect(run('{}')).toThrow(/a selection object needs at least one of script, block, category or codePoints/);
  });
  it('unknown object keys and bad code points', () => {
    expect(run('{ kind: "letter" }')).toThrow(/selection keys are script, block, category and codePoints — got 'kind'/);
    expect(run('[65, 1.5]')).toThrow(/codePoints must be whole numbers from 0 to 1114111/);
    expect(run('{ category: "letters" }')).toThrow(/no category named 'letters'/);
  });
  it('a font that was not loaded, and no font-family', () => {
    expect(() => compile('Font.info(#{ font-family: Nope; });', { fonts: registry() })).toThrow(
      /Font.info\(\): font 'Nope' is not loaded. Add @font "Nope";/,
    );
    expect(() => compile('Font.info(#{ font-size: 4; });', { fonts: registry() })).toThrow(/requires font-family/);
  });
  it('with no fonts at all, says so in the same words as fromGlyph', () => {
    expect(() => compile('Font.glyphs(#{ font-family: Raleway; }, "digit");')).toThrow(
      /Font.glyphs\(\): no fonts were loaded. Add @font "Raleway";/,
    );
  });
});

describe.skipIf(!haveFont)('split families (playground slices)', () => {
  // Same file registered as two slices: Latin-ish and Cyrillic.
  const slices: [number, number][][] = [[[0, 0x24f]], [[0x400, 0x52f]]];

  it('gates each slice by its declared ranges and records what the host must fetch', () => {
    const result = compile(`let styles = ${STYLES};\nlog(Font.characters(styles, "Cyrillic").length);`, {
      fonts: registry(slices),
    });
    const cyrillic = cmapCodePoints().filter((cp) => /^\p{Script=Cyrillic}$/u.test(String.fromCodePoint(cp))).length;
    expect(result.logs[0].parts.map((p) => ('value' in p ? p.value : '')).join(' ')).toContain(String(cyrillic));
    // The host is told the Cyrillic script's ranges; it picks the slices that overlap them.
    expect(result.fontCoverageRequests).toEqual([
      { family: 'Raleway', weight: 700, ranges: findScript('Cyrillic')!.ranges },
    ]);
  });

  it('Font.info and unselected calls ask for the whole font', () => {
    const result = compile(
      `let styles = ${STYLES};\nlet i = Font.info(styles);\nlet c = Font.characters(styles, "Greek");`,
      {
        fonts: registry(slices),
      },
    );
    expect(result.fontCoverageRequests).toEqual([{ family: 'Raleway', weight: 700, ranges: null }]);
  });

  it('a program that fails after a Font call carries the slice requests on the error', () => {
    // Only the latin slice is loaded, so the Cyrillic selection is empty and [0] fails.
    let caught: unknown;
    try {
      compile(`let styles = ${STYLES};\nlet c = Font.glyphs(styles, "Cyrillic");\nlog(c[0].char);`, {
        fonts: registry([[[0, 0x24f]]]),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { fontCoverageRequests?: unknown }).fontCoverageRequests).toEqual([
      { family: 'Raleway', weight: 700, ranges: findScript('Cyrillic')!.ranges },
    ]);
  });

  it('asks under the weight the family is registered at, even when the style omits font-weight', () => {
    // Slices registered at 700 (as @font "Raleway" 700; would); the style says nothing about weight.
    const result = compile('log(Font.characters(#{ font-family: Raleway; }, "Greek").length);', {
      fonts: registry(slices),
    });
    expect(result.fontCoverageRequests).toEqual([
      { family: 'Raleway', weight: 700, ranges: findScript('Greek')!.ranges },
    ]);
  });

  it('merges the ranges of repeated calls into one short list', () => {
    const once = compile(
      `let styles = ${STYLES};\nlet c = Font.characters(styles, "Cyrillic");\nlet d = Font.characters(styles, { block: "Cyrillic" });`,
      { fonts: registry(slices) },
    ).fontCoverageRequests!;
    const twenty = compile(
      `let styles = ${STYLES};\nfor (i in 1..20) { let c = Font.characters(styles, "Cyrillic"); }\nlet d = Font.characters(styles, { block: "Cyrillic" });`,
      { fonts: registry(slices) },
    ).fontCoverageRequests!;
    expect(twenty).toEqual(once);
    const ranges = twenty[0].ranges!;
    // Sorted, non-overlapping, non-touching, and no longer than the script's own list.
    for (let k = 1; k < ranges.length; k++) expect(ranges[k][0]).toBeGreaterThan(ranges[k - 1][1] + 1);
    expect(ranges.length).toBeLessThanOrEqual(findScript('Cyrillic')!.ranges.length);
  });

  it('a whole-file font records nothing', () => {
    const result = compile(`let styles = ${STYLES};\nlet i = Font.info(styles);`, { fonts: registry() });
    expect(result.fontCoverageRequests).toBeUndefined();
  });
});

describe('resolveFamilyNames (Font.info family / fullName)', () => {
  it("Google's Raleway Bold names itself 'Raleway Thin': the loaded family wins", () => {
    // Measured in the playground 2026-10-20: family 'Raleway Thin', fullName 'Raleway Thin Bold'.
    expect(resolveFamilyNames('Raleway', 'Raleway Thin', 'Raleway Thin Bold', 'Bold')).toEqual({
      family: 'Raleway',
      fullName: 'Raleway Bold',
    });
  });
  it('a matching table name is kept as is', () => {
    expect(resolveFamilyNames('Playfair Display', 'Playfair Display', 'Playfair Display Bold', 'Bold')).toEqual({
      family: 'Playfair Display',
      fullName: 'Playfair Display Bold',
    });
  });
  it("a local file registered under its file name keeps the font's own names", () => {
    expect(resolveFamilyNames('Baumans-Regular', 'Baumans', 'Baumans Regular', 'Regular')).toEqual({
      family: 'Baumans',
      fullName: 'Baumans Regular',
    });
  });
  it('no names in the table: built from the loaded family', () => {
    expect(resolveFamilyNames('Inter', null, null, 'Regular')).toEqual({ family: 'Inter', fullName: 'Inter Regular' });
  });
});

describe('unicode-props', () => {
  it('whitespace is the White_Space set, not \\s (U+FEFF is a formatting character)', () => {
    expect(categoryOf(' ')).toBe('whitespace');
    expect(categoryOf('\t')).toBe('whitespace');
    expect(categoryOf('\u3000')).toBe('whitespace');
    expect(categoryOf('\u0085')).toBe('whitespace');
    expect(categoryOf('\ufeff')).toBe('other');
    expect(categoryOf('\u200b')).toBe('other');
  });

  it('suggests close names', () => {
    expect(suggestNames('Cyrilic')).toContain('Cyrillic');
    expect(suggestNames('latin1 suplement')).toContain('Latin-1 Supplement');
  });
});
