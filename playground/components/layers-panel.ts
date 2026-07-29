// Floating layers panel for layer inspection and visibility control

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
import { cssValueForStyleAttr, escapeHtml } from '../utils/html-escape.js';
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
  private _updateScheduled = false;

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

  set layers(value: LayerOutput[]) { this._layers = value || []; this._scheduleUpdate(); }
  set masks(value: { id: string }[]) { this._masks = value || []; this._scheduleUpdate(); }
  set clipPaths(value: { id: string }[]) { this._clipPaths = value || []; this._scheduleUpdate(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this._scheduleUpdate(); }
  set layerVisibility(value: Record<string, boolean>) { this._layerVisibility = value || {}; this._scheduleUpdate(); }
  set defsVisibility(value: Record<string, boolean>) { this._defsVisibility = value || {}; this._scheduleUpdate(); }

  /**
   * Coalesce back-to-back property assignments (a setData pass assigns up to
   * six fields) into a single updateList per microtask.
   */
  private _scheduleUpdate(): void {
    if (this._updateScheduled) return;
    this._updateScheduled = true;
    queueMicrotask(() => {
      this._updateScheduled = false;
      if (this.isConnected) this.updateList();
    });
  }

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

  /**
   * Append a layer row (plus its defs sub-rows and group children) to `parts`
   * as HTML strings. The whole list becomes one innerHTML assignment in
   * updateList \u2014 a single parse instead of one per row \u2014 and clicks are
   * handled by delegation on the list container (see render), so no per-row
   * listeners are needed.
   */
  renderLayerRow(
    layer: LayerOutput,
    parts: string[],
    depth: number,
    visibility: Record<string, boolean>,
    defsVisibility: Record<string, boolean>,
    layerDefs: Map<string, DefRef[]>,
  ): void {
    const isVisible = visibility[layer.name] !== false;
    const color = this.getLayerColor(layer);
    const name = escapeHtml(layer.name);

    // Resolve fill/stroke for gradient-aware swatch
    const fillResolved = this.resolveStyleColor(layer.styles?.fill);
    const strokeResolved = this.resolveStyleColor(layer.styles?.stroke);
    const dotResolved = strokeResolved && !fillResolved ? strokeResolved : fillResolved || strokeResolved || null;
    const dotCss = dotResolved ? cssValueForStyleAttr(dotResolved.css) : cssValueForStyleAttr(color);
    const dotStyle = dotResolved && dotCss
      ? `background: ${dotCss}${dotResolved.isGradient ? '; border-radius: 2px' : ''}`
      : `background: ${dotCss ?? '#333'}`;

    const isGroup = layer.type === 'group';
    const isGroupCollapsed = isGroup && this._collapsedGroups.has(layer.name);

    const rowStyles: string[] = [];
    if (depth > 0) rowStyles.push(`padding-left: calc(0.5rem + ${depth} * 0.5rem)`);
    if (isGroup) rowStyles.push('cursor: pointer');

    const connectorHTML = depth > 0 ? '<span class="tree-connector"></span>' : '';
    const groupChevronHTML = isGroup
      ? `<button class="group-chevron${isGroupCollapsed ? ' collapsed' : ''}" title="${isGroupCollapsed ? 'Expand' : 'Collapse'} group">${isGroupCollapsed ? '\u25B6' : '\u25BC'}</button>`
      : '';

    parts.push(`<div class="${depth > 0 ? 'layer-row group-child' : 'layer-row'}" data-layer-name="${name}"${
      isGroup ? ' data-group="1"' : ''
    }${rowStyles.length ? ` style="${rowStyles.join('; ')}"` : ''}>
      ${connectorHTML}
      ${groupChevronHTML}
      <span class="color-dot" style="${escapeHtml(dotStyle)}"></span>
      <span class="layer-name" title="${name}">${name}</span>
      <span class="type-badge">${layer.type === 'text' ? 'text' : layer.type === 'fragment' ? 'frag' : layer.type === 'group' ? 'grp' : 'path'}</span>
      <button class="eye-btn" title="${isVisible ? 'Hide layer' : 'Show layer'}" aria-label="${isVisible ? 'Hide' : 'Show'} ${name}">
        ${isVisible ? EYE_OPEN : EYE_CLOSED}
      </button>
    </div>`);

    // Render nested mask/clipPath rows for this layer
    const refs = layerDefs.get(layer.name) || [];
    for (const ref of refs) {
      const defKey = `${ref.type}:${ref.id}`;
      const defVisible = defsVisibility[defKey] !== false;
      const id = escapeHtml(ref.id);
      parts.push(`<div class="layer-row defs-row" data-def-key="${escapeHtml(defKey)}" style="padding-left: calc(0.5rem + ${depth + 1} * 0.5rem)">
        <span class="tree-connector"></span>
        <span class="layer-name" title="${id}">${id}</span>
        <span class="type-badge defs-badge">${ref.type === 'mask' ? 'mask' : 'clip'}</span>
        <button class="eye-btn" title="${defVisible ? 'Disable' : 'Enable'} ${ref.type}" aria-label="${defVisible ? 'Disable' : 'Enable'} ${ref.type} ${id}">
          ${defVisible ? EYE_OPEN : EYE_CLOSED}
        </button>
      </div>`);
    }

    // Recursively render group children (children are LayerOutput objects, not names)
    if (isGroup && !isGroupCollapsed && layer.children) {
      for (const childLayer of layer.children) {
        this.renderLayerRow(childLayer, parts, depth + 1, visibility, defsVisibility, layerDefs);
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

    // Show empty state in embedded mode
    if (isEmpty && this.hasAttribute('embedded')) {
      list.innerHTML = '<div class="empty-state">No layers</div>';
      return;
    }

    const parts: string[] = [];
    for (const layer of layers) {
      this.renderLayerRow(layer, parts, 0, visibility, defsVisibility, layerDefs);
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
          Layers
          <span class="badge"></span>
        </div>
        <div class="layer-list"></div>
      </div>
    `;

    (this.shadowRoot!.querySelector('.panel-header') as HTMLElement).addEventListener('click', () => {
      this.toggleCollapse();
    });

    // Delegated click handling for all rows (rows are re-rendered wholesale,
    // so per-row listeners would be re-attached constantly).
    (this.shadowRoot!.querySelector('.layer-list') as HTMLElement).addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const row = target.closest('.layer-row') as HTMLElement | null;
      if (!row) return;
      const defKey = row.dataset.defKey;
      const layerName = row.dataset.layerName;

      if (target.closest('.eye-btn')) {
        e.stopPropagation();
        if (defKey !== undefined) this.toggleDefsVisibility(defKey);
        else if (layerName !== undefined) this.toggleVisibility(layerName);
        return;
      }

      // Clicking anywhere else on a group row toggles its collapse state
      if (row.dataset.group === '1' && layerName !== undefined) {
        if (this._collapsedGroups.has(layerName)) {
          this._collapsedGroups.delete(layerName);
        } else {
          this._collapsedGroups.add(layerName);
        }
        this.updateList();
      }
    });
  }
}

customElements.define('layers-panel', LayersPanel);
