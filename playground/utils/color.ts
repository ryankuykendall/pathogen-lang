// Shared color parsing / formatting / conversion utilities.
// Used by cm-color-picker, pathogen-color-input wrapper, cssvar-panel, and anywhere else
// the playground needs to round-trip CSS color literals while preserving source format.

/** Parsed color representation with RGBA values and source format. */
export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
  format: ColorFormat;
}

/** Supported CSS color output formats. */
export type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'oklch' | 'oklab' | 'named';

/** Colorspace strings understood by <color-input> (hdr-color-input). */
export type ColorInputSpace =
  | 'hex'
  | 'srgb'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'display-p3'
  | 'rec2020'
  | 'a98-rgb'
  | 'prophoto'
  | 'xyz'
  | 'xyz-d50'
  | 'xyz-d65';

const CSS_NAMED_COLORS: Set<string> = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
]);

// ─── sRGB / HSL / OKLab / OKLCH conversions ─────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function rgbToOKLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [
    Math.round(Math.max(0, Math.min(1, linearToSRGB(lr))) * 255),
    Math.round(Math.max(0, Math.min(1, linearToSRGB(lg))) * 255),
    Math.round(Math.max(0, Math.min(1, linearToSRGB(lb))) * 255),
  ];
}

function rgbToOKLCH(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lab = rgbToOKLab(r, g, b);
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgb(L, a, b);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/** Detect the source format of a color string without fully parsing it. */
export function detectFormat(str: string): ColorFormat {
  if (!str) return 'hex';
  const s = str.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return 'hex';
  if (/^rgba\(/i.test(s)) return 'rgba';
  if (/^rgb\(/i.test(s)) return 'rgb';
  if (/^hsla\(/i.test(s)) return 'hsla';
  if (/^hsl\(/i.test(s)) return 'hsl';
  if (/^oklch\(/i.test(s)) return 'oklch';
  if (/^oklab\(/i.test(s)) return 'oklab';
  if (CSS_NAMED_COLORS.has(s.toLowerCase())) return 'named';
  return 'hex';
}

/**
 * Parse any CSS color string into {r, g, b, a, format}.
 * format: 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'oklch' | 'oklab' | 'named'
 */
export function parseColor(str: string): ParsedColor {
  if (!str || str === 'none') return { r: 0, g: 0, b: 0, a: 1, format: 'hex' };
  str = str.trim();

  // 8-digit hex: #rrggbbaa
  let m = str.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (m)
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
      a: +(parseInt(m[4], 16) / 255).toFixed(2),
      format: 'hex',
    };

  // 6-digit hex
  m = str.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1, format: 'hex' };

  // 4-digit hex: #rgba
  m = str.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (m)
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: +(parseInt(m[4] + m[4], 16) / 255).toFixed(2),
      format: 'hex',
    };

  // 3-digit hex
  m = str.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (m)
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: 1,
      format: 'hex',
    };

  // rgba(r, g, b, a)
  m = str.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4], format: 'rgba' };

  // rgb(r, g, b)
  m = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1, format: 'rgb' };

  // hsla(h, s%, l%, a)
  m = str.match(/^hsla\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)\s*\)$/);
  if (m) {
    const [r, g, b] = hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100);
    return { r, g, b, a: +m[4], format: 'hsla' };
  }

  // hsl(h, s%, l%)
  m = str.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/);
  if (m) {
    const [r, g, b] = hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100);
    return { r, g, b, a: 1, format: 'hsl' };
  }

  // oklch(L C H) or oklch(L C H / alpha)
  m = str.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = oklchToRgb(+m[1], +m[2], +m[3]);
    return { r, g, b, a: m[4] != null ? +m[4] : 1, format: 'oklch' };
  }

  // oklab(L a b) or oklab(L a b / alpha)
  m = str.match(/^oklab\(\s*([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = oklabToRgb(+m[1], +m[2], +m[3]);
    return { r, g, b, a: m[4] != null ? +m[4] : 1, format: 'oklab' };
  }

  // Named color → resolve via canvas
  if (CSS_NAMED_COLORS.has(str.toLowerCase())) {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = str;
    const resolved = ctx.fillStyle;
    const parsed = parseColor(resolved);
    parsed.format = 'named';
    return parsed;
  }

  return { r: 0, g: 0, b: 0, a: 1, format: 'hex' };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format {r, g, b, a} back to a CSS color string in the given format.
 * If alpha < 1 and format is 'hex', uses 8-digit hex. If format is 'rgb', upgrades to 'rgba'.
 */
export function formatColor({ r, g, b, a }: ParsedColor, format: ColorFormat): string {
  const hasAlpha = a < 1;
  const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  const rd = (n: number, d: number = 2): number => +n.toFixed(d);

  switch (format) {
    case 'hex':
    case 'named':
      if (hasAlpha) return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}`;
      return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    case 'rgb':
      if (hasAlpha) return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${rd(a)})`;
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    case 'rgba':
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${rd(a)})`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      if (hasAlpha) return `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${rd(a)})`;
      return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }
    case 'hsla': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${rd(a)})`;
    }
    case 'oklch': {
      const lch = rgbToOKLCH(r, g, b);
      if (hasAlpha) return `oklch(${lch.L.toFixed(4)} ${lch.C.toFixed(4)} ${lch.H.toFixed(1)} / ${rd(a)})`;
      return `oklch(${lch.L.toFixed(4)} ${lch.C.toFixed(4)} ${lch.H.toFixed(1)})`;
    }
    case 'oklab': {
      const lab = rgbToOKLab(r, g, b);
      if (hasAlpha) return `oklab(${lab.L.toFixed(4)} ${lab.a.toFixed(4)} ${lab.b.toFixed(4)} / ${rd(a)})`;
      return `oklab(${lab.L.toFixed(4)} ${lab.a.toFixed(4)} ${lab.b.toFixed(4)})`;
    }
    default:
      return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
}

/** Convert a CSS color string to a 6-digit hex for the native <input type="color">. */
export function colorToHex(color: string): string {
  const { r, g, b } = parseColor(color);
  const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/**
 * Map our ColorFormat to the `colorspace` attribute value understood by <color-input>.
 * 'named' → 'hex' (hex is the most faithful representation for named CSS colors).
 * 'rgba' → 'srgb' and 'hsla' → 'hsl' since <color-input>'s colorspace has no alpha variants.
 */
export function formatToColorspace(format: ColorFormat): ColorInputSpace {
  switch (format) {
    case 'hex':
    case 'named':
      return 'hex';
    case 'rgb':
    case 'rgba':
      return 'srgb';
    case 'hsl':
    case 'hsla':
      return 'hsl';
    case 'oklch':
      return 'oklch';
    case 'oklab':
      return 'oklab';
    default:
      return 'hex';
  }
}

/**
 * Map the `colorspace` attribute of <color-input> back to our ColorFormat, so
 * that when the user switches format in the chip's popover we can reformat the
 * written code in that format. Returns null for colorspaces we don't currently
 * emit (hwb, lab, lch, display-p3, rec2020, a98-rgb, prophoto, xyz…) so callers
 * can decide whether to keep the original source format or fall back.
 */
export function colorspaceToFormat(space: ColorInputSpace, hasAlpha: boolean = false): ColorFormat | null {
  switch (space) {
    case 'hex':
      return 'hex';
    case 'srgb':
      return hasAlpha ? 'rgba' : 'rgb';
    case 'hsl':
      return hasAlpha ? 'hsla' : 'hsl';
    case 'oklch':
      return 'oklch';
    case 'oklab':
      return 'oklab';
    default:
      return null;
  }
}
