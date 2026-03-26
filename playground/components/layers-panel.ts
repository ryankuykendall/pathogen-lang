// Floating layers panel for layer inspection and visibility control

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
import styles from './layers-panel.css';

const EYE_OPEN = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3z" fill="currentColor" opacity="0.15"/>
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor"/>
</svg>`;

const EYE_CLOSED = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor" opacity="0.3"/>
  <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

interface ResolvedColor {
  isGradient: boolean;
  css: string;
}

interface DefRef {
  type: 'mask' | 'clip-path';
  id: string;
}

export class LayersPanel extends HTMLElement {
  private _collapsed: boolean;
  private _collapsedGroups: Set<string>;
  private _layers: LayerOutput[] = [];
  private _masks: { id: string }[] = [];
  private _clipPaths: { id: string }[] = [];
  private _gradients: GradientOutput[] = [];
  private _layerVisibility: Record<string, boolean> = {};
  private _defsVisibility: Record<string, boolean> = {};

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
    this._collapsedGroups = new Set();
  }

  connectedCallback(): void {
    this.render();
    this.updateList();
  }

  set layers(value: LayerOutput[]) { this._layers = value || []; this.updateList(); }
  set masks(value: { id: string }[]) { this._masks = value || []; this.updateList(); }
  set clipPaths(value: { id: string }[]) { this._clipPaths = value || []; this.updateList(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this.updateList(); }
  set layerVisibility(value: Record<string, boolean>) { this._layerVisibility = value || {}; this.updateList(); }
  set defsVisibility(value: Record<string, boolean>) { this._defsVisibility = value || {}; this.updateList(); }

  /** Convert a GradientOutput to a CSS background value */
  gradientToCSS(grad: GradientOutput): string | null {
    if (!grad || grad.stops.length === 0) return null;
    const stops = grad.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(0)}%`).join(', ');
    if (grad.type === 'radial') return `radial-gradient(circle, ${stops})`;
    return `linear-gradient(to right, ${stops})`;
  }

  /** Resolve a style value, returning { color, isGradient, css } */
  resolveStyleColor(value: string | undefined): ResolvedColor | null {
    if (!value || value === 'none') return null;
    const urlMatch = value.match(/^url\(#(.+?)\)$/);
    if (urlMatch) {
      const gradients = this._gradients;
      const grad = gradients.find((g) => g.id === urlMatch[1]);
      if (grad) {
        // For inherited gradients with no stops, walk the href chain
        let resolved = grad;
        while (resolved.stops.length === 0 && resolved.href) {
          resolved = gradients.find((g) => g.id === resolved.href) || resolved;
          if (resolved.stops.length === 0 && !resolved.href) break;
        }
        const css = this.gradientToCSS(resolved);
        if (css) return { isGradient: true, css };
      }
      return null;
    }
    return { isGradient: false, css: value };
  }

  getLayerColor(layer: LayerOutput): string {
    if (layer.type === 'text') {
      return layer.styles?.fill || '#333';
    }
    const stroke = layer.styles?.stroke;
    const fill = layer.styles?.fill;
    // Prefer stroke, but fall back to fill if stroke is missing or 'none'
    if (stroke && stroke !== 'none') return stroke;
    if (fill && fill !== 'none') return fill;
    return '#333';
  }

  toggleVisibility(name: string): void {
    this._layerVisibility = { ...this._layerVisibility };
    this._layerVisibility[name] = this._layerVisibility[name] === false;
    this.updateList();
    this.dispatchEvent(
      new CustomEvent<{ name: string; visible: boolean }>('layer-visibility-change', {
        bubbles: true,
        composed: true,
        detail: { name, visible: this._layerVisibility[name] },
      }),
    );
  }

  toggleDefsVisibility(key: string): void {
    this._defsVisibility = { ...this._defsVisibility };
    this._defsVisibility[key] = this._defsVisibility[key] === false;
    this.updateList();
    this.dispatchEvent(
      new CustomEvent<{ key: string; visible: boolean }>('defs-visibility-change', {
        bubbles: true,
        composed: true,
        detail: { key, visible: this._defsVisibility[key] },
      }),
    );
  }

  renderLayerRow(
    layer: LayerOutput,
    list: HTMLElement,
    depth: number,
    visibility: Record<string, boolean>,
    defsVisibility: Record<string, boolean>,
    layerDefs: Map<string, DefRef[]>,
    layersByName: Map<string, LayerOutput>,
  ): void {
    const isVisible = visibility[layer.name] !== false;
    const color = this.getLayerColor(layer);

    // Resolve fill/stroke for gradient-aware swatch
    const fillResolved = this.resolveStyleColor(layer.styles?.fill);
    const strokeResolved = this.resolveStyleColor(layer.styles?.stroke);
    const dotResolved = strokeResolved && !fillResolved ? strokeResolved : fillResolved || strokeResolved || null;
    const dotStyle = dotResolved
      ? `background: ${dotResolved.css}${dotResolved.isGradient ? '; border-radius: 2px' : ''}`
      : `background: ${color}`;

    const row = document.createElement('div');
    row.className = depth > 0 ? 'layer-row group-child' : 'layer-row';
    if (depth > 0) row.style.paddingLeft = `calc(0.5rem + ${depth} * 0.5rem)`;

    const connectorHTML = depth > 0 ? '<span class="tree-connector"></span>' : '';

    const isGroup = layer.type === 'group';
    const isGroupCollapsed = isGroup && this._collapsedGroups.has(layer.name);
    const groupChevronHTML = isGroup
      ? `<button class="group-chevron${isGroupCollapsed ? ' collapsed' : ''}" title="${isGroupCollapsed ? 'Expand' : 'Collapse'} group">${isGroupCollapsed ? '\u25B6' : '\u25BC'}</button>`
      : '';

    row.innerHTML = `
      ${connectorHTML}
      ${groupChevronHTML}
      <span class="color-dot" style="${dotStyle}"></span>
      <span class="layer-name" title="${layer.name}">${layer.name}</span>
      <span class="type-badge">${layer.type === 'text' ? 'text' : layer.type === 'fragment' ? 'frag' : layer.type === 'group' ? 'grp' : 'path'}</span>
      <button class="eye-btn" title="${isVisible ? 'Hide layer' : 'Show layer'}" aria-label="${isVisible ? 'Hide' : 'Show'} ${layer.name}">
        ${isVisible ? EYE_OPEN : EYE_CLOSED}
      </button>
    `;

    (row.querySelector('.eye-btn') as HTMLButtonElement).addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleVisibility(layer.name);
    });

    if (isGroup) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e: MouseEvent) => {
        // Don't toggle if the eye button was clicked
        if ((e.target as HTMLElement).closest('.eye-btn')) return;
        if (this._collapsedGroups.has(layer.name)) {
          this._collapsedGroups.delete(layer.name);
        } else {
          this._collapsedGroups.add(layer.name);
        }
        this.updateList();
      });
    }

    list.appendChild(row);

    // Render nested mask/clipPath rows for this layer
    const refs = layerDefs.get(layer.name) || [];
    for (const ref of refs) {
      const defKey = `${ref.type}:${ref.id}`;
      const defVisible = defsVisibility[defKey] !== false;
      const subRow = document.createElement('div');
      subRow.className = 'layer-row defs-row';
      subRow.style.paddingLeft = `calc(0.5rem + ${depth + 1} * 0.5rem)`;

      subRow.innerHTML = `
        <span class="tree-connector"></span>
        <span class="layer-name" title="${ref.id}">${ref.id}</span>
        <span class="type-badge defs-badge">${ref.type === 'mask' ? 'mask' : 'clip'}</span>
        <button class="eye-btn" title="${defVisible ? 'Disable' : 'Enable'} ${ref.type}" aria-label="${defVisible ? 'Disable' : 'Enable'} ${ref.type} ${ref.id}">
          ${defVisible ? EYE_OPEN : EYE_CLOSED}
        </button>
      `;

      (subRow.querySelector('.eye-btn') as HTMLButtonElement).addEventListener('click', () => {
        this.toggleDefsVisibility(defKey);
      });

      list.appendChild(subRow);
    }

    // Recursively render group children (children are LayerOutput objects, not names)
    if (isGroup && !isGroupCollapsed && layer.children) {
      for (const childLayer of layer.children) {
        this.renderLayerRow(childLayer, list, depth + 1, visibility, defsVisibility, layerDefs, layersByName);
      }
    }
  }

  toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot!.querySelector('.layer-list') as HTMLElement | null;
    const arrow = this.shadowRoot!.querySelector('.collapse-arrow') as HTMLElement | null;
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  updateList(): void {
    const layers = this._layers;
    const masks = this._masks;
    const clipPaths = this._clipPaths;
    const visibility = this._layerVisibility;
    const defsVisibility = this._defsVisibility;

    // Hide entirely when <= 1 layer and no masks/clipPaths (standalone only)
    const hasDefs = masks.length > 0 || clipPaths.length > 0;
    const isEmbedded = this.hasAttribute('embedded');
    // Standalone: hide when single default layer and no defs
    // Embedded: only treat as empty when literally 0 layers and no defs
    const isEmpty = isEmbedded ? layers.length === 0 && !hasDefs : layers.length <= 1 && !hasDefs;
    if (!isEmbedded) {
      this.style.display = isEmpty ? 'none' : '';
    }

    // Update badge count (recursively count all layers including group children)
    const badge = this.shadowRoot!.querySelector('.badge');
    const countLayers = (list: LayerOutput[]): number => {
      let n = 0;
      for (const l of list) {
        n++;
        if (l.type === 'group' && l.children) n += countLayers(l.children);
      }
      return n;
    };
    const totalCount = countLayers(layers) + masks.length + clipPaths.length;
    if (badge) badge.textContent = totalCount > 0 ? String(totalCount) : '';

    const list = this.shadowRoot!.querySelector('.layer-list') as HTMLElement | null;
    if (!list) return;

    // Build lookup of mask/clipPath IDs referenced by each layer
    const layerDefs = new Map<string, DefRef[]>();
    for (const layer of layers) {
      const refs: DefRef[] = [];
      for (const [, val] of Object.entries(layer.styles || {})) {
        const match = val.match(/url\(#(.+?)\)/);
        if (match) {
          const refId = match[1];
          // Check if it's a mask or clip-path
          if (masks.some((m) => m.id === refId)) {
            refs.push({ type: 'mask', id: refId });
          } else if (clipPaths.some((c) => c.id === refId)) {
            refs.push({ type: 'clip-path', id: refId });
          }
        }
      }
      if (refs.length > 0) layerDefs.set(layer.name, refs);
    }

    list.innerHTML = '';

    // Show empty state in embedded mode
    if (isEmpty && this.hasAttribute('embedded')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No layers';
      list.appendChild(empty);
      return;
    }

    // Build a lookup of all layers by name (for mask/clipPath ref resolution)
    const layersByName = new Map<string, LayerOutput>();
    for (const layer of layers) layersByName.set(layer.name, layer);

    for (const layer of layers) {
      this.renderLayerRow(layer, list, 0, visibility, defsVisibility, layerDefs, layersByName);
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
          Layers
          <span class="badge"></span>
        </div>
        <div class="layer-list"></div>
      </div>
    `;

    (this.shadowRoot!.querySelector('.panel-header') as HTMLElement).addEventListener('click', () => {
      this.toggleCollapse();
    });
  }
}

customElements.define('layers-panel', LayersPanel);
