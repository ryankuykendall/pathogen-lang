import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getDiagnostics } from '../../src/language-services/diagnostics';
import { DiagnosticSeverity } from '../../src/language-services/types';

function diagnose(source: string) {
  return getDiagnostics(new StringTextDocument(source));
}

describe('getDiagnostics', () => {
  describe('valid programs', () => {
    it('returns no diagnostics for valid code', () => {
      expect(diagnose('M 10 20')).toEqual([]);
    });

    it('returns no diagnostics for valid multi-line code', () => {
      expect(diagnose('let x = 10;\nM x 20')).toEqual([]);
    });

    it('returns no diagnostics for empty input', () => {
      expect(diagnose('')).toEqual([]);
    });
  });

  describe('parser errors', () => {
    it('reports missing semicolon after let declaration', () => {
      const diags = diagnose('let x = 10');
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diags[0].source).toBe('pathogen-parser');
      expect(diags[0].message).toContain("Missing ';'");
    });

    it('reports correct 0-based line for single-line error', () => {
      const diags = diagnose('let x = 10');
      expect(diags[0].range.start.line).toBe(0);
    });

    it('reports a style declaration missing its trailing semicolon', () => {
      const diags = diagnose("define PathLayer('a') ${ fill: none; stroke-width: 3 }\nlayer('a').apply { M 0 0 L 10 10 }");
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toContain("Missing ';'");
    });

    it('stays resilient (no throw) for an incomplete style block being typed', () => {
      // AST-building is lenient, so a half-typed block still yields a single
      // diagnostic rather than crashing the language service.
      expect(() => diagnose('let accent = oklch(0.7 0.1 250);\nlet s = ${ stroke:  };')).not.toThrow();
    });

    it('reports correct 0-based line for multi-line error', () => {
      // Error is on line 2 (0-based: 1)
      const diags = diagnose('let x = 10;\nlet y = 20');
      expect(diags).toHaveLength(1);
      expect(diags[0].range.start.line).toBe(1);
    });

    it('reports error for unclosed brace', () => {
      const diags = diagnose('for (i in 0..5) { M i 0');
      expect(diags).toHaveLength(1);
      expect(diags[0].source).toBe('pathogen-parser');
    });

    it('range spans from error position to end of line', () => {
      const diags = diagnose('let x = 10');
      expect(diags[0].range.start.line).toBe(diags[0].range.end.line);
      expect(diags[0].range.end.character).toBeGreaterThanOrEqual(diags[0].range.start.character);
    });

    it('reports missing semicolon followed by path command', () => {
      const diags = diagnose('let x = 10\nM x 0');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toContain("Missing ';'");
      // Error should point to line 0 (end of let declaration)
      expect(diags[0].range.start.line).toBe(0);
    });
  });

  describe('evaluator errors', () => {
    it('reports undefined variable', () => {
      const diags = diagnose('M undefinedVar 0');
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diags[0].source).toBe('pathogen-evaluator');
      expect(diags[0].message).toContain('Undefined variable');
      expect(diags[0].message).toContain('undefinedVar');
    });

    it('reports correct 0-based line for evaluator error', () => {
      const diags = diagnose('let x = 10;\nM undefinedVar 0');
      expect(diags).toHaveLength(1);
      expect(diags[0].range.start.line).toBe(1);
    });

    it('reports type errors', () => {
      const diags = diagnose('let x = "hello";\nM calc(x + 1) 0');
      expect(diags).toHaveLength(1);
      expect(diags[0].source).toBe('pathogen-evaluator');
    });

    it('returns parser error when parser fails (not evaluator)', () => {
      // Parser error takes precedence — evaluator never runs
      const diags = diagnose('let x = 10\nM undefinedVar 0');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].source).toBe('pathogen-parser');
    });
  });

  describe('multi-error recovery', () => {
    it('reports multiple errors across separate statements', () => {
      const source = [
        'let x = 10',     // line 0: missing semicolon
        'let y = 20;',    // line 1: valid
        'let z = 30',     // line 2: missing semicolon
        'M y 0',          // line 3: valid
      ].join('\n');
      const diags = diagnose(source);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      // First error on line 0
      expect(diags[0].range.start.line).toBe(0);
      expect(diags[0].source).toBe('pathogen-parser');
    });

    it('reports errors on correct lines after recovery', () => {
      const source = [
        'let a = 10',   // line 0: missing semicolon
        'let b = 20;',  // line 1: valid
        'M b 0',        // line 2: valid
      ].join('\n');
      const diags = diagnose(source);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      // The first error should be on line 0
      expect(diags[0].range.start.line).toBe(0);
    });

    it('recovers at for-loop and let boundaries', () => {
      const source = [
        'let x = 10',       // line 0: missing semicolon
        'for (i in 0..5) {', // line 1: recovery point
        '  M i 0',           // line 2: valid
        '}',                 // line 3: valid
        'let y = 20',        // line 4: missing semicolon
        'M 0 0',             // line 5: recovery point
      ].join('\n');
      const diags = diagnose(source);
      expect(diags.length).toBeGreaterThanOrEqual(2);
    });

    it('reports errors with correct line numbers after recovery', () => {
      // Missing semicolons on lines 0 and 3, with valid recovery points between
      const source = [
        'let x = 10',     // line 0: missing semicolon
        'M 0 0',          // line 1: recovery point
        'L 10 10',        // line 2: valid
        'let y = 20',     // line 3: missing semicolon
        'M 5 5',          // line 4: recovery point
      ].join('\n');
      const diags = diagnose(source);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      // First error: Parsimmon gives detailed message on line 0
      expect(diags[0].range.start.line).toBe(0);
      // Second error: Lezer detects the second missing semicolon
      // (exact line depends on Lezer's error recovery heuristics)
      const errorLines = diags.map((d) => d.range.start.line);
      expect(errorLines.some((l) => l >= 3)).toBe(true);
    });

    it('filters cascade errors adjacent to the real error', () => {
      // Missing ';' after style block — only one real error, the next line is cascade noise
      const source = [
        "let bg = PathLayer('bg') ${ fill: red; }",  // line 0: missing ;
        'bg.apply {',                                  // line 1: cascade
        '  rect(0, 0, 100, 100);',
        '}',
      ].join('\n');
      const diags = diagnose(source);
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toContain("Missing ';'");
    });

    it('preserves genuinely separate errors across distant lines', () => {
      const source = [
        'let x = 10',     // line 0: missing ;
        'M x 0',          // line 1: valid (cascade filtered)
        'L 20 20',        // line 2: valid
        'let y = 20',     // line 3: missing ; (separate error, >2 lines away)
        'M y 0',          // line 4: valid
      ].join('\n');
      const diags = diagnose(source);
      expect(diags.length).toBeGreaterThanOrEqual(2);
    });

    it('does not produce false positives for valid programs', () => {
      const source = [
        'let x = 10;',
        'let y = 20;',
        'M x y',
        'L calc(x + 10) calc(y + 10)',
      ].join('\n');
      expect(diagnose(source)).toEqual([]);
    });

    it('still returns single error for a single-error file', () => {
      const diags = diagnose('let x = 10');
      // Should have exactly 1 error (not duplicated by recovery)
      expect(diags).toHaveLength(1);
    });
  });

  describe('diagnostic structure', () => {
    it('has all required fields', () => {
      const diags = diagnose('let x = 10');
      expect(diags).toHaveLength(1);
      const d = diags[0];
      expect(d).toHaveProperty('range');
      expect(d).toHaveProperty('range.start.line');
      expect(d).toHaveProperty('range.start.character');
      expect(d).toHaveProperty('range.end.line');
      expect(d).toHaveProperty('range.end.character');
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('message');
      expect(d).toHaveProperty('source');
    });

    it('uses 0-based positions (LSP-compatible)', () => {
      // "let x = 10" — parser reports error at line 1, col 11 (1-based)
      // We should get line 0, character 10 (0-based)
      const diags = diagnose('let x = 10');
      expect(diags[0].range.start.line).toBe(0);
      expect(diags[0].range.start.character).toBe(10);
    });
  });

  describe('contextual error messages', () => {
    it("reports did-you-mean for '@fontFamily' (missing space after @font)", () => {
      const diags = diagnose('@fontFamily;\nM 0 0');
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toBe(
        "unknown directive '@fontFamily' — did you mean '@font fontFamily'?",
      );
      // Anchored to the directive, not the top of the file.
      expect(diags[0].range.start).toEqual({ line: 0, character: 0 });
      expect(diags[0].range.end.character).toBeGreaterThan(0);
    });

    it('reports expected = after variable name', () => {
      const diags = diagnose('let x 10;');
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toBe("Expected '=' after variable name");
    });

    it('reports helpful message for malformed lambda/block parameters', () => {
      const diags = diagnose('let f = {|a b| return a; };');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toContain('block parameters');
      expect(diags[0].message).toContain('{|a, b| ... }');
    });

    it('reports expected ) before { in for loop', () => {
      const diags = diagnose('for (i in 0..5 { M i 0 }');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toBe("Expected ')' before '{'");
    });

    it('reports expected { for function body', () => {
      const diags = diagnose('fn draw()\nM 0 0');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toBe("Expected '{' for function body");
    });

    it('reports unexpected ) after expression', () => {
      const diags = diagnose('let x = (10 + 20));');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toContain("Unexpected ')'");
    });

    it('reports missing ; after expression statement', () => {
      const diags = diagnose('let x = 10;\ncircle(50, 50, 25)\nM 0 0');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0].message).toContain("Missing ';'");
    });

    it('reports missing ; after let across multiple errors', () => {
      const diags = diagnose('let a = 10\nM a 0\nlet b = 20\nM b 0');
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags[0].message).toContain("Missing ';'");
      expect(diags[1].message).toContain("Missing ';'");
    });
  });

  describe('font-availability false positives', () => {
    // The diagnostics layer runs evaluate(ast) without a font registry.
    // Programs using PathBlock.fromGlyph() / TextBlock.toPathBlock() throw
    // "no fonts were loaded" on this fontless pass even when the real host
    // compile (which has fonts) would succeed. Such errors are noise for
    // language-services consumers and must be filtered out — otherwise
    // they mask the host's authoritative result in the playground UI.

    it('does not surface "no fonts were loaded" when source uses PathBlock.fromGlyph', () => {
      const source = `
        @font "Inconsolata" 400;
        let s = \${ font-family: "Inconsolata"; font-size: 16; };
        let g = PathBlock.fromGlyph('A', s);
      `;
      const diags = diagnose(source);
      expect(diags.every((d) => !d.message.includes('no fonts were loaded'))).toBe(true);
      expect(diags.every((d) => !d.message.includes('Available fonts: none'))).toBe(true);
    });

    it('does not surface "requires fonts to be loaded" for TextBlock.toPathBlock', () => {
      const source = `
        @font "Inconsolata" 400;
        let t = TextBlock(0, 0)\`hi\`;
        let p = t.toPathBlock();
      `;
      const diags = diagnose(source);
      expect(diags.every((d) => !d.message.includes('requires fonts to be loaded'))).toBe(true);
    });

    it('still surfaces non-font runtime errors from Phase 3 evaluate', () => {
      // Undefined-variable is a real Phase-3 runtime error unrelated to
      // fonts. The filter must not swallow it.
      const diags = diagnose('let x = unknownVar;');
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some((d) => /Undefined variable/i.test(d.message))).toBe(true);
    });
  });
});

describe('command-letter shadowing rescue (single-letter variable in path args)', () => {
  it('declared single letter used bare in path args gets the specific message at the letter', () => {
    const doc = new StringTextDocument('let m = 25;\nM 10 10\nL m 40');
    const diags = getDiagnostics(doc);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].message).toContain("'m' is a path command here");
    expect(diags[0].message).toContain('calc(m)');
    expect(diags[0].range.start.line).toBe(2);
    expect(diags[0].range.start.character).toBe(2);
  });

  it('the same shape with NO matching declaration keeps the generic message', () => {
    const doc = new StringTextDocument('M 10 10\nL q 40');
    const diags = getDiagnostics(doc);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].message).toContain("Missing ';'");
  });

  it('calc-wrapped use of the declared letter produces no diagnostics', () => {
    const doc = new StringTextDocument('let m = 25;\nM 10 10\nL calc(m) 40');
    expect(getDiagnostics(doc)).toEqual([]);
  });

  it('uppercase letters get the rescue too', () => {
    const doc = new StringTextDocument('let V = 9;\nM 10 10\nL 5 V');
    const diags = getDiagnostics(doc);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].message).toContain("'V' is a path command here");
  });
});

describe('getDiagnostics switch statements', () => {
  it('a valid path-form switch produces no diagnostics', () => {
    expect(diagnose('let kind = 2;\nswitch (kind) {\n  case 1 {\n    M 0 0\n  }\n  case 2..<5 where kind > 0 {\n    M 1 1\n  }\n  default {\n    M 2 2\n  }\n}')).toEqual([]);
  });

  it('destructuring case bindings do not trigger undefined-variable errors', () => {
    expect(diagnose('let p = Point(3, 1);\nswitch (p) {\n  case { x, y } where x > y {\n    M x y\n  }\n  case [first, ...others] {\n    M first 0\n  }\n}')).toEqual([]);
  });

  it('a valid text-form switch produces no diagnostics', () => {
    const src = [
      "define TextLayer('labels') ${ font-size: 12; }",
      'let level = 3;',
      "layer('labels').apply {",
      '  text(10, 30) {',
      '    switch (level) {',
      '      case 1, 2 { `Low` }',
      '      case 3..<7 { tspan()`Medium` }',
      '      default { `High` }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(diagnose(src)).toEqual([]);
  });

  const CASE_COLON = "Case bodies use braces: case value { ... } (no ':' and no fallthrough)";
  const DEFAULT_COLON = "Case bodies use braces: default { ... } (no ':' and no fallthrough)";
  const IN_SWITCH = "Unexpected 'foo' in switch — expected 'case', 'default', or '}'";

  it.each([
    ['switch x { case 1 { M 0 0 } }', "Expected '(' after 'switch'"],
    ['switch (x { case 1 { M 0 0 } }', "Expected ')' before '{'"],
    // A zero-width error at end of input is skipped by the Lezer pass (same
    // for `if (x) {`), so the unclosed forms need a following statement.
    ['switch (x) {\n  case 1 { M 0 0 }\nlet y = 1;', 'Incomplete switch statement'],
    ['switch (x) {\n  case 1 { M 0 0 }\n  default { M 1 1 }\nM 2 2\n', 'Incomplete switch statement'],
    ['switch (x) { foo case 1 { M 0 0 } }', IN_SWITCH],
    ['switch (x) { case }', "Expected a pattern after 'case'"],
    ['switch (x) { case ; }', "Expected a pattern after 'case'"],
    ['switch (x) { case { M 0 0 } }', "Expected a pattern after 'case' — the '{' opened the case body"],
    ['switch (x) { case 1: M 0 0 }', CASE_COLON],
    ['switch (x) { case 1 }', "Expected '{' to open the case body"],
    ['switch (x) { case 1 M 0 0 }', "Expected '{' to open the case body"],
    ['switch (x) { case 1 ) { M 0 0 } }', "Invalid case pattern — unexpected ')'"],
    ['switch (x) { case 1..2..3 { M 0 0 } }', "Invalid case pattern — unexpected '..'"],
    ['switch (x) { case 1.. ) { M 0 0 } }', "Invalid case pattern — unexpected ')'"],
    ['switch (x) { case 1 where }', "Expected a condition after 'where'"],
    ['switch (x) { case 1 where > 2 { M 0 0 } }', "Expected a condition after 'where'"],
    ['switch (x) { case 1 where { M 0 0 } }', "Expected a condition after 'where' — the '{' opened the case body"],
    ['switch (x) { default }', "Expected '{' after 'default'"],
    ['switch (x) { default M 0 0 }', "Expected '{' after 'default'"],
    ['switch (x) { default: M 0 0 }', DEFAULT_COLON],
    ['case 1 { M 0 0 }', "'case' is only valid inside a switch"],
    ['where x > 0 { M 0 0 }', "'where' is only valid after a case pattern"],
    ['let x = 1 where x > 0;', "'where' is only valid after a case pattern"],
    // Text-form (TextSwitchStatement / TextCaseClause / TextDefaultClause)
    ['text(0, 0) { switch x { case 1 { `a` } } }', "Expected '(' after 'switch'"],
    ['text(0, 0) { switch (x) {\n  case 1 { `a` }\nlet y = 1;', 'Incomplete switch statement'],
    ['text(0, 0) { switch (x) { foo case 1 { `a` } } }', IN_SWITCH],
    ['text(0, 0) { switch (x) { case 1: `a` } }', CASE_COLON],
    ['text(0, 0) { switch (x) { case { `a` } } }', "Expected a pattern after 'case' — the '{' opened the case body"],
    ['text(0, 0) { switch (x) { case 1 `a` } }', "Expected '{' to open the case body"],
    ['text(0, 0) { switch (x) { default `a` } }', "Expected '{' after 'default'"],
  ])('%s → %s', (source, message) => {
    const diags = diagnose(source);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toBe(message);
    expect(diags[0].source).toBe('pathogen-parser');
  });

  it("points the missing-'(' error at the token after switch", () => {
    const [diag] = diagnose('switch x {\n  case 1 { M 0 0 }\n}');
    expect(diag.message).toBe("Expected '(' after 'switch'");
    expect(diag.range.start).toEqual({ line: 0, character: 7 });
  });

  it('surfaces AST-builder pattern errors as parser diagnostics', () => {
    const notLast = diagnose('switch (x) { default { M 0 0 } case 1 { M 1 1 } }');
    expect(notLast.map((d) => d.message)).toEqual(["'default' must be the last clause in a switch"]);
    const literalArray = diagnose('switch (x) { case [1, 2] { M 0 0 } }');
    expect(literalArray.map((d) => d.message)).toEqual([
      'Array patterns in a case bind names only — write case [first, second] or case [head, ...rest]',
    ]);
  });
});
