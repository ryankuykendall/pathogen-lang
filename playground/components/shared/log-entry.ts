// Expandable log entry component for console output

import type { LogEntry as LogEntryData, LogGroup, LogPart } from '../../types/compiler.js';

/**
 * Fallback for `window.PathogenLang.WARNING_GROUP_INSTANCE_LIMIT` when the
 * library global is absent (storybook, tests); a test pins the two equal.
 */
export const INSTANCE_LIMIT_FALLBACK = 200;

export class LogEntry extends HTMLElement {
  private _data: LogEntryData | null;
  /** Set when this row stands for a family of warning mirrors (count > 1). */
  private _group: LogGroup | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._group = null;
    this.shadowRoot!.addEventListener('click', (e: Event) => this.handleToggle(e));
  }

  connectedCallback(): void {
    this.render();
  }

  set data(logEntry: LogEntryData | null) {
    this._data = logEntry;
    this.render();
  }

  get data(): LogEntryData | null {
    return this._data;
  }

  set group(group: LogGroup | null) {
    this._group = group && group.count > 1 ? group : null;
    this.render();
  }

  get group(): LogGroup | null {
    return this._group;
  }

  /** Message text of a warning mirror without its `[warn] ` prefix. */
  private instanceText(entry: LogEntryData): string {
    return entry.parts
      .map((p) => p.value)
      .join(' ')
      .replace(/^\[warn\]\s*/, '');
  }

  /** Show/hide the family's instances, rendering them (capped) on first open. */
  toggleInstances(): void {
    const root = this.shadowRoot!;
    const list = root.querySelector('.instances') as HTMLElement | null;
    const button = root.querySelector('.count') as HTMLElement | null;
    if (!list || !button || !this._group) return;
    if (list.hidden && list.childElementCount === 0) {
      const limit = window.PathogenLang?.WARNING_GROUP_INSTANCE_LIMIT ?? INSTANCE_LIMIT_FALLBACK;
      const shown = this._group.instances.slice(0, limit);
      let html = shown.map((e) => `<div class="instance">${this.escapeHtml(this.instanceText(e))}</div>`).join('');
      const rest = this._group.instances.length - shown.length;
      if (rest > 0) html += `<div class="more">… ${rest.toLocaleString('en-US')} more</div>`;
      list.innerHTML = html;
    }
    list.hidden = !list.hidden;
    button.classList.toggle('expanded', !list.hidden);
    button.setAttribute('aria-expanded', String(!list.hidden));
  }

  // Escape HTML for safe display
  escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Truncate string for previews
  truncate(str: string, len: number = 30): string {
    if (str.length <= len) return str;
    return `${str.slice(0, len)}...`;
  }

  // Generate preview for collapsed objects/arrays
  generatePreview(value: unknown, type: string): string {
    if (type === 'array') {
      const arr = value as unknown[];
      const len = arr.length;
      if (len === 0) return '[]';
      if (len <= 3) {
        const items = arr.slice(0, 3).map((v) => {
          if (v === null) return 'null';
          if (typeof v === 'object') return Array.isArray(v) ? `Array(${v.length})` : '{...}';
          if (typeof v === 'string') return `"${this.truncate(v, 15)}"`;
          return String(v);
        });
        return `[${items.join(', ')}]`;
      }
      return `Array(${len})`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) {
      const items = keys.slice(0, 3).map((k) => {
        const v = obj[k];
        if (v === null) return `${k}: null`;
        if (typeof v === 'object') return `${k}: ${Array.isArray(v) ? `Array(${v.length})` : '{...}'}`;
        if (typeof v === 'string') return `${k}: "${this.truncate(v, 10)}"`;
        return `${k}: ${v}`;
      });
      const suffix = keys.length > 3 ? ', ...' : '';
      return `{${items.join(', ')}${suffix}}`;
    }
    const preview = keys
      .slice(0, 2)
      .map((k) => `${k}: ...`)
      .join(', ');
    return `{${preview}, ...}`;
  }

  // Create span for primitive values
  createPrimitiveHTML(value: unknown): string {
    if (value === null) {
      return `<span class="primitive-null">null</span>`;
    }
    if (value === undefined) {
      return `<span class="primitive-undefined">undefined</span>`;
    }
    if (typeof value === 'number') {
      return `<span class="primitive-number">${value}</span>`;
    }
    if (typeof value === 'boolean') {
      return `<span class="primitive-boolean">${value}</span>`;
    }
    if (typeof value === 'string') {
      return `<span class="primitive-string">${this.escapeHtml(value)}</span>`;
    }
    return this.escapeHtml(String(value));
  }

  // Render value recursively
  renderValue(value: unknown, depth: number = 0, path: string = ''): string {
    if (value === null || value === undefined || typeof value !== 'object') {
      return this.createPrimitiveHTML(value);
    }

    const type = Array.isArray(value) ? 'array' : 'object';
    const preview = this.generatePreview(value, type);
    const id = `expand-${path.replace(/\./g, '-')}-${depth}`;

    const entries: [string | number, unknown][] = type === 'array' ? (value as unknown[]).map((v, i) => [i, v]) : Object.entries(value);

    const maxItems = 100;
    const displayEntries = entries.slice(0, maxItems);

    let childrenHTML = '';
    for (const [key, val] of displayEntries) {
      const childPath = path ? `${path}.${key}` : String(key);
      const keyClass = type === 'array' ? 'index' : 'key';
      childrenHTML += `
        <div class="property">
          <span class="${keyClass}">${key}: </span>${this.renderValue(val, depth + 1, childPath)}
        </div>
      `;
    }

    if (entries.length > maxItems) {
      childrenHTML += `<div class="more">... ${entries.length - maxItems} more</div>`;
    }

    return `
      <span class="expandable" data-path="${path}">
        <span class="toggle" data-id="${id}">&#x25b6;</span>
        <span class="preview">${this.escapeHtml(preview)}</span>
        <div class="content">${childrenHTML}</div>
      </span>
    `;
  }

  handleToggle(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.closest('.count')) {
      this.toggleInstances();
      return;
    }
    const toggle = target.closest('.toggle');
    if (!toggle) return;

    const expandable = toggle.parentElement;
    expandable?.classList.toggle('expanded');
  }

  render(): void {
    if (!this._data) {
      this.shadowRoot!.innerHTML = '';
      return;
    }

    const logEntry = this._data;
    let partsHTML = '';

    const isWarn = logEntry.severity === 'warn';
    this.classList.toggle('warn', isWarn);
    if (isWarn) partsHTML += `<span class="chip" title="Compiler warning">warn</span>`;
    const group = isWarn ? this._group : null;
    if (group) {
      const count = group.count.toLocaleString('en-US');
      const where = logEntry.line !== null ? ' from this line' : '';
      const label = `${count} warnings of this kind${where} — click to list them`;
      partsHTML += `<button type="button" class="count" aria-expanded="false" aria-label="${label}" title="${label}">×${count}</button>`;
    }

    // Add line prefix if present
    if (logEntry.line !== null) {
      partsHTML += `<span class="line">Line ${logEntry.line}:</span>`;
    }

    // Process each part
    for (const part of logEntry.parts) {
      if (part.type === 'string') {
        partsHTML += `<span class="string">${this.escapeHtml(part.value)}</span>`;
      } else {
        let valueHTML = '';
        const trimmed = part.value.trim();

        // Try to parse JSON for interactive rendering
        let parsed: unknown = null;
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            parsed = JSON.parse(trimmed);
          } catch (e) {
            // Not valid JSON
          }
        }

        if (parsed !== null && typeof parsed === 'object') {
          valueHTML = this.renderValue(parsed, 0, part.label || '');
        } else {
          valueHTML = `<span class="value">${this.escapeHtml(part.value)}</span>`;
        }

        partsHTML += `
          <div class="labeled-value">
            ${part.label ? `<span class="label">${this.escapeHtml(part.label)} = </span>` : ''}
            ${valueHTML}
          </div>
        `;
      }
    }

    if (group) partsHTML += `<div class="instances" hidden></div>`;

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 8px 0;
          border-bottom: 1px solid #333;
        }
        :host(.warn) {
          background: rgba(250, 204, 21, 0.08);
        }
        .count {
          display: inline-block;
          margin-right: 6px;
          padding: 0 6px;
          border: 1px solid #b45309;
          border-radius: 3px;
          background: transparent;
          color: #fbbf24;
          font: inherit;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.6;
          cursor: pointer;
          vertical-align: middle;
        }
        .count:hover,
        .count.expanded {
          background: rgba(180, 83, 9, 0.35);
        }
        .instances {
          margin: 6px 0 0 16px;
          padding-left: 8px;
          border-left: 1px solid #444;
        }
        .instance {
          color: #d4c58a;
          padding: 1px 0;
          font-size: 0.85em;
        }
        .chip {
          display: inline-block;
          margin-right: 6px;
          padding: 0 6px;
          border-radius: 3px;
          background: #b45309;
          color: #fff7ed;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          vertical-align: middle;
        }

        :host(:last-child) {
          border-bottom: none;
        }

        .line {
          color: #569cd6;
          font-weight: 500;
          display: block;
          margin-bottom: 4px;
          font-size: 0.7rem;
        }

        .string {
          color: #ce9178;
          margin-right: 8px;
        }

        .labeled-value {
          margin: 4px 0;
        }

        .label {
          color: #9cdcfe;
        }

        .value {
          color: #b5cea8;
        }

        /* Expandable object styles */
        .expandable {
          display: inline;
        }

        .toggle {
          cursor: pointer;
          display: inline-block;
          width: 12px;
          color: #888;
          user-select: none;
          transition: transform 0.1s;
        }

        .expandable.expanded > .toggle {
          transform: rotate(90deg);
        }

        .preview {
          color: #9cdcfe;
        }

        .content {
          display: none;
          margin-left: 16px;
          padding-left: 8px;
          border-left: 1px solid #444;
        }

        .expandable.expanded > .content {
          display: block;
        }

        .property {
          display: block;
          padding: 1px 0;
        }

        .key {
          color: #9cdcfe;
        }

        .index {
          color: #b5cea8;
        }

        .primitive-null,
        .primitive-undefined {
          color: #569cd6;
          font-style: italic;
        }

        .primitive-number {
          color: #b5cea8;
        }

        .primitive-string {
          color: #ce9178;
        }

        .primitive-string::before,
        .primitive-string::after {
          content: '"';
          color: #ce9178;
        }

        .primitive-boolean {
          color: #569cd6;
        }

        .more {
          color: #666;
          font-style: italic;
          padding: 2px 0;
        }
      </style>
      <div class="entry">${partsHTML}</div>
    `;
  }
}

customElements.define('log-entry', LogEntry);
