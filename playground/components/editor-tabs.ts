// The tabs above the editor, one per open file (phase 2d, step 3;
// docs/workspace-files.md "The file tree and tabs", mockup v6 screen O).
//
// A view only: workspace-view gives it `items` (services/open-files.ts
// `tabItems`), the `active` file and whether the docs are open, and acts on
// its events:
//   tab-select  { path, focusEditor }  a tab clicked (focusEditor), or chosen
//                                      with the arrow keys (the keyboard stays)
//   tab-close   { path }               its ×, a middle-click, or Delete
//   copy-code   { path }               the copy icon, before Docs (2e, step 3d)
//   toggle-docs                        the Docs button at the right end
// Every tab can close (step 4d): with none open, the editor shows its
// zero-state, and `active` is null. Not where `lastTabStays` (a scratch link,
// whose one file lives only in the editor): there the last tab has no ×.
//
// The copy icon (mockups v13 and v14) sits in a cell of its own, as Docs does,
// and copies the file in the editor; with no file open it isn't there. It
// says "Copied" only once workspace-view reports the clipboard took the text
// (`copied(ok)`), or what to do instead.

import type { TabItem } from '../services/open-files.js';
import {
  COPY_FEEDBACK_MS,
  COPY_STATUS_HTML,
  COPY_TIP_CSS,
  copyIconFor,
  copyStatusText,
  copyTipHtml,
} from '../utils/copy-feedback.js';
import type { CopyState } from '../utils/copy-feedback.js';
import { FILE_ICONS } from '../utils/file-icons.js';
import styles from './editor-tabs.css';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class EditorTabs extends HTMLElement {
  private _items: TabItem[] = [];

  private _active: string | null = null;

  private _lastTabStays = false;

  private _docsOpen = false;

  /** What the list was last drawn from, so an unchanged set never redraws (and keeps focus). */
  private _drawn = '';

  /** The tab last scrolled into view. */
  private _scrolledTo: string | null = '';

  /** What the copy icon says: nothing yet, copied, or refused. */
  private _copied: CopyState = '';

  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}${COPY_TIP_CSS}</style>
      <div class="list" role="tablist" aria-label="Open files"></div>
      <span class="copy-cell"><button class="copy" type="button"></button></span>
      <button class="docs" type="button" aria-label="Docs">${FILE_ICONS.book}</button>
      ${COPY_STATUS_HTML}
    `;
    this.shadowRoot!.querySelector('.copy')!.addEventListener('click', () => {
      if (this._active !== null) this._emit('copy-code', { path: this._active });
    });
    const list = this.shadowRoot!.querySelector('.list') as HTMLElement;
    list.addEventListener('click', (e) => this._onClick(e));
    list.addEventListener('auxclick', (e) => this._onAuxClick(e));
    list.addEventListener('mousedown', (e) => {
      // A middle-click closes; don't let it start an autoscroll.
      if (e.button === 1) e.preventDefault();
    });
    list.addEventListener('keydown', (e) => this._onKeydown(e));
    this.shadowRoot!.querySelector('.docs')!.addEventListener('click', () => this._emit('toggle-docs'));
    this._drawn = '';
    this._draw();
  }

  disconnectedCallback(): void {
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._copiedTimer = null;
    this._copied = '';
  }

  /**
   * The copy's outcome, once the clipboard has answered: "Copied", or what to do instead.
   * `path` is the file copied: if another file is in the editor by now, it says nothing,
   * rather than name a file that isn't on the clipboard.
   */
  copied(ok: boolean, path: string | null = this._active): void {
    if (!this.isConnected || path === null || path !== this._active) return;
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._copied = ok ? 'ok' : 'fail';
    this._markCopy();
    this._copiedTimer = setTimeout(() => {
      this._copiedTimer = null;
      this._copied = '';
      this._markCopy();
    }, COPY_FEEDBACK_MS);
  }

  get items(): TabItem[] {
    return this._items;
  }

  set items(items: TabItem[]) {
    this._items = items;
    this._draw();
  }

  /** The file in the editor; null with no file open. */
  get active(): string | null {
    return this._active;
  }

  set active(path: string | null) {
    // Another file: what the icon said was about the one before.
    if (path !== this._active && this._copied) {
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
      this._copiedTimer = null;
      this._copied = '';
    }
    this._active = path;
    this._markActive();
    this._markCopy();
  }

  /** Whether the last tab keeps no ×: a scratch link's one file can't close. */
  get lastTabStays(): boolean {
    return this._lastTabStays;
  }

  set lastTabStays(stays: boolean) {
    this._lastTabStays = stays;
    this._draw();
  }

  get docsOpen(): boolean {
    return this._docsOpen;
  }

  set docsOpen(open: boolean) {
    this._docsOpen = open;
    this._markDocs();
  }

  private get _list(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.list') ?? null;
  }

  private _tabs(): HTMLElement[] {
    return [...(this._list?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
  }

  private _draw(): void {
    const list = this._list;
    if (!list) return;
    const key = JSON.stringify([this._items, this._lastTabStays]);
    if (key !== this._drawn) {
      this._drawn = key;
      this._scrolledTo = '';
      const sole = this._lastTabStays && this._items.length < 2;
      list.innerHTML = this._items
        .map((item) => {
          const label = `${esc(item.name)}${item.hint !== null ? ` <span class="hint">· ${esc(item.hint)}</span>` : ''}`;
          const lock =
            item.kind === 'json'
              ? `<span class="lock" title="Read-only: the playground writes this file">${FILE_ICONS.lock}</span>`
              : '';
          const close = sole
            ? ''
            : `<button class="close" type="button" tabindex="-1" aria-label="Close ${esc(item.path)}" title="Close">${FILE_ICONS.close}</button>`;
          return `<div class="tab ${item.kind}${sole ? ' sole' : ''}" role="tab" data-path="${esc(item.path)}" title="${esc(item.path)}"><span class="icon">${FILE_ICONS[item.kind]}</span><span class="label">${label}</span>${lock}${close}</div>`;
        })
        .join('');
    }
    this._markActive();
    this._markCopy();
    this._markDocs();
  }

  /** The copy icon: named for the file in the editor, gone with none open. */
  private _markCopy(): void {
    const cell = this.shadowRoot?.querySelector<HTMLElement>('.copy-cell');
    const button = cell?.querySelector<HTMLElement>('.copy');
    if (!cell || !button) return;
    cell.hidden = this._active === null;
    const label = this._active === null ? 'Copy' : `Copy ${this._active}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.className = `copy ${this._copied}`.trim();
    button.innerHTML = copyIconFor(this._copied);
    cell.querySelector('.tip')?.remove();
    const tip = copyTipHtml(this._copied, `<code>${esc(this._active ?? '')}</code>`);
    if (tip) button.insertAdjacentHTML('afterend', tip);
    const status = this.shadowRoot!.querySelector('.copy-status');
    if (status) status.textContent = copyStatusText(this._copied, this._active ?? '');
  }

  private _markActive(): void {
    let shown: HTMLElement | null = null;
    for (const tab of this._tabs()) {
      const selected = tab.dataset.path === this._active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) shown = tab;
    }
    // Keep the shown tab in view when there are more tabs than fit, scrolling
    // only the bar (scrollIntoView would also scroll the page on a phone).
    const list = this._list;
    if (shown && list && this._scrolledTo !== this._active) {
      this._scrolledTo = this._active;
      const left = shown.offsetLeft - list.offsetLeft;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (left + shown.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left + shown.offsetWidth - list.clientWidth;
      }
    }
  }

  private _markDocs(): void {
    const docs = this.shadowRoot?.querySelector('.docs');
    if (!docs) return;
    docs.setAttribute('aria-pressed', String(this._docsOpen));
    docs.setAttribute('title', this._docsOpen ? 'Hide the docs' : 'Show the docs');
  }

  private _pathOf(target: EventTarget | null): string | null {
    const tab = (target as HTMLElement | null)?.closest?.<HTMLElement>('[role="tab"]');
    return tab?.dataset.path ?? null;
  }

  private _onClick(e: MouseEvent): void {
    const path = this._pathOf(e.target);
    if (path === null) return;
    if ((e.target as HTMLElement).closest('.close')) {
      e.stopPropagation();
      this._close(path);
      return;
    }
    // A click hands the keyboard back to the editor, as VS Code does.
    this._emit('tab-select', { path, focusEditor: true });
  }

  private _onAuxClick(e: MouseEvent): void {
    if (e.button !== 1) return;
    const path = this._pathOf(e.target);
    if (path !== null) {
      e.preventDefault();
      this._close(path);
    }
  }

  private _onKeydown(e: KeyboardEvent): void {
    const tabs = this._tabs();
    const at = tabs.findIndex((tab) => tab === this.shadowRoot!.activeElement);
    if (at < 0) return;
    let to: number | null = null;
    if (e.key === 'ArrowRight') to = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    else if (e.key === 'Delete') {
      e.preventDefault();
      this._close(tabs[at].dataset.path!, true);
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Enter goes to the editor; the tab is already the shown one.
      e.preventDefault();
      this._emit('tab-select', { path: tabs[at].dataset.path!, focusEditor: true });
      return;
    }
    if (to === null) return;
    e.preventDefault();
    // Arrow keys move and choose together (automatic activation): showing a
    // file is cheap, and its state is kept. The keyboard stays in the tabs.
    const path = tabs[to].dataset.path!;
    this._emit('tab-select', { path, focusEditor: false });
    tabs[to].focus();
  }

  /** Close a tab; `fromKeyboard` (Delete) lets workspace-view put the keyboard somewhere sensible after. */
  private _close(path: string, fromKeyboard = false): void {
    if (this._lastTabStays && this._items.length < 2) return;
    this._emit('tab-close', { path, fromKeyboard });
  }

  private _emit(name: string, detail?: { path: string; focusEditor?: boolean; fromKeyboard?: boolean }): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

customElements.define('editor-tabs', EditorTabs);
