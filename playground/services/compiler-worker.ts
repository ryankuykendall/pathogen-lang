// Compiler Worker Manager
// Manages Web Worker for async compilation with fallback to sync

import {
  extractFontReferences,
  extractFontReferencesFromCompileResult,
  extractUnknownFontDirectiveFamilies,
  fetchFontSubsetsForChars,
  getFetchedSubsetEntries,
  resolveFontBinaries,
} from './font-loader.js';
import type {
  FontBinaryEntry,
  FontResolutionFailure,
  FontResolutionResult,
  FontWeightSubstitution,
} from './font-loader.js';
import { isKnownGoogleFont } from '../utils/google-fonts.js';

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
      lib.addFont(registry, fb.family, fb.weight, fb.style, fb.buffer, fb.unicodeRanges);
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
 * Failure and notice modes detected here:
 *
 * 1. **Unresolvable identifier**: `@font someVar;` where the variable isn't
 *    a top-level string literal. Detected without hitting the network.
 * 2. **Malformed directive**: source mentions `@font` but neither
 *    `extractFontReferences` nor `extractUnknownFontDirectiveFamilies`
 *    matched (hidden NBSP / zero-width chars, missing quotes, etc.).
 *    Surfaced as the legacy "not recognized" failure, no network.
 * 3. **Fetch failure**: any well-formed family that fails to resolve at the
 *    CDN — handled inside `resolveFontBinaries`. For families outside the
 *    curated list the fetch IS the existence probe (css2 serves any
 *    published Google Font); its failure message is rewritten here because
 *    css2 errors are CORS-opaque and can't distinguish "no such font" from
 *    a network failure.
 * 4. **Uncurated success** (notice, non-fatal): a family outside the curated
 *    picker list that Google Fonts served anyway — reported so the user
 *    knows they've left the curated set.
 */
async function resolveFontsForSource(
  source: string,
): Promise<FontResolutionResult & { notices: string[] }> {
  const refs = extractFontReferences(source);
  const unknownDirectives = extractUnknownFontDirectiveFamilies(source);

  const unknownFailures = unknownDirectives
    .filter((u) => u.kind === 'unresolved-identifier')
    .map((u) => ({
      family: u.family,
      weight: u.weight ?? 0,
      reason:
        `@font references variable '${u.family}', which is not a top-level string variable. ` +
        `Declare it at the top level: let ${u.family} = "Family Name";`,
    }));

  // Resolved-but-uncurated families are probed via the normal fetch path
  // (they're already in `refs`); success downgrades to a notice below.
  const uncuratedFamilies = new Set(
    unknownDirectives.filter((u) => u.kind === undefined).map((u) => u.family),
  );

  if (refs.length === 0 && unknownFailures.length === 0) {
    // A well-formed directive that produced neither a ref nor a failure was
    // deliberately skipped (file path, or an identifier resolved to a file
    // path) — only fire the "not recognized" fallback when no directive
    // form matched at all.
    const wellFormed =
      /@font\s+["'][^"']+["']/.test(source) || /@font\s+[A-Za-z_]\w*(?:\s+\d+)?\s*;?/.test(source);
    if (!wellFormed && /@font\b/.test(source)) {
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
        substitutions: [],
        notices: [],
      };
    }
    return { binaries: [], failures: [], substitutions: [], notices: [] };
  }

  if (refs.length === 0) {
    return { binaries: [], failures: unknownFailures, substitutions: [], notices: [] };
  }

  const resolved = await resolveFontBinaries(refs);
  const { notices, failures } = annotateUncuratedResolution(resolved, uncuratedFamilies);

  return {
    binaries: resolved.binaries,
    failures: [...unknownFailures, ...failures],
    substitutions: resolved.substitutions,
    notices,
  };
}

/**
 * Classify the outcome of probing families outside the curated list.
 * Exported for unit tests — this is where the user-facing message text lives.
 *
 * - A loaded uncurated family becomes a non-fatal notice.
 * - An uncurated fetch failure gets its reason rewritten: css2 failures are
 *   CORS-opaque ("Failed to fetch"), so for a family we have no catalog
 *   entry for, a failure means either the font doesn't exist or the network
 *   is down — say so instead of leaking the raw reason. Generic-family
 *   rejections (code: 'generic-family') already carry a precise message.
 */
export function annotateUncuratedResolution(
  resolved: Pick<FontResolutionResult, 'binaries' | 'failures'>,
  uncuratedFamilies: Set<string>,
): { notices: string[]; failures: FontResolutionFailure[] } {
  const notices: string[] = [];
  for (const family of uncuratedFamilies) {
    if (resolved.binaries.some((b) => b.family === family)) {
      notices.push(`"${family}" is not in the curated font list; loaded directly from Google Fonts.`);
    }
  }

  const failures = resolved.failures.map((f) =>
    isKnownGoogleFont(f.family) || f.code === 'generic-family'
      ? f
      : {
          ...f,
          reason:
            `Could not load "${f.family}" from Google Fonts — the font was not found, ` +
            `or the network request failed. Check the spelling against fonts.google.com, ` +
            `or open the font picker for the curated list. (${f.reason})`,
        },
  );

  return { notices, failures };
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
  const { binaries, failures, substitutions, notices } = await resolveFontsForSource(source);
  if (failures.length > 0) {
    throw new Error(formatFontFailures(failures));
  }
  const withSubsets = appendCachedSubsetEntries(binaries);
  const recompile = (bins: FontBinaryEntry[]) =>
    sendRequest('compile', source, compilationId, isStale, options, bins);
  const first = await recompile(withSubsets);
  const glyphPass = await resolveMissingGlyphSubsets(first, recompile, withSubsets);
  const post = await resolvePostCompileFonts(glyphPass.result, glyphPass.binaries);
  return attachFontDiagnostics(glyphPass.result, post.binaries, [...substitutions, ...post.substitutions], notices);
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
  const { binaries, failures, substitutions, notices } = await resolveFontsForSource(source);
  if (failures.length > 0) {
    throw new Error(formatFontFailures(failures));
  }
  const withSubsets = appendCachedSubsetEntries(binaries);
  const recompile = (bins: FontBinaryEntry[]) =>
    sendRequest('compileWithContext', source, compilationId, isStale, options, bins);
  const first = await recompile(withSubsets);
  const glyphPass = await resolveMissingGlyphSubsets(first, recompile, withSubsets);
  const post = await resolvePostCompileFonts(glyphPass.result, glyphPass.binaries);
  return attachFontDiagnostics(glyphPass.result, post.binaries, [...substitutions, ...post.substitutions], notices);
}

/**
 * Include any previously fetched subset slices alongside the primary
 * binaries so steady-state compiles of a CJK program carry full coverage up
 * front and skip the missing-glyph recompile below.
 */
function appendCachedSubsetEntries(binaries: FontBinaryEntry[]): FontBinaryEntry[] {
  const extras: FontBinaryEntry[] = [];
  for (const b of binaries) {
    if (b.subsetUrl) continue; // already a subset slice
    for (const entry of getFetchedSubsetEntries(b.family, b.weight)) {
      const seen = [...binaries, ...extras].some(
        (x) => x.family === entry.family && x.weight === entry.weight && x.subsetUrl === entry.subsetUrl,
      );
      if (!seen) extras.push(entry);
    }
  }
  return extras.length > 0 ? [...binaries, ...extras] : binaries;
}

/**
 * Missing-glyph resolution: the initial load fetches only the primary
 * (latin) slice of a Google Fonts family, but fromGlyph/toPathBlock text is
 * only known at eval time. When a compile reports characters no loaded
 * buffer covers, fetch the unicode-range slices covering them and recompile
 * with the augmented set. Capped at 2 passes and gated on progress (new
 * entries fetched), so a font that genuinely lacks the characters
 * terminates immediately — its result keeps the evaluator's [warn] logs.
 *
 * Exported for unit tests.
 */
export async function resolveMissingGlyphSubsets(
  result: unknown,
  recompile: (binaries: FontBinaryEntry[]) => Promise<unknown>,
  binaries: FontBinaryEntry[],
): Promise<{ result: unknown; binaries: FontBinaryEntry[] }> {
  let currentResult = result;
  let currentBinaries = binaries;

  for (let pass = 0; pass < 2; pass++) {
    if (!currentResult || typeof currentResult !== 'object') break;
    const reports = (currentResult as {
      missingGlyphs?: Array<{ family: string; weight: number; chars: string[] }>;
    }).missingGlyphs;
    if (!Array.isArray(reports) || reports.length === 0) break;

    const newEntries: FontBinaryEntry[] = [];
    for (const report of reports) {
      const { entries } = await fetchFontSubsetsForChars(report.family, report.weight, report.chars);
      for (const entry of entries) {
        const seen = [...currentBinaries, ...newEntries].some(
          (b) => b.family === entry.family && b.weight === entry.weight && b.subsetUrl === entry.subsetUrl,
        );
        if (!seen) newEntries.push(entry);
      }
    }

    if (newEntries.length === 0) break; // nothing fetchable — warnings stand
    currentBinaries = [...currentBinaries, ...newEntries];
    currentResult = await recompile(currentBinaries);
  }

  return { result: currentResult, binaries: currentBinaries };
}

/**
 * Tier-2 font resolution: after a successful compile, extract the *resolved*
 * font-family/font-weight values from the result's layers and fetch any
 * binaries the pre-compile source scan missed (variable- or expression-valued
 * font-family). Per-family failures are silently dropped — these are
 * style-derived references, subject to the same per-keystroke policy as the
 * raw-source style-block scan. No recompile is needed: compile-time font
 * consumers (fromGlyph/toPathBlock) throw when their family is missing, so a
 * compile that succeeded only needs these binaries for iframe @font-face
 * injection.
 */
async function resolvePostCompileFonts(
  result: unknown,
  binaries: FontBinaryEntry[],
): Promise<{ binaries: FontBinaryEntry[]; substitutions: FontWeightSubstitution[] }> {
  if (!result || typeof result !== 'object') return { binaries, substitutions: [] };
  const postRefs = extractFontReferencesFromCompileResult(
    result as { layers?: { styles?: Record<string, string> }[] },
  );
  const missing = postRefs.filter(
    (r) => !binaries.some((b) => b.family === r.family && b.weight === (r.weight ?? 400)),
  );
  if (missing.length === 0) return { binaries, substitutions: [] };
  const extra = await resolveFontBinaries(missing);
  if (extra.failures.length > 0) {
    console.debug('[pathogen] post-compile font fetches failed:', extra.failures);
  }
  return { binaries: [...binaries, ...extra.binaries], substitutions: extra.substitutions };
}

/**
 * Attach the host-side font binaries, weight substitutions, and notices to
 * the compile result: binaries feed the preview iframe's `@font-face` data
 * URIs (see playground/components/svg-preview-pane.ts); substitutions and
 * notices (e.g. "not in the curated font list") feed the non-fatal warning
 * banner in workspace-view.
 *
 * The binaries here are the cached references (not the transferred copies);
 * the host always keeps the originals, so reading them post-compile is safe.
 */
function attachFontDiagnostics(
  result: unknown,
  binaries: FontBinaryEntry[],
  substitutions: FontWeightSubstitution[],
  notices: string[] = [],
): unknown {
  if (result && typeof result === 'object') {
    const r = result as {
      fontBinaries?: FontBinaryEntry[];
      fontSubstitutions?: FontWeightSubstitution[];
      fontNotices?: string[];
    };
    r.fontBinaries = binaries;
    r.fontSubstitutions = substitutions;
    r.fontNotices = notices;
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
