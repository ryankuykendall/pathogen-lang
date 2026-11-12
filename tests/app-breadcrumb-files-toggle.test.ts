// @vitest-environment jsdom
//
// Files, beside Console in the breadcrumb (2d, step 4a; docs/workspace-files.md
// "The file tree and tabs"): it shows or hides the tree. The tree is shown at
// first, as every mockup draws it. A page with no workspace (a scratch link)
// has no files to show, so no Files.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('the Files toggle', () => {
  beforeAll(() => {
    // app-breadcrumb pulls in services/api.ts, which reads a build-time define.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', workspaceFiles: {}, filesOpen: true });
    document.body.innerHTML = '';
  });

  async function mount(workspaceFiles: Record<string, string>) {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({ currentView: 'workspace', workspaceFiles });
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

  it('isn’t there without a workspace’s files (a scratch link)', async () => {
    const { files } = await mount({});
    expect(files()).toBeNull();
  });
});
