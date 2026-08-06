// Chrome-font embedding for SVG exports: the legend/watermark's Baumans,
// Inter, and Inconsolata subsets, fetched from Google Fonts and inlined as
// base64 @font-face rules. Extracted from export-modal.ts so the breadcrumb
// size estimate and the actual download share one code path (and one cache).
//
// Note this covers only the export *chrome* fonts — artwork fonts
// (result.fontBinaries) are not embedded by SVG export today.

const SVG_NS = 'http://www.w3.org/2000/svg';

const CHROME_FONTS = [
  {
    family: 'Baumans',
    url: `https://fonts.googleapis.com/css2?family=Baumans&text=${encodeURIComponent('pathogen.studio')}`,
  },
  {
    // Just the brand line's prefix — the rest of the legend's Inter
    // text keeps the system-sans fallback, as before.
    family: 'Inter',
    url: `https://fonts.googleapis.com/css2?family=Inter&text=${encodeURIComponent('Created in')}`,
  },
  {
    family: 'Inconsolata',
    url: `https://fonts.googleapis.com/css2?family=Inconsolata&text=${encodeURIComponent(
      ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
    )}`,
  },
];

// Session cache of finished @font-face rule strings, keyed by family.
// Only successes are cached; a failed family is retried on the next fetch.
const fontCache: Record<string, string> = {};

/**
 * Resolve the chrome @font-face rules, fetching any family not yet in the
 * session cache. A family whose fetch fails is warned about and omitted
 * (the export still succeeds, slightly smaller).
 */
export async function fetchChromeFontRules(): Promise<string[]> {
  const fontFaceRules: string[] = [];

  for (const font of CHROME_FONTS) {
    try {
      // Check session cache
      if (fontCache[font.family]) {
        fontFaceRules.push(fontCache[font.family]);
        continue;
      }

      // Fetch CSS from Google Fonts
      const cssRes = await fetch(font.url);
      if (!cssRes.ok) throw new Error(`CSS fetch failed: ${cssRes.status}`);
      const css = await cssRes.text();

      // Extract src url and format from @font-face rule
      const srcMatch = /src:\s*url\(([^)]+)\)\s*format\(['"]([^'"]+)['"]\)/.exec(css);
      if (!srcMatch) throw new Error('Could not parse font CSS');

      const fontUrl = srcMatch[1];
      const fontFormat = srcMatch[2];

      // Fetch font binary
      const fontRes = await fetch(fontUrl);
      if (!fontRes.ok) throw new Error(`Font fetch failed: ${fontRes.status}`);
      const buffer = await fontRes.arrayBuffer();

      // Convert to base64 using chunked approach to avoid call stack limits
      const bytes = new Uint8Array(buffer);
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      const b64 = btoa(binary);

      // Determine MIME type
      const mime = fontFormat === 'woff2' ? 'font/woff2' : 'font/ttf';

      // Build @font-face rule with data URI
      const rule = `@font-face {\n  font-family: '${font.family}';\n  src: url(data:${mime};base64,${b64}) format('${fontFormat}');\n}`;

      fontCache[font.family] = rule;
      fontFaceRules.push(rule);
    } catch (err: unknown) {
      console.warn(`Font embedding failed for ${font.family}:`, err);
    }
  }

  return fontFaceRules;
}

/** Inject @font-face rules as one <style> inside <defs> (created if missing). */
export function injectFontRules(svg: SVGElement, rules: string[]): void {
  if (rules.length === 0) return;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const styleEl = document.createElementNS(SVG_NS, 'style');
  styleEl.textContent = rules.join('\n');
  defs.appendChild(styleEl);
}

// --- Single-flight access for per-compile callers (breadcrumb size) ---
// The size estimate recomputes on every compile; it must never turn each
// keystroke into a fetch storm. One background fetch attempt per session;
// afterwards the live cache is read directly, so a later modal download
// that fills in a failed family is picked up on the next recompute.

let attempted = false;
let inflight: Promise<string[]> | null = null;

function cachedRules(): string[] {
  return CHROME_FONTS.map((font) => fontCache[font.family]).filter(Boolean);
}

/**
 * The chrome font rules if already resolved (fully cached, or the session's
 * one background fetch has settled); null while unresolved.
 */
export function getChromeFontRulesIfReady(): string[] | null {
  if (inflight) return null;
  const rules = cachedRules();
  if (attempted || rules.length === CHROME_FONTS.length) return rules;
  return null;
}

/** Kick off (or join) the session's single background fetch of the rules. */
export async function ensureChromeFontRules(): Promise<string[]> {
  if (!attempted && !inflight) {
    inflight = fetchChromeFontRules().finally(() => {
      attempted = true;
      inflight = null;
    });
  }
  return inflight ?? cachedRules();
}
