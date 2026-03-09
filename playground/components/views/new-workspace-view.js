// New Workspace View - Form for creating new workspaces
// Route: /workspace/new

import { workspaceApi } from '../../services/api.js';
import { store } from '../../state/store.js';
import { defaultCode, examples } from '../../utils/examples.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';

const styles = `
  :host {
    display: block;
    padding: 2rem;
    overflow-y: auto;
    background: var(--bg-primary, #ffffff);
  }

  .form-container {
    max-width: 600px;
    margin: 0 auto;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: var(--text-secondary, #666);
    font-size: 0.875rem;
  }

  .form-section {
    margin-bottom: 1.5rem;
  }

  .form-section h2 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
  }

  .form-group .hint {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-tertiary, #999);
  }

  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1a1a1a);
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--accent-color, #0066cc);
    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
  }

  .form-group input.error,
  .form-group textarea.error {
    border-color: var(--error-color, #dc3545);
  }

  .form-group textarea {
    min-height: 80px;
    resize: vertical;
  }

  .inline-group {
    display: flex;
    gap: 1rem;
  }

  .inline-group .form-group {
    flex: 1;
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .checkbox-group input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--accent-color, #10b981);
  }

  .checkbox-group label {
    margin-bottom: 0;
    cursor: pointer;
  }

  .error-message {
    color: var(--error-color, #dc3545);
    font-size: 0.8125rem;
    margin-top: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  .primary-btn {
    padding: 0.625rem 1.5rem;
    background: var(--accent-color, #0066cc);
    color: var(--accent-text, #ffffff);
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .primary-btn:hover:not(:disabled) {
    background: var(--accent-hover, #0052a3);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-btn {
    padding: 0.625rem 1.5rem;
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #1a1a1a);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .secondary-btn:hover {
    background: var(--bg-primary, #ffffff);
    border-color: var(--text-secondary, #666);
  }

  .template-preview {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    max-height: 150px;
    overflow-y: auto;
    white-space: pre-wrap;
    color: var(--text-secondary, #666);
  }

  .template-preview.hidden {
    display: none;
  }

  @media (max-width: 600px) {
    :host {
      padding: 1rem;
    }

    .inline-group {
      flex-direction: column;
      gap: 0;
    }

    .actions {
      flex-direction: column;
    }
  }
`;

class NewWorkspaceView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubscribe = null;
    this._isSubmitting = false;

    // Form state
    this.formData = {
      name: '',
      description: '',
      width: 200,
      height: 200,
      template: '',
      isPublic: false,
    };
    this.errors = {};

    // Copy mode state
    this._copyFromId = null;
    this._loadingSource = false;
    this._sourceWorkspace = null;

    // State mode (from mini-workspace "Open in Playground" links)
    this._stateCode = null;
  }

  connectedCallback() {
    this.loadPreferences();

    // Check for copy mode or state mode
    const query = store.get('routeQuery') || {};
    if (query.copyFrom) {
      this._copyFromId = query.copyFrom;
      this.loadSourceWorkspace(query.copyFrom);
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

    // Subscribe to route changes to reset form when navigating back
    this._unsubscribe = store.subscribe(['currentView', 'routeQuery'], () => {
      if (store.get('currentView') === 'new-workspace') {
        // Once import data is applied, don't let route-driven resets overwrite it
        if (this._importKey) return;

        const newQuery = store.get('routeQuery') || {};
        const newCopyFromId = newQuery.copyFrom || null;

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
            this._stateCode = null;
            this.loadPreferences();
            this._applyImportKey(newQuery.import);
            this.render();
          }
        } else if (newQuery.state) {
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

  disconnectedCallback() {
    this._cleanupImport();
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
  }

  loadPreferences() {
    const prefs = store.get('preferences') || {};
    this.formData.width = prefs.width || 200;
    this.formData.height = prefs.height || 200;
  }

  _applyImportKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      this._importKey = key; // track for cleanup
      const state = JSON.parse(raw);
      if (state.code) this._stateCode = state.code;
      if (state.w) this.formData.width = state.w;
      if (state.h) this.formData.height = state.h;
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

  _cleanupImport() {
    if (this._importKey) {
      try {
        localStorage.removeItem(this._importKey);
      } catch {}
      this._importKey = null;
    }
  }

  _applyStateParam(encoded) {
    try {
      const json = decodeURIComponent(atob(encoded));
      const state = JSON.parse(json);
      if (state.code) this._stateCode = state.code;
      if (state.w) this.formData.width = state.w;
      if (state.h) this.formData.height = state.h;
      if (state.title) this.formData.name = state.title;
      if (state.desc) this.formData.description = state.desc;
    } catch {
      // Invalid state param, ignore
    }
  }

  async loadSourceWorkspace(id) {
    this._loadingSource = true;
    this.render();

    try {
      const workspace = await workspaceApi.get(id);
      this._sourceWorkspace = workspace;

      // Pre-populate form with source workspace data
      this.formData.name = `${workspace.name} (Copy)`;
      this.formData.description = workspace.description || '';
      this.formData.isPublic = workspace.isPublic || false;

      // Use source workspace preferences for canvas size
      if (workspace.preferences) {
        this.formData.width = workspace.preferences.width || 200;
        this.formData.height = workspace.preferences.height || 200;
      }

      // Clear template since we're copying code from source
      this.formData.template = '';
    } catch (err) {
      console.error('Failed to load source workspace:', err);
      this.errors.submit = `Failed to load workspace: ${err.message}`;
      this._sourceWorkspace = null;
    } finally {
      this._loadingSource = false;
      this.render();
    }
  }

  resetForm() {
    // If in copy mode, reload source workspace instead of clearing
    if (this._copyFromId) {
      this.loadSourceWorkspace(this._copyFromId);
      return;
    }

    this.formData = {
      name: '',
      description: '',
      width: this.formData.width,
      height: this.formData.height,
      template: '',
      isPublic: false,
    };
    this.errors = {};
    this._sourceWorkspace = null;
    this._stateCode = null;
    this.render();
  }

  validate() {
    this.errors = {};

    if (!this.formData.name.trim()) {
      this.errors.name = 'Workspace name is required';
    } else if (this.formData.name.trim().length > 100) {
      this.errors.name = 'Name must be 100 characters or less';
    }

    if (this.formData.description.length > 500) {
      this.errors.description = 'Description must be 500 characters or less';
    }

    if (this.formData.width < 50 || this.formData.width > 20000) {
      this.errors.width = 'Width must be between 50 and 20000';
    }

    if (this.formData.height < 50 || this.formData.height > 20000) {
      this.errors.height = 'Height must be between 50 and 20000';
    }

    return Object.keys(this.errors).length === 0;
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (this._isSubmitting) return;
    if (!this.validate()) {
      this.render();
      return;
    }

    this._isSubmitting = true;
    this.render();

    try {
      // Get code: from state param, source workspace, or template
      let code;
      if (this._stateCode) {
        code = this._stateCode;
      } else if (this._sourceWorkspace) {
        code = this._sourceWorkspace.code || '';
      } else {
        code = this.formData.template ? examples[this.formData.template] : '';
      }

      // Get user preferences for other settings
      const prefs = store.get('preferences') || {};
      // If copying, merge source workspace preferences
      const sourcePrefs = this._sourceWorkspace?.preferences || {};

      const workspace = await workspaceApi.create({
        name: this.formData.name.trim(),
        description: this.formData.description.trim(),
        code,
        isPublic: this.formData.isPublic,
        preferences: {
          width: this.formData.width,
          height: this.formData.height,
          stroke: sourcePrefs.stroke || prefs.stroke || '#000000',
          strokeWidth: sourcePrefs.strokeWidth ?? prefs.strokeWidth ?? 2,
          fillEnabled: sourcePrefs.fillEnabled ?? prefs.fillEnabled ?? false,
          fill: sourcePrefs.fill || prefs.fill || '#3498db',
          background: sourcePrefs.background || prefs.background || '#f5f5f5',
          gridEnabled: sourcePrefs.gridEnabled ?? prefs.gridEnabled ?? true,
          gridColor: sourcePrefs.gridColor || prefs.gridColor || '#cccccc',
          gridSize: sourcePrefs.gridSize ?? prefs.gridSize ?? 20,
          toFixed: sourcePrefs.toFixed ?? prefs.toFixed ?? null,
        },
      });

      // Clean up import data before navigating away
      this._cleanupImport();

      // Navigate to the new workspace (with slug--id format)
      const slugId = buildWorkspaceSlugId(workspace.slug, workspace.id);
      navigateTo('/workspace/:slugId', { params: { slugId } });
    } catch (err) {
      console.error('Failed to create workspace:', err);
      this.errors.submit = err.message || 'Failed to create workspace';
      this.render();
    } finally {
      this._isSubmitting = false;
    }
  }

  handleCancel() {
    this._cleanupImport();
    navigateTo('/');
  }

  setupEventListeners() {
    const form = this.shadowRoot.querySelector('form');
    if (!form) return;

    // Form submission
    form.addEventListener('submit', (e) => this.handleSubmit(e));

    // Input changes
    form.addEventListener('input', (e) => {
      const { name, value, type, checked } = e.target;

      if (type === 'checkbox') {
        this.formData[name] = checked;
      } else if (type === 'number') {
        this.formData[name] = parseInt(value, 10) || 0;
      } else {
        this.formData[name] = value;
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
    this.shadowRoot.querySelector('.secondary-btn')?.addEventListener('click', () => {
      this.handleCancel();
    });
  }

  updateFieldError(fieldName) {
    const input = this.shadowRoot.querySelector(`[name="${fieldName}"]`);
    const errorEl = this.shadowRoot.querySelector(`#${fieldName}-error`);

    if (input) {
      input.classList.toggle('error', !!this.errors[fieldName]);
    }
    if (errorEl) {
      errorEl.textContent = this.errors[fieldName] || '';
    }
  }

  updateTemplatePreview() {
    const preview = this.shadowRoot.querySelector('.template-preview');
    if (!preview) return;

    if (this.formData.template && examples[this.formData.template]) {
      preview.textContent = examples[this.formData.template];
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  }

  render() {
    const isCopyMode = !!this._copyFromId;
    const isStateMode = !!this._stateCode;
    const isLoading = this._loadingSource;

    // Show loading state while fetching source workspace
    if (isLoading) {
      this.shadowRoot.innerHTML = `
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

    const templateOptions = Object.keys(examples)
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

    this.shadowRoot.innerHTML = `
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

          <div class="form-section">
            <h2>Canvas Size</h2>

            <div class="inline-group">
              <div class="form-group">
                <label for="width">Width (px)</label>
                <input
                  type="number"
                  id="width"
                  name="width"
                  value="${this.formData.width}"
                  min="50"
                  max="20000"
                  class="${this.errors.width ? 'error' : ''}"
                >
                <span id="width-error" class="error-message">${this.errors.width || ''}</span>
              </div>

              <div class="form-group">
                <label for="height">Height (px)</label>
                <input
                  type="number"
                  id="height"
                  name="height"
                  value="${this.formData.height}"
                  min="50"
                  max="20000"
                  class="${this.errors.height ? 'error' : ''}"
                >
                <span id="height-error" class="error-message">${this.errors.height || ''}</span>
              </div>
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
              ${this.formData.template ? this.escapeHtml(examples[this.formData.template] || '') : ''}
            </div>
          </div>
          `
              : ''
          }

          <div class="form-section">
            <h2>Visibility</h2>

            <div class="form-group">
              <div class="checkbox-group">
                <input
                  type="checkbox"
                  id="isPublic"
                  name="isPublic"
                  ${this.formData.isPublic ? 'checked' : ''}
                >
                <label for="isPublic">Make this workspace public</label>
              </div>
              <span class="hint">Public workspaces can be viewed by anyone with the link</span>
            </div>
          </div>

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('new-workspace-view', NewWorkspaceView);

export default NewWorkspaceView;
