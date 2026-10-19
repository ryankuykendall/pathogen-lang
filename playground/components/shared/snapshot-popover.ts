// <snapshot-popover> — the naming / saving / saved / error panel that opens
// from the Snapshot button (docs/snapshots.md, mockup v3 screens 1, 2 and 4).
//
// A controlled component: the owner (workspace-view) calls openAt() with the
// anchor's rect, then setState() as the capture moves along, and listens for
// the events below. It is position: fixed and appended to document.body by
// its owner, so breadcrumb re-renders (which rebuild that bar's DOM on every
// compile-status change) and the fullscreen preview (z-index 9999) can't
// destroy or cover it while the user types.
//
// Events (bubbles + composed):
//   snapshot-popover-save      { name, note }  — Save / Enter
//   snapshot-popover-retry     { name, note }  — Retry after a failed upload
//   snapshot-popover-undo                       — Undo in the Saved state
//   snapshot-popover-view                       — "View snapshots (n) →"
//   snapshot-popover-sign-in                    — signed-out state
//   snapshot-popover-download-svg               — offline fallback
//   snapshot-popover-open-export                — too-large fallback
//   snapshot-popover-close                      — Esc, Cancel, outside click

import { escapeHtml } from '../../utils/html-escape.js';

export type SnapshotPopoverState =
  | { kind: 'naming'; thumbUrl: string | null; name: string; staleLine: number | null }
  | { kind: 'scratch'; thumbUrl: string | null; workspaceName: string; staleLine: number | null }
  | { kind: 'saving'; thumbUrl: string | null; name: string; sizeLabel: string }
  | { kind: 'saved'; thumbUrl: string | null; name: string; total: number | null }
  | { kind: 'signed-out'; thumbUrl: string | null }
  | {
      kind: 'error';
      thumbUrl: string | null;
      name: string;
      note: string;
      message: string;
      /** Upload failed but the capture is held: offer Retry + Download SVG. */
      retry?: boolean;
      /** Too large: offer Open Export… instead. */
      exportInstead?: boolean;
    };

export type SnapshotPopoverPlacement = 'below' | 'left';

/** How long the Saved state lingers before closing itself (ms). */
const SAVED_AUTO_CLOSE_MS = 4000;

const POPOVER_WIDTH = 330;
const GAP = 10;

const styles = `
  :host {
    position: fixed;
    z-index: 10050;
    display: none;
    width: ${POPOVER_WIDTH}px;
    max-width: calc(100vw - 2rem);
    font-family: var(--font-body, var(--font-sans, system-ui, sans-serif));
    color: var(--text-primary, #1c1722);
  }
  :host([open]) { display: block; }
  .panel {
    position: relative;
    background: var(--bg-elevated, #ffffff);
    border: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(28, 23, 34, 0.1));
    padding: 12px;
    animation: rise 0.18s ease;
  }
  @keyframes rise { from { transform: translateY(6px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
  .arrow {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--bg-elevated, #ffffff);
    transform: rotate(45deg);
  }
  :host([placement='below']) .arrow {
    top: -6px;
    left: var(--arrow-offset, 40px);
    border-left: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
    border-top: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
  }
  :host([placement='left']) .arrow {
    right: -6px;
    top: var(--arrow-offset, 18px);
    border-right: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
    border-top: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
  }
  .row { display: grid; grid-template-columns: 76px 1fr; gap: 10px; align-items: start; }
  .thumb {
    width: 76px;
    height: 76px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border-subtle, rgba(28, 23, 34, 0.06));
    background: var(--bg-elevated, #ffffff) center / contain no-repeat;
  }
  .thumb.pending { background-color: var(--bg-tertiary, rgba(28, 23, 34, 0.05)); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  label { display: block; font-size: 11px; color: var(--text-tertiary, #9087a0); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  input, textarea {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18));
    border-radius: var(--radius-sm, 6px);
    background: var(--bg-secondary, #fdf6ed);
    color: var(--text-primary, #1c1722);
  }
  input:focus, textarea:focus { outline: 2px solid var(--focus-ring, rgba(192, 81, 142, 0.4)); outline-offset: 0; }
  input:disabled { opacity: 0.7; }
  textarea { resize: none; height: 44px; margin-top: 8px; display: block; }
  .msg { margin-top: 8px; font-size: 12px; line-height: 1.4; padding: 6px 8px; border-radius: var(--radius-sm, 6px); }
  .msg.warn { background: var(--warning-bg, #fffbeb); border: 1px solid var(--warning-border, #fde68a); }
  .msg.err { background: var(--error-bg, #fef2f2); border: 1px solid var(--error-border, #fecaca); }
  .foot { display: grid; grid-auto-flow: column; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--text-tertiary, #9087a0); }
  .linkish { background: none; border: none; padding: 0; font: inherit; color: var(--text-secondary, #5a4f6a); cursor: pointer; }
  .linkish:hover { color: var(--text-primary, #1c1722); text-decoration: underline; }
  kbd { font-family: var(--font-mono, monospace); font-size: 11px; border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18)); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--bg-elevated, #fff); }
  .primary {
    background: var(--accent-color, #c0518e);
    color: var(--accent-text, #fffaf2);
    border: none;
    border-radius: var(--radius-sm, 6px);
    padding: 6px 14px;
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .primary:hover { background: var(--accent-hover, #b04680); }
  .secondary {
    background: var(--bg-elevated, #ffffff);
    color: var(--text-primary, #1c1722);
    border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18));
    border-radius: var(--radius-sm, 6px);
    padding: 6px 12px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .secondary:hover { background: var(--hover-bg, rgba(0, 0, 0, 0.04)); }
  .progress { height: 3px; border-radius: 2px; background: var(--bg-tertiary, rgba(28, 23, 34, 0.05)); overflow: hidden; margin-top: 10px; }
  .progress i { display: block; height: 100%; width: 45%; background: var(--text-secondary, #5a4f6a); animation: indet 1.1s ease-in-out infinite; }
  @keyframes indet { from { transform: translateX(-100%); } to { transform: translateX(230%); } }
  .done { display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center; }
  .done .thumb { width: 56px; height: 56px; }
  .title { font-weight: 600; font-size: 13px; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 6px; overflow-wrap: anywhere; }
  .tick { width: 18px; height: 18px; border-radius: 50%; background: var(--success-color, #10b981); color: var(--bg-elevated, #ffffff); display: inline-grid; place-items: center; font-size: 11px; }
  .sub { font-size: 12px; color: var(--text-secondary, #5a4f6a); margin-top: 2px; line-height: 1.4; }
  .links { display: grid; grid-auto-flow: column; justify-content: start; gap: 12px; margin-top: 6px; font-size: 12px; }
  .links .strong { color: var(--text-primary, #1c1722); font-weight: 600; }
`;

export class SnapshotPopover extends HTMLElement {
  private _state: SnapshotPopoverState | null = null;

  private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  private _onDocPointerDown = (e: PointerEvent): void => {
    if (!this.hasAttribute('open')) return;
    if (e.composedPath().includes(this)) return;
    // A press on a Snapshot button is the opener's to handle (it toggles the
    // popover shut). Match by id, not element identity: the breadcrumb
    // rebuilds its buttons on every compile-status change.
    const path = e.composedPath();
    if (path.some((n) => (n as Element).id === 'snapshot-btn' || n === this._anchorEl)) return;
    // Closing while saving does not cancel the upload (docs/snapshots.md).
    this._emit('snapshot-popover-close');
  };

  private _onDocKeydown = (e: KeyboardEvent): void => {
    if (!this.hasAttribute('open')) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._emit('snapshot-popover-close');
    }
  };

  private _anchorEl: Element | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-label', 'Save snapshot');
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    // Capture phase so Esc closes the popover before the fullscreen toggle
    // (which also listens for Esc) exits fullscreen.
    document.addEventListener('keydown', this._onDocKeydown, true);
    this._render();
  }

  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    document.removeEventListener('keydown', this._onDocKeydown, true);
    this._clearAutoClose();
  }

  get state(): SnapshotPopoverState | null {
    return this._state;
  }

  get isOpen(): boolean {
    return this.hasAttribute('open');
  }

  /**
   * Show the popover next to `anchor`. 'below' hangs it under a toolbar
   * button; 'left' sits it beside a button in the fullscreen right column.
   */
  openAt(anchor: DOMRect, placement: SnapshotPopoverPlacement, anchorEl: Element | null = null): void {
    this._anchorEl = anchorEl;
    this.setAttribute('placement', placement);
    const vw = window.innerWidth;
    const width = Math.min(POPOVER_WIDTH, vw - 32);
    if (placement === 'below') {
      const left = Math.max(16, Math.min(anchor.left - 20, vw - width - 16));
      this.style.left = `${left}px`;
      this.style.top = `${anchor.bottom + GAP}px`;
      this.style.right = '';
      this.style.setProperty('--arrow-offset', `${Math.max(12, anchor.left + anchor.width / 2 - left - 5)}px`);
    } else {
      this.style.left = `${Math.max(16, anchor.left - width - GAP - 2)}px`;
      this.style.top = `${Math.max(16, anchor.top - 8)}px`;
      this.style.right = '';
      this.style.setProperty('--arrow-offset', `${anchor.height / 2 + 3}px`);
    }
    this.setAttribute('open', '');
  }

  close(): void {
    this.removeAttribute('open');
    this._clearAutoClose();
    this._state = null;
    this._anchorEl = null;
  }

  setState(state: SnapshotPopoverState): void {
    // Keep what the user typed when moving between naming ⇄ error states.
    this._state = state;
    this._clearAutoClose();
    this._render();
    if (state.kind === 'saved') {
      this._autoCloseTimer = setTimeout(() => this._emit('snapshot-popover-close'), SAVED_AUTO_CLOSE_MS);
    }
    const focusTarget = this.shadowRoot!.querySelector<HTMLInputElement>('input:not([disabled])');
    if (focusTarget && (state.kind === 'naming' || state.kind === 'scratch' || state.kind === 'error')) {
      focusTarget.focus();
      if (state.kind !== 'error') focusTarget.select();
    }
  }

  /** Swap in the card thumbnail once it has rendered, without a re-render. */
  setThumb(url: string): void {
    if (this._state) this._state = { ...this._state, thumbUrl: url };
    this.shadowRoot!.querySelectorAll<HTMLElement>('.thumb').forEach((el) => {
      el.classList.remove('pending');
      el.style.backgroundImage = `url("${url}")`;
    });
  }

  private _clearAutoClose(): void {
    if (this._autoCloseTimer) clearTimeout(this._autoCloseTimer);
    this._autoCloseTimer = null;
  }

  private _emit(name: string, detail?: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  private _fields(): { name: string; note: string } {
    const name = this.shadowRoot!.querySelector<HTMLInputElement>('#name')?.value ?? '';
    const note = this.shadowRoot!.querySelector<HTMLTextAreaElement>('#note')?.value ?? '';
    return { name: name.trim(), note: note.trim() };
  }

  private _thumb(url: string | null): string {
    return url
      ? `<div class="thumb" style="background-image:url(&quot;${escapeHtml(url)}&quot;)"></div>`
      : `<div class="thumb pending" aria-hidden="true"></div>`;
  }

  private _body(state: SnapshotPopoverState): string {
    switch (state.kind) {
      case 'naming':
        return `
          <div class="row">${this._thumb(state.thumbUrl)}
            <div><label for="name">Name</label><input id="name" maxlength="120" value="${escapeHtml(state.name)}" /></div>
          </div>
          <textarea id="note" maxlength="2000" placeholder="Note (optional)" aria-label="Note"></textarea>
          ${
            state.staleLine != null
              ? `<div class="msg warn">You've edited line ${state.staleLine} since this rendered. The snapshot saves the code that drew <b>this</b> image, not your newer edits.</div>`
              : ''
          }
          <div class="foot"><span><kbd>⏎</kbd> save · <kbd>esc</kbd> cancel</span><button class="primary" data-act="save">Save snapshot</button></div>`;
      case 'scratch':
        return `
          <div class="row">${this._thumb(state.thumbUrl)}
            <div><label for="name">Workspace name</label><input id="name" maxlength="120" value="${escapeHtml(state.workspaceName)}" /></div>
          </div>
          <div class="msg warn">Snapshots are kept with a workspace. Saving this one creates the workspace “<span id="ws-echo">${escapeHtml(state.workspaceName)}</span>”.</div>
          ${
            state.staleLine != null
              ? `<div class="msg warn">You've edited line ${state.staleLine} since this rendered. The snapshot saves the code that drew <b>this</b> image; the new workspace keeps your latest edits.</div>`
              : ''
          }
          <div class="foot"><button class="linkish" data-act="cancel">Cancel</button><button class="primary" data-act="save">Save workspace + snapshot</button></div>`;
      case 'saving':
        return `
          <div class="row">${this._thumb(state.thumbUrl)}
            <div><label>Name</label><input value="${escapeHtml(state.name)}" disabled /></div>
          </div>
          <div class="progress" role="progressbar" aria-label="Saving snapshot"><i></i></div>
          <div class="foot"><span>Saving · ${escapeHtml(state.sizeLabel)}</span><span>You can keep editing</span></div>`;
      case 'saved':
        return `
          <div class="done">${this._thumb(state.thumbUrl)}
            <div>
              <div class="title"><span class="tick" aria-hidden="true">✓</span><span>Saved “${escapeHtml(state.name)}”</span></div>
              <div class="sub">Image + the code that drew it</div>
              <div class="links">
                <button class="linkish strong" data-act="view">View snapshots${state.total != null ? ` (${state.total})` : ''} →</button>
                <button class="linkish" data-act="undo">Undo</button>
              </div>
            </div>
          </div>`;
      case 'signed-out':
        return `
          <div class="row">${this._thumb(state.thumbUrl)}
            <div>
              <div class="title">Sign in to save snapshots</div>
              <div class="sub">Snapshots are stored in your account with the code that drew them.</div>
            </div>
          </div>
          <div class="foot"><button class="linkish" data-act="cancel">Not now</button><button class="primary" data-act="sign-in">Sign in</button></div>`;
      case 'error': {
        if (state.retry) {
          return `
            <div class="row">${this._thumb(state.thumbUrl)}
              <div><label for="name">Name</label><input id="name" maxlength="120" value="${escapeHtml(state.name)}" /></div>
            </div>
            <textarea id="note" maxlength="2000" placeholder="Note (optional)" aria-label="Note">${escapeHtml(state.note)}</textarea>
            <div class="msg err" role="alert">${escapeHtml(state.message)}</div>
            <div class="foot"><button class="linkish" data-act="download-svg">Download SVG instead</button><button class="primary" data-act="retry">Retry</button></div>`;
        }
        return `
          <div class="row">${this._thumb(state.thumbUrl)}
            <div><label>Name</label><input value="${escapeHtml(state.name)}" disabled /></div>
          </div>
          <div class="msg err" role="alert">${escapeHtml(state.message)}</div>
          <div class="foot"><button class="linkish" data-act="cancel">Close</button>${
            state.exportInstead ? '<button class="secondary" data-act="open-export">Open Export…</button>' : ''
          }</div>`;
      }
    }
  }

  private _render(): void {
    const body = this._state ? this._body(this._state) : '';
    this.shadowRoot!.innerHTML = `<style>${styles}</style><div class="panel"><span class="arrow" aria-hidden="true"></span>${body}</div>`;
    this._wire();
  }

  private _wire(): void {
    const root = this.shadowRoot!;
    root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => this._act(btn.dataset.act!));
    });
    const name = root.querySelector<HTMLInputElement>('#name');
    name?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._act(this._state?.kind === 'error' ? 'retry' : 'save');
      }
    });
    name?.addEventListener('input', () => {
      const echo = root.querySelector('#ws-echo');
      if (echo) echo.textContent = name.value.trim() || 'Untitled';
    });
    root.querySelector<HTMLTextAreaElement>('#note')?.addEventListener('keydown', (e) => {
      // Enter adds a line in the note; Cmd/Ctrl+Enter saves.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this._act(this._state?.kind === 'error' ? 'retry' : 'save');
      }
    });
    // Hovering the Saved state keeps it open.
    root.querySelector('.panel')?.addEventListener('pointerenter', () => this._clearAutoClose());
  }

  private _act(act: string): void {
    switch (act) {
      case 'save':
        this._emit('snapshot-popover-save', this._fields());
        break;
      case 'retry':
        this._emit('snapshot-popover-retry', this._fields());
        break;
      case 'undo':
        this._emit('snapshot-popover-undo');
        break;
      case 'view':
        this._emit('snapshot-popover-view');
        break;
      case 'sign-in':
        this._emit('snapshot-popover-sign-in');
        break;
      case 'download-svg':
        this._emit('snapshot-popover-download-svg');
        break;
      case 'open-export':
        this._emit('snapshot-popover-open-export');
        break;
      default:
        this._emit('snapshot-popover-close');
    }
  }
}

customElements.define('snapshot-popover', SnapshotPopover);
