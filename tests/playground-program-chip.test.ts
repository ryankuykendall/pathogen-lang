// @vitest-environment jsdom
//
// The program chip (phase 2d, step 5a; mockup v6 screen G): beside the zoom
// controls, it names the program the preview shows, and its list, which opens
// upward, is the one way to show another. A view: workspace-view gives it the
// rows and hears show-program and open-file.

//
// The chip lives in src/ui since 2f, shared with VS Code's preview, and comes
// with the pan-zoom bundle as the zoom pill does.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MAIN_BADGE_TITLE } from '../playground/utils/file-icons.js';
import { DEFAULT_BADGE_TITLE, registerProgramChip } from '../src/ui/program-chip';

import type { ProgramItem } from '../playground/services/program-list.js';
import type { ProgramChipElement } from '../src/ui/program-chip';

type Chip = ProgramChipElement;

beforeAll(() => {
  registerProgramChip();
});

afterEach(() => {
  document.body.innerHTML = '';
});

const row = (path: string, extra: Partial<ProgramItem> = {}): ProgramItem => {
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.pathogen$/, '');
  return {
    path,
    name: base,
    hint: null,
    badge: false,
    error: null,
    uses: null,
    updating: false,
    miniature: null,
    ...extra,
  };
};

const ROWS = [row('main.pathogen'), row('demos/gears.pathogen'), row('try-sizes.pathogen')];

function mount(items: ProgramItem[] = ROWS, shown = 'main.pathogen'): Chip {
  const chip = document.createElement('program-chip') as Chip;
  document.body.appendChild(chip);
  chip.items = items;
  chip.shown = shown;
  return chip;
}

const root = (chip: Chip) => chip.shadowRoot!;
const button = (chip: Chip) => root(chip).querySelector<HTMLButtonElement>('.pick')!;
const list = (chip: Chip) => root(chip).querySelector<HTMLElement>('.list')!;
const rows = (chip: Chip) => [...root(chip).querySelectorAll<HTMLElement>('.prow')];
const showOf = (chip: Chip, path: string) =>
  root(chip).querySelector<HTMLButtonElement>(`.prow[data-path="${path}"] .show`)!;
const openOf = (chip: Chip, path: string) =>
  root(chip).querySelector<HTMLButtonElement>(`.prow[data-path="${path}"] .open`)!;
const focused = (chip: Chip) => root(chip).activeElement as HTMLElement | null;
const key = (target: Element, k: string) =>
  target.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }),
  );
const heard = (chip: Chip, name: string) => {
  const got: unknown[] = [];
  chip.addEventListener(name, (e) => got.push((e as Event & { detail: unknown }).detail));
  return got;
};

describe('the chip', () => {
  it('names the program shown, with a caret, and says what it does', () => {
    const chip = mount(ROWS, 'demos/gears.pathogen');
    expect([
      button(chip).querySelector('.name')!.textContent,
      button(chip).title,
      button(chip).getAttribute('aria-expanded'),
    ]).toEqual(['gears', 'Showing demos/gears.pathogen. Choose a program', 'false']);
    expect(list(chip).hidden).toBe(true);
    expect(root(chip).querySelector('.pick-err')).toBeNull();
  });

  it('two programs with one name: the folder beside it, as in the tabs', () => {
    const chip = mount(
      [row('demos/gears.pathogen', { hint: 'demos' }), row('parts/gears.pathogen', { hint: 'parts' })],
      'parts/gears.pathogen',
    );
    expect(button(chip).querySelector('.name')!.textContent).toBe('gears · parts');
  });

  it('a red dot when another program has an error, with its title', () => {
    const chip = mount();
    chip.alert = 'Another program has an error';
    expect(root(chip).querySelector<HTMLElement>('.pick-err')!.title).toBe('Another program has an error');
    chip.alert = null;
    expect(root(chip).querySelector('.pick-err')).toBeNull();
  });
});

describe('the list', () => {
  it('opens upward: "Programs" and the count, each program with its name and path, the check on the one shown', () => {
    const chip = mount([
      row('try-sizes.pathogen', { badge: true }),
      ...ROWS.filter((r) => r.path !== 'try-sizes.pathogen'),
    ]);
    button(chip).click();
    expect([chip.isOpen, list(chip).hidden, button(chip).getAttribute('aria-expanded')]).toEqual([true, false, 'true']);
    expect([...root(chip).querySelector('.head')!.children].map((s) => s.textContent)).toEqual(['Programs', '3']);
    expect(
      rows(chip).map((r) => [
        r.querySelector('.n')!.textContent.trim(),
        r.querySelector('.p')?.textContent ?? null,
        !!r.querySelector('.chk'),
      ]),
    ).toEqual([
      ['try-sizesmain', 'try-sizes.pathogen', false],
      ['main', 'main.pathogen', true],
      ['gears', 'demos/gears.pathogen', false],
    ]);
    const badge = rows(chip)[0].querySelector<HTMLElement>('.badge')!;
    // The page says what the badge means: VS Code's preview leaves the default.
    expect([badge.textContent, badge.title]).toEqual(['main', DEFAULT_BADGE_TITLE]);
    expect(DEFAULT_BADGE_TITLE).toBe('The main: first in pathogen.json’s entryPoints');
    chip.badgeTitle = MAIN_BADGE_TITLE;
    expect(rows(chip)[0].querySelector<HTMLElement>('.badge')!.title).toBe(
      'The main: first in pathogen.json’s entryPoints. Thumbnails and publishing use it',
    );
    expect(root(chip).querySelector<HTMLElement>('.chk')!.title).toBe('Shown');
    expect(showOf(chip, 'main.pathogen').getAttribute('aria-current')).toBe('true');
    expect(openOf(chip, 'demos/gears.pathogen').title).toBe('Open demos/gears.pathogen in the editor');
  });

  it('a note after a row\'s path (VS Code\'s "not in pathogen.json"), and none in its place when the row has an error', () => {
    const chip = mount([...ROWS, row('sketch.pathogen', { note: 'not in pathogen.json' })]);
    button(chip).click();
    const sketch = rows(chip)[3].querySelector('.p')!;
    expect(sketch.textContent).toBe('sketch.pathogen · not in pathogen.json');
    expect(sketch.querySelector('.note')!.textContent).toBe('· not in pathogen.json');
    expect(rows(chip)[0].querySelector('.note')).toBeNull();
    chip.items = [
      ...ROWS,
      row('sketch.pathogen', { note: 'not in pathogen.json', error: 'Error in sketch.pathogen line 2' }),
    ];
    expect(rows(chip)[3].querySelector('.p')).toBeNull();
    // "line 2" kept together by a no-break space.
    const nbsp = String.fromCodePoint(0xa0);
    expect(rows(chip)[3].querySelector('.e')!.textContent).toBe(`Error in sketch.pathogen line${nbsp}2`);
  });

  it('says when it opens, once, so the miniatures are drawn then (step 5b)', () => {
    const chip = mount(ROWS);
    let opened = 0;
    const count = (): void => void opened++;
    document.addEventListener('program-list-open', count);
    button(chip).click();
    chip.items = [...ROWS];
    expect(opened).toBe(1);
    button(chip).click();
    button(chip).click();
    expect(opened).toBe(2);
    document.removeEventListener('program-list-open', count);
  });

  it('a row with an error says why in place of its path', () => {
    const chip = mount([
      row('main.pathogen', { error: "A module now, so it can't draw as the main" }),
      row('b.pathogen'),
    ]);
    button(chip).click();
    const first = rows(chip)[0];
    expect([
      first.classList.contains('err'),
      first.querySelector('.e')!.textContent,
      first.querySelector('.p'),
    ]).toEqual([true, "A module now, so it can't draw as the main", null]);
  });

  it('a blank tile with a note says why on hover; other tiles have no title', () => {
    const chip = mount([
      row('main.pathogen', { miniature: 'blob:main' }),
      row('huge.pathogen', { tileNote: 'Too detailed to draw this small' }),
    ]);
    button(chip).click();
    expect(rows(chip).map((r) => r.querySelector<HTMLElement>('.tile')!.getAttribute('title'))).toEqual([
      null,
      'Too detailed to draw this small',
    ]);
  });

  it('a row’s "Error in … line N" keeps "line N" together when it wraps', () => {
    const chip = mount([row('main.pathogen'), row('b.pathogen', { error: 'Error in parts/kit.pathogen line 6' })]);
    button(chip).click();
    const nbsp = String.fromCharCode(160);
    expect(rows(chip)[1].querySelector('.e')!.textContent).toBe(`Error in parts/kit.pathogen line${nbsp}6`);
  });

  it('the dot, the spinner and the miniature (step 5b’s rows)', () => {
    const chip = mount([
      row('main.pathogen', { uses: 'import', miniature: 'blob:main' }),
      row('try-sizes.pathogen', { uses: 'self', updating: true }),
      row('b.pathogen'),
    ]);
    chip.editing = 'try-sizes.pathogen';
    button(chip).click();
    const [main, trying, b] = rows(chip);
    expect([
      main.querySelector<HTMLElement>('.udot')!.title,
      trying.querySelector<HTMLElement>('.udot')!.title,
      b.querySelector('.udot'),
    ]).toEqual(['Uses try-sizes.pathogen, the file you’re editing', 'The file you’re editing', null]);
    expect([trying.querySelector<HTMLElement>('.spin')!.title, main.querySelector('.spin')]).toEqual([
      'Updating',
      null,
    ]);
    expect([main.querySelector('img')!.getAttribute('src'), b.querySelector('img')]).toEqual(['blob:main', null]);
  });

  it('names and paths are text, never markup', () => {
    const chip = mount([row('<b>x</b>.pathogen'), row('b.pathogen')], '<b>x</b>.pathogen');
    button(chip).click();
    expect([root(chip).querySelector('b'), rows(chip)[0].querySelector('.p')!.textContent]).toEqual([
      null,
      '<b>x</b>.pathogen',
    ]);
  });
});

describe('choosing', () => {
  it('a row shows its program, and the list closes', () => {
    const chip = mount();
    const shown = heard(chip, 'show-program');
    const opened = heard(chip, 'open-file');
    button(chip).click();
    showOf(chip, 'try-sizes.pathogen').click();
    expect([shown, opened, chip.isOpen]).toEqual([[{ path: 'try-sizes.pathogen' }], [], false]);
  });

  it('Open in the editor opens the file and leaves the preview alone', () => {
    const chip = mount();
    const shown = heard(chip, 'show-program');
    const opened = heard(chip, 'open-file');
    button(chip).click();
    openOf(chip, 'demos/gears.pathogen').click();
    expect([shown, opened, chip.isOpen]).toEqual([[], [{ path: 'demos/gears.pathogen', focusEditor: true }], false]);
  });

  it('a press outside closes it; a press inside doesn’t', () => {
    const chip = mount();
    button(chip).click();
    list(chip).dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(chip.isOpen).toBe(true);
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(chip.isOpen).toBe(false);
  });
});

describe('from the keyboard', () => {
  it('Up on the chip opens the list on the program shown; Up and Down move; Escape goes back to the chip', () => {
    const chip = mount(ROWS, 'demos/gears.pathogen');
    button(chip).focus();
    key(button(chip), 'ArrowUp');
    expect([chip.isOpen, focused(chip)]).toEqual([true, showOf(chip, 'demos/gears.pathogen')]);
    key(focused(chip)!, 'ArrowDown');
    expect(focused(chip)).toBe(showOf(chip, 'try-sizes.pathogen'));
    key(focused(chip)!, 'ArrowDown');
    expect(focused(chip)).toBe(showOf(chip, 'main.pathogen'));
    key(focused(chip)!, 'End');
    expect(focused(chip)).toBe(showOf(chip, 'try-sizes.pathogen'));
    key(focused(chip)!, 'Escape');
    expect([chip.isOpen, focused(chip)]).toEqual([false, button(chip)]);
  });

  it('opened by a click, Escape on the chip closes the list, and nothing else hears it (fullscreen’s Escape)', () => {
    const chip = mount();
    const outer: string[] = [];
    const listen = (e: KeyboardEvent) => outer.push(e.key);
    document.addEventListener('keydown', listen);
    button(chip).click();
    button(chip).focus();
    key(button(chip), 'Escape');
    document.removeEventListener('keydown', listen);
    expect([chip.isOpen, outer, focused(chip)]).toEqual([false, [], button(chip)]);
    // Closed, Escape is the page's again.
    const later: string[] = [];
    document.addEventListener('keydown', (e) => later.push(e.key), { once: true });
    key(button(chip), 'Escape');
    expect(later).toEqual(['Escape']);
  });

  it('its program gone from the list while it has the keyboard: the keyboard goes to the chip', () => {
    const chip = mount();
    button(chip).focus();
    key(button(chip), 'ArrowUp');
    key(focused(chip)!, 'End');
    expect(focused(chip)).toBe(showOf(chip, 'try-sizes.pathogen'));
    chip.items = ROWS.filter((r) => r.path !== 'try-sizes.pathogen');
    expect([chip.isOpen, focused(chip)]).toEqual([true, button(chip)]);
  });

  it('a resize closes the list (it was sized for the preview as it was); taken off the page, Escape is the page’s again', () => {
    const chip = mount();
    button(chip).click();
    window.dispatchEvent(new window.Event('resize'));
    expect(chip.isOpen).toBe(false);
    button(chip).click();
    chip.remove();
    const heardAfter: string[] = [];
    const listen = (e: KeyboardEvent) => heardAfter.push(e.key);
    document.addEventListener('keydown', listen);
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', listen);
    expect([chip.isOpen, heardAfter]).toEqual([false, ['Escape']]);
  });

  it('below 800 px a resize leaves the sheet open, unless popover-only (VS Code: a narrow panel is no phone)', () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query === '(max-width: 800px)' })) as typeof window.matchMedia;
    try {
      const sheet = mount();
      button(sheet).click();
      window.dispatchEvent(new window.Event('resize'));
      expect(sheet.isOpen).toBe(true);
      sheet.close();
      const popover = mount();
      popover.setAttribute('popover-only', '');
      button(popover).click();
      window.dispatchEvent(new window.Event('resize'));
      expect(popover.isOpen).toBe(false);
    } finally {
      window.matchMedia = real;
    }
  });

  it('every narrow-window rule (the sheet, its dimming, Open in the editor always shown) is off when popover-only', () => {
    const chip = mount();
    const css = [...root(chip).adoptedStyleSheets]
      .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
      .concat([...root(chip).querySelectorAll('style')].map((s) => s.textContent ?? ''))
      .join('\n');
    // The @media block, up to its own closing brace.
    const start = css.indexOf('@media (max-width: 800px)');
    let end = css.indexOf('{', start) + 1;
    for (let depth = 1; depth > 0; end++) depth += css[end] === '{' ? 1 : css[end] === '}' ? -1 : 0;
    const narrow = css.slice(css.indexOf('{', start) + 1, end - 1);
    const selectors = [...narrow.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThanOrEqual(6);
    for (const selector of selectors) expect(selector).toMatch(/^:host\(:not\(\[popover-only\]\)\) /);
  });

  it('Right reaches the row’s Open in the editor, Left goes back', () => {
    const chip = mount();
    button(chip).focus();
    key(button(chip), 'ArrowUp');
    key(focused(chip)!, 'ArrowRight');
    expect(focused(chip)).toBe(openOf(chip, 'main.pathogen'));
    key(focused(chip)!, 'ArrowLeft');
    expect(focused(chip)).toBe(showOf(chip, 'main.pathogen'));
  });

  it('a keyboard click on the chip (Enter or Space) also puts the keyboard on the program shown', () => {
    const chip = mount(ROWS, 'try-sizes.pathogen');
    button(chip).focus();
    button(chip).dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(focused(chip)).toBe(showOf(chip, 'try-sizes.pathogen'));
  });

  it('new rows while open keep the keyboard on its program', () => {
    const chip = mount();
    button(chip).focus();
    key(button(chip), 'ArrowUp');
    key(focused(chip)!, 'ArrowDown');
    chip.items = [
      row('main.pathogen'),
      row('demos/gears.pathogen', { error: 'Error in parts/gears.pathogen line 9' }),
      row('try-sizes.pathogen'),
    ];
    expect(focused(chip)).toBe(showOf(chip, 'demos/gears.pathogen'));
  });
});
