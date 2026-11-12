// @vitest-environment jsdom
//
// The file tree (phase 2d, step 4a; docs/workspace-files.md "The file tree and
// tabs", mockup v6 screens O and J). Folders first, then files, each sorted by
// name; pathogen.json last, read-only; the main's badge; folders that fold.
// The tree is a view: it reports a click as `open-file`, and workspace-view
// opens the file (services/open-files.ts).

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { treeRows } from '../playground/utils/file-tree-rows.js';

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
    if (r.type === 'project') return `${pad}${r.name} [lock]`;
    return `${pad}${r.name}${r.kind === 'library' ? ' [lib]' : ''}${r.main ? ' [main]' : ''}`;
  });
}

describe('the tree’s rows', () => {
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
