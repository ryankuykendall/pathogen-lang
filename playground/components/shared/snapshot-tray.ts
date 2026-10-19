// <snapshot-tray> — fullscreen-preview tray of the snapshots taken this visit
// (docs/snapshots.md "Taking a snapshot"; mockup v3 screen 2). Shows the five
// newest as small cards plus "All n →", which opens the workspace's snapshots
// page. Hidden while empty.
//
// Properties: items ({ id, n, cardUrl }[], newest first), total (number | null).
// Events: snapshot-tray-open-all (bubbles + composed).

import { escapeHtml } from '../../utils/html-escape.js';

export interface SnapshotTrayItem {
  id: string;
  n: number;
  cardUrl: string;
}

const MAX_ITEMS = 5;

const styles = `
  :host { display: none; }
  :host([has-items]) { display: block; }
  .rail {
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: var(--bg-elevated, #ffffff);
    border: 1px solid var(--border-color, rgba(28, 23, 34, 0.1));
    border-radius: var(--radius-md, 10px);
    box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(28, 23, 34, 0.08));
    animation: rise 0.2s ease;
  }
  @keyframes rise { from { transform: translateY(6px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .rail { animation: none; } }
  .card {
    width: 40px;
    height: 40px;
    border-radius: 5px;
    border: 1px solid var(--border-subtle, rgba(28, 23, 34, 0.06));
    background: var(--bg-elevated, #ffffff) center / contain no-repeat;
  }
  .card.new { outline: 2px solid var(--text-secondary, #5a4f6a); outline-offset: 1px; }
  .all {
    background: none;
    border: none;
    font: inherit;
    font-family: var(--font-body, var(--font-sans, system-ui, sans-serif));
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary, #1c1722);
    padding: 0 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .all:hover { text-decoration: underline; }
`;

export class SnapshotTray extends HTMLElement {
  private _items: SnapshotTrayItem[] = [];

  private _total: number | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._render();
  }

  set items(items: SnapshotTrayItem[]) {
    this._items = items;
    this._render();
  }

  get items(): SnapshotTrayItem[] {
    return this._items;
  }

  set total(total: number | null) {
    this._total = total;
    this._render();
  }

  private _render(): void {
    this.toggleAttribute('has-items', this._items.length > 0);
    const shown = this._items.slice(0, MAX_ITEMS);
    const all = this._total ?? this._items.length;
    this.shadowRoot!.innerHTML = `<style>${styles}</style>
      <div class="rail" role="group" aria-label="Recent snapshots">
        ${shown
          .map(
            (item, i) =>
              `<span class="card${i === 0 ? ' new' : ''}" title="Snapshot #${item.n}" style="background-image:url(&quot;${escapeHtml(item.cardUrl)}&quot;)"></span>`,
          )
          .join('')}
        <button class="all" type="button">All ${all} →</button>
      </div>`;
    this.shadowRoot!.querySelector('.all')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('snapshot-tray-open-all', { bubbles: true, composed: true }));
    });
  }
}

customElements.define('snapshot-tray', SnapshotTray);
