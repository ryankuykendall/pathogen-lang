/**
 * 2f: one program of VS Code's program list, drawn small on the preview's
 * drawing thread (packages/vscode-pathogen/src/program-drawing.ts). Its
 * imports and fonts load as the CLI loads them; its row gets the playground's
 * words for an error; a drawing too large to draw small gets a blank tile.
 * Real folders (a copy of the mockup's gears-project); the library is the sources.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FontSession } from '../packages/vscode-pathogen/src/font-session';
import {
  drawingOf,
  drawProgram,
  MINIATURE_BACKGROUND,
  withBackground,
} from '../packages/vscode-pathogen/src/program-drawing';
import { NOT_FOUND } from '../packages/vscode-pathogen/src/preview-programs';
import * as lib from '../src';
import * as node from '../src/node';

import type { CompileResultLike } from '../packages/vscode-pathogen/src/program-drawing';

const FIXTURE = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const TMP = join(__dirname, 'tmp');
let root = '';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  root = join(mkdtempSync(join(TMP, 'program-drawing-')), 'gears-project');
  cpSync(FIXTURE, root, { recursive: true });
});

afterAll(() => {
  rmSync(join(root, '..'), { recursive: true, force: true });
});

const at = (p: string): string => join(root, ...p.split('/'));
const libs = { lib, node };
const fonts = () => new FontSession({ lib, node });
const disk = (): undefined => undefined;
const svgOf = (url: string | null): string => {
  expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  return decodeURIComponent(url!.slice(url!.indexOf(',') + 1));
};

/** What the CLI draws for a program: compile with its imports, then generateSvg. */
async function cliDrawing(program: string, openText: (p: string) => string | undefined = disk): Promise<string> {
  const source = openText(program) ?? readFileSync(program, 'utf8');
  const modules = await node.resolveEditorModules(program, source, openText);
  const result = lib.compile(source, { modules: modules.graph }) as CompileResultLike;
  const drawing = drawingOf(result)!;
  const box = drawing.viewBox ?? { originX: 0, originY: 0, width: 200, height: 200 };
  return withBackground(lib.generateSvg(drawing as never), MINIATURE_BACKGROUND, box);
}

describe('drawProgram', () => {
  it("draws a program with its imports: the CLI's drawing on the preview's canvas colour, and the files it reads", async () => {
    const drawn = await drawProgram(libs, fonts(), at('main.pathogen'), disk);
    expect([drawn.error, drawn.tooLarge, drawn.files]).toEqual([null, false, [at('parts/gears.pathogen')]]);
    const svg = svgOf(drawn.miniature);
    expect(svg).toBe(await cliDrawing(at('main.pathogen')));
    // On white, over the drawing's own box (main.pathogen: define ViewBox(0, 0, 200, 120)).
    expect(svg).toMatch(/^<svg[^>]*><rect x="0" y="0" width="200" height="120" fill="#ffffff"\/>/);
  });

  it("an open tab's unsaved text counts, in the program and in what it imports", async () => {
    const edited = readFileSync(at('parts/gears.pathogen'), 'utf8').replace('toothDepth = 6', 'toothDepth = 10');
    const openText = (p: string) => (p === at('parts/gears.pathogen') ? edited : undefined);
    const drawn = await drawProgram(libs, fonts(), at('main.pathogen'), openText);
    const before = await drawProgram(libs, fonts(), at('main.pathogen'), disk);
    expect(svgOf(drawn.miniature)).toBe(await cliDrawing(at('main.pathogen'), openText));
    expect(drawn.miniature).not.toBe(before.miniature);
  });

  it('an error in the program: its row in the playground\'s words, "Error in try-sizes.pathogen line 13"', async () => {
    const broken = readFileSync(at('try-sizes.pathogen'), 'utf8').replace('20 + i * 10, Teeth.Standard', '20 + i * 10');
    const drawn = await drawProgram(libs, fonts(), at('try-sizes.pathogen'), (p) =>
      p === at('try-sizes.pathogen') ? broken : undefined,
    );
    expect(drawn).toEqual({
      error: 'Error in try-sizes.pathogen line 13',
      miniature: null,
      tooLarge: false,
      files: [at('parts/gears.pathogen')],
    });
  });

  it('an error inside a file it imports names that file and its line', async () => {
    const gears = readFileSync(at('parts/gears.pathogen'), 'utf8').replace('circle(center.x', 'circel(center.x');
    const drawn = await drawProgram(libs, fonts(), at('main.pathogen'), (p) =>
      p === at('parts/gears.pathogen') ? gears : undefined,
    );
    expect(drawn.error).toBe('Error in parts/gears.pathogen line 15');
  });

  it("an import that can't be loaded: the row names the importing file and line", async () => {
    const sketch = readFileSync(at('sketch.pathogen'), 'utf8').replace(
      './parts/gears.pathogen',
      './parts/gera.pathogen',
    );
    const drawn = await drawProgram(libs, fonts(), at('sketch.pathogen'), (p) =>
      p === at('sketch.pathogen') ? sketch : undefined,
    );
    expect(drawn.error).toBe('Error in sketch.pathogen line 2');
  });

  it('a drawing too large to draw small: a blank tile, never an error', async () => {
    const huge = 'for (i in 0..20000) {\n  M calc(i / 100) 0 L calc(i / 100) 10\n}\n';
    const drawn = await drawProgram(libs, fonts(), at('huge.pathogen'), (p) =>
      p === at('huge.pathogen') ? huge : undefined,
    );
    expect(drawn).toEqual({ error: null, miniature: null, tooLarge: true, files: [] });
  });

  it('a program gone from the disk (and no tab): "Not found"', async () => {
    const drawn = await drawProgram(libs, fonts(), at('gone.pathogen'), disk);
    expect(drawn).toEqual({ error: NOT_FOUND, miniature: null, tooLarge: false, files: null });
  });

  it('a program with a font draws with it, as the CLI does (a project font file)', async () => {
    mkdirSync(at('fonts'), { recursive: true });
    cpSync(join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf'), at('fonts/Inter-Regular.ttf'));
    // A font file goes by its file's name.
    const source =
      '@font "./fonts/Inter-Regular.ttf";\nconst g = PathBlock.fromGlyph("A", #{ font-family: "Inter-Regular"; font-size: 40; });\nM 20 60\ng[0].draw()\n';
    const program = at('glyph.pathogen');
    const drawn = await drawProgram(libs, fonts(), program, (p) => (p === program ? source : undefined));
    expect([drawn.error, drawn.tooLarge]).toEqual([null, false]);
    // The glyph's outline: path data, not a <text> element.
    const svg = svgOf(drawn.miniature);
    expect(svg).toMatch(/<path [^>]*d="M/);
    expect(svg).not.toMatch(/<text/);
  });
});
