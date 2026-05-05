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
    it('reports expected = after variable name', () => {
      const diags = diagnose('let x 10;');
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toBe("Expected '=' after variable name");
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
