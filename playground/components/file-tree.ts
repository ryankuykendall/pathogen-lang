// The file tree (phase 2d, steps 4a and 4b; docs/workspace-files.md "The file
// tree and tabs" and "Adding files and folders", mockup v6 screens O, J and N):
// the workspace's folders and files, pathogen.json last and read-only, and the
// "+" that adds a program, a module or a folder. Files, beside Console in the
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
//   rename-entry  { path, name }         Rename…'s field accepted (step 4c-2)
//   move-entry    { path, folder }       a folder chosen in Move to… ('' is the top)
//   upload-files  { folder, picked,      files chosen with Upload files… or
//                   truncated }          Upload folder… (step 6a); truncated
//                                        when a folder held too many to read
//   upload-drop   { folder, drop }       files or folders dropped from the
//                                        computer, taken while the drop lasted
//                                        (services/uploads.ts captureDrop)
// During a drop, the folder under the pointer lights up, with a label by the
// pointer ("Drop 2 items to add to parts/"): a file row means its folder, empty
// space or pathogen.json the top. askClash places the upload's question beside
// a row and waits for the answer; flash marks new rows for a moment.
// A file or folder row dragged within the tree (step 6b) is a move-entry for
// the folder it's dropped on, by the same rule: the row dims, the folder lights
// up, and the label says what the move changes (checkMove's `label`), or why it
// can't go there. The folder it's in, and a folder into itself, don't light.
// Each file's and folder's ⋮, a right-click or the menu key opens its menu;
// a folder's menu adds to that folder. rowAfterRemoval and focusRow let
// workspace-view put the keyboard back in the tree after a dialog.
// checkRename and checkMove are workspace-view's answers to what a new name or
// a folder would do: a refusal (`message`), or the line that says what changes
// (`hint`). A renamed or moved row keeps its folding and the keyboard.
// Folding is the tree's own: a folded folder stays folded while the tree lives.
//
// Keyboard (the WAI-ARIA tree pattern): one Tab stop; Up and Down move; Right
// unfolds a folder, then goes into it; Left folds it, or goes to the folder a
// row is in; Home and End; Space and Enter open a file or fold a folder. Keys
// with a modifier are left to the browser. The + menu: Up, Down, Home and End
// move; Escape closes it; Enter or Space chooses. The name field: Enter
// creates (or renames), Escape cancels.
//
// Where the + adds: the folder of the row you're on (clicked or reached with
// the keyboard; a file row gives its folder), else the folder of the file in
// the editor (opening a file resets the row), else the top of the workspace.

import { captureDrop, pickedFromInput } from '../services/uploads.js';
import { renamedPath } from '../services/workspace-edits.js';
import { FILE_ICONS, MAIN_BADGE_TITLE } from '../utils/file-icons.js';
import { treeRows } from '../utils/file-tree-rows.js';
import './clash-prompt.js';
import styles from './file-tree.css';

import type { ClashAnswer, ClashQuestion } from './clash-prompt.js';
import type { NewEntryKind, TreeFile, TreeRow } from '../utils/file-tree-rows.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOCK_TITLE = 'Read-only: the playground writes this file';
const ADD_LABEL = 'Add a file or folder';
const KEYS_HINT = 'Enter to create, Esc to cancel';
const RENAME_KEYS_HINT = 'Enter to rename, Esc to cancel';
const HERE_NOW = 'It’s here now';
/** How long new rows stay marked after an upload. */
const FLASH_MS = 1600;

/** Why a name can't be used (the message), or null when it can. */
export type NameCheck = (kind: NewEntryKind, folder: string, name: string) => string | null;

/**
 * What a rename or a move would do: why it can't (`message`), or what it
 * changes (`hint`, Move to…'s last line; `label`, by the pointer while a row
 * is dragged).
 */
export interface EntryCheck {
  message?: string;
  hint?: string;
  label?: string;
}

/** What a drag within the tree carries: the dragged row's path (step 6b). */
const MOVE_TYPE = 'application/x-pathogen-path';

/**
 * What a menu item does: name a new file or folder, rename, or open Move to…
 * (the tree's own); move-here (Move to…'s folders); or a file-action for workspace-view.
 */
export type MenuAction =
  | 'new-program'
  | 'new-library'
  | 'new-folder'
  | 'upload-files'
  | 'upload-folder'
  | 'set-main'
  | 'rename'
  | 'move'
  | 'move-here'
  | 'duplicate'
  | 'delete';

interface MenuItem {
  action: MenuAction;
  label: string;
  /** A line under the label; may hold <code>. */
  detail?: string;
  icon: string;
  danger?: boolean;
  /** Move to…'s folder ('' is the top). */
  folder?: string;
  /** Shown, but can't be chosen; `detail` says why. */
  disabled?: boolean;
  /** What choosing it does: the menu's last line while it has the keyboard. */
  hint?: string;
}

type MenuEntry = MenuItem | 'divider';

const NEW_KIND: Partial<Record<MenuAction, NewEntryKind>> = {
  'new-program': 'program',
  'new-library': 'library',
  'new-folder': 'folder',
};

/** Whether this browser's file picker can pick a folder (Upload folder… shows only then: docs "On a phone"). */
const CAN_PICK_FOLDER = typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;

/** The + menu's items, and a folder's menu's first ones: the new files, then the uploads (step 6a; mockup v6 screen N). */
const ADD_ITEMS: MenuEntry[] = [
  { action: 'new-program', label: 'New program', detail: 'A file that draws', icon: FILE_ICONS.program },
  { action: 'new-library', label: 'New module', icon: FILE_ICONS.library },
  { action: 'new-folder', label: 'New folder', icon: FILE_ICONS.folderPlus },
  'divider',
  { action: 'upload-files', label: 'Upload files…', detail: 'Or drop them on the tree', icon: FILE_ICONS.upload },
  ...(CAN_PICK_FOLDER
    ? [
        {
          action: 'upload-folder',
          label: 'Upload folder…',
          detail: 'Keeps the folders inside it',
          icon: FILE_ICONS.folderUp,
        } as MenuItem,
      ]
    : []),
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
// Rename… and Move to… (step 4c-2; mockup v7 screen F).
const RENAME_FILE: MenuItem = {
  action: 'rename',
  label: 'Rename…',
  detail: 'Also updates the imports that name it',
  icon: FILE_ICONS.pencil,
};
const RENAME_FOLDER: MenuItem = { ...RENAME_FILE, detail: 'Moves its files, and updates the imports that name them' };
const MOVE_FILE: MenuItem = {
  action: 'move',
  label: 'Move to…',
  detail: 'Another folder, or the top',
  icon: FILE_ICONS.move,
};
const MOVE_FOLDER: MenuItem = { ...MOVE_FILE, detail: 'Into another folder, or to the top' };

/** "Add to parts/" or "Add at the top": where a New item puts the file. */
const addHead = (folder: string): string => (folder ? `Add to <code>${esc(folder)}/</code>` : 'Add at the top');

function itemHtml(entry: MenuItem): string {
  const detail = entry.detail ? `<small>${entry.detail}</small>` : '';
  const classes = [entry.danger ? 'danger' : '', entry.disabled ? 'disabled' : ''].filter(Boolean).join(' ');
  const attrs = [
    `data-action="${entry.action}"`,
    classes ? `class="${classes}"` : '',
    entry.folder !== undefined ? `data-folder="${esc(entry.folder)}"` : '',
    entry.disabled ? 'aria-disabled="true"' : '',
    entry.hint ? `data-hint="${esc(entry.hint)}" aria-describedby="menu-foot"` : '',
  ].filter(Boolean);
  return `<button type="button" role="menuitem" tabindex="-1" ${attrs.join(' ')}><span class="icon">${entry.icon}</span><span><span class="label">${entry.label}</span>${detail}</span></button>`;
}

/** A menu: its head, its items, and (when an item has a hint) the line that says what the focused one does. */
function menuHtml(head: string | null, entries: MenuEntry[]): string {
  const items = entries.map((entry) =>
    entry === 'divider' ? '<div class="menu-divider" role="separator"></div>' : itemHtml(entry),
  );
  const foot = entries.some((e) => e !== 'divider' && e.hint)
    ? '<div class="menu-foot" id="menu-foot" role="presentation" hidden></div>'
    : '';
  return `${head !== null ? `<div class="menu-head" role="presentation">${head}</div>` : ''}${items.join('')}${foot}`;
}

const FIELD_LABELS: Record<NewEntryKind, string> = {
  program: 'New program name',
  library: 'New module name',
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
    const label =
      row.renaming !== undefined
        ? `New name for ${row.name}${row.kind === 'folder' ? '/' : ''}`
        : FIELD_LABELS[row.kind];
    return `<div class="row input ${row.kind}" ${level}><span class="chev"></span><span class="icon">${icon}</span><span class="field"><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${esc(label)}" aria-describedby="name-hint" aria-invalid="false">${ext}</span></div><div class="name-hint" id="name-hint" aria-live="polite" ${level}></div>`;
  }
  const common = `role="treeitem" data-path="${esc(row.path)}" title="${esc(row.path)}" aria-level="${row.level}" aria-posinset="${row.posinset}" aria-setsize="${row.setsize}" tabindex="-1" ${level}`;
  // A row's own menu (step 4c), for the pointer. The keyboard opens it from the row itself
  // (Shift+F10 or the menu key), and the row says it has one (aria-haspopup), so the ⋮ stays
  // out of the row's spoken name.
  const dots = `<button class="row-menu" type="button" tabindex="-1" aria-hidden="true" title="More">${FILE_ICONS.kebab}</button>`;
  if (row.type === 'folder') {
    const label = row.empty ? ` aria-label="${esc(row.name)}, empty"` : '';
    return `<div class="row folder${row.expanded ? '' : ' folded'}" ${common} draggable="true" aria-haspopup="menu" aria-expanded="${row.expanded}"${label}><span class="chev">${FILE_ICONS.chevron}</span><span class="icon">${FILE_ICONS.folder}</span><span class="name">${esc(row.name)}</span>${dots}</div>`;
  }
  if (row.type === 'project') {
    return `<div class="row project" ${common}><span class="chev"></span><span class="icon">${FILE_ICONS.json}</span><span class="name">${nameHtml(row.name)}</span><span class="lock" title="${LOCK_TITLE}">${FILE_ICONS.lock}</span></div>`;
  }
  const badge = row.main ? `<span class="badge-main" title="${MAIN_BADGE_TITLE}">main</span>` : '';
  return `<div class="row file ${row.kind}" ${common} draggable="true" aria-haspopup="menu"><span class="chev"></span><span class="icon">${FILE_ICONS[row.kind]}</span><span class="name">${nameHtml(row.name)}</span>${badge}${dots}</div>`;
}

const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
/** A file's name without `.pathogen`: what Rename…'s field holds. */
const stemOf = (name: string): string => (name.endsWith('.pathogen') ? name.slice(0, -'.pathogen'.length) : name);

/** The name field's line when nothing's wrong (mockup v6 screen N; v7 screen X for a first program). */
function defaultHint(kind: NewEntryKind, firstProgram: boolean): string {
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

  /** What renaming `path` to `name` would do: workspace-view's answer. */
  checkRename: ((path: string, name: string) => EntryCheck) | null = null;

  /** What moving `path` into `folder` ('' is the top) would do: workspace-view's answer. */
  checkMove: ((path: string, folder: string) => EntryCheck) | null = null;

  private readonly _collapsed = new Set<string>();

  /** What the rows were last drawn from, so an unchanged tree never redraws. */
  private _drawn = '';

  private _rows: TreeRow[] = [];

  /** The row that takes the Tab stop: the one last focused, while it's shown. Opening a file resets it. */
  private _focusPath: string | null = null;

  /** A row to focus as soon as it's drawn: a folder just created. */
  private _pendingFocus: string | null = null;

  /**
   * The name field, while New program, New module or New folder is being
   * named, or while Rename… renames `renaming` (whose name was `original`).
   */
  private _naming: {
    kind: NewEntryKind;
    folder: string;
    value: string;
    error: string | null;
    renaming: string | null;
    original: string;
  } | null = null;

  private _menuOpen = false;

  /** The open menu: the button that opened it (the + or a row's ⋮), where the keyboard goes back to, its row, and the folder its New items add to. */
  private _menuOpener: HTMLElement | null = null;

  private _menuReturn: HTMLElement | null = null;

  private _menuPath: string | null = null;

  private _menuTarget = '';

  /** True while the rows' HTML is being replaced (see _draw). */
  private _redrawing = false;

  /** The folder Upload files… or Upload folder… adds to, set as its picker opens. */
  private _pickTarget = '';

  /** The folder lit while files are dragged over the tree ('' the top); null when none is. */
  private _dropFolder: string | null = null;

  /** The row being dragged within the tree (step 6b), until the browser ends the drag. */
  private _dragPath: string | null = null;

  /** What dropping the dragged row on each folder would do, asked once per folder; null where it isn't offered. */
  private readonly _dragChecks = new Map<string, EntryCheck | null>();

  /** New rows marked for a moment (flash). */
  private readonly _flashing = new Set<string>();

  private _flashTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Whether a pointer is down. The name field's blur then comes from a click
   * elsewhere (a row, a tab), and the rows mustn't be redrawn under the
   * pointer before that click lands (see _onFieldBlur).
   */
  private _pointerDown = false;

  private readonly _onPointerDown = (): void => {
    this._pointerDown = true;
    // No press happens during a drag: a drag whose end the tree never heard (its row gone
    // from the page in a browser that then sends no dragend) is over.
    if (this._dragPath !== null) this._endMove();
  };

  private readonly _onPointerUp = (): void => {
    this._pointerDown = false;
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    window.addEventListener('pointerdown', this._onPointerDown, true);
    window.addEventListener('pointerup', this._onPointerUp, true);
    window.addEventListener('pointercancel', this._onPointerUp, true);
    if (this.shadowRoot!.firstChild) return;
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <div class="head"><span class="title" aria-hidden="true">Files</span><button class="add" type="button" aria-label="${ADD_LABEL}" title="${ADD_LABEL}" aria-haspopup="menu" aria-expanded="false" aria-controls="add-menu">${FILE_ICONS.plus}</button></div>
      <div class="list" role="tree" aria-label="Files"></div>
      <div class="menu" id="add-menu" role="menu" aria-label="Add" hidden></div>
      <input class="pick-files" type="file" multiple accept=".pathogen" hidden tabindex="-1">
      <input class="pick-folder" type="file" webkitdirectory hidden tabindex="-1">
      <div class="drop-label" aria-hidden="true" hidden></div>
      <div class="drag-chip" aria-hidden="true" hidden></div>
      <clash-prompt></clash-prompt>
    `;
    // Upload files… and Upload folder…: the picker's files, for the folder the menu was opened for.
    for (const input of this.shadowRoot!.querySelectorAll<HTMLInputElement>('.pick-files, .pick-folder')) {
      input.addEventListener('change', () => {
        const { picked, truncated } = pickedFromInput(input.files ?? []);
        input.value = '';
        if (picked.length > 0) this._emit('upload-files', { folder: this._pickTarget, picked, truncated });
      });
    }
    // Files dropped from the computer (step 6a): the folder under the pointer lights up.
    this.addEventListener('dragenter', (e) => this._onDragOver(e));
    this.addEventListener('dragover', (e) => this._onDragOver(e));
    this.addEventListener('dragleave', (e) => {
      // Only leaving the tree itself, not passing from one row to another.
      const to = e.relatedTarget as Node | null;
      if (to === null || !this.contains(to)) this._endDrop();
    });
    this.addEventListener('drop', (e) => this._onDrop(e));
    const list = this._list!;
    // A row dragged within the tree (step 6b) moves it.
    list.addEventListener('dragstart', (e) => this._onDragStart(e));
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
      // A folder Move to… can't use stays in the list, saying why; choosing it does nothing.
      if (item && item.getAttribute('aria-disabled') !== 'true') this._choose(item.dataset.action as MenuAction, item);
    });
    // The item under the pointer takes the keyboard, as in a desktop menu, so one item is
    // lit, Enter chooses it, and Move to…'s last line says what it would do. Only when the
    // pointer moves: a menu opening under a pointer at rest leaves the keyboard on its first item.
    menu.addEventListener('mousemove', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
      if (item && this.shadowRoot!.activeElement !== item) item.focus({ preventScroll: true });
    });
    menu.addEventListener('focusin', (e) => this._showFoot(e.target));
    this._drawn = '';
    this._draw();
  }

  disconnectedCallback(): void {
    this._closeMenu(false);
    this._endMove();
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = null;
    this._flashing.clear();
    window.removeEventListener('pointerdown', this._onPointerDown, true);
    window.removeEventListener('pointerup', this._onPointerUp, true);
    window.removeEventListener('pointercancel', this._onPointerUp, true);
    this._pointerDown = false;
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
    // A row being renamed that's gone (deleted, or moved from elsewhere) takes its field with it.
    if (this._naming?.renaming && !this._exists(this._naming.renaming)) this._naming = null;
    const naming = this._naming
      ? { folder: this._naming.folder, kind: this._naming.kind, renaming: this._naming.renaming ?? undefined }
      : null;
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
      // New rows: a drop in progress lights them again at the next dragover.
      this._dropFolder = null;
      this._hintShown = '';
      // The workspace changed during a drag: what a move would do is asked again; a dragged
      // file or folder that's gone ends the drag.
      this._dragChecks.clear();
      if (this._dragPath !== null && !this._exists(this._dragPath)) {
        this._dragPath = null;
        this._hideLabel();
      }
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
      el.classList.toggle('flash', this._flashing.has(el.dataset.path!));
      el.classList.toggle('dragging', el.dataset.path === this._dragPath);
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
    label: string;
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
    menu.setAttribute('aria-label', spec.label);
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

  /** The +: New program, New module, New folder, where the + adds. */
  private _openAddMenu(): void {
    const add = this._addButton!;
    const target = this._target();
    const host = this.getBoundingClientRect();
    const head = this.shadowRoot!.querySelector('.head')!.getBoundingClientRect();
    this._showMenu({
      opener: add,
      returnTo: add,
      label: 'Add',
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
   * (unless it is the main), Rename…, Move to…, Duplicate, Delete…. A module:
   * the same without Set as main. A folder: the + items for that folder, then
   * Rename…, Move to… and Delete….
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
      entries = [...ADD_ITEMS, 'divider', RENAME_FOLDER, MOVE_FOLDER, DELETE_FOLDER];
    } else if (row.classList.contains('program') && path !== this._main) {
      entries = [SET_MAIN, 'divider', RENAME_FILE, MOVE_FILE, DUPLICATE, 'divider', DELETE_FILE];
    } else {
      entries = [RENAME_FILE, MOVE_FILE, DUPLICATE, 'divider', DELETE_FILE];
    }
    this._showRowMenu(path, row, dots, `${baseOf(path)}${this._isFolder(path) ? '/' : ''}`, head, entries);
  }

  /**
   * Open `path`'s own menu, as its ⋮ does, its folders opened so it shows:
   * the error panel's "set another program as main" (2d, step 7), where the
   * keyboard lands on Set as main, a program's first item.
   */
  openMenu(path: string): void {
    for (let f = parentOf(path); f !== ''; f = parentOf(f)) this._collapsed.delete(f);
    this._draw();
    this._item(path)?.scrollIntoView?.({ block: 'nearest' });
    this._openRowMenu(path);
  }

  /** Show a menu under a row, from its ⋮. */
  private _showRowMenu(
    path: string,
    row: HTMLElement,
    dots: HTMLElement,
    label: string,
    head: string | null,
    entries: MenuEntry[],
  ): void {
    const rowRect = row.getBoundingClientRect();
    const dotsRect = dots.getBoundingClientRect();
    this._setFocusPath(path);
    this._showMenu({
      opener: dots,
      returnTo: row,
      label,
      head,
      entries,
      target: row.classList.contains('folder') ? path : parentOf(path),
      path,
      place: { left: dotsRect.left - 4, top: rowRect.bottom - 2, width: 300 },
      flipAbove: rowRect.top + 2,
    });
  }

  /** Every folder of the workspace, by path. */
  private _allFolders(): string[] {
    const all = new Set<string>();
    const add = (folder: string): void => {
      for (let f = folder; f !== '' && !all.has(f); f = parentOf(f)) all.add(f);
    };
    for (const file of this._files) add(parentOf(file.path));
    for (const folder of this._folders) add(folder);
    return [...all].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
  }

  /**
   * Move to… (mockup v7 screen F, state 6): the top of the workspace and every
   * folder, as a menu from the row's ⋮. The one it's in is listed and can't be
   * chosen; a folder isn't listed for itself or the folders in it; a folder
   * that already holds its name says so. The last line says what the focused
   * folder would do (checkMove). (The drawing's "New folder…" isn't here yet:
   * New folder, then Move to…, does it in two steps.)
   */
  private _openMoveMenu(path: string): void {
    const row = this._item(path);
    const dots = row?.querySelector<HTMLElement>('.row-menu');
    if (!row || !dots) return;
    const isFolder = this._isFolder(path);
    const name = `${baseOf(path)}${isFolder ? '/' : ''}`;
    const here = parentOf(path);
    const folders = this._allFolders().filter((f) => !(isFolder && (f === path || f.startsWith(`${path}/`))));
    const entries: MenuItem[] = ['', ...folders].map((folder) => {
      const item: MenuItem = {
        action: 'move-here',
        label: folder === '' ? 'The top of the workspace' : `${esc(folder)}/`,
        icon: folder === '' ? FILE_ICONS.home : FILE_ICONS.folder,
        folder,
      };
      if (folder === here) return { ...item, disabled: true, detail: HERE_NOW };
      const check = this.checkMove?.(path, folder) ?? {};
      if (check.message) return { ...item, disabled: true, detail: esc(check.message) };
      return { ...item, hint: check.hint };
    });
    this._showRowMenu(path, row, dots, `Move ${name} to`, `Move <code>${esc(name)}</code> to`, entries);
  }

  /** Move to…'s last line: what the focused item would do, if it can be chosen. */
  private _showFoot(target: EventTarget | null): void {
    const foot = this._menu?.querySelector<HTMLElement>('.menu-foot');
    const item = (target as HTMLElement | null)?.closest?.<HTMLElement>('[role="menuitem"]');
    if (!foot || !item) return;
    const hint = item.dataset.hint ?? '';
    foot.textContent = hint;
    foot.hidden = hint === '';
  }

  /** A menu item chosen: name a new file or folder here, rename or move the row, or ask workspace-view to act on it. */
  private _choose(action: MenuAction, item?: HTMLElement): void {
    const target = this._menuTarget;
    const path = this._menuPath;
    const kind = NEW_KIND[action];
    if (action === 'move' && path !== null) {
      this._openMoveMenu(path);
      return;
    }
    if (action === 'rename' && path !== null) {
      this._closeMenu(false);
      this._startRenaming(path);
      return;
    }
    if (action === 'move-here' && path !== null) {
      this._closeMenu(false);
      this._moveEntry(path, item?.dataset.folder ?? '');
      return;
    }
    if (action === 'upload-files' || action === 'upload-folder') {
      this._closeMenu(true);
      // Still inside the click or key that chose it, so the browser opens its picker.
      this._pickTarget = target;
      this.shadowRoot!.querySelector<HTMLInputElement>(
        action === 'upload-folder' ? '.pick-folder' : '.pick-files',
      )!.click();
      return;
    }
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

  /**
   * New program from the editor's zero-state (step 4d, mockup v11): the name
   * field at the top level of the workspace, with the keyboard in it, as the
   * +'s New program makes it there. The tree must be shown.
   */
  startNewProgram(): void {
    this._closeMenu(false);
    this._startNaming('program', '');
  }

  /** Put the keyboard on the tree's one Tab stop (when the row it was on has gone). */
  /** The keyboard to the tree's Tab stop; false when the tree has no row to take it. */
  focusTabStop(): boolean {
    const items = this._items();
    const stop = items.find((el) => el.tabIndex === 0) ?? items[0];
    stop?.focus();
    return stop !== undefined;
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
    this._naming = { kind, folder, value: '', error: null, renaming: null, original: '' };
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

  /**
   * Rename… (mockup v7 screen F, states 2 and 5): the row becomes a field
   * holding its name, selected (a file's without `.pathogen`, which follows
   * it), in its folder. A folder's files stay listed under it.
   */
  private _startRenaming(path: string): void {
    const folder = this._isFolder(path);
    const file = this._files.find((f) => f.path === path);
    if (!folder && !file) return;
    const original = folder ? baseOf(path) : stemOf(baseOf(path));
    this._naming = {
      kind: folder ? 'folder' : file!.kind,
      folder: parentOf(path),
      value: original,
      error: null,
      renaming: path,
      original,
    };
    this._draw();
    const field = this._field;
    if (!field) {
      this._naming = null;
      this._draw();
      this.focusRow(path);
      return;
    }
    field.focus();
    field.setSelectionRange(0, original.length);
  }

  /** Whether a file or folder is in the workspace now. */
  private _exists(path: string): boolean {
    return this._files.some((f) => f.path === path) || (path !== '' && this._folderExists(path));
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
    let line = '';
    if (naming.renaming !== null) {
      // Rename…: what the plan says, and what it changes, even for the name as it is.
      const check = name === '' ? {} : (this.checkRename?.(naming.renaming, name) ?? {});
      naming.error = check.message ?? null;
      line = `${check.hint ? `${check.hint} · ` : ''}${RENAME_KEYS_HINT}`;
    } else {
      naming.error = name === '' ? null : (this.checkName?.(naming.kind, naming.folder, name) ?? null);
    }
    const bad = naming.error !== null;
    field.setAttribute('aria-invalid', String(bad));
    field.closest('.field')?.classList.toggle('bad', bad);
    // The line is a polite live region: it changes (and is announced) only when what it says changes.
    const shown = bad ? `bad:${naming.error}` : `ok:${naming.kind}:${this._main === null}:${line}`;
    if (shown === this._hintShown) return;
    this._hintShown = shown;
    const hint = this.shadowRoot!.querySelector<HTMLElement>('.name-hint')!;
    hint.classList.toggle('bad', bad);
    if (bad) hint.textContent = naming.error;
    else if (naming.renaming !== null) hint.textContent = line;
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

  /**
   * Rename… accepted. The same name just closes the field. `keepKeyboard`
   * (Enter): the keyboard goes to the renamed row; leaving the field leaves it
   * where you went.
   */
  private _rename(name: string, keepKeyboard: boolean): void {
    const { renaming: path, kind, original } = this._naming!;
    this._endNaming();
    if (path === null) return;
    const to = renamedPath(path, name, kind === 'folder');
    if (to === path || name === original) {
      if (keepKeyboard) this.focusRow(path);
      return;
    }
    this._dispatchMove('rename-entry', { path, name }, path, to, keepKeyboard);
  }

  /** Move to… chosen: the keyboard goes with the row. */
  private _moveEntry(path: string, folder: string): void {
    const to = join(folder, baseOf(path));
    if (to === path) return;
    this._dispatchMove('move-entry', { path, folder }, path, to, true);
  }

  /**
   * Ask workspace-view to rename or move `from` to `to`. The row's folding,
   * and the folders' in it, and the Tab stop go with it; so does the keyboard
   * when `keepKeyboard`. If workspace-view didn't (it refused, and said why),
   * they stay where they were.
   */
  private _emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  /**
   * The folder a drop over `target` goes to: a folder row's own, a file row's
   * folder, and the top for empty space, the header or pathogen.json.
   */
  dropFolderAt(target: EventTarget | null): string {
    const path = this._pathOf(target);
    if (path === null || path === 'pathogen.json') return '';
    return this._isFolder(path) ? path : parentOf(path);
  }

  /**
   * Files dragged from the computer over the tree: light the folder they'd go
   * to, and say so by the pointer, with how many items (your answer,
   * 2026-11-13). The browser gives the count but not the names until the drop;
   * a folder is one item. A row dragged within the tree is a move (step 6b).
   */
  private _onDragOver(e: DragEvent): void {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(MOVE_TYPE)) {
      this._onMoveOver(e);
      return;
    }
    if (!types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    // Heard on the tree itself, whose target is retargeted to it: the row is the event's first stop.
    const folder = this.dropFolderAt(e.composedPath()[0] ?? null);
    this._showDrop(folder);
    const count = Array.from(e.dataTransfer.items ?? []).filter((item) => item.kind === 'file').length;
    const what = count === 0 ? '' : ` ${count} ${count === 1 ? 'item' : 'items'}`;
    this._showLabel(e, `Drop${what} to add ${folder ? `to ${folder}/` : 'at the top'}`, false);
  }

  /** The label by the pointer: where a drop goes, or (refused) why a dragged row can't go there. */
  private _showLabel(e: DragEvent, text: string, refused: boolean): void {
    const label = this.shadowRoot!.querySelector<HTMLElement>('.drop-label')!;
    // Dragover comes many times a second: the text is written only when it changes.
    if (label.textContent !== text) label.textContent = text;
    label.classList.toggle('refused', refused);
    label.style.left = `${e.clientX + 14}px`;
    label.style.top = `${e.clientY + 18}px`;
    label.hidden = false;
  }

  private _hideLabel(): void {
    const label = this.shadowRoot?.querySelector<HTMLElement>('.drop-label');
    if (label) label.hidden = true;
  }

  /**
   * A row dragged within the tree (step 6b; mockup v7 screen F, state 7): the
   * row dims, it carries its path, and the image is a chip with its icon and
   * name. Not while a name is being typed: that field is finished first.
   */
  private _onDragStart(e: DragEvent): void {
    const path = this._pathOf(e.target);
    if (path === null || !e.dataTransfer) return;
    if (this._naming || path === 'pathogen.json') {
      e.preventDefault();
      return;
    }
    this._closeMenu(false);
    this._dragPath = path;
    this._dragChecks.clear();
    // Only this type: with text/plain too, a drop on the editor would paste the path.
    e.dataTransfer.setData(MOVE_TYPE, path);
    e.dataTransfer.effectAllowed = 'move';
    const row = this._item(path)!;
    const chip = this.shadowRoot!.querySelector<HTMLElement>('.drag-chip')!;
    const icon = row.querySelector('.icon')?.innerHTML ?? '';
    const folder = this._isFolder(path);
    chip.dataset.kind = folder ? 'folder' : row.classList.contains('library') ? 'library' : 'program';
    chip.innerHTML = `<span class="icon">${icon}</span><span class="name">${esc(baseOf(path))}${folder ? '/' : ''}</span>`;
    // Shown under the pointer for the moment the browser takes its picture, then hidden.
    chip.style.left = `${e.clientX - 10}px`;
    chip.style.top = `${e.clientY - 12}px`;
    chip.hidden = false;
    e.dataTransfer.setDragImage(chip, 10, 12);
    setTimeout(() => {
      chip.hidden = true;
    }, 0);
    // The drag ends on the row it began on, even once that row has been drawn again (and is
    // out of the page, where the tree no longer hears it): so it's heard on the row itself.
    row.addEventListener('dragend', () => this._endMove(), { once: true });
    this._mark();
  }

  /**
   * What dropping the dragged row on `folder` would do: null where it isn't
   * offered (the folder it's in, or a folder into itself), else workspace-view's
   * check, asked once per folder (a plan reads every file's imports).
   */
  private _moveCheck(path: string, folder: string): EntryCheck | null {
    if (folder === parentOf(path)) return null;
    if (this._isFolder(path) && (folder === path || folder.startsWith(`${path}/`))) return null;
    if (!this._dragChecks.has(folder)) this._dragChecks.set(folder, this.checkMove?.(path, folder) ?? {});
    return this._dragChecks.get(folder)!;
  }

  /** The dragged row over the tree: light the folder it would move to, and say what the move changes; or say why it can't. */
  private _onMoveOver(e: DragEvent): void {
    const path = this._dragPath;
    // A row dragged from another window's tree: not this workspace's.
    if (path === null) return;
    const folder = this.dropFolderAt(e.composedPath()[0] ?? null);
    const check = this._moveCheck(path, folder);
    if (check === null || check.message) {
      this._showDrop(null);
      if (check?.message) this._showLabel(e, check.message, true);
      else this._hideLabel();
      return;
    }
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    this._showDrop(folder);
    this._showLabel(e, check.label ?? `Move to ${folder ? `${folder}/` : 'the top'}`, false);
  }

  /** The dragged row dropped: Move to… for the folder under the pointer, if it can go there. */
  private _onMoveDrop(e: DragEvent): void {
    const path = this._dragPath;
    if (path === null || e.dataTransfer?.getData(MOVE_TYPE) !== path) return;
    const folder = this.dropFolderAt(e.composedPath()[0] ?? null);
    const check = this._moveCheck(path, folder);
    // The drag is over once dropped: its end (dragend) only tidies up after this.
    this._endMove();
    if (check === null || check.message) return;
    e.preventDefault();
    this._moveEntry(path, folder);
  }

  /** The drag is over (dropped, or Esc): the lights and the label go, and the row undims. */
  private _endMove(): void {
    this._endDrop();
    if (this._dragPath === null) return;
    this._dragPath = null;
    this._dragChecks.clear();
    this._mark();
  }

  /** Light the folder a drop would go to, and the rows in it; the whole list for the top. */
  private _showDrop(folder: string | null): void {
    if (folder === this._dropFolder) return;
    this._dropFolder = folder;
    this._list?.classList.toggle('drop-top', folder === '');
    for (const el of this._items()) {
      const path = el.dataset.path!;
      el.classList.toggle('drop', folder !== null && folder !== '' && path === folder);
      el.classList.toggle('in-drop', folder !== null && folder !== '' && path.startsWith(`${folder}/`));
    }
  }

  private _endDrop(): void {
    this._showDrop(null);
    this._hideLabel();
  }

  /** Files dropped: what the drop holds is taken now (the browser empties it once the event ends), and read by workspace-view. */
  private _onDrop(e: DragEvent): void {
    if (!e.dataTransfer) return;
    if (Array.from(e.dataTransfer.types).includes(MOVE_TYPE)) {
      this._onMoveDrop(e);
      return;
    }
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    const folder = this.dropFolderAt(e.composedPath()[0] ?? null);
    this._endDrop();
    this._emit('upload-drop', { folder, drop: captureDrop(e.dataTransfer) });
  }

  /**
   * Mark new rows for a moment (an upload's files, mockup v6 screen U, state
   * 3). They stay marked through a redraw; their folders open so they show.
   */
  flash(paths: readonly string[]): void {
    for (const path of paths) {
      for (let f = parentOf(path); f !== ''; f = parentOf(f)) this._collapsed.delete(f);
      this._flashing.add(path);
    }
    this._drawn = '';
    this._draw();
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this._flashTimer = null;
      this._flashing.clear();
      this._mark();
    }, FLASH_MS);
  }

  /**
   * Ask what to do about an upload's file whose name `existing` already has
   * (mockup v6 screen U, state 2): the question, beside that row (its folders
   * opened so it shows). The answer, or null when withdrawn (cancelAsk).
   */
  async askClash(existing: string, question: ClashQuestion): Promise<ClashAnswer | null> {
    for (let f = parentOf(existing); f !== ''; f = parentOf(f)) this._collapsed.delete(f);
    this._draw();
    const prompt = this.shadowRoot!.querySelector('clash-prompt')!;
    const row = this._item(existing);
    row?.scrollIntoView?.({ block: 'nearest' });
    const host = this.getBoundingClientRect();
    const at = row?.getBoundingClientRect() ?? host;
    prompt.style.left = `${host.right + 10}px`;
    prompt.style.top = `${Math.max(8, Math.min(at.top - 6, window.innerHeight - 160))}px`;
    return prompt.ask(question);
  }

  /** Withdraw the upload's question, if one is open (another workspace). */
  cancelAsk(): void {
    this.shadowRoot?.querySelector('clash-prompt')?.cancel();
  }

  private _dispatchMove(
    type: 'rename-entry' | 'move-entry',
    detail: Record<string, string>,
    from: string,
    to: string,
    keepKeyboard: boolean,
  ): void {
    const collapsed = [...this._collapsed];
    const focusPath = this._focusPath;
    const follow = (p: string): string =>
      p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p;
    this._collapsed.clear();
    for (const p of collapsed) this._collapsed.add(follow(p));
    // Moved into a folded folder (dragged onto it, or Move to…): it opens, so the row shows where it went.
    for (let f = parentOf(to); f !== ''; f = parentOf(f)) this._collapsed.delete(f);
    if (this._focusPath !== null) this._focusPath = follow(this._focusPath);
    if (keepKeyboard) this._pendingFocus = to;
    // workspace-view makes the change as the event is handled, and gives the tree its new
    // files at once (its store subscription is synchronous), so this can tell what happened.
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
    if (this._exists(to) && !this._exists(from)) return;
    this._pendingFocus = null;
    this._collapsed.clear();
    for (const p of collapsed) this._collapsed.add(p);
    this._focusPath = focusPath;
    this._drawn = '';
    this._draw();
    if (keepKeyboard) this.focusRow(from);
  }

  private _onFieldKeydown(e: KeyboardEvent): void {
    // The field's keys are the field's. Without this, the Enter that makes a
    // folder reaches the tree's own keys after the new folder has taken the
    // keyboard, and folds it.
    e.stopPropagation();
    const renaming = this._naming?.renaming ?? null;
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = this._goodName();
      if (name === null) return;
      if (renaming !== null) this._rename(name, true);
      else this._create(name, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._endNaming();
      if (renaming !== null) this.focusRow(renaming);
      else this._addButton?.focus();
    }
  }

  /**
   * Leaving the field: a good name is created or renamed to (as VS Code does),
   * an empty or refused one is dropped. Left with a click (a row, a tab), that
   * waits until the click has landed: making the file redraws the rows, and a
   * row redrawn between the press and the release loses the click.
   */
  private _onFieldBlur(): void {
    if (!this._naming || this._redrawing) return;
    if (!this._pointerDown) {
      this._leaveField();
      return;
    }
    const naming = this._naming;
    const released = (): void => {
      window.removeEventListener('pointerup', released, true);
      window.removeEventListener('pointercancel', released, true);
      // After the click this release makes (same task), unless the field went meanwhile.
      setTimeout(() => {
        if (this._naming === naming) this._leaveField();
      }, 0);
    };
    window.addEventListener('pointerup', released, true);
    window.addEventListener('pointercancel', released, true);
  }

  private _leaveField(): void {
    const name = this._goodName();
    if (name === null) this._endNaming();
    else if (this._naming!.renaming !== null) this._rename(name, false);
    else this._create(name, false);
  }
}

customElements.define('file-tree', FileTree);

declare global {
  interface HTMLElementTagNameMap {
    'file-tree': FileTree;
  }
}
