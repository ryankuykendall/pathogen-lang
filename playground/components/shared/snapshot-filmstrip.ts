// <snapshot-filmstrip> — the row of snapshot frames along the bottom of the
// snapshots page (docs/snapshots.md "The snapshots page"; mockup v3 screen 3).
// Frames are grouped by day; the current frame is outlined; a ✎ badge marks
// snapshots that have a note. Sorting (Newest / Oldest / With notes) is part
// of the strip so it stays in sync with what's shown.
//
// Properties:
//   snapshots — { id, n, note, createdAt }[] (any order; the strip sorts)
//   cardUrls  — Map<id, objectURL> (cards load lazily; frames without one
//               show a placeholder until it arrives)
//   currentId — id of the selected snapshot
//   sort      — 'newest' | 'oldest' | 'notes'
// Methods: orderedIds() — ids in display order (for ←/→ stepping).
// Events (bubbles + composed): snapshot-select { id }, snapshot-sort-change { sort }

export interface FilmstripSnapshot {
  id: string;
  n: number;
  note: string;
  createdAt: string;
}

export type FilmstripSort = 'newest' | 'oldest' | 'notes';

const styles = `
  :host {
    display: block;
    font-family: var(--font-body, var(--font-sans, system-ui, sans-serif));
    color: var(--text-secondary, #5a4f6a);
  }
  .head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .head b { color: var(--text-primary, #1c1722); }
  kbd { font-family: var(--font-mono, monospace); font-size: 11px; border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18)); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--bg-elevated, #ffffff); }
  .seg { display: inline-grid; grid-auto-flow: column; border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18)); border-radius: var(--radius-sm, 6px); overflow: hidden; }
  .seg button { border: none; background: var(--bg-elevated, #ffffff); color: var(--text-secondary, #5a4f6a); padding: 3px 9px; font: inherit; font-size: 11px; cursor: pointer; }
  .seg button[aria-pressed='true'] { background: var(--text-primary, #1c1722); color: var(--bg-primary, #f7f0e3); }
  .row { display: grid; grid-auto-flow: column; grid-auto-columns: max-content; gap: 8px; overflow-x: auto; padding: 3px 3px 6px; scroll-behavior: smooth; }
  .day {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-tertiary, #9087a0);
    font-weight: 600;
    border-left: 1px solid var(--border-subtle, rgba(28, 23, 34, 0.06));
    padding: 0 4px 0 6px;
    text-align: center;
  }
  .frame { display: block; width: 92px; background: none; border: none; padding: 0; cursor: pointer; font: inherit; text-align: left; color: inherit; }
  .img {
    display: block;
    position: relative;
    width: 92px;
    height: 92px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
    background: var(--bg-elevated, #ffffff) center / contain no-repeat;
    opacity: 0.8;
    transition: transform 0.1s, opacity 0.1s;
  }
  .img.pending { background-color: var(--bg-tertiary, rgba(28, 23, 34, 0.05)); }
  .frame:hover .img, .frame:focus-visible .img { transform: translateY(-2px); opacity: 1; }
  .frame[aria-current='true'] .img { opacity: 1; outline: 2px solid var(--text-primary, #1c1722); outline-offset: 2px; }
  .frame:focus-visible { outline: none; }
  .frame:focus-visible .img { outline: 2px solid var(--focus-ring, rgba(192, 81, 142, 0.4)); outline-offset: 2px; }
  .notedot { position: absolute; top: 4px; right: 4px; width: 17px; height: 17px; border-radius: 50%; background: var(--text-primary, #1c1722); color: var(--bg-elevated, #ffffff); font-size: 10px; display: grid; place-items: center; }
  .meta { font-size: 11px; color: var(--text-tertiary, #9087a0); margin-top: 5px; display: grid; grid-template-columns: auto 1fr; gap: 4px; }
  .meta b { color: var(--text-secondary, #5a4f6a); }
  .meta span { text-align: right; white-space: nowrap; }
  .empty { font-size: 12px; padding: 8px 0; }
  @media (prefers-reduced-motion: reduce) { .img { transition: none; } .row { scroll-behavior: auto; } }
`;

function dayLabel(date: Date, now: Date): string {
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeLabel(date: Date, now: Date): string {
  return dayLabel(date, now) === 'Today' || dayLabel(date, now) === 'Yesterday'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export class SnapshotFilmstrip extends HTMLElement {
  private _snapshots: FilmstripSnapshot[] = [];

  private _cardUrls = new Map<string, string>();

  private _currentId: string | null = null;

  private _sort: FilmstripSort = 'newest';

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._render();
  }

  set snapshots(value: FilmstripSnapshot[]) {
    this._snapshots = value;
    this._render();
  }

  set cardUrls(value: Map<string, string>) {
    this._cardUrls = value;
    this._applyCards();
  }

  set currentId(value: string | null) {
    this._currentId = value;
    this.shadowRoot!.querySelectorAll<HTMLElement>('.frame').forEach((f) => {
      const current = f.dataset.id === value;
      f.setAttribute('aria-current', String(current));
      if (current) f.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  set sort(value: FilmstripSort) {
    this._sort = value;
    this._render();
  }

  get sort(): FilmstripSort {
    return this._sort;
  }

  /** Snapshot ids in display order. */
  orderedIds(): string[] {
    return this._ordered().map((s) => s.id);
  }

  private _ordered(): FilmstripSnapshot[] {
    const list = this._sort === 'notes' ? this._snapshots.filter((s) => s.note) : [...this._snapshots];
    return list.sort((a, b) => (this._sort === 'oldest' ? a.n - b.n : b.n - a.n));
  }

  private _applyCards(): void {
    this.shadowRoot!.querySelectorAll<HTMLElement>('.frame').forEach((f) => {
      const url = this._cardUrls.get(f.dataset.id!);
      const img = f.querySelector<HTMLElement>('.img')!;
      if (url) {
        img.style.backgroundImage = `url("${url}")`;
        img.classList.remove('pending');
      }
    });
  }

  private _render(): void {
    const now = new Date();
    const list = this._ordered();
    let lastDay = '';
    const frames = list
      .map((s) => {
        const date = new Date(s.createdAt);
        const day = dayLabel(date, now);
        const divider = day !== lastDay ? `<span class="day" aria-hidden="true">${day}</span>` : '';
        lastDay = day;
        return `${divider}<button class="frame" type="button" data-id="${s.id}" aria-current="${s.id === this._currentId}" aria-label="Snapshot #${s.n}, ${day}">
            <span class="img pending">${s.note ? '<span class="notedot" title="Has a note">✎</span>' : ''}</span>
            <span class="meta"><b>#${s.n}</b><span>${timeLabel(date, now)}</span></span>
          </button>`;
      })
      .join('');
    const count = this._snapshots.length;
    const pressed = (v: FilmstripSort): string => `aria-pressed="${this._sort === v}"`;
    this.shadowRoot!.innerHTML = `<style>${styles}</style>
      <div class="head">
        <b>${count} snapshot${count === 1 ? '' : 's'}</b>
        <span>${this._sort === 'oldest' ? 'oldest' : 'newest'} first · <kbd>←</kbd> <kbd>→</kbd> to step</span>
        <span class="seg" role="group" aria-label="Sort snapshots">
          <button type="button" data-sort="newest" ${pressed('newest')}>Newest</button>
          <button type="button" data-sort="oldest" ${pressed('oldest')}>Oldest</button>
          <button type="button" data-sort="notes" ${pressed('notes')}>With notes</button>
        </span>
      </div>
      <div class="row">${frames || '<span class="empty">No snapshots have a note yet.</span>'}</div>`;
    this._applyCards();
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('.frame').forEach((f) =>
      f.addEventListener('click', () =>
        this.dispatchEvent(
          new CustomEvent('snapshot-select', { bubbles: true, composed: true, detail: { id: f.dataset.id } }),
        ),
      ),
    );
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        this._sort = b.dataset.sort as FilmstripSort;
        this._render();
        this.dispatchEvent(
          new CustomEvent('snapshot-sort-change', { bubbles: true, composed: true, detail: { sort: this._sort } }),
        );
      }),
    );
    if (this._currentId) this.currentId = this._currentId;
  }
}

customElements.define('snapshot-filmstrip', SnapshotFilmstrip);
