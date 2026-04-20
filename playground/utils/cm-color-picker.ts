// CodeMirror 6 color picker extension — inline <color-input> chips.
// Scans define ... { } blocks for color-accepting properties and renders
// <color-input> elements whose built-in popover anchors to the chip via the
// package's own CSS anchor positioning.
//
// Color parsing/formatting utilities live in ./color.ts. Re-exported here for
// backward compatibility during the hdr-color-input migration — once all
// callers import from ./color.ts directly, these re-exports can be removed.

export { parseColor, formatColor, colorToHex } from './color.js';
export type { ParsedColor, ColorFormat } from './color.js';

import { parseColor, formatColor, detectFormat, formatToColorspace } from './color.js';
import type { ColorFormat } from './color.js';

/** Options for creating a color chip element. */
interface ColorChipOptions {
  color: string;
  /** Retained for backwards compatibility; unused by the current implementation. */
  container?: HTMLElement;
  onChange: (color: string) => void;
  className?: string;
  title?: string;
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

// Properties that accept color values
const COLOR_PROPERTIES: Set<string> = new Set(['stroke', 'fill', 'color', 'stop-color', 'flood-color', 'lighting-color']);

/** The native <color-input> element surface we use from chips. */
type ColorInputElement = HTMLElement & {
  value: string;
  colorspace: string;
  show(anchor?: Element): void;
  close(): void;
};

/**
 * A CM chip element is a `<color-input>` directly — its own built-in trigger
 * button IS the clickable chip, and its own popover anchors to that trigger
 * (via the package's CSS anchor positioning). No external positioning logic.
 * An `updateColor(c)` method lets non-CM callers (cm-textlayer-editor) update
 * the rendered value without recreating the element.
 */
export interface ColorChipElement extends HTMLElement {
  updateColor: (color: string) => void;
}

// ─── Color Chip (inline <color-input>) ──────────────────────────────────────

/**
 * CSS injected into each chip's own shadow root. Targeting :host from inside
 * the shadow wins over any external rules without needing ::part() piercing
 * across shadow boundaries.
 *
 * The critical rule is `font-size: 0` on :host — without it, the host
 * contributes a full `line-height` slot to its parent's line-box based on its
 * inherited font-size, which inflates the CM line from 20px to ~95px even
 * though our chip is only 14×14.
 */
const CHIP_SHADOW_CSS = `
  :host {
    font-size: 0 !important;
    line-height: 0 !important;
    display: inline-block !important;
    width: 14px !important;
    height: 14px !important;
    vertical-align: middle !important;
    margin-right: 4px !important;
    padding: 0 !important;
    gap: 0 !important;
    align-items: initial !important;
    position: relative !important;
    overflow: visible !important;
    cursor: pointer !important;
    box-sizing: border-box !important;
  }
  .trigger {
    position: absolute !important;
    inset: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 1px solid rgba(128, 128, 128, 0.4) !important;
    border-radius: 2px !important;
    box-sizing: border-box !important;
    background: transparent !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .trigger .chip {
    inline-size: 100% !important;
    block-size: 100% !important;
    border-radius: 1px !important;
    box-shadow: none !important;
    transition: none !important;
  }
  .input-wrapper { display: none !important; }
  /* Reset font-size inside the popover. The :host font-size: 0 rule (which
     prevents the chip from inflating the CM line-box) cascades into the panel
     and collapses elements that rely on em-based sizing. Using initial
     restores the browser default (medium/16px) so the package's own rem/cqi
     rules render at their intended proportions. */
  .panel {
    font-size: initial !important;
  }
`;

function injectChipShadowStyles(chip: HTMLElement): void {
  const sr = chip.shadowRoot;
  if (!sr) return;
  if (sr.querySelector('style[data-cm-chip]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-cm-chip', '');
  style.textContent = CHIP_SHADOW_CSS;
  sr.appendChild(style);
}

/**
 * Create a color chip. The chip is a `<color-input>` custom element from
 * hdr-color-input: the component's built-in trigger renders the colored chip
 * and its built-in popover opens anchored (via CSS anchor positioning inside
 * the component's shadow) to that same trigger — directly at the chip's
 * location in the editor.
 *
 * Source format is preserved: on every `change` the new value is re-formatted
 * in the source format (hex → hex, oklch → oklch, etc.) before being written
 * back via `onChange`.
 */
export function createColorChip({ color, onChange, className, title }: ColorChipOptions): ColorChipElement {
  const chip = document.createElement('color-input') as ColorInputElement & ColorChipElement;
  chip.className = `cm-color-chip${className ? ` ${className}` : ''}`;
  if (title) chip.title = title;
  // All chip styling (including sizing + font-size:0 to stop line-box bloat)
  // lives in a <style> inside the chip's own shadow root so it wins without
  // needing ::part() to pierce across nested shadow boundaries.
  injectChipShadowStyles(chip);

  const parsed = parseColor(color);
  let sourceFormat: ColorFormat = parsed.format;

  chip.setAttribute('value', color);
  chip.setAttribute('colorspace', formatToColorspace(sourceFormat));
  // Match the page's theme so the popover's --canvas / --canvas-text resolve
  // with project contrast (avoids white-on-white in dark mode).
  const pageTheme = document.documentElement.dataset.theme;
  if (pageTheme === 'light' || pageTheme === 'dark' || pageTheme === 'auto') {
    chip.setAttribute('theme', pageTheme);
  }

  // Preserve source format: capture the `change` event from the component and
  // reformat the raw value (e.g. "#abcdef") into whatever format the source
  // was authored in ("oklch(...)", "rgb(...)", etc.) before dispatching
  // through onChange. Suppress the reformatted value from re-entering the
  // component itself — we only want it written back to the editor text.
  chip.addEventListener('change', (ev: Event) => {
    const raw = (ev as CustomEvent<{ value: string }>).detail?.value ?? chip.value;
    if (!raw) return;
    const np = parseColor(raw);
    const out = sourceFormat === 'named' ? formatColor(np, 'hex') : formatColor(np, sourceFormat);
    color = out;
    onChange(out);
  });

  // Non-CM callers (e.g. cm-textlayer-editor) use updateColor to push a new
  // value without recreating the element.
  chip.updateColor = (c: string): void => {
    color = c;
    const p = parseColor(c);
    sourceFormat = p.format;
    chip.setAttribute('value', c);
    chip.setAttribute('colorspace', formatToColorspace(sourceFormat));
  };

  return chip;
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
        detectFormat(value) === 'named';

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
      detectFormat(colorStr) !== 'named'
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
    if (parsed.format === 'hex' && !fallback.startsWith('#') && detectFormat(fallback) !== 'named') {
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
  const { ViewPlugin, Decoration, WidgetType } = cmViewModule;

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
      // Store from/to in a mutable holder so updateDOM can update them in-place
      // when CodeMirror reuses this DOM across doc edits. Without this, the
      // onChange closure would capture stale positions and subsequent color
      // changes would dispatch to the wrong range.
      const range = { from: this.from, to: this.to };

      const chip = createColorChip({
        color: this.color,
        onChange: (newColor: string) => {
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: newColor },
          });
          range.to = range.from + newColor.length;
        },
      }) as ColorChipElement & { __range?: { from: number; to: number } };
      chip.setAttribute('aria-label', `Color: ${this.color}`);
      chip.__range = range;

      return chip;
    }

    /**
     * Called by CodeMirror when it could reuse the existing DOM for a new
     * widget instance (same type, different fields). Returning true keeps the
     * same `<color-input>` element in place — critical because the element's
     * popover anchor would be severed by a destroy+recreate, stranding the
     * picker mid-edit.
     */
    updateDOM(dom: HTMLElement, _view: any): boolean {
      const chip = dom as ColorChipElement & { __range?: { from: number; to: number } };
      if (typeof chip.updateColor !== 'function') return false;
      chip.updateColor(this.color);
      chip.setAttribute('aria-label', `Color: ${this.color}`);
      if (chip.__range) {
        chip.__range.from = this.from;
        chip.__range.to = this.to;
      }
      return true;
    }

    ignoreEvent(): boolean {
      // true = CodeMirror does not intercept events on the widget, so clicks
      // reach <color-input>'s own trigger button (which opens its popover).
      return true;
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

  // Chip styling is injected as a document-scope stylesheet from
  // createColorChip() via ensureChipStyles() — this avoids CM's baseTheme
  // mangling ::part() selectors that need to reach into color-input's shadow.
  return [colorPlugin];
}
