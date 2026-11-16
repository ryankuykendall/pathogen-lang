// @vitest-environment jsdom
//
// The blog viewer's code panel is <source-files> (2e, step 3b-2; mockups v12 to
// v14, note 62):
// - a blog sample is one file, and its copy icon, in the panel, says "Copy the
//   code"; the control bar has no Copy any more;
// - closed, the panel is out of the keyboard's way; opening it, by the toggle or
//   by the attribute (the storybook's control, the snapshots page), loads the editor;
// - `hide-playground-link` hides the ↗ (the snapshots page, the review modal);
// - `sourceFiles` shows several files, opening on the program that drew the image,
//   and that program's text is what Open in Playground carries;
// - an embed taken out and put back gets its files again.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MiniWorkspaceFiles } from '../playground/components/blog/mini-workspace.ts';
import type { SourceFiles } from '../playground/components/shared/source-files.ts';

type Embed = HTMLElement & { sourceFiles: MiniWorkspaceFiles | null };

const SAMPLE = 'define ViewBox(0, 0, 240, 120);\ncircle(120, 60, 40);';
const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\ngear(Point(50, 50), 34);\n';

const SEVERAL: MiniWorkspaceFiles = {
  files: [
    { path: 'main.pathogen', text: MAIN, kind: 'program' },
    { path: 'parts/gears.pathogen', text: GEARS, kind: 'library' },
    { path: 'demos/gears.pathogen', text: DEMO, kind: 'program' },
    {
      path: 'pathogen.json',
      text: '{\n  "entryPoints": ["main.pathogen", "demos/gears.pathogen"]\n}\n',
      kind: 'project',
    },
  ],
  folders: [],
  main: 'main.pathogen',
  open: 'demos/gears.pathogen',
};

let activate: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  // The theme manager asks for the system's colour scheme; jsdom has no matchMedia.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  await import('../playground/components/blog/mini-workspace.ts');
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** An embed with the blog's sample, or several files; `attrs` set before it's on the page. */
function mount(options: { attrs?: string[]; files?: MiniWorkspaceFiles } = {}): {
  el: Embed;
  root: ShadowRoot;
  viewer: () => SourceFiles;
} {
  // CodeMirror comes from esm.sh, which a test doesn't reach: count the asks instead.
  const Viewer = customElements.get('source-files') as unknown as { prototype: SourceFiles };
  activate = vi.fn(async () => undefined);
  vi.spyOn(Viewer.prototype, 'activate').mockImplementation(activate);
  const el = document.createElement('mini-workspace') as Embed;
  for (const name of options.attrs ?? []) el.setAttribute(name, '');
  if (options.files) el.sourceFiles = options.files;
  el.innerHTML = `<pre><code>${SAMPLE}</code></pre>`;
  document.body.appendChild(el);
  const root = el.shadowRoot!;
  return { el, root, viewer: () => root.querySelector('.code-panel source-files') as SourceFiles };
}

const shadow = (viewer: SourceFiles, sel: string): HTMLElement | null =>
  viewer.shadowRoot!.querySelector<HTMLElement>(sel);

describe('a blog sample', () => {
  it('is one file in the panel, its copy icon there saying “Copy the code”; the bar has no Copy', () => {
    const { root, viewer } = mount({ attrs: ['code-open'] });
    expect(viewer().files).toEqual([{ path: 'main.pathogen', text: SAMPLE, kind: 'program' }]);
    expect(shadow(viewer(), '.float .cp')?.getAttribute('aria-label')).toBe('Copy the code');
    expect(shadow(viewer(), '.list')).toBeNull();
    expect(root.querySelector('#copy-btn')).toBeNull();
    expect(root.querySelectorAll('.glass-bar-inner [data-tip^="Copy"]')).toHaveLength(0);
  });

  it('copying copies the sample, and says “Copied the code”', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { viewer } = mount({ attrs: ['code-open'] });
    shadow(viewer(), '.float .cp')!.click();
    expect(writeText).toHaveBeenCalledWith(SAMPLE);
    await vi.waitFor(() => expect(shadow(viewer(), '.tip')?.textContent).toBe('Copied the code'));
  });
});

describe('written into a page’s HTML, as the review modal writes it', () => {
  it('upgrades open, and loads the editor exactly once', () => {
    const Viewer = customElements.get('source-files') as unknown as { prototype: SourceFiles };
    const load = vi.spyOn(Viewer.prototype, 'activate').mockImplementation(async () => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = `<mini-workspace caption="Review" code-open hide-playground-link><code>${SAMPLE}</code></mini-workspace>`;
    const root = host.querySelector('mini-workspace')!.shadowRoot!;
    expect([
      load.mock.calls.length,
      root.querySelector('.code-panel')!.hasAttribute('inert'),
      root.querySelector<HTMLElement>('.playground-link')!.hidden,
      (root.querySelector('source-files') as SourceFiles).shownText,
    ]).toEqual([1, false, true, SAMPLE]);
  });
});

describe('the code open or closed', () => {
  it('closed, the panel is inert (nothing to copy); the toggle opens it and loads the editor', () => {
    const { root } = mount();
    const panel = root.querySelector('.code-panel')!;
    const toggle = root.querySelector<HTMLElement>('#code-toggle')!;
    expect([panel.hasAttribute('inert'), toggle.getAttribute('aria-pressed'), activate.mock.calls.length]).toEqual([
      true,
      'false',
      0,
    ]);
    toggle.click();
    expect([panel.hasAttribute('inert'), toggle.getAttribute('aria-pressed'), activate.mock.calls.length]).toEqual([
      false,
      'true',
      1,
    ]);
    toggle.click();
    expect([panel.hasAttribute('inert'), toggle.classList.contains('active')]).toEqual([true, false]);
  });

  it('set by the attribute, as the storybook’s control and the snapshots page set it, it opens the same way', () => {
    const { el, root } = mount();
    el.setAttribute('code-open', '');
    expect([root.querySelector('.code-panel')!.hasAttribute('inert'), activate.mock.calls.length]).toEqual([false, 1]);
    expect(root.querySelector('#code-toggle')!.classList.contains('active')).toBe(true);
  });

  it('authored open, the editor loads at once', () => {
    const { root } = mount({ attrs: ['code-open'] });
    expect([root.querySelector('.code-panel')!.hasAttribute('inert'), activate.mock.calls.length]).toEqual([false, 1]);
  });
});

describe('the caption', () => {
  it('follows its attribute while the embed is on the page (a snapshot renamed)', () => {
    const { el, root } = mount({ attrs: ['code-open'] });
    const title = (): string | null | undefined => root.querySelector('.mw-title')?.textContent;
    expect(title()).toBe('Code & Preview');
    el.setAttribute('caption', 'Gears <#4>');
    expect(title()).toBe('Gears <#4>');
    el.removeAttribute('caption');
    expect(title()).toBe('Code & Preview');
  });
});

describe('hide-playground-link', () => {
  it('hides the ↗, set before the embed is on the page or after', () => {
    const hidden = mount({ attrs: ['hide-playground-link'] });
    expect(hidden.root.querySelector<HTMLElement>('.playground-link')!.hidden).toBe(true);
    const shown = mount();
    const link = shown.root.querySelector<HTMLElement>('.playground-link')!;
    expect(link.hidden).toBe(false);
    shown.el.setAttribute('hide-playground-link', '');
    expect(link.hidden).toBe(true);
    shown.el.removeAttribute('hide-playground-link');
    expect(link.hidden).toBe(false);
  });
});

describe('several files', () => {
  it('shows the list, opening on the program that drew the image; its copy icon names the file', () => {
    const { viewer } = mount({ attrs: ['code-open'], files: SEVERAL });
    const paths = [...viewer().shadowRoot!.querySelectorAll('.list [data-path]')].map((r) =>
      r.getAttribute('data-path'),
    );
    expect(paths).toEqual(['demos/gears.pathogen', 'parts/gears.pathogen', 'main.pathogen', 'pathogen.json']);
    expect([viewer().open, shadow(viewer(), '.path .cp')?.getAttribute('aria-label')]).toEqual([
      'demos/gears.pathogen',
      'Copy demos/gears.pathogen',
    ]);
  });

  it('Open in Playground carries the program that drew the image, not the child <code>', () => {
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { root } = mount({ files: SEVERAL });
    root.querySelector<HTMLElement>('.playground-link')!.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setItem.mock.calls[0][1]).code).toBe(DEMO);
  });

  it('with no file named, the panel and Open in Playground agree: the main, else the first program', () => {
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    vi.spyOn(window, 'open').mockImplementation(() => null);
    // A module and pathogen.json first, as a folder's order can put them.
    const files = [SEVERAL.files[1], SEVERAL.files[3], SEVERAL.files[2], SEVERAL.files[0]];
    const { el, root, viewer } = mount({ files: { files, folders: [], main: null, open: null } });
    root.querySelector<HTMLElement>('.playground-link')!.click();
    expect([viewer().open, JSON.parse(setItem.mock.calls[0][1]).code]).toEqual(['demos/gears.pathogen', DEMO]);
    el.sourceFiles = { files, folders: [], main: 'main.pathogen', open: null };
    root.querySelector<HTMLElement>('.playground-link')!.click();
    expect([viewer().open, JSON.parse(setItem.mock.calls[1][1]).code]).toEqual(['main.pathogen', MAIN]);
  });

  it('passes a re-review’s marks to its panel (2e step 5e)', () => {
    const marks = { files: { 'parts/gears.pathogen': { mark: 'changed' as const } }, removed: [], foldersAdded: [] };
    const { viewer } = mount({ attrs: ['code-open'], files: { ...SEVERAL, marks } });
    expect(shadow(viewer(), '.row[data-path="parts/gears.pathogen"] .mdot')?.className).toBe('mdot chg');
  });

  it('openFile shows a file without changing the drawing’s program; re-attached, the panel keeps it', () => {
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const { el, root, viewer } = mount({ attrs: ['code-open'], files: SEVERAL });
    (el as Embed & { openFile: (path: string) => void }).openFile('parts/gears.pathogen');
    expect(viewer().open).toBe('parts/gears.pathogen');
    root.querySelector<HTMLElement>('.playground-link')!.click();
    expect(JSON.parse(setItem.mock.calls[0][1]).code).toBe(DEMO);
    // Taken out and put back (a fresh panel): still the file being read.
    el.remove();
    document.body.appendChild(el);
    expect(viewer().open).toBe('parts/gears.pathogen');
    // A file clicked in the panel is kept the same way.
    shadow(viewer(), '.row[data-path="main.pathogen"]')!.click();
    el.remove();
    document.body.appendChild(el);
    expect(viewer().open).toBe('main.pathogen');
  });

  it('the drawing’s program couldn’t be read (2e step 5d): no ↗, since there’s no code to open', () => {
    const lost: MiniWorkspaceFiles = {
      ...SEVERAL,
      files: SEVERAL.files.map((f) =>
        f.path === 'demos/gears.pathogen' ? { path: f.path, text: '', kind: 'program', unreadable: true } : f,
      ),
    };
    const { el, root } = mount({ files: lost });
    expect(root.querySelector<HTMLElement>('.playground-link')!.hidden).toBe(true);
    // Another drawing, readable: the ↗ is back.
    el.sourceFiles = SEVERAL;
    expect(root.querySelector<HTMLElement>('.playground-link')!.hidden).toBe(false);
  });

  it('set while the embed is on the page, Open in Playground carries the new drawing’s size', () => {
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const { el, root } = mount();
    el.sourceFiles = SEVERAL;
    root.querySelector<HTMLElement>('.playground-link')!.click();
    const sent = JSON.parse(setItem.mock.calls[0][1]);
    // DEMO's ViewBox is 300 × 110; the sample's was 240 × 120.
    expect([sent.code, sent.w, sent.h]).toEqual([DEMO, 300, 110]);
  });

  it('set while the embed is on the page, the panel follows', () => {
    const { el, viewer } = mount({ attrs: ['code-open'] });
    el.sourceFiles = SEVERAL;
    expect([viewer().files.length, viewer().open, shadow(viewer(), '.path .p')?.textContent]).toEqual([
      4,
      'demos/gears.pathogen',
      'demos/gears.pathogen',
    ]);
    el.sourceFiles = null;
    expect([viewer().files, shadow(viewer(), '.float .cp')?.getAttribute('aria-label')]).toEqual([
      [{ path: 'main.pathogen', text: SAMPLE, kind: 'program' }],
      'Copy the code',
    ]);
  });

  it('an embed taken out and put back gets its files again, in a fresh panel', () => {
    const { el, root, viewer } = mount({ attrs: ['code-open'], files: SEVERAL });
    const before = viewer();
    el.remove();
    document.body.appendChild(el);
    expect(viewer()).not.toBe(before);
    expect([viewer().files.length, viewer().open, root.querySelector('.code-panel')!.hasAttribute('inert')]).toEqual([
      4,
      'demos/gears.pathogen',
      false,
    ]);
  });
});
