// Floating CSS variable panel for live override of var() references in SVG preview

import { store } from '../state/store.js';

// Detect whether a string looks like a CSS color using canvas
let _colorCtx = null;
function looksLikeColor(value) {
  if (!value) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^(rgb|hsl|oklch|oklab)a?\(/.test(value)) return true;
  // Use canvas for named colors
  if (!_colorCtx) {
    _colorCtx = document.createElement('canvas').getContext('2d');
  }
  _colorCtx.fillStyle = '#000001'; // sentinel
  _colorCtx.fillStyle = value;
  return _colorCtx.fillStyle !== '#000001';
}

export class CssvarPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
    this._unsubscribe = null;
    this._overrides = new Map(); // varName → value
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe(['layers'], () => {
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
    const list = this.shadowRoot.querySelector('.var-list');
    const arrow = this.shadowRoot.querySelector('.collapse-arrow');
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  _emitOverride(varName, value) {
    this.dispatchEvent(new CustomEvent('cssvar-override', {
      bubbles: true,
      composed: true,
      detail: { varName, value },
    }));
  }

  _resetAll() {
    for (const varName of this._overrides.keys()) {
      this._emitOverride(varName, null);
    }
    this._overrides.clear();
    this.updateList();
  }

  updateList() {
    const layers = store.get('layers') || [];
    const list = this.shadowRoot.querySelector('.var-list');
    if (!list) return;

    list.innerHTML = '';

    // Extract all var(--name, fallback) references
    const varMap = new Map(); // varName → { fallback, layerName, property }
    const varRegex = /var\(\s*(--[\w-]+)\s*(?:,\s*(.+?))?\s*\)/;

    for (const layer of layers) {
      for (const [prop, value] of Object.entries(layer.styles || {})) {
        const m = value.match(varRegex);
        if (!m) continue;
        const varName = m[1];
        const fallback = m[2]?.trim() || '';
        if (!varMap.has(varName)) {
          varMap.set(varName, { fallback, layerName: layer.name, property: prop });
        }
      }
    }

    // Stale cleanup: remove overrides for vars no longer present
    for (const varName of this._overrides.keys()) {
      if (!varMap.has(varName)) {
        this._emitOverride(varName, null);
        this._overrides.delete(varName);
      }
    }

    // Auto-hide when no vars found
    this.style.display = varMap.size === 0 ? 'none' : '';

    for (const [varName, info] of varMap) {
      const row = document.createElement('div');
      row.className = 'var-row';

      const label = document.createElement('span');
      label.className = 'var-name';
      label.textContent = varName;
      label.title = `Used in ${info.layerName}.${info.property}`;
      row.appendChild(label);

      const controls = document.createElement('div');
      controls.className = 'var-controls';

      const isColor = looksLikeColor(info.fallback);
      const currentValue = this._overrides.get(varName) || '';

      if (isColor) {
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'var-color';
        // Convert fallback to hex for input
        colorInput.value = this._fallbackToHex(currentValue || info.fallback);
        colorInput.addEventListener('input', () => {
          const val = colorInput.value;
          this._overrides.set(varName, val);
          textInput.value = val;
          this._emitOverride(varName, val);
          this._updateResetVisibility();
        });
        controls.appendChild(colorInput);
      }

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'var-text';
      textInput.value = currentValue || info.fallback;
      textInput.placeholder = info.fallback || 'value';
      textInput.addEventListener('change', () => {
        const val = textInput.value.trim();
        if (val === '' || val === info.fallback) {
          this._overrides.delete(varName);
          this._emitOverride(varName, null);
          textInput.value = info.fallback;
        } else {
          this._overrides.set(varName, val);
          this._emitOverride(varName, val);
        }
        this._updateResetVisibility();
      });
      controls.appendChild(textInput);

      const isOverridden = this._overrides.has(varName);
      const resetBtn = document.createElement('button');
      resetBtn.className = 'var-reset';
      resetBtn.textContent = '\u00d7';
      resetBtn.title = 'Reset to default';
      resetBtn.style.visibility = isOverridden ? 'visible' : 'hidden';
      resetBtn.addEventListener('click', () => {
        this._overrides.delete(varName);
        this._emitOverride(varName, null);
        textInput.value = info.fallback;
        if (isColor) {
          const colorEl = controls.querySelector('.var-color');
          if (colorEl) colorEl.value = this._fallbackToHex(info.fallback);
        }
        resetBtn.style.visibility = 'hidden';
        this._updateResetVisibility();
      });
      controls.appendChild(resetBtn);

      row.appendChild(controls);
      list.appendChild(row);
    }

    // Reset All button
    this._updateResetVisibility();

    if (this._collapsed) {
      list.style.display = 'none';
    }
  }

  _updateResetVisibility() {
    const resetAll = this.shadowRoot.querySelector('.reset-all');
    if (resetAll) {
      resetAll.style.display = this._overrides.size > 0 ? '' : 'none';
    }
  }

  _fallbackToHex(value) {
    if (!value) return '#000000';
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    // Use canvas to resolve any CSS color to hex
    if (!_colorCtx) {
      _colorCtx = document.createElement('canvas').getContext('2d');
    }
    _colorCtx.fillStyle = '#000000';
    _colorCtx.fillStyle = value;
    return _colorCtx.fillStyle;
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
          width: 220px;
          max-height: 280px;
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

        .var-list {
          overflow-y: auto;
          flex: 1;
        }

        .var-row {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          padding: 0.375rem 0.5rem;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
        }

        .var-row:last-child {
          border-bottom: none;
        }

        .var-name {
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          color: var(--text-primary, #1a1a2e);
          font-weight: 600;
        }

        .var-controls {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .var-color {
          width: 24px;
          height: 22px;
          padding: 0;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 3px;
          cursor: pointer;
          background: none;
          flex-shrink: 0;
        }

        .var-color::-webkit-color-swatch-wrapper { padding: 1px; }
        .var-color::-webkit-color-swatch { border: none; border-radius: 2px; }
        .var-color::-moz-color-swatch { border: none; border-radius: 2px; }

        .var-text {
          flex: 1;
          min-width: 0;
          padding: 0.1875rem 0.375rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 3px;
          background: var(--bg-secondary, #fff);
          color: var(--text-primary, #1a1a2e);
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          outline: none;
        }

        .var-text:focus {
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 2px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }

        .var-reset {
          width: 20px;
          height: 20px;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-secondary, #64748b);
          font-size: 0.875rem;
          line-height: 1;
          border-radius: var(--radius-sm, 4px);
          flex-shrink: 0;
          display: grid;
          place-items: center;
        }

        .var-reset:hover {
          color: var(--error-text, #c00);
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
        }

        .reset-all {
          display: none;
          padding: 0.25rem 0.5rem;
          border-top: 1px solid var(--border-color, #e2e8f0);
        }

        .reset-all button {
          width: 100%;
          padding: 0.25rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          background: var(--bg-secondary, #f1f5f9);
          color: var(--text-secondary, #64748b);
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          cursor: pointer;
        }

        .reset-all button:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          color: var(--error-text, #c00);
        }

        @media (max-width: 800px) {
          .panel {
            width: 190px;
          }
        }
      </style>

      <div class="panel">
        <div class="panel-header">
          <span class="collapse-arrow">&#9660;</span>
          CSS Variables
        </div>
        <div class="var-list"></div>
        <div class="reset-all">
          <button>Reset All</button>
        </div>
      </div>
    `;

    this.shadowRoot.querySelector('.panel-header').addEventListener('click', () => {
      this.toggleCollapse();
    });

    this.shadowRoot.querySelector('.reset-all button').addEventListener('click', () => {
      this._resetAll();
    });
  }
}

customElements.define('cssvar-panel', CssvarPanel);
