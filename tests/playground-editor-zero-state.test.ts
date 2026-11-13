// @vitest-environment jsdom
//
// The editor's zero-state (2d, step 4d; mockup v11, note 57): with no file
// open, the workspace's one zero-state says what to do, and holds every button.

import { beforeAll, describe, expect, it } from 'vitest';

interface ZeroView {
  main: string | null;
  noFiles: boolean;
  onlyLibraries: boolean;
  filesHidden: boolean;
}
type ZeroEl = HTMLElement & { view: ZeroView; focusPrimary: () => void };

beforeAll(async () => {
  await import('../playground/components/editor-zero-state.js');
});

function zeroState(view: Partial<ZeroView>): ZeroEl {
  document.body.innerHTML = '';
  const el: ZeroEl = document.createElement('editor-zero-state');
  document.body.appendChild(el);
  el.view = { main: null, noFiles: false, onlyLibraries: false, filesHidden: false, ...view };
  return el;
}

const read = (el: ZeroEl) => ({
  heading: el.shadowRoot!.querySelector('h2')!.textContent,
  text: el.shadowRoot!.querySelector('p')!.textContent,
  buttons: [...el.shadowRoot!.querySelectorAll('button')].map((b) => [b.textContent.trim(), b.dataset.action]),
  small: el.shadowRoot!.querySelector('small')?.textContent ?? null,
});

describe('the editor’s zero-state', () => {
  it('with a main: it says which file is the main, and opens it', () => {
    expect(read(zeroState({ main: 'main.pathogen' }))).toEqual({
      heading: 'No file open',
      text: "The workspace's main is main.pathogen. Open it, or click any file in the tree.",
      buttons: [['Open main.pathogen', 'open-main']],
      small: null,
    });
  });

  it('with the tree hidden: Show files beside it', () => {
    expect(read(zeroState({ main: 'demos/gears.pathogen', filesHidden: true }))).toEqual({
      heading: 'No file open',
      text: "The workspace's main is demos/gears.pathogen. Open it, or show the files to pick another.",
      buttons: [
        ['Open demos/gears.pathogen', 'open-main'],
        ['Show files', 'show-files'],
      ],
      small: null,
    });
  });

  it('only libraries: why nothing draws, and New program, the only button', () => {
    expect(read(zeroState({ onlyLibraries: true }))).toEqual({
      heading: 'No program yet',
      text: 'Every file here is a library, so nothing draws. Start a program, or click a library in the tree to edit it.',
      buttons: [['New program', 'new-program']],
      small: 'It goes at the top of the workspace, and it will be the main.',
    });
  });

  it('no files: the workspace is empty', () => {
    expect(read(zeroState({ noFiles: true }))).toEqual({
      heading: 'No files yet',
      text: 'This workspace is empty, so nothing draws. Start a program, or add your own files with the + in the Files header.',
      buttons: [['New program', 'new-program']],
      small: 'It goes at the top of the workspace, and it will be the main.',
    });
  });

  it('no program and the tree hidden: New program and Show files', () => {
    const view = read(zeroState({ onlyLibraries: true, filesHidden: true }));
    expect([view.text, view.buttons]).toEqual([
      'Every file here is a library, so nothing draws. Start a program, or show the files to edit a library.',
      [
        ['New program', 'new-program'],
        ['Show files', 'show-files'],
      ],
    ]);
  });

  it('a name is text, never markup', () => {
    const el = zeroState({ main: '<b>x</b>.pathogen' });
    expect([el.shadowRoot!.querySelector('b'), read(el).text]).toEqual([
      null,
      "The workspace's main is <b>x</b>.pathogen. Open it, or click any file in the tree.",
    ]);
  });

  it('each button asks workspace-view to act; focusPrimary puts the keyboard on the first', () => {
    const el = zeroState({ main: 'main.pathogen', filesHidden: true });
    const asked: string[] = [];
    document.addEventListener('zero-state-action', (e) =>
      asked.push((e as Event & { detail: { action: string } }).detail.action),
    );
    for (const button of el.shadowRoot!.querySelectorAll('button')) button.click();
    expect(asked).toEqual(['open-main', 'show-files']);
    el.focusPrimary();
    expect((el.shadowRoot!.activeElement as HTMLElement).dataset.action).toBe('open-main');
  });

  it('the same view again keeps the focused button; a new one redraws', () => {
    const el = zeroState({ main: 'main.pathogen' });
    el.focusPrimary();
    const focused = el.shadowRoot!.activeElement;
    el.view = { main: 'main.pathogen', noFiles: false, onlyLibraries: false, filesHidden: false };
    expect(el.shadowRoot!.activeElement).toBe(focused);
    el.view = { main: 'app.pathogen', noFiles: false, onlyLibraries: false, filesHidden: false };
    expect([el.shadowRoot!.activeElement, read(el).buttons]).toEqual([null, [['Open app.pathogen', 'open-main']]]);
  });

  it('names itself the Editor for a screen reader, since it stands in the editor’s place', () => {
    const region = zeroState({ main: 'main.pathogen' }).shadowRoot!.querySelector('[role="region"]')!;
    expect([region.getAttribute('aria-label'), region.querySelector('h2')!.textContent]).toEqual([
      'Editor',
      'No file open',
    ]);
  });
});
