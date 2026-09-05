import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import {
  groupWarnings,
  groupWarnLogEntries,
  WARNING_GROUP_INSTANCE_LIMIT,
  warningFamily,
} from '../src/evaluator/warning-groups';

import type { CompileWarning, LogEntry } from '../src/evaluator/types';

const PLATE = 'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};';
/** 50 fillet(30) calls on the 4-vertex plate: 4 warnings each (clamped + skipped at two vertices). */
const FILLET_LOOP = `${PLATE}\nfor (i in 1..50) {\n  let soft = plate.fillet(30);\n}\nM 10 10\nplate.draw();`;

/**
 * Near-identical warnings differ only in numbers (vertex index, effective
 * radius), so a family is the message with every number replaced. Every
 * surface — console, CLI, LSP, debug capture — groups by family; the raw
 * warnings list is never collapsed.
 */
describe('warningFamily', () => {
  it('replaces integers, decimals, and negatives with # and strips the mirror prefix', () => {
    const cases: [string, string][] = [
      [
        'Fillet radius clamped at vertex 67: effective radius 8.98',
        'Fillet radius clamped at vertex #: effective radius #',
      ],
      [
        'Fillet skipped at vertex 0: radius too large for edge length',
        'Fillet skipped at vertex #: radius too large for edge length',
      ],
      [
        'Chamfer/fillet distance -2.5 clamped to incoming edge length 12.00',
        'Chamfer/fillet distance # clamped to incoming edge length #',
      ],
      [
        'Elliptical fillet skipped at curve junction (index 3)',
        'Elliptical fillet skipped at curve junction (index #)',
      ],
      [
        '[warn] Fillet radius clamped at vertex 2: effective radius 10.00',
        'Fillet radius clamped at vertex #: effective radius #',
      ],
      [
        'cut(): a sliver piece thinner than the geometric tolerance was dropped',
        'cut(): a sliver piece thinner than the geometric tolerance was dropped',
      ],
      [
        "FreeformGradient 'f' has fewer than 2 points — gradient will be empty or uniform.",
        "FreeformGradient 'f' has fewer than # points — gradient will be empty or uniform.",
      ],
    ];
    for (const [message, family] of cases) expect(warningFamily(message)).toBe(family);
  });

  it('keeps quoted names verbatim, digits included, so differently named gradients stay distinct', () => {
    expect(warningFamily("TopoGradient 'a' has no contours")).not.toBe(
      warningFamily("TopoGradient 'b' has no contours"),
    );
    expect(warningFamily("TopoGradient 'surface1' has no contours")).toBe("TopoGradient 'surface1' has no contours");
    expect(warningFamily("FreeformGradient 'f2' has fewer than 2 points")).toBe(
      "FreeformGradient 'f2' has fewer than # points",
    );
  });
});

describe('groupWarnings', () => {
  const w = (
    message: string,
    line?: number,
    column?: number,
    code: CompileWarning['code'] = 'corner-op',
  ): CompileWarning => ({
    code,
    message,
    ...(line != null ? { line } : {}),
    ...(column != null ? { column } : {}),
  });

  it('groups by family in first-occurrence order, keeping count and instances', () => {
    const groups = groupWarnings([
      w('Fillet radius clamped at vertex 2: effective radius 10.00', 7, 12),
      w('Fillet skipped at vertex 2: radius too large for edge length', 7, 12),
      w('Fillet radius clamped at vertex 0: effective radius 6.53', 7, 12),
      w('Fillet skipped at vertex 0: radius too large for edge length', 7, 12),
    ]);
    expect(groups.map((g) => [g.family, g.count])).toEqual([
      ['Fillet radius clamped at vertex #: effective radius #', 2],
      ['Fillet skipped at vertex #: radius too large for edge length', 2],
    ]);
    expect(groups[0].first.message).toBe('Fillet radius clamped at vertex 2: effective radius 10.00');
    expect(groups[0].instances.map((i) => i.message)).toEqual([
      'Fillet radius clamped at vertex 2: effective radius 10.00',
      'Fillet radius clamped at vertex 0: effective radius 6.53',
    ]);
    expect(groups[0]).toMatchObject({ code: 'corner-op', line: 7, column: 12 });
  });

  it('separates the same family by code, line, and column', () => {
    const groups = groupWarnings([
      w('Fillet skipped at vertex 1: radius too large for edge length', 7, 12),
      w('Fillet skipped at vertex 1: radius too large for edge length', 8, 12),
      w('Fillet skipped at vertex 1: radius too large for edge length', 7, 20),
      w('Fillet skipped at vertex 1: radius too large for edge length', 7, 12, 'cut'),
      w('Fillet skipped at vertex 1: radius too large for edge length'),
    ]);
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.count === 1)).toBe(true);
    expect('line' in groups[4]).toBe(false);
  });

  it('collapses a real fillet loop into two families at one site', () => {
    const result = compile(FILLET_LOOP);
    expect(result.warnings).toHaveLength(200);
    const groups = groupWarnings(result.warnings);
    expect(groups.map((g) => [g.family, g.count])).toEqual([
      ['Fillet radius clamped at vertex #: effective radius #', 100],
      ['Fillet skipped at vertex #: radius too large for edge length', 100],
    ]);
    expect(new Set(groups.map((g) => `${g.line}:${g.column}`)).size).toBe(1);
    expect(groups[0].line).toBe(8);
  });

  it('never merges warnings without a source position, even with identical text', () => {
    const glyphs = "Font 'Inter' weight 400: 3 glyphs have no outline";
    const groups = groupWarnings([
      w(glyphs, undefined, undefined, 'font-glyph'),
      w(glyphs, undefined, undefined, 'font-glyph'),
    ]);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
  });

  it('keeps two gradients with digit-bearing ids as two rows (the review repro)', () => {
    const result = compile(
      "let g1 = TopoGradient('surface1', 100, 100);\nlet g2 = TopoGradient('surface2', 100, 100);\nM 10 10 h 10",
    );
    const contours = result.warnings.filter((x) => x.message.includes('has no contours'));
    expect(contours).toHaveLength(2);
    expect(groupWarnings(contours).map((g) => [g.first.message.slice(0, 23), g.count])).toEqual([
      ["TopoGradient 'surface1'", 1],
      ["TopoGradient 'surface2'", 1],
    ]);
  });

  it('exposes the instance limit every surface expands to', () => {
    expect(WARNING_GROUP_INSTANCE_LIMIT).toBe(200);
  });
});

describe('groupWarnLogEntries', () => {
  const warn = (line: number, message: string): LogEntry => ({
    line,
    severity: 'warn',
    parts: [{ type: 'string', value: `[warn] ${message}` }],
  });
  const plain = (line: number | null, value: string): LogEntry => ({ line, parts: [{ type: 'string', value }] });

  it('keeps plain entries in place and groups warning mirrors at their first occurrence', () => {
    const rows = groupWarnLogEntries([
      warn(7, 'Fillet radius clamped at vertex 2: effective radius 10.00'),
      warn(7, 'Fillet skipped at vertex 2: radius too large for edge length'),
      plain(9, 'hello'),
      warn(7, 'Fillet radius clamped at vertex 0: effective radius 6.53'),
      warn(7, 'Fillet skipped at vertex 0: radius too large for edge length'),
      plain(null, 'done'),
    ]);
    expect(rows.map((r) => (r.kind === 'group' ? ['group', r.count] : ['entry', r.entry.parts[0].value]))).toEqual([
      ['group', 2],
      ['group', 2],
      ['entry', 'hello'],
      ['entry', 'done'],
    ]);
    const first = rows[0];
    expect(first.kind).toBe('group');
    if (first.kind === 'group') {
      expect(first.first.parts[0].value).toBe('[warn] Fillet radius clamped at vertex 2: effective radius 10.00');
      expect(first.instances).toHaveLength(2);
    }
  });

  it('separates mirrors of the same family on different lines', () => {
    const rows = groupWarnLogEntries([
      warn(7, 'Fillet skipped at vertex 1: x'),
      warn(8, 'Fillet skipped at vertex 1: x'),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('never merges mirrors without a line', () => {
    const mirror: LogEntry = {
      line: null,
      severity: 'warn',
      parts: [{ type: 'string', value: "[warn] TopoGradient 'g1' has no contours" }],
    };
    const rows = groupWarnLogEntries([mirror, { ...mirror }]);
    expect(rows.map((r) => (r.kind === 'group' ? r.count : 'entry'))).toEqual([1, 1]);
  });

  it('mirrors of a real fillet loop collapse to two rows', () => {
    const rows = groupWarnLogEntries(compile(FILLET_LOOP).logs);
    expect(rows.map((r) => (r.kind === 'group' ? r.count : 'entry'))).toEqual([100, 100]);
  });
});
