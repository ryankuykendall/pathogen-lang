// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { store } from '../playground/state/store';
import { buildDebugCapture, CAPTURE_LINE_LIMIT } from '../playground/utils/debug-capture';
import { compile } from '../src';
import { groupWarnings } from '../src/evaluator/warning-groups';

// Copy Debug Info lists warnings once per family with a count (through
// window.PathogenLang.groupWarnings) and keeps the [warn] log mirrors out of
// Log Output, so a warning appears in the paste exactly once.

const PLATE = 'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};';
const FILLET_LOOP = `${PLATE}\nfor (i in 1..50) {\n  let soft = plate.fillet(30);\n}\nlog("done");\nM 10 10\nplate.draw();`;

function section(capture: string, heading: string): string {
  const start = capture.indexOf(`## ${heading}`);
  expect(start).toBeGreaterThan(-1);
  const next = capture.indexOf('\n## ', start + 1);
  return capture.slice(start, next === -1 ? undefined : next);
}

describe('debug capture warning grouping', () => {
  afterEach(() => {
    store.update({ code: '', logs: [], warnings: [], layers: [] });
    delete (window as unknown as { PathogenLang?: unknown }).PathogenLang;
  });

  it('lists one row per family with its count and omits the log mirrors', () => {
    (window as unknown as { PathogenLang: unknown }).PathogenLang = { groupWarnings };
    const result = compile(FILLET_LOOP);
    expect(result.warnings).toHaveLength(200);
    store.update({ code: FILLET_LOOP, logs: result.logs, warnings: result.warnings, layers: result.layers });

    const capture = buildDebugCapture();
    const warnings = section(capture, 'Warnings');
    const rows = warnings.split('\n').filter((l) => l.startsWith('- '));
    expect(rows).toEqual([
      expect.stringMatching(
        /^- \[corner-op\] line 8:14 Fillet radius clamped at vertex \d+: effective radius [\d.]+ \(×100\)$/,
      ),
      expect.stringMatching(
        /^- \[corner-op\] line 8:14 Fillet skipped at vertex \d+: radius too large for edge length \(×100\)$/,
      ),
    ]);

    const logs = section(capture, 'Log Output');
    expect(logs).toContain('[line 10] done');
    expect(logs).not.toContain('[warn]');
    expect(logs).toContain('(200 warning mirrors omitted — see Warnings)');
  });

  it('falls back to one row per warning without the library global, still capped', () => {
    // 51 iterations × 4 warnings = 204: four past the cap, so the trailer appears.
    const source = FILLET_LOOP.replace('1..50', '1..51');
    const result = compile(source);
    expect(result.warnings).toHaveLength(204);
    store.update({ code: source, logs: result.logs, warnings: result.warnings, layers: result.layers });

    const rows = section(buildDebugCapture(), 'Warnings')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(rows).toHaveLength(CAPTURE_LINE_LIMIT + 1);
    expect(rows[0]).toMatch(/^- \[corner-op\] line 8:14 Fillet radius clamped at vertex \d+: effective radius [\d.]+$/);
    expect(rows[CAPTURE_LINE_LIMIT]).toBe(`- … ${204 - CAPTURE_LINE_LIMIT} more families (204 warnings total)`);
  });
});
