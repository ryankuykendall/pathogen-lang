/**
 * Phase 1a, step 3: running modules (docs/modules.md).
 *
 * The files are read first (resolveModules, step 2), then compile() runs
 * each imported file once, in a state of its own, and binds the names the
 * compiled file imports. These tests follow docs/modules.md section by
 * section; each docs example is paired with the gears fence from its own
 * section, with its `// file` comment as line 1 so the documented line
 * numbers hold (12-phase-1-plan.md amendments).
 */
import { describe, expect, it } from 'vitest';

import { compile, compileWithContext, ModuleTraceError, resolveModules } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';

import type { CompileResult, ModuleGraph, ProjectFileHost } from '../src';

function memoryHost(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: '/Users/you/my-gears',
    readFile: async (path) =>
      path in files
        ? { ok: true, bytes: new TextEncoder().encode(files[path]) }
        : { ok: false, code: 'not-found', osPath: `/Users/you/my-gears${path}` },
  };
}

async function graphOf(main: string, files: Record<string, string>): Promise<ModuleGraph> {
  const { graph, errors } = await resolveModules(main, { host: memoryHost(files), entry: '/main.pathogen' });
  expect(errors).toEqual([]);
  return graph;
}

async function compileFiles(main: string, files: Record<string, string>): Promise<CompileResult> {
  return compile(main, { modules: await graphOf(main, files) });
}

async function errorOf(main: string, files: Record<string, string>): Promise<string> {
  const modules = await graphOf(main, files);
  try {
    compile(main, { modules });
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected the compile to fail');
}

/** The default layer's path data. */
const pathOf = (result: CompileResult): string => result.layers[0]?.data ?? '';

// --- the docs' files -------------------------------------------------------

const FIRST_GEARS = `// parts/gears.pathogen
const toothDepth = 6;

export fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  circle(center.x, center.y, radius * 0.3);
}
`;

const FIRST_MAIN = `// main.pathogen
import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);

gear(Point(55, 50), 40, 12);
gear(Point(150, 50), 28, 8);
`;

/** The same drawing written in one file: what the two files must produce. */
const FIRST_AS_ONE_FILE = `const toothDepth = 6;
fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  circle(center.x, center.y, radius * 0.3);
}
define ViewBox(0, 0, 200, 100);
gear(Point(55, 50), 40, 12);
gear(Point(150, 50), 28, 8);
`;

const EXPORTING_GEARS = `// parts/gears.pathogen
export const toothDepth = 6;

export enum Teeth { Few = 8, Standard = 12, Fine = 20 }

export fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  hub(center, radius);
}

// Not exported: only this file can use it.
fn hub(center, radius) {
  circle(center.x, center.y, radius * 0.3);
}

// parts/gears.pathogen, continued: a demo of every size
define ViewBox(0, 0, 300, 100);
gear(Point(50, 50), 30, Teeth.Few);
gear(Point(150, 50), 30, Teeth.Standard);
gear(Point(250, 50), 30, Teeth.Fine);
`;

describe('the first example', () => {
  it('draws exactly what the same code in one file draws', async () => {
    const twoFiles = await compileFiles(FIRST_MAIN, { '/parts/gears.pathogen': FIRST_GEARS });
    const oneFile = compile(FIRST_AS_ONE_FILE);
    expect(twoFiles.layers).toEqual(oneFile.layers);
    expect(twoFiles.viewBox).toEqual({ originX: 0, originY: 0, width: 200, height: 100 });
  });

  it('works through compileWithContext too (what the playground and VS Code preview call)', async () => {
    const modules = await graphOf(FIRST_MAIN, { '/parts/gears.pathogen': FIRST_GEARS });
    expect(compileWithContext(FIRST_MAIN, { modules }).path).toBe(pathOf(compile(FIRST_AS_ONE_FILE)));
  });
});

describe('importing', () => {
  const files = { '/parts/gears.pathogen': EXPORTING_GEARS };

  it('named imports, and `as`', async () => {
    const named = await compileFiles(
      'import { gear, Teeth } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, Teeth.Standard);',
      files,
    );
    const renamed = await compileFiles(
      'import { gear as cog } from "./parts/gears.pathogen";\ncog(Point(55, 50), 40, 12);',
      files,
    );
    expect(pathOf(named)).toBe(pathOf(renamed));
    expect(pathOf(named)).toContain('M 55 10');
  });

  it('a namespace import: calls, enums and constants through the dot, and a call statement draws', async () => {
    const result = await compileFiles(
      'import * as gears from "./parts/gears.pathogen";\n\ngears.gear(Point(55, 50), 40, gears.Teeth.Standard);\nlog(gears.toothDepth);',
      files,
    );
    const named = await compileFiles(
      'import { gear, Teeth } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, Teeth.Standard);',
      files,
    );
    expect(pathOf(result)).toBe(pathOf(named));
    const mine = result.logs.filter((l) => !l.file);
    expect(mine.map((l) => l.parts.map((p) => `${p.label}=${p.value}`).join(' '))).toEqual(['gears.toothDepth=6']);
  });

  it('a namespace logs as its file', async () => {
    const result = await compileFiles('import * as gears from "./parts/gears.pathogen";\nlog(gears);', files);
    expect(result.logs.find((l) => !l.file)?.parts[0].value).toBe('module parts/gears.pathogen');
  });

  it('to pass on a name from another file, import its file and export a const', async () => {
    const result = await compileFiles(
      'import { gear, Teeth } from "./parts/kit.pathogen";\ngear(Point(55, 50), 40, Teeth.Standard);',
      {
        ...files,
        '/parts/kit.pathogen':
          '// parts/kit.pathogen\nimport * as gears from "./gears.pathogen";\n\nexport const gear = gears.gear;\nexport const Teeth = gears.Teeth;\n',
      },
    );
    const direct = await compileFiles(
      'import { gear, Teeth } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, Teeth.Standard);',
      files,
    );
    expect(pathOf(result)).toBe(pathOf(direct));
  });

  it.each([
    [
      "a name the file doesn't export",
      'import { gera } from "./parts/gears.pathogen";',
      'Line 1, col 10: parts/gears.pathogen has no export named gera. It exports: gear, Teeth, toothDepth.',
    ],
    [
      "a name the file declares but doesn't export",
      'import { hub } from "./parts/gears.pathogen";',
      "Line 1, col 10: parts/gears.pathogen declares hub but doesn't export it. Put export in front of its declaration in parts/gears.pathogen.",
    ],
    [
      'a namespace has no such name',
      'import * as gears from "./parts/gears.pathogen";\nlog(gears.gera);',
      'Line 2, col 5: gears has no export named gera. parts/gears.pathogen exports: gear, Teeth, toothDepth.',
    ],
    [
      'calling a namespace member that is not a fn',
      'import * as gears from "./parts/gears.pathogen";\ngears.toothDepth();',
      'Line 2, col 1: gears.toothDepth is not a function',
    ],
  ])('%s', async (_label, main, message) => {
    expect(await errorOf(main, files)).toBe(message);
  });

  it('assigning to an imported name is an error even where the static check steps aside', async () => {
    // `gear` is also a parameter somewhere, so const-check leaves it to run time.
    const main = 'import { gear } from "./parts/gears.pathogen";\nfn spin(gear) { return gear; }\ngear = 5;';
    expect(await errorOf(main, files)).toBe(
      'Line 3: Cannot assign to gear — it is imported from parts/gears.pathogen. Declare your own with let if it needs to change',
    );
  });
});

describe('an imported file runs on its own', () => {
  it('its drawing, layers and ViewBox stay in it; its logs reach you with its file', async () => {
    const lib = `// lib.pathogen
define ViewBox(0, 0, 999, 999);
define PathLayer('demo') #{ stroke: red; }
layer('demo').apply { M 0 0 L 9 9 }
M 5 5 L 6 6
log("loading");
export const size = 3;
`;
    const result = await compileFiles('import { size } from "./lib.pathogen";\nM 0 0 L size 0', {
      '/lib.pathogen': lib,
    });
    expect(result.layers.map((l) => [l.name, l.data])).toEqual([['default', 'M 0 0 L 3 0']]);
    expect(result.viewBox).toBeUndefined();
    expect(result.logs.map((l) => [l.file, l.line, l.parts[0].value])).toEqual([['lib.pathogen', 6, 'loading']]);
  });

  it('each file runs once per compile, however many files import it', async () => {
    const result = await compileFiles(
      'import { a } from "./a.pathogen";\nimport { b } from "./b.pathogen";\nlog(a + b);',
      {
        '/a.pathogen': 'import { base } from "./base.pathogen";\nexport const a = base;',
        '/b.pathogen': 'import { base } from "./base.pathogen";\nexport const b = base;',
        '/base.pathogen': 'log("base runs");\nexport const base = 1;',
      },
    );
    expect(result.logs.filter((l) => l.file === 'base.pathogen')).toHaveLength(1);
    expect(result.logs.find((l) => !l.file)?.parts[0].value).toBe('2');
  });

  it("a warning raised in an imported fn names that file, even though it lands in the caller's list", async () => {
    const result = await compileFiles('import { bad } from "./warn.pathogen";\nM 0 0\nbad();', {
      '/warn.pathogen': '// warn.pathogen\nexport fn bad() {\n  L calc(0 / 0) 0\n}\n',
    });
    expect(result.warnings.map((w) => [w.code, w.file, w.line])).toEqual([['non-finite', 'warn.pathogen', 3]]);
  });
});

describe('imported fns draw with your pen', () => {
  it('into your layer', async () => {
    const main = `// main.pathogen
import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);
define PathLayer('teeth') #{
  stroke: Color('#333');
  stroke-width: 1.5;
  fill: none;
}

layer('teeth').apply {
  gear(Point(55, 50), 40, 12);
  gear(Point(150, 50), 28, 8);
}
`;
    const result = await compileFiles(main, { '/parts/gears.pathogen': EXPORTING_GEARS });
    const teeth = result.layers.find((l) => l.name === 'teeth');
    expect(teeth?.data).toBe(pathOf(compile(FIRST_AS_ONE_FILE)));
  });

  it('`viewbox` is the drawing that calls it (decision 28)', async () => {
    const marks = `// parts/marks.pathogen
export fn centerMark(size) {
  let middleX = calc(viewbox.originX + viewbox.width / 2);
  let middleY = calc(viewbox.originY + viewbox.height / 2);
  M calc(middleX - size) middleY
  h calc(size * 2)
  M middleX calc(middleY - size)
  v calc(size * 2)
}

define ViewBox(0, 0, 1000, 1000);
centerMark(1);
`;
    const result = await compileFiles(
      'import { centerMark } from "./parts/marks.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ncenterMark(10);',
      { '/parts/marks.pathogen': marks },
    );
    expect(pathOf(result)).toBe('M 90 50 h 20 M 100 40 v 20');
  });

  it("`viewbox` inside a path block in an imported fn is still the caller's", async () => {
    const result = await compileFiles(
      'import { box } from "./box.pathogen";\ndefine ViewBox(0, 0, 40, 20);\nlet shape = box();\nM 0 0\nshape.draw();',
      {
        '/box.pathogen':
          'export fn box() {\n  return @{ h viewbox.width v viewbox.height };\n}\ndefine ViewBox(0, 0, 1, 1);\n',
      },
    );
    expect(pathOf(result)).toBe('M 0 0 h 40 v 20');
  });
});

describe('errors in other files (docs/modules.md, word for word)', () => {
  const GEARS_WITH_ASSERT = `// parts/gears.pathogen
export fn gear(center, radius, teeth) {
  assert(teeth >= 3, 'a gear needs at least 3 teeth');
  star(center.x, center.y, radius, radius - 6, teeth);
}
`;
  const MAIN = `// main.pathogen
import { gear } from "./parts/gears.pathogen";

gear(Point(55, 50), 40, 2);
`;

  it('an error in an imported fn names its file, then the call', async () => {
    expect(await errorOf(MAIN, { '/parts/gears.pathogen': GEARS_WITH_ASSERT })).toBe(
      'parts/gears.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 4',
    );
  });

  it('through a third file, each file on the way is listed', async () => {
    const message = await errorOf(MAIN, {
      '/parts/gears.pathogen':
        '// parts/gears.pathogen\nimport { check } from "./teeth.pathogen";\nexport fn gear(center, radius, teeth) {\n  check(teeth);\n}\n',
      '/parts/teeth.pathogen':
        "// parts/teeth.pathogen\nexport fn check(teeth) {\n  assert(teeth >= 3, 'a gear needs at least 3 teeth');\n}\n",
    });
    expect(message).toBe(
      'parts/teeth.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth\n' +
        '  called from parts/gears.pathogen line 4\n' +
        '  called from main.pathogen line 4',
    );
  });

  it('calls within one file are not listed', async () => {
    const message = await errorOf(MAIN, {
      '/parts/gears.pathogen':
        "// parts/gears.pathogen\nexport fn gear(center, radius, teeth) {\n  check(teeth);\n}\nfn check(teeth) {\n  assert(teeth >= 3, 'too few');\n}\n",
    });
    expect(message).toBe(
      'parts/gears.pathogen line 6, col 3: assertion failed: too few\n  called from main.pathogen line 4',
    );
  });

  it("a mistake in an imported file's own code names your import", async () => {
    const message = await errorOf('// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\n', {
      '/parts/gears.pathogen': '// parts/gears.pathogen\nconst toothDepth = 6\nconst hubRatio = 0.3;\n',
    });
    expect(message).toBe("parts/gears.pathogen line 2, col 21: Missing ';'\n  imported from main.pathogen line 2");
  });

  it('two imports deep, each import is listed', async () => {
    const message = await errorOf('// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\n', {
      '/parts/gears.pathogen':
        '// parts/gears.pathogen\nimport { tooth } from "./teeth.pathogen";\nexport const gear = 1;\n',
      '/parts/teeth.pathogen': '// parts/teeth.pathogen\nconst tooth = 6\n',
    });
    expect(message).toBe(
      "parts/teeth.pathogen line 2, col 16: Missing ';'\n" +
        '  imported from parts/gears.pathogen line 2\n' +
        '  imported from main.pathogen line 2',
    );
  });

  it('an error with no position of its own, in another file, gets the line of its statement', async () => {
    const message = await errorOf('import { f } from "./f.pathogen";\nf(5);', {
      '/f.pathogen': '// f.pathogen\nexport fn f(n) {\n  let x = 1;\n  return n.x;\n}\n',
    });
    expect(message).toBe(
      "f.pathogen line 4: Cannot access property 'x' on non-object value\n  called from main.pathogen line 2",
    );
  });

  it('errors in the compiled file read exactly as before', async () => {
    const message = await errorOf('import { gear } from "./parts/gears.pathogen";\nlet n = 5;\nn.nope();', {
      '/parts/gears.pathogen': GEARS_WITH_ASSERT,
    });
    const before = (() => {
      try {
        compile('let n = 5;\nn.nope();\n'.replace(/^/, '\n'));
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })();
    expect(message).toBe(before);
    expect(message).not.toContain('called from');
  });

  it('a ModuleTraceError knows where it reaches the compiled file', async () => {
    const modules = await graphOf(MAIN, { '/parts/gears.pathogen': GEARS_WITH_ASSERT });
    try {
      compile(MAIN, { modules });
      throw new Error('expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(ModuleTraceError);
      expect((e as ModuleTraceError).site).toEqual({ line: 4, column: 1 });
      expect((e as ModuleTraceError).file).toBe('parts/gears.pathogen');
    }
  });

  it('the editor shows it on the call in the file being edited', async () => {
    const modules = await graphOf(MAIN, { '/parts/gears.pathogen': GEARS_WITH_ASSERT });
    const diagnostics = getDiagnostics(new StringTextDocument(MAIN), { modules });
    expect(diagnostics.map((d) => [d.range.start.line + 1, d.range.start.character + 1, d.message])).toEqual([
      [
        4,
        1,
        'parts/gears.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 4',
      ],
    ]);
  });

  it('and a failed load on the import', async () => {
    const main = '// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\n';
    const modules = await graphOf(main, { '/parts/gears.pathogen': 'const a = 1\nconst b = 2;' });
    const diagnostics = getDiagnostics(new StringTextDocument(main), { modules });
    expect(diagnostics.map((d) => [d.range.start.line + 1, d.message])).toEqual([
      [
        2,
        "parts/gears.pathogen line 1, col 12: Missing ';' after const declaration\n  imported from main.pathogen line 2",
      ],
    ]);
  });
});

describe('without files', () => {
  it('an import is still the no-project-folder error', () => {
    expect(() => compile('import { gear } from "./parts/gears.pathogen";')).toThrow(
      'Line 1, col 1: Cannot import "./parts/gears.pathogen": this program has no project folder to read files from.',
    );
  });

  it('one-file programs are untouched: no file labels, no traces', () => {
    const result = compile('fn f() { log("x"); }\nf();\nM 0 0 L calc(0 / 0) 0');
    expect(result.logs.every((l) => l.file === undefined)).toBe(true);
    expect(result.warnings.every((w) => w.file === undefined)).toBe(true);
  });
});

describe('callbacks across files (step 3 code review)', () => {
  const KIT = `// kit.pathogen
export fn bad(v) {
  return v.nope();
}
export fn each(xs, f) {
  return xs.map() << f;
}
`;

  it.each([
    ['map', 'log([1].map() << bad);'],
    ['filter', 'log([1].filter() << bad);'],
    ['sort', 'log([2, 1].sort() << bad);'],
  ])('an imported worker failing inside %s() keeps its trace and its site', async (_method, line) => {
    const main = `import { bad } from "./kit.pathogen";\n${line}`;
    const modules = await graphOf(main, { '/kit.pathogen': KIT });
    try {
      compile(main, { modules });
      throw new Error('expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(ModuleTraceError);
      expect((e as Error).message).toBe(
        "kit.pathogen line 3, col 10: Cannot call method 'nope' on non-array value\n  called from main.pathogen line 2",
      );
      expect((e as ModuleTraceError).site?.line).toBe(2);
    }
  });

  it("a lambda of yours that an imported fn calls back is traced the way it was reached", async () => {
    const message = await errorOf('import { each } from "./kit.pathogen";\nlog(each([1], {|v| v.nope()}));', {
      '/kit.pathogen': KIT,
    });
    expect(message).toBe(
      "main.pathogen line 2, col 20: Cannot call method 'nope' on non-array value\n" +
        '  called from kit.pathogen line 6\n' +
        '  called from main.pathogen line 2',
    );
  });

  it('a namespace in a template literal shows as its file', async () => {
    const result = await compileFiles('import * as kit from "./kit.pathogen";\nlog(`${kit}`);', { '/kit.pathogen': KIT });
    expect(result.logs.find((l) => !l.file)?.parts[0].value).toBe('module kit.pathogen');
  });

  it('a namespace passed to a fn, or held in another name, still calls and draws', async () => {
    const files = { '/kit.pathogen': 'export fn dot(x) {\n  circle(x, 0, 1);\n}\n' };
    const viaParam = await compileFiles(
      'import * as kit from "./kit.pathogen";\nfn use(ns) {\n  ns.dot(7);\n}\nM 0 0;\nuse(kit);',
      files,
    );
    const viaAlias = await compileFiles('import * as kit from "./kit.pathogen";\nlet alias = kit;\nM 0 0;\nalias.dot(7);', files);
    expect(pathOf(viaParam)).toBe('M 0 0 M 6 0 a 1 1 0 1 1 2 0 a 1 1 0 1 1 -2 0');
    expect(pathOf(viaAlias)).toBe(pathOf(viaParam));
  });
});
