// @vitest-environment jsdom
//
// The tree below 800 px and on a touch screen (2d, step 9b; mockup v7 screen
// M; docs/workspace-files.md "On a phone"):
// - it's a drawer: tapping a file opens it and asks for the drawer to close
//   (`close-files`), as do Esc on a row and the drawer's ×; a folder folds and
//   leaves it open;
// - a menu is an action sheet: the same items, under the row's path, with
//   Cancel;
// - nothing is dragged;
// - on a touch screen, Upload folder… is left out, and Upload files… doesn't
//   suggest dropping.
// On a wide screen with a mouse, none of it: rows drag, menus have no Cancel,
// and opening a file leaves the tree as it is.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TreeFile } from '../playground/utils/file-tree-rows.js';

// A desktop browser's picker can pick a folder (jsdom's can't).
if (!('webkitdirectory' in HTMLInputElement.prototype)) {
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', { value: false, writable: true });
}

type FileTreeEl = HTMLElement & { files: TreeFile[]; folders: string[]; active: string | null; main: string | null };

const FILES: TreeFile[] = [
  { path: 'main.pathogen', kind: 'program' },
  { path: 'try-sizes.pathogen', kind: 'program' },
  { path: 'parts/kit.pathogen', kind: 'library' },
];

/** The screen: below 800 px or not, touch or not. The tree hears a change through `change`. */
let screen = { narrow: false, touch: false };
let changeListeners: (() => void)[] = [];
function setScreen(next: { narrow: boolean; touch: boolean }): void {
  screen = next;
  for (const listener of changeListeners) listener();
}

describe('the tree on a narrow screen (step 9b)', () => {
  beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
      get matches() {
        return (query === '(max-width: 800px)' && screen.narrow) || (query === '(hover: none)' && screen.touch);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => changeListeners.push(listener),
      removeEventListener: (_type: string, listener: () => void) => {
        changeListeners = changeListeners.filter((l) => l !== listener);
      },
    })) as unknown as typeof window.matchMedia;
    await import('../playground/components/file-tree.js');
  });

  let tree: FileTreeEl;
  let events: string[];

  beforeEach(() => {
    screen = { narrow: false, touch: false };
    document.body.innerHTML = '';
    tree = document.createElement('file-tree');
    document.body.appendChild(tree);
    tree.files = FILES;
    tree.folders = [];
    tree.main = 'main.pathogen';
    tree.active = 'main.pathogen';
    events = [];
    tree.addEventListener('open-file', (e) =>
      events.push(`open ${(e as Event & { detail: { path: string } }).detail.path}`),
    );
    // 'close' after a file chosen; 'dismiss' for the × or Esc, which send the keyboard back to Files.
    tree.addEventListener('close-files', (e) =>
      events.push((e as Event & { detail: { dismissed: boolean } }).detail.dismissed ? 'dismiss' : 'close'),
    );
    (tree as unknown as { checkName: () => null }).checkName = () => null;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const root = () => tree.shadowRoot!;
  const row = (path: string) => root().querySelector<HTMLElement>(`[role="treeitem"][data-path="${path}"]`)!;
  const menu = () => root().querySelector<HTMLElement>('[role="menu"]')!;
  const labels = () =>
    [...menu().querySelectorAll('[role="menuitem"] .label, [role="separator"]')].map((el) =>
      el.getAttribute('role') === 'separator' ? '—' : el.textContent,
    );
  const key = (target: Element, k: string) =>
    target.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }),
    );

  it('wide, with a mouse: rows drag, a menu has no Cancel, opening a file leaves the tree open', () => {
    expect(row('main.pathogen').getAttribute('draggable')).toBe('true');
    row('parts/kit.pathogen').querySelector<HTMLElement>('.row-menu')!.click();
    expect([menu().classList.contains('sheet'), menu().querySelector('.menu-cancel')]).toEqual([false, null]);
    row('try-sizes.pathogen').click();
    expect(events).toEqual(['open try-sizes.pathogen']);
  });

  it('narrow: tapping a file opens it and closes the drawer; a folder folds and leaves it open', () => {
    setScreen({ narrow: true, touch: true });
    row('try-sizes.pathogen').click();
    row('parts').click();
    expect([events, row('parts').getAttribute('aria-expanded')]).toEqual([
      ['open try-sizes.pathogen', 'close'],
      'false',
    ]);
  });

  it('narrow: Esc on a row, on the +, and the drawer’s × dismiss it', () => {
    setScreen({ narrow: true, touch: false });
    key(row('main.pathogen'), 'Escape');
    key(root().querySelector('.add')!, 'Escape');
    root().querySelector<HTMLButtonElement>('.close-files')!.click();
    expect(events).toEqual(['dismiss', 'dismiss', 'dismiss']);
  });

  it('narrow: Esc in an open menu closes the menu only; Esc in the name field cancels it only', () => {
    setScreen({ narrow: true, touch: true });
    row('parts/kit.pathogen').querySelector<HTMLElement>('.row-menu')!.click();
    key(menu().querySelector('[role="menuitem"]')!, 'Escape');
    expect([menu().hidden, events]).toEqual([true, []]);
    root().querySelector<HTMLButtonElement>('.add')!.click();
    [...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.querySelector('.label')!.textContent === 'New program')!
      .click();
    const field = root().querySelector<HTMLInputElement>('.row.input input')!;
    key(field, 'Escape');
    expect([root().querySelector('.row.input'), events]).toEqual([null, []]);
  });

  it('narrow: a sheet stays open through a resize (a phone’s address bar); crossing 800 px closes it', () => {
    setScreen({ narrow: true, touch: true });
    row('parts/kit.pathogen').querySelector<HTMLElement>('.row-menu')!.click();
    window.dispatchEvent(new window.Event('resize'));
    expect(menu().hidden).toBe(false);
    setScreen({ narrow: false, touch: false });
    expect(menu().hidden).toBe(true);
  });

  it('narrow: a row’s menu is an action sheet, its path above the same items, with Cancel', () => {
    setScreen({ narrow: true, touch: true });
    row('parts/kit.pathogen').querySelector<HTMLElement>('.row-menu')!.click();
    expect([
      menu().classList.contains('sheet'),
      menu().querySelector('.menu-head')?.textContent,
      labels(),
      menu().querySelector('.menu-cancel')?.textContent,
    ]).toEqual([true, 'parts/kit.pathogen', ['Rename…', 'Move to…', 'Duplicate', '—', 'Delete…'], 'Cancel']);
    menu().querySelector<HTMLButtonElement>('.menu-cancel')!.click();
    expect(menu().hidden).toBe(true);
  });

  it('narrow, or touch: nothing is dragged, and a resize or rotation says so at once', () => {
    setScreen({ narrow: true, touch: false });
    expect(row('main.pathogen').hasAttribute('draggable')).toBe(false);
    setScreen({ narrow: false, touch: true });
    expect(row('main.pathogen').hasAttribute('draggable')).toBe(false);
    setScreen({ narrow: false, touch: false });
    expect(row('main.pathogen').getAttribute('draggable')).toBe('true');
  });

  it('touch: Upload folder… is left out, and Upload files… doesn’t suggest dropping', () => {
    setScreen({ narrow: false, touch: false });
    root().querySelector<HTMLButtonElement>('.add')!.click();
    expect(labels()).toContain('Upload folder…');
    root().querySelector<HTMLButtonElement>('.add')!.click();
    setScreen({ narrow: false, touch: true });
    root().querySelector<HTMLButtonElement>('.add')!.click();
    const upload = [...menu().querySelectorAll('[role="menuitem"]')].find(
      (item) => item.querySelector('.label')!.textContent === 'Upload files…',
    )!;
    expect([labels().includes('Upload folder…'), upload.querySelector('small')]).toEqual([false, null]);
  });
});
