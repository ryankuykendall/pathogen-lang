// <pathogen-color-input> — themed wrapper over <color-input> from hdr-color-input.
//
// Exposes a stable, project-consistent API for the playground: `value`,
// `colorspace`, `no-alpha`, `theme` attributes; a single `color-change`
// CustomEvent (bubbles + composed); pass-through `show(anchor?)`, `close()`,
// `focus()` methods. Themes <color-input>'s CSS parts with project tokens.

import type { ColorInputSpace } from '../../utils/color.js';

/** The upstream <color-input> element surface we rely on. */
interface ColorInputElement extends HTMLElement {
  value: string;
  colorspace: string;
  theme: string;
  noAlpha: boolean;
  readonly gamut?: string;
  readonly contrastColor?: string;
  show(anchor?: Element): void;
  close(): void;
  focus(): void;
}

/** Detail shape emitted by <color-input>'s `change` event and re-dispatched as `color-change`. */
export interface ColorChangeDetail {
  value: string;
  colorspace?: string;
  gamut?: string;
}

const OBSERVED = ['value', 'colorspace', 'no-alpha', 'theme'] as const;

type PendingShow = { anchor?: Element };

export class PathogenColorInput extends HTMLElement {
  private _inner: ColorInputElement | null = null;
  private _pendingValue: string | null = null;
  private _pendingShow: PendingShow | null = null;
  private _ready = false;

  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Synchronous fast path: the eager vendor script in index.html registers
    // <color-input> before any component upgrades, so this should always hit.
    if (customElements.get('color-input')) {
      this._init();
      return;
    }
    // Async fallback for tests / lazy-load contexts where <color-input> is not
    // yet registered. Keeps `.show()` / `.value` calls queued until ready.
    void customElements.whenDefined('color-input').then(() => {
      if (this.isConnected) this._init();
    });
  }

  private _init(): void {
    if (this._inner) return;
    this.shadowRoot!.innerHTML = `
      <style>
        :host { display: inline-block; }

        /* Compact: show only the native round trigger chip. Hides the default
           text input + error row that <color-input> otherwise renders next to
           the chip. Used for tight footer/panel chrome. */
        :host([compact]) color-input::part(input),
        :host([compact]) color-input::part(error) {
          display: none;
        }
        /* The internal .input-wrapper div has no part attribute so it can't
           be targeted via ::part. It is a flex:1 sibling of the trigger —
           with its children hidden it's empty but grabs remaining horizontal
           space in the host's default flex layout, which makes most of the
           chip "area" unclickable. Expand the trigger to fill the host so
           clicks anywhere on a compact chip hit the trigger. */
        :host([compact]) color-input::part(trigger) {
          flex: 1 1 auto;
          width: 100%;
          height: 100%;
        }

        /* cm-anchor: the wrapper is hidden off-screen and used only as the
           host for <color-input>'s popover. We disable the package's default
           CSS anchor positioning so its JavaScript positioning path (which
           uses the anchor passed to show()) takes effect — the popover then
           tracks the real CodeMirror chip wherever it renders. */
        :host([cm-anchor]) color-input::part(input),
        :host([cm-anchor]) color-input::part(error) {
          display: none;
        }
        :host([cm-anchor]) color-input::part(trigger) {
          opacity: 0;
          pointer-events: none;
        }
        :host([cm-anchor]) color-input::part(panel) {
          /* Disable the package's CSS anchor positioning AND the UA
             [popover] inset/margin-auto centering, so the package's JS
             positioning (inline left/top based on the chip anchor) wins. */
          position-anchor: auto !important;
          position-area: none !important;
          right: auto !important;
          bottom: auto !important;
          margin: 0 !important;
          align-self: auto !important;
          justify-self: auto !important;
        }

        color-input {
          font-family: var(--font-sans, inherit);
        }

        /* Theme the popover UI with project tokens. Leave the native
           trigger/chip styling alone so the round chip renders as-authored. */
        color-input::part(panel) {
          background: var(--bg-elevated, #ffffff);
          color: var(--text-primary, #1a1a2e);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-lg, 0 8px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08));
          font-family: var(--font-sans, inherit);
        }
        color-input::part(area) { border-radius: var(--radius-sm, 4px); }
        color-input::part(controls) { color: var(--text-secondary, #64748b); }

        /* Text input + numeric readouts inside the popover/default view. */
        color-input::part(input),
        color-input::part(output) {
          background: var(--bg-primary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          font-family: var(--font-mono, monospace);
        }
        color-input::part(input):focus {
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 2px var(--focus-ring, rgba(16,185,129,0.4));
          outline: none;
        }

        color-input::part(gamut) { color: var(--text-secondary, #64748b); font-size: 0.75rem; }
        color-input::part(error) { color: var(--danger-color, #ef4444); font-size: 0.75rem; }
      </style>
      <color-input></color-input>
    `;

    this._inner = this.shadowRoot!.querySelector('color-input') as ColorInputElement;

    // Replay attributes onto the inner element so our observedAttributes are
    // forwarded even when they were set before connection.
    for (const attr of OBSERVED) {
      if (this.hasAttribute(attr)) {
        this._inner.setAttribute(attr, this.getAttribute(attr)!);
      }
    }
    if (!this.hasAttribute('theme')) {
      const theme = document.documentElement.dataset.theme;
      if (theme) this._inner.setAttribute('theme', theme);
    }
    if (this._pendingValue != null) {
      this._inner.value = this._pendingValue;
      this._pendingValue = null;
    }

    // In compact mode we want only the trigger chip — no text input column,
    // no error row. ::part() styles hide the input + error parts, but the
    // containing .input-wrapper div has no part attribute, so we reach into
    // the color-input's own shadow and hide it directly. This keeps the
    // trigger's flex:1 from fighting an empty-but-flexed sibling for space.
    if (this.hasAttribute('compact')) {
      const innerSR = this._inner.shadowRoot;
      if (innerSR && !innerSR.querySelector('style[data-compact]')) {
        const style = document.createElement('style');
        style.setAttribute('data-compact', '');
        style.textContent = `
          .input-wrapper { display: none !important; }
          .trigger { flex: 1 1 auto !important; width: 100% !important; height: 100% !important; }
        `;
        innerSR.appendChild(style);
      }
    }

    // Re-dispatch `change` as kebab-case, composed `color-change`.
    this._inner.addEventListener('change', (e: Event) => {
      const detail = (e as CustomEvent<ColorChangeDetail>).detail ?? { value: this._inner!.value };
      this.dispatchEvent(
        new CustomEvent<ColorChangeDetail>('color-change', {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    });

    // Forward open/close for callers that want to react to UI state.
    this._inner.addEventListener('open', () => {
      this.dispatchEvent(new CustomEvent('color-open', { bubbles: true, composed: true }));
    });
    this._inner.addEventListener('close', () => {
      this.dispatchEvent(new CustomEvent('color-close', { bubbles: true, composed: true }));
    });

    this._ready = true;

    // Drain any show() queued before _inner existed.
    if (this._pendingShow) {
      const { anchor } = this._pendingShow;
      this._pendingShow = null;
      this._inner.show(anchor);
    }
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this._inner) return;
    if (newValue == null) this._inner.removeAttribute(name);
    else this._inner.setAttribute(name, newValue);
  }

  get value(): string {
    if (this._inner) return this._inner.value;
    return this._pendingValue ?? this.getAttribute('value') ?? '';
  }

  set value(v: string) {
    if (this._inner) {
      this._inner.value = v;
    } else {
      this._pendingValue = v;
    }
    // Mirror to attribute so DOM inspection + getAttribute stay in sync.
    if (v != null) this.setAttribute('value', v);
  }

  get colorspace(): ColorInputSpace {
    return (this._inner?.colorspace ?? this.getAttribute('colorspace') ?? 'hex') as ColorInputSpace;
  }

  set colorspace(space: ColorInputSpace) {
    if (this._inner) this._inner.colorspace = space;
    this.setAttribute('colorspace', space);
  }

  get noAlpha(): boolean {
    return this.hasAttribute('no-alpha');
  }

  set noAlpha(v: boolean) {
    if (v) this.setAttribute('no-alpha', '');
    else this.removeAttribute('no-alpha');
  }

  get gamut(): string | undefined {
    return this._inner?.gamut;
  }

  get contrastColor(): string | undefined {
    return this._inner?.contrastColor;
  }

  get ready(): boolean {
    return this._ready;
  }

  show(anchor?: Element): void {
    if (this._inner) {
      this._inner.show(anchor);
    } else {
      this._pendingShow = { anchor };
    }
  }

  close(): void {
    this._inner?.close();
  }

  focus(): void {
    this._inner?.focus();
  }
}

customElements.define('pathogen-color-input', PathogenColorInput);

declare global {
  interface HTMLElementTagNameMap {
    'pathogen-color-input': PathogenColorInput;
  }
}
