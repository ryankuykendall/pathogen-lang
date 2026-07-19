/**
 * Normalizes SVG paint colors to sRGB hex before PDF conversion.
 *
 * svg2pdf.js parses hex / rgb() / named colors but NOT modern CSS color
 * functions — `oklch()`, `lab()`, `color()` — which Pathogen uses everywhere
 * (palettes, the HDR color picker, CSS variables). Unparseable paints fall
 * back to black in the PDF, which reads as a completely broken export.
 *
 * The browser is the conversion engine, but NOT via the fillStyle read-back
 * trick: modern Chrome preserves CSS Color 4 serializations (`oklch(...)`) in
 * the getter. Instead we paint a 1×1 pixel and read the sRGB bytes back with
 * getImageData — colorimetrically exact for any color the browser can parse.
 * `var(...)` references are resolved through getComputedStyle first, which
 * requires the root to be attached to the document.
 */

const PAINT_ATTRS = ['fill', 'stroke', 'stop-color', 'color'] as const;

/** Values svg2pdf already understands or that are not colors at all. */
const SKIP_VALUE = /^(none|inherit|currentColor|transparent|context-fill|context-stroke)$|url\(/i;
const ALREADY_SRGB = /^#|^rgb\(/i;

let _ctx: CanvasRenderingContext2D | null = null;

interface ResolvedColor {
  hex: string;
  /** Color-carried alpha in [0, 1), or null when fully opaque. */
  alpha: number | null;
}

function canvasResolve(value: string): ResolvedColor | null {
  if (!_ctx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    _ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!_ctx) return null;
  }
  const ctx = _ctx;

  // fillStyle silently keeps its previous value on invalid input — assign a
  // sentinel first so parse failures are detectable.
  ctx.fillStyle = '#010203';
  const sentinel = ctx.fillStyle;
  ctx.fillStyle = value;
  if (ctx.fillStyle === sentinel && value.trim().toLowerCase() !== '#010203') return null;

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const alpha = d[3] / 255;
  if (alpha === 0) return { hex: '#000000', alpha: 0 };
  const hex = `#${[d[0], d[1], d[2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  return { hex, alpha: alpha < 1 ? Math.round(alpha * 1000) / 1000 : null };
}

function opacityAttrFor(attr: string): string | null {
  switch (attr) {
    case 'fill':
      return 'fill-opacity';
    case 'stroke':
      return 'stroke-opacity';
    case 'stop-color':
      return 'stop-opacity';
    default:
      return null;
  }
}

function applyAlpha(el: Element, attr: string, alpha: number): void {
  const opacityAttr = opacityAttrFor(attr);
  if (!opacityAttr) return;
  const existing = parseFloat(el.getAttribute(opacityAttr) ?? '1');
  const combined = (Number.isFinite(existing) ? existing : 1) * alpha;
  el.setAttribute(opacityAttr, String(Math.round(combined * 1000) / 1000));
}

/**
 * Resolve any CSS color (hex, rgb, named, oklch, lab, …) to sRGB hex, or null
 * if the value is missing, non-color, or unparseable. Alpha is dropped.
 */
export function resolveCssColorToHex(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (SKIP_VALUE.test(trimmed)) return null;
  return canvasResolve(trimmed)?.hex ?? null;
}

/**
 * Rewrite every fill/stroke/stop-color/color (attribute and inline style) under
 * `root` to sRGB hex, folding color alpha into the matching *-opacity attribute.
 *
 * `root` must be attached to the document so `var(...)` references resolve.
 * Values that cannot be resolved are left untouched.
 */
export function normalizeSvgPaintColors(root: SVGElement): void {
  const elements: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of elements) {
    for (const attr of PAINT_ATTRS) {
      // Presentation attribute
      const attrValue = el.getAttribute(attr)?.trim();
      if (attrValue && !SKIP_VALUE.test(attrValue) && !ALREADY_SRGB.test(attrValue)) {
        const source = attrValue.includes('var(')
          ? getComputedStyle(el).getPropertyValue(attr) || attrValue
          : attrValue;
        const resolved = canvasResolve(source);
        if (resolved) {
          el.setAttribute(attr, resolved.hex);
          if (resolved.alpha !== null && resolved.alpha < 1) applyAlpha(el, attr, resolved.alpha);
        }
      }

      // Inline style declaration
      const style = (el as SVGElement).style;
      const styleValue = style?.getPropertyValue(attr)?.trim();
      if (styleValue && !SKIP_VALUE.test(styleValue) && !ALREADY_SRGB.test(styleValue)) {
        const source = styleValue.includes('var(')
          ? getComputedStyle(el).getPropertyValue(attr) || styleValue
          : styleValue;
        const resolved = canvasResolve(source);
        if (resolved) {
          style.setProperty(attr, resolved.hex);
          if (resolved.alpha !== null && resolved.alpha < 1) applyAlpha(el, attr, resolved.alpha);
        }
      }
    }
  }
}
