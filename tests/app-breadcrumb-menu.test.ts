// @vitest-environment jsdom
//
// The workspace's menu and Copy Code (2d, step 9a; mockup v7 screen K, and
// v11 for a workspace with no program; docs/workspace-files.md):
// - Copy URL is gone from the menu, for every workspace and a scratch link too
//   (note 52, answer 4: "let's drop copy URL from the menu"); links copied
//   before still open;
// - Copy Code's tooltip names the file in the editor; Format Document says
//   it formats that file;
// - with no program, what needs a drawing waits and says why, as v7's screen X
//   (state 5) draws it: Export, Set Thumbnail and Make public, and the
//   Snapshot button ("nothing to keep"). Copy SVG is unchanged. The status
//   reads "No programs" and says why on hover.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('the workspace’s menu (step 9a)', () => {
  beforeAll(() => {
    // app-breadcrumb pulls in services/api.ts, which reads a build-time define.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({
      currentView: 'landing',
      workspaceFiles: {},
      workspaceId: null,
      openFile: 'main.pathogen',
      openFiles: ['main.pathogen'],
      compilationStatus: 'idle',
      currentUser: null,
      workspaceOwnerId: null,
      workspaceIsPublic: false,
      noPrograms: false,
    });
    document.body.innerHTML = '';
  });

  async function mount(workspaceFiles: Record<string, string>, workspaceId: string | null = 'ws-1') {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({ currentView: 'workspace', workspaceFiles, workspaceId });
    const el = document.createElement('app-breadcrumb');
    document.body.appendChild(el);
    const item = (action: string) => el.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    return { store, el, item };
  }

  it('Copy URL is gone from the menu, in a saved workspace and on a scratch link', async () => {
    const saved = await mount({ 'main.pathogen': 'M 0 0' });
    expect(saved.item('copy-url')).toBeNull();
    document.body.innerHTML = '';
    const scratch = await mount({}, null);
    expect(scratch.item('copy-url')).toBeNull();
    expect(scratch.item('copy-svg')).not.toBeNull();
  });

  // Copying is for the owner (2e step 4; note 58, answer 10): someone else forks a
  // public workspace from its page, which copies the approved files, not the live ones.
  it("Copy Workspace is the owner's: signed in or not, but not on someone else's workspace", async () => {
    const users = await import('../playground/services/user-id.ts');
    const { store, item } = await mount({ 'main.pathogen': 'M 0 0' });
    // Not signed in: the owner is this browser's own id.
    store.update({ workspaceOwnerId: users.getUserId() });
    expect(item('copy-workspace')).not.toBeNull();
    // Signed in, as sign-in sets it.
    users.setAuthenticatedUserId('u-1');
    try {
      store.update({ currentUser: { id: 'u-1', features: [] }, workspaceOwnerId: 'u-1' });
      expect(item('copy-workspace')).not.toBeNull();
      // Someone else's public workspace.
      store.update({ workspaceOwnerId: 'u-2', workspaceIsPublic: true });
      expect(item('copy-workspace')).toBeNull();
    } finally {
      users.clearAuthenticatedUserId();
    }
  });

  // Copy Code left the bar for the copy icon at the end of the editor's tabs (2e, step 3d; mockups v13, v14).
  it('has no Copy Code; Format Document says it’s the file in the editor', async () => {
    const { store, el, item } = await mount({ 'main.pathogen': 'M 0 0', 'parts/gears.pathogen': 'module;' });
    store.update({ openFile: 'parts/gears.pathogen', openFiles: ['main.pathogen', 'parts/gears.pathogen'] });
    expect([el.shadowRoot!.querySelector('#copy-code'), el.shadowRoot!.querySelector('#copy-feedback')]).toEqual([
      null,
      null,
    ]);
    expect(item('format-document')!.querySelector('small')?.textContent).toBe('The file in the editor');
  });

  it('with no program: Export, Snapshot and Make public wait, saying why; Copy SVG doesn’t; the status reads "No programs"', async () => {
    const { store, el, item } = await mount({ 'parts/gears.pathogen': 'module;' });
    store.update({
      currentUser: { id: 'u-1', features: ['publishing'] } as never,
      workspaceOwnerId: 'u-1',
      workspacePublicationState: 'unpublished',
      noPrograms: true,
      compilationStatus: 'no-programs',
      renderedCode: null,
    });
    const reason = (action: string) => [item(action)!.disabled, item(action)!.querySelector('small')?.textContent];
    expect(reason('export')).toEqual([true, "Add a program first: there's nothing to export"]);
    expect(reason('toggle-publish')).toEqual([true, "Add a program first: there's nothing to show"]);
    expect(item('copy-svg')!.disabled).toBe(false);
    const snapshot = () => el.shadowRoot!.querySelector<HTMLButtonElement>('#snapshot-btn')!;
    expect([snapshot().disabled, snapshot().title]).toEqual([true, "Add a program first: there's nothing to keep"]);
    const status = () => el.shadowRoot!.querySelector<HTMLElement>('#compilation-status')!;
    expect([status().textContent, status().title]).toEqual([
      'No programs',
      'Nothing draws: the workspace has no program. Add one with the + in the Files header.',
    ]);
    // A program again: they're back.
    store.update({ noPrograms: false, compilationStatus: 'completed', renderedCode: 'M 0 0' });
    expect([item('export')!.disabled, item('toggle-publish')!.disabled, snapshot().disabled, status().title]).toEqual([
      false,
      false,
      false,
      '',
    ]);
  });

  it('with no program, a public workspace can still be made private', async () => {
    const { store, item } = await mount({ 'parts/gears.pathogen': 'module;' });
    store.update({
      currentUser: { id: 'u-1', features: ['publishing'] } as never,
      workspaceOwnerId: 'u-1',
      workspaceIsPublic: true,
      workspacePublicationState: 'approved',
      noPrograms: true,
    });
    expect([item('toggle-publish')!.textContent, item('toggle-publish')!.disabled]).toEqual(['Make private', false]);
    store.update({ workspaceIsPublic: false, workspacePublicationState: 'unpublished', noPrograms: false });
  });
});
