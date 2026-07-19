// Font Loader Service
// Fetches font binaries from Google Fonts and caches them for compilation

import { isKnownGoogleFont } from '../utils/google-fonts.js';

export interface FontBinaryEntry {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  buffer: ArrayBuffer;
}

export interface FontResolutionFailure {
  family: string;
  weight: number;
  reason: string;
}

export interface FontResolutionResult {
  binaries: FontBinaryEntry[];
  failures: FontResolutionFailure[];
}

type FontFetchOutcome =
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; reason: string };

// CSS generic font families — not fetchable from Google Fonts
const GENERIC_FONT_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  'emoji', 'math', 'fangsong',
]);

// Legacy file-path @font directives register fonts under the filename stem
// (e.g. `@font "../fonts/Raleway-Bold.ttf"` → family `Raleway-Bold`). Style
// blocks in those samples reference the same literal name. Such names are
// not Google Fonts families — skip them so we don't emit failing fetches.
const LEGACY_FILENAME_FAMILY = /-(?:Thin|ExtraLight|UltraLight|Light|Regular|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy|Italic|Oblique)$/;

// Cache: "family:weight" → ArrayBuffer (only successful fetches are cached)
const fontBinaryCache: Map<string, ArrayBuffer> = new Map();

// In-flight fetch dedup: "family:weight" → Promise<FontFetchOutcome>
const pendingFetches: Map<string, Promise<FontFetchOutcome>> = new Map();

/**
 * Fetch a font binary from Google Fonts CDN.
 *
 * Returns a tagged outcome: `{ ok: true, buffer }` on success or
 * `{ ok: false, reason }` on every recoverable failure (CSS fetch error,
 * URL extraction failure, binary fetch error, WOFF2 decode error). Errors
 * are reported up the stack rather than silently swallowed so the caller
 * can surface them to the user instead of letting compilation continue
 * with an empty registry and produce a misleading downstream error.
 *
 * Successful results are cached for the session; failures are not, so a
 * subsequent compile re-attempts the fetch.
 */
export async function fetchFontBinary(
  family: string,
  weight: number = 400,
): Promise<FontFetchOutcome> {
  // Skip CSS generic font families — these are not real fonts on Google Fonts
  if (GENERIC_FONT_FAMILIES.has(family)) {
    return { ok: false, reason: `'${family}' is a CSS generic family and cannot be fetched from Google Fonts` };
  }

  const cacheKey = `${family}:${weight}`;

  // Check cache
  const cached = fontBinaryCache.get(cacheKey);
  if (cached) {
    return { ok: true, buffer: cached };
  }

  // Dedup in-flight fetches
  const inflight = pendingFetches.get(cacheKey);
  if (inflight) return inflight;

  const fetchPromise = (async (): Promise<FontFetchOutcome> => {
    try {
      const buffer = await fetchFontBinaryUncached(family, weight);
      fontBinaryCache.set(cacheKey, buffer);
      return { ok: true, buffer };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    } finally {
      pendingFetches.delete(cacheKey);
    }
  })();

  pendingFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

async function fetchFontBinaryUncached(
  family: string,
  weight: number,
): Promise<ArrayBuffer> {
  // Browsers ignore custom User-Agent headers in fetch (per Fetch spec
  // forbidden-header rules), so Google Fonts always returns multi-block
  // WOFF2 for browser UAs. We pick the latin block (ASCII glyphs) and
  // decompress WOFF2 → TTF on the fly via wawoff2 — opentype.js v1 cannot
  // parse WOFF2 directly.
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl);

  if (!cssRes.ok) {
    throw new Error(`Google Fonts CSS fetch failed: ${cssRes.status}`);
  }

  const css = await cssRes.text();

  const fontUrl = extractFontUrlFromGoogleFontsCss(css);
  if (!fontUrl) {
    throw new Error(`Could not extract font URL from Google Fonts CSS for ${family}`);
  }

  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) {
    throw new Error(`Font binary fetch failed: ${fontRes.status}`);
  }

  let buffer = await fontRes.arrayBuffer();
  if (isWoff2(buffer)) {
    try {
      buffer = await decompressWoff2(buffer);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`WOFF2 decode failed: ${detail}`);
    }
  }
  return buffer;
}

/**
 * Pick a usable font URL from a Google Fonts CSS response.
 *
 * Google Fonts splits a single weight into multiple `@font-face` blocks, one
 * per Unicode subset (latin, latin-ext, cyrillic, vietnamese, …). We prefer
 * the latin block since that's where ASCII glyphs live; if no labeled block
 * matches, we fall back to the first `url(...)` in the document.
 */
export function extractFontUrlFromGoogleFontsCss(css: string): string | null {
  const latinMatch = css.match(/\/\*\s*latin\s*\*\/[\s\S]*?url\(([^)]+)\)/);
  if (latinMatch) return latinMatch[1];
  const anyMatch = css.match(/src:[^;]*url\(([^)]+)\)/);
  return anyMatch ? anyMatch[1] : null;
}

function isWoff2(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  // WOFF2 magic: 'wOF2' = 0x77 0x4F 0x46 0x32
  return view[0] === 0x77 && view[1] === 0x4F && view[2] === 0x46 && view[3] === 0x32;
}

let _decompressWoff2: ((bytes: Uint8Array | ArrayBuffer) => Promise<Uint8Array>) | null = null;

async function decompressWoff2(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (!_decompressWoff2) {
    // Lazy-load the WOFF2 decoder (~290KB, Emscripten WebAssembly inlined).
    // Path is relative to the transpiled output at public/pathogen/services/.
    // Variable specifier + @vite-ignore keeps vitest's jsdom transform from
    // resolving the vendor bundle, which only exists in the build output.
    const vendorPath = '../vendor/woff2-decompress.js';
    const mod = await import(/* @vite-ignore */ vendorPath);
    _decompressWoff2 = (mod as { default: (bytes: Uint8Array | ArrayBuffer) => Promise<Uint8Array> }).default;
  }
  const ttf = await _decompressWoff2(new Uint8Array(buffer));
  return ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength);
}

/**
 * Resolve font binaries for a set of font families.
 *
 * Fetches all in parallel and partitions outcomes into `binaries`
 * (successful loads) and `failures` (per-family error reasons). The
 * caller surfaces failures to the user — silently dropping them caused
 * `PathBlock.fromGlyph()` to throw a misleading "requires font data"
 * error when the actual root cause was a fetch / WOFF2 decode error.
 */
export async function resolveFontBinaries(
  families: { family: string; weight?: number }[],
): Promise<FontResolutionResult> {
  const binaries: FontBinaryEntry[] = [];
  const failures: FontResolutionFailure[] = [];

  await Promise.all(
    families.map(async ({ family, weight = 400 }) => {
      const outcome = await fetchFontBinary(family, weight);
      if (outcome.ok) {
        binaries.push({ family, weight, style: 'normal', buffer: outcome.buffer });
      } else {
        failures.push({ family, weight, reason: outcome.reason });
      }
    }),
  );

  return { binaries, failures };
}

/**
 * Extract font families referenced in source code.
 * Scans @font directives and style blocks (`${ font-family: ...; font-weight: ...; }`).
 *
 * Unknown families are filtered out (see `isKnownGoogleFont`). The playground
 * recompiles after every keystroke, so a user typing a font name in the
 * picker — `Joseph`, `Josephi`, `Josephin`, … — would otherwise send a fetch
 * per partial value to Google's CDN. The check is applied to both @font
 * directives and style-block `font-family:` values; legitimate unknown @font
 * directives are silently dropped rather than fetched, since the picker is
 * the authoritative font source for users.
 */
export function extractFontReferences(source: string): { family: string; weight?: number }[] {
  const refs: Map<string, { family: string; weight?: number }> = new Map();

  // Scan for @font "family" [weight]. Skip file-path forms (e.g.
  // `@font "../fonts/Foo.ttf"`) — those are loaded by the host, not Google Fonts.
  const fontDirectiveRe = /@font\s+["']([^"']+)["']\s*(\d+)?/g;
  let match;
  while ((match = fontDirectiveRe.exec(source)) !== null) {
    const family = match[1];
    if (family.includes('/') || family.includes('\\') || family.endsWith('.ttf') || family.endsWith('.otf') || family.endsWith('.woff') || family.endsWith('.woff2')) continue;
    if (!isKnownGoogleFont(family)) continue;
    const weight = match[2] ? parseInt(match[2], 10) : undefined;
    const key = `${family}:${weight ?? 400}`;
    if (!refs.has(key)) {
      refs.set(key, { family, weight });
    }
  }

  // Scan style blocks (`${ ... }`) for font-family paired with font-weight in
  // the same block. Style blocks may not be perfectly delimited by `}` if
  // nested expressions appear, but in practice Pathogen style blocks contain
  // only flat property declarations, so a simple non-greedy match is safe.
  const styleBlockRe = /\$\{([^}]*)\}/g;
  while ((match = styleBlockRe.exec(source)) !== null) {
    const block = match[1];
    const familyMatch = block.match(/font-family:\s*([^;\n]+)/);
    if (!familyMatch) continue;
    const first = familyMatch[1].trim().split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!first) continue;
    if (GENERIC_FONT_FAMILIES.has(first)) continue;
    if (LEGACY_FILENAME_FAMILY.test(first)) continue;
    if (!isKnownGoogleFont(first)) continue;

    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const weight = weightMatch ? parseInt(weightMatch[1], 10) : undefined;

    const key = `${first}:${weight ?? 400}`;
    if (!refs.has(key)) {
      refs.set(key, weight !== undefined ? { family: first, weight } : { family: first });
    }
  }

  return Array.from(refs.values());
}

/**
 * Extract families from `@font` directives that look well-formed (proper
 * quotes, not a file path) but are NOT in the curated Google Fonts list.
 *
 * `extractFontReferences` silently drops these to avoid per-keystroke CDN
 * requests as the font picker types. That's the right call for the fetch
 * path, but it leaves a user who hand-types `@font "MadeUp" 400;` with no
 * feedback at all. This helper lets the resolver surface those as compile
 * failures with a clear message ("Unknown Google Font: …") while preserving
 * the no-fetch property.
 *
 * Style-block `font-family:` values are deliberately excluded — they're the
 * picker's live-typing target, and reporting each transient partial would
 * fire an error on every keystroke. The picker is the authoritative source
 * for style-block fonts; `@font` is the user's explicit assertion that
 * deserves explicit feedback.
 */
export function extractUnknownFontDirectiveFamilies(
  source: string,
): { family: string; weight?: number }[] {
  const seen: Map<string, { family: string; weight?: number }> = new Map();
  const fontDirectiveRe = /@font\s+["']([^"']+)["']\s*(\d+)?/g;
  let match;
  while ((match = fontDirectiveRe.exec(source)) !== null) {
    const family = match[1];
    if (
      family.includes('/') ||
      family.includes('\\') ||
      family.endsWith('.ttf') ||
      family.endsWith('.otf') ||
      family.endsWith('.woff') ||
      family.endsWith('.woff2')
    ) continue;
    if (isKnownGoogleFont(family)) continue;
    const weight = match[2] ? parseInt(match[2], 10) : undefined;
    const key = `${family}:${weight ?? 0}`;
    if (!seen.has(key)) {
      seen.set(key, weight !== undefined ? { family, weight } : { family });
    }
  }
  return Array.from(seen.values());
}

/**
 * Check if a font binary is already cached.
 */
export function isFontCached(family: string, weight: number = 400): boolean {
  return fontBinaryCache.has(`${family}:${weight}`);
}

/**
 * Serialize font binaries as CSS @font-face declarations with inline
 * data URIs. The compiled SVG renders inside a sandboxed iframe whose
 * CSP forbids external font requests (`font-src data:` only); injecting
 * these rules into the iframe's <head> is the only way for the browser
 * to resolve `font-family` on rendered <text> elements.
 *
 * See playground/components/svg-preview-pane.ts for the injection point.
 */
export function fontBinariesToCss(entries: FontBinaryEntry[]): string {
  return entries
    .map((e) => {
      const b64 = arrayBufferToBase64(e.buffer);
      return `@font-face {
  font-family: "${escapeFontFamily(e.family)}";
  font-weight: ${e.weight};
  font-style: ${e.style};
  font-display: swap;
  src: url("data:font/ttf;base64,${b64}") format("truetype");
}`;
    })
    .join('\n');
}

/**
 * Escape a font family name for embedding inside a double-quoted CSS string.
 * Real Google Fonts names use only letters, digits, spaces, and dashes, but
 * a defensive escape protects against accidental quote injection via
 * `@font "..." ...` directives or style-block values. Control characters
 * (\n, \r, \0) would terminate the CSS string literal so they are stripped.
 */
function escapeFontFamily(family: string): string {
  return family
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n\0]/g, '');
}

/**
 * Convert an ArrayBuffer to a base64 string in chunks. A naive
 * `String.fromCharCode(...new Uint8Array(buffer))` blows the call stack
 * on font files larger than ~64KB. Process in 32KB chunks instead.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

/**
 * Get the number of cached font binaries.
 */
export function getCacheSize(): number {
  return fontBinaryCache.size;
}
