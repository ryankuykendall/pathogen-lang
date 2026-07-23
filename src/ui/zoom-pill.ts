// <pathogen-zoom-pill> — THE zoom control for every Pathogen preview surface
// (workspace preview, export modal, thumbnail modal, mini-workspace, VS Code
// preview webview). Glass pill: − / Fit / + / editable % input, bottom-center,
// hover-fade. Registered by the pan-zoom bundle (window.PathogenPanZoom) so
// the VS Code webview — which cannot import playground modules — gets the
// element from the script it already loads.
//
// Contract for consumers and test harnesses:
// - Internals render in shadow DOM with stable ids #zoom-out / #zoom-fit /
//   #zoom-in / #zoom-level (also exposed as ::part()s of the same names).
//   The unified-export E2E pierces this shadow root by id.
// - `controller`: the surface's PanZoomController (or any ZoomPillTarget).
//   Reassign after rebuilding a controller. Buttons/input call through it.
// - `zoom`: display-only. The surface pushes it from its own onChange — the
//   pill NEVER subscribes to the controller (onChange stays surface-owned).
// - `fadeTarget`: hover container for the 0.6→1 opacity fade (a shared
//   element can't use the sibling-selector trick the old mini-workspace CSS
//   relied on). `always-visible` attribute disables the fade (fullscreen);
//   touch devices are always-on via media query.
// - Placement defaults to absolute bottom-center inside the nearest
//   positioned ancestor; outer author CSS on the host may override.
//
// CLI-safety: this module is imported by the Node CLI via the pan-zoom
// bundle — nothing here may touch DOM globals at module top level. The
// element class is defined inside registerZoomPill(), which no-ops outside
// a browser.

import { DEFAULTS } from './pan-zoom-controller';

/** Structural controller surface the pill drives (storybook can stub it). */
export interface ZoomPillTarget {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomTo: (zoom: number) => void;
  getView: () => { zoom: number };
}

export interface ZoomPillElement extends HTMLElement {
  controller: ZoomPillTarget | null;
  zoom: number;
  fadeTarget: Element | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'pathogen-zoom-pill': ZoomPillElement;
  }
}

// Theming: playground token → VS Code webview token → literal. The literals
// mirror theme.css light values (the old chrome carried stale #10b981 green
// fallbacks from a previous accent — do not reintroduce them).
const STYLES = `
  :host {
    --zp-bg: var(--bg-elevated, var(--vscode-editorWidget-background, #ffffff));
    --zp-border: var(--border-color, var(--vscode-panel-border, #e2e8f0));
    --zp-text: var(--text-secondary, var(--vscode-foreground, #64748b));
    --zp-accent: var(--accent-color, var(--vscode-focusBorder, #c0518e));
    --zp-accent-subtle: var(--accent-subtle, color-mix(in srgb, var(--zp-accent) 12%, transparent));
    --zp-mono: var(--font-mono, var(--vscode-editor-font-family, 'Inconsolata', monospace));

    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: color-mix(in srgb, var(--zp-bg) 82%, transparent);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid var(--zp-border);
    border-radius: 999px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
    z-index: 10;
    opacity: 0.6;
    transition: opacity var(--transition-base, 0.15s ease);
  }

  :host(:hover),
  :host([data-peer-hover]),
  :host([always-visible]) {
    opacity: 1;
  }

  @media (hover: none) {
    :host {
      opacity: 1;
    }
  }

  button {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--zp-text);
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    transition: background var(--transition-base, 0.15s ease), color var(--transition-base, 0.15s ease);
  }

  button:hover {
    background: var(--zp-accent-subtle);
    color: var(--zp-accent);
  }

  #zoom-in,
  #zoom-out {
    font-size: 1.125rem;
    line-height: 0;
  }

  #zoom-fit {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    width: auto;
    padding: 0 10px;
  }

  #zoom-level {
    width: 46px;
    padding: 0 8px 0 10px;
    border: 0;
    border-left: 1px solid var(--zp-border);
    border-radius: 0;
    background: transparent;
    color: var(--zp-text);
    font-family: var(--zp-mono);
    font-size: 0.6875rem;
    font-weight: 500;
    font-feature-settings: 'tnum';
    text-align: center;
    height: 20px;
  }

  #zoom-level:focus {
    outline: none;
    color: var(--zp-accent);
  }
`;

export function registerZoomPill(): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  if (customElements.get('pathogen-zoom-pill')) return;

  class PathogenZoomPill extends HTMLElement implements ZoomPillElement {
    private _controller: ZoomPillTarget | null = null;

    private _fadeTarget: Element | null = null;

    private _onFadeEnter = (): void => {
      this.setAttribute('data-peer-hover', '');
    };

    private _onFadeLeave = (): void => {
      this.removeAttribute('data-peer-hover');
    };

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      // adoptedStyleSheets sidesteps style-src CSP on inline <style> in
      // locked-down hosts (the VS Code webview); fall back for engines
      // without constructable stylesheets.
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(STYLES);
        root.adoptedStyleSheets = [sheet];
      } catch {
        const style = document.createElement('style');
        style.textContent = STYLES;
        root.appendChild(style);
      }

      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, id: string): HTMLElementTagNameMap[K] => {
        const el = document.createElement(tag);
        el.id = id;
        el.setAttribute('part', id);
        root.appendChild(el);
        return el;
      };

      const out = make('button', 'zoom-out');
      out.title = 'Zoom out';
      out.textContent = '−';
      const fit = make('button', 'zoom-fit');
      fit.title = 'Fit to view';
      fit.textContent = 'Fit';
      const zin = make('button', 'zoom-in');
      zin.title = 'Zoom in';
      zin.textContent = '+';
      const level = make('input', 'zoom-level');
      level.type = 'text';
      level.value = '100%';
      level.title = 'Enter zoom percentage';

      out.addEventListener('click', () => this._controller?.zoomOut());
      fit.addEventListener('click', () => this._controller?.zoomToFit());
      zin.addEventListener('click', () => this._controller?.zoomIn());

      level.addEventListener('change', () => {
        const value = parseInt(level.value, 10);
        const min = this._min() * 100;
        const max = this._max() * 100;
        if (!isNaN(value) && value >= min && value <= max && this._controller) {
          this._controller.zoomTo(value / 100);
          this.zoom = this._controller.getView().zoom;
        } else {
          this._revertDisplay();
        }
      });
      level.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        if (!this._controller) return;
        const step = (e.shiftKey ? 0.25 : 0.05) * (e.key === 'ArrowUp' ? 1 : -1);
        this._controller.zoomTo(this._controller.getView().zoom + step);
        this.zoom = this._controller.getView().zoom;
      });
    }

    disconnectedCallback(): void {
      this._unhookFadeTarget();
    }

    get controller(): ZoomPillTarget | null {
      return this._controller;
    }

    set controller(value: ZoomPillTarget | null) {
      this._controller = value;
      if (value) this.zoom = value.getView().zoom;
    }

    get zoom(): number {
      const level = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement;
      return (parseInt(level.value, 10) || 100) / 100;
    }

    set zoom(value: number) {
      const level = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement;
      level.value = `${Math.round(value * 100)}%`;
    }

    get fadeTarget(): Element | null {
      return this._fadeTarget;
    }

    set fadeTarget(el: Element | null) {
      this._unhookFadeTarget();
      this._fadeTarget = el;
      if (el) {
        el.addEventListener('pointerenter', this._onFadeEnter);
        el.addEventListener('pointerleave', this._onFadeLeave);
      }
    }

    private _unhookFadeTarget(): void {
      if (this._fadeTarget) {
        this._fadeTarget.removeEventListener('pointerenter', this._onFadeEnter);
        this._fadeTarget.removeEventListener('pointerleave', this._onFadeLeave);
      }
      this._fadeTarget = null;
    }

    private _min(): number {
      const v = parseFloat(this.getAttribute('min') ?? '');
      return Number.isFinite(v) && v > 0 ? v : DEFAULTS.minZoom;
    }

    private _max(): number {
      const v = parseFloat(this.getAttribute('max') ?? '');
      return Number.isFinite(v) && v > 0 ? v : DEFAULTS.maxZoom;
    }

    private _revertDisplay(): void {
      if (this._controller) this.zoom = this._controller.getView().zoom;
      else this.zoom = 1;
    }
  }

  customElements.define('pathogen-zoom-pill', PathogenZoomPill);
}
