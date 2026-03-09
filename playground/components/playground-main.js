// Main workspace layout container

import { store } from '../state/store.js';

export class PlaygroundMain extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe('inspectorOpen', () => {
      this.classList.toggle('inspector-open', store.get('inspectorOpen'));
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          gap: 0;
          min-height: 0;
          overflow: hidden;
        }

        @media (max-width: 800px) {
          :host {
            flex-direction: column;
            overflow: auto;
          }
        }

        ::slotted(code-editor-pane) {
          flex: 1;
          min-width: 0;
          border-right: 1px solid var(--border-color, #ddd);
        }

        ::slotted(annotated-pane) {
          flex: 0 0 0;
          min-width: 0;
          border-right: 1px solid var(--border-color, #ddd);
          overflow: hidden;
          transition: flex-basis 0.3s ease;
        }

        ::slotted(annotated-pane.open) {
          flex: 1 1 0;
        }

        ::slotted(console-pane) {
          flex: 0 0 0;
          min-width: 0;
          border-right: 1px solid var(--border-color, #ddd);
          overflow: hidden;
          transition: flex-basis 0.3s ease;
        }

        ::slotted(console-pane.open) {
          flex: 1 1 0;
        }

        ::slotted(svg-preview-pane) {
          flex: 1;
          min-width: 0;
        }

        ::slotted(inspector-panel) {
          flex: 0 0 0;
          min-width: 0;
          overflow: hidden;
          transition: flex-basis 0.3s ease;
          border-left: 1px solid var(--border-color, #ddd);
        }

        ::slotted(inspector-panel.open) {
          flex: 1 1 0;
          min-width: 240px;
        }

        :host(.inspector-open) ::slotted(code-editor-pane) {
          flex: 2;
        }

        :host(.inspector-open) ::slotted(svg-preview-pane) {
          flex: 3;
        }

        @media (max-width: 800px) {
          ::slotted(code-editor-pane) {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #ddd);
            min-height: 300px;
          }

          ::slotted(annotated-pane) {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #ddd);
          }

          ::slotted(annotated-pane.open) {
            flex: 0 0 200px;
          }

          ::slotted(console-pane) {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #ddd);
          }

          ::slotted(console-pane.open) {
            flex: 0 0 200px;
          }

          ::slotted(svg-preview-pane) {
            min-height: 250px;
          }

          :host(.inspector-open) ::slotted(code-editor-pane),
          :host(.inspector-open) ::slotted(svg-preview-pane) {
            flex: 1;
          }

          ::slotted(inspector-panel) {
            flex: 0 0 0;
            border-left: none;
          }
        }
      </style>

      <slot></slot>
    `;
  }
}

customElements.define('playground-main', PlaygroundMain);
