// Edit Workspace Metadata Modal — centered card dialog for renaming the
// workspace and editing its description. Mirrors the :host(.open) pattern
// from thumbnail-crop-modal / export-modal but rendered as a
// centered card (~480px wide) instead of a full-viewport overlay.

import { workspaceApi } from '../services/api.js';
import { store } from '../state/store.js';
import { updateWorkspaceSlugUrl } from '../utils/workspace-slug-url.js';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

interface OpenOptions {
  name: string | null;
  description: string | null;
}

interface WorkspaceListEntry {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const styles = `
  :host {
    display: none;
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }

  :host(.open) {
    display: grid;
    place-items: center;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
  }

  .card {
    width: min(480px, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    background: var(--bg-secondary, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-lg, 0 10px 25px -3px rgba(0, 0, 0, 0.18));
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
    font-family: var(--font-display, var(--font-sans));
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md, 8px);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 1.125rem;
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover {
    border-color: var(--border-color, #e2e8f0);
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-primary, #f8f9fa);
  }

  .body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a2e);
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-sm, 4px);
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #1a1a2e);
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent-color, #10b981);
    box-shadow: 0 0 0 3px var(--accent-subtle, rgba(16, 185, 129, 0.18));
  }

  .form-group input.error,
  .form-group textarea.error {
    border-color: var(--error-color, #ef4444);
  }

  .form-group textarea {
    min-height: 88px;
    resize: vertical;
  }

  .field-error {
    color: var(--error-color, #ef4444);
    font-size: 0.8125rem;
    min-height: 1.1em;
  }

  .submit-error {
    color: var(--error-color, #ef4444);
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    background: var(--error-subtle, rgba(239, 68, 68, 0.08));
    border: 1px solid var(--error-color, #ef4444);
    border-radius: var(--radius-sm, 4px);
  }

  .submit-error:empty {
    display: none;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    border-top: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-primary, #f8f9fa);
    border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-secondary, #ffffff);
    color: var(--text-primary, #1a1a2e);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .btn:hover:not(:disabled) {
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent-color, #10b981);
    border-color: var(--accent-color, #10b981);
    color: var(--accent-text, #ffffff);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover, #059669);
    border-color: var(--accent-hover, #059669);
    color: var(--accent-text, #ffffff);
  }
`;

export class EditWorkspaceMetadataModal extends HTMLElement {
  private _saving = false;
  private _handleKeydown: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._setupListeners();
  }

  disconnectedCallback(): void {
    this._removeDocumentListeners();
  }

  open({ name, description }: OpenOptions): void {
    const nameInput = this._nameInput;
    const descInput = this._descriptionInput;
    if (nameInput) nameInput.value = name ?? '';
    if (descInput) descInput.value = description ?? '';

    this._clearErrors();
    this._setSubmitError('');
    this._setSaving(false);

    this.classList.add('open');
    this._addDocumentListeners();
    this._updateSaveDisabled();

    requestAnimationFrame(() => {
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
    });
  }

  close(): void {
    this.classList.remove('open');
    this._removeDocumentListeners();
  }

  private get _nameInput(): HTMLInputElement | null {
    return this.shadowRoot!.querySelector('#metadata-name') as HTMLInputElement | null;
  }

  private get _descriptionInput(): HTMLTextAreaElement | null {
    return this.shadowRoot!.querySelector('#metadata-description') as HTMLTextAreaElement | null;
  }

  private get _saveBtn(): HTMLButtonElement | null {
    return this.shadowRoot!.querySelector('.save-btn') as HTMLButtonElement | null;
  }

  private get _cancelBtn(): HTMLButtonElement | null {
    return this.shadowRoot!.querySelector('.cancel-btn') as HTMLButtonElement | null;
  }

  private _validate(): { name?: string; description?: string } {
    const errors: { name?: string; description?: string } = {};
    const nameValue = (this._nameInput?.value ?? '').trim();
    const descValue = this._descriptionInput?.value ?? '';

    if (!nameValue) {
      errors.name = 'Workspace name is required';
    } else if (nameValue.length > NAME_MAX) {
      errors.name = `Name must be ${NAME_MAX} characters or less`;
    }

    if (descValue.length > DESCRIPTION_MAX) {
      errors.description = `Description must be ${DESCRIPTION_MAX} characters or less`;
    }

    return errors;
  }

  private _renderFieldErrors(errors: { name?: string; description?: string }): void {
    const nameInput = this._nameInput;
    const descInput = this._descriptionInput;
    const nameErr = this.shadowRoot!.querySelector('#metadata-name-error') as HTMLElement | null;
    const descErr = this.shadowRoot!.querySelector('#metadata-description-error') as HTMLElement | null;

    if (nameInput) nameInput.classList.toggle('error', !!errors.name);
    if (descInput) descInput.classList.toggle('error', !!errors.description);
    if (nameErr) nameErr.textContent = errors.name ?? '';
    if (descErr) descErr.textContent = errors.description ?? '';
  }

  private _clearErrors(): void {
    this._renderFieldErrors({});
  }

  private _setSubmitError(message: string): void {
    const el = this.shadowRoot!.querySelector('.submit-error') as HTMLElement | null;
    if (el) el.textContent = message;
  }

  private _updateSaveDisabled(): void {
    const saveBtn = this._saveBtn;
    if (!saveBtn) return;
    const nameValue = (this._nameInput?.value ?? '').trim();
    saveBtn.disabled = this._saving || !nameValue;
  }

  private _setSaving(saving: boolean): void {
    this._saving = saving;
    const saveBtn = this._saveBtn;
    const cancelBtn = this._cancelBtn;
    if (saveBtn) {
      saveBtn.textContent = saving ? 'Saving…' : 'Save';
    }
    if (cancelBtn) cancelBtn.disabled = saving;
    this._updateSaveDisabled();
  }

  private async _handleSave(): Promise<void> {
    if (this._saving) return;

    const errors = this._validate();
    this._renderFieldErrors(errors);
    if (errors.name || errors.description) return;

    const workspaceId = store.get('workspaceId') as string | null;
    if (!workspaceId) {
      this._setSubmitError('No workspace is loaded');
      return;
    }

    const name = (this._nameInput?.value ?? '').trim();
    const description = (this._descriptionInput?.value ?? '').trim();

    this._setSubmitError('');
    this._setSaving(true);

    try {
      // API returns the updated workspace; typed as any to match the pattern
      // used elsewhere (workspace-view.loadWorkspace) since the store types
      // are inferred from runtime defaults where many fields default to null.
      const updated = (await workspaceApi.update(workspaceId, {
        name,
        description,
      })) as any;

      store.update({
        workspaceName: updated.name,
        workspaceDescription: updated.description,
        currentFileName: updated.name,
        workspaceUpdatedAt: updated.updatedAt,
      });

      const workspaces = (store.get('workspaces') || []) as WorkspaceListEntry[];
      const entry = workspaces.find((w) => w.id === workspaceId);
      if (entry) {
        entry.name = updated.name;
        entry.description = updated.description;
        entry.updatedAt = updated.updatedAt;
        store.set('workspaces', [...workspaces]);
      }

      updateWorkspaceSlugUrl(workspaceId, updated.slug);
      this.close();
    } catch (err: unknown) {
      console.error('Failed to rename workspace:', err);
      this._setSubmitError((err as Error).message || 'Failed to save changes');
      this._setSaving(false);
    }
  }

  private _setupListeners(): void {
    const root = this.shadowRoot!;
    root.querySelector('.close-btn')!.addEventListener('click', () => this.close());
    root.querySelector('.cancel-btn')!.addEventListener('click', () => this.close());
    root.querySelector('.save-btn')!.addEventListener('click', () => {
      void this._handleSave();
    });
    root.querySelector('.backdrop')!.addEventListener('click', () => this.close());

    const nameInput = this._nameInput;
    const descInput = this._descriptionInput;

    nameInput?.addEventListener('input', () => {
      // Clear name error eagerly so the user sees the field is now valid.
      nameInput.classList.remove('error');
      const nameErr = this.shadowRoot!.querySelector('#metadata-name-error') as HTMLElement | null;
      if (nameErr) nameErr.textContent = '';
      this._updateSaveDisabled();
    });

    descInput?.addEventListener('input', () => {
      descInput.classList.remove('error');
      const descErr = this.shadowRoot!.querySelector('#metadata-description-error') as HTMLElement | null;
      if (descErr) descErr.textContent = '';
    });

    const form = root.querySelector('form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this._handleSave();
    });
  }

  private _addDocumentListeners(): void {
    this._handleKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.classList.contains('open')) {
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this._handleKeydown, true);
  }

  private _removeDocumentListeners(): void {
    if (this._handleKeydown) {
      document.removeEventListener('keydown', this._handleKeydown, true);
      this._handleKeydown = null;
    }
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <div class="backdrop"></div>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="metadata-title">
        <div class="header">
          <h2 id="metadata-title">Rename workspace</h2>
          <button class="close-btn" type="button" title="Close" aria-label="Close">&times;</button>
        </div>
        <form class="body" novalidate>
          <div class="form-group">
            <label for="metadata-name">Name</label>
            <input id="metadata-name" name="name" type="text" maxlength="${NAME_MAX}" autocomplete="off" required />
            <span id="metadata-name-error" class="field-error"></span>
          </div>
          <div class="form-group">
            <label for="metadata-description">Description</label>
            <textarea id="metadata-description" name="description" maxlength="${DESCRIPTION_MAX}"></textarea>
            <span id="metadata-description-error" class="field-error"></span>
          </div>
          <div class="submit-error"></div>
        </form>
        <div class="footer">
          <button class="btn cancel-btn" type="button">Cancel</button>
          <button class="btn primary save-btn" type="button">Save</button>
        </div>
      </div>
    `;
  }
}

customElements.define('edit-workspace-metadata-modal', EditWorkspaceMetadataModal);

export default EditWorkspaceMetadataModal;
