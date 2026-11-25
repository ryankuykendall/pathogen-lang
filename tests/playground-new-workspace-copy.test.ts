// @vitest-environment jsdom
//
// Copies and forks (2e step 4; project-docs/modules/58-phase-2e-plan.md):
// - Copy Workspace and Duplicate (?copyFrom=, the owner's workspace) copy it on the
//   server, every file, folder and the main, with the form's name and description;
//   nothing is created from text;
// - Open as new workspace (?fromHandle=&fromSlug=, someone's public workspace) creates
//   from source.json's files, the approved ones, each sent as text;
// - a copy the server refuses says why, and goes nowhere;
// - a fork whose files can't be read says so, and makes no empty workspace.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSpy, copySpy, createSpy, navSpy, flushSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  copySpy: vi.fn(),
  createSpy: vi.fn(),
  navSpy: vi.fn(),
  flushSpy: vi.fn(async () => undefined),
}));
vi.mock('../playground/services/api.js', () => ({
  workspaceApi: { get: getSpy, copy: copySpy, create: createSpy },
}));
vi.mock('../playground/services/autosave.js', () => ({ autosave: { awaitPendingFlush: flushSpy } }));
vi.mock('../playground/utils/router.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  navigateTo: navSpy,
}));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';

/** The form, mounted for a route query; resolves once it shows its form. */
async function mount(query: Record<string, string>): Promise<ShadowRoot> {
  const { store } = await import('../playground/state/store.ts');
  await import('../playground/components/views/new-workspace-view.ts');
  store.update({ currentView: 'new-workspace', routeQuery: query });
  const el = document.createElement('new-workspace-view');
  document.body.appendChild(el);
  const root = el.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('form')).not.toBeNull());
  return root;
}

/** Submit, and wait until the form has finished (it sets its flag before its first await). */
async function submit(root: ShadowRoot): Promise<void> {
  const view = root.host as unknown as { _isSubmitting: boolean };
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(view._isSubmitting).toBe(false));
}

function type(root: ShadowRoot, name: string, value: string): void {
  const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('copies and forks (2e step 4)', () => {
  beforeAll(() => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  beforeEach(() => {
    for (const spy of [getSpy, copySpy, createSpy, navSpy, flushSpy]) spy.mockClear();
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', routeQuery: {} });
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('Copy Workspace copies on the server, with the name and description from the form, and opens the copy', async () => {
    getSpy.mockResolvedValue({ name: 'Gears', description: 'Two gears' });
    copySpy.mockResolvedValue({ id: 'c1', slug: 'my-gears' });
    const root = await mount({ copyFrom: 'w1' });
    expect(root.querySelector('h1')!.textContent).toBe('Copy Workspace');
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Gears (Copy)');
    expect(root.querySelector('[name="template"]')).toBeNull();
    type(root, 'name', 'My gears');
    type(root, 'description', 'Mine now');
    await submit(root);
    expect(copySpy).toHaveBeenCalledWith('w1', { name: 'My gears', description: 'Mine now' });
    expect(createSpy).not.toHaveBeenCalled();
    // The last edits are saved before the server copies the saved files.
    expect(flushSpy.mock.invocationCallOrder.at(-1)!).toBeLessThan(copySpy.mock.invocationCallOrder[0]);
    expect(navSpy).toHaveBeenCalledWith('/workspace/:slugId', { params: { slugId: 'my-gears--c1' } });
  });

  it('a copy the server refuses says why and goes nowhere', async () => {
    getSpy.mockResolvedValue({ name: 'Big', description: '' });
    copySpy.mockRejectedValue(new Error('This workspace has 21 different files; a copy can take at most 20 at once.'));
    const root = await mount({ copyFrom: 'w2' });
    await submit(root);
    expect(root.textContent).toContain('This workspace has 21 different files; a copy can take at most 20 at once.');
    expect(navSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('Open as new workspace creates from source.json’s files, each sent as text, with its folders and main', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: 'Gears',
        description: 'Two gears',
        code: 'ignored',
        files: {
          'main.pathogen': { sha256: 'a', size: MAIN.length, text: MAIN },
          'parts/gears.pathogen': { sha256: 'b', size: GEARS.length, text: GEARS },
        },
        folders: ['parts', 'empty'],
        entryPoints: ['main.pathogen'],
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);
    createSpy.mockResolvedValue({ id: 'f1', slug: 'gears-copy' });
    const root = await mount({ fromHandle: 'ada', fromSlug: 'gears' });
    expect(fetchSpy).toHaveBeenCalledWith('/u/ada/gears/source.json');
    // A copy, like Copy Workspace: no starting template, which it wouldn't use.
    expect(root.querySelector('h1')!.textContent).toBe('Copy Workspace');
    expect(root.querySelector('[name="template"]')).toBeNull();
    await submit(root);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const body = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'Gears (Copy)',
      description: 'Two gears',
      isPublic: false,
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      folders: ['parts', 'empty'],
      entryPoints: ['main.pathogen'],
    });
    expect(body).not.toHaveProperty('code');
    expect(body.files).toEqual({ 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } });
    expect(copySpy).not.toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith('/workspace/:slugId', { params: { slugId: 'gears-copy--f1' } });
  });

  it('a fork link set after the form mounted (the view and the query together, as the router does) loads and stays', async () => {
    let release: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return {
          ok: true,
          json: async () => ({
            name: 'Gears',
            description: '',
            files: { 'main.pathogen': { text: MAIN } },
            folders: [],
            entryPoints: ['main.pathogen'],
          }),
        };
      }),
    );
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/views/new-workspace-view.ts');
    store.update({ currentView: 'landing', routeQuery: {} });
    const el = document.createElement('new-workspace-view');
    document.body.appendChild(el);
    // Two notifications, one per key, while the load waits.
    store.update({ currentView: 'new-workspace', routeQuery: { fromHandle: 'ada', fromSlug: 'gears' } });
    release();
    const root = el.shadowRoot!;
    await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('Gears (Copy)'));
  });

  it('a fork’s load that ends after a newer one began leaves the form to the newer one', async () => {
    const answer = (name: string, text: string) => ({
      ok: true,
      json: async () => ({
        name,
        description: '',
        files: { 'main.pathogen': { text } },
        folders: [],
        entryPoints: ['main.pathogen'],
      }),
    });
    let releaseFirst: () => void = () => undefined;
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/first/')) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return answer('First', 'M 1 1');
      }
      return answer('Second', 'M 2 2');
    });
    vi.stubGlobal('fetch', fetchSpy);
    createSpy.mockResolvedValue({ id: 'f2', slug: 'second-copy' });
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/views/new-workspace-view.ts');
    store.update({ currentView: 'new-workspace', routeQuery: { fromHandle: 'ada', fromSlug: 'first' } });
    const el = document.createElement('new-workspace-view');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    // The second link, while the first is still loading; then the first answers.
    store.update({ routeQuery: { fromHandle: 'ada', fromSlug: 'second' } });
    const root = el.shadowRoot!;
    await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('Second (Copy)'));
    releaseFirst();
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Second (Copy)');
    await submit(root);
    expect((createSpy.mock.calls[0][0] as { files: unknown }).files).toEqual({ 'main.pathogen': { text: 'M 2 2' } });
  });

  it('a fork with a file the server couldn’t read (2e step 5d) says so, and makes no workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          name: 'Gears',
          files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { sha256: 'g', unreadable: true } },
          folders: ['parts'],
          entryPoints: ['main.pathogen'],
        }),
      })),
    );
    const root = await mount({ fromHandle: 'ada', fromSlug: 'gears' });
    expect(root.textContent).toContain('Failed to load workspace');
    await submit(root);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // Phase 3a: a data file past the 2 MB of data source.json carries comes deferred.
  const DEFERRED_SOURCE = {
    workspaceId: 'w1',
    name: 'Gears',
    files: {
      'main.pathogen': { text: 'import g from "./data/gears.json";\ncircle(0, 0, g.r);\n' },
      'data/gears.json': { sha256: 'b1', size: 9, deferred: true },
    },
    folders: ['data'],
    entryPoints: ['main.pathogen'],
  };

  it('Open as new workspace reads a deferred data file from the API first, and the copy holds it whole', async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.endsWith('/source.json')
        ? new Response(JSON.stringify(DEFERRED_SOURCE), { status: 200 })
        : new Response('{ "r": 4 }', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    createSpy.mockResolvedValue({ id: 'f3', slug: 'gears-copy' });
    const root = await mount({ fromHandle: 'ada', fromSlug: 'gears' });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[1][0]).toBe('http://localhost:8787/approval-source/w1/file/b1');
    await submit(root);
    expect((createSpy.mock.calls[0][0] as { files: unknown }).files).toEqual({
      'main.pathogen': { text: DEFERRED_SOURCE.files['main.pathogen'].text },
      'data/gears.json': { text: '{ "r": 4 }' },
    });
  });

  it('a deferred data file that can’t be read: said, naming it, and no workspace is made', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/source.json')
          ? new Response(JSON.stringify(DEFERRED_SOURCE), { status: 200 })
          : new Response(JSON.stringify({ error: 'File not found' }), { status: 404 }),
      ),
    );
    const root = await mount({ fromHandle: 'ada', fromSlug: 'gears' });
    await vi.waitFor(() => expect(root.textContent).toContain('data/gears.json couldn’t be read (File not found).'));
    await submit(root);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('a fork whose files can’t be read says so, and makes no workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ name: 'Old', code: 'M 0 0' }) })),
    );
    const root = await mount({ fromHandle: 'ada', fromSlug: 'old' });
    expect(root.textContent).toContain('Failed to load workspace');
    await submit(root);
    expect(createSpy).not.toHaveBeenCalled();
    expect(navSpy).not.toHaveBeenCalled();
  });
});
