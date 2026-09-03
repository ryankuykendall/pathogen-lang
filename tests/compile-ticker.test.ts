import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../playground/state/store';
import { createCompileTicker } from '../playground/utils/compile-ticker';

import type { CompileTicker } from '../playground/utils/compile-ticker';

// The ticker is the only writer of compilationElapsedMs. Its owner,
// workspace-view, cannot be mounted under vitest (CodeMirror loads from
// esm.sh), so the clock's contract is pinned here with fake timers. `now` is
// taken from the faked Date so the injected clock and the interval agree.

describe('createCompileTicker', () => {
  let ticker: CompileTicker;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 0 });
    ticker = createCompileTicker({ now: () => Date.now() });
  });

  afterEach(() => {
    ticker.stop();
    store.update({ compilationStatus: 'idle', compilationElapsedMs: 0 });
    vi.useRealTimers();
  });

  it('resets to 0 on start and advances once a second', () => {
    store.set('compilationElapsedMs', 5000); // residue from a previous compile
    ticker.start();
    expect(store.get('compilationElapsedMs')).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(store.get('compilationElapsedMs')).toBe(1000);
    vi.advanceTimersByTime(1000);
    expect(store.get('compilationElapsedMs')).toBe(2000);
  });

  it('quantizes to whole seconds so sub-second ticks never notify', () => {
    ticker = createCompileTicker({ now: () => Date.now(), intervalMs: 250 });
    const spy = vi.fn();
    const unsubscribe = store.subscribe('compilationElapsedMs', spy);
    ticker.start();

    vi.advanceTimersByTime(750); // three ticks at 250/500/750 ms
    expect(spy).not.toHaveBeenCalled();
    expect(store.get('compilationElapsedMs')).toBe(0);

    vi.advanceTimersByTime(250);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.get('compilationElapsedMs')).toBe(1000);
    unsubscribe();
  });

  it('self-stops and freezes the value once status leaves compiling', () => {
    ticker.start();
    vi.advanceTimersByTime(1000);
    expect(store.get('compilationElapsedMs')).toBe(1000);

    store.set('compilationStatus', 'rendering');
    vi.advanceTimersByTime(5000);
    expect(store.get('compilationElapsedMs')).toBe(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts from 0 with a single live interval when a newer compile begins', () => {
    ticker.start();
    vi.advanceTimersByTime(2000);
    expect(store.get('compilationElapsedMs')).toBe(2000);

    ticker.start();
    expect(store.get('compilationElapsedMs')).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(store.get('compilationElapsedMs')).toBe(1000);
  });

  it('stop() ends the clock and is idempotent', () => {
    ticker.start();
    vi.advanceTimersByTime(1000);
    ticker.stop();
    ticker.stop();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(3000);
    expect(store.get('compilationElapsedMs')).toBe(1000);
  });
});
