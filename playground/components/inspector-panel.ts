// Consolidated inspector panel — scrollable container with stacked sub-panels

import './layers-panel.js';
import './palette-panel.js';
import './cssvar-panel.js';
import styles from './inspector-panel.css';

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export class InspectorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.shadowRoot!.querySelector('.close-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="inspector">
        <div class="inspector-header">
          <span>Inspector</span>
          <button class="close-btn" title="Close inspector">${CLOSE_ICON}</button>
        </div>
        <layers-panel embedded></layers-panel>
        <palette-panel embedded></palette-panel>
        <cssvar-panel embedded></cssvar-panel>
      </div>
    `;
  }
}

customElements.define('inspector-panel', InspectorPanel);
