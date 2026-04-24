// Mini-Workspace — display-only code+preview blog embed
// Progressive enhancement: static fallback upgrades to interactive CodeMirror + pannable SVG
//
// Chrome design: details/summary-style header (chevron + title) always visible at 28px.
// Clicking the summary slides an in-flow glass-blur control bar from 0 → 44px height,
// exposing the code-toggle, per-var color chips, reset, copy, and playground-launch
// actions. Suppresses the minimap in embedded mode; minimap appears only when
// mini-preview goes fullscreen.

import { themeManager } from '../../utils/theme.js';
import '../shared/pathogen-color-input.js';
import './mini-preview.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

function escapeAttr(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

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

  // Bar transition handler cleanup
  private _onBarTransitionEnd: ((e: TransitionEvent) => void) | null = null;

  // Guard against binding the chip-group delegated listener twice when vars
  // arrive late via async SVG fetch (_wireChipGroup runs both in
  // setupEventListeners and _injectVarControls).
  private _chipGroupWired: boolean = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._captureChildren();
    this._initCssVars();
    this.render();
    this.setupEventListeners();

    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
      setSvgContent(svg: string): void;
    };
    if (this._svgContent && preview) {
      preview.setSvgContent(this._svgContent);
    }
    if (this._cssVars.length > 0 && preview) {
      for (const v of this._cssVars) preview.style.setProperty(v.name, v.defaultValue);
    }

    if (this.hasAttribute('code-open')) {
      this._loadCodeMirrorIfNeeded();
    }
  }

  disconnectedCallback(): void {
    if (this._themeUnsubscribe) this._themeUnsubscribe();
    if (this._onThemeChange) document.removeEventListener('theme-change', this._onThemeChange);
    if (this._inspectorOpen) this._closeInspector();
    if (this._onBarTransitionEnd) {
      const bar = this.shadowRoot?.querySelector('#glass-bar');
      if (bar) bar.removeEventListener('transitionend', this._onBarTransitionEnd as EventListener);
    }
  }

  private _captureChildren(): void {
    const codeEl = this.querySelector('code') || this.querySelector('pre code');
    if (codeEl) this._sourceCode = codeEl.textContent || '';

    if (this._sourceCode) {
      const vbMatch = this._sourceCode.match(/\/\/\s*viewBox\s*=\s*"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
      if (vbMatch) {
        this._width = parseInt(vbMatch[3], 10);
        this._height = parseInt(vbMatch[4], 10);
      }
    }

    const svgChild = this.querySelector('svg');
    if (svgChild) {
      this._svgContent = svgChild.outerHTML;
      const w = svgChild.getAttribute('width');
      const h = svgChild.getAttribute('height');
      if (w) this._width = parseFloat(w);
      if (h) this._height = parseFloat(h);
      this._extractMetadata(svgChild);
    }

    const imgChild = this.querySelector('img');
    if (imgChild && !this._svgContent) {
      this._imgSrc = imgChild.getAttribute('src') || undefined;
      if (this._imgSrc) this._fetchSvg(this._imgSrc);
    }

    const svgSrc = this.getAttribute('svg-src');
    if (svgSrc && !this._svgContent) this._fetchSvg(svgSrc);
  }

  private async _fetchSvg(url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        this._svgContent = await resp.text();
        const doc = new DOMParser().parseFromString(this._svgContent, 'image/svg+xml');
        this._extractMetadata(doc.documentElement);
        const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
          setSvgContent(svg: string): void;
        };
        if (preview) preview.setSvgContent(this._svgContent);

        if (this._cssVars.length === 0) {
          this._initCssVars();
          if (this._cssVars.length > 0) this._injectVarControls();
        }
      }
    } catch (err) {
      console.warn('mini-workspace: failed to fetch SVG:', err);
    }
  }

  /**
   * Populate the chip-group inside the glass-bar after an async SVG load
   * that surfaces late-arriving CSS vars.
   */
  private _injectVarControls(): void {
    const chipGroup = this.shadowRoot!.querySelector('#chip-group') as HTMLElement | null;
    if (!chipGroup || chipGroup.children.length > 0) return;

    chipGroup.innerHTML = this._renderChipGroupInner();

    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
    if (preview) {
      for (const v of this._cssVars) preview.style.setProperty(v.name, v.defaultValue);
    }

    this._wireChipGroup();
  }

  private _renderChipGroupInner(): string {
    if (this._cssVars.length === 0) return '';
    const chips = this._cssVars
      .map((v) => {
        // Values from `vars=` attribute are caller-controlled; escape before
        // interpolation to keep quoted attributes and the style declaration
        // from being broken out of.
        const name = escapeAttr(v.name);
        const value = escapeAttr(v.defaultValue);
        return `
        <label class="chip" style="--chip-color:${value}" aria-label="${name}">
          <span class="dot"></span>
          <pathogen-color-input compact value="${value}" data-var="${name}"></pathogen-color-input>
          <span class="chip-label">${name}</span>
        </label>
      `;
      })
      .join('');
    return `
      <span class="glass-divider"></span>
      ${chips}
      <button class="icon-btn" id="vars-reset" type="button" data-tip="Reset colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12a8 8 0 0 1 14-5l2-2M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5l-2 2M4 20v-4h4"/></svg>
      </button>
    `;
  }

  private _wireChipGroup(): void {
    if (this._chipGroupWired) return;
    const chipGroup = this.shadowRoot!.querySelector('#chip-group') as HTMLElement | null;
    if (!chipGroup) return;
    this._chipGroupWired = true;
    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;

    chipGroup.addEventListener('color-change', (e: Event) => {
      const target = e.target as HTMLElement;
      const varName = target.dataset.var;
      if (!varName) return;
      const value = (e as CustomEvent<{ value: string }>).detail.value;
      if (preview) preview.style.setProperty(varName, value);
      const chip = target.closest('.chip') as HTMLElement | null;
      if (chip) chip.style.setProperty('--chip-color', value);
    });

    const resetBtn = chipGroup.querySelector('#vars-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const v of this._cssVars) {
          const input = chipGroup.querySelector(`pathogen-color-input[data-var="${v.name}"]`) as
            | (HTMLElement & { value: string })
            | null;
          if (input) input.value = v.defaultValue;
          const chip = input?.closest('.chip') as HTMLElement | null;
          if (chip) chip.style.setProperty('--chip-color', v.defaultValue);
          if (preview) preview.style.setProperty(v.name, v.defaultValue);
        }
      });
    }
  }

  // --- CSS Variable Detection ---

  private _initCssVars(): void {
    const varsAttr = this.getAttribute('vars');
    if (varsAttr) {
      this._cssVars = this._parseVarsAttribute(varsAttr);
      return;
    }
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
    return [isDark ? githubTheme.githubDark : githubTheme.githubLight];
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

    const fallback = this.shadowRoot!.querySelector('#code-fallback') as HTMLElement | null;
    if (fallback) fallback.style.display = 'none';

    this._themeUnsubscribe = themeManager.subscribe(() => this._updateEditorTheme());
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

  private _handlePlaygroundClick(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    const state = this._getImportState();
    const key = `mw-import-${Date.now()}`;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full */
    }
    window.open(`/pathogen/workspace/new?import=${encodeURIComponent(key)}`, '_blank');
  }

  // --- Inspector ---

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
    if (this._inspectorOpen) return;
    // Claim the slot synchronously so a second toggle-inspector fired during
    // the dynamic import can't race past this guard and create a duplicate panel.
    this._inspectorOpen = true;

    await import('../inspector-panel.js');

    this._inspectorEl = document.createElement('inspector-panel') as HTMLElement & {
      setData(data: Record<string, unknown>): void;
    };
    this._inspectorEl.classList.add('fullscreen-overlay', 'open');
    this.shadowRoot!.appendChild(this._inspectorEl);
    // Pass metadata if we have it; otherwise hand over empty defaults so the
    // panel renders its frame without crashing on missing sub-sections.
    this._inspectorEl.setData(
      this._inspectorMetadata ?? { layers: [], masks: [], clipPaths: [], gradients: [], cssProperties: [] },
    );

    this._inspectorEl.addEventListener('toggle-inspector', () => this._closeInspector());

    this._inspectorEl.addEventListener('layer-visibility-change', ((e: CustomEvent) => {
      const { name, visible } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
      const contentGroup = preview?.shadowRoot?.querySelector('#preview-content');
      if (contentGroup) {
        const layerEl = contentGroup.querySelector(`[id="${name}"]`) as HTMLElement | null;
        if (layerEl) layerEl.style.display = visible === false ? 'none' : '';
      }
    }) as EventListener);

    this._inspectorEl.addEventListener('cssvar-override', ((e: CustomEvent) => {
      const { varName, value } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
      if (preview) {
        if (value) preview.style.setProperty(varName, value);
        else preview.style.removeProperty(varName);
      }
    }) as EventListener);

    this._inspectorKeydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this._inspectorOpen && this._isPreviewFullscreen) {
        e.stopPropagation();
        this._closeInspector();
      }
    };
    document.addEventListener('keydown', this._inspectorKeydownHandler, true);
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

  // --- Summary (details-style) open/close + events ---

  private _toggleBar(open?: boolean): void {
    const currentlyOpen = this.classList.contains('bar-open');
    const next = open === undefined ? !currentlyOpen : open;
    const summary = this.shadowRoot!.querySelector('#summary') as HTMLElement | null;

    if (next) {
      this.classList.add('bar-open');
      summary?.setAttribute('aria-expanded', 'true');
      // .bar-fully-open toggled in transitionend
    } else {
      this.classList.remove('bar-fully-open'); // hide overflow immediately
      this.classList.remove('bar-open');
      summary?.setAttribute('aria-expanded', 'false');
    }
  }

  private setupEventListeners(): void {
    const summary = this.shadowRoot!.querySelector('#summary');
    const bar = this.shadowRoot!.querySelector('#glass-bar') as HTMLElement | null;

    // Click the summary row to toggle the glass-bar.
    if (summary) {
      summary.addEventListener('click', () => this._toggleBar());
    }

    // Stop clicks inside the bar from bubbling to the summary and re-collapsing.
    if (bar) {
      bar.addEventListener('click', (e) => e.stopPropagation());

      this._onBarTransitionEnd = (e: TransitionEvent): void => {
        if (e.propertyName !== 'height') return;
        if (this.classList.contains('bar-open')) this.classList.add('bar-fully-open');
      };
      bar.addEventListener('transitionend', this._onBarTransitionEnd as EventListener);
    }

    // Code toggle (inside glass-bar)
    const codeToggle = this.shadowRoot!.querySelector('#code-toggle');
    if (codeToggle) {
      codeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.hasAttribute('code-open')) {
          this.removeAttribute('code-open');
          codeToggle.classList.remove('active');
          codeToggle.setAttribute('aria-pressed', 'false');
        } else {
          this.setAttribute('code-open', '');
          codeToggle.classList.add('active');
          codeToggle.setAttribute('aria-pressed', 'true');
          this._loadCodeMirrorIfNeeded();
        }
      });
    }

    // Playground launch
    const playgroundLink = this.shadowRoot!.querySelector('.playground-link');
    if (playgroundLink) {
      playgroundLink.addEventListener('click', (e: Event) => this._handlePlaygroundClick(e));
    }

    // Copy source to clipboard
    const copyBtn = this.shadowRoot!.querySelector('#copy-btn') as HTMLElement | null;
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const originalTip = copyBtn.getAttribute('data-tip') || 'Copy';
        try {
          await navigator.clipboard.writeText(this._sourceCode);
          copyBtn.setAttribute('data-tip', 'Copied');
        } catch {
          copyBtn.setAttribute('data-tip', 'Failed');
        }
        setTimeout(() => copyBtn.setAttribute('data-tip', originalTip), 1100);
      });
    }

    // Fullscreen button — delegates to mini-preview's internal toggle so the
    // existing attachFullscreenBehavior() wiring still owns the state machine.
    const fsBtn = this.shadowRoot!.querySelector('#fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mp = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
        const previewFsBtn = mp?.shadowRoot?.querySelector('#fullscreen-toggle') as HTMLButtonElement | null;
        previewFsBtn?.click();
      });
    }

    // Inspector toggle + fullscreen tracking — listens on mini-preview.
    const miniPreview = this.shadowRoot!.querySelector('mini-preview');
    if (miniPreview) {
      miniPreview.addEventListener('toggle-inspector', () => {
        if (this._inspectorOpen) this._closeInspector();
        else this._openInspector();
      });

      miniPreview.addEventListener('fullscreen-change', ((e: CustomEvent) => {
        this._isPreviewFullscreen = e.detail.fullscreen;
      }) as EventListener);
    }

    // Chip group (present if vars were detected synchronously)
    this._wireChipGroup();
  }

  private render(): void {
    const rawCaption = this.getAttribute('caption');
    // escapeHtml already handles &<> — caption is rendered as text in <h2>.
    const caption = rawCaption ? escapeHtml(rawCaption) : 'Code &amp; Preview';
    const codeOpen = this.hasAttribute('code-open');
    const escapedCode = escapeHtml(this._sourceCode);
    const chipGroupInner = this._renderChipGroupInner();

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
          background: var(--bg-elevated, #ffffff);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
          position: relative;
          overflow: visible;
        }

        /* --- Summary (always visible, 28px, click to toggle glass-bar) --- */
        .mw-summary {
          all: unset;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 14px 0 10px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          background: var(--bg-elevated, #ffffff);
          cursor: pointer;
          flex-shrink: 0;
          user-select: none;
          transition: background var(--transition-base, 0.15s ease);
        }
        .mw-summary:hover { background: var(--bg-tertiary, #f0f1f2); }
        .mw-summary:focus { outline: none; }
        .mw-summary:focus-visible { outline: none; }

        .chevron {
          width: 14px; height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary, #94a3b8);
          transform: rotate(0deg);
          transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
                      color var(--transition-base, 0.15s ease);
          flex-shrink: 0;
        }
        .mw-summary:hover .chevron { color: var(--text-secondary, #64748b); }
        :host(.bar-open) .chevron {
          transform: rotate(90deg);
          color: var(--accent-color, #10b981);
        }
        .chevron svg { width: 10px; height: 10px; stroke-width: 2.4; }

        .mw-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary, #1a1a2e);
          letter-spacing: 0.01em;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        /* --- Glass bar: in-flow, height-animated 0 → 44px --- */
        .glass-bar {
          flex-shrink: 0;
          position: relative;
          z-index: 5;
          height: 0;
          overflow: hidden;
          background: color-mix(in srgb, var(--bg-elevated, #ffffff) 82%, transparent);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          border-bottom: 1px solid transparent;
          transition: height 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
                      border-bottom-color 0.22s ease;
        }
        :host(.bar-open) .glass-bar {
          height: 44px;
          border-bottom-color: var(--border-color, #e2e8f0);
        }
        /* After the height transition completes, overflow opens so dropdown
           tooltips can escape the bar's bounds. */
        :host(.bar-fully-open) .glass-bar { overflow: visible; }

        .glass-bar-inner {
          display: flex;
          align-items: center;
          height: 44px;
          padding: 0 10px;
          gap: 6px;
        }

        /* Icon buttons inside the bar */
        .icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm, 4px);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          transition: all var(--transition-base, 0.15s ease);
          position: relative;
        }
        .icon-btn:hover {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          color: var(--accent-color, #10b981);
        }
        .icon-btn.active {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          color: var(--accent-color, #10b981);
        }
        .icon-btn svg {
          width: 14px;
          height: 14px;
          stroke-width: 1.8;
        }

        /* Tooltips on icon buttons */
        .icon-btn[data-tip]::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) translateY(-4px);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-primary, #1a1a2e);
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          padding: 3px 8px;
          white-space: nowrap;
          border-radius: var(--radius-sm, 4px);
          opacity: 0;
          pointer-events: none;
          transition: all var(--transition-base, 0.15s ease);
          z-index: 10;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
        }
        .icon-btn:hover[data-tip]::after {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        /* Right-aligned variant — avoids clipping when button is at the bar edge */
        .icon-btn[data-tip-align="right"]::after {
          left: auto;
          right: 0;
          transform: translateX(0) translateY(-4px);
        }
        .icon-btn[data-tip-align="right"]:hover::after {
          transform: translateX(0) translateY(0);
        }
        /* Left-aligned variant — same, for the leftmost button */
        .icon-btn[data-tip-align="left"]::after {
          left: 0;
          right: auto;
          transform: translateX(0) translateY(-4px);
        }
        .icon-btn[data-tip-align="left"]:hover::after {
          transform: translateX(0) translateY(0);
        }

        .glass-divider {
          width: 1px;
          height: 16px;
          background: var(--border-color, #e2e8f0);
          margin: 0 4px;
          flex-shrink: 0;
        }

        /* Per-CSS-var color chips */
        .chip-group {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 8px 0 4px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
          position: relative;
          transition: background var(--transition-base, 0.15s ease);
        }
        .chip:hover {
          background: var(--bg-tertiary, #f0f1f2);
        }
        .chip .dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--chip-color, transparent);
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0),
                      0 0 0 2px transparent;
          transition: box-shadow var(--transition-base, 0.15s ease);
          flex-shrink: 0;
        }
        .chip:hover .dot,
        .chip:focus-within .dot {
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0),
                      0 0 0 2px var(--accent-color, #10b981);
        }
        .chip .chip-label {
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.6875rem;
          color: var(--text-secondary, #64748b);
          letter-spacing: 0;
          white-space: nowrap;
        }
        .chip:hover .chip-label {
          color: var(--text-primary, #1a1a2e);
        }
        .chip pathogen-color-input {
          opacity: 0;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          padding: 0;
          margin: 0;
          border: 0;
          cursor: pointer;
        }

        /* Playground button — accent fill, always rightmost */
        .icon-btn.playground {
          background: var(--accent-color, #10b981);
          color: var(--accent-text, #ffffff);
          position: absolute;
          right: -0.6rem;
          top: 0.8rem;
          z-index: 6;
        }
        .icon-btn.playground:hover {
          background: var(--accent-hover, #059669);
          color: var(--accent-text, #ffffff);
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

        #editor-container {
          flex: 1;
          overflow: auto;
        }
        #editor-container .cm-editor {
          height: 100%;
          font-size: 13px;
        }
        #editor-container .cm-editor .cm-content { cursor: default; }
        #editor-container .cm-editor .cm-scroller {
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
        }
        #editor-container .cm-editor.cm-focused { outline: none; }

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

      <button class="mw-summary" id="summary" type="button" aria-expanded="false" aria-controls="glass-bar">
        <span class="chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 6l6 6-6 6"/></svg>
        </span>
        <h2 class="mw-title">${caption}</h2>
      </button>

      <button class="icon-btn playground playground-link" type="button" data-tip="Open in playground workspace" data-tip-align="right" aria-label="Open in playground workspace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>
      </button>

      <div class="glass-bar" id="glass-bar">
        <div class="glass-bar-inner">
          <button class="icon-btn${codeOpen ? ' active' : ''}" id="code-toggle" type="button" data-tip="Toggle code" data-tip-align="left" aria-pressed="${codeOpen}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3"/></svg>
          </button>

          <span class="chip-group" id="chip-group">${chipGroupInner}</span>

          <span class="glass-divider"></span>
          <button class="icon-btn" id="copy-btn" type="button" data-tip="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          </button>
          <button class="icon-btn" id="fullscreen-btn" type="button" data-tip="Fullscreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
          </button>
        </div>
      </div>

      <div class="content-area">
        <div class="code-panel">
          <div id="code-fallback"><code>${escapedCode}</code></div>
          <div id="editor-container"></div>
        </div>
        <div class="preview-panel">
          <mini-preview></mini-preview>
        </div>
      </div>
    `;
  }
}

customElements.define('mini-workspace', MiniWorkspace);
