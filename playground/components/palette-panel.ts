// Floating palette panel showing all colors used in the current program, grouped by layer

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
import { cssValueForStyleAttr, escapeHtml } from '../utils/html-escape.js';
import { perfSpan } from '../utils/perf-marks.js';
import { VirtualList } from '../utils/virtual-list.js';
import styles from './palette-panel.css';

const COLOR_PROPERTIES = new Set(['stroke', 'fill', 'color', 'stop-color', 'flood-color']);

const SKIP_VALUES = new Set(['none', 'inherit', 'transparent', 'currentColor']);

// Must match .group-header / .color-row heights in palette-panel.css — the
// virtual list uses them to compute scroll geometry without measuring.
const HEADER_H = 24;
const COLOR_ROW_H = 26;

type PaletteRowDesc =
  | { kind: 'header'; h: number; name: string }
  | { kind: 'color'; h: number; prop: string; value: string };

export class PalettePanel extends HTMLElement {
  private _collapsed: boolean;

  private _layers: LayerOutput[] = [];

  private _gradients: GradientOutput[] = [];

  private _gradientById = new Map<string, GradientOutput>();

  private _updateScheduled = false;

  private _dirtyWhileCollapsed = false;

  private _virtual: VirtualList<PaletteRowDesc> | null = null;

  private _scrollHost: HTMLElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
  }

  connectedCallback(): void {
    this.render();
    this.updateList();
  }

  disconnectedCallback(): void {
    this._virtual?.destroy();
    this._virtual = null;
  }

  set layers(value: LayerOutput[]) { this._layers = value || []; this._scheduleUpdate(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this._scheduleUpdate(); }

  /** Coalesce back-to-back property assignments into one updateList per microtask. */
  private _scheduleUpdate(): void {
    if (this._updateScheduled) return;
    this._updateScheduled = true;
    queueMicrotask(() => {
      this._updateScheduled = false;
      if (this.isConnected) this.updateList();
    });
  }

  /**
   * Scroll container driving the virtual window. The embedded inspector
   * passes its shared `.inspector` scroller; standalone panels leave this
   * unset and the list element scrolls itself.
   */
  set scrollHost(el: HTMLElement | null) {
    this._scrollHost = el;
    this._virtual?.setScroller(el);
  }

  /** Re-window against current scroll/viewport geometry (e.g. after the inspector opens). */
  refreshVirtual(): void {
    this._virtual?.refresh();
  }

  toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot!.querySelector('.palette-list') as HTMLElement | null;
    const arrow = this.shadowRoot!.querySelector('.collapse-arrow') as HTMLElement | null;
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
    if (!this._collapsed && this._dirtyWhileCollapsed) this.updateList();
    // Sibling panels below share the shell scroller — their offsets shifted.
    this.dispatchEvent(new CustomEvent('inspector-section-resize', { bubbles: true, composed: true }));
  }

  /**
   * Flatten layers into header/color row descriptors. Only the cheap
   * property filter runs here — swatch/gradient/var resolution happens in
   * _renderRowHtml for just the windowed rows.
   */
  private _buildRows(): { rows: PaletteRowDesc[]; colorCount: number } {
    const rows: PaletteRowDesc[] = [];
    let colorCount = 0;
    for (const layer of this._layers) {
      const layerStyles = layer.styles || {};
      let headerEmitted = false;
      for (const [prop, value] of Object.entries(layerStyles)) {
        if (!COLOR_PROPERTIES.has(prop)) continue;
        if (SKIP_VALUES.has(value)) continue;
        if (!headerEmitted) {
          rows.push({ kind: 'header', h: HEADER_H, name: layer.name });
          headerEmitted = true;
        }
        rows.push({ kind: 'color', h: COLOR_ROW_H, prop, value });
        colorCount++;
      }
    }
    return { rows, colorCount };
  }

  /** Render one row descriptor to an HTML string (windowed rows only). */
  private _renderRowHtml(row: PaletteRowDesc): string {
    if (row.kind === 'header') {
      return `<div class="group-header">${escapeHtml(row.name)}</div>`;
    }

    const { prop, value } = row;

    // Check for var(--name, fallback)
    const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\s*\)$/);
    const varName = varMatch ? varMatch[1] : null;
    const fallbackRaw = varMatch ? varMatch[2]?.trim() || null : null;

    let swatchClass = 'swatch';
    let swatchStyle = '';

    // Check for gradient url(#id)
    const urlMatch = value.match(/^url\(#(.+?)\)$/);
    if (urlMatch) {
      let grad: GradientOutput | null = this._gradientById.get(urlMatch[1]) || null;
      // Walk href chain for inherited gradients
      while (grad && grad.stops.length === 0 && grad.href) {
        grad = this._gradientById.get(grad.href) || null;
      }
      const cssGrad =
        grad && grad.stops.length > 0
          ? cssValueForStyleAttr(
              `${grad.type === 'radial' ? 'radial-gradient(circle' : 'linear-gradient(to right'}, ${grad.stops
                .map((s) => `${s.color} ${(s.offset * 100).toFixed(0)}%`)
                .join(', ')})`,
            )
          : null;
      if (cssGrad) {
        swatchStyle = `background: ${cssGrad}; border-radius: 2px`;
      } else {
        swatchClass += ' no-color';
      }
    } else if (varName) {
      // For var() references, use fallback as swatch color
      const fallback = fallbackRaw ? cssValueForStyleAttr(fallbackRaw) : null;
      swatchStyle = `background-color: ${fallback || 'transparent'}`;
      if (!fallback) swatchClass += ' no-color';
    } else {
      const cssValue = cssValueForStyleAttr(value);
      if (cssValue) {
        swatchStyle = `background-color: ${cssValue}`;
      } else {
        swatchClass += ' no-color';
      }
    }

    const valText = varName ?? (urlMatch ? urlMatch[1] : value);

    return `<div class="color-row">
      <span class="${swatchClass}"${swatchStyle ? ` style="${escapeHtml(swatchStyle)}"` : ''}></span>
      <span class="prop-name">${escapeHtml(prop)}</span>
      <span class="color-value" title="${escapeHtml(value)}">${escapeHtml(valText)}</span>
    </div>`;
  }

  private _renderSlice(rows: PaletteRowDesc[], start: number, end: number): string {
    const parts: string[] = [];
    for (let i = start; i < end; i++) parts.push(this._renderRowHtml(rows[i]));
    return parts.join('');
  }

  updateList(): void {
    perfSpan('inspector-palette-update', () => this._updateListImpl());
  }

  private _updateListImpl(): void {
    const list = this.shadowRoot!.querySelector('.palette-list') as HTMLElement | null;
    if (!list) return;

    // First match wins on duplicate ids, matching SVG's url(#id) resolution
    // (Map construction alone would let the last duplicate win).
    const gradientById = new Map<string, GradientOutput>();
    for (const g of this._gradients) if (!gradientById.has(g.id)) gradientById.set(g.id, g);
    this._gradientById = gradientById;

    const { rows, colorCount } = this._buildRows();

    // A collapsed section skips the DOM build entirely (the flatten above is
    // pure JS and keeps the badge live); rows are rebuilt on expand if
    // anything changed meanwhile.
    if (this._collapsed) {
      this._dirtyWhileCollapsed = true;
      const collapsedBadge = this.shadowRoot!.querySelector('.badge');
      if (collapsedBadge) collapsedBadge.textContent = colorCount > 0 ? String(colorCount) : '';
      return;
    }
    this._dirtyWhileCollapsed = false;

    // Update badge count
    const badge = this.shadowRoot!.querySelector('.badge');
    if (badge) badge.textContent = colorCount > 0 ? String(colorCount) : '';

    // Auto-hide when no colors found (standalone only)
    if (!this.hasAttribute('embedded')) {
      this.style.display = colorCount === 0 ? 'none' : '';
    } else if (colorCount === 0) {
      this._virtual?.reset();
      list.innerHTML = '<div class="empty-state">No colors</div>';
      return;
    }

    if (!this._virtual) {
      this._virtual = new VirtualList<PaletteRowDesc>(list, (r, s, e) => this._renderSlice(r, s, e));
      if (this._scrollHost) this._virtual.setScroller(this._scrollHost);
    }
    this._virtual.setRows(rows);
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="panel">
        <div class="panel-header">
          <span class="collapse-arrow">&#9660;</span>
          Palette
          <span class="badge"></span>
        </div>
        <div class="palette-list"></div>
      </div>
    `;
    this._virtual?.destroy();
    this._virtual = null;

    (this.shadowRoot!.querySelector('.panel-header') as HTMLElement).addEventListener('click', () => {
      this.toggleCollapse();
    });
  }
}

customElements.define('palette-panel', PalettePanel);
