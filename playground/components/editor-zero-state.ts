// The editor with no file open (phase 2d, step 4d; mockup v11, note 57,
// docs/workspace-files.md "The file tree and tabs"). The one zero-state of the
// workspace: every "why" and every button is here. The preview has none of
// its own: with nothing to draw, it's blank.
//
// A view only: code-editor-pane shows it in place of the editor, and
// workspace-view gives it what it says:
//   main         the workspace's main (its first program still there), or null
//   noFiles      the workspace has no files at all
//   onlyLibraries every file is a module (with no main: why nothing draws)
//   filesHidden  the tree is hidden (Files off)
// and acts on what it asks for:
//   zero-state-action { action: 'open-main' | 'new-program' | 'show-files' }

import { FILE_ICONS } from '../utils/file-icons.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type ZeroStateAction = 'open-main' | 'new-program' | 'show-files';

const NEW_PROGRAM_LINE = 'It goes at the top of the workspace, and it will be the main.';

const styles = `
  :host {
    display: grid;
    place-items: center;
    padding: 24px;
    box-sizing: border-box;
    min-height: 100%;
    background: var(--bg-secondary, #fff);
    font-family: var(--font-sans, system-ui, sans-serif);
  }
  :host([hidden]) { display: none; }
  .in { max-width: 344px; text-align: center; color: var(--text-secondary, #64748b); font-size: 13px; line-height: 1.5; }
  .icon {
    width: 44px; height: 44px; margin: 0 auto 10px; border-radius: 12px;
    display: grid; place-items: center;
    background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16));
    color: var(--secondary-accent-text, #5e3590);
  }
  .icon svg { width: 22px; height: 22px; }
  h2 { margin: 0 0 6px; font-size: 15px; font-weight: 600; color: var(--text-primary, #1a1a2e); }
  p { margin: 0 0 14px; }
  p code { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-primary, #1a1a2e); }
  p b { color: var(--text-primary, #1a1a2e); font-weight: 600; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  button {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 8px;
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  button svg { width: 14px; height: 14px; }
  .primary { border: none; background: var(--accent-color, #c0518e); color: var(--accent-text, #fff); }
  .primary:hover { background: var(--accent-hover, #b04680); }
  .secondary { border: 1px solid var(--border-color, #e2e8f0); background: transparent; color: var(--text-primary, #1a1a2e); font-weight: 500; }
  .secondary:hover { background: var(--bg-tertiary, rgba(0, 0, 0, 0.05)); }
  button:focus-visible { outline: 2px solid var(--focus-ring, rgba(148, 97, 196, 0.5)); outline-offset: 2px; }
  small { display: block; margin-top: 10px; font-size: 11.5px; color: var(--text-tertiary, #9087a0); }
`;

export class EditorZeroState extends HTMLElement {
  private _main: string | null = null;

  private _noFiles = false;

  private _onlyLibraries = false;

  private _filesHidden = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.shadowRoot!.firstChild) {
      this.shadowRoot!.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest<HTMLElement>('button[data-action]');
        if (!button) return;
        this.dispatchEvent(
          new CustomEvent('zero-state-action', {
            bubbles: true,
            composed: true,
            detail: { action: button.dataset.action as ZeroStateAction },
          }),
        );
      });
    }
    this._draw();
  }

  /**
   * What it says: set together, so it draws once. The same view again draws
   * nothing, so the keyboard stays on its button (workspace-view sets it on
   * every change to the files).
   */
  set view(view: { main: string | null; noFiles: boolean; onlyLibraries: boolean; filesHidden: boolean }) {
    const now = this.view;
    const same =
      now.main === view.main &&
      now.noFiles === view.noFiles &&
      now.onlyLibraries === view.onlyLibraries &&
      now.filesHidden === view.filesHidden;
    if (same && this.shadowRoot!.firstChild) return;
    this._main = view.main;
    this._noFiles = view.noFiles;
    this._onlyLibraries = view.onlyLibraries;
    this._filesHidden = view.filesHidden;
    this._draw();
  }

  get view(): { main: string | null; noFiles: boolean; onlyLibraries: boolean; filesHidden: boolean } {
    return {
      main: this._main,
      noFiles: this._noFiles,
      onlyLibraries: this._onlyLibraries,
      filesHidden: this._filesHidden,
    };
  }

  /** The keyboard to its first button (the last tab closed from the keyboard). */
  focusPrimary(): void {
    this.shadowRoot?.querySelector<HTMLElement>('button')?.focus();
  }

  private _draw(): void {
    const root = this.shadowRoot;
    if (!root || !this.isConnected) return;
    const showFiles = this._filesHidden
      ? '<button class="secondary" type="button" data-action="show-files">Show files</button>'
      : '';
    let heading: string;
    let text: string;
    let primary: string;
    let small = '';
    if (this._main !== null) {
      const main = esc(this._main);
      heading = 'No file open';
      text = `The workspace's main is <code>${main}</code>. Open it, or ${this._filesHidden ? 'show the files to pick another' : 'click any file in the tree'}.`;
      primary = `<button class="primary" type="button" data-action="open-main">${FILE_ICONS.program}Open ${main}</button>`;
    } else {
      heading = this._noFiles ? 'No files yet' : 'No program yet';
      let rest: string;
      if (this._noFiles) {
        text = 'This workspace is empty, so nothing draws.';
        rest = this._filesHidden
          ? 'show the files to add your own'
          : 'add your own files with the <b>+</b> in the Files header';
      } else if (this._onlyLibraries) {
        text = 'Every file here is a module, so nothing draws.';
        rest = this._filesHidden ? 'show the files to edit a module' : 'click a module in the tree to edit it';
      } else {
        text = "There's no main yet, so nothing draws.";
        rest = this._filesHidden ? 'show the files to pick one' : 'click any file in the tree';
      }
      text = `${text} Start a program, or ${rest}.`;
      primary = `<button class="primary" type="button" data-action="new-program">${FILE_ICONS.plus}New program</button>`;
      small = `<small>${NEW_PROGRAM_LINE}</small>`;
    }
    root.innerHTML = `<style>${styles}</style>
      <div class="in" role="region" aria-label="Editor">
        <div class="icon" aria-hidden="true">${FILE_ICONS.code}</div>
        <h2>${heading}</h2>
        <p>${text}</p>
        <div class="acts">${primary}${showFiles}</div>
        ${small}
      </div>`;
  }
}

customElements.define('editor-zero-state', EditorZeroState);

declare global {
  interface HTMLElementTagNameMap {
    'editor-zero-state': EditorZeroState;
  }
}
