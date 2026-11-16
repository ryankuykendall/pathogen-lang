// Main workspace layout container. Below 800 px the panes stack, and the file
// tree is a drawer over them from the left, the rest dimmed (2d, step 9b;
// mockup v7 screen M, state 2; docs/workspace-files.md "On a phone").

import { store } from '../state/store.js';
import { focusFilesToggle, isNarrow, onNarrowChange } from '../utils/narrow.js';

/** The file tree's width, open. */
const TREE_WIDTH = 248;

/** The console's width, open, on a wide screen (a narrow screen stacks it, 200 px high). */
const CONSOLE_WIDTH = 280;

export class PlaygroundMain extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;

  private _filesUnsubscribe: (() => void) | null = null;

  private _narrowUndo: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // The preview's drawing is held to this box: the preview pane is the gap the other
    // panes leave, and its iframe stays this wide (option 1; svg-preview-pane's _stage).
    this.setAttribute('data-preview-stage', '');
    this.render();
    this._unsubscribe = store.subscribe('inspectorOpen', () => {
      this.classList.toggle('inspector-open', store.get('inspectorOpen') as boolean);
    });
    this._filesUnsubscribe = store.subscribe('filesOpen', () => this._applyFilesOpen());
    // Narrowed with the tree open (a window made narrow, a tablet turned): the drawer
    // doesn't open over the editor by itself.
    this._narrowUndo = onNarrowChange(() => {
      if (isNarrow() && (store.get('filesOpen') as boolean)) store.set('filesOpen', false);
      this._applyFilesOpen();
    });
    window.addEventListener('resize', this._onResize);
    document.addEventListener('keydown', this._onEscape);
    this.shadowRoot!.querySelector('.drawer-scrim')!.addEventListener('click', () => store.set('filesOpen', false));
    this._applyFilesOpen();
  }

  /**
   * Esc closes the drawer wherever the keyboard is (on Files, say). Heard last, on the way
   * up: the tree, its menus and fields, and the program list take Esc first and stop it.
   */
  private readonly _onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented || !isNarrow() || !(store.get('filesOpen') as boolean)) return;
    e.preventDefault();
    store.set('filesOpen', false);
    focusFilesToggle();
  };

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._filesUnsubscribe?.();
    this._filesUnsubscribe = null;
    this._narrowUndo?.();
    this._narrowUndo = null;
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onEscape);
  }

  /** The drawer and its dimming start at this pane's top edge, under the breadcrumb. */
  private readonly _onResize = (): void => {
    if (this.classList.contains('files-open')) this._placeDrawer();
  };

  private _placeDrawer(): void {
    this.style.setProperty('--drawer-top', `${Math.max(0, this.getBoundingClientRect().top)}px`);
  }

  private _applyFilesOpen(): void {
    const open = store.get('filesOpen') as boolean;
    this.classList.toggle('files-open', open);
    if (open) this._placeDrawer();
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
          flex: 0 0 ${TREE_WIDTH}px;
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

        /* Wide (option 1, project-docs/preview-raster-perf/option-1-build-plan.md): the
           editor keeps its width, its width today with the tree open and nothing else, and
           the preview pane takes what the other panes leave. The pane's iframe stays this
           whole row's width, so a pane opening or closing never resizes the drawing. The
           editor gives way only when the panes don't fit. */
        @media not all and (max-width: 800px) {
          ::slotted(code-editor-pane),
          :host(.inspector-open) ::slotted(code-editor-pane) {
            flex: 0 1 calc((100% - ${TREE_WIDTH}px) / 2);
            transition: none;
          }

          ::slotted(console-pane.open) {
            flex: 0 0 ${CONSOLE_WIDTH}px;
          }

          ::slotted(svg-preview-pane),
          :host(.inspector-open) ::slotted(svg-preview-pane) {
            flex: 1 1 0;
            transition: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          ::slotted(file-tree),
          ::slotted(file-tree.open) {
            transition: none;
          }
        }

        /* The drawer's dimming (below 800 px only): a tap on it closes the drawer. */
        .drawer-scrim {
          display: none;
          position: fixed;
          top: var(--drawer-top, 0px);
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 99;
          background: var(--scrim, rgba(20, 16, 28, 0.42));
        }

        @media (max-width: 800px) {
          /* The tree is a drawer over the editor and the preview, from the left (step 9b).
             It's placed with top/left, never a transform: a transform would make the drawer
             the box its fixed menus and action sheets are placed in. */
          ::slotted(file-tree) {
            display: none;
          }

          ::slotted(file-tree.open) {
            display: flex;
            position: fixed;
            top: var(--drawer-top, 0px);
            bottom: 0;
            left: 0;
            z-index: 100;
            width: min(320px, 86vw);
            flex: none;
            border-right: 1px solid var(--border-color, #ddd);
            box-shadow: var(--shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.24));
          }

          :host(.files-open) .drawer-scrim {
            display: block;
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
      <div class="drawer-scrim" aria-hidden="true"></div>
    `;
  }
}

customElements.define('playground-main', PlaygroundMain);
