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
    this._cssVars = [];

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
    this._initCssVars();
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
    if (this._onThemeChange) {
      document.removeEventListener('theme-change', this._onThemeChange);
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

    // Extract dimensions from viewBox comment in source (e.g., // viewBox="0 0 400 400")
    if (this._sourceCode) {
      const vbMatch = this._sourceCode.match(/\/\/\s*viewBox\s*=\s*"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
      if (vbMatch) {
        this._width = parseInt(vbMatch[3], 10);
        this._height = parseInt(vbMatch[4], 10);
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

    // Handle <img> fallback — fetch the SVG so we can render it in mini-preview
    const imgChild = this.querySelector('img');
    if (imgChild && !this._svgContent) {
      this._imgSrc = imgChild.getAttribute('src');
      if (this._imgSrc) {
        this._fetchSvg(this._imgSrc);
      }
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

  // --- CSS Variable Detection ---

  _initCssVars() {
    // Explicit vars attribute takes precedence
    const varsAttr = this.getAttribute('vars');
    if (varsAttr) {
      this._cssVars = this._parseVarsAttribute(varsAttr);
      return;
    }

    // Auto-detect from SVG @property declarations
    if (this._svgContent) {
      this._cssVars = this._detectCssVarsFromSvg(this._svgContent);
    }
  }

  _parseVarsAttribute(raw) {
    return raw.split(';').filter(Boolean).map(pair => {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) return null;
      const name = pair.slice(0, colonIdx).trim();
      const defaultValue = pair.slice(colonIdx + 1).trim();
      return { name, defaultValue };
    }).filter(Boolean);
  }

  _detectCssVarsFromSvg(svgContent) {
    const styleMatch = svgContent.match(/<style>([\s\S]*?)<\/style>/);
    if (!styleMatch) return [];

    const vars = [];
    // Match @property declarations with syntax: "<color>" and extract name + initial-value
    const propRegex = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g;
    let match;
    while ((match = propRegex.exec(styleMatch[1])) !== null) {
      const body = match[2];
      if (!body.includes('"<color>"')) continue;
      const valMatch = body.match(/initial-value:\s*(#[\da-fA-F]{3,8})/);
      if (valMatch) {
        vars.push({ name: match[1], defaultValue: valMatch[1] });
      }
    }
    return vars;
  }

  // --- Lazy CodeMirror ---

  async _loadCodeMirror() {
    if (this._cmModules) return this._cmModules;

    const [state, view, language, langJs, githubTheme] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/@codemirror/language@6'),
      import('https://esm.sh/@codemirror/lang-javascript@6'),
      import('https://esm.sh/@uiw/codemirror-theme-github@4'),
    ]);

    this._cmModules = { state, view, language, langJs, githubTheme };
    return this._cmModules;
  }

  _getThemeExtensions() {
    const { githubTheme } = this._cmModules;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [githubTheme.githubDark];
    } else {
      return [githubTheme.githubLight];
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

    // Listen for theme changes via themeManager (SPA context)
    this._themeUnsubscribe = themeManager.subscribe(() => {
      this._updateEditorTheme();
    });

    // Listen for theme-change event from standalone theme-toggle component
    this._onThemeChange = () => this._updateEditorTheme();
    document.addEventListener('theme-change', this._onThemeChange);
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

  _getImportState() {
    // Extract title from source comment headers (first non-viewBox comment line)
    const commentLines = this._sourceCode.split('\n')
      .filter(l => l.trim().startsWith('//'))
      .map(l => l.replace(/^\/\/\s*/, '').trim())
      .filter(l => l && !l.startsWith('viewBox'));
    return {
      code: this._sourceCode,
      w: this._width,
      h: this._height,
      title: commentLines[0] || '',
      desc: this.getAttribute('caption') || '',
    };
  }

  // Write state to localStorage on click (not render) and navigate.
  // localStorage is shared across tabs, unlike sessionStorage with target="_blank".
  _handlePlaygroundClick(e) {
    e.preventDefault();
    const state = this._getImportState();
    const key = 'mw-import-' + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* storage full */ }
    window.open(`/pathogen/workspace/new?import=${encodeURIComponent(key)}`, '_blank');
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

    // "Open in Playground" — write to localStorage on click, then open new tab
    const playgroundLink = this.shadowRoot.querySelector('.playground-link');
    if (playgroundLink) {
      playgroundLink.addEventListener('click', (e) => this._handlePlaygroundClick(e));
    }

    // Set copy button text
    const copyBtn = this.shadowRoot.querySelector('copy-button');
    if (copyBtn) {
      copyBtn.setText(this._sourceCode);
    }

    // CSS variable controls
    const varControls = this.shadowRoot.querySelector('.var-controls');
    if (varControls) {
      const preview = this.shadowRoot.querySelector('mini-preview');

      // Apply initial values so SVG inherits them
      if (preview) {
        for (const v of this._cssVars) {
          preview.style.setProperty(v.name, v.defaultValue);
        }
      }

      // Live color picker updates
      varControls.addEventListener('input', (e) => {
        if (e.target.type === 'color') {
          const varName = e.target.dataset.var;
          if (preview) {
            preview.style.setProperty(varName, e.target.value);
          }
        }
      });

      // Reset button
      const resetBtn = this.shadowRoot.querySelector('#vars-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          for (const v of this._cssVars) {
            const input = varControls.querySelector(`input[data-var="${v.name}"]`);
            if (input) input.value = v.defaultValue;
            if (preview) preview.style.setProperty(v.name, v.defaultValue);
          }
        });
      }
    }
  }

  render() {
    const caption = this.getAttribute('caption') || '';

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

        /* CSS variable controls */
        .var-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          background: var(--bg-secondary, #ffffff);
        }

        .var-control {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          cursor: pointer;
        }

        .var-label {
          font-family: var(--font-mono, monospace);
          font-size: 0.6875rem;
          color: var(--text-secondary, #64748b);
        }

        .var-controls input[type="color"] {
          -webkit-appearance: none;
          appearance: none;
          width: 26px;
          height: 26px;
          border: 2px solid var(--border-color, #ddd);
          border-radius: var(--radius-sm, 4px);
          padding: 0;
          cursor: pointer;
          background: none;
        }

        .var-controls input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 2px;
        }

        .var-controls input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 2px;
        }

        #vars-reset {
          margin-left: auto;
          padding: 0.25rem 0.5rem;
          font-size: 0.6875rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-tertiary, #f0f1f2);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          transition: all var(--transition-base, 0.15s ease);
        }

        #vars-reset:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          color: var(--text-primary, #1a1a2e);
        }

        /* Content area */
        .content-area {
          display: grid;
          grid-template-columns: 0fr 1fr;
          grid-template-rows: 1fr;
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

        /* Footer */
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.375rem 0.75rem;
          background: var(--bg-tertiary, #f0f1f2);
          border-top: 1px solid var(--border-color, #e2e8f0);
          font-size: 0.6875rem;
          color: var(--text-tertiary, #94a3b8);
          min-height: 1.75rem;
        }

        .footer-brand {
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          font-size: 0.625rem;
          opacity: 0.8;
        }

        .footer-caption {
          font-style: italic;
          font-size: 0.75rem;
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
          <a class="playground-link" href="#" rel="noopener">Open in Playground &#x2197;</a>
        </div>
      </div>

      ${this._cssVars.length > 0 ? `
      <div class="var-controls">
        ${this._cssVars.map(v => `
          <label class="var-control">
            <input type="color" value="${v.defaultValue}" data-var="${v.name}">
            <span class="var-label">${v.name}</span>
          </label>
        `).join('')}
        <button id="vars-reset" title="Reset colors to defaults">Reset</button>
      </div>
      ` : ''}

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

      <div class="footer">
        <span class="footer-brand">Pathogen</span>
        ${caption ? `<span class="footer-caption">${caption}</span>` : ''}
      </div>
    `;
  }
}

customElements.define('mini-workspace', MiniWorkspace);
