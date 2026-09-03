// Once-a-second elapsed clock behind the "Compiling... MM:SS" chip.
//
// Owned by workspace-view (the compile owner): start() at each compile start,
// stop() when status leaves 'compiling'. Writes store.compilationElapsedMs
// quantized to whole seconds so the store's identity guard drops sub-second
// no-op notifies. Timestamp-based rather than tick-counting, so a throttled
// background tab delays a repaint but never drifts the value. The tick also
// self-stops if the status has moved on without an explicit stop(), so no
// future lifecycle path can leave a clock running against a hidden chip.

import { store } from '../state/store.js';

export interface CompileTicker {
  /** (Re)start the clock from now; resets compilationElapsedMs to 0. */
  start: () => void;
  /** Stop the clock; idempotent. Leaves compilationElapsedMs at its last value. */
  stop: () => void;
}

export interface CompileTickerDeps {
  /** Clock source; defaults to performance.now(). Injectable for tests. */
  now?: () => number;
  /** Tick period in ms; defaults to 1000. */
  intervalMs?: number;
}

export function createCompileTicker(deps: CompileTickerDeps = {}): CompileTicker {
  const now = deps.now ?? ((): number => performance.now());
  const intervalMs = deps.intervalMs ?? 1000;
  let handle: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;

  const stop = (): void => {
    if (handle === null) return;
    clearInterval(handle);
    handle = null;
  };

  const tick = (): void => {
    if (store.get('compilationStatus') !== 'compiling') {
      stop();
      return;
    }
    const elapsed = Math.max(0, now() - startedAt);
    store.set('compilationElapsedMs', Math.floor(elapsed / 1000) * 1000);
  };

  const start = (): void => {
    stop();
    startedAt = now();
    store.set('compilationElapsedMs', 0);
    handle = setInterval(tick, intervalMs);
  };

  return { start, stop };
}
