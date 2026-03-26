// Floating palette panel showing all colors used in the current program, grouped by layer

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
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

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
  }

  connectedCallback(): void {
    this.render();
    this.updateList();
  }

  set layers(value: LayerOutput[]) { this._layers = value || []; this.updateList(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this.updateList(); }

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

    list.innerHTML = '';

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
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = layer.name;
      list.appendChild(header);

      for (const entry of layerColors) {
        const row = document.createElement('div');
        row.className = 'color-row';

        const swatch = document.createElement('span');
        swatch.className = 'swatch';

        // Check for gradient url(#id)
        const urlMatch = entry.value.match(/^url\(#(.+?)\)$/);
        if (urlMatch) {
          const gradients = this._gradients;
          let grad: GradientOutput | null = gradients.find((g) => g.id === urlMatch[1]) || null;
          // Walk href chain for inherited gradients
          while (grad && grad.stops.length === 0 && grad.href) {
            grad = gradients.find((g) => g.id === grad!.href) || null;
          }
          if (grad && grad.stops.length > 0) {
            const stops = grad.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(0)}%`).join(', ');
            const cssGrad =
              grad.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(to right, ${stops})`;
            swatch.style.background = cssGrad;
            swatch.style.borderRadius = '2px';
          } else {
            swatch.classList.add('no-color');
          }
        } else if (entry.varName) {
          // For var() references, use fallback as swatch color
          swatch.style.backgroundColor = entry.fallback || 'transparent';
          if (!entry.fallback) {
            swatch.classList.add('no-color');
          }
        } else {
          swatch.style.backgroundColor = entry.value;
        }

        const label = document.createElement('span');
        label.className = 'prop-name';
        label.textContent = entry.prop;

        const val = document.createElement('span');
        val.className = 'color-value';
        if (entry.varName) {
          val.textContent = entry.varName;
          val.title = entry.value;
        } else if (urlMatch) {
          val.textContent = urlMatch[1];
          val.title = entry.value;
        } else {
          val.textContent = entry.value;
          val.title = entry.value;
        }

        row.appendChild(swatch);
        row.appendChild(label);
        row.appendChild(val);
        list.appendChild(row);
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
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No colors';
      list.appendChild(empty);
    }

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
