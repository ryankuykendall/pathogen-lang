/**
 * Path blocks (`@{ }`) and text blocks (`&{ }`) evaluate with their own
 * evaluation state, but the program-wide parts of that state must be the
 * program's own: the loaded fonts, the missing-glyph and Font-coverage
 * reports, strict mode, and the subscription being dispatched.
 *
 * Regressions for bugs found on 2026-10-22 and 2026-10-23
 * (project-docs/modules/verify/ has the repros):
 *  - `PathBlock.fromGlyph` inside a block threw "no fonts were loaded" even
 *    though the font was loaded, because the block state omitted the registry;
 *  - `--strict` never fired for a warning raised inside a block, because the
 *    block state omitted `strictWarnings`;
 *  - inside `&{ }`, `x = …` created a block-local copy, indexed and member
 *    assignments and enums were skipped, and `let r = blk.draw()` bound the
 *    wrong value — text-block statements now run as they do at the top level;
 *  - `sub.unsubscribe()` inside a block in a subscription callback was
 *    ignored, and `.subscribe()` inside a block was silently dropped.
 *
 * Both entry points are covered: `compile()` (CLI) and `compileWithContext()`
 * (playground worker), which build their root state separately.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { addFont, compile, compileWithContext, createFontRegistry } from '../src';

import type { FontRegistry } from '../src';

let fontBuffer: ArrayBuffer;

function interRegistry(options: { partial?: boolean } = {}): FontRegistry {
  const registry = createFontRegistry();
  addFont(registry, 'Inter', 400, 'normal', fontBuffer, undefined, options.partial);
  return registry;
}

beforeAll(() => {
  const raw = readFileSync(join(__dirname, 'fixtures/fonts/Inter-Regular.ttf'));
  fontBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
});

const STYLES = 'let styles = #{ font-family: Inter; font-size: 48; };';

/** Two layers drawing the glyph built outside a block and the one built inside it. */
function glyphLayers(insideBlock: string): string {
  return [
    STYLES,
    'let outside = PathBlock.fromGlyph("A", styles);',
    'let inside = null;',
    insideBlock,
    "define PathLayer('outside') #{ stroke: none; }",
    "define PathLayer('inside') #{ stroke: none; }",
    "layer('outside').apply { outside[0].draw(); }",
    "layer('inside').apply { inside[0].draw(); }",
  ].join('\n');
}

function layerData(result: { layers: { name: string; data: string }[] }, name: string): string {
  const layer = result.layers.find((l) => l.name === name);
  if (!layer) throw new Error(`no layer named ${name}`);
  return layer.data;
}

/** The value parts of each `log()` line, joined with spaces. */
function logLines(result: { logs: { parts: { value: string }[] }[] }): string[] {
  return result.logs.map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

const ENTRY_POINTS = [
  ['compile', compile],
  ['compileWithContext', compileWithContext],
] as const;

describe.each(ENTRY_POINTS)('blocks see the program’s loaded fonts (%s)', (_name, run) => {
  it('fromGlyph inside @{ } builds the same glyph as at the top level', () => {
    const result = run(glyphLayers('let b = @{\n  inside = PathBlock.fromGlyph("A", styles);\n  m 0 0\n};'), {
      fonts: interRegistry(),
    });
    const outside = layerData(result, 'outside');
    expect(outside.length).toBeGreaterThan(20); // a real outline, not an empty path
    expect(layerData(result, 'inside')).toBe(outside);
  });

  it('fromGlyph inside &{ } builds the same glyph as at the top level', () => {
    const result = run(glyphLayers('let t = &{\n  inside = PathBlock.fromGlyph("A", styles);\n  text(0, 0)`A`\n};'), {
      fonts: interRegistry(),
    });
    expect(layerData(result, 'inside')).toBe(layerData(result, 'outside'));
  });

  it('fromGlyph inside @{ } nested in &{ } builds the same glyph', () => {
    const result = run(
      glyphLayers(
        'let t = &{\n  let p = @{\n    inside = PathBlock.fromGlyph("A", styles);\n    m 0 0\n  };\n  text(0, 0)`A`\n};',
      ),
      { fonts: interRegistry() },
    );
    expect(layerData(result, 'inside')).toBe(layerData(result, 'outside'));
  });

  it('a named fn that calls fromGlyph works when called from a block', () => {
    const result = run(
      glyphLayers(
        'fn glyphA() {\n  return PathBlock.fromGlyph("A", styles);\n}\nlet b = @{\n  inside = glyphA();\n  m 0 0\n};',
      ),
      { fonts: interRegistry() },
    );
    expect(layerData(result, 'inside')).toBe(layerData(result, 'outside'));
  });

  it('a glyph missing from the font inside @{ } is reported in the result', () => {
    // Inter has no CJK ideographs, so 你 falls back to .notdef and is reported.
    const result = run(`${STYLES}\nlet b = @{\n  let g = PathBlock.fromGlyph("你", styles);\n  m 0 0\n};`, {
      fonts: interRegistry(),
    });
    expect(result.missingGlyphs).toEqual([{ family: 'Inter', weight: 400, chars: ['你'] }]);
    expect(result.warnings.map((w) => w.code)).toEqual(['font-glyph']);
  });

  it('a Font call on a partly loaded family inside @{ } reaches the result as a coverage request', () => {
    const result = run(`${STYLES}\nlet b = @{\n  let info = Font.info(styles);\n  m 0 0\n};`, {
      fonts: interRegistry({ partial: true }),
    });
    expect(result.fontCoverageRequests).toEqual([{ family: 'Inter', weight: 400, ranges: null }]);
  });
});

describe.each(ENTRY_POINTS)('strict mode applies inside blocks (%s)', (_name, run) => {
  const NAN_IN_PATH_BLOCK = 'let b = @{\n  m calc(0/0) 10\n};\nM 0 0';

  it('without strict, a NaN inside @{ } is a positioned warning', () => {
    const result = run(NAN_IN_PATH_BLOCK);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'non-finite', line: 2, column: 5 })]);
  });

  it('strict: true turns a warning raised inside @{ } into a positioned error', () => {
    expect(() => run(NAN_IN_PATH_BLOCK, { strict: true })).toThrow(
      /^Line 2, col 5: a path argument is NaN.*\(strict: non-finite\)$/,
    );
  });

  it('strict mode reaches a path block nested in a text block', () => {
    const src = 'let t = &{\n  let p = @{\n    m calc(0/0) 10\n  };\n  text(0, 0)`a`\n};\nM 0 0';
    expect(() => run(src, { strict: ['non-finite'] })).toThrow(
      /^Line 3, col 7: a path argument is NaN.*\(strict: non-finite\)$/,
    );
  });
});

describe('statements inside &{ } behave as they do at the top level', () => {
  it('x = … updates the variable declared outside the block', () => {
    const result = compile('let x = 1;\nlet t = &{\n  x = 2;\n  text(0, 0)`a`\n};\nlog(x);');
    expect(logLines(result)).toEqual(['2']);
  });

  it('a running total updated in a loop inside the block reaches the outside', () => {
    const result = compile(
      'let y = 0;\nlet t = &{\n  for (i in 1..3) {\n    text(0, y)`line ${i}`\n    y = y + 14;\n  }\n};\nlog(y);',
    );
    expect(logLines(result)).toEqual(['42']);
  });

  it('a let inside the block shadows the outer variable instead of changing it', () => {
    const result = compile('let x = 1;\nlet t = &{\n  let x = 5;\n  x = 6;\n  log(x);\n  text(0, 0)`a`\n};\nlog(x);');
    expect(logLines(result)).toEqual(['6', '1']);
  });

  it('indexed assignments are applied, not skipped', () => {
    const result = compile(
      "let arr = [1, 2];\nlet o = { a: 1 };\nlet t = &{\n  arr[0] = 5;\n  o['a'] = 7;\n  text(0, 0)`a`\n};\nlog(arr[0]);\nlog(o.a);",
    );
    expect(logLines(result)).toEqual(['5', '7']);
  });

  it('a member assignment gets the same error inside &{ } as at the top level', () => {
    // Plain objects take bracket writes (docs/objects.md); `o.a = …` is an error everywhere.
    expect(() => compile('let o = { a: 1 };\no.a = 7;')).toThrow(/^Line 2: Cannot assign to property 'a'$/);
    expect(() => compile('let o = { a: 1 };\nlet t = &{\n  o.a = 7;\n  text(0, 0)`a`\n};')).toThrow(
      /^Line 3: Cannot assign to property 'a'$/,
    );
  });

  it('assigning to an undeclared name is the same positioned error as outside a block', () => {
    expect(() => compile('let t = &{\n  y = 2;\n  text(0, 0)`a`\n};')).toThrow(
      /^Line 2: Cannot assign to undeclared variable: y$/,
    );
  });

  it('an enum defined inside &{ } can be used there', () => {
    const result = compile(
      'let t = &{\n  enum Size { Small = 8, Large = 24 }\n  log(Size.Large);\n  text(0, 0)`a`\n};',
    );
    expect(logLines(result)).toEqual(['24']);
  });

  it('let r = blk.draw() binds the drawn path’s result, as at the top level', () => {
    const topLevel = compile('let blk = @{ l 10 0 };\nM 0 0\nlet r = blk.draw();\nlog(r.endPoint.x);');
    const inBlock = compile(
      'let blk = @{ l 10 0 };\nM 0 0\nlet t = &{\n  let r = blk.draw();\n  log(r.endPoint.x);\n  text(0, 0)`a`\n};',
    );
    expect(logLines(topLevel)).toEqual(['10']);
    expect(logLines(inBlock)).toEqual(['10']);
  });
});

describe('subscriptions and blocks', () => {
  const SHAPE = [
    "define PathLayer('shape') #{ stroke: #333; }",
    "let shape = layer('shape');",
    'let cb = {|corner| log(corner.x); };',
  ].join('\n');

  it('sub.unsubscribe() inside a block in a callback stops delivery, as it does outside the block', () => {
    const program = (unsubscribe: string) =>
      [
        "define PathLayer('shape') #{ stroke: #333; }",
        "layer('shape').subscribe('endpoint') {|corner, i, sub|",
        '  log(i);',
        `  ${unsubscribe}`,
        '};',
        "layer('shape').apply {",
        '  M 20 20;',
        '  h 80;',
        '  v 60;',
        '  h -80;',
        '}',
      ].join('\n');
    expect(logLines(compile(program('sub.unsubscribe();')))).toEqual(['0']);
    expect(logLines(compile(program('let b = @{ sub.unsubscribe(); m 0 0 };')))).toEqual(['0']);
  });

  it('.subscribe() inside @{ } is an error, not a subscription that never runs', () => {
    expect(() => compile(`${SHAPE}\nlet b = @{\n  shape.subscribe('endpoint') << cb;\n  m 0 0\n};`)).toThrow(
      /^Line 5(, col \d+)?: Cannot call \.subscribe\(\) inside a path block\. Subscribe outside the block\.$/,
    );
  });

  it('.subscribe() inside &{ } is an error too', () => {
    expect(() => compile(`${SHAPE}\nlet t = &{\n  shape.subscribe('endpoint') << cb;\n  text(0, 0)\`a\`\n};`)).toThrow(
      /^Line 5(, col \d+)?: Cannot call \.subscribe\(\) inside a text block\. Subscribe outside the block\.$/,
    );
  });
});
