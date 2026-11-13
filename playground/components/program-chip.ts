// The program chip (phase 2d, step 5a; mockup v6 screen G,
// docs/workspace-files.md "The preview and the program list"). Beside the
// zoom controls, it names the program the preview shows. Its list, which opens
// upward, holds each program with its miniature, name and path, a check on the
// one shown, and Open in the editor. It's the one way to change what the
// preview shows.
//
// A view only: workspace-view gives it
//   items    the rows (services/program-list.ts programItems)
//   shown    the program the preview shows
//   editing  the file in the editor, which the dot's title names
//   alert    the red dot's title (chipAlert), or null for none
// and acts on what it asks for:
//   show-program { path }                     a row chosen
//   open-file    { path, focusEditor: true }  its Open in the editor
//
// From the keyboard: Enter, Space, Up or Down on the chip opens the list on the
// program shown; Up and Down move, Home and End; Right reaches the row's Open
// in the editor and Left comes back; Enter chooses; Escape closes, back to the chip.

import { FILE_ICONS, MAIN_BADGE_TITLE } from '../utils/file-icons.js';
import styles from './program-chip.css';

import type { ProgramItem } from '../services/program-list.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The list's height when the preview leaves room for it; it scrolls past that. */
const LIST_MAX = 460;
/** Room kept between the list and the preview's edges. */
const EDGE = 8;
/** How far above the chip's bottom the list starts: its `bottom` in program-chip.css. */
const LIST_BOTTOM = 38;

const nameHtml = (item: { name: string; hint: string | null }): string =>
  `${esc(item.name)}${item.hint !== null ? ` <span class="hint">· ${esc(item.hint)}</span>` : ''}`;

export class ProgramChip extends HTMLElement {
  private _items: ProgramItem[] = [];

  private _shown: string | null = null;

  private _editing: string | null = null;

  private _alert: string | null = null;

  private _open = false;

  /** What the rows were last drawn from, so an unchanged list never redraws (and keeps focus). */
  private _drawn = '';

  private readonly _onOutside = (e: Event): void => {
    if (!e.composedPath().includes(this)) this.close();
  };

  /**
   * Escape, wherever the keyboard is, closes the open list and nothing else:
   * not the preview's fullscreen, whose own Escape listens on the document.
   * Heard first, on the way down. The keyboard goes back to the chip if it
   * was on the chip or in the list.
   */
  private readonly _onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.close(e.composedPath().includes(this));
  };

  /** The window resized: the list was sized for the preview as it was. */
  private readonly _onResize = (): void => this.close();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    const root = this.shadowRoot!;
    if (!root.firstChild) {
      root.innerHTML = `<style>${styles}</style>
        <div class="list" id="list" role="group" aria-label="Programs" hidden>
          <div class="head"><span>Programs</span><span class="cnt"></span></div>
          <div class="rows"></div>
        </div>
        <button class="pick" type="button" aria-expanded="false" aria-controls="list"><span class="name"></span><span class="caret">${FILE_ICONS.chevronUp}</span></button>`;
      const pick = this._pick!;
      // A click from the keyboard (Enter or Space) has no pointer: detail 0.
      pick.addEventListener('click', (e) => (this._open ? this.close() : this._openList(e.detail === 0)));
      pick.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        this._openList(true);
      });
      const list = this._list!;
      list.addEventListener('click', (e) => this._onListClick(e));
      list.addEventListener('keydown', (e) => this._onListKeydown(e));
      // Tab out of it closes it.
      root.addEventListener('focusout', (e) => {
        const to = (e as FocusEvent).relatedTarget as Node | null;
        if (this._open && to !== null && to !== this && !root.contains(to)) this.close();
      });
    }
    this._drawn = '';
    this._draw();
  }

  disconnectedCallback(): void {
    this.close();
  }

  get items(): ProgramItem[] {
    return this._items;
  }

  set items(items: ProgramItem[]) {
    this._items = items;
    this._draw();
  }

  get shown(): string | null {
    return this._shown;
  }

  set shown(path: string | null) {
    this._shown = path;
    this._draw();
  }

  get editing(): string | null {
    return this._editing;
  }

  set editing(path: string | null) {
    this._editing = path;
    this._draw();
  }

  get alert(): string | null {
    return this._alert;
  }

  set alert(title: string | null) {
    this._alert = title;
    this._drawChip();
  }

  get isOpen(): boolean {
    return this._open;
  }

  /** Close the list; `toChip` puts the keyboard back on the chip. */
  close(toChip = false): void {
    if (this._open) {
      this._open = false;
      document.removeEventListener('pointerdown', this._onOutside, true);
      document.removeEventListener('keydown', this._onEscape, true);
      window.removeEventListener('resize', this._onResize);
      if (this._list) this._list.hidden = true;
      this._pick?.setAttribute('aria-expanded', 'false');
    }
    if (toChip) this._pick?.focus();
  }

  private get _pick(): HTMLButtonElement | null {
    return this.shadowRoot?.querySelector<HTMLButtonElement>('.pick') ?? null;
  }

  private get _list(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>('.list') ?? null;
  }

  private _rows(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.prow') ?? [])];
  }

  private _draw(): void {
    this._drawChip();
    this._drawRows();
  }

  private _drawChip(): void {
    const pick = this._pick;
    if (!pick) return;
    const item = this._items.find((i) => i.path === this._shown);
    pick.querySelector('.name')!.innerHTML = item ? nameHtml(item) : esc(this._shown ?? '');
    pick.title = `Showing ${this._shown ?? ''}. Choose a program`;
    let dot = pick.querySelector<HTMLElement>('.pick-err');
    if (this._alert === null) dot?.remove();
    else {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'pick-err';
        dot.setAttribute('role', 'img');
        pick.insertBefore(dot, pick.querySelector('.caret'));
      }
      dot.title = this._alert;
      dot.setAttribute('aria-label', this._alert);
    }
  }

  private _drawRows(): void {
    const list = this._list;
    if (!list) return;
    const key = JSON.stringify([this._items, this._shown, this._editing]);
    if (key === this._drawn) return;
    this._drawn = key;
    // The keyboard stays on the same program's same button across a redraw;
    // with that program gone from the list, it goes to the chip.
    const active = this.shadowRoot!.activeElement as HTMLElement | null;
    const keep = active?.closest<HTMLElement>('.prow')
      ? { path: active.closest<HTMLElement>('.prow')!.dataset.path, open: active.classList.contains('open') }
      : null;
    list.querySelector('.cnt')!.textContent = String(this._items.length);
    list.querySelector('.rows')!.innerHTML = this._items.map((item) => this._rowHtml(item)).join('');
    if (keep) {
      const row = this._rows().find((r) => r.dataset.path === keep.path);
      if (row) row.querySelector<HTMLElement>(keep.open ? '.open' : '.show')?.focus();
      else this._pick?.focus();
    }
    this._markTabStop();
  }

  private _rowHtml(item: ProgramItem): string {
    const on = item.path === this._shown;
    const classes = ['prow', on ? 'on' : '', item.updating ? 'upd' : '', item.error !== null ? 'err' : '']
      .filter(Boolean)
      .join(' ');
    const dotTitle =
      item.uses === 'self'
        ? 'The file you’re editing'
        : item.uses === 'import'
          ? `Uses ${this._editing ?? ''}, the file you’re editing`
          : '';
    const dot = item.uses
      ? `<span class="udot" role="img" aria-label="${esc(dotTitle)}" title="${esc(dotTitle)}"></span>`
      : '';
    const badge = item.badge ? `<span class="badge" title="${esc(MAIN_BADGE_TITLE)}">main</span>` : '';
    const img = item.miniature !== null ? `<img src="${esc(item.miniature)}" alt="">` : '';
    const spin = item.updating ? '<span class="spin" role="img" aria-label="Updating" title="Updating"></span>' : '';
    const bad = item.error !== null ? '<span class="mbad" aria-hidden="true">!</span>' : '';
    const sub =
      item.error !== null ? `<span class="e">${esc(item.error)}</span>` : `<span class="p">${esc(item.path)}</span>`;
    const openLabel = `Open ${esc(item.path)} in the editor`;
    const check = on ? `<span class="chk" role="img" aria-label="Shown" title="Shown">${FILE_ICONS.check}</span>` : '';
    return `<div class="${classes}" data-path="${esc(item.path)}">
      <button class="show" type="button" tabindex="-1"${on ? ' aria-current="true"' : ''}><span class="tile">${img}${spin}${bad}</span><span class="t"><span class="n">${dot}<span class="nm">${nameHtml(item)}</span>${badge}</span>${sub}</span></button>
      <span class="r"><button class="open" type="button" tabindex="-1" title="${openLabel}" aria-label="${openLabel}">${FILE_ICONS.code}</button>${check}</span>
    </div>`;
  }

  /** One row is the list's Tab stop: the one with the keyboard, else the program shown, else the first. */
  private _markTabStop(): void {
    const shows = this._rows().map((r) => r.querySelector<HTMLElement>('.show')!);
    const active = this.shadowRoot!.activeElement;
    const stop =
      shows.find((s) => s === active || s.closest('.prow')!.contains(active)) ??
      shows.find((s) => s.closest<HTMLElement>('.prow')!.dataset.path === this._shown) ??
      shows[0];
    for (const s of shows) s.tabIndex = s === stop ? 0 : -1;
  }

  private _openList(withKeyboard: boolean): void {
    const list = this._list;
    if (!list || this._items.length === 0) return;
    if (!this._open) {
      this._open = true;
      list.hidden = false;
      this._pick!.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', this._onOutside, true);
      document.addEventListener('keydown', this._onEscape, true);
      window.addEventListener('resize', this._onResize);
      this._fit();
    }
    if (withKeyboard) this._focusRow(this._items.findIndex((i) => i.path === this._shown));
  }

  /**
   * The list fits the box it opens in (the preview): no taller than the room
   * above the chip, no wider than the room to its left. That box is the
   * nearest one around the chip that clips or scrolls what overflows it, so
   * the list never makes the preview scroll; else the window.
   */
  private _fit(): void {
    const list = this._list!;
    const chip = this.getBoundingClientRect();
    const box = this._clippingBox();
    const above = chip.bottom - LIST_BOTTOM - box.top - EDGE;
    list.style.maxHeight = `${Math.max(120, Math.min(LIST_MAX, above))}px`;
    const width = list.offsetWidth || 292;
    const room = chip.right - box.left - EDGE;
    list.style.right = room < width ? `${room - width}px` : '0px';
  }

  /** The nearest box around the chip, across shadow roots, whose overflow isn't visible; else the window. */
  private _clippingBox(): { top: number; left: number } {
    // An element's parent, or at the top of a shadow root, the element the root belongs to.
    const up = (el: Element): Element | null => {
      if (el.parentElement) return el.parentElement;
      const root = el.getRootNode();
      return root instanceof ShadowRoot ? root.host : null;
    };
    for (let node = up(this); node !== null; node = up(node)) {
      const { overflowX, overflowY } = getComputedStyle(node);
      if (overflowX !== 'visible' || overflowY !== 'visible') return node.getBoundingClientRect();
    }
    return { top: 0, left: 0 };
  }

  private _focusRow(index: number, open = false): void {
    const rows = this._rows();
    if (rows.length === 0) return;
    const row = rows[Math.max(0, Math.min(index < 0 ? 0 : index, rows.length - 1))];
    row.querySelector<HTMLElement>(open ? '.open' : '.show')?.focus();
    this._markTabStop();
  }

  private _onListClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>('.prow');
    if (!row) return;
    const path = row.dataset.path!;
    const fromKeyboard = e.detail === 0;
    if (target.closest('.open')) {
      this.close();
      this._emit('open-file', { path, focusEditor: true });
    } else if (target.closest('.show')) {
      this.close(fromKeyboard);
      this._emit('show-program', { path });
    }
  }

  private _onListKeydown(e: KeyboardEvent): void {
    // (Escape is heard on the document while the list is open: _onEscape.)
    const rows = this._rows();
    const active = this.shadowRoot!.activeElement as HTMLElement | null;
    const at = rows.findIndex((r) => r.contains(active));
    if (at < 0) return;
    const onOpen = active!.classList.contains('open');
    let to: number | null = null;
    if (e.key === 'ArrowDown') to = (at + 1) % rows.length;
    else if (e.key === 'ArrowUp') to = (at - 1 + rows.length) % rows.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = rows.length - 1;
    else if (e.key === 'ArrowRight' && !onOpen) {
      e.preventDefault();
      this._focusRow(at, true);
      return;
    } else if (e.key === 'ArrowLeft' && onOpen) {
      e.preventDefault();
      this._focusRow(at);
      return;
    }
    if (to === null) return;
    e.preventDefault();
    this._focusRow(to);
  }

  private _emit(name: string, detail: { path: string; focusEditor?: boolean }): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

customElements.define('program-chip', ProgramChip);

declare global {
  interface HTMLElementTagNameMap {
    'program-chip': ProgramChip;
  }
}
