// Compiler Worker Manager
// Manages Web Worker for async compilation with fallback to sync

import {
  extractFontReferences,
  extractUnknownFontDirectiveFamilies,
  resolveFontBinaries,
} from './font-loader.js';
import type { FontBinaryEntry, FontResolutionResult } from './font-loader.js';

declare const window: Window & { PathogenLang?: Record<string, Function> };

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
    // The <base href="/pathogen-lang/"> tag in production makes this work correctly
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

  // Fall back to sync if worker unavailable. Font buffers must be threaded
  // through the fallback too — silently dropping them here was the cause of
  // a misleading "PathBlock.fromGlyph() requires font data" error when the
  // worker failed to init (e.g. sandboxed-iframe context, CSP block).
  if (!w) {
    return fallbackSync(type, source, options, fontBuffers);
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
      // Clone each cached buffer before transferring. The font-loader cache
      // (services/font-loader.ts) stores the ArrayBuffer reference; after
      // postMessage detaches it, the next compile's postMessage would throw
      // "ArrayBuffer at index 0 is already detached". Slicing yields a fresh
      // buffer per request, leaving the cached copy intact.
      const clonedEntries = fontBuffers.map((fb) => ({ ...fb, buffer: fb.buffer.slice(0) }));
      message.fontBuffers = clonedEntries;
      const transferables = clonedEntries.map((fb) => fb.buffer);
      w.postMessage(message, transferables);
    } else {
      w.postMessage(message);
    }
  });
}

let _fallbackWarned = false;

/**
 * Fallback to synchronous compilation using the global library.
 *
 * Builds a FontRegistry from any provided fontBuffers and passes it as
 * `options.fonts` so the evaluator can resolve `PathBlock.fromGlyph()`
 * against the same fonts the worker would have used. Without this,
 * sandboxed-iframe / CSP-restricted environments where the Worker fails
 * to init silently dropped fonts, surfacing as "requires font data".
 */
async function fallbackSync(
  type: CompilationType,
  source: string,
  options?: Record<string, unknown>,
  fontBuffers?: FontBinaryEntry[],
): Promise<unknown> {
  const lib = window.PathogenLang;
  if (!lib) {
    throw new Error('PathogenLang library not loaded');
  }

  if (!_fallbackWarned) {
    console.warn(
      '[compiler-worker] Web Worker unavailable; using main-thread sync fallback. ' +
        'Compiles will block the UI thread.',
    );
    _fallbackWarned = true;
  }

  let compileOptions = options;
  if (fontBuffers && fontBuffers.length > 0) {
    if (typeof lib.createFontRegistry !== 'function' || typeof lib.addFont !== 'function') {
      throw new Error(
        'PathogenLang global is missing font registry helpers; rebuild with `npm run build`.',
      );
    }
    if (typeof lib.ensureOpentype === 'function') {
      // opentype.js is lazy-loaded by the evaluator; the worker normally
      // takes care of this. In the main-thread fallback we await it once
      // so the synchronous getOpentype() call inside the evaluator
      // doesn't throw "opentype.js not loaded".
      await lib.ensureOpentype();
    }
    const registry = lib.createFontRegistry();
    for (const fb of fontBuffers) {
      lib.addFont(registry, fb.family, fb.weight, fb.style, fb.buffer);
    }
    compileOptions = { ...(options ?? {}), fonts: registry };
  }

  switch (type) {
    case 'compile':
      return lib.compile(source, compileOptions);
    case 'compileAnnotated':
      return lib.compileAnnotated(source);
    case 'compileWithContext':
      return lib.compileWithContext(source, compileOptions);
    default:
      throw new Error(`Unknown compilation type: ${type}`);
  }
}

/**
 * Resolve font binaries from source code before compilation.
 * Only fetches fonts that aren't already cached. Per-font failures are
 * collected in `failures` (not thrown) so the caller can decide how to
 * surface them — see `compile` / `compileWithContext` below, which
 * promote them to a compilation error.
 *
 * Three failure modes are detected here without ever hitting the network:
 *
 * 1. **Unknown directive family**: `@font "MadeUp"` parses fine but the
 *    family isn't in the curated Google Fonts list. We surface this as a
 *    "Unknown Google Font: …" failure so the user sees feedback instead
 *    of a silent drop.
 * 2. **Malformed directive**: source mentions `@font` but neither
 *    `extractFontReferences` nor `extractUnknownFontDirectiveFamilies`
 *    matched (hidden NBSP / zero-width chars, missing quotes, etc.).
 *    Surfaced as the legacy "not recognized" failure.
 * 3. **Fetch failure**: a well-formed known family fails to resolve at
 *    the CDN — handled inside `resolveFontBinaries`.
 */
async function resolveFontsForSource(source: string): Promise<FontResolutionResult> {
  const refs = extractFontReferences(source);
  const unknownDirectives = extractUnknownFontDirectiveFamilies(source);

  const unknownFailures = unknownDirectives.map((u) => ({
    family: u.family,
    weight: u.weight ?? 0,
    reason:
      `Unknown Google Font: "${u.family}"${u.weight !== undefined ? ` ${u.weight}` : ''}. ` +
      `Open the font picker (click the font-family value in the inspector) for the supported list.`,
  }));

  if (refs.length === 0 && unknownFailures.length === 0) {
    if (/@font\b/.test(source)) {
      const sample = (source.match(/@font[^\n]{0,80}/) ?? [''])[0].trim();
      return {
        binaries: [],
        failures: [
          {
            family: '(unrecognized @font)',
            weight: 0,
            reason:
              `Source contains an @font directive but it was not recognized. ` +
              `Expected: @font "Family Name" 400; — got: ${sample}. ` +
              `Check for hidden characters (NBSP, zero-width space) or missing quotes around the family name.`,
          },
        ],
      };
    }
    return { binaries: [], failures: [] };
  }

  if (refs.length === 0) {
    return { binaries: [], failures: unknownFailures };
  }

  const resolved = await resolveFontBinaries(refs);
  return {
    binaries: resolved.binaries,
    failures: [...unknownFailures, ...resolved.failures],
  };
}

/**
 * Format a list of font-resolution failures as a multi-line error message
 * suitable for the playground error panel.
 *
 * Policy: any failure aborts the compile rather than rendering a partial
 * SVG with missing glyphs. A program declaring `@font "X"` has explicitly
 * asked for X; silently dropping X (the previous behavior) produced a
 * misleading downstream "PathBlock.fromGlyph() requires font data" error
 * far from the actual cause. Fail at the resolution boundary instead.
 */
function formatFontFailures(failures: FontResolutionResult['failures']): string {
  const lines = failures.map((f) => `  - ${f.family} ${f.weight}: ${f.reason}`).join('\n');
  return `Failed to load fonts referenced by @font directive:\n${lines}`;
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
  const { binaries, failures } = await resolveFontsForSource(source);
  if (failures.length > 0) {
    throw new Error(formatFontFailures(failures));
  }
  const result = await sendRequest('compile', source, compilationId, isStale, options, binaries);
  return attachFontBinaries(result, binaries);
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
  const { binaries, failures } = await resolveFontsForSource(source);
  if (failures.length > 0) {
    throw new Error(formatFontFailures(failures));
  }
  const result = await sendRequest('compileWithContext', source, compilationId, isStale, options, binaries);
  return attachFontBinaries(result, binaries);
}

/**
 * Attach the host-side font binaries to the compile result so the preview
 * iframe can inject them as `@font-face` data URIs (see
 * playground/components/svg-preview-pane.ts).
 *
 * The binaries here are the cached references (not the transferred copies);
 * the host always keeps the originals, so reading them post-compile is safe.
 */
function attachFontBinaries(result: unknown, binaries: FontBinaryEntry[]): unknown {
  if (result && typeof result === 'object') {
    (result as { fontBinaries?: FontBinaryEntry[] }).fontBinaries = binaries;
  }
  return result;
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
