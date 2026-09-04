// Code editor pane with CodeMirror

import { store } from '../state/store.js';
import {
  buildLanguageExtensions,
  runFormatDocument,
  runFindReferences,
  runRename,
  type ErrorHighlightHandle,
} from '../utils/cm-language-services.js';
import { colorPickerExtension } from '../utils/cm-color-picker.js';
import { styleRefRecolorExtension } from '../utils/cm-style-ref-recolor.js';
import { textLayerEditorExtension } from '../utils/cm-textlayer-editor.js';
import { svgPathCompletions } from '../utils/codemirror-setup.js';
import { pathogenLanguage } from '../utils/pathogen-language.js';
import { themeManager } from '../utils/theme.js';
import styles from './code-editor-pane.css';

// CodeMirror module types (dynamically imported from ESM CDN)
interface CmStateModule {
  Compartment: new () => { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown };
  EditorState: {
    create(config: unknown): unknown;
    readOnly: { of(value: boolean): unknown };
  };
  StateField: {
    define<T>(spec: {
      create(state: unknown): T;
      update(value: T, transaction: unknown): T;
      provide?(field: unknown): unknown;
    }): unknown;
  };
}

interface CmViewModule {
  EditorView: {
    new (config: unknown): CmEditorView;
    lineWrapping: unknown;
    editable: { of(value: boolean): unknown };
    scrollIntoView(pos: number, options?: unknown): unknown;
    updateListener: { of(fn: (update: CmViewUpdate) => void): unknown };
    domEventHandlers(handlers: Record<string, (...args: unknown[]) => boolean | void>): unknown;
  };
  lineNumbers(): unknown;
  highlightActiveLineGutter(): unknown;
  highlightSpecialChars(): unknown;
  drawSelection(): unknown;
  rectangularSelection(): unknown;
  highlightActiveLine(): unknown;
  keymap: { of(bindings: unknown[]): unknown };
  hoverTooltip(source: unknown, options?: unknown): unknown;
  showTooltip: {
    computeN(deps: unknown[], read: (state: unknown) => readonly unknown[]): unknown;
  };
}

interface CmEditorState {
  doc: {
    length: number;
    toString(): string;
    lines: number;
    line(n: number): { from: number };
    sliceString(from: number, to?: number): string;
  };
  selection: { main: { head: number } };
  field<T>(field: unknown): T;
}

interface CmEditorView {
  state: CmEditorState;
  dispatch(tr: unknown): void;
  setState: (state: unknown) => void;
  hasFocus: boolean;
  focus(): void;
  destroy(): void;
}

interface CmTransaction {
  isUserEvent(type: string): boolean;
  state: CmEditorState;
  docChanged: boolean;
  selection?: unknown;
}

interface CmViewUpdate {
  docChanged: boolean;
  view: CmEditorView;
  state: CmEditorState;
  transactions: CmTransaction[];
}

interface CmCommandsModule {
  history(): unknown;
  defaultKeymap: unknown[];
  historyKeymap: unknown[];
  indentWithTab: unknown;
}

interface CmLanguageModule {
  syntaxHighlighting(style: unknown): unknown;
  defaultHighlightStyle: unknown;
  indentOnInput(): unknown;
  bracketMatching(): unknown;
  syntaxTree(state: unknown): unknown;
}

interface CmAutocompleteModule {
  autocompletion(config: unknown): unknown;
  completionKeymap: unknown[];
  startCompletion(view: unknown): boolean;
  closeBrackets(): unknown;
  closeBracketsKeymap: unknown[];
}

interface CmOneDarkModule {
  oneDarkTheme: unknown;
  oneDarkHighlightStyle: unknown;
}

interface CmModules {
  state: CmStateModule;
  view: CmViewModule;
  commands: CmCommandsModule;
  language: CmLanguageModule;
  autocomplete: CmAutocompleteModule;
  oneDark: CmOneDarkModule;
}

export class CodeEditorPane extends HTMLElement {
  private _editor: CmEditorView | null;
  private _cmModules: CmModules | null;
  private _initialCode: string;
  private _themeCompartment: { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown } | null;
  private _errorHighlight: ErrorHighlightHandle | null;

  // Language-services extensions are built once and reused across document
  // resets — the error-highlight StateField/StateEffect identities must stay
  // stable or setErrors/clearError dispatches would target a field the
  // current EditorState doesn't contain.
  private _languageExtensions: ReturnType<typeof buildLanguageExtensions> | null;

  private _pendingError: { line: number; column: number } | null;
  private _pendingWarnings: Array<{ line: number; column: number }>;
  private _themeUnsubscribe: (() => void) | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editor = null;
    this._cmModules = null;
    this._initialCode = '';
    this._themeCompartment = null;
    this._errorHighlight = null;
    this._languageExtensions = null;
    this._pendingError = null;
    this._pendingWarnings = [];
    this._themeUnsubscribe = null;
  }

  connectedCallback(): void {
    this.render();
    this.loadCodeMirror();
  }

  disconnectedCallback(): void {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
  }

  set initialCode(code: string) {
    this._resetDocument(code);
  }

  get code(): string {
    return this._editor ? this._editor.state.doc.toString() : this._initialCode;
  }

  set code(value: string) {
    this._resetDocument(value);
  }

  /**
   * Replace the document by installing a FRESH EditorState — never via a
   * dispatch. A fresh state starts with an empty undo history, so Cmd+Z in
   * the new document can never resurrect the previous one (a workspace
   * switch used to leave "replace doc with old workspace" as an undoable
   * step, and autosave then persisted the undo — real data loss). setState
   * also produces no ViewUpdate, so programmatic loads do NOT fire the
   * update listener: no `code-change` event, no store.set('code'/'isModified'),
   * no autosave.onChange. Callers must write store('code') themselves.
   */
  private _resetDocument(code: string): void {
    this._initialCode = code;
    if (!this._editor || !this._cmModules) {
      // CodeMirror not loaded yet — createEditor() will seed from _initialCode.
      return;
    }
    const hadFocus = this._editor.hasFocus;
    const fresh = this._cmModules.state.EditorState.create({
      doc: code,
      extensions: this._buildExtensions(),
    });
    this._editor.setState(fresh);
    if (hadFocus) this._editor.focus();
  }

  async loadCodeMirror(): Promise<void> {
    if (this._cmModules) return;

    try {
      const [state, view, commands, language, autocomplete, oneDark] = await Promise.all([
        import('https://esm.sh/@codemirror/state@6'),
        import('https://esm.sh/@codemirror/view@6'),
        import('https://esm.sh/@codemirror/commands@6'),
        import('https://esm.sh/@codemirror/language@6'),
        import('https://esm.sh/@codemirror/autocomplete@6'),
        import('https://esm.sh/@codemirror/theme-one-dark@6'),
      ]);

      this._cmModules = { state, view, commands, language, autocomplete, oneDark };
      this.createEditor();
    } catch (err) {
      console.error('Failed to load CodeMirror:', err);
    }
  }

  private _getThemeExtensions(): unknown[] {
    const { language, oneDark } = this._cmModules!;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [oneDark.oneDarkTheme, language.syntaxHighlighting(oneDark.oneDarkHighlightStyle)];
    }
    return [language.syntaxHighlighting(language.defaultHighlightStyle)];
  }

  /**
   * The full extension set for an EditorState. Called for the initial state
   * AND for every document reset (see _resetDocument) — a fresh state only
   * keeps error highlighting and theme swapping working because two
   * identities are stable across calls: `_languageExtensions` (built once —
   * its error-highlight StateField/StateEffect handles) and
   * `_themeCompartment` (the reconfigure target). Everything else is cheap
   * to recreate, and a fresh `history()` per state is exactly what isolates
   * undo across workspace switches.
   */
  private _buildExtensions(): unknown[] {
    const { view, commands, language, autocomplete } = this._cmModules!;

    const updateExtension = view.EditorView.updateListener.of((update: CmViewUpdate) => {
      if (update.docChanged) {
        store.set('isModified', true);
        store.set('code', this._editor!.state.doc.toString());
        this.dispatchEvent(
          new CustomEvent<{ code: string }>('code-change', {
            bubbles: true,
            composed: true,
            detail: { code: this._editor!.state.doc.toString() },
          }),
        );
      }
    });

    // Flush any pending autosave when focus leaves the editor — shrinks the
    // window where an edit sits unsaved between the debounce and the next save.
    const blurExtension = view.EditorView.domEventHandlers({
      blur: () => {
        this.dispatchEvent(
          new CustomEvent('editor-blur', { bubbles: true, composed: true }),
        );
        return false;
      },
    });

    return [
      view.lineNumbers(),
      view.highlightActiveLineGutter(),
      view.highlightSpecialChars(),
      commands.history(),
      view.drawSelection(),
      view.rectangularSelection(),
      view.highlightActiveLine(),
      language.indentOnInput(),
      language.bracketMatching(),
      autocomplete.closeBrackets(),
      this._themeCompartment!.of(this._getThemeExtensions()),
      pathogenLanguage(language as any),
      view.keymap.of([
        ...autocomplete.closeBracketsKeymap,
        ...commands.defaultKeymap,
        ...commands.historyKeymap,
        ...autocomplete.completionKeymap,
        commands.indentWithTab,
        // Ctrl/Cmd+Shift+F — format the current document using the shared
        // language-services formatter. See runFormatDocument in
        // playground/utils/cm-language-services.ts.
        {
          key: 'Mod-Shift-f',
          run: (view: unknown) => runFormatDocument(view),
        },
        // F2 — rename the symbol at the cursor using prepareRename/getRenameEdits.
        {
          key: 'F2',
          run: (view: unknown) => runRename(view),
        },
        // Shift+F12 — find all references to the symbol at the cursor and
        // select them as a multi-cursor. Escape collapses back.
        {
          key: 'Shift-F12',
          run: (view: unknown) => runFindReferences(view),
        },
      ]),
      ...this._languageExtensions!.extensions,
      updateExtension,
      blurExtension,
      view.EditorView.lineWrapping,
      ...colorPickerExtension(view, language),
      ...styleRefRecolorExtension(view),
      ...textLayerEditorExtension(view, language),
    ];
  }

  createEditor(): void {
    const container = this.shadowRoot!.querySelector('#editor-container') as HTMLElement | null;
    if (!container || !this._cmModules) return;

    const { state, view, autocomplete } = this._cmModules;

    // Create compartments for dynamic theme swapping
    this._themeCompartment = new state.Compartment();

    // Build language-services extensions (completion, hover, diagnostics,
    // signature help, completion trigger detector). This is the single entry
    // point for every language feature wired into the Playground — see
    // playground/utils/cm-language-services.ts. The parity test at
    // tests/cross-channel-parity.test.ts ensures that every required feature
    // from src/language-services/feature-catalog.ts is wired there.
    //
    // Cast through `never`: the CM6 module shapes declared in this file and
    // in cm-language-services.ts describe overlapping-but-not-identical
    // slices of the same runtime objects, and TypeScript's structural
    // matching can't see that the underlying objects are the same. The
    // wiring module does its own internal type checking against its
    // interfaces.
    this._languageExtensions = buildLanguageExtensions(
      { state, view, autocomplete } as never,
      svgPathCompletions,
    );
    this._errorHighlight = this._languageExtensions.errorHighlight;

    const editorState = state.EditorState.create({
      doc: this._initialCode,
      extensions: this._buildExtensions(),
    });

    this._editor = new view.EditorView({
      state: editorState,
      parent: container,
    });

    // Listen for theme changes and swap editor theme
    this._themeUnsubscribe = themeManager.subscribe(() => {
      this._updateEditorTheme();
    });

    // Focus the editor
    this._editor.focus();

    // Apply any error or warning highlight that arrived before the editor was ready
    this._applyPendingError();
    if (this._pendingWarnings.length > 0) this.highlightWarnings(this._pendingWarnings);

    this.dispatchEvent(
      new CustomEvent('editor-ready', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _updateEditorTheme(): void {
    if (!this._editor || !this._themeCompartment) return;

    this._editor.dispatch({
      effects: this._themeCompartment.reconfigure(this._getThemeExtensions()),
    });
  }

  /**
   * Replace the whole document as ONE undoable transaction. Unlike the `code`
   * setter (a fresh EditorState for document loads), this goes through the
   * update listener, so `code-change` fires and the store, autosave, and the
   * recompile all follow exactly as they do for typed edits.
   */
  replaceDocument(text: string): void {
    if (!this._editor) {
      this._resetDocument(text);
      return;
    }
    this._editor.dispatch({
      changes: { from: 0, to: this._editor.state.doc.length, insert: text },
    });
  }

  /** Format the current document via the shared language-services formatter. */
  formatDocument(): void {
    if (!this._editor) return;
    runFormatDocument(this._editor);
  }

  highlightError(line: number, column: number): void {
    this._pendingError = { line, column };
    if (!this._editor || !this._errorHighlight) return;
    this._applyPendingError();
  }

  highlightErrors(errors: Array<{ line: number; column: number }>): void {
    if (errors.length === 0) return;
    this._pendingError = errors[0];
    if (!this._editor || !this._errorHighlight) return;
    this._errorHighlight.setErrors(this._editor, errors);
  }

  /** Compiler warnings: same field as errors, rendered with the cm-warning-* classes. */
  highlightWarnings(warnings: Array<{ line: number; column: number }>): void {
    this._pendingWarnings = warnings;
    if (!this._editor || !this._errorHighlight) return;
    if (warnings.length === 0) {
      this._errorHighlight.clearError(this._editor);
      return;
    }
    this._errorHighlight.setErrors(
      this._editor,
      warnings.map((w) => ({ line: w.line, column: w.column, severity: 'warning' as const })),
    );
  }

  clearError(): void {
    this._pendingError = null;
    this._pendingWarnings = [];
    if (!this._editor || !this._errorHighlight) return;
    this._errorHighlight.clearError(this._editor);
  }

  private _applyPendingError(): void {
    if (!this._pendingError || !this._editor || !this._errorHighlight) return;
    const { line, column } = this._pendingError;
    this._errorHighlight.setError(this._editor, { line, column });
  }

  private _scrollToError(error: { line: number; column: number }): void {
    if (!this._editor) return;
    const doc = this._editor.state.doc;
    if (error.line >= 1 && error.line <= doc.lines) {
      const lineObj = doc.line(error.line);
      this._editor.dispatch({
        effects: this._cmModules!.view.EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      });
    }
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div id="editor-container"></div>
    `;
  }
}

customElements.define('code-editor-pane', CodeEditorPane);
