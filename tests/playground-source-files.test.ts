// @vitest-environment jsdom
//
// <source-files>, the read-only viewer for one file or several (2e, step 3b;
// note 59, mockups v12 to v14). Without CodeMirror (activate() isn't called),
// the text shows plain, which is what these check:
//   - one file: no list, no file line, the copy icon floating;
//   - several: the workspace tree's order and look, the file line with the
//     copy icon in its cell; opening a file by click or keyboard;
//   - copying: "Copied" only once the clipboard has taken it, and a refusal;
//   - narrow: a menu, and the files as a sheet.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../playground/components/shared/source-files.js';

import type { SourceFile, SourceFiles } from '../playground/components/shared/source-files.js';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const KIT = 'module;\nexport const teeth = 12;\n';
const DEMO = 'import { gear } from "../parts/gears.pathogen";\ngear(8);\n';
const PJ = '{\n  "entryPoints": [\n    "main.pathogen",\n    "demos/gears.pathogen"\n  ]\n}\n';
const SEVERAL: SourceFile[] = [
  { path: 'main.pathogen', text: MAIN, kind: 'program' },
  { path: 'parts/gears.pathogen', text: GEARS, kind: 'library' },
  { path: 'parts/kit.pathogen', text: KIT, kind: 'library' },
  { path: 'demos/gears.pathogen', text: DEMO, kind: 'program' },
  { path: 'pathogen.json', text: PJ, kind: 'project' },
];

function mount(files: SourceFile[], options: { open?: string; main?: string; folders?: string[] } = {}): SourceFiles {
  const el = document.createElement('source-files') as SourceFiles;
  el.files = files;
  el.folders = options.folders ?? [];
  el.main = options.main ?? 'main.pathogen';
  el.open = options.open ?? 'main.pathogen';
  document.body.appendChild(el);
  return el;
}

const $ = (el: SourceFiles, sel: string): HTMLElement | null => el.shadowRoot!.querySelector(sel);
const $$ = (el: SourceFiles, sel: string): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn();
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('one file', () => {
  it('shows the code alone, the copy icon floating in its corner', () => {
    const el = mount([{ path: 'main.pathogen', text: MAIN, kind: 'program' }]);
    expect($(el, '.list')).toBeNull();
    expect($(el, '.path')).toBeNull();
    expect($(el, '.cell.float .cp')?.getAttribute('aria-label')).toBe('Copy main.pathogen');
    expect($(el, '.fallback code')?.textContent).toBe(MAIN);
  });

  it('a text that isn’t a file says “Copy the code”', () => {
    const el = mount([{ path: 'main.pathogen', text: MAIN, kind: 'program' }]);
    el.copyLabel = 'the code';
    expect($(el, '.cp')?.getAttribute('aria-label')).toBe('Copy the code');
  });
});

describe('several files', () => {
  it('lists them as the workspace tree does: folders first, then files, pathogen.json last', () => {
    const el = mount(SEVERAL, { folders: ['spare'] });
    const rows = $$(el, '.list .row').map((r) => text(r));
    expect(rows).toEqual([
      'demos',
      'gears.pathogen',
      'parts',
      'gears.pathogen',
      'kit.pathogen',
      'spare',
      'Empty',
      'main.pathogen',
      'pathogen.json',
    ]);
    expect([text($(el, '.list .head span')), text($(el, '.list .head .count'))]).toEqual(['Files', '5']);
    // Programs and modules have the tree's icons: a module's row is a library row.
    expect($(el, '[data-path="parts/gears.pathogen"]')?.classList.contains('library')).toBe(true);
    expect($(el, '[data-path="demos/gears.pathogen"]')?.classList.contains('program')).toBe(true);
  });

  it('badges the main only when it isn’t main.pathogen, and leaves pathogen.json out when it isn’t given', () => {
    const plain = mount(SEVERAL);
    expect($$(plain, '.badge-main')).toHaveLength(0);
    const other = mount(
      SEVERAL.filter((f) => f.kind !== 'project'),
      { main: 'demos/gears.pathogen', open: 'demos/gears.pathogen' },
    );
    expect(text($(other, '[data-path="demos/gears.pathogen"] .badge-main'))).toBe('main');
    expect($(other, '[data-path="pathogen.json"]')).toBeNull();
  });

  it('shows the open file: its row selected, its path in the line above the code, its text', () => {
    const el = mount(SEVERAL, { open: 'demos/gears.pathogen' });
    const row = $(el, '[data-path="demos/gears.pathogen"]')!;
    expect([row.classList.contains('active'), row.getAttribute('aria-selected'), row.tabIndex]).toEqual([
      true,
      'true',
      0,
    ]);
    expect($$(el, '[data-path][tabindex="0"]')).toHaveLength(1);
    expect(text($(el, '.path .p'))).toBe('demos/gears.pathogen');
    expect($(el, '.path .cell .cp')?.getAttribute('aria-label')).toBe('Copy demos/gears.pathogen');
    expect($(el, '.fallback code')?.textContent).toBe(DEMO);
  });

  it('a click opens a file and says so; the open one again changes nothing', () => {
    const el = mount(SEVERAL);
    const opened: string[] = [];
    el.addEventListener('source-file-open', (e) =>
      opened.push((e as unknown as { detail: { path: string } }).detail.path),
    );
    $(el, '[data-path="parts/kit.pathogen"] .name')!.click();
    expect([el.open, text($(el, '.path .p')), $(el, '.fallback code')?.textContent]).toEqual([
      'parts/kit.pathogen',
      'parts/kit.pathogen',
      KIT,
    ]);
    $(el, '[data-path="parts/kit.pathogen"]')!.click();
    $(el, '.row.folder')!.click();
    expect(opened).toEqual(['parts/kit.pathogen']);
  });

  it('the arrow keys, Home and End move between the files, passing the folders; Enter and Space open one', () => {
    const el = mount(SEVERAL, { folders: ['spare'] });
    const focused = (): string | null | undefined => el.shadowRoot!.activeElement?.getAttribute('data-path');
    const press = (key: string): void => {
      el.shadowRoot!.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    $(el, '[data-path="main.pathogen"]')!.focus();
    press('ArrowUp');
    // Above main.pathogen: kit.pathogen in parts/ (spare/ holds nothing to stop on).
    expect(focused()).toBe('parts/kit.pathogen');
    press('ArrowDown');
    expect(focused()).toBe('main.pathogen');
    press('End');
    expect(focused()).toBe('pathogen.json');
    press('Home');
    expect(focused()).toBe('demos/gears.pathogen');
    // Moving focus never opens; only one row at a time is in the tab order.
    expect([el.open, $$(el, '[data-path][tabindex="0"]').map((r) => r.dataset.path)]).toEqual([
      'main.pathogen',
      ['demos/gears.pathogen'],
    ]);
    press('Enter');
    expect(el.open).toBe('demos/gears.pathogen');
    press('ArrowDown');
    press(' ');
    expect(el.open).toBe('parts/gears.pathogen');
  });
});

describe('what it shows is text, never markup', () => {
  it('escapes a hostile path and text in rows, titles, labels, the file line, the copy tip and the code', async () => {
    writeText.mockResolvedValue(undefined);
    const path = 'a"><img src=x onerror="window.__pwned=1">.pathogen';
    const hostile = '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
    const el = mount(
      [
        { path: 'main.pathogen', text: MAIN, kind: 'program' },
        { path, text: hostile, kind: 'program' },
      ],
      { open: path },
    );
    $(el, '.path .cp')!.click();
    await flush();
    const root = el.shadowRoot!;
    expect([root.querySelectorAll('img').length, root.querySelectorAll('script').length]).toEqual([0, 0]);
    expect($(el, '.fallback code')?.textContent).toBe(hostile);
    expect(text($(el, '.path .p'))).toBe(path);
    expect($(el, `[data-path]:not([data-path="main.pathogen"])`)?.getAttribute('title')).toBe(path);
    expect(text($(el, '.tip'))).toBe(`Copied ${path}`);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('a kind it doesn’t know is drawn as a program', () => {
    const el = mount([
      { path: 'main.pathogen', text: MAIN, kind: 'program' },
      { path: 'odd.pathogen', text: 'x', kind: 'bogus" onclick="x' as SourceFile['kind'] },
    ]);
    el.open = 'odd.pathogen';
    expect($(el, '.path')?.className).toBe('path program');
  });
});

describe('theme', () => {
  it('follows data-active-theme while it’s on the page', async () => {
    document.documentElement.setAttribute('data-active-theme', 'light');
    const el = mount(SEVERAL);
    expect($(el, '.root')?.classList.contains('dark')).toBe(false);
    document.documentElement.setAttribute('data-active-theme', 'dark');
    await flush();
    expect($(el, '.root')?.classList.contains('dark')).toBe(true);
    document.documentElement.removeAttribute('data-active-theme');
  });
});

describe('a file that couldn’t be read (2e step 5d; note 59, requirement 9)', () => {
  const LOST: SourceFile[] = SEVERAL.map((f) =>
    f.path === 'parts/gears.pathogen' ? { path: f.path, text: '', kind: 'program', unreadable: true } : f,
  );

  it('keeps its place in the list, with a warning, and says so on hover and to a screen reader', () => {
    const el = mount(LOST);
    const row = $(el, '.row[data-path="parts/gears.pathogen"]')!;
    expect([row.classList.contains('unreadable'), row.title, row.getAttribute('aria-label')]).toEqual([
      true,
      "parts/gears.pathogen couldn't be read",
      "gears.pathogen, couldn't be read",
    ]);
    expect($$(el, '.row.unreadable')).toHaveLength(1);
    // The file shown still shows its code.
    expect([$(el, '.code')!.classList.contains('lost'), $(el, '.fallback code')?.textContent]).toEqual([false, MAIN]);
  });

  it('with no file asked for, a readable program opens first, never the one that couldn’t be read', () => {
    const files: SourceFile[] = [
      { path: 'a.pathogen', text: '', kind: 'program', unreadable: true },
      { path: 'b.pathogen', text: MAIN, kind: 'program' },
    ];
    const el = document.createElement('source-files') as SourceFiles;
    el.files = files;
    document.body.appendChild(el);
    expect([el.open, $(el, '.code')!.classList.contains('lost')]).toEqual(['b.pathogen', false]);
  });

  it('shown, it says so where its code would be, and its copy icon is off; the next file shows again', async () => {
    const el = mount(LOST);
    $(el, '.row[data-path="parts/gears.pathogen"]')!.click();
    expect($(el, '.code')!.classList.contains('lost')).toBe(true);
    expect(text($(el, '.unread'))).toBe('This file couldn’t be read. The other files show as saved.');
    const copy = $(el, '.path .cp') as HTMLButtonElement;
    expect([copy.disabled, copy.title]).toEqual([true, "Nothing to copy: this file couldn't be read"]);
    expect($(el, '.path')!.classList.contains('unreadable')).toBe(true);
    // Disabled, and refusing even when asked directly (a click jsdom wouldn't send).
    copy.click();
    await (el as unknown as { _copy: () => Promise<void> })._copy();
    expect(writeText).not.toHaveBeenCalled();

    $(el, '.row[data-path="parts/kit.pathogen"]')!.click();
    expect([$(el, '.code')!.classList.contains('lost'), ($(el, '.path .cp') as HTMLButtonElement).disabled]).toEqual([
      false,
      false,
    ]);
    expect($(el, '.fallback code')?.textContent).toBe(KIT);
  });

  it('one file alone that couldn’t be read says so too, its floating copy icon off', () => {
    const el = mount([{ path: 'main.pathogen', text: '', kind: 'program', unreadable: true }]);
    expect($(el, '.code')!.classList.contains('lost')).toBe(true);
    expect(($(el, '.cell.float .cp') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a re-review’s marks (2e step 5e; mockup v12 R3, R4)', () => {
  const MARKS = {
    files: {
      'parts/gears.pathogen': { mark: 'changed' as const },
      'parts/kit.pathogen': { mark: 'moved' as const, from: 'kit.pathogen' },
      'pathogen.json': { mark: 'changed' as const },
    },
    removed: ['try-sizes.pathogen'],
    foldersAdded: ['examples'],
  };
  const marked = (open = 'main.pathogen'): SourceFiles => {
    const el = mount(SEVERAL, { folders: ['examples'], open });
    el.marks = MARKS;
    return el;
  };

  it('a badge with a sign on each marked row, the word on hover; unmarked rows have none', () => {
    const el = marked();
    const dot = (path: string) => $(el, `.row[data-path="${path}"] .mdot`);
    expect([dot('parts/gears.pathogen')?.className, dot('parts/gears.pathogen')?.title]).toEqual([
      'mdot chg',
      'changed',
    ]);
    expect([dot('parts/kit.pathogen')?.className, dot('parts/kit.pathogen')?.title]).toEqual([
      'mdot mov',
      'moved from kit.pathogen',
    ]);
    expect(dot('pathogen.json')?.className).toBe('mdot chg');
    expect(dot('main.pathogen')).toBeNull();
    // A screen reader hears the word in the row's name; the badge itself is hidden from it.
    const label = (path: string) => $(el, `.row[data-path="${path}"]`)?.getAttribute('aria-label') ?? null;
    expect([label('parts/gears.pathogen'), label('parts/kit.pathogen'), label('main.pathogen')]).toEqual([
      'gears.pathogen, changed',
      'kit.pathogen, moved from kit.pathogen',
      null,
    ]);
    expect(dot('parts/gears.pathogen')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('a file both listed removed and among the files is the file: openable, marked as the files say', () => {
    const el = mount(SEVERAL);
    el.marks = { files: { 'parts/kit.pathogen': { mark: 'new' } }, removed: ['parts/kit.pathogen'], foldersAdded: [] };
    expect($$(el, '.row.gone')).toHaveLength(0);
    const row = $(el, '.row[data-path="parts/kit.pathogen"]')!;
    expect([row.querySelector('.mdot')?.className, row.getAttribute('aria-label')]).toEqual([
      'mdot new',
      'kit.pathogen, new',
    ]);
    row.click();
    expect([el.open, text($(el, '.path .mk'))]).toEqual(['parts/kit.pathogen', 'new']);
  });

  it('a marked file that couldn’t be read says both; pathogen.json is never shown as removed', () => {
    const lost = SEVERAL.map((f) =>
      f.path === 'parts/gears.pathogen' ? { path: f.path, text: '', kind: 'program' as const, unreadable: true } : f,
    );
    const el = mount(lost);
    el.marks = {
      files: { 'parts/gears.pathogen': { mark: 'changed' } },
      removed: ['pathogen.json'],
      foldersAdded: [],
    };
    expect($(el, '.row[data-path="parts/gears.pathogen"]')?.getAttribute('aria-label')).toBe(
      "gears.pathogen, couldn't be read, changed",
    );
    expect($$(el, '.row.gone')).toHaveLength(0);
  });

  it('narrow, the menu names the mark too; marks set before the files apply, and null clears them', () => {
    const el = document.createElement('source-files') as SourceFiles;
    el.marks = MARKS;
    el.files = SEVERAL;
    el.folders = ['examples'];
    el.open = 'parts/gears.pathogen';
    document.body.appendChild(el);
    el.narrow = true;
    expect(text($(el, '.menu .mk'))).toBe('changed');
    el.narrow = false;
    expect($$(el, '.mdot').length).toBeGreaterThan(0);
    el.marks = null;
    expect([$$(el, '.mdot').length, $$(el, '.row.gone').length, $(el, '.path .mk')]).toEqual([0, 0, null]);
  });

  it('a removed file stays in its place, struck out, not openable, passed by the arrow keys', () => {
    const el = marked();
    const gone = $$(el, '.row.gone');
    expect(gone.map((r) => [text(r), r.getAttribute('aria-label'), r.dataset.path ?? null])).toEqual([
      ['try-sizes.pathogen', 'try-sizes.pathogen, removed', null],
    ]);
    expect(gone[0].querySelector('.mdot')?.className).toBe('mdot gone');
    // In the tree's order: after main.pathogen, before pathogen.json.
    expect($$(el, '.list .row.file, .list .row.project').map((r) => r.dataset.path ?? `removed: ${text(r)}`)).toEqual([
      'demos/gears.pathogen',
      'parts/gears.pathogen',
      'parts/kit.pathogen',
      'main.pathogen',
      'removed: try-sizes.pathogen',
      'pathogen.json',
    ]);
    gone[0].click();
    expect(el.open).toBe('main.pathogen');
    const main = $(el, '.row[data-path="main.pathogen"]')!;
    main.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.shadowRoot!.activeElement?.getAttribute('data-path')).toBe('pathogen.json');
  });

  it('an added empty folder has the new badge', () => {
    const el = marked();
    const folder = $$(el, '.row.folder').find((r) => text(r) === 'examples')!;
    expect(folder.querySelector('.mdot')?.className).toBe('mdot new');
  });

  it('the open file’s line says the mark in words; a move says where from on hover', () => {
    expect(text($(marked('parts/gears.pathogen'), '.path .mk'))).toBe('changed');
    const moved = $(marked('parts/kit.pathogen'), '.path .mk')!;
    expect([text(moved), moved.title]).toEqual(['moved', 'Moved from kit.pathogen']);
    expect($(marked('main.pathogen'), '.path .mk')).toBeNull();
  });

  it('without marks, nothing changes (the snapshots page)', () => {
    const el = mount(SEVERAL);
    expect([$$(el, '.mdot').length, $$(el, '.row.gone').length, $(el, '.path .mk')]).toEqual([0, 0, null]);
  });
});

describe('copying', () => {
  it('copies the file shown, and says “Copied” only once the clipboard has taken it', async () => {
    let resolve!: () => void;
    writeText.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const el = mount(SEVERAL, { open: 'parts/gears.pathogen' });
    $(el, '.path .cp')!.click();
    expect(writeText).toHaveBeenCalledWith(GEARS);
    expect($(el, '.tip')).toBeNull();
    resolve();
    await flush();
    expect(text($(el, '.tip'))).toBe('Copied parts/gears.pathogen');
    expect($(el, '.cp')?.classList.contains('ok')).toBe(true);
  });

  it('a refused copy says what to do instead, and the icon goes back after a moment', async () => {
    vi.useFakeTimers();
    writeText.mockRejectedValue(new Error('denied'));
    const el = mount(SEVERAL);
    $(el, '.path .cp')!.click();
    await flush();
    expect(text($(el, '.tip'))).toMatch(/^Couldn't copy\. Select the text and press (⌘C|Ctrl\+C)$/);
    vi.advanceTimersByTime(2000);
    expect($(el, '.tip')).toBeNull();
    expect($(el, '.cp')?.className).toBe('cp ');
  });

  it('a copy that finishes after another file opened says nothing; one that doesn’t is heard too', async () => {
    let resolve!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const el = mount(SEVERAL);
    $(el, '.path .cp')!.click();
    el.open = 'parts/kit.pathogen';
    resolve();
    await flush();
    expect([$(el, '.tip'), $(el, '[role="status"]')?.textContent]).toEqual([null, '']);
    writeText.mockResolvedValue(undefined);
    $(el, '.path .cp')!.click();
    await flush();
    expect([text($(el, '.tip')), $(el, '[role="status"]')?.textContent]).toEqual([
      'Copied parts/kit.pathogen',
      'Copied parts/kit.pathogen',
    ]);
  });

  it('a second copy keeps its “Copied” for the full moment, whatever the first one’s timer', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    const el = mount(SEVERAL);
    $(el, '.path .cp')!.click();
    await flush();
    vi.advanceTimersByTime(1500);
    $(el, '.path .cp')!.click();
    await flush();
    vi.advanceTimersByTime(1000);
    expect(text($(el, '.tip'))).toBe('Copied main.pathogen');
    vi.advanceTimersByTime(1000);
    expect($(el, '.tip')).toBeNull();
  });
});

describe('re-attached', () => {
  it('keeps its files and the file shown when taken out and put back', () => {
    const el = mount(SEVERAL, { open: 'parts/kit.pathogen' });
    el.remove();
    document.body.appendChild(el);
    expect([el.open, $(el, '.fallback code')?.textContent, $$(el, '.list [data-path]').length]).toEqual([
      'parts/kit.pathogen',
      KIT,
      5,
    ]);
  });
});

describe('fitting its width', () => {
  /** A ResizeObserver the test drives: `resize(w)` reports a new width, as a browser would. */
  function observeBy(): { resize: (width: number) => void } {
    let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();

        disconnect = vi.fn();

        constructor(cb: typeof report) {
          report = cb;
        }
      },
    );
    return { resize: (width) => report!([{ contentRect: { width } }]) };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('follows a width only once it holds, so a panel opening past 480 px never shows the menu midway', async () => {
    vi.useFakeTimers();
    const { resize } = observeBy();
    const { SETTLE_MS } = await import('../playground/components/shared/source-files.js');
    const el = mount(SEVERAL);
    // The code panel opening: folded, then wider each frame.
    for (const width of [1, 60, 180, 320, 470, 560, 640]) {
      resize(width);
      vi.advanceTimersByTime(16);
      expect([el.narrow, $(el, '.list') !== null]).toEqual([false, true]);
    }
    vi.advanceTimersByTime(SETTLE_MS);
    expect([el.narrow, $(el, '.list') !== null]).toEqual([false, true]);
    // Made narrow, and held: the menu.
    resize(380);
    vi.advanceTimersByTime(SETTLE_MS);
    expect([el.narrow, $(el, '.menu') !== null]).toEqual([true, true]);
    // Folded away (the panel closed): it keeps what it has, rather than reading 1 px as narrow.
    resize(1);
    vi.advanceTimersByTime(SETTLE_MS);
    resize(640);
    vi.advanceTimersByTime(SETTLE_MS);
    resize(1);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(el.narrow).toBe(false);
  });

  it('already laid out when it goes on the page, its first layout fits its width: no flip after', () => {
    for (const [width, narrow] of [
      [300, true],
      [700, false],
    ] as const) {
      const el = document.createElement('source-files') as SourceFiles;
      el.files = SEVERAL;
      el.main = 'main.pathogen';
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
      document.body.appendChild(el);
      // No timer has run: this is the first layout.
      expect([el.narrow, $(el, '.menu') !== null, $(el, '.list') !== null]).toEqual([narrow, narrow, !narrow]);
      el.remove();
    }
  });

  it('one file never re-lays out for its width', () => {
    const el = mount([{ path: 'main.pathogen', text: MAIN, kind: 'program' }]);
    const pane = $(el, '.pane');
    el.narrow = true;
    expect([$(el, '.pane'), $(el, '.menu')]).toEqual([pane, null]);
  });
});

describe('narrow', () => {
  it('a menu names the open file and the count; a tap opens the files as a sheet, a pick closes it', () => {
    const el = mount(SEVERAL);
    el.narrow = true;
    expect($(el, '.list')).toBeNull();
    expect([text($(el, '.menu .p')), text($(el, '.menu .count'))]).toEqual(['main.pathogen', '5 files']);
    expect($(el, '.menu-row .cell .cp')).not.toBeNull();
    $(el, '.menu')!.click();
    expect($(el, '.sheet')).not.toBeNull();
    expect($(el, '.scrim')).not.toBeNull();
    $(el, '.sheet [data-path="parts/gears.pathogen"]')!.click();
    expect($(el, '.sheet')).toBeNull();
    expect([el.open, text($(el, '.menu .p'))]).toEqual(['parts/gears.pathogen', 'parts/gears.pathogen']);
  });

  it('the scrim and Escape (wherever the keyboard is) close the sheet, and the menu has the keyboard again', () => {
    const el = mount(SEVERAL);
    el.narrow = true;
    $(el, '.menu')!.click();
    expect($(el, '.sheet')?.getAttribute('aria-modal')).toBe('true');
    expect(el.shadowRoot!.activeElement?.getAttribute('data-path')).toBe('main.pathogen');
    $(el, '.scrim')!.click();
    expect([$(el, '.sheet'), el.shadowRoot!.activeElement?.className]).toEqual([null, 'menu program']);
    $(el, '.menu')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect([$(el, '.sheet'), el.shadowRoot!.activeElement?.className]).toEqual([null, 'menu program']);
    expect(el.open).toBe('main.pathogen');
  });

  it('counts one file as “1 file”', () => {
    const el = mount([{ path: 'main.pathogen', text: MAIN, kind: 'program' }], { folders: ['spare'] });
    el.narrow = true;
    expect(text($(el, '.menu .count'))).toBe('1 file');
  });
});
