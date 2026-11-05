/**
 * Phase 1a, step 5e: modules are libraries that don't draw (docs/modules.md
 * "Exporting", "Imported fns draw with your pen"; plan in
 * project-docs/modules/23-modules-are-libraries-plan.md).
 *
 * A module's top level makes values but never draws. Every way to draw is
 * stopped, statically where the source shows it and at run time where only a
 * call does. The allowed side is tested as hard: an over-broad seal would
 * break real library code without anyone noticing. A module's exported fns
 * still draw, into the drawing that calls them.
 *
 * (Before step 5e this file held step 5c's tests for a module's own layers,
 * transforms and subscriptions; a module can no longer make any of them.)
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile, parse, resolveModules } from '../src';
import { fixFile } from '../src/evaluator/module-runtime';

import type { CompileResult, ModuleGraph, ProjectFileHost } from '../src';
import type { Scope } from '../src/evaluator/types';

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

const logsOf = (result: CompileResult): string[] => result.logs.map((l) => l.parts.map((p) => p.value).join(' '));

// The messages, word for word from docs/modules.md "Errors".
const DRAWS =
  "A module can't draw while it loads. Draw in an exported fn, and call it from the file that imports this one.";
const VIEWBOX = "A module has no drawing, so it can't define a ViewBox. The program that imports it sets the ViewBox.";
const READS = (name: 'ctx' | 'viewbox'): string =>
  `A module has no drawing while it loads, so ${name} can't be read. Read it in an exported fn that the importing file calls; there it describes that file's drawing.`;
const POLAR_POINT_TIP =
  ' For a point at an angle and distance from a spot you choose, use Point(x, y).polarTranslate(angle, distance).';
const PEN = (name: string): string =>
  `A module has no pen while it loads, so ${name} can't be called here. Call it inside a path block (@{ … }), which has its own pen, or in an exported fn, which uses the pen of the place that calls it.${name === 'polarPoint' ? POLAR_POINT_TIP : ''}`;

/** A main file that imports `lib.pathogen` and draws one line of its own. */
const MAIN = 'import * as lib from "./lib.pathogen";\n\nM 0 0 L 1 1\n';
/** `lib.pathogen`: the header, then `body` from line 3. */
const lib = (body: string): Record<string, string> => ({
  '/lib.pathogen': `module;\n\n${body}\nexport const ok = 1;\n`,
});
/** The error a body gives, at `line` and `col` of lib.pathogen (body line 1 is file line 3). */
const libError = (line: number, col: number | undefined, message: string): string =>
  `lib.pathogen line ${line}${col === undefined ? '' : `, col ${col}`}: ${message}\n  imported from main.pathogen line 1`;

// --- docs: "A module doesn't draw at its top level" -----------------------------------

describe("docs: a module doesn't draw at its top level", () => {
  // [what, body, line, col, message]. Static errors come from the parse tree
  // (module-check.ts); the rest are stopped as they run.
  const FORBIDDEN: [string, string, number, number | undefined, string][] = [
    ['a path command (static)', 'M 0 0 L 10 10', 3, 1, DRAWS],
    ['a drawing call', 'circle(5, 5, 3);', 3, 1, DRAWS],
    ['.draw() on a path block', 'const notch = @{ m 0 0 l 10 0 };\nnotch.draw();', 4, 1, DRAWS],
    ["calling this file's own fn that draws", 'fn gear(size) {\n  circle(0, 0, size);\n}\ngear(4);', 6, 1, DRAWS],
    ['drawing in a for body', 'for (i in 0..3) {\n  circle(i, i, 1);\n}', 4, 3, DRAWS],
    ['drawing in an if body', 'if (true) {\n  circle(1, 1, 1);\n}', 4, 3, DRAWS],
    ['drawing in a switch case', 'switch (1) {\n  case 1 {\n    circle(1, 1, 1);\n  }\n}', 5, 5, DRAWS],
    ['define PathLayer (static)', "define PathLayer('ink') #{ stroke: red; }", 3, 1, DRAWS],
    ['define TextLayer (static)', "define TextLayer('labels') #{}", 3, 1, DRAWS],
    ['a layer as a value', "const ink = PathLayer('ink') #{};", 3, 13, DRAWS],
    ['a layer made in a fn it calls', "fn makeInk() {\n  define PathLayer('ink') #{}\n}\nmakeInk();", 4, 3, DRAWS],
    ['an apply block (static)', "layer('ink').apply { M 0 0 }", 3, 1, DRAWS],
    ['a layer looked up by name', "const ink = layer('ink');", 3, 13, DRAWS],
    ['.subscribe(…)', "layer('ink').subscribe('endpoint') {|e| log(1); };", 3, 1, DRAWS],
    ['a text line in a fn it calls', 'fn caption() {\n  text(0, 0)`hi`;\n}\ncaption();', 4, 3, DRAWS],
    [
      'toCodeSnippetBlock (it makes layers)',
      "const code = &{ text(0, 0)`x` };\nconst snippet = code.toCodeSnippetBlock('snip');",
      4,
      17,
      DRAWS,
    ],
    [
      'inserting an SVG fragment',
      'const frag = SVGDocumentFragment(\'<rect width="1" height="1"/>\');\nfrag.insert();',
      4,
      1,
      DRAWS,
    ],
    ['define ViewBox (static)', 'define ViewBox(0, 0, 10, 10);', 3, 1, VIEWBOX],
    ['define ViewBox in a fn it calls', 'fn setBox() {\n  define ViewBox(0, 0, 10, 10);\n}\nsetBox();', 4, 3, VIEWBOX],
    ['reading ctx', 'const here = ctx.position;', 3, 14, READS('ctx')],
    ['reading viewbox', 'const width = viewbox.width;', 3, 15, READS('viewbox')],
    // A style value's error is placed at its `${`, as any style value's is.
    [
      'reading viewbox in a style value',
      'const thin = #{ stroke-width: ${viewbox.width / 100}; };',
      3,
      31,
      `Style value for "stroke-width": ${READS('viewbox')}`,
    ],
    [
      'reading viewbox in a path block (it has no box of its own)',
      'const bar = @{ m 0 0 h calc(viewbox.width) };',
      3,
      29,
      READS('viewbox'),
    ],
    [
      'reading ctx in a text block (it shares the pen of the code that makes it)',
      'const label = &{ text(0, 0)`${ctx.position.x}` };',
      3,
      31,
      READS('ctx'),
    ],
  ];

  it.each(FORBIDDEN)('%s is an error at its line', async (_what, body, line, col, message) => {
    expect(await errorOf(MAIN, lib(body))).toBe(libError(line, col, message));
  });

  // The functions that work from the pen (docs/modules.md "Exporting"; the
  // contextAwareFunctions set in src/stdlib/index.ts). Before, polarPoint here
  // silently measured from (0, 0), and a polarLine kept as a value moved a pen
  // that could never draw.
  const PEN_HELPERS: [string, string, number][] = [
    ['polarPoint', 'const tip = polarPoint(0deg, 10);', 13],
    ['polarMove', 'const step = polarMove(0deg, 10);', 14],
    ['polarLine', 'const seg = polarLine(0deg, 10);', 13],
    ['arcFromCenter', 'const bend = arcFromCenter(5, 0, 5, 180deg, 0deg, 1);', 14],
    ['arcFromPolarOffset', 'const bend = arcFromPolarOffset(0deg, 5, 90deg);', 14],
    ['heading', 'heading(45deg);', 1],
    ['turn', 'turn(10deg);', 1],
    ['tangentLine', 'const reach = tangentLine(10);', 15],
    ['tangentArc', 'const bend = tangentArc(5, 90deg);', 14],
  ];

  it.each(PEN_HELPERS)('%s is an error at its call', async (name, body, col) => {
    expect(await errorOf(MAIN, lib(body))).toBe(libError(3, col, PEN(name)));
  });

  it("docs/modules.md's Errors table quotes polarPoint's message word for word", () => {
    const docs = readFileSync(new URL('../docs/modules.md', import.meta.url), 'utf8');
    expect(docs).toContain(`\`${PEN('polarPoint')}\``);
  });

  it('the list above is every function that works from the pen', async () => {
    const { contextAwareFunctions } = await import('../src/stdlib');
    // polarOffset is in the set but never reads the pen: it stays allowed (below).
    expect([...contextAwareFunctions].filter((name) => name !== 'polarOffset').sort()).toEqual(
      PEN_HELPERS.map(([name]) => name).sort(),
    );
  });

  it("a pen helper in a fn the module calls while it loads is an error at the helper's line", async () => {
    expect(await errorOf(MAIN, lib('fn tip(len) {\n  return polarPoint(0deg, len);\n}\nconst far = tip(10);'))).toBe(
      libError(4, 10, PEN('polarPoint')),
    );
  });

  it('a pen helper in a style value is an error at its ${', async () => {
    expect(await errorOf(MAIN, lib('const thin = #{ stroke-width: ${polarPoint(0deg, 1).x}; };'))).toBe(
      libError(3, 31, `Style value for "stroke-width": ${PEN('polarPoint')}`),
    );
  });

  it('a pen helper in a text block is an error: the block shares the pen of the code that makes it', async () => {
    expect(await errorOf(MAIN, lib('const label = &{ text(0, 0)`${polarPoint(0deg, 1).x}` };'))).toBe(
      libError(3, 31, PEN('polarPoint')),
    );
  });

  // A builder's block runs in the module's state, so it has no pen either: the
  // same as reading ctx there.
  it.each([
    ['a Grid callback', 'const cells = Grid(2, 2) {|grid| log(polarPoint(0deg, 1).x); };', 38],
    [
      'a Marker body',
      "const tip = Marker('tip', 10, 10) {|m| m.append(@{ m 0 0 l 10 5 z }); log(polarPoint(0deg, 1).x); };",
      75,
    ],
  ])('a pen helper in %s the module builds while it loads is an error', async (_what, body, col) => {
    expect(await errorOf(MAIN, lib(body))).toBe(libError(3, col, PEN('polarPoint')));
  });

  it('a pen helper in a callback the module runs while it loads is an error', async () => {
    // Wrapped as any error in a .map() callback is.
    expect(await errorOf(MAIN, lib('const tips = [0, 90].map() {|a| return polarPoint(a * 1deg, 10); };'))).toBe(
      libError(3, undefined, `Error in .map() callback at index 0: Line 3, col 40: ${PEN('polarPoint')}`),
    );
  });

  it('a fn imported from another module that draws is an error where this module calls it', async () => {
    const message = await errorOf(MAIN, {
      '/lib.pathogen': 'module;\n\nimport { gear } from "./gears.pathogen";\n\ngear(4);\nexport const ok = 1;\n',
      '/gears.pathogen': 'module;\n\nexport fn gear(size) {\n  circle(0, 0, size);\n}\n',
    });
    expect(message).toBe(libError(5, 1, DRAWS));
  });

  it('nothing the module drew reaches the SVG: the compile stops', async () => {
    // Before step 5e an imported file's drawing ran and was thrown away.
    await expect(errorOf(MAIN, lib('circle(5, 5, 3);'))).resolves.toContain(DRAWS);
  });
});

// --- docs: "These are fine" -------------------------------------------------------------

describe('docs: what a module may make at its top level', () => {
  const ALLOWED: [string, string][] = [
    ['a style', "const thin = #{ stroke: Color('#333'); stroke-width: 1; };"],
    ['a path block', 'const notch = @{ m 0 0 l 10 0 l 0 10 z };\nlog(notch.length);'],
    [
      'a path block that reads its own ctx',
      'const notch = @{\n  m 5 5\n  l 10 0\n  let here = ctx.position;\n  l 0 calc(here.x)\n};\nlog(notch.endPoint.y);',
    ],
    ['a text block', 'const label = &{ text(0, 0)`hi` };'],
    [
      'a boolean op',
      'const both = @{ m 0 0 h 10 v 10 h -10 z }.union(@{ m 5 5 h 10 v 10 h -10 z });\nlog(both.commands.length);',
    ],
    ['a color', 'const ink = oklch(0.4 0.1 250);'],
    [
      'a gradient',
      "const fade = LinearGradient('fade', 0, 0, 1, 0) {|g| g.stop(0, oklch(0.6 0.2 30)); g.stop(1, oklch(0.5 0.2 250)); };",
    ],
    ['a mask', "const hole = Mask('hole');\nhole.append(@{ m 0 0 h 10 v 10 h -10 z });"],
    ['a clip path', "const window = ClipPath('window');\nwindow.append(@{ m 0 0 h 10 v 10 h -10 z });"],
    [
      'a marker with a trailing block',
      "const tip = Marker('tip', 10, 10) {|m| m.append(@{ m 0 0 l 10 5 l -10 5 z }); };",
    ],
    [
      'a pattern with a trailing block',
      "const dots = Pattern('dots', 0, 0, 10, 10) {|p| p.append(@{ m 0 0 h 2 v 2 h -2 z }); };",
    ],
    [
      'a table of numbers, a Cycler and a Grid',
      'const sizes = [3, 5, 8];\nconst palette = Cycler([1, 2]);\nconst cells = Grid(2, 2) {|grid| log(grid.rows); };',
    ],
    [
      'a value a helper builds from path blocks',
      'fn notch(size) {\n  return @{ m 0 0 l size 0 };\n}\nconst small = notch(4);',
    ],
    ['an enum and a fn', 'enum Teeth { Few = 8, Fine = 20 }\nfn gear(size) {\n  circle(0, 0, size);\n}'],
    ['log() and assert()', 'log("loading");\nassert(1 + 1 == 2, "math");'],
    [
      'a callback that draws into its own discarded sink, as in any program',
      'const doubled = [1, 2].map() {|v| return v * 2; };',
    ],
    // docs/modules.md: polarOffset doesn't use the pen, and polarTranslate
    // measures from a point you choose.
    [
      'polarOffset and Point.polarTranslate',
      'const step = polarOffset(0deg, 10);\nconst tip = Point(5, 5).polarTranslate(0deg, 10);\nassert(step.dx == 10 && tip.x == 15 && tip.y == 5, "polar");',
    ],
    // docs/path-blocks.md: pen helpers in a block use the block's own pen.
    [
      'a pen helper in a path block',
      // `m 5 5;` ends the path statement: without it, polarLine would be its argument.
      'const hook = @{\n  m 5 5;\n  polarLine(0deg, 10);\n  let tip = polarPoint(90deg, 4);\n  assert(tip.x == 15 && tip.y == 9, "block pen");\n};\nassert(hook.endPoint.x == 15 && hook.endPoint.y == 5, "block end");',
    ],
  ];

  it.each(ALLOWED)('%s', async (_what, body) => {
    const result = await compileFiles(MAIN, lib(body));
    expect(result.layers.map((l) => l.data)).toEqual(['M 0 0 L 1 1']);
  });

  it("@font is fine (its file loads before the compile; here there's none to load)", () => {
    expect(() => parse('module;\n\n@font "Inter";\n\nexport const ok = 1;\n')).not.toThrow();
  });

  it("a module's log() reaches you, labeled with its file", async () => {
    const result = await compileFiles(MAIN, lib('log("loading");'));
    expect(result.logs.map((l) => [l.file, l.parts.map((p) => p.value).join(' ')])).toEqual([
      ['lib.pathogen', 'loading'],
    ]);
  });

  it("defs a module builds reach your SVG when your drawing uses them, with the module's prefix", async () => {
    const result = await compileFiles(
      "import { tip } from \"./arrows.pathogen\";\n\ndefine PathLayer('arrow') #{ stroke: red; marker-end: tip; }\nlayer('arrow').apply { M 0 0 L 20 0 }\n",
      {
        '/arrows.pathogen':
          "module;\n\nexport const tip = Marker('tip', 10, 10) {|m| m.append(@{ m 0 0 l 10 5 l -10 5 z }); };\n",
      },
    );
    expect(result.markers.map((m) => m.id)).toEqual(['arrows--tip']);
  });
});

// --- docs: "Compiled by itself, a module draws nothing" ---------------------------------

describe('docs: a module compiled by itself', () => {
  const GEARS =
    '// parts/gears.pathogen\nmodule;\n\nexport const toothDepth = 6;\n\nexport enum Teeth { Few = 8, Standard = 12, Fine = 20 }\n\nexport fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - toothDepth, teeth);\n  hub(center, radius);\n}\n\n// Not exported: only this file can use it.\nfn hub(center, radius) {\n  circle(center.x, center.y, radius * 0.3);\n}\n';

  it('draws nothing', () => {
    const result = compile(GEARS);
    expect(result.layers.map((l) => l.data)).toEqual(['']);
  });

  it('still runs its log() and assert() lines', () => {
    expect(logsOf(compile('module;\n\nexport const toothDepth = 6;\nlog(toothDepth);\n'))).toEqual(['6']);
    expect(() => compile('module;\n\nconst toothDepth = 6;\nassert(toothDepth == 7, "depth");\n')).toThrow(/depth/);
  });

  it('a drawing line is an error there too, statically or as it runs', () => {
    expect(() => compile('module;\n\nM 0 0 L 5 5\n')).toThrow(`Parse error at line 3, column 1: ${DRAWS}`);
    expect(() => compile('module;\n\nfn gear(size) {\n  circle(0, 0, size);\n}\ngear(4);\n')).toThrow(
      `Line 6, col 1: ${DRAWS}`,
    );
    expect(() => compile('module;\n\nconst here = ctx.position;\n')).toThrow(`Line 3, col 14: ${READS('ctx')}`);
    expect(() => compile('module;\n\nconst tip = polarPoint(0deg, 10);\n')).toThrow(
      `Line 3, col 13: ${PEN('polarPoint')}`,
    );
  });

  it('a program without the header is unchanged: it draws, and ctx and viewbox work', () => {
    const result = compile('define ViewBox(0, 0, 40, 20);\nM 0 0 L 5 5\nlog(ctx.position.x);\nlog(viewbox.width);\n');
    expect(result.layers.map((l) => l.data)).toEqual(['M 0 0 L 5 5']);
    expect(logsOf(result)).toEqual(['5', '40']);
  });

  it('a program without the header keeps its pen helpers at the top level, before its first path command too', () => {
    const result = compile(
      'const early = polarPoint(0deg, 10);\nM 50 50;\nconst late = polarPoint(0deg, 10);\nL early.x early.y L late.x late.y\n',
    );
    expect(result.layers.map((l) => l.data)).toEqual(['M 50 50 L 10 0 L 60 50']);
  });
});

// --- docs: "Imported fns draw with your pen" ---------------------------------------------

describe('docs: imported fns draw with your pen', () => {
  const GEARS = {
    '/parts/gears.pathogen':
      '// parts/gears.pathogen\nmodule;\n\nexport const toothDepth = 6;\n\nexport enum Teeth { Few = 8, Standard = 12, Fine = 20 }\n\nexport fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - toothDepth, teeth);\n  hub(center, radius);\n}\n\n// Not exported: only this file can use it.\nfn hub(center, radius) {\n  circle(center.x, center.y, radius * 0.3);\n}\n',
  };

  it('both gears land in your teeth layer, with its stroke', async () => {
    const main =
      "// main.pathogen\nimport { gear } from \"./parts/gears.pathogen\";\n\ndefine ViewBox(0, 0, 200, 100);\ndefine PathLayer('teeth') #{\n  stroke: Color('#333');\n  stroke-width: 1.5;\n  fill: none;\n}\n\nlayer('teeth').apply {\n  gear(Point(55, 50), 40, 12);\n  gear(Point(150, 50), 28, 8);\n}\n";
    const result = await compileFiles(main, GEARS);
    // The same two gears drawn by one file, with gear and hub written in it.
    const oneFile = compile(
      "define ViewBox(0, 0, 200, 100);\ndefine PathLayer('teeth') #{\n  stroke: Color('#333');\n  stroke-width: 1.5;\n  fill: none;\n}\nfn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - 6, teeth);\n  circle(center.x, center.y, radius * 0.3);\n}\nlayer('teeth').apply {\n  gear(Point(55, 50), 40, 12);\n  gear(Point(150, 50), 28, 8);\n}\n",
    );
    expect(result.layers.map((l) => [l.name, l.data, l.styles])).toEqual(
      oneFile.layers.map((l) => [l.name, l.data, l.styles]),
    );
    expect(result.layers[0].name).toBe('teeth');
  });

  it("centerMark reads the box of the drawing that calls it: a cross at (100, 50) in main's 200 × 100 box", async () => {
    const marks = {
      '/parts/marks.pathogen':
        '// parts/marks.pathogen\nmodule;\n\nexport fn centerMark(size) {\n  let middleX = calc(viewbox.originX + viewbox.width / 2);\n  let middleY = calc(viewbox.originY + viewbox.height / 2);\n  M calc(middleX - size) middleY\n  h calc(size * 2)\n  M middleX calc(middleY - size)\n  v calc(size * 2)\n}\n',
    };
    const result = await compileFiles(
      'import { centerMark } from "./parts/marks.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ncenterMark(10);\n',
      marks,
    );
    expect(result.layers[0].data).toBe('M 90 50 h 20 M 100 40 v 20');
  });

  const INKS = {
    '/inks.pathogen':
      "// inks.pathogen\nmodule;\n\nexport const inkStyle = #{ stroke: Color('#333'); stroke-width: 1.5; fill: none; };\n\nexport fn inkLine(start, end) {\n  layer('ink').apply {\n    M start.x start.y\n    L end.x end.y\n  }\n}\n",
  };

  it('inkLine draws into your ink layer, styled with the exported inkStyle', async () => {
    const result = await compileFiles(
      '// main.pathogen\nimport { inkStyle, inkLine } from "./inks.pathogen";\n\ndefine PathLayer(\'ink\') inkStyle;\ninkLine(Point(10, 10), Point(90, 40));\n',
      INKS,
    );
    expect(result.layers.map((l) => [l.name, l.data, l.styles])).toEqual([
      ['ink', 'M 10 10 L 90 40', { stroke: '#333333', 'stroke-width': '1.5', fill: 'none' }],
    ]);
  });

  it('the first trap: calling inkLine before your ink layer exists', async () => {
    expect(
      await errorOf('import { inkLine } from "./inks.pathogen";\n\ninkLine(Point(10, 10), Point(90, 40));\n', INKS),
    ).toBe("inks.pathogen line 7: Undefined layer: 'ink'\n  called from main.pathogen line 3");
  });

  it('the second trap: calling inkLine inside your own apply block', async () => {
    expect(
      await errorOf(
        "import { inkStyle, inkLine } from \"./inks.pathogen\";\n\ndefine PathLayer('ink') inkStyle;\nlayer('ink').apply {\n  inkLine(Point(10, 10), Point(90, 40));\n}\n",
        INKS,
      ),
    ).toBe(
      "inks.pathogen line 7: Cannot nest layer apply blocks. Already inside layer 'ink'\n  called from main.pathogen line 5",
    );
  });
});

// --- what is never sealed ---------------------------------------------------------------

describe('what a module seals, and what it never does', () => {
  it("an exported fn's ctx and viewbox are the calling drawing's", async () => {
    const result = await compileFiles(
      // `M 7 3;` ends the path statement: without the `;`, `report()` would be its argument.
      'import { report } from "./lib.pathogen";\n\ndefine ViewBox(0, 0, 40, 20);\nM 7 3;\nreport();\n',
      { '/lib.pathogen': 'module;\n\nexport fn report() {\n  log(ctx.position.x, viewbox.width);\n}\n' },
    );
    expect(logsOf(result)).toEqual(['7 40']);
  });

  it("an exported fn's pen helpers use the calling drawing's pen", async () => {
    const result = await compileFiles(
      // `M 50 50;` ends the path statement, so tick(10) runs after the pen moves.
      'import { tick, tip } from "./lib.pathogen";\n\nM 50 50;\ntick(10);\nconst far = tip(5);\nL far.x far.y\n',
      {
        '/lib.pathogen':
          'module;\n\nexport fn tick(len) {\n  polarLine(0deg, len);\n}\n\nexport fn tip(len) {\n  return polarPoint(90deg, len);\n}\n',
      },
    );
    expect(result.layers[0].data).toBe(
      compile('M 50 50;\npolarLine(0deg, 10);\nconst far = polarPoint(90deg, 5);\nL far.x far.y\n').layers[0].data,
    );
    expect(result.layers[0].data).toBe('M 50 50 L 60 50 L 60 55');
  });

  it("an exported lambda's pen helper uses the calling drawing's pen", async () => {
    const result = await compileFiles(
      'import { tipAt } from "./lib.pathogen";\n\nM 10 10;\nconst far = tipAt(5);\nL far.x far.y\n',
      { '/lib.pathogen': 'module;\n\nexport const tipAt = {|len| polarPoint(0deg, len)};\n' },
    );
    expect(result.layers[0].data).toBe('M 10 10 L 15 10');
  });

  it("an exported fn called in the importing file's path block uses that block's pen", async () => {
    const result = await compileFiles(
      'import { tick } from "./lib.pathogen";\n\nconst hook = @{\n  m 2 2;\n  tick(3);\n};\nlog(hook.endPoint.x, hook.endPoint.y);\n',
      { '/lib.pathogen': 'module;\n\nexport fn tick(len) {\n  polarLine(0deg, len);\n}\n' },
    );
    expect(logsOf(result)).toEqual(['5 2']);
  });

  it('an exported fn may define layers, apply and write text in the calling drawing', async () => {
    const result = await compileFiles('import { scene } from "./lib.pathogen";\n\nscene();\n', {
      '/lib.pathogen':
        "module;\n\nexport fn scene() {\n  define PathLayer('ink') #{ stroke: red; }\n  define TextLayer('labels') #{}\n  layer('ink').apply { M 0 0 L 4 4 }\n  layer('labels').apply {\n    text(1, 2)`hi`;\n  }\n}\n",
    });
    expect(result.layers.map((l) => [l.name, l.type])).toEqual([
      ['ink', 'path'],
      ['labels', 'text'],
    ]);
    expect(result.layers[0].data).toBe('M 0 0 L 4 4');
  });

  it('a block a module builds inside an exported fn draws for the caller', async () => {
    const result = await compileFiles('import { notch } from "./lib.pathogen";\n\nM 10 10\nnotch(4);\n', {
      '/lib.pathogen': 'module;\n\nexport fn notch(size) {\n  @{ l size 0 l 0 size }.draw();\n}\n',
    });
    expect(result.layers[0].data).toBe('M 10 10 l 4 0 l 0 4');
  });

  it("a module's fn called while it loads, that only computes, is fine", async () => {
    const result = await compileFiles(
      MAIN,
      lib('fn double(n) {\n  return n * 2;\n}\nconst four = double(2);\nlog(four);'),
    );
    expect(logsOf(result)).toEqual(['4']);
  });

  it('a fn that draws and returns a value drops its drawing, as in any program, so it is no error', async () => {
    const body = 'fn mark() {\n  M 0 0 h 10\n  return 3;\n}\nconst three = mark();';
    expect(compile(body).layers.map((l) => l.data)).toEqual(['']);
    const result = await compileFiles(MAIN, lib(body));
    expect(result.layers.map((l) => l.data)).toEqual(['M 0 0 L 1 1']);
  });

  it('each module is sealed only while it is the one loading: a module imported by another still draws for the program', async () => {
    const result = await compileFiles('import { twoGears } from "./kit.pathogen";\n\ntwoGears(3);\n', {
      '/kit.pathogen':
        'module;\n\nimport { gear } from "./gears.pathogen";\n\nexport fn twoGears(size) {\n  gear(size);\n  gear(size + 1);\n}\n',
      '/gears.pathogen': 'module;\n\nexport fn gear(size) {\n  circle(0, 0, size);\n}\n',
    });
    expect(result.layers[0].data).toBe(compile('circle(0, 0, 3);\ncircle(0, 0, 4);').layers[0].data);
  });
});

// --- the backstop -----------------------------------------------------------------------

describe("fixFile's backstop", () => {
  it('a layer, transform or subscription held by a module is an error, not a value that draws nowhere', () => {
    // Unreachable through the language (a module can't make one); fixFile still refuses.
    for (const type of ['LayerReference', 'TransformReference', 'TransformPropertyReference', 'SubscriptionValue']) {
      const scope = { variables: new Map([['held', { type }]]), parent: null } as unknown as Scope;
      expect(() =>
        fixFile(scope, { path: '/lib.pathogen', label: 'lib.pathogen', entry: false }, new WeakMap()),
      ).toThrow(`${DRAWS} (held holds a part of a drawing.)`);
    }
  });
});
