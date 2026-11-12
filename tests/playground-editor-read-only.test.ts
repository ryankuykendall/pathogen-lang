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
