// @vitest-environment jsdom
//
// Autosave contract for in-app workspace→workspace switches.
//
// Regression tests for a data-loss bug pair: switching from workspace A to B
// in the same tab (1) silently dropped A's pending edits inside the debounce
// window, and (2) left autosave armed for A while B's (or a share link's, or
// the 404 fallback's) code streamed in — a stale debounce/keepalive save then
// wrote foreign code into A. workspace-view now calls autosave.flush() at
// switch time and initialize() awaits the flush then stops autosave
// unconditionally before any new-workspace state exists. These tests pin the
// service-level contract that ordering relies on. The editor-side half (undo
// history cleared via a fresh EditorState) is not unit-testable — CodeMirror
// loads from esm.sh — and is covered by scripts/debug-workspace-switch-undo.ts.

import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { autosave } from '../playground/services/autosave.js';
import { store } from '../playground/state/store.js';

const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));

vi.mock('../playground/services/api.js', () => ({
  workspaceApi: { update: updateSpy },
}));

// Keep in sync with DEBOUNCE_MS (5s) and MIN_INTERVAL_MS (30s) in
// playground/services/autosave.ts — advancing past both proves no timer of
// any kind is still armed.
const PAST_ALL_TIMERS_MS = 40_000;

describe('autosave across workspace switches', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    updateSpy.mockResolvedValue({ rev: 99, updatedAt: 'now' });
  });

  afterEach(() => {
    autosave.stop();
    vi.useRealTimers();
  });

  it('flush targets the old workspace even when the store has moved on to the new one', async () => {
    autosave.init('ws-A', null, 1);
    autosave.onChange('A-edit');

    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    const flushPromise = autosave.flush();
    // Simulate the new workspace's load overwriting the shared store BEFORE
    // the flush's network round-trip completes — the flush must have captured
    // A's id and pending code synchronously.
    store.set('code', 'B-code');
    await flushPromise;

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [wsId, body] = updateSpy.mock.calls[0];
    expect(wsId).toBe('ws-A');
    expect(body).toEqual({ code: 'A-edit', baseRev: 1 });
  });

  it('awaitPendingFlush resolves after a fire-and-forget flush has saved (initialize ordering seam)', async () => {
    autosave.init('ws-A', null, 1);
    autosave.onChange('A-edit');

    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    // handleRouteChange fires-and-forgets; initialize() awaits the seam.
    autosave.flush();
    await autosave.awaitPendingFlush();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBe('ws-A');
  });

  it('after flush, autosave is disarmed: onChange for the incoming code cannot save anywhere', async () => {
    vi.useFakeTimers();
    autosave.init('ws-A', null, 1);
    autosave.onChange('A-edit');
    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    await autosave.flush();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // The bug's exact shape: the new document's content streams in while the
    // service still remembers workspace A. Post-flush it must be a no-op.
    autosave.onChange('B-code');
    await vi.advanceTimersByTimeAsync(PAST_ALL_TIMERS_MS);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls.every(([wsId]) => wsId === 'ws-A')).toBe(true);
  });

  it('stopped autosave ignores the teardown keepalive save (no-init branches backstop)', async () => {
    // The `?state=`, non-owner, and 404 branches never call init(); with the
    // unconditional stop() in initialize(), even a page-teardown keepalive
    // save must not fire against the previous workspace.
    autosave.init('ws-A', null, 1);
    autosave.onChange('foreign-code');
    autosave.stop();

    const saved = await autosave.saveNow({ keepalive: true });
    expect(saved).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('full switch sequence saves each workspace exactly its own code', async () => {
    // The service-level trace of handleRouteChange → initialize → loadWorkspace:
    // flush A (captures pending edit) → await → stop → init B → edits save to B.
    autosave.init('ws-A', null, 1);
    autosave.onChange('edited-A');

    updateSpy.mockResolvedValueOnce({ rev: 2, updatedAt: 'now' });
    autosave.flush();
    await autosave.awaitPendingFlush();
    autosave.stop();

    autosave.init('ws-B', null, 5);
    autosave.onChange('edited-B');
    updateSpy.mockResolvedValueOnce({ rev: 6, updatedAt: 'now' });
    await autosave.saveNow();

    expect(updateSpy.mock.calls).toEqual([
      ['ws-A', { code: 'edited-A', baseRev: 1 }],
      ['ws-B', { code: 'edited-B', baseRev: 5 }],
    ]);
  });

  it('switching with no pending edits saves nothing', async () => {
    // With no pending code the flush falls back to store('code') and dirty-
    // checks it against the last saved hash — replicate hashContent (SHA-256,
    // first 8 bytes as hex — see playground/services/autosave.ts) so the
    // clean state is recognized as clean.
    const contentHash = createHash('sha256').update('clean-A-code').digest('hex').slice(0, 16);
    store.set('code', 'clean-A-code');
    autosave.init('ws-A', contentHash, 1);

    autosave.flush();
    await autosave.awaitPendingFlush();
    autosave.stop();
    autosave.init('ws-B', null, 5);

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
