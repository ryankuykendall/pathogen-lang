// @vitest-environment jsdom
//
// The playground's side of a workspace with several files (phase 2c;
// project-docs/modules/51-phase-2c-plan.md): the store's files from a load,
// the program the preview shows, the compile's imports and their errors,
// fonts across files, the language services' graph key, and autosave's
// payload and dirty check under the server's own hash rule. The real engine
// sits on window.PathogenLang, as the bundle does in the browser.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { autosave } from '../playground/services/autosave.js';
import {
  resolveFontsForFiles,
  resolveWorkspaceImports,
  WorkspaceLoadError,
} from '../playground/services/compiler-worker.js';
import {
  filesWithoutText,
  programToShow,
  workspaceFromAnswer,
  workspaceTexts,
} from '../playground/services/workspace-files.js';
import { graphKey } from '../playground/services/workspace-modules.js';
import { store } from '../playground/state/store.js';

// vitest hoists these above the imports.
const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));
vi.mock('../playground/services/api.js', () => ({ workspaceApi: { update: updateSpy } }));

const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';

const loadEngine = async () => import('../src');
let engine: Awaited<ReturnType<typeof loadEngine>>;
beforeAll(async () => {
  engine = await loadEngine();
  (window as unknown as { PathogenLang: unknown }).PathogenLang = engine;
});

describe('the store from a load', () => {
  it('holds every file, opens the main, and keeps the folders and entry points', () => {
    const fromFiles = workspaceFromAnswer({
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      folders: ['examples'],
      entryPoints: ['main.pathogen'],
    });
    expect(fromFiles).toEqual({
      workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS },
      workspaceFolders: ['examples'],
      workspaceEntryPoints: ['main.pathogen'],
      openFile: 'main.pathogen',
    });
    // A main that isn't main.pathogen is what opens.
    const app = workspaceFromAnswer({ files: { 'app.pathogen': { text: 'M 0 0' } }, entryPoints: ['app.pathogen'] });
    expect(app.openFile).toBe('app.pathogen');
  });

  it("reads a server's answer from before phase 2 (one `code`) as just main.pathogen", () => {
    expect(workspaceFromAnswer({ code: 'M 1 1' })).toEqual({
      workspaceFiles: { 'main.pathogen': 'M 1 1' },
      workspaceFolders: [],
      workspaceEntryPoints: ['main.pathogen'],
      openFile: 'main.pathogen',
    });
  });

  it("overlays the editor's text on the open file, and shows the chosen program or else the main", () => {
    const workspace = workspaceTexts({
      workspaceFiles: { 'main.pathogen': 'old', 'b.pathogen': 'B' },
      workspaceFolders: [],
      workspaceEntryPoints: ['main.pathogen', 'b.pathogen'],
      openFile: 'main.pathogen',
      code: 'new',
    });
    expect(workspace.texts.get('main.pathogen')).toBe('new');
    const shown = [null, 'b.pathogen', 'gone.pathogen'].map((chosen) => programToShow(workspace, chosen));
    expect(shown).toEqual(['main.pathogen', 'b.pathogen', 'main.pathogen']);
    // With no workspace loaded (a scratch link), the code is its one program.
    const scratch = workspaceTexts({
      workspaceFiles: {},
      workspaceFolders: [],
      workspaceEntryPoints: [],
      openFile: 'main.pathogen',
      code: 'M 0 0',
    });
    expect([[...scratch.texts.keys()], scratch.entryPoints]).toEqual([['main.pathogen'], ['main.pathogen']]);
  });
});

describe("the compile's imports", () => {
  const files = new Map([
    ['main.pathogen', MAIN],
    ['parts/gears.pathogen', GEARS],
  ]);

  it('reads the files the program imports, and loads fonts from each of them', async () => {
    const resolved = await resolveWorkspaceImports(MAIN, { files, entry: 'main.pathogen', label: 'Gears' });
    expect((resolved.modules as { order: string[] }).order).toEqual(['/parts/gears.pathogen']);
    expect(resolved.fontFiles).toEqual([
      { source: MAIN, label: null },
      { source: GEARS, label: 'parts/gears.pathogen' },
    ]);
  });

  it('an import that can’t load stops the compile, at its line in the program', async () => {
    const main = 'import { gear } from "./parts/gear.pathogen";\ngear(4);\n';
    const error = await resolveWorkspaceImports(main, {
      files: new Map([...files, ['main.pathogen', main]]),
      entry: 'main.pathogen',
      label: 'Gears',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceLoadError);
    expect((error as Error).message).toBe(
      'Line 1, col 22: import file "./parts/gear.pathogen" was not found (looked for parts/gear.pathogen).',
    );
  });

  it('one in an imported file is named by that file, with the import that led there', async () => {
    const gears = 'module;\nimport { x } from "./missing.pathogen";\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
    const error = (await resolveWorkspaceImports(MAIN, {
      files: new Map([...files, ['parts/gears.pathogen', gears]]),
      entry: 'main.pathogen',
      label: 'Gears',
    }).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe(
      [
        'parts/gears.pathogen line 2, col 19: import file "./missing.pathogen" was not found (looked for parts/missing.pathogen).',
        '  imported from main.pathogen line 1',
      ].join('\n'),
    );
  });

  it("a mistake in an imported file's @font is named by that file, so no line in the program is marked", async () => {
    const lib = 'module;\n@font "serif";\n';
    const result = await resolveFontsForFiles([
      { source: MAIN, label: null },
      { source: lib, label: 'parts/fonts.pathogen' },
    ]);
    expect(result.sourceError).toMatch(/^parts\/fonts\.pathogen line 2, col 1: /);
  });
});

describe("the language services' graph", () => {
  const base = {
    workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS },
    workspaceFolders: [],
    workspaceEntryPoints: ['main.pathogen'],
    openFile: 'main.pathogen',
  };
  const keyOf = (code: string, files = base.workspaceFiles): string =>
    graphKey(workspaceTexts({ ...base, workspaceFiles: files, code }), engine.planImports);

  it("is rebuilt when another file or the open file's imports change, and kept for any other keystroke", () => {
    const start = keyOf(MAIN);
    expect(keyOf(`${MAIN}gear(9);\n`)).toBe(start);
    expect(keyOf(MAIN.replace('gears.pathogen', 'cogs.pathogen'))).not.toBe(start);
    expect(keyOf(MAIN, { ...base.workspaceFiles, 'parts/gears.pathogen': `${GEARS}// edited\n` })).not.toBe(start);
  });
});

describe('autosave', () => {
  const twoFiles = {
    workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS },
    workspaceFolders: [],
    workspaceEntryPoints: ['main.pathogen'],
    openFile: 'main.pathogen',
  };
  const serverHash = async (texts: Record<string, string>, entryPoints: string[]): Promise<string> => {
    const files: Record<string, { sha256: string; size: number }> = {};
    for (const [path, text] of Object.entries(texts)) files[path] = await engine.workspaceFileEntry(text);
    return engine.workspaceContentHash({ files, folders: [], entryPoints });
  };

  beforeEach(() => {
    updateSpy.mockReset();
  });

  it("finds an unedited workspace unchanged by the server's own hash, and sends nothing", async () => {
    store.update({ ...twoFiles, workspaceFiles: { 'main.pathogen': 'M 0 0' }, code: 'M 0 0' });
    autosave.init('ws-1', await serverHash({ 'main.pathogen': 'M 0 0' }, ['main.pathogen']), 2);
    autosave.onChange('M 0 0');
    await autosave.saveNow();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a workspace with several files saves the edited file as text and the others by hash', async () => {
    store.update({ ...twoFiles, code: MAIN });
    const gears = await engine.workspaceFileEntry(GEARS);
    const main = await engine.workspaceFileEntry(MAIN);
    autosave.init('ws-2', await serverHash(twoFiles.workspaceFiles, ['main.pathogen']), 5, {
      'main.pathogen': main.sha256,
      'parts/gears.pathogen': gears.sha256,
    });
    updateSpy.mockResolvedValueOnce({ rev: 6, updatedAt: 'now' });
    autosave.onChange(`${MAIN}gear(6);\n`);
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: { 'main.pathogen': { text: `${MAIN}gear(6);\n` }, 'parts/gears.pathogen': { sha256: gears.sha256 } },
      baseRev: 5,
    });
  });

  it('the page-teardown save sends the open file as text and the others by their saved hash, synchronously', async () => {
    store.update({ ...twoFiles, code: MAIN });
    const gears = await engine.workspaceFileEntry(GEARS);
    autosave.init('ws-3', null, 1, { 'parts/gears.pathogen': gears.sha256 });
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    autosave.onChange('gear(1);');
    // Not awaited: the request must already be out when saveNow returns.
    const sent = autosave.saveNow({ keepalive: true });
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: { 'main.pathogen': { text: 'gear(1);' }, 'parts/gears.pathogen': { sha256: gears.sha256 } },
      baseRev: 1,
    });
    expect(await sent).toBe(true);
  });

  it('records nothing as saved when the save fails, and forgets the edit’s workspace once it is saved', async () => {
    store.update({ ...twoFiles, code: MAIN });
    const gears = await engine.workspaceFileEntry(GEARS);
    autosave.init('ws-4', null, 1, { 'parts/gears.pathogen': gears.sha256 });
    updateSpy.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }));
    autosave.onChange('gear(7);');
    await autosave.saveNow();
    expect(autosave._savedShas.has('main.pathogen')).toBe(false);

    autosave.init('ws-5', null, 1, { 'parts/gears.pathogen': gears.sha256 });
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    autosave.onChange('gear(8);');
    await autosave.saveNow();
    expect(autosave._savedShas.get('main.pathogen')).toBe((await engine.workspaceFileEntry('gear(8);')).sha256);
    expect(autosave._pendingWorkspace).toBeNull();
  });

  it('a save that answers after another workspace loaded leaves the new one alone', async () => {
    store.update({ ...twoFiles, code: MAIN });
    let answer: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    autosave.init('ws-A', null, 1, {});
    autosave.onChange('gear(1);');
    const saving = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    autosave.init('ws-B', 'hash-of-B', 7, { 'main.pathogen': 'b'.repeat(64) });
    answer({ rev: 2, updatedAt: 'now' });
    await saving;
    expect([autosave._baseRev, autosave._lastSavedHash, autosave._savedShas.get('main.pathogen')]).toEqual([
      7,
      'hash-of-B',
      'b'.repeat(64),
    ]);
  });
});

describe('files a load answers without their text', () => {
  it('are listed, so the workspace is not saved without them', () => {
    expect(
      filesWithoutText({
        files: { 'main.pathogen': { text: 'M 0 0' }, 'data/table.csv': {}, 'fonts/a.ttf': {} },
      }),
    ).toEqual(['data/table.csv', 'fonts/a.ttf']);
    expect(filesWithoutText({ code: 'M 0 0' })).toEqual([]);
  });
});
