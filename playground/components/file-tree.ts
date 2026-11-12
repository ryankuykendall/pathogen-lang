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
//   file-action   { action, path }       a row's own menu (step 4c): set-main,
//                                        duplicate or delete; workspace-view
//                                        asks before a delete
// Each file's and folder's ⋮, a right-click or the menu key opens its menu;
// a folder's menu adds to that folder. rowAfterRemoval and focusRow let
// workspace-view put the keyboard back in the tree after a dialog.
// Folding is the tree's own: a folded folder stays folded while the tree lives.
//
// Keyboard (the WAI-ARIA tree pattern): one Tab stop; Up and Down move; Right
// unfolds a folder, then goes into it; Left folds it, or goes to the folder a
// row is in; Home and End; Space and Enter open a file or fold a folder. Keys
// with a modifier are left to the browser. The + menu: Up, Down, Home and End
// move; Escape closes it; Enter or Space chooses. The name field: Enter
// creates, Escape cancels.
//
// Where the + adds: the folder of the row you're on (clicked or reached with
// the keyboard; a file row gives its folder), else the folder of the file in
// the editor (opening a file resets the row), else the top of the workspace.

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

/** What a menu item does: name a new file or folder (the tree's own), or a file-action for workspace-view. */
export type MenuAction = 'new-program' | 'new-library' | 'new-folder' | 'set-main' | 'duplicate' | 'delete';

interface MenuItem {
  action: MenuAction;
  label: string;
  /** A line under the label; may hold <code>. */
  detail?: string;
  icon: string;
  danger?: boolean;
}

type MenuEntry = MenuItem | 'divider';

const NEW_KIND: Partial<Record<MenuAction, NewEntryKind>> = {
  'new-program': 'program',
  'new-library': 'library',
  'new-folder': 'folder',
};

/** The + menu's items, and a folder's menu's first ones (Upload files… and Upload folder… join them in step 6). */
const ADD_ITEMS: MenuItem[] = [
  { action: 'new-program', label: 'New program', detail: 'A file that draws', icon: FILE_ICONS.program },
  { action: 'new-library', label: 'New library', detail: 'Starts with <code>module;</code>', icon: FILE_ICONS.library },
  { action: 'new-folder', label: 'New folder', icon: FILE_ICONS.folderPlus },
];

const SET_MAIN: MenuItem = {
  action: 'set-main',
  label: 'Set as main',
  detail: 'Puts it first in pathogen.json. Thumbnails and publishing use the main',
  icon: FILE_ICONS.star,
};
const DUPLICATE: MenuItem = { action: 'duplicate', label: 'Duplicate', icon: FILE_ICONS.copy };
const DELETE_FILE: MenuItem = { action: 'delete', label: 'Delete…', icon: FILE_ICONS.trash, danger: true };
const DELETE_FOLDER: MenuItem = { ...DELETE_FILE, detail: 'The folder and its files, after asking' };

/** "Add to parts/" or "Add at the top": where a New item puts the file. */
const addHead = (folder: string): string => (folder ? `Add to <code>${esc(folder)}/</code>` : 'Add at the top');

function menuHtml(head: string | null, entries: MenuEntry[]): string {
  const items = entries.map((entry) => {
    if (entry === 'divider') return '<div class="menu-divider" role="separator"></div>';
    const detail = entry.detail ? `<small>${entry.detail}</small>` : '';
    return `<button type="button" role="menuitem" tabindex="-1" data-action="${entry.action}"${entry.danger ? ' class="danger"' : ''}><span class="icon">${entry.icon}</span><span><span class="label">${entry.label}</span>${detail}</span></button>`;
  });
  return `${head !== null ? `<div class="menu-head" role="presentation">${head}</div>` : ''}${items.join('')}`;
}

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
  // A row's own menu (step 4c), for the pointer. The keyboard opens it from the row itself
  // (Shift+F10 or the menu key), and the row says it has one (aria-haspopup), so the ⋮ stays
  // out of the row's spoken name.
  const dots = `<button class="row-menu" type="button" tabindex="-1" aria-hidden="true" title="More">${FILE_ICONS.kebab}</button>`;
  if (row.type === 'folder') {
    const label = row.empty ? ` aria-label="${esc(row.name)}, empty"` : '';
    return `<div class="row folder${row.expanded ? '' : ' folded'}" ${common} aria-haspopup="menu" aria-expanded="${row.expanded}"${label}><span class="chev">${FILE_ICONS.chevron}</span><span class="icon">${FILE_ICONS.folder}</span><span class="name">${esc(row.name)}</span>${dots}</div>`;
  }
  if (row.type === 'project') {
    return `<div class="row project" ${common}><span class="chev"></span><span class="icon">${FILE_ICONS.json}</span><span class="name">${nameHtml(row.name)}</span><span class="lock" title="${LOCK_TITLE}">${FILE_ICONS.lock}</span></div>`;
  }
  const badge = row.main ? `<span class="badge-main" title="${MAIN_BADGE_TITLE}">main</span>` : '';
  return `<div class="row file ${row.kind}" ${common} aria-haspopup="menu"><span class="chev"></span><span class="icon">${FILE_ICONS[row.kind]}</span><span class="name">${nameHtml(row.name)}</span>${badge}${dots}</div>`;
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

  /** The open menu: the button that opened it (the + or a row's ⋮), where the keyboard goes back to, its row, and the folder its New items add to. */
  private _menuOpener: HTMLElement | null = null;

  private _menuReturn: HTMLElement | null = null;

  private _menuPath: string | null = null;

  private _menuTarget = '';

  /** True while the rows' HTML is being replaced (see _draw). */
  private _redrawing = false;

  /** What the name field's line shows now, so typing that doesn't change it doesn't re-announce it. */
  private _hintShown = '';

  private readonly _onOutsidePointer = (e: Event): void => {
    const path = e.composedPath();
    // The opener's own click toggles the menu; it isn't "outside".
    if (path.includes(this._menu!) || (this._menuOpener && path.includes(this._menuOpener))) return;
    this._closeMenu(false);
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
    // A right-click on a row (and, on most systems, the menu key or Shift+F10): its own menu.
    // pathogen.json, the name field and the empty space below the rows have none, so the
    // browser's own menu shows there.
    list.addEventListener('contextmenu', (e) => {
      const path = this._pathOf(e.target);
      if (path === null || !this._item(path)?.querySelector('.row-menu')) return;
      e.preventDefault();
      this._openRowMenu(path);
    });
    const add = this._addButton!;
    add.addEventListener('click', () => (this._menuOpener === add ? this._closeMenu(true) : this._openAddMenu()));
    add.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !this._menuOpen) {
        e.preventDefault();
        this._openAddMenu();
      }
    });
    const menu = this._menu!;
    menu.addEventListener('keydown', (e) => this._onMenuKeydown(e));
    menu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
      if (item) this._choose(item.dataset.action as MenuAction);
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
    /** The keyboard was in a menu that this redraw closed: it goes to the tree's Tab stop. */
    let focusStop = false;
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
      // A row's menu: its ⋮ was just drawn again. Still there, the menu stays with it;
      // gone, the menu closes, and the keyboard stays in the tree.
      if (this._menuOpen && this._menuOpener && !this._menuOpener.isConnected) {
        const row = this._menuPath !== null ? this._item(this._menuPath) : null;
        const dots = row?.querySelector<HTMLElement>('.row-menu');
        if (row && dots) {
          this._menuOpener = dots;
          this._menuReturn = row;
          dots.classList.add('on');
          row.classList.add('menu-open');
        } else {
          const hadFocus = this._menu!.contains(this.shadowRoot!.activeElement);
          this._closeMenu(false);
          focusStop = hadFocus;
        }
      }
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
    if (focusStop) this.focusTabStop();
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
    // The ⋮ opens (or closes) the row's menu; it doesn't open the file or fold the folder.
    const dots = (e.target as HTMLElement).closest<HTMLElement>('.row-menu');
    if (dots) {
      if (this._menuOpener === dots) this._closeMenu(true);
      else this._openRowMenu(path);
      return;
    }
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
    // The row's own menu from the keyboard: Shift+F10 or the menu key. A Mac sends no
    // contextmenu event for either, so they're handled here.
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)) {
      const path = this._pathOf(e.target);
      if (path !== null && this._item(path)?.querySelector('.row-menu')) {
        e.preventDefault();
        this._openRowMenu(path);
      }
      return;
    }
    // Other keys with a modifier are the browser's (Alt+Left and Cmd+Left are Back).
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

  /**
   * Where the + adds: the folder of the row you're on (the folder itself, or a
   * file's folder), else the folder of the file in the editor, else the top.
   */
  private _target(): string {
    const at = this._focusPath;
    if (at !== null && this._isFolder(at)) return at;
    if (at !== null && this._files.some((f) => f.path === at)) return parentOf(at);
    if (this._active !== null && this._files.some((f) => f.path === this._active)) return parentOf(this._active);
    return '';
  }

  private _menuItems(): HTMLElement[] {
    return [...(this._menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  /**
   * Show a menu. Fixed, so the tree's own edges never cut it off, at `place`;
   * flipped above `flipAbove` when there's no room below. `opener` shows it's
   * open; the keyboard goes back to `returnTo` when it closes.
   */
  private _showMenu(spec: {
    opener: HTMLElement;
    returnTo: HTMLElement;
    head: string | null;
    entries: MenuEntry[];
    target: string;
    path: string | null;
    place: { left: number; top: number; width: number };
    flipAbove: number;
  }): void {
    this._closeMenu(false);
    const menu = this._menu!;
    menu.innerHTML = menuHtml(spec.head, spec.entries);
    this._menuTarget = spec.target;
    this._menuPath = spec.path;
    this._menuOpener = spec.opener;
    this._menuReturn = spec.returnTo;
    const width = Math.min(spec.place.width, window.innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(spec.place.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${spec.place.top}px`;
    menu.hidden = false;
    const height = menu.getBoundingClientRect().height;
    if (height > 0 && spec.place.top + height > window.innerHeight - 8) {
      menu.style.top = `${Math.max(8, spec.flipAbove - height)}px`;
    }
    this._menuOpen = true;
    if (spec.opener.hasAttribute('aria-haspopup')) spec.opener.setAttribute('aria-expanded', 'true');
    spec.opener.classList.add('on');
    if (spec.path !== null) this._item(spec.path)?.classList.add('menu-open');
    document.addEventListener('pointerdown', this._onOutsidePointer, true);
    window.addEventListener('resize', this._onResize);
    // It's placed once: a scroll of the tree or the page would leave it over the wrong row.
    this._list?.addEventListener('scroll', this._onResize);
    window.addEventListener('scroll', this._onResize, true);
    this._menuItems()[0]?.focus();
  }

  /** The +: New program, New library, New folder, where the + adds. */
  private _openAddMenu(): void {
    const add = this._addButton!;
    const target = this._target();
    const host = this.getBoundingClientRect();
    const head = this.shadowRoot!.querySelector('.head')!.getBoundingClientRect();
    this._showMenu({
      opener: add,
      returnTo: add,
      head: addHead(target),
      entries: ADD_ITEMS,
      target,
      path: null,
      place: { left: host.left + 8, top: head.bottom + 2, width: Math.max(200, Math.min(240, host.width - 16)) },
      flipAbove: head.top,
    });
  }

  /**
   * A row's own menu (mockup v6 screen E, v7 screen F). A program: Set as main
   * (unless it is the main), Duplicate, Delete…. A library: Duplicate,
   * Delete…. A folder: the + items for that folder, then Delete….
   */
  private _openRowMenu(path: string): void {
    const row = this._item(path);
    const dots = row?.querySelector<HTMLElement>('.row-menu');
    if (!row || !dots) return;
    // Already open for this row (the key and the browser's contextmenu both asked): leave it.
    if (this._menuOpen && this._menuOpener === dots) return;
    let head: string | null = null;
    let entries: MenuEntry[];
    if (row.classList.contains('folder')) {
      head = addHead(path);
      entries = [...ADD_ITEMS, 'divider', DELETE_FOLDER];
    } else if (row.classList.contains('program') && path !== this._main) {
      entries = [SET_MAIN, 'divider', DUPLICATE, 'divider', DELETE_FILE];
    } else {
      entries = [DUPLICATE, 'divider', DELETE_FILE];
    }
    const rowRect = row.getBoundingClientRect();
    const dotsRect = dots.getBoundingClientRect();
    this._setFocusPath(path);
    this._showMenu({
      opener: dots,
      returnTo: row,
      head,
      entries,
      target: row.classList.contains('folder') ? path : parentOf(path),
      path,
      place: { left: dotsRect.left - 4, top: rowRect.bottom - 2, width: 300 },
      flipAbove: rowRect.top + 2,
    });
  }

  /** A menu item chosen: name a new file or folder here, or ask workspace-view to act on the row. */
  private _choose(action: MenuAction): void {
    const target = this._menuTarget;
    const path = this._menuPath;
    const kind = NEW_KIND[action];
    this._closeMenu(kind === undefined);
    if (kind !== undefined) this._startNaming(kind, target);
    else if (path !== null) {
      this.dispatchEvent(new CustomEvent('file-action', { bubbles: true, composed: true, detail: { action, path } }));
    }
  }

  private _closeMenu(returnFocus: boolean): void {
    if (!this._menuOpen) return;
    this._menuOpen = false;
    this._menu!.hidden = true;
    const opener = this._menuOpener;
    if (opener?.hasAttribute('aria-haspopup')) opener.setAttribute('aria-expanded', 'false');
    opener?.classList.remove('on');
    if (this._menuPath !== null) this._item(this._menuPath)?.classList.remove('menu-open');
    document.removeEventListener('pointerdown', this._onOutsidePointer, true);
    window.removeEventListener('resize', this._onResize);
    this._list?.removeEventListener('scroll', this._onResize);
    window.removeEventListener('scroll', this._onResize, true);
    const back = this._menuReturn;
    this._menuOpener = null;
    this._menuReturn = null;
    if (returnFocus && back?.isConnected) back.focus();
  }

  /** The row the keyboard can go to once `path` (and anything in it) is gone: the next row, else the one before. */
  rowAfterRemoval(path: string): string | null {
    const paths = this._items().map((el) => el.dataset.path!);
    const at = paths.indexOf(path);
    if (at < 0) return null;
    const inside = (p: string): boolean => p === path || p.startsWith(`${path}/`);
    const after = paths.slice(at + 1).find((p) => !inside(p));
    return after ?? [...paths.slice(0, at)].reverse().find((p) => !inside(p)) ?? null;
  }

  /** Put the keyboard on a row (after a dialog that worked on the tree). False when the row isn't shown. */
  focusRow(path: string): boolean {
    const row = this._item(path);
    if (!row) return false;
    this._setFocusPath(path);
    row.focus();
    return true;
  }

  /** Put the keyboard on the tree's one Tab stop (when the row it was on has gone). */
  focusTabStop(): void {
    const items = this._items();
    (items.find((el) => el.tabIndex === 0) ?? items[0])?.focus();
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

  private _startNaming(kind: NewEntryKind, target: string): void {
    // The folder the menu named, unless it went while the menu was open.
    const folder = this._folderExists(target) ? target : this._target();
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
