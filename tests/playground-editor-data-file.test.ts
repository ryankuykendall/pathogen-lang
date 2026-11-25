// @vitest-environment jsdom
//
// A data file in the editor (phase 3a step 7; docs/workspace-files.md "Data
// files"): editable JSON with none of Pathogen's language services, its JSON
// mistake marked as you type with the message its import would give, and
// Format Document off. CodeMirror loads from a CDN, so the pane gets stand-in
// modules that record what the state is built from (as
// playground-editor-read-only.test.ts does); the browser check is
// project-docs/modules/verify/verify-3a-step7.ts.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

interface Pane extends HTMLElement {
  render: () => void;
  showFile: (path: string, text: string) => void;
  formatDocument: () => void;
  highlightErrors: (errors: { line: number; column: number }[]) => void;
  clearError: () => void;
  readonly isData: boolean;
  readonly readOnly: boolean;
}

/** What a view plugin was made from, so a test can run it. */
let plugins: ((view: unknown) => { update?: (u: unknown) => void; destroy?: () => void })[] = [];

const fakeModules = {
  state: {
    EditorState: { create: (config: unknown) => config, readOnly: { of: (v: boolean) => ({ readOnly: v }) } },
  },
  view: {
    lineNumbers: () => 'lineNumbers',
    highlightActiveLineGutter: () => 'activeLineGutter',
    highlightSpecialChars: () => 'specialChars',
    drawSelection: () => 'drawSelection',
    rectangularSelection: () => 'rectangularSelection',
    highlightActiveLine: () => 'activeLine',
    keymap: { of: (bindings: unknown) => ({ keymap: bindings }) },
    ViewPlugin: {
      define: (create: (typeof plugins)[number]) => {
        plugins.push(create);
        return 'dataLint';
      },
    },
    EditorView: {
      lineWrapping: 'lineWrapping',
      contentAttributes: { of: (attrs: unknown) => ({ contentAttributes: attrs }) },
      domEventHandlers: (handlers: unknown) => ({ handlers }),
      updateListener: { of: () => 'updateListener' },
    },
  },
  commands: {
    defaultKeymap: ['defaultKeymap'],
    history: () => 'history',
    historyKeymap: ['historyKeymap'],
    indentWithTab: 'indentWithTab',
  },
  language: {
    StreamLanguage: { define: (spec: { name: string }) => ({ language: spec.name }) },
    syntaxHighlighting: (style: unknown) => ({ highlighting: style }),
    defaultHighlightStyle: 'defaultStyle',
    indentOnInput: () => 'indentOnInput',
    bracketMatching: () => 'bracketMatching',
  },
  autocomplete: {
    autocompletion: (config: unknown) => ({ autocompletion: config }),
    closeBrackets: () => 'closeBrackets',
    closeBracketsKeymap: ['closeBracketsKeymap'],
  },
  oneDark: { oneDarkTheme: 'oneDarkTheme', oneDarkHighlightStyle: 'oneDarkStyle' },
};

beforeAll(async () => {
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
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
  await import('../playground/components/code-editor-pane.ts');
});

afterEach(() => {
  vi.useRealTimers();
  plugins = [];
  document.body.innerHTML = '';
});

/** A pane drawn but not connected (it doesn't fetch CodeMirror), with the stand-in modules and a recording error field. */
function makePane(): Pane & {
  _cmModules: unknown;
  _themeCompartment: unknown;
  _errorHighlight: unknown;
  _editor: unknown;
  _newState: (text: string, path: string) => { extensions: unknown[] };
} {
  const pane = document.createElement('code-editor-pane') as unknown as ReturnType<typeof makePane>;
  pane.render();
  pane._cmModules = fakeModules;
  pane._themeCompartment = { of: (ext: unknown) => ({ theme: ext }), reconfigure: () => null };
  return pane;
}

function recordingHighlight(): { calls: unknown[]; handle: unknown } {
  const calls: unknown[] = [];
  return {
    calls,
    handle: {
      extension: ['errorField'],
      setError: (_view: unknown, position: unknown) => calls.push(['set', [position]]),
      setErrors: (_view: unknown, positions: unknown) => calls.push(['set', positions]),
      clearError: () => calls.push(['clear']),
    },
  };
}

describe('a data file in the editor', () => {
  it('gets a state of its own: editable JSON with undo, its edits reaching the store, and no Pathogen services', () => {
    const pane = makePane();
    pane._errorHighlight = recordingHighlight().handle;
    const { extensions } = pane._newState('{}', 'data/gears.json');
    expect(extensions).toContainEqual({ language: 'json' });
    expect(extensions).toEqual(expect.arrayContaining(['history', 'updateListener', 'closeBrackets', 'errorField']));
    expect(extensions).not.toContainEqual({ readOnly: true });
    // No completions (an inert field), and none of Pathogen's keys (Format, F2, Shift+F12).
    expect(extensions).toContainEqual({ autocompletion: { override: [], activateOnTyping: false } });
    const keymap = extensions.find((e) => (e as { keymap?: unknown }).keymap) as { keymap: unknown[] };
    expect(keymap.keymap).toEqual(['closeBracketsKeymap', 'defaultKeymap', 'historyKeymap', 'indentWithTab']);
    // None of the language services a .pathogen file's state carries.
    (pane as unknown as { _languageExtensions: unknown })._languageExtensions = {
      extensions: ['pathogenServices'],
      errorHighlight: pane._errorHighlight,
    };
    expect(pane._newState('{}', 'data/gears.json').extensions).not.toContain('pathogenServices');
    expect(extensions).toContain('lineWrapping');
  });

  it('a file on long lines (minified) is shown plain: no highlighting, no wrapping', () => {
    const pane = makePane();
    pane._errorHighlight = recordingHighlight().handle;
    const minified = `[${'1,'.repeat(15_000)}1]`;
    const { extensions } = pane._newState(minified, 'data/big.json');
    expect(extensions).not.toContainEqual({ language: 'json' });
    expect(extensions).not.toContain('lineWrapping');
    expect(extensions).toEqual(expect.arrayContaining(['history', 'updateListener', 'dataLint']));
  });

  it('a timer from a state no longer shown never fires (setState destroys its plugin)', () => {
    vi.useFakeTimers();
    const pane = makePane();
    const { calls, handle } = recordingHighlight();
    pane._errorHighlight = handle;
    pane._newState('{}', 'data/gears.json');
    const editor = { state: { doc: { toString: () => '[' } } };
    const plugin = plugins[0](editor);
    plugin.update?.({ docChanged: true });
    plugin.destroy?.();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });

  it('marks its JSON mistake with the message its import would give, as it shows and after typing pauses', () => {
    vi.useFakeTimers();
    const pane = makePane();
    const { calls, handle } = recordingHighlight();
    pane._errorHighlight = handle;
    pane._newState('{}', 'data/gears.json');
    let doc = '[\n  { "x": 1 }\n  { "x": 2 }\n]';
    const editor = { state: { doc: { toString: () => doc } } };
    pane._editor = editor;
    const plugin = plugins[0](editor);
    vi.advanceTimersByTime(0);
    expect(calls).toEqual([['set', [{ line: 3, column: 3, message: 'expected , or ] after an array item' }]]]);
    // The same words for a screen reader.
    const status = pane.shadowRoot!.querySelector('.data-status')!;
    expect([status.getAttribute('role'), status.textContent]).toEqual([
      'status',
      'Line 3: expected , or ] after an array item',
    ]);

    doc = '[{ "x": 1 }]';
    plugin.update?.({ docChanged: true });
    vi.advanceTimersByTime(149);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls[1]).toEqual(['clear']);
    expect(status.textContent).toBe('');
  });

  it('a mistake on an empty line (the end of the file) shows its message over the line', async () => {
    const { errorHighlightExtension } = await import('../playground/utils/cm-error-highlight.js');
    const made: { kind: string; spec: unknown }[] = [];
    let field: { update: (state: unknown, tr: unknown) => unknown } | null = null;
    const highlight = errorHighlightExtension(
      {
        StateEffect: { define: () => ({ of: (value: unknown) => ({ value }) }) },
        StateField: {
          define: (config: never) => {
            field = config;
            return 'field';
          },
        },
      },
      {
        Decoration: {
          none: 'none',
          line: (spec: unknown) => ({ range: () => made.push({ kind: 'line', spec }) }),
          mark: (spec: unknown) => ({ range: () => made.push({ kind: 'mark', spec }) }),
          set: (decos: unknown[]) => decos,
        },
        EditorView: { decorations: { from: () => 'decorations' } },
      },
    );
    expect(highlight.extension).toEqual(['field']);
    // "[1,\n" reads as "expected a value" at line 2, column 1: an empty line.
    const doc = {
      lines: 2,
      line: (n: number) => (n === 1 ? { from: 0, to: 3, length: 3 } : { from: 4, to: 4, length: 0 }),
      sliceString: () => '',
    };
    const effect = { is: () => true, value: [{ line: 2, column: 1, message: 'expected a value' }] };
    field!.update({}, { effects: [effect], docChanged: false, state: { doc } });
    expect(made).toEqual([
      { kind: 'line', spec: { class: 'cm-error-line', attributes: { title: 'expected a value' } } },
    ]);
  });

  it('a compile’s marks and clears pass it by, and Format Document does nothing', () => {
    const pane = makePane() as ReturnType<typeof makePane> & { _activePath: string | null };
    const { calls, handle } = recordingHighlight();
    pane._errorHighlight = handle;
    pane._editor = { state: { doc: { toString: () => '{}' } }, dispatch: () => undefined };
    pane._activePath = 'data/gears.json';
    expect([pane.isData, pane.readOnly]).toEqual([true, false]);
    pane.highlightErrors([{ line: 1, column: 1 }]);
    pane.clearError();
    pane.formatDocument();
    expect(calls).toEqual([]);
    // A .pathogen file takes them as before.
    pane._activePath = 'main.pathogen';
    expect(pane.isData).toBe(false);
    pane.highlightErrors([{ line: 1, column: 1 }]);
    expect(calls).toContainEqual(['set', [{ line: 1, column: 1 }]]);
  });
});
