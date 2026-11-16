// @vitest-environment jsdom
//
// <editor-tabs> (phase 2d, step 3): what it draws for its items, and the
// events it sends for clicks, middle-clicks, the keyboard and Docs. The
// storybook entry (playground/utils/storybook-registry.ts, "Editor Tabs") is
// its visual spec.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TabItem } from '../playground/services/open-files.js';

type Tabs = HTMLElement & { items: TabItem[]; active: string | null; docsOpen: boolean; lastTabStays: boolean };

beforeAll(async () => {
  await import('../playground/components/editor-tabs.ts');
});

const ITEMS: TabItem[] = [
  { path: 'main.pathogen', kind: 'program', name: 'main', hint: null },
  { path: 'parts/gears.pathogen', kind: 'library', name: 'gears', hint: 'parts' },
  { path: 'demos/gears.pathogen', kind: 'program', name: 'gears', hint: 'demos' },
  { path: 'pathogen.json', kind: 'json', name: 'pathogen.json', hint: null },
];

function mount(items: TabItem[] = ITEMS, active = items[0].path): { tabs: Tabs; events: [string, unknown][] } {
  const tabs = document.createElement('editor-tabs') as Tabs;
  document.body.appendChild(tabs);
  tabs.items = items;
  tabs.active = active;
  const events: [string, unknown][] = [];
  for (const name of ['tab-select', 'tab-close', 'toggle-docs']) {
    tabs.addEventListener(name, (e) => events.push([name, (e as Event & { detail?: unknown }).detail ?? null]));
  }
  return { tabs, events };
}

const tabEls = (tabs: Tabs): HTMLElement[] => [...tabs.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')];
const tabFor = (tabs: Tabs, path: string): HTMLElement => tabEls(tabs).find((t) => t.dataset.path === path)!;

describe('<editor-tabs>', () => {
  it('draws each tab’s label, folder hint, icon kind and full path, and marks the shown one', () => {
    const { tabs } = mount(ITEMS, 'demos/gears.pathogen');
    expect(
      tabEls(tabs).map((t) => [t.textContent.trim(), t.className, t.title, t.getAttribute('aria-selected')]),
    ).toEqual([
      ['main', 'tab program', 'main.pathogen', 'false'],
      ['gears · parts', 'tab library', 'parts/gears.pathogen', 'false'],
      ['gears · demos', 'tab program', 'demos/gears.pathogen', 'true'],
      ['pathogen.json', 'tab json', 'pathogen.json', 'false'],
    ]);
    // Only the shown tab is in the Tab order; pathogen.json has its lock.
    expect(tabEls(tabs).map((t) => t.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(tabFor(tabs, 'pathogen.json').querySelector('.lock')).not.toBeNull();
  });

  it('a click chooses a tab and hands focus to the editor; its × closes it', () => {
    const { tabs, events } = mount();
    tabFor(tabs, 'parts/gears.pathogen').querySelector<HTMLElement>('.label')!.click();
    tabFor(tabs, 'demos/gears.pathogen').querySelector<HTMLElement>('.close')!.click();
    expect(events).toEqual([
      ['tab-select', { path: 'parts/gears.pathogen', focusEditor: true }],
      ['tab-close', { path: 'demos/gears.pathogen', fromKeyboard: false }],
    ]);
  });

  it('a middle-click closes a tab', () => {
    const { tabs, events } = mount();
    tabFor(tabs, 'parts/gears.pathogen').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(events).toEqual([['tab-close', { path: 'parts/gears.pathogen', fromKeyboard: false }]]);
  });

  // Step 4d (mockup v11): every tab closes, the last one too: the editor shows its zero-state.
  it('the last tab closes too, and no tab is chosen then', () => {
    const { tabs, events } = mount([ITEMS[0]]);
    expect(tabFor(tabs, 'main.pathogen').querySelector('.close')).not.toBeNull();
    tabFor(tabs, 'main.pathogen').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(events).toEqual([['tab-close', { path: 'main.pathogen', fromKeyboard: false }]]);
    // With none left, the bar stays, Docs at its right end (mockup v8).
    tabs.items = [];
    tabs.active = null;
    expect([tabEls(tabs).length, tabs.shadowRoot!.querySelector('.docs') !== null]).toEqual([0, true]);
  });

  it('a scratch link’s last tab (lastTabStays) has no ×, and nothing closes it', () => {
    const { tabs, events } = mount([ITEMS[0]]);
    tabs.lastTabStays = true;
    expect(tabFor(tabs, 'main.pathogen').querySelector('.close')).toBeNull();
    tabFor(tabs, 'main.pathogen').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    tabFor(tabs, 'main.pathogen').focus();
    tabFor(tabs, 'main.pathogen').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(events).toEqual([]);
  });

  it('arrow keys, Home and End choose tabs and keep the keyboard there; Delete closes; Enter goes to the editor', () => {
    const { tabs, events } = mount();
    const key = (k: string): void => {
      const focused = tabs.shadowRoot!.activeElement as HTMLElement;
      focused.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    };
    tabFor(tabs, 'main.pathogen').focus();
    key('ArrowRight');
    key('End');
    key('ArrowRight');
    key('ArrowLeft');
    key('Home');
    key('Delete');
    key('Enter');
    expect(events).toEqual([
      ['tab-select', { path: 'parts/gears.pathogen', focusEditor: false }],
      ['tab-select', { path: 'pathogen.json', focusEditor: false }],
      ['tab-select', { path: 'main.pathogen', focusEditor: false }],
      ['tab-select', { path: 'pathogen.json', focusEditor: false }],
      ['tab-select', { path: 'main.pathogen', focusEditor: false }],
      ['tab-close', { path: 'main.pathogen', fromKeyboard: true }],
      ['tab-select', { path: 'main.pathogen', focusEditor: true }],
    ]);
  });

  it('Docs says whether the docs are open, and asks to toggle them', () => {
    const { tabs, events } = mount();
    const docs = tabs.shadowRoot!.querySelector<HTMLButtonElement>('.docs')!;
    expect([docs.getAttribute('aria-pressed'), docs.title]).toEqual(['false', 'Show the docs']);
    tabs.docsOpen = true;
    expect([docs.getAttribute('aria-pressed'), docs.title]).toEqual(['true', 'Hide the docs']);
    docs.click();
    expect(events).toEqual([['toggle-docs', null]]);
  });

  it('the same items again redraw nothing, so focus and the tab elements stay', () => {
    const { tabs } = mount();
    const before = tabEls(tabs);
    tabs.items = ITEMS.map((item) => ({ ...item }));
    tabs.active = 'parts/gears.pathogen';
    const after = tabEls(tabs);
    expect(after.every((el, i) => el === before[i])).toBe(true);
    expect(tabFor(tabs, 'parts/gears.pathogen').getAttribute('aria-selected')).toBe('true');
  });

  it('names a file safely, whatever its path holds', () => {
    const { tabs } = mount([
      { path: 'a.pathogen', kind: 'program', name: 'a', hint: null },
      { path: '<b>.pathogen', kind: 'program', name: '<b>', hint: null },
    ]);
    expect(tabFor(tabs, '<b>.pathogen').querySelector('b')).toBeNull();
    expect(tabFor(tabs, '<b>.pathogen').textContent.trim()).toBe('<b>');
  });
});

// 2e, step 3d (mockups v13 and v14): the copy icon in a cell of its own, before Docs.
describe('<editor-tabs>’s copy icon', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const copyCell = (tabs: Tabs): HTMLElement => tabs.shadowRoot!.querySelector<HTMLElement>('.copy-cell')!;
  const copyButton = (tabs: Tabs): HTMLButtonElement => tabs.shadowRoot!.querySelector<HTMLButtonElement>('.copy')!;
  const tipText = (tabs: Tabs): string | null => tabs.shadowRoot!.querySelector('.tip')?.textContent ?? null;

  it('sits before Docs, named for the file in the editor, and asks to copy that file', () => {
    const { tabs } = mount(ITEMS, 'parts/gears.pathogen');
    const asked: unknown[] = [];
    tabs.addEventListener('copy-code', (e) => asked.push((e as Event & { detail?: unknown }).detail));
    const cells = [...tabs.shadowRoot!.children].map((c) => c.className).filter((c) => c !== '');
    // The status region after them is hidden from the eye: it speaks "Copied" to a screen reader.
    expect(cells).toEqual(['list', 'copy-cell', 'docs', 'copy-status']);
    expect([copyButton(tabs).getAttribute('aria-label'), copyButton(tabs).title]).toEqual([
      'Copy parts/gears.pathogen',
      'Copy parts/gears.pathogen',
    ]);
    copyButton(tabs).click();
    expect(asked).toEqual([{ path: 'parts/gears.pathogen' }]);
  });

  it('with no file open, it isn’t there (nothing to copy)', () => {
    const { tabs } = mount();
    tabs.items = [];
    tabs.active = null;
    expect(copyCell(tabs).hidden).toBe(true);
    tabs.items = ITEMS;
    tabs.active = 'main.pathogen';
    expect(copyCell(tabs).hidden).toBe(false);
  });

  it('says “Copied” only when told the clipboard took it, then goes back after a moment', () => {
    vi.useFakeTimers();
    const { tabs } = mount(ITEMS, 'parts/gears.pathogen');
    copyButton(tabs).click();
    expect([tipText(tabs), copyButton(tabs).className]).toEqual([null, 'copy']);
    (tabs as Tabs & { copied: (ok: boolean) => void }).copied(true);
    expect([tipText(tabs), copyButton(tabs).className]).toEqual(['Copied parts/gears.pathogen', 'copy ok']);
    vi.advanceTimersByTime(2000);
    expect([tipText(tabs), copyButton(tabs).className]).toEqual([null, 'copy']);
  });

  it('a copy that finishes after another file opened says nothing, rather than name the wrong file', () => {
    const { tabs } = mount(ITEMS, 'main.pathogen');
    const copied = (tabs as Tabs & { copied: (ok: boolean, path?: string | null) => void }).copied.bind(tabs);
    tabs.active = 'parts/gears.pathogen';
    copied(true, 'main.pathogen');
    expect([tipText(tabs), copyButton(tabs).className]).toEqual([null, 'copy']);
    copied(true, 'parts/gears.pathogen');
    expect(tipText(tabs)).toBe('Copied parts/gears.pathogen');
    // A screen reader hears it from the status region that stays on the page.
    expect(tabs.shadowRoot!.querySelector('[role="status"]')?.textContent).toBe('Copied parts/gears.pathogen');
  });

  it('a refused copy says what to do instead; choosing another file clears it', () => {
    const { tabs } = mount(ITEMS, 'main.pathogen');
    (tabs as Tabs & { copied: (ok: boolean) => void }).copied(false);
    expect([tipText(tabs), copyButton(tabs).className]).toEqual([
      expect.stringMatching(/^Couldn't copy\. Select the text and press (⌘C|Ctrl\+C)$/),
      'copy fail',
    ]);
    tabs.active = 'parts/gears.pathogen';
    expect([tipText(tabs), copyButton(tabs).title]).toEqual([null, 'Copy parts/gears.pathogen']);
  });
});
