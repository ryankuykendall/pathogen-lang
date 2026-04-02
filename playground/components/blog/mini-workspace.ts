// Mini-Workspace — display-only code+preview blog embed
// Progressive enhancement: static fallback upgrades to interactive CodeMirror + pannable SVG

import { themeManager } from '../../utils/theme.js';
import './mini-preview.js';
import '../shared/copy-button.js';

interface CssVar {
  name: string;
  defaultValue: string;
}

interface ImportState {
  code: string;
  w: number;
  h: number;
  title: string;
  desc: string;
}

// CodeMirror module types (lazy loaded from esm.sh at runtime)
// Using Record<string, any> since modules are fetched via CDN, not installed locally
interface CmModules {
  state: Record<string, any>;
  view: Record<string, any>;
  language: Record<string, any>;
  langJs: Record<string, any>;
  githubTheme: { githubDark: unknown; githubLight: unknown };
}

export class MiniWorkspace extends HTMLElement {
  private _sourceCode: string = '';
  private _svgContent: string = '';
  private _width: number = 200;
  private _height: number = 200;
  private _cssVars: CssVar[] = [];
  private _imgSrc: string | undefined;

  // Inspector state
  private _inspectorMetadata: Record<string, unknown> | null = null;
  private _inspectorEl: (HTMLElement & { setData(data: Record<string, unknown>): void }) | null = null;
  private _inspectorOpen: boolean = false;
  private _isPreviewFullscreen: boolean = false;
  private _inspectorKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // Lazy CodeMirror state
  private _editor: unknown | null = null;
  private _cmModules: CmModules | null = null;
  private _themeCompartment: unknown | null = null;
  private _themeUnsubscribe: (() => void) | null = null;
  private _cmLoading: boolean = false;
  private _onThemeChange: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Capture light DOM children before replacing
    this._captureChildren();
    this._initCssVars();
    this.render();
    this.setupEventListeners();

    // Initialize preview
    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
      setSvgContent(svg: string): void;
    };
    if (this._svgContent && preview) {
      preview.setSvgContent(this._svgContent);
    }

    // If code-open attribute is present, open code panel
    if (this.hasAttribute('code-open')) {
      this._loadCodeMirrorIfNeeded();
    }
  }

  disconnectedCallback(): void {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
    if (this._onThemeChange) {
      document.removeEventListener('theme-change', this._onThemeChange);
    }
    if (this._inspectorOpen) {
      this._closeInspector();
    }
  }

  private _captureChildren(): void {
    // Extract source from <code> child (with or without <pre> wrapper)
    const codeEl = this.querySelector('code') || this.querySelector('pre code');
    if (codeEl) {
      this._sourceCode = codeEl.textContent || '';
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
      this._extractMetadata(svgChild);
    }

    // Handle <img> fallback — fetch the SVG so we can render it in mini-preview
    const imgChild = this.querySelector('img');
    if (imgChild && !this._svgContent) {
      this._imgSrc = imgChild.getAttribute('src') || undefined;
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

  private async _fetchSvg(url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        this._svgContent = await resp.text();
        // Extract metadata from fetched SVG
        const doc = new DOMParser().parseFromString(this._svgContent, 'image/svg+xml');
        this._extractMetadata(doc.documentElement);
        const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
          setSvgContent(svg: string): void;
        };
        if (preview) preview.setSvgContent(this._svgContent);

        // Re-detect CSS vars now that SVG content is available
        if (this._cssVars.length === 0) {
          this._initCssVars();
          if (this._cssVars.length > 0) {
            this._injectVarControls();
          }
        }
      }
    } catch (err) {
      console.warn('mini-workspace: failed to fetch SVG:', err);
    }
  }

  /**
   * Inject CSS variable color picker controls after async SVG load.
   * Called when _initCssVars() detects vars from a late-arriving SVG.
   */
  private _injectVarControls(): void {
    const toolbar = this.shadowRoot!.querySelector('.toolbar');
    if (!toolbar || this.shadowRoot!.querySelector('.var-controls')) return;

    const html = `<div class="var-controls">
      ${this._cssVars
        .map(
          (v) => `
        <label class="var-control">
          <input type="color" value="${v.defaultValue}" data-var="${v.name}">
          <span class="var-label">${v.name}</span>
        </label>
      `,
        )
        .join('')}
      <button id="vars-reset" title="Reset colors to defaults">Reset</button>
    </div>`;

    toolbar.insertAdjacentHTML('afterend', html);

    // Wire up event listeners for the new controls
    const varControls = this.shadowRoot!.querySelector('.var-controls')!;
    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;

    // Apply initial values
    if (preview) {
      for (const v of this._cssVars) {
        preview.style.setProperty(v.name, v.defaultValue);
      }
    }

    // Live color picker updates
    varControls.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'color') {
        const varName = target.dataset.var;
        if (preview && varName) {
          preview.style.setProperty(varName, target.value);
        }
      }
    });

    // Reset button
    const resetBtn = varControls.querySelector('#vars-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        for (const v of this._cssVars) {
          const input = varControls.querySelector(`input[data-var="${v.name}"]`) as HTMLInputElement | null;
          if (input) input.value = v.defaultValue;
          if (preview) preview.style.setProperty(v.name, v.defaultValue);
        }
      });
    }
  }

  // --- CSS Variable Detection ---

  private _initCssVars(): void {
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

  private _parseVarsAttribute(raw: string): CssVar[] {
    return raw
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) return null;
        const name = pair.slice(0, colonIdx).trim();
        const defaultValue = pair.slice(colonIdx + 1).trim();
        return { name, defaultValue };
      })
      .filter((v): v is CssVar => v !== null);
  }

  private _detectCssVarsFromSvg(svgContent: string): CssVar[] {
    const styleMatch = svgContent.match(/<style>([\s\S]*?)<\/style>/);
    if (!styleMatch) return [];

    const vars: CssVar[] = [];
    // Match @property declarations with syntax: "<color>" and extract name + initial-value
    const propRegex = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g;
    let match;
    while ((match = propRegex.exec(styleMatch[1])) !== null) {
      const body = match[2];
      if (!body.includes('"<color>"') && !body.includes('"&lt;color&gt;"')) continue;
      const valMatch = body.match(/initial-value:\s*(#[\da-fA-F]{3,8})/);
      if (valMatch) {
        vars.push({ name: match[1], defaultValue: valMatch[1] });
      }
    }
    return vars;
  }

  // --- Lazy CodeMirror ---

  private async _loadCodeMirror(): Promise<CmModules> {
    if (this._cmModules) return this._cmModules;

    const [state, view, language, langJs, githubTheme] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/@codemirror/language@6'),
      import('https://esm.sh/@codemirror/lang-javascript@6'),
      import('https://esm.sh/@uiw/codemirror-theme-github@4'),
    ]);

    this._cmModules = { state, view, language, langJs, githubTheme } as CmModules;
    return this._cmModules;
  }

  private _getThemeExtensions(): unknown[] {
    const { githubTheme } = this._cmModules!;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [githubTheme.githubDark];
    }
    return [githubTheme.githubLight];
  }

  private async _createEditor(): Promise<void> {
    const container = this.shadowRoot!.querySelector('#editor-container');
    if (!container || this._editor) return;

    const { state, view, langJs } = await this._loadCodeMirror();

    this._themeCompartment = new (state as any).Compartment();

    const editorState = (state as any).EditorState.create({
      doc: this._sourceCode,
      extensions: [
        (view as any).lineNumbers(),
        (view as any).highlightSpecialChars(),
        (view as any).drawSelection(),
        (view as any).highlightActiveLine(),
        (this._themeCompartment as any).of(this._getThemeExtensions()),
        (langJs as any).javascript(),
        (view as any).EditorView.lineWrapping,
        (state as any).EditorState.readOnly.of(true),
      ],
    });

    this._editor = new (view as any).EditorView({
      state: editorState,
      parent: container,
    });

    // Hide static fallback
    const fallback = this.shadowRoot!.querySelector('#code-fallback') as HTMLElement | null;
    if (fallback) fallback.style.display = 'none';

    // Listen for theme changes via themeManager (SPA context)
    this._themeUnsubscribe = themeManager.subscribe(() => {
      this._updateEditorTheme();
    });

    // Listen for theme-change event from standalone theme-toggle component
    this._onThemeChange = () => this._updateEditorTheme();
    document.addEventListener('theme-change', this._onThemeChange);
  }

  private _updateEditorTheme(): void {
    if (!this._editor || !this._themeCompartment) return;
    (this._editor as any).dispatch({
      effects: (this._themeCompartment as any).reconfigure(this._getThemeExtensions()),
    });
  }

  private async _loadCodeMirrorIfNeeded(): Promise<void> {
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

  private _getImportState(): ImportState {
    // Extract title from source comment headers (first non-viewBox comment line)
    const commentLines = this._sourceCode
      .split('\n')
      .filter((l) => l.trim().startsWith('//'))
      .map((l) => l.replace(/^\/\/\s*/, '').trim())
      .filter((l) => l && !l.startsWith('viewBox'));
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
  private _handlePlaygroundClick(e: MouseEvent): void {
    e.preventDefault();
    const state = this._getImportState();
    const key = `mw-import-${Date.now()}`;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full */
    }
    window.open(`/pathogen/workspace/new?import=${encodeURIComponent(key)}`, '_blank');
  }

  // --- Events ---

  private _extractMetadata(svgEl: Element): void {
    const metaScript = svgEl.querySelector('script#pathogen-metadata');
    if (metaScript?.textContent) {
      try {
        this._inspectorMetadata = JSON.parse(metaScript.textContent);
      } catch {
        // Invalid metadata JSON
      }
    }
  }

  private async _openInspector(): Promise<void> {
    if (this._inspectorOpen || !this._inspectorMetadata) return;

    // Lazy-load inspector panel and its sub-panels
    await import('../inspector-panel.js');

    this._inspectorEl = document.createElement('inspector-panel') as HTMLElement & { setData(data: Record<string, unknown>): void };
    this._inspectorEl.classList.add('fullscreen-overlay', 'open');
    this.shadowRoot!.appendChild(this._inspectorEl);
    this._inspectorEl.setData(this._inspectorMetadata);

    // Listen for close button
    this._inspectorEl.addEventListener('toggle-inspector', () => {
      this._closeInspector();
    });

    // Listen for layer visibility changes
    this._inspectorEl.addEventListener('layer-visibility-change', ((e: CustomEvent) => {
      const { name, visible } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
      const contentGroup = preview?.shadowRoot?.querySelector('#preview-content');
      if (contentGroup) {
        const layerEl = contentGroup.querySelector(`[id="${name}"]`) as HTMLElement | null;
        if (layerEl) layerEl.style.display = visible === false ? 'none' : '';
      }
    }) as EventListener);

    // Listen for CSS var overrides
    this._inspectorEl.addEventListener('cssvar-override', ((e: CustomEvent) => {
      const { varName, value } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
      if (preview) {
        if (value) {
          preview.style.setProperty(varName, value);
        } else {
          preview.style.removeProperty(varName);
        }
      }
    }) as EventListener);

    // ESC key: close inspector before fullscreen exits
    this._inspectorKeydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this._inspectorOpen && this._isPreviewFullscreen) {
        e.stopPropagation();
        this._closeInspector();
      }
    };
    document.addEventListener('keydown', this._inspectorKeydownHandler, true);

    this._inspectorOpen = true;
  }

  private _closeInspector(): void {
    if (!this._inspectorOpen) return;

    if (this._inspectorEl) {
      this._inspectorEl.remove();
      this._inspectorEl = null;
    }

    if (this._inspectorKeydownHandler) {
      document.removeEventListener('keydown', this._inspectorKeydownHandler, true);
      this._inspectorKeydownHandler = null;
    }

    this._inspectorOpen = false;
  }

  private setupEventListeners(): void {
    // Code toggle button
    const toggleBtn = this.shadowRoot!.querySelector('#code-toggle');
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
    const playgroundLink = this.shadowRoot!.querySelector('.playground-link');
    if (playgroundLink) {
      playgroundLink.addEventListener('click', (e: Event) => this._handlePlaygroundClick(e as MouseEvent));
    }

    // Set copy button text
    const copyBtn = this.shadowRoot!.querySelector('copy-button') as HTMLElement & { setText(text: string): void };
    if (copyBtn) {
      copyBtn.setText(this._sourceCode);
    }

    // Inspector toggle and fullscreen tracking — listen directly on mini-preview
    const miniPreview = this.shadowRoot!.querySelector('mini-preview');
    if (miniPreview) {
      miniPreview.addEventListener('toggle-inspector', () => {
        if (this._isPreviewFullscreen) {
          if (this._inspectorOpen) {
            this._closeInspector();
          } else {
            this._openInspector();
          }
        }
      });

      miniPreview.addEventListener('fullscreen-change', ((e: CustomEvent) => {
        this._isPreviewFullscreen = e.detail.fullscreen;
        if (!e.detail.fullscreen && this._inspectorOpen) {
          this._closeInspector();
        }
      }) as EventListener);
    }

    // CSS variable controls
    const varControls = this.shadowRoot!.querySelector('.var-controls');
    if (varControls) {
      const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;

      // Apply initial values so SVG inherits them
      if (preview) {
        for (const v of this._cssVars) {
          preview.style.setProperty(v.name, v.defaultValue);
        }
      }

      // Live color picker updates
      varControls.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'color') {
          const varName = target.dataset.var;
          if (preview && varName) {
            preview.style.setProperty(varName, target.value);
          }
        }
      });

      // Reset button
      const resetBtn = this.shadowRoot!.querySelector('#vars-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          for (const v of this._cssVars) {
            const input = varControls.querySelector(`input[data-var="${v.name}"]`) as HTMLInputElement | null;
            if (input) input.value = v.defaultValue;
            if (preview) preview.style.setProperty(v.name, v.defaultValue);
          }
        });
      }
    }
  }

  private render(): void {
    const caption = this.getAttribute('caption') || '';

    // Static fallback code for display before CodeMirror loads
    const escapedCode = this._sourceCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    this.shadowRoot!.innerHTML = `
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

      ${
        this._cssVars.length > 0
          ? `
      <div class="var-controls">
        ${this._cssVars
          .map(
            (v) => `
          <label class="var-control">
            <input type="color" value="${v.defaultValue}" data-var="${v.name}">
            <span class="var-label">${v.name}</span>
          </label>
        `,
          )
          .join('')}
        <button id="vars-reset" title="Reset colors to defaults">Reset</button>
      </div>
      `
          : ''
      }

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
