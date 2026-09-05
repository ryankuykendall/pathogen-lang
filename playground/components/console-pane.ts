// Console pane component for log output

import type { LogEntry as LogEntryData, LogGroup, LogRow } from '../types/compiler.js';
import './shared/log-entry.js';
import styles from './console-pane.css';

export class ConsolePane extends HTMLElement {
  private _logs: LogEntryData[];
  private _isOpen: boolean;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._logs = [];
    this._isOpen = false;
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  setupEventListeners(): void {
    (this.shadowRoot!.querySelector('#clear-btn') as HTMLButtonElement).addEventListener('click', () => {
      this.clear();
    });
  }

  get logs(): LogEntryData[] {
    return this._logs;
  }

  set logs(value: LogEntryData[]) {
    this._logs = value || [];
    this.updateContent();
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(): void {
    this._isOpen = true;
    this.classList.add('open');
    this.updateContent();
    this.dispatchEvent(new CustomEvent('open'));
  }

  close(): void {
    this._isOpen = false;
    this.classList.remove('open');
    this.dispatchEvent(new CustomEvent('close'));
  }

  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  clear(): void {
    this._logs = [];
    this.updateContent();
    this.dispatchEvent(new CustomEvent('clear'));
  }

  updateContent(): void {
    if (!this._isOpen) return;

    const output = this.shadowRoot!.querySelector('#output') as HTMLElement | null;
    if (!output) return;

    output.innerHTML = '';

    if (this._logs.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty';
      emptyDiv.textContent = 'No log output';
      output.appendChild(emptyDiv);
    } else {
      // Warning mirrors collapse to one row per family (line + message with its
      // numbers removed) through the library; without it (storybook, tests)
      // every entry is its own row.
      const groupRows = window.PathogenLang?.groupWarnLogEntries;
      const rows: LogRow[] = groupRows ? groupRows(this._logs) : this._logs.map((entry) => ({ kind: 'entry', entry }));
      for (const row of rows) {
        const entry = document.createElement('log-entry') as HTMLElement & {
          data: LogEntryData;
          group: LogGroup | null;
        };
        if (row.kind === 'group') {
          entry.data = row.first;
          entry.group = row.count > 1 ? { count: row.count, instances: row.instances } : null;
        } else {
          entry.data = row.entry;
        }
        output.appendChild(entry);
      }
    }
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="header">
        <span>Console</span>
        <button id="clear-btn" class="clear-btn">Clear</button>
      </div>
      <div id="output">
        <div class="empty">No log output</div>
      </div>
    `;
  }
}

customElements.define('console-pane', ConsolePane);
