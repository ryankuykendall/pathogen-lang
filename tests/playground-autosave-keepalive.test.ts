// Regression: the leave-the-page autosave flush must dispatch its request
// SYNCHRONOUSLY.
//
// saveNow({ keepalive: true }) is called from beforeunload / visibilitychange.
// An earlier version awaited crypto.subtle hashing before the fetch — that
// continuation never runs once the document starts tearing down, so the
// keepalive request was never sent and the final edit was lost. These tests
// pin that the request is issued within the same synchronous tick (no await
// gap) and carries { keepalive: true }, and that it's skipped when clean.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(async () => ({ updatedAt: '2026-05-30T00:00:00.000Z' })),
}));

vi.mock('../playground/services/api.js', () => ({
  workspaceApi: { update: updateSpy },
}));

import { autosave } from '../playground/services/autosave.js';

describe('autosave keepalive flush', () => {
  beforeEach(() => {
    updateSpy.mockClear();
    autosave.init('ws-1', null);
  });

  it('dispatches the save synchronously on the keepalive path', () => {
    autosave.onChange('reddish → yellowish');

    // Call WITHOUT awaiting, exactly as the beforeunload handler does.
    const before = updateSpy.mock.calls.length;
    void autosave.saveNow({ keepalive: true });

    // The request must already be in flight — no microtask gap before fetch.
    expect(updateSpy.mock.calls.length).toBe(before + 1);
    const [id, body, opts] = updateSpy.mock.calls[0];
    expect(id).toBe('ws-1');
    expect(body).toEqual({ code: 'reddish → yellowish', baseRev: 0 });
    expect(opts).toEqual({ keepalive: true });

    autosave.stop();
  });

  it('skips the keepalive write when there is nothing unsaved', () => {
    // No onChange → no pending edit.
    void autosave.saveNow({ keepalive: true });
    expect(updateSpy).not.toHaveBeenCalled();
    autosave.stop();
  });
});
