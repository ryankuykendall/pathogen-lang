// @vitest-environment jsdom
//
// Making a planned change to the workspace the playground holds (2d, step 4b;
// playground/services/workspace-apply.ts). The plans are step 2's
// (workspace-edits.ts); this is where one lands in the store: every file, the
// folders and the program list together, the open file's typed text kept, and
// a plan made for another workspace changing nothing.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyToWorkspace, workspaceState } from '../playground/services/workspace-apply.js';
import {
  planDelete,
  planDuplicate,
  planNewFile,
  planNewFolder,
  planSetMain,
  PROJECT_FILE,
} from '../playground/services/workspace-edits.js';
import { programToShow, shownProgramText, workspaceNow } from '../playground/services/workspace-files.js';
import { store } from '../playground/state/store.js';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(10);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const NEW_LIBRARY = 'module;\n\n// A library. Export fns, consts and enums here;\n// other files import them.\n';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

beforeEach(() => {
  store.update({
    workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS },
    workspaceFolders: [],
    workspaceEntryPoints: ['main.pathogen'],
    openFile: 'main.pathogen',
    openFiles: ['main.pathogen'],
    // Typed since the last tab switch: newer than workspaceFiles' copy.
    code: `${MAIN}gear(20);\n`,
    shownProgram: null,
  });
});

function planned(plan: ReturnType<typeof planNewFile>) {
  if (!plan.ok) throw new Error(plan.message);
  return plan.change;
}

describe('applying a change to the workspace', () => {
  it('reads the workspace as it stands, the open file’s typed text included, never pathogen.json', () => {
    expect(workspaceState().files['main.pathogen']).toBe(`${MAIN}gear(20);\n`);
    store.update({ openFile: PROJECT_FILE, code: '{}\n' });
    expect(Object.keys(workspaceState().files).sort()).toEqual(['main.pathogen', 'parts/gears.pathogen']);
  });

  it('a new library joins the files; the open file keeps its typed text; the programs stay', () => {
    const result = applyToWorkspace(planned(planNewFile(workspaceState(), 'parts', 'ratchet', 'library')));
    expect(result.ok).toBe(true);
    expect(store.get('workspaceFiles')).toEqual({
      'main.pathogen': `${MAIN}gear(20);\n`,
      'parts/gears.pathogen': GEARS,
      'parts/ratchet.pathogen': NEW_LIBRARY,
    });
    expect(Object.fromEntries(workspaceNow().texts)['main.pathogen']).toBe(`${MAIN}gear(20);\n`);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([['main.pathogen'], null]);
  });

  it('a new program goes at the end of the program list, and the preview stays', () => {
    applyToWorkspace(planned(planNewFile(workspaceState(), '', 'poster', 'program')));
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([
      ['main.pathogen', 'poster.pathogen'],
      null,
    ]);
  });

  it('in a workspace with no programs, the new program is the main and is shown', () => {
    store.update({
      workspaceFiles: { 'parts/gears.pathogen': GEARS },
      workspaceEntryPoints: [],
      openFile: 'parts/gears.pathogen',
      code: GEARS,
    });
    const change = planned(planNewFile(workspaceState(), '', 'poster', 'program'));
    expect(change.show).toBe('poster.pathogen');
    applyToWorkspace(change);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([
      ['poster.pathogen'],
      'poster.pathogen',
    ]);
  });

  it('a new folder is kept, empty', () => {
    const plan = planNewFolder(workspaceState(), '', 'examples');
    applyToWorkspace(planned(plan));
    expect(store.get('workspaceFolders')).toEqual(['examples']);
  });

  it('a duplicate of a program joins the end of the list, and doesn’t open', () => {
    store.update({ workspaceFiles: { ...(store.get('workspaceFiles') as object), 'try.pathogen': 'M 5 5' } });
    const plan = planDuplicate(workspaceState(), 'main.pathogen');
    applyToWorkspace(planned(plan));
    expect([plan.ok && plan.change.open, store.get('workspaceEntryPoints')]).toEqual([
      undefined,
      ['main.pathogen', 'main-2.pathogen'],
    ]);
  });

  it('a change planned for another workspace changes nothing, and says why', () => {
    const change = planned(planNewFile(workspaceState(), 'parts', 'ratchet', 'library'));
    expect(applyToWorkspace(change).ok).toBe(true);
    const before = store.get('workspaceFiles');
    expect(applyToWorkspace(change)).toEqual({
      ok: false,
      message: 'parts/ratchet.pathogen is already in the workspace.',
    });
    expect(store.get('workspaceFiles')).toBe(before);
  });
});

/** A stand-in for the editor: one kept text per file, as CodeMirror keeps one state per file. */
class FakeEditor {
  kept = new Map<string, string>();

  shown = 'main.pathogen';

  /** Each file shown, and whether its kept state (its undo history) came back. */
  log: { path: string; fromKept: boolean }[] = [];

  forgotten: string[] = [];

  refreshed: string[] = [];

  showFile = (path: string): void => {
    this.kept.set(this.shown, store.get('code') as string);
    this.log.push({ path, fromKept: this.kept.has(path) });
    this.kept.delete(path);
    this.shown = path;
  };

  forgetFiles = (paths: string[]): void => {
    for (const path of paths) this.kept.delete(path);
    this.forgotten.push(...paths);
  };

  refreshShown = (text: string): void => {
    this.refreshed.push(text);
  };
}

// 4c-1: what a change does to the files open in the editor, and to the preview.
describe('a change and the editor', () => {
  const KIT = 'module;\nexport const k = 2;\n';
  let editor: FakeEditor;

  beforeEach(() => {
    store.update({
      workspaceFiles: {
        'main.pathogen': MAIN,
        'parts/gears.pathogen': GEARS,
        'parts/kit.pathogen': KIT,
        'try.pathogen': 'M 5 5',
      },
      workspaceEntryPoints: ['main.pathogen', 'try.pathogen'],
      openFile: 'parts/gears.pathogen',
      openFiles: ['main.pathogen', 'parts/gears.pathogen', 'parts/kit.pathogen'],
      code: GEARS,
      shownProgram: null,
    });
    editor = new FakeEditor();
    editor.shown = 'parts/gears.pathogen';
  });

  it('deleting the open file shows the tab to its right, never writes it back, and forgets its state', () => {
    const result = applyToWorkspace(planned(planDelete(workspaceState(), 'parts/gears.pathogen')), editor);
    expect(result.ok && result.removed).toEqual(['parts/gears.pathogen']);
    expect([store.get('openFile'), store.get('openFiles'), store.get('code')]).toEqual([
      'parts/kit.pathogen',
      ['main.pathogen', 'parts/kit.pathogen'],
      KIT,
    ]);
    expect(Object.keys(store.get('workspaceFiles') as object).sort()).toEqual([
      'main.pathogen',
      'parts/kit.pathogen',
      'try.pathogen',
    ]);
    expect([...workspaceNow().texts.keys()].includes('parts/gears.pathogen')).toBe(false);
    expect([editor.forgotten, editor.kept.has('parts/gears.pathogen')]).toEqual([['parts/gears.pathogen'], false]);
  });

  it('a new file where a deleted one was starts without the old one’s undo history', async () => {
    const { openFile } = await import('../playground/services/open-files.js');
    applyToWorkspace(planned(planDelete(workspaceState(), 'parts/gears.pathogen')), editor);
    applyToWorkspace(planned(planNewFile(workspaceState(), 'parts', 'gears', 'library')), editor);
    openFile(editor, 'parts/gears.pathogen');
    expect(editor.log.at(-1)).toEqual({ path: 'parts/gears.pathogen', fromKept: false });
  });

  it('a folder deleted takes every tab in it; the editor shows a tab that’s left', () => {
    store.update({ openFile: 'parts/kit.pathogen', code: KIT });
    editor.shown = 'parts/kit.pathogen';
    applyToWorkspace(planned(planDelete(workspaceState(), 'parts')), editor);
    expect([store.get('openFile'), store.get('openFiles')]).toEqual(['main.pathogen', ['main.pathogen']]);
    expect(editor.forgotten.sort()).toEqual(['parts/gears.pathogen', 'parts/kit.pathogen']);
  });

  it('with no tab left, the editor shows the main; with no file left, pathogen.json (until step 4d)', () => {
    store.update({ openFiles: ['parts/gears.pathogen'] });
    applyToWorkspace(planned(planDelete(workspaceState(), 'parts')), editor);
    expect([store.get('openFile'), store.get('openFiles')]).toEqual(['main.pathogen', ['main.pathogen']]);
    applyToWorkspace(planned(planDelete(workspaceState(), 'try.pathogen')), editor);
    applyToWorkspace(planned(planDelete(workspaceState(), 'main.pathogen')), editor);
    expect([store.get('openFile'), store.get('openFiles'), store.get('code')]).toEqual([
      PROJECT_FILE,
      [PROJECT_FILE],
      '{}\n',
    ]);
    // Nothing left to draw: the preview compiles nothing, never the JSON.
    expect(shownProgramText()).toBe('');
  });

  it('Set as main leaves the preview on the program it shows', () => {
    applyToWorkspace(planned(planSetMain(workspaceState(), 'try.pathogen')), editor);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([
      ['try.pathogen', 'main.pathogen'],
      'main.pathogen',
    ]);
    expect(programToShow(workspaceNow(), store.get('shownProgram') as string)).toBe('main.pathogen');
  });

  it('the program shown deleted: the preview goes back to the main', () => {
    store.set('shownProgram', 'try.pathogen');
    applyToWorkspace(planned(planDelete(workspaceState(), 'try.pathogen')), editor);
    expect(store.get('shownProgram')).toBeNull();
  });

  it('no one listening ever sees a deleted open file, even mid-update', () => {
    const seen: string[][] = [];
    const unsubscribe = store.subscribe(['workspaceFiles', 'openFile', 'openFiles', 'code'], () =>
      seen.push([...workspaceNow().texts.keys()]),
    );
    applyToWorkspace(planned(planDelete(workspaceState(), 'parts/gears.pathogen')), editor);
    unsubscribe();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((keys) => keys.includes('parts/gears.pathogen'))).toEqual([]);
  });

  it('a deleted open file that had no tab (or one the list lost) still gives way to a tab', () => {
    store.update({ openFiles: ['main.pathogen'] });
    applyToWorkspace(planned(planDelete(workspaceState(), 'parts/gears.pathogen')), editor);
    expect([store.get('openFile'), store.get('openFiles')]).toEqual(['main.pathogen', ['main.pathogen']]);
  });

  it('no pin when there was no main to keep, or when the program shown becomes the main', () => {
    // Libraries only, then a program list appears (as a library losing module; will make it).
    store.update({
      workspaceFiles: { 'parts/gears.pathogen': GEARS, 'poster.pathogen': 'M 1 1' },
      workspaceEntryPoints: [],
      openFile: 'parts/gears.pathogen',
      openFiles: ['parts/gears.pathogen'],
      code: GEARS,
    });
    applyToWorkspace(
      { steps: [{ kind: 'entryPoints', before: [], after: ['poster.pathogen'] }], importsUpdated: [] },
      editor,
    );
    expect(store.get('shownProgram')).toBeNull();
  });

  it('the program shown deleted while the main moves too: back to the new main', () => {
    store.set('shownProgram', 'main.pathogen');
    applyToWorkspace(planned(planDelete(workspaceState(), 'main.pathogen')), editor);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([['try.pathogen'], null]);
    expect(programToShow(workspaceNow(), null)).toBe('try.pathogen');
  });

  it('pathogen.json in the editor follows the program list', () => {
    store.update({ openFile: PROJECT_FILE, openFiles: ['main.pathogen', PROJECT_FILE], code: '' });
    applyToWorkspace(planned(planDuplicate(workspaceState(), 'try.pathogen')), editor);
    const json = '{\n  "entryPoints": [\n    "main.pathogen",\n    "try.pathogen",\n    "try-2.pathogen"\n  ]\n}\n';
    expect([store.get('code'), editor.refreshed]).toEqual([json, [json]]);
  });
});
