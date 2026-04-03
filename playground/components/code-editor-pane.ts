// Code editor pane with CodeMirror

import { store } from '../state/store.js';
import { colorPickerExtension } from '../utils/cm-color-picker.js';
import { errorHighlightExtension } from '../utils/cm-error-highlight.js';
import { textLayerEditorExtension } from '../utils/cm-textlayer-editor.js';
import { svgPathCompletions } from '../utils/codemirror-setup.js';
import { sharedCompletionSource } from '../utils/cm-completion-bridge.js';
import { hoverTooltipExtension } from '../utils/cm-hover-tooltip.js';
import { themeManager } from '../utils/theme.js';
import styles from './code-editor-pane.css';

// CodeMirror module types (dynamically imported from ESM CDN)
interface CmStateModule {
  Compartment: new () => { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown };
  EditorState: {
    create(config: unknown): unknown;
    readOnly: { of(value: boolean): unknown };
  };
}

interface CmViewModule {
  EditorView: {
    new (config: unknown): CmEditorView;
    lineWrapping: unknown;
    editable: { of(value: boolean): unknown };
    scrollIntoView(pos: number, options?: unknown): unknown;
    updateListener: { of(fn: (update: CmViewUpdate) => void): unknown };
  };
  lineNumbers(): unknown;
  highlightActiveLineGutter(): unknown;
  highlightSpecialChars(): unknown;
  drawSelection(): unknown;
  rectangularSelection(): unknown;
  highlightActiveLine(): unknown;
  keymap: { of(bindings: unknown[]): unknown };
  hoverTooltip(source: unknown, options?: unknown): unknown;
}

interface CmEditorView {
  state: { doc: { length: number; toString(): string; lines: number; line(n: number): { from: number } } };
  dispatch(tr: unknown): void;
  focus(): void;
  destroy(): void;
}

interface CmViewUpdate {
  docChanged: boolean;
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
}

interface CmLangJsModule {
  javascript(): unknown;
}

interface CmAutocompleteModule {
  autocompletion(config: unknown): unknown;
  completionKeymap: unknown[];
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
  langJs: CmLangJsModule;
  autocomplete: CmAutocompleteModule;
  oneDark: CmOneDarkModule;
}

interface ErrorHighlightResult {
  extension: unknown[];
  setError(editorView: unknown, position: { line: number; column: number }): void;
  clearError(editorView: unknown): void;
}

export class CodeEditorPane extends HTMLElement {
  private _editor: CmEditorView | null;
  private _cmModules: CmModules | null;
  private _initialCode: string;
  private _themeCompartment: { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown } | null;
  private _highlightCompartment: unknown;
  private _errorHighlight: ErrorHighlightResult | null;
  private _pendingError: { line: number; column: number } | null;
  private _themeUnsubscribe: (() => void) | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editor = null;
    this._cmModules = null;
    this._initialCode = '';
    this._themeCompartment = null;
    this._highlightCompartment = null;
    this._errorHighlight = null;
    this._pendingError = null;
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
    this._initialCode = code;
    if (this._editor) {
      this._editor.dispatch({
        changes: {
          from: 0,
          to: this._editor.state.doc.length,
          insert: code,
        },
      });
    }
  }

  get code(): string {
    return this._editor ? this._editor.state.doc.toString() : this._initialCode;
  }

  set code(value: string) {
    if (this._editor) {
      this._editor.dispatch({
        changes: {
          from: 0,
          to: this._editor.state.doc.length,
          insert: value,
        },
      });
    } else {
      this._initialCode = value;
    }
  }

  async loadCodeMirror(): Promise<void> {
    if (this._cmModules) return;

    try {
      const [state, view, commands, language, langJs, autocomplete, oneDark] = await Promise.all([
        import('https://esm.sh/@codemirror/state@6'),
        import('https://esm.sh/@codemirror/view@6'),
        import('https://esm.sh/@codemirror/commands@6'),
        import('https://esm.sh/@codemirror/language@6'),
        import('https://esm.sh/@codemirror/lang-javascript@6'),
        import('https://esm.sh/@codemirror/autocomplete@6'),
        import('https://esm.sh/@codemirror/theme-one-dark@6'),
      ]);

      this._cmModules = { state, view, commands, language, langJs, autocomplete, oneDark };
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

  createEditor(): void {
    const container = this.shadowRoot!.querySelector('#editor-container') as HTMLElement | null;
    if (!container || !this._cmModules) return;

    const { state, view, commands, language, langJs, autocomplete } = this._cmModules;

    // Create compartments for dynamic theme swapping
    this._themeCompartment = new state.Compartment();

    // Error highlighting extension — cast to satisfy cm-error-highlight's own CmStateModule/CmViewModule interfaces
    this._errorHighlight = errorHighlightExtension(state as never, view as never) as ErrorHighlightResult;

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

    const editorState = state.EditorState.create({
      doc: this._initialCode,
      extensions: [
        view.lineNumbers(),
        view.highlightActiveLineGutter(),
        view.highlightSpecialChars(),
        commands.history(),
        view.drawSelection(),
        view.rectangularSelection(),
        view.highlightActiveLine(),
        language.indentOnInput(),
        language.bracketMatching(),
        this._themeCompartment.of(this._getThemeExtensions()),
        langJs.javascript(),
        view.keymap.of([
          ...commands.defaultKeymap,
          ...commands.historyKeymap,
          ...autocomplete.completionKeymap,
          commands.indentWithTab,
        ]),
        autocomplete.autocompletion({
          override: [
            // Shared language-services completion engine (primary)
            sharedCompletionSource,
            // Legacy ad-hoc completions (fallback for features not yet in shared engine)
            svgPathCompletions,
          ],
        }),
        updateExtension,
        view.EditorView.lineWrapping,
        ...colorPickerExtension(view),
        ...textLayerEditorExtension(view),
        ...this._errorHighlight.extension,
        ...hoverTooltipExtension(view),
      ],
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

    // Apply any error highlight that arrived before the editor was ready
    this._applyPendingError();

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

  highlightError(line: number, column: number): void {
    this._pendingError = { line, column };
    if (!this._editor || !this._errorHighlight) return;
    this._applyPendingError();
  }

  clearError(): void {
    this._pendingError = null;
    if (!this._editor || !this._errorHighlight) return;
    this._errorHighlight.clearError(this._editor);
  }

  private _applyPendingError(): void {
    if (!this._pendingError || !this._editor || !this._errorHighlight) return;
    const { line, column } = this._pendingError;
    this._errorHighlight.setError(this._editor, { line, column });
    // Scroll error line into view
    const doc = this._editor.state.doc;
    if (line >= 1 && line <= doc.lines) {
      const lineObj = doc.line(line);
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
