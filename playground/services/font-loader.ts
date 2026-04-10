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
  // Use a User-Agent that triggers TTF format from Google Fonts
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    headers: {
      // Safari UA triggers .ttf format (most compatible for opentype.js)
      'User-Agent': 'Safari/537.36',
    },
  });

  if (!cssRes.ok) {
    throw new Error(`Google Fonts CSS fetch failed: ${cssRes.status}`);
  }

  const css = await cssRes.text();

  // Extract the font URL from the @font-face rule
  const srcMatch = css.match(/src:\s*url\(([^)]+)\)/);
  if (!srcMatch) {
    throw new Error(`Could not extract font URL from Google Fonts CSS for ${family}`);
  }

  const fontUrl = srcMatch[1];

  // Fetch the font binary
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) {
    throw new Error(`Font binary fetch failed: ${fontRes.status}`);
  }

  return fontRes.arrayBuffer();
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
 * Scans @font directives and font-family in style blocks.
 */
export function extractFontReferences(source: string): { family: string; weight?: number }[] {
  const refs: Map<string, { family: string; weight?: number }> = new Map();

  // Scan for @font "family" [weight]
  const fontDirectiveRe = /@font\s+["']([^"']+)["']\s*(\d+)?/g;
  let match;
  while ((match = fontDirectiveRe.exec(source)) !== null) {
    const family = match[1];
    const weight = match[2] ? parseInt(match[2], 10) : undefined;
    const key = `${family}:${weight || 400}`;
    if (!refs.has(key)) {
      refs.set(key, { family, weight });
    }
  }

  // Scan for font-family in style blocks
  const fontFamilyRe = /font-family:\s*([^;}\n]+)/g;
  while ((match = fontFamilyRe.exec(source)) !== null) {
    const raw = match[1].trim();
    // Extract first family name
    const first = raw.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (first && !GENERIC_FONT_FAMILIES.has(first)) {
      const key = `${first}:400`;
      if (!refs.has(key)) {
        refs.set(key, { family: first });
      }
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
