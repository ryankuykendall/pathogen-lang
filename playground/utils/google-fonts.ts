// Google Fonts helper — curated list with API fallback + dynamic font loading

interface FontEntry {
  family: string;
  category: string;
  variants: number[];
  isSystem?: boolean;
}

// Curated list of ~100 popular Google Fonts sorted by popularity
// Each entry: { family, category, variants? }
const CURATED_FONTS: FontEntry[] = [
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

// System font stacks pinned at top of font list
const SYSTEM_FONTS: FontEntry[] = [
  { family: 'sans-serif', category: 'system', variants: [400, 700], isSystem: true },
  { family: 'serif', category: 'system', variants: [400, 700], isSystem: true },
  { family: 'monospace', category: 'system', variants: [400, 700], isSystem: true },
  { family: 'cursive', category: 'system', variants: [400], isSystem: true },
];

let cachedFonts: FontEntry[] | null = null;

/**
 * Fetch fonts list. Tries Google Fonts API if key provided, falls back to curated list.
 */
export async function fetchGoogleFonts(apiKey?: string): Promise<FontEntry[]> {
  if (cachedFonts) return cachedFonts;

  if (apiKey) {
    try {
      const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`);
      if (res.ok) {
        const data = await res.json();
        const fonts: FontEntry[] = data.items.slice(0, 150).map((item: { family: string; category: string; variants?: string[] }) => ({
          family: item.family,
          category: item.category,
          variants: (item.variants || [])
            .filter((v: string) => !v.includes('italic'))
            .map((v: string) => (v === 'regular' ? 400 : parseInt(v, 10)))
            .filter((v: number) => !isNaN(v)),
        }));
        cachedFonts = [...SYSTEM_FONTS, ...fonts];
        return cachedFonts;
      }
    } catch {
      // Fall through to curated list
    }
  }

  cachedFonts = [...SYSTEM_FONTS, ...CURATED_FONTS];
  return cachedFonts;
}

const loadedFonts: Set<string> = new Set();

/**
 * Load a Google Font by injecting a <link> into document.head.
 * Deduplicates and is fire-and-forget.
 */
export function loadGoogleFont(family: string): void {
  // Don't try to load system fonts
  if (['sans-serif', 'serif', 'monospace', 'cursive'].includes(family)) return;
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);

  const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(link);
}

/**
 * Get available weights for a font from the curated/cached list.
 */
export function getAvailableWeights(family: string): number[] {
  const fonts = cachedFonts || [...SYSTEM_FONTS, ...CURATED_FONTS];
  const font = fonts.find((f) => f.family === family);
  return font?.variants || [400, 700];
}

/**
 * Is this family one the font picker advertises? The check protects the
 * fetch path: while a user types a font name in the picker the playground
 * recompiles after each keystroke, and every partial value (e.g. `Joseph`,
 * `Josephi`, `Josephin`, `Josephin S`, …) would otherwise be sent to the
 * Google Fonts CDN, racking up 400-CORS errors and risking rate limits.
 *
 * Uses the cached fonts list when available (covers fonts fetched via API
 * key on top of the curated set) and falls back to CURATED_FONTS for the
 * common case where the API hasn't been called.
 */
const CURATED_FAMILY_SET = new Set(CURATED_FONTS.map((f) => f.family));

export function isKnownGoogleFont(family: string): boolean {
  if (cachedFonts) {
    for (const f of cachedFonts) {
      if (f.family === family) return true;
    }
    return false;
  }
  return CURATED_FAMILY_SET.has(family);
}
