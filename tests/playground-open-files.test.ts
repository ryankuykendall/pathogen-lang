// @vitest-environment jsdom
//
// The editor's tabs (phase 2d, step 3; docs/workspace-files.md "The file tree
// and tabs"): labels, opening and closing, and the store's invariant that a
// tab switch never loses the outgoing file's text. The editor itself
// (CodeMirror, one state per file) is checked in the browser
// (project-docs/modules/verify/verify-2d-step3.ts); here a fake keeps each
// file's text the way it keeps each file's state.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  afterTabClosed,
  closeFile,
  openFile,
  tabItems,
  tabLabels,
  withTabOpened,
} from '../playground/services/open-files.js';
import { workspaceNow } from '../playground/services/workspace-files.js';
import { store } from '../playground/state/store.js';

import type { FileEditor } from '../playground/services/open-files.js';

const hintsOf = (paths: string[]): Record<string, string | null> =>
  Object.fromEntries(tabLabels(paths).map((t) => [t.path, t.hint === null ? t.name : `${t.name} · ${t.hint}`]));

describe('tab labels', () => {
  it('leave out .pathogen, and add the folder only when two open files share a name', () => {
    expect(hintsOf(['main.pathogen', 'parts/gears.pathogen', 'demos/gears.pathogen', 'parts/kit.pathogen'])).toEqual({
      'main.pathogen': 'main',
      'parts/gears.pathogen': 'gears · parts',
      'demos/gears.pathogen': 'gears · demos',
      'parts/kit.pathogen': 'kit',
    });
  });

  it('use as much of the folder as tells the files apart, and / for the top', () => {
    expect(hintsOf(['a/x/gears.pathogen', 'b/x/gears.pathogen', 'gears.pathogen'])).toEqual({
      'a/x/gears.pathogen': 'gears · a/x',
      'b/x/gears.pathogen': 'gears · b/x',
      'gears.pathogen': 'gears · /',
    });
    expect(hintsOf(['x/gears.pathogen', 'a/x/gears.pathogen'])).toEqual({
      'x/gears.pathogen': 'gears · x',
      'a/x/gears.pathogen': 'gears · a/x',
    });
  });

  it('keep a non-.pathogen name whole, and give each tab its kind', () => {
    const texts: Record<string, string> = {
      'main.pathogen': 'circle(0, 0, 4);',
      'parts/gears.pathogen': 'module;\nexport const n = 1;',
      'pathogen.json': '{}\n',
    };
    const items = tabItems(
      Object.keys(texts),
      (p) => texts[p],
      (_p, text) => text.startsWith('module;'),
    );
    expect(items.map((t) => [t.name, t.kind])).toEqual([
      ['main', 'program'],
      ['gears', 'library'],
      ['pathogen.json', 'json'],
    ]);
  });
});

describe('opening and closing tabs (the lists)', () => {
  it('a file opened joins at the end, once', () => {
    expect(withTabOpened(['a.pathogen'], 'b.pathogen')).toEqual(['a.pathogen', 'b.pathogen']);
    expect(withTabOpened(['a.pathogen', 'b.pathogen'], 'a.pathogen')).toEqual(['a.pathogen', 'b.pathogen']);
  });

  it('closing the shown tab shows the one to its right, else its left; the last tab stays', () => {
    const tabs = ['a.pathogen', 'b.pathogen', 'c.pathogen'];
    expect(afterTabClosed(tabs, 'b.pathogen', 'b.pathogen')).toEqual({
      openFiles: ['a.pathogen', 'c.pathogen'],
      active: 'c.pathogen',
    });
    expect(afterTabClosed(tabs, 'c.pathogen', 'c.pathogen')?.active).toBe('b.pathogen');
    expect(afterTabClosed(tabs, 'a.pathogen', 'c.pathogen')).toEqual({
      openFiles: ['a.pathogen', 'b.pathogen'],
      active: 'a.pathogen',
    });
    expect(afterTabClosed(['a.pathogen'], 'a.pathogen', 'a.pathogen')).toBeNull();
    expect(afterTabClosed(tabs, 'a.pathogen', 'gone.pathogen')).toBeNull();
  });
});

/** A fake editor: one kept text per file, as CodeMirror keeps one state per file. */
class FakeEditor implements FileEditor {
  kept = new Map<string, string>();

  shown: string | null = null;

  showFile = (path: string, text: string): void => {
    if (this.shown !== null) this.kept.set(this.shown, store.get('code') as string);
    this.kept.set(path, text);
    this.shown = path;
  };
}

/** Typing in the shown file: the editor writes the store's `code`. */
function type(text: string): void {
  store.set('code', text);
}

describe('switching tabs (the store)', () => {
  const FILES = {
    'main.pathogen': 'M 0 0',
    'parts/gears.pathogen': 'module;\nexport const n = 1;\n',
    'parts/kit.pathogen': 'module;\nexport const k = 2;\n',
  };
  let editor: FakeEditor;

  beforeEach(() => {
    store.update({
      workspaceFiles: { ...FILES },
      workspaceFolders: [],
      workspaceEntryPoints: ['main.pathogen'],
      openFile: 'main.pathogen',
      openFiles: ['main.pathogen'],
      code: FILES['main.pathogen'],
    });
    editor = new FakeEditor();
    editor.showFile('main.pathogen', FILES['main.pathogen']);
  });

  it('opening a file shows its text and keeps the outgoing file’s edit in the workspace', () => {
    type('M 1 1');
    expect(openFile(editor, 'parts/gears.pathogen')).toBe(true);
    expect([store.get('openFile'), store.get('code'), store.get('openFiles')]).toEqual([
      'parts/gears.pathogen',
      FILES['parts/gears.pathogen'],
      ['main.pathogen', 'parts/gears.pathogen'],
    ]);
    expect(Object.fromEntries(workspaceNow().texts)).toEqual({ ...FILES, 'main.pathogen': 'M 1 1' });
  });

  it('edits in two files both survive switching back and forth, and every kept text matches the store', () => {
    type('M 1 1');
    openFile(editor, 'parts/gears.pathogen');
    type('module;\nexport const n = 9;\n');
    openFile(editor, 'main.pathogen');
    openFile(editor, 'parts/kit.pathogen');
    const texts = Object.fromEntries(workspaceNow().texts);
    expect(texts).toEqual({
      ...FILES,
      'main.pathogen': 'M 1 1',
      'parts/gears.pathogen': 'module;\nexport const n = 9;\n',
    });
    for (const [path, text] of editor.kept) expect([path, text]).toEqual([path, texts[path]]);
  });

  it('with a library open, a shared link and Copy Debug Info carry the program shown, not the library', async () => {
    const { encodeState, decodeState } = await import('../playground/utils/url-state.js');
    const { buildDebugCapture } = await import('../playground/utils/debug-capture.js');
    type('M 1 1');
    openFile(editor, 'parts/gears.pathogen');
    expect(decodeState(encodeState(store.getAll() as Record<string, unknown>))?.code).toBe('M 1 1');
    const capture = buildDebugCapture();
    expect([capture.includes('M 1 1'), capture.includes('export const n = 1;')]).toEqual([true, false]);
  });

  it('a file the workspace doesn’t have isn’t opened', () => {
    expect(openFile(editor, 'nope.pathogen')).toBe(false);
    expect([store.get('openFile'), store.get('openFiles')]).toEqual(['main.pathogen', ['main.pathogen']]);
  });

  it('closing the open tab shows its neighbour with its latest text; closing another just drops it', () => {
    openFile(editor, 'parts/gears.pathogen');
    type('module;\nexport const n = 5;\n');
    openFile(editor, 'parts/kit.pathogen');
    openFile(editor, 'parts/gears.pathogen');
    expect(store.get('code')).toBe('module;\nexport const n = 5;\n');

    closeFile(editor, 'parts/gears.pathogen');
    expect([store.get('openFile'), store.get('openFiles')]).toEqual([
      'parts/kit.pathogen',
      ['main.pathogen', 'parts/kit.pathogen'],
    ]);
    // Closed, its edit is still the workspace's.
    expect(workspaceNow().texts.get('parts/gears.pathogen')).toBe('module;\nexport const n = 5;\n');

    closeFile(editor, 'main.pathogen');
    expect([store.get('openFile'), store.get('openFiles')]).toEqual(['parts/kit.pathogen', ['parts/kit.pathogen']]);
    closeFile(editor, 'parts/kit.pathogen');
    expect(store.get('openFiles')).toEqual(['parts/kit.pathogen']);
  });
});
