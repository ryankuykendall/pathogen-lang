// Floating layers panel for layer inspection and visibility control

import type { GradientOutput, LayerOutput } from '../types/compiler.js';
import { cssValueForStyleAttr, escapeHtml } from '../utils/html-escape.js';
import { perfSpan } from '../utils/perf-marks.js';
import { VirtualList } from '../utils/virtual-list.js';
import styles from './layers-panel.css';

const EYE_OPEN = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3z" fill="currentColor" opacity="0.15"/>
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor"/>
</svg>`;

const EYE_CLOSED = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 3C4.36 3 1.26 5.28 0 8.5c1.26 3.22 4.36 5.5 8 5.5s6.74-2.28 8-5.5C14.74 5.28 11.64 3 8 3zm0 9.17a3.67 3.67 0 1 1 0-7.34 3.67 3.67 0 0 1 0 7.34zm0-5.87a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor" opacity="0.3"/>
  <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// Must match .layer-row height in layers-panel.css — the virtual list uses it
// to compute scroll geometry without measuring.
const ROW_H = 28;

interface ResolvedColor {
  isGradient: boolean;
  css: string;
}

interface DefRef {
  type: 'mask' | 'clip-path';
  id: string;
}

type LayerRowDesc =
  | { kind: 'layer'; h: number; layer: LayerOutput; depth: number }
  | { kind: 'def'; h: number; ref: DefRef; depth: number };

/** Escape a value for use inside a quoted CSS attribute selector. */
function cssSelectorEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
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

  private _dirtyWhileCollapsed = false;

  private _gradientById = new Map<string, GradientOutput>();

  private _virtual: VirtualList<LayerRowDesc> | null = null;

  private _scrollHost: HTMLElement | null = null;

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

  disconnectedCallback(): void {
    this._virtual?.destroy();
    this._virtual = null;
  }

  set layers(value: LayerOutput[]) { this._layers = value || []; this._scheduleUpdate(); }
  set masks(value: { id: string }[]) { this._masks = value || []; this._scheduleUpdate(); }
  set clipPaths(value: { id: string }[]) { this._clipPaths = value || []; this._scheduleUpdate(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this._scheduleUpdate(); }

  set layerVisibility(value: Record<string, boolean>) {
    const prev = this._layerVisibility;
    this._layerVisibility = value || {};
    this._applyVisibilityDiff(prev, this._layerVisibility, (name) => this._patchLayerEye(name));
  }

  set defsVisibility(value: Record<string, boolean>) {
    const prev = this._defsVisibility;
    this._defsVisibility = value || {};
    this._applyVisibilityDiff(prev, this._defsVisibility, (key) => this._patchDefEye(key));
  }

  /**
   * A visibility change never adds or removes rows — hidden layers keep a row
   * with a closed eye — so instead of scheduling a full rebuild, patch the
   * eye affordance of each flipped row in place. Falls back to a scheduled
   * rebuild while rows aren't built yet (or one is already queued, in which
   * case it will read the new map anyway).
   */
  private _applyVisibilityDiff(
    prev: Record<string, boolean>,
    next: Record<string, boolean>,
    patch: (key: string) => void,
  ): void {
    if (this._updateScheduled || !this._virtual || this._virtual.windowStart < 0) {
      this._scheduleUpdate();
      return;
    }
    // A key absent from a map means visible (only `=== false` hides).
    for (const key of Object.keys(prev)) {
      const wasVisible = prev[key] !== false;
      const isVisible = next[key] !== false;
      if (wasVisible !== isVisible) patch(key);
    }
    for (const key of Object.keys(next)) {
      if (!(key in prev) && next[key] === false) patch(key);
    }
  }

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

  /**
   * Scroll container driving the virtual window. The embedded inspector
   * passes its shared `.inspector` scroller; standalone panels leave this
   * unset and the list element scrolls itself.
   */
  set scrollHost(el: HTMLElement | null) {
    this._scrollHost = el;
    this._virtual?.setScroller(el);
  }

  /** Re-window against current scroll/viewport geometry (e.g. after the inspector opens). */
  refreshVirtual(): void {
    this._virtual?.refresh();
  }

  /**
   * A local height change (section or group collapse) shifts the sibling
   * panels' offsets within the shared shell scroller; announce it so the
   * inspector can re-window every panel (their listTop went stale).
   */
  private _notifySectionResize(): void {
    this.dispatchEvent(new CustomEvent('inspector-section-resize', { bubbles: true, composed: true }));
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
      const grad = this._gradientById.get(urlMatch[1]);
      if (grad) {
        // For inherited gradients with no stops, walk the href chain
        let resolved = grad;
        while (resolved.stops.length === 0 && resolved.href) {
          resolved = this._gradientById.get(resolved.href) || resolved;
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
    this._patchLayerEye(name);
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
    this._patchDefEye(key);
    this.dispatchEvent(
      new CustomEvent<{ key: string; visible: boolean }>('defs-visibility-change', {
        bubbles: true,
        composed: true,
        detail: { key, visible: this._defsVisibility[key] },
      }),
    );
  }

  private _patchLayerEye(name: string): void {
    const row = this.shadowRoot!.querySelector(
      `.layer-row[data-layer-name="${cssSelectorEscape(name)}"]:not(.defs-row)`,
    );
    const btn = row?.querySelector('.eye-btn') as HTMLElement | null;
    if (!btn) return; // outside the rendered window — re-rendered correctly on scroll
    const visible = this._layerVisibility[name] !== false;
    btn.innerHTML = visible ? EYE_OPEN : EYE_CLOSED;
    btn.setAttribute('title', visible ? 'Hide layer' : 'Show layer');
    btn.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${name}`);
  }

  private _patchDefEye(defKey: string): void {
    const row = this.shadowRoot!.querySelector(`.layer-row[data-def-key="${cssSelectorEscape(defKey)}"]`);
    const btn = row?.querySelector('.eye-btn') as HTMLElement | null;
    if (!btn) return;
    const visible = this._defsVisibility[defKey] !== false;
    const type = defKey.startsWith('mask:') ? 'mask' : 'clip-path';
    const id = defKey.slice(defKey.indexOf(':') + 1);
    btn.innerHTML = visible ? EYE_OPEN : EYE_CLOSED;
    btn.setAttribute('title', `${visible ? 'Disable' : 'Enable'} ${type}`);
    btn.setAttribute('aria-label', `${visible ? 'Disable' : 'Enable'} ${type} ${id}`);
  }

  /**
   * Flatten the layer tree into fixed-height row descriptors for the virtual
   * list: one row per layer, def sub-rows for referenced masks/clip-paths
   * (group children included), recursion skipped under collapsed groups.
   * Collapsed subtrees are still counted for the badge.
   */
  private _buildRows(defTypeById: Map<string, 'mask' | 'clip-path'>): { rows: LayerRowDesc[]; layerCount: number } {
    const rows: LayerRowDesc[] = [];
    let layerCount = 0;
    const walk = (layers: LayerOutput[], depth: number, emit: boolean): void => {
      for (const layer of layers) {
        layerCount++;
        if (emit) {
          rows.push({ kind: 'layer', h: ROW_H, layer, depth });
          for (const [, val] of Object.entries(layer.styles || {})) {
            const match = val.match(/url\(#(.+?)\)/);
            if (match) {
              const type = defTypeById.get(match[1]);
              if (type) rows.push({ kind: 'def', h: ROW_H, ref: { type, id: match[1] }, depth });
            }
          }
        }
        if (layer.type === 'group' && layer.children) {
          walk(layer.children, depth + 1, emit && !this._collapsedGroups.has(layer.name));
        }
      }
    };
    walk(this._layers, 0, true);
    return { rows, layerCount };
  }

  /** Render one row descriptor to an HTML string (see _renderSlice). */
  private _renderRowHtml(row: LayerRowDesc): string {
    if (row.kind === 'def') {
      const { ref, depth } = row;
      const defKey = `${ref.type}:${ref.id}`;
      const defVisible = this._defsVisibility[defKey] !== false;
      const id = escapeHtml(ref.id);
      return `<div class="layer-row defs-row" data-def-key="${escapeHtml(defKey)}" style="padding-left: calc(0.5rem + ${depth + 1} * 0.5rem)">
        <span class="tree-connector"></span>
        <span class="layer-name" title="${id}">${id}</span>
        <span class="type-badge defs-badge">${ref.type === 'mask' ? 'mask' : 'clip'}</span>
        <button class="eye-btn" title="${defVisible ? 'Disable' : 'Enable'} ${ref.type}" aria-label="${defVisible ? 'Disable' : 'Enable'} ${ref.type} ${id}">
          ${defVisible ? EYE_OPEN : EYE_CLOSED}
        </button>
      </div>`;
    }

    const { layer, depth } = row;
    const isVisible = this._layerVisibility[layer.name] !== false;
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

    return `<div class="${depth > 0 ? 'layer-row group-child' : 'layer-row'}" data-layer-name="${name}"${
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
    </div>`;
  }

  private _renderSlice(rows: LayerRowDesc[], start: number, end: number): string {
    const parts: string[] = [];
    for (let i = start; i < end; i++) parts.push(this._renderRowHtml(rows[i]));
    return parts.join('');
  }

  toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot!.querySelector('.layer-list') as HTMLElement | null;
    const arrow = this.shadowRoot!.querySelector('.collapse-arrow') as HTMLElement | null;
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
    if (!this._collapsed && this._dirtyWhileCollapsed) this.updateList();
    this._notifySectionResize();
  }

  updateList(): void {
    perfSpan('inspector-layers-update', () => this._updateListImpl());
  }

  private _updateListImpl(): void {
    const layers = this._layers;
    const masks = this._masks;
    const clipPaths = this._clipPaths;

    // Hide entirely when <= 1 layer and no masks/clipPaths (standalone only)
    const hasDefs = masks.length > 0 || clipPaths.length > 0;
    const isEmbedded = this.hasAttribute('embedded');
    // Standalone: hide when single default layer and no defs
    // Embedded: only treat as empty when literally 0 layers and no defs
    const isEmpty = isEmbedded ? layers.length === 0 && !hasDefs : layers.length <= 1 && !hasDefs;
    if (!isEmbedded) {
      this.style.display = isEmpty ? 'none' : '';
    }

    const defTypeById = new Map<string, 'mask' | 'clip-path'>();
    for (const m of masks) defTypeById.set(m.id, 'mask');
    for (const c of clipPaths) if (!defTypeById.has(c.id)) defTypeById.set(c.id, 'clip-path');

    // A collapsed section skips the row build entirely; the badge stays live
    // and the rows are rebuilt on expand if anything changed meanwhile.
    if (this._collapsed) {
      this._dirtyWhileCollapsed = true;
      this._updateBadge(this._countLayers(layers) + masks.length + clipPaths.length);
      return;
    }
    this._dirtyWhileCollapsed = false;

    const list = this.shadowRoot!.querySelector('.layer-list') as HTMLElement | null;
    if (!list) return;

    // First match wins on duplicate ids, matching SVG's url(#id) resolution
    // (Map construction alone would let the last duplicate win).
    const gradientById = new Map<string, GradientOutput>();
    for (const g of this._gradients) if (!gradientById.has(g.id)) gradientById.set(g.id, g);
    this._gradientById = gradientById;

    // Show empty state in embedded mode
    if (isEmpty && isEmbedded) {
      this._updateBadge(0);
      this._virtual?.reset();
      list.innerHTML = '<div class="empty-state">No layers</div>';
      return;
    }

    const { rows, layerCount } = this._buildRows(defTypeById);
    this._updateBadge(layerCount + masks.length + clipPaths.length);

    if (!this._virtual) {
      this._virtual = new VirtualList<LayerRowDesc>(list, (r, s, e) => this._renderSlice(r, s, e));
      if (this._scrollHost) this._virtual.setScroller(this._scrollHost);
    }
    this._virtual.setRows(rows);
  }

  private _updateBadge(count: number): void {
    const badge = this.shadowRoot!.querySelector('.badge');
    if (badge) badge.textContent = count > 0 ? String(count) : '';
  }

  private _countLayers(list: LayerOutput[]): number {
    let n = 0;
    for (const l of list) {
      n++;
      if (l.type === 'group' && l.children) n += this._countLayers(l.children);
    }
    return n;
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
    this._virtual?.destroy();
    this._virtual = null;

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
        this._notifySectionResize();
      }
    });
  }
}

customElements.define('layers-panel', LayersPanel);
