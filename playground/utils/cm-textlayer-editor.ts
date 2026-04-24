// CodeMirror 6 TextLayer style editor extension
// Adds an "Aa" button next to TextLayer constructors and @font directives that
// opens a multi-property style editor.

import type { Tree } from '@lezer/common';

import { createColorChip } from './cm-color-picker.js';
import { parseColor } from './color.js';
import { fetchGoogleFonts, getAvailableWeights, loadGoogleFont } from './google-fonts.js';

/** Strip surrounding `'...'` or `"..."` from a CSS font-family value. */
function unquoteFontFamily(raw: string): string {
  const m = raw.trim().match(/^(['"])(.*)\1$/);
  return m ? m[2] : raw.trim();
}

/**
 * Quote a font family for writing back into CSS if the name contains
 * whitespace or punctuation (e.g. "Comic Sans MS"). Simple identifiers like
 * `Roboto`, `sans-serif`, and `monospace` stay unquoted — quoting a generic
 * keyword silently changes its meaning in CSS.
 */
function quoteFontFamily(name: string): string {
  if (/\s|[^a-zA-Z0-9_-]/.test(name)) return `'${name}'`;
  return name;
}

/**
 * Wire ArrowUp/ArrowDown/Enter/Escape on a font-family input to its dropdown
 * of `.cm-textlayer-font-item` matches. The index is owned by the caller via
 * `getIndex` / `setIndex` so whichever popup uses this can also highlight
 * and scroll the active item into view in its own way.
 */
function attachFontFamilyKeyboardNav(
  input: HTMLInputElement,
  dropdown: HTMLElement,
  opts: { getIndex: () => number; setIndex: (i: number) => void },
): void {
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll('.cm-textlayer-font-item');
    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      opts.setIndex(Math.min(items.length - 1, opts.getIndex() + 1));
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      opts.setIndex(Math.max(0, opts.getIndex() - 1));
    } else if (e.key === 'Enter') {
      const idx = opts.getIndex();
      if (idx < 0 || !items.length) return;
      e.preventDefault();
      e.stopPropagation();
      (items[idx] as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = 'none';
      input.blur();
    }
  });
}

/** WCAG relative luminance — 0 (black) to 1 (white). */
function relativeLuminance(r: number, g: number, b: number): number {
  const chan = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/**
 * hdr-color-input renders an internal `<button class="trigger" title="...">`
 * inside its shadow root that takes precedence over the host's title
 * attribute. Reach in and replace it so chip hovers show our label.
 */
function overrideInnerTooltip(chip: HTMLElement, label: string): void {
  const apply = (): void => {
    const trigger = chip.shadowRoot?.querySelector('.trigger') as HTMLElement | null;
    if (trigger) trigger.setAttribute('title', label);
  };
  apply();
  // Component might populate its shadow on the next frame; retry once.
  queueMicrotask(apply);
}

/** Parsed style properties from a define block. */
type StyleProps = Map<string, string>;

/** A found TextLayer constructor (either `define TextLayer(...) ${...}` or `let x = TextLayer(...) ${...}`). */
export interface TextLayerTarget {
  kind: 'textlayer';
  /** Position just after the `TextLayer` keyword — where the "Aa" button is inserted. */
  buttonPos: number;
  /** Start of editable style-block content (right after `${`). */
  blockFrom: number;
  /** End of editable style-block content (right before `}`). */
  blockTo: number;
  props: StyleProps;
}

/** A found `@font "family" [weight];` directive. */
export interface FontDirectiveTarget {
  kind: 'fontdirective';
  /** Position just after the `@font` keyword — where the button is inserted. */
  buttonPos: number;
  /** Start of the family name inside the quotes. */
  familyFrom: number;
  /** End of the family name inside the quotes. */
  familyTo: number;
  /** Start of the weight number, or null if absent. */
  weightFrom: number | null;
  /** End of the weight number, or null if absent. */
  weightTo: number | null;
}

export type FontTarget = TextLayerTarget | FontDirectiveTarget;

/** Alias retained for the existing popup code, which reads the TextLayer shape. */
type TextLayerBlock = TextLayerTarget;

/** A select option for dropdowns. */
interface SelectOption {
  value: string;
  label: string;
}

/** A Google Font entry returned by fetchGoogleFonts. */
interface FontEntry {
  family: string;
  category: string;
  variants?: number[];
  isSystem?: boolean;
}

/**
 * CodeMirror view module — the object containing EditorView, ViewPlugin,
 * Decoration, and WidgetType constructors. Typed as `any` because CodeMirror 6
 * packages are loaded at runtime, not bundled with the playground.
 */
type CMViewModule = any;

// Parse style properties from a define block's inner content
function parseStyleBlock(content: string): StyleProps {
  const props: StyleProps = new Map();
  const declRegex = /([\w-]+)\s*:\s*([^;}\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(content)) !== null) {
    props.set(match[1].trim(), match[2].trim());
  }
  return props;
}

/**
 * Walk the Lezer syntax tree to find places a font chip should render:
 *
 * 1. `LayerType` nodes whose text is `TextLayer` (covers both
 *    `define TextLayer(...) ${...}` via `LayerDefinition` and
 *    `let x = TextLayer(...) ${...}` via `LayerConstructor` — both shapes
 *    put a `StyleBlockLiteral` as a following sibling).
 * 2. `FontDirective` nodes — the `@font 'family' [weight];` form.
 *
 * Using the AST (rather than the previous regex scanner) means we never
 * emit a chip on text that sits inside a string literal or a comment —
 * the grammar has already classified those correctly.
 */
export function findFontTargets(tree: Tree, docText: string): FontTarget[] {
  const results: FontTarget[] = [];

  tree.iterate({
    enter: (ref) => {
      const name = ref.name;

      if (name === 'LayerType') {
        const text = docText.slice(ref.from, ref.to);
        if (text !== 'TextLayer') return true;

        // Find a following `StyleBlockLiteral` sibling. Both
        // LayerDefinition (`define TextLayer(...) ${...}`) and
        // LayerConstructor (`let x = TextLayer(...) ${...}`) place it as
        // one of the siblings after the `( ... )` argument list.
        let sib: any = (ref as any).node.nextSibling;
        let styleBlock: any = null;
        while (sib) {
          if (sib.name === 'StyleBlockLiteral') {
            styleBlock = sib;
            break;
          }
          sib = sib.nextSibling;
        }
        if (!styleBlock) return true;

        // StyleBlockLiteral = `${` + optional StyleContent + `}`. The
        // editable range is between the two braces regardless of whether
        // Lezer materialised a StyleContent node for it.
        const blockFrom = styleBlock.from + 2; // skip `${`
        const blockTo = styleBlock.to - 1; // skip `}`
        if (blockTo < blockFrom) return true;

        const content = docText.slice(blockFrom, blockTo);
        results.push({
          kind: 'textlayer',
          buttonPos: ref.to,
          blockFrom,
          blockTo,
          props: parseStyleBlock(content),
        });
        return true;
      }

      if (name === 'FontDirective') {
        const directiveNode = (ref as any).node;
        let child: any = directiveNode.firstChild;
        let stringNode: any = null;
        let numberNode: any = null;
        while (child) {
          if (child.name === 'String' && !stringNode) stringNode = child;
          else if (child.name === 'Number' && !numberNode) numberNode = child;
          child = child.nextSibling;
        }
        if (!stringNode) return true;

        // Grammar precedence recovery: when a following statement is
        // incomplete (e.g. a bare `@font` on the next line), Lezer shortens
        // the current FontDirective to `@font String` and re-parses the
        // weight Number as a stray ExpressionStatement. Single-line cases
        // don't hit this — but as soon as the user starts typing a second
        // `@font` line, the first directive's weight disappears from the
        // AST. Look at the next sibling: if it's an ExpressionStatement
        // wrapping a single Number, we treat that Number as the weight.
        if (!numberNode) {
          const nextSib: any = directiveNode.nextSibling;
          if (nextSib && nextSib.name === 'ExpressionStatement') {
            const first = nextSib.firstChild;
            if (first && first.name === 'Number' && (!first.nextSibling || first.nextSibling.name === ';')) {
              numberNode = first;
            }
          }
        }

        // Strip quotes from the String node — its range spans both
        // delimiters.
        const familyFrom = stringNode.from + 1;
        const familyTo = stringNode.to - 1;
        if (familyTo <= familyFrom) return true;

        results.push({
          kind: 'fontdirective',
          buttonPos: ref.from + '@font '.length,
          familyFrom,
          familyTo,
          weightFrom: numberNode ? numberNode.from : null,
          weightTo: numberNode ? numberNode.to : null,
        });
        return true;
      }

      return true;
    },
  });

  results.sort((a, b) => a.buttonPos - b.buttonPos);
  return results;
}

// Serialize style properties back to block content
function serializeStyleBlock(props: StyleProps): string {
  const lines: string[] = [];
  for (const [key, value] of props) {
    if (value !== undefined && value !== '') {
      lines.push(`  ${key}: ${value};`);
    }
  }
  return `\n${lines.join('\n')}\n`;
}

// Singleton: track which popup is currently open
let activePopup: { close(): void } | null = null;

function closeActivePopup(): void {
  if (activePopup) {
    activePopup.close();
    activePopup = null;
  }
}

type CMLanguageModule = any;

export function textLayerEditorExtension(cmViewModule: CMViewModule, cmLanguageModule: CMLanguageModule): any[] {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = cmViewModule;
  const syntaxTree = cmLanguageModule.syntaxTree as (state: any) => Tree;

  /** Re-walk the current doc's AST to find the target closest to this buttonPos. */
  function findTextLayerNear(view: any, buttonPos: number): TextLayerTarget | null {
    const tree = syntaxTree(view.state);
    const text = view.state.doc.toString();
    const targets = findFontTargets(tree, text);
    const match = targets.find(
      (t) => t.kind === 'textlayer' && Math.abs(t.buttonPos - buttonPos) < 5,
    );
    return match && match.kind === 'textlayer' ? match : null;
  }

  class TextLayerWidget extends WidgetType {
    block: TextLayerBlock;
    fontFamily: string;

    constructor(block: TextLayerBlock) {
      super();
      this.block = block;
      this.fontFamily = unquoteFontFamily(block.props.get('font-family') || 'sans-serif');
    }

    toDOM(view: any): HTMLElement {
      const btn = document.createElement('span') as HTMLSpanElement & {
        __blockRef?: { current: TextLayerBlock };
      };
      btn.className = 'cm-textlayer-btn';
      btn.textContent = 'Aa';
      btn.title = 'Edit TextLayer styles';
      btn.style.fontFamily = this.fontFamily;

      // Mutable ref so the click handler on this retained DOM always uses
      // the current block's buttonPos. Without it, after the user prepends
      // a second TextLayer in the doc, clicking the retained chip would
      // look up against the original (now-stale) position and open a popup
      // for the wrong layer.
      const blockRef = { current: this.block };
      btn.__blockRef = blockRef;

      btn.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        closeActivePopup();
        const block = findTextLayerNear(view, blockRef.current.buttonPos);
        if (!block) return;
        const popup = new TextLayerPopup(view, block, btn, findTextLayerNear);
        activePopup = popup;
      });

      return btn;
    }

    updateDOM(dom: HTMLElement, _view: any): boolean {
      const btn = dom as HTMLSpanElement & {
        __blockRef?: { current: TextLayerBlock };
      };
      if (btn.__blockRef) btn.__blockRef.current = this.block;
      btn.style.fontFamily = this.fontFamily;
      return true;
    }

    ignoreEvent(): boolean {
      return false;
    }
  }

  class FontDirectiveWidget extends WidgetType {
    target: FontDirectiveTarget;

    constructor(target: FontDirectiveTarget) {
      super();
      this.target = target;
    }

    toDOM(view: any): HTMLElement {
      const btn = document.createElement('span') as HTMLSpanElement & {
        __targetRef?: { current: FontDirectiveTarget };
      };
      btn.className = 'cm-textlayer-btn';
      btn.textContent = 'Aa';
      btn.title = 'Pick font family';

      // Mutable ref so the click handler on this retained DOM always sees
      // the latest target's buttonPos after editor edits shift positions.
      // updateDOM below mutates .current in place when CM reuses this DOM
      // for a new widget instance.
      const targetRef = { current: this.target };
      btn.__targetRef = targetRef;

      btn.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        closeActivePopup();
        const fresh = findFontDirectiveNear(view, targetRef.current.buttonPos);
        if (!fresh) return;
        const popup = new FontDirectivePopup(
          view,
          fresh,
          btn,
          (v) => findFontDirectiveNear(v, targetRef.current.buttonPos),
        );
        activePopup = popup;
      });

      return btn;
    }

    updateDOM(dom: HTMLElement, _view: any): boolean {
      const btn = dom as HTMLSpanElement & {
        __targetRef?: { current: FontDirectiveTarget };
      };
      if (btn.__targetRef) btn.__targetRef.current = this.target;
      return true;
    }

    ignoreEvent(): boolean {
      return false;
    }
  }

  /** AST lookup by nearest buttonPos — shared by the widget's click handler
   *  and the popup's _applyChanges so both always use a current target.  */
  function findFontDirectiveNear(view: any, buttonPos: number): FontDirectiveTarget | null {
    const tree = syntaxTree(view.state);
    const text = view.state.doc.toString();
    const targets = findFontTargets(tree, text);
    const match = targets.find(
      (t) => t.kind === 'fontdirective' && Math.abs(t.buttonPos - buttonPos) < 5,
    );
    return match && match.kind === 'fontdirective' ? match : null;
  }

  class TextLayerPopup {
    view: any;
    block: TextLayerBlock;
    props: StyleProps;
    el: HTMLElement | null;
    fontListEl: HTMLElement | null;
    private _previewEl: HTMLElement | null = null;
    private _previewBg: string = 'var(--bg-primary, #f8f9fa)';
    private _fontInput: HTMLInputElement | null = null;
    private _weightSelect: HTMLSelectElement | null = null;
    private _fonts: FontEntry[] = [];
    private _scroller: HTMLElement | null = null;
    private _bgManual: boolean = false;
    private _bgChip: HTMLElement | null = null;
    private _fontListIndex: number = -1;

    /**
     * Looks up the current target in the AST each time a change is applied
     * so dispatches survive earlier edits that shifted positions. Provided
     * by the widget so the popup doesn't need the language module directly.
     */
    private _lookup: (view: any, buttonPos: number) => TextLayerTarget | null;

    constructor(
      view: any,
      block: TextLayerBlock,
      anchorEl: HTMLElement,
      lookup: (view: any, buttonPos: number) => TextLayerTarget | null,
    ) {
      this.view = view;
      this.block = block;
      this.props = new Map(block.props);
      this.el = null;
      this.fontListEl = null;
      this._lookup = lookup;
      this._onClickOutside = this._onClickOutside.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onScroll = this._onScroll.bind(this);

      // Set defaults for missing properties
      if (!this.props.has('font-family')) this.props.set('font-family', 'sans-serif');
      if (!this.props.has('font-weight')) this.props.set('font-weight', '400');
      if (!this.props.has('font-style')) this.props.set('font-style', 'normal');
      if (!this.props.has('font-size')) this.props.set('font-size', '14');
      if (!this.props.has('fill')) this.props.set('fill', '#000000');
      if (!this.props.has('stroke')) this.props.set('stroke', 'none');
      if (!this.props.has('stroke-width')) this.props.set('stroke-width', '0');

      this._build(anchorEl);
      this._attachListeners();
      this._loadFonts();
    }

    _build(anchorEl: HTMLElement): void {
      const popup = document.createElement('div');
      popup.className = 'cm-textlayer-editor';
      this.el = popup;

      // Position below the anchor button
      const editorRoot = this.view.dom.closest('.cm-editor') || this.view.dom;
      const editorRect = editorRoot.getBoundingClientRect();
      const btnRect = anchorEl.getBoundingClientRect();

      popup.style.position = 'absolute';
      popup.style.left = `${btnRect.left - editorRect.left}px`;
      popup.style.top = `${btnRect.bottom - editorRect.top + 4}px`;
      popup.style.zIndex = '1000';

      // Preview area — background is chosen dynamically to contrast with
      // the current fill until the user overrides via the chip.
      const preview = document.createElement('div');
      preview.className = 'cm-textlayer-preview';
      this._previewEl = preview;
      this._bgManual = false;
      this._previewBg = this._computeContrastingBg();
      this._updatePreview();
      popup.appendChild(preview);

      // Manual override chip. Positioned absolutely over the preview but
      // held OUTSIDE the preview element on purpose — the preview carries
      // inline font-family/weight/style so the Aa glyph reflects the edited
      // layer, and those would otherwise inherit into <color-input>'s
      // shadow tree (including its popover) and render the hex readout in
      // the user's italic 900 display font. Keeping the chip as a sibling
      // of preview (not a child) keeps it on the popup's font chain.
      const bgChip = createColorChip({
        color: this._previewBg,
        className: 'cm-textlayer-preview-bg-chip',
        title: 'Set background color',
        onChange: (c: string) => {
          preview.style.background = c;
          this._previewBg = c;
          this._bgManual = true;
          this._updateBgChipBorder();
        },
      });
      this._bgChip = bgChip;
      overrideInnerTooltip(bgChip, 'Set background color');
      popup.appendChild(bgChip);

      // Controls
      const controls = document.createElement('div');
      controls.className = 'cm-textlayer-controls';

      // Font family
      controls.appendChild(this._buildFontFamilyRow());
      // Font weight
      controls.appendChild(this._buildSelectRow('Font Weight', 'font-weight', this._getWeightOptions()));
      // Font style
      controls.appendChild(
        this._buildSelectRow('Font Style', 'font-style', [
          { value: 'normal', label: 'Normal' },
          { value: 'italic', label: 'Italic' },
        ]),
      );
      // Font size
      controls.appendChild(this._buildNumberRow('Font Size', 'font-size', 1, 200));

      // Separator
      const sep = document.createElement('div');
      sep.className = 'cm-textlayer-sep';
      controls.appendChild(sep);

      // Fill
      controls.appendChild(this._buildColorRow('Fill', 'fill'));
      // Stroke
      controls.appendChild(this._buildColorRow('Stroke', 'stroke'));
      // Stroke width
      controls.appendChild(this._buildNumberRow('Stroke Width', 'stroke-width', 0, 50));

      popup.appendChild(controls);
      editorRoot.style.position = 'relative';
      editorRoot.appendChild(popup);

      // Keep popup in viewport
      requestAnimationFrame(() => {
        const popupRect = popup.getBoundingClientRect();
        const viewportW = window.innerWidth;
        if (popupRect.right > viewportW - 8) {
          popup.style.left = `${Math.max(0, parseInt(popup.style.left) - (popupRect.right - viewportW + 16))}px`;
        }
      });
    }

    _buildFontFamilyRow(): HTMLElement {
      const row = document.createElement('div');
      row.className = 'cm-textlayer-row';

      const label = document.createElement('label');
      label.textContent = 'Font Family';
      row.appendChild(label);

      const wrapper = document.createElement('div');
      wrapper.className = 'cm-textlayer-font-wrapper';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cm-textlayer-font-input';
      // Strip quotes for display/filter. The style block stores the raw
      // CSS value (e.g. `'Roboto'`); leaving the quotes in the input would
      // make the dropdown filter search for `'Roboto'` against unquoted
      // font names and return zero matches — which in turn gives the arrow
      // keys nothing to navigate through.
      input.value = unquoteFontFamily(this.props.get('font-family') || '');
      input.placeholder = 'Search fonts...';

      const dropdown = document.createElement('div');
      dropdown.className = 'cm-textlayer-font-dropdown';
      dropdown.style.display = 'none';
      this.fontListEl = dropdown;

      input.addEventListener('focus', () => {
        this._fontListIndex = -1;
        this._populateFontList(input.value);
        dropdown.style.display = '';
      });

      input.addEventListener('input', () => {
        this._fontListIndex = -1;
        this._populateFontList(input.value);
        dropdown.style.display = '';
      });

      attachFontFamilyKeyboardNav(input, dropdown, {
        getIndex: () => this._fontListIndex,
        setIndex: (i) => {
          this._fontListIndex = i;
          this._highlightFontItem();
        },
      });

      // Close dropdown on blur with delay so clicks register
      input.addEventListener('blur', () => {
        setTimeout(() => {
          dropdown.style.display = 'none';
        }, 200);
      });

      this._fontInput = input;
      wrapper.appendChild(input);
      wrapper.appendChild(dropdown);
      row.appendChild(wrapper);

      return row;
    }

    /** Visually highlight the item at `_fontListIndex` and scroll it into view. */
    _highlightFontItem(): void {
      const dropdown = this.fontListEl;
      if (!dropdown) return;
      const items = dropdown.querySelectorAll('.cm-textlayer-font-item');
      items.forEach((el, i) => {
        if (i === this._fontListIndex) el.classList.add('is-active');
        else el.classList.remove('is-active');
      });
      const active = items[this._fontListIndex] as HTMLElement | undefined;
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    async _loadFonts(): Promise<void> {
      this._fonts = await fetchGoogleFonts();
      // Pre-load the current font
      loadGoogleFont(unquoteFontFamily(this.props.get('font-family') || ''));
    }

    _populateFontList(filter: string): void {
      const dropdown = this.fontListEl;
      if (!dropdown) return;
      dropdown.innerHTML = '';

      const fonts = this._fonts || [];
      const lowerFilter = filter.toLowerCase();
      const matches = fonts.filter((f: FontEntry) => f.family.toLowerCase().includes(lowerFilter)).slice(0, 40);

      for (const font of matches) {
        const item = document.createElement('div');
        item.className = 'cm-textlayer-font-item';
        item.textContent = font.family;
        if (!font.isSystem) {
          loadGoogleFont(font.family);
          item.style.fontFamily = `"${font.family}", ${font.category}`;
        } else {
          item.style.fontFamily = font.family;
        }
        if (font.isSystem) {
          item.classList.add('cm-textlayer-font-system');
        }

        item.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          this._fontInput!.value = font.family;
          // Quote the value before writing it back so names containing
          // spaces round-trip safely and generic keywords stay usable.
          this.props.set('font-family', quoteFontFamily(font.family));
          loadGoogleFont(font.family);
          this._updateWeightSelect();
          this._updatePreview();
          this._applyChanges();
          dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
      }
    }

    _getWeightOptions(): SelectOption[] {
      const family = unquoteFontFamily(this.props.get('font-family') || '');
      const weights = getAvailableWeights(family);
      const labels: Record<number, string> = {
        100: '100 (Thin)',
        200: '200 (ExtraLight)',
        300: '300 (Light)',
        400: '400 (Regular)',
        500: '500 (Medium)',
        600: '600 (SemiBold)',
        700: '700 (Bold)',
        800: '800 (ExtraBold)',
        900: '900 (Black)',
      };
      return weights.map((w: number) => ({ value: String(w), label: labels[w] || String(w) }));
    }

    _updateWeightSelect(): void {
      if (!this._weightSelect) return;
      const options = this._getWeightOptions();
      this._weightSelect.innerHTML = '';
      for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        this._weightSelect.appendChild(el);
      }
      // Reset to 400 if current weight is unavailable
      const currentWeight = this.props.get('font-weight') || '400';
      if (options.some((o: SelectOption) => o.value === currentWeight)) {
        this._weightSelect.value = currentWeight;
      } else {
        this._weightSelect.value = '400';
        this.props.set('font-weight', '400');
      }
    }

    _buildSelectRow(labelText: string, prop: string, options: SelectOption[]): HTMLElement {
      const row = document.createElement('div');
      row.className = 'cm-textlayer-row';

      const label = document.createElement('label');
      label.textContent = labelText;
      row.appendChild(label);

      const select = document.createElement('select');
      select.className = 'cm-textlayer-select';
      for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        select.appendChild(el);
      }
      select.value = this.props.get(prop) || options[0].value;

      select.addEventListener('change', () => {
        this.props.set(prop, select.value);
        this._updatePreview();
        this._applyChanges();
      });

      if (prop === 'font-weight') {
        this._weightSelect = select;
      }

      row.appendChild(select);
      return row;
    }

    _buildNumberRow(labelText: string, prop: string, min: number, max: number): HTMLElement {
      const row = document.createElement('div');
      row.className = 'cm-textlayer-row';

      const label = document.createElement('label');
      label.textContent = labelText;
      row.appendChild(label);

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'cm-textlayer-number';
      input.min = String(min);
      input.max = String(max);
      input.value = this.props.get(prop) || '0';

      input.addEventListener('input', () => {
        this.props.set(prop, input.value);
        this._updatePreview();
        this._applyChanges();
      });

      // Shift+ArrowUp/Down steps by 10 instead of the native 1. Browsers
      // don't provide a configurable "large step" for number inputs, so we
      // intercept and apply the delta manually.
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!e.shiftKey) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? 10 : -10;
        const current = parseFloat(input.value) || 0;
        const next = Math.max(min, Math.min(max, current + delta));
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      row.appendChild(input);
      return row;
    }

    _buildColorRow(labelText: string, prop: string): HTMLElement {
      const row = document.createElement('div');
      row.className = 'cm-textlayer-row';

      const label = document.createElement('label');
      label.textContent = labelText;
      row.appendChild(label);

      const wrapper = document.createElement('div');
      wrapper.className = 'cm-textlayer-color-wrapper';

      const currentVal = this.props.get(prop) || '#000000';

      const chip = createColorChip({
        color: currentVal,
        container: wrapper,
        onChange: (c: string) => {
          textInput.value = c;
          this.props.set(prop, c);
          this._updatePreview();
          this._applyChanges();
        },
      });

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'cm-textlayer-color-text';
      textInput.value = currentVal;

      textInput.addEventListener('change', () => {
        const val = textInput.value.trim();
        this.props.set(prop, val);
        chip.updateColor(val);
        this._updatePreview();
        this._applyChanges();
      });

      wrapper.appendChild(chip);
      wrapper.appendChild(textInput);
      row.appendChild(wrapper);
      return row;
    }

    _updatePreview(): void {
      if (!this._previewEl) return;
      // Source style block may store the family quoted (`'Roboto'`) or bare
      // (`Roboto`); strip either way before we build the fallback chain.
      const family = unquoteFontFamily(this.props.get('font-family') || 'sans-serif');
      const weight = this.props.get('font-weight') || '400';
      const style = this.props.get('font-style') || 'normal';
      const size = this.props.get('font-size') || '14';
      const fill = this.props.get('fill') || '#000000';

      this._previewEl.textContent = 'Aa';
      this._previewEl.style.fontFamily = `"${family}", ${family}`;
      this._previewEl.style.fontWeight = weight;
      this._previewEl.style.fontStyle = style;
      this._previewEl.style.fontSize = `${Math.min(parseInt(size) || 14, 64)}px`;
      this._previewEl.style.color = fill === 'none' ? '#888' : fill;

      // Recompute the preview background from the current fill unless the
      // user has explicitly overridden it via the bg chip.
      if (!this._bgManual) {
        this._previewBg = this._computeContrastingBg();
      }
      this._previewEl.style.background = this._previewBg;
      this._updateBgChipBorder();

      const stroke = this.props.get('stroke');
      const strokeWidth = this.props.get('stroke-width');
      if (stroke && stroke !== 'none' && parseInt(strokeWidth || '0') > 0) {
        (this._previewEl.style as any).webkitTextStroke = `${strokeWidth}px ${stroke}`;
      } else {
        (this._previewEl.style as any).webkitTextStroke = '';
      }
    }

    /**
     * Pick a preview background that contrasts with the current text fill.
     * Uses WCAG relative luminance: dark text gets a light bg, light text
     * gets a dark bg, with slight tinting so the surface feels like UI chrome
     * rather than pure black/white.
     */
    _computeContrastingBg(): string {
      const fill = this.props.get('fill') || '#000000';
      if (fill === 'none') return '#f5f5f7';
      try {
        const parsed = parseColor(fill);
        const l = relativeLuminance(parsed.r, parsed.g, parsed.b);
        return l > 0.5 ? '#1f2937' : '#f5f5f7';
      } catch {
        return '#f5f5f7';
      }
    }

    /** Keep the chip's border visible against whatever bg it sits on. */
    _updateBgChipBorder(): void {
      if (!this._bgChip) return;
      const bg = this._previewBg;
      let border = 'rgba(255,255,255,0.5)';
      try {
        const parsed = parseColor(bg);
        const l = relativeLuminance(parsed.r, parsed.g, parsed.b);
        border = l > 0.5 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
      } catch {
        // fall back
      }
      this._bgChip.style.outline = `1px solid ${border}`;
      this._bgChip.style.outlineOffset = '1px';
      this._bgChip.style.borderRadius = '3px';
    }

    _applyChanges(): void {
      const block = this._lookup(this.view, this.block.buttonPos);
      if (!block) return;

      // Safety: confirm the range still brackets a style block before
      // overwriting. Guards against rapid edits that shifted positions
      // between the popup opening and the dispatch firing.
      const doc = this.view.state.doc;
      const before = doc.sliceString(Math.max(0, block.blockFrom - 2), block.blockFrom);
      const after = doc.sliceString(block.blockTo, Math.min(doc.length, block.blockTo + 1));
      if (before !== '${' || after !== '}') return;

      const newContent = serializeStyleBlock(this.props);
      this.view.dispatch({
        changes: { from: block.blockFrom, to: block.blockTo, insert: newContent },
      });

      // Update stored block position references for subsequent edits.
      this.block.buttonPos = block.buttonPos;
      this.block.blockFrom = block.blockFrom;
      this.block.blockTo = block.blockFrom + newContent.length;
    }

    _attachListeners(): void {
      // Delay attaching click-outside to avoid immediate dismiss
      setTimeout(() => {
        document.addEventListener('mousedown', this._onClickOutside, true);
      }, 50);
      document.addEventListener('keydown', this._onKeyDown, true);
      // Close on editor scroll
      const scroller = this.view.dom.querySelector('.cm-scroller') as HTMLElement | null;
      if (scroller) scroller.addEventListener('scroll', this._onScroll);
      this._scroller = scroller;
    }

    _onClickOutside(e: MouseEvent): void {
      if (!this.el) return;
      // Use composedPath to handle Shadow DOM retargeting
      const path = e.composedPath();
      if (!path.includes(this.el)) {
        this.close();
      }
    }

    _onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    }

    _onScroll(): void {
      this.close();
    }

    close(): void {
      document.removeEventListener('mousedown', this._onClickOutside, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
      if (this._scroller) this._scroller.removeEventListener('scroll', this._onScroll);
      if (this.el && this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
      this.el = null;
      if (activePopup === this) activePopup = null;
    }
  }

  /**
   * Smaller popup for `@font "family" [weight];` directives. Exposes only
   * the two properties a font directive has — family and optional weight —
   * since the full TextLayer editor's font-size/style/fill/stroke rows
   * don't apply to a preload directive.
   */
  class FontDirectivePopup {
    view: any;
    target: FontDirectiveTarget;
    el: HTMLElement | null = null;
    fontListEl: HTMLElement | null = null;
    private _family: string;
    private _weight: string;
    private _fontInput: HTMLInputElement | null = null;
    private _weightSelect: HTMLSelectElement | null = null;
    private _fonts: FontEntry[] = [];
    private _scroller: HTMLElement | null = null;
    private _lookup: (view: any) => FontDirectiveTarget | null;
    private _fontListIndex: number = -1;

    constructor(
      view: any,
      target: FontDirectiveTarget,
      anchorEl: HTMLElement,
      lookup: (view: any) => FontDirectiveTarget | null,
    ) {
      this.view = view;
      this.target = target;
      this._lookup = lookup;
      const docText = view.state.doc.toString();
      this._family = docText.slice(target.familyFrom, target.familyTo);
      this._weight =
        target.weightFrom != null && target.weightTo != null
          ? docText.slice(target.weightFrom, target.weightTo)
          : '';
      this._onClickOutside = this._onClickOutside.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onScroll = this._onScroll.bind(this);

      this._build(anchorEl);
      this._attachListeners();
      this._loadFonts();
    }

    _build(anchorEl: HTMLElement): void {
      const popup = document.createElement('div');
      popup.className = 'cm-textlayer-editor';
      this.el = popup;

      const editorRoot = this.view.dom.closest('.cm-editor') || this.view.dom;
      const editorRect = editorRoot.getBoundingClientRect();
      const btnRect = anchorEl.getBoundingClientRect();

      popup.style.position = 'absolute';
      popup.style.left = `${btnRect.left - editorRect.left}px`;
      popup.style.top = `${btnRect.bottom - editorRect.top + 4}px`;
      popup.style.zIndex = '1000';

      const controls = document.createElement('div');
      controls.className = 'cm-textlayer-controls';

      // Font family row
      const familyRow = document.createElement('div');
      familyRow.className = 'cm-textlayer-row';
      const famLabel = document.createElement('label');
      famLabel.textContent = 'Font Family';
      familyRow.appendChild(famLabel);
      const famWrapper = document.createElement('div');
      famWrapper.className = 'cm-textlayer-font-wrapper';
      const famInput = document.createElement('input');
      famInput.type = 'text';
      famInput.className = 'cm-textlayer-font-input';
      famInput.value = this._family;
      famInput.placeholder = 'Search fonts...';
      const dropdown = document.createElement('div');
      dropdown.className = 'cm-textlayer-font-dropdown';
      dropdown.style.display = 'none';
      this.fontListEl = dropdown;
      famInput.addEventListener('focus', () => {
        this._fontListIndex = -1;
        this._populateFontList(famInput.value);
        dropdown.style.display = '';
      });
      famInput.addEventListener('input', () => {
        this._fontListIndex = -1;
        this._populateFontList(famInput.value);
        dropdown.style.display = '';
      });
      famInput.addEventListener('blur', () => {
        setTimeout(() => (dropdown.style.display = 'none'), 200);
      });
      attachFontFamilyKeyboardNav(famInput, dropdown, {
        getIndex: () => this._fontListIndex,
        setIndex: (i) => {
          this._fontListIndex = i;
          this._highlightFontItem();
        },
      });
      this._fontInput = famInput;
      famWrapper.appendChild(famInput);
      famWrapper.appendChild(dropdown);
      familyRow.appendChild(famWrapper);
      controls.appendChild(familyRow);

      // Font weight row
      const weightRow = document.createElement('div');
      weightRow.className = 'cm-textlayer-row';
      const wLabel = document.createElement('label');
      wLabel.textContent = 'Font Weight';
      weightRow.appendChild(wLabel);
      const weightSelect = document.createElement('select');
      weightSelect.className = 'cm-textlayer-select';
      this._weightSelect = weightSelect;
      this._refillWeightOptions();
      weightSelect.addEventListener('change', () => {
        this._weight = weightSelect.value;
        this._applyChanges();
      });
      weightRow.appendChild(weightSelect);
      controls.appendChild(weightRow);

      popup.appendChild(controls);
      editorRoot.style.position = 'relative';
      editorRoot.appendChild(popup);

      requestAnimationFrame(() => {
        const popupRect = popup.getBoundingClientRect();
        const viewportW = window.innerWidth;
        if (popupRect.right > viewportW - 8) {
          popup.style.left = `${Math.max(0, parseInt(popup.style.left) - (popupRect.right - viewportW + 16))}px`;
        }
      });
    }

    async _loadFonts(): Promise<void> {
      this._fonts = await fetchGoogleFonts();
      if (this._family) loadGoogleFont(this._family);
      // Fonts load async; re-fill the weight options now that
      // getAvailableWeights has the real per-family data, otherwise the
      // dropdown is stuck with an empty list from the pre-load moment.
      this._refillWeightOptions();
    }

    _populateFontList(filter: string): void {
      const dropdown = this.fontListEl;
      if (!dropdown) return;
      dropdown.innerHTML = '';
      const fonts = this._fonts || [];
      const lowerFilter = filter.toLowerCase();
      const matches = fonts
        .filter((f: FontEntry) => f.family.toLowerCase().includes(lowerFilter))
        .slice(0, 40);
      for (const font of matches) {
        const item = document.createElement('div');
        item.className = 'cm-textlayer-font-item';
        item.textContent = font.family;
        if (!font.isSystem) {
          loadGoogleFont(font.family);
          item.style.fontFamily = `"${font.family}", ${font.category}`;
        } else {
          item.style.fontFamily = font.family;
          item.classList.add('cm-textlayer-font-system');
        }
        item.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          this._fontInput!.value = font.family;
          this._family = font.family;
          loadGoogleFont(font.family);
          this._refillWeightOptions();
          this._applyChanges();
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
      }
    }

    _highlightFontItem(): void {
      const dropdown = this.fontListEl;
      if (!dropdown) return;
      const items = dropdown.querySelectorAll('.cm-textlayer-font-item');
      items.forEach((el, i) => {
        if (i === this._fontListIndex) el.classList.add('is-active');
        else el.classList.remove('is-active');
      });
      const active = items[this._fontListIndex] as HTMLElement | undefined;
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    _refillWeightOptions(): void {
      if (!this._weightSelect) return;
      const weights = getAvailableWeights(this._family);
      const labels: Record<number, string> = {
        100: '100 (Thin)',
        200: '200 (ExtraLight)',
        300: '300 (Light)',
        400: '400 (Regular)',
        500: '500 (Medium)',
        600: '600 (SemiBold)',
        700: '700 (Bold)',
        800: '800 (ExtraBold)',
        900: '900 (Black)',
      };
      // Ensure the user's current source weight is always selectable, even
      // when getAvailableWeights doesn't include it (fonts not loaded yet,
      // or the family supplies a weight the curated list doesn't advertise).
      // Without this, a valid source `@font 'Roboto' 900` would render with
      // the weight dropdown stuck on "(none)".
      const allWeights = Array.from(
        new Set<number>([
          ...weights,
          ...(this._weight && /^\d+$/.test(this._weight) ? [+this._weight] : []),
        ]),
      ).sort((a, b) => a - b);
      this._weightSelect.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '(none)';
      this._weightSelect.appendChild(noneOpt);
      for (const w of allWeights) {
        const opt = document.createElement('option');
        opt.value = String(w);
        opt.textContent = labels[w] || String(w);
        this._weightSelect.appendChild(opt);
      }
      this._weightSelect.value =
        this._weight && allWeights.includes(+this._weight) ? this._weight : '';
    }

    _applyChanges(): void {
      const fresh = this._lookup(this.view);
      if (!fresh) return;
      const doc = this.view.state.doc;

      // Safety: the inside-quote range we're about to edit must still be
      // bracketed by matching quote chars.
      const qOpen = doc.sliceString(Math.max(0, fresh.familyFrom - 1), fresh.familyFrom);
      const qClose = doc.sliceString(fresh.familyTo, Math.min(doc.length, fresh.familyTo + 1));
      if (!((qOpen === "'" && qClose === "'") || (qOpen === '"' && qClose === '"'))) return;

      // Only emit changes for fields that actually differ from the current
      // document. No-op replacements would still produce CM transactions,
      // re-trigger compile, and (most importantly) can race with subsequent
      // dispatches — the observed "double weight" bug came from a stale
      // snapshot of fresh.weightFrom that was already consumed by a prior
      // no-op family dispatch.
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      const currentFamily = doc.sliceString(fresh.familyFrom, fresh.familyTo);
      if (this._family !== currentFamily) {
        changes.push({ from: fresh.familyFrom, to: fresh.familyTo, insert: this._family });
      }

      if (fresh.weightFrom != null && fresh.weightTo != null) {
        const currentWeight = doc.sliceString(fresh.weightFrom, fresh.weightTo);
        if (this._weight && this._weight !== currentWeight) {
          changes.push({ from: fresh.weightFrom, to: fresh.weightTo, insert: this._weight });
        } else if (!this._weight) {
          // Remove the weight and the whitespace preceding it.
          let ws = fresh.weightFrom;
          while (ws > 0 && /\s/.test(doc.sliceString(ws - 1, ws))) ws--;
          changes.push({ from: ws, to: fresh.weightTo, insert: '' });
        }
      } else if (this._weight) {
        // No weight present; insert it after the closing quote of the family.
        changes.push({ from: fresh.familyTo + 1, to: fresh.familyTo + 1, insert: ` ${this._weight}` });
      }

      if (changes.length === 0) return;

      // Sort descending so higher offsets dispatch first.
      changes.sort((a, b) => b.from - a.from);
      this.view.dispatch({ changes });
    }

    _attachListeners(): void {
      setTimeout(() => {
        document.addEventListener('mousedown', this._onClickOutside, true);
      }, 50);
      document.addEventListener('keydown', this._onKeyDown, true);
      const scroller = this.view.dom.querySelector('.cm-scroller') as HTMLElement | null;
      if (scroller) scroller.addEventListener('scroll', this._onScroll);
      this._scroller = scroller;
    }

    _onClickOutside(e: MouseEvent): void {
      if (!this.el) return;
      const path = e.composedPath();
      if (!path.includes(this.el)) this.close();
    }

    _onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    }

    _onScroll(): void {
      this.close();
    }

    close(): void {
      document.removeEventListener('mousedown', this._onClickOutside, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
      if (this._scroller) this._scroller.removeEventListener('scroll', this._onScroll);
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
      if (activePopup === this) activePopup = null;
    }
  }

  function buildDecorations(view: any): any {
    const docText = view.state.doc.toString();
    const tree = syntaxTree(view.state);
    const targets = findFontTargets(tree, docText);
    const widgets: any[] = [];

    for (const t of targets) {
      const widget =
        t.kind === 'textlayer'
          ? new TextLayerWidget(t)
          : new FontDirectiveWidget(t);
      const deco = Decoration.widget({ widget, side: 1 });
      widgets.push(deco.range(t.buttonPos));
    }

    return Decoration.set(widgets, true);
  }

  const textLayerPlugin = ViewPlugin.fromClass(
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
    '.cm-textlayer-btn': {
      display: 'inline-block',
      padding: '0 6px',
      marginLeft: '6px',
      fontSize: '13px',
      fontWeight: '600',
      lineHeight: '20px',
      borderRadius: '3px',
      border: '1px solid rgba(128,128,128,0.3)',
      background: 'rgba(128,128,128,0.08)',
      cursor: 'pointer',
      verticalAlign: 'middle',
      transition: 'background 0.1s ease, transform 0.1s ease',
      color: 'inherit',
    },
    '.cm-textlayer-btn:hover': {
      background: 'rgba(128,128,128,0.18)',
      transform: 'scale(1.05)',
    },
    '&dark .cm-textlayer-btn': {
      borderColor: 'rgba(200,200,200,0.25)',
      background: 'rgba(200,200,200,0.08)',
    },
    '&dark .cm-textlayer-btn:hover': {
      background: 'rgba(200,200,200,0.18)',
    },
    '.cm-textlayer-editor': {
      background: 'var(--bg-elevated, #ffffff)',
      border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08)',
      width: '300px',
      // overflow is deliberately NOT hidden — the font-family dropdown (see
      // `.cm-textlayer-font-dropdown` below) is absolutely positioned and
      // needs to escape this container to render its full list without
      // clipping.
      fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
      fontSize: '13px',
      color: 'var(--text-primary, #1a1a2e)',
    },
    '&dark .cm-textlayer-editor': {
      boxShadow: '0 10px 25px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.3)',
    },
    '.cm-textlayer-preview': {
      padding: '16px 20px',
      fontSize: '48px',
      textAlign: 'center',
      borderBottom: '1px solid var(--border-color, #e2e8f0)',
      background: 'var(--bg-primary, #f8f9fa)',
      // Match the editor's border-radius on the top since the editor itself
      // no longer clips via overflow:hidden.
      borderTopLeftRadius: '7px',
      borderTopRightRadius: '7px',
      lineHeight: '1.2',
      minHeight: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    '.cm-textlayer-preview-bg-chip': {
      position: 'absolute',
      top: '8px',
      right: '8px',
      width: '16px',
      height: '16px',
      opacity: '0.85',
      transition: 'opacity 0.1s ease',
    },
    '.cm-textlayer-preview-bg-chip:hover': {
      opacity: '1',
    },
    '.cm-textlayer-controls': {
      padding: '8px 12px',
    },
    '.cm-textlayer-row': {
      display: 'grid',
      gridTemplateColumns: '90px 1fr',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 0',
    },
    '.cm-textlayer-row label': {
      fontSize: '12px',
      color: 'var(--text-secondary, #64748b)',
      fontWeight: '500',
    },
    '.cm-textlayer-sep': {
      height: '1px',
      background: 'var(--border-color, #e2e8f0)',
      margin: '6px 0',
    },
    '.cm-textlayer-select, .cm-textlayer-number, .cm-textlayer-font-input, .cm-textlayer-color-text': {
      padding: '4px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color, #e2e8f0)',
      background: 'var(--bg-secondary, #ffffff)',
      color: 'inherit',
      fontSize: '12px',
      fontFamily: 'inherit',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    },
    '.cm-textlayer-select:focus, .cm-textlayer-number:focus, .cm-textlayer-font-input:focus, .cm-textlayer-color-text:focus':
      {
        borderColor: 'var(--accent-color, #10b981)',
        boxShadow: '0 0 0 2px var(--focus-ring, rgba(16,185,129,0.4))',
      },
    '.cm-textlayer-number': {
      width: '80px',
    },
    '.cm-textlayer-font-wrapper': {
      position: 'relative',
    },
    '.cm-textlayer-font-dropdown': {
      position: 'absolute',
      top: '100%',
      left: '0',
      right: '0',
      maxHeight: '200px',
      overflowY: 'auto',
      background: 'var(--bg-elevated, #ffffff)',
      border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '0 0 4px 4px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      zIndex: '10',
    },
    '.cm-textlayer-font-item': {
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: '14px',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '.cm-textlayer-font-item:hover, .cm-textlayer-font-item.is-active': {
      background: 'var(--hover-bg, rgba(0,0,0,0.04))',
    },
    '.cm-textlayer-font-item.is-active': {
      outline: '2px solid var(--accent-color, #10b981)',
      outlineOffset: '-2px',
    },
    '.cm-textlayer-font-system': {
      fontStyle: 'italic',
      opacity: '0.7',
    },
    '.cm-textlayer-color-wrapper': {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    '.cm-textlayer-color-wrapper .cm-color-chip': {
      flexShrink: '0',
    },
    '.cm-textlayer-color-text': {
      width: '100%',
    },
  });

  return [textLayerPlugin, baseTheme];
}
