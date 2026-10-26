/**
 * `@font-face` rules with the font inlined as a data URI, for a preview whose
 * Content-Security-Policy allows `font-src data:` but no network (the VS Code
 * webview). Live `<text>` in the SVG then renders in the loaded face. The
 * playground has its own version for browser slices (font-loader.ts
 * fontBinariesToCss); this one also labels OpenType and WOFF data correctly.
 */
import type { FontFileKind } from './google-fonts';

export interface FontFaceSource {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  bytes: Uint8Array;
  kind: FontFileKind;
}

const FORMATS: Record<string, { mime: string; format: string }> = {
  ttf: { mime: 'font/ttf', format: 'truetype' },
  otf: { mime: 'font/otf', format: 'opentype' },
  woff: { mime: 'font/woff', format: 'woff' },
  woff2: { mime: 'font/woff2', format: 'woff2' },
};

export function fontFaceCss(fonts: readonly FontFaceSource[]): string {
  return fonts
    .filter((f) => f.kind in FORMATS)
    .map((f) => {
      const { mime, format } = FORMATS[f.kind];
      return `@font-face {
  font-family: "${escapeFamily(f.family)}";
  font-weight: ${f.weight};
  font-style: ${f.style};
  font-display: swap;
  src: url("data:${mime};base64,${toBase64(f.bytes)}") format("${format}");
}`;
    })
    .join('\n');
}

/** Quotes and backslashes escaped; control characters that would end the CSS string dropped. */
function escapeFamily(family: string): string {
  return family
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n\0]/g, '');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 without `btoa`/`Buffer`, so it runs the same in Node, a Worker and a webview. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}
