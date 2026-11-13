// Where a program's compile failed, as its row in the chip's list says it
// (phase 2d, step 5b; mockup v6 screen G: "Error in parts/gears.pathogen line
// 9"). Read from the compile's own message, whose forms the real engine makes
// below: the program's own line, another file's, a parse error, an import that
// can't load, and a message with no position.

import { describe, expect, it } from 'vitest';

import { compile, createMemoryProjectHost, resolveModules } from '../src';
import { errorPlace, errorRowText } from '../playground/services/error-place.js';

const failure = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('it compiled');
};

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
