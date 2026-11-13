// @vitest-environment jsdom
//
// The file tree (phase 2d, step 4a; docs/workspace-files.md "The file tree and
// tabs", mockup v6 screens O and J). Folders first, then files, each sorted by
// name; pathogen.json last, read-only; the main's badge; folders that fold.
// The tree is a view: it reports a click as `open-file`, and workspace-view
// opens the file (services/open-files.ts).

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { treeRows } from '../playground/utils/file-tree-rows.js';

// jsdom's file input can't pick a folder; a desktop browser's can, and the tree
// shows Upload folder… only then (step 6a). Given here before the tree loads.
if (!('webkitdirectory' in HTMLInputElement.prototype)) {
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', { value: false, writable: true });
}

import type { TreeFile, TreeRow } from '../playground/utils/file-tree-rows.js';

type FileTreeEl = HTMLElement & {
  files: TreeFile[];
  folders: string[];
  active: string | null;
  main: string | null;
};

const GEARS: TreeFile[] = [
  { path: 'main.pathogen', kind: 'program' },
  { path: 'try-sizes.pathogen', kind: 'program' },
  { path: 'demos/gears.pathogen', kind: 'program' },
  { path: 'parts/gears.pathogen', kind: 'library' },
  { path: 'parts/kit.pathogen', kind: 'library' },
  { path: 'parts/labels.pathogen', kind: 'library' },
];

/** Each row as one line: indent by level, then what it shows. */
function outline(rows: TreeRow[]): string[] {
  return rows.map((r) => {
    const pad = '  '.repeat(r.level - 1);
    if (r.type === 'folder') return `${pad}${r.expanded ? 'v' : '>'} ${r.name}/`;
    if (r.type === 'empty') return `${pad}(empty)`;
    if (r.type === 'input') return `${pad}[name field]`;
    if (r.type === 'project') return `${pad}${r.name} [lock]`;
    return `${pad}${r.name}${r.kind === 'library' ? ' [lib]' : ''}${r.main ? ' [main]' : ''}`;
  });
}

describe('the tree’s rows', () => {
  it('Rename…’s field takes the place of the row it renames; a folder’s files stay under it', () => {
    const rows = treeRows(GEARS, [], {
      collapsed: new Set(),
      main: 'main.pathogen',
      naming: { folder: '', kind: 'folder', renaming: 'parts' },
    });
    expect(outline(rows).slice(2, 6)).toEqual([
      '[name field]',
      '  gears.pathogen [lib]',
      '  kit.pathogen [lib]',
      '  labels.pathogen [lib]',
    ]);
    const field = treeRows(GEARS, [], {
      collapsed: new Set(),
      main: 'main.pathogen',
      naming: { folder: 'parts', kind: 'library', renaming: 'parts/kit.pathogen' },
    }).find((r) => r.type === 'input');
    expect(field).toEqual({
      type: 'input',
      path: 'parts/kit.pathogen',
      name: 'kit.pathogen',
      level: 2,
      kind: 'library',
      renaming: 'parts/kit.pathogen',
    });
  });

  it('folders first, then files, each by name; pathogen.json last at the top', () => {
    const rows = treeRows(GEARS, [], { collapsed: new Set(), main: 'main.pathogen' });
    expect(outline(rows)).toEqual([
      'v demos/',
      '  gears.pathogen',
      'v parts/',
      '  gears.pathogen [lib]',
      '  kit.pathogen [lib]',
      '  labels.pathogen [lib]',
      'main.pathogen',
      'try-sizes.pathogen',
      'pathogen.json [lock]',
    ]);
  });

  it('sorts names without regard to letter case, and numbers by value', () => {
    const files: TreeFile[] = ['b.pathogen', 'A.pathogen', 'a10.pathogen', 'a2.pathogen'].map((path) => ({
      path,
      kind: 'program',
    }));
    expect(outline(treeRows(files, [], { collapsed: new Set(), main: null })).slice(0, 4)).toEqual([
      'A.pathogen',
      'a2.pathogen',
      'a10.pathogen',
      'b.pathogen',
    ]);
  });

  it('shows an empty folder, with "Empty" under it, and folders inside folders', () => {
    const rows = treeRows([{ path: 'shapes/round/dot.pathogen', kind: 'library' }], ['examples', 'shapes/square'], {
      collapsed: new Set(),
      main: null,
    });
    expect(outline(rows)).toEqual([
      'v examples/',
      '  (empty)',
      'v shapes/',
      '  v round/',
      '    dot.pathogen [lib]',
      '  v square/',
      '    (empty)',
      'pathogen.json [lock]',
    ]);
  });

  it('a folded folder hides what is in it, folders inside it included', () => {
    const rows = treeRows(GEARS, [], { collapsed: new Set(['parts']), main: 'main.pathogen' });
    expect(outline(rows)).toEqual([
      'v demos/',
      '  gears.pathogen',
      '> parts/',
      'main.pathogen',
      'try-sizes.pathogen',
      'pathogen.json [lock]',
    ]);
  });

  it('badges the main only when it isn’t main.pathogen', () => {
    const asMain = (main: string) =>
      outline(treeRows(GEARS, [], { collapsed: new Set(['parts']), main })).filter((l) => l.includes('[main]'));
    expect(asMain('main.pathogen')).toEqual([]);
    expect(asMain('try-sizes.pathogen')).toEqual(['try-sizes.pathogen [main]']);
    expect(asMain('demos/gears.pathogen')).toEqual(['  gears.pathogen [main]']);
  });

  it('puts the name field first in its folder, in place of "Empty", and outside the counts', () => {
    const naming = (folder: string, folders: string[] = []) => {
      const rows = treeRows(GEARS, folders, { collapsed: new Set(), main: null, naming: { folder, kind: 'library' } });
      return outline(rows).map((line) => line.replace(/ \[lib\]/g, ''));
    };
    expect(naming('parts').slice(2, 7)).toEqual([
      'v parts/',
      '  [name field]',
      '  gears.pathogen',
      '  kit.pathogen',
      '  labels.pathogen',
    ]);
    expect(naming('')[0]).toBe('[name field]');
    expect(naming('examples', ['examples']).slice(2, 4)).toEqual(['v examples/', '  [name field]']);
    const rows = treeRows(GEARS, [], { collapsed: new Set(), main: null, naming: { folder: '', kind: 'program' } });
    const project = rows.find((r) => r.type === 'project')!;
    expect([project.type === 'project' && project.posinset, project.type === 'project' && project.setsize]).toEqual([
      5, 5,
    ]);
  });

  it('counts each row among its siblings, for screen readers', () => {
    const rows = treeRows(GEARS, [], { collapsed: new Set(), main: null });
    type Counted = Extract<TreeRow, { posinset: number }>;
    const at = (name: string, level: number): Counted =>
      rows.find((r): r is Counted => r.type !== 'empty' && r.name === name && r.level === level)!;
    // The top level: demos/, parts/, main, try-sizes and pathogen.json.
    const top = [at('demos', 1), at('main.pathogen', 1), at('pathogen.json', 1)];
    expect(top.map((r) => [r.posinset, r.setsize])).toEqual([
      [1, 5],
      [3, 5],
      [5, 5],
    ]);
    expect([at('kit.pathogen', 2).posinset, at('kit.pathogen', 2).setsize]).toEqual([2, 3]);
  });
});

describe('the file-tree component', () => {
  beforeAll(async () => {
    await import('../playground/components/file-tree.js');
  });

  let tree: FileTreeEl;
  let opened: { path: string; focusEditor: boolean }[];

  beforeEach(() => {
    document.body.innerHTML = '';
    tree = document.createElement('file-tree');
    document.body.appendChild(tree);
    tree.files = GEARS;
    tree.folders = [];
    tree.main = 'main.pathogen';
    tree.active = 'main.pathogen';
    opened = [];
    tree.addEventListener('open-file', (e) =>
      opened.push((e as Event & { detail: { path: string; focusEditor: boolean } }).detail),
    );
  });

  const rowsEl = () => [...tree.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  const row = (path: string) => tree.shadowRoot!.querySelector<HTMLElement>(`[role="treeitem"][data-path="${path}"]`)!;
  const key = (target: HTMLElement, k: string) =>
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));

  it('is a tree, with a level, a count and a state on each row', () => {
    const list = tree.shadowRoot!.querySelector('[role="tree"]')!;
    expect(list.getAttribute('aria-label')).toBe('Files');
    expect(rowsEl().map((r) => r.dataset.path)).toEqual([
      'demos',
      'demos/gears.pathogen',
      'parts',
      'parts/gears.pathogen',
      'parts/kit.pathogen',
      'parts/labels.pathogen',
      'main.pathogen',
      'try-sizes.pathogen',
      'pathogen.json',
    ]);
    expect(['level', 'expanded', 'posinset', 'setsize'].map((a) => row('parts').getAttribute(`aria-${a}`))).toEqual([
      '1',
      'true',
      '2',
      '5',
    ]);
    expect(row('parts/kit.pathogen').getAttribute('aria-level')).toBe('2');
    expect(row('main.pathogen').getAttribute('aria-selected')).toBe('true');
    expect(row('try-sizes.pathogen').getAttribute('aria-selected')).toBe('false');
  });

  it('shows each file’s name with .pathogen quiet, its kind, and pathogen.json’s lock', () => {
    const kit = row('parts/kit.pathogen');
    expect([kit.querySelector('.name')!.textContent, kit.querySelector('.ext')!.textContent]).toEqual([
      'kit.pathogen',
      '.pathogen',
    ]);
    expect(kit.classList.contains('library')).toBe(true);
    expect(row('main.pathogen').classList.contains('program')).toBe(true);
    expect(row('pathogen.json').querySelector('.lock')!.getAttribute('title')).toBe(
      'Read-only: the playground writes this file',
    );
  });

  it('clicking a file asks to open it; clicking a folder folds it, opening nothing', () => {
    row('parts/kit.pathogen').click();
    row('pathogen.json').click();
    expect(opened).toEqual([
      { path: 'parts/kit.pathogen', focusEditor: false },
      { path: 'pathogen.json', focusEditor: false },
    ]);
    row('parts').click();
    expect(opened).toHaveLength(2);
    expect(row('parts').getAttribute('aria-expanded')).toBe('false');
    expect(rowsEl().some((r) => r.dataset.path === 'parts/kit.pathogen')).toBe(false);
    row('parts').click();
    expect(rowsEl().some((r) => r.dataset.path === 'parts/kit.pathogen')).toBe(true);
  });

  it('marks the file in the editor, without drawing the rows again', () => {
    const before = row('try-sizes.pathogen');
    tree.active = 'try-sizes.pathogen';
    expect(row('try-sizes.pathogen').isSameNode(before)).toBe(true);
    const selected = (path: string) => row(path).getAttribute('aria-selected');
    expect([selected('try-sizes.pathogen'), selected('main.pathogen')]).toEqual(['true', 'false']);
    // pathogen.json open: its row is the one marked.
    tree.active = 'pathogen.json';
    expect(row('pathogen.json').getAttribute('aria-selected')).toBe('true');
  });

  it('takes one Tab stop: the file in the editor', () => {
    const stops = rowsEl().filter((r) => r.tabIndex === 0);
    expect(stops.map((r) => r.dataset.path)).toEqual(['main.pathogen']);
  });

  it('moves with the arrow keys, folds with left and right, and opens with Space or Enter', () => {
    row('main.pathogen').focus();
    key(row('main.pathogen'), 'ArrowUp');
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('parts/labels.pathogen');
    // Left on a file goes to its folder; left again folds it.
    key(row('parts/labels.pathogen'), 'ArrowLeft');
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('parts');
    key(row('parts'), 'ArrowLeft');
    expect(row('parts').getAttribute('aria-expanded')).toBe('false');
    // Right unfolds it; right again goes into it.
    key(row('parts'), 'ArrowRight');
    expect(row('parts').getAttribute('aria-expanded')).toBe('true');
    key(row('parts'), 'ArrowRight');
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('parts/gears.pathogen');
    key(row('parts/gears.pathogen'), ' ');
    key(row('parts/gears.pathogen'), 'Enter');
    expect(opened).toEqual([
      { path: 'parts/gears.pathogen', focusEditor: false },
      { path: 'parts/gears.pathogen', focusEditor: true },
    ]);
    key(row('parts/gears.pathogen'), 'End');
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('pathogen.json');
    key(row('pathogen.json'), 'Home');
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('demos');
  });

  it('leaves keys with a modifier to the browser (Alt+Left and Cmd+Left are Back)', () => {
    row('parts/kit.pathogen').focus();
    for (const mod of ['altKey', 'metaKey', 'ctrlKey', 'shiftKey']) {
      const init = { key: 'ArrowLeft', bubbles: true, cancelable: true, [mod]: true };
      const event = new window.KeyboardEvent('keydown', init);
      row('parts/kit.pathogen').dispatchEvent(event);
      expect([mod, event.defaultPrevented]).toEqual([mod, false]);
    }
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('parts/kit.pathogen');
    expect(row('parts').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the keyboard on its row when the workspace changes under it', () => {
    row('parts/kit.pathogen').focus();
    tree.files = [...GEARS, { path: 'parts/springs.pathogen', kind: 'library' }];
    expect(rowsEl().some((r) => r.dataset.path === 'parts/springs.pathogen')).toBe(true);
    expect((tree.shadowRoot!.activeElement as HTMLElement).dataset.path).toBe('parts/kit.pathogen');
  });

  it('says a folder is empty, and badges a main that isn’t main.pathogen', () => {
    tree.folders = ['examples'];
    tree.main = 'try-sizes.pathogen';
    expect(row('examples').getAttribute('aria-label')).toBe('examples, empty');
    expect(tree.shadowRoot!.querySelector('.row.empty')!.textContent).toBe('Empty');
    const badge = row('try-sizes.pathogen').querySelector('.badge-main')!;
    expect([badge.textContent, badge.getAttribute('title')]).toEqual([
      'main',
      'The main: first in pathogen.json’s entryPoints. Thumbnails and publishing use it',
    ]);
    expect(row('main.pathogen').querySelector('.badge-main')).toBeNull();
  });

  it('escapes names', () => {
    tree.files = [{ path: 'a<b>.pathogen', kind: 'program' }];
    expect(tree.shadowRoot!.querySelector('.row.file .name')!.innerHTML).toBe(
      'a&lt;b&gt;<span class="ext">.pathogen</span>',
    );
  });
});

// Step 4c (mockup v6 screen E, v7 screen F): each file's and folder's own menu,
// from its ⋮, a right-click or the menu key. The tree reports a choice as
// `file-action`; a folder's New items name the new file in that folder.
describe('the row menus', () => {
  beforeAll(async () => {
    await import('../playground/components/file-tree.js');
  });

  let tree: FileTreeEl & {
    checkName: (() => null) | null;
    rowAfterRemoval: (path: string) => string | null;
    focusRow: (path: string) => boolean;
    focusTabStop: () => boolean;
  };
  let actions: { action: string; path: string }[];

  beforeEach(() => {
    document.body.innerHTML = '';
    tree = document.createElement('file-tree') as typeof tree;
    document.body.appendChild(tree);
    tree.files = GEARS;
    tree.folders = [];
    tree.main = 'main.pathogen';
    tree.active = 'main.pathogen';
    tree.checkName = () => null;
    actions = [];
    tree.addEventListener('file-action', (e) =>
      actions.push((e as Event & { detail: { action: string; path: string } }).detail),
    );
  });

  const row = (path: string) => tree.shadowRoot!.querySelector<HTMLElement>(`[role="treeitem"][data-path="${path}"]`)!;
  const dots = (path: string) => row(path).querySelector<HTMLButtonElement>('.row-menu');
  const menu = () => tree.shadowRoot!.querySelector<HTMLElement>('[role="menu"]')!;
  const labels = () =>
    [...menu().querySelectorAll('[role="menuitem"] .label, [role="separator"]')].map((el) =>
      el.getAttribute('role') === 'separator' ? '—' : el.textContent,
    );
  const choose = (label: string) =>
    [...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.querySelector('.label')!.textContent === label)!
      .click();
  const focused = () => tree.shadowRoot!.activeElement as HTMLElement | null;
  const key = (target: Element, k: string) => {
    const init = { key: k, bubbles: true, composed: true, cancelable: true };
    return target.dispatchEvent(new window.KeyboardEvent('keydown', init));
  };

  it('files and folders have a ⋮; pathogen.json has its lock instead', () => {
    expect(dots('parts/kit.pathogen')!.getAttribute('title')).toBe('More');
    expect(dots('parts')).not.toBeNull();
    expect(dots('pathogen.json')).toBeNull();
  });

  it('a program’s menu offers Set as main; the main’s and a library’s don’t', () => {
    dots('try-sizes.pathogen')!.click();
    expect(labels()).toEqual(['Set as main', '—', 'Rename…', 'Move to…', 'Duplicate', '—', 'Delete…']);
    dots('main.pathogen')!.click();
    expect(labels()).toEqual(['Rename…', 'Move to…', 'Duplicate', '—', 'Delete…']);
    dots('parts/kit.pathogen')!.click();
    expect(labels()).toEqual(['Rename…', 'Move to…', 'Duplicate', '—', 'Delete…']);
  });

  it('a folder’s menu adds to that folder, then Rename…, Move to… and Delete…', () => {
    dots('demos')!.click();
    expect(menu().querySelector('.menu-head')!.textContent).toBe('Add to demos/');
    expect(labels()).toEqual([
      'New program',
      'New module',
      'New folder',
      '—',
      'Upload files…',
      'Upload folder…',
      '—',
      'Rename…',
      'Move to…',
      'Delete…',
    ]);
  });

  it('the ⋮ shows it’s open, and a second click closes the menu', () => {
    dots('parts/kit.pathogen')!.click();
    expect([menu().hidden, dots('parts/kit.pathogen')!.classList.contains('on')]).toEqual([false, true]);
    expect(row('parts/kit.pathogen').classList.contains('menu-open')).toBe(true);
    dots('parts/kit.pathogen')!.click();
    expect([menu().hidden, dots('parts/kit.pathogen')!.classList.contains('on')]).toEqual([true, false]);
  });

  it('a right-click, or the menu key, on a row opens its menu', () => {
    const event = new window.MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    row('try-sizes.pathogen').dispatchEvent(event);
    expect([event.defaultPrevented, menu().hidden, labels()[0]]).toEqual([true, false, 'Set as main']);
  });

  it('choosing reports the action and the row; Escape returns to the row', () => {
    dots('try-sizes.pathogen')!.click();
    choose('Set as main');
    dots('parts')!.click();
    choose('Delete…');
    expect(actions).toEqual([
      { action: 'set-main', path: 'try-sizes.pathogen' },
      { action: 'delete', path: 'parts' },
    ]);
    dots('parts/kit.pathogen')!.click();
    key(focused()!, 'Escape');
    expect([menu().hidden, focused()]).toEqual([true, row('parts/kit.pathogen')]);
  });

  it('opening a menu doesn’t open the file', () => {
    const opened: unknown[] = [];
    tree.addEventListener('open-file', (e) => opened.push(e));
    dots('parts/kit.pathogen')!.click();
    expect(opened).toEqual([]);
  });

  it('a folder’s New program names the file in that folder', () => {
    tree.active = 'parts/gears.pathogen';
    dots('demos')!.click();
    choose('New program');
    const order = [...tree.shadowRoot!.querySelectorAll<HTMLElement>('.list > .row')].map(
      (r) => r.dataset.path ?? (r.classList.contains('input') ? '[field]' : ''),
    );
    expect(order.slice(0, 2)).toEqual(['demos', '[field]']);
  });

  it('Shift+F10 and the menu key open it from the keyboard (a Mac sends no contextmenu for them)', () => {
    row('parts/kit.pathogen').focus();
    const init = { key: 'F10', shiftKey: true, bubbles: true, cancelable: true };
    const shiftF10 = new window.KeyboardEvent('keydown', init);
    row('parts/kit.pathogen').dispatchEvent(shiftF10);
    const opened = [shiftF10.defaultPrevented, menu().hidden, focused()?.getAttribute('role')];
    expect(opened).toEqual([true, false, 'menuitem']);
    // Where the browser also sends contextmenu for the same key, the menu stays open.
    row('parts/kit.pathogen').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(menu().hidden).toBe(false);
    key(focused()!, 'Escape');
    key(row('parts'), 'ContextMenu');
    expect(labels()[0]).toBe('New program');
  });

  it('the ⋮ adds nothing to a row’s name; the row says it has a menu', () => {
    const hiddenDots = dots('parts/kit.pathogen')!.getAttribute('aria-hidden');
    expect([hiddenDots, row('parts/kit.pathogen').getAttribute('aria-haspopup')]).toEqual(['true', 'menu']);
    expect(row('pathogen.json').getAttribute('aria-haspopup')).toBeNull();
  });

  it('closes when the tree scrolls, and a redraw that takes its row leaves the keyboard in the tree', () => {
    dots('parts/kit.pathogen')!.click();
    tree.shadowRoot!.querySelector('.list')!.dispatchEvent(new window.Event('scroll'));
    expect(menu().hidden).toBe(true);
    dots('parts/kit.pathogen')!.click();
    expect(focused()?.getAttribute('role')).toBe('menuitem');
    tree.files = GEARS.filter((f) => f.path !== 'parts/kit.pathogen');
    expect(menu().hidden).toBe(true);
    expect(focused()?.getAttribute('role')).toBe('treeitem');
  });

  it('after a row goes, the keyboard can go to the row after it, else the one before', () => {
    expect(tree.rowAfterRemoval('parts')).toBe('main.pathogen');
    expect(tree.rowAfterRemoval('demos/gears.pathogen')).toBe('parts');
    expect(tree.rowAfterRemoval('try-sizes.pathogen')).toBe('pathogen.json');
    expect(tree.focusRow('parts')).toBe(true);
    expect(focused()).toBe(row('parts'));
    // A row that isn't there: false, and the keyboard goes to the tree's Tab stop instead.
    expect(tree.focusRow('gone.pathogen')).toBe(false);
    expect(tree.focusTabStop()).toBe(true);
    expect(focused()?.tabIndex).toBe(0);
  });

  it('a workspace with no files still has a row for the keyboard: pathogen.json (step 4d, Show files)', () => {
    tree.files = [];
    tree.main = null;
    tree.active = null;
    expect(tree.focusTabStop()).toBe(true);
    expect(focused()?.textContent).toBe('pathogen.json');
  });
});

// Step 4c-2 (mockup v7 screen F): Rename… (the name only, in place) and Move to…
// (a list of folders). The tree asks workspace-view what a name or a folder
// would do (checkRename, checkMove: the plans' own answers) and reports the
// choice as `rename-entry` or `move-entry`.
describe('renaming and moving', () => {
  beforeAll(async () => {
    await import('../playground/components/file-tree.js');
  });

  interface Check {
    message?: string;
    hint?: string;
  }
  let tree: FileTreeEl & {
    checkRename: ((path: string, name: string) => Check) | null;
    checkMove: ((path: string, folder: string) => Check) | null;
  };
  let renamed: { path: string; name: string }[];
  let moved: { path: string; folder: string }[];

  beforeEach(() => {
    document.body.innerHTML = '';
    tree = document.createElement('file-tree');
    document.body.appendChild(tree);
    tree.files = GEARS;
    tree.folders = ['examples'];
    tree.main = 'main.pathogen';
    tree.active = 'main.pathogen';
    tree.checkRename = (path, name) =>
      name === 'kit' && path === 'parts/gears.pathogen'
        ? { message: 'parts/ already has kit.pathogen.' }
        : {
            hint:
              path === 'parts'
                ? 'Moves its 3 files, and updates the imports in 2 files'
                : 'Updates the imports in 2 files',
          };
    tree.checkMove = (path, folder) =>
      folder === 'demos' && path === 'parts/gears.pathogen'
        ? { message: 'demos/ already has gears.pathogen.' }
        : { hint: `Moving it to ${folder ? `${folder}/` : 'the top'} updates the imports in main.pathogen.` };
    renamed = [];
    moved = [];
    tree.addEventListener('rename-entry', (e) =>
      renamed.push((e as Event & { detail: { path: string; name: string } }).detail),
    );
    tree.addEventListener('move-entry', (e) =>
      moved.push((e as Event & { detail: { path: string; folder: string } }).detail),
    );
  });

  const $ = <T extends Element = HTMLElement>(sel: string) => tree.shadowRoot!.querySelector<T>(sel);
  const dots = (path: string) => $(`[role="treeitem"][data-path="${path}"] .row-menu`)!;
  const menu = () => $('[role="menu"]')!;
  const choose = (label: string) =>
    [...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.querySelector('.label')!.textContent === label)!
      .click();
  const field = () => $<HTMLInputElement>('.row.input input');
  const hint = () => $('.name-hint')!;
  const focused = () => tree.shadowRoot!.activeElement as HTMLElement | null;
  const key = (target: Element, k: string) => {
    const init = { key: k, bubbles: true, composed: true, cancelable: true };
    return target.dispatchEvent(new window.KeyboardEvent('keydown', init));
  };
  const typeName = (text: string) => {
    field()!.value = text;
    field()!.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  it('Rename… turns the row into a field holding its name, selected, with .pathogen after it', () => {
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    const rows = [...tree.shadowRoot!.querySelectorAll<HTMLElement>('.list > .row')].map(
      (r) => r.dataset.path ?? (r.classList.contains('input') ? '[field]' : ''),
    );
    const at = rows.indexOf('[field]');
    expect(rows.slice(at - 1, at + 2)).toEqual(['parts', '[field]', 'parts/kit.pathogen']);
    expect(rows).not.toContain('parts/gears.pathogen');
    expect([field()!.value, field()!.selectionStart, field()!.selectionEnd, focused()]).toEqual([
      'gears',
      0,
      5,
      field(),
    ]);
    expect([$('.row.input .ext')!.textContent, field()!.getAttribute('aria-label')]).toEqual([
      '.pathogen',
      'New name for gears.pathogen',
    ]);
    expect(hint().textContent).toBe('Updates the imports in 2 files · Enter to rename, Esc to cancel');
  });

  it('a taken name is refused in place; Enter renames a good one; the same name just closes the field', () => {
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    typeName('kit');
    expect([field()!.getAttribute('aria-invalid'), hint().textContent]).toEqual([
      'true',
      'parts/ already has kit.pathogen.',
    ]);
    key(field()!, 'Enter');
    expect(renamed).toEqual([]);
    typeName('gears');
    key(field()!, 'Enter');
    expect([renamed, field()]).toEqual([[], null]);
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    typeName('cogs');
    key(field()!, 'Enter');
    expect(renamed).toEqual([{ path: 'parts/gears.pathogen', name: 'cogs' }]);
  });

  it('a folder’s field has no .pathogen, and its line counts the files it moves', () => {
    dots('parts').click();
    choose('Rename…');
    expect([field()!.value, $('.row.input .ext'), hint().textContent]).toEqual([
      'parts',
      null,
      'Moves its 3 files, and updates the imports in 2 files · Enter to rename, Esc to cancel',
    ]);
    // The folder's files stay listed under its field.
    expect(tree.shadowRoot!.querySelector('[data-path="parts/kit.pathogen"]')).not.toBeNull();
    key(field()!, 'Escape');
    expect([field(), focused()?.dataset.path]).toEqual([null, 'parts']);
  });

  it('Move to… lists the top and every folder; the one it’s in can’t be chosen', () => {
    dots('parts/kit.pathogen').click();
    choose('Move to…');
    expect(menu().querySelector('.menu-head')!.textContent).toBe('Move kit.pathogen to');
    const items = [...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')].map((i) => [
      i.querySelector('.label')!.textContent,
      i.getAttribute('aria-disabled') === 'true',
      i.querySelector('small')?.textContent ?? '',
    ]);
    expect(items).toEqual([
      ['The top of the workspace', false, ''],
      ['demos/', false, ''],
      ['examples/', false, ''],
      ['parts/', true, 'It’s here now'],
    ]);
    // Its line says what the focused one would do.
    expect(menu().querySelector('.menu-foot')!.textContent).toBe(
      'Moving it to the top updates the imports in main.pathogen.',
    );
    key(focused()!, 'ArrowDown');
    expect(menu().querySelector('.menu-foot')!.textContent).toBe(
      'Moving it to demos/ updates the imports in main.pathogen.',
    );
  });

  it('a folder can’t move into itself; a refused folder says why and can’t be chosen', () => {
    dots('parts').click();
    choose('Move to…');
    const labels = [...menu().querySelectorAll('[role="menuitem"] .label')].map((l) => l.textContent);
    expect(labels).toEqual(['The top of the workspace', 'demos/', 'examples/']);
    expect(menu().querySelector('[role="menuitem"]')!.getAttribute('aria-disabled')).toBe('true');
    key(focused()!, 'Escape');
    dots('parts/gears.pathogen').click();
    choose('Move to…');
    const demos = [...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')][1];
    expect([demos.getAttribute('aria-disabled'), demos.querySelector('small')!.textContent]).toEqual([
      'true',
      'demos/ already has gears.pathogen.',
    ]);
    demos.click();
    expect(moved).toEqual([]);
  });

  it('choosing a folder reports the move', () => {
    dots('parts/kit.pathogen').click();
    choose('Move to…');
    choose('demos/');
    expect([moved, menu().hidden]).toEqual([[{ path: 'parts/kit.pathogen', folder: 'demos' }], true]);
  });

  const folded = (path: string) => $(`[role="treeitem"][data-path="${path}"]`)!.getAttribute('aria-expanded');

  it('a renamed folder keeps its folding, and the keyboard lands on it', () => {
    // workspace-view applies the rename as the event is handled.
    tree.addEventListener('rename-entry', () => {
      tree.files = GEARS.map((f) => ({ ...f, path: f.path.replace(/^parts\//, 'machines/') }));
    });
    $('[data-path="parts"]')!.click();
    expect(folded('parts')).toBe('false');
    dots('parts').click();
    choose('Rename…');
    typeName('machines');
    key(field()!, 'Enter');
    expect([folded('machines'), focused()?.dataset.path, field()]).toEqual(['false', 'machines', null]);
  });

  it('a refused rename leaves the row where it was, with the keyboard on it', () => {
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    typeName('cogs');
    key(field()!, 'Enter');
    expect([renamed.length, focused()?.dataset.path]).toEqual([1, 'parts/gears.pathogen']);
  });

  it('a moved file takes the keyboard with it', () => {
    tree.addEventListener('move-entry', () => {
      tree.files = GEARS.map((f) => (f.path === 'parts/kit.pathogen' ? { ...f, path: 'demos/kit.pathogen' } : f));
    });
    dots('parts/kit.pathogen').click();
    choose('Move to…');
    choose('demos/');
    expect(focused()?.dataset.path).toBe('demos/kit.pathogen');
  });

  it('left with a click, the rename waits until the click has landed (its row isn’t redrawn under the pointer)', async () => {
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    typeName('cogs');
    window.dispatchEvent(new window.Event('pointerdown'));
    field()!.blur();
    expect(renamed).toEqual([]);
    window.dispatchEvent(new window.Event('pointerup'));
    expect(renamed).toEqual([]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(renamed).toEqual([{ path: 'parts/gears.pathogen', name: 'cogs' }]);
    // Left with the keyboard (Tab), it renames at once.
    dots('parts/kit.pathogen').click();
    choose('Rename…');
    typeName('box');
    field()!.blur();
    expect(renamed.at(-1)).toEqual({ path: 'parts/kit.pathogen', name: 'box' });
  });

  it('a row renamed or deleted elsewhere while its field is open takes the field with it', () => {
    dots('parts/gears.pathogen').click();
    choose('Rename…');
    tree.files = GEARS.filter((f) => f.path !== 'parts/gears.pathogen');
    expect(field()).toBeNull();
  });
});

// Step 4b (mockup v6 screen N): the "+" in the header, its menu, and the name
// field. The tree asks workspace-view whether a name can be used (checkName,
// the workspace's own rules) and reports a good one as `create-entry`.
describe('adding files and folders', () => {
  beforeAll(async () => {
    await import('../playground/components/file-tree.js');
  });

  type Kind = 'program' | 'library' | 'folder';
  let tree: FileTreeEl & { checkName: ((kind: Kind, folder: string, name: string) => string | null) | null };
  interface Created {
    kind: Kind;
    folder: string;
    name: string;
    focusEditor: boolean;
  }
  let created: Created[];

  beforeEach(() => {
    document.body.innerHTML = '';
    tree = document.createElement('file-tree');
    document.body.appendChild(tree);
    tree.files = GEARS;
    tree.folders = [];
    tree.main = 'main.pathogen';
    tree.active = 'parts/gears.pathogen';
    // The workspace's rules, as workspace-view answers them: gears is taken in parts/.
    tree.checkName = (_kind, folder, name) => {
      if (name === '') return "A name can't be empty.";
      return folder === 'parts' && name === 'gears' ? 'parts/ already has gears.pathogen.' : null;
    };
    created = [];
    tree.addEventListener('create-entry', (e) => created.push((e as Event & { detail: Created }).detail));
  });

  const $ = <T extends Element = HTMLElement>(sel: string) => tree.shadowRoot!.querySelector<T>(sel);
  const plus = () => $<HTMLButtonElement>('.add')!;
  const menu = () => $('[role="menu"]');
  const focused = () => tree.shadowRoot!.activeElement as HTMLElement | null;
  const key = (target: Element, k: string) => {
    const init = { key: k, bubbles: true, composed: true, cancelable: true };
    return target.dispatchEvent(new window.KeyboardEvent('keydown', init));
  };
  const choose = (label: string) =>
    [...tree.shadowRoot!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.querySelector('.label')!.textContent === label)!
      .click();
  const field = () => $<HTMLInputElement>('.row.input input');
  const hint = () => $('.name-hint')!;
  const typeName = (text: string) => {
    field()!.value = text;
    field()!.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  it('the + opens a menu that adds to the folder of the file in the editor', () => {
    expect(['aria-label', 'aria-haspopup', 'aria-expanded'].map((a) => plus().getAttribute(a))).toEqual([
      'Add a file or folder',
      'menu',
      'false',
    ]);
    plus().click();
    expect([menu()!.hidden, plus().getAttribute('aria-expanded')]).toEqual([false, 'true']);
    expect($('.menu-head')!.textContent).toBe('Add to parts/');
    const items = [...tree.shadowRoot!.querySelectorAll('[role="menuitem"]')];
    const labels = items.map((i) => {
      const small = i.querySelector('small')?.textContent ?? '';
      return [i.querySelector('.label')!.textContent, small];
    });
    expect(labels).toEqual([
      ['New program', 'A file that draws'],
      ['New module', ''],
      ['New folder', ''],
      ['Upload files…', 'Or drop them on the tree'],
      ['Upload folder…', 'Keeps the folders inside it'],
    ]);
    expect(focused()).toBe(items[0]);
  });

  it('adds to the folder clicked last, to the top, or, once another file opens, to its folder', () => {
    tree.active = 'main.pathogen';
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add at the top');
    key(focused()!, 'Escape');
    tree.shadowRoot!.querySelector<HTMLElement>('[data-path="demos"]')!.click();
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add to demos/');
    key(focused()!, 'Escape');
    tree.active = 'parts/kit.pathogen';
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add to parts/');
  });

  it('adds to the folder of the row you’re on, a file row too (mockup v6 screen N)', () => {
    tree.active = 'main.pathogen';
    tree.shadowRoot!.querySelector<HTMLElement>('[data-path="demos/gears.pathogen"]')!.focus();
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add to demos/');
  });

  it('moves with the arrow keys, and Escape closes it and returns to the +', () => {
    plus().click();
    key(focused()!, 'ArrowDown');
    expect(focused()!.querySelector('.label')!.textContent).toBe('New module');
    key(focused()!, 'End');
    expect(focused()!.querySelector('.label')!.textContent).toBe('Upload folder…');
    key(focused()!, 'ArrowDown');
    expect(focused()!.querySelector('.label')!.textContent).toBe('New program');
    key(focused()!, 'Escape');
    expect([menu()!.hidden, focused(), plus().getAttribute('aria-expanded')]).toEqual([true, plus(), 'false']);
  });

  it('closes on a click outside it', () => {
    plus().click();
    document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true, composed: true }));
    expect(menu()!.hidden).toBe(true);
  });

  it('New module puts a name field first in the folder, with .pathogen and a hint', () => {
    plus().click();
    choose('New module');
    expect(menu()!.hidden).toBe(true);
    const order = [...tree.shadowRoot!.querySelectorAll<HTMLElement>('.list > .row')].map(
      (r) => r.dataset.path ?? (r.classList.contains('input') ? '[field]' : ''),
    );
    expect(order.slice(2, 5)).toEqual(['parts', '[field]', 'parts/gears.pathogen']);
    expect(focused()).toBe(field());
    expect([field()!.getAttribute('aria-label'), $('.row.input .ext')!.textContent]).toEqual([
      'New module name',
      '.pathogen',
    ]);
    expect(hint().textContent).toBe('Enter to create, Esc to cancel');
    expect(field()!.getAttribute('aria-describedby')).toBe(hint().id);
  });

  it('a taken name is refused in place, and Enter does nothing; nor does an empty one', () => {
    plus().click();
    choose('New module');
    typeName('gears');
    expect([field()!.getAttribute('aria-invalid'), hint().textContent, hint().classList.contains('bad')]).toEqual([
      'true',
      'parts/ already has gears.pathogen.',
      true,
    ]);
    key(field()!, 'Enter');
    expect([created, !!field()]).toEqual([[], true]);
    typeName('');
    expect([field()!.getAttribute('aria-invalid'), hint().textContent]).toEqual([
      'false',
      'Enter to create, Esc to cancel',
    ]);
    key(field()!, 'Enter');
    expect([created, !!field()]).toEqual([[], true]);
  });

  it('Enter creates a good name, and the field goes', () => {
    plus().click();
    choose('New module');
    typeName('ratchet');
    expect(field()!.getAttribute('aria-invalid')).toBe('false');
    key(field()!, 'Enter');
    expect(created).toEqual([{ kind: 'library', folder: 'parts', name: 'ratchet', focusEditor: true }]);
    expect(field()).toBeNull();
  });

  it('Esc cancels and returns to the +', () => {
    plus().click();
    choose('New program');
    typeName('poster');
    key(field()!, 'Escape');
    expect([created, field(), focused()]).toEqual([[], null, plus()]);
  });

  it('leaving the field creates a good name, and drops an empty or taken one', () => {
    plus().click();
    choose('New program');
    typeName('star');
    field()!.dispatchEvent(new window.FocusEvent('blur'));
    // Made by leaving the field: the keyboard goes where you went, not to the editor.
    expect(created).toEqual([{ kind: 'program', folder: 'parts', name: 'star', focusEditor: false }]);
    expect(field()).toBeNull();
    plus().click();
    choose('New program');
    typeName('gears');
    field()!.dispatchEvent(new window.FocusEvent('blur'));
    expect([created.length, field()]).toEqual([1, null]);
  });

  it('a new folder’s field has no .pathogen; the new folder is where the + adds next', () => {
    plus().click();
    choose('New folder');
    expect([field()!.getAttribute('aria-label'), $('.row.input .ext'), hint().textContent]).toEqual([
      'New folder name',
      null,
      'Enter to create, Esc to cancel',
    ]);
    // workspace-view adds it as it handles the event; the tree then shows it, and the keyboard is on it.
    tree.addEventListener('create-entry', () => {
      tree.folders = ['parts/shapes'];
    });
    typeName('shapes');
    key(field()!, 'Enter');
    expect(created).toEqual([{ kind: 'folder', folder: 'parts', name: 'shapes', focusEditor: true }]);
    expect(focused()?.dataset.path).toBe('parts/shapes');
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add to parts/shapes/');
  });

  it('the Enter that makes a folder doesn’t also fold it, when the folder appears at once', () => {
    // workspace-view adds the folder while the Enter is still on its way up the tree.
    tree.addEventListener('create-entry', (e) => {
      const { folder, name } = (e as Event & { detail: { folder: string; name: string } }).detail;
      tree.folders = [`${folder}/${name}`];
    });
    plus().click();
    choose('New folder');
    typeName('shapes');
    key(field()!, 'Enter');
    const shapes = tree.shadowRoot!.querySelector<HTMLElement>('[data-path="parts/shapes"]')!;
    expect([shapes.getAttribute('aria-expanded'), focused()]).toEqual(['true', shapes]);
    expect((shapes.nextElementSibling as HTMLElement).textContent).toBe('Empty');
  });

  it('a folder that couldn’t be made doesn’t take the keyboard when one like it appears later', () => {
    // No one adds it here: workspace-view refused it, and a toast said why.
    plus().click();
    choose('New folder');
    typeName('shapes');
    key(field()!, 'Enter');
    expect(created).toHaveLength(1);
    tree.shadowRoot!.querySelector<HTMLElement>('[data-path="main.pathogen"]')!.focus();
    tree.folders = ['parts/shapes'];
    expect(focused()?.dataset.path).toBe('main.pathogen');
  });

  it('a folder gone while the menu was open: the field goes where the + adds now', () => {
    plus().click();
    expect($('.menu-head')!.textContent).toBe('Add to parts/');
    // parts/ deleted meanwhile (and the file in the editor with it).
    tree.files = GEARS.filter((f) => !f.path.startsWith('parts/'));
    choose('New module');
    expect(focused()).toBe(field());
    typeName('ratchet');
    key(field()!, 'Enter');
    expect(created).toEqual([{ kind: 'library', folder: '', name: 'ratchet', focusEditor: true }]);
  });

  it('the keys the menu uses stay in it: its Escape reaches no one else', () => {
    const outside: string[] = [];
    const listen = (e: KeyboardEvent) => outside.push(e.key);
    document.addEventListener('keydown', listen);
    plus().click();
    key(focused()!, 'ArrowDown');
    key(focused()!, 'Escape');
    document.removeEventListener('keydown', listen);
    expect(outside).toEqual([]);
  });

  it('Tab from the menu closes it and goes on from the +', () => {
    plus().click();
    key(focused()!, 'Tab');
    expect([menu()!.hidden, focused()]).toEqual([true, plus()]);
  });

  it('closes when the window resizes, and when the tree leaves the page', () => {
    plus().click();
    window.dispatchEvent(new window.Event('resize'));
    expect(menu()!.hidden).toBe(true);
    plus().click();
    tree.remove();
    document.body.appendChild(tree);
    expect([menu()!.hidden, plus().getAttribute('aria-expanded')]).toEqual([true, 'false']);
  });

  it('a refused name is announced: the field’s line is a polite live region', () => {
    plus().click();
    choose('New module');
    expect(hint().getAttribute('aria-live')).toBe('polite');
  });

  it('with no programs, a new program’s hint says it will be the main', () => {
    tree.main = null;
    plus().click();
    choose('New program');
    expect(hint().textContent).toBe('The only program, so it becomes the main · Enter to create, Esc to cancel');
  });

  it('naming in a folded folder unfolds it', () => {
    tree.shadowRoot!.querySelector<HTMLElement>('[data-path="parts"]')!.click();
    expect(tree.shadowRoot!.querySelector('[data-path="parts"]')!.getAttribute('aria-expanded')).toBe('false');
    plus().click();
    choose('New module');
    expect(tree.shadowRoot!.querySelector('[data-path="parts"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(focused()).toBe(field());
  });
});

// Step 6a (mockup v6 screen U): Upload files… and Upload folder… open the
// browser's picker for the folder the menu was for; files dragged from the
// computer light the folder they'd go to; a drop is taken at once; new rows
// flash; the upload's question sits beside a row.
describe('uploads', () => {
  beforeAll(async () => {
    await import('../playground/components/file-tree.js');
  });

  type TreeWithUploads = FileTreeEl & {
    dropFolderAt: (target: EventTarget | null) => string;
    flash: (paths: string[]) => void;
    askClash: (existing: string, q: unknown) => Promise<unknown>;
    cancelAsk: () => void;
  };
  let tree: TreeWithUploads;

  beforeEach(() => {
    document.body.innerHTML = '';
    tree = document.createElement('file-tree') as TreeWithUploads;
    document.body.appendChild(tree);
    tree.files = GEARS;
    tree.folders = ['empty'];
    tree.main = 'main.pathogen';
    tree.active = 'parts/gears.pathogen';
  });

  const $ = <T extends Element = HTMLElement>(sel: string) => tree.shadowRoot!.querySelector<T>(sel);
  const row = (path: string) => $(`[data-path="${path}"]`)!;
  const choose = (label: string) =>
    [...tree.shadowRoot!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.querySelector('.label')!.textContent === label)!
      .click();

  /** A drag event carrying files, as the browser sends one from the desktop. */
  const fileDrag = (type: string, target: Element, files: File[] = []) => {
    const data = {
      types: ['Files'],
      files,
      items: files.map((file) => ({ kind: 'file', webkitGetAsEntry: () => null, getAsFile: () => file })),
      dropEffect: 'none',
    };
    const event = new window.Event(type, { bubbles: true, composed: true, cancelable: true }) as DragEvent;
    Object.defineProperties(event, { dataTransfer: { value: data }, clientX: { value: 40 }, clientY: { value: 60 } });
    target.dispatchEvent(event);
    return event;
  };

  it('Upload files… opens the picker for .pathogen files, and its files go to the folder the menu was for', () => {
    const uploads: { folder: string; picked: { path: string }[] }[] = [];
    tree.addEventListener('upload-files', (e) => uploads.push((e as CustomEvent).detail));
    const input = $<HTMLInputElement>('.pick-files')!;
    let opened = 0;
    input.click = () => void opened++;
    expect([input.multiple, input.accept]).toEqual([true, '.pathogen']);
    $<HTMLButtonElement>('.add')!.click();
    choose('Upload files…');
    expect(opened).toBe(1);
    Object.defineProperty(input, 'files', { value: [new File(['M 0 0'], 'springs.pathogen')], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    expect(uploads.map((u) => [u.folder, u.picked.map((p) => p.path)])).toEqual([['parts', ['springs.pathogen']]]);
  });

  it('Upload folder… picks a folder, for the folder whose menu it was', () => {
    const uploads: { folder: string }[] = [];
    tree.addEventListener('upload-files', (e) => uploads.push((e as CustomEvent).detail));
    const input = $<HTMLInputElement>('.pick-folder')!;
    input.click = () => undefined;
    expect(input.hasAttribute('webkitdirectory')).toBe(true);
    row('demos').querySelector<HTMLElement>('.row-menu')!.click();
    choose('Upload folder…');
    const file = new File(['M 0 0'], 'dot.pathogen');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'shapes/dot.pathogen' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    expect(uploads.map((u) => u.folder)).toEqual(['demos']);
  });

  it('where a drop goes: a folder row’s own folder, a file row’s folder, the top for pathogen.json or empty space', () => {
    expect(tree.dropFolderAt(row('demos'))).toBe('demos');
    expect(tree.dropFolderAt(row('parts/kit.pathogen'))).toBe('parts');
    expect(tree.dropFolderAt(row('main.pathogen'))).toBe('');
    expect(tree.dropFolderAt(row('pathogen.json'))).toBe('');
    expect(tree.dropFolderAt($('.list'))).toBe('');
  });

  it('files dragged over a folder light it and the rows in it, and the label says where they go', () => {
    const over = fileDrag('dragover', row('parts/kit.pathogen'));
    expect(over.defaultPrevented).toBe(true);
    expect([row('parts').classList.contains('drop'), row('parts/gears.pathogen').classList.contains('in-drop')]).toEqual([
      true,
      true,
    ]);
    expect(row('demos').classList.contains('drop')).toBe(false);
    const label = $('.drop-label')!;
    expect([label.hidden, label.textContent]).toEqual([false, 'Drop to add to parts/']);
    fileDrag('dragover', $('.list')!);
    expect([row('parts').classList.contains('drop'), $('.list')!.classList.contains('drop-top'), label.textContent]).toEqual([
      false,
      true,
      'Drop to add at the top',
    ]);
  });

  it('a drop is taken at once, for the folder under the pointer, and the lights go out', () => {
    const drops: { folder: string; drop: { files: File[] } }[] = [];
    tree.addEventListener('upload-drop', (e) => drops.push((e as CustomEvent).detail));
    const file = new File(['M 0 0'], 'springs.pathogen');
    fileDrag('dragover', row('demos'));
    const dropped = fileDrag('drop', row('demos/gears.pathogen'), [file]);
    expect(dropped.defaultPrevented).toBe(true);
    expect(drops.map((d) => [d.folder, d.drop.files])).toEqual([['demos', [file]]]);
    expect([row('demos').classList.contains('drop'), $('.drop-label')!.hidden]).toEqual([false, true]);
  });

  it('a drag that isn’t files (text from the editor) is left alone', () => {
    const event = new window.Event('dragover', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/plain'] } });
    row('demos').dispatchEvent(event);
    expect([event.defaultPrevented, row('demos').classList.contains('drop')]).toEqual([false, false]);
  });

  it('new rows flash for a moment, their folders opened, through a redraw', async () => {
    row('parts').click();
    expect(row('parts').getAttribute('aria-expanded')).toBe('false');
    tree.files = [...GEARS, { path: 'parts/springs.pathogen', kind: 'program' }];
    tree.flash(['parts/springs.pathogen']);
    expect([row('parts').getAttribute('aria-expanded'), row('parts/springs.pathogen').classList.contains('flash')]).toEqual([
      'true',
      true,
    ]);
    tree.files = [...tree.files];
    expect(row('parts/springs.pathogen').classList.contains('flash')).toBe(true);
  });

  it('the upload’s question sits beside the row of the file already there, and gives its answer', async () => {
    const answer = tree.askClash('parts/labels.pathogen', {
      name: 'labels.pathogen',
      where: 'parts/',
      keepBothName: 'labels-2.pathogen',
      others: 0,
    });
    const prompt = $('clash-prompt')!;
    expect(prompt.hidden).toBe(false);
    prompt.shadowRoot!.querySelector<HTMLElement>('[data-choice="keep-both"]')!.click();
    expect(await answer).toEqual({ choice: 'keep-both', forAll: false });
    const withdrawn = tree.askClash('parts/labels.pathogen', {
      name: 'labels.pathogen',
      where: 'parts/',
      keepBothName: 'labels-2.pathogen',
      others: 0,
    });
    tree.cancelAsk();
    expect(await withdrawn).toBeNull();
  });
});
