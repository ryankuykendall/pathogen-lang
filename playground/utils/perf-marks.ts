// Flag-gated performance instrumentation for diagnosing editor jank.
//
// Inert unless enabled via `localStorage.pathogenPerf = '1'` or a `?perf=1`
// query param. When enabled, `perfSpan`-wrapped stages emit
// `performance.measure('pathogen:<name>')` entries (visible in the DevTools
// Performance panel) and a console line for spans that cost ≥ 1 ms.
// `installPerfObservers` additionally logs slow input events and long tasks
// so keystroke latency can be quantified during a typing burst.

const enabled: boolean = (() => {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
    return window.localStorage.getItem('pathogenPerf') === '1';
  } catch {
    return false;
  }
})();

export function perfEnabled(): boolean {
  return enabled;
}

/** Wrap a synchronous stage. No-op passthrough when the flag is off. */
export function perfSpan<T>(name: string, fn: () => T): T {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(name, start);
  }
}

/** Wrap an async stage. No-op passthrough when the flag is off. */
export async function perfSpanAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(name, start);
  }
}

function record(name: string, start: number): void {
  const duration = performance.now() - start;
  try {
    performance.measure(`pathogen:${name}`, { start, duration });
  } catch {
    // Older measure() signatures — timing console line below still fires.
  }
  if (duration >= 1) {
    console.log(`[perf] ${name}: ${duration.toFixed(1)}ms`);
  }
}

let observersInstalled = false;

/**
 * Log input events slower than 50 ms and all long tasks. Call once from
 * workspace-view; safe to call repeatedly.
 */
export function installPerfObservers(): void {
  if (!enabled || observersInstalled || typeof PerformanceObserver === 'undefined') return;
  observersInstalled = true;

  try {
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { processingStart?: number; interactionId?: number };
        console.log(
          `[perf] slow input event: ${entry.name} duration=${entry.duration.toFixed(0)}ms ` +
            `inputDelay=${e.processingStart ? (e.processingStart - entry.startTime).toFixed(0) : '?'}ms`,
        );
      }
    });
    eventObserver.observe({ type: 'event', durationThreshold: 50, buffered: false } as PerformanceObserverInit);
  } catch {
    // event timing not supported — long tasks below still report.
  }

  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`[perf] long task: ${entry.duration.toFixed(0)}ms @ ${entry.startTime.toFixed(0)}`);
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: false });
  } catch {
    // longtask not supported everywhere; fine.
  }

  console.log('[perf] instrumentation enabled (localStorage.pathogenPerf / ?perf=1)');
}
