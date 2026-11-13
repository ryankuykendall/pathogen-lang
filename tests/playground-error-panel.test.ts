// @vitest-environment jsdom
//
// The error panel (phase 2d, step 7; mockup v6 screen E, state 4;
// docs/workspace-files.md "Errors in other files"): each error under the name
// of the file where it happened, then the steps that led there from the
// program. The file's name, "Line N" and each step open that file at that
// line (`open-file`, which workspace-view acts on). The playground's own note
// (a main that's a module) has its own heading, and a link that asks
// workspace-view to act. A plain message (a workspace that didn't load) shows
// as before.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

interface Section {
  heading: string;
  file: string | null;
  errors: {
    line: number | null;
    column: number | null;
    text: string;
    steps: { kind: 'called from' | 'imported from'; file: string; line: number }[];
  }[];
  note?: (string | { text: string; action: string })[];
}
type Panel = HTMLElement & {
  show: (message: string, count?: number) => void;
  showSections: (sections: Section[], count: number) => void;
  hide: () => void;
  message: string;
};

const GEARS: Section = {
  heading: 'parts/gears.pathogen',
  file: 'parts/gears.pathogen',
  errors: [
    {
      line: 4,
      column: 3,
      text: 'assertion failed: a gear needs at least 3 teeth',
      steps: [{ kind: 'called from', file: 'main.pathogen', line: 3 }],
    },
  ],
};

describe('the error panel', () => {
  beforeAll(async () => {
    await import('../playground/components/shared/error-panel.js');
  });

  let panel: Panel;
  let opened: { path: string; line?: number; column?: number; focusEditor?: boolean }[];
  let actions: string[];

  beforeEach(() => {
    document.body.innerHTML = '';
    panel = document.createElement('error-panel') as Panel;
    document.body.appendChild(panel);
    opened = [];
    actions = [];
    panel.addEventListener('open-file', (e) => opened.push((e as Event & { detail: (typeof opened)[0] }).detail));
    panel.addEventListener('error-panel-action', (e) =>
      actions.push((e as Event & { detail: { action: string } }).detail.action),
    );
  });

  const $ = <T extends Element = HTMLElement>(sel: string) => panel.shadowRoot!.querySelector<T>(sel);
  const $$ = (sel: string) => [...panel.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
  const content = () => $('.content')!;

  it('a plain message shows as before, and hides', () => {
    panel.show('Workspace not found');
    expect([panel.classList.contains('visible'), content().textContent, panel.message]).toEqual([
      true,
      'Workspace not found',
      'Workspace not found',
    ]);
    panel.hide();
    expect(panel.classList.contains('visible')).toBe(false);
  });

  it('an error in another file: under its name, "Line 4: …", then "called from main.pathogen line 3"', () => {
    panel.showSections([GEARS], 1);
    expect(panel.classList.contains('visible')).toBe(true);
    expect($('.who')!.textContent).toBe('parts/gears.pathogen');
    expect([...$('.error')!.childNodes].map((n) => n.textContent)).toEqual([
      'Line 4',
      ': assertion failed: a gear needs at least 3 teeth',
      'called from main.pathogen line 3',
    ]);
    expect($('.count-badge')!.style.display).toBe('none');
    // As text (the panel's message): the heading, then each line under it.
    expect(panel.message).toBe(
      'parts/gears.pathogen\nLine 4: assertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 3',
    );
  });

  it('the name, the line and each step open that file at that line, with the keyboard in the editor', () => {
    panel.showSections([GEARS], 1);
    const links = $$('button.link');
    expect(links.map((b) => b.textContent)).toEqual(['parts/gears.pathogen', 'Line 4', 'main.pathogen line 3']);
    for (const link of links) link.click();
    expect(opened).toEqual([
      { path: 'parts/gears.pathogen', line: 4, column: 3, focusEditor: true },
      { path: 'parts/gears.pathogen', line: 4, column: 3, focusEditor: true },
      { path: 'main.pathogen', line: 3, column: 1, focusEditor: true },
    ]);
  });

  it('each link says which file and line it opens, to a screen reader ("Line 4" alone doesn’t)', () => {
    panel.showSections([GEARS], 1);
    expect($$('button.link').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Open parts/gears.pathogen at line 4',
      'Open parts/gears.pathogen at line 4',
      'Open main.pathogen at line 3',
    ]);
  });

  it('the same errors again redraw nothing, so a link with the keyboard keeps it', () => {
    panel.showSections([GEARS], 1);
    const link = $$('button.link')[1];
    link.focus();
    panel.showSections([structuredClone(GEARS)], 1);
    expect([link.isConnected, panel.shadowRoot!.activeElement === link]).toEqual([true, true]);
    // Different errors do redraw.
    panel.showSections([{ ...GEARS, heading: 'parts/kit.pathogen', file: 'parts/kit.pathogen' }], 1);
    expect(link.isConnected).toBe(false);
  });

  it('several files, several errors: a heading each, in order; the count', () => {
    const own: Section = {
      heading: 'main.pathogen',
      file: 'main.pathogen',
      errors: [
        { line: 2, column: 5, text: 'one', steps: [] },
        { line: 6, column: 1, text: 'two', steps: [] },
      ],
    };
    panel.showSections([own, GEARS], 3);
    expect($$('.who').map((h) => h.textContent)).toEqual(['main.pathogen', 'parts/gears.pathogen']);
    expect($('.count-badge')!.textContent).toBe('3 errors');
  });

  it('an error with no line: its words, no link', () => {
    panel.showSections(
      [
        {
          heading: 'main.pathogen',
          file: 'main.pathogen',
          errors: [{ line: null, column: null, text: 'Font "Nope" could not be loaded.', steps: [] }],
        },
      ],
      1,
    );
    expect($$('.error button').length).toBe(0);
    expect($('.error')!.textContent).toBe('Font "Nope" could not be loaded.');
  });

  it('words with markup show as text', () => {
    panel.showSections(
      [
        {
          heading: 'a<b>.pathogen',
          file: 'a<b>.pathogen',
          errors: [{ line: 1, column: 1, text: '<img src=x onerror=alert(1)>', steps: [] }],
        },
      ],
      1,
    );
    expect([$$('img').length, $$('b').length, $('.error')!.textContent]).toEqual([
      0,
      0,
      'Line 1: <img src=x onerror=alert(1)>',
    ]);
  });

  it('the playground’s own note: its heading, its words, and a link that asks for an action', () => {
    panel.showSections(
      [
        {
          heading: 'The main',
          file: null,
          errors: [],
          note: [
            "A module can't draw as the main. Take out module;, or ",
            { text: 'set another program as main', action: 'set-main' },
            '.',
          ],
        },
      ],
      0,
    );
    expect($('.who')!.textContent).toBe('The main');
    expect($('.who')!.tagName).toBe('SPAN');
    expect($('.note')!.textContent).toBe(
      "A module can't draw as the main. Take out module;, or set another program as main.",
    );
    $('.note button')!.click();
    expect(actions).toEqual(['set-main']);
  });

  it('a plain message after sections replaces them; nothing to show hides it', () => {
    panel.showSections([GEARS], 1);
    panel.show('Workspace not found');
    expect([$$('.who').length, content().textContent]).toEqual([0, 'Workspace not found']);
    panel.showSections([], 0);
    expect(panel.classList.contains('visible')).toBe(false);
  });
});
