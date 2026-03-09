// Floating palette panel showing all colors used in the current program, grouped by layer

import { store } from '../state/store.js';

const COLOR_PROPERTIES = new Set([
  'stroke', 'fill', 'color', 'stop-color', 'flood-color',
]);

const SKIP_VALUES = new Set(['none', 'inherit', 'transparent', 'currentColor']);

export class PalettePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe(['layers', 'gradients'], () => {
      this.updateList();
    });
    this.updateList();
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  toggleCollapse() {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot.querySelector('.palette-list');
    const arrow = this.shadowRoot.querySelector('.collapse-arrow');
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  updateList() {
    const layers = store.get('layers') || [];
    const list = this.shadowRoot.querySelector('.palette-list');
    if (!list) return;

    list.innerHTML = '';

    let colorCount = 0;

    for (const layer of layers) {
      const styles = layer.styles || {};
      const layerColors = [];

      for (const [prop, value] of Object.entries(styles)) {
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
          const gradients = store.get('gradients') || [];
          let grad = gradients.find(g => g.id === urlMatch[1]);
          // Walk href chain for inherited gradients
          while (grad && grad.stops.length === 0 && grad.href) {
            grad = gradients.find(g => g.id === grad.href) || null;
          }
          if (grad && grad.stops.length > 0) {
            const stops = grad.stops.map(s => `${s.color} ${(s.offset * 100).toFixed(0)}%`).join(', ');
            const cssGrad = grad.type === 'radial'
              ? `radial-gradient(circle, ${stops})`
              : `linear-gradient(to right, ${stops})`;
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
    const badge = this.shadowRoot.querySelector('.badge');
    if (badge) badge.textContent = colorCount > 0 ? colorCount : '';

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

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .panel {
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          box-shadow: var(--shadow-lg);
          width: 200px;
          max-height: 240px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        :host([embedded]) .panel {
          width: 100%;
          max-height: none;
          border: none;
          border-radius: 0;
          box-shadow: none;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          overflow: visible;
        }

        :host([embedded]) .palette-list {
          flex: none;
          overflow-y: visible;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.5rem;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        :host([embedded]) .panel-header {
          background: var(--bg-secondary, #f1f5f9);
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .panel-header:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
        }

        .collapse-arrow {
          font-size: 0.5rem;
          transition: transform var(--transition-base, 0.15s ease);
        }

        .collapse-arrow.collapsed {
          transform: rotate(-90deg);
        }

        .badge {
          margin-left: auto;
          font-size: 0.625rem;
          font-weight: 600;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-secondary, #64748b);
          background: var(--bg-secondary, #f1f5f9);
          padding: 0 0.375rem;
          border-radius: 8px;
          min-width: 1rem;
          text-align: center;
          line-height: 1.2rem;
        }

        .badge:empty {
          display: none;
        }

        .palette-list {
          overflow-y: auto;
          flex: 1;
        }

        .group-header {
          padding: 0.25rem 0.5rem;
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
          font-family: var(--font-mono, 'Inconsolata', monospace);
          background: var(--bg-secondary, #f1f5f9);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .color-row {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0rem 0.5rem;
          height: 26px;
          box-sizing: border-box;
        }

        .color-row:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
        }

        .swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex-shrink: 0;
          border: 1px solid rgba(128, 128, 128, 0.3);
        }

        .swatch.no-color {
          background: repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 6px 6px;
        }

        .prop-name {
          font-size: 0.625rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-secondary, #64748b);
          flex-shrink: 0;
        }

        .color-value {
          flex: 1;
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-primary, #1a1a2e);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: right;
        }

        .empty-state {
          padding: 0.75rem 0.5rem;
          font-size: 0.6875rem;
          color: var(--text-secondary, #64748b);
          text-align: center;
          font-style: italic;
        }

        @media (max-width: 800px) {
          .panel {
            width: 170px;
          }

          :host([embedded]) .panel {
            width: 100%;
          }
        }
      </style>

      <div class="panel">
        <div class="panel-header">
          <span class="collapse-arrow">&#9660;</span>
          Palette
          <span class="badge"></span>
        </div>
        <div class="palette-list"></div>
      </div>
    `;

    this.shadowRoot.querySelector('.panel-header').addEventListener('click', () => {
      this.toggleCollapse();
    });
  }
}

customElements.define('palette-panel', PalettePanel);
