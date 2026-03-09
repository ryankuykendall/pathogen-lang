// Footer component with SVG styling controls

import { store } from '../state/store.js';

export class PlaygroundFooter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.subscribeToStore();
  }

  subscribeToStore() {
    // Subscribe to relevant state changes
    store.subscribe(['width', 'height', 'background', 'gridEnabled', 'gridColor', 'gridSize', 'toFixed'], () => {
      this.syncFromStore();
    });

  }

  syncFromStore() {
    const state = store.getAll();
    const root = this.shadowRoot;

    root.querySelector('#width').value = state.width;
    root.querySelector('#height').value = state.height;
    root.querySelector('#bg').value = state.background;
    root.querySelector('#grid-enabled').checked = state.gridEnabled;
    root.querySelector('#grid-color').value = state.gridColor;
    root.querySelector('#grid-size').value = state.gridSize;
    root.querySelector('#to-fixed').value = state.toFixed != null ? String(state.toFixed) : '';
  }

  setupEventListeners() {
    const root = this.shadowRoot;

    // Width/Height
    root.querySelector('#width').addEventListener('input', (e) => {
      store.set('width', parseInt(e.target.value) || 200);
      this.dispatchStyleChange();
    });

    root.querySelector('#height').addEventListener('input', (e) => {
      store.set('height', parseInt(e.target.value) || 200);
      this.dispatchStyleChange();
    });

    // Background
    root.querySelector('#bg').addEventListener('input', (e) => {
      store.set('background', e.target.value);
      this.dispatchStyleChange();
    });

    // Grid
    root.querySelector('#grid-enabled').addEventListener('change', (e) => {
      store.set('gridEnabled', e.target.checked);
      this.dispatchStyleChange();
    });

    root.querySelector('#grid-color').addEventListener('input', (e) => {
      store.set('gridColor', e.target.value);
      this.dispatchStyleChange();
    });

    root.querySelector('#grid-size').addEventListener('change', (e) => {
      store.set('gridSize', e.target.value);
      this.dispatchStyleChange();
    });

    // Precision (toFixed)
    root.querySelector('#to-fixed').addEventListener('change', (e) => {
      const val = e.target.value;
      store.set('toFixed', val === '' ? null : parseInt(val, 10));
      this.dispatchEvent(new CustomEvent('precision-change', {
        bubbles: true,
        composed: true,
        detail: store.getAll()
      }));
    });

    // Docs button
    root.querySelector('#docs-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-docs', { bubbles: true, composed: true }));
    });
  }

  dispatchStyleChange() {
    this.dispatchEvent(new CustomEvent('style-change', {
      bubbles: true,
      composed: true,
      detail: store.getAll()
    }));
  }

  render() {
    const state = store.getAll();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--bg-secondary, #ffffff);
          border-top: 1px solid var(--border-color, #e2e8f0);
          padding: 0.625rem 1rem;
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .separator {
          width: 1px;
          height: 24px;
          background: var(--border-color, #e2e8f0);
          flex-shrink: 0;
        }

        label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        input[type="number"] {
          width: 64px;
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.8125rem;
          font-weight: 500;
          background: var(--bg-tertiary, #f0f1f2);
          color: var(--text-primary, #1a1a2e);
          transition: all var(--transition-base, 0.15s ease);
        }

        input[type="number"]:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
          background: var(--bg-secondary, #ffffff);
        }

        input[type="number"]:hover:not(:focus) {
          border-color: var(--border-strong, #cbd5e1);
        }

        input[type="color"] {
          width: 32px;
          height: 32px;
          padding: 3px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-tertiary, #f0f1f2);
          cursor: pointer;
          transition: all var(--transition-base, 0.15s ease);
        }

        input[type="color"]:hover {
          border-color: var(--border-strong, #cbd5e1);
          transform: scale(1.05);
        }

        input[type="color"]:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }

        input[type="color"]:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }

        input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--accent-color, #10b981);
          border-radius: var(--radius-sm, 4px);
        }

        select {
          min-width: 56px;
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-tertiary, #f0f1f2);
          color: var(--text-primary, #1a1a2e);
          cursor: pointer;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.8125rem;
          font-weight: 500;
          transition: all var(--transition-base, 0.15s ease);
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          padding-right: 1.5rem;
        }

        select:hover {
          border-color: var(--border-strong, #cbd5e1);
        }

        select:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
          background-color: var(--bg-secondary, #ffffff);
        }

        .spacer {
          flex: 1;
        }

        #docs-btn {
          padding: 0.375rem 1rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-tertiary, #f0f1f2);
          color: var(--text-primary, #1a1a2e);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: all var(--transition-base, 0.15s ease);
        }

        #docs-btn:hover {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
        }

        #docs-btn:focus {
          outline: none;
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }

        @media (max-width: 768px) {
          :host {
            padding: 0.5rem 0.75rem;
          }

          .controls {
            gap: 0.75rem;
          }

          .separator {
            display: none;
          }
        }
      </style>

      <div class="controls">
        <div class="control-group">
          <label for="width">W</label>
          <input type="number" id="width" value="${state.width}" min="50" max="20000">
        </div>
        <div class="control-group">
          <label for="height">H</label>
          <input type="number" id="height" value="${state.height}" min="50" max="20000">
        </div>

        <div class="separator"></div>

        <div class="control-group">
          <label for="bg">BG</label>
          <input type="color" id="bg" value="${state.background}">
        </div>

        <div class="separator"></div>

        <div class="control-group">
          <label for="grid-enabled">Grid</label>
          <input type="checkbox" id="grid-enabled" ${state.gridEnabled ? 'checked' : ''}>
          <input type="color" id="grid-color" value="${state.gridColor}">
          <select id="grid-size">
            <option value="10" ${state.gridSize == 10 ? 'selected' : ''}>10px</option>
            <option value="20" ${state.gridSize == 20 ? 'selected' : ''}>20px</option>
            <option value="25" ${state.gridSize == 25 ? 'selected' : ''}>25px</option>
            <option value="50" ${state.gridSize == 50 ? 'selected' : ''}>50px</option>
            <option value="100" ${state.gridSize == 100 ? 'selected' : ''}>100px</option>
          </select>
        </div>

        <div class="separator"></div>

        <div class="control-group">
          <label for="to-fixed">Precision</label>
          <select id="to-fixed">
            <option value="" ${state.toFixed == null ? 'selected' : ''}>Off</option>
            <option value="0" ${state.toFixed === 0 ? 'selected' : ''}>0</option>
            <option value="1" ${state.toFixed === 1 ? 'selected' : ''}>1</option>
            <option value="2" ${state.toFixed === 2 ? 'selected' : ''}>2</option>
            <option value="3" ${state.toFixed === 3 ? 'selected' : ''}>3</option>
            <option value="4" ${state.toFixed === 4 ? 'selected' : ''}>4</option>
          </select>
        </div>

        <div class="spacer"></div>

        <button id="docs-btn">Docs</button>
      </div>
    `;
  }
}

customElements.define('playground-footer', PlaygroundFooter);
