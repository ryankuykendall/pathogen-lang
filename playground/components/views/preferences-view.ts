// Preferences View - Default SVG styling settings
// Route: /preferences

import '../shared/pathogen-color-input.js';

import { preferencesApi } from '../../services/api.js';
import { store } from '../../state/store.js';
import styles from './preferences-view.css';

interface PreferencesFormValues {
  width: number;
  height: number;
  background: string;
  gridEnabled: boolean;
  gridColor: string;
  gridSize: number;
  [key: string]: string | number | boolean | undefined;
}

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

// Default preferences
const DEFAULTS: PreferencesFormValues = {
  width: 200,
  height: 200,
  background: '#f5f5f5',
  gridEnabled: true,
  gridColor: '#cccccc',
  gridSize: 20,
};

class PreferencesView extends HTMLElement {
  private formValues: PreferencesFormValues = { ...DEFAULTS };
  private _unsubscribe: (() => void) | null = null;
  private _loading: boolean = false;
  private _saving: boolean = false;
  private _feedback: Feedback | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Subscribe to view changes to load when becoming active
    this._unsubscribe = store.subscribe(['currentView'], () => {
      if (store.get('currentView') === 'preferences') {
        this.loadPreferences();
      }
    });

    // Initial load if we're on preferences
    if (store.get('currentView') === 'preferences') {
      this.loadPreferences();
    } else {
      // Just render with local store data
      const storedPrefs = store.get('preferences') as PreferencesFormValues | undefined;
      if (storedPrefs) {
        this.formValues = { ...DEFAULTS, ...storedPrefs };
      }
      this.render();
    }
  }

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  private async loadPreferences(): Promise<void> {
    this._loading = true;
    this._feedback = null;
    this.render();

    try {
      const prefs = (await preferencesApi.get()) as Partial<PreferencesFormValues>;
      // Merge with defaults (API may return empty object for new users)
      this.formValues = { ...DEFAULTS, ...prefs };
      // Also update the store
      store.set('preferences', this.formValues as any);
    } catch (err) {
      console.error('Failed to load preferences:', err);
      // Fall back to local store
      const storedPrefs = store.get('preferences') as PreferencesFormValues | undefined;
      if (storedPrefs) {
        this.formValues = { ...DEFAULTS, ...storedPrefs };
      }
    } finally {
      this._loading = false;
      this.render();
    }
  }

  private setupEventListeners(): void {
    const form = this.shadowRoot!.querySelector('form');
    if (!form) return;

    // Handle form input changes (number/checkbox/text)
    form.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const { name, value, type, checked } = target;
      if (!name) return;
      if (type === 'checkbox') {
        this.formValues[name] = checked;
      } else if (type === 'number') {
        this.formValues[name] = parseFloat(value) || 0;
      } else {
        this.formValues[name] = value;
      }
    });

    // Handle <pathogen-color-input> color-change events
    form.addEventListener('color-change', (e: Event) => {
      const target = e.target as HTMLElement & { name?: string; value?: string };
      const name = target.getAttribute('name');
      if (!name) return;
      const value = (e as CustomEvent<{ value: string }>).detail?.value ?? target.value ?? '';
      this.formValues[name] = value;

      const valueDisplay = target.nextElementSibling;
      if (valueDisplay?.classList.contains('color-value')) {
        valueDisplay.textContent = value;
      }
    });

    // Save button
    this.shadowRoot!.querySelector('.save-btn')?.addEventListener('click', () => {
      this.savePreferences();
    });

    // Reset button
    this.shadowRoot!.querySelector('.reset-btn')?.addEventListener('click', () => {
      this.resetToDefaults();
    });
  }

  private async savePreferences(): Promise<void> {
    if (this._saving) return;

    this._saving = true;
    this._feedback = null;
    this.updateSaveButton();

    try {
      await preferencesApi.save(this.formValues);
      store.set('preferences', { ...this.formValues } as any);
      this._feedback = { type: 'success', message: 'Preferences saved!' };
    } catch (err) {
      console.error('Failed to save preferences:', err);
      this._feedback = { type: 'error', message: 'Failed to save preferences' };
    } finally {
      this._saving = false;
      this.updateSaveButton();
      this.showFeedback();
    }
  }

  private updateSaveButton(): void {
    const btn = this.shadowRoot!.querySelector('.save-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = this._saving;
      btn.textContent = this._saving ? 'Saving...' : 'Save Preferences';
    }
  }

  private showFeedback(): void {
    const feedbackEl = this.shadowRoot!.querySelector('.save-feedback') as HTMLElement | null;
    if (feedbackEl && this._feedback) {
      feedbackEl.textContent = this._feedback.message;
      feedbackEl.className = `save-feedback visible ${this._feedback.type}`;

      // Hide after 3 seconds
      setTimeout(() => {
        feedbackEl.classList.remove('visible');
      }, 3000);
    }
  }

  private resetToDefaults(): void {
    this.formValues = { ...DEFAULTS };
    store.set('preferences', { ...DEFAULTS } as any);
    this.render();
    // Also save to API
    this.savePreferences();
  }

  private render(): void {
    if (this._loading) {
      this.shadowRoot!.innerHTML = `
        <style>${styles}</style>
        <div class="preferences-container">
          <h1>Preferences</h1>
          <p class="subtitle">Default settings for new workspaces</p>
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading preferences...</p>
          </div>
        </div>
      `;
      return;
    }

    const prefs = this.formValues;

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="preferences-container">
        <h1>Preferences</h1>
        <p class="subtitle">Default settings for new workspaces</p>

        <form>
          <div class="section">
            <h2>Canvas Size</h2>
            <div class="form-group">
              <label for="width">Width (px)</label>
              <input type="number" id="width" name="width" value="${prefs.width}" min="50" max="20000">
            </div>
            <div class="form-group">
              <label for="height">Height (px)</label>
              <input type="number" id="height" name="height" value="${prefs.height}" min="50" max="20000">
            </div>
          </div>

          <div class="section">
            <h2>Background & Grid</h2>
            <div class="form-group">
              <label for="background">Background Color</label>
              <div class="color-input-group">
                <pathogen-color-input id="background" name="background" compact value="${prefs.background}"></pathogen-color-input>
                <span class="color-value">${prefs.background}</span>
              </div>
            </div>
            <div class="form-group">
              <label for="gridEnabled">Show Grid</label>
              <input type="checkbox" id="gridEnabled" name="gridEnabled" ${prefs.gridEnabled ? 'checked' : ''}>
            </div>
            <div class="form-group">
              <label for="gridColor">Grid Color</label>
              <div class="color-input-group">
                <pathogen-color-input id="gridColor" name="gridColor" compact value="${prefs.gridColor}"></pathogen-color-input>
                <span class="color-value">${prefs.gridColor}</span>
              </div>
            </div>
            <div class="form-group">
              <label for="gridSize">Grid Size (px)</label>
              <input type="number" id="gridSize" name="gridSize" value="${prefs.gridSize}" min="5" max="100" step="5">
            </div>
          </div>

          <div class="actions">
            <button type="button" class="save-btn">Save Preferences</button>
            <button type="button" class="reset-btn">Reset to Defaults</button>
            <span class="save-feedback"></span>
          </div>
        </form>

        <div class="notice">
          <strong>Note:</strong> These preferences apply to new workspaces only.
          Existing workspaces retain their individual settings.
        </div>
      </div>
    `;

    this.setupEventListeners();
  }
}

customElements.define('preferences-view', PreferencesView);

export default PreferencesView;
