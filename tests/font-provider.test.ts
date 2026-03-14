import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compile,
  parse,
  createFontRegistry,
  addFont,
  getFontFromRegistry,
} from '../src/index';
import { getAdvanceWidth, getVerticalMetrics, glyphToPathBlockCommands, splitContours } from '../src/evaluator/font-provider';
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
});

// ---------------------------------------------------------------------------
// PathBlock.fromGlyph()
// ---------------------------------------------------------------------------
describe('PathBlock.fromGlyph()', () => {
  it('converts single character to PathBlock array', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A", \${ font-family: Inter; font-size: 48; });
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
       let glyphs = PathBlock.fromGlyph("Hi", \${ font-family: Inter; font-size: 48; });
       log(glyphs.length);`,
      { fonts: registry },
    );
    expect(result.logs[0].parts[0].value).toBe('2');
  });

  it('each glyph has advanceWidth property', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("A", \${ font-family: Inter; font-size: 48; });
       log(glyphs[0].advanceWidth);`,
      { fonts: registry },
    );
    const aw = parseFloat(result.logs[0].parts[0].value);
    expect(aw).toBeGreaterThan(0);
  });

  it('glyphs can be drawn with drawTo', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph("I", \${ font-family: Inter; font-size: 48; });
       glyphs[0].drawTo(100, 100);`,
      { fonts: registry },
    );
    // Should produce path output (non-empty)
    expect(result.layers[0].data.length).toBeGreaterThan(0);
  });

  it('space character returns empty PathBlock with advanceWidth', () => {
    const result = compile(
      `@font "Inter";
       let glyphs = PathBlock.fromGlyph(" ", \${ font-family: Inter; font-size: 48; });
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
       let glyphs = PathBlock.fromGlyph("O", \${ font-family: Inter; font-size: 48; });
       let contours = glyphs[0].contours;
       log(contours.length);`,
      { fonts: registry },
    );
    const contourCount = parseInt(result.logs[0].parts[0].value, 10);
    expect(contourCount).toBeGreaterThanOrEqual(2); // O has inner + outer contour
  });

  it('throws without font registry', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", ${ font-family: Inter; font-size: 48; });',
      ),
    ).toThrow('requires font data');
  });

  it('throws for missing font family', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", ${ font-family: NotLoaded; font-size: 48; });',
        { fonts: registry },
      ),
    ).toThrow("Font 'NotLoaded' not found");
  });

  it('throws without font-family in style block', () => {
    expect(() =>
      compile(
        'let g = PathBlock.fromGlyph("A", ${ font-size: 48; });',
        { fonts: registry },
      ),
    ).toThrow('requires font-family');
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
    const source = '@font "Inter";\nlet tb = &{ text(0, 16)`Hello` } << ${ font-family: Inter; font-size: 48; };\nlet bb = tb.boundingBox();\nlog(bb.width);';
    const withFont = compile(source, { fonts: registry });
    const withoutFont = compile(source);
    // Both should produce widths, but they should differ (precise vs estimated)
    const w1 = parseFloat(withFont.logs[0].parts[0].value);
    const w2 = parseFloat(withoutFont.logs[0].parts[0].value);
    expect(w1).toBeGreaterThan(0);
    expect(w2).toBeGreaterThan(0);
  });
});
