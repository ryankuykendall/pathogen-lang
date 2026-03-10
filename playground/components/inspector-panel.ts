// Consolidated inspector panel — scrollable container with stacked sub-panels

import './layers-panel.js';
import './palette-panel.js';
import './cssvar-panel.js';
import styles from './inspector-panel.css';

export class InspectorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="inspector">
        <div class="inspector-header">Inspector</div>
        <layers-panel embedded></layers-panel>
        <palette-panel embedded></palette-panel>
        <cssvar-panel embedded></cssvar-panel>
      </div>
    `;
  }
}

customElements.define('inspector-panel', InspectorPanel);
