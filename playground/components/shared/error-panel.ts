// Error display banner component

export class ErrorPanel extends HTMLElement {
  private _message: string;
  private _count: number;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._message = '';
    this._count = 0;
  }

  static get observedAttributes(): string[] {
    return ['message'];
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'message') {
      this._message = newValue || '';
      this.updateContent();
    }
  }

  get message(): string {
    return this._message;
  }

  set message(value: string) {
    this._message = value || '';
    this.setAttribute('message', this._message);
    this.updateContent();
  }

  show(message: string, count?: number): void {
    this._count = count ?? 0;
    this.message = message;
  }

  hide(): void {
    this._count = 0;
    this.message = '';
  }

  updateContent(): void {
    const content = this.shadowRoot!.querySelector('.content');
    const badge = this.shadowRoot!.querySelector('.count-badge') as HTMLElement | null;

    if (content) {
      content.textContent = this._message;
    }

    if (badge) {
      if (this._count > 1) {
        badge.textContent = `${this._count} errors`;
        badge.style.display = '';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    }

    if (this._message) {
      this.classList.add('visible');
    } else {
      this.classList.remove('visible');
    }
  }

  setupEventListeners(): void {
    this.shadowRoot!.querySelector('.capture-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy-debug-info', { bubbles: true, composed: true }));
    });
  }

  showFeedback(message: string): void {
    const btn = this.shadowRoot!.querySelector('.capture-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = message;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 2000);
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: none;
          position: absolute;
          bottom: var(--footer-height, 52px);
          left: 0;
          width: 50%;
          z-index: 10;
          background: var(--error-bg, #fee);
          color: var(--error-text, #c00);
          padding: 12px 20px;
          font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
          font-size: 0.875rem;
          line-height: 1.4;
          border: 1px solid var(--error-border, #fcc);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15));
          box-sizing: border-box;
        }

        :host(.visible) {
          display: block;
        }

        .wrapper {
          position: relative;
        }

        .content {
          white-space: pre-wrap;
          word-break: break-word;
          max-height: calc(1.4em * 5);
          overflow-y: auto;
          padding-right: 120px;
        }

        .count-badge {
          position: absolute;
          top: 0;
          right: 0;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--error-color, #ef4444);
          color: #fff;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
          line-height: 1.4;
        }

        .capture-btn {
          position: absolute;
          bottom: 0;
          right: 0;
          padding: 4px 10px;
          border: 1px solid var(--error-text, #c00);
          border-radius: var(--radius-sm, 4px);
          background: transparent;
          color: var(--error-text, #c00);
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: background var(--transition-fast, 0.1s ease), color var(--transition-fast, 0.1s ease);
        }

        .capture-btn:hover:not(:disabled) {
          background: var(--error-text, #c00);
          color: #fff;
        }

        .capture-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
      </style>
      <div class="wrapper">
        <div class="content">${this._message}</div>
        <span class="count-badge" style="display: none"></span>
        <button class="capture-btn" title="Copy debug info to clipboard">Copy Debug Info</button>
      </div>
    `;
  }
}

customElements.define('error-panel', ErrorPanel);
