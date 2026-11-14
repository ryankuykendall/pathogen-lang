// Autosave service for workspace persistence
// Cost-conscious: debounce + minimum interval + content hashing

import { workspaceApi } from './api.js';
import { isWorkspaceFile, MAIN_FILE, withOpenFileText, workspaceNow } from './workspace-files.js';
import { store } from '../state/store.js';

import type { WorkspaceTexts } from './workspace-files.js';

// Autosave configuration
const DEBOUNCE_MS = 5000; // 5 seconds after last change
const MIN_INTERVAL_MS = 30000; // 30 seconds minimum between saves
// Under the browsers' 64 KB cap on a keepalive request (fetch's keepalive).
const KEEPALIVE_MAX_BYTES = 60_000;

// Save status enum
export const SaveStatus = {
  IDLE: 'idle',
  MODIFIED: 'modified',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
};

// The rule for a page served with a library older than the shared hash below:
// the hash of the one program's text, as before phase 2. Never equal to the
// server's manifest hash, so such a page sends a save the server finds unchanged.
async function legacyHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface HashLib {
  workspaceFileEntry: (text: string) => Promise<{ sha256: string; size: number }>;
  workspaceContentHash: (manifest: {
    files: Record<string, { sha256: string; size: number }>;
    folders: string[];
    entryPoints: string[];
  }) => Promise<string>;
}

function hashLib(): HashLib | null {
  const lib = (window as unknown as { PathogenLang?: Partial<HashLib> }).PathogenLang;
  return typeof lib?.workspaceFileEntry === 'function' && typeof lib.workspaceContentHash === 'function'
    ? (lib as HashLib)
    : null;
}

/** The workspace with the open file's text as `code` (pathogen.json in the editor is never a file). */
function workspaceWith(code: string): WorkspaceTexts {
  return withOpenFileText(workspaceNow(), code);
}

/** What the server holds for a workspace as it was loaded: each file's hash and text, and its shape. */
export interface SavedFiles {
  /** Path → SHA-256, from the load's answer. */
  shas?: Record<string, string>;
  /** Path → text, as loaded. */
  texts?: Record<string, string>;
  /**
   * True when the server holds just main.pathogen (or a server from before
   * phase 2 answered one `code`): such a workspace saves `code`, which every
   * server version takes. False when it holds more.
   */
  justMain?: boolean;
}

/**
 * The workspace's content hash, by the server's own rule (src/workspace/
 * files.ts, through the bundle), so an unchanged workspace compares equal to
 * the `contentHash` a load returned (project-docs/modules/51-phase-2c-plan.md,
 * piece 7). Also returns each file's SHA-256, for a save's by-hash entries.
 */
async function workspaceHash(workspace: WorkspaceTexts): Promise<{ hash: string; shas: Map<string, string> }> {
  const lib = hashLib();
  if (!lib) {
    // Without the library, a one-file workspace's hash: its open file's, or the main's when that's pathogen.json.
    const file = isWorkspaceFile(workspace.openFile) ? workspace.openFile : MAIN_FILE;
    return { hash: await legacyHash(workspace.texts.get(file) ?? ''), shas: new Map() };
  }
  const files: Record<string, { sha256: string; size: number }> = {};
  for (const [path, text] of workspace.texts) files[path] = await lib.workspaceFileEntry(text);
  const hash = await lib.workspaceContentHash({
    files,
    folders: workspace.folders,
    entryPoints: workspace.entryPoints,
  });
  return { hash, shas: new Map(Object.entries(files).map(([path, entry]) => [path, entry.sha256])) };
}

/** A workspace that is just main.pathogen, as every workspace was before phase 2: it saves as `code`. */
function isJustMain(workspace: WorkspaceTexts): boolean {
  return (
    workspace.texts.size === 1 &&
    workspace.texts.has(MAIN_FILE) &&
    workspace.folders.length === 0 &&
    workspace.entryPoints.length === 1 &&
    workspace.entryPoints[0] === MAIN_FILE
  );
}

/** A workspace's files and shape: what filesBody reads (a WorkspaceTexts, or what a snapshot kept). */
export interface FilesOf {
  texts: ReadonlyMap<string, string>;
  folders: readonly string[];
  entryPoints: readonly string[];
}

/** A save's or a snapshot's `files` body (website/api/workspace-store.ts FilesBody). */
export interface FilesBodyOut {
  files: Record<string, { text: string } | { sha256: string }>;
  folders: string[];
  entryPoints: string[];
}

/** A save request out, and the promise its answer settles (success or not). */
interface SaveRequest {
  workspace: WorkspaceTexts;
  settled: Promise<void>;
}

/** The workspace and session a save belongs to (see AutosaveManager._session). */
interface SessionToken {
  id: string | null;
  session: number;
}

/** How long a turn waits for the requests still out before it sends anyway. */
const REQUEST_WAIT_MS = 20_000;

// Autosave manager class
class AutosaveManager {
  _workspaceId: string | null;
  _debounceTimer: ReturnType<typeof setTimeout> | null;
  _lastSaveTime: number;
  _lastSavedHash: string | null;
  // The workspace as of the latest edit not yet saved, every file in it,
  // taken when the edit happened: a flush after a workspace switch must save
  // this workspace's files, not the files the store holds by then
  // (tests/playground-workspace-switch-autosave). Null when nothing is
  // pending. A save clears it only if no newer edit replaced it meanwhile.
  _pendingWorkspace: WorkspaceTexts | null;
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
  // Each file's SHA-256 and text as the server last stored them: a save sends
  // a file whose text is unchanged by hash only (website/api: `{ sha256 }`).
  // The texts let the page-teardown save, which can't hash, tell which files
  // changed.
  _savedShas: Map<string, string>;
  _savedTexts: Map<string, string>;

  // Whether the server holds just main.pathogen (see SavedFiles.justMain).
  _serverJustMain: boolean;

  // One request out at a time. Two of ours from the same revision would 409
  // each other, and a 409 reads as another tab (the banner, and no more
  // saving): each tab click blurs the editor and saves, so two quick clicks
  // did it. Normal saves take turns (`_queue`); each turn waits for every
  // request still out (`_requests`) before it sends. A page-teardown save
  // can't wait: it goes at once.
  _requests: Set<SaveRequest>;

  _queue: Promise<unknown>;

  // Counts page-teardown saves. A normal save asked for before one went out
  // doesn't send: the teardown save carried the latest edit. And a 409 on a
  // request that crossed another of ours is the two of them, not another tab.
  _teardowns: number;

  // A 409 on a request that went while another of ours was still out (a wait
  // that ran out) is retried once, alone, where a real conflict shows; this
  // says the retry was spent. Cleared by a save that lands.
  _crossingRetried: boolean;

  // Counts init()s and stop()s: an answer, a turn or a timer from an earlier
  // session (even of the same workspace, left and opened again) leaves the
  // session now alone.
  _session: number;

  constructor() {
    this._workspaceId = null;
    this._debounceTimer = null;
    this._lastSaveTime = 0;
    this._lastSavedHash = null;
    this._pendingWorkspace = null;
    this._isEnabled = false;
    this._baseRev = 0;
    this._conflicted = false;
    // Preferences state (separate from code)
    this._preferencesTimer = null;
    this._lastPreferences = null;
    this._pendingPreferences = null;
    this._flushPromise = null;
    this._savedShas = new Map();
    this._savedTexts = new Map();
    this._serverJustMain = true;
    this._requests = new Set();
    this._queue = Promise.resolve();
    this._teardowns = 0;
    this._crossingRetried = false;
    this._session = 0;
  }

  /** Who a save belongs to: this workspace, in this session. */
  _token(): SessionToken {
    return { id: this._workspaceId, session: this._session };
  }

  /** Whether the session a save belongs to is still the one bound. */
  _bound(token: SessionToken): boolean {
    return this._isEnabled && this._workspaceId === token.id && this._session === token.session;
  }

  // Initialize autosave for a workspace, with what the server holds for it.
  init(workspaceId: string, initialHash: string | null = null, initialRev = 0, saved: SavedFiles = {}): void {
    this.stop(); // Clean up any previous instance
    this._workspaceId = workspaceId;
    this._lastSavedHash = initialHash;
    this._savedShas = new Map(Object.entries(saved.shas ?? {}));
    this._savedTexts = new Map(Object.entries(saved.texts ?? {}));
    this._serverJustMain = saved.justMain ?? true;
    this._baseRev = initialRev;
    this._conflicted = false;
    this._crossingRetried = false;
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
    this._pendingWorkspace = null;
    this._pendingPreferences = null;
    // A new session: this one's turns and answers leave the next alone, and
    // the next one's saves don't wait on this one's requests.
    this._session++;
    this._requests = new Set();
    this._queue = Promise.resolve();
  }

  /**
   * Called after an edit: takes the workspace as it now stands (or, given the
   * open file's text, the store's workspace with that text) and schedules a
   * debounced save.
   */
  onChange(change: string | WorkspaceTexts = workspaceNow()): void {
    if (!this._isEnabled || !this._workspaceId) {
      return;
    }

    this._pendingWorkspace = typeof change === 'string' ? workspaceWith(change) : change;
    store.set('saveStatus', SaveStatus.MODIFIED);
    this._scheduleSave(DEBOUNCE_MS);
  }

  /**
   * One save timer at a time: replaces any scheduled one. The handle is
   * cleared when it fires, so hasUnsavedChanges() doesn't read a timer that
   * already ran as a save still to come.
   */
  _scheduleSave(delay: number): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._attemptSave();
    }, delay);
  }

  // Attempt to save (respects minimum interval)
  async _attemptSave(): Promise<void> {
    if (!this._isEnabled || !this._workspaceId || this._pendingWorkspace === null) {
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
      this._scheduleSave(MIN_INTERVAL_MS - timeSinceLastSave + 100);
      return;
    }

    await this._saveInTurn({ unchangedIsSaved: true });
  }

  /**
   * A normal save, in its turn: one request out at a time, so each goes out
   * from the revision the one before it got. It sends what's pending when its
   * turn comes, the newest edit: every edit makes the workspace pending
   * (onChange) and only a save that lands clears it, so with nothing pending
   * there's nothing unsaved, and an older text must never be sent over what
   * an earlier turn saved. The pending workspace is autosave's own, not the
   * store's, so a flush at a workspace switch saves the workspace being left
   * even once the next one's load has replaced the store. The queue moves on
   * once the request is out; the next turn waits for its answer
   * (`_requestsAnswered`). Resolves false when it failed or couldn't be sent.
   */
  async _saveInTurn({ unchangedIsSaved = false } = {}): Promise<boolean> {
    const token = this._token();
    const teardowns = this._teardowns;
    const turn = this._queue.then(async (): Promise<boolean | { answer: Promise<boolean> }> => {
      await this._requestsAnswered();
      if (!this._bound(token) || this._conflicted) return false;
      // A teardown save went out since this one was asked for, with the latest edit.
      if (this._teardowns !== teardowns) return true;
      const workspace = this._pendingWorkspace;
      if (workspace === null) return true;
      const { hash, shas } = await workspaceHash(workspace);
      // Another workspace (or session) bound while hashing: not this one's to send.
      if (!this._bound(token)) return false;
      if (this._teardowns !== teardowns) return true;
      if (hash === this._lastSavedHash) {
        // Content unchanged, skip save
        this._settle(workspace);
        if (unchangedIsSaved) store.set('saveStatus', SaveStatus.SAVED);
        return true;
      }
      // Wrapped, so the queue doesn't wait for the answer.
      return { answer: this._doSave(workspace, hash, shas) };
    });
    this._queue = turn.catch(() => undefined);
    const outcome = await turn;
    return typeof outcome === 'boolean' ? outcome : outcome.answer;
  }

  /**
   * Until every request out now is answered. At most REQUEST_WAIT_MS: the
   * API has no timeout, and a request that never answers mustn't stop every
   * save after it.
   */
  async _requestsAnswered(): Promise<void> {
    const deadline = Date.now() + REQUEST_WAIT_MS;
    while (this._requests.size > 0 && Date.now() < deadline) {
      const timeout: { id?: ReturnType<typeof setTimeout> } = {};
      const answers: Promise<void>[] = [];
      for (const request of this._requests) answers.push(request.settled);
      await Promise.race([
        Promise.all(answers),
        new Promise<void>((resolve) => {
          timeout.id = setTimeout(resolve, deadline - Date.now());
        }),
      ]);
      clearTimeout(timeout.id);
    }
  }

  /** Mark a request out; returns what to call once it's answered. */
  _requestOut(workspace: WorkspaceTexts): () => void {
    let answered: () => void = () => undefined;
    const settled = new Promise<void>((resolve) => {
      answered = resolve;
    });
    const request: SaveRequest = { workspace, settled };
    const requests = this._requests;
    requests.add(request);
    return () => {
      requests.delete(request);
      answered();
    };
  }

  /**
   * The pending edit is saved: forget it, unless a newer edit replaced it
   * meanwhile, and the save its debounce would have made.
   */
  _settle(saved: WorkspaceTexts): void {
    if (this._pendingWorkspace !== saved) return;
    this._pendingWorkspace = null;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * What a save sends. A workspace that is just main.pathogen, on the server
   * too, goes as `code`, which every server version accepts. Any other goes
   * as `files`, with its folders and program list: each file whose text the
   * server doesn't hold goes as text, every other by its hash. `shas` are the
   * files' hashes when the caller computed them; the page-teardown save
   * can't, and compares texts instead.
   */
  _saveBody(workspace: WorkspaceTexts, shas: ReadonlyMap<string, string> = new Map()): Record<string, unknown> {
    if (isJustMain(workspace) && this._serverJustMain) return { code: workspace.texts.get(MAIN_FILE) ?? '' };
    return { ...this._filesBody(workspace, shas) };
  }

  /**
   * A workspace's files as `files`, with its folders and program list: each
   * file whose text the server holds by its hash, every other as text. The
   * one rule for a save and for a snapshot (2e): `shas` are the files'
   * hashes when the caller computed them; without them, texts are compared.
   */
  _filesBody(workspace: FilesOf, shas: ReadonlyMap<string, string> = new Map()): FilesBodyOut {
    const files: Record<string, { text: string } | { sha256: string }> = {};
    for (const [path, text] of workspace.texts) {
      const saved = this._savedShas.get(path);
      const unchanged =
        saved !== undefined && (shas.has(path) ? shas.get(path) === saved : this._savedTexts.get(path) === text);
      files[path] = unchanged ? { sha256: saved } : { text };
    }
    return { files, folders: [...workspace.folders], entryPoints: [...workspace.entryPoints] };
  }

  /** Whether this autosave holds `workspaceId` now, knowing which of its files the server has. */
  holds(workspaceId: string | null): boolean {
    return this._isEnabled && workspaceId !== null && workspaceId === this._workspaceId;
  }

  /**
   * What a snapshot of `workspaceId` sends for its files (note 58, step 3):
   * by hash only while this autosave holds that workspace, whose saved files
   * it knows. The server checks a hash against the workspace's own files, so
   * for any other, or once stopped, every file goes as text.
   */
  filesBody(workspace: FilesOf, workspaceId: string | null): FilesBodyOut {
    if (this.holds(workspaceId)) return this._filesBody(workspace);
    const files: Record<string, { text: string }> = {};
    for (const [path, text] of workspace.texts) files[path] = { text };
    return { files, folders: [...workspace.folders], entryPoints: [...workspace.entryPoints] };
  }

  /** The server now holds exactly `workspace`: its texts, hashes (when known) and shape. */
  _recordSaved(workspace: WorkspaceTexts, shas: ReadonlyMap<string, string>): void {
    for (const path of [...this._savedTexts.keys()]) {
      if (!workspace.texts.has(path)) this._savedTexts.delete(path);
    }
    for (const path of [...this._savedShas.keys()]) {
      if (!workspace.texts.has(path)) this._savedShas.delete(path);
    }
    for (const [path, text] of workspace.texts) {
      const sha256 = shas.get(path);
      if (sha256 !== undefined) this._savedShas.set(path, sha256);
      // A text sent without its hash known (the page-teardown save): its old
      // hash no longer names it, so the next save sends it as text again.
      else if (this._savedTexts.get(path) !== text) this._savedShas.delete(path);
      this._savedTexts.set(path, text);
    }
    this._serverJustMain = isJustMain(workspace);
  }

  // Actually perform the save. The keepalive (page-teardown) flush does NOT
  // route through here — it dispatches its fetch synchronously in saveNow so the
  // request survives unload; this path is the normal awaited save. The request
  // is out (in `_requests`) by the time this returns its promise. Resolves
  // true when the save landed.
  async _doSave(
    workspace: WorkspaceTexts,
    hash: string,
    shas: ReadonlyMap<string, string> = new Map(),
  ): Promise<boolean> {
    if (!this._isEnabled || !this._workspaceId) {
      return false;
    }

    store.update({
      saveStatus: SaveStatus.SAVING,
      saveError: null,
    });

    // The workspace and session this save belongs to. If another workspace
    // is loaded (or this one opened again) while the request is out, its
    // answer must not touch the new session's state (its revision, saved
    // hashes or status).
    const token = this._token();
    const workspaceId = this._workspaceId;
    const teardowns = this._teardowns;
    // Another of ours still out: only after a wait for it ran out.
    const crossing = this._requests.size > 0;
    const answered = this._requestOut(workspace);
    try {
      const result = (await workspaceApi.update(workspaceId, {
        ...this._saveBody(workspace, shas),
        baseRev: this._baseRev,
      })) as Record<string, unknown>;
      if (!this._bound(token)) return false;
      // The server now stores these files.
      this._recordSaved(workspace, shas);
      this._crossingRetried = false;

      // Advance our base revision from the server's authoritative value so the
      // next save's baseRev matches.
      if (typeof result.rev === 'number') {
        this._baseRev = result.rev;
      }

      // Saved (or, `skipped`, the server already held it): settle local state
      // so we stop reporting "unsaved" (hasUnsavedChanges → beforeunload
      // prompt) and don't re-send the same bytes. An edit made while this
      // save was out stays pending, and its debounce saves it.
      this._lastSaveTime = Date.now();
      this._lastSavedHash = hash;
      this._settle(workspace);
      const status = this._pendingWorkspace ? SaveStatus.MODIFIED : SaveStatus.SAVED;
      if (result.skipped) {
        store.set('saveStatus', status);
      } else {
        (store as any).update({
          saveStatus: status,
          workspaceUpdatedAt: result.updatedAt,
        });
      }
      return true;
    } catch (err) {
      // A save from before a switch (or a re-open): its failure belongs to
      // that session, not the one now open.
      if (!this._bound(token)) {
        console.error('Autosave of the previous workspace failed:', err);
        return false;
      }
      // A page-teardown save went out while this one was: it carried this
      // workspace or a newer one, and whichever of the two landed second got
      // the 409. That's not another tab, and this older text mustn't be put
      // back as pending: the teardown save's own answer settles what's saved.
      if (this._teardowns !== teardowns) {
        if (store.get('saveStatus') === SaveStatus.SAVING) {
          store.set('saveStatus', this._pendingWorkspace ? SaveStatus.MODIFIED : SaveStatus.SAVED);
        }
        return false;
      }
      // The failed workspace is still unsaved. A newer edit made while the
      // request was out is newer than it, and stays the one to save: the
      // retry must never send the older text over it.
      this._pendingWorkspace ??= workspace;

      // 409 = another tab/window advanced this workspace. Retrying with our
      // stale baseRev would just 409 again, and force-saving would clobber the
      // newer code — so surface the conflict and STOP autosaving. The pending
      // workspace is kept so the user's local edits aren't lost; they
      // reconcile by reloading (which re-inits autosave at the latest rev).
      // Except once, when this request went while another of ours was still
      // out (a wait for it ran out): the 409 may be that one landing first.
      // A retry alone, after it, shows which.
      if (this._isConflictError(err)) {
        if (crossing && !this._crossingRetried) {
          this._crossingRetried = true;
          store.set('saveStatus', SaveStatus.MODIFIED);
          this._scheduleSave(MIN_INTERVAL_MS);
          return false;
        }
        this._enterConflict();
        return false;
      }

      console.error('Autosave failed:', err);
      (store as any).update({
        saveStatus: SaveStatus.ERROR,
        saveError: (err as Error).message,
      });

      // Retry after the interval, with whatever is pending then. Replaces a
      // debounce an edit during the request scheduled: one timer, never two.
      this._scheduleSave(MIN_INTERVAL_MS);
      return false;
    } finally {
      answered();
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

      // Save what's pending (saveNow checks hash, skips if unchanged).
      const token = this._token();
      await this.saveNow();
      // A page-teardown save that went out meanwhile carried the latest edit,
      // and saveNow left it to that: wait for it, and save again if it failed,
      // before letting go of this workspace.
      await this._requestsAnswered();
      if (this._bound(token) && this._pendingWorkspace && !this._conflicted) await this.saveNow();

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

    // Only what's pending is unsaved: every edit makes the workspace pending
    // (onChange), and only a save that lands clears it. It is autosave's own
    // copy, so a flush at a workspace switch saves the workspace being left
    // even once the next one's load has replaced the store.
    const workspace = this._pendingWorkspace;
    if (workspace === null) {
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
      // A request out now already carries the latest edit: nothing more to
      // send (a second one, from the same revision, would 409 against it).
      const out = [...this._requests];
      if (out.some((request) => request.workspace === workspace)) {
        return true;
      }
      // Normal saves asked for before now don't send: this one carries the
      // latest. If one of ours is out already, the two cross.
      const teardown = ++this._teardowns;
      const crossed = out.length > 0;
      const token = this._token();
      const answered = this._requestOut(workspace);
      // The fetch is dispatched synchronously here (before any await), so it
      // survives a real teardown. We still attach a continuation: when the page
      // SURVIVES (e.g. visibilitychange backgrounding, not a real unload) it
      // runs and keeps _baseRev in sync — otherwise this keepalive save would
      // advance the server's rev while our _baseRev went stale, and the next
      // edit after returning to the tab would falsely 409. On a true unload the
      // continuation simply never runs (reload re-seeds _baseRev), which is fine.
      // The body compares texts, not hashes (no time to hash): every file
      // edited since the last save goes as text.
      const sentFor = this._workspaceId;
      const body = { ...this._saveBody(workspace), baseRev: this._baseRev };
      // Browsers refuse a keepalive request over 64 KB outright. A bigger
      // save goes as a plain request, which may still reach the server
      // before the page goes; the leave prompt warns meanwhile.
      const fits = new TextEncoder().encode(JSON.stringify(body)).length <= KEEPALIVE_MAX_BYTES;
      workspaceApi
        .update(sentFor, body, { keepalive: fits })
        .then(async (result) => {
          // Another workspace (or session) bound meanwhile: this answer isn't about it.
          if (!this._bound(token)) return;
          const rev = (result as { rev?: number } | null)?.rev;
          if (typeof rev === 'number') {
            this._baseRev = rev;
            this._crossingRetried = false;
            // Content is now persisted; settle local dirty state and the pill so
            // we don't re-warn/re-send when the tab is restored.
            this._recordSaved(workspace, new Map());
            this._settle(workspace);
            store.set('saveStatus', this._pendingWorkspace ? SaveStatus.MODIFIED : SaveStatus.SAVED);
            // The page survived: hash what was sent, so the next save finds it
            // unchanged and sends unchanged files by hash. A normal save
            // waits for this (`answered` runs in `finally`, after the hash).
            const { hash, shas } = await workspaceHash(workspace);
            if (!this._bound(token)) return;
            this._lastSavedHash = hash;
            this._recordSaved(workspace, shas);
          }
        })
        .catch((err: unknown) => {
          if (!this._bound(token)) return;
          // Our own two requests crossing (one of ours was out with this one,
          // or a later teardown save went after it): the 409 is theirs, not
          // another tab's. What this one carried stays pending until saved,
          // and a save alone, after, shows a real conflict.
          const ours = crossed || this._teardowns !== teardown;
          // Surface a conflict the same way the normal path does — otherwise a
          // visibilitychange 409 would silently halt autosave (no banner/pill).
          if (this._isConflictError(err) && !ours) {
            this._enterConflict();
            return;
          }
          // The page survived (else this never runs): save it the normal way.
          if (!this._isConflictError(err)) {
            console.error('Autosave (page-teardown save) failed:', err);
            store.update({ saveStatus: SaveStatus.ERROR, saveError: (err as Error).message });
          }
          if (this._pendingWorkspace) this._scheduleSave(DEBOUNCE_MS);
        })
        .finally(answered);
      return true;
    }

    // Conflicted: a normal/forced save (editor-blur, flush, Ctrl+S) would 409
    // against our stale baseRev and re-dispatch the conflict. It's already
    // surfaced; skip until the user reloads (which re-inits at the latest rev).
    if (this._conflicted) {
      return false;
    }

    // Force save regardless of interval
    this._lastSaveTime = 0;
    return this._saveInTurn();
  }

  // True when there is unsaved code (a pending edit, a save scheduled, or a
  // failed save). Used by the unload guard to decide whether to warn the user
  // before they leave.
  hasUnsavedChanges(): boolean {
    if (!this._isEnabled || !this._workspaceId) return false;
    if (this._pendingWorkspace !== null) return true;
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
