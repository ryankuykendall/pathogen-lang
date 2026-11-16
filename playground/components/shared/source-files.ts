// <source-files> — read-only code, one file or several (2e, step 3b; note 59,
// mockups v12 to v14, approved 2026-11-14).
//
// The one viewer for code the web app shows but doesn't edit: the code panel
// of <mini-workspace> (blog embeds, the snapshots page, the review modal) and,
// from step 6, the public workspace page. So it imports nothing that needs the
// playground's store: the file icons and the tree's own order are pure.
//
// Several files: a list beside the code, in the workspace tree's order and
// look (folders first, pathogen.json last, the `main` badge on the tree's
// rule), and a line naming the open file with the copy icon in a cell of its
// own. Narrower than NARROW_PX, the list becomes a menu above the code that
// opens the files as a bottom sheet. One file: the code alone, the copy icon
// floating in its top right corner.
//
// Properties: files (each with its path, text and kind, which the caller
// knows: a program or a module is the engine's call, not a regex), folders,
// main, open, copyLabel. activate() loads CodeMirror, from esm.sh as the blog
// viewer always has; until then the text shows plain. Switching files swaps
// the document, not the view. The theme follows `data-active-theme`.
//
// Events (bubbles + composed): source-file-open { path } when the reader opens a file.

import { FILE_ICONS, MAIN_BADGE_TITLE } from '../../utils/file-icons.js';
import { treeRows } from '../../utils/file-tree-rows.js';
import { PROJECT_FILE } from '../../utils/workspace-names.js';

import type { TreeFile, TreeRow } from '../../utils/file-tree-rows.js';

export interface SourceFile {
  /** Its workspace path: `parts/gears.pathogen`, or `pathogen.json`. */
  path: string;
  text: string;
  /** A program or a module, as the tree draws them; pathogen.json is the project file. */
  kind: 'program' | 'library' | 'project';
}

/** A CodeMirror module or object, loaded at run time from esm.sh: no types here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CmModule = any;

/** Below this width, the list becomes a menu (the review modal's ~520 px pane keeps the list). */
export const NARROW_PX = 480;
/** How long "Copied" (or the failure) shows. */
const FEEDBACK_MS = 2000;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A file's name with its extension quiet, as the tree draws it: `kit` and `.pathogen`. */
function nameHtml(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return esc(name);
  return `${esc(name.slice(0, dot))}<span class="ext">${esc(name.slice(dot))}</span>`;
}

/** A path with its folder quiet: `parts/` and `gears.pathogen`. */
function pathHtml(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0
    ? esc(path)
    : `<span class="dir">${esc(path.slice(0, slash + 1))}</span>${esc(path.slice(slash + 1))}`;
}

const iconOf = (kind: SourceFile['kind']): string => (kind === 'project' ? FILE_ICONS.json : FILE_ICONS[kind]);
/** A file's kind, held to the three the viewer draws (it lands in a class name and picks an icon). */
const kindOf = (file: SourceFile | undefined): SourceFile['kind'] =>
  file?.kind === 'library' ? 'library' : file?.kind === 'project' ? 'project' : 'program';
const modKey = (): string => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C');

const styles = `
  :host { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; }
  * { box-sizing: border-box; }
  .root { --sf-bg: #ffffff; display: flex; flex: 1; min-height: 0; min-width: 0; background: var(--sf-bg); }
  .root.dark { --sf-bg: #0d1117; }
  .root.several { flex-direction: row; }
  .root.narrow, .root.one { flex-direction: column; }
  .pane { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }

  /* The list: the workspace tree's rows (components/file-tree.css), a little smaller */
  .list { width: 188px; flex: none; overflow: auto; border-right: 1px solid var(--border-color, #e2e8f0); background: var(--bg-secondary, #fdf6ed); padding: 0 0 4px; }
  .head { display: flex; align-items: center; justify-content: space-between; height: 34px; padding: 0 10px 0 12px;
    font-family: var(--font-sans, system-ui, sans-serif); font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-tertiary, #9087a0); }
  .head .count { font-family: var(--font-mono, monospace); letter-spacing: 0; font-weight: 500; }
  [role='tree'] { outline: none; }
  .row { --indent: calc(6px + (var(--level, 1) - 1) * 16px); display: flex; align-items: center; gap: 6px; height: 26px;
    padding: 0 6px 0 var(--indent); font-family: var(--font-mono, 'Inconsolata', monospace); font-size: 12px; font-weight: 500;
    color: var(--text-primary, #1a1a2e); white-space: nowrap; user-select: none; outline: none; }
  .row.file, .row.project { cursor: pointer; }
  .row.file:hover, .row.project:hover { background: var(--hover-bg, rgba(0, 0, 0, 0.04)); }
  .row:focus-visible { box-shadow: inset 0 0 0 2px var(--focus-ring, rgba(148, 97, 196, 0.5)); }
  .row.active { background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16)); color: var(--secondary-accent-text, #5e3590); font-weight: 600; }
  .chev, .icon, .lock { flex: none; display: grid; place-items: center; }
  .chev { width: 14px; color: var(--text-tertiary, #9087a0); }
  .chev svg { width: 12px; height: 12px; }
  .icon { width: 14px; height: 14px; color: var(--text-secondary, #64748b); }
  .icon svg, .lock svg { width: 100%; height: 100%; }
  .row.library .icon, .path.library .icon, .menu.library .icon { color: var(--secondary-accent, #9461c4); }
  .row.folder .icon { color: var(--text-tertiary, #9087a0); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .ext { color: var(--text-tertiary, #9087a0); font-weight: 400; }
  .row.active .ext { color: inherit; opacity: 0.6; }
  .badge-main { flex: none; padding: 0 6px; border-radius: 999px; font-family: var(--font-sans, system-ui, sans-serif); font-size: 9.5px;
    font-weight: 600; letter-spacing: 0.02em; line-height: 14px; background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16));
    color: var(--secondary-accent-text, #5e3590); }
  .row.active .badge-main { background: var(--bg-elevated, #fff); }
  .row.project:not(.active) { color: var(--text-secondary, #64748b); font-weight: 400; }
  .row.project:not(.active) .icon { color: var(--text-tertiary, #9087a0); }
  .lock { width: 20px; height: 13px; color: var(--text-tertiary, #9087a0); }
  .lock svg { width: 13px; }
  .row.empty { padding-left: calc(var(--indent) + 20px); font-family: var(--font-sans, system-ui, sans-serif); font-style: italic;
    font-weight: 400; color: var(--text-tertiary, #9087a0); }

  /* The line naming the open file, and the phone's menu: the tabs' height, 34 px */
  .path, .menu-row { flex: none; display: flex; align-items: stretch; height: 34px; border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
    background: var(--sf-bg); position: relative; z-index: 2; }
  .path .p, .menu .p { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path { gap: 6px; align-items: center; padding-left: 12px; font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 600;
    color: var(--text-primary, #1a1a2e); }
  .path .icon, .menu .icon { width: 13px; height: 13px; }
  .dir { color: var(--text-tertiary, #9087a0); font-weight: 500; }
  .menu { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; background: none; cursor: pointer;
    font-family: var(--font-mono, monospace); font-size: 12.5px; font-weight: 600; color: var(--text-primary, #1a1a2e); text-align: left; }
  .menu .cv { display: grid; color: var(--text-tertiary, #9087a0); }
  .menu .cv svg { width: 12px; height: 12px; }
  .menu .count { margin-left: auto; font-family: var(--font-sans, system-ui, sans-serif); font-weight: 500; font-size: 11.5px; color: var(--text-tertiary, #9087a0); }

  /* The copy icon: in a cell of its own in a header (v14), floating with one file (v13) */
  .cell { position: relative; flex: none; display: grid; place-items: center; }
  .path .cell, .menu-row .cell { align-self: stretch; width: 38px; margin-left: auto; border-left: 1px solid var(--border-color, #e2e8f0); }
  .menu-row .cell { margin-left: 0; }
  .float { position: absolute; top: 6px; right: 8px; z-index: 5; }
  .cp { width: 26px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--text-secondary, #64748b);
    display: grid; place-items: center; cursor: pointer; }
  .cp svg { width: 15px; height: 15px; }
  .cp:hover { background: var(--hover-bg, rgba(0, 0, 0, 0.04)); color: var(--text-primary, #1a1a2e); }
  .cp:focus-visible { outline: 2px solid var(--focus-ring, rgba(148, 97, 196, 0.5)); outline-offset: 1px; }
  .float .cp { background: var(--bg-elevated, #fff); border-color: var(--border-color, #e2e8f0); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05)); }
  .cp.ok { color: var(--success-color, #10b981); }
  .cp.fail { color: var(--error-text, #dc2626); }
  .tip { position: absolute; top: calc(100% + 6px); right: -4px; z-index: 30; padding: 5px 9px; border-radius: 6px; white-space: nowrap;
    font: 400 12px/1.4 var(--font-sans, system-ui, sans-serif); background: #1c1722; color: #f6e9da; box-shadow: var(--shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1)); }
  .root.dark .tip { background: #f6e9da; color: #1c1722; }
  .tip code { font-family: var(--font-mono, monospace); font-size: 11.5px; }

  /* The code */
  .code { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .fallback { margin: 0; }
  .fallback code { display: block; padding: 0.75rem; font-family: var(--font-mono, 'Inconsolata', monospace); font-size: 13px; line-height: 1.5;
    white-space: pre; color: var(--text-primary, #1a1a2e); background: none; }
  .cm .cm-editor { height: 100%; font-size: 13px; }
  .cm .cm-editor .cm-content { cursor: default; }
  .cm .cm-editor .cm-scroller { font-family: var(--font-mono, 'Inconsolata', monospace); font-weight: 500; }
  .cm .cm-editor.cm-focused { outline: none; }
  .code.loaded .fallback { display: none; }
  .cm { height: 100%; }

  /* The phone's sheet: fixed to the window, over a scrim */
  .scrim { position: fixed; inset: 0; z-index: 10040; background: rgba(20, 16, 28, 0.42); }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10041; max-height: 70vh; overflow: auto; padding: 8px 10px 16px;
    border-radius: 18px 18px 0 0; background: var(--bg-elevated, #fff); box-shadow: var(--shadow-xl, 0 20px 25px rgba(0, 0, 0, 0.1)); }
  .grab { display: block; width: 40px; height: 4px; border-radius: 2px; background: var(--border-strong, rgba(0, 0, 0, 0.18)); margin: 2px auto 8px; }
  .sheet .head { padding: 0 6px 4px; height: 28px; }
  .sheet .row { --indent: calc(10px + (var(--level, 1) - 1) * 16px); height: 38px; font-size: 13px; border-radius: 8px; }
`;

export class SourceFiles extends HTMLElement {
  private _files: SourceFile[] = [];

  private _folders: string[] = [];

  private _main: string | null = null;

  private _open: string | null = null;

  private _copyLabel: string | null = null;

  private _narrow = false;

  private _sheet = false;

  private _copied: '' | 'ok' | 'fail' = '';

  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;

  private _resize: ResizeObserver | null = null;

  private _themeWatch: MutationObserver | null = null;

  private _dark = false;

  private _connected = false;

  /** activate() was asked for: the editor is wanted, now or once connected. */
  private _active = false;

  private readonly _onDocKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this._sheet) return;
    e.stopPropagation();
    this._closeSheet();
  };

  // CodeMirror, loaded by activate(): modules from esm.sh, untyped here as in <mini-workspace>.
  private _cm: { state: CmModule; view: CmModule; language: CmModule; github: CmModule; lang: unknown } | null = null;

  private _cmLoading: Promise<void> | null = null;

  private _view: CmModule = null;

  private _themeCompartment: CmModule = null;

  /** The text the editor holds now. */
  private _viewText: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set files(value: SourceFile[]) {
    this._files = [...value];
    this._render();
  }

  get files(): SourceFile[] {
    return this._files;
  }

  /** The workspace's folders, the empty ones shown too. */
  set folders(value: string[]) {
    this._folders = [...value];
    this._render();
  }

  /** The main: badged when it isn't main.pathogen, as in the tree. */
  set main(value: string | null) {
    this._main = value;
    this._render();
  }

  /** The file shown. One that isn't among the files falls back to the first program. */
  set open(value: string | null) {
    this._open = value;
    if (this._connected) this._showOpen();
  }

  get open(): string | null {
    return this._shownPath();
  }

  /** For a text that isn't a file (a blog sample): the copy icon's label, "the code". */
  set copyLabel(value: string | null) {
    this._copyLabel = value;
    this._render();
  }

  /** For tests and callers that measure themselves: the list (false) or the menu (true). */
  set narrow(value: boolean) {
    if (value === this._narrow) return;
    this._narrow = value;
    this._sheet = false;
    this._render();
  }

  get narrow(): boolean {
    return this._narrow;
  }

  /** The text of the file shown: what the copy icon copies. */
  get shownText(): string {
    return this._fileAt(this._shownPath())?.text ?? '';
  }

  connectedCallback(): void {
    this._connected = true;
    this._dark = document.documentElement.getAttribute('data-active-theme') === 'dark';
    this._themeWatch = new MutationObserver(() => this._themeChanged());
    this._themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-theme'] });
    // Escape closes the sheet wherever the keyboard is.
    document.addEventListener('keydown', this._onDocKey);
    if (typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width ?? 0;
        if (width <= 0) return;
        // A few pixels of give, so a width sitting at the line doesn't flip back and forth.
        if (width < NARROW_PX) this.narrow = true;
        else if (width > NARROW_PX + 8) this.narrow = false;
      });
      this._resize.observe(this);
    }
    this._render();
    // Re-attached after being activated: the editor comes back (its modules are already loaded).
    if (this._active) this.activate().catch(() => undefined);
  }

  disconnectedCallback(): void {
    this._connected = false;
    this._resize?.disconnect();
    this._resize = null;
    this._themeWatch?.disconnect();
    this._themeWatch = null;
    document.removeEventListener('keydown', this._onDocKey);
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._view?.destroy?.();
    this._view = null;
    this._viewText = null;
    this._cmLoading = null;
  }

  /** Load CodeMirror and show the open file in it (until then the text shows plain). */
  async activate(): Promise<void> {
    this._active = true;
    if (!this._connected) return;
    if (!this._cmLoading) {
      this._cmLoading = this._loadCodeMirror()
        .then(() => this._mountEditor())
        .catch((err: unknown) => {
          // The plain text stays; the next activate() tries again.
          this._cmLoading = null;
          console.warn('source-files: CodeMirror load failed:', err);
        });
    }
    await this._cmLoading;
  }

  // ─── What's shown ───────────────────────────────────────────────────

  private _several(): boolean {
    return this._files.length > 1 || this._folders.length > 0;
  }

  private _fileAt(path: string | null): SourceFile | undefined {
    return path === null ? undefined : this._files.find((f) => f.path === path);
  }

  private _shownPath(): string | null {
    if (this._open !== null && this._fileAt(this._open)) return this._open;
    return (this._files.find((f) => f.kind === 'program') ?? this._files[0])?.path ?? null;
  }

  /** The rows: the tree's order, with pathogen.json last only when it's among the files. */
  private _rows(): TreeRow[] {
    const treeFiles: TreeFile[] = this._files
      .filter((f) => f.kind !== 'project')
      .map((f) => ({ path: f.path, kind: f.kind === 'library' ? 'library' : 'program' }));
    const rows = treeRows(treeFiles, this._folders, { collapsed: new Set(), main: this._main });
    return this._files.some((f) => f.path === PROJECT_FILE) ? rows : rows.filter((r) => r.type !== 'project');
  }

  private _rowHtml(row: TreeRow): string {
    const level = `style="--level: ${row.level}"`;
    if (row.type === 'empty') return `<div class="row empty" aria-hidden="true" ${level}>Empty</div>`;
    if (row.type === 'folder') {
      return `<div class="row folder" role="treeitem" aria-level="${row.level}" aria-expanded="true" ${level}><span class="chev">${FILE_ICONS.chevron}</span><span class="icon">${FILE_ICONS.folder}</span><span class="name">${esc(row.name)}</span></div>`;
    }
    if (row.type === 'input') return '';
    const shown = row.path === this._shownPath();
    const attrs = `role="treeitem" data-path="${esc(row.path)}" aria-level="${row.level}" aria-selected="${shown}" tabindex="${shown ? 0 : -1}" title="${esc(row.path)}" ${level}`;
    if (row.type === 'project') {
      return `<div class="row project${shown ? ' active' : ''}" ${attrs}><span class="chev"></span><span class="icon">${FILE_ICONS.json}</span><span class="name">${nameHtml(row.name)}</span><span class="lock" title="Read-only: written from the program list">${FILE_ICONS.lock}</span></div>`;
    }
    const badge = row.main ? `<span class="badge-main" title="${esc(MAIN_BADGE_TITLE)}">main</span>` : '';
    return `<div class="row file ${row.kind}${shown ? ' active' : ''}" ${attrs}><span class="chev"></span><span class="icon">${FILE_ICONS[row.kind]}</span><span class="name">${nameHtml(row.name)}</span>${badge}</div>`;
  }

  private _treeHtml(): string {
    return `<div class="head"><span>Files</span><span class="count">${this._files.length}</span></div><div role="tree" aria-label="Files">${this._rows()
      .map((r) => this._rowHtml(r))
      .join('')}</div>`;
  }

  private _copyHtml(): string {
    const path = this._shownPath();
    const what = this._copyLabel ?? path ?? '';
    const label = `Copy ${what}`;
    const icon =
      this._copied === 'ok' ? FILE_ICONS.check : this._copied === 'fail' ? FILE_ICONS.close : FILE_ICONS.copy;
    const named = this._copyLabel ? esc(this._copyLabel) : `<code>${esc(what)}</code>`;
    const tip =
      this._copied === 'ok'
        ? `<span class="tip" role="status">Copied ${named}</span>`
        : this._copied === 'fail'
          ? `<span class="tip" role="status">Couldn't copy. Select the text and press ${modKey()}</span>`
          : '';
    return `<button class="cp ${this._copied}" type="button" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>${tip}`;
  }

  private _codeHtml(): string {
    return `<div class="code"><pre class="fallback"><code>${esc(this.shownText)}</code></pre><div class="cm"></div></div>`;
  }

  private _headerHtml(): string {
    const path = this._shownPath() ?? '';
    const kind = kindOf(this._fileAt(path));
    if (this._narrow) {
      const n = this._files.length;
      return `<div class="menu-row"><button class="menu ${kind}" type="button" aria-haspopup="dialog" aria-expanded="${this._sheet}" title="${esc(path)}"><span class="icon">${iconOf(kind)}</span><span class="p">${pathHtml(path)}</span><span class="cv">${FILE_ICONS.chevron}</span><span class="count">${n} file${n === 1 ? '' : 's'}</span></button><span class="cell">${this._copyHtml()}</span></div>`;
    }
    return `<div class="path ${kind}" title="${esc(path)}"><span class="icon">${iconOf(kind)}</span><span class="p">${pathHtml(path)}</span><span class="cell">${this._copyHtml()}</span></div>`;
  }

  /** Lay everything out again: the files, their shape or the width changed. */
  private _render(): void {
    if (!this._connected) return;
    const root = this.shadowRoot!;
    const several = this._several();
    const mode = !several ? 'one' : this._narrow ? 'narrow' : 'several';
    let body: string;
    if (mode === 'one') {
      body = `<div class="pane">${this._codeHtml()}<span class="cell float">${this._copyHtml()}</span></div>`;
    } else if (mode === 'narrow') {
      const sheet = this._sheet
        ? `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Files"><span class="grab"></span>${this._treeHtml()}</div>`
        : '';
      body = `<div class="pane">${this._headerHtml()}${this._codeHtml()}</div>${sheet}`;
    } else {
      body = `<div class="list">${this._treeHtml()}</div><div class="pane">${this._headerHtml()}${this._codeHtml()}</div>`;
    }
    // The editor's DOM survives a re-layout: it's moved into the new code box, keeping its place.
    const editorDom = this._view?.dom as HTMLElement | undefined;
    const scrollTop = this._view ? (this._view.scrollDOM.scrollTop as number) : 0;
    root.innerHTML = `<style>${styles}</style><div class="root ${mode}${this._dark ? ' dark' : ''}">${body}</div>`;
    if (editorDom) {
      root.querySelector('.cm')?.appendChild(editorDom);
      root.querySelector('.code')?.classList.add('loaded');
      // New files, or a file now gone: the editor follows. A width change alone keeps its place.
      if (this._viewText !== this.shownText) this._showInEditor();
      else {
        this._view.scrollDOM.scrollTop = scrollTop;
        // Moved into a new box, the editor measures its lines again, or the gutter's numbers drift.
        this._view.requestMeasure();
      }
    }
    this._wire();
  }

  /** The file shown changed: rows, the header and the code follow, keeping the layout (and focus). */
  private _showOpen(): void {
    const root = this.shadowRoot!;
    const shown = this._shownPath();
    root.querySelectorAll<HTMLElement>('[data-path]').forEach((row) => {
      const on = row.dataset.path === shown;
      row.classList.toggle('active', on);
      row.setAttribute('aria-selected', String(on));
      row.tabIndex = on ? 0 : -1;
    });
    this._copied = '';
    const header = root.querySelector('.path, .menu-row');
    if (header) header.outerHTML = this._headerHtml();
    const float = root.querySelector('.float');
    if (float) float.innerHTML = this._copyHtml();
    const fallback = root.querySelector('.fallback code');
    if (fallback) fallback.textContent = this.shownText;
    this._wireHeader();
    this._showInEditor();
  }

  // ─── Events ─────────────────────────────────────────────────────────

  /** Close the sheet, and give the keyboard back to the menu that opened it. */
  private _closeSheet(): void {
    this._sheet = false;
    this._render();
    this.shadowRoot!.querySelector<HTMLElement>('.menu')?.focus();
  }

  private _pick(path: string): void {
    const changed = path !== this._shownPath();
    this._open = path;
    if (this._sheet) {
      this._closeSheet();
    } else if (changed) {
      this._showOpen();
    }
    if (changed)
      this.dispatchEvent(new CustomEvent('source-file-open', { detail: { path }, bubbles: true, composed: true }));
  }

  private _wire(): void {
    const root = this.shadowRoot!;
    root.querySelectorAll<HTMLElement>('[role="tree"]').forEach((tree) => {
      tree.addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-path]');
        if (row?.dataset.path) this._pick(row.dataset.path);
      });
      tree.addEventListener('keydown', (e) => this._treeKey(e, tree));
    });
    root.querySelector('.scrim')?.addEventListener('click', () => this._closeSheet());
    if (this._sheet) root.querySelector<HTMLElement>('.sheet [aria-selected="true"]')?.focus();
    this._wireHeader();
  }

  /** The header's own controls, freshly drawn: the copy icon, and the phone's menu. */
  private _wireHeader(): void {
    this._wireCopy();
    this.shadowRoot!.querySelector('.menu')?.addEventListener('click', () => {
      this._sheet = true;
      this._render();
    });
  }

  private _wireCopy(): void {
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('.cp').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this._copy().catch(() => undefined);
      });
    });
  }

  /** Arrow keys move between the files (folders are passed over); Enter or Space opens one. */
  private _treeKey(e: KeyboardEvent, tree: HTMLElement): void {
    const rows = [...tree.querySelectorAll<HTMLElement>('[data-path]')];
    const at = rows.indexOf((e.target as HTMLElement).closest<HTMLElement>('[data-path]') as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, at + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) {
      e.preventDefault();
      this._pick(rows[at].dataset.path!);
      return;
    } else return;
    e.preventDefault();
    if (next < 0 || !rows[next]) return;
    rows.forEach((r, i) => {
      r.tabIndex = i === next ? 0 : -1;
    });
    rows[next].focus();
  }

  /** Copy the file shown. "Copied" only once the clipboard has taken it; a refusal says so. */
  private async _copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shownText);
      this._copied = 'ok';
    } catch {
      this._copied = 'fail';
    }
    // After the wait: a second copy made meanwhile mustn't leave this one's timer to cut its "Copied" short.
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._refreshCopy();
    this._copiedTimer = setTimeout(() => {
      this._copied = '';
      this._refreshCopy();
    }, FEEDBACK_MS);
  }

  private _refreshCopy(): void {
    this.shadowRoot!.querySelectorAll('.cell').forEach((cell) => {
      cell.innerHTML = this._copyHtml();
    });
    this._wireCopy();
  }

  // ─── Theme ──────────────────────────────────────────────────────────

  private _themeChanged(): void {
    const dark = document.documentElement.getAttribute('data-active-theme') === 'dark';
    if (dark === this._dark) return;
    this._dark = dark;
    this.shadowRoot!.querySelector('.root')?.classList.toggle('dark', dark);
    if (this._view && this._themeCompartment && this._cm) {
      this._view.dispatch({ effects: this._themeCompartment.reconfigure(this._themeExtension()) });
    }
  }

  private _themeExtension(): unknown {
    return this._dark ? this._cm!.github.githubDark : this._cm!.github.githubLight;
  }

  // ─── CodeMirror ─────────────────────────────────────────────────────

  private async _loadCodeMirror(): Promise<void> {
    if (this._cm) return;
    const [state, view, language, github] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/@codemirror/language@6'),
      import('https://esm.sh/@uiw/codemirror-theme-github@4'),
    ]);
    // Pathogen's own parser: the playground's, else the small highlight bundle (static pages).
    const global = (window as unknown as { PathogenLang?: { editorParser?: unknown; lezerParser?: unknown } })
      .PathogenLang;
    let parser: unknown = global?.editorParser ?? global?.lezerParser ?? null;
    if (!parser) {
      try {
        // A variable, so the test runner's bundler doesn't try to load it (it's served, not a module of the repo).
        const bundle = '/dist/highlight.global.js';
        const mod = (await import(/* @vite-ignore */ bundle)) as { editorParser?: unknown; lezerParser?: unknown };
        parser = mod.editorParser ?? mod.lezerParser ?? null;
      } catch {
        parser = null;
      }
    }
    const lang = parser
      ? new language.LanguageSupport(
          language.LRLanguage.define({ parser, languageData: { commentTokens: { line: '//' } } }),
        )
      : [];
    this._cm = { state, view, language, github, lang };
  }

  private _stateFor(text: string): unknown {
    const { state, view, lang } = this._cm!;
    return state.EditorState.create({
      doc: text,
      extensions: [
        view.lineNumbers(),
        view.highlightSpecialChars(),
        view.drawSelection(),
        view.highlightActiveLine(),
        this._themeCompartment.of(this._themeExtension()),
        lang,
        view.EditorView.lineWrapping,
        state.EditorState.readOnly.of(true),
      ],
    });
  }

  private _mountEditor(): void {
    if (!this._cm || !this._connected) return;
    const host = this.shadowRoot!.querySelector('.cm');
    if (!host || this._view) return;
    this._themeCompartment = new this._cm.state.Compartment();
    this._viewText = this.shownText;
    this._view = new this._cm.view.EditorView({ state: this._stateFor(this._viewText), parent: host });
    this.shadowRoot!.querySelector('.code')?.classList.add('loaded');
  }

  /** Swap the document for the file shown: a fresh state in the same view. */
  private _showInEditor(): void {
    if (!this._view || !this._cm) return;
    this._viewText = this.shownText;
    this._view.setState(this._stateFor(this._viewText));
    this._view.scrollDOM.scrollTop = 0;
  }
}

customElements.define('source-files', SourceFiles);
