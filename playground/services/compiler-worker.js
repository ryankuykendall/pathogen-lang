// Compiler Worker Manager
// Manages Web Worker for async compilation with fallback to sync

let worker = null;
let requestId = 0;
const pendingRequests = new Map();

/**
 * Initialize the worker lazily
 */
function initWorker() {
  if (worker) return worker;

  try {
    // Worker path is relative to the document's base URL
    // The <base href="/svg-path-extended/"> tag in production makes this work correctly
    // In dev (playground/index.html), we need the ../ prefix
    // In production build, the base tag handles the path
    const isDevPlayground = window.location.pathname.includes('/playground/');
    const workerPath = isDevPlayground ? '../dist/worker.worker.js' : 'dist/worker.worker.js';

    worker = new Worker(workerPath);

    worker.onmessage = (event) => {
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

    worker.onerror = (event) => {
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
export function terminateWorker() {
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
 * @param {string} type - 'compile', 'compileAnnotated', or 'compileWithContext'
 * @param {string} source - The source code to compile
 * @param {number} compilationId - The compilation ID to check for staleness
 * @param {function} isStale - Function to check if this request is stale
 * @param {object} [options] - Compilation options (e.g. { toFixed: 2 })
 * @returns {Promise<any>} The compilation result
 */
async function sendRequest(type, source, compilationId, isStale, options) {
  const w = initWorker();

  // Fall back to sync if worker unavailable
  if (!w) {
    return fallbackSync(type, source, options);
  }

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (result) => {
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
function fallbackSync(type, source, options) {
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
 * @param {string} source - The source code
 * @param {number} compilationId - Current compilation ID
 * @param {function} isStale - Function to check staleness
 * @param {object} [options] - Compilation options (e.g. { toFixed: 2 })
 * @returns {Promise<string>}
 */
export function compile(source, compilationId, isStale, options) {
  return sendRequest('compile', source, compilationId, isStale, options);
}

/**
 * Compile source code to annotated output
 * @param {string} source - The source code
 * @param {number} compilationId - Current compilation ID
 * @param {function} isStale - Function to check staleness
 * @returns {Promise<string>}
 */
export function compileAnnotated(source, compilationId, isStale) {
  return sendRequest('compileAnnotated', source, compilationId, isStale);
}

/**
 * Compile source code with context tracking
 * @param {string} source - The source code
 * @param {number} compilationId - Current compilation ID
 * @param {function} isStale - Function to check staleness
 * @param {object} [options] - Compilation options (e.g. { toFixed: 2 })
 * @returns {Promise<{path: string, context: object, logs: array}>}
 */
export function compileWithContext(source, compilationId, isStale, options) {
  return sendRequest('compileWithContext', source, compilationId, isStale, options);
}

/**
 * Check if the worker is available
 * @returns {boolean}
 */
export function isWorkerAvailable() {
  return worker !== null || typeof Worker !== 'undefined';
}

export default {
  compile,
  compileAnnotated,
  compileWithContext,
  terminateWorker,
  isWorkerAvailable,
};
