// @vitest-environment jsdom
//
// Files, beside Console in the breadcrumb (2d, step 4a; docs/workspace-files.md
// "The file tree and tabs"): it shows or hides the tree. The tree is shown at
// first, as every mockup draws it. A page with no saved workspace (a scratch
// link) has no tree, so no Files; a saved workspace keeps it even with every
// file deleted (step 4d: its + is how files come back).

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('the Files toggle', () => {
  beforeAll(() => {
    // app-breadcrumb pulls in services/api.ts, which reads a build-time define.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', workspaceFiles: {}, workspaceId: null, filesOpen: true });
    document.body.innerHTML = '';
  });

  async function mount(workspaceFiles: Record<string, string>, workspaceId: string | null = 'ws-1') {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({ currentView: 'workspace', workspaceFiles, workspaceId });
    const el = document.createElement('app-breadcrumb');
    document.body.appendChild(el);
    const files = () => el.shadowRoot!.querySelector<HTMLButtonElement>('#files-toggle');
    return { store, el, files };
  }

  it('starts with the tree shown', async () => {
    const { store } = await import('../playground/state/store.ts');
    expect(store.get('filesOpen')).toBe(true);
  });

  it('sits before Console, pressed while the tree shows, and toggles it', async () => {
    const { store, el, files } = await mount({ 'main.pathogen': 'M 0 0' });
    const order = [...el.shadowRoot!.querySelectorAll('.toggle-bar button')].map((b) => b.id);
    expect(order).toEqual(['files-toggle', 'console-toggle']);
    expect([files()!.getAttribute('aria-pressed'), files()!.classList.contains('active')]).toEqual(['true', true]);
    expect(files()!.title).toBe('Hide the workspace’s files');

    files()!.click();
    expect(store.get('filesOpen')).toBe(false);
    expect([files()!.getAttribute('aria-pressed'), files()!.classList.contains('active')]).toEqual(['false', false]);
    expect(files()!.title).toBe('Show the workspace’s files');

    files()!.click();
    expect(store.get('filesOpen')).toBe(true);
  });

  it('isn’t there without a saved workspace (a scratch link)', async () => {
    const { files } = await mount({ 'main.pathogen': 'M 0 0' }, null);
    expect(files()).toBeNull();
  });

  it('stays in a saved workspace whose every file was deleted', async () => {
    const { files } = await mount({});
    expect(files()).not.toBeNull();
  });

  // Step 4d: with no file open, no file crumb. (Copy Code, off then, left for the tabs' copy icon in 2e, step 3d.)
  it('with no file open: no file crumb', async () => {
    const { store, el } = await mount({ 'main.pathogen': 'M 0 0' });
    expect(el.shadowRoot!.querySelector('.breadcrumb-file')?.textContent).toBe('main.pathogen');
    store.update({ openFile: null, openFiles: [] });
    expect(el.shadowRoot!.querySelector('.breadcrumb-file')).toBeNull();
    store.update({ openFile: 'main.pathogen', openFiles: ['main.pathogen'] });
  });

  // Step 5a: the thumbnail is the main's drawing, taken from the preview. While
  // the preview holds another program's (or none), Set Thumbnail waits, and says
  // why under its name, as mockup v7 draws it for a workspace with no program.
  it('Set Thumbnail waits while the preview doesn’t hold the main’s drawing, and says why', async () => {
    const { store, el } = await mount({ 'main.pathogen': 'M 0 0', 'b.pathogen': 'M 1 1' });
    const item = () => el.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="set-thumbnail"]')!;
    store.set('thumbnailWait', null);
    expect([item().disabled, item().querySelector('small')]).toEqual([false, null]);
    store.set('thumbnailWait', 'Show the main first');
    expect([item().disabled, item().textContent, item().querySelector('small')!.textContent]).toEqual([
      true,
      'Set ThumbnailShow the main first',
      'Show the main first',
    ]);
    store.set('thumbnailWait', null);
  });
});
