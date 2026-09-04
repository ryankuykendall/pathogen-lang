import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compile,
  parse,
  createFontRegistry,
  addFont,
  getFontFromRegistry,
  resolveFontDirectives,
} from '../src/index';
import {
  getAdvanceWidth,
  getFontVariants,
  getVerticalMetrics,
  glyphToPathBlockCommands,
  lookupGlyph,
  splitContours,
} from '../src/evaluator/font-provider';
import { isMarkChar, isNewlineChar, isSpaceChar, isTabChar } from '../src/evaluator/char-class';
import type { FontRegistry } from '../src/index';

// Load test fixture font
let fontBuffer: ArrayBuffer;
let registry: FontRegistry;

beforeAll(() => {
  const raw = readFileSync(join(__dirname, 'fixtures/fonts/Inter-Regular.ttf'));
  fontBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  registry = createFontRegistry();
  addFont(registry, 'Inter', 400, 'normal', fontBuffer);
});

// ---------------------------------------------------------------------------
// Font Registry
// ---------------------------------------------------------------------------
describe('FontRegistry', () => {
  it('creates an empty registry', () => {
    const r = createFontRegistry();
    expect(r.fonts.size).toBe(0);
    expect(r.get('Inter')).toBeNull();
  });

  it('adds and retrieves fonts', () => {
    const font = getFontFromRegistry(registry, 'Inter', 400);
    expect(font).not.toBeNull();
    expect(font!.family).toBe('Inter');
    expect(font!.weight).toBe(400);
  });

  it('returns null for unknown font family', () => {
    expect(getFontFromRegistry(registry, 'NotAFont')).toBeNull();
  });

  it('returns nearest weight when exact match not found', () => {
    const font = getFontFromRegistry(registry, 'Inter', 700);
    expect(font).not.toBeNull();
    expect(font!.weight).toBe(400); // nearest available
  });
});

// ---------------------------------------------------------------------------
// getFontVariants + coverage-aware lookupGlyph
// ---------------------------------------------------------------------------
describe('getFontVariants', () => {
  it('returns all buffers registered at the same weight, insertion order first', () => {
    const r = createFontRegistry();
    addFont(r, 'Inter', 400, 'normal', fontBuffer, [[0x00, 0xff]]);
    addFont(r, 'Inter', 400, 'normal', fontBuffer, [[0xac00, 0xd7a3]]);
    const variants = getFontVariants(r, 'Inter', 400);
    expect(variants).toHaveLength(2);
    expect(variants[0].unicodeRanges).toEqual([[0x00, 0xff]]);
    expect(variants[1].unicodeRanges).toEqual([[0xac00, 0xd7a3]]);
  });

  it('orders exact weight matches before nearest-weight variants', () => {
    const r = createFontRegistry();
    addFont(r, 'Inter', 700, 'normal', fontBuffer);
    addFont(r, 'Inter', 400, 'normal', fontBuffer);
    const variants = getFontVariants(r, 'Inter', 400);
    expect(variants.map((v) => v.weight)).toEqual([400, 700]);
  });

  it('preserves getFont semantics: first variant is the old best match', () => {
    const r = createFontRegistry();
    addFont(r, 'Inter', 300, 'normal', fontBuffer);
    addFont(r, 'Inter', 500, 'normal', fontBuffer);
    // 400 is equidistant; the old reduce kept the first-registered variant
    expect(getFontFromRegistry(r, 'Inter', 400)!.weight).toBe(300);
  });
});

describe('lookupGlyph', () => {
  it('prefers the variant whose unicode-range covers the character', () => {
    const r = createFontRegistry();
    // Same buffer registered twice with disjoint fake ranges — only the
    // range gate can distinguish them.
    addFont(r, 'Inter', 400, 'normal', fontBuffer, [[0x41, 0x5a]]); // A-Z
    addFont(r, 'Inter', 400, 'normal', fontBuffer, [[0x61, 0x7a]]); // a-z
    const result = lookupGlyph(r, 'Inter', 400, 'normal', 'a', 48)!;
    expect(result.missing).toBe(false);
    expect(result.fontData.unicodeRanges).toEqual([[0x61, 0x7a]]);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it('falls back to range-less variants via cmap check', () => {
    const r = createFontRegistry();
    addFont(r, 'Inter', 400, 'normal', fontBuffer, [[0xac00, 0xd7a3]]); // Hangul-only claim
    addFont(r, 'Inter', 400, 'normal', fontBuffer); // no claim — cmap decides
    const result = lookupGlyph(r, 'Inter', 400, 'normal', 'A', 48)!;
    expect(result.missing).toBe(false);
    expect(result.fontData.unicodeRanges).toBeUndefined();
  });

  it('flags characters no variant covers as missing', () => {
    // Inter-Regular has no Hangul glyphs
    const result = lookupGlyph(registry, 'Inter', 400, 'normal', '한', 48)!;
    expect(result.missing).toBe(true);
    expect(result.fontData.family).toBe('Inter');
  });

  it('does not flag whitespace as missing', () => {
    const result = lookupGlyph(registry, 'Inter', 400, 'normal', ' ', 48)!;
    expect(result.missing).toBe(false);
    expect(result.commands).toEqual([]);
    expect(result.advanceWidth).toBeGreaterThan(0);
  });

  it('returns null when the family has no variants', () => {
    expect(lookupGlyph(registry, 'NotAFont', 400, 'normal', 'A', 48)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Font Metrics
// ---------------------------------------------------------------------------
describe('Font Metrics', () => {
  it('getAdvanceWidth returns positive width for text', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const width = getAdvanceWidth(font, 'Hello', 48);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(300); // reasonable range for 5 chars at 48px
  });

  it('getAdvanceWidth returns 0 for empty text', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const width = getAdvanceWidth(font, '', 48);
    expect(width).toBe(0);
  });

  it('getAdvanceWidth scales with font size', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const w24 = getAdvanceWidth(font, 'A', 24);
    const w48 = getAdvanceWidth(font, 'A', 48);
    expect(w48).toBeCloseTo(w24 * 2, 1);
  });

  it('getVerticalMetrics returns valid values', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const metrics = getVerticalMetrics(font, 48);
    expect(metrics.ascender).toBeGreaterThan(0);
    expect(metrics.descender).toBeLessThan(0);
    expect(metrics.lineHeight).toBeGreaterThan(0);
    expect(metrics.lineHeight).toBeGreaterThan(48); // line height > font size
  });
});

// ---------------------------------------------------------------------------
// Glyph → PathBlockCommands
// ---------------------------------------------------------------------------
describe('Glyph Conversion', () => {
  it('converts a letter to PathBlockCommands', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const { commands, advanceWidth } = glyphToPathBlockCommands(font, 'A', 48);
    expect(commands.length).toBeGreaterThan(0);
    expect(advanceWidth).toBeGreaterThan(0);
    // Should contain m (moveto) and other drawing commands
    const commandTypes = new Set(commands.map((c) => c.command));
    expect(commandTypes.has('m')).toBe(true);
  });

  it('returns empty commands for space character', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const { commands, advanceWidth } = glyphToPathBlockCommands(font, ' ', 48);
    expect(commands.length).toBe(0);
    expect(advanceWidth).toBeGreaterThan(0);
  });

  it('advance width scales with font size', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    const r24 = glyphToPathBlockCommands(font, 'A', 24);
    const r48 = glyphToPathBlockCommands(font, 'A', 48);
    expect(r48.advanceWidth).toBeCloseTo(r24.advanceWidth * 2, 1);
  });

  it('splitContours separates multi-contour glyphs', () => {
    const font = getFontFromRegistry(registry, 'Inter')!;
    // "O" typically has 2 contours (outer + inner)
    const { commands } = glyphToPathBlockCommands(font, 'O', 48);
    const contours = splitContours(commands);
    expect(contours.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// @font Directive Parsing
// ---------------------------------------------------------------------------
describe('@font directive parsing', () => {
  it('parses @font with quoted family name', () => {
    const ast = parse('@font "Inter";');
    expect(ast.body.length).toBe(1);
    expect(ast.body[0].type).toBe('FontDirective');
    const dir = ast.body[0] as { type: string; source: string; weight?: number };
    expect(dir.source).toBe('Inter');
    expect(dir.weight).toBeUndefined();
  });

  it('parses @font with single quotes', () => {
    const ast = parse("@font 'Inter';");
    const dir = ast.body[0] as { type: string; source: string };
    expect(dir.source).toBe('Inter');
  });

  it('parses @font with weight', () => {
    const ast = parse('@font "Inter" 700;');
    const dir = ast.body[0] as { type: string; source: string; weight?: number };
    expect(dir.source).toBe('Inter');
    expect(dir.weight).toBe(700);
  });

  it('parses @font with file path', () => {
    const ast = parse('@font "./fonts/Custom.ttf";');
    const dir = ast.body[0] as { type: string; source: string };
    expect(dir.source).toBe('./fonts/Custom.ttf');
  });

  it('parses @font without semicolon', () => {
    const ast = parse('@font "Inter"\nM 0 0');
    expect(ast.body[0].type).toBe('FontDirective');
    expect(ast.body[1].type).toBe('PathCommand');
  });

  it('evaluator ignores @font directives', () => {
    const result = compile('@font "Inter";\nM 10 20 L 30 40');
    expect(result.layers[0].data).toBe('M 10 20 L 30 40');
  });

  it('parses @font with identifier source', () => {
    const ast = parse('let family = "Inter";\n@font family;');
    const dir = ast.body[1] as { type: string; source: string; sourceKind?: string; weight?: number };
    expect(dir.type).toBe('FontDirective');
    expect(dir.source).toBe('family');
    expect(dir.sourceKind).toBe('identifier');
    expect(dir.weight).toBeUndefined();
  });

  it('parses @font identifier with weight', () => {
    const ast = parse('let family = "Inter";\n@font family 700;');
    const dir = ast.body[1] as { type: string; source: string; sourceKind?: string; weight?: number };
    expect(dir.source).toBe('family');
    expect(dir.sourceKind).toBe('identifier');
    expect(dir.weight).toBe(700);
  });

  it('string-literal @font is not marked as identifier', () => {
    const ast = parse('@font "Inter";');
    const dir = ast.body[0] as { type: string; sourceKind?: string };
    expect(dir.sourceKind === 'identifier').toBe(false);
  });

  it('@fontFamily (no whitespace) remains a parse error', () => {
    expect(() => parse('@fontFamily;')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveFontDirectives (static resolution of @font sources)
// ---------------------------------------------------------------------------
describe('resolveFontDirectives', () => {
  it('passes string-literal directives through', () => {
    const ast = parse('@font "Inter" 700;');
    const { resolved, errors } = resolveFontDirectives(ast);
    expect(errors).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ family: 'Inter', weight: 700 });
  });

  it('resolves an identifier against a top-level let string literal', () => {
    const ast = parse('let f = "Noto Sans";\n@font f 900;');
    const { resolved, errors } = resolveFontDirectives(ast);
    expect(errors).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ family: 'Noto Sans', weight: 900 });
  });

  it('resolves regardless of declaration order relative to the directive', () => {
    const ast = parse('@font f;\nlet f = "Inter";');
    const { resolved, errors } = resolveFontDirectives(ast);
    expect(errors).toEqual([]);
    expect(resolved[0]).toMatchObject({ family: 'Inter' });
  });

  it('errors when the identifier is not declared', () => {
    const ast = parse('@font mystery;');
    const { resolved, errors } = resolveFontDirectives(ast);
    expect(resolved).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/references 'mystery'.*not a top-level string variable/s);
  });

  it('errors when the identifier is bound to a non-string expression', () => {
    const ast = parse('let f = 42;\n@font f;');
    const { errors } = resolveFontDirectives(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/not a top-level string variable/);
  });
});

// ---------------------------------------------------------------------------
// PathBlock.fromGlyph()
// ---------------------------------------------------------------------------
describe('PathBlock.fromGlyph()', () => {
  it('converts single character to PathBlock array', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A", #{ font-family: Inter; font-size: 48; });
       log(glyphs.length);`,
      { fonts: registry },
    );
    // Should log "1" (one glyph)
    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.logs[0].parts[0].value).toBe('1');
  });

  it('converts multiple characters to array of PathBlocks', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("Hi", #{ font-family: Inter; font-size: 48; });
       log(glyphs.length);`,
      { fonts: registry },
    );
    expect(result.logs[0].parts[0].value).toBe('2');
  });

  it('each glyph has advanceWidth property', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A", #{ font-family: Inter; font-size: 48; });
       log(glyphs[0].advanceWidth);`,
      { fonts: registry },
    );
    const aw = parseFloat(result.logs[0].parts[0].value);
    expect(aw).toBeGreaterThan(0);
  });

  it('glyphs can be drawn with drawTo', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("I", #{ font-family: Inter; font-size: 48; });
       glyphs[0].drawTo(100, 100);`,
      { fonts: registry },
    );
    // Should produce path output (non-empty)
    expect(result.layers[0].data.length).toBeGreaterThan(0);
  });

  it('space character returns empty PathBlock with advanceWidth', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph(" ", #{ font-family: Inter; font-size: 48; });
       log(glyphs[0].advanceWidth);
       log(glyphs[0].subPathCount);`,
      { fonts: registry },
    );
    const aw = parseFloat(result.logs[0].parts[0].value);
    expect(aw).toBeGreaterThan(0);
    expect(result.logs[1].parts[0].value).toBe('0'); // no sub-paths
  });

  it('contours property decomposes multi-contour glyphs', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("O", #{ font-family: Inter; font-size: 48; });
       let contours = glyphs[0].contours;
       log(contours.length);`,
      { fonts: registry },
    );
    const contourCount = parseInt(result.logs[0].parts[0].value, 10);
    expect(contourCount).toBeGreaterThanOrEqual(2); // O has inner + outer contour
  });

  it('glyphs record their source character, whitespace flag, and emptiness', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A b", #{ font-family: Inter; font-size: 48; });
       log(glyphs[0].char);
       log(glyphs[0].isWhitespace);
       log(glyphs[0].isEmpty);
       log(glyphs[1].char);
       log(glyphs[1].isWhitespace);
       log(glyphs[1].isEmpty);
       log(glyphs[2].char);`,
      { fonts: registry },
    );
    const values = result.logs.map((l) => l.parts[0].value);
    expect(values).toEqual(['A', 'false', 'false', ' ', 'true', 'true', 'b']);
  });

  it('isEmpty works on non-glyph PathBlocks and ProjectedPaths; char/isWhitespace do not', () => {
    const result = compile(
      `let pb = @{ m 0 0 l 10 0 };
       log(pb.isEmpty);
       log(pb.project(5, 5).isEmpty);`,
    );
    expect(result.logs[0].parts[0].value).toBe('false');
    expect(result.logs[1].parts[0].value).toBe('false');

    expect(() => compile(`let pb = @{ m 0 0 l 10 0 };\nlog(pb.char);`)).toThrow(
      /char.*fromGlyph/s,
    );
    expect(() => compile(`let pb = @{ m 0 0 l 10 0 };\nlog(pb.isWhitespace);`)).toThrow(
      /isWhitespace.*fromGlyph/s,
    );
  });

  it('throws without font registry', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", #{ font-family: Inter; font-size: 48; });',
      ),
    ).toThrow('requires font data');
  });

  it('throws for missing font family', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", #{ font-family: NotLoaded; font-size: 48; });',
        { fonts: registry },
      ),
    ).toThrow("Font 'NotLoaded' not found");
  });

  it('throws without font-family in style block', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", #{ font-size: 48; });',
        { fonts: registry },
      ),
    ).toThrow('requires font-family');
  });
});

// ---------------------------------------------------------------------------
// Glyph character classes (isSpace / isTab / isNewline / isMark / codePoint)
// ---------------------------------------------------------------------------
describe('fromGlyph character classes', () => {
  // Coverage matrix over the classifier itself: every whitespace character
  // must satisfy exactly one of isSpaceChar/isTabChar/isNewlineChar, and
  // non-whitespace characters none — the documented partition invariant.
  const MATRIX: Array<[string, string, 'space' | 'tab' | 'newline' | 'mark' | 'none']> = [
    ['U+0020 space', ' ', 'space'],
    ['U+00A0 no-break space', '\u00A0', 'space'],
    ['U+1680 ogham space mark', '\u1680', 'space'],
    ['U+2003 em space', '\u2003', 'space'],
    ['U+202F narrow no-break space', '\u202F', 'space'],
    ['U+3000 ideographic space', '\u3000', 'space'],
    ['U+FEFF zero-width no-break space', '\uFEFF', 'space'],
    ['U+0009 tab', '\t', 'tab'],
    ['U+000A line feed', '\n', 'newline'],
    ['U+000B vertical tab', '\v', 'newline'],
    ['U+000C form feed', '\f', 'newline'],
    ['U+000D carriage return', '\r', 'newline'],
    // NEL is Unicode White_Space but NOT JS \s (= isWhitespace); it is
    // excluded from isNewline so the partition against isWhitespace holds.
    ['U+0085 next line', '\u0085', 'none'],
    ['U+2028 line separator', '\u2028', 'newline'],
    ['U+2029 paragraph separator', '\u2029', 'newline'],
    ['U+0301 combining acute accent', '\u0301', 'mark'],
    ['U+064B Arabic fathatan', '\u064B', 'mark'],
    ['U+05B8 Hebrew qamats', '\u05B8', 'mark'],
    ['U+0E31 Thai mai han-akat', '\u0E31', 'mark'],
    ['Latin letter', 'A', 'none'],
    ['Hangul syllable', '\uD55C', 'none'],
    ['CJK ideograph', '\u4E2D', 'none'],
    ['digit', '0', 'none'],
    ['punctuation', '.', 'none'],
    ['astral emoji', '\u{1F600}', 'none'],
    ['U+200B zero-width space (format char, not whitespace)', '\u200B', 'none'],
    ['U+200D zero-width joiner', '\u200D', 'none'],
  ];

  it.each(MATRIX)('%s classification and partition invariant', (_label, ch, cls) => {
    expect(isSpaceChar(ch)).toBe(cls === 'space');
    expect(isTabChar(ch)).toBe(cls === 'tab');
    expect(isNewlineChar(ch)).toBe(cls === 'newline');
    expect(isMarkChar(ch)).toBe(cls === 'mark');

    // Partition invariant: whitespace ⇔ exactly one of space/tab/newline.
    const whitespaceFlags = [isSpaceChar(ch), isTabChar(ch), isNewlineChar(ch)].filter(Boolean).length;
    expect(whitespaceFlags).toBe(/^\s$/u.test(ch) ? 1 : 0);
    // Marks are never whitespace.
    if (isMarkChar(ch)) expect(/^\s$/u.test(ch)).toBe(false);
  });

  it('glyphs expose the classifications and codePoint end-to-end', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A \u00A0\u3000\\t\\n\u0301", #{ font-family: Inter; font-size: 48; });
       for (g in glyphs) {
         log(\`\${g.codePoint} \${g.isSpace} \${g.isTab} \${g.isNewline} \${g.isMark} \${g.isWhitespace}\`);
       }`,
      { fonts: registry },
    );
    const values = result.logs
      .map((l) => l.parts.map((p) => p.value).join(''))
      .filter((v) => !v.startsWith('[warn]'));
    expect(values).toEqual([
      '65 false false false false false',    // A
      '32 true false false false true',      // space
      '160 true false false false true',     // no-break space
      '12288 true false false false true',   // ideographic space
      '9 false true false false true',       // tab
      '10 false false true false true',      // newline
      '769 false false false true false',    // combining acute accent
    ]);
  });

  it('codePoint returns the full code point for astral characters', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("😀", #{ font-family: Inter; font-size: 48; });
       log(glyphs.length);
       log(glyphs[0].codePoint);`,
      { fonts: registry },
    );
    const values = result.logs
      .map((l) => l.parts[0].value)
      .filter((v) => !v.startsWith?.('[warn]'));
    expect(values).toEqual(['1', '128512']);
  });

  it('docs hard-line-break layout example compiles and wraps to the second line', () => {
    // Mirrors docs/path-blocks.md "Glyph provenance and character classes":
    // isNewline resets the cursor to the margin one lineHeight down.
    const result = compile(
      `@font "Inter";
       let styles = #{ font-family: Inter; font-size: 48; };
       let glyphs = PathBlock.fromGlyph("Hello\\nworld", styles);

       let marginX = 10;
       let x = marginX;
       let y = 60;
       let lineHeight = 56;
       for (g in glyphs) {
         if (g.isNewline) {
           y = calc(y + lineHeight);
           x = marginX;
           continue;
         }
         if (!g.isWhitespace) {
           M x y
           g.draw()
         }
         x = calc(x + g.advanceWidth);
       }`,
      { fonts: registry },
    );
    const data = result.layers[0].data;
    expect(data).toContain('M 10 60'); // "H" at the margin, first line
    expect(data).toContain('M 10 116'); // "w" at the margin, second line: 60 + 56
  });

  it('docs tracking example: decomposed é yields a mark glyph with codePoint 769', () => {
    const result = compile(
      `@font "Inter";
       let styles = #{ font-family: Inter; font-size: 48; };
       let glyphs = PathBlock.fromGlyph("é", styles);
       log(glyphs[1].isMark);
       log(glyphs[1].codePoint);`,
      { fonts: registry },
    );
    const values = result.logs
      .map((l) => l.parts[0].value)
      .filter((v) => !v.startsWith?.('[warn]'));
    expect(values).toEqual(['true', '769']);
  });

  it('classification members on non-glyph PathBlocks throw the fromGlyph guidance', () => {
    for (const prop of ['isSpace', 'isTab', 'isNewline', 'isMark', 'codePoint']) {
      expect(() => compile(`let pb = @{ m 0 0 l 10 0 };\nlog(pb.${prop});`)).toThrow(
        new RegExp(`${prop}.*fromGlyph`, 's'),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Missing-glyph reporting (CompileResult.missingGlyphs + [warn] logs)
// ---------------------------------------------------------------------------
describe('missing glyph reporting', () => {
  it('reports characters the font cannot render and warns', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A한B", #{ font-family: Inter; font-size: 48; });
       log(glyphs.length);`,
      { fonts: registry },
    );
    // Program still compiles — 3 glyphs, the Hangul one as .notdef placeholder
    expect(result.logs[0].parts[0].value).toBe('3');
    expect(result.missingGlyphs).toEqual([{ family: 'Inter', weight: 400, chars: ['한'] }]);
    const warn = result.logs.find((l) => l.parts[0]?.value?.startsWith?.('[warn]'));
    expect(warn).toBeDefined();
    expect(warn!.parts[0].value).toContain("Font 'Inter' (weight 400)");
    expect(warn!.parts[0].value).toContain('한');
  });

  it('omits missingGlyphs when everything is covered', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("AB c", #{ font-family: Inter; font-size: 48; });`,
      { fonts: registry },
    );
    expect(result.missingGlyphs).toBeUndefined();
    expect(result.logs.some((l) => l.parts[0]?.value?.startsWith?.('[warn]'))).toBe(false);
  });

  it('deduplicates repeated missing characters', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("한한한", #{ font-family: Inter; font-size: 48; });`,
      { fonts: registry },
    );
    expect(result.missingGlyphs).toEqual([{ family: 'Inter', weight: 400, chars: ['한'] }]);
  });

  it('toPathBlock() records missing glyphs too', () => {
    const result = compile(
      `@font "Inter";
       let tb = &{ text(0, 16)\`A한\` } << #{ font-family: Inter; font-size: 48; };
       let pb = tb.toPathBlock();`,
      { fonts: registry },
    );
    expect(result.missingGlyphs).toEqual([{ family: 'Inter', weight: 400, chars: ['한'] }]);
  });
});

// ---------------------------------------------------------------------------
// Font-enhanced text metrics (fallback behavior)
// ---------------------------------------------------------------------------
describe('Font-enhanced text metrics', () => {
  it('programs without fonts produce identical output (backward compat)', () => {
    const result1 = compile('M 10 20 L 30 40');
    const result2 = compile('M 10 20 L 30 40', { fonts: registry });
    expect(result1.layers[0].data).toBe(result2.layers[0].data);
  });

  it('text bounding box uses precise metrics when font is available', () => {
    const source = '@font "Inter";\nlet tb = &{ text(0, 16)`Hello` } << #{ font-family: Inter; font-size: 48; };\nlet bb = tb.boundingBox();\nlog(bb.width);';
    const withFont = compile(source, { fonts: registry });
    const withoutFont = compile(source);
    // Both should produce widths, but they should differ (precise vs estimated)
    const w1 = parseFloat(withFont.logs[0].parts[0].value);
    const w2 = parseFloat(withoutFont.logs[0].parts[0].value);
    expect(w1).toBeGreaterThan(0);
    expect(w2).toBeGreaterThan(0);
  });
});
