// The question an upload asks when a file's name is taken (phase 2d, step 6a;
// mockup v6 screen U, state 2; docs/workspace-files.md "Uploading files"):
// Replace, Keep both (the new one numbered: labels-2.pathogen) or Skip, and,
// with more than one taken name, "Do the same for the others". A view only:
// the file tree places it beside the row of the file already there and waits
// for the answer (ask), which is null when the question is withdrawn (cancel).
//
// The keyboard starts on Keep both, the choice that loses nothing. Escape, heard
// on the document first, skips this file and nothing else hears it (not the
// preview's fullscreen, nor the docs: 5a's lesson).

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type ClashChoice = 'replace' | 'keep-both' | 'skip';

export interface ClashAnswer {
  choice: ClashChoice;
  /** Do the same for the other taken names of this upload. */
  forAll: boolean;
}

export interface ClashQuestion {
  /** The name taken: "labels.pathogen". */
  name: string;
  /** Where: "parts/", or "the top of the workspace". */
  where: string;
  /** What Keep both would call the new one: "labels-2.pathogen". */
  keepBothName: string;
  /** How many more taken names this upload has after this one. */
  others: number;
}

const styles = `
  :host {
    position: fixed;
    z-index: var(--z-popover, 300);
    display: block;
    width: 300px;
    box-sizing: border-box;
  }
  :host([hidden]) { display: none; }
  .box {
    position: relative;
    padding: 11px 12px 12px;
    background: var(--bg-elevated, #fff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.15));
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-secondary, #64748b);
  }
  .box::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 12px;
    width: 10px;
    height: 10px;
    background: var(--bg-elevated, #fff);
    border-left: 1px solid var(--border-color, #e2e8f0);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    transform: rotate(45deg);
  }
  b { color: var(--text-primary, #1a1a2e); font-weight: 600; overflow-wrap: anywhere; }
  code { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-primary, #1a1a2e); }
  .all { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: var(--text-primary, #1a1a2e); }
  .all[hidden] { display: none; }
  .row { display: flex; gap: 6px; margin-top: 9px; }
  .row button {
    flex: 1;
    padding: 5px 8px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-tertiary, rgba(0, 0, 0, 0.04));
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
    cursor: pointer;
  }
  .row button.pri {
    background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.12));
    border-color: var(--secondary-accent, #9461c4);
    color: var(--secondary-accent-text, #6b3fa0);
  }
  .row button:focus-visible { outline: 2px solid var(--secondary-accent, #9461c4); outline-offset: 1px; }
  small { display: block; margin-top: 7px; font-size: 11px; color: var(--text-tertiary, #94a3b8); overflow-wrap: anywhere; }
`;

export class ClashPrompt extends HTMLElement {
  private _resolve: ((answer: ClashAnswer | null) => void) | null = null;

  private readonly _onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this._resolve === null) return;
    e.preventDefault();
    e.stopPropagation();
    this._answer('skip');
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.hidden = this._resolve === null;
  }

  disconnectedCallback(): void {
    this.cancel();
  }

  /** Whether a question is waiting for its answer. */
  get isOpen(): boolean {
    return this._resolve !== null;
  }

  /** Ask about one taken name; the answer, or null if the question is withdrawn. A question still open is withdrawn first. */
  async ask(question: ClashQuestion): Promise<ClashAnswer | null> {
    this.cancel();
    const root = this.shadowRoot!;
    const others = question.others;
    root.innerHTML = `<style>${styles}</style>
      <div class="box" role="alertdialog" aria-labelledby="q" aria-describedby="note">
        <div id="q"><b>${esc(question.name)}</b> is already in <code>${esc(question.where)}</code>.</div>
        <label class="all"${others > 0 ? '' : ' hidden'}><input type="checkbox"> Do the same for the ${others === 1 ? 'other taken name' : `${others} other taken names`}</label>
        <div class="row">
          <button type="button" data-choice="replace">Replace</button>
          <button type="button" class="pri" data-choice="keep-both">Keep both</button>
          <button type="button" data-choice="skip">Skip</button>
        </div>
        <small id="note">Keep both adds it as <code>${esc(question.keepBothName)}</code>. The other files go in once you’ve chosen.</small>
      </div>`;
    root.querySelector('.row')!.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-choice]');
      if (button) this._answer(button.dataset.choice as ClashChoice);
    });
    this.hidden = false;
    document.addEventListener('keydown', this._onEscape, true);
    root.querySelector<HTMLButtonElement>('.pri')!.focus();
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /** Withdraw the question (another workspace, the tree going): its answer is null. */
  cancel(): void {
    this._finish(null);
  }

  private _answer(choice: ClashChoice): void {
    const forAll = this.shadowRoot!.querySelector<HTMLInputElement>('.all input')?.checked ?? false;
    this._finish({ choice, forAll });
  }

  private _finish(answer: ClashAnswer | null): void {
    const resolve = this._resolve;
    if (resolve === null) return;
    this._resolve = null;
    document.removeEventListener('keydown', this._onEscape, true);
    this.hidden = true;
    resolve(answer);
  }
}

customElements.define('clash-prompt', ClashPrompt);

declare global {
  interface HTMLElementTagNameMap {
    'clash-prompt': ClashPrompt;
  }
}
