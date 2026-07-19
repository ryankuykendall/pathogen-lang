/**
 * Converts every <text>/<tspan> in an SVG subtree to vector <path> outlines
 * using opentype.js, so exports carry no font dependencies at all.
 *
 * Used by the Export-with-Legend PDF path: PDF viewers and print RIPs cannot
 * substitute fonts that aren't referenced, so outlined text renders
 * identically everywhere — the whole point of the print-ready export.
 *
 * Font binaries come from the playground font loader (Google Fonts CSS →
 * WOFF2 → TTF), which opentype.js v1 can parse directly. Both the loader and
 * the opentype module are injectable for tests.
 */

import { fetchFontBinary } from '../services/font-loader.js';

interface OtPath {
  toPathData(decimalPlaces?: number): string;
}

interface OtFont {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  getPath(text: string, x: number, y: number, fontSize: number, options?: object): OtPath;
  getAdvanceWidth(text: string, fontSize: number, options?: object): number;
}

interface OpentypeModule {
  parse(buffer: ArrayBuffer): OtFont;
}

export interface OutlineOptions {
  /** Injectable font fetch for tests; resolves to a TTF/OTF ArrayBuffer or null. */
  loadFont?: (family: string, weight: number) => Promise<ArrayBuffer | null>;
  /** Injectable opentype module for tests (defaults to the vendored bundle). */
  opentype?: OpentypeModule;
  /** Family tried when every family in a text element's stack fails. */
  fallbackFamily?: string;
}

export interface OutlineResult {
  /** Number of <text> elements replaced with outline groups. */
  outlinedCount: number;
  /** Human-readable notes about fallbacks or elements left un-outlined. */
  warnings: string[];
}

/** Attributes copied from the <text> element onto its replacement <g>. */
const GROUP_ATTRS = ['fill', 'fill-opacity', 'opacity', 'transform', 'class', 'id', 'data-layer-name'];

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
]);

let _vendorOpentype: OpentypeModule | null = null;

async function loadVendorOpentype(): Promise<OpentypeModule> {
  if (!_vendorOpentype) {
    // Path is relative to the transpiled output at public/utils/. The variable
    // specifier + @vite-ignore keeps vitest's import analysis from trying to
    // resolve the vendor bundle, which only exists in the build output.
    const vendorPath = '../vendor/opentype.js';
    const mod = (await import(/* @vite-ignore */ vendorPath)) as
      | OpentypeModule
      | { default: OpentypeModule };
    // Handle CJS default-export wrapping (same pattern as src/evaluator/font-provider.ts).
    _vendorOpentype =
      typeof (mod as { default?: OpentypeModule }).default?.parse === 'function'
        ? (mod as { default: OpentypeModule }).default
        : (mod as OpentypeModule);
  }
  return _vendorOpentype;
}

async function defaultLoadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const outcome = await fetchFontBinary(family, weight);
  return outcome.ok ? outcome.buffer : null;
}

function parseStyleProps(styleAttr: string | null): Map<string, string> {
  const props = new Map<string, string>();
  if (!styleAttr) return props;
  for (const decl of styleAttr.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    props.set(decl.slice(0, idx).trim().toLowerCase(), decl.slice(idx + 1).trim());
  }
  return props;
}

/** Resolve a presentation property: style attribute wins over the attribute. */
function getProp(el: Element, name: string): string | null {
  const style = parseStyleProps(el.getAttribute('style'));
  return style.get(name) ?? el.getAttribute(name);
}

function parseFontWeight(raw: string | null): number {
  if (!raw) return 400;
  if (raw === 'bold') return 700;
  if (raw === 'normal') return 400;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 400;
}

function parseLength(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function splitFamilyStack(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter((f) => f.length > 0);
}

interface RunStyle {
  families: string[];
  weight: number;
  fontStyle: string;
  fontSize: number;
  letterSpacing: number;
  fill: string | null;
  fillOpacity: string | null;
}

interface TextRun {
  text: string;
  style: RunStyle;
  /** Explicit x on the tspan — starts a new anchor line. */
  x: number | null;
  y: number | null;
  dx: number;
  dy: number;
  rotate: number | null;
  preserveSpace: boolean;
}

function styleFrom(el: Element, parent: RunStyle | null): RunStyle {
  const familyRaw = getProp(el, 'font-family');
  const weightRaw = getProp(el, 'font-weight');
  const styleRaw = getProp(el, 'font-style');
  const sizeRaw = getProp(el, 'font-size');
  const spacingRaw = getProp(el, 'letter-spacing');
  return {
    families: familyRaw ? splitFamilyStack(familyRaw) : (parent?.families ?? []),
    weight: weightRaw ? parseFontWeight(weightRaw) : (parent?.weight ?? 400),
    fontStyle: styleRaw ?? parent?.fontStyle ?? 'normal',
    fontSize: sizeRaw ? parseLength(sizeRaw, 16) : (parent?.fontSize ?? 16),
    letterSpacing: spacingRaw ? parseLength(spacingRaw, 0) : (parent?.letterSpacing ?? 0),
    fill: el.getAttribute('fill') ?? null,
    fillOpacity: el.getAttribute('fill-opacity') ?? null,
  };
}

function isSpacePreserved(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.getAttribute('xml:space') === 'preserve') return true;
    const ws = parseStyleProps(node.getAttribute('style')).get('white-space');
    if (ws === 'pre') return true;
    if (node.tagName.toLowerCase() === 'svg') break;
  }
  return false;
}

function collapseWhitespace(text: string): string {
  return text.replace(/[\s ]+/g, ' ');
}

/** Collect renderable runs from a <text> element's children in document order. */
function collectRuns(textEl: Element): TextRun[] {
  const baseStyle = styleFrom(textEl, null);
  const basePreserve = isSpacePreserved(textEl);
  const runs: TextRun[] = [];

  const pushRun = (raw: string, el: Element | null, style: RunStyle, preserve: boolean): void => {
    const text = preserve ? raw : collapseWhitespace(raw);
    if (text.length === 0) return;
    runs.push({
      text,
      style,
      x: el ? (el.hasAttribute('x') ? parseLength(el.getAttribute('x'), 0) : null) : null,
      y: el ? (el.hasAttribute('y') ? parseLength(el.getAttribute('y'), 0) : null) : null,
      dx: el ? parseLength(el.getAttribute('dx'), 0) : 0,
      dy: el ? parseLength(el.getAttribute('dy'), 0) : 0,
      rotate: el && el.hasAttribute('rotate') ? parseLength(el.getAttribute('rotate'), 0) : null,
      preserveSpace: preserve,
    });
  };

  for (const node of Array.from(textEl.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushRun(node.textContent ?? '', null, baseStyle, basePreserve);
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'tspan') {
      const tspan = node as Element;
      // Nested tspans are flattened into their parent tspan's run.
      pushRun(tspan.textContent ?? '', tspan, styleFrom(tspan, baseStyle), basePreserve || isSpacePreserved(tspan));
    }
  }
  return runs;
}

type FontResolver = (families: string[], weight: number) => Promise<{ font: OtFont; family: string } | null>;

function createFontResolver(
  loadFont: (family: string, weight: number) => Promise<ArrayBuffer | null>,
  opentype: OpentypeModule,
): FontResolver {
  const cache = new Map<string, OtFont | null>();

  const loadOne = async (family: string, weight: number): Promise<OtFont | null> => {
    const key = `${family}:${weight}`;
    if (cache.has(key)) return cache.get(key)!;
    let font: OtFont | null = null;
    try {
      const buffer = await loadFont(family, weight);
      if (buffer) font = opentype.parse(buffer);
    } catch {
      font = null;
    }
    cache.set(key, font);
    return font;
  };

  return async (families, weight) => {
    for (const family of families) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      // Try the requested weight, then regular as a same-family fallback.
      let font = await loadOne(family, weight);
      if (!font && weight !== 400) font = await loadOne(family, 400);
      if (font) return { font, family };
    }
    return null;
  };
}

function baselineOffset(font: OtFont, fontSize: number, dominantBaseline: string | null): number {
  const upm = font.unitsPerEm;
  switch (dominantBaseline) {
    // Browsers place the hanging baseline near the ascender.
    case 'hanging':
      return (font.ascender / upm) * fontSize;
    case 'middle':
    case 'central':
      return ((font.ascender + font.descender) / (2 * upm)) * fontSize;
    default:
      // 'auto' / alphabetic: y already is the baseline.
      return 0;
  }
}

/**
 * Replace every <text> element under `root` with a <g> of <path> outlines.
 * Elements whose fonts cannot be resolved are left in place, with a warning.
 */
export async function outlineSvgText(root: SVGElement, opts: OutlineOptions = {}): Promise<OutlineResult> {
  const loadFont = opts.loadFont ?? defaultLoadFont;
  const opentype = opts.opentype ?? (await loadVendorOpentype());
  const fallbackFamily = opts.fallbackFamily ?? 'Inter';
  const resolveFont = createFontResolver(loadFont, opentype);

  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (message: string): void => {
    if (!warned.has(message)) {
      warned.add(message);
      warnings.push(message);
    }
  };

  let outlinedCount = 0;
  const doc = root.ownerDocument!;
  const ns = 'http://www.w3.org/2000/svg';

  for (const textEl of Array.from(root.querySelectorAll('text'))) {
    const runs = collectRuns(textEl);
    if (runs.length === 0) {
      textEl.remove();
      continue;
    }

    const dominantBaseline = getProp(textEl, 'dominant-baseline');
    const textAnchor = getProp(textEl, 'text-anchor');

    // Resolve fonts for every run up front; bail on the whole element if any
    // run has no usable font (partial outlining would look broken).
    const resolved: { run: TextRun; font: OtFont }[] = [];
    let missing = false;
    for (const run of runs) {
      let hit = await resolveFont(run.style.families, run.style.weight);
      if (!hit) {
        hit = await resolveFont([fallbackFamily], run.style.weight);
        if (hit) {
          warnOnce(
            `'${run.style.families[0] ?? '(no font-family)'}' could not be loaded — outlined with ${fallbackFamily}`,
          );
        }
      }
      if (!hit) {
        missing = true;
        break;
      }
      if (run.style.fontStyle === 'italic' || run.style.fontStyle === 'oblique') {
        warnOnce(`Italic text is outlined with upright glyphs — italic variants are not fetched yet`);
      }
      resolved.push({ run, font: hit.font });
    }
    if (missing) {
      warnOnce(
        `Text "${(textEl.textContent ?? '').trim().slice(0, 40)}" was left as live text — no font could be loaded`,
      );
      continue;
    }

    // --- Lay out runs with a pen, grouping into anchor lines ---
    interface PlacedRun {
      run: TextRun;
      font: OtFont;
      startX: number;
      baselineY: number;
      advance: number;
      lineIndex: number;
    }
    const placed: PlacedRun[] = [];
    const lineAdvance: number[] = [];

    let penX = parseLength(textEl.getAttribute('x'), 0);
    let penY = parseLength(textEl.getAttribute('y'), 0);
    let lineIndex = 0;

    for (const { run, font } of resolved) {
      if (run.x !== null) {
        penX = run.x;
        // An explicit x starts a new line for text-anchor purposes.
        if (placed.length > 0) lineIndex++;
      }
      if (run.y !== null) penY = run.y;
      penX += run.dx;
      penY += run.dy;

      const fontSize = run.style.fontSize;
      const otOptions = {
        kerning: true,
        letterSpacing: run.style.letterSpacing !== 0 ? run.style.letterSpacing / fontSize : undefined,
      };
      const advance = font.getAdvanceWidth(run.text, fontSize, otOptions);
      const baselineY = penY + baselineOffset(font, fontSize, dominantBaseline);

      placed.push({ run, font, startX: penX, baselineY, advance, lineIndex });
      lineAdvance[lineIndex] = (lineAdvance[lineIndex] ?? 0) + advance;
      penX += advance;
    }

    // --- Anchor shift per line ---
    const anchorShift = (line: number): number => {
      const width = lineAdvance[line] ?? 0;
      if (textAnchor === 'end') return -width;
      if (textAnchor === 'middle') return -width / 2;
      return 0;
    };

    // --- Emit outline group ---
    const group = doc.createElementNS(ns, 'g');
    for (const attr of GROUP_ATTRS) {
      const value = textEl.getAttribute(attr);
      if (value !== null) group.setAttribute(attr, value);
    }
    group.setAttribute('data-outlined-text', 'true');

    for (const p of placed) {
      const fontSize = p.run.style.fontSize;
      const startX = p.startX + anchorShift(p.lineIndex);
      const otOptions = {
        kerning: true,
        letterSpacing: p.run.style.letterSpacing !== 0 ? p.run.style.letterSpacing / fontSize : undefined,
      };
      const pathData = p.font.getPath(p.run.text, startX, p.baselineY, fontSize, otOptions).toPathData(3);
      if (!pathData) continue;

      const pathEl = doc.createElementNS(ns, 'path');
      pathEl.setAttribute('d', pathData);
      if (p.run.style.fill) pathEl.setAttribute('fill', p.run.style.fill);
      if (p.run.style.fillOpacity) pathEl.setAttribute('fill-opacity', p.run.style.fillOpacity);
      if (p.run.rotate !== null) {
        pathEl.setAttribute('transform', `rotate(${p.run.rotate}, ${startX}, ${p.baselineY})`);
      }
      group.appendChild(pathEl);
    }

    textEl.replaceWith(group);
    outlinedCount++;
  }

  return { outlinedCount, warnings };
}
