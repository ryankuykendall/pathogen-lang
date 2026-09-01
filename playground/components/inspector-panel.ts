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
  // Last references handed to the child panels — used to skip re-assigning
  // (and therefore re-rendering) fields whose identity hasn't changed.
  private _last: InspectorData = {};

  // While closed, setData is deferred: fields merge latest-wins into _pending
  // and are forwarded on open. Defaults to open so consumers that lazy-mount
  // the panel only when visible (mini-workspace, detail-hero-mount) need no
  // wiring; the workspace keeps the panel permanently mounted and drives
  // this from the store's inspectorOpen flag.
  private _open = true;

  private _pending: InspectorData | null = null;

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

  get open(): boolean {
    return this._open;
  }

  set open(value: boolean) {
    const becameOpen = value && !this._open;
    this._open = value;
    if (!becameOpen) return;
    if (this._pending) {
      const pending = this._pending;
      this._pending = null;
      this.setData(pending);
    }
    // The window may have been computed against a zero-height (closed)
    // scroller; re-window once layout has settled after the open transition.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        this.layersPanel?.refreshVirtual();
        this.palettePanel?.refreshVirtual();
      });
    }
  }

  setData(data: InspectorData): void {
    if (!this._open) {
      // Defer while closed. _last is deliberately left untouched so the
      // differential check on open compares against what the children
      // actually hold, not against data they never received.
      this._pending = { ...this._pending, ...data };
      return;
    }

    const lp = this.layersPanel;
    const pp = this.palettePanel;
    const cp = this.cssvarPanel;
    if (!lp || !pp || !cp) return;

    // Differential assignment: a field is forwarded only when its identity
    // changed since the last call, so e.g. a layerVisibility-only update
    // doesn't re-render the (potentially huge) layers list three panels wide.
    const changed = (key: keyof InspectorData): boolean =>
      data[key] !== undefined && data[key] !== this._last[key];

    if (changed('layers')) {
      lp.layers = data.layers as any;
      pp.layers = data.layers as any;
      cp.layers = data.layers as any;
    }
    if (changed('masks')) lp.masks = data.masks!;
    if (changed('clipPaths')) lp.clipPaths = data.clipPaths!;
    if (changed('gradients')) {
      lp.gradients = data.gradients as any;
      pp.gradients = data.gradients as any;
      cp.gradients = data.gradients as any;
    }
    if (changed('cssProperties')) cp.cssProperties = data.cssProperties as any;
    if (changed('layerVisibility')) lp.layerVisibility = data.layerVisibility!;
    if (changed('defsVisibility')) lp.defsVisibility = data.defsVisibility!;

    this._last = { ...this._last, ...data };
  }

  private setupEventListeners(): void {
    this.shadowRoot!.querySelector('.close-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });

    // A section/group collapse in one panel shifts the offsets of everything
    // below it within the shared scroller; re-window every virtualized panel
    // so their listTop measurements don't go stale.
    this.shadowRoot!.addEventListener('inspector-section-resize', () => {
      this.layersPanel?.refreshVirtual();
      this.palettePanel?.refreshVirtual();
    });
  }

  render(): void {
    // Fresh child panels start empty — drop the identity cache so the next
    // setData forwards every field even if the store references are unchanged.
    this._last = {};
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
    // The embedded panels are windowed against the shared shell scroller.
    const scroller = this.shadowRoot!.querySelector('.inspector') as HTMLElement;
    this.layersPanel.scrollHost = scroller;
    this.palettePanel.scrollHost = scroller;
  }
}

customElements.define('inspector-panel', InspectorPanel);
