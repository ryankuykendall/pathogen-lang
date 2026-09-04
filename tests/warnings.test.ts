import { describe, expect, it } from 'vitest';

import { compile, compileWithContext } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { DiagnosticSeverity } from '../src/language-services/types';

const PLATE = 'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};';

/**
 * Compiler warnings: non-fatal problems the evaluator worked around. Each
 * carries a code and, where the statement is known, its line and column;
 * every warning is also mirrored into `logs` as a `[warn] …` entry with
 * `severity: 'warn'` and the same line.
 */
describe('compiler warnings', () => {
  it('a clamped fillet reports code, message, and the call position', () => {
    const result = compile(`${PLATE}\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();`);
    expect(result.warnings.length).toBeGreaterThan(0);
    const first = result.warnings[0];
    expect(first.code).toBe('corner-op');
    expect(first.message).toMatch(/^Fillet radius clamped at vertex \d+: effective radius 10\.00$/);
    // `.fillet(30)` sits on line 7 (after the six-line PLATE), column 12.
    expect(first.line).toBe(7);
    expect(first.column).toBe(12);
    // compilation still succeeds
    expect(result.layers[0].data.startsWith('M 10 10')).toBe(true);
  });

  it('mirrors every warning into logs with severity and the same line', () => {
    const result = compile(`${PLATE}\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();`);
    const mirrors = result.logs.filter((e) => e.severity === 'warn');
    expect(mirrors).toHaveLength(result.warnings.length);
    expect(mirrors[0].line).toBe(7);
    expect(mirrors[0].parts[0].value).toBe(`[warn] ${result.warnings[0].message}`);
  });

  it('a chamfer clamp is located at its call', () => {
    const result = compile(`${PLATE}\nM 0 0\nplate.chamfer(80).draw();`);
    expect(result.warnings[0].code).toBe('corner-op');
    expect(result.warnings[0].message).toMatch(/clamped/);
    expect(result.warnings[0].line).toBe(8);
  });

  it('a recorded corner op (with clause) is located at the clause, not the emit site', () => {
    // `with fillet(...)` rounds the joint with the previous command and is
    // applied at finalization, far from the statement; the warning still
    // carries the clause's own line and column.
    const result = compile('M 0 0\nh 40\nv 40 with fillet(50)');
    expect(result.warnings.map((w) => w.code)).toEqual(['corner-op', 'corner-op']);
    expect(result.warnings[0].message).toMatch(/^Fillet radius clamped at vertex 0/);
    expect(result.warnings[1].message).toMatch(/^Fillet skipped at vertex 0: radius too large/);
    expect(result.warnings.map((w) => [w.line, w.column])).toEqual([
      [3, 6],
      [3, 6],
    ]);
    expect(result.layers[0].data).toBe('M 0 0 h 40 v 40');
  });

  it('a cut that drops a sliver is located at the cut() call', () => {
    // A cutter 1e-6 above the plate's top edge leaves a piece thinner than
    // the geometric tolerance; cut() drops it and says so.
    const result = compile(
      `${PLATE}\nlet cutter = @{\n  m -10 39.999999\n  h 60\n};\nlet pieces = plate.cut(cutter);\nlog(pieces.length);\nM 0 0\nplate.draw();`,
    );
    expect(result.warnings).toEqual([
      { code: 'cut', message: 'cut(): a sliver piece thinner than the geometric tolerance was dropped', line: 11, column: 14 },
    ]);
    expect(result.logs.at(-1)!.parts[0].value).toBe('1');
  });

  // 'annotation-transfer' guards an invariant (records and tracked commands
  // are 1:1 by construction) and has no reachable program; 'font-glyph' is
  // covered in font-provider.test.ts where a font registry is available.

  it('a degenerate gradient warns without a line', () => {
    const result = compile(
      "let g = FreeformGradient('f', 100, 100) {|fg|\n  fg.point(10, 10, Color('#ff0000'));\n};\ndefine PathLayer('a') #{ fill: g; }\nlayer('a').apply { M 0 0 }",
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('gradient');
    expect(result.warnings[0].message).toMatch(/fewer than 2 points/);
    expect(result.warnings[0].line).toBeUndefined();
    expect(result.logs[0].severity).toBe('warn');
    expect(result.logs[0].line).toBeNull();
  });

  it('a clean program has no warnings', () => {
    const result = compile(`${PLATE}\nM 0 0\nplate.draw();`);
    expect(result.warnings).toEqual([]);
  });

  it('compileWithContext carries the same warnings', () => {
    const src = `${PLATE}\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();`;
    expect(compileWithContext(src).warnings).toEqual(compile(src).warnings);
  });

  it('surfaces as a Warning diagnostic on the call line', () => {
    const diags = getDiagnostics(
      new StringTextDocument(`${PLATE}\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();`),
    );
    const warnings = diags.filter((d) => d.severity === DiagnosticSeverity.Warning);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].range.start).toEqual({ line: 6, character: 11 });
    expect(warnings[0].message).toMatch(/Fillet radius clamped/);
    expect(diags.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(false);
  });
});
