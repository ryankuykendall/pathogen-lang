/**
 * 2f: what VS Code's preview shows (packages/vscode-pathogen/src/preview-programs.ts;
 * docs/projects.md "The preview in VS Code"; project-docs/modules/66-phase-2f-plan.md).
 * One test per rule in the approved docs. Real folders on disk (a copy of the
 * mockup's gears-project); the library is the sources.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  listedPrograms,
  MISSING_GRACE_MS,
  MODULE_MAIN,
  NOT_FOUND,
  NOT_LISTED,
  ProgramChoices,
  programRows,
  readProject,
  TOO_DETAILED,
} from '../packages/vscode-pathogen/src/preview-programs';
import { isModuleSource } from '../src';
import { mainIsModuleMessage, mainMissingMessage } from '../src/host/project';
import { findProjectRoot, loadProjectFileSync, readProjectMain } from '../src/node';

import type { DrawnRow, Project, Texts } from '../packages/vscode-pathogen/src/preview-programs';

const FIXTURE = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const TMP = join(__dirname, 'tmp');
let base = '';

const libs = { lib: { isModuleSource }, node: { findProjectRoot, loadProjectFileSync, readProjectMain } };

/** Open tabs' text over the disk's, as the extension reads them. */
function textsWith(open: Map<string, string> = new Map()): Texts {
  return {
    open: (p) => open.get(p),
    read: (p) => {
      if (open.has(p)) return open.get(p);
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return undefined;
      }
    },
  };
}

let count = 0;
/** A fresh copy of gears-project, with `files` written over it (null deletes). */
function gears(files: Record<string, string | null> = {}): string {
  const folder = join(base, `gears-${++count}`, 'gears-project');
  cpSync(FIXTURE, folder, { recursive: true });
  for (const [p, text] of Object.entries(files)) {
    const file = join(folder, ...p.split('/'));
    if (text === null) rmSync(file, { force: true });
    else {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, text);
    }
  }
  return folder;
}

const at = (root: string, p: string): string => join(root, ...p.split('/'));
const PROGRAM = 'M 0 0 L 10 10\n';
const MODULE = 'module;\nexport const x = 1;\n';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  base = mkdtempSync(join(TMP, 'preview-programs-'));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('which folders are projects with a main', () => {
  it('a pathogen.json with entryPoints: the main, then the listed programs in order', async () => {
    const root = gears();
    const project = await readProject(at(root, 'parts/gears.pathogen'), libs, textsWith());
    expect(project).toEqual({
      root,
      key: expect.any(String),
      main: at(root, 'main.pathogen'),
      mainProblem: null,
      listed: [at(root, 'main.pathogen'), at(root, 'demos/train.pathogen'), at(root, 'try-sizes.pathogen')],
    });
  });

  it('a main.pathogen beside a pathogen.json with no entryPoints', async () => {
    const root = gears({ 'pathogen.json': '{}' });
    const project = await readProject(at(root, 'sketch.pathogen'), libs, textsWith());
    expect(project).toMatchObject({
      main: at(root, 'main.pathogen'),
      mainProblem: null,
      listed: [at(root, 'main.pathogen')],
    });
  });

  it('{} with no main.pathogen beside it is a project without a main: the preview shows the file you edit', async () => {
    const root = gears({ 'pathogen.json': '{}', 'main.pathogen': null });
    expect(await readProject(at(root, 'sketch.pathogen'), libs, textsWith())).toBeNull();
  });

  it('a pathogen.json with an error: as without a main (its error shows at the first import)', async () => {
    const root = gears({ 'pathogen.json': '{ "entrypoints": ["main.pathogen"] }' });
    expect(await readProject(at(root, 'main.pathogen'), libs, textsWith())).toBeNull();
  });

  it('no pathogen.json up the tree that names a main: as before', async () => {
    const folder = join(base, 'lone');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'sketch.pathogen'), PROGRAM);
    expect(await readProject(join(folder, 'sketch.pathogen'), libs, textsWith())).toBeNull();
  });

  it('a listed program that is missing or a module is left out; only the main stays whatever it is', async () => {
    const root = gears({
      'pathogen.json':
        '{ "entryPoints": ["main.pathogen", "gone.pathogen", "parts/gears.pathogen", "try-sizes.pathogen"] }',
    });
    const project = await readProject(at(root, 'main.pathogen'), libs, textsWith());
    expect(project?.listed).toEqual([at(root, 'main.pathogen'), at(root, 'try-sizes.pathogen')]);
  });

  it('a listed main that does not exist stays first: its row says "Not found", the preview the CLI\'s words', async () => {
    const root = gears({ 'pathogen.json': '{ "entryPoints": ["poster.pathogen", "main.pathogen"] }' });
    const project = await readProject(at(root, 'parts/gears.pathogen'), libs, textsWith());
    expect(project).toMatchObject({
      main: at(root, 'poster.pathogen'),
      mainProblem: {
        row: NOT_FOUND,
        message: mainMissingMessage('gears-project', 'poster.pathogen', true, at(root, 'poster.pathogen')),
      },
      listed: [at(root, 'poster.pathogen'), at(root, 'main.pathogen')],
    });
    expect(project!.mainProblem!.message).toBe(
      `The main of gears-project, poster.pathogen, doesn't exist (looked for ${at(root, 'poster.pathogen')}). pathogen.json lists it first in "entryPoints": add the file, or put another program first.`,
    );
  });

  it("a main that's a module stays, its row in the playground's words; an open tab's unsaved module; counts", async () => {
    const root = gears();
    const open = new Map([[at(root, 'main.pathogen'), MODULE]]);
    const project = await readProject(at(root, 'main.pathogen'), libs, textsWith(open));
    expect(project?.mainProblem).toEqual({
      row: MODULE_MAIN,
      message: mainIsModuleMessage('gears-project', 'main.pathogen', true),
    });
    expect(project?.listed[0]).toBe(at(root, 'main.pathogen'));
  });

  it('entryPoints breaking a rule of the list (empty): no main row, the CLI message, the other programs offered', async () => {
    const root = gears({ 'pathogen.json': '{ "entryPoints": [] }' });
    const project = await readProject(at(root, 'main.pathogen'), libs, textsWith());
    expect(project).toMatchObject({ main: null, mainProblem: { row: null }, listed: [] });
    expect(project!.mainProblem!.message).toMatch(/"entryPoints" is empty\./);
  });

  it('nested project folders are each their own project', async () => {
    const root = gears({
      'inner/pathogen.json': '{ "entryPoints": ["b.pathogen"] }',
      'inner/b.pathogen': PROGRAM,
    });
    const inner = await readProject(at(root, 'inner/b.pathogen'), libs, textsWith());
    const outer = await readProject(at(root, 'main.pathogen'), libs, textsWith());
    expect(inner?.root).toBe(at(root, 'inner'));
    expect(inner?.main).toBe(at(root, 'inner/b.pathogen'));
    expect(outer?.root).toBe(root);
    expect(inner?.key).not.toBe(outer?.key);
  });
});

describe('what the preview shows', () => {
  async function setup(files: Record<string, string | null> = {}, open = new Map<string, string>()) {
    const root = gears(files);
    const texts = textsWith(open);
    const clock = { now: 1000 };
    const choices = new ProgramChoices(isModuleSource, texts, () => clock.now);
    const project = async (p: string) => readProject(at(root, p), libs, texts);
    const text = (p: string) => texts.read(at(root, p)) ?? '';
    const show = async (p: string, pressed: boolean) => choices.show(at(root, p), text(p), await project(p), pressed);
    return { root, choices, show, project, open, clock };
  }

  it("the preview button on a program's tab shows that program and makes it the choice", async () => {
    const { root, show } = await setup();
    expect(await show('demos/train.pathogen', true)).toMatchObject({
      kind: 'program',
      path: at(root, 'demos/train.pathogen'),
    });
    // Switching tabs leaves it there: to the main, to a module.
    expect(await show('main.pathogen', false)).toMatchObject({ path: at(root, 'demos/train.pathogen') });
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'demos/train.pathogen') });
  });

  it("the button on a module's tab shows the program chosen in that project, the main at first, and undoes no choice", async () => {
    const { root, show } = await setup();
    expect(await show('parts/gears.pathogen', true)).toMatchObject({
      kind: 'program',
      path: at(root, 'main.pathogen'),
    });
    await show('try-sizes.pathogen', true);
    expect(await show('parts/gears.pathogen', true)).toMatchObject({ path: at(root, 'try-sizes.pathogen') });
  });

  it('a program pathogen.json does not list can be chosen by its button too', async () => {
    const { root, show } = await setup();
    expect(await show('sketch.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
    expect(await show('sketch.pathogen', true)).toMatchObject({ path: at(root, 'sketch.pathogen') });
  });

  it('the choice is kept per project: another project shows its own, and a file without a main shows itself', async () => {
    const a = await setup();
    const b = gears();
    const lone = join(base, 'lone-show');
    mkdirSync(lone, { recursive: true });
    writeFileSync(join(lone, 'sketch.pathogen'), PROGRAM);
    await a.show('demos/train.pathogen', true);
    const inB = a.choices.show(
      at(b, 'parts/gears.pathogen'),
      MODULE,
      await readProject(at(b, 'parts/gears.pathogen'), libs, textsWith()),
      false,
    );
    expect(inB).toMatchObject({ kind: 'program', path: at(b, 'main.pathogen') });
    const alone = a.choices.show(
      join(lone, 'sketch.pathogen'),
      PROGRAM,
      await readProject(join(lone, 'sketch.pathogen'), libs, textsWith()),
      false,
    );
    expect(alone).toEqual({ kind: 'file' });
    expect(await a.show('main.pathogen', false)).toMatchObject({ path: at(a.root, 'demos/train.pathogen') });
  });

  it('one project however its folder is spelled: through a link, the same choice', async () => {
    const { root, choices, show } = await setup();
    const link = join(base, `link-${count}`);
    symlinkSync(root, link);
    await show('demos/train.pathogen', true);
    const viaLink = await readProject(join(link, 'main.pathogen'), libs, textsWith());
    expect(choices.show(join(link, 'main.pathogen'), PROGRAM, viaLink, false)).toMatchObject({
      path: at(root, 'demos/train.pathogen'),
    });
  });

  it('an untitled document shows itself', async () => {
    const { choices, project } = await setup();
    expect(choices.show(null, PROGRAM, await project('main.pathogen'), true)).toEqual({ kind: 'file' });
  });

  it('the program shown deleted: back to the main', async () => {
    const { root, show, clock } = await setup();
    await show('demos/train.pathogen', true);
    rmSync(at(root, 'demos/train.pathogen'));
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
    // Gone for longer than a save takes: forgotten, even when a file of that name comes back.
    clock.now += MISSING_GRACE_MS;
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
    writeFileSync(at(root, 'demos/train.pathogen'), PROGRAM);
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
  });

  it('gone only for a moment (a save that replaces the file, a checkout): the choice comes back', async () => {
    const { root, show, clock } = await setup();
    await show('demos/train.pathogen', true);
    const text = readFileSync(at(root, 'demos/train.pathogen'), 'utf8');
    rmSync(at(root, 'demos/train.pathogen'));
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
    clock.now += MISSING_GRACE_MS - 1;
    writeFileSync(at(root, 'demos/train.pathogen'), text);
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'demos/train.pathogen') });
  });

  it('the project folder renamed in VS Code: its choice follows', async () => {
    const { root, choices, show } = await setup();
    await show('demos/train.pathogen', true);
    const moved = join(root, '..', 'gears-renamed');
    renameSync(root, moved);
    choices.renamed(root, moved);
    const project = await readProject(join(moved, 'main.pathogen'), libs, textsWith());
    expect(choices.show(join(moved, 'main.pathogen'), PROGRAM, project, false)).toMatchObject({
      path: join(moved, 'demos', 'train.pathogen'),
    });
  });

  it('the program shown becomes a module (unsaved, in its tab): back to the main', async () => {
    const { root, show, open } = await setup();
    await show('demos/train.pathogen', true);
    open.set(at(root, 'demos/train.pathogen'), MODULE);
    expect(await show('parts/gears.pathogen', false)).toMatchObject({ path: at(root, 'main.pathogen') });
  });

  it('renamed or moved in VS Code, the choice follows it; a folder too', async () => {
    const { root, choices, show } = await setup();
    await show('demos/train.pathogen', true);
    renameSync(at(root, 'demos/train.pathogen'), at(root, 'demos/locomotive.pathogen'));
    choices.renamed(at(root, 'demos/train.pathogen'), at(root, 'demos/locomotive.pathogen'));
    expect(await show('main.pathogen', false)).toMatchObject({ path: at(root, 'demos/locomotive.pathogen') });
    renameSync(at(root, 'demos'), at(root, 'samples'));
    choices.renamed(at(root, 'demos'), at(root, 'samples'));
    expect(await show('main.pathogen', false)).toMatchObject({ path: at(root, 'samples/locomotive.pathogen') });
  });

  it("the main can't be shown: the CLI's message, and another program can still be chosen", async () => {
    const { root, show } = await setup({ 'pathogen.json': '{ "entryPoints": ["poster.pathogen", "main.pathogen"] }' });
    const shown = await show('parts/gears.pathogen', false);
    expect(shown).toMatchObject({ kind: 'problem' });
    expect(shown.kind === 'problem' && shown.message).toMatch(
      /^The main of gears-project, poster\.pathogen, doesn't exist/,
    );
    expect(await show('main.pathogen', true)).toMatchObject({ kind: 'program', path: at(root, 'main.pathogen') });
  });

  it('a main that became a module: the CLI message rather than an empty preview', async () => {
    const { show } = await setup({ 'main.pathogen': MODULE });
    const shown = await show('parts/gears.pathogen', false);
    expect(shown.kind === 'problem' && shown.message).toBe(mainIsModuleMessage('gears-project', 'main.pathogen', true));
  });
});

describe('the program list', () => {
  const none = (): DrawnRow | undefined => undefined;

  async function project(files: Record<string, string | null> = {}): Promise<{ root: string; project: Project }> {
    const root = gears(files);
    return { root, project: (await readProject(at(root, 'main.pathogen'), libs, textsWith()))! };
  }

  it('the main, then entryPoints in order; a program not listed joins the end while edited or shown, by path', async () => {
    const { root, project: p } = await project();
    const main = at(root, 'main.pathogen');
    expect(listedPrograms(p, main, null)).toEqual(p.listed);
    expect(listedPrograms(p, main, at(root, 'sketch.pathogen'))).toEqual([...p.listed, at(root, 'sketch.pathogen')]);
    expect(listedPrograms(p, at(root, 'sketch.pathogen'), main)).toEqual([...p.listed, at(root, 'sketch.pathogen')]);
    writeFileSync(at(root, 'another.pathogen'), PROGRAM);
    expect(listedPrograms(p, at(root, 'sketch.pathogen'), at(root, 'another.pathogen'))).toEqual([
      ...p.listed,
      at(root, 'another.pathogen'),
      at(root, 'sketch.pathogen'),
    ]);
  });

  it('rows: name and path, the note on an unlisted program, the main badge only on a main that is not main.pathogen', async () => {
    const { root, project: p } = await project();
    const { items, files } = programRows(
      p,
      at(root, 'main.pathogen'),
      at(root, 'sketch.pathogen'),
      at(root, 'sketch.pathogen'),
      none,
    );
    expect(files).toEqual([...p.listed, at(root, 'sketch.pathogen')]);
    expect(items.map((i) => [i.path, i.name, i.hint, i.badge, i.note])).toEqual([
      ['main.pathogen', 'main', null, false, null],
      ['demos/train.pathogen', 'train', null, false, null],
      ['try-sizes.pathogen', 'try-sizes', null, false, null],
      ['sketch.pathogen', 'sketch', null, false, NOT_LISTED],
    ]);
    expect(NOT_LISTED).toBe('not in pathogen.json');
  });

  it("the dots: on the programs that use the file you're editing, and on that file when it's a program, never while it's shown", async () => {
    const { root, project: p } = await project();
    const gearsFile = at(root, 'parts/gears.pathogen');
    const drawn = (file: string): DrawnRow => ({
      error: null,
      miniature: null,
      updating: false,
      files: file.endsWith('main.pathogen') || file.endsWith('try-sizes.pathogen') ? [gearsFile] : [],
      tooLarge: false,
    });
    const main = at(root, 'main.pathogen');
    expect(programRows(p, main, gearsFile, null, drawn).items.map((i) => i.uses)).toEqual(['import', null, 'import']);
    const train = at(root, 'demos/train.pathogen');
    expect(programRows(p, main, train, train, drawn).items.map((i) => i.uses)).toEqual([null, 'self', null]);
    expect(programRows(p, main, main, main, drawn).items.map((i) => i.uses)).toEqual([null, null, null]);
  });

  it("a row takes its drawing: error, miniature, the spinner (never on the program shown), and the blank tile's note", async () => {
    const { root, project: p } = await project();
    const rows = new Map<string, DrawnRow>([
      [at(root, 'main.pathogen'), { error: null, miniature: 'data:main', updating: true, files: [], tooLarge: false }],
      [at(root, 'demos/train.pathogen'), { error: null, miniature: null, updating: false, files: [], tooLarge: true }],
      [
        at(root, 'try-sizes.pathogen'),
        {
          error: 'Error in try-sizes.pathogen line 13',
          miniature: 'data:old',
          updating: true,
          files: [],
          tooLarge: false,
        },
      ],
    ]);
    const { items } = programRows(p, at(root, 'main.pathogen'), null, null, (f) => rows.get(f));
    expect(items.map((i) => [i.error, i.miniature, i.updating, i.tileNote])).toEqual([
      [null, 'data:main', false, null],
      [null, null, false, TOO_DETAILED],
      ['Error in try-sizes.pathogen line 13', 'data:old', true, null],
    ]);
  });

  it("a main that can't be shown: its row says why, with the badge when it's not main.pathogen, and nothing drawn", async () => {
    const { root, project: p } = await project({
      'pathogen.json': '{ "entryPoints": ["poster.pathogen", "main.pathogen"] }',
    });
    const drawn = (): DrawnRow => ({ error: null, miniature: 'data:x', updating: true, files: [], tooLarge: false });
    const { items } = programRows(p, null, at(root, 'parts/gears.pathogen'), null, drawn);
    expect(items[0]).toMatchObject({
      path: 'poster.pathogen',
      badge: true,
      error: NOT_FOUND,
      miniature: null,
      updating: false,
    });
    expect(items[1]).toMatchObject({ path: 'main.pathogen', badge: false, error: null });
  });

  it('two programs with one name: each gets as much of its folder as tells them apart', async () => {
    const { root, project: p } = await project({
      'pathogen.json': '{ "entryPoints": ["main.pathogen", "demos/main.pathogen"] }',
      'demos/main.pathogen': PROGRAM,
    });
    const { items } = programRows(p, at(root, 'main.pathogen'), null, null, none);
    expect(items.map((i) => [i.name, i.hint])).toEqual([
      ['main', '/'],
      ['main', 'demos'],
    ]);
    expect(basename(root)).toBe('gears-project');
  });
});
