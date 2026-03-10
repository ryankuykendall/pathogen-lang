// Error display banner component

export class ErrorPanel extends HTMLElement {
  private _message: string;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._message = '';
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

  show(message: string): void {
    this.message = message;
  }

  hide(): void {
    this.message = '';
  }

  updateContent(): void {
    const content = this.shadowRoot!.querySelector('.content');

    if (content) {
      content.textContent = this._message;
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
          left: var(--view-padding, 1rem);
          right: var(--view-padding, 1rem);
          z-index: 10;
          background: var(--error-bg, #fee);
          color: var(--error-text, #c00);
          padding: 12px 20px;
          font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
          font-size: 0.875rem;
          border: 1px solid var(--error-border, #fcc);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15));
          max-height: 30vh;
          overflow-y: auto;
          transform: translateY(50%);
        }

        :host(.visible) {
          display: block;
        }

        .header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .content {
          flex: 1;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .capture-btn {
          flex-shrink: 0;
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
      <div class="header">
        <div class="content">${this._message}</div>
        <button class="capture-btn" title="Copy debug info to clipboard">Copy Debug Info</button>
      </div>
    `;
  }
}

customElements.define('error-panel', ErrorPanel);
