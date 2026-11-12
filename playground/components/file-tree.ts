// The file tree (phase 2d, steps 4a and 4b; docs/workspace-files.md "The file
// tree and tabs" and "Adding files and folders", mockup v6 screens O, J and N):
// the workspace's folders and files, pathogen.json last and read-only, and the
// "+" that adds a program, a library or a folder. Files, beside Console in the
// breadcrumb, shows or hides it.
//
// A view only: workspace-view gives it the workspace's `files` (each with its
// kind), its `folders`, the `main`, the `active` file (the one in the editor)
// and `checkName` (whether a new name can be used, by the workspace's rules),
// and acts on what it asks for:
//   open-file     { path, focusEditor }  a file clicked or chosen with Space
//                                        (the keyboard stays here), or with
//                                        Enter (the keyboard goes to the editor)
//   create-entry  { kind, folder, name,  a name typed in the name field and
//                   focusEditor }        accepted: Enter (focusEditor), or
//                                        leaving the field (the keyboard stays
//                                        where you went)
// Folding is the tree's own: a folded folder stays folded while the tree lives.
//
// Keyboard (the WAI-ARIA tree pattern): one Tab stop; Up and Down move; Right
// unfolds a folder, then goes into it; Left folds it, or goes to the folder a
// row is in; Home and End; Space and Enter open a file or fold a folder. Keys
// with a modifier are left to the browser. The + menu: Up, Down, Home and End
// move; Escape closes it; Enter or Space chooses. The name field: Enter
// creates, Escape cancels.
//
// Where the + adds: the folder you clicked last, else the folder of the file
// in the editor (opening a file resets it), else the top of the workspace.

import { FILE_ICONS } from '../utils/file-icons.js';
import { treeRows } from '../utils/file-tree-rows.js';
import styles from './file-tree.css';

import type { NewEntryKind, TreeFile, TreeRow } from '../utils/file-tree-rows.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MAIN_BADGE_TITLE = 'The main: first in pathogen.json’s entryPoints. Thumbnails and publishing use it';
const LOCK_TITLE = 'Read-only: the playground writes this file';
const ADD_LABEL = 'Add a file or folder';
const KEYS_HINT = 'Enter to create, Esc to cancel';

/** Why a name can't be used (the message), or null when it can. */
export type NameCheck = (kind: NewEntryKind, folder: string, name: string) => string | null;

/** The + menu's items (Upload files… and Upload folder… join them in step 6). */
const ADD_ITEMS: { kind: NewEntryKind; label: string; detail: string; icon: string }[] = [
  { kind: 'program', label: 'New program', detail: 'A file that draws', icon: FILE_ICONS.program },
  { kind: 'library', label: 'New library', detail: 'Starts with <code>module;</code>', icon: FILE_ICONS.library },
  { kind: 'folder', label: 'New folder', detail: '', icon: FILE_ICONS.folderPlus },
];

const FIELD_LABELS: Record<NewEntryKind, string> = {
  program: 'New program name',
  library: 'New library name',
  folder: 'New folder name',
};

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
  if (row.type === 'input') {
    const icon = row.kind === 'folder' ? FILE_ICONS.folder : FILE_ICONS[row.kind];
    const ext = row.kind === 'folder' ? '' : '<span class="ext">.pathogen</span>';
    return `<div class="row input ${row.kind}" ${level}><span class="chev"></span><span class="icon">${icon}</span><span class="field"><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${FIELD_LABELS[row.kind]}" aria-describedby="name-hint" aria-invalid="false">${ext}</span></div><div class="name-hint" id="name-hint" aria-live="polite" ${level}></div>`;
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
const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);

/** The name field's line when nothing's wrong (mockup v6 screen N; v7 screen X for a first program). */
function defaultHint(kind: NewEntryKind, firstProgram: boolean): string {
  if (kind === 'library') return `Starts with <code>module;</code> · ${KEYS_HINT}`;
  if (kind === 'program' && firstProgram) return `The only program, so it becomes the main · ${KEYS_HINT}`;
  return KEYS_HINT;
}

export class FileTree extends HTMLElement {
  private _files: TreeFile[] = [];

  private _folders: string[] = [];

  private _active: string | null = null;

  private _main: string | null = null;

  /** Whether a name can be used, by the workspace's rules: workspace-view's answer. */
  checkName: NameCheck | null = null;

  private readonly _collapsed = new Set<string>();

  /** What the rows were last drawn from, so an unchanged tree never redraws. */
  private _drawn = '';

  private _rows: TreeRow[] = [];

  /** The row that takes the Tab stop: the one last focused, while it's shown. Opening a file resets it. */
  private _focusPath: string | null = null;

  /** A row to focus as soon as it's drawn: a folder just created. */
  private _pendingFocus: string | null = null;

  /** The name field, while New program, New library or New folder is being named. */
  private _naming: { kind: NewEntryKind; folder: string; value: string; error: string | null } | null = null;

  private _menuOpen = false;

  /** True while the rows' HTML is being replaced (see _draw). */
  private _redrawing = false;

  /** What the name field's line shows now, so typing that doesn't change it doesn't re-announce it. */
  private _hintShown = '';

  private readonly _onOutsidePointer = (e: Event): void => {
    const path = e.composedPath();
    if (!path.includes(this._menu!) && !path.includes(this._addButton!)) this._closeMenu(false);
  };

  /** The menu is placed once, when it opens; a resize closes it rather than leave it floating. */
  private readonly _onResize = (): void => this._closeMenu(false);

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (this.shadowRoot!.firstChild) return;
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <div class="head"><span class="title" aria-hidden="true">Files</span><button class="add" type="button" aria-label="${ADD_LABEL}" title="${ADD_LABEL}" aria-haspopup="menu" aria-expanded="false" aria-controls="add-menu">${FILE_ICONS.plus}</button></div>
      <div class="list" role="tree" aria-label="Files"></div>
      <div class="menu" id="add-menu" role="menu" aria-label="Add" hidden></div>
    `;
    const list = this._list!;
    list.addEventListener('click', (e) => this._onClick(e));
    list.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    list.addEventListener('keydown', (e) => this._onKeydown(e));
    list.addEventListener('focusin', (e) => {
      const path = this._pathOf(e.target);
      if (path !== null) this._setFocusPath(path);
    });
    const add = this._addButton!;
    add.addEventListener('click', () => (this._menuOpen ? this._closeMenu(true) : this._openMenu()));
    add.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !this._menuOpen) {
        e.preventDefault();
        this._openMenu();
      }
    });
    const menu = this._menu!;
    menu.addEventListener('keydown', (e) => this._onMenuKeydown(e));
    menu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
      if (!item) return;
      this._closeMenu(false);
      this._startNaming(item.dataset.kind as NewEntryKind);
    });
    this._drawn = '';
    this._draw();
  }

  disconnectedCallback(): void {
    this._closeMenu(false);
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

  /** The file in the editor, marked in the tree. Opening another file makes its folder where the + adds. */
  set active(path: string | null) {
    if (path !== this._active) this._focusPath = null;
    this._active = path;
    this._mark();
  }

  get active(): string | null {
    return this._active;
  }

  /** The workspace's main, badged unless it's main.pathogen; null when it has no programs. */
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

  private get _addButton(): HTMLButtonElement | null {
    return this.shadowRoot?.querySelector('.add') ?? null;
  }

  private get _menu(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.menu') ?? null;
  }

  private get _field(): HTMLInputElement | null {
    return this.shadowRoot?.querySelector('.row.input input') ?? null;
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
    const naming = this._naming ? { folder: this._naming.folder, kind: this._naming.kind } : null;
    const rows = treeRows(this._files, this._folders, { collapsed: this._collapsed, main: this._main, naming });
    this._rows = rows;
    const key = JSON.stringify(rows);
    if (key !== this._drawn) {
      this._drawn = key;
      // The keyboard stays on its row across a redraw (a file added, a folder folded), or in the name field.
      const focused = this._focused()?.dataset.path ?? null;
      const inField = this._field !== null && this.shadowRoot!.activeElement === this._field;
      // Chrome blurs a focused element as it's removed: a redraw must not read
      // that as leaving the name field (which would create the file early).
      this._redrawing = true;
      try {
        list.innerHTML = rows.map(rowHtml).join('');
      } finally {
        this._redrawing = false;
      }
      this._hintShown = '';
      if (this._naming) {
        const field = this._field!;
        field.value = this._naming.value;
        field.addEventListener('input', () => this._checkField());
        field.addEventListener('keydown', (e) => this._onFieldKeydown(e));
        field.addEventListener('blur', () => this._onFieldBlur());
        // The box is wider than the input: a click anywhere in it types into the field.
        field.parentElement!.addEventListener('mousedown', (e) => {
          if (e.target === field) return;
          e.preventDefault();
          field.focus();
        });
        this._checkField();
        if (inField) field.focus();
      } else if (focused !== null) {
        (this._item(focused) ?? this._item(parentOf(focused)) ?? this._items()[0])?.focus();
      }
    }
    if (this._pendingFocus !== null) {
      const row = this._item(this._pendingFocus);
      if (row) {
        this._pendingFocus = null;
        this._focusPath = row.dataset.path!;
        row.focus();
      }
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
    return this._rows.some((r) => r.type === 'folder' && r.path === path);
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

  // ---------- the + menu ----------

  /** Where the + adds: the folder clicked last, else the folder of the file in the editor, else the top. */
  private _target(): string {
    if (this._focusPath !== null && this._isFolder(this._focusPath)) return this._focusPath;
    if (this._active !== null && this._files.some((f) => f.path === this._active)) return parentOf(this._active);
    return '';
  }

  private _menuItems(): HTMLElement[] {
    return [...(this._menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  private _openMenu(): void {
    const menu = this._menu!;
    const add = this._addButton!;
    const target = this._target();
    menu.innerHTML = `<div class="menu-head" role="presentation">${target ? `Add to <code>${esc(target)}/</code>` : 'Add at the top'}</div>${ADD_ITEMS.map(
      (item) =>
        `<button type="button" role="menuitem" tabindex="-1" data-kind="${item.kind}"><span class="icon">${item.icon}</span><span><span class="label">${item.label}</span>${item.detail ? `<small>${item.detail}</small>` : ''}</span></button>`,
    ).join('')}`;
    menu.dataset.target = target;
    // Fixed, under the header, so it's never cut off by the tree's own edges.
    const host = this.getBoundingClientRect();
    const head = this.shadowRoot!.querySelector('.head')!.getBoundingClientRect();
    menu.style.left = `${host.left + 8}px`;
    menu.style.top = `${head.bottom + 2}px`;
    menu.style.width = `${Math.max(200, Math.min(240, host.width - 16))}px`;
    menu.hidden = false;
    this._menuOpen = true;
    add.setAttribute('aria-expanded', 'true');
    add.classList.add('on');
    document.addEventListener('pointerdown', this._onOutsidePointer, true);
    window.addEventListener('resize', this._onResize);
    this._menuItems()[0]?.focus();
  }

  private _closeMenu(returnFocus: boolean): void {
    if (!this._menuOpen) return;
    this._menuOpen = false;
    this._menu!.hidden = true;
    const add = this._addButton!;
    add.setAttribute('aria-expanded', 'false');
    add.classList.remove('on');
    document.removeEventListener('pointerdown', this._onOutsidePointer, true);
    window.removeEventListener('resize', this._onResize);
    if (returnFocus) add.focus();
  }

  private _onMenuKeydown(e: KeyboardEvent): void {
    const items = this._menuItems();
    const at = items.indexOf(this.shadowRoot!.activeElement as HTMLElement);
    let to: number | null = null;
    switch (e.key) {
      case 'ArrowDown':
        to = (at + 1) % items.length;
        break;
      case 'ArrowUp':
        to = (at - 1 + items.length) % items.length;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = items.length - 1;
        break;
      case 'Escape':
        // The menu's Escape is the menu's: no Escape handler further out (a dialog, fullscreen) sees it.
        e.preventDefault();
        e.stopPropagation();
        this._closeMenu(true);
        return;
      case 'Tab':
        // Back to the +, and Tab goes on from there.
        this._closeMenu(true);
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    items[to]?.focus();
  }

  // ---------- the name field ----------

  /** Whether a folder is in the workspace now (the top always is). */
  private _folderExists(folder: string): boolean {
    if (folder === '') return true;
    const inside = `${folder}/`;
    return (
      this._files.some((f) => f.path.startsWith(inside)) ||
      this._folders.some((f) => f === folder || f.startsWith(inside))
    );
  }

  private _startNaming(kind: NewEntryKind): void {
    // The folder the menu named, unless it went while the menu was open.
    let folder = this._menu!.dataset.target ?? this._target();
    if (!this._folderExists(folder)) folder = this._target();
    // The folder, and every folder it's in, unfolds to show the field.
    for (let f = folder; f !== ''; f = parentOf(f)) this._collapsed.delete(f);
    this._naming = { kind, folder, value: '', error: null };
    this._draw();
    const field = this._field;
    if (field) field.focus();
    else {
      // No field was drawn: never leave naming on, unseen.
      this._naming = null;
      this._draw();
      this._addButton?.focus();
    }
  }

  /** Check the typed name against the workspace's rules, and say so in the field and its line. */
  private _checkField(): void {
    const naming = this._naming;
    const field = this._field;
    if (!naming || !field) return;
    naming.value = field.value;
    // As wide as its text (the font is monospaced), so .pathogen follows the name as you type.
    field.style.width = `${Math.max(field.value.length, 1) + 1}ch`;
    const name = field.value.trim();
    naming.error = name === '' ? null : (this.checkName?.(naming.kind, naming.folder, name) ?? null);
    const bad = naming.error !== null;
    field.setAttribute('aria-invalid', String(bad));
    field.closest('.field')?.classList.toggle('bad', bad);
    // The line is a polite live region: it changes (and is announced) only when what it says changes.
    const shown = bad ? `bad:${naming.error}` : `ok:${naming.kind}:${this._main === null}`;
    if (shown === this._hintShown) return;
    this._hintShown = shown;
    const hint = this.shadowRoot!.querySelector<HTMLElement>('.name-hint')!;
    hint.classList.toggle('bad', bad);
    if (bad) hint.textContent = naming.error;
    else hint.innerHTML = defaultHint(naming.kind, this._main === null);
  }

  /** The typed name, if it can be used now. */
  private _goodName(): string | null {
    this._checkField();
    const naming = this._naming;
    const name = naming?.value.trim() ?? '';
    return naming && name !== '' && naming.error === null ? name : null;
  }

  private _endNaming(): void {
    this._naming = null;
    this._draw();
  }

  /**
   * Ask workspace-view to make it. `focusEditor`: Enter hands the keyboard to
   * the new file; leaving the field leaves it where you went.
   */
  private _create(name: string, focusEditor: boolean): void {
    const { kind, folder } = this._naming!;
    this._endNaming();
    // A new folder takes the keyboard once workspace-view has added it; a new file opens in the editor.
    if (kind === 'folder') this._pendingFocus = join(folder, name);
    this.dispatchEvent(
      new CustomEvent('create-entry', {
        bubbles: true,
        composed: true,
        detail: { kind, folder, name, focusEditor },
      }),
    );
    // workspace-view adds it as the event is handled. If it didn't (it refused, and said why),
    // a folder with that path appearing later mustn't take the keyboard.
    if (this._pendingFocus !== null && !this._item(this._pendingFocus)) this._pendingFocus = null;
  }

  private _onFieldKeydown(e: KeyboardEvent): void {
    // The field's keys are the field's. Without this, the Enter that makes a
    // folder reaches the tree's own keys after the new folder has taken the
    // keyboard, and folds it.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = this._goodName();
      if (name !== null) this._create(name, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._endNaming();
      this._addButton?.focus();
    }
  }

  /** Leaving the field: a good name is created (as VS Code does), an empty or refused one is dropped. */
  private _onFieldBlur(): void {
    if (!this._naming || this._redrawing) return;
    const name = this._goodName();
    if (name !== null) this._create(name, false);
    else this._endNaming();
  }
}

customElements.define('file-tree', FileTree);

declare global {
  interface HTMLElementTagNameMap {
    'file-tree': FileTree;
  }
}
