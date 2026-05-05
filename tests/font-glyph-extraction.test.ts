import { existsSync, readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { compile, compileWithContext, createFontRegistry, addFont } from '../src';

const fontPath = 'fonts/Bebas_Neue/BebasNeue-Regular.ttf';
const haveFont = existsSync(fontPath);

function buildRegistry() {
  const buf = readFileSync(fontPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const registry = createFontRegistry();
  addFont(registry, 'BebasNeue-Regular', 400, 'normal', ab);
  return registry;
}

const src = `
@font "${fontPath}"
let styles = \${ font-family: BebasNeue-Regular; font-size: 60; };
let glyphs = PathBlock.fromGlyph("A", styles);
glyphs[0].drawTo(0, 0);
`;

describe('PathBlock.fromGlyph through compile entry points', () => {
  (haveFont ? it : it.skip)('compile() forwards fonts to fromGlyph', () => {
    const result = compile(src, { fonts: buildRegistry() });
    const data = (result.layers[0] as { data: string }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data).toMatch(/[Mm]/);
  });

  (haveFont ? it : it.skip)('compileWithContext() forwards fonts to fromGlyph (regression)', () => {
    // Regression: previously CompileWithContextOptions had no `fonts` field
    // and evaluateWithContext never set evalState.fontRegistry. The playground
    // calls compileWithContext, so glyph extraction silently failed in the
    // browser even though the test suite passed for compile().
    const result = compileWithContext(src, { fonts: buildRegistry() });
    expect(result.layers.length).toBeGreaterThan(0);
    const data = (result.layers[0] as { data: string }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data).toMatch(/[Mm]/);
  });
});
