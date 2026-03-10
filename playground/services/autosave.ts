// Autosave service for workspace persistence
// Cost-conscious: debounce + minimum interval + content hashing

import { workspaceApi } from './api.js';
import { store } from '../state/store.js';

// Autosave configuration
const DEBOUNCE_MS = 5000; // 5 seconds after last change
const MIN_INTERVAL_MS = 30000; // 30 seconds minimum between saves

// Save status enum
export const SaveStatus = {
  IDLE: 'idle',
  MODIFIED: 'modified',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
};

// Simple content hash for dirty checking
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Autosave manager class
class AutosaveManager {
  _workspaceId: string | null;
  _debounceTimer: ReturnType<typeof setTimeout> | null;
  _lastSaveTime: number;
  _lastSavedHash: string | null;
  _pendingCode: string | null;
  _isEnabled: boolean;
  // Preferences state (separate from code)
  _preferencesTimer: ReturnType<typeof setTimeout> | null;
  _lastPreferences: string | null;

  constructor() {
    this._workspaceId = null;
    this._debounceTimer = null;
    this._lastSaveTime = 0;
    this._lastSavedHash = null;
    this._pendingCode = null;
    this._isEnabled = false;
    // Preferences state (separate from code)
    this._preferencesTimer = null;
    this._lastPreferences = null;
  }

  // Initialize autosave for a workspace
  init(workspaceId: string, initialHash: string | null = null): void {
    this.stop(); // Clean up any previous instance
    this._workspaceId = workspaceId;
    this._lastSavedHash = initialHash;
    this._lastSaveTime = Date.now();
    this._isEnabled = true;

    store.update({
      saveStatus: SaveStatus.IDLE,
      saveError: null,
    });
  }

  // Stop autosave
  stop(): void {
    this._isEnabled = false;
    this._workspaceId = null;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._preferencesTimer) {
      clearTimeout(this._preferencesTimer);
      this._preferencesTimer = null;
    }
    this._pendingCode = null;
  }

  // Called when code changes - triggers debounced save
  onChange(code: string): void {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    this._pendingCode = code;
    store.set('saveStatus', SaveStatus.MODIFIED);

    // Clear existing timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    // Set new debounce timer
    this._debounceTimer = setTimeout(() => {
      this._attemptSave();
    }, DEBOUNCE_MS);
  }

  // Attempt to save (respects minimum interval)
  async _attemptSave(): Promise<void> {
    if (!this._isEnabled || !this._workspaceId || this._pendingCode === null) {
      return;
    }

    const now = Date.now();
    const timeSinceLastSave = now - this._lastSaveTime;

    // Check minimum interval
    if (timeSinceLastSave < MIN_INTERVAL_MS) {
      // Reschedule for later
      const delay = MIN_INTERVAL_MS - timeSinceLastSave + 100;
      this._debounceTimer = setTimeout(() => {
        this._attemptSave();
      }, delay);
      return;
    }

    // Check if content actually changed (hash comparison)
    const code = this._pendingCode;
    const newHash = await hashContent(code);

    if (newHash === this._lastSavedHash) {
      // Content unchanged, skip save
      store.set('saveStatus', SaveStatus.SAVED);
      return;
    }

    // Perform save
    await this._doSave(code, newHash);
  }

  // Actually perform the save
  async _doSave(code: string, hash: string): Promise<void> {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    store.update({
      saveStatus: SaveStatus.SAVING,
      saveError: null,
    });

    try {
      const result = (await workspaceApi.update(this._workspaceId, { code })) as Record<
        string,
        unknown
      >;

      if (result.skipped) {
        // Server said content unchanged
        store.set('saveStatus', SaveStatus.SAVED);
      } else {
        // Save successful
        this._lastSaveTime = Date.now();
        this._lastSavedHash = hash;
        this._pendingCode = null;

        (store as any).update({
          saveStatus: SaveStatus.SAVED,
          workspaceUpdatedAt: result.updatedAt,
        });
      }
    } catch (err) {
      console.error('Autosave failed:', err);
      (store as any).update({
        saveStatus: SaveStatus.ERROR,
        saveError: (err as Error).message,
      });

      // Retry after interval
      this._debounceTimer = setTimeout(() => {
        this._pendingCode = code; // Restore pending code
        this._attemptSave();
      }, MIN_INTERVAL_MS);
    }
  }

  // Flush any pending changes and stop autosave (call before navigation)
  async flush(): Promise<void> {
    if (!this._isEnabled || !this._workspaceId) {
      this.stop();
      return;
    }

    // Save pending code (saveNow checks hash, skips if unchanged)
    await this.saveNow();

    // Save pending preferences if timer was active
    if (this._preferencesTimer) {
      clearTimeout(this._preferencesTimer);
      this._preferencesTimer = null;
      const prefs = store.get('preferences');
      if (prefs) {
        await this._savePreferences(prefs);
      }
    }

    this.stop();
  }

  // Force immediate save (e.g., before navigation)
  async saveNow(): Promise<boolean> {
    if (!this._isEnabled || !this._workspaceId) {
      return false;
    }

    // Clear debounce timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    const code = (this._pendingCode ?? store.get('code')) as string;
    if (!code) {
      return true;
    }

    const hash = await hashContent(code);
    if (hash === this._lastSavedHash) {
      return true; // No changes to save
    }

    // Force save regardless of interval
    this._lastSaveTime = 0;
    await this._doSave(code, hash);
    return store.get('saveStatus') !== SaveStatus.ERROR;
  }

  // Set initial preferences state for change detection
  setInitialPreferences(preferences: unknown): void {
    this._lastPreferences = JSON.stringify(preferences);
  }

  // Called when preferences change - triggers debounced save
  onPreferencesChange(preferences: unknown): void {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    // Clear existing timer
    if (this._preferencesTimer) {
      clearTimeout(this._preferencesTimer);
    }

    // Debounce preferences saves
    this._preferencesTimer = setTimeout(() => {
      this._savePreferences(preferences);
    }, DEBOUNCE_MS);
  }

  // Save preferences to backend
  async _savePreferences(preferences: unknown): Promise<void> {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    // Skip if preferences haven't changed
    const prefsJson = JSON.stringify(preferences);
    if (prefsJson === this._lastPreferences) {
      return;
    }

    try {
      store.set('saveStatus', SaveStatus.SAVING);
      await workspaceApi.update(this._workspaceId, { preferences });
      this._lastPreferences = prefsJson;
      store.set('saveStatus', SaveStatus.SAVED);

      // Auto-clear saved status after a brief moment
      setTimeout(() => {
        if (store.get('saveStatus') === SaveStatus.SAVED) {
          store.set('saveStatus', SaveStatus.IDLE);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
      (store as any).update({
        saveStatus: SaveStatus.ERROR,
        saveError: (err as Error).message,
      });
    }
  }

  // Get current status
  get isEnabled(): boolean {
    return this._isEnabled;
  }

  get workspaceId(): string | null {
    return this._workspaceId;
  }
}

// Singleton instance
export const autosave = new AutosaveManager();

export default autosave;
