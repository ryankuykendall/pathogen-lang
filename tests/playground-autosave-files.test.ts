// @vitest-environment jsdom
//
// Autosave with several files open (phase 2d, step 3;
// project-docs/modules/52-phase-2d-plan.md). Once tabs let you edit more than
// one file between saves, every save, the page-teardown one included, has to
// carry every file edited since the last save; an edit made while a save is
// out, or after one failed, must not be lost or overwritten by an older text;
// and the save's shape (`code` or `files`) follows what the server holds. The
// real engine sits on window.PathogenLang for the server's own hash rule.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { autosave } from '../playground/services/autosave.js';
import { store } from '../playground/state/store.js';

// vitest hoists these above the imports.
const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));
vi.mock('../playground/services/api.js', () => ({ workspaceApi: { update: updateSpy } }));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const KIT = 'module;\nexport const teeth = 12;\n';
const FILES = { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS, 'parts/kit.pathogen': KIT };
const FOLDERS = ['spare'];
const ENTRY = ['main.pathogen'];

const loadEngine = async () => import('../src');
let engine: Awaited<ReturnType<typeof loadEngine>>;
beforeAll(async () => {
  engine = await loadEngine();
  (window as unknown as { PathogenLang: unknown }).PathogenLang = engine;
});

const shaOf = async (text: string): Promise<string> => (await engine.workspaceFileEntry(text)).sha256;

/** The server's content hash for a workspace (src/workspace/files.ts). */
async function serverHash(files: Record<string, string>, folders: string[], entryPoints: string[]): Promise<string> {
  const entries: Record<string, { sha256: string; size: number }> = {};
  for (const [path, text] of Object.entries(files)) entries[path] = await engine.workspaceFileEntry(text);
  return engine.workspaceContentHash({ files: entries, folders, entryPoints });
}

/** A workspace as the server answered it, armed as workspace-view does for its owner. */
async function load(
  id: string,
  files: Record<string, string> = FILES,
  { folders = FOLDERS, entryPoints = ENTRY, rev = 1 } = {},
): Promise<void> {
  store.update({
    workspaceFiles: files,
    workspaceFolders: folders,
    workspaceEntryPoints: entryPoints,
    openFile: 'main.pathogen',
    code: files['main.pathogen'] ?? '',
  });
  const shas: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) shas[path] = await shaOf(text);
  const justMain =
    Object.keys(files).length === 1 && 'main.pathogen' in files && folders.length === 0 && entryPoints.length === 1;
  autosave.init(id, await serverHash(files, folders, entryPoints), rev, { shas, texts: files, justMain });
}

/** Typing in the open file: the editor writes `code`, then workspace-view tells autosave. */
function type(text: string): void {
  store.set('code', text);
  autosave.onChange();
}

/** A tab switch: the outgoing file's text goes into workspaceFiles, the incoming one's into `code`. */
function switchTo(path: string): void {
  const files = store.get('workspaceFiles') as Record<string, string>;
  store.update({
    workspaceFiles: { ...files, [store.get('openFile') as string]: store.get('code') as string },
    openFile: path,
    code: files[path],
  });
}

const MAIN_EDITED = `${MAIN}gear(6);\n`;
const GEARS_EDITED = `${GEARS}// twelve teeth\n`;

/** Edit main, open gears, edit gears: two files changed since the last save. */
function editTwoFiles(): void {
  type(MAIN_EDITED);
  switchTo('parts/gears.pathogen');
  type(GEARS_EDITED);
}

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  updateSpy.mockReset();
});

afterEach(() => {
  autosave.stop();
  vi.useRealTimers();
});

describe('autosave with several files edited', () => {
  it('a save sends every file edited since the last one as text, the rest by hash, with the folders and the program list', async () => {
    await load('ws-1');
    editTwoFiles();
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBe('ws-1');
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: {
        'main.pathogen': { text: MAIN_EDITED },
        'parts/gears.pathogen': { text: GEARS_EDITED },
        'parts/kit.pathogen': { sha256: await shaOf(KIT) },
      },
      folders: FOLDERS,
      entryPoints: ENTRY,
      baseRev: 1,
    });
  });

  it('the page-teardown save sends every edited file as text, not only the open one, before saveNow returns', async () => {
    await load('ws-2');
    editTwoFiles();
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    // Not awaited: a teardown save must already be out when saveNow returns.
    const sent = autosave.saveNow({ keepalive: true });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: {
        'main.pathogen': { text: MAIN_EDITED },
        'parts/gears.pathogen': { text: GEARS_EDITED },
        'parts/kit.pathogen': { sha256: await shaOf(KIT) },
      },
      folders: FOLDERS,
      entryPoints: ENTRY,
      baseRev: 1,
    });
    expect(updateSpy.mock.calls[0][2]).toEqual({ keepalive: true });
    expect(await sent).toBe(true);
  });

  it('after a save nothing more is sent until something changes, and a tab switch changes nothing', async () => {
    await load('ws-3');
    editTwoFiles();
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.saveNow();
    updateSpy.mockClear();

    await autosave.saveNow();
    switchTo('main.pathogen');
    await autosave.saveNow();
    await expect(autosave.saveNow({ keepalive: true })).resolves.toBe(true);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(autosave.hasUnsavedChanges()).toBe(false);

    // The next edit goes as text, and the files saved last time by their new hash.
    type(`${MAIN_EDITED}gear(8);\n`);
    updateSpy.mockResolvedValueOnce({ rev: 3, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: {
        'main.pathogen': { text: `${MAIN_EDITED}gear(8);\n` },
        'parts/gears.pathogen': { sha256: await shaOf(GEARS_EDITED) },
        'parts/kit.pathogen': { sha256: await shaOf(KIT) },
      },
      folders: FOLDERS,
      entryPoints: ENTRY,
      baseRev: 2,
    });
  });

  it('after a page-teardown save the page survives, its files count as saved', async () => {
    await load('ws-4');
    editTwoFiles();
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    await autosave.saveNow({ keepalive: true });
    await vi.waitFor(() => expect(autosave.hasUnsavedChanges()).toBe(false));
    await flushPromises();
    updateSpy.mockClear();

    await autosave.saveNow({ keepalive: true });
    await autosave.saveNow();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a workspace switch saves all of the old workspace’s edited files, to the old workspace', async () => {
    await load('ws-A');
    editTwoFiles();
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    const flushing = autosave.flush();
    // The next workspace's load replaces the store before the save answers.
    store.update({
      workspaceFiles: { 'main.pathogen': 'M 0 0' },
      workspaceFolders: [],
      workspaceEntryPoints: ENTRY,
      openFile: 'main.pathogen',
      code: 'M 0 0',
    });
    await flushing;
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, body] = updateSpy.mock.calls[0];
    expect(id).toBe('ws-A');
    expect((body as { files: Record<string, unknown> }).files).toEqual({
      'main.pathogen': { text: MAIN_EDITED },
      'parts/gears.pathogen': { text: GEARS_EDITED },
      'parts/kit.pathogen': { sha256: await shaOf(KIT) },
    });
  });
});

describe('edits that arrive around a save', () => {
  it('an edit typed while a save is out is saved by the next debounced save', async () => {
    await load('ws-5');
    type(MAIN_EDITED);
    let answer: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const saving = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));

    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    answer({ rev: 2, updatedAt: 'now' });
    await saving;
    expect(autosave.hasUnsavedChanges()).toBe(true);

    // What the debounce timer runs, once the minimum interval has passed.
    updateSpy.mockResolvedValueOnce({ rev: 3, updatedAt: 'now' });
    autosave._lastSaveTime = 0;
    await autosave._attemptSave();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    const body = updateSpy.mock.calls[1][1] as { files: Record<string, unknown>; baseRev: number };
    expect([body.files['main.pathogen'], body.baseRev]).toEqual([{ text: newer }, 2]);
  });

  it('after a failed save, the retry never sends the failed text over a newer edit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await load('ws-6');
    type(MAIN_EDITED);
    let fail: (reason: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    const saving = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));

    // Typed while the save that fails is out.
    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    fail(new Error('network down'));
    await saving;

    updateSpy.mockResolvedValue({ rev: 2, updatedAt: 'now' });
    // The retry, after the minimum interval. Hashing isn't a timer, so wait for its save.
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(autosave.hasUnsavedChanges()).toBe(false));
    // Nothing else is still scheduled to send the text that failed.
    await vi.advanceTimersByTimeAsync(120_000);
    await flushPromises();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    const retried = updateSpy.mock.calls[1][1] as { files: Record<string, unknown> };
    expect(retried.files['main.pathogen']).toEqual({ text: newer });
  });

  it('a save still hashing when another workspace loads is not sent at all', async () => {
    await load('ws-9');
    type(MAIN_EDITED);
    autosave._lastSaveTime = 0;
    const attempt = autosave._attemptSave();
    // Synchronously, before the hash resolves: the next workspace is armed.
    autosave.init('ws-10', null, 4, { shas: {}, texts: {}, justMain: false });
    await attempt;
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// Two of our own saves out together, from the same revision, 409 each other,
// and a 409 reads as another tab: the banner, and no more saving. Each tab
// click blurs the editor and saves, so two quick clicks after an edit did it.
describe('one save out at a time', () => {
  const rejected409 = (): Error => Object.assign(new Error('conflict'), { status: 409, data: { conflict: true } });
  const mainOf = (call: unknown[]): unknown => (call[1] as { files: Record<string, unknown> }).files['main.pathogen'];
  const later = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
  };

  it('two saves asked for together go out one after the other, each from the revision before it', async () => {
    await load('ws-11');
    type(MAIN_EDITED);
    let answerFirst: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      }),
    );
    const first = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    updateSpy.mockResolvedValueOnce({ rev: 3, updatedAt: 'now' });
    const second = autosave.saveNow();
    await later();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    answerFirst({ rev: 2, updatedAt: 'now' });
    await Promise.all([first, second]);
    expect(updateSpy.mock.calls.map((call) => (call[1] as { baseRev: number }).baseRev)).toEqual([1, 2]);
    expect(mainOf(updateSpy.mock.calls[1])).toEqual({ text: newer });
    expect([autosave._conflicted, autosave.hasUnsavedChanges()]).toEqual([false, false]);
  });

  it('a teardown save while a save is still hashing takes over: one request goes out, the teardown one', async () => {
    await load('ws-12');
    type(MAIN_EDITED);
    updateSpy.mockResolvedValue({ rev: 2, updatedAt: 'now' });
    const blurSave = autosave.saveNow();
    await autosave.saveNow({ keepalive: true });
    await blurSave;
    await vi.waitFor(() => expect(autosave.hasUnsavedChanges()).toBe(false));
    await later();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][2]).toEqual({ keepalive: true });
  });

  it('a teardown save while a save carrying the latest edit is out sends nothing more', async () => {
    await load('ws-13');
    type(MAIN_EDITED);
    let answer: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const saving = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    await autosave.saveNow({ keepalive: true });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    answer({ rev: 2, updatedAt: 'now' });
    await saving;
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('a teardown save with a newer edit, crossing an older save: if it lands first, the other’s 409 is no conflict', async () => {
    await load('ws-14');
    type(MAIN_EDITED);
    let failOlder: (reason: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        failOlder = reject;
      }),
    );
    const older = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    await autosave.saveNow({ keepalive: true });
    expect(mainOf(updateSpy.mock.calls[1])).toEqual({ text: newer });
    await vi.waitFor(() => expect(autosave.hasUnsavedChanges()).toBe(false));

    failOlder(rejected409());
    await older;
    expect(autosave._conflicted).toBe(false);
    expect(autosave.hasUnsavedChanges()).toBe(false);
    // The older text isn't sent again over the newer one.
    await autosave.saveNow();
    await later();
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  it('… and if the older save lands first, the teardown save’s 409 is no conflict, and the newer text saves next', async () => {
    await load('ws-15');
    type(MAIN_EDITED);
    let answerOlder: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answerOlder = resolve;
      }),
    );
    const older = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    let failTeardown: (reason: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        failTeardown = reject;
      }),
    );
    await autosave.saveNow({ keepalive: true });

    answerOlder({ rev: 2, updatedAt: 'now' });
    await older;
    failTeardown(rejected409());
    await later();
    expect([autosave._conflicted, autosave.hasUnsavedChanges()]).toEqual([false, true]);

    updateSpy.mockResolvedValueOnce({ rev: 3, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy).toHaveBeenCalledTimes(3);
    expect(mainOf(updateSpy.mock.calls[2])).toEqual({ text: newer });
    expect((updateSpy.mock.calls[2][1] as { baseRev: number }).baseRev).toBe(2);
  });

  it('saves queued behind a slow one never send an older text over a newer one they saved', async () => {
    await load('ws-18');
    type(MAIN_EDITED);
    let answerSlow: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answerSlow = resolve;
      }),
    );
    const slow = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    // Two tab clicks queue two saves, with an edit before each and one after.
    type(`${MAIN_EDITED}// w1\n`);
    const click1 = autosave.saveNow();
    type(`${MAIN_EDITED}// w2\n`);
    const click2 = autosave.saveNow();
    const newest = `${MAIN_EDITED}// w3\n`;
    type(newest);
    updateSpy.mockResolvedValue({ rev: 9, updatedAt: 'now' });
    answerSlow({ rev: 2, updatedAt: 'now' });
    await Promise.all([slow, click1, click2]);
    const sentMains = updateSpy.mock.calls.slice(1).map(mainOf);
    expect(sentMains).toEqual([{ text: newest }]);
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('a save that had to go while another of ours was still out: its 409 is retried, not a conflict', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await load('ws-19');
    type(MAIN_EDITED);
    // A request that never answers.
    updateSpy.mockReturnValueOnce(
      new Promise<never>(() => {
        // never settles
      }),
    );
    autosave.saveNow().catch(() => undefined);
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const newer = `${MAIN_EDITED}gear(9);\n`;
    type(newer);
    updateSpy.mockRejectedValueOnce(rejected409());
    const second = autosave.saveNow();
    // The wait for the first ends after 20 s; the second goes, crossing it.
    await vi.advanceTimersByTimeAsync(21_000);
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
    await second;
    expect([autosave._conflicted, autosave.hasUnsavedChanges()]).toEqual([false, true]);
  });

  it('the answer of a request from before a re-open of the same workspace leaves the new session alone', async () => {
    await load('ws-20');
    type(MAIN_EDITED);
    let answerOld: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answerOld = resolve;
      }),
    );
    const old = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    // Left and opened again: the same id, at the revision a fresh load gave.
    autosave.init('ws-20', 'hash-now', 7, { shas: {}, texts: {}, justMain: false });
    answerOld({ rev: 2, updatedAt: 'now' });
    await old;
    expect([autosave._baseRev, autosave._lastSavedHash]).toEqual([7, 'hash-now']);
  });

  it('a workspace switch that a teardown save overtook, and that teardown save failed: the edit is saved before letting go', async () => {
    await load('ws-22');
    type(MAIN_EDITED);
    let failTeardown: (reason: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        failTeardown = reject;
      }),
    );
    // The switch's save is asked for first (and is hashing) when the tab hides.
    const flushing = autosave.flush();
    await autosave.saveNow({ keepalive: true });
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    failTeardown(new Error('network down'));
    await flushing;
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.mock.calls[0][2]).toEqual({ keepalive: true });
    expect(mainOf(updateSpy.mock.calls[1])).toEqual({ text: MAIN_EDITED });
  });

  it('a workspace switch whose teardown save failed saves the edit before letting go', async () => {
    await load('ws-21');
    type(MAIN_EDITED);
    let failTeardown: (reason: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        failTeardown = reject;
      }),
    );
    await autosave.saveNow({ keepalive: true });
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    const flushing = autosave.flush();
    failTeardown(new Error('network down'));
    await flushing;
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(mainOf(updateSpy.mock.calls[1])).toEqual({ text: MAIN_EDITED });
  });

  it('a teardown save over the browsers’ 64 KB keepalive cap goes as a plain request', async () => {
    await load('ws-17');
    type(`${MAIN}// ${'x'.repeat(70_000)}\n`);
    updateSpy.mockResolvedValueOnce({ rev: 2 });
    await autosave.saveNow({ keepalive: true });
    expect(updateSpy.mock.calls[0][2]).toEqual({ keepalive: false });
  });

  it('a real conflict behind a crossing still shows: the retry alone gets the 409 too', async () => {
    await load('ws-23');
    type(MAIN_EDITED);
    let answerOlder: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        answerOlder = resolve;
      }),
    );
    const older = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    type(`${MAIN_EDITED}gear(9);\n`);
    updateSpy.mockRejectedValueOnce(rejected409());
    await autosave.saveNow({ keepalive: true });
    answerOlder({ rev: 2, updatedAt: 'now' });
    await older;
    await later();
    expect(autosave._conflicted).toBe(false);
    // Another tab saved meanwhile: the retry, alone, is refused as well.
    updateSpy.mockRejectedValueOnce(rejected409());
    await autosave.saveNow();
    expect(autosave._conflicted).toBe(true);
  });

  it('a 409 with no save of ours crossing it is still a conflict', async () => {
    await load('ws-16');
    type(MAIN_EDITED);
    updateSpy.mockRejectedValueOnce(rejected409());
    await autosave.saveNow();
    expect(autosave._conflicted).toBe(true);
  });
});

describe("a save's shape follows what the server holds", () => {
  it('a workspace that is just main.pathogen, on the server and here, saves `code`', async () => {
    await load('ws-7', { 'main.pathogen': 'M 0 0' }, { folders: [] });
    type('M 1 1');
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({ code: 'M 1 1', baseRev: 1 });
  });

  it('one whose server copy holds several files saves `files`, even once only main.pathogen is left', async () => {
    // The server's 409 for `code` over several files would read as a conflict
    // with another tab (website/api/workspace-store.ts).
    await load('ws-8', { 'main.pathogen': 'M 0 0', 'b.pathogen': 'M 2 2' }, { folders: [] });
    store.update({ workspaceFiles: { 'main.pathogen': 'M 0 0' } });
    type('M 1 1');
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({
      files: { 'main.pathogen': { text: 'M 1 1' } },
      folders: [],
      entryPoints: ENTRY,
      baseRev: 1,
    });

    // The server now holds just main.pathogen, so the next save is `code`.
    type('M 3 3');
    updateSpy.mockResolvedValueOnce({ rev: 3, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy.mock.calls[1][1]).toEqual({ code: 'M 3 3', baseRev: 2 });
  });
});

// 2e, step 3 (note 58): a snapshot sends every file as the preview drew it, the
// way a save does: each file the server holds by its hash, every other as text.
describe('filesBody: the files a snapshot sends', () => {
  const drawn = (texts: Record<string, string>) => ({
    texts: new Map(Object.entries(texts)),
    folders: FOLDERS,
    entryPoints: ENTRY,
    openFile: 'main.pathogen',
  });

  it('sends each file the server holds by its hash, an edit not saved yet as text, with the folders and the program list', async () => {
    await load('ws-30');
    expect(autosave.filesBody(drawn({ ...FILES, 'parts/gears.pathogen': GEARS_EDITED }), 'ws-30')).toEqual({
      files: {
        'main.pathogen': { sha256: await shaOf(MAIN) },
        'parts/gears.pathogen': { text: GEARS_EDITED },
        'parts/kit.pathogen': { sha256: await shaOf(KIT) },
      },
      folders: FOLDERS,
      entryPoints: ENTRY,
    });
  });

  it('a file added since the load goes as text', async () => {
    await load('ws-31');
    const body = autosave.filesBody(drawn({ ...FILES, 'parts/new.pathogen': 'module;\n' }), 'ws-31');
    expect(body.files['parts/new.pathogen']).toEqual({ text: 'module;\n' });
  });

  it('sends every file as text for a workspace this autosave doesn’t hold, or once it has stopped', async () => {
    // Its hashes are checked against that workspace's own files, which this one doesn't know.
    await load('ws-32');
    const allText = {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'parts/kit.pathogen': { text: KIT },
    };
    expect(autosave.filesBody(drawn(FILES), 'ws-other').files).toEqual(allText);
    expect([autosave.holds('ws-32'), autosave.holds('ws-other'), autosave.holds(null)]).toEqual([true, false, false]);
    autosave.stop();
    expect(autosave.filesBody(drawn(FILES), 'ws-32').files).toEqual(allText);
    expect(autosave.holds('ws-32')).toBe(false);
  });

  it('a save sends the same body: one rule for both', async () => {
    await load('ws-33');
    editTwoFiles();
    const expected = autosave.filesBody(
      drawn({ ...FILES, 'main.pathogen': MAIN_EDITED, 'parts/gears.pathogen': GEARS_EDITED }),
      'ws-33',
    );
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.saveNow();
    expect(updateSpy.mock.calls[0][1]).toEqual({ ...expected, baseRev: 1 });
  });
});
