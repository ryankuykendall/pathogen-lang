// The inspector's Canvas section: the preview's Background, Grid and
// Precision, which used to sit in the footer.
//
// Values come in through `settings`; each change goes out as a
// `canvas-change` event ({ setting, value }), and the owner writes the store,
// saves the preferences and updates the preview. The section never reads the
// store, so another surface can give it its own values.

import './shared/pathogen-color-input.js';
import styles from './canvas-panel.css';

export interface CanvasSettings {
  background: string;
  gridEnabled: boolean;
  gridColor: string;
  gridSize: number;
  /** Decimal places for the path data, or null for full precision ("Off"). */
  toFixed: number | null;
}

export type CanvasSetting = keyof CanvasSettings;

export interface CanvasChangeDetail {
  setting: CanvasSetting;
  value: CanvasSettings[CanvasSetting];
}

/** The playground's defaults (state/store.ts), shown until settings arrive. */
const DEFAULT_SETTINGS: CanvasSettings = {
  background: '#f5f5f5',
  gridEnabled: true,
  gridColor: '#cccccc',
  gridSize: 20,
  toFixed: null,
};

const GRID_SIZES = [10, 20, 25, 50, 100];
const PRECISIONS = [0, 1, 2, 3, 4];

const PRECISION_HINT = 'Rounds the numbers in the path data. Export starts from this value.';

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Select `value` in a select of fixed options. A value outside the list (an
 * older preference) gets an option of its own, so the select never shows a
 * different value from the one in use.
 */
function selectValue(select: HTMLSelectElement, value: string, label: string): void {
  select.querySelector('option.extra')?.remove();
  if (!Array.from(select.options).some((o) => o.value === value)) {
    const option = document.createElement('option');
    option.className = 'extra';
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
}

export class CanvasPanel extends HTMLElement {
  private _settings: CanvasSettings = { ...DEFAULT_SETTINGS };

  private _collapsed = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.shadowRoot!.firstChild) {
      this.render();
      this.setupEventListeners();
    }
    this.sync();
  }

  get settings(): CanvasSettings {
    return { ...this._settings };
  }

  set settings(value: CanvasSettings) {
    this._settings = { ...value };
    this.sync();
  }

  private el<T extends Element>(selector: string): T | null {
    return this.shadowRoot!.querySelector<T>(selector);
  }

  /** Show the current settings, changing the controls in place (an open colour picker stays open). */
  private sync(): void {
    if (!this.shadowRoot!.firstChild) return;
    const s = this._settings;
    const bg = this.el<HTMLElement & { value: string }>('#bg')!;
    if (bg.getAttribute('value') !== s.background) bg.value = s.background;
    const bgValue = this.el<HTMLElement>('.bg-value')!;
    bgValue.textContent = s.background;
    bgValue.title = s.background;
    this.el<HTMLInputElement>('#grid-enabled')!.checked = s.gridEnabled;
    const gridColor = this.el<HTMLElement & { value: string }>('#grid-color')!;
    if (gridColor.getAttribute('value') !== s.gridColor) gridColor.value = s.gridColor;
    selectValue(this.el<HTMLSelectElement>('#grid-size')!, String(s.gridSize), `${s.gridSize}px`);
    selectValue(
      this.el<HTMLSelectElement>('#to-fixed')!,
      s.toFixed == null ? '' : String(s.toFixed),
      String(s.toFixed),
    );
  }

  private emit(setting: CanvasSetting, value: CanvasSettings[CanvasSetting]): void {
    this.dispatchEvent(
      new CustomEvent<CanvasChangeDetail>('canvas-change', {
        bubbles: true,
        composed: true,
        detail: { setting, value },
      }),
    );
  }

  private toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    const header = this.el<HTMLButtonElement>('.panel-header')!;
    header.setAttribute('aria-expanded', String(!this._collapsed));
    this.el<HTMLElement>('.collapse-arrow')!.classList.toggle('collapsed', this._collapsed);
    this.el<HTMLElement>('.canvas-body')!.hidden = this._collapsed;
    // The inspector re-windows its virtualized lists below this section.
    this.dispatchEvent(new CustomEvent('inspector-section-resize', { bubbles: true, composed: true }));
  }

  private setupEventListeners(): void {
    this.el('.panel-header')!.addEventListener('click', () => this.toggleCollapse());

    const colorOf = (e: Event): string => (e as CustomEvent<{ value: string }>).detail.value;
    this.el('#bg')!.addEventListener('color-change', (e) => this.emit('background', colorOf(e)));
    this.el('#grid-color')!.addEventListener('color-change', (e) => this.emit('gridColor', colorOf(e)));

    const gridEnabled = this.el<HTMLInputElement>('#grid-enabled')!;
    gridEnabled.addEventListener('change', () => this.emit('gridEnabled', gridEnabled.checked));

    const gridSize = this.el<HTMLSelectElement>('#grid-size')!;
    gridSize.addEventListener('change', () => this.emit('gridSize', parseInt(gridSize.value, 10)));

    const toFixed = this.el<HTMLSelectElement>('#to-fixed')!;
    toFixed.addEventListener('change', () =>
      this.emit('toFixed', toFixed.value === '' ? null : parseInt(toFixed.value, 10)),
    );
  }

  render(): void {
    const s = this._settings;
    const sizes = GRID_SIZES.map((n) => `<option value="${n}">${n}px</option>`).join('');
    const precisions = PRECISIONS.map((n) => `<option value="${n}">${n}</option>`).join('');
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <div class="panel">
        <button type="button" class="panel-header" aria-expanded="true" aria-controls="canvas-body">
          <span class="collapse-arrow" aria-hidden="true">&#9660;</span>Canvas
        </button>
        <div class="canvas-body" id="canvas-body">
          <div class="row">
            <span class="row-label">Background</span>
            <span class="row-controls">
              <pathogen-color-input id="bg" compact aria-label="Background color" title="Background color" value="${escapeAttr(s.background)}"></pathogen-color-input>
              <span class="bg-value"></span>
            </span>
          </div>
          <div class="row">
            <span class="row-label">Grid</span>
            <span class="row-controls">
              <input type="checkbox" id="grid-enabled" aria-label="Show grid" title="Show grid">
              <pathogen-color-input id="grid-color" compact aria-label="Grid color" title="Grid color" value="${escapeAttr(s.gridColor)}"></pathogen-color-input>
              <select id="grid-size" aria-label="Grid size" title="Grid size">${sizes}</select>
            </span>
          </div>
          <div class="row" title="${PRECISION_HINT}">
            <label class="row-label" for="to-fixed">Precision</label>
            <span class="row-controls">
              <select id="to-fixed"><option value="">Off</option>${precisions}</select>
            </span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('canvas-panel', CanvasPanel);

declare global {
  interface HTMLElementTagNameMap {
    'canvas-panel': CanvasPanel;
  }
}
