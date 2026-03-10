// Compiler Worker Manager
// Manages Web Worker for async compilation with fallback to sync

declare const window: Window & { SvgPathExtended?: Record<string, Function> };

type CompilationType = 'compile' | 'compileAnnotated' | 'compileWithContext';

let worker: Worker | null = null;
let requestId: number = 0;
const pendingRequests: Map<
  number,
  { resolve: Function; reject: Function; compilationId: number }
> = new Map();

/**
 * Initialize the worker lazily
 */
function initWorker(): Worker | null {
  if (worker) return worker;

  try {
    // Worker path is relative to the document's base URL
    // The <base href="/svg-path-extended/"> tag in production makes this work correctly
    // In dev (playground/index.html), we need the ../ prefix
    // In production build, the base tag handles the path
    const isDevPlayground = window.location.pathname.includes('/playground/');
    const workerPath = isDevPlayground ? '../dist/worker.worker.js' : 'dist/worker.worker.js';

    worker = new Worker(workerPath);

    worker.onmessage = (event: MessageEvent) => {
      const { id, success, result, error } = event.data;
      const pending = pendingRequests.get(id);

      if (pending) {
        pendingRequests.delete(id);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error));
        }
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('Worker error:', event);
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error('Worker error'));
        pendingRequests.delete(id);
      }
      // Reset worker so next call will try to reinitialize
      terminateWorker();
    };

    return worker;
  } catch (e) {
    console.warn('Failed to initialize worker:', e);
    return null;
  }
}

/**
 * Terminate the worker and clean up
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  // Reject any pending requests
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error('Worker terminated'));
  }
  pendingRequests.clear();
}

/**
 * Send a compilation request to the worker
 * @param type - 'compile', 'compileAnnotated', or 'compileWithContext'
 * @param source - The source code to compile
 * @param compilationId - The compilation ID to check for staleness
 * @param isStale - Function to check if this request is stale
 * @param options - Compilation options (e.g. { toFixed: 2 })
 * @returns The compilation result
 */
async function sendRequest(
  type: CompilationType,
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
): Promise<unknown> {
  const w = initWorker();

  // Fall back to sync if worker unavailable
  if (!w) {
    return fallbackSync(type, source, options);
  }

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (result: unknown) => {
        // Check staleness before resolving
        if (isStale && isStale(compilationId)) {
          reject(new Error('Stale result'));
        } else {
          resolve(result);
        }
      },
      reject,
      compilationId,
    });

    w.postMessage({ id, type, source, options });
  });
}

/**
 * Fallback to synchronous compilation using the global library
 */
function fallbackSync(
  type: CompilationType,
  source: string,
  options?: Record<string, unknown>,
): unknown {
  if (!window.SvgPathExtended) {
    throw new Error('SvgPathExtended library not loaded');
  }

  switch (type) {
    case 'compile':
      return window.SvgPathExtended.compile(source, options);
    case 'compileAnnotated':
      return window.SvgPathExtended.compileAnnotated(source);
    case 'compileWithContext':
      return window.SvgPathExtended.compileWithContext(source, options);
    default:
      throw new Error(`Unknown compilation type: ${type}`);
  }
}

/**
 * Compile source code to SVG path
 * @param source - The source code
 * @param compilationId - Current compilation ID
 * @param isStale - Function to check staleness
 * @param options - Compilation options (e.g. { toFixed: 2 })
 * @returns Promise resolving to compilation result
 */
export function compile(
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return sendRequest('compile', source, compilationId, isStale, options);
}

/**
 * Compile source code to annotated output
 * @param source - The source code
 * @param compilationId - Current compilation ID
 * @param isStale - Function to check staleness
 * @returns Promise resolving to annotated compilation result
 */
export function compileAnnotated(
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
): Promise<unknown> {
  return sendRequest('compileAnnotated', source, compilationId, isStale);
}

/**
 * Compile source code with context tracking
 * @param source - The source code
 * @param compilationId - Current compilation ID
 * @param isStale - Function to check staleness
 * @param options - Compilation options (e.g. { toFixed: 2 })
 * @returns Promise resolving to context compilation result
 */
export function compileWithContext(
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return sendRequest('compileWithContext', source, compilationId, isStale, options);
}

/**
 * Check if the worker is available
 * @returns Whether a worker is available
 */
export function isWorkerAvailable(): boolean {
  return worker !== null || typeof Worker !== 'undefined';
}

export default {
  compile,
  compileAnnotated,
  compileWithContext,
  terminateWorker,
  isWorkerAvailable,
};
