// Floating layers panel for layer inspection and visibility control

import { store } from '../state/store.js';

const EYE_OPEN = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3z" fill="currentColor" opacity="0.15"/>
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor"/>
</svg>`;

const EYE_CLOSED = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor" opacity="0.3"/>
  <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

export class LayersPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe(['layers', 'layerVisibility', 'masks', 'clipPaths', 'defsVisibility'], () => {
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

  getLayerColor(layer) {
    if (layer.type === 'text') {
      return layer.styles?.['fill'] || '#333';
    }
    const stroke = layer.styles?.['stroke'];
    const fill = layer.styles?.['fill'];
    // Prefer stroke, but fall back to fill if stroke is missing or 'none'
    if (stroke && stroke !== 'none') return stroke;
    if (fill && fill !== 'none') return fill;
    return '#333';
  }

  toggleVisibility(name) {
    const visibility = { ...store.get('layerVisibility') };
    visibility[name] = visibility[name] === false ? true : false;
    store.set('layerVisibility', visibility);
    this.dispatchEvent(new CustomEvent('layer-visibility-change', {
      bubbles: true,
      composed: true,
      detail: { name, visible: visibility[name] }
    }));
  }

  toggleDefsVisibility(key) {
    const visibility = { ...store.get('defsVisibility') };
    visibility[key] = visibility[key] === false ? true : false;
    store.set('defsVisibility', visibility);
  }

  toggleCollapse() {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot.querySelector('.layer-list');
    const arrow = this.shadowRoot.querySelector('.collapse-arrow');
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  updateList() {
    const layers = store.get('layers') || [];
    const masks = store.get('masks') || [];
    const clipPaths = store.get('clipPaths') || [];
    const visibility = store.get('layerVisibility') || {};
    const defsVisibility = store.get('defsVisibility') || {};

    // Hide entirely when <= 1 layer and no masks/clipPaths
    const hasDefs = masks.length > 0 || clipPaths.length > 0;
    this.style.display = (layers.length <= 1 && !hasDefs) ? 'none' : '';

    const list = this.shadowRoot.querySelector('.layer-list');
    if (!list) return;

    // Build lookup of mask/clipPath IDs referenced by each layer
    const layerDefs = new Map();
    for (const layer of layers) {
      const refs = [];
      for (const [prop, val] of Object.entries(layer.styles || {})) {
        const match = val.match(/url\(#(.+?)\)/);
        if (match) {
          const refId = match[1];
          // Check if it's a mask or clip-path
          if (masks.some(m => m.id === refId)) {
            refs.push({ type: 'mask', id: refId });
          } else if (clipPaths.some(c => c.id === refId)) {
            refs.push({ type: 'clip-path', id: refId });
          }
        }
      }
      if (refs.length > 0) layerDefs.set(layer.name, refs);
    }

    list.innerHTML = '';
    for (const layer of layers) {
      const isVisible = visibility[layer.name] !== false;
      const color = this.getLayerColor(layer);

      const row = document.createElement('div');
      row.className = 'layer-row';

      row.innerHTML = `
        <span class="color-dot" style="background: ${color}"></span>
        <span class="layer-name" title="${layer.name}">${layer.name}</span>
        <span class="type-badge">${layer.type === 'text' ? 'text' : layer.type === 'fragment' ? 'frag' : 'path'}</span>
        <button class="eye-btn" title="${isVisible ? 'Hide layer' : 'Show layer'}" aria-label="${isVisible ? 'Hide' : 'Show'} ${layer.name}">
          ${isVisible ? EYE_OPEN : EYE_CLOSED}
        </button>
      `;

      row.querySelector('.eye-btn').addEventListener('click', () => {
        this.toggleVisibility(layer.name);
      });

      list.appendChild(row);

      // Render nested mask/clipPath rows for this layer
      const refs = layerDefs.get(layer.name) || [];
      for (const ref of refs) {
        const defKey = `${ref.type}:${ref.id}`;
        const defVisible = defsVisibility[defKey] !== false;
        const subRow = document.createElement('div');
        subRow.className = 'layer-row defs-row';

        subRow.innerHTML = `
          <span class="tree-connector"></span>
          <span class="layer-name" title="${ref.id}">${ref.id}</span>
          <span class="type-badge defs-badge">${ref.type === 'mask' ? 'mask' : 'clip'}</span>
          <button class="eye-btn" title="${defVisible ? 'Disable' : 'Enable'} ${ref.type}" aria-label="${defVisible ? 'Disable' : 'Enable'} ${ref.type} ${ref.id}">
            ${defVisible ? EYE_OPEN : EYE_CLOSED}
          </button>
        `;

        subRow.querySelector('.eye-btn').addEventListener('click', () => {
          this.toggleDefsVisibility(defKey);
        });

        list.appendChild(subRow);
      }
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
          width: 180px;
          max-height: 240px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
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

        .layer-list {
          overflow-y: auto;
          flex: 1;
        }

        .layer-row {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0rem 0.5rem;
          height: 28px;
          box-sizing: border-box;
        }

        .layer-row:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
        }

        .color-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .layer-name {
          flex: 1;
          font-size: 0.75rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-primary, #1a1a2e);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .type-badge {
          font-size: 0.5625rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-secondary, #64748b);
          background: var(--bg-secondary, #f1f5f9);
          padding: 0.0625rem 0.25rem;
          border-radius: var(--radius-sm, 4px);
          flex-shrink: 0;
        }

        .eye-btn {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          border-radius: var(--radius-sm, 4px);
          flex-shrink: 0;
          transition: color var(--transition-base, 0.15s ease);
        }

        .eye-btn:hover {
          color: var(--text-primary, #1a1a2e);
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
        }

        .defs-row {
          padding-left: 0.5rem;
        }

        .tree-connector {
          box-sizing: border-box;
          margin-inline-start: 4px;
          width: 6px;
          height: 12px;
          flex-shrink: 0;
          border-left: 1px solid var(--text-secondary, #666);
          border-bottom: 1px solid var(--text-secondary, #666);
          border-bottom-left-radius: 3px;
          margin-block-end: 10px;
        }

        .defs-badge {
          font-size: 0.5rem;
        }

        @media (max-width: 800px) {
          .panel {
            width: 160px;
          }
        }
      </style>

      <div class="panel">
        <div class="panel-header">
          <span class="collapse-arrow">&#9660;</span>
          Layers
        </div>
        <div class="layer-list"></div>
      </div>
    `;

    this.shadowRoot.querySelector('.panel-header').addEventListener('click', () => {
      this.toggleCollapse();
    });
  }
}

customElements.define('layers-panel', LayersPanel);
