// New data file… (phase 3a; docs/workspace-files.md "Data files"; mockups v3
// 2b to 2d, approved 2026-11-24): one field, the name with the extension
// after it as a dropdown, `.json` unless another is chosen. What each
// extension holds shows only in the dropdown's list. The line under the field
// says the file it adds, or why it can't, and then Create is off. Enter
// creates, Esc cancels (closing the list first, when it's open).
//
// The frame is confirm-dialog's (DIALOG_STYLES). The dialog decides nothing
// itself: `read` and `check` (workspace-view, through workspace-edits'
// readDataFileName and planNewDataFile) say what a name means and where it
// goes, and the answer is what was typed and chosen.

import { DIALOG_STYLES } from './confirm-dialog.js';

/** What each extension holds, as the list says it, in the docs' order. */
export const DATA_FILE_TYPES: readonly { extension: string; holds: string }[] = [
  { extension: '.json', holds: 'JSON: tables, lists and settings' },
  { extension: '.geojson', holds: 'GeoJSON: places and shapes on a map' },
  { extension: '.topojson', holds: 'TopoJSON: maps with shared borders' },
  { extension: '.fold', holds: 'FOLD: origami crease patterns' },
];

export interface NewDataFileOptions {
  /** The name as typed, and the data extension it ends in (`trips.geojson`), else null. */
  read: (typed: string) => { name: string; extension: string | null };
  /** Where `typed` with `extension` goes, or why it can't. */
  check: (typed: string, extension: string) => { path: string } | { problem: string };
  /** A name typed already, for the storybook's states. */
  name?: string;
}

export interface NewDataFileAnswer {
  typed: string;
  extension: string;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const CHEVRON = svg('<path d="m6 9 6 6 6-6"/>');
const CHECK = svg('<path d="M20 6 9 17l-5-5"/>');

const FORM_STYLES = `
  dialog { width: min(400px, calc(100vw - 32px)); }
  .body { display: grid; gap: 6px; }
  .compound {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: stretch;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-primary, #fff);
  }
  .compound:focus-within { outline: 2px solid var(--focus-ring, rgba(148, 97, 196, 0.5)); outline-offset: 1px; }
  .compound.problem { border-color: var(--error-color, #ef4444); }
  .compound input {
    min-width: 0;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text-primary, #1a1a2e);
    font: 14px var(--font-mono, monospace);
    outline: none;
  }
  .ext-button {
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 4px;
    padding: 0 8px 0 10px;
    border: none;
    border-left: 1px solid var(--border-color, #e2e8f0);
    border-radius: 0 7px 7px 0;
    background: var(--bg-secondary, #f8fafc);
    color: var(--text-secondary, #64748b);
    font: 14px var(--font-mono, monospace);
    cursor: pointer;
  }
  .ext-button svg { width: 14px; height: 14px; }
  .ext-button[aria-expanded="true"] { color: var(--text-primary, #1a1a2e); background: var(--bg-tertiary, rgba(0, 0, 0, 0.05)); }
  .hint { min-height: 1.4em; margin: 0; font-size: 12.5px; color: var(--text-secondary, #64748b); }
  .hint code { font-family: var(--font-mono, monospace); color: var(--text-primary, #1a1a2e); }
  .hint.problem { color: var(--error-color, #ef4444); }
  .confirm:disabled { opacity: 0.45; cursor: default; }
  /* The list: the tree menu's own look (file-tree.css .menu). */
  .ext-list {
    position: fixed;
    z-index: 1;
    width: 300px;
    max-width: calc(100vw - 16px);
    box-sizing: border-box;
    margin: 0;
    padding: 6px;
    list-style: none;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    background: var(--bg-elevated, #fff);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.18));
    font-family: var(--font-sans, system-ui, sans-serif);
    outline: none;
  }
  .ext-list[hidden] { display: none; }
  :host(.inline) .ext-list { position: absolute; }
  .ext-list [role="option"] {
    display: grid;
    grid-template-columns: 16px 1fr;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-primary, #1a1a2e);
    cursor: pointer;
  }
  .ext-list [role="option"].active { background: var(--bg-tertiary, rgba(0, 0, 0, 0.05)); }
  .ext-list .check { width: 14px; height: 14px; color: var(--accent-color, #9461c4); }
  .ext-list .check svg { width: 14px; height: 14px; display: block; }
  .ext-list code { font: 500 13px var(--font-mono, monospace); }
  .ext-list small { display: block; margin-top: 1px; font-size: 11.5px; color: var(--text-tertiary, #9087a0); }
`;

let count = 0;

export class NewDataFileDialog extends HTMLElement {
  private _resolve: ((answer: NewDataFileAnswer | null) => void) | null = null;

  private _options: NewDataFileOptions | null = null;

  private _extension = DATA_FILE_TYPES[0].extension;

  /** The option the list's keyboard is on, while the list is open. */
  private _active = 0;

  private _onOutside = (e: Event): void => {
    if (!e.composedPath().some((el) => el instanceof HTMLElement && el.matches('.ext-list, .ext-button'))) {
      this._closeList(false);
    }
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  /**
   * Ask for the new file's name and extension; resolves to them (Create or
   * Enter), or null (Cancel, ×, Esc), and the dialog goes. `modal: false`
   * shows it in place, and `list: true` opens the list, for the storybook.
   */
  async ask(
    options: NewDataFileOptions,
    { modal = true, list = false }: { modal?: boolean; list?: boolean } = {},
  ): Promise<NewDataFileAnswer | null> {
    this._options = options;
    this.classList.toggle('inline', !modal);
    count += 1;
    const id = `new-data-${count}`;
    const root = this.shadowRoot!;
    const options_ = DATA_FILE_TYPES.map(
      (t, i) =>
        `<li role="option" id="${id}-opt-${i}" data-extension="${t.extension}"><span class="check"></span><span><code>${t.extension}</code><small>${t.holds}</small></span></li>`,
    ).join('');
    root.innerHTML = `<style>${DIALOG_STYLES}${FORM_STYLES}</style>
      <dialog aria-labelledby="${id}-title">
        <div class="head"><h2 id="${id}-title">New data file</h2><button type="button" class="close" aria-label="Close">×</button></div>
        <div class="body">
          <div class="compound">
            <input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="File name" aria-describedby="${id}-hint">
            <button type="button" class="ext-button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list"><span class="ext"></span>${CHEVRON}</button>
          </div>
          <p class="hint" id="${id}-hint" aria-live="polite"></p>
          <ul class="ext-list" id="${id}-list" role="listbox" aria-label="Extension" tabindex="-1" hidden>${options_}</ul>
        </div>
        <div class="foot"><button type="button" class="cancel">Cancel</button><button type="button" class="confirm" disabled>Create</button></div>
      </dialog>`;
    const dialog = root.querySelector('dialog')!;
    const input = this._input;
    const answer = new Promise<NewDataFileAnswer | null>((resolve) => {
      this._resolve = resolve;
    });

    input.addEventListener('input', () => this._typed());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._create();
      }
    });
    this._button.addEventListener('click', () => (this._listOpen ? this._closeList(true) : this._openList()));
    this._button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this._openList();
      }
    });
    this._list.addEventListener('keydown', (e) => this._listKey(e));
    this._list.addEventListener('click', (e) => {
      const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (option) this._choose(option.dataset.extension!);
    });
    root.querySelector('.confirm')!.addEventListener('click', () => this._create());
    root.querySelector('.cancel')!.addEventListener('click', () => this._answer(null));
    root.querySelector('.close')!.addEventListener('click', () => this._answer(null));
    // Escape: the list's first, then the dialog's own cancel.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (this._listOpen) this._closeList(true);
      else this._answer(null);
    });
    // A browser may close the dialog itself (a second Escape it won't let a
    // page hold back): that is no file, never a question left unanswered.
    dialog.addEventListener('close', () => this._answer(null));

    if (modal && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.value = options.name ?? '';
    this._typed();
    input.focus();
    if (list) this._openList();
    return answer;
  }

  /** Withdraw the question (the page that asked has gone): no file. */
  cancel(): void {
    this._answer(null);
  }

  /** Taken out of the page some other way: no file, and no listener left behind. */
  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this._onOutside, true);
    this._answer(null);
  }

  private get _input(): HTMLInputElement {
    return this.shadowRoot!.querySelector('input')!;
  }

  private get _button(): HTMLButtonElement {
    return this.shadowRoot!.querySelector('.ext-button')!;
  }

  private get _list(): HTMLElement {
    return this.shadowRoot!.querySelector('.ext-list')!;
  }

  private get _listOpen(): boolean {
    return !this._list.hidden;
  }

  /** The name changed: a data extension typed at its end chooses that one; then the line under it. */
  private _typed(): void {
    const read = this._options!.read(this._input.value);
    if (read.extension !== null) this._extension = read.extension;
    this._refresh();
  }

  /** The button, the list's check, and the line under the field: the file it adds, or why it can't. */
  private _refresh(): void {
    const root = this.shadowRoot!;
    root.querySelector('.ext-button .ext')!.textContent = this._extension;
    this._button.setAttribute('aria-label', `Extension: ${this._extension}`);
    for (const option of root.querySelectorAll<HTMLElement>('[role="option"]')) {
      const chosen = option.dataset.extension === this._extension;
      option.setAttribute('aria-selected', String(chosen));
      option.querySelector('.check')!.innerHTML = chosen ? CHECK : '';
    }
    const typed = this._input.value;
    const hint = root.querySelector<HTMLElement>('.hint')!;
    const confirm = root.querySelector<HTMLButtonElement>('.confirm')!;
    const compound = root.querySelector('.compound')!;
    const result = typed.trim() === '' ? null : this._options!.check(typed, this._extension);
    const problem = result !== null && 'problem' in result ? result.problem : null;
    compound.classList.toggle('problem', problem !== null);
    this._input.setAttribute('aria-invalid', String(problem !== null));
    hint.classList.toggle('problem', problem !== null);
    if (result === null) hint.textContent = '';
    else if (problem !== null) hint.textContent = problem;
    else {
      hint.textContent = 'Adds ';
      const code = document.createElement('code');
      code.textContent = (result as { path: string }).path;
      hint.append(code);
    }
    confirm.disabled = result === null || problem !== null;
  }

  private _openList(): void {
    const list = this._list;
    list.hidden = false;
    this._button.setAttribute('aria-expanded', 'true');
    // Under the button, its right edge at the button's (mockup v3 2c); kept on
    // the screen: 8 px from its left edge, and above the button when there's
    // no room below (a phone held sideways, or with its keyboard up).
    const at = this._button.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, at.right - list.offsetWidth);
    const below = at.bottom + 4;
    const top =
      below + list.offsetHeight > window.innerHeight - margin
        ? Math.max(margin, at.top - 4 - list.offsetHeight)
        : below;
    const origin = this.classList.contains('inline')
      ? this.shadowRoot!.querySelector('dialog')!.getBoundingClientRect()
      : { left: 0, top: 0 };
    list.style.left = `${left - origin.left}px`;
    list.style.top = `${top - origin.top}px`;
    this._active = Math.max(
      0,
      DATA_FILE_TYPES.findIndex((t) => t.extension === this._extension),
    );
    this._markActive();
    list.focus();
    document.addEventListener('pointerdown', this._onOutside, true);
  }

  private _closeList(focusButton: boolean): void {
    if (!this._listOpen) return;
    this._list.hidden = true;
    this._button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this._onOutside, true);
    if (focusButton) this._button.focus();
  }

  private _markActive(): void {
    const options = [...this.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
    options.forEach((o, i) => o.classList.toggle('active', i === this._active));
    this._list.setAttribute('aria-activedescendant', options[this._active]?.id ?? '');
  }

  private _listKey(e: KeyboardEvent): void {
    const last = DATA_FILE_TYPES.length - 1;
    if (e.key === 'ArrowDown') this._active = Math.min(last, this._active + 1);
    else if (e.key === 'ArrowUp') this._active = Math.max(0, this._active - 1);
    else if (e.key === 'Home') this._active = 0;
    else if (e.key === 'End') this._active = last;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._choose(DATA_FILE_TYPES[this._active].extension);
      return;
    } else if (e.key === 'Tab') {
      // From the button, so the Tab goes on from where the list opened.
      this._closeList(true);
      return;
    } else return;
    e.preventDefault();
    this._markActive();
  }

  /**
   * An extension chosen in the list. A data extension typed at the end of the
   * name gives way to it (`trips.geojson` with `.json` chosen is `trips`), so
   * the file gets the one chosen.
   */
  private _choose(extension: string): void {
    const read = this._options!.read(this._input.value);
    if (read.extension !== null && read.extension !== extension) this._input.value = read.name;
    this._extension = extension;
    this._closeList(false);
    this._refresh();
    this._input.focus();
  }

  private _create(): void {
    if (this.shadowRoot!.querySelector<HTMLButtonElement>('.confirm')!.disabled) return;
    this._answer({ typed: this._input.value, extension: this._extension });
  }

  private _answer(answer: NewDataFileAnswer | null): void {
    const resolve = this._resolve;
    if (!resolve) return;
    this._resolve = null;
    document.removeEventListener('pointerdown', this._onOutside, true);
    const dialog = this.shadowRoot!.querySelector('dialog');
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    if (this.isConnected) this.remove();
    resolve(answer);
  }
}

if (!customElements.get('new-data-file-dialog')) customElements.define('new-data-file-dialog', NewDataFileDialog);

declare global {
  interface HTMLElementTagNameMap {
    'new-data-file-dialog': NewDataFileDialog;
  }
}

/** Ask for a new data file's name and extension; null when it's cancelled. */
export async function newDataFileDialog(options: NewDataFileOptions): Promise<NewDataFileAnswer | null> {
  const dialog = document.createElement('new-data-file-dialog');
  document.body.append(dialog);
  return dialog.ask(options);
}
