/**
 * Color math module — OKLCH-based color parsing, conversion, and manipulation.
 * Pure computation, no evaluator dependencies.
 */

// ── Internal type ──────────────────────────────────────────────────────

export interface OKLCH {
  L: number; // Lightness 0–1
  C: number; // Chroma 0–~0.4
  H: number; // Hue 0–360
  alpha: number; // Alpha 0–1
}

// ── sRGB helpers ───────────────────────────────────────────────────────

interface SRGB {
  r: number;
  g: number;
  b: number;
  alpha: number;
}
interface LinearRGB {
  r: number;
  g: number;
  b: number;
  alpha: number;
}
interface OKLab {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

// ── Gamma correction (sRGB ↔ Linear) ──────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

// ── sRGB ↔ Linear RGB ─────────────────────────────────────────────────

function srgbToLinearRGB(rgb: SRGB): LinearRGB {
  return {
    r: srgbToLinear(rgb.r),
    g: srgbToLinear(rgb.g),
    b: srgbToLinear(rgb.b),
    alpha: rgb.alpha,
  };
}

function linearRGBToSRGB(lin: LinearRGB): SRGB {
  return {
    r: linearToSRGB(lin.r),
    g: linearToSRGB(lin.g),
    b: linearToSRGB(lin.b),
    alpha: lin.alpha,
  };
}

// ── Linear sRGB ↔ OKLab (Ottosson's matrices) ─────────────────────────

function linearSRGBToOKLab(rgb: LinearRGB): OKLab {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    alpha: rgb.alpha,
  };
}

function oklabToLinearSRGB(lab: OKLab): LinearRGB {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    alpha: lab.alpha,
  };
}

// ── OKLab ↔ OKLCH (Cartesian ↔ Polar) ─────────────────────────────────

function oklabToOKLCH(lab: OKLab): OKLCH {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H, alpha: lab.alpha };
}

function oklchToOKLab(lch: OKLCH): OKLab {
  const hRad = (lch.H * Math.PI) / 180;
  return {
    L: lch.L,
    a: lch.C * Math.cos(hRad),
    b: lch.C * Math.sin(hRad),
    alpha: lch.alpha,
  };
}

// ── HSL ↔ sRGB ─────────────────────────────────────────────────────────

function hslToSRGB(h: number, s: number, l: number, alpha: number): SRGB {
  // h in [0,360], s and l in [0,1]
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return { r: r + m, g: g + m, b: b + m, alpha };
}

function srgbToHSL(rgb: SRGB): { h: number; s: number; l: number; alpha: number } {
  const { r } = rgb;
  const { g } = rgb;
  const { b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l, alpha: rgb.alpha };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l, alpha: rgb.alpha };
}

// ── Hex parsing/formatting ─────────────────────────────────────────────

function hexToSRGB(hex: string): SRGB {
  hex = hex.replace(/^#/, '');
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: #${hex}`);
  }
  return { r, g, b, alpha: a };
}

function srgbToHex(rgb: SRGB): string {
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ── Conversion chains ──────────────────────────────────────────────────

function srgbToOKLCH(rgb: SRGB): OKLCH {
  return oklabToOKLCH(linearSRGBToOKLab(srgbToLinearRGB(rgb)));
}

function oklchToSRGB(lch: OKLCH): SRGB {
  const lin = oklabToLinearSRGB(oklchToOKLab(lch));
  return linearRGBToSRGB({
    r: clamp01(lin.r),
    g: clamp01(lin.g),
    b: clamp01(lin.b),
    alpha: lin.alpha,
  });
}

// ── Utility ────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Output formatters ──────────────────────────────────────────────────

/** Returns hex if opaque, rgba() if transparent */
export function oklchToCSS(c: OKLCH): string {
  if (c.alpha < 1) {
    const rgb = oklchToSRGB(c);
    const r = Math.round(clamp01(rgb.r) * 255);
    const g = Math.round(clamp01(rgb.g) * 255);
    const b = Math.round(clamp01(rgb.b) * 255);
    const a = Math.round(c.alpha * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return oklchToHex(c);
}

/** Returns #rrggbb (ignores alpha) */
export function oklchToHex(c: OKLCH): string {
  return srgbToHex(oklchToSRGB(c));
}

/** Returns rgb(R, G, B) */
export function oklchToRGBString(c: OKLCH): string {
  const rgb = oklchToSRGB(c);
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Returns hsl(H, S%, L%) */
export function oklchToHSLString(c: OKLCH): string {
  const rgb = oklchToSRGB(c);
  const { h, s, l } = srgbToHSL(rgb);
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/** Returns oklch(L C H) or oklch(L C H / a) */
export function oklchToOKLCHString(c: OKLCH): string {
  const L = Math.round(c.L * 1000) / 1000;
  const C = Math.round(c.C * 1000) / 1000;
  const H = Math.round(c.H * 100) / 100;
  if (c.alpha < 1) {
    const a = Math.round(c.alpha * 1000) / 1000;
    return `oklch(${L} ${C} ${H} / ${a})`;
  }
  return `oklch(${L} ${C} ${H})`;
}

// ── Manipulation functions ─────────────────────────────────────────────

export function lighten(c: OKLCH, amount: number): OKLCH {
  return { ...c, L: clamp01(c.L + amount) };
}

export function darken(c: OKLCH, amount: number): OKLCH {
  return { ...c, L: clamp01(c.L - amount) };
}

export function saturate(c: OKLCH, factor: number): OKLCH {
  return { ...c, C: Math.min(Math.max(c.C * factor, 0), 0.4) };
}

export function desaturate(c: OKLCH, factor: number): OKLCH {
  return { ...c, C: Math.min(Math.max(c.C * factor, 0), 0.4) };
}

export function setAlpha(c: OKLCH, alpha: number): OKLCH {
  return { ...c, alpha: clamp01(alpha) };
}

export function hueShift(c: OKLCH, degrees: number): OKLCH {
  let h = (c.H + degrees) % 360;
  if (h < 0) h += 360;
  return { ...c, H: h };
}

export function mixColors(c1: OKLCH, c2: OKLCH, t: number): OKLCH {
  // Shortest-arc hue interpolation
  let h1 = c1.H;
  let h2 = c2.H;

  // Handle achromatic colors (chroma near zero → undefined hue)
  const c1Achromatic = c1.C < 0.001;
  const c2Achromatic = c2.C < 0.001;
  if (c1Achromatic && c2Achromatic) {
    // Both achromatic — hue doesn't matter
    h1 = 0;
    h2 = 0;
  } else if (c1Achromatic) {
    h1 = h2;
  } else if (c2Achromatic) {
    h2 = h1;
  }

  // Shortest arc interpolation
  let dh = h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  let H = h1 + dh * t;
  if (H < 0) H += 360;
  if (H >= 360) H -= 360;

  return {
    L: c1.L + (c2.L - c1.L) * t,
    C: c1.C + (c2.C - c1.C) * t,
    H,
    alpha: c1.alpha + (c2.alpha - c1.alpha) * t,
  };
}

// ── CSS relative color expression generators ─────────────────────────

/** Build CSS source string from cssVar or cssExpr */
export function cssSourceExpr(cssVar?: { varName: string; fallback: string }, cssExpr?: string): string | undefined {
  if (cssExpr) return cssExpr;
  if (cssVar) return `var(${cssVar.varName}, ${cssVar.fallback})`;
  return undefined;
}

export function lightenCSS(source: string, amount: number): string {
  return `oklch(from ${source} calc(l + ${amount}) c h)`;
}

export function darkenCSS(source: string, amount: number): string {
  return `oklch(from ${source} calc(l - ${amount}) c h)`;
}

export function saturateCSS(source: string, factor: number): string {
  return `oklch(from ${source} l calc(c * ${factor}) h)`;
}

export function desaturateCSS(source: string, factor: number): string {
  return `oklch(from ${source} l calc(c * ${factor}) h)`;
}

export function setAlphaCSS(source: string, alpha: number): string {
  return `oklch(from ${source} l c h / ${alpha})`;
}

export function hueShiftCSS(source: string, degrees: number): string {
  return `oklch(from ${source} l c calc(h + ${degrees}))`;
}

export function mixCSS(source1: string, source2: string, ratio: number): string {
  return `color-mix(in oklch, ${source1}, ${source2} ${Math.round(ratio * 100)}%)`;
}

export function setLightnessCSS(source: string, lightness: number): string {
  return `oklch(from ${source} ${lightness} c h)`;
}

// ── HWB ↔ sRGB ───────────────────────────────────────────────────────

function hwbToSRGB(h: number, w: number, b: number, alpha: number): SRGB {
  // w and b in [0,1]; if w + b > 1, normalize
  if (w + b > 1) {
    const sum = w + b;
    w = w / sum;
    b = b / sum;
  }
  const rgb = hslToSRGB(h, 1, 0.5, alpha);
  return {
    r: rgb.r * (1 - w - b) + w,
    g: rgb.g * (1 - w - b) + w,
    b: rgb.b * (1 - w - b) + w,
    alpha,
  };
}

// ── CIE Lab/LCH → OKLCH conversion chains ──────────────────────────────

// D65 white point
const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;

function labFInv(t: number): number {
  const delta = 6 / 29;
  return t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29);
}

function cieLabToXYZ(L: number, a: number, b: number): { x: number; y: number; z: number } {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  return {
    x: D65_X * labFInv(fx),
    y: D65_Y * labFInv(fy),
    z: D65_Z * labFInv(fz),
  };
}

function xyzToLinearSRGB(x: number, y: number, z: number): LinearRGB {
  // XYZ (D65) → linear sRGB matrix
  return {
    r: 3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    g: -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    b: 0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    alpha: 1,
  };
}

function cieLabToOKLCH(L: number, a: number, b: number, alpha: number): OKLCH {
  const xyz = cieLabToXYZ(L, a, b);
  const linRGB = xyzToLinearSRGB(xyz.x, xyz.y, xyz.z);
  linRGB.alpha = alpha;
  const oklab = linearSRGBToOKLab(linRGB);
  return oklabToOKLCH(oklab);
}

function cieLCHToOKLCH(L: number, C: number, H: number, alpha: number): OKLCH {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return cieLabToOKLCH(L, a, b, alpha);
}

// ── Unified parser ─────────────────────────────────────────────────────

export function parseColor(input: string): OKLCH {
  const trimmed = input.trim().toLowerCase();

  // Named color lookup
  const namedHex = NAMED_COLORS.get(trimmed);
  if (namedHex) {
    return srgbToOKLCH(hexToSRGB(namedHex));
  }

  // Hex
  if (trimmed.startsWith('#')) {
    return srgbToOKLCH(hexToSRGB(trimmed));
  }

  // rgb() / rgba()
  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
    return srgbToOKLCH({ r, g, b, alpha: a });
  }

  // hsl() / hsla()
  const hslMatch = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    return srgbToOKLCH(hslToSRGB(h, s, l, a));
  }

  // oklch()
  const oklchMatch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (oklchMatch) {
    return {
      L: parseFloat(oklchMatch[1]),
      C: parseFloat(oklchMatch[2]),
      H: parseFloat(oklchMatch[3]),
      alpha: oklchMatch[4] !== undefined ? parseFloat(oklchMatch[4]) : 1,
    };
  }

  // oklab()
  const oklabMatch = /^oklab\(\s*([\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (oklabMatch) {
    const lab: OKLab = {
      L: parseFloat(oklabMatch[1]),
      a: parseFloat(oklabMatch[2]),
      b: parseFloat(oklabMatch[3]),
      alpha: oklabMatch[4] !== undefined ? parseFloat(oklabMatch[4]) : 1,
    };
    return oklabToOKLCH(lab);
  }

  // hwb() / hwba()
  const hwbMatch = /^hwba?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (hwbMatch) {
    const h = parseFloat(hwbMatch[1]);
    const w = parseFloat(hwbMatch[2]) / 100;
    const b = parseFloat(hwbMatch[3]) / 100;
    const a = hwbMatch[4] !== undefined ? parseFloat(hwbMatch[4]) : 1;
    return srgbToOKLCH(hwbToSRGB(h, w, b, a));
  }

  // lab() — CIE Lab
  const labMatch = /^lab\(\s*([\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (labMatch) {
    const L = parseFloat(labMatch[1]);
    const a = parseFloat(labMatch[2]);
    const b = parseFloat(labMatch[3]);
    const alpha = labMatch[4] !== undefined ? parseFloat(labMatch[4]) : 1;
    return cieLabToOKLCH(L, a, b, alpha);
  }

  // lch() — CIE LCH
  const lchMatch = /^lch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(trimmed);
  if (lchMatch) {
    const L = parseFloat(lchMatch[1]);
    const C = parseFloat(lchMatch[2]);
    const H = parseFloat(lchMatch[3]);
    const alpha = lchMatch[4] !== undefined ? parseFloat(lchMatch[4]) : 1;
    return cieLCHToOKLCH(L, C, H, alpha);
  }

  throw new Error(`Invalid color: '${input}'`);
}

// ── Named CSS colors (148) ─────────────────────────────────────────────

const NAMED_COLORS = new Map<string, string>([
  ['aliceblue', '#f0f8ff'],
  ['antiquewhite', '#faebd7'],
  ['aqua', '#00ffff'],
  ['aquamarine', '#7fffd4'],
  ['azure', '#f0ffff'],
  ['beige', '#f5f5dc'],
  ['bisque', '#ffe4c4'],
  ['black', '#000000'],
  ['blanchedalmond', '#ffebcd'],
  ['blue', '#0000ff'],
  ['blueviolet', '#8a2be2'],
  ['brown', '#a52a2a'],
  ['burlywood', '#deb887'],
  ['cadetblue', '#5f9ea0'],
  ['chartreuse', '#7fff00'],
  ['chocolate', '#d2691e'],
  ['coral', '#ff7f50'],
  ['cornflowerblue', '#6495ed'],
  ['cornsilk', '#fff8dc'],
  ['crimson', '#dc143c'],
  ['cyan', '#00ffff'],
  ['darkblue', '#00008b'],
  ['darkcyan', '#008b8b'],
  ['darkgoldenrod', '#b8860b'],
  ['darkgray', '#a9a9a9'],
  ['darkgreen', '#006400'],
  ['darkgrey', '#a9a9a9'],
  ['darkkhaki', '#bdb76b'],
  ['darkmagenta', '#8b008b'],
  ['darkolivegreen', '#556b2f'],
  ['darkorange', '#ff8c00'],
  ['darkorchid', '#9932cc'],
  ['darkred', '#8b0000'],
  ['darksalmon', '#e9967a'],
  ['darkseagreen', '#8fbc8f'],
  ['darkslateblue', '#483d8b'],
  ['darkslategray', '#2f4f4f'],
  ['darkslategrey', '#2f4f4f'],
  ['darkturquoise', '#00ced1'],
  ['darkviolet', '#9400d3'],
  ['deeppink', '#ff1493'],
  ['deepskyblue', '#00bfff'],
  ['dimgray', '#696969'],
  ['dimgrey', '#696969'],
  ['dodgerblue', '#1e90ff'],
  ['firebrick', '#b22222'],
  ['floralwhite', '#fffaf0'],
  ['forestgreen', '#228b22'],
  ['fuchsia', '#ff00ff'],
  ['gainsboro', '#dcdcdc'],
  ['ghostwhite', '#f8f8ff'],
  ['gold', '#ffd700'],
  ['goldenrod', '#daa520'],
  ['gray', '#808080'],
  ['green', '#008000'],
  ['greenyellow', '#adff2f'],
  ['grey', '#808080'],
  ['honeydew', '#f0fff0'],
  ['hotpink', '#ff69b4'],
  ['indianred', '#cd5c5c'],
  ['indigo', '#4b0082'],
  ['ivory', '#fffff0'],
  ['khaki', '#f0e68c'],
  ['lavender', '#e6e6fa'],
  ['lavenderblush', '#fff0f5'],
  ['lawngreen', '#7cfc00'],
  ['lemonchiffon', '#fffacd'],
  ['lightblue', '#add8e6'],
  ['lightcoral', '#f08080'],
  ['lightcyan', '#e0ffff'],
  ['lightgoldenrodyellow', '#fafad2'],
  ['lightgray', '#d3d3d3'],
  ['lightgreen', '#90ee90'],
  ['lightgrey', '#d3d3d3'],
  ['lightpink', '#ffb6c1'],
  ['lightsalmon', '#ffa07a'],
  ['lightseagreen', '#20b2aa'],
  ['lightskyblue', '#87cefa'],
  ['lightslategray', '#778899'],
  ['lightslategrey', '#778899'],
  ['lightsteelblue', '#b0c4de'],
  ['lightyellow', '#ffffe0'],
  ['lime', '#00ff00'],
  ['limegreen', '#32cd32'],
  ['linen', '#faf0e6'],
  ['magenta', '#ff00ff'],
  ['maroon', '#800000'],
  ['mediumaquamarine', '#66cdaa'],
  ['mediumblue', '#0000cd'],
  ['mediumorchid', '#ba55d3'],
  ['mediumpurple', '#9370db'],
  ['mediumseagreen', '#3cb371'],
  ['mediumslateblue', '#7b68ee'],
  ['mediumspringgreen', '#00fa9a'],
  ['mediumturquoise', '#48d1cc'],
  ['mediumvioletred', '#c71585'],
  ['midnightblue', '#191970'],
  ['mintcream', '#f5fffa'],
  ['mistyrose', '#ffe4e1'],
  ['moccasin', '#ffe4b5'],
  ['navajowhite', '#ffdead'],
  ['navy', '#000080'],
  ['oldlace', '#fdf5e6'],
  ['olive', '#808000'],
  ['olivedrab', '#6b8e23'],
  ['orange', '#ffa500'],
  ['orangered', '#ff4500'],
  ['orchid', '#da70d6'],
  ['palegoldenrod', '#eee8aa'],
  ['palegreen', '#98fb98'],
  ['paleturquoise', '#afeeee'],
  ['palevioletred', '#db7093'],
  ['papayawhip', '#ffefd5'],
  ['peachpuff', '#ffdab9'],
  ['peru', '#cd853f'],
  ['pink', '#ffc0cb'],
  ['plum', '#dda0dd'],
  ['powderblue', '#b0e0e6'],
  ['purple', '#800080'],
  ['rebeccapurple', '#663399'],
  ['red', '#ff0000'],
  ['rosybrown', '#bc8f8f'],
  ['royalblue', '#4169e1'],
  ['saddlebrown', '#8b4513'],
  ['salmon', '#fa8072'],
  ['sandybrown', '#f4a460'],
  ['seagreen', '#2e8b57'],
  ['seashell', '#fff5ee'],
  ['sienna', '#a0522d'],
  ['silver', '#c0c0c0'],
  ['skyblue', '#87ceeb'],
  ['slateblue', '#6a5acd'],
  ['slategray', '#708090'],
  ['slategrey', '#708090'],
  ['snow', '#fffafa'],
  ['springgreen', '#00ff7f'],
  ['steelblue', '#4682b4'],
  ['tan', '#d2b48c'],
  ['teal', '#008080'],
  ['thistle', '#d8bfd8'],
  ['tomato', '#ff6347'],
  ['turquoise', '#40e0d0'],
  ['violet', '#ee82ee'],
  ['wheat', '#f5deb3'],
  ['white', '#ffffff'],
  ['whitesmoke', '#f5f5f5'],
  ['yellow', '#ffff00'],
  ['yellowgreen', '#9acd32'],
]);
