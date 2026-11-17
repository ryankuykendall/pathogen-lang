// @vitest-environment jsdom
//
// The review screen and an approval with a file whose bytes are lost (2e step 5d;
// note 59, requirement 9): GET /admin/approval/:id marks it `unreadable`. The modal
// names the file instead of showing an empty source, and Regenerate / Set thumbnail
// refuse with the same reason instead of compiling nothing.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../playground/services/compiler-worker.js', () => ({ default: { compileWithContext: vi.fn() } }));
vi.mock('../playground/services/thumbnail-service.js', () => ({ default: {} }));
vi.mock('../playground/components/blog/mini-workspace.js', () => ({}));
vi.mock('../playground/components/thumbnail-crop-modal.js', () => ({}));

interface ReviewScreen extends HTMLElement {
  _openReviewFromApprovalRecord: (id: string, name: string) => Promise<void>;
  _fetchAndCompileApproval: (id: string) => Promise<unknown>;
}

const LOST = {
  code: undefined,
  files: {
    'main.pathogen': { sha256: 'a', size: 1, unreadable: true },
  },
  folders: [],
  entryPoints: ['main.pathogen'],
};

describe('an approval with a file that can’t be read', () => {
  beforeAll(() => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function screen(): Promise<ReviewScreen> {
    await import('../playground/components/views/admin-moderation-view.ts');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(LOST), { status: 200 })),
    );
    return document.createElement('admin-moderation-view') as ReviewScreen;
  }

  it('the modal names the file instead of showing an empty source', async () => {
    const view = await screen();
    await view._openReviewFromApprovalRecord('w1', 'Spiral');
    const modal = view.shadowRoot!.querySelector('.modal-main');
    expect([
      modal?.querySelector('.modal-error')?.textContent,
      modal?.querySelector('mini-workspace, source-files'),
    ]).toEqual(["main.pathogen couldn't be read.", null]);
  });

  it('Regenerate and Set thumbnail refuse with the same reason', async () => {
    const view = await screen();
    await expect(view._fetchAndCompileApproval('w1')).rejects.toThrow(
      "main.pathogen couldn't be read, so it can't be compiled.",
    );
  });
});
