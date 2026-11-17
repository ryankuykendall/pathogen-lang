// @vitest-environment jsdom
//
// The review screen (2e step 5e, piece 3; mockups v12 R1 to R6): a queue entry's
// card, its modal and Approve all read the entry's source (GET /admin/review/:id/source,
// or the listing when it carries the text).
// - The card counts the files; a re-review's says what changed; one whose files can't
//   be read says so, with Approve off.
// - Approve waits for the source, sends the drawing of the main compiled with its
//   imports and the version it saw; a save since (409 changed) decides nothing.
// - The modal keeps its viewer through the screen's redraws, opens on the main, hides
//   the ↗, and its changes box opens the files it names.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../playground/services/compiler-worker.js', () => ({ default: { compileWithContext: vi.fn() } }));
vi.mock('../playground/services/thumbnail-service.js', () => ({ default: {} }));
vi.mock('../playground/components/blog/mini-workspace.js', () => ({}));
vi.mock('../playground/components/thumbnail-crop-modal.js', () => ({}));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const DRAWN = '<svg xmlns="http://www.w3.org/2000/svg" data-drawn="gears"></svg>';

const CHANGES = {
  files: [
    { path: 'parts/gears.pathogen', mark: 'changed' },
    { path: 'try-sizes.pathogen', mark: 'removed' },
  ],
  foldersAdded: [],
  foldersRemoved: [],
  programs: {
    mainBefore: 'main.pathogen',
    mainAfter: 'main.pathogen',
    added: [],
    removed: ['try-sizes.pathogen'],
    orderOnly: false,
  },
  counts: { new: 0, changed: 1, removed: 1 },
};

/** A re-review of two files as the listing carries it: its manifest, and what changed. */
const LISTED = {
  workspaceId: 'w1',
  userId: 'u1',
  name: 'Gears',
  description: '',
  slug: 'gears',
  submittedAt: '2026-11-14T13:48:09Z',
  ownerHandle: 'ryan',
  ownerDisplayName: null,
  ownerFlagged: false,
  codeHash: 'hash-1',
  files: {
    'main.pathogen': { sha256: 'm', size: MAIN.length },
    'parts/gears.pathogen': { sha256: 'g', size: GEARS.length },
  },
  folders: [],
  entryPoints: ['main.pathogen'],
  changes: CHANGES,
  approvedAt: '2026-11-12T10:00:00Z',
};

/** GET /admin/review/w1/source?queue=rereview's answer. */
const SOURCE = {
  workspaceId: 'w1',
  name: 'Gears',
  files: {
    'main.pathogen': { sha256: 'm', size: MAIN.length, text: MAIN },
    'parts/gears.pathogen': { sha256: 'g', size: GEARS.length, text: GEARS },
  },
  folders: [],
  entryPoints: ['main.pathogen'],
  codeHash: 'hash-1',
  changes: CHANGES,
  approvedAt: '2026-11-12T10:00:00Z',
};

interface Viewer extends HTMLElement {
  sourceFiles: {
    files: { path: string; kind: string }[];
    open: string | null;
    main: string | null;
    marks: unknown;
  } | null;
  opened: string[];
}

interface ReviewScreen extends HTMLElement {
  _tab: string;
  _rereview: (typeof LISTED)[];
  _entrySource: (tab: string, e: typeof LISTED) => Promise<{ status: string }>;
  _openQueueReview: (tab: string, e: typeof LISTED) => Promise<void>;
  _approve: (id: string) => Promise<void>;
  _isAdmin: () => boolean;
  render: () => void;
}

const calls: { url: string; body?: Record<string, unknown> }[] = [];
let answers: (url: string, init?: RequestInit) => Response;

async function screen(): Promise<ReviewScreen> {
  await import('../playground/components/views/admin-moderation-view.ts');
  const view = document.createElement('admin-moderation-view') as ReviewScreen;
  // The screen's own gate reads the signed-in user; these tests are about what's behind it.
  view._isAdmin = () => true;
  view._tab = 'rereview';
  view._rereview = [structuredClone(LISTED)];
  return view;
}

const $ = (view: ReviewScreen, selector: string) => view.shadowRoot!.querySelector<HTMLElement>(selector);

describe('the review screen', () => {
  let worker: { compileWithContext: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
    // A stand-in viewer: what it was given, and the files the changes box opened.
    customElements.define(
      'mini-workspace',
      class extends HTMLElement {
        sourceFiles = null;

        opened: string[] = [];

        openFile(path: string): void {
          this.opened.push(path);
        }
      },
    );
    worker = (await import('../playground/services/compiler-worker.js')).default as unknown as typeof worker;
  });

  beforeEach(() => {
    calls.length = 0;
    answers = (url) =>
      url.includes('/source?queue=rereview')
        ? new Response(JSON.stringify(SOURCE), { status: 200 })
        : new Response(JSON.stringify({ ok: true, decision: 'approve', slug: 'gears' }), { status: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}) });
        return answers(url, init);
      }),
    );
    (window as unknown as { PathogenLang: unknown }).PathogenLang = {
      generateSvg: () => DRAWN,
      isModuleSource: (text: string) => text.startsWith('module;'),
      workspaceProjectFileText: (entryPoints: readonly string[]) => JSON.stringify({ entryPoints }),
    };
    worker.compileWithContext.mockReset();
    worker.compileWithContext.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a card counts the files, says what changed, and keeps Approve off until the files load', async () => {
    const view = await screen();
    view.render();
    expect($(view, '.card-meta .files')?.textContent).toBe('3 files');
    expect($(view, '.card-chg')?.textContent).toBe('Since the approved version: 1 changed, 1 removed');
    const approve = () => $(view, '[data-action="approve"]') as HTMLButtonElement;
    expect([approve().disabled, approve().title]).toEqual([true, 'Approve waits for the submitted files to load']);
    await view._entrySource('rereview', view._rereview[0]);
    view.render();
    expect([approve().disabled, approve().title]).toEqual([false, '']);
  });

  it('a comparison that failed is said, never “nothing changed”', async () => {
    const view = await screen();
    view._rereview = [{ ...LISTED, changes: undefined, changesError: 'boom' } as unknown as typeof LISTED];
    view.render();
    expect($(view, '.card-chg')?.textContent).toBe('Couldn’t compare with the approved version.');
  });

  it('files that can’t be read: the card says so, Approve is off and does nothing, the modal says it in place of the viewer', async () => {
    answers = (url) =>
      url.includes('/source')
        ? new Response(
            JSON.stringify({
              ...SOURCE,
              files: { ...SOURCE.files, 'parts/gears.pathogen': { sha256: 'g', size: 1, unreadable: true } },
            }),
            { status: 200 },
          )
        : new Response('{}', { status: 200 });
    const view = await screen();
    await view._entrySource('rereview', view._rereview[0]);
    view.render();
    const approve = $(view, '[data-action="approve"]') as HTMLButtonElement;
    expect([approve.disabled, approve.title]).toEqual([true, 'Approve needs the files, and they couldn’t be read']);
    expect($(view, '.card .why')?.textContent).toBe(
      'The submitted files couldn’t be read, so there’s nothing to review. Approve is off until they load: refresh to try again.',
    );
    expect($(view, '[data-action="reject-start"]')?.hasAttribute('disabled')).toBe(false);
    await view._approve('w1');
    expect(calls.filter((c) => c.url.endsWith('/admin/review/w1'))).toEqual([]);
    await view._openQueueReview('rereview', view._rereview[0]);
    expect([$(view, '.modal-main .why.big')?.textContent, $(view, '.modal-main mini-workspace')]).toEqual([
      'The submitted files couldn’t be read. There’s nothing to review yet, so Approve is off on the card. Refresh the page to try again.',
      null,
    ]);
  });

  it('a load that failed is tried again when the queue is listed again (Refresh)', async () => {
    let up = false;
    answers = (url) => {
      if (url.endsWith('/admin/queue/rereview'))
        return new Response(JSON.stringify({ entries: [LISTED] }), { status: 200 });
      return up
        ? new Response(JSON.stringify(SOURCE), { status: 200 })
        : new Response(JSON.stringify({ error: 'try later' }), { status: 500 });
    };
    const view = await screen();
    expect(await view._entrySource('rereview', view._rereview[0])).toEqual({ status: 'failed', error: 'try later' });
    view.render();
    expect(($(view, '[data-action="approve"]') as HTMLButtonElement).getAttribute('aria-describedby')).toBe('why-w1');
    up = true;
    await (view as unknown as { _loadTab: (tab: string) => Promise<void> })._loadTab('rereview');
    expect((await view._entrySource('rereview', view._rereview[0])).status).toBe('ready');
    view.render();
    expect([($(view, '[data-action="approve"]') as HTMLButtonElement).disabled, $(view, '.card .why')]).toEqual([
      false,
      null,
    ]);
  });

  it('Approve sends the main compiled with its imports, and the version it saw', async () => {
    const view = await screen();
    await view._entrySource('rereview', view._rereview[0]);
    await view._approve('w1');
    const [text, , isStale, options] = worker.compileWithContext.mock.calls[0] as [
      string,
      number,
      unknown,
      { workspace: { files: Map<string, string>; entry: string; label: string } },
    ];
    expect([text, isStale, options.workspace.entry, options.workspace.label]).toEqual([
      MAIN,
      undefined,
      'main.pathogen',
      'Gears',
    ]);
    expect(options.workspace.files).toEqual(
      new Map([
        ['main.pathogen', MAIN],
        ['parts/gears.pathogen', GEARS],
      ]),
    );
    expect(calls.find((c) => c.url.endsWith('/admin/review/w1'))?.body).toEqual({
      decision: 'approve',
      feature: false,
      codeHash: 'hash-1',
      svg: DRAWN,
    });
    expect(view._rereview).toEqual([]);
  });

  it('a drawing that doesn’t compile is still approved, without one', async () => {
    worker.compileWithContext.mockRejectedValue(new Error('no such function'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = await screen();
    await view._entrySource('rereview', view._rereview[0]);
    await view._approve('w1');
    expect(calls.find((c) => c.url.endsWith('/admin/review/w1'))?.body).toEqual({
      decision: 'approve',
      feature: false,
      codeHash: 'hash-1',
    });
  });

  it('a save since it was opened: nothing decided, the modal closes, the tab reloads', async () => {
    const view = await screen();
    await view._entrySource('rereview', view._rereview[0]);
    await view._openQueueReview('rereview', view._rereview[0]);
    answers = (url) =>
      url.endsWith('/admin/review/w1')
        ? new Response(JSON.stringify({ error: 'This submission changed after it was opened.', changed: true }), {
            status: 409,
          })
        : new Response(JSON.stringify({ entries: [] }), { status: 200 });
    const toasts: unknown[] = [];
    document.addEventListener('show-toast', (e) => toasts.push((e as Event & { detail: unknown }).detail));
    await view._approve('w1');
    expect(toasts.at(-1)).toEqual({ type: 'success', title: 'This submission changed after it was opened.' });
    expect($(view, '.modal-backdrop')).toBeNull();
    expect(calls.at(-1)?.url).toBe('http://localhost:8787/admin/queue/rereview');
  });

  it('the modal: every file, opening on the main, with the marks; the ↗ hidden; kept through redraws', async () => {
    const view = await screen();
    await view._openQueueReview('rereview', view._rereview[0]);
    const viewer = $(view, '.modal-main mini-workspace') as Viewer;
    expect([viewer.getAttribute('caption'), viewer.hasAttribute('hide-playground-link'), viewer.innerHTML]).toEqual([
      'Gears',
      true,
      DRAWN,
    ]);
    expect(viewer.sourceFiles?.files.map((f) => `${f.path} ${f.kind}`)).toEqual([
      'main.pathogen program',
      'parts/gears.pathogen library',
      'pathogen.json project',
    ]);
    expect([viewer.sourceFiles?.open, viewer.sourceFiles?.marks]).toEqual([
      'main.pathogen',
      {
        files: { 'parts/gears.pathogen': { mark: 'changed' }, 'pathogen.json': { mark: 'changed' } },
        removed: ['try-sizes.pathogen'],
        foldersAdded: [],
      },
    ]);
    // A thumbnail finishing behind it redraws the screen, not the modal.
    view.render();
    view.render();
    expect($(view, '.modal-main mini-workspace')).toBe(viewer);
  });

  it('the changes box: a line each, and the lines that name a file open it', async () => {
    const view = await screen();
    await view._openQueueReview('rereview', view._rereview[0]);
    const box = $(view, '.modal-changes')!;
    expect(box.querySelector('h4')?.textContent).toMatch(
      /^What changed since the approved version \(approved Nov 12, 2026\)$/,
    );
    expect([...box.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'parts/gears.pathogen changed',
      'try-sizes.pathogen was removed',
      'The program list: try-sizes.pathogen left it, so pathogen.json changed',
    ]);
    expect([...box.querySelectorAll<HTMLElement>('[data-file]')].map((b) => b.dataset.file)).toEqual([
      'parts/gears.pathogen',
      'pathogen.json',
    ]);
    box.querySelector<HTMLElement>('[data-file="parts/gears.pathogen"] code')!.click();
    expect(($(view, '.modal-main mini-workspace') as Viewer).opened).toEqual(['parts/gears.pathogen']);
  });

  it('a first review has no changes box; one file shows the drawing and the file', async () => {
    const view = await screen();
    const rings = {
      ...LISTED,
      workspaceId: 'w2',
      name: 'Rings',
      files: { 'main.pathogen': { sha256: 'r', size: 9, text: 'M 0 0 h 9' } },
      code: 'M 0 0 h 9',
      changes: undefined,
      approvedAt: undefined,
    } as unknown as typeof LISTED;
    view._tab = 'pending';
    await view._openQueueReview('pending', rings);
    // The listing carried the text: no source route asked.
    expect(calls.filter((c) => c.url.includes('/source'))).toEqual([]);
    expect($(view, '.modal-changes')?.hidden).toBe(true);
    expect((($(view, '.modal-main mini-workspace') as Viewer).sourceFiles?.files ?? []).map((f) => f.path)).toEqual([
      'main.pathogen',
    ]);
  });
});
