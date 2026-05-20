// Rewrite post24/*.pathogen raw-CSS color strings to use Pathogen's
// CSSVar() + Color() constructors. This is necessary because the
// security validator rejects raw `var()` and `oklch(from ...)` strings
// in style values (they could be vectors for unsafe CSS injection).
//
// Translation table (exact patterns observed in the 14 files):
//
//   'var(--X, #HEX)'                                  → Color(CSSVar('--X', #HEX))
//   'oklch(from var(--X, #HEX) l c calc(h ± N))'      → Color(CSSVar('--X', #HEX)).hueShift(±N)
//   'oklch(from var(--X, #HEX) calc(l ± N) c h)'      → Color(CSSVar('--X', #HEX)).lighten(N) | .darken(N)
//   'oklch(from var(--X, #HEX) l calc(c * N) h)'      → Color(CSSVar('--X', #HEX)).saturate(N) | .desaturate
//   'oklch(from var(--X, #HEX) l c h / N)'            → Color(CSSVar('--X', #HEX)).alpha(N)
//   'oklch(from var(--X, #HEX) L.LL c h)'             → Color(CSSVar('--X', #HEX)).darken(baseL - L.LL)
//                                                       (approximation; see note)
//   'oklch(from var(--bg, #HEX) calc((0.5 - l) * 1000) 0 0[ / A])' → static contrast color
//   'color-mix(in oklch, var(--X, #Y), #Z N%)'        → Color(CSSVar('--X', #Y)).mix(Color('#Z'), N/100)
//
//   Font shortcuts:
//     "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif" → 'sans-serif'
//     "Georgia, 'Times New Roman', serif"                  → 'serif'
//
// Note on absolute-L: Pathogen has no `setLightness` method, so
// `oklch(from var(--X) 0.15 c h)` (set L absolute) is approximated by
// `Color(CSSVar('--X', fallback)).darken(baseL - 0.15)` where baseL is
// the L of the fallback hex. This means changing --X at runtime preserves
// the hue rotation behavior but the L will drift relative to the var's
// L change. The visual is correct for the fallback color.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_L_BY_HEX: Record<string, number> = {
  '#e63946': 0.625,  // OKLCH L for default --harmony-color / --demo-color
  '#d0d7f0': 0.86,   // OKLCH L for default --bg
  '#0f172a': 0.18,   // dark navy
  '#0b0e1a': 0.10,   // near-black
  '#f4efe6': 0.93,   // light beige
  '#fbfaf5': 0.97,   // near-white
};

// sRGB → approximate OKLCH L (rough luminance proxy via gamma-decoded
// channel mix). Used as a fallback for hex values not in the table above.
function hexLuminance(hex: string): number {
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function approxOklchL(hex: string): number {
  return BASE_L_BY_HEX[hex.toLowerCase()] ?? hexLuminance(hex);
}

// Replace a single string-quoted CSS value with a Pathogen expression.
function rewriteCssString(raw: string): string {
  // Strip quotes
  const inner = raw.slice(1, -1);

  // 1. Simple var() — `var(--X, #HEX)`
  let m = inner.match(/^var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\)$/);
  if (m) return `Color(CSSVar('${m[1]}', ${m[2]}))`;

  // 2. Foreground auto-contrast: oklch(from var(--bg, #HEX) calc((0.5 - l) * 1000) 0 0[ / alpha])
  // The original formula clamps to 0 or 1, producing pure black or pure
  // white text against the bg. We pick the same outcome statically.
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) calc\(\(0\.5 - l\) \* 1000\) 0 0(?:\s*\/\s*([\d.]+))?\)$/);
  if (m) {
    const [, , fallback, alphaStr] = m;
    const bgL = approxOklchL(fallback);
    const contrastColor = bgL > 0.5 ? "Color('#0d1638')" : "Color('#f0e8c8')";
    if (alphaStr) return `${contrastColor}.alpha(${alphaStr})`;
    return contrastColor;
  }

  // 3. Hue shift: oklch(from var(--X, #HEX) l c calc(h ± N))
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) l c calc\(h\s*([+-])\s*(\d+(?:\.\d+)?)\)\)$/);
  if (m) {
    const [, name, hex, sign, val] = m;
    const signed = sign === '-' ? `-${val}` : val;
    return `Color(CSSVar('${name}', ${hex})).hueShift(${signed})`;
  }

  // 4. Relative L: oklch(from var(--X, #HEX) calc(l ± N) c h)
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) calc\(l\s*([+-])\s*(\d+(?:\.\d+)?)\) c h\)$/);
  if (m) {
    const [, name, hex, sign, val] = m;
    const method = sign === '+' ? 'lighten' : 'darken';
    return `Color(CSSVar('${name}', ${hex})).${method}(${val})`;
  }

  // 5. Chroma multiplier: oklch(from var(--X, #HEX) l calc(c * N) h)
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) l calc\(c \* (\d+(?:\.\d+)?)\) h\)$/);
  if (m) {
    const [, name, hex, val] = m;
    const factor = parseFloat(val);
    const method = factor >= 1 ? 'saturate' : 'desaturate';
    // Pathogen's saturate/desaturate take a multiplier; 1.5 = 1.5x, 0.4 = 0.4x.
    return `Color(CSSVar('${name}', ${hex})).${method}(${val})`;
  }

  // 6. Alpha: oklch(from var(--X, #HEX) l c h / N)
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) l c h \/\s*(\d+(?:\.\d+)?)\)$/);
  if (m) {
    const [, name, hex, alpha] = m;
    return `Color(CSSVar('${name}', ${hex})).alpha(${alpha})`;
  }

  // 7. Absolute L: oklch(from var(--X, #HEX) X.XX c h)
  m = inner.match(/^oklch\(from var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\) (\d+(?:\.\d+)?) c h\)$/);
  if (m) {
    const [, name, hex, lAbs] = m;
    const baseL = BASE_L_BY_HEX[hex.toLowerCase()] ?? 0.625;
    const target = parseFloat(lAbs);
    const delta = target - baseL;
    if (Math.abs(delta) < 0.001) return `Color(CSSVar('${name}', ${hex}))`;
    const method = delta > 0 ? 'lighten' : 'darken';
    return `Color(CSSVar('${name}', ${hex})).${method}(${Math.abs(delta).toFixed(3)})`;
  }

  // 8. color-mix(in oklch, var(--X, #Y), #Z N%)
  m = inner.match(/^color-mix\(in oklch,\s*var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]+)\s*\)\s*,\s*(#[0-9a-fA-F]+)\s+(\d+(?:\.\d+)?)%\)$/);
  if (m) {
    const [, name, fallback, mixWith, pct] = m;
    const ratio = (parseFloat(pct) / 100).toFixed(2);
    return `Color(CSSVar('${name}', ${fallback})).mix(Color('${mixWith}'), ${ratio})`;
  }

  // Unrecognized — leave as-is and let the security validator flag it.
  return raw;
}

const FONT_REWRITES: Array<[string, string]> = [
  // Single-quoted multi-family — quoted using double-quotes
  [String.raw`"'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"`, `'sans-serif'`],
  [String.raw`"'Helvetica Neue', 'Arial', sans-serif"`, `'sans-serif'`],
  [String.raw`"Georgia, 'Times New Roman', serif"`, `'serif'`],
  [String.raw`"'SF Mono', 'Menlo', 'JetBrains Mono', 'Consolas', monospace"`, `'monospace'`],
  // Bare (used in style: blocks)
  [`'Helvetica Neue', 'Helvetica', 'Arial', sans-serif`, `sans-serif`],
  [`Georgia, 'Times New Roman', serif`, `serif`],
  [`'SF Mono', 'Menlo', 'JetBrains Mono', 'Consolas', monospace`, `monospace`],
];

function rewriteFile(source: string): { next: string; replaced: number } {
  let out = source;
  let replaced = 0;

  // Font shortcuts (literal substring matches)
  for (const [needle, replacement] of FONT_REWRITES) {
    while (out.includes(needle)) {
      out = out.replace(needle, replacement);
      replaced++;
    }
  }

  // CSS color strings — any single-quoted string that contains `var(`
  // (the security validator's trigger). Earlier regex tried to lock the
  // alternation to specific prefixes but the second `\(` mismatched on
  // `oklch(from var(...)` where the second `(` is preceded by `from `.
  const re = /'[^']*var\([^']*'/g;
  out = out.replace(re, (match) => {
    const rewritten = rewriteCssString(match);
    if (rewritten !== match) {
      replaced++;
      return rewritten;
    }
    return match;
  });

  return { next: out, replaced };
}

const dir = '/Users/ryan/claude-code-projects/svg-path-extended/website/blog/samples/post24';
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pathogen'))
  .map((f) => join(dir, f));

let touched = 0;
for (const f of files) {
  const orig = readFileSync(f, 'utf-8');
  const { next, replaced } = rewriteFile(orig);
  if (next === orig) {
    console.log(`[no-op] ${f}`);
    continue;
  }
  writeFileSync(f, next);
  console.log(`[fixed] ${f} — ${replaced} replacements`);
  touched++;
}
console.log(`\nTotal: ${touched}/${files.length} files updated`);
