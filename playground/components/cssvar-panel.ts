// Floating CSS variable panel for live override of var() references in SVG preview

import type { CSSPropertyDeclaration, GradientOutput, LayerOutput } from '../types/compiler.js';
import styles from './cssvar-panel.css';

// Detect whether a string looks like a CSS color using canvas
let _colorCtx: CanvasRenderingContext2D | null = null;
function looksLikeColor(value: string): boolean {
  if (!value) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^(rgb|hsl|oklch|oklab)a?\(/.test(value)) return true;
  // Use canvas for named colors
  if (!_colorCtx) {
    _colorCtx = document.createElement('canvas').getContext('2d');
  }
  _colorCtx!.fillStyle = '#000001'; // sentinel
  _colorCtx!.fillStyle = value;
  return _colorCtx!.fillStyle !== '#000001';
}

interface VarInfo {
  fallback: string;
  layerName: string;
  property: string;
}

export class CssvarPanel extends HTMLElement {
  private _collapsed: boolean;
  private _overrides: Map<string, string>;
  private _layers: LayerOutput[] = [];
  private _cssProperties: CSSPropertyDeclaration[] = [];
  private _gradients: GradientOutput[] = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._collapsed = false;
    this._overrides = new Map();
  }

  connectedCallback(): void {
    this.render();
    this.updateList();
  }

  set layers(value: LayerOutput[]) { this._layers = value || []; this.updateList(); }
  set cssProperties(value: CSSPropertyDeclaration[]) { this._cssProperties = value || []; this.updateList(); }
  set gradients(value: GradientOutput[]) { this._gradients = value || []; this.updateList(); }

  toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const list = this.shadowRoot!.querySelector('.var-list') as HTMLElement | null;
    const arrow = this.shadowRoot!.querySelector('.collapse-arrow') as HTMLElement | null;
    if (list) list.style.display = this._collapsed ? 'none' : '';
    if (arrow) arrow.classList.toggle('collapsed', this._collapsed);
  }

  private _emitOverride(varName: string, value: string | null): void {
    this.dispatchEvent(
      new CustomEvent<{ varName: string; value: string | null }>('cssvar-override', {
        bubbles: true,
        composed: true,
        detail: { varName, value },
      }),
    );
  }

  private _resetAll(): void {
    for (const varName of this._overrides.keys()) {
      this._emitOverride(varName, null);
    }
    this._overrides.clear();
    this.updateList();
  }

  updateList(): void {
    const layers = this._layers;
    const list = this.shadowRoot!.querySelector('.var-list') as HTMLElement | null;
    if (!list) return;

    list.innerHTML = '';

    // Extract all var(--name, fallback) references from layer styles
    const varMap = new Map<string, VarInfo>();
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

    // Also include CSS properties registered via @property (e.g., from Color(CSSVar(...)) in gradient stops)
    const cssProperties = this._cssProperties;
    for (const prop of cssProperties) {
      if (!varMap.has(prop.name)) {
        varMap.set(prop.name, { fallback: prop.initialValue || '', layerName: '', property: '@property' });
      }
    }

    // Stale cleanup: remove overrides for vars no longer present
    for (const varName of this._overrides.keys()) {
      if (!varMap.has(varName)) {
        this._emitOverride(varName, null);
        this._overrides.delete(varName);
      }
    }

    // Update badge count
    const badge = this.shadowRoot!.querySelector('.badge');
    if (badge) badge.textContent = varMap.size > 0 ? String(varMap.size) : '';

    // Auto-hide when no vars found (standalone only)
    if (!this.hasAttribute('embedded')) {
      this.style.display = varMap.size === 0 ? 'none' : '';
    } else if (varMap.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No CSS variables';
      list.appendChild(empty);
    }

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
          const colorEl = controls.querySelector('.var-color') as HTMLInputElement | null;
          if (colorEl) colorEl.value = this._fallbackToHex(info.fallback);
        }
        resetBtn.style.visibility = 'hidden';
        this._updateResetVisibility();
      });
      controls.appendChild(resetBtn);

      row.appendChild(controls);
      list.appendChild(row);
    }

    // Conic gradient warning: CSS vars are baked at render time for rasterized conic gradients
    const gradients = this._gradients;
    const hasConic = gradients.some((g) => g.type === 'conic');
    const existingNote = list.querySelector('.conic-warning');
    if (existingNote) existingNote.remove();
    if (hasConic && varMap.size > 0) {
      const note = document.createElement('div');
      note.className = 'conic-warning';
      note.textContent = "Conic gradients use baked colors \u2014 CSS variable changes won't update them live.";
      list.appendChild(note);
    }

    // Reset All button
    this._updateResetVisibility();

    if (this._collapsed) {
      list.style.display = 'none';
    }
  }

  private _updateResetVisibility(): void {
    const resetAll = this.shadowRoot!.querySelector('.reset-all') as HTMLElement | null;
    if (resetAll) {
      resetAll.style.display = this._overrides.size > 0 ? '' : 'none';
    }
  }

  private _fallbackToHex(value: string): string {
    if (!value) return '#000000';
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    // Use canvas to resolve any CSS color to hex
    if (!_colorCtx) {
      _colorCtx = document.createElement('canvas').getContext('2d');
    }
    _colorCtx!.fillStyle = '#000000';
    _colorCtx!.fillStyle = value;
    return _colorCtx!.fillStyle;
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="panel">
        <div class="panel-header">
          <span class="collapse-arrow">&#9660;</span>
          CSS Variables
          <span class="badge"></span>
        </div>
        <div class="var-list"></div>
        <div class="reset-all">
          <button>Reset All</button>
        </div>
      </div>
    `;

    (this.shadowRoot!.querySelector('.panel-header') as HTMLElement).addEventListener('click', () => {
      this.toggleCollapse();
    });

    (this.shadowRoot!.querySelector('.reset-all button') as HTMLButtonElement).addEventListener('click', () => {
      this._resetAll();
    });
  }
}

customElements.define('cssvar-panel', CssvarPanel);
