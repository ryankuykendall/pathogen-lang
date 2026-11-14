// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { store } from '../playground/state/store';
import { buildCapture, buildDebugCapture, CAPTURE_LINE_LIMIT } from '../playground/utils/debug-capture';
import { compile } from '../src';
import { groupWarnings } from '../src/evaluator/warning-groups';

import type { ErrorReading } from '../playground/services/error-place';
import type { CaptureInput } from '../playground/utils/debug-capture';

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

// Step 8 (docs/workspace-files.md "Copy Debug Info"; note 42's questions,
// answered 2026-11-13 in note 52): the capture of a workspace. The program
// shown and the files its imports reach, the error's file first; every other
// file by name; each error with the lines around it; other programs' errors;
// logs with their file; a short note for an assistant, naming no syntax.
describe('the capture of a workspace (step 8)', () => {
  const lines = (n: number, word: string) => Array.from({ length: n }, (_, i) => `// ${word} ${i + 1}`).join('\n');
  const GEARS = [
    'module;',
    '',
    'export fn gear(center, radius, teeth) {',
    '  log(teeth);',
    "  assert(teeth >= 3, 'a gear needs at least 3 teeth');",
    '  circle(center.x, center.y, radius);',
    '}',
    '',
  ].join('\n');
  const MAIN =
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40, 2);\n';
  const FAILURE: ErrorReading = {
    file: 'parts/gears.pathogen',
    line: 5,
    column: 3,
    text: 'assertion failed: a gear needs at least 3 teeth',
    steps: [{ kind: 'called from', file: 'main.pathogen', line: 4 }],
    site: { line: 4, column: 1 },
  };

  function input(over: Partial<CaptureInput> = {}): CaptureInput {
    return {
      timestamp: '2026-11-13T12:00:00.000Z',
      workspace: 'My Gears',
      shown: 'main.pathogen',
      openFile: 'parts/gears.pathogen',
      main: 'main.pathogen',
      files: [
        { path: 'main.pathogen', text: MAIN, kind: 'program' },
        { path: 'try-sizes.pathogen', text: 'circle(10, 10, 5);\n', kind: 'program' },
        { path: 'parts/gears.pathogen', text: GEARS, kind: 'module' },
        { path: 'parts/labels.pathogen', text: 'module;\nexport const a = 1;\n', kind: 'module' },
      ],
      reach: ['parts/gears.pathogen'],
      status: 'error',
      readings: [FAILURE],
      others: [],
      toFixed: null,
      layers: [],
      layerVisibility: {},
      logs: [],
      warnings: [],
      calledFunctions: [],
      canvas: { width: 200, height: 200, background: '#fff', gridEnabled: false, gridSize: 10, gridColor: '#ccc' },
      ...over,
    };
  }

  it('its heading names the program shown (and that it’s the main) and the file open in the editor', () => {
    const capture = buildCapture(input());
    expect(capture).toContain('**Program shown:** main.pathogen (the main)');
    expect(capture).toContain('**File open in the editor:** parts/gears.pathogen');
  });

  it('the error: its file, line and words, each step back, and five lines either side, numbered, its line marked', () => {
    const errors = section(buildCapture(input()), 'Errors');
    expect(errors).toContain(
      '### parts/gears.pathogen line 5, col 3\nassertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 4',
    );
    expect(errors).toContain(
      [
        '```',
        '   1 | module;',
        '   2 | ',
        '   3 | export fn gear(center, radius, teeth) {',
        '   4 |   log(teeth);',
        ">  5 |   assert(teeth >= 3, 'a gear needs at least 3 teeth');",
        '   6 |   circle(center.x, center.y, radius);',
        '   7 | }',
        '   8 | ',
        '```',
      ].join('\n'),
    );
  });

  it('errors in other programs: one line each, in the program list’s words, with the lines around', () => {
    const others = section(
      buildCapture(
        input({
          readings: [],
          status: 'completed',
          others: [{ program: 'try-sizes.pathogen', place: { file: 'parts/gears.pathogen', line: 4 } }],
        }),
      ),
      'Errors in other programs',
    );
    expect(others).toContain('- try-sizes.pathogen: Error in parts/gears.pathogen line 4');
    expect(others).toContain('>  4 |   log(teeth);');
    // Five lines either side, but the file ends at line 8.
    expect(others).toContain('   8 | \n```');
    expect(others).not.toContain('   9 |');
  });

  it('the files: the error’s first, then the program shown, then the rest it reaches; the others by name, without text', () => {
    const files = section(buildCapture(input({ reach: ['parts/labels.pathogen', 'parts/gears.pathogen'] })), 'Files');
    const headings = files.split('\n').filter((l) => l.startsWith('### '));
    expect(headings).toEqual([
      '### parts/gears.pathogen (module, 8 lines)',
      '### main.pathogen (the program shown, 5 lines)',
      '### parts/labels.pathogen (module, 3 lines)',
    ]);
    expect(files).toContain('```pathogen\nmodule;\n\nexport fn gear');
    expect(files).toContain('Other files, not included:\n- try-sizes.pathogen: program, 2 lines');
    expect(files).not.toContain('circle(10, 10, 5)');
  });

  it('each file stops after 200 lines, and the report after about 1,500, saying how many lines were left out', () => {
    const big = lines(250, 'big');
    const files = section(
      buildCapture(
        input({
          readings: [],
          files: [
            { path: 'main.pathogen', text: big, kind: 'program' },
            ...Array.from({ length: 9 }, (_, i) => ({
              path: `m${i}.pathogen`,
              text: lines(200, `m${i}`),
              kind: 'module' as const,
            })),
          ],
          reach: Array.from({ length: 9 }, (_, i) => `m${i}.pathogen`),
        }),
      ),
      'Files',
    );
    expect(files).toContain('// big 200\n```\n…50 more lines');
    expect(files).not.toContain('// big 201');
    // 200 lines each: main and six modules fill 1,400; m6 has 100 left; m7 and m8 have none.
    expect(files).toContain('// m6 100\n```\n…100 more lines');
    expect(files).toContain('### m8.pathogen (module, 200 lines)\n…200 more lines');
  });

  it('logs name their file and line', () => {
    const logs = section(
      buildCapture(
        input({
          logs: [
            { line: 4, file: 'parts/gears.pathogen', parts: [{ type: 'string', value: 'teeth' }] },
            { line: 5, parts: [{ type: 'string', value: 'drawn' }] },
          ],
        }),
      ),
      'Log Output',
    );
    expect(logs).toContain('[parts/gears.pathogen line 4] teeth\n[line 5] drawn');
  });

  it('warnings name their file too; a failed compile’s log output says why there’s none', () => {
    const capture = buildCapture(
      input({
        warnings: [
          { code: 'non-finite', message: 'NaN reached path data', line: 6, column: 3, file: 'parts/gears.pathogen' },
        ],
      }),
    );
    expect(section(capture, 'Warnings')).toContain(
      '- [non-finite] parts/gears.pathogen line 6:3 NaN reached path data',
    );
    expect(section(capture, 'Log Output')).toContain(
      '(none: the compile stopped at the error, and keeps no log output)',
    );
  });

  it('a short note for an assistant: what to do, the docs’ link, and no syntax to go stale (no code at all)', () => {
    const note = section(buildCapture(input()), 'For an assistant reading this');
    expect(note).toContain('https://pathogen.studio/docs');
    expect(note).toContain('called from');
    expect(note).not.toContain('`');
    expect(note.split('\n').length).toBeLessThan(25);
  });

  it('an excerpt that can’t be shown says why: the file is gone, or the line is past its end', () => {
    const gone = { ...FAILURE, file: 'parts/gone.pathogen' };
    const past = { ...FAILURE, line: 40 };
    const errors = section(buildCapture(input({ readings: [gone, past] })), 'Errors');
    expect(errors).toContain("(parts/gone.pathogen isn't in the workspace now.)");
    expect(errors).toContain('(Line 40 is past the end of parts/gears.pathogen: it has changed since that compile.)');
  });

  it('three-digit lines line up; an error in the program shown puts it first, once, even if the reach names it too', () => {
    const long = lines(105, 'row');
    const own = { ...FAILURE, file: 'main.pathogen', line: 100, steps: [], site: null };
    const capture = buildCapture(
      input({
        readings: [own],
        files: [{ path: 'main.pathogen', text: long, kind: 'program' }],
        reach: ['main.pathogen'],
      }),
    );
    expect(section(capture, 'Errors')).toContain('   99 | // row 99\n> 100 | // row 100\n  101 | // row 101');
    const headings = section(capture, 'Files')
      .split('\n')
      .filter((l) => l.startsWith('### '));
    expect(headings).toEqual(['### main.pathogen (the program shown, 105 lines)']);
  });

  it('only the first five errors get their lines; the rest their place', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...FAILURE, line: i + 1 }));
    const errors = section(buildCapture(input({ readings: many })), 'Errors');
    expect(errors.split('\n').filter((l) => l.startsWith('>')).length).toBe(5);
    expect(errors).toContain('### parts/gears.pathogen line 7, col 3');
  });

  it('one long value is cut: a layer’s path data, a log’s value', () => {
    const data = 'L 1 1 '.repeat(2000);
    const capture = buildCapture(
      input({
        layers: [{ name: 'main', type: 'path', data, styles: {} } as unknown as CaptureInput['layers'][number]],
        logs: [{ line: 2, parts: [{ type: 'string', value: 'x'.repeat(5000) }] }],
      }),
    );
    expect(section(capture, 'Layers')).toContain(`… (${(data.length - 4000).toLocaleString('en-US')} more characters)`);
    expect(section(capture, 'Log Output')).toContain('… (1,000 more characters)');
  });

  it('a file holding three backticks gets a longer fence, so it can’t close the block early', () => {
    const tricky = 'module;\n// a note: ``` is not code here\nexport const a = 1;\n';
    const files = section(
      buildCapture(
        input({
          readings: [],
          shown: 'main.pathogen',
          files: [{ path: 'main.pathogen', text: tricky, kind: 'program' }],
          reach: [],
        }),
      ),
      'Files',
    );
    expect(files).toContain(`\`\`\`\`pathogen\n${tricky}\n\`\`\`\``);
  });

  it('the playground’s own note (a main that’s a module draws nothing) says why, under Errors', () => {
    const errors = section(
      buildCapture(
        input({
          readings: [],
          status: 'completed',
          notes: ["The main, main.pathogen, is a module: a module can't draw as the main."],
        }),
      ),
      'Errors',
    );
    expect(errors).toContain("**Note:** The main, main.pathogen, is a module: a module can't draw as the main.");
  });

  it('a scratch link (one file, no workspace): the program shown, no other files', () => {
    const files = section(
      buildCapture(
        input({
          files: [{ path: 'main.pathogen', text: 'circle(1, 1, 1);', kind: 'program' }],
          reach: [],
          readings: [],
          openFile: 'main.pathogen',
        }),
      ),
      'Files',
    );
    expect(files).toContain('### main.pathogen (the program shown, 1 line)');
    expect(files).not.toContain('Other files');
  });
});
