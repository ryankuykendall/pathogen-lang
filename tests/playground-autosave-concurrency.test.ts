// @vitest-environment jsdom
//
// Client half of optimistic concurrency.
//
// autosave must (1) send the revision it edited from as `baseRev`, (2) advance
// that base from each save's response so sequential saves keep working, and
// (3) on a 409 conflict, stop autosaving (rather than retrying with a stale
// baseRev or clobbering) and surface the conflict — while keeping the user's
// local edit in memory.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));

vi.mock('../playground/services/api.js', () => ({
  workspaceApi: { update: updateSpy },
}));

import { autosave } from '../playground/services/autosave.js';
import { store } from '../playground/state/store.js';
import { SaveStatus } from '../playground/services/autosave.js';

describe('autosave optimistic concurrency', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    autosave.init('ws-1', null, 3); // loaded at rev 3
  });

  it('sends baseRev and advances it from the response', async () => {
    updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });

    autosave.onChange('edit-1');
    await autosave.saveNow();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, body] = updateSpy.mock.calls[0];
    expect(body).toEqual({ code: 'edit-1', baseRev: 3 });
    // Base advanced to the server's value for the next save.
    expect(autosave._baseRev).toBe(4);

    updateSpy.mockResolvedValueOnce({ rev: 5, updatedAt: 'now' });
    autosave.onChange('edit-2');
    await autosave.saveNow();
    const [, body2] = updateSpy.mock.calls[1];
    expect(body2).toEqual({ code: 'edit-2', baseRev: 4 });

    autosave.stop();
  });

  it('on a 409 conflict: stops autosaving, surfaces the conflict, keeps local edit', async () => {
    updateSpy.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409, data: { conflict: true } }));
    const conflictEvents: Event[] = [];
    const onConflict = (e: Event): void => void conflictEvents.push(e);
    document.addEventListener('workspace-conflict', onConflict);

    autosave.onChange('my-local-edit');
    await autosave.saveNow();

    // Conflict surfaced, autosave halted, local edit retained.
    expect(autosave._conflicted).toBe(true);
    expect(store.get('saveStatus')).toBe(SaveStatus.ERROR);
    expect(conflictEvents).toHaveLength(1);
    expect(autosave._pendingCode).toBe('my-local-edit');

    // A further attempt must NOT fire another request (would 409 / clobber).
    const callsAfterConflict = updateSpy.mock.calls.length;
    await autosave._attemptSave();
    expect(updateSpy.mock.calls.length).toBe(callsAfterConflict);

    document.removeEventListener('workspace-conflict', onConflict);
    autosave.stop();
  });

  it('keepalive (visibilitychange) save advances _baseRev when the page survives', async () => {
    // Regression: a keepalive save bumps the server rev. If the page survives
    // (tab backgrounding, not a real unload) we must keep _baseRev in sync, or
    // the next edit after returning would falsely 409 and halt autosave.
    updateSpy.mockResolvedValueOnce({ rev: 4, updatedAt: 'now' });

    autosave.onChange('bg-edit');
    void autosave.saveNow({ keepalive: true });
    // Dispatch is synchronous; the _baseRev sync runs on the resolved promise.
    await new Promise((r) => setTimeout(r));

    const [, body, opts] = updateSpy.mock.calls[0];
    expect(body).toEqual({ code: 'bg-edit', baseRev: 3 });
    expect(opts).toEqual({ keepalive: true });
    expect(autosave._baseRev).toBe(4);

    // A subsequent normal save now sends the advanced base — no false conflict.
    updateSpy.mockResolvedValueOnce({ rev: 5, updatedAt: 'now' });
    autosave.onChange('fg-edit');
    await autosave.saveNow();
    const [, body2] = updateSpy.mock.calls[1];
    expect(body2).toEqual({ code: 'fg-edit', baseRev: 4 });

    autosave.stop();
  });

  it('a 409 on the keepalive path surfaces the conflict (not a silent halt)', async () => {
    updateSpy.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409, data: { conflict: true } }));
    const conflictEvents: Event[] = [];
    const onConflict = (e: Event): void => void conflictEvents.push(e);
    document.addEventListener('workspace-conflict', onConflict);

    autosave.onChange('bg-edit');
    void autosave.saveNow({ keepalive: true });
    await new Promise((r) => setTimeout(r)); // let the rejected promise settle

    expect(autosave._conflicted).toBe(true);
    expect(store.get('saveStatus')).toBe(SaveStatus.ERROR);
    expect(conflictEvents).toHaveLength(1); // banner + pill, not a silent death

    document.removeEventListener('workspace-conflict', onConflict);
    autosave.stop();
  });

  it('re-init (reload) clears the conflicted state at the latest rev', async () => {
    updateSpy.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409, data: { conflict: true } }));
    autosave.onChange('x');
    await autosave.saveNow();
    expect(autosave._conflicted).toBe(true);

    autosave.init('ws-1', null, 9); // simulate reload at the newer rev
    expect(autosave._conflicted).toBe(false);
    expect(autosave._baseRev).toBe(9);
    autosave.stop();
  });
});
