// Consolidated inspector panel — scrollable container with stacked sub-panels

import type { LayersPanel } from './layers-panel.js';
import type { PalettePanel } from './palette-panel.js';
import type { CssvarPanel } from './cssvar-panel.js';
import './layers-panel.js';
import './palette-panel.js';
import './cssvar-panel.js';
import styles from './inspector-panel.css';

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export interface InspectorData {
  layers?: unknown[];
  masks?: { id: string }[];
  clipPaths?: { id: string }[];
  gradients?: unknown[];
  cssProperties?: unknown[];
  layerVisibility?: Record<string, boolean>;
  defsVisibility?: Record<string, boolean>;
}

export class InspectorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  private get layersPanel(): LayersPanel {
    return this.shadowRoot!.querySelector('layers-panel') as LayersPanel;
  }

  private get palettePanel(): PalettePanel {
    return this.shadowRoot!.querySelector('palette-panel') as PalettePanel;
  }

  private get cssvarPanel(): CssvarPanel {
    return this.shadowRoot!.querySelector('cssvar-panel') as CssvarPanel;
  }

  setData(data: InspectorData): void {
    const lp = this.layersPanel;
    const pp = this.palettePanel;
    const cp = this.cssvarPanel;
    if (!lp || !pp || !cp) return;

    if (data.layers !== undefined) {
      lp.layers = data.layers as any;
      pp.layers = data.layers as any;
      cp.layers = data.layers as any;
    }
    if (data.masks !== undefined) lp.masks = data.masks;
    if (data.clipPaths !== undefined) lp.clipPaths = data.clipPaths;
    if (data.gradients !== undefined) {
      lp.gradients = data.gradients as any;
      pp.gradients = data.gradients as any;
      cp.gradients = data.gradients as any;
    }
    if (data.cssProperties !== undefined) cp.cssProperties = data.cssProperties as any;
    if (data.layerVisibility !== undefined) lp.layerVisibility = data.layerVisibility;
    if (data.defsVisibility !== undefined) lp.defsVisibility = data.defsVisibility;
  }

  private setupEventListeners(): void {
    this.shadowRoot!.querySelector('.close-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="inspector">
        <div class="inspector-header">
          <span>Inspector</span>
          <button class="close-btn" title="Close inspector">${CLOSE_ICON}</button>
        </div>
        <layers-panel embedded></layers-panel>
        <palette-panel embedded></palette-panel>
        <cssvar-panel embedded></cssvar-panel>
      </div>
    `;
  }
}

customElements.define('inspector-panel', InspectorPanel);
