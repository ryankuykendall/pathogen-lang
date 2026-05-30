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
  // Optimistic concurrency: the code revision this client is editing from. Sent
  // as `baseRev`; advanced from each save's response. Left stale on a 409 so
  // saves stay blocked (rather than clobbering the other tab) until reload.
  _baseRev: number;
  _conflicted: boolean;
  // Preferences state (separate from code)
  _preferencesTimer: ReturnType<typeof setTimeout> | null;
  _lastPreferences: string | null;
  _pendingPreferences: unknown | null;
  // Flush promise tracking (Fix 1: duplication race condition)
  _flushPromise: Promise<void> | null;

  constructor() {
    this._workspaceId = null;
    this._debounceTimer = null;
    this._lastSaveTime = 0;
    this._lastSavedHash = null;
    this._pendingCode = null;
    this._isEnabled = false;
    this._baseRev = 0;
    this._conflicted = false;
    // Preferences state (separate from code)
    this._preferencesTimer = null;
    this._lastPreferences = null;
    this._pendingPreferences = null;
    this._flushPromise = null;
  }

  // Initialize autosave for a workspace
  init(workspaceId: string, initialHash: string | null = null, initialRev = 0): void {
    this.stop(); // Clean up any previous instance
    this._workspaceId = workspaceId;
    this._lastSavedHash = initialHash;
    this._baseRev = initialRev;
    this._conflicted = false;
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
    this._pendingPreferences = null;
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

    // While conflicted, every save would 409 against our stale baseRev (and
    // force-saving would clobber the other tab). Stop attempting until the user
    // reloads — which re-inits autosave at the latest rev and clears this.
    if (this._conflicted) {
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

  // Actually perform the save. The keepalive (page-teardown) flush does NOT
  // route through here — it dispatches its fetch synchronously in saveNow so the
  // request survives unload; this path is the normal awaited save.
  async _doSave(code: string, hash: string): Promise<void> {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    store.update({
      saveStatus: SaveStatus.SAVING,
      saveError: null,
    });

    try {
      const result = (await workspaceApi.update(this._workspaceId, {
        code,
        baseRev: this._baseRev,
      })) as Record<string, unknown>;

      // Advance our base revision from the server's authoritative value so the
      // next save's baseRev matches.
      if (typeof result.rev === 'number') {
        this._baseRev = result.rev;
      }

      if (result.skipped) {
        // Server said content unchanged — settle local state so we stop
        // reporting "unsaved" (hasUnsavedChanges → beforeunload prompt) and
        // don't keep re-sending identical bytes on the next debounce.
        this._lastSaveTime = Date.now();
        this._lastSavedHash = hash;
        this._pendingCode = null;
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
      // 409 = another tab/window advanced this workspace. Retrying with our
      // stale baseRev would just 409 again, and force-saving would clobber the
      // newer code — so surface the conflict and STOP autosaving. We keep
      // _pendingCode so the user's local edits aren't lost; they reconcile by
      // reloading (which re-inits autosave at the latest rev).
      if (this._isConflictError(err)) {
        this._enterConflict();
        return;
      }

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

  // True when an error is a 409 optimistic-concurrency conflict.
  _isConflictError(err: unknown): boolean {
    const e = err as { status?: number; data?: { conflict?: boolean } };
    return e?.status === 409 || e?.data?.conflict === true;
  }

  // Surface a multi-tab save conflict and halt autosave. Shared by the normal
  // save path and the keepalive (visibilitychange) path so a conflict never
  // dies silently — both set the error pill and raise the warning banner.
  _enterConflict(): void {
    this._conflicted = true;
    (store as any).update({
      saveStatus: SaveStatus.ERROR,
      saveError:
        'This workspace was changed in another tab. Reload to get the latest version before saving.',
    });
    document.dispatchEvent(
      new CustomEvent('workspace-conflict', {
        bubbles: true,
        composed: true,
        detail: { workspaceId: this._workspaceId, reason: 'save-conflict' },
      }),
    );
  }

  // Flush any pending changes and stop autosave (call before navigation)
  async flush(): Promise<void> {
    const doFlush = async (): Promise<void> => {
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
        if (this._pendingPreferences) {
          await this._savePreferences(this._pendingPreferences);
        }
      }

      this.stop();
    };

    // Track the flush promise so other components can await it
    this._flushPromise = doFlush();
    try {
      await this._flushPromise;
    } finally {
      this._flushPromise = null;
    }
  }

  // Wait for any in-progress flush to complete (used by copy form to avoid race condition)
  async awaitPendingFlush(): Promise<void> {
    if (this._flushPromise) {
      await this._flushPromise;
    }
  }

  // Force immediate save (e.g., before navigation). Pass { keepalive: true }
  // from page-unload / tab-hidden handlers so the request isn't cancelled when
  // the document tears down.
  async saveNow({ keepalive = false }: { keepalive?: boolean } = {}): Promise<boolean> {
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

    if (keepalive) {
      // Page-teardown path (beforeunload / visibilitychange→hidden). The fetch
      // MUST be dispatched synchronously: any await here (e.g. hashing via
      // crypto.subtle) defers the request to a microtask the browser won't run
      // once the document starts unloading — keepalive would then have nothing
      // to keep alive. So skip the async hash dirty-check, gate on the
      // synchronous unsaved signal, and fire immediately.
      if (!this.hasUnsavedChanges() || this._conflicted) {
        return true;
      }
      // The fetch is dispatched synchronously here (before any await), so it
      // survives a real teardown. We still attach a continuation: when the page
      // SURVIVES (e.g. visibilitychange backgrounding, not a real unload) it
      // runs and keeps _baseRev in sync — otherwise this keepalive save would
      // advance the server's rev while our _baseRev went stale, and the next
      // edit after returning to the tab would falsely 409. On a true unload the
      // continuation simply never runs (reload re-seeds _baseRev), which is fine.
      const sentCode = code;
      workspaceApi
        .update(this._workspaceId, { code: sentCode, baseRev: this._baseRev }, { keepalive: true })
        .then((result) => {
          const rev = (result as { rev?: number } | null)?.rev;
          if (typeof rev === 'number') {
            this._baseRev = rev;
            // Content is now persisted; settle local dirty state and the pill so
            // we don't re-warn/re-send when the tab is restored.
            if (this._pendingCode === sentCode) this._pendingCode = null;
            store.set('saveStatus', SaveStatus.SAVED);
          }
        })
        .catch((err) => {
          // Surface a conflict the same way the normal path does — otherwise a
          // visibilitychange 409 would silently halt autosave (no banner/pill).
          if (this._isConflictError(err)) this._enterConflict();
        });
      return true;
    }

    // Conflicted: a normal/forced save (editor-blur, flush, Ctrl+S) would 409
    // against our stale baseRev and re-dispatch the conflict. It's already
    // surfaced; skip until the user reloads (which re-inits at the latest rev).
    if (this._conflicted) {
      return false;
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

  // True when there is unsaved code (a pending edit, or the live store code
  // differs from the last persisted hash). Used by the unload guard to decide
  // whether to warn the user before they leave.
  hasUnsavedChanges(): boolean {
    if (!this._isEnabled || !this._workspaceId) return false;
    if (this._pendingCode !== null) return true;
    if (this._debounceTimer !== null) return true;
    return store.get('saveStatus') === SaveStatus.ERROR;
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

    // Store pending preferences for flush()
    this._pendingPreferences = preferences;

    // Debounce preferences saves
    this._preferencesTimer = setTimeout(() => {
      this._savePreferences(preferences);
    }, DEBOUNCE_MS);
  }

  // Save preferences to backend (sends only changed fields for multi-tab safety)
  async _savePreferences(preferences: unknown): Promise<void> {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    // Skip if preferences haven't changed
    const prefsJson = JSON.stringify(preferences);
    if (prefsJson === this._lastPreferences) {
      return;
    }

    // Compute delta: only send fields that changed from last saved state
    const current = preferences as Record<string, unknown>;
    const previous: Record<string, unknown> = this._lastPreferences
      ? JSON.parse(this._lastPreferences)
      : {};
    const delta: Record<string, unknown> = {};
    let hasChanges = false;
    for (const [key, value] of Object.entries(current)) {
      if (JSON.stringify(value) !== JSON.stringify(previous[key])) {
        delta[key] = value;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return;
    }

    try {
      store.set('saveStatus', SaveStatus.SAVING);
      await workspaceApi.update(this._workspaceId, { preferences: delta });
      this._lastPreferences = prefsJson;
      this._pendingPreferences = null;
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
