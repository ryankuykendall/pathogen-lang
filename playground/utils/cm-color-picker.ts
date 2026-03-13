// CodeMirror 6 color picker extension — inline color chips with native OS picker
// Scans define ... { } blocks for color-accepting properties and renders colored chips

/** Parsed color representation with RGBA values and source format. */
export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
  format: ColorFormat;
}

/** Supported CSS color output formats. */
type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'oklch' | 'oklab' | 'named';

/** Options for creating a color chip element. */
interface ColorChipOptions {
  color: string;
  container: HTMLElement;
  onChange: (color: string) => void;
  className?: string;
  title?: string;
}

/** A color chip element extended with an updateColor method. */
export interface ColorChipElement extends HTMLSpanElement {
  updateColor: (color: string) => void;
}

/** A found color range within the document text. */
interface ColorRange {
  from: number;
  to: number;
  color: string;
}

/**
 * CodeMirror view module — the object containing EditorView, ViewPlugin,
 * Decoration, and WidgetType constructors. Typed as `any` because CodeMirror 6
 * packages are loaded at runtime, not bundled with the playground.
 */
type CMViewModule = any;

const CSS_NAMED_COLORS: Set<string> = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]);

// Properties that accept color values
const COLOR_PROPERTIES: Set<string> = new Set(['stroke', 'fill', 'color', 'stop-color', 'flood-color', 'lighting-color']);

// ─── Color Conversion Utilities ─────────────────────────────────────────────

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

// ─── OKLab / OKLCH Conversion Utilities ──────────────────────────────────────
// Ported from src/color.ts — Ottosson's matrices for perceptually uniform color

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Convert 0–255 RGB to OKLab {L, a, b} */
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

/** Convert OKLab {L, a, b} to 0–255 RGB with gamut clamping */
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

/** Convert 0–255 RGB to OKLCH {L, C, H} */
function rgbToOKLCH(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lab = rgbToOKLab(r, g, b);
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

/** Convert OKLCH {L, C, H} to 0–255 RGB */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgb(L, a, b);
}

/**
 * Parse any CSS color string into {r, g, b, a, format}.
 * format: 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'named'
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

// Convert a CSS color string to a 6-digit hex for the native picker
export function colorToHex(color: string): string {
  const { r, g, b } = parseColor(color);
  const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

// ─── Color Picker Popup ─────────────────────────────────────────────────────

// Track the active popup so only one is open at a time
let activeColorPopup: HTMLElement | null = null;

function closeActiveColorPopup(): void {
  if (activeColorPopup) {
    activeColorPopup.remove();
    activeColorPopup = null;
  }
}

/**
 * Create a color chip element with a popup picker (native swatch + alpha slider + format selector).
 */
export function createColorChip({ color, container, onChange, className, title }: ColorChipOptions): ColorChipElement {
  const chip = document.createElement('span') as ColorChipElement;
  chip.className = `cm-color-chip${className ? ` ${className}` : ''}`;
  if (title) chip.title = title;

  let parsed = parseColor(color);

  const setChipVisual = (): void => {
    const c = formatColor(parsed, 'rgba');
    if (color === 'none') {
      chip.style.backgroundColor = 'transparent';
      chip.style.background = 'linear-gradient(135deg, #fff 45%, #f00 45%, #f00 55%, #fff 55%)';
    } else {
      chip.style.background = '';
      chip.style.backgroundColor = c;
    }
  };

  setChipVisual();

  chip.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Close any other open color popup
    closeActiveColorPopup();

    // Ensure styles are in the correct root (ShadowRoot or Document)
    ensurePopupStyles(container);

    // Build the popup
    const popup = document.createElement('div');
    popup.className = 'cm-color-popup';
    activeColorPopup = popup;

    // Read current parsed state fresh (in case updateColor was called)
    let { r, g, b, a, format } = parsed;

    // Determine format cycle order
    const FORMAT_CYCLE: string[] = ['hex', 'rgb', 'hsl', 'oklch', 'oklab'];
    // Normalize to base format for the toggle
    let activeFormat: string = format;
    if (activeFormat === 'rgba') activeFormat = 'rgb';
    if (activeFormat === 'hsla') activeFormat = 'hsl';
    if (activeFormat === 'named') activeFormat = 'hex';

    const emit = (): void => {
      // Re-derive the storage format: if alpha < 1 and base is rgb → rgba, etc.
      let outFormat = activeFormat;
      if (a < 1) {
        if (outFormat === 'rgb') outFormat = 'rgba';
        if (outFormat === 'hsl') outFormat = 'hsla';
      }
      parsed = { r, g, b, a, format: outFormat as ColorFormat };
      color = formatColor(parsed, outFormat as ColorFormat);
      setChipVisual();
      textInput.value = color;
      onChange(color);
    };

    // ── Row 1: native color swatch + alpha slider ──

    const row1 = document.createElement('div');
    row1.className = 'cm-color-popup-row';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'cm-color-popup-swatch';
    const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
    swatch.value = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    swatch.addEventListener('input', () => {
      const v = swatch.value;
      r = parseInt(v.slice(1, 3), 16);
      g = parseInt(v.slice(3, 5), 16);
      b = parseInt(v.slice(5, 7), 16);
      emit();
    });
    row1.appendChild(swatch);

    const alphaWrap = document.createElement('div');
    alphaWrap.className = 'cm-color-popup-alpha-wrap';

    const alphaSlider = document.createElement('input');
    alphaSlider.type = 'range';
    alphaSlider.className = 'cm-color-popup-alpha';
    alphaSlider.min = '0';
    alphaSlider.max = '100';
    alphaSlider.value = String(Math.round(a * 100));
    alphaSlider.addEventListener('input', () => {
      a = Number(alphaSlider.value) / 100;
      alphaLabel.textContent = `${alphaSlider.value}%`;
      emit();
    });

    const alphaLabel = document.createElement('span');
    alphaLabel.className = 'cm-color-popup-alpha-label';
    alphaLabel.textContent = `${Math.round(a * 100)}%`;

    alphaWrap.appendChild(alphaSlider);
    alphaWrap.appendChild(alphaLabel);
    row1.appendChild(alphaWrap);
    popup.appendChild(row1);

    // ── Row 2: format toggle + text value ──

    const row2 = document.createElement('div');
    row2.className = 'cm-color-popup-row';

    const formatBtn = document.createElement('button');
    formatBtn.className = 'cm-color-popup-format';
    formatBtn.textContent = activeFormat.toUpperCase();
    formatBtn.title = 'Cycle output format';
    formatBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const idx = FORMAT_CYCLE.indexOf(activeFormat);
      activeFormat = FORMAT_CYCLE[(idx + 1) % FORMAT_CYCLE.length];
      formatBtn.textContent = activeFormat.toUpperCase();
      emit();
    });
    row2.appendChild(formatBtn);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'cm-color-popup-text';
    textInput.value = color;
    textInput.addEventListener('change', () => {
      const newParsed = parseColor(textInput.value.trim());
      r = newParsed.r;
      g = newParsed.g;
      b = newParsed.b;
      a = newParsed.a;
      if (newParsed.format !== 'named') {
        activeFormat = newParsed.format;
        if (activeFormat === 'rgba') activeFormat = 'rgb';
        if (activeFormat === 'hsla') activeFormat = 'hsl';
        formatBtn.textContent = activeFormat.toUpperCase();
      }
      swatch.value = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
      alphaSlider.value = String(Math.round(a * 100));
      alphaLabel.textContent = `${Math.round(a * 100)}%`;
      emit();
    });
    row2.appendChild(textInput);
    popup.appendChild(row2);

    // ── Position and show ──

    container.appendChild(popup);
    const chipRect = chip.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    popup.style.left = `${chipRect.left - containerRect.left}px`;
    popup.style.top = `${chipRect.bottom - containerRect.top + 4}px`;

    // Keep in viewport
    requestAnimationFrame(() => {
      const popupRect = popup.getBoundingClientRect();
      if (popupRect.right > window.innerWidth - 8) {
        popup.style.left = `${Math.max(0, parseInt(popup.style.left) - (popupRect.right - window.innerWidth + 16))}px`;
      }
    });

    // ── Dismiss on click-outside or Escape ──

    const onClickOutside = (e: MouseEvent): void => {
      const path = e.composedPath();
      if (!path.includes(popup) && !path.includes(chip)) {
        dismiss();
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    const dismiss = (): void => {
      document.removeEventListener('mousedown', onClickOutside, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (popup.parentNode) popup.remove();
      if (activeColorPopup === popup) activeColorPopup = null;
    };

    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside, true);
    }, 50);
    document.addEventListener('keydown', onKeyDown, true);
  });

  chip.updateColor = (c: string): void => {
    color = c;
    parsed = parseColor(c);
    setChipVisual();
  };

  return chip;
}

// ─── Color Chip Popup Styles ─────────────────────────────────────────────────

// Injected lazily into whatever root node (ShadowRoot or Document) the popup
// lives in, so it works correctly inside Shadow DOM.
const POPUP_STYLE_ID = 'cm-color-popup-styles';
const POPUP_CSS = `
  .cm-color-popup {
    position: absolute;
    z-index: 1000;
    background: var(--bg-elevated, #fff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08);
    padding: 8px;
    width: 230px;
    font-family: var(--font-sans, -apple-system, sans-serif);
    font-size: 12px;
    color: var(--text-primary, #1a1a2e);
  }
  .cm-color-popup-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cm-color-popup-row + .cm-color-popup-row {
    margin-top: 6px;
  }
  .cm-color-popup-swatch {
    width: 32px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 4px;
    cursor: pointer;
    background: none;
    flex-shrink: 0;
  }
  .cm-color-popup-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
  .cm-color-popup-swatch::-webkit-color-swatch { border: none; border-radius: 2px; }
  .cm-color-popup-swatch::-moz-color-swatch { border: none; border-radius: 2px; }
  .cm-color-popup-alpha-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cm-color-popup-alpha {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right,
      transparent,
      var(--text-primary, #1a1a2e));
    border-radius: 2px;
    outline: none;
  }
  .cm-color-popup-alpha::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--bg-elevated, #fff);
    border: 2px solid var(--border-strong, #cbd5e1);
    cursor: pointer;
  }
  .cm-color-popup-alpha::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--bg-elevated, #fff);
    border: 2px solid var(--border-strong, #cbd5e1);
    cursor: pointer;
  }
  .cm-color-popup-alpha-label {
    font-size: 11px;
    color: var(--text-secondary, #64748b);
    min-width: 32px;
    text-align: right;
  }
  .cm-color-popup-format {
    padding: 2px 6px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 3px;
    background: var(--bg-tertiary, #f0f1f2);
    color: var(--text-secondary, #64748b);
    font-size: 10px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1.4;
  }
  .cm-color-popup-format:hover {
    background: var(--hover-bg, rgba(0,0,0,0.04));
  }
  .cm-color-popup-text {
    flex: 1;
    padding: 3px 6px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 3px;
    background: var(--bg-secondary, #fff);
    color: inherit;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    outline: none;
    min-width: 0;
  }
  .cm-color-popup-text:focus {
    border-color: var(--accent-color, #10b981);
    box-shadow: 0 0 0 2px var(--focus-ring, rgba(16,185,129,0.4));
  }
`;

function ensurePopupStyles(container: HTMLElement): void {
  const root = container.getRootNode() as Document | ShadowRoot;
  if ((root as Document).getElementById?.(POPUP_STYLE_ID) || (root as ShadowRoot).querySelector?.(`#${POPUP_STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = POPUP_STYLE_ID;
  style.textContent = POPUP_CSS;
  if (root === document) {
    document.head.appendChild(style);
  } else {
    // ShadowRoot — prepend so it doesn't interfere with component styles
    (root as ShadowRoot).prepend(style);
  }
}

// ─── Document Scanning ──────────────────────────────────────────────────────

// Find all ${ } style blocks in the document and extract color declarations
function findColorRanges(docText: string): ColorRange[] {
  const results: ColorRange[] = [];
  // Match all ${ ... } style blocks (in define statements, let assignments, etc.)
  const styleBlockRegex = /\$\{/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = styleBlockRegex.exec(docText)) !== null) {
    const openBrace = blockMatch.index + 1; // position of '{'

    let depth = 1;
    let closeBrace = -1;
    for (let i = openBrace + 1; i < docText.length; i++) {
      if (docText[i] === '{') depth++;
      else if (docText[i] === '}') {
        depth--;
        if (depth === 0) {
          closeBrace = i;
          break;
        }
      }
    }
    if (closeBrace === -1) continue;

    const blockContent = docText.slice(openBrace + 1, closeBrace);
    const blockStart = openBrace + 1;

    const declRegex = /([\w-]+)\s*:\s*([^;}\n]+)/g;
    let declMatch: RegExpExecArray | null;

    while ((declMatch = declRegex.exec(blockContent)) !== null) {
      const prop = declMatch[1].trim();
      const value = declMatch[2].trim();

      if (!COLOR_PROPERTIES.has(prop)) continue;
      if (value === 'none' || value === 'inherit' || value === 'currentColor') continue;

      const isColor =
        /^#[0-9a-fA-F]{3,8}$/.test(value) ||
        /^rgba?\(/.test(value) ||
        /^hsla?\(/.test(value) ||
        /^oklch\(/.test(value) ||
        /^oklab\(/.test(value) ||
        CSS_NAMED_COLORS.has(value.toLowerCase());

      if (!isColor) continue;

      const valueStart = blockStart + declMatch.index + declMatch[0].indexOf(value, prop.length + 1);
      const valueEnd = valueStart + value.length;

      results.push({ from: valueStart, to: valueEnd, color: value });
    }
  }

  // Scan for Color('...') and Color("...") constructor calls
  const colorCallRegex = /Color\(\s*(['"])([^'"]+)\1\s*\)/g;
  let colorCallMatch: RegExpExecArray | null;
  while ((colorCallMatch = colorCallRegex.exec(docText)) !== null) {
    const colorStr = colorCallMatch[2];
    // Validate it's a recognized color format
    const parsed = parseColor(colorStr);
    if (
      parsed.format === 'hex' &&
      colorStr !== 'none' &&
      !colorStr.startsWith('#') &&
      !CSS_NAMED_COLORS.has(colorStr.toLowerCase())
    ) {
      continue; // parseColor returned default — not a real color
    }
    // Position chip on just the color string INSIDE quotes (not including quotes)
    // This ensures the color picker replaces only the color value, preserving quotes
    const quote = colorCallMatch[1];
    const quotedStr = quote + colorStr + quote;
    const argStart = colorCallMatch.index + colorCallMatch[0].indexOf(quotedStr) + 1; // +1 to skip opening quote
    const argEnd = argStart + colorStr.length;
    results.push({ from: argStart, to: argEnd, color: colorStr });
  }

  // Scan for bare hex color literals: #cc0000, #f00, etc. (not inside quotes or style blocks)
  const bareHexRegex = /(?<!['"$])#[0-9a-fA-F]{3,8}\b/g;
  let bareHexMatch: RegExpExecArray | null;
  while ((bareHexMatch = bareHexRegex.exec(docText)) !== null) {
    const hex = bareHexMatch[0];
    const hexDigits = hex.slice(1);
    // Only valid lengths
    if (hexDigits.length !== 3 && hexDigits.length !== 4 && hexDigits.length !== 6 && hexDigits.length !== 8) continue;
    const from = bareHexMatch.index;
    const to = from + hex.length;
    // Skip if this position is already covered by a style block or Color() match
    if (results.some((r) => from >= r.from && to <= r.to)) continue;
    results.push({ from, to, color: hex });
  }

  // Scan for bare CSS color function literals: rgb(255, 0, 0), hsl(0, 100%, 50%), oklch(0.6 0.15 30), etc.
  const cssColorFuncRegex = /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\([^)]*\)/g;
  let cssColorFuncMatch: RegExpExecArray | null;
  while ((cssColorFuncMatch = cssColorFuncRegex.exec(docText)) !== null) {
    const colorStr = cssColorFuncMatch[0];
    const from = cssColorFuncMatch.index;
    const to = from + colorStr.length;
    // Skip if already covered by a style block match or Color() match
    if (results.some((r) => from >= r.from && to <= r.to)) continue;
    // Validate it's a parseable color
    try {
      parseColor(colorStr);
      results.push({ from, to, color: colorStr });
    } catch {
      // Not a valid color function — skip
    }
  }

  // Scan for CSSVar('--name', 'fallback') where fallback is a color
  const cssVarRegex = /CSSVar\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g;
  let cssVarMatch: RegExpExecArray | null;
  while ((cssVarMatch = cssVarRegex.exec(docText)) !== null) {
    const fallback = cssVarMatch[4];
    const parsed = parseColor(fallback);
    if (parsed.format === 'hex' && !fallback.startsWith('#') && !CSS_NAMED_COLORS.has(fallback.toLowerCase())) {
      continue;
    }
    const fbQuote = cssVarMatch[3];
    const fbStr = fbQuote + fallback + fbQuote;
    const fbStart = cssVarMatch.index + cssVarMatch[0].indexOf(fbStr, cssVarMatch[0].indexOf(','));
    const fbEnd = fbStart + fbStr.length;
    results.push({ from: fbStart, to: fbEnd, color: fallback });
  }

  return results;
}

// ─── CodeMirror Extension ───────────────────────────────────────────────────

export function colorPickerExtension(cmViewModule: CMViewModule): any[] {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = cmViewModule;

  class ColorChipWidget extends WidgetType {
    color: string;
    from: number;
    to: number;

    constructor(color: string, from: number, to: number) {
      super();
      this.color = color;
      this.from = from;
      this.to = to;
    }

    eq(other: ColorChipWidget): boolean {
      return this.color === other.color;
    }

    toDOM(view: any): HTMLElement {
      const currentFrom = this.from;
      let currentTo = this.to;
      const editorRoot = view.dom.closest('.cm-editor') || view.dom;

      const chip = createColorChip({
        color: this.color,
        container: editorRoot,
        onChange: (newColor: string) => {
          view.dispatch({
            changes: { from: currentFrom, to: currentTo, insert: newColor },
          });
          currentTo = currentFrom + newColor.length;
        },
      });
      chip.setAttribute('aria-label', `Color: ${this.color}`);

      return chip;
    }

    ignoreEvent(): boolean {
      return false;
    }
  }

  function buildDecorations(view: any): any {
    const docText = view.state.doc.toString();
    const colorRanges = findColorRanges(docText);
    const widgets: any[] = [];

    for (const { from, to, color } of colorRanges) {
      const deco = Decoration.widget({
        widget: new ColorChipWidget(color, from, to),
        side: -1,
      });
      widgets.push(deco.range(from));
    }

    return Decoration.set(widgets, true);
  }

  const colorPlugin = ViewPlugin.fromClass(
    class {
      decorations: any;

      constructor(view: any) {
        this.decorations = buildDecorations(view);
      }

      update(update: any): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (v: any) => v.decorations,
    },
  );

  const baseTheme = EditorView.baseTheme({
    '.cm-color-chip': {
      display: 'inline-block',
      width: '12px',
      height: '12px',
      borderRadius: '2px',
      border: '1px solid rgba(128,128,128,0.4)',
      verticalAlign: 'middle',
      marginRight: '4px',
      cursor: 'pointer',
      transition: 'transform 0.1s ease',
    },
    '.cm-color-chip:hover': {
      transform: 'scale(1.3)',
    },
    '&dark .cm-color-chip': {
      borderColor: 'rgba(200,200,200,0.3)',
    },
  });

  return [colorPlugin, baseTheme];
}
