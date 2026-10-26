/**
 * Google Fonts decision logic shared by the Node hosts (CLI, VS Code, LSP).
 *
 * The playground keeps its own copy of the catalog and of the weight rules
 * (playground/utils/google-fonts.ts, playground/services/font-loader.ts):
 * it can only reach shared code through the IIFE bundle, and its fonts are
 * browser slices. tests/host/google-fonts-parity.test.ts fails if the two
 * catalogs or their weight decisions ever differ.
 *
 * Node differs from a browser in one useful way: it can see Google's HTTP
 * status (a browser gets an opaque CORS failure), so "family not found" and
 * "network failed" are told apart here.
 */

export interface GoogleFontEntry {
  family: string;
  category: string;
  variants: number[];
}

/** The playground's curated catalog (~100 families). Keep in step with playground/utils/google-fonts.ts. */
export const CURATED_GOOGLE_FONTS: readonly GoogleFontEntry[] = [
  { family: 'Roboto', category: 'sans-serif', variants: [100, 300, 400, 500, 700, 900] },
  { family: 'Open Sans', category: 'sans-serif', variants: [300, 400, 500, 600, 700, 800] },
  { family: 'Lato', category: 'sans-serif', variants: [100, 300, 400, 700, 900] },
  { family: 'Montserrat', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Inter', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto Condensed', category: 'sans-serif', variants: [300, 400, 700] },
  { family: 'Oswald', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700] },
  { family: 'Noto Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Raleway', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito Sans', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Ubuntu', category: 'sans-serif', variants: [300, 400, 500, 700] },
  { family: 'Rubik', category: 'sans-serif', variants: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Work Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto Mono', category: 'monospace', variants: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Playfair Display', category: 'serif', variants: [400, 500, 600, 700, 800, 900] },
  { family: 'PT Sans', category: 'sans-serif', variants: [400, 700] },
  { family: 'Merriweather', category: 'serif', variants: [300, 400, 700, 900] },
  { family: 'Roboto Slab', category: 'serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Mulish', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Quicksand', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Fira Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Kanit', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Barlow', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Manrope', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Inconsolata', category: 'monospace', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'PT Serif', category: 'serif', variants: [400, 700] },
  { family: 'Libre Franklin', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Noto Serif', category: 'serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Josefin Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Source Sans 3', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Source Code Pro', category: 'monospace', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'DM Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Hind', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Libre Baskerville', category: 'serif', variants: [400, 700] },
  { family: 'Karla', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Cabin', category: 'sans-serif', variants: [400, 500, 600, 700] },
  { family: 'Bitter', category: 'serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Archivo', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Abel', category: 'sans-serif', variants: [400] },
  { family: 'Oxygen', category: 'sans-serif', variants: [300, 400, 700] },
  { family: 'Overpass', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Arimo', category: 'sans-serif', variants: [400, 500, 600, 700] },
  { family: 'Fira Code', category: 'monospace', variants: [300, 400, 500, 600, 700] },
  { family: 'Titillium Web', category: 'sans-serif', variants: [200, 300, 400, 600, 700, 900] },
  { family: 'Heebo', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Asap', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Crimson Text', category: 'serif', variants: [400, 600, 700] },
  { family: 'Cairo', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Outfit', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Space Grotesk', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Space Mono', category: 'monospace', variants: [400, 700] },
  { family: 'Cormorant Garamond', category: 'serif', variants: [300, 400, 500, 600, 700] },
  { family: 'EB Garamond', category: 'serif', variants: [400, 500, 600, 700, 800] },
  { family: 'Exo 2', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Signika', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Maven Pro', category: 'sans-serif', variants: [400, 500, 600, 700, 800, 900] },
  { family: 'Varela Round', category: 'sans-serif', variants: [400] },
  { family: 'Comfortaa', category: 'display', variants: [300, 400, 500, 600, 700] },
  { family: 'Catamaran', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Spectral', category: 'serif', variants: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Sora', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Jost', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Lexend', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'IBM Plex Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', variants: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Bebas Neue', category: 'sans-serif', variants: [400] },
  // Pathogen Studio's own brand face — used by the legend footer and Baumans-titled samples.
  { family: 'Baumans', category: 'display', variants: [400] },
  { family: 'Pacifico', category: 'handwriting', variants: [400] },
  { family: 'Lobster', category: 'display', variants: [400] },
  { family: 'Dancing Script', category: 'handwriting', variants: [400, 500, 600, 700] },
  { family: 'Satisfy', category: 'handwriting', variants: [400] },
  { family: 'Permanent Marker', category: 'handwriting', variants: [400] },
  { family: 'Caveat', category: 'handwriting', variants: [400, 500, 600, 700] },
  { family: 'Indie Flower', category: 'handwriting', variants: [400] },
  { family: 'Shadows Into Light', category: 'handwriting', variants: [400] },
  { family: 'Bangers', category: 'display', variants: [400] },
  { family: 'Alfa Slab One', category: 'display', variants: [400] },
  { family: 'Righteous', category: 'display', variants: [400] },
  { family: 'Fredoka', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Anton', category: 'sans-serif', variants: [400] },
  { family: 'Architects Daughter', category: 'handwriting', variants: [400] },
  { family: 'Abril Fatface', category: 'display', variants: [400] },
  { family: 'Russo One', category: 'sans-serif', variants: [400] },
  { family: 'Teko', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Chakra Petch', category: 'sans-serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Orbitron', category: 'sans-serif', variants: [400, 500, 600, 700, 800, 900] },
  { family: 'Press Start 2P', category: 'display', variants: [400] },
  { family: 'Cinzel', category: 'serif', variants: [400, 500, 600, 700, 800, 900] },
  { family: 'Nanum Gothic', category: 'sans-serif', variants: [400, 700, 800] },
  { family: 'Philosopher', category: 'sans-serif', variants: [400, 700] },
  { family: 'Vollkorn', category: 'serif', variants: [400, 500, 600, 700, 800, 900] },
  { family: 'JetBrains Mono', category: 'monospace', variants: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Zilla Slab', category: 'serif', variants: [300, 400, 500, 600, 700] },
  { family: 'Saira', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Red Hat Display', category: 'sans-serif', variants: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Encode Sans', category: 'sans-serif', variants: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', variants: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Bree Serif', category: 'serif', variants: [400] },
  { family: 'Amatic SC', category: 'handwriting', variants: [400, 700] },
];

/** Known weights for a curated family, or null for any other family (whose weights are unknown). */
export function curatedVariants(family: string): number[] | null {
  const entry = CURATED_GOOGLE_FONTS.find((f) => f.family === family);
  return entry && entry.variants.length > 0 ? [...entry.variants] : null;
}

/** Nearest available weight: minimum distance, ties go to the lower weight (same rule as the playground). */
export function nearestWeight(requested: number, variants: readonly number[]): number {
  if (variants.length === 0) return requested;
  return variants.reduce((best, v) => {
    const d = Math.abs(v - requested);
    const bestD = Math.abs(best - requested);
    return d < bestD || (d === bestD && v < best) ? v : best;
  });
}

/** The Google Fonts css2 request for one family, at one weight or at the family's default. */
export function buildCss2Url(family: string, weight?: number): string {
  const axis = weight === undefined ? '' : `:wght@${weight}`;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${axis}&display=swap`;
}

/**
 * Read a css2 response. A non-browser client gets one @font-face block with
 * the complete font's URL; take the first `url(…)` and the declared weight.
 * Only a `https://fonts.gstatic.com/` URL counts: font files are downloaded
 * from the two hosts docs/security.md names, and nowhere else.
 */
export function parseCss2Response(css: string): { url: string; weight: number | null } | null {
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/.exec(css)?.[1];
  if (!url) return null;
  const weight = /font-weight:\s*(\d+)/.exec(css)?.[1];
  return { url, weight: weight ? Number(weight) : null };
}

export interface WeightSubstitution {
  family: string;
  requested: number;
  used: number;
  /** The family's known weights; empty when it isn't in the curated catalog. */
  available: number[];
}

/** The warning text for a substitution — word for word the playground's (font-loader.ts formatFontSubstitutions). */
export function formatWeightSubstitution(s: WeightSubstitution): string {
  if (s.available.length === 0) {
    return `${s.family} does not provide weight ${s.requested} on Google Fonts; using its default weight ${s.used}`;
  }
  return s.available.length === 1
    ? `${s.family} is only available at weight ${s.used} (requested ${s.requested}); using ${s.used}`
    : `${s.family} is not available at weight ${s.requested}; using ${s.used} — available weights: ${[...s.available].sort((a, b) => a - b).join(', ')}`;
}

export interface HostFetchResponse {
  status: number;
  text: () => Promise<string>;
  bytes: () => Promise<Uint8Array>;
}
export type HostFetch = (url: string) => Promise<HostFetchResponse>;

export type GoogleFontLookup =
  | { ok: true; url: string; weightUsed: number; substitution?: WeightSubstitution }
  | { ok: false; reason: 'not-found' | 'network'; detail: string };

/**
 * Find Google's complete font file for a family at a weight — the playground's
 * two-tier rule: a curated family snaps to its nearest known weight before any
 * request; any other family is asked for the weight, then (after a 400) for
 * its default weight. A 400 at the default too means Google doesn't have it.
 */
export async function lookupGoogleFont(family: string, weight: number, fetch: HostFetch): Promise<GoogleFontLookup> {
  const variants = curatedVariants(family);
  const requestWeight = variants !== null && !variants.includes(weight) ? nearestWeight(weight, variants) : weight;

  const attempt = async (w: number | undefined): Promise<GoogleFontLookup | 'rejected'> => {
    let css: string;
    try {
      const res = await fetch(buildCss2Url(family, w));
      if (res.status === 400 || res.status === 404) return 'rejected';
      if (res.status !== 200) return { ok: false, reason: 'network', detail: `HTTP ${res.status} from Google Fonts` };
      // Inside the try: a connection can drop while the body is still arriving.
      css = await res.text();
    } catch (err) {
      return { ok: false, reason: 'network', detail: (err as Error).message };
    }
    const parsed = parseCss2Response(css);
    if (!parsed) return { ok: false, reason: 'network', detail: 'Google Fonts sent a response with no font in it' };
    const weightUsed = parsed.weight ?? w ?? 400;
    const substitution =
      weightUsed !== weight ? { family, requested: weight, used: weightUsed, available: variants ?? [] } : undefined;
    return { ok: true, url: parsed.url, weightUsed, ...(substitution ? { substitution } : {}) };
  };

  const first = await attempt(requestWeight);
  if (first !== 'rejected') return first;
  const fallback = await attempt(undefined);
  if (fallback !== 'rejected') return fallback;
  return { ok: false, reason: 'not-found', detail: `Google Fonts has no family named "${family}"` };
}

export type FontFileKind = 'ttf' | 'otf' | 'woff' | 'woff2' | 'collection';

/** Recognize a font file by its first four bytes; null when it isn't one. */
export function fontFileKind(bytes: Uint8Array): FontFileKind | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf';
  if (tag === 'true') return 'ttf';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'ttcf') return 'collection';
  return null;
}

/**
 * A TrueType or OpenType file whose table directory fits inside it: catches a
 * truncated download or cache entry, or a damaged file, before a glyph call
 * fails on it with an opaque parse error. Reads only the directory.
 */
export function sfntLooksComplete(bytes: Uint8Array): boolean {
  const kind = fontFileKind(bytes);
  if ((kind !== 'ttf' && kind !== 'otf') || bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  if (numTables === 0 || 12 + numTables * 16 > bytes.length) return false;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length > bytes.length) return false;
  }
  return true;
}

/**
 * The same check for a WOFF (1.0) file: its header states the file's length,
 * and every compressed table must lie inside it. (A damaged WOFF2 file is
 * caught by its decoder.)
 */
export function woffLooksComplete(bytes: Uint8Array): boolean {
  if (fontFileKind(bytes) !== 'woff' || bytes.length < 44) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== bytes.length) return false;
  const numTables = view.getUint16(12);
  if (numTables === 0 || 44 + numTables * 20 > bytes.length) return false;
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const offset = view.getUint32(entry + 4);
    const compressedLength = view.getUint32(entry + 8);
    if (offset + compressedLength > bytes.length) return false;
  }
  return true;
}
