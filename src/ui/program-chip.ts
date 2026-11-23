// <program-chip> — the program chip and its list, in every preview that can
// show more than one program: the playground's (phase 2d, step 5a; mockup v6
// screen G; docs/workspace-files.md "The preview and the program list") and
// VS Code's (2f; project-docs/modules/66-phase-2f-plan.md; docs/projects.md
// "The preview in VS Code"). Beside the zoom controls, it names the program
// the preview shows. Its list, which opens upward, holds each program with
// its miniature, name and path, a check on the one shown, and Open in the
// editor. It's the one way to change what the preview shows.
//
// Registered by the pan-zoom bundle (window.PathogenPanZoom), as
// <pathogen-zoom-pill> is, so the playground and the VS Code webview load the
// one element. Its colours take the playground's tokens first and VS Code's
// second (the pill's rule), so it needs no styling from the page.
//
// A view only: the page gives it
//   items       the rows (ProgramChipItem)
//   shown       the program the preview shows
//   editing     the file in the editor, which the dot's title names
//   alert       the red dot's title, or null for none
//   badgeTitle  what hovering the `main` badge says
// and acts on what it asks for:
//   show-program { path }                     a row chosen
//   open-file    { path, focusEditor: true }  its Open in the editor
//   program-list-open / program-list-close    the list opened or closed
//
// The `popover-only` attribute keeps the list a popover at any width. Without
// it, below 800 px the list is a sheet from the foot of the screen (the
// playground's rule for phones, 2d step 9b); a VS Code panel is often that
// narrow and is no phone.
//
// From the keyboard: Enter, Space, Up or Down on the chip opens the list on the
// program shown; Up and Down move, Home and End; Right reaches the row's Open
// in the editor and Left comes back; Enter chooses; Escape closes, back to the chip.
//
// CLI-safety: the Node CLI imports the pan-zoom bundle, so nothing here may
// touch DOM globals at module top level. The element class is defined inside
// registerProgramChip(), which does nothing outside a browser.

import { ZOOM_PILL_HEIGHT } from './zoom-pill';

/** One program in the chip's list. */
export interface ProgramChipItem {
  path: string;
  /** The file's name without `.pathogen`, and its folder when two programs share the name (the tabs' rule). */
  name: string;
  hint: string | null;
  /** The `main` badge: on a main that isn't main.pathogen. */
  badge: boolean;
  /** Why it doesn't draw, as its row says it; null when it does. */
  error: string | null;
  /** The dot: it's the file you're editing ('self'), or it uses it ('import'). */
  uses: 'self' | 'import' | null;
  /** Its miniature is being redrawn after an edit. */
  updating: boolean;
  /** Its miniature's URL; null for a blank tile. */
  miniature: string | null;
  /** Why its tile is blank, on hover; none otherwise. */
  tileNote?: string | null;
  /** Said after its path, such as "not in pathogen.json" (VS Code); none otherwise. */
  note?: string | null;
}

export interface ProgramChipElement extends HTMLElement {
  items: ProgramChipItem[];
  shown: string | null;
  editing: string | null;
  alert: string | null;
  badgeTitle: string;
  readonly isOpen: boolean;
  /** Close the list; `toChip` puts the keyboard back on the chip. */
  close: (toChip?: boolean) => void;
}

declare global {
  interface HTMLElementTagNameMap {
    'program-chip': ProgramChipElement;
  }
}

/** The `main` badge's title unless the page gives its own. */
export const DEFAULT_BADGE_TITLE = 'The main: first in pathogen.json’s entryPoints';

/** The list's height when the preview leaves room for it; it scrolls past that. */
const LIST_MAX = 460;
/** Room kept between the list and the preview's edges. */
const EDGE = 8;
/** How far above the chip's bottom the list starts (its `bottom` in STYLES): the chip's height and an 8 px gap. */
const LIST_BOTTOM = ZOOM_PILL_HEIGHT + 8;
/** Below this width the list is a sheet, unless `popover-only`. */
const NARROW_QUERY = '(max-width: 800px)';

const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** The playground's file icons (playground/utils/file-icons.ts) the chip draws. */
const ICONS = {
  /** Open in the editor. */
  code: icon('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  /** The chip's caret: its list opens upward. */
  chevronUp: icon('<path d="m6 15 6-6 6 6"/>'),
  /** The check on the program shown. */
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const nameHtml = (item: { name: string; hint: string | null }): string =>
  `${esc(item.name)}${item.hint !== null ? ` <span class="hint">· ${esc(item.hint)}</span>` : ''}`;

// The chip and its list, as mockup v6 screen G draws them (.pick and .prow).
// Theming: playground token → VS Code webview token → literal (the playground's
// light values). Without any --vscode-* variable, the playground looks as it did.
const STYLES = `
:host {
  --pc-bg: var(--bg-elevated, var(--vscode-editorWidget-background, #fff));
  --pc-border: var(--border-color, var(--vscode-panel-border, #e2e8f0));
  --pc-border-strong: var(--border-strong, var(--vscode-input-border, #cbd5e1));
  --pc-text: var(--text-primary, var(--vscode-foreground, #1a1a2e));
  --pc-text-2: var(--text-secondary, var(--vscode-foreground, #64748b));
  --pc-text-3: var(--text-tertiary, var(--vscode-descriptionForeground, #9087a0));
  --pc-accent: var(--secondary-accent, var(--vscode-focusBorder, #9461c4));
  --pc-accent-subtle: var(
    --secondary-accent-subtle,
    color-mix(in srgb, var(--vscode-focusBorder, rgb(148, 97, 196)) 18%, transparent)
  );
  --pc-accent-text: var(--secondary-accent-text, var(--vscode-focusBorder, #5e3590));
  --pc-error: var(--error-color, var(--vscode-errorForeground, #dc2626));
  --pc-error-text: var(--error-text, var(--vscode-errorForeground, #b91c1c));
  --pc-subtle-bg: var(--bg-tertiary, var(--vscode-list-hoverBackground, rgba(0, 0, 0, 0.04)));
  /* A tile is a small canvas: the playground's tile colour, else the VS Code preview's white canvas (2f mockup v1). */
  --pc-tile-bg: var(--bg-tertiary, #fff);
  --pc-inverse: var(--text-inverse, #fff);
  --pc-mono: var(--font-mono, var(--vscode-editor-font-family, monospace));
  --pc-sans: var(--font-sans, var(--vscode-font-family, system-ui, sans-serif));
  --pc-shadow-sm: var(--shadow-sm, 0 1px 2px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.06)));
  --pc-shadow-xl: var(--shadow-xl, 0 12px 32px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.18)));

  position: relative;
  display: inline-block;
  max-width: 100%;
  font-family: var(--pc-sans);
}

:host([hidden]) {
  display: none;
}

.pick {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  /* The zoom controls' height, so the two sit level at every state (the owner's request, 2026-11-23). */
  height: ${ZOOM_PILL_HEIGHT}px;
  /* A narrow preview shortens the name (it ellipsizes) before the pill and the chip overflow. */
  max-width: min(240px, 100%);
  padding: 0 9px 0 13px;
  border-radius: 999px;
  border: 1px solid var(--pc-border);
  background: var(--pc-bg);
  box-shadow: var(--pc-shadow-sm);
  cursor: pointer;
  font-family: var(--pc-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--pc-text);
  white-space: nowrap;
}

.pick .name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.pick:hover {
  border-color: var(--pc-border-strong);
}

/* Open, and focused from the keyboard: the rings are drawn inside, so the chip never stands taller than the zoom controls. */
.pick[aria-expanded='true'] {
  border-color: var(--pc-accent);
  box-shadow: inset 0 0 0 3px var(--pc-accent-subtle);
}

.pick:focus-visible {
  outline: 2px solid var(--pc-accent);
  outline-offset: -2px;
}

.caret {
  display: grid;
  place-items: center;
  color: var(--pc-text-3);
}

.caret svg {
  width: 12px;
  height: 12px;
}

.pick-err {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pc-error);
  box-shadow: 0 0 0 2px var(--pc-bg);
}

.hint {
  color: var(--pc-text-3);
  font-weight: 400;
}

/* The list, opened upward. */
.list {
  position: absolute;
  bottom: ${LIST_BOTTOM}px;
  right: 0;
  z-index: 40;
  width: 292px;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  padding: 6px;
  border: 1px solid var(--pc-border);
  border-radius: 12px;
  background: var(--pc-bg);
  box-shadow: var(--pc-shadow-xl);
}

.list[hidden] {
  display: none;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pc-text-3);
}

.head .cnt {
  font-family: var(--pc-mono);
  letter-spacing: 0;
  font-weight: 500;
}

.rows {
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
}

.prow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border-radius: 8px;
}

.prow:hover {
  background: var(--pc-subtle-bg);
}

.prow.on {
  background: var(--pc-accent-subtle);
}

/* The row itself: shows its program. */
.show {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 5px 6px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.show:focus-visible {
  outline: 2px solid var(--pc-accent);
  outline-offset: -2px;
}

.tile {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 64px;
  height: 40px;
  padding: 3px;
  border: 1px solid var(--pc-border);
  border-radius: 6px;
  background: var(--pc-tile-bg);
}

.prow.on .tile {
  border-color: var(--pc-accent);
}

.tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.prow.upd .tile img,
.prow.err .tile img {
  opacity: 0.5;
}

.prow.err .tile img {
  filter: grayscale(0.6);
}

.t {
  display: block;
  min-width: 0;
}

.n {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  font-family: var(--pc-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--pc-text);
  white-space: nowrap;
}

.nm {
  overflow: hidden;
  text-overflow: ellipsis;
}

.p {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  font-family: var(--pc-mono);
  font-size: 11px;
  color: var(--pc-text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* A note after the path, in words rather than code: "not in pathogen.json". */
.p .note {
  font-family: var(--pc-sans);
}

.e {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--pc-error-text);
}

.badge {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--pc-accent-subtle);
  color: var(--pc-accent-text);
  font-family: var(--pc-sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 15px;
}

.prow.on .badge {
  background: var(--pc-bg);
}

/* The dot: it uses the file you're editing. */
.udot {
  flex: none;
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pc-accent);
}

/* Its miniature is being redrawn. */
.spin {
  position: absolute;
  top: 4px;
  right: 4px;
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border: 2px solid var(--pc-border-strong);
  border-top-color: var(--pc-accent);
  border-radius: 50%;
  background: var(--pc-bg);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2.4s;
  }
}

.mbad {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--pc-error);
  box-shadow: 0 0 0 2px var(--pc-bg);
  color: var(--pc-inverse);
  font-family: var(--pc-sans);
  font-size: 10px;
  font-weight: 700;
}

.r {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.chk {
  display: grid;
  place-items: center;
  color: var(--pc-accent);
}

.chk svg {
  width: 16px;
  height: 16px;
}

/* Open in the editor: on hover or keyboard focus, and always without hover (a phone). */
.open {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--pc-border);
  border-radius: 6px;
  background: var(--pc-bg);
  color: var(--pc-text-2);
  cursor: pointer;
  visibility: hidden;
}

.open svg {
  width: 14px;
  height: 14px;
}

.prow:hover .open,
.prow:focus-within .open {
  visibility: visible;
}

@media (hover: none) {
  .open {
    visibility: visible;
  }
}

/* ---------- Below 800 px: the list is a sheet from the foot of the screen (2d, step 9b; v7 screen M, state 3) ---------- */

.scrim {
  display: none;
}

@media (max-width: 800px) {
  :host(:not([popover-only])) .open {
    visibility: visible;
  }

  :host(:not([popover-only])) .scrim:not([hidden]) {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 99;
    background: var(--scrim, rgba(20, 16, 28, 0.42));
  }

  /* The list's own sizing (_fit) is for a popover in the preview: the sheet sets its own. */
  :host(:not([popover-only])) .list {
    position: fixed;
    top: auto;
    right: 0 !important;
    bottom: 0;
    left: 0;
    z-index: 100;
    width: auto;
    max-height: 72vh !important;
    padding: 18px 10px calc(10px + env(safe-area-inset-bottom, 0px));
    border-width: 1px 0 0;
    border-radius: 16px 16px 0 0;
  }

  /* The sheet's handle. */
  :host(:not([popover-only])) .list::before {
    content: '';
    position: absolute;
    top: 7px;
    left: 50%;
    width: 36px;
    height: 4px;
    margin-left: -18px;
    border-radius: 2px;
    background: var(--pc-border-strong);
  }

  :host(:not([popover-only])) .prow {
    min-height: 56px;
  }

  :host(:not([popover-only])) .open {
    width: 34px;
    height: 34px;
    margin-right: 6px;
  }
}

.open:hover {
  border-color: var(--pc-border-strong);
  color: var(--pc-text);
}

.open:focus-visible {
  outline: 2px solid var(--pc-accent);
  outline-offset: 1px;
}
`;

const MARKUP = `
  <div class="scrim" aria-hidden="true" hidden></div>
  <div class="list" id="list" role="group" aria-label="Programs" hidden>
    <div class="head"><span>Programs</span><span class="cnt"></span></div>
    <div class="rows"></div>
  </div>
  <button class="pick" type="button" aria-expanded="false" aria-controls="list"><span class="name"></span><span class="caret">${ICONS.chevronUp}</span></button>`;

export function registerProgramChip(): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  if (customElements.get('program-chip')) return;

  /** Below 800 px: a phone, or a narrow window. Without matchMedia (jsdom), a wide screen. */
  const narrow = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;

  class ProgramChip extends HTMLElement implements ProgramChipElement {
    private _items: ProgramChipItem[] = [];

    private _shown: string | null = null;

    private _editing: string | null = null;

    private _alert: string | null = null;

    private _badgeTitle = DEFAULT_BADGE_TITLE;

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

    /**
     * The window resized: the list was sized for the preview as it was. Below 800 px it's a
     * sheet at the screen's foot and stays (a phone resizes as its address bar hides; step 9b).
     */
    private readonly _onResize = (): void => {
      if (this.hasAttribute('popover-only') || !narrow()) this.close();
    };

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      // adoptedStyleSheets sidesteps style-src CSP on inline <style> in
      // locked-down hosts; fall back for engines without constructable stylesheets.
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(STYLES);
        root.adoptedStyleSheets = [sheet];
      } catch {
        const style = document.createElement('style');
        style.textContent = STYLES;
        root.appendChild(style);
      }
      // After the fallback <style>, if there is one.
      const holder = document.createElement('div');
      holder.innerHTML = MARKUP;
      root.append(...holder.childNodes);
      const pick = this._pick!;
      // A click from the keyboard (Enter or Space) has no pointer: detail 0.
      pick.addEventListener('click', (e) => (this._open ? this.close() : this._openList(e.detail === 0)));
      pick.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        this._openList(true);
      });
      // Below 800 px the list is a sheet over a dimmed screen (step 9b): a tap on the dimming closes it.
      root.querySelector('.scrim')!.addEventListener('click', () => this.close(true));
      const list = this._list!;
      list.addEventListener('click', (e) => this._onListClick(e));
      list.addEventListener('keydown', (e) => this._onListKeydown(e));
      // Tab out of it closes it.
      root.addEventListener('focusout', (e) => {
        const to = (e as FocusEvent).relatedTarget as Node | null;
        if (this._open && to !== null && to !== this && !root.contains(to)) this.close();
      });
    }

    connectedCallback(): void {
      this._drawn = '';
      this._draw();
    }

    disconnectedCallback(): void {
      this.close();
    }

    get items(): ProgramChipItem[] {
      return this._items;
    }

    set items(items: ProgramChipItem[]) {
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

    get badgeTitle(): string {
      return this._badgeTitle;
    }

    set badgeTitle(title: string) {
      this._badgeTitle = title;
      this._draw();
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
        this.shadowRoot!.querySelector<HTMLElement>('.scrim')!.hidden = true;
        this._pick?.setAttribute('aria-expanded', 'false');
        // The preview lowers the group it sits in again (it raised it for the sheet; step 9b).
        this.dispatchEvent(new CustomEvent('program-list-close', { bubbles: true, composed: true }));
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
      const key = JSON.stringify([this._items, this._shown, this._editing, this._badgeTitle]);
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

    private _rowHtml(item: ProgramChipItem): string {
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
      const badge = item.badge ? `<span class="badge" title="${esc(this._badgeTitle)}">main</span>` : '';
      const img = item.miniature !== null ? `<img src="${esc(item.miniature)}" alt="">` : '';
      const spin = item.updating ? '<span class="spin" role="img" aria-label="Updating" title="Updating"></span>' : '';
      const bad = item.error !== null ? '<span class="mbad" aria-hidden="true">!</span>' : '';
      const note = item.note ? ` <span class="note">· ${esc(item.note)}</span>` : '';
      // "line 9" stays together when an error wraps (step 5b's "Error in … line N").
      const sub =
        item.error !== null
          ? `<span class="e">${esc(item.error).replace(/ (\d+)$/, '&nbsp;$1')}</span>`
          : `<span class="p">${esc(item.path)}${note}</span>`;
      const openLabel = `Open ${esc(item.path)} in the editor`;
      const check = on ? `<span class="chk" role="img" aria-label="Shown" title="Shown">${ICONS.check}</span>` : '';
      return `<div class="${classes}" data-path="${esc(item.path)}">
      <button class="show" type="button" tabindex="-1"${on ? ' aria-current="true"' : ''}><span class="tile"${item.tileNote ? ` title="${esc(item.tileNote)}"` : ''}>${img}${spin}${bad}</span><span class="t"><span class="n">${dot}<span class="nm">${nameHtml(item)}</span>${badge}</span>${sub}</span></button>
      <span class="r"><button class="open" type="button" tabindex="-1" title="${openLabel}" aria-label="${openLabel}">${ICONS.code}</button>${check}</span>
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
        // Shown below 800 px only, and not when popover-only (STYLES); above, the list is a popover.
        this.shadowRoot!.querySelector<HTMLElement>('.scrim')!.hidden = false;
        this._pick!.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', this._onOutside, true);
        document.addEventListener('keydown', this._onEscape, true);
        window.addEventListener('resize', this._onResize);
        this._fit();
        // The miniatures are drawn only while the list is open (step 5b).
        this.dispatchEvent(new CustomEvent('program-list-open', { bubbles: true, composed: true }));
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
}
