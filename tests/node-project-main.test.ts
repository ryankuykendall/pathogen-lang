/**
 * readProjectMain (pathogen-lang/node): a project folder's main, checked as
 * the CLI's folder compile checks it (docs/projects.md). The CLI fails with
 * its message; the VS Code preview (2f, project-docs/modules/66-phase-2f-plan.md)
 * shows the same message when the main it would show can't be shown, and
 * tells "no main at all" ({} with no main.pathogen) from the rest by `problem`.
 * Real folders on disk.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mainIsModuleMessage, mainMissingMessage } from '../src/host/project';
import { readProjectMain } from '../src/node';

const TMP = join(__dirname, 'tmp');
let base = '';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  base = mkdtempSync(join(TMP, 'project-main-'));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

let count = 0;
function project(files: Record<string, string>): string {
  const folder = join(base, `p${++count}`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(folder, ...path.split('/')), text);
  }
  return folder;
}

const PROGRAM = 'M 0 0 L 10 10\n';
const MODULE = 'module;\nexport const x = 1;\n';

describe('readProjectMain', () => {
  it('the first of entryPoints: its path, its text, and its file under the folder as given', async () => {
    const folder = project({
      'pathogen.json': '{ "entryPoints": ["src/poster.pathogen"] }',
      'src/poster.pathogen': PROGRAM,
    });
    expect(await readProjectMain(folder)).toEqual({
      ok: true,
      path: '/src/poster.pathogen',
      listed: true,
      file: join(folder, 'src', 'poster.pathogen'),
      source: PROGRAM,
    });
  });

  it('main.pathogen when there is no entryPoints', async () => {
    const folder = project({ 'pathogen.json': '{}', 'main.pathogen': PROGRAM });
    const read = await readProjectMain(folder);
    expect(read).toMatchObject({ ok: true, path: '/main.pathogen', listed: false });
  });

  it("{} with no main.pathogen: not found, not listed (the preview's project without a main)", async () => {
    const folder = project({ 'pathogen.json': '{}' });
    expect(await readProjectMain(folder, { label: 'sketches' })).toEqual({
      ok: false,
      problem: 'not-found',
      message: mainMissingMessage('sketches', 'main.pathogen', false, join(folder, 'main.pathogen')),
      path: '/main.pathogen',
      listed: false,
    });
  });

  it("a listed main that doesn't exist: the CLI's message, naming the folder by its label", async () => {
    const folder = project({ 'pathogen.json': '{ "entryPoints": ["poster.pathogen"] }' });
    const read = await readProjectMain(folder, { label: 'gears-project' });
    expect(read).toEqual({
      ok: false,
      problem: 'not-found',
      message: `The main of gears-project, poster.pathogen, doesn't exist (looked for ${join(folder, 'poster.pathogen')}). pathogen.json lists it first in "entryPoints": add the file, or put another program first.`,
      path: '/poster.pathogen',
      listed: true,
    });
  });

  it('a main that is a module', async () => {
    const folder = project({ 'pathogen.json': '{ "entryPoints": ["main.pathogen"] }', 'main.pathogen': MODULE });
    const read = await readProjectMain(folder);
    expect(read).toEqual({
      ok: false,
      problem: 'module',
      message: mainIsModuleMessage(folder, 'main.pathogen', true),
      path: '/main.pathogen',
      listed: true,
    });
  });

  it("an open editor's text counts over the disk's when telling a module", async () => {
    const folder = project({ 'pathogen.json': '{}', 'main.pathogen': PROGRAM });
    const mainFile = join(folder, 'main.pathogen');
    const asModule = await readProjectMain(folder, { openText: (p) => (p === mainFile ? MODULE : undefined) });
    expect(asModule).toMatchObject({ ok: false, problem: 'module' });
    const disk = await readProjectMain(folder, { openText: () => undefined });
    expect(disk).toMatchObject({ ok: true, source: PROGRAM });
  });

  it("a rule of the list broken (empty, or a file twice): problem 'list', with the first entry when there is one", async () => {
    const empty = await readProjectMain(project({ 'pathogen.json': '{ "entryPoints": [] }' }));
    expect(empty).toMatchObject({ ok: false, problem: 'list', path: null, listed: true });
    expect(empty.ok ? '' : empty.message).toMatch(/"entryPoints" is empty/);
    const twice = await readProjectMain(
      project({ 'pathogen.json': '{ "entryPoints": ["a.pathogen", "a.pathogen"] }', 'a.pathogen': PROGRAM }),
    );
    expect(twice).toMatchObject({ ok: false, problem: 'list', path: '/a.pathogen', listed: true });
    expect(twice.ok ? '' : twice.message).toMatch(/lists the same file twice/);
  });

  it("a broken pathogen.json: problem 'project-file', with its message", async () => {
    const folder = project({ 'pathogen.json': '{ "entrypoints": [] }' });
    expect(await readProjectMain(folder)).toEqual({
      ok: false,
      problem: 'project-file',
      message: `pathogen.json (${folder}) has an unknown key "entrypoints". Did you mean "entryPoints"?`,
      path: null,
      listed: false,
    });
  });

  it('a main that is a folder', async () => {
    const folder = project({ 'pathogen.json': '{ "entryPoints": ["main.pathogen"] }', 'main.pathogen/x.txt': '' });
    const read = await readProjectMain(folder);
    expect(read).toEqual({
      ok: false,
      problem: 'folder',
      message: `${join(folder, 'main.pathogen')} is a folder, not a file.`,
      path: '/main.pathogen',
      listed: true,
    });
  });
});
