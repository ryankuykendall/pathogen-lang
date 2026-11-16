// @vitest-environment jsdom
//
// The review screen and a re-review the server withdrew (2e step 5a;
// project-docs/modules/58-phase-2e-plan.md, "Step 5a, built"): the server answers
// Approve or Reject with 409 { withdrawn: true } when the workspace isn't public
// any more. The entry leaves the Re-review list, and the server's reason shows as
// a notice, not as "Approve failed".

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../playground/services/compiler-worker.js', () => ({ default: { compileWithContext: vi.fn() } }));
vi.mock('../playground/services/thumbnail-service.js', () => ({ default: {} }));
vi.mock('../playground/components/blog/mini-workspace.js', () => ({}));
vi.mock('../playground/components/thumbnail-crop-modal.js', () => ({}));

const REASON = "This workspace isn't public any more, so its re-review was withdrawn.";

interface ReviewScreen extends HTMLElement {
  _rereview: { workspaceId: string; code?: string }[];
  _approve: (id: string) => Promise<void>;
  _reject: (id: string) => Promise<void>;
}

async function screenWithRereview(): Promise<ReviewScreen> {
  await import('../playground/components/views/admin-moderation-view.ts');
  const screen = document.createElement('admin-moderation-view') as ReviewScreen;
  screen._rereview = [
    { workspaceId: 'w1', code: '' },
    { workspaceId: 'w2', code: '' },
  ];
  return screen;
}

function recordToasts(): { type: string; title: string }[] {
  const toasts: { type: string; title: string }[] = [];
  document.addEventListener('show-toast', (e) => {
    toasts.push((e as Event & { detail: { type: string; title: string } }).detail);
  });
  return toasts;
}

describe('a re-review the server withdrew', () => {
  beforeAll(() => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const action of ['_approve', '_reject'] as const) {
    it(`${action === '_approve' ? 'Approve' : 'Reject'}: the entry leaves the list, with the reason as a notice`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: REASON, withdrawn: true }), { status: 409 })),
      );
      const toasts = recordToasts();
      const screen = await screenWithRereview();
      await screen[action]('w1');
      expect(screen._rereview.map((e) => e.workspaceId)).toEqual(['w2']);
      expect(toasts.at(-1)).toEqual({ type: 'success', title: REASON });
    });
  }

  it('any other refusal is still an error, and the entry stays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'No pending submission' }), { status: 404 })),
    );
    const toasts = recordToasts();
    const screen = await screenWithRereview();
    await screen._approve('w1');
    expect(screen._rereview.map((e) => e.workspaceId)).toEqual(['w1', 'w2']);
    expect(toasts.at(-1)).toEqual({ type: 'error', title: 'Approve failed: No pending submission' });
  });
});
