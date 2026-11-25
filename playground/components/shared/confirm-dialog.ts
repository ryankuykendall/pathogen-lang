// A confirmation dialog (phase 2d, step 4c; mockup v7 screen F, "Deleting a
// folder"): Delete… asks before it deletes. `confirmDialog(options)` shows one
// and resolves to the answer; the dialog goes when it's answered.
//
// The native <dialog>, shown modal: focus stays inside it, and Escape says no.
// Cancel has the first focus, so a stray Enter never confirms. Every name goes
// in as text.

/** The dialog's frame: its title bar, body and buttons. New data file… (new-data-file-dialog.ts) wears it too. */
export const DIALOG_STYLES = `
  /* Modal, the dialog is in the top layer: above the page, its overlays and the toasts. */
  :host(.inline) { display: block; }
  :host(.inline) dialog { position: static; margin: 0; }
  dialog {
    width: min(440px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-elevated, #fff);
    color: var(--text-primary, #1a1a2e);
    box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
    font-family: var(--font-sans, system-ui, sans-serif);
  }
  dialog::backdrop { background: rgba(28, 23, 34, 0.35); }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }
  h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; }
  .close {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: none;
    color: var(--text-secondary, #64748b);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover { background: var(--hover-bg, rgba(0, 0, 0, 0.05)); color: var(--text-primary, #1a1a2e); }
  .body { padding: 16px 18px; font-size: 14px; line-height: 1.5; }
  .message { margin: 0 0 10px; color: var(--text-secondary, #475569); }
  ul { margin: 0 0 12px; padding-left: 18px; font-family: var(--font-mono, monospace); font-size: 12.5px; }
  li { margin: 3px 0; }
  .warning {
    padding: 10px 12px;
    border: 1px solid var(--warning-border, #fde68a);
    border-radius: 8px;
    background: var(--warning-bg, #fffbeb);
    font-size: 13px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }
  .foot button {
    padding: 8px 14px;
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .cancel {
    border: 1px solid var(--border-color, #e2e8f0);
    background: transparent;
    color: var(--text-primary, #1a1a2e);
    font-weight: 500;
  }
  .confirm { border: none; background: var(--accent-color, #9461c4); color: var(--accent-text, #fff); }
  .confirm.danger { background: var(--error-color, #ef4444); color: #fff; }
  button:focus-visible { outline: 2px solid var(--focus-ring, rgba(148, 97, 196, 0.5)); outline-offset: 2px; }
`;

export interface ConfirmOptions {
  title: string;
  /** One line saying what it will do. */
  message: string;
  /** What it will do it to, as a list (file names). */
  items?: string[];
  /** What follows from it, in a box. */
  warning?: string;
  /** The button that says yes: what it does ("Delete the folder and 3 files"). */
  confirmLabel: string;
  /** A red yes button. */
  danger?: boolean;
}

let count = 0;

export class ConfirmDialog extends HTMLElement {
  private _resolve: ((yes: boolean) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  /**
   * Show the question (at once: nothing here waits); resolves to the answer,
   * and the dialog goes. `modal: false` shows it in place, for the storybook,
   * where a modal dialog would hold the storybook's own controls.
   */
  async ask(options: ConfirmOptions, { modal = true }: { modal?: boolean } = {}): Promise<boolean> {
    this.classList.toggle('inline', !modal);
    count += 1;
    const titleId = `confirm-title-${count}`;
    const root = this.shadowRoot!;
    root.innerHTML = `<style>${DIALOG_STYLES}</style>
      <dialog aria-labelledby="${titleId}">
        <div class="head"><h2 id="${titleId}"></h2><button type="button" class="close" aria-label="Close">×</button></div>
        <div class="body"><p class="message"></p></div>
        <div class="foot"><button type="button" class="cancel">Cancel</button><button type="button" class="confirm"></button></div>
      </dialog>`;
    root.querySelector('h2')!.textContent = options.title;
    root.querySelector('.message')!.textContent = options.message;
    const body = root.querySelector('.body')!;
    if (options.items && options.items.length > 0) {
      const list = document.createElement('ul');
      for (const item of options.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.append(li);
      }
      body.append(list);
    }
    if (options.warning) {
      const warning = document.createElement('div');
      warning.className = 'warning';
      warning.textContent = options.warning;
      body.append(warning);
    }
    const confirm = root.querySelector<HTMLButtonElement>('.confirm')!;
    confirm.textContent = options.confirmLabel;
    confirm.classList.toggle('danger', options.danger === true);

    const dialog = root.querySelector('dialog')!;
    const answer = new Promise<boolean>((resolve) => {
      this._resolve = resolve;
    });
    confirm.addEventListener('click', () => this._answer(true));
    root.querySelector('.cancel')!.addEventListener('click', () => this._answer(false));
    root.querySelector('.close')!.addEventListener('click', () => this._answer(false));
    // Escape: the dialog's own cancel.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      this._answer(false);
    });
    if (modal && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    root.querySelector<HTMLButtonElement>('.cancel')!.focus();
    return answer;
  }

  /** Withdraw the question (the page that asked has gone): it says no. */
  cancel(): void {
    this._answer(false);
  }

  private _answer(yes: boolean): void {
    const resolve = this._resolve;
    if (!resolve) return;
    this._resolve = null;
    const dialog = this.shadowRoot!.querySelector('dialog');
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    this.remove();
    resolve(yes);
  }
}

if (!customElements.get('confirm-dialog')) customElements.define('confirm-dialog', ConfirmDialog);

declare global {
  interface HTMLElementTagNameMap {
    'confirm-dialog': ConfirmDialog;
  }
}

/** Ask, and wait for the answer: true for the yes button, false for anything else. */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const dialog = document.createElement('confirm-dialog');
  document.body.append(dialog);
  return dialog.ask(options);
}
