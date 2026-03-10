// Expandable log entry component for console output

import type { LogEntry as LogEntryData, LogPart } from '../../types/compiler.js';

export class LogEntry extends HTMLElement {
  private _data: LogEntryData | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
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

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 8px 0;
          border-bottom: 1px solid #333;
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
