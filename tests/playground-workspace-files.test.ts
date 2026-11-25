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
  withDeferredTexts,
  workspaceFromAnswer,
  workspaceTexts,
} from '../playground/services/workspace-files.js';
import { graphKey, refreshOpenFileModules } from '../playground/services/workspace-modules.js';
import { store } from '../playground/state/store.js';

// vitest hoists these above the imports.
const { updateSpy, storeSpy } = vi.hoisted(() => ({ updateSpy: vi.fn(), storeSpy: vi.fn() }));
vi.mock('../playground/services/api.js', () => ({ workspaceApi: { update: updateSpy, storeFile: storeSpy } }));

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

  it('a workspace with no files opens no file: never a main.pathogen it doesn’t hold (step 4d)', () => {
    expect(workspaceFromAnswer({ files: {}, folders: ['parts'], entryPoints: [] })).toEqual({
      workspaceFiles: {},
      workspaceFolders: ['parts'],
      workspaceEntryPoints: [],
      openFile: null,
    });
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
      shas: { 'main.pathogen': main.sha256, 'parts/gears.pathogen': gears.sha256 },
      texts: twoFiles.workspaceFiles,
      justMain: false,
    });
    updateSpy.mockResolvedValueOnce({ rev: 6, updatedAt: 'now' });
    autosave.onChange(`${MAIN}gear(6);\n`);
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: { 'main.pathogen': { text: `${MAIN}gear(6);\n` }, 'parts/gears.pathogen': { sha256: gears.sha256 } },
      folders: [],
      entryPoints: ['main.pathogen'],
      baseRev: 5,
    });
  });

  it('the page-teardown save sends the edited file as text and the others by their saved hash, synchronously', async () => {
    store.update({ ...twoFiles, code: MAIN });
    const gears = await engine.workspaceFileEntry(GEARS);
    const saved = { shas: { 'parts/gears.pathogen': gears.sha256 }, texts: { 'parts/gears.pathogen': GEARS } };
    autosave.init('ws-3', null, 1, { ...saved, justMain: false });
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    autosave.onChange('gear(1);');
    // Not awaited: the request must already be out when saveNow returns.
    const sent = autosave.saveNow({ keepalive: true });
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: { 'main.pathogen': { text: 'gear(1);' }, 'parts/gears.pathogen': { sha256: gears.sha256 } },
      folders: [],
      entryPoints: ['main.pathogen'],
      baseRev: 1,
    });
    expect(await sent).toBe(true);
  });

  it('records nothing as saved when the save fails, and forgets the edit’s workspace once it is saved', async () => {
    store.update({ ...twoFiles, code: MAIN });
    const gears = await engine.workspaceFileEntry(GEARS);
    const saved = { shas: { 'parts/gears.pathogen': gears.sha256 }, texts: { 'parts/gears.pathogen': GEARS } };
    autosave.init('ws-4', null, 1, { ...saved, justMain: false });
    updateSpy.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }));
    autosave.onChange('gear(7);');
    await autosave.saveNow();
    expect(autosave._savedShas.has('main.pathogen')).toBe(false);

    autosave.init('ws-5', null, 1, { ...saved, justMain: false });
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    autosave.onChange('gear(8);');
    await autosave.saveNow();
    expect(autosave._savedShas.get('main.pathogen')).toBe((await engine.workspaceFileEntry('gear(8);')).sha256);
    expect(autosave._pendingWorkspace).toBeNull();
  });

  it('a save past the server’s cap stores its largest new texts first, then names them by hash (phase 3a)', async () => {
    const MB = 1024 * 1024;
    // Five data files of 5 MB: 25 MB of text, past the 24 MB a save can send.
    const data: Record<string, string> = {};
    for (const name of ['a', 'b', 'c', 'd', 'e']) data[`data/${name}.json`] = `"${name.repeat(5 * MB - 2)}"`;
    data['data/f.json'] = '"f"'; // a small one stays as text
    const texts = { 'main.pathogen': MAIN, ...data };
    store.update({ ...twoFiles, workspaceFiles: texts, code: MAIN });
    autosave.init('ws-cap', null, 3, { justMain: false });
    storeSpy.mockReset();
    storeSpy.mockImplementation(async (_id: string, text: string) => engine.workspaceFileEntry(text));
    updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });
    autosave.onChange(MAIN);
    await autosave.saveNow();

    // One file stored by itself is enough: 20 MB of text fits.
    const stored = storeSpy.mock.calls as [string, string][];
    expect(stored.map(([id, text]) => [id, text.length])).toEqual([['ws-cap', 5 * MB]]);
    const sent = updateSpy.mock.calls[0][1] as { files: Record<string, { text?: string; sha256?: string }> };
    const byHash = Object.entries(sent.files)
      .filter(([, f]) => f.sha256 !== undefined)
      .map(([path]) => path);
    expect(byHash).toHaveLength(1);
    expect(sent.files['data/f.json']).toEqual({ text: '"f"' });
    // The next save names it by hash without storing it again.
    expect(autosave._savedShas.get(byHash[0])).toBe((await engine.workspaceFileEntry(texts[byHash[0]])).sha256);
  });

  describe('a save that stores a large file first (code review, note 81)', () => {
    const MB = 1024 * 1024;
    const bigWorkspace = (): Record<string, string> => {
      const texts: Record<string, string> = { 'main.pathogen': MAIN };
      for (const name of ['a', 'b', 'c', 'd', 'e']) texts[`data/${name}.json`] = `"${name.repeat(5 * MB - 2)}"`;
      return texts;
    };

    it('keeps the revision it began from, though a page-leave save moved it on meanwhile', async () => {
      store.update({ ...twoFiles, workspaceFiles: bigWorkspace(), code: MAIN });
      autosave.init('ws-race', null, 3, { justMain: false });
      let stored: (entry: { sha256: string; size: number }) => void = () => undefined;
      storeSpy.mockReset();
      storeSpy.mockReturnValueOnce(
        new Promise((resolve) => {
          stored = resolve;
        }),
      );
      updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });
      autosave.onChange(MAIN);
      const saving = autosave.saveNow();
      await vi.waitFor(() => expect(storeSpy).toHaveBeenCalledTimes(1));
      // A page-leave save's answer, while the large file is still being stored.
      autosave._baseRev = 9;
      stored({ sha256: 'f'.repeat(64), size: 5 * MB });
      await saving;
      expect((updateSpy.mock.calls[0][1] as { baseRev: number }).baseRev).toBe(3);
    });

    it('a retry names a file it stored already by hash, without storing it again', async () => {
      store.update({ ...twoFiles, workspaceFiles: bigWorkspace(), code: MAIN });
      autosave.init('ws-retry', null, 3, { justMain: false });
      storeSpy.mockReset();
      storeSpy.mockImplementation(async (_id: string, text: string) => engine.workspaceFileEntry(text));
      updateSpy.mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }));
      autosave.onChange(MAIN);
      await autosave.saveNow();
      expect(storeSpy).toHaveBeenCalledTimes(1);
      updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });
      await autosave.saveNow();
      expect(storeSpy).toHaveBeenCalledTimes(1);
      const files = (updateSpy.mock.calls[1][1] as { files: Record<string, { sha256?: string }> }).files;
      expect(Object.values(files).filter((f) => f.sha256 !== undefined)).toHaveLength(1);
    });
  });

  it('a save past a limit isn’t sent: "Not saved", the reason kept for the panel, until a save fits (phase 3a step 7c)', async () => {
    const MB = 1024 * 1024;
    const tooBig = `"${'x'.repeat(5 * MB + 100)}"`;
    store.update({ ...twoFiles, workspaceFiles: { 'main.pathogen': MAIN, 'data/trips.json': tooBig }, code: MAIN });
    autosave.init('ws-limit', null, 1, { justMain: false });
    updateSpy.mockReset();
    autosave.onChange(MAIN);
    await autosave.saveNow();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(store.get('saveStatus')).toBe('not-saved');
    expect((store.get('saveRefusal') as { file: string }).file).toBe('data/trips.json');
    expect(autosave.hasUnsavedChanges()).toBe(true);
    // The page-leave save doesn't send it either.
    expect(await autosave.saveNow({ keepalive: true })).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();

    // Made smaller: the next change saves, and the refusal goes.
    store.update({ workspaceFiles: { 'main.pathogen': MAIN, 'data/trips.json': '[]' } });
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    autosave.onChange(MAIN);
    await autosave.saveNow();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect([store.get('saveStatus'), store.get('saveRefusal')]).toEqual(['saved', null]);
  });

  it('a refusal stays while typing, goes on an Undo back to what is saved, and goes with the session (code review, note 82)', async () => {
    const MB = 1024 * 1024;
    const saved = { 'main.pathogen': MAIN, 'data/trips.json': '[]' };
    const savedHash = await serverHash(saved, ['main.pathogen']);
    store.update({ ...twoFiles, workspaceFiles: saved, code: MAIN });
    const shas: Record<string, string> = {};
    for (const [path, text] of Object.entries(saved)) shas[path] = (await engine.workspaceFileEntry(text)).sha256;
    autosave.init('ws-undo', savedHash, 1, { justMain: false, shas, texts: saved });
    updateSpy.mockReset();

    store.update({ workspaceFiles: { ...saved, 'data/trips.json': `"${'x'.repeat(5 * MB)}"` } });
    autosave.onChange(MAIN);
    await autosave.saveNow();
    expect(store.get('saveStatus')).toBe('not-saved');
    // Typing again: still "Not saved", as the panel still says why.
    autosave.onChange(MAIN);
    expect(store.get('saveStatus')).toBe('not-saved');
    // Make public's save: false at once, the refusal there to say why.
    expect(await autosave.saveAndSettle('ws-undo')).toBe(false);

    // Undo: back to what the server holds, so nothing to send, and the refusal goes.
    store.update({ workspaceFiles: saved });
    autosave.onChange(MAIN);
    await autosave.saveNow();
    expect(updateSpy).not.toHaveBeenCalled();
    expect([store.get('saveStatus'), store.get('saveRefusal')]).toEqual(['saved', null]);

    // Another session starts clean.
    store.set('saveRefusal', { file: 'data/trips.json', message: 'x' });
    autosave.init('ws-next', null, 1, {});
    expect(store.get('saveRefusal')).toBeNull();
  });

  it('counts UTF-8 bytes as the server does', async () => {
    const { utf8Length } = await import('../playground/utils/format-bytes.js');
    const sample = ['a', 'é', 'あ', String.fromCodePoint(0x1f600)].join('');
    expect(utf8Length(sample)).toBe(new TextEncoder().encode(sample).byteLength);
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
    autosave.init('ws-B', 'hash-of-B', 7, { shas: { 'main.pathogen': 'b'.repeat(64) } });
    answer({ rev: 2, updatedAt: 'now' });
    await saving;
    expect([autosave._baseRev, autosave._lastSavedHash, autosave._savedShas.get('main.pathogen')]).toEqual([
      7,
      'hash-of-B',
      'b'.repeat(64),
    ]);
  });
});

describe('import-path completion (the editor bridge)', () => {
  /** CodeMirror's CompletionContext, as much as the bridge reads, with the cursor at the end. */
  const contextFor = (source: string, explicit = false) => ({
    state: { doc: { toString: () => source } },
    pos: source.length,
    explicit,
    matchBefore(regexp: RegExp) {
      const match = new RegExp(`(?:${regexp.source})$`).exec(source);
      return match ? { from: source.length - match[0].length, to: source.length, text: match[0] } : null;
    },
  });

  beforeEach(async () => {
    store.update({
      workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS, 'parts/cogs.pathogen': 'module;\n' },
      workspaceFolders: [],
      workspaceEntryPoints: ['main.pathogen'],
      openFile: 'main.pathogen',
      code: MAIN,
    });
    await refreshOpenFileModules();
  });

  it("lists the workspace's libraries inside an import's quotes, replacing the whole typed path", async () => {
    const { sharedCompletionSource } = await import('../playground/utils/cm-completion-bridge.js');
    const source = 'import { gear } from "./pa';
    const result = sharedCompletionSource(contextFor(source))!;
    expect(result.from).toBe(source.indexOf('./pa'));
    expect(result.options.map((o) => [o.label, o.type]).sort()).toEqual([
      ['./parts/cogs.pathogen', 'namespace'],
      ['./parts/gears.pathogen', 'namespace'],
    ]);
    // Typing on keeps the list: slashes and dots are part of a path.
    expect(result.validFor!.test('./parts/ge')).toBe(true);
  });

  it('opens with nothing typed yet, right after the opening quote', async () => {
    const { sharedCompletionSource } = await import('../playground/utils/cm-completion-bridge.js');
    const source = 'import { gear } from "';
    const result = sharedCompletionSource(contextFor(source))!;
    expect(result.from).toBe(source.length);
    const labels = result.options.map((o) => o.label).sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(['./parts/cogs.pathogen', './parts/gears.pathogen']);
  });

  describe('with a data file (phase 3a step 6, docs/data-import.md "In the editor")', () => {
    const CITIES = '[{ "name": "Lyon", "Population (2020)": 522000 }]';
    const USES = 'import cities from "./data/cities.json";\nlet city = cities[0];\n';

    beforeEach(async () => {
      store.update({
        workspaceFiles: { 'main.pathogen': USES, 'data/cities.json': CITIES, 'parts/gears.pathogen': GEARS },
        openFile: 'main.pathogen',
        code: USES,
      });
      await refreshOpenFileModules();
    });

    it('a name alone is offered the data files; braces the modules', async () => {
      const { sharedCompletionSource } = await import('../playground/utils/cm-completion-bridge.js');
      const labels = (source: string): string[] =>
        sharedCompletionSource(contextFor(source))!.options.map((o) => o.label);
      expect(labels('import cities from "./')).toEqual(['./data/cities.json']);
      expect(labels('import { gear } from "./')).toEqual(['./parts/gears.pathogen']);
    });

    it('keys complete after the dot; one that can’t follow a dot goes in brackets in its place', async () => {
      const { sharedCompletionSource } = await import('../playground/utils/cm-completion-bridge.js');
      const source = `${USES}city.`;
      store.update({ workspaceFiles: { ...(store.get('workspaceFiles') as object), 'main.pathogen': source } });
      const result = sharedCompletionSource(contextFor(source))!;
      // Filtered by the key's name, typed after the dot.
      expect(result.from).toBe(source.length);
      const byLabel = new Map(result.options.map((o) => [o.label, o]));
      expect(byLabel.get('name')?.apply).toBeUndefined();
      const bracketed = byLabel.get('Population (2020)');
      const dispatched: { changes: { from: number; to: number; insert: string }; selection: { anchor: number } }[] = [];
      const view = { dispatch: (tr: (typeof dispatched)[number]) => dispatched.push(tr) };
      bracketed!.apply!(view, null, result.from, source.length);
      const dot = source.length - 1;
      const insert = '["Population (2020)"]';
      expect(dispatched).toEqual([
        { changes: { from: dot, to: source.length, insert }, selection: { anchor: dot + insert.length } },
      ]);
    });
  });

  it('knows when the cursor is inside an import path, and only then', async () => {
    const { importPathBeforeCursor } = await import('../playground/utils/cm-completion-bridge.js');
    expect(importPathBeforeCursor('import { gear } from "./parts/')).toBe('./parts/');
    expect(importPathBeforeCursor("import { gear } from '")).toBe('');
    expect(importPathBeforeCursor('let label = "from here')).toBeNull();
    expect(importPathBeforeCursor('import { gear } from "./parts/gears.pathogen";')).toBeNull();
  });
});

describe('a data file is never the program shown or the file opened first (phase 3a step 6)', () => {
  const texts = { 'data/dots.json': '[1]', 'parts/gears.pathogen': GEARS };

  it('with no main, the preview takes a .pathogen file, even with the data file open', () => {
    const workspace = workspaceTexts({
      workspaceFiles: texts,
      workspaceFolders: [],
      workspaceEntryPoints: [],
      openFile: 'data/dots.json',
      code: '[1]',
    });
    expect(programToShow(workspace, null)).toBe('parts/gears.pathogen');
    expect(programToShow({ ...workspace, texts: new Map([['data/dots.json', '[1]']]) }, null)).toBe('main.pathogen');
  });

  it('a load opens a .pathogen file first, and a data file only when that is all there is', () => {
    expect(workspaceFromAnswer({ files: { 'a.json': { text: '1' }, 'z.pathogen': { text: GEARS } } }).openFile).toBe(
      'z.pathogen',
    );
    expect(workspaceFromAnswer({ files: { 'a.json': { text: '1' } } }).openFile).toBe('a.json');
  });
});

describe('data files a load sends by hash (phase 3a step 6)', () => {
  const DOTS = '[{ "x": 1 }]';
  const answer = {
    files: {
      'main.pathogen': { sha256: 'm', size: 5, text: 'M 0 0' },
      'data/a.json': { sha256: 'd', size: DOTS.length, deferred: true },
      'data/b.json': { sha256: 'd', size: DOTS.length, deferred: true },
    },
    entryPoints: ['main.pathogen'],
  };

  it('are read by their hash, once per text, and the store gets their text', async () => {
    const read = vi.fn(async () => DOTS);
    const whole = await withDeferredTexts(answer, read);
    expect(read.mock.calls).toEqual([['d']]);
    expect(filesWithoutText(whole)).toEqual([]);
    expect(workspaceFromAnswer(whole).workspaceFiles).toEqual({
      'main.pathogen': 'M 0 0',
      'data/a.json': DOTS,
      'data/b.json': DOTS,
    });
  });

  it('one that can’t be read fails the load, naming it, with no request status', async () => {
    const lost = Object.assign(new Error('File not found'), { status: 404 });
    const failed = withDeferredTexts(answer, async () => Promise.reject(lost));
    await expect(failed).rejects.toThrow("Couldn't read data/a.json (File not found). Reload the page to try again.");
    await expect(failed).rejects.not.toHaveProperty('status');
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
