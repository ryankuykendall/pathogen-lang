// @vitest-environment jsdom
//
// pathogen.json in the editor (2d, step 4a; mockup v6 screen J): its own
// read-only CodeMirror state. CodeMirror itself loads from a CDN, so here the
// pane gets stand-in modules that record what the state is built from; the
// browser check (project-docs/modules/verify/verify-2d-step4a.ts) runs the real one.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

interface Pane extends HTMLElement {
  render: () => void;
  showFile: (path: string, text: string) => void;
  replaceDocument: (text: string) => void;
  formatDocument: () => void;
  readonly readOnly: boolean;
  readonly code: string;
}

/** Stand-ins for the CodeMirror modules: each extension comes back as what it was asked for. */
const fakeModules = {
  state: {
    EditorState: { create: (config: unknown) => config, readOnly: { of: (v: boolean) => ({ readOnly: v }) } },
  },
  view: {
    lineNumbers: () => 'lineNumbers',
    highlightActiveLineGutter: () => 'activeLineGutter',
    highlightSpecialChars: () => 'specialChars',
    drawSelection: () => 'drawSelection',
    highlightActiveLine: () => 'activeLine',
    keymap: { of: (bindings: unknown) => ({ keymap: bindings }) },
    EditorView: {
      lineWrapping: 'lineWrapping',
      editable: { of: (v: boolean) => ({ editable: v }) },
      contentAttributes: { of: (attrs: unknown) => ({ contentAttributes: attrs }) },
      domEventHandlers: (handlers: Record<string, (event: unknown) => boolean>) => ({ handlers }),
      updateListener: { of: () => 'updateListener' },
    },
  },
  commands: { defaultKeymap: ['defaultKeymap'], history: () => 'history', historyKeymap: [], indentWithTab: {} },
  language: {
    StreamLanguage: { define: (spec: { name: string }) => ({ language: spec.name }) },
    syntaxHighlighting: (style: unknown) => ({ highlighting: style }),
    defaultHighlightStyle: 'defaultStyle',
  },
  autocomplete: { autocompletion: (config: unknown) => ({ autocompletion: config }) },
  oneDark: { oneDarkTheme: 'oneDarkTheme', oneDarkHighlightStyle: 'oneDarkStyle' },
};

beforeAll(async () => {
  // jsdom has no matchMedia; the theme manager reads the OS preference on load.
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  await import('../playground/components/code-editor-pane.ts');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** A pane drawn but not connected, so it doesn't fetch CodeMirror. */
function makePane(): Pane {
  const pane = document.createElement('code-editor-pane') as unknown as Pane;
  pane.render();
  return pane;
}

const note = (pane: Pane) => pane.shadowRoot!.querySelector<HTMLElement>('.read-only-note')!;

/** The extensions the pane builds a file's state from, with the stand-in modules. */
function extensionsFor(pane: Pane, path: string): unknown[] {
  const inside = pane as unknown as {
    _cmModules: unknown;
    _themeCompartment: unknown;
    _newState: (text: string, path: string) => { extensions: unknown[] };
  };
  inside._cmModules = fakeModules;
  inside._themeCompartment = { of: (ext: unknown) => ({ theme: ext }), reconfigure: () => null };
  return inside._newState('{}\n', path).extensions;
}

describe('pathogen.json in the editor', () => {
  it('is read-only, and its line shows only while it’s the file shown', () => {
    const pane = makePane();
    expect([pane.readOnly, note(pane).hidden]).toEqual([false, true]);
    pane.showFile('pathogen.json', '{}\n');
    expect([pane.readOnly, note(pane).hidden]).toEqual([true, false]);
    expect(note(pane).textContent).toBe(
      'Read-only. The playground writes this file from your workspace. To change the main, use Set as main on a program.',
    );
    pane.showFile('main.pathogen', 'M 0 0');
    expect([pane.readOnly, note(pane).hidden]).toEqual([false, true]);
  });

  it('nothing replaces it (Convert all) or formats it', () => {
    const pane = makePane();
    pane.showFile('pathogen.json', '{}\n');
    pane.replaceDocument('M 9 9');
    pane.formatDocument();
    expect(pane.code).toBe('{}\n');
    pane.showFile('main.pathogen', 'M 0 0');
    pane.replaceDocument('M 1 1');
    expect(pane.code).toBe('M 1 1');
  });

  it('gets a state of its own: read-only JSON, no Pathogen services, no update listener, an inert autocompletion', () => {
    // Pathogen's extensions need the language services, which this pane never built:
    // building them here would throw.
    const extensions = extensionsFor(makePane(), 'pathogen.json');
    expect(extensions).toContainEqual({ readOnly: true });
    expect(extensions).toContainEqual({ language: 'json' });
    expect(extensions).toContainEqual({ contentAttributes: { 'aria-readonly': 'true' } });
    // A completion still pending in the file just left reads autocomplete's field from
    // this state: without one, CodeMirror throws "Field is not present in this state".
    expect(extensions).toContainEqual({ autocompletion: { override: [], activateOnTyping: false } });
    expect(extensions).not.toContain('updateListener');
    expect(extensions).not.toContain('history');
  });

  it('follows the program list (refreshShown), and nothing else is refreshed that way', () => {
    const pane = makePane() as Pane & { refreshShown: (text: string) => void };
    pane.showFile('pathogen.json', '{}\n');
    pane.refreshShown('{\n  "entryPoints": [\n    "main.pathogen"\n  ]\n}\n');
    expect(pane.code).toBe('{\n  "entryPoints": [\n    "main.pathogen"\n  ]\n}\n');
    pane.showFile('main.pathogen', 'M 0 0');
    pane.refreshShown('nope');
    expect(pane.code).toBe('M 0 0');
  });

  it('forgets a deleted file’s kept state, undo history and all (forgetFiles)', () => {
    const pane = makePane() as Pane & { forgetFiles: (paths: string[]) => void; _kept: Map<string, unknown> };
    pane._kept.set('parts/gears.pathogen', { state: 'gears' });
    pane._kept.set('parts/kit.pathogen', { state: 'kit' });
    pane.forgetFiles(['parts/gears.pathogen']);
    expect([...pane._kept.keys()]).toEqual(['parts/kit.pathogen']);
  });

  it('a renamed file keeps its state under its new name, the file shown too (renameFiles)', () => {
    const pane = makePane() as Pane & {
      renameFiles: (moves: { from: string; to: string }[]) => void;
      _kept: Map<string, unknown>;
      activePath: string;
    };
    pane.showFile('parts/gears.pathogen', 'module;');
    pane._kept.set('parts/kit.pathogen', { state: 'kit' });
    pane.renameFiles([
      { from: 'parts/gears.pathogen', to: 'machines/gears.pathogen' },
      { from: 'parts/kit.pathogen', to: 'machines/kit.pathogen' },
    ]);
    expect([pane.activePath, [...pane._kept.entries()]]).toEqual([
      'machines/gears.pathogen',
      [['machines/kit.pathogen', { state: 'kit' }]],
    ]);
  });

  it('an import rewrite reaches a kept file outside its undo history (editFile)', () => {
    const pane = makePane() as Pane & {
      editFile: (
        path: string,
        edits: { from: number; to: number; insert: string }[],
        before: string,
        after: string,
      ) => void;
      _kept: Map<string, { state: unknown }>;
      _cmModules: unknown;
    };
    const updates: unknown[] = [];
    const keptState = (doc: string): unknown => ({
      doc: { toString: () => doc, length: doc.length },
      update: (spec: unknown) => {
        updates.push(spec);
        return { state: keptState('after') };
      },
    });
    pane._cmModules = { state: { Transaction: { addToHistory: { of: (v: boolean) => ({ addToHistory: v }) } } } };
    // (main.pathogen is the file shown; demo.pathogen is kept.)
    pane._kept.set('demo.pathogen', { state: keptState('import "./a.pathogen";') });
    pane.editFile(
      'demo.pathogen',
      [{ from: 8, to: 20, insert: './b.pathogen' }],
      'import "./a.pathogen";',
      'import "./b.pathogen";',
    );
    expect(updates).toEqual([
      { changes: [{ from: 8, to: 20, insert: './b.pathogen' }], annotations: { addToHistory: false } },
    ]);
    // Text it wasn't made for changes only where it differs from the text after,
    // so its undo history keeps its place (a whole-document replace would collapse it).
    pane._kept.set('try.pathogen', { state: keptState('// note\nimport "./a.pathogen";\n') });
    pane.editFile(
      'try.pathogen',
      [{ from: 8, to: 20, insert: './b.pathogen' }],
      'import "./a.pathogen";\n',
      '// note\nimport "./b.pathogen";\n',
    );
    expect(updates[1]).toEqual({
      changes: [{ from: 18, to: 19, insert: 'b' }],
      annotations: { addToHistory: false },
    });
  });

  it('the one span where two texts differ (spanChange)', async () => {
    const { spanChange } = await import('../playground/utils/cm-changed-lines.js');
    expect(spanChange('abcXdef', 'abcYYdef')).toEqual({ from: 3, to: 4, insert: 'YY' });
    expect(spanChange('aaa', 'aaaa')).toEqual({ from: 3, to: 3, insert: 'a' });
    expect(spanChange('keep this', 'keep this')).toEqual({ from: 9, to: 9, insert: '' });
    expect(spanChange('x', '')).toEqual({ from: 0, to: 1, insert: '' });
    // Applied, each gives the text after.
    for (const [doc, next] of [
      ['abcXdef', 'abcYYdef'],
      ['aaa', 'aaaa'],
      ['import "./a.pathogen";', '// new\nimport "./b.pathogen";'],
    ]) {
      const { from, to, insert } = spanChange(doc, next);
      expect(doc.slice(0, from) + insert + doc.slice(to)).toBe(next);
    }
  });

  it('the lines an import rewrite touches, in the text after it (editedLines)', async () => {
    const { editedLines } = await import('../playground/utils/cm-changed-lines.js');
    const before =
      '// gears\nimport { a } from "./parts/a.pathogen";\nimport * as k from "./parts/k.pathogen";\ngo();\n';
    const after = before.replaceAll('./parts/', './machines/');
    const edits = [...before.matchAll(/\.\/parts\/\w\.pathogen/g)].map((m) => ({
      from: m.index,
      to: m.index + m[0].length,
      insert: m[0].replace('parts', 'machines'),
    }));
    expect(editedLines(after, edits)).toEqual([2, 3]);
  });

  // Step 4d (mockup v11): every tab closed.
  it('with no file open: no document, the zero-state in its place, and nothing reaches a file', () => {
    const pane = makePane() as Pane & {
      showNone: () => void;
      activePath: string | null;
      _kept: Map<string, unknown>;
    };
    const zero = pane.shadowRoot!.querySelector<HTMLElement>('editor-zero-state')!;
    const container = pane.shadowRoot!.querySelector<HTMLElement>('#editor-container')!;
    expect([zero.hidden, container.hidden]).toEqual([true, false]);
    pane.showNone();
    expect([pane.activePath, pane.code, pane.readOnly, zero.hidden, container.hidden]).toEqual([
      null,
      '',
      false,
      false,
      true,
    ]);
    // Nothing replaces or formats a document that isn't there.
    pane.replaceDocument('M 9 9');
    pane.formatDocument();
    expect(pane.code).toBe('');
    pane.showFile('main.pathogen', 'M 0 0');
    expect([pane.activePath, pane.code, zero.hidden, container.hidden]).toEqual([
      'main.pathogen',
      'M 0 0',
      true,
      false,
    ]);
  });

  it('starts over with no file open (a workspace loaded with no files): the zero-state, nothing kept', () => {
    const pane = makePane() as Pane & {
      resetFiles: (path: string | null, text: string) => void;
      activePath: string | null;
      _kept: Map<string, unknown>;
    };
    const zero = pane.shadowRoot!.querySelector<HTMLElement>('editor-zero-state')!;
    const container = pane.shadowRoot!.querySelector<HTMLElement>('#editor-container')!;
    pane.showFile('lib.pathogen', 'module;');
    pane.resetFiles(null, 'ignored');
    expect([pane.activePath, pane.code, pane._kept.size, zero.hidden, container.hidden]).toEqual([
      null,
      '',
      0,
      false,
      true,
    ]);
    // And back to a file, the way a workspace switch starts (main.pathogen while the load is out).
    pane.resetFiles('main.pathogen', '');
    expect([pane.activePath, zero.hidden, container.hidden]).toEqual(['main.pathogen', true, false]);
  });

  it('the view’s state with no file open: read-only, not editable, no listener, no services', () => {
    const pane = makePane() as Pane & { _noneState: () => { extensions: unknown[] } };
    // (Installs the stand-in modules; pathogen.json's state needs no language services.)
    extensionsFor(pane, 'pathogen.json');
    const { extensions } = pane._noneState();
    expect(extensions).toEqual([
      { readOnly: true },
      { editable: false },
      { autocompletion: { override: [], activateOnTyping: false } },
    ]);
  });

  it('stops typing, lights its line for 2 seconds, and lets nothing through', () => {
    vi.useFakeTimers();
    const pane = makePane();
    pane.showFile('pathogen.json', '{}\n');
    const extensions = extensionsFor(pane, 'pathogen.json');
    const { handlers } = extensions.find((e) => (e as { handlers?: unknown }).handlers) as {
      handlers: Record<string, (event: unknown) => boolean>;
    };
    const preventDefault = vi.fn();
    expect(handlers.beforeinput({ preventDefault, inputType: 'insertText' })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(note(pane).classList.contains('hl')).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(note(pane).classList.contains('hl')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(note(pane).classList.contains('hl')).toBe(false);
  });
});
