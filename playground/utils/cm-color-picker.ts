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

import type { Tree } from '@lezer/common';

import { parseColor, formatColor, detectFormat, formatToColorspace, colorspaceToFormat } from './color.js';
import type { ColorFormat, ColorInputSpace } from './color.js';

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

  // sourceFormat is the output format for this chip, locked to whatever the
  // user authored in code and only changed when they explicitly pick a new
  // format from the `select.space` dropdown below. We intentionally ignore
  // the `colorspace` field on the change event's detail — <color-input>
  // re-emits it as 'hex' when it clamps a click to in-srgb-gamut, and
  // following that would silently rewrite oklch code to hex on the first
  // area-canvas interaction.
  chip.addEventListener('change', (ev: Event) => {
    const detail = (ev as CustomEvent<{ value: string; colorspace?: string }>).detail;
    const raw = detail?.value ?? chip.value;
    if (!raw) return;

    const np = parseColor(raw);
    // If parseColor fell back to all-zero-hex on a non-zero-looking input,
    // pass the raw string through unmodified rather than corrupting the code
    // with `#000000` / `rgb(0, 0, 0)`. The raw from <color-input> is already
    // valid CSS; we just can't reformat what we don't understand.
    const parseFailed = np.format === 'hex' && np.r === 0 && np.g === 0 && np.b === 0 && !/^(#0{3,8}|rgba?\(\s*0\s*,\s*0\s*,\s*0\b|black)/i.test(raw.trim());
    if (parseFailed) {
      color = raw;
      onChange(raw);
      return;
    }

    const out = sourceFormat === 'named' ? formatColor(np, 'hex') : formatColor(np, sourceFormat);
    color = out;
    onChange(out);
  });

  // Listen for the user's format dropdown changes (inside <color-input>'s
  // shadow root). Only when the user explicitly picks a new format does
  // sourceFormat change — component-internal colorspace switches (gamut
  // clamping etc.) do not.
  const attachSpaceListener = (): void => {
    const sel = chip.shadowRoot?.querySelector('select.space') as HTMLSelectElement | null;
    if (!sel) return;
    sel.addEventListener('change', () => {
      const mapped = colorspaceToFormat(sel.value as ColorInputSpace, false);
      if (mapped) sourceFormat = mapped;
    });
  };
  // The shadow content is populated lazily; try on the next frame if the
  // select isn't there yet.
  if (chip.shadowRoot?.querySelector('select.space')) attachSpaceListener();
  else queueMicrotask(attachSpaceListener);

  // Non-CM callers (e.g. cm-textlayer-editor) use updateColor to push a new
  // value without recreating the element.
  chip.updateColor = (c: string): void => {
    color = c;
    const p = parseColor(c);
    // Only sync sourceFormat / colorspace when parseColor actually resolved
    // the value. If it fell back to the zero-hex default on a non-zero input
    // (e.g. oklch with %/deg syntax our regex doesn't cover), keep the
    // existing sourceFormat — otherwise the chip's dropdown flips to 'hex'
    // and subsequent writes lose the user's original format.
    const parseFailed = p.format === 'hex' && p.r === 0 && p.g === 0 && p.b === 0 && !/^(#0{3,8}|rgba?\(\s*0\s*,\s*0\s*,\s*0\b|black)/i.test(c.trim());
    chip.setAttribute('value', c);
    if (!parseFailed) {
      sourceFormat = p.format;
      chip.setAttribute('colorspace', formatToColorspace(sourceFormat));
    }
  };

  return chip;
}

// ─── Document Scanning ──────────────────────────────────────────────────────

/**
 * Walk the Lezer syntax tree to find color ranges the chip can safely replace.
 *
 * Why AST instead of regex: the previous regex scanner matched color-shaped
 * substrings anywhere in the document, including inside plain string literals
 * and comments. Editing those ranges corrupts surrounding code (unbalanced
 * quotes, broken calls). The grammar already defines `ColorLiteral` and
 * `CSSColorLiteral` as first-class nodes and knows what's inside a string vs
 * a comment vs code, so we use it as the source of truth.
 *
 * Four sources of chips:
 *   1. `ColorLiteral` / `CSSColorLiteral` — bare colors in code (the inner
 *      style grammar also emits `ColorLiteral`, so hex colors anywhere inside
 *      a style value — including nested in `drop-shadow(...)` — flow through
 *      this same branch with document-absolute positions).
 *   2. `Color(String)` — the color is inside a string literal argument; we
 *      accept it because it's a known constructor and place the chip inside
 *      the quotes so replacements don't break them.
 *   3. `CSSVar('--name', String)` — same idea for the fallback argument.
 *   4. Style-block interiors: when the editor parser has mounted the inner
 *      style grammar over `StyleContent` (parseMixed), the walk descends into
 *      real `Declaration`/`Call` nodes — color-function calls (`rgb(...)`,
 *      `oklch(...)`) chip anywhere in any value, and bare NAMED colors chip
 *      only as the whole value of a color-typed property. That rule keeps
 *      identifiers on non-color properties (`filter: card;`) and identifiers
 *      that merely contain a color name (`tomatoJuice`) chip-free; a variable
 *      literally named after a CSS color (`let tomato = ...; stroke: tomato;`)
 *      still chips — the scanner has no scope info (pre-existing limitation,
 *      same as the regex fallback). When there is no mount (plain parser),
 *      the legacy regex scan runs as a fallback.
 */
export function findColorRanges(tree: Tree, docText: string): ColorRange[] {
  const results: ColorRange[] = [];
  // StyleContent ranges seen during the walk; `mounted` flips when the inner
  // grammar's top node (StyleSheet) appears inside the range.
  const styleRanges: Array<{ from: number; to: number; mounted: boolean }> = [];

  tree.iterate({
    enter: (node) => {
      const name = node.name;

      if (name === 'ColorLiteral' || name === 'CSSColorLiteral') {
        const text = docText.slice(node.from, node.to);
        results.push({ from: node.from, to: node.to, color: text });
        return true;
      }

      if (name === 'ArgList') {
        tryAddStringCallArg(node, docText, results);
        return true;
      }

      if (name === 'StyleContent') {
        styleRanges.push({ from: node.from, to: node.to, mounted: false });
        return true;
      }

      // Inner style grammar top node — marks its StyleContent as mounted.
      if (name === 'StyleSheet') {
        const range = styleRanges.find((r) => node.from >= r.from && node.to <= r.to);
        if (range) range.mounted = true;
        return true;
      }

      // Inner style grammar: whole-call chip for CSS color functions.
      // Returning false skips children so nested hex args (e.g. inside a
      // future color-mix) don't produce overlapping chips.
      if (name === 'Call') {
        const text = docText.slice(node.from, node.to);
        if (isColorString(text)) {
          results.push({ from: node.from, to: node.to, color: text });
          return false;
        }
        return true;
      }

      // Inner style grammar: bare named-color values (`stroke: tomato;`)
      // chip only when the whole value of a color-typed property is a single
      // identifier that names a CSS color.
      if (name === 'Declaration') {
        tryAddNamedColorValue(node, docText, results);
        return true;
      }

      return true;
    },
  });

  // Regex fallback for style blocks with no mounted inner tree (callers still
  // parsing with the plain lezerParser).
  for (const range of styleRanges) {
    if (!range.mounted) addStyleBlockColors(docText, range.from, range.to, results);
  }

  // Sort by position so downstream ordering is stable.
  results.sort((a, b) => a.from - b.from);
  return results;
}

/**
 * For an inner-grammar Declaration node, chip a bare named-color value
 * (`stroke: tomato;`) — only when the property is color-typed and the entire
 * value is a single Identifier naming a CSS color. Hex literals and color
 * functions are handled by the generic ColorLiteral/Call branches on ANY
 * property; this rule exists because a bare identifier is ambiguous with a
 * Pathogen variable reference. NOTE: the ambiguity is only narrowed, not
 * solved — a variable whose name is itself a CSS color name (`tomato`) still
 * chips, because this scanner sees only the tree + text, not scope. A
 * scope-aware exclusion is a recorded follow-up
 * (project-docs/style-block-structure/primer.md).
 */
function tryAddNamedColorValue(declRef: LezerNodeRef, docText: string, out: ColorRange[]): void {
  let propName: string | null = null;
  let valueChild: LezerNodeRef | null = null;
  let valueCount = 0;
  let child = declRef.node.firstChild;
  while (child) {
    if (child.name === 'PropertyName') {
      propName = docText.slice(child.from, child.to);
    } else if (child.name !== ':' && child.name !== ';' && child.name !== 'LineComment') {
      valueCount++;
      valueChild = child;
    }
    child = child.node.nextSibling;
  }
  if (!propName || !COLOR_PROPERTIES.has(propName)) return;
  if (valueCount !== 1 || !valueChild || valueChild.name !== 'Identifier') return;
  const text = docText.slice(valueChild.from, valueChild.to);
  if (text === 'none' || text === 'inherit' || text === 'currentColor') return;
  if (detectFormat(text) !== 'named') return;
  out.push({ from: valueChild.from, to: valueChild.to, color: text });
}

type LezerNodeRef = { name: string; from: number; to: number; node: { prevSibling: LezerNodeRef | null; firstChild: LezerNodeRef | null; nextSibling: LezerNodeRef | null } };

/**
 * For an ArgList node, check if its previous sibling is an Identifier whose
 * name is `Color` or `CSSVar`, and extract the relevant string argument's
 * color content.
 *
 * `postfixExpression` in the grammar is inlined, so a function call
 * `Color('#f00')` appears as sibling nodes `Identifier` + `ArgList` rather
 * than a wrapping `CallExpression`.
 */
function tryAddStringCallArg(argListRef: LezerNodeRef, docText: string, out: ColorRange[]): void {
  const prev = argListRef.node.prevSibling;
  if (!prev || prev.name !== 'Identifier') return;
  const fnName = docText.slice(prev.from, prev.to);
  if (fnName !== 'Color' && fnName !== 'CSSVar') return;

  const stringArgs: LezerNodeRef[] = [];
  let child = argListRef.node.firstChild;
  while (child) {
    if (child.name === 'String') stringArgs.push(child);
    child = child.node.nextSibling;
  }
  if (stringArgs.length === 0) return;

  const target = fnName === 'Color' ? stringArgs[0] : stringArgs[1];
  if (!target) return;

  // Strip quotes: grammar's String node includes both delimiters.
  const from = target.from + 1;
  const to = target.to - 1;
  if (to <= from) return;
  const inner = docText.slice(from, to);

  if (!isColorString(inner)) return;
  out.push({ from, to, color: inner });
}

/**
 * Scan a style-block's raw content range for color-accepting CSS property
 * declarations. The grammar does not parse style-block internals, but knowing
 * we're inside `StyleContent` (as opposed to, say, a string literal that
 * happens to contain `stroke: #fff`) means the regex below is safe.
 */
function addStyleBlockColors(docText: string, from: number, to: number, out: ColorRange[]): void {
  const block = docText.slice(from, to);
  const declRegex = /([\w-]+)\s*:\s*([^;}\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = declRegex.exec(block)) !== null) {
    const prop = m[1].trim();
    const value = m[2].trim();
    if (!COLOR_PROPERTIES.has(prop)) continue;
    if (value === 'none' || value === 'inherit' || value === 'currentColor') continue;
    if (!isColorString(value)) continue;
    const valueStart = from + m.index + m[0].indexOf(value, prop.length + 1);
    const valueEnd = valueStart + value.length;
    out.push({ from: valueStart, to: valueEnd, color: value });
  }
}

function isColorString(s: string): boolean {
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return true;
  // Include `color(...)` (for predefined-colorspace literals emitted by
  // hdr-color-input when the user picks srgb-linear, display-p3, etc.) so
  // the safety check in the chip's onChange dispatch treats them as valid
  // replacement targets.
  if (/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(s)) return true;
  if (detectFormat(s) === 'named') return true;
  return false;
}

// ─── CodeMirror Extension ───────────────────────────────────────────────────

/**
 * CodeMirror `@codemirror/language` module — supplies `syntaxTree(state)` for
 * the AST-based scan. Typed as `any` for the same reason as CMViewModule:
 * the package is loaded dynamically via ESM CDN and isn't bundled.
 */
type CMLanguageModule = any;

export function colorPickerExtension(cmViewModule: CMViewModule, cmLanguageModule: CMLanguageModule): any[] {
  const { ViewPlugin, Decoration, WidgetType } = cmViewModule;
  const syntaxTree = cmLanguageModule.syntaxTree as (state: any) => Tree;

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

    toDOM(view: any): HTMLElement {
      // Store from/to in a mutable holder so updateDOM can update them in-place
      // when CodeMirror reuses this DOM across doc edits. Without this, the
      // onChange closure would capture stale positions and subsequent color
      // changes would dispatch to the wrong range.
      const range = { from: this.from, to: this.to };

      const chip = createColorChip({
        color: this.color,
        onChange: (newColor: string) => {
          // Safety: only dispatch if the text at our stored range still looks
          // like a color literal. hdr-color-input fires rapid change events
          // during slider drags — if CM hasn't finished applying an earlier
          // dispatch when the next event arrives, `range` may point at text
          // that is no longer a color. Dispatching anyway corrupts the code
          // (replaces PathLayer arguments, breaks quotes, etc.). Drop the
          // event instead — the next decoration rebuild will make a fresh
          // widget with a correct range.
          const { from, to } = range;
          if (from < 0 || to > view.state.doc.length || from >= to) return;
          const existing = view.state.doc.sliceString(from, to);
          if (!isColorString(existing)) return;
          if (existing === newColor) return;
          view.dispatch({
            changes: { from, to, insert: newColor },
          });
          range.to = from + newColor.length;
        },
      }) as ColorChipElement & { __range?: { from: number; to: number } };
      chip.setAttribute('aria-label', `Color: ${this.color}`);
      chip.__range = range;

      return chip;
    }

    /**
     * Returning true retains the existing `<color-input>` element across
     * decoration rebuilds, keeping the popover (and any in-flight drag) alive.
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
    const tree = syntaxTree(view.state);
    const colorRanges = findColorRanges(tree, docText);
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
