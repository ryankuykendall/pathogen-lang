// Code editor pane with CodeMirror

import { store } from '../state/store.js';
import { colorPickerExtension } from '../utils/cm-color-picker.js';
import { errorHighlightExtension } from '../utils/cm-error-highlight.js';
import { textLayerEditorExtension } from '../utils/cm-textlayer-editor.js';
import { svgPathCompletions } from '../utils/codemirror-setup.js';
import { themeManager } from '../utils/theme.js';

export class CodeEditorPane extends HTMLElement {
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

  connectedCallback() {
    this.render();
    this.loadCodeMirror();
  }

  disconnectedCallback() {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
  }

  set initialCode(code) {
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

  get code() {
    return this._editor ? this._editor.state.doc.toString() : this._initialCode;
  }

  set code(value) {
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

  async loadCodeMirror() {
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

  _getThemeExtensions() {
    const { language, oneDark } = this._cmModules;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [oneDark.oneDarkTheme, language.syntaxHighlighting(oneDark.oneDarkHighlightStyle)];
    }
    return [language.syntaxHighlighting(language.defaultHighlightStyle)];
  }

  createEditor() {
    const container = this.shadowRoot.querySelector('#editor-container');
    if (!container || !this._cmModules) return;

    const { state, view, commands, language, langJs, autocomplete } = this._cmModules;

    // Create compartments for dynamic theme swapping
    this._themeCompartment = new state.Compartment();

    // Error highlighting extension
    this._errorHighlight = errorHighlightExtension(state, view);

    const updateExtension = view.EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        store.set('isModified', true);
        store.set('code', this._editor.state.doc.toString());
        this.dispatchEvent(
          new CustomEvent('code-change', {
            bubbles: true,
            composed: true,
            detail: { code: this._editor.state.doc.toString() },
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
          override: [svgPathCompletions],
        }),
        updateExtension,
        view.EditorView.lineWrapping,
        ...colorPickerExtension(view),
        ...textLayerEditorExtension(view),
        ...this._errorHighlight.extension,
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

  _updateEditorTheme() {
    if (!this._editor || !this._themeCompartment) return;

    this._editor.dispatch({
      effects: this._themeCompartment.reconfigure(this._getThemeExtensions()),
    });
  }

  highlightError(line, column) {
    this._pendingError = { line, column };
    if (!this._editor || !this._errorHighlight) return;
    this._applyPendingError();
  }

  clearError() {
    this._pendingError = null;
    if (!this._editor || !this._errorHighlight) return;
    this._errorHighlight.clearError(this._editor);
  }

  _applyPendingError() {
    if (!this._pendingError || !this._editor || !this._errorHighlight) return;
    const { line, column } = this._pendingError;
    this._errorHighlight.setError(this._editor, { line, column });
    // Scroll error line into view
    const doc = this._editor.state.doc;
    if (line >= 1 && line <= doc.lines) {
      const lineObj = doc.line(line);
      this._editor.dispatch({
        effects: this._cmModules.view.EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      });
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          border-right: 1px solid var(--border-color, #e2e8f0);
          position: relative;
          background: var(--bg-secondary, #ffffff);
        }

        @media (max-width: 800px) {
          :host {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            min-height: 300px;
          }
        }

        #editor-container {
          flex: 1;
          overflow: auto;
        }

        /* CodeMirror base styles */
        #editor-container .cm-editor {
          height: 100%;
          font-size: 14px;
        }

        #editor-container .cm-editor .cm-scroller {
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
        }

        #editor-container .cm-editor .cm-content {
          padding-bottom: 25%;
        }

        #editor-container .cm-editor.cm-focused {
          outline: none;
        }

        #editor-container .cm-error-line {
          background-color: rgba(255, 0, 0, 0.08);
        }

        #editor-container .cm-error-char {
          text-decoration: underline wavy var(--error-text, #c00);
          text-decoration-skip-ink: none;
        }

        :host-context([data-theme="dark"]) #editor-container .cm-error-line {
          background-color: rgba(255, 80, 80, 0.12);
        }
      </style>

      <div id="editor-container"></div>
    `;
  }
}

customElements.define('code-editor-pane', CodeEditorPane);
