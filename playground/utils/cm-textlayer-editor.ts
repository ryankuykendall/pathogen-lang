// CodeMirror 6 TextLayer style editor extension
// Adds an "Aa" button next to TextLayer definitions that opens a multi-property style editor

import { createColorChip } from './cm-color-picker.js';
import { fetchGoogleFonts, getAvailableWeights, loadGoogleFont } from './google-fonts.js';

/** Parsed style properties from a define block. */
type StyleProps = Map<string, string>;

/** A found TextLayer define block in the document. */
interface TextLayerBlock {
  textLayerPos: number;
  blockFrom: number;
  blockTo: number;
  props: StyleProps;
}

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

// Find all TextLayer define blocks
function findTextLayerBlocks(docText: string): TextLayerBlock[] {
  const results: TextLayerBlock[] = [];
  const regex = /\bdefine\s+(TextLayer\s*\([^)]*\))\s*\$\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(docText)) !== null) {
    const textLayerStart = match.index + match[0].indexOf('TextLayer');
    const textLayerEnd = textLayerStart + 'TextLayer'.length;
    const openBrace = match.index + match[0].length - 1;

    // Find matching closing brace
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
    const props = parseStyleBlock(blockContent);

    results.push({
      textLayerPos: textLayerEnd,
      blockFrom: openBrace + 1,
      blockTo: closeBrace,
      props,
    });
  }

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

export function textLayerEditorExtension(cmViewModule: CMViewModule): any[] {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = cmViewModule;

  class TextLayerWidget extends WidgetType {
    block: TextLayerBlock;
    fontFamily: string;

    constructor(block: TextLayerBlock) {
      super();
      this.block = block;
      this.fontFamily = block.props.get('font-family') || 'sans-serif';
    }

    eq(other: TextLayerWidget): boolean {
      return this.block.textLayerPos === other.block.textLayerPos && this.fontFamily === other.fontFamily;
    }

    toDOM(view: any): HTMLElement {
      const btn = document.createElement('span');
      btn.className = 'cm-textlayer-btn';
      btn.textContent = 'Aa';
      btn.title = 'Edit TextLayer styles';
      btn.style.fontFamily = this.fontFamily;

      btn.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        closeActivePopup();
        this._openEditor(view, btn);
      });

      return btn;
    }

    _openEditor(view: any, btn: HTMLElement): void {
      // Re-read current block state from document
      const docText = view.state.doc.toString();
      const blocks = findTextLayerBlocks(docText);
      // Find the block closest to our position
      const block = blocks.find((b: TextLayerBlock) => Math.abs(b.textLayerPos - this.block.textLayerPos) < 5);
      if (!block) return;

      const popup = new TextLayerPopup(view, block, btn);
      activePopup = popup;
    }

    ignoreEvent(): boolean {
      return false;
    }
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

    constructor(view: any, block: TextLayerBlock, anchorEl: HTMLElement) {
      this.view = view;
      this.block = block;
      this.props = new Map(block.props);
      this.el = null;
      this.fontListEl = null;
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

      // Preview area
      const preview = document.createElement('div');
      preview.className = 'cm-textlayer-preview';
      this._previewEl = preview;
      this._previewBg = 'var(--bg-primary, #f8f9fa)';
      this._updatePreview();

      // Background color chip in lower-left corner
      const bgChip = createColorChip({
        color: '#f8f9fa',
        container: preview,
        className: 'cm-textlayer-preview-bg-chip',
        title: 'Preview background color',
        onChange: (c: string) => {
          preview.style.background = c;
          this._previewBg = c;
        },
      });
      preview.appendChild(bgChip);

      popup.appendChild(preview);

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
      input.value = this.props.get('font-family') || '';
      input.placeholder = 'Search fonts...';

      const dropdown = document.createElement('div');
      dropdown.className = 'cm-textlayer-font-dropdown';
      dropdown.style.display = 'none';
      this.fontListEl = dropdown;

      input.addEventListener('focus', () => {
        this._populateFontList('');
        dropdown.style.display = '';
      });

      input.addEventListener('input', () => {
        this._populateFontList(input.value);
        dropdown.style.display = '';
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

    async _loadFonts(): Promise<void> {
      this._fonts = await fetchGoogleFonts();
      // Pre-load the current font
      loadGoogleFont(this.props.get('font-family') || '');
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
          this.props.set('font-family', font.family);
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
      const family = this.props.get('font-family') || '';
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
      const family = this.props.get('font-family') || 'sans-serif';
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

      const stroke = this.props.get('stroke');
      const strokeWidth = this.props.get('stroke-width');
      if (stroke && stroke !== 'none' && parseInt(strokeWidth || '0') > 0) {
        (this._previewEl.style as any).webkitTextStroke = `${strokeWidth}px ${stroke}`;
      } else {
        (this._previewEl.style as any).webkitTextStroke = '';
      }
    }

    _applyChanges(): void {
      // Re-read block positions from current doc state
      const docText = this.view.state.doc.toString();
      const blocks = findTextLayerBlocks(docText);
      const block = blocks.find((b: TextLayerBlock) => Math.abs(b.textLayerPos - this.block.textLayerPos) < 5);
      if (!block) return;

      const newContent = serializeStyleBlock(this.props);
      this.view.dispatch({
        changes: { from: block.blockFrom, to: block.blockTo, insert: newContent },
      });

      // Update stored block position references
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

  function buildDecorations(view: any): any {
    const docText = view.state.doc.toString();
    const blocks = findTextLayerBlocks(docText);
    const widgets: any[] = [];

    for (const block of blocks) {
      const deco = Decoration.widget({
        widget: new TextLayerWidget(block),
        side: 1,
      });
      widgets.push(deco.range(block.textLayerPos));
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
      overflow: 'hidden',
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
      lineHeight: '1.2',
      minHeight: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    '.cm-textlayer-preview-bg-chip': {
      position: 'absolute',
      bottom: '6px',
      left: '6px',
      width: '14px',
      height: '14px',
      opacity: '0.5',
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
    '.cm-textlayer-font-item:hover': {
      background: 'var(--hover-bg, rgba(0,0,0,0.04))',
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
