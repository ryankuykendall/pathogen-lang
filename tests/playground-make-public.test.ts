// @vitest-environment jsdom
//
// Make public, on the breadcrumb and the Workspaces page (2e step 5c;
// project-docs/modules/58-phase-2e-plan.md, answer 8):
// - the latest edits are saved first, so what's submitted is what the editor shows;
//   a save that fails submits nothing;
// - the check compiles the main with its imports, as the preview does: a workspace
//   whose main imports a module is no longer "empty" or failing;
// - the menu's re-review state follows each save's answer, not only the load;
// - the Workspaces page says "Pending Review" while a submission waits, as the
//   breadcrumb does, and takes the state the server answers.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateSpy, getSpy, compileSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  getSpy: vi.fn(),
  compileSpy: vi.fn(),
}));
vi.mock('../playground/services/api.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  workspaceApi: { update: updateSpy, get: getSpy },
}));
vi.mock('../playground/services/compiler-worker.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  default: { compileWithContext: compileSpy },
}));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
/** What the compile answers for a main that draws. */
const DRAWS = { layers: [{ type: 'path', data: 'M 0 0 L 4 0' }] };

const loadEngine = async () => import('../src');
let engine: Awaited<ReturnType<typeof loadEngine>>;

beforeAll(async () => {
  (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  engine = await loadEngine();
  (window as unknown as { PathogenLang: unknown }).PathogenLang = engine;
});

beforeEach(() => {
  for (const spy of [updateSpy, getSpy, compileSpy]) spy.mockReset();
  compileSpy.mockResolvedValue(DRAWS);
});

afterEach(async () => {
  const { autosave } = await import('../playground/services/autosave.js');
  autosave.stop();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** A workspace of two files open in the editor, armed for autosave as workspace-view does for its owner. */
async function openWorkspace(): Promise<void> {
  const { store } = await import('../playground/state/store.ts');
  const { autosave } = await import('../playground/services/autosave.js');
  const files = { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS };
  store.update({
    workspaceId: 'ws-1',
    workspaceName: 'Gears',
    workspaceIsPublic: false,
    workspacePublicationState: 'unpublished',
    workspaceRereviewPending: false,
    workspaceFiles: files,
    workspaceFolders: ['parts'],
    workspaceEntryPoints: ['main.pathogen'],
    openFile: 'main.pathogen',
    code: MAIN,
  });
  const shas: Record<string, string> = {};
  const entries: Record<string, { sha256: string; size: number }> = {};
  for (const [path, text] of Object.entries(files)) {
    entries[path] = await engine.workspaceFileEntry(text);
    shas[path] = entries[path].sha256;
  }
  const hash = await engine.workspaceContentHash({
    files: entries,
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  autosave.init('ws-1', hash, 1, { shas, texts: files, justMain: false });
}

describe('the menu’s re-review state follows each save', () => {
  it('a save’s answer sets it, a skipped save’s too, and an answer without it leaves it', async () => {
    const { store } = await import('../playground/state/store.ts');
    const { autosave } = await import('../playground/services/autosave.js');
    await openWorkspace();
    store.update({ workspaceIsPublic: true, workspacePublicationState: 'approved' });

    store.set('code', `${MAIN}gear(6);\n`);
    autosave.onChange();
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now', publicationState: 'approved', rereviewPending: true });
    await autosave.saveNow();
    expect(store.get('workspaceRereviewPending')).toBe(true);

    // Back to the approved text: the server withdraws the re-review.
    store.set('code', MAIN);
    autosave.onChange();
    updateSpy.mockResolvedValueOnce({ rev: 3, skipped: true, publicationState: 'approved', rereviewPending: false });
    await autosave.saveNow();
    expect(store.get('workspaceRereviewPending')).toBe(false);

    store.set('code', `${MAIN}gear(8);\n`);
    autosave.onChange();
    updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });
    await autosave.saveNow();
    expect([store.get('workspaceRereviewPending'), store.get('workspacePublicationState')]).toEqual([
      false,
      'approved',
    ]);
  });
});

describe('precheckWorkspace', () => {
  it('compiles the main with its imports, as the preview does', async () => {
    const { precheckWorkspace } = await import('../playground/services/publish-precheck.ts');
    const texts = new Map([
      ['parts/gears.pathogen', GEARS],
      ['main.pathogen', MAIN],
    ]);
    const result = await precheckWorkspace(
      { texts, folders: ['parts'], entryPoints: ['main.pathogen'], openFile: 'parts/gears.pathogen' },
      'Gears',
    );
    expect(result).toEqual({ ok: true });
    expect(compileSpy).toHaveBeenCalledWith(MAIN, expect.any(Number), undefined, {
      workspace: { files: texts, folders: ['parts'], entry: 'main.pathogen', label: 'Gears' },
    });
  });

  it('an import that can’t load blocks it with the compile’s message; no program, nothing to publish', async () => {
    const { precheckWorkspace } = await import('../playground/services/publish-precheck.ts');
    compileSpy.mockRejectedValueOnce(new Error('Line 1, col 22: Cannot find "./parts/gears.pathogen"'));
    const texts = new Map([['main.pathogen', MAIN]]);
    expect(
      await precheckWorkspace({ texts, folders: [], entryPoints: ['main.pathogen'], openFile: null }, 'G'),
    ).toEqual({
      ok: false,
      reason: 'compile-error',
      message: 'Line 1, col 22: Cannot find "./parts/gears.pathogen"',
    });
    expect(await precheckWorkspace({ texts, folders: [], entryPoints: [], openFile: null }, 'G')).toEqual({
      ok: false,
      reason: 'empty',
      message: 'This workspace has no program to publish.',
    });
  });
});

describe("the breadcrumb's Make public", () => {
  async function breadcrumb(): Promise<{ handlePublishToggle: () => Promise<void> }> {
    await import('../playground/components/app-breadcrumb.ts');
    return document.createElement('app-breadcrumb') as unknown as { handlePublishToggle: () => Promise<void> };
  }

  it('saves the latest edit first, checks the main with its imports, then submits', async () => {
    const { store } = await import('../playground/state/store.ts');
    await openWorkspace();
    const edited = `${MAIN}gear(6);\n`;
    store.set('code', edited);
    const { autosave } = await import('../playground/services/autosave.js');
    autosave.onChange();
    updateSpy
      .mockResolvedValueOnce({ rev: 2, updatedAt: 'now', publicationState: 'unpublished', rereviewPending: false })
      .mockResolvedValueOnce({ isPublic: false, publicationState: 'pending', rereviewPending: false });

    await (await breadcrumb()).handlePublishToggle();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    // The save carried the edit; the submission came after it.
    expect((updateSpy.mock.calls[0][1] as { files: Record<string, { text?: string }> }).files['main.pathogen']).toEqual(
      {
        text: edited,
      },
    );
    expect(updateSpy.mock.calls[1][1]).toEqual({ isPublic: true });
    expect(compileSpy.mock.invocationCallOrder[0]).toBeGreaterThan(updateSpy.mock.invocationCallOrder[0]);
    expect(compileSpy.mock.calls[0][0]).toBe(edited);
    expect((compileSpy.mock.calls[0][3] as { workspace: { entry: string } }).workspace.entry).toBe('main.pathogen');
    expect(store.get('workspacePublicationState')).toBe('pending');
  });

  it('a save that fails submits nothing', async () => {
    const { store } = await import('../playground/state/store.ts');
    const { autosave } = await import('../playground/services/autosave.js');
    await openWorkspace();
    store.set('code', `${MAIN}gear(6);\n`);
    autosave.onChange();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    updateSpy.mockRejectedValue(new Error('offline'));
    await (await breadcrumb()).handlePublishToggle();
    // Two tries to save, as flush does; no submission.
    expect(updateSpy.mock.calls.map((call) => Object.keys(call[1] as object).includes('isPublic'))).toEqual([
      false,
      false,
    ]);
    expect(compileSpy).not.toHaveBeenCalled();
  });

  it('a page-teardown save still out is waited for: the submission goes only after it lands', async () => {
    const { store } = await import('../playground/state/store.ts');
    const { autosave } = await import('../playground/services/autosave.js');
    await openWorkspace();
    store.set('code', `${MAIN}gear(6);\n`);
    autosave.onChange();
    let land: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    // The tab was hidden for a moment: a keepalive save went out and is still out.
    await autosave.saveNow({ keepalive: true });
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'pending' });
    const toggled = (await breadcrumb()).handlePublishToggle();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    land({ rev: 2, publicationState: 'unpublished', rereviewPending: false });
    await toggled;
    expect(updateSpy.mock.calls.map((call) => call[1] as unknown)).toEqual([
      expect.objectContaining({ files: expect.anything() }),
      { isPublic: true },
    ]);
  });

  it('a workspace this page can’t save (autosave not armed for it) is checked and submitted as the server holds it', async () => {
    const { autosave } = await import('../playground/services/autosave.js');
    await openWorkspace();
    autosave.stop();
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'pending' });
    await (await breadcrumb()).handlePublishToggle();
    expect(updateSpy.mock.calls.map((call) => call[1] as unknown)).toEqual([{ isPublic: true }]);
  });

  it('Make private takes the answer’s re-review state: withdrawn', async () => {
    const { store } = await import('../playground/state/store.ts');
    await openWorkspace();
    store.update({ workspaceIsPublic: true, workspacePublicationState: 'approved', workspaceRereviewPending: true });
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'unpublished', rereviewPending: false });
    await (await breadcrumb()).handlePublishToggle();
    expect(updateSpy.mock.calls[0][1]).toEqual({ isPublic: false });
    expect([store.get('workspaceIsPublic'), store.get('workspaceRereviewPending')]).toEqual([false, false]);
  });

  it('Make private waits for a save still out, so its older answer never puts the re-review back', async () => {
    const { store } = await import('../playground/state/store.ts');
    const { autosave } = await import('../playground/services/autosave.js');
    await openWorkspace();
    store.update({ workspaceIsPublic: true, workspacePublicationState: 'approved' });
    store.set('code', `${MAIN}gear(6);\n`);
    autosave.onChange();
    let land: (value: unknown) => void = () => undefined;
    updateSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    const saving = autosave.saveNow();
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'unpublished', rereviewPending: false });
    const toggled = (await breadcrumb()).handlePublishToggle();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    // The save's answer, from before Make private: a re-review waited then.
    land({ rev: 2, updatedAt: 'now', publicationState: 'approved', rereviewPending: true });
    await saving;
    await toggled;
    expect(updateSpy.mock.calls[1][1]).toEqual({ isPublic: false });
    expect([store.get('workspacePublicationState'), store.get('workspaceRereviewPending')]).toEqual([
      'unpublished',
      false,
    ]);
  });
});

describe('the workspace’s menu while an edit waits for re-review (answer (a))', () => {
  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', workspaceId: null, currentUser: null, workspaceIsPublic: false });
  });

  it('offers Make private, with "An edit is waiting for review" under it; with nothing waiting, no note', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({
      currentView: 'workspace',
      currentUser: { id: 'u-1', features: ['publishing'] },
      workspaceId: 'ws-1',
      workspaceOwnerId: 'u-1',
      workspaceFiles: { 'main.pathogen': 'M 0 0' },
      workspaceIsPublic: true,
      workspacePublicationState: 'approved',
      workspaceRereviewPending: true,
    });
    const el = document.createElement('app-breadcrumb');
    document.body.appendChild(el);
    const item = (): HTMLButtonElement =>
      el.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="toggle-publish"]')!;
    expect([item().textContent?.trim(), item().disabled]).toEqual(['Make privateAn edit is waiting for review', false]);
    store.set('workspaceRereviewPending', false);
    expect([item().textContent?.trim(), item().querySelector('small')]).toEqual(['Make private', null]);
  });
});

describe('the Workspaces page', () => {
  async function mount() {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/views/landing-view.ts');
    store.update({
      currentView: 'workspace',
      currentUser: { id: 'u-1', features: ['publishing'] },
      workspaces: [
        { id: 'gears', slug: 'gears', name: 'Gears' },
        { id: 'waiting', slug: 'waiting', name: 'Waiting', publicationState: 'pending' },
        { id: 'edited', slug: 'edited', name: 'Edited', isPublic: true, rereviewPending: true },
        { id: 'shown', slug: 'shown', name: 'Shown', isPublic: true, rereviewPending: false },
      ],
    });
    const el = document.createElement('landing-view') as HTMLElement & {
      render: () => void;
      handleMenuAction: (action: string, id: string) => Promise<void>;
    };
    document.body.appendChild(el);
    el.render();
    const publish = (id: string) =>
      el.shadowRoot!.querySelector<HTMLButtonElement>(
        `.workspace-item[data-id="${id}"] [data-action="toggle-publish"]`,
      )!;
    return { el, publish };
  }

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ workspaces: [], currentUser: null });
  });

  it('Make Private says when an edit waits for re-review (answer (a)), and takes the answer’s state', async () => {
    const { el, publish } = await mount();
    expect([publish('edited').textContent, publish('edited').disabled]).toEqual([
      'Make PrivateAn edit is waiting for review',
      false,
    ]);
    expect(publish('shown').textContent).toBe('Make Private');
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'unpublished', rereviewPending: false });
    await el.handleMenuAction('toggle-publish', 'edited');
    expect(updateSpy).toHaveBeenCalledWith('edited', { isPublic: false });
    expect(publish('edited').textContent).toBe('Make Public');
  });

  it('says "Pending Review" while a submission waits, as the breadcrumb does', async () => {
    const { publish } = await mount();
    expect([publish('waiting').textContent, publish('waiting').disabled]).toEqual(['Pending Review', true]);
    expect([publish('gears').textContent, publish('gears').disabled]).toEqual(['Make Public', false]);
  });

  it('Make Public checks the main with its imports, submits, and shows the state the server answers', async () => {
    const { el, publish } = await mount();
    getSpy.mockResolvedValueOnce({
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      folders: ['parts'],
      entryPoints: ['main.pathogen'],
    });
    updateSpy.mockResolvedValueOnce({ isPublic: false, publicationState: 'pending' });
    await el.handleMenuAction('toggle-publish', 'gears');
    expect(compileSpy.mock.calls[0][0]).toBe(MAIN);
    expect((compileSpy.mock.calls[0][3] as { workspace: { files: Map<string, string> } }).workspace.files).toEqual(
      new Map([
        ['main.pathogen', MAIN],
        ['parts/gears.pathogen', GEARS],
      ]),
    );
    expect(updateSpy).toHaveBeenCalledWith('gears', { isPublic: true });
    expect([publish('gears').textContent, publish('gears').disabled]).toEqual(['Pending Review', true]);
  });
});
