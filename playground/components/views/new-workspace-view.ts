// New Workspace View - Form for creating new workspaces
// Route: /workspace/new

import { workspaceApi } from '../../services/api.js';
import { autosave } from '../../services/autosave.js';
// Visibility is no longer chosen during workspace creation, so the
// Publishing-feature gate that used to live here is gone. The
// currentUser subscription below stays — other parts of the form
// (e.g. the future preferences view) may still need it.
import { store } from '../../state/store.js';
import { emptyBoilerplate, examples } from '../../utils/examples.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';
import styles from './new-workspace-view.css';

interface FormData {
  [key: string]: unknown;
  name: string;
  description: string;
  template: string;
  isPublic: boolean;
}

interface FormErrors {
  [key: string]: string | undefined;
  name?: string;
  description?: string;
  submit?: string;
}

interface SourceWorkspace {
  name: string;
  description?: string;
  isPublic?: boolean;
  preferences?: Record<string, unknown>;
}

/** An approved workspace's files, as Open as new workspace sends them: each as text. */
interface ForkFiles {
  files: Record<string, { text: string }>;
  folders: string[];
  entryPoints: string[];
}

/**
 * The files of a source.json answer (the Pages worker's /u/:handle/:slug/source.json,
 * the approved version), each reduced to its text; null when it doesn't carry them.
 */
function forkFilesOf(data: Record<string, unknown>): ForkFiles | null {
  const { files, folders, entryPoints } = data;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return null;
  const allText = (list: unknown): list is string[] =>
    Array.isArray(list) && list.every((item) => typeof item === 'string');
  if (!allText(folders) || !allText(entryPoints)) return null;
  const texts: Record<string, { text: string }> = {};
  for (const [path, file] of Object.entries(files as Record<string, unknown>)) {
    const text = (file as { text?: unknown } | null)?.text;
    if (typeof text !== 'string') return null;
    texts[path] = { text };
  }
  if (Object.keys(texts).length === 0) return null;
  return { files: texts, folders, entryPoints };
}

interface ImportState {
  code?: string;
  title?: string;
  desc?: string;
}

class NewWorkspaceView extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;
  private _unsubscribeUser: (() => void) | null = null;
  private _isSubmitting: boolean = false;
  private formData: FormData;
  private errors: FormErrors = {};
  private _copyFromId: string | null = null;
  // Track the (handle, slug) pair for an approval-source copy. Distinct
  // from _copyFromId (which is a workspace ID under the current user's
  // ownership) because the source here is owned by another user — we
  // can't call workspaceApi.get(id), we hit the public source.json
  // endpoint instead.
  private _fromApproval: { handle: string; slug: string } | null = null;
  private _loadingSource: boolean = false;
  private _sourceWorkspace: SourceWorkspace | null = null;

  // The approved files of the workspace Open as new workspace copies (2e step 4).
  private _forkFiles: ForkFiles | null = null;

  // Counts loads of a source workspace: a load that ends after a newer one began (or
  // after the form was left) leaves the form alone.
  private _loadSeq = 0;

  private _stateCode: string | null = null;
  private _importKey: string | null = null;
  private _beforeUnloadHandler: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Form state
    this.formData = {
      name: '',
      description: '',
      template: '',
      isPublic: false,
    };
  }

  connectedCallback(): void {
    this.loadPreferences();

    // Check for copy mode or state mode
    const query = (store.get('routeQuery') as Record<string, string> | undefined) || {};
    if (query.copyFrom) {
      this._copyFromId = query.copyFrom;
      this.loadSourceWorkspace(query.copyFrom);
    } else if (query.fromHandle && query.fromSlug) {
      this._fromApproval = { handle: query.fromHandle, slug: query.fromSlug };
      this.loadApprovalSource(query.fromHandle, query.fromSlug);
    } else if (query.import) {
      this._applyImportKey(query.import);
      this.render();
    } else if (query.state) {
      this._applyStateParam(query.state);
      this.render();
    } else {
      this.render();
    }

    this.setupEventListeners();

    // Re-render (no form reset) when /me resolves mid-load so the
    // Visibility section appears once the user's features are known.
    this._unsubscribeUser = store.subscribe(['currentUser'], () => {
      if (store.get('currentView') === 'new-workspace') this.render();
    });

    // Subscribe to route changes to reset form when navigating back.
    // Important: this is also the entry point for cold-loaded copy /
    // fork modes — app-shell's render() inserts <new-workspace-view>
    // BEFORE initRouter() populates store.routeQuery, so the
    // connectedCallback() reads above start with an empty query and
    // miss the initial fromHandle/fromSlug/copyFrom. The first store
    // update from initRouter then fires this subscriber, and the
    // branches below pick up the params.
    this._unsubscribe = store.subscribe(['currentView', 'routeQuery'], () => {
      if (store.get('currentView') === 'new-workspace') {
        // Once import data is applied, don't let route-driven resets overwrite it
        if (this._importKey) return;

        const newQuery = (store.get('routeQuery') as Record<string, string> | undefined) || {};
        const newCopyFromId = newQuery.copyFrom || null;
        const newFromHandle = newQuery.fromHandle || null;
        const newFromSlug = newQuery.fromSlug || null;
        const fromApprovalKey = newFromHandle && newFromSlug ? `${newFromHandle}/${newFromSlug}` : null;
        const currentApprovalKey = this._fromApproval
          ? `${this._fromApproval.handle}/${this._fromApproval.slug}`
          : null;

        // Approval-fork mode (visitor opening someone else's workspace
        // as a new workspace). Handled before copyFrom so the two
        // modes don't fight if both params somehow land together.
        if (fromApprovalKey !== currentApprovalKey) {
          this._fromApproval = newFromHandle && newFromSlug
            ? { handle: newFromHandle, slug: newFromSlug }
            : null;
          this._sourceWorkspace = null;
          this._forkFiles = null;

          if (newFromHandle && newFromSlug) {
            this.loadApprovalSource(newFromHandle, newFromSlug);
            return;
          }
        }
        // The same fork link: nothing to do. (The store notifies once per key, so a
        // route change that sets the view and the query comes twice; the second
        // mustn't reset the form, or cancel its load, as if it were a blank one.)
        if (this._fromApproval) return;

        // Check if we're entering copy mode or the copyFrom ID changed
        if (newCopyFromId !== this._copyFromId) {
          this._copyFromId = newCopyFromId;
          this._sourceWorkspace = null;

          if (newCopyFromId) {
            this.loadSourceWorkspace(newCopyFromId);
          } else {
            this.loadPreferences();
            this.resetForm();
          }
        } else if (newQuery.import) {
          if (!this._importKey) {
            this._dropLoad();
            this._stateCode = null;
            this.loadPreferences();
            this._applyImportKey(newQuery.import);
            this.render();
          }
        } else if (newQuery.state) {
          this._dropLoad();
          this._stateCode = null;
          this.loadPreferences();
          this._applyStateParam(newQuery.state);
          this.render();
        } else if (!newCopyFromId) {
          this._stateCode = null;
          this.loadPreferences();
          this.resetForm();
        }
      }
    });
  }

  disconnectedCallback(): void {
    this._dropLoad();
    this._cleanupImport();
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    if (this._unsubscribeUser) {
      this._unsubscribeUser();
      this._unsubscribeUser = null;
    }
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
  }

  loadPreferences(): void {
    // Canvas dimensions now live in source via `define ViewBox(...)`;
    // user preferences only carry non-dimensional defaults.
  }

  _applyImportKey(key: string): void {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      this._importKey = key; // track for cleanup
      const state = JSON.parse(raw) as ImportState;
      if (state.code) this._stateCode = state.code;
      if (state.title) this.formData.name = state.title;
      if (state.desc) this.formData.description = state.desc;

      // Clean up localStorage if user closes the tab
      if (!this._beforeUnloadHandler) {
        this._beforeUnloadHandler = () => this._cleanupImport();
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
      }
    } catch {
      // Invalid import data, ignore
    }
  }

  _cleanupImport(): void {
    if (this._importKey) {
      try {
        localStorage.removeItem(this._importKey);
      } catch {}
      this._importKey = null;
    }
  }

  _applyStateParam(encoded: string): void {
    try {
      const json = decodeURIComponent(atob(encoded));
      const state = JSON.parse(json) as ImportState;
      if (state.code) this._stateCode = state.code;
      if (state.title) this.formData.name = state.title;
      if (state.desc) this.formData.description = state.desc;
    } catch {
      // Invalid state param, ignore
    }
  }

  // Fetch a public approval's source via the SSR worker's
  // /u/:handle/:slug/source.json endpoint. Used when a visitor (or
  // signed-out user) follows the "Open as new workspace" CTA from the
  // read-only detail page — they can't call workspaceApi.get() against
  // another user's workspace, but the SSR endpoint is publicly
  // readable for any approved workspace.
  //
  // On success the form reads as the owner's Copy Workspace does (name
  // prefilled with "<Name> (Copy)", description preserved), and submitting
  // creates a workspace from the approved files: every file as text, its
  // folders and its programs' list, so the copy opens on the same main (2e
  // step 4). The live files aren't read: they can hold edits waiting for review.
  async loadApprovalSource(handle: string, slug: string): Promise<void> {
    const seq = this._startLoad();
    let source: SourceWorkspace | null = null;
    let files: ForkFiles | null = null;
    let error: string | null = null;
    try {
      const resp = await fetch(`/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}/source.json`);
      if (!resp.ok) {
        throw new Error(`Source unavailable (status ${resp.status})`);
      }
      const data = (await resp.json()) as Record<string, unknown> & {
        name?: string;
        description?: string;
      };
      files = forkFilesOf(data);
      if (!files) throw new Error('its files could not be read');
      source = { name: data.name || 'Untitled', description: data.description, isPublic: false };
    } catch (err: unknown) {
      console.error('Failed to load approval source:', err);
      error = `Failed to load workspace: ${(err as Error).message}`;
    }
    // A newer load began, or the form was left, while this one waited.
    if (seq !== this._loadSeq) return;
    this._forkFiles = error ? null : files;
    this._sourceWorkspace = error ? null : source;
    if (error) this.errors.submit = error;
    if (source && !error) {
      // Pre-populate form. Append "(Copy)" to the original name so
      // forks don't collide visually with the original in the user's
      // workspace list.
      this.formData.name = `${source.name} (Copy)`;
      this.formData.description = source.description || '';
      this.formData.template = '';
    }
    this._loadingSource = false;
    this.render();
  }

  async loadSourceWorkspace(id: string): Promise<void> {
    const seq = this._startLoad();
    let workspace: SourceWorkspace | null = null;
    let error: string | null = null;
    try {
      // Wait for any in-progress autosave flush to complete before fetching
      // (prevents race condition when user copies immediately after editing)
      await autosave.awaitPendingFlush();
      workspace = (await workspaceApi.get(id)) as SourceWorkspace;
    } catch (err: unknown) {
      console.error('Failed to load source workspace:', err);
      error = `Failed to load workspace: ${(err as Error).message}`;
    }
    // A newer load began, or the form was left, while this one waited.
    if (seq !== this._loadSeq) return;
    this._sourceWorkspace = error ? null : workspace;
    if (error) this.errors.submit = error;
    if (workspace && !error) {
      // Pre-populate form with source workspace data
      this.formData.name = `${workspace.name} (Copy)`;
      this.formData.description = workspace.description || '';
      this.formData.isPublic = workspace.isPublic || false;
      // Clear template since we're copying from the source
      this.formData.template = '';
    }
    this._loadingSource = false;
    this.render();
  }

  /** A load begins: it supersedes any under way, and clears the last one's error. */
  private _startLoad(): number {
    this._loadingSource = true;
    delete this.errors.submit;
    this.render();
    return ++this._loadSeq;
  }

  /** No load is wanted any more: one still under way leaves the form alone. */
  private _dropLoad(): void {
    this._loadSeq++;
    this._loadingSource = false;
  }

  resetForm(): void {
    // If in copy mode, reload source workspace instead of clearing
    if (this._copyFromId) {
      this.loadSourceWorkspace(this._copyFromId);
      return;
    }

    this._dropLoad();
    this.formData = {
      name: '',
      description: '',
      template: '',
      isPublic: false,
    };
    this.errors = {};
    this._sourceWorkspace = null;
    this._forkFiles = null;
    this._stateCode = null;
    this.render();
  }

  validate(): boolean {
    this.errors = {};

    if (!this.formData.name.trim()) {
      this.errors.name = 'Workspace name is required';
    } else if (this.formData.name.trim().length > 100) {
      this.errors.name = 'Name must be 100 characters or less';
    }

    if (this.formData.description.length > 500) {
      this.errors.description = 'Description must be 500 characters or less';
    }

    return Object.keys(this.errors).length === 0;
  }

  async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (this._isSubmitting || this._loadingSource) return;
    if (!this.validate()) {
      this.render();
      return;
    }

    this._isSubmitting = true;
    this.render();

    try {
      const name = this.formData.name.trim();
      const description = this.formData.description.trim();
      let workspace: { slug?: string; id: string };
      if (this._copyFromId) {
        // Copy Workspace and Duplicate, the owner's: the server copies every saved
        // file, the folders, the main and the canvas settings (2e step 4). Leaving
        // the workspace started saving its last edits: the copy waits for that.
        if (!this._sourceWorkspace) throw new Error('The workspace to copy could not be loaded.');
        await autosave.awaitPendingFlush();
        workspace = (await workspaceApi.copy(this._copyFromId, { name, description })) as typeof workspace;
      } else if (this._fromApproval) {
        // Open as new workspace: the approved files, each as text.
        if (!this._forkFiles) throw new Error('The workspace to copy could not be loaded.');
        workspace = (await workspaceApi.create({
          name,
          description,
          ...this._forkFiles,
          isPublic: false,
          preferences: this._newPreferences(),
        })) as typeof workspace;
      } else {
        // From a state param, a picked template, or the empty boilerplate (just
        // `define ViewBox` and the canonical default PathLayer, no demo content).
        let code: string;
        if (this._stateCode) {
          code = this._stateCode;
        } else if (this.formData.template) {
          code = (examples as Record<string, string>)[this.formData.template] || emptyBoilerplate;
        } else {
          code = emptyBoilerplate;
        }
        workspace = (await workspaceApi.create({
          name,
          description,
          code,
          // Always start private. Publishing happens via the overflow
          // menu (Make public) after the workspace exists.
          isPublic: false,
          preferences: this._newPreferences(),
        })) as typeof workspace;
      }

      // Clean up import data before navigating away
      this._cleanupImport();

      // Navigate to the new workspace (with slug--id format)
      const slugId = buildWorkspaceSlugId(workspace.slug ?? null, workspace.id);
      navigateTo('/workspace/:slugId', { params: { slugId } });
    } catch (err: unknown) {
      console.error('Failed to create workspace:', err);
      this.errors.submit = (err as Error).message || 'Failed to create workspace';
      this.render();
    } finally {
      this._isSubmitting = false;
    }
  }

  /** A new workspace's canvas settings: the user's preferences, else the defaults. */
  private _newPreferences(): Record<string, unknown> {
    const prefs = (store.get('preferences') as Record<string, unknown> | undefined) || {};
    return {
      stroke: prefs.stroke || '#000000',
      strokeWidth: prefs.strokeWidth ?? 2,
      fillEnabled: prefs.fillEnabled ?? false,
      fill: prefs.fill || '#3498db',
      background: prefs.background || '#f5f5f5',
      gridEnabled: prefs.gridEnabled ?? true,
      gridColor: prefs.gridColor || '#cccccc',
      gridSize: prefs.gridSize ?? 20,
      toFixed: prefs.toFixed ?? null,
    };
  }

  handleCancel(): void {
    this._cleanupImport();
    navigateTo('/workspaces');
  }

  setupEventListeners(): void {
    const form = this.shadowRoot!.querySelector('form');
    if (!form) return;

    // Form submission
    form.addEventListener('submit', (e: Event) => this.handleSubmit(e));

    // Input changes
    form.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const { name, value, type } = target;

      if (type === 'checkbox') {
        (this.formData as Record<string, unknown>)[name] = (target as HTMLInputElement).checked;
      } else if (type === 'number') {
        (this.formData as Record<string, unknown>)[name] = parseInt(value, 10) || 0;
      } else {
        (this.formData as Record<string, unknown>)[name] = value;
      }

      // Clear error on change
      if (this.errors[name]) {
        delete this.errors[name];
        this.updateFieldError(name);
      }

      // Update template preview
      if (name === 'template') {
        this.updateTemplatePreview();
      }
    });

    // Cancel button
    this.shadowRoot!.querySelector('.secondary-btn')?.addEventListener('click', () => {
      this.handleCancel();
    });
  }

  updateFieldError(fieldName: string): void {
    const input = this.shadowRoot!.querySelector(`[name="${fieldName}"]`) as HTMLElement | null;
    const errorEl = this.shadowRoot!.querySelector(`#${fieldName}-error`) as HTMLElement | null;

    if (input) {
      input.classList.toggle('error', !!this.errors[fieldName]);
    }
    if (errorEl) {
      errorEl.textContent = this.errors[fieldName] || '';
    }
  }

  updateTemplatePreview(): void {
    const preview = this.shadowRoot!.querySelector('.template-preview') as HTMLElement | null;
    if (!preview) return;

    if (this.formData.template && (examples as Record<string, string>)[this.formData.template]) {
      preview.textContent = (examples as Record<string, string>)[this.formData.template];
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  }

  render(): void {
    // Copy Workspace and Open as new workspace read alike: both copy a workspace.
    const isCopyMode = !!this._copyFromId || !!this._fromApproval;
    const isStateMode = !!this._stateCode;
    const isLoading = this._loadingSource;

    // Show loading state while fetching source workspace
    if (isLoading) {
      this.shadowRoot!.innerHTML = `
        <style>${styles}</style>
        <div class="form-container">
          <h1>Copy Workspace</h1>
          <p class="subtitle">Loading workspace data...</p>
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary, #666);">
            Loading...
          </div>
        </div>
      `;
      return;
    }

    const templateOptions = Object.keys(examples as Record<string, string>)
      .map((key) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        return `<option value="${key}" ${this.formData.template === key ? 'selected' : ''}>${label}</option>`;
      })
      .join('');

    const title = isCopyMode ? 'Copy Workspace' : 'New Workspace';
    const subtitle =
      isCopyMode && this._sourceWorkspace
        ? `Creating a copy of "${this.escapeHtml(this._sourceWorkspace.name)}"`
        : isStateMode
          ? 'Create a workspace from imported code'
          : 'Create a new workspace to start building SVG paths';
    const submitText = this._isSubmitting
      ? isCopyMode
        ? 'Creating Copy...'
        : 'Creating...'
      : isCopyMode
        ? 'Create Copy'
        : 'Create Workspace';

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="form-container">
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>

        <form>
          <div class="form-section">
            <h2>Details</h2>

            <div class="form-group">
              <label for="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value="${this.escapeHtml(this.formData.name)}"
                placeholder="My Awesome Pattern"
                class="${this.errors.name ? 'error' : ''}"
                autofocus
              >
              <span id="name-error" class="error-message">${this.errors.name || ''}</span>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea
                id="description"
                name="description"
                placeholder="Optional description of your workspace"
                class="${this.errors.description ? 'error' : ''}"
              >${this.escapeHtml(this.formData.description)}</textarea>
              <span id="description-error" class="error-message">${this.errors.description || ''}</span>
              <span class="hint">Brief description of what this workspace contains</span>
            </div>
          </div>

          ${
            !isCopyMode && !isStateMode
              ? `
          <div class="form-section">
            <h2>Starting Template</h2>

            <div class="form-group">
              <label for="template">Start from example</label>
              <select id="template" name="template">
                <option value="">Empty workspace</option>
                ${templateOptions}
              </select>
              <span class="hint">Choose an example to start with, or begin with an empty workspace</span>
            </div>

            <div class="template-preview ${this.formData.template ? '' : 'hidden'}">
              ${this.formData.template ? this.escapeHtml((examples as Record<string, string>)[this.formData.template] || '') : ''}
            </div>
          </div>
          `
              : ''
          }

          ${
            // Visibility is no longer set during workspace creation —
            // every new workspace starts private. Users publish later
            // via the overflow menu on the Workspaces page or in the
            // workspace breadcrumb (Make public / Make private). This
            // keeps the create form short and means the publishing
            // decision happens on a workspace that already has code,
            // not as a checkbox in the create dialog.
            ''
          }

          ${
            this.errors.submit
              ? `
            <div class="error-message" style="margin-bottom: 1rem;">
              ${this.escapeHtml(this.errors.submit)}
            </div>
          `
              : ''
          }

          <div class="actions">
            <button type="submit" class="primary-btn" ${this._isSubmitting ? 'disabled' : ''}>
              ${submitText}
            </button>
            <button type="button" class="secondary-btn">Cancel</button>
          </div>
        </form>
      </div>
    `;

    this.setupEventListeners();
  }

  escapeHtml(text: string | undefined): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('new-workspace-view', NewWorkspaceView);

export default NewWorkspaceView;
