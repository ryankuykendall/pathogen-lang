// Annotated output pane component with read-only CodeMirror

import { themeManager } from '../utils/theme.js';
import styles from './annotated-pane.css';

// CodeMirror module types (dynamically imported from ESM CDN)
interface CmStateModule {
  Compartment: new () => { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown };
  EditorState: { create(config: unknown): unknown; readOnly: { of(value: boolean): unknown } };
}

interface CmViewModule {
  EditorView: {
    new (config: unknown): CmEditorView;
    lineWrapping: unknown;
    editable: { of(value: boolean): unknown };
    scrollIntoView(pos: number, options?: unknown): unknown;
  };
  lineNumbers(): unknown;
  highlightSpecialChars(): unknown;
  drawSelection(): unknown;
  highlightActiveLine(): unknown;
}

interface CmEditorView {
  state: { doc: { length: number; toString(): string } };
  dispatch(tr: unknown): void;
  destroy(): void;
}

interface CmLanguageModule {
  syntaxHighlighting(style: unknown): unknown;
  defaultHighlightStyle: unknown;
}

interface CmLangJsModule {
  javascript(): unknown;
}

interface CmOneDarkModule {
  oneDarkTheme: unknown;
  oneDarkHighlightStyle: unknown;
}

interface CmModules {
  state: CmStateModule;
  view: CmViewModule;
  language: CmLanguageModule;
  langJs: CmLangJsModule;
  oneDark: CmOneDarkModule;
}

export class AnnotatedPane extends HTMLElement {
  private _isOpen: boolean;
  private _editor: CmEditorView | null;
  private _content: string;
  private _cmModules: CmModules | null;
  private _themeCompartment: { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown } | null;
  private _themeUnsubscribe: (() => void) | null;

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

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
  }

  setupEventListeners(): void {
    (this.shadowRoot!.querySelector('#copy-btn') as HTMLButtonElement).addEventListener('click', () => {
      this.copyContent();
    });
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async open(): Promise<void> {
    this._isOpen = true;
    this.classList.add('open');

    // Create editor if not exists
    if (!this._editor) {
      await this.createEditor();
    }

    this.dispatchEvent(new CustomEvent('open'));
  }

  close(): void {
    this._isOpen = false;
    this.classList.remove('open');
    this.dispatchEvent(new CustomEvent('close'));
  }

  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  set content(value: string) {
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

  get content(): string {
    return this._content;
  }

  async loadCodeMirror(): Promise<CmModules> {
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

  private _getThemeExtensions(): unknown[] {
    const { language, oneDark } = this._cmModules!;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [oneDark.oneDarkTheme, language.syntaxHighlighting(oneDark.oneDarkHighlightStyle)];
    }
    return [language.syntaxHighlighting(language.defaultHighlightStyle)];
  }

  async createEditor(): Promise<void> {
    const container = this.shadowRoot!.querySelector('#editor-container') as HTMLElement | null;
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

  private _updateEditorTheme(): void {
    if (!this._editor || !this._themeCompartment) return;

    this._editor.dispatch({
      effects: this._themeCompartment.reconfigure(this._getThemeExtensions()),
    });
  }

  async copyContent(): Promise<void> {
    const text = this._editor ? this._editor.state.doc.toString() : this._content;

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.shadowRoot!.querySelector('#copy-btn') as HTMLButtonElement;
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

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="header">
        <span>Annotated Output</span>
        <button id="copy-btn" class="copy-btn">Copy</button>
      </div>
      <div id="editor-container"></div>
    `;
  }
}

customElements.define('annotated-pane', AnnotatedPane);
