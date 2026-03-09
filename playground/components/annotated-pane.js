// Annotated output pane component with read-only CodeMirror

import { themeManager } from '../utils/theme.js';

export class AnnotatedPane extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._isOpen = false;
    this._editor = null;
    this._content = '// Click "Annotated" to view debug output';
    this._cmModules = null;
    this._themeCompartment = null;
    this._themeUnsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
  }

  setupEventListeners() {
    this.shadowRoot.querySelector('#copy-btn').addEventListener('click', () => {
      this.copyContent();
    });
  }

  get isOpen() {
    return this._isOpen;
  }

  async open() {
    this._isOpen = true;
    this.classList.add('open');

    // Create editor if not exists
    if (!this._editor) {
      await this.createEditor();
    }

    this.dispatchEvent(new CustomEvent('open'));
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
    this.dispatchEvent(new CustomEvent('close'));
  }

  toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  set content(value) {
    this._content = value || '';
    if (this._editor && this._isOpen) {
      this._editor.dispatch({
        changes: {
          from: 0,
          to: this._editor.state.doc.length,
          insert: this._content,
        },
      });
    }
  }

  get content() {
    return this._content;
  }

  async loadCodeMirror() {
    if (this._cmModules) return this._cmModules;

    const [state, view, language, langJs, oneDark] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/@codemirror/language@6'),
      import('https://esm.sh/@codemirror/lang-javascript@6'),
      import('https://esm.sh/@codemirror/theme-one-dark@6'),
    ]);

    this._cmModules = { state, view, language, langJs, oneDark };
    return this._cmModules;
  }

  _getThemeExtensions() {
    const { language, oneDark } = this._cmModules;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [oneDark.oneDarkTheme, language.syntaxHighlighting(oneDark.oneDarkHighlightStyle)];
    }
    return [language.syntaxHighlighting(language.defaultHighlightStyle)];
  }

  async createEditor() {
    const container = this.shadowRoot.querySelector('#editor-container');
    if (!container) return;

    const { state, view, language, langJs } = await this.loadCodeMirror();

    this._themeCompartment = new state.Compartment();

    const editorState = state.EditorState.create({
      doc: this._content,
      extensions: [
        view.lineNumbers(),
        view.highlightSpecialChars(),
        view.drawSelection(),
        view.highlightActiveLine(),
        this._themeCompartment.of(this._getThemeExtensions()),
        langJs.javascript(),
        view.EditorView.lineWrapping,
        state.EditorState.readOnly.of(true),
        view.EditorView.editable.of(false),
      ],
    });

    this._editor = new view.EditorView({
      state: editorState,
      parent: container,
    });

    // Listen for theme changes
    this._themeUnsubscribe = themeManager.subscribe(() => {
      this._updateEditorTheme();
    });
  }

  _updateEditorTheme() {
    if (!this._editor || !this._themeCompartment) return;

    this._editor.dispatch({
      effects: this._themeCompartment.reconfigure(this._getThemeExtensions()),
    });
  }

  async copyContent() {
    const text = this._editor ? this._editor.state.doc.toString() : this._content;

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.shadowRoot.querySelector('#copy-btn');
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          flex: 0 0 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          border-right: 1px solid var(--border-color, #e2e8f0);
          position: relative;
          overflow: hidden;
          transition: flex-basis var(--transition-slow, 0.3s ease);
          background: var(--bg-secondary, #ffffff);
        }

        :host(.open) {
          flex: 1 1 0;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: var(--bg-tertiary, #f0f1f2);
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          font-size: 0.75rem;
          color: var(--text-secondary, #64748b);
        }

        .header span {
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .copy-btn {
          padding: 0.25rem 0.625rem;
          font-size: 0.6875rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-secondary, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          transition: all var(--transition-base, 0.15s ease);
        }

        .copy-btn:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--border-strong, #cbd5e1);
          color: var(--text-primary, #1a1a2e);
        }

        .copy-btn.copied {
          background: var(--success-color, #10b981);
          border-color: var(--success-color, #10b981);
          color: white;
        }

        #editor-container {
          flex: 1;
          overflow: auto;
        }

        #editor-container .cm-editor {
          height: 100%;
          font-size: 13px;
        }

        #editor-container .cm-editor .cm-content {
          cursor: default;
        }

        #editor-container .cm-editor .cm-scroller {
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
        }

        #editor-container .cm-editor.cm-focused {
          outline: none;
        }

        @media (max-width: 800px) {
          :host {
            flex-basis: 0;
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
          }

          :host(.open) {
            flex: 0 0 200px;
          }
        }
      </style>

      <div class="header">
        <span>Annotated Output</span>
        <button id="copy-btn" class="copy-btn">Copy</button>
      </div>
      <div id="editor-container"></div>
    `;
  }
}

customElements.define('annotated-pane', AnnotatedPane);
