// Header component with controls, toggles, and save status

import { workspaceApi } from '../services/api.js';
import { store } from '../state/store.js';
import { buildWorkspaceSlugId, navigateTo } from '../utils/router.js';
import { copyURL } from '../utils/url-state.js';

export class PlaygroundHeader extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;

  private _copying = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
    this.subscribeToStore();
  }

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  subscribeToStore(): void {
    this._unsubscribe = store.subscribe(
      ['annotatedOpen', 'consoleOpen', 'saveStatus', 'saveError', 'workspaceId', 'compilationStatus'],
      () => {
        this.updateToggleStates();
        this.updateSaveStatus();
        this.updateCopyButton();
        this.updateCompilationStatus();
      },
    );
  }

  updateToggleStates(): void {
    const annotatedToggle = this.shadowRoot!.querySelector('#annotated-toggle');
    const consoleToggle = this.shadowRoot!.querySelector('#console-toggle');

    if (annotatedToggle) {
      annotatedToggle.classList.toggle('active', store.get('annotatedOpen') as boolean);
    }
    if (consoleToggle) {
      consoleToggle.classList.toggle('active', store.get('consoleOpen') as boolean);
    }
  }

  updateCopyButton(): void {
    const copyBtn = this.shadowRoot!.querySelector('#copy-workspace') as HTMLElement | null;
    if (copyBtn) {
      const workspaceId = store.get('workspaceId') as string | null;
      copyBtn.style.display = workspaceId ? 'inline-block' : 'none';
    }
  }

  copyWorkspace(): void {
    const workspaceId = store.get('workspaceId') as string | null;
    if (!workspaceId) return;
    navigateTo('/workspace/new', { query: { copyFrom: workspaceId } });
  }

  updateSaveStatus(): void {
    const statusEl = this.shadowRoot!.querySelector('#save-status') as HTMLElement | null;
    if (!statusEl) return;

    const status = store.get('saveStatus') as string;
    const error = store.get('saveError') as string | null;
    const workspaceId = store.get('workspaceId') as string | null;

    // Only show status for persisted workspaces
    if (!workspaceId) {
      statusEl.className = 'save-status hidden';
      statusEl.textContent = '';
      return;
    }

    statusEl.className = `save-status ${status}`;

    switch (status) {
      case 'idle':
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
        break;
      case 'modified':
        statusEl.textContent = 'Modified';
        break;
      case 'saving':
        statusEl.textContent = 'Saving...';
        break;
      case 'saved':
        statusEl.textContent = 'Saved';
        break;
      case 'error':
        statusEl.textContent = error ? `Error: ${error}` : 'Save failed';
        statusEl.title = error || 'Save failed';
        break;
      default:
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
  }

  updateCompilationStatus(): void {
    const statusEl = this.shadowRoot!.querySelector('#compilation-status') as HTMLElement | null;
    if (!statusEl) return;

    const status = store.get('compilationStatus') as string;

    statusEl.className = `compilation-status ${status}`;

    switch (status) {
      case 'compiling':
        statusEl.textContent = 'Compiling...';
        statusEl.classList.remove('hidden');
        break;
      case 'completed':
        statusEl.textContent = 'Ready';
        statusEl.classList.remove('hidden');
        // Auto-hide after a brief moment
        setTimeout(() => {
          if (store.get('compilationStatus') === 'completed') {
            statusEl.classList.add('hidden');
          }
        }, 1500);
        break;
      case 'error':
        statusEl.textContent = 'Error';
        statusEl.classList.remove('hidden');
        break;
      case 'idle':
      default:
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
  }

  setupEventListeners(): void {
    // Export file
    this.shadowRoot!.querySelector('#export')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));
    });

    // Copy workspace
    this.shadowRoot!.querySelector('#copy-workspace')?.addEventListener('click', () => {
      this.copyWorkspace();
    });

    // Annotated toggle
    this.shadowRoot!.querySelector('#annotated-toggle')?.addEventListener('click', () => {
      store.set('annotatedOpen', !(store.get('annotatedOpen') as boolean));
      this.dispatchEvent(new CustomEvent('toggle-annotated', { bubbles: true, composed: true }));
    });

    // Console toggle
    this.shadowRoot!.querySelector('#console-toggle')?.addEventListener('click', () => {
      store.set('consoleOpen', !(store.get('consoleOpen') as boolean));
      this.dispatchEvent(new CustomEvent('toggle-console', { bubbles: true, composed: true }));
    });

    // Copy URL
    this.shadowRoot!.querySelector('#copy-url')?.addEventListener('click', async () => {
      await copyURL(store);
      this.showCopyFeedback();
    });
  }

  showCopyFeedback(): void {
    const feedback = this.shadowRoot!.querySelector('#copy-feedback');
    if (feedback) {
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }

  render(): void {
    const workspaceId = store.get('workspaceId') as string | null;

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--bg-secondary, #ffffff);
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          padding: 0.5rem 1rem;
        }

        .header-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .save-status {
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm, 4px);
          transition: all var(--transition-base, 0.15s ease);
          border: 1px solid transparent;
        }

        .save-status.hidden {
          display: none;
        }

        .save-status.modified {
          background: var(--warning-bg, #fffbeb);
          color: var(--warning-color, #f59e0b);
          border-color: var(--warning-border, #fde68a);
        }

        .save-status.saving {
          background: var(--info-bg, #eff6ff);
          color: var(--info-color, #3b82f6);
          border-color: var(--info-border, #bfdbfe);
        }

        .save-status.saved {
          background: var(--success-bg, #ecfdf5);
          color: var(--success-color, #10b981);
          border-color: var(--success-border, #a7f3d0);
        }

        .save-status.error {
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #ef4444);
          border-color: var(--error-border, #fecaca);
          cursor: help;
        }

        .compilation-status {
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm, 4px);
          transition: all var(--transition-base, 0.15s ease);
          border: 1px solid transparent;
        }

        .compilation-status.hidden {
          display: none;
        }

        .compilation-status.compiling {
          background: var(--info-bg, #eff6ff);
          color: var(--info-color, #3b82f6);
          border-color: var(--info-border, #bfdbfe);
          animation: pulse 1s infinite;
        }

        .compilation-status.completed {
          background: var(--success-bg, #ecfdf5);
          color: var(--success-color, #10b981);
          border-color: var(--success-border, #a7f3d0);
        }

        .compilation-status.error {
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #ef4444);
          border-color: var(--error-border, #fecaca);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .secondary-btn {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-secondary, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          transition: all var(--transition-base, 0.15s ease);
        }

        .secondary-btn:hover:not(:disabled) {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--border-strong, #cbd5e1);
          color: var(--text-primary, #1a1a2e);
        }

        .secondary-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-family: inherit;
          font-weight: 500;
          background: var(--bg-secondary, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          transition: all var(--transition-base, 0.15s ease);
        }

        .toggle-btn:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--border-strong, #cbd5e1);
          color: var(--text-primary, #1a1a2e);
        }

        .toggle-btn.active {
          background: var(--accent-color, #10b981);
          border-color: var(--accent-color, #10b981);
          color: var(--accent-text, #ffffff);
        }

        .toggle-icon {
          font-size: 0.75rem;
          transition: transform var(--transition-base, 0.15s ease);
        }

        .toggle-btn.active .toggle-icon {
          transform: rotate(180deg);
        }

        #copy-feedback {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--success-color, #10b981);
          opacity: 0;
          transition: opacity var(--transition-base, 0.15s ease);
        }

        #copy-feedback.visible {
          opacity: 1;
        }

        @media (max-width: 768px) {
          .header-content {
            flex-wrap: wrap;
          }

          .header-left,
          .header-right {
            flex-wrap: wrap;
          }
        }
      </style>

      <div class="header-content">
        <div class="header-left">
          <button id="annotated-toggle" class="toggle-btn" title="Show annotated output">
            <span class="toggle-icon">&#9654;</span>
            Annotated
          </button>
          <button id="console-toggle" class="toggle-btn" title="Show console output">
            <span class="toggle-icon">&#9654;</span>
            Console
          </button>
          <span id="save-status" class="save-status hidden"></span>
          <span id="compilation-status" class="compilation-status hidden"></span>
        </div>
        <div class="header-right">
          <button id="copy-url" class="secondary-btn">Copy URL</button>
          <span id="copy-feedback">Copied!</span>
          <button id="export" class="secondary-btn" title="Export as SVG, PNG, or PDF (Ctrl+Shift+E)">Export</button>
          <button id="copy-workspace" class="secondary-btn" title="Duplicate this workspace" style="display: ${workspaceId ? 'inline-block' : 'none'}">Copy Workspace</button>
        </div>
      </div>
    `;
  }
}

customElements.define('playground-header', PlaygroundHeader);
