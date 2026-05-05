// Font Loader Service
// Fetches font binaries from Google Fonts and caches them for compilation

export interface FontBinaryEntry {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  buffer: ArrayBuffer;
}

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

// Cache: "family:weight" → ArrayBuffer
const fontBinaryCache: Map<string, ArrayBuffer> = new Map();

// In-flight fetch dedup: "family:weight" → Promise<ArrayBuffer>
const pendingFetches: Map<string, Promise<ArrayBuffer>> = new Map();

/**
 * Fetch a font binary from Google Fonts CDN.
 * Uses the proven pattern: fetch CSS with TTF-triggering User-Agent, extract URL, fetch binary.
 * Caches results so each font is only fetched once per session.
 */
export async function fetchFontBinary(
  family: string,
  weight: number = 400,
): Promise<ArrayBuffer | null> {
  // Skip CSS generic font families — these are not real fonts on Google Fonts
  if (GENERIC_FONT_FAMILIES.has(family)) {
    return null;
  }

  const cacheKey = `${family}:${weight}`;

  // Check cache
  if (fontBinaryCache.has(cacheKey)) {
    return fontBinaryCache.get(cacheKey)!;
  }

  // Dedup in-flight fetches
  if (pendingFetches.has(cacheKey)) {
    return pendingFetches.get(cacheKey)!;
  }

  const fetchPromise = fetchFontBinaryUncached(family, weight);
  pendingFetches.set(cacheKey, fetchPromise);

  try {
    const buffer = await fetchPromise;
    fontBinaryCache.set(cacheKey, buffer);
    return buffer;
  } catch (err) {
    console.warn(`[font-loader] Failed to fetch font ${family}:${weight}:`, err);
    return null;
  } finally {
    pendingFetches.delete(cacheKey);
  }
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
    buffer = await decompressWoff2(buffer);
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
    const mod = await import('../vendor/woff2-decompress.js' as string);
    _decompressWoff2 = (mod as { default: (bytes: Uint8Array | ArrayBuffer) => Promise<Uint8Array> }).default;
  }
  const ttf = await _decompressWoff2(new Uint8Array(buffer));
  return ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength);
}

/**
 * Resolve font binaries for a set of font families.
 * Returns an array of FontBinaryEntry for all successfully loaded fonts.
 */
export async function resolveFontBinaries(
  families: { family: string; weight?: number }[],
): Promise<FontBinaryEntry[]> {
  const results: FontBinaryEntry[] = [];

  // Fetch all in parallel
  const promises = families.map(async ({ family, weight = 400 }) => {
    const buffer = await fetchFontBinary(family, weight);
    if (buffer) {
      results.push({ family, weight, style: 'normal', buffer });
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Extract font families referenced in source code.
 * Scans @font directives and style blocks (`${ font-family: ...; font-weight: ...; }`).
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
 * Check if a font binary is already cached.
 */
export function isFontCached(family: string, weight: number = 400): boolean {
  return fontBinaryCache.has(`${family}:${weight}`);
}

/**
 * Get the number of cached font binaries.
 */
export function getCacheSize(): number {
  return fontBinaryCache.size;
}
