// Main workspace layout container

import { store } from '../state/store.js';

export class PlaygroundMain extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._unsubscribe = store.subscribe('inspectorOpen', () => {
      this.classList.toggle('inspector-open', store.get('inspectorOpen') as boolean);
    });
  }

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
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

        /* The file tree, left of the editor (2d, step 4a). Files in the
           breadcrumb toggles .open; closed, it takes no room and no Tab stop. */
        ::slotted(file-tree) {
          flex: 0 0 0;
          min-width: 0;
          overflow: hidden;
          visibility: hidden;
          transition:
            flex-basis 0.2s ease,
            visibility 0s linear 0.2s;
        }

        ::slotted(file-tree.open) {
          flex: 0 0 248px;
          visibility: visible;
          border-right: 1px solid var(--border-color, #ddd);
          transition:
            flex-basis 0.2s ease,
            visibility 0s;
        }

        ::slotted(code-editor-pane) {
          flex: 1;
          min-width: 0;
          border-right: 1px solid var(--border-color, #ddd);
          transition: flex 0.3s ease;
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
          transition: flex 0.3s ease;
        }

        ::slotted(inspector-panel) {
          flex: 0 0 0;
          min-width: 0;
          overflow: hidden;
          transition: flex-basis 0.3s ease;
          border-left: 1px solid var(--border-color, #ddd);
        }

        ::slotted(inspector-panel.open) {
          flex: 0 0 240px;
        }

        :host(.inspector-open) ::slotted(code-editor-pane) {
          flex: 2;
        }

        :host(.inspector-open) ::slotted(svg-preview-pane) {
          flex: 3;
        }

        @media (prefers-reduced-motion: reduce) {
          ::slotted(file-tree),
          ::slotted(file-tree.open) {
            transition: none;
          }
        }

        @media (max-width: 800px) {
          /* Until step 9's drawer: the tree stacks above the editor, its height capped. */
          ::slotted(file-tree) {
            display: none;
          }

          ::slotted(file-tree.open) {
            display: flex;
            flex: 0 0 auto;
            max-height: 30vh;
            border-right: none;
            border-bottom: 1px solid var(--border-color, #ddd);
          }

          ::slotted(code-editor-pane) {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #ddd);
            min-height: 300px;
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
