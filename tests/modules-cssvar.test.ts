/**
 * Phase 1a, step 5b: CSSVar registrations from other files (docs/modules.md
 * "An imported file runs on its own" and "Ids from other files": what the
 * values you use rely on, such as the @property rule of a CSSVar, comes into
 * your drawing, and only when your drawing uses it).
 */
import { describe, expect, it } from 'vitest';

import { compile, resolveModules } from '../src';

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

/** The registered names, with their initial values. */
const registered = (result: CompileResult): [string, string][] =>
  result.cssProperties.map((p) => [p.name, p.initialValue]);

/** The initial value a registration gets for a color, as the compiler writes it. */
const initialOf = (color: string): string => {
  const alone = compile(`let c = Color(CSSVar('--x', '${color}'));\n`);
  return alone.cssProperties[0].initialValue;
};

const THEME = {
  '/theme.pathogen':
    "export const accent = Color(CSSVar('--accent', '#e63946'));\nexport const unused = Color(CSSVar('--unused', '#000000'));\nexport const look = #{ stroke: accent; };\nexport fn tint() {\n  return Color(CSSVar('--tint', '#00ff00'));\n}\n",
};
const LAYER = (style: string): string => `define PathLayer('a') ${style}\nlayer('a').apply { M 0 0 L 10 0 }\n`;

describe("an imported file's CSSVar registrations", () => {
  it('a color you use brings its @property rule; the unused one stays out', async () => {
    const result = await compileFiles(
      `import { accent, unused } from "./theme.pathogen";\n${LAYER('#{ stroke: accent; }')}`,
      THEME,
    );
    expect(registered(result)).toEqual([['--accent', initialOf('#e63946')]]);
    expect(result.layers[0].styles?.stroke).toMatch(/^var\(--accent, /);
  });

  it('importing without using adds none', async () => {
    const result = await compileFiles('import * as theme from "./theme.pathogen";\nM 0 0 L 10 0', THEME);
    expect(registered(result)).toEqual([]);
  });

  it('through a style block the file resolved while it loaded', async () => {
    const result = await compileFiles(`import { look } from "./theme.pathogen";\n${LAYER('look;')}`, THEME);
    expect(registered(result)).toEqual([['--accent', initialOf('#e63946')]]);
  });

  it('through an imported def: a gradient stop with the color', async () => {
    const result = await compileFiles(`import { sky } from "./sky.pathogen";\n${LAYER('#{ fill: sky; }')}`, {
      '/sky.pathogen':
        "const accent = Color(CSSVar('--accent', '#e63946'));\nexport const sky = LinearGradient('sky', 0, 0, 1, 0) {|g|\n  g.stop(0, accent);\n  g.stop(1, Color('#ffffff'));\n};\n",
    });
    expect(result.gradients.map((g) => g.id)).toEqual(['sky--sky']);
    expect(registered(result)).toEqual([['--accent', initialOf('#e63946')]]);
  });

  it('made by an imported fn while your file draws', async () => {
    const result = await compileFiles(
      `import { tint } from "./theme.pathogen";\nlet t = tint();\n${LAYER('#{ fill: t; }')}`,
      THEME,
    );
    expect(registered(result)).toEqual([['--tint', initialOf('#00ff00')]]);
  });

  it('your own registration of the same name wins', async () => {
    const result = await compileFiles(
      `import { accent } from "./theme.pathogen";\nlet mine = Color(CSSVar('--accent', '#0000ff'));\n${LAYER('#{ stroke: accent; fill: mine; }')}`,
      THEME,
    );
    expect(registered(result)).toEqual([['--accent', initialOf('#0000ff')]]);
  });

  it("a variable your own code uses keeps its meaning: the imported rule for that name doesn't join", async () => {
    // A registered property takes its initial value instead of your fallback,
    // so importing the theme must not turn your red line into the theme's color.
    const result = await compileFiles(
      `import { accent } from "./theme.pathogen";\nlet mine = CSSVar('--accent', '#ff0000');\n${LAYER('#{ stroke: mine; fill: accent; }')}`,
      THEME,
    );
    expect(registered(result)).toEqual([]);
    expect(result.layers[0].styles?.stroke).toBe('var(--accent, #ff0000)');
  });

  it('…also when the CSSVar is written inside the style block itself', async () => {
    const result = await compileFiles(
      `import { accent } from "./theme.pathogen";\n${LAYER("#{ stroke: CSSVar('--accent', '#ff0000'); fill: accent; }")}`,
      THEME,
    );
    expect(registered(result)).toEqual([]);
  });

  it('CSSVar() is the only way your code names a variable: a raw var() is rejected', () => {
    // So noting CSSVar() calls covers every name your own code uses.
    expect(() => compile(LAYER('#{ fill: var(--accent, blue); }'))).toThrow(
      /contains a raw var\(\): use the Pathogen CSSVar\(\) constructor instead/,
    );
  });

  it('one-file programs: registrations as before', () => {
    const result = compile(
      `let accent = Color(CSSVar('--accent', '#e63946'));\nlet unused = Color(CSSVar('--unused', '#000000'));\n${LAYER('#{ stroke: accent; }')}`,
    );
    expect(registered(result)).toEqual([
      ['--accent', initialOf('#e63946')],
      ['--unused', initialOf('#000000')],
    ]);
  });
});
