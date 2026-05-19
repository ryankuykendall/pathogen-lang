// Tests for the viewbox migration's AST-walk skip checks.
//
// The migration prepends two `define` statements independently:
//   1. `define ViewBox(0, 0, w, h);` if the AST has no ViewBoxDefinition
//   2. `define default PathLayer(...);` if the AST has no default layer
//
// Each check is AST-based (via parseLezer) so comment / template-literal
// mentions don't fool the skip. These tests pin both contracts.

import { describe, expect, it } from 'vitest';

import { parseLezer } from '../src/parser';
import type { LayerDefinition, Statement } from '../src/parser/ast';

function inspectCode(code: string): { hasViewBox: boolean; hasDefaultLayer: boolean; parsed: boolean } {
  try {
    const { ast } = parseLezer(code);
    let hasViewBox = false;
    let hasDefaultLayer = false;
    for (const s of ast.body as Statement[]) {
      if (s.type === 'ViewBoxDefinition') hasViewBox = true;
      else if (s.type === 'LayerDefinition' && (s as LayerDefinition).isDefault) {
        hasDefaultLayer = true;
      }
    }
    return { hasViewBox, hasDefaultLayer, parsed: true };
  } catch {
    return { hasViewBox: false, hasDefaultLayer: false, parsed: false };
  }
}

describe('viewbox migration — skip detection', () => {
  it('detects a real define ViewBox statement', () => {
    expect(inspectCode('define ViewBox(0, 0, 200, 200);').hasViewBox).toBe(true);
  });

  it('detects a real define default PathLayer statement', () => {
    const code = `define default PathLayer('main-path-layer') \${ stroke: red; };`;
    expect(inspectCode(code).hasDefaultLayer).toBe(true);
  });

  it('detects either keyword among other top-level statements', () => {
    const code = `
      let foo = 5;
      define ViewBox(0, 0, 200, 200);
      define default PathLayer('main') \${ stroke: red; };
      M 0 0 L 100 100
    `;
    const result = inspectCode(code);
    expect(result.hasViewBox).toBe(true);
    expect(result.hasDefaultLayer).toBe(true);
  });

  it('does NOT mistake non-default PathLayer for a default-layer match', () => {
    // No `default` keyword → the layer exists but is not the default.
    const code = `define PathLayer('outline') \${ stroke: red; };`;
    expect(inspectCode(code).hasDefaultLayer).toBe(false);
  });

  it('treats default TextLayer as satisfying the default-layer check', () => {
    // The migration only checks isDefault; layer type doesn't matter
    // because the user's workspace would already error if you tried to
    // prepend a second default.
    const code = `define default TextLayer('labels') \${ font-size: 14; };`;
    expect(inspectCode(code).hasDefaultLayer).toBe(true);
  });

  it('does NOT mistake a comment-only mention for a real definition', () => {
    const code = `
      // The define ViewBox(0, 0, 200, 200); statement goes here.
      // define default PathLayer('foo') ...
      M 0 0
    `;
    const result = inspectCode(code);
    expect(result.hasViewBox).toBe(false);
    expect(result.hasDefaultLayer).toBe(false);
  });

  it('does NOT mistake template-literal text for a real definition', () => {
    const code = `
      define TextLayer('labels') \${ font-size: 14; };
      layer('labels').apply {
        text(10, 10)\`example: define ViewBox(0, 0, 200, 200);\`
      }
    `;
    expect(inspectCode(code).hasViewBox).toBe(false);
  });

  it('treats unparseable code as missing both prepends', () => {
    // Lezer's error recovery rarely throws; the parser returns a tree that
    // contains zero ViewBox / default-layer nodes, so the migration still
    // ends up prepending. We only assert the safe-default behavior here.
    const result = inspectCode('this is not a valid pathogen program ###');
    expect(result.hasViewBox).toBe(false);
    expect(result.hasDefaultLayer).toBe(false);
  });

  it('returns both false for empty code', () => {
    const result = inspectCode('');
    expect(result.hasViewBox).toBe(false);
    expect(result.hasDefaultLayer).toBe(false);
  });
});
