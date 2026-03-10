// Control group wrapper for form inputs

export class ControlGroup extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes(): string[] {
    return ['label'];
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.shadowRoot!.innerHTML) {
      this.render();
    }
  }

  get label(): string {
    return this.getAttribute('label') || '';
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        label {
          font-size: 0.8125rem;
          color: var(--text-secondary, #666666);
          white-space: nowrap;
        }

        ::slotted(input[type="number"]) {
          width: 70px;
          padding: 6px 8px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          font-family: inherit;
          font-size: 0.875rem;
        }

        ::slotted(input[type="color"]) {
          width: 36px;
          height: 30px;
          padding: 2px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          cursor: pointer;
        }

        ::slotted(input[type="checkbox"]) {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        ::slotted(select) {
          min-width: 60px;
          padding: 6px 12px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          background: var(--bg-primary, #ffffff);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.875rem;
        }
      </style>
      ${this.label ? `<label>${this.label}</label>` : ''}
      <slot></slot>
    `;
  }
}

customElements.define('control-group', ControlGroup);
