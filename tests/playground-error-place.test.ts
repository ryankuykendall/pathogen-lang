// Where a program's compile failed, as its row in the chip's list says it
// (phase 2d, step 5b; mockup v6 screen G: "Error in parts/gears.pathogen line
// 9"). Read from the compile's own message, whose forms the real engine makes
// below: the program's own line, another file's, a parse error, an import that
// can't load, and a message with no position.

import { describe, expect, it } from 'vitest';

import {
  errorMarks,
  errorPlace,
  errorRowText,
  errorText,
  readDiagnostics,
  readMessage,
} from '../playground/services/error-place.js';
import { compile, createMemoryProjectHost, getDiagnostics, resolveModules, StringTextDocument } from '../src';

const failure = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('it compiled');
};

describe('a JSON mistake in a data file (phase 3a step 6)', () => {
  it('is read at its file, line and column, with the import that led there', async () => {
    const engine = await import('../src');
    const global = globalThis as { window?: unknown };
    const before = global.window;
    global.window = { PathogenLang: engine };
    try {
      const files = new Map([
        ['main.pathogen', 'import gears from "./data/gears.json";\nlog(gears);\n'],
        ['data/gears.json', '[\n  { "x": 1 }\n  { "x": 2 }\n]\n'],
      ]);
      const { errors } = await engine.resolveModules(files.get('main.pathogen')!, {
        host: createMemoryProjectHost(files, { label: 'test' }),
        entry: '/main.pathogen',
      });
      // As the compile worker puts it (WorkspaceLoadError): the data file's place, then the import.
      const { WorkspaceLoadError } = await import('../playground/services/compiler-worker.js');
      const message = new WorkspaceLoadError(errors).message;
      expect(message.split('\n')).toEqual([
        expect.stringMatching(/^data\/gears\.json line 3, col 3: /),
        '  imported from main.pathogen line 1',
      ]);
      expect(readMessage(message, 'main.pathogen')).toEqual([
        {
          file: 'data/gears.json',
          line: 3,
          column: 3,
          text: errors[0].message,
          steps: [{ kind: 'imported from', file: 'main.pathogen', line: 1 }],
          site: { line: 1, column: 1 },
        },
      ]);
      expect(errorPlace(message, 'main.pathogen')).toEqual({ file: 'data/gears.json', line: 3 });
      // Words that only mention such a name are still the program's own error.
      expect(readMessage('values.json could not be read', 'main.pathogen')[0].file).toBe('main.pathogen');
      expect(readMessage('the file gears.json line 2 is wrong', 'main.pathogen')[0].file).toBe('main.pathogen');
    } finally {
      global.window = before;
    }
  });
});

describe('errorPlace', () => {
  it("an error in the program's own code: its line", () => {
    const message = failure(() => compile('M 0 0\nL nope 0\n'));
    expect(message).toMatch(/^Line 2, col 3: /);
    expect(errorPlace(message, 'try-sizes.pathogen')).toEqual({ file: 'try-sizes.pathogen', line: 2 });
  });

  it('a parse error in the program: its line', () => {
    const message = failure(() => compile('M 0 0\nlet x = ;\n'));
    expect(message).toMatch(/^Parse error at line 2, column 8: /);
    expect(errorPlace(message, 'try-sizes.pathogen')).toEqual({ file: 'try-sizes.pathogen', line: 2 });
  });

  it('an error in a module it imports: that file and its line, not the call that led there', async () => {
    const files = new Map([
      ['broken.pathogen', 'import { broken } from "./parts/gears.pathogen";\nbroken(5);\n'],
      ['parts/gears.pathogen', 'module;\nexport fn broken(x) {\n  let a = [1, 2];\n  return a[x].nope;\n}\n'],
    ]);
    const host = createMemoryProjectHost(files, { label: 'test' });
    const source = files.get('broken.pathogen')!;
    const { graph } = await resolveModules(source, { host, entry: '/broken.pathogen' });
    const message = failure(() => compile(source, { modules: graph }));
    expect(message.split('\n')).toEqual([
      expect.stringMatching(/^parts\/gears\.pathogen line 4, col \d+: /),
      '  called from broken.pathogen line 2',
    ]);
    expect(errorPlace(message, 'broken.pathogen')).toEqual({ file: 'parts/gears.pathogen', line: 4 });
  });

  it("a parse error in an imported module: the module's line", async () => {
    const files = new Map([
      ['main.pathogen', 'import { gear } from "./parts/gears.pathogen";\ngear(1, 1, 4);\n'],
      ['parts/gears.pathogen', 'module;\nexport fn gear(x, y, r) {\n  circle(x, y r);\n}\n'],
    ]);
    const host = createMemoryProjectHost(files, { label: 'test' });
    const source = files.get('main.pathogen')!;
    const { graph } = await resolveModules(source, { host, entry: '/main.pathogen' });
    const message = failure(() => compile(source, { modules: graph }));
    expect(errorPlace(message, 'main.pathogen')).toEqual({ file: 'parts/gears.pathogen', line: 3 });
  });

  it("an import that can't load, as the playground words it (compiler-worker's WorkspaceLoadError)", () => {
    expect(errorPlace('Line 1, col 19: import file "./gone.pathogen" was not found.', 'main.pathogen')).toEqual({
      file: 'main.pathogen',
      line: 1,
    });
    expect(
      errorPlace(
        'parts/kit.pathogen line 2, col 1: import file "../gone.pathogen" was not found.\n  imported from main.pathogen line 1',
        'main.pathogen',
      ),
    ).toEqual({ file: 'parts/kit.pathogen', line: 2 });
  });

  it('a message with no position (a font that will not load): the program, no line', () => {
    expect(errorPlace('Font "Nope" could not be loaded.', 'try-sizes.pathogen')).toEqual({
      file: 'try-sizes.pathogen',
      line: null,
    });
  });
});

describe('errorRowText', () => {
  it('names the file, and the line when there is one', () => {
    expect(errorRowText({ file: 'parts/gears.pathogen', line: 9 })).toBe('Error in parts/gears.pathogen line 9');
    expect(errorRowText({ file: 'try-sizes.pathogen', line: null })).toBe('Error in try-sizes.pathogen');
  });
});

// Step 7: the error panel, the marks and the tree's dots read a failure the
// same way: where it happened, its words, the steps back to the program, and
// where the program reaches it. From the diagnostics (the panel) or from the
// compile's message (the chip's rows, the programs compiled in the background).
describe('reading a failure (step 7)', () => {
  const FILES = new Map([
    [
      'parts/gears.pathogen',
      "module;\n\nexport fn gear(center, radius, teeth) {\n  assert(teeth >= 3, 'a gear needs at least 3 teeth');\n  circle(center.x, center.y, radius);\n}\n",
    ],
    [
      'parts/kit.pathogen',
      'module;\n\nimport { gear } from "./gears.pathogen";\n\nexport fn pair(n) {\n  gear(Point(0, 0), 10, n);\n}\n',
    ],
    ['parts/fails.pathogen', 'module;\n\nconst size = missingName * 2;\nexport const x = 1;\n'],
  ]);
  /** The program's failure, as the compile words it and as getDiagnostics places it. */
  async function fail(source: string): Promise<{ message: string; diagnostics: ReturnType<typeof getDiagnostics> }> {
    const files = new Map([...FILES, ['main.pathogen', source]]);
    const host = createMemoryProjectHost(files, { label: 'test' });
    const { graph } = await resolveModules(source, { host, entry: '/main.pathogen' });
    const message = failure(() => compile(source, { modules: graph }));
    return { message, diagnostics: getDiagnostics(new StringTextDocument(source), { modules: graph }) };
  }

  it("the program's own error: its file, line, column and words, no steps, no site", async () => {
    const { message, diagnostics } = await fail('define ViewBox(0, 0, 100, 100);\nlet a = 1;\ncircle(a, nope, 3);\n');
    const own = { file: 'main.pathogen', line: 3, column: 11, text: 'Undefined variable: nope', steps: [], site: null };
    expect(readMessage(message, 'main.pathogen')).toEqual([own]);
    expect(readDiagnostics(diagnostics, 'main.pathogen')).toEqual([own]);
  });

  it('a parse error: the same, from "Parse error at line …"', async () => {
    const { message, diagnostics } = await fail('define ViewBox(0, 0, 100, 100);\nlet a = (1 + ;\n');
    const own = {
      file: 'main.pathogen',
      line: 2,
      column: 13,
      text: "Missing ';' after let declaration",
      steps: [],
      site: null,
    };
    expect(readMessage(message, 'main.pathogen')).toEqual([own]);
    expect(readDiagnostics(diagnostics, 'main.pathogen')).toEqual([own]);
  });

  it('a call that fails in another file: that file, the words once, the step back, and the call as the site', async () => {
    const { message, diagnostics } = await fail(
      'import { gear } from "./parts/gears.pathogen";\n\ngear(Point(50, 50), 40, 2);\n',
    );
    const steps = [{ kind: 'called from', file: 'main.pathogen', line: 3 }];
    const there = {
      file: 'parts/gears.pathogen',
      line: 4,
      column: 3,
      text: 'assertion failed: a gear needs at least 3 teeth',
      steps,
    };
    // The diagnostic knows the call's column; the message only its line.
    expect(readDiagnostics(diagnostics, 'main.pathogen')).toEqual([{ ...there, site: { line: 3, column: 1 } }]);
    expect(readMessage(message, 'main.pathogen')).toEqual([{ ...there, site: { line: 3, column: 1 } }]);
  });

  it('through a third file: every step back, in order', async () => {
    const { message, diagnostics } = await fail('import { pair } from "./parts/kit.pathogen";\npair(2);\n');
    const steps = [
      { kind: 'called from', file: 'parts/kit.pathogen', line: 6 },
      { kind: 'called from', file: 'main.pathogen', line: 2 },
    ];
    expect(readMessage(message, 'main.pathogen').map((r) => [r.file, r.line, r.steps])).toEqual([
      ['parts/gears.pathogen', 4, steps],
    ]);
    expect(readDiagnostics(diagnostics, 'main.pathogen').map((r) => [r.file, r.line, r.steps])).toEqual([
      ['parts/gears.pathogen', 4, steps],
    ]);
  });

  it("an error in another file's own code (no alsoIn): its first line names the file; the import is the site", async () => {
    const { message, diagnostics } = await fail('import { x } from "./parts/fails.pathogen";\nM 0 0 L x 10\n');
    expect(diagnostics[0].alsoIn).toBeUndefined();
    const there = {
      file: 'parts/fails.pathogen',
      line: 3,
      column: 14,
      text: 'Undefined variable: missingName',
      steps: [{ kind: 'imported from', file: 'main.pathogen', line: 1 }],
    };
    expect(readDiagnostics(diagnostics, 'main.pathogen')).toEqual([{ ...there, site: { line: 1, column: 19 } }]);
    expect(readMessage(message, 'main.pathogen')).toEqual([{ ...there, site: { line: 1, column: 1 } }]);
  });

  it('several load errors in one message: one reading each', () => {
    const message = [
      'Line 1, col 19: import file "./gone.pathogen" was not found.',
      'parts/kit.pathogen line 2, col 1: import file "../gone.pathogen" was not found.',
      '  imported from main.pathogen line 2',
    ].join('\n');
    expect(readMessage(message, 'main.pathogen').map((r) => [r.file, r.line, r.steps.length, r.site])).toEqual([
      ['main.pathogen', 1, 0, null],
      ['parts/kit.pathogen', 2, 1, { line: 2, column: 1 }],
    ]);
  });

  it('a message with no position: the program, no line, the whole message as its words', () => {
    expect(readMessage('Font "Nope" could not be loaded.', 'main.pathogen')).toEqual([
      {
        file: 'main.pathogen',
        line: null,
        column: null,
        text: 'Font "Nope" could not be loaded.',
        steps: [],
        site: null,
      },
    ]);
  });

  it('more words on lines of their own belong to the error above them; only a line naming a place starts another', () => {
    expect(readMessage('Line 2, col 9: something went wrong\nhere is more about it', 'main.pathogen')).toEqual([
      {
        file: 'main.pathogen',
        line: 2,
        column: 9,
        text: 'something went wrong\nhere is more about it',
        steps: [],
        site: null,
      },
    ]);
    expect(readMessage('Font "Nope" could not be loaded.\nTry another family.', 'main.pathogen')).toHaveLength(1);
  });

  it('words that happen to name a .pathogen file and a line are not a place (a file name has no spaces)', () => {
    expect(readMessage('Cannot import foo.pathogen line 3: no such file', 'main.pathogen')).toEqual([
      {
        file: 'main.pathogen',
        line: null,
        column: null,
        text: 'Cannot import foo.pathogen line 3: no such file',
        steps: [],
        site: null,
      },
    ]);
  });

  it('an empty message: no errors', () => {
    expect(readMessage('', 'main.pathogen')).toEqual([]);
  });

  it('errorText read back gives the same readings, a place-less error included (Copy Debug Info reads the status this way)', () => {
    const readings = [
      {
        file: 'parts/gears.pathogen',
        line: 4,
        column: 3,
        text: 'assertion failed',
        steps: [{ kind: 'called from' as const, file: 'main.pathogen', line: 3 }],
        site: { line: 3, column: 1 },
      },
      {
        file: 'main.pathogen',
        line: null,
        column: null,
        text: 'Font "Nope" could not be loaded.',
        steps: [],
        site: null,
      },
    ];
    expect(readMessage(errorText(readings), 'main.pathogen')).toEqual(readings);
  });

  it('the chip’s row (from the message) and the panel (from the diagnostics) agree on where each failure is', async () => {
    for (const source of [
      'define ViewBox(0, 0, 100, 100);\nlet a = 1;\ncircle(a, nope, 3);\n',
      'import { gear } from "./parts/gears.pathogen";\n\ngear(Point(50, 50), 40, 2);\n',
      'import { pair } from "./parts/kit.pathogen";\npair(2);\n',
      'import { x } from "./parts/fails.pathogen";\nM 0 0 L x 10\n',
    ]) {
      const { message, diagnostics } = await fail(source);
      const [panel] = readDiagnostics(diagnostics, 'main.pathogen');
      expect(errorPlace(message, 'main.pathogen')).toEqual({ file: panel.file, line: panel.line });
    }
  });

  describe('errorMarks: the lines to mark in the file open in the editor', () => {
    const steps = [
      { kind: 'called from' as const, file: 'parts/kit.pathogen', line: 6 },
      { kind: 'called from' as const, file: 'main.pathogen', line: 2 },
    ];
    const reading = {
      file: 'parts/gears.pathogen',
      line: 4,
      column: 3,
      text: 'assertion failed',
      steps,
      site: { line: 2, column: 1 },
    };

    it('where it happened; each step through a file on the way; the program’s own site', () => {
      expect(errorMarks([reading], 'parts/gears.pathogen', 'main.pathogen')).toEqual([{ line: 4, column: 3 }]);
      expect(errorMarks([reading], 'parts/kit.pathogen', 'main.pathogen')).toEqual([{ line: 6, column: 1 }]);
      expect(errorMarks([reading], 'main.pathogen', 'main.pathogen')).toEqual([{ line: 2, column: 1 }]);
      expect(errorMarks([reading], 'parts/labels.pathogen', 'main.pathogen')).toEqual([]);
    });

    it("the program's own errors mark it, each once", () => {
      const own = { file: 'main.pathogen', line: 3, column: 11, text: 'x', steps: [], site: null };
      expect(errorMarks([own, own], 'main.pathogen', 'main.pathogen')).toEqual([{ line: 3, column: 11 }]);
    });
  });

  it('errorText: the plain words, for Copy Debug Info and the status (each error with its file, then its steps)', () => {
    expect(
      errorText([
        {
          file: 'parts/gears.pathogen',
          line: 4,
          column: 3,
          text: 'assertion failed',
          steps: [{ kind: 'called from', file: 'main.pathogen', line: 3 }],
          site: { line: 3, column: 1 },
        },
        {
          file: 'main.pathogen',
          line: null,
          column: null,
          text: 'Font "Nope" could not be loaded.',
          steps: [],
          site: null,
        },
      ]),
    ).toBe(
      'parts/gears.pathogen line 4, col 3: assertion failed\n  called from main.pathogen line 3\nmain.pathogen: Font "Nope" could not be loaded.',
    );
  });
});
