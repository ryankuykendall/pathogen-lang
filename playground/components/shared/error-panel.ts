// The error panel, over the editor's foot. A plain message (show), or a
// compile's errors (showSections; phase 2d, step 7, mockup v6 screen E,
// state 4): each under the name of the file where it happened, then the steps
// that led there from the program. The file's name, "Line N" and each step
// are links: they send `open-file` { path, line, column, focusEditor } for
// workspace-view to open that file at that line. The playground's own note
// (a main that's a module) has its own heading, and its links send
// `error-panel-action` { action }.

/** A step back from where an error happened to the program (services/error-place.ts ErrorStep). */
export interface ErrorPanelStep {
  kind: 'called from' | 'imported from';
  file: string;
  line: number;
}

export interface ErrorPanelError {
  line: number | null;
  column: number | null;
  text: string;
  steps: ErrorPanelStep[];
}

/** Words, and links that ask workspace-view to act. */
export type ErrorPanelNote = (string | { text: string; action: string })[];

export interface ErrorPanelSection {
  /** The file's name, or the playground's own heading ("The main"); '' for none (a scratch link's one file). */
  heading: string;
  /** The file the errors happened in: the heading and the lines open it. Null for the playground's own note. */
  file: string | null;
  errors: ErrorPanelError[];
  note?: ErrorPanelNote;
}

/** A section as text: its heading, then each line under it. */
function sectionText(section: ErrorPanelSection): string {
  const lines = section.heading === '' ? [] : [section.heading];
  for (const error of section.errors) {
    lines.push(error.line === null ? error.text : `Line ${error.line}: ${error.text}`);
    for (const step of error.steps) lines.push(`  ${step.kind} ${step.file} line ${step.line}`);
  }
  if (section.note) lines.push(section.note.map((part) => (typeof part === 'string' ? part : part.text)).join(''));
  return lines.join('\n');
}

export class ErrorPanel extends HTMLElement {
  private _message: string;

  private _count: number;

  private _sections: ErrorPanelSection[] | null = null;

  /** What showSections last drew. */
  private _shownKey = '';

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._message = '';
    this._count = 0;
  }

  static get observedAttributes(): string[] {
    return ['message'];
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
    this.updateContent();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    // Sections aren't reflected to the attribute; only a plain message is.
    if (name === 'message' && this._sections === null) {
      this._message = newValue || '';
      this.updateContent();
    }
  }

  /** The panel's words, as text (the sections' too). */
  get message(): string {
    return this._message;
  }

  set message(value: string) {
    this._sections = null;
    this._shownKey = '';
    this._message = value || '';
    this.setAttribute('message', this._message);
    this.updateContent();
  }

  show(message: string, count?: number): void {
    this._count = count ?? 0;
    this.message = message;
  }

  /** A compile's errors, by file, and the playground's own notes. None hides the panel. */
  showSections(sections: ErrorPanelSection[], count: number): void {
    // The same errors again: nothing redrawn, so a link with the keyboard keeps it.
    const key = JSON.stringify([sections, count]);
    if (key === this._shownKey && this._sections !== null) return;
    this._shownKey = key;
    this._count = count;
    this._sections = sections.length > 0 ? sections : null;
    this.removeAttribute('message');
    this._message = this._sections ? this._sections.map(sectionText).join('\n') : '';
    this.updateContent();
  }

  hide(): void {
    this._count = 0;
    this.message = '';
  }

  updateContent(): void {
    const content = this.shadowRoot!.querySelector('.content');
    const badge = this.shadowRoot!.querySelector('.count-badge') as HTMLElement | null;

    if (content) {
      if (this._sections) content.replaceChildren(...this._sections.map((s) => this._sectionNode(s)));
      else content.textContent = this._message;
    }

    if (badge) {
      if (this._count > 1) {
        badge.textContent = `${this._count} errors`;
        badge.style.display = '';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    }

    this.classList.toggle('visible', this._sections !== null || this._message !== '');
  }

  /** A link that opens `file` at `line` (and `column`). */
  private _link(
    text: string,
    file: string,
    line: number | null,
    column: number | null,
    className = 'link',
  ): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    // "Line 5" alone doesn't say which file: the name read out does.
    button.setAttribute('aria-label', line === null ? `Open ${file}` : `Open ${file} at line ${line}`);
    button.addEventListener('click', () => {
      const detail: { path: string; line?: number; column?: number; focusEditor: boolean } = {
        path: file,
        focusEditor: true,
      };
      if (line !== null) {
        detail.line = line;
        detail.column = column ?? 1;
      }
      this.dispatchEvent(new CustomEvent('open-file', { bubbles: true, composed: true, detail }));
    });
    return button;
  }

  private _sectionNode(section: ErrorPanelSection): HTMLElement {
    const node = document.createElement('div');
    node.className = 'section';
    const first = section.errors.find((e) => e.line !== null) ?? null;
    if (section.heading === '') {
      // No heading: a scratch link's one file.
    } else if (section.file !== null) {
      node.append(this._link(section.heading, section.file, first?.line ?? null, first?.column ?? null, 'link who'));
    } else {
      const heading = document.createElement('span');
      heading.className = 'who';
      heading.textContent = section.heading;
      node.append(heading);
    }
    for (const error of section.errors) {
      const row = document.createElement('div');
      row.className = 'error';
      if (error.line !== null && section.file !== null) {
        row.append(this._link(`Line ${error.line}`, section.file, error.line, error.column), `: ${error.text}`);
      } else {
        row.append(error.text);
      }
      for (const step of error.steps) {
        const line = document.createElement('div');
        line.className = 'step';
        line.append(`${step.kind} `, this._link(`${step.file} line ${step.line}`, step.file, step.line, 1));
        row.append(line);
      }
      node.append(row);
    }
    if (section.note) {
      const note = document.createElement('div');
      note.className = 'note';
      for (const part of section.note) {
        if (typeof part === 'string') {
          note.append(part);
          continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link';
        button.textContent = part.text;
        button.addEventListener('click', () => {
          this.dispatchEvent(
            new CustomEvent('error-panel-action', { bubbles: true, composed: true, detail: { action: part.action } }),
          );
        });
        note.append(button);
      }
      node.append(note);
    }
    return node;
  }

  setupEventListeners(): void {
    this.shadowRoot!.querySelector('.capture-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy-debug-info', { bubbles: true, composed: true }));
    });
  }

  showFeedback(message: string): void {
    const btn = this.shadowRoot!.querySelector('.capture-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = message;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 2000);
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: none;
          position: absolute;
          bottom: var(--footer-height, 52px);
          left: 0;
          width: 50%;
          z-index: 10;
          background: var(--error-bg, #fee);
          color: var(--error-text, #c00);
          padding: 12px 20px;
          font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
          font-size: 0.875rem;
          line-height: 1.4;
          border: 1px solid var(--error-border, #fcc);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15));
          box-sizing: border-box;
        }

        :host(.visible) {
          display: block;
        }

        .wrapper {
          position: relative;
        }

        .content {
          white-space: pre-wrap;
          word-break: break-word;
          max-height: calc(1.4em * 7);
          overflow-y: auto;
          padding-right: 120px;
        }

        /* Mockup v6 screen E: each part under a small heading. */
        .section + .section {
          margin-top: 10px;
        }

        .who {
          display: block;
          margin-bottom: 4px;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 0.72rem;
          font-weight: 600;
          opacity: 0.85;
        }

        .step {
          padding-left: 2ch;
        }

        .link {
          padding: 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          font-weight: 600;
          text-align: left;
          text-decoration: underline;
          text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
          text-underline-offset: 2px;
          cursor: pointer;
        }

        .link:hover {
          text-decoration-color: currentColor;
        }

        .link:focus-visible {
          outline: 2px solid var(--error-text, #c00);
          outline-offset: 1px;
          border-radius: 2px;
        }

        /* The heading reads as a heading; it underlines only under the pointer or the keyboard. */
        .link.who {
          text-decoration: none;
        }

        .link.who:hover,
        .link.who:focus-visible {
          text-decoration: underline;
        }

        .count-badge {
          position: absolute;
          top: 0;
          right: 0;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--error-color, #ef4444);
          color: #fff;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
          line-height: 1.4;
        }

        .capture-btn {
          position: absolute;
          bottom: 0;
          right: 0;
          padding: 4px 10px;
          border: 1px solid var(--error-text, #c00);
          border-radius: var(--radius-sm, 4px);
          background: transparent;
          color: var(--error-text, #c00);
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: background var(--transition-fast, 0.1s ease), color var(--transition-fast, 0.1s ease);
        }

        .capture-btn:hover:not(:disabled) {
          background: var(--error-text, #c00);
          color: #fff;
        }

        .capture-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
      </style>
      <div class="wrapper">
        <div class="content"></div>
        <span class="count-badge" style="display: none"></span>
        <button class="capture-btn" title="Copy debug info to clipboard">Copy Debug Info</button>
      </div>
    `;
  }
}

customElements.define('error-panel', ErrorPanel);
