// Mini-Workspace — display-only code+preview blog embed
// Progressive enhancement: static fallback upgrades to interactive CodeMirror + pannable SVG

import { themeManager } from '../../utils/theme.js';
import './mini-preview.js';
import '../shared/copy-button.js';

export class MiniWorkspace extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._sourceCode = '';
    this._svgContent = '';
    this._width = 200;
    this._height = 200;

    // Lazy CodeMirror state
    this._editor = null;
    this._cmModules = null;
    this._themeCompartment = null;
    this._themeUnsubscribe = null;
    this._cmLoading = false;
  }

  connectedCallback() {
    // Capture light DOM children before replacing
    this._captureChildren();
    this.render();
    this.setupEventListeners();

    // Initialize preview
    const preview = this.shadowRoot.querySelector('mini-preview');
    if (this._svgContent && preview) {
      preview.setSvgContent(this._svgContent);
    }

    // If code-open attribute is present, open code panel
    if (this.hasAttribute('code-open')) {
      this._loadCodeMirrorIfNeeded();
    }
  }

  disconnectedCallback() {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
  }

  _captureChildren() {
    // Decode source from code-data attribute (base64)
    const codeData = this.getAttribute('code-data');
    if (codeData) {
      try {
        this._sourceCode = decodeURIComponent(atob(codeData));
      } catch {
        this._sourceCode = '';
      }
    }

    // Fallback: extract from <code> child (with or without <pre> wrapper)
    if (!this._sourceCode) {
      const codeEl = this.querySelector('code') || this.querySelector('pre code');
      if (codeEl) {
        this._sourceCode = codeEl.textContent || '';
      }
    }

    // Extract SVG content
    const svgChild = this.querySelector('svg');
    if (svgChild) {
      this._svgContent = svgChild.outerHTML;
      // Extract dimensions from SVG
      const w = svgChild.getAttribute('width');
      const h = svgChild.getAttribute('height');
      if (w) this._width = parseFloat(w);
      if (h) this._height = parseFloat(h);
    }

    // Handle <img> fallback — note the src for reference but we can't use it as SVG content
    const imgChild = this.querySelector('img');
    if (imgChild && !this._svgContent) {
      this._imgSrc = imgChild.getAttribute('src');
    }

    // Handle svg-src attribute
    const svgSrc = this.getAttribute('svg-src');
    if (svgSrc && !this._svgContent) {
      this._fetchSvg(svgSrc);
    }
  }

  async _fetchSvg(url) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        this._svgContent = await resp.text();
        const preview = this.shadowRoot.querySelector('mini-preview');
        if (preview) preview.setSvgContent(this._svgContent);
      }
    } catch (err) {
      console.warn('mini-workspace: failed to fetch SVG:', err);
    }
  }

  // --- Lazy CodeMirror ---

  async _loadCodeMirror() {
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
      return [
        oneDark.oneDarkTheme,
        language.syntaxHighlighting(oneDark.oneDarkHighlightStyle),
      ];
    } else {
      return [
        language.syntaxHighlighting(language.defaultHighlightStyle),
      ];
    }
  }

  async _createEditor() {
    const container = this.shadowRoot.querySelector('#editor-container');
    if (!container || this._editor) return;

    const { state, view, language, langJs } = await this._loadCodeMirror();

    this._themeCompartment = new state.Compartment();

    const editorState = state.EditorState.create({
      doc: this._sourceCode,
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

    // Hide static fallback
    const fallback = this.shadowRoot.querySelector('#code-fallback');
    if (fallback) fallback.style.display = 'none';

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

  async _loadCodeMirrorIfNeeded() {
    if (this._editor || this._cmLoading) return;
    this._cmLoading = true;
    try {
      await this._createEditor();
    } catch (err) {
      console.warn('mini-workspace: CodeMirror load failed:', err);
    }
    this._cmLoading = false;
  }

  // --- "Open in Playground" ---

  _getPlaygroundUrl() {
    const state = {
      code: this._sourceCode,
      w: this._width,
      h: this._height,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(state)));
    return `/pathogen/workspace/new?state=${encoded}`;
  }

  // --- Events ---

  setupEventListeners() {
    // Code toggle button
    const toggleBtn = this.shadowRoot.querySelector('#code-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (this.hasAttribute('code-open')) {
          this.removeAttribute('code-open');
        } else {
          this.setAttribute('code-open', '');
          this._loadCodeMirrorIfNeeded();
        }
      });
    }

    // Set copy button text
    const copyBtn = this.shadowRoot.querySelector('copy-button');
    if (copyBtn) {
      copyBtn.setText(this._sourceCode);
    }
  }

  render() {
    const caption = this.getAttribute('caption') || '';
    const playgroundUrl = this._getPlaygroundUrl();

    // Static fallback code for display before CodeMirror loads
    const escapedCode = this._sourceCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          margin: 1.5rem 0;
          height: 60dvh;
          min-height: 50dvh;
          max-height: 80dvh;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          overflow: hidden;
          background: var(--bg-secondary, #ffffff);
        }

        /* Toolbar */
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: var(--bg-tertiary, #f0f1f2);
          border-bottom: 1px solid var(--border-color, #e2e8f0);
        }

        .toolbar-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .toolbar button {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-secondary, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          transition: all var(--transition-base, 0.15s ease);
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .toolbar button:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--border-strong, #cbd5e1);
          color: var(--text-primary, #1a1a2e);
        }

        :host([code-open]) #code-toggle {
          background: var(--accent-color, #10b981);
          border-color: var(--accent-color, #10b981);
          color: var(--accent-text, #ffffff);
        }

        :host([code-open]) #code-toggle:hover {
          background: var(--accent-hover, #0ea572);
        }

        /* Dark mode: ensure readable contrast on toolbar buttons */
        @media (prefers-color-scheme: dark) {
          .toolbar button {
            color: var(--text-primary, #e2e8f0);
          }
        }
        :host-context([data-theme="dark"]) .toolbar button {
          color: var(--text-primary, #e2e8f0);
        }

        .playground-link {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-secondary, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          text-decoration: none;
          transition: all var(--transition-base, 0.15s ease);
        }

        .playground-link:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--border-strong, #cbd5e1);
          color: var(--text-primary, #1a1a2e);
        }

        /* Content area */
        .content-area {
          display: grid;
          grid-template-columns: 0fr 1fr;
          transition: grid-template-columns 0.3s ease;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        :host([code-open]) .content-area {
          grid-template-columns: 1fr 1fr;
        }

        /* Code panel */
        .code-panel {
          overflow: hidden;
          min-width: 0;
          border-right: 1px solid var(--border-color, #e2e8f0);
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .code-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.375rem 0.5rem;
          background: var(--bg-tertiary, #f0f1f2);
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          font-size: 0.6875rem;
          color: var(--text-secondary, #64748b);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
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

        /* Static fallback */
        #code-fallback {
          margin: 0;
          flex: 1;
          overflow: auto;
        }

        #code-fallback code {
          display: block;
          padding: 0.75rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 13px;
          line-height: 1.5;
          white-space: pre;
          color: var(--text-primary, #1a1a2e);
          background: none;
        }

        /* Preview panel */
        .preview-panel {
          min-width: 0;
          min-height: 0;
          overflow: visible;
          position: relative;
        }

        mini-preview {
          width: 100%;
          height: 100%;
        }

        /* Caption */
        .caption {
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: var(--text-tertiary, #94a3b8);
          text-align: center;
          font-style: italic;
          border-top: 1px solid var(--border-color, #e2e8f0);
        }

        /* Responsive */
        @media (max-width: 768px) {
          :host([code-open]) .content-area {
            grid-template-columns: 1fr;
            grid-template-rows: 200px 1fr;
          }

          .code-panel {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
          }
        }
      </style>

      <div class="toolbar">
        <div class="toolbar-left">
          <button id="code-toggle" title="Toggle code panel">&lt;/&gt; Code</button>
        </div>
        <div class="toolbar-right">
          <a class="playground-link" href="${playgroundUrl}" target="_blank" rel="noopener">Open in Playground &#x2197;</a>
        </div>
      </div>

      <div class="content-area">
        <div class="code-panel">
          <div class="code-header">
            <span>Source</span>
            <copy-button variant="inline"></copy-button>
          </div>
          <div id="code-fallback"><code>${escapedCode}</code></div>
          <div id="editor-container"></div>
        </div>
        <div class="preview-panel">
          <mini-preview></mini-preview>
        </div>
      </div>

      ${caption ? `<div class="caption">${caption}</div>` : ''}
    `;
  }
}

customElements.define('mini-workspace', MiniWorkspace);
