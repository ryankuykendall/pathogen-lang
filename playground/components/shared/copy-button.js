// Reusable copy button Web Component

export class CopyButton extends HTMLElement {
  static get observedAttributes() {
    return ['text', 'label', 'copied-label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector('button').addEventListener('click', () => this.handleCopy());
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  get text() {
    return this.getAttribute('text') || '';
  }

  get label() {
    return this.getAttribute('label') || 'Copy';
  }

  get copiedLabel() {
    return this.getAttribute('copied-label') || 'Copied!';
  }

  // Allow setting text programmatically
  setText(text) {
    this._dynamicText = text;
  }

  // Get text to copy - uses dynamic text if set, otherwise attribute
  getTextToCopy() {
    return this._dynamicText !== undefined ? this._dynamicText : this.text;
  }

  async handleCopy() {
    const text = this.getTextToCopy();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.showCopied();
      this.dispatchEvent(new CustomEvent('copied', { detail: { text } }));
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  showCopied() {
    const button = this.shadowRoot.querySelector('button');
    const originalText = button.textContent;
    button.textContent = this.copiedLabel;
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1500);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }

        button {
          padding: 4px 10px;
          font-size: 0.75rem;
          font-family: inherit;
          background: var(--bg-primary, #ffffff);
          color: var(--text-secondary, #64748b);
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.15s, background-color 0.15s;
        }

        button:hover {
          opacity: 1;
          background: var(--bg-secondary, #f5f5f5);
        }

        button.copied {
          background: var(--success-color, #28a745);
          border-color: var(--success-color, #28a745);
          color: white;
          opacity: 1;
        }

        :host([variant="pane"]) button {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
        }

        :host([variant="inline"]) button {
          position: static;
          opacity: 1;
        }
      </style>
      <button type="button">${this.label}</button>
    `;
  }
}

customElements.define('copy-button', CopyButton);
