// Floating palette panel showing all colors used in the current program, grouped by layer

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
import { cssValueForStyleAttr, escapeHtml } from '../utils/html-escape.js';
import styles from './palette-panel.css';

const COLOR_PROPERTIES = new Set(['stroke', 'fill', 'color', 'stop-color', 'flood-color']);

const SKIP_VALUES = new Set(['none', 'inherit', 'transparent', 'currentColor']);

interface ColorEntry {
  prop: string;
  value: string;
  varName: string | null;
  fallback: string | null;
}

export class PalettePanel extends HTMLElement {
  private _collapsed: boolean;
  private _layers: LayerOutput[] = [];
  private _gradients: GradientOutput[] = [];
  private _updateScheduled = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
  }

  connectedCallback(): void {
    this.render();
    this.updateList();
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

  toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot!.querySelector('.palette-list') as HTMLElement | null;
    const arrow = this.shadowRoot!.querySelector('.collapse-arrow') as HTMLElement | null;
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  updateList(): void {
    const layers = this._layers;
    const list = this.shadowRoot!.querySelector('.palette-list') as HTMLElement | null;
    if (!list) return;

    // Rows are accumulated as HTML strings and assigned in one innerHTML pass
    // (single parse, no per-row element construction) — this list can reach
    // thousands of rows on layer-heavy programs.
    const parts: string[] = [];
    let colorCount = 0;

    for (const layer of layers) {
      const layerStyles = layer.styles || {};
      const layerColors: ColorEntry[] = [];

      for (const [prop, value] of Object.entries(layerStyles)) {
        if (!COLOR_PROPERTIES.has(prop)) continue;
        if (SKIP_VALUES.has(value)) continue;

        // Check for var(--name, fallback)
        const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\s*\)$/);
        if (varMatch) {
          layerColors.push({
            prop,
            value,
            varName: varMatch[1],
            fallback: varMatch[2]?.trim() || null,
          });
        } else {
          layerColors.push({ prop, value, varName: null, fallback: null });
        }
      }

      if (layerColors.length === 0) continue;

      // Layer group header
      parts.push(`<div class="group-header">${escapeHtml(layer.name)}</div>`);

      for (const entry of layerColors) {
        let swatchClass = 'swatch';
        let swatchStyle = '';

        // Check for gradient url(#id)
        const urlMatch = entry.value.match(/^url\(#(.+?)\)$/);
        if (urlMatch) {
          const gradients = this._gradients;
          let grad: GradientOutput | null = gradients.find((g) => g.id === urlMatch[1]) || null;
          // Walk href chain for inherited gradients
          while (grad && grad.stops.length === 0 && grad.href) {
            grad = gradients.find((g) => g.id === grad!.href) || null;
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
        } else if (entry.varName) {
          // For var() references, use fallback as swatch color
          const fallback = entry.fallback ? cssValueForStyleAttr(entry.fallback) : null;
          swatchStyle = `background-color: ${fallback || 'transparent'}`;
          if (!fallback) swatchClass += ' no-color';
        } else {
          const value = cssValueForStyleAttr(entry.value);
          if (value) {
            swatchStyle = `background-color: ${value}`;
          } else {
            swatchClass += ' no-color';
          }
        }

        const valText = entry.varName ?? (urlMatch ? urlMatch[1] : entry.value);

        parts.push(`<div class="color-row">
          <span class="${swatchClass}"${swatchStyle ? ` style="${escapeHtml(swatchStyle)}"` : ''}></span>
          <span class="prop-name">${escapeHtml(entry.prop)}</span>
          <span class="color-value" title="${escapeHtml(entry.value)}">${escapeHtml(valText)}</span>
        </div>`);
        colorCount++;
      }
    }

    // Update badge count
    const badge = this.shadowRoot!.querySelector('.badge');
    if (badge) badge.textContent = colorCount > 0 ? String(colorCount) : '';

    // Auto-hide when no colors found (standalone only)
    if (!this.hasAttribute('embedded')) {
      this.style.display = colorCount === 0 ? 'none' : '';
    } else if (colorCount === 0) {
      parts.push('<div class="empty-state">No colors</div>');
    }

    list.innerHTML = parts.join('');

    if (this._collapsed) {
      list.style.display = 'none';
    }
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

    (this.shadowRoot!.querySelector('.panel-header') as HTMLElement).addEventListener('click', () => {
      this.toggleCollapse();
    });
  }
}

customElements.define('palette-panel', PalettePanel);
