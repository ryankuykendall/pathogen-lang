// Compiler Worker Manager
// Manages Web Worker for async compilation with fallback to sync

import { extractFontReferences, resolveFontBinaries } from './font-loader.js';
import type { FontBinaryEntry } from './font-loader.js';

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
 * Send a compilation request to the worker, optionally with font buffers.
 * Font buffers are transferred (zero-copy) to the worker.
 */
async function sendRequest(
  type: CompilationType,
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
  fontBuffers?: FontBinaryEntry[],
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

    const message: Record<string, unknown> = { id, type, source, options };
    if (fontBuffers && fontBuffers.length > 0) {
      message.fontBuffers = fontBuffers;
      // Transfer ArrayBuffers for zero-copy
      const transferables = fontBuffers.map((fb) => fb.buffer);
      w.postMessage(message, transferables);
    } else {
      w.postMessage(message);
    }
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
 * Resolve font binaries from source code before compilation.
 * Only fetches fonts that aren't already cached.
 */
async function resolveFontsForSource(source: string): Promise<FontBinaryEntry[]> {
  const refs = extractFontReferences(source);
  if (refs.length === 0) return [];

  try {
    return await resolveFontBinaries(refs);
  } catch (err) {
    console.warn('[compiler-worker] Font resolution failed:', err);
    return [];
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
export async function compile(
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
): Promise<unknown> {
  const fontBuffers = await resolveFontsForSource(source);
  return sendRequest('compile', source, compilationId, isStale, options, fontBuffers);
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
export async function compileWithContext(
  source: string,
  compilationId: number,
  isStale: ((id: number) => boolean) | undefined,
  options?: Record<string, unknown>,
): Promise<unknown> {
  const fontBuffers = await resolveFontsForSource(source);
  return sendRequest('compileWithContext', source, compilationId, isStale, options, fontBuffers);
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
