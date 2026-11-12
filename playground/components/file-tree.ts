// The file tree (phase 2d, step 4a; docs/workspace-files.md "The file tree and
// tabs", mockup v6 screens O and J): the workspace's folders and files, and
// pathogen.json last, read-only. Files, beside Console in the breadcrumb,
// shows or hides it.
//
// A view only: workspace-view gives it the workspace's `files` (each with its
// kind), its `folders`, the `main` and the `active` file (the one in the
// editor), and opens what it asks for:
//   open-file  { path, focusEditor }  a file clicked or chosen with Space
//                                     (the keyboard stays here), or with Enter
//                                     (the keyboard goes to the editor)
// Folding is the tree's own: a folded folder stays folded while the tree lives.
//
// Keyboard (the WAI-ARIA tree pattern): one Tab stop; Up and Down move; Right
// unfolds a folder, then goes into it; Left folds it, or goes to the folder a
// row is in; Home and End; Space and Enter open a file or fold a folder.

import { FILE_ICONS } from '../utils/file-icons.js';
import { treeRows } from '../utils/file-tree-rows.js';
import styles from './file-tree.css';

import type { TreeFile, TreeRow } from '../utils/file-tree-rows.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MAIN_BADGE_TITLE = 'The main: first in pathogen.json’s entryPoints. Thumbnails and publishing use it';
const LOCK_TITLE = 'Read-only: the playground writes this file';

/** A file's name with its extension quiet: `kit` and `.pathogen`. */
function nameHtml(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return esc(name);
  return `${esc(name.slice(0, dot))}<span class="ext">${esc(name.slice(dot))}</span>`;
}

function rowHtml(row: TreeRow): string {
  const level = `style="--level: ${row.level}"`;
  if (row.type === 'empty') {
    return `<div class="row empty" aria-hidden="true" ${level}>Empty</div>`;
  }
  const common = `role="treeitem" data-path="${esc(row.path)}" title="${esc(row.path)}" aria-level="${row.level}" aria-posinset="${row.posinset}" aria-setsize="${row.setsize}" tabindex="-1" ${level}`;
  if (row.type === 'folder') {
    const label = row.empty ? ` aria-label="${esc(row.name)}, empty"` : '';
    return `<div class="row folder${row.expanded ? '' : ' folded'}" ${common} aria-expanded="${row.expanded}"${label}><span class="chev">${FILE_ICONS.chevron}</span><span class="icon">${FILE_ICONS.folder}</span><span class="name">${esc(row.name)}</span></div>`;
  }
  if (row.type === 'project') {
    return `<div class="row project" ${common}><span class="chev"></span><span class="icon">${FILE_ICONS.json}</span><span class="name">${nameHtml(row.name)}</span><span class="lock" title="${LOCK_TITLE}">${FILE_ICONS.lock}</span></div>`;
  }
  const badge = row.main ? `<span class="badge-main" title="${MAIN_BADGE_TITLE}">main</span>` : '';
  return `<div class="row file ${row.kind}" ${common}><span class="chev"></span><span class="icon">${FILE_ICONS[row.kind]}</span><span class="name">${nameHtml(row.name)}</span>${badge}</div>`;
}

const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export class FileTree extends HTMLElement {
  private _files: TreeFile[] = [];

  private _folders: string[] = [];

  private _active: string | null = null;

  private _main: string | null = null;

  private readonly _collapsed = new Set<string>();

  /** What the rows were last drawn from, so an unchanged tree never redraws. */
  private _drawn = '';

  /** The row that takes the Tab stop: the one last focused, while it's shown. */
  private _focusPath: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (this.shadowRoot!.firstChild) return;
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <div class="head" aria-hidden="true">Files</div>
      <div class="list" role="tree" aria-label="Files"></div>
    `;
    const list = this._list!;
    list.addEventListener('click', (e) => this._onClick(e));
    list.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    list.addEventListener('keydown', (e) => this._onKeydown(e));
    list.addEventListener('focusin', (e) => {
      const path = this._pathOf(e.target);
      if (path !== null) this._setFocusPath(path);
    });
    this._drawn = '';
    this._draw();
  }

  set files(files: TreeFile[]) {
    this._files = files;
    this._draw();
  }

  get files(): TreeFile[] {
    return this._files;
  }

  set folders(folders: string[]) {
    this._folders = folders;
    this._draw();
  }

  get folders(): string[] {
    return this._folders;
  }

  /** The file in the editor, marked in the tree. */
  set active(path: string | null) {
    this._active = path;
    this._mark();
  }

  get active(): string | null {
    return this._active;
  }

  /** The workspace's main, badged unless it's main.pathogen. */
  set main(path: string | null) {
    this._main = path;
    this._draw();
  }

  get main(): string | null {
    return this._main;
  }

  private get _list(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.list') ?? null;
  }

  private _items(): HTMLElement[] {
    return [...(this._list?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
  }

  private _item(path: string): HTMLElement | null {
    return this._items().find((el) => el.dataset.path === path) ?? null;
  }

  private _focused(): HTMLElement | null {
    const el = this.shadowRoot?.activeElement as HTMLElement | null;
    return el?.getAttribute('role') === 'treeitem' ? el : null;
  }

  private _draw(): void {
    const list = this._list;
    if (!list) return;
    const rows = treeRows(this._files, this._folders, { collapsed: this._collapsed, main: this._main });
    const key = JSON.stringify(rows);
    if (key !== this._drawn) {
      this._drawn = key;
      // The keyboard stays on its row across a redraw (a file added, a folder folded).
      const focused = this._focused()?.dataset.path ?? null;
      list.innerHTML = rows.map(rowHtml).join('');
      if (focused !== null) (this._item(focused) ?? this._item(parentOf(focused)) ?? this._items()[0])?.focus();
    }
    this._mark();
  }

  /** The file in the editor, and the one Tab stop. */
  private _mark(): void {
    const items = this._items();
    for (const el of items) {
      if (el.classList.contains('folder')) continue;
      const selected = el.dataset.path === this._active;
      el.setAttribute('aria-selected', String(selected));
      el.classList.toggle('active', selected);
    }
    const stop =
      items.find((el) => el.dataset.path === this._focusPath) ??
      items.find((el) => el.dataset.path === this._active) ??
      items[0];
    for (const el of items) el.tabIndex = el === stop ? 0 : -1;
  }

  private _setFocusPath(path: string): void {
    if (this._focusPath === path) return;
    this._focusPath = path;
    this._mark();
  }

  private _pathOf(target: EventTarget | null): string | null {
    const row = (target as HTMLElement | null)?.closest?.<HTMLElement>('[role="treeitem"]');
    return row?.dataset.path ?? null;
  }

  private _isFolder(path: string): boolean {
    return this._item(path)?.classList.contains('folder') ?? false;
  }

  private _toggle(path: string): void {
    if (this._collapsed.has(path)) this._collapsed.delete(path);
    else this._collapsed.add(path);
    this._draw();
  }

  private _open(path: string, focusEditor: boolean): void {
    this.dispatchEvent(new CustomEvent('open-file', { bubbles: true, composed: true, detail: { path, focusEditor } }));
  }

  private _onClick(e: MouseEvent): void {
    const path = this._pathOf(e.target);
    if (path === null) return;
    this._setFocusPath(path);
    if (this._isFolder(path)) this._toggle(path);
    else this._open(path, false);
  }

  private _onDoubleClick(e: MouseEvent): void {
    const path = this._pathOf(e.target);
    if (path !== null && !this._isFolder(path)) this._open(path, true);
  }

  private _moveTo(el: HTMLElement | undefined | null): void {
    if (!el) return;
    this._setFocusPath(el.dataset.path!);
    el.focus();
  }

  private _onKeydown(e: KeyboardEvent): void {
    // Keys with a modifier are the browser's (Alt+Left and Cmd+Left are Back).
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const current = this._focused();
    if (!current) return;
    const items = this._items();
    const at = items.indexOf(current);
    const path = current.dataset.path!;
    const folder = current.classList.contains('folder');
    const expanded = current.getAttribute('aria-expanded') === 'true';
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        this._moveTo(items[at + 1]);
        break;
      case 'ArrowUp':
        this._moveTo(items[at - 1]);
        break;
      case 'Home':
        this._moveTo(items[0]);
        break;
      case 'End':
        this._moveTo(items[items.length - 1]);
        break;
      case 'ArrowRight':
        if (folder && !expanded) this._toggle(path);
        else if (folder) {
          // Into the folder: the next row, if it's inside it.
          const next = items[at + 1];
          const inside = next && Number(next.getAttribute('aria-level')) > Number(current.getAttribute('aria-level'));
          if (inside) this._moveTo(next);
        }
        break;
      case 'ArrowLeft':
        if (folder && expanded) this._toggle(path);
        else this._moveTo(this._item(parentOf(path)));
        break;
      case 'Enter':
        if (folder) this._toggle(path);
        else this._open(path, true);
        break;
      case ' ':
        if (folder) this._toggle(path);
        else this._open(path, false);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }
}

customElements.define('file-tree', FileTree);

declare global {
  interface HTMLElementTagNameMap {
    'file-tree': FileTree;
  }
}
