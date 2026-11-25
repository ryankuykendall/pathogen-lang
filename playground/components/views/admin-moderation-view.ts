// Admin Moderation View — workspace publication queues + state controls.
// Route: /admin/moderation
//
// Visible only to users whose current `features` array includes
// `admin-moderation` (server-gated by ADMIN_EMAILS). For anyone else the
// view shows a neutral "Not authorized" panel — we don't surface admin
// surface area to non-admins.
//
// Tabs:
//   Pending review      — queue:review entries (first-time submissions)
//   Re-review           — queue:rereview entries (code drift on approved)
//   Approved            — approval:* records (the moderated catalog)
//   Featured            — featured:workspaces (curated subset of approved)
//   Rejected            — rejection:* records (with internal notes)
//   Flagged workspaces  — queue:flagged-workspaces
//   Flagged users       — queue:flagged-users
//
// Each card carries a thumbnail (R2 manual/auto thumbnail when available,
// or a compile-on-demand inline SVG render otherwise) plus per-tab state
// controls. The "Review" action opens a modal with a full <mini-workspace>
// embed so the admin can read the code and inspect the rendered SVG before
// making a decision.
//
// A queue entry (2e step 5e; mockups v12 R1 to R6): its source comes from the
// listing (one file) or GET /admin/review/:id/source, and the card, the modal and
// Approve all read it. The main is compiled with its imports; Approve waits for
// the source, stays off while a file can't be read, and names the version it saw.

import { thumbnailApi } from '../../services/api.js';
import { hasFeature, UserFeature, type CurrentUser } from '../../services/auth.js';
import compilerWorker from '../../services/compiler-worker.js';
import thumbnailService from '../../services/thumbnail-service.js';
import { store } from '../../state/store.js';
import {
  changeLines,
  changesSummary,
  reviewCompileInput,
  reviewFileCount,
  sourceFromAnswer,
  sourceFromListing,
  unreadableFiles,
  withFilesRead,
} from '../../utils/review-entry.js';
import { fetchReader } from '../../utils/deferred-files.js';
import { reviewViewerFiles } from '../../utils/review-viewer-files.js';
import { dimensionsOrDefault } from '../../utils/source-dimensions.js';
import { computeOriginNormalization } from '../../utils/svg-origin.js';
// Side-effect import: register the <mini-workspace> custom element so the
// review modal can mount one. The component is already loaded for blog
// pages; pulling it in here keeps the admin route self-sufficient.
import '../blog/mini-workspace.js';
import { MARK_CHG_COLOR, MARK_DOT_STYLES, markDot, SourceFiles } from '../shared/source-files.js';
// Side-effect import: register <thumbnail-crop-modal> for the admin
// "Set thumbnail" action on Approved/Featured cards.
import type ThumbnailCropModal from '../thumbnail-crop-modal.js';
import '../thumbnail-crop-modal.js';

import type { MiniWorkspace, MiniWorkspaceFiles } from '../blog/mini-workspace.js';
import type { WorkspaceCompileInput } from '../../services/compiler-worker.js';
import type { FilesAnswer, ListedEntry, ReviewSource } from '../../utils/review-entry.js';
import type { SnapshotFilesEngine } from '../../utils/snapshot-viewer-files.js';

declare const __PATHOGEN_API_BASE__: string;
const API_BASE = __PATHOGEN_API_BASE__;

/** GET /admin/approval/:id's answer, as far as this screen reads it. */
interface ApprovalAnswer extends FilesAnswer {
  error?: string;
}

/**
 * An admin's reader of a workspace's files by hash: a data file an answer
 * left deferred (phase 3a). The route serves an admin any file the workspace
 * ever named, a submission's or an approval's.
 */
const adminFileReader = (workspaceId: string): ((sha256: string) => Promise<string>) =>
  fetchReader((sha256) => `${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/file/${sha256}`, {
    credentials: 'include',
  });

/** The engine's calls the viewer's files need, once the library has loaded. */
function engine(): SnapshotFilesEngine | null {
  const lib = (window as { PathogenLang?: Partial<SnapshotFilesEngine> }).PathogenLang;
  return typeof lib?.isModuleSource === 'function' && typeof lib.workspaceProjectFileText === 'function'
    ? (lib as SnapshotFilesEngine)
    : null;
}

type QueueTab = 'pending' | 'rereview';

/** A queue entry's source, as the screen holds it. */
type SourceState =
  { status: 'loading' } | { status: 'ready'; source: ReviewSource } | { status: 'failed'; error: string };

/** The review modal's parts, made when it opens. */
interface ReviewModal {
  /** Its entry: _entryKey for a queue entry, _svgKey for a catalog one. */
  key: string;
  backdrop: HTMLElement;
  /** The box saying what changed since the approved version (a re-review). */
  changes: HTMLElement;
  /** The drawing and files, or a message. */
  main: HTMLElement;
  /** The viewer shown, if any: the box's lines open files in it. */
  viewer: MiniWorkspace | SourceFiles | null;
}

/** What the card and the modal say when an entry's files couldn't be read (v12 R5, R6). */
const LOST_CARD =
  'The submitted files couldn’t be read, so there’s nothing to review. Approve is off until they load: refresh to try again.';
const LOST_MODAL =
  '<b>The submitted files couldn’t be read.</b> There’s nothing to review yet, so Approve is off on the card. Refresh the page to try again.';
const LOST_APPROVE = 'Approve needs the files, and they couldn’t be read';
const LOADING_APPROVE = 'Approve waits for the submitted files to load';
const MARK_WORD = { new: 'new', changed: 'changed', moved: 'moved', removed: 'removed' } as const;

/** The first file of an approval whose bytes couldn't be read (2e step 5d), if any. */
function unreadablePath(answer: ApprovalAnswer): string | null {
  // A deferred file not read counts: it's never shown or compiled as empty.
  return Object.entries(answer.files ?? {}).find(([, file]) => typeof file.text !== 'string')?.[0] ?? null;
}

// ─── Tab + card data shapes ───────────────────────────────────────────

// A Pending review or Re-review entry. An entry that is just main.pathogen carries
// its text (`code`, and in `files`); one with several files carries its manifest;
// one whose files the listing couldn't read carries `sourceError`. A re-review says
// what changed since the approved version (`changes`, or `changesError`).
interface QueueEntry extends ListedEntry {
  userId: string;
  description: string;
  slug: string;
  submittedAt: string;
  ownerHandle: string | null;
  ownerDisplayName: string | null;
  ownerFlagged: boolean;
  sourceError?: string;
}

interface ApprovedEntry {
  workspaceId: string;
  userId: string;
  name: string;
  description: string;
  slug: string;
  ownerHandle: string | null;
  ownerFlagged: boolean;
  /** Null for a record the API can't read (from before phase 2: note 71). */
  codeHash: string | null;
  approvedAt: string;
  featuredAt: string | null;
  thumbnailAt: string | null;
  // The approved card (website/api/approval-card.ts): a time, null for none,
  // absent for an approval from before the card copy (the live thumbnail).
  cardAt?: string | null;
  hasSvg: boolean;
}

interface FeaturedEntry extends ApprovedEntry {}

interface RejectedEntry {
  workspaceId: string;
  userId: string | null;
  name: string | null;
  ownerHandle: string | null;
  ownerFlagged: boolean;
  thumbnailAt: string | null;
  codeHash: string | null;
  rejectedAt: string;
  internalNotes: string;
}

interface FlaggedWorkspaceEntry {
  workspaceId: string;
  name: string;
  /** Null for a record the API can't read (from before phase 2: note 71). */
  codeHash: string | null;
  ownerHandle: string | null;
  ownerUserId: string;
  ownerFlagged: boolean;
  thumbnailAt: string | null;
}

interface FlaggedUserEntry {
  userId: string;
  handle: string;
  displayName: string;
  flagNotes: string | null;
}

type Tab =
  | 'pending'
  | 'rereview'
  | 'approved'
  | 'featured'
  | 'rejected'
  | 'flagged-workspaces'
  | 'flagged-users';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending review' },
  { id: 'rereview', label: 'Re-review' },
  { id: 'approved', label: 'Approved' },
  { id: 'featured', label: 'Featured' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'flagged-workspaces', label: 'Flagged workspaces' },
  { id: 'flagged-users', label: 'Flagged users' },
];

// ─── Component ────────────────────────────────────────────────────────

class AdminModerationView extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;
  private _unsubscribeUser: (() => void) | null = null;
  private _tab: Tab = 'pending';

  private _pending: QueueEntry[] = [];
  private _rereview: QueueEntry[] = [];
  private _approved: ApprovedEntry[] = [];
  private _featured: FeaturedEntry[] = [];
  private _rejected: RejectedEntry[] = [];
  private _flaggedWorkspaces: FlaggedWorkspaceEntry[] = [];
  private _flaggedUsers: FlaggedUserEntry[] = [];

  private _loading: boolean = false;
  private _error: string | null = null;
  private _busy: Set<string> = new Set();

  // SVG rendered for each card: its thumbnail and, for a queue entry, the drawing
  // Approve sends, so nothing compiles twice. A catalog card's key is _svgKey
  // (`${tab}:${workspaceId}`); a queue entry's is _entryKey, which names its version
  // too, so a resubmitted entry is a new key, never the old drawing. '' is a failure.
  private _svg: Map<string, string> = new Map();

  // Compiles running, by key: Approve waits for one rather than starting another.
  private _svgInFlight = new Map<string, Promise<string | null>>();

  private _compilationCounter: number = 0;

  // Each queue entry's source (2e step 5e), by _entryKey. A failed load stays failed
  // until Refresh (a new listing), so a render never refetches.
  private _sources = new Map<string, SourceState>();

  private _sourceLoads = new Map<string, Promise<SourceState>>();

  // The shadow root's parts: render() rewrites the screen only, so the review modal
  // (at most one) keeps the file being read while thumbnails finish.
  private _screen: HTMLElement | null = null;

  private _modalHost: HTMLElement | null = null;

  private _modal: ReviewModal | null = null;

  private _themeWatch: MutationObserver | null = null;

  // Reject form state per workspace.
  private _rejectingId: string | null = null;
  private _rejectionNotes: Map<string, string> = new Map();

  // Crop modal for the admin "Set thumbnail" action. Mounted once on
  // document.body — NOT inside this shadow root, because render() wipes
  // shadowRoot.innerHTML on every state change and would destroy the
  // modal mid-crop. The modal is position:fixed and fully self-styled,
  // so a light-DOM mount is safe.
  private _cropModal: ThumbnailCropModal | null = null;

  // Guards the fetch/compile window before the shared modal opens, so two
  // different cards' "Set thumbnail" clicks can't race onto one instance.
  private _setThumbnailOpening = false;

  private _onThumbnailUpdated: ((e: Event) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._unsubscribe = store.subscribe(['currentView'], () => {
      if (store.get('currentView') === 'admin-moderation') {
        this._loadIfAdmin();
      } else {
        // Views persist across SPA navigation (only `.active` toggles), so
        // disconnectedCallback won't fire — close the body-mounted crop
        // modal explicitly or its fixed overlay would sit on top of the
        // next view.
        this._cropModal?.close();
      }
    });
    this._unsubscribeUser = store.subscribe(['currentUser'], () => {
      if (store.get('currentView') === 'admin-moderation') this._loadIfAdmin();
    });
    this._onThumbnailUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { workspaceId?: string; cardAt?: string } | undefined;
      if (detail?.workspaceId) this._reflectThumbnailUpdate(detail.workspaceId, detail.cardAt);
    };
    document.addEventListener('thumbnail-updated', this._onThumbnailUpdated);
    // The changes box's badges follow the theme (the viewer's own do the same).
    this._themeWatch = new MutationObserver(() => this._syncTheme());
    this._themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-theme'] });
    if (store.get('currentView') === 'admin-moderation') this._loadIfAdmin();
  }

  disconnectedCallback(): void {
    this._themeWatch?.disconnect();
    this._themeWatch = null;
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._unsubscribeUser?.();
    this._unsubscribeUser = null;
    if (this._onThumbnailUpdated) {
      document.removeEventListener('thumbnail-updated', this._onThumbnailUpdated);
      this._onThumbnailUpdated = null;
    }
    this._cropModal?.remove();
    this._cropModal = null;
  }

  /**
   * The shadow root's three parts, made once: the styles, the screen render() rewrites,
   * and the review modal's host, which only opening and closing the modal touch.
   */
  private _shell(): HTMLElement {
    if (this._screen) return this._screen;
    const style = document.createElement('style');
    style.textContent = this._styles();
    this._screen = document.createElement('div');
    this._screen.className = 'screen';
    this._modalHost = document.createElement('div');
    this._modalHost.className = 'modal-host';
    this.shadowRoot!.replaceChildren(style, this._screen, this._modalHost);
    this._syncTheme();
    return this._screen;
  }

  /** The screen's own colours (the error panels, badges, Reject, the changes box) follow the theme. */
  private _syncTheme(): void {
    const dark = document.documentElement.getAttribute('data-active-theme') === 'dark';
    this._screen?.classList.toggle('dark', dark);
    this._modalHost?.classList.toggle('dark', dark);
  }

  // Lazily create the body-mounted crop modal.
  private _ensureCropModal(): ThumbnailCropModal {
    if (!this._cropModal?.isConnected) {
      this._cropModal = document.createElement('thumbnail-crop-modal') as ThumbnailCropModal;
      document.body.appendChild(this._cropModal);
    }
    return this._cropModal;
  }

  // After a thumbnail save (crop modal dispatches 'thumbnail-updated'),
  // repaint the card with the fresh image: stamp cardAt for the approval's
  // card, else thumbnailAt (either drives the cache-busted img URL), and drop
  // the cached compile, which would otherwise shadow the R2 image.
  private _reflectThumbnailUpdate(workspaceId: string, cardAt?: string): void {
    const entries = [
      this._approved.find((x) => x.workspaceId === workspaceId),
      this._featured.find((x) => x.workspaceId === workspaceId),
    ].filter((x): x is ApprovedEntry => Boolean(x));
    if (entries.length === 0) return;
    const stamp = new Date().toISOString();
    for (const entry of entries) {
      if (cardAt) entry.cardAt = cardAt;
      else entry.thumbnailAt = stamp;
    }
    this._svg.delete(this._svgKey('approved', workspaceId));
    this._svg.delete(this._svgKey('featured', workspaceId));
    this.render();
  }

  private _isAdmin(): boolean {
    return hasFeature(store.get('currentUser') as CurrentUser | null, UserFeature.AdminModeration);
  }

  private async _loadIfAdmin(): Promise<void> {
    if (!this._isAdmin()) {
      this.render();
      return;
    }
    // Fetch every queue in parallel so tab counts are accurate
    // immediately — otherwise labels stay at zero for tabs the admin
    // hasn't clicked yet.
    await this._loadAllTabs();
  }

  // Fetch every queue concurrently on initial load (via _loadIfAdmin) so
  // every tab's count is accurate up front, then bound-compile thumbnails
  // for the active tab only. Mutating actions no longer call this — they
  // mutate the active tab locally and let other tabs re-fetch on visit.
  private async _loadAllTabs(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.render();
    await Promise.all(TABS.map((t) => this._fetchTab(t.id).catch(() => null)));
    this._loading = false;
    this.render();
    this._compileThumbnailsForCurrentTab();
  }

  // Fetch a single tab's data without flipping the global loading
  // indicator. Used by both _loadAllTabs (parallel) and the per-tab
  // refresh button.
  private async _fetchTab(tab: Tab): Promise<void> {
    const path = this._queuePath(tab);
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    if (res.status === 401) {
      this._error = 'Not authorized.';
      return;
    }
    const data = (await res.json()) as { entries?: unknown[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'Request failed');
    const entries = (data.entries || []) as unknown[];
    switch (tab) {
      case 'pending': this._pending = entries as QueueEntry[]; break;
      case 'rereview': this._rereview = entries as QueueEntry[]; break;
      case 'approved': this._approved = entries as ApprovedEntry[]; break;
      case 'featured': this._featured = entries as FeaturedEntry[]; break;
      case 'rejected': this._rejected = entries as RejectedEntry[]; break;
      case 'flagged-workspaces': this._flaggedWorkspaces = entries as FlaggedWorkspaceEntry[]; break;
      case 'flagged-users': this._flaggedUsers = entries as FlaggedUserEntry[]; break;
    }
  }

  // Tab id → server queue path. `pending` is `/admin/queue/review` because
  // the underlying KV key is `queue:review` (first-time submissions); the
  // tab label is `Pending review` but the path predates the rename.
  private _queuePath(tab: Tab): string {
    if (tab === 'pending') return '/admin/queue/review';
    return `/admin/queue/${tab}`;
  }

  private async _loadTab(tab: Tab): Promise<void> {
    this._loading = true;
    this._error = null;
    this.render();
    try {
      await this._fetchTab(tab);
      this._forgetStaleSources();
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
      this.render();
      this._compileThumbnailsForCurrentTab();
    }
  }

  // ─── SVG capture / thumbnail compile ────────────────────────────────

  private _svgKey(tab: Tab, workspaceId: string): string {
    return `${tab}:${workspaceId}`;
  }

  /** A queue entry's key: its tab, workspace and version, so a resubmission is a new entry. */
  private _entryKey(tab: QueueTab, e: QueueEntry): string {
    return `${tab}:${e.workspaceId}:${e.codeHash}`;
  }

  private _queueEntries(tab: QueueTab): QueueEntry[] {
    return tab === 'pending' ? this._pending : this._rereview;
  }

  /**
   * After a queue is listed again (Refresh, a tab visit, a decision refused): a load
   * that failed is tried again, and versions no longer listed are dropped with their
   * drawings. Files that can't be read come back so, from the server.
   */
  private _forgetStaleSources(): void {
    const listed = new Set(
      (['pending', 'rereview'] as const).flatMap((tab) => this._queueEntries(tab).map((e) => this._entryKey(tab, e))),
    );
    for (const [key, state] of this._sources) {
      if (state.status === 'loading') continue;
      if (state.status === 'failed' || !listed.has(key)) {
        this._sources.delete(key);
        if (!listed.has(key)) this._svg.delete(key);
      }
    }
  }

  /** The source didn't load, or a file in it couldn't be read: nothing to review. */
  private _isLost(state: SourceState | undefined): boolean {
    return state?.status === 'failed' || (state?.status === 'ready' && unreadableFiles(state.source).length > 0);
  }

  /**
   * An entry's source: from the listing when it carries the text (one file), else
   * GET /admin/review/:id/source. Once a version; a failure is kept until Refresh.
   * The state is set before the first await, so a render right after shows it loading.
   */
  private async _entrySource(tab: QueueTab, e: QueueEntry): Promise<SourceState> {
    const key = this._entryKey(tab, e);
    const known = this._sources.get(key);
    if (known && known.status !== 'loading') return known;
    const running = this._sourceLoads.get(key);
    if (running) return running;
    const listed = sourceFromListing(e);
    if (listed) {
      const ready: SourceState = { status: 'ready', source: listed };
      this._sources.set(key, ready);
      return ready;
    }
    this._sources.set(key, { status: 'loading' });
    const load = this._fetchSource(tab, e.workspaceId).then((state) => {
      this._sources.set(key, state);
      this._sourceLoads.delete(key);
      return state;
    });
    this._sourceLoads.set(key, load);
    return load;
  }

  private async _fetchSource(tab: QueueTab, workspaceId: string): Promise<SourceState> {
    const queue = tab === 'pending' ? 'review' : 'rereview';
    try {
      const res = await fetch(`${API_BASE}/admin/review/${encodeURIComponent(workspaceId)}/source?queue=${queue}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as ReviewSource & { error?: string };
      if (!res.ok) return { status: 'failed', error: data.error || `HTTP ${res.status}` };
      // Its deferred data files, read by hash; one that can't be read keeps Approve off.
      return { status: 'ready', source: await withFilesRead(data, adminFileReader(workspaceId)) };
    } catch (err) {
      return { status: 'failed', error: (err as Error).message };
    }
  }

  /** An entry's drawing: its main compiled with its imports. Null with a file unread or no program. */
  private async _compileSource(key: string, source: ReviewSource): Promise<string | null> {
    const input = reviewCompileInput(source);
    if (!input) return null;
    return this._compileSvg(input.text, key, input.workspace);
  }

  /**
   * Compile a program into a card's SVG, once a key; a compile already running is
   * waited for. A workspace's other files are where its imports come from.
   */
  private async _compileSvg(
    code: string | undefined,
    key: string,
    workspace?: WorkspaceCompileInput,
  ): Promise<string | null> {
    if (this._svg.has(key)) return this._svg.get(key) || null;
    const running = this._svgInFlight.get(key);
    if (running) return running;
    // Empty / whitespace-only code can't produce a meaningful render —
    // generateSvg returns an SVG with an empty <path d="" />. Mark it
    // failed up-front so the modal goes straight to the source-and-error
    // state instead of showing a blank preview.
    if (!code?.trim()) {
      this._svg.set(key, '');
      return null;
    }
    const compile = this._runCompile(code, key, workspace).finally(() => this._svgInFlight.delete(key));
    this._svgInFlight.set(key, compile);
    return compile;
  }

  private async _runCompile(code: string, key: string, workspace?: WorkspaceCompileInput): Promise<string | null> {
    try {
      const id = ++this._compilationCounter;
      const result = (await compilerWorker.compileWithContext(
        code,
        id,
        undefined,
        workspace ? { workspace } : undefined,
      )) as Record<string, unknown>;
      // The global is named `PathogenLang` (tsup.config.ts globalName).
      // generateSvg accepts the CompileResult shape and returns an
      // <svg>…</svg> string. compileWithContext returns a superset of
      // CompileResult so the call site shape-matches.
      const lib = (
        window as unknown as { PathogenLang?: { generateSvg?: (r: unknown, o: unknown) => string } }
      ).PathogenLang;
      if (!lib?.generateSvg) {
        console.warn('[admin-moderation] PathogenLang.generateSvg not available on window');
        this._svg.set(key, '');
        return null;
      }
      // Read viewBox / width / height from the workspace source's
      // `// viewBox="0 0 W H"` comment (same convention the CLI and
      // BBWP pipeline use). Hardcoding 200x200 here squashed wider
      // workspaces (e.g. the 600x480 Clifford attractor) into a square
      // mat at approval time, which then got baked into approval.svg
      // and displayed wrong on the detail page. dimensionsOrDefault
      // falls back to 200x200 only when no comment is present.
      const dims = dimensionsOrDefault(code);
      const svg = lib.generateSvg(result, dims);
      this._svg.set(key, svg);
      return svg;
    } catch (err) {
      console.warn('[admin-moderation] svg compile failed for', key, err);
      // Cache failure as empty string so we don't retry on every render.
      this._svg.set(key, '');
      return null;
    }
  }

  // Bounded source load and thumbnail compile for the current tab. Only the
  // queue tabs (Pending / Re-review) have sources to compile — they have no
  // R2 thumbnail to fall back on, so without this a freshly-submitted
  // card shows only a letter avatar until the admin opens it. The
  // catalog tabs (Approved/Featured/Rejected/Flagged) have no source on
  // the listing and degrade to the R2 thumbnail or avatar via
  // _renderThumb, so they're skipped entirely. Each job loads the entry's
  // source first (Approve waits for it), then compiles its main.
  //
  // The previous version compiled every queue card eagerly with no
  // ceiling, so a single slow-to-compile workspace (~14s) blocked the
  // whole tab. This version caps concurrency at 2 and races each job
  // against a ~4s timer: when the timer wins, the slot frees and the
  // card stays on its avatar. The worker call can't truly be cancelled,
  // so the real compile still resolves later, populates `_svg`, and
  // renders the thumbnail late — we just stop blocking on it. The
  // `_svg` / `_svgInFlight` memoization dedups the late finish.
  private _compileThumbnailsForCurrentTab(): void {
    const tab = this._tab;
    if (tab !== 'pending' && tab !== 'rereview') return;

    const jobs = this._queueEntries(tab).filter((e) => !this._svg.has(this._entryKey(tab, e)));
    if (jobs.length === 0) return;

    const COMPILE_TIMEOUT_MS = 4000;
    const MAX_CONCURRENT = 2;
    let next = 0;

    const runWorker = async (): Promise<void> => {
      while (next < jobs.length) {
        const entry = jobs[next++];
        // Re-render once the source arrives (Approve follows it) and once the
        // real compile finishes, whether or not we're still waiting on it.
        const compile = this._entrySource(tab, entry)
          .then(async (state) => {
            this.render();
            return state.status === 'ready' ? this._compileSource(this._entryKey(tab, entry), state.source) : null;
          })
          .then(() => this.render());
        const timer = new Promise<void>((resolve) => setTimeout(resolve, COMPILE_TIMEOUT_MS));
        // Stop blocking after the timeout; the card falls back to its
        // avatar until (if ever) the slow compile resolves.
        await Promise.race([compile, timer]);
      }
    };

    for (let i = 0; i < Math.min(MAX_CONCURRENT, jobs.length); i++) void runWorker();
  }

  // ─── Actions ────────────────────────────────────────────────────────

  // Approve: simplified card — admin clicks Approve. Featuring is a
  // separate action available on the Approved tab.
  private async _approve(workspaceId: string): Promise<void> {
    const tab = this._tab;
    if (this._busy.has(workspaceId) || (tab !== 'pending' && tab !== 'rereview')) return;
    const entry = this._queueEntries(tab).find((e) => e.workspaceId === workspaceId);
    const key = entry ? this._entryKey(tab, entry) : '';
    const state = this._sources.get(key);
    // The button is off until the files have loaded, and while any of them can't be read.
    if (!entry || state?.status !== 'ready' || this._isLost(state)) return;
    this._busy.add(workspaceId);
    this.render();
    try {
      // The drawing of the files reviewed, and their version: if the owner saved
      // since, the server decides nothing (`changed`). A drawing that doesn't
      // compile is approved without one, as before.
      const svg = await this._compileSource(key, state.source);
      const body: Record<string, unknown> = { decision: 'approve', feature: false, codeHash: state.source.codeHash };
      if (svg) body.svg = svg;
      const res = await this._post(`/admin/review/${encodeURIComponent(workspaceId)}`, body);
      if (this._wasWithdrawn(workspaceId, res)) return;
      if (this._hadChanged(res)) return;
      if (!res.ok) throw new Error(res.error || 'Request failed');
      this._pending = this._pending.filter((e) => e.workspaceId !== workspaceId);
      this._rereview = this._rereview.filter((e) => e.workspaceId !== workspaceId);
      this._toast(`Approved: ${res.slug ?? workspaceId}`);
      // The local list mutations above keep the active tab correct; we
      // deliberately skip a full re-fetch+render of every tab here. The
      // old eager-compile path made that refresh janky, and other tabs'
      // counts self-correct when the admin visits them (_loadTab
      // re-fetches the destination). Cross-tab counts stay stale until
      // visited — an accepted trade for a responsive UI.
    } catch (err) {
      this._toast(`Approve failed: ${(err as Error).message}`, 'error');
    } finally {
      this._busy.delete(workspaceId);
      this.render();
    }
  }

  private async _reject(workspaceId: string): Promise<void> {
    if (this._busy.has(workspaceId)) return;
    const notes = this._rejectionNotes.get(workspaceId) || '';
    // The version reviewed, when its files loaded: a save since decides nothing.
    const tab = this._tab;
    const entry =
      tab === 'pending' || tab === 'rereview'
        ? this._queueEntries(tab).find((e) => e.workspaceId === workspaceId)
        : undefined;
    const state = entry ? this._sources.get(this._entryKey(tab as QueueTab, entry)) : undefined;
    this._busy.add(workspaceId);
    this.render();
    try {
      const res = await this._post(`/admin/review/${encodeURIComponent(workspaceId)}`, {
        decision: 'reject',
        internalNotes: notes,
        ...(state?.status === 'ready' ? { codeHash: state.source.codeHash } : {}),
      });
      if (this._wasWithdrawn(workspaceId, res)) {
        this._rejectingId = null;
        this._rejectionNotes.delete(workspaceId);
        return;
      }
      // The notes stay, for the version now waiting.
      if (this._hadChanged(res)) return;
      if (!res.ok) throw new Error(res.error || 'Request failed');
      this._pending = this._pending.filter((e) => e.workspaceId !== workspaceId);
      this._rereview = this._rereview.filter((e) => e.workspaceId !== workspaceId);
      this._rejectingId = null;
      this._rejectionNotes.delete(workspaceId);
      this._toast('Rejected');
      // See _approve: skip the full cross-tab refresh; counts on other
      // tabs self-correct on visit.
    } catch (err) {
      this._toast(`Reject failed: ${(err as Error).message}`, 'error');
    } finally {
      this._busy.delete(workspaceId);
      this.render();
    }
  }

  /**
   * A re-review the server withdrew rather than decided, because its workspace
   * isn't public any more (2e step 5a): it leaves the list, with the server's
   * reason as a notice rather than an error.
   */
  private _wasWithdrawn(workspaceId: string, res: { withdrawn?: boolean; error?: string }): boolean {
    if (!res.withdrawn) return false;
    this._rereview = this._rereview.filter((e) => e.workspaceId !== workspaceId);
    this._toast(res.error || 'This re-review was withdrawn.');
    return true;
  }

  /**
   * The owner saved after the entry was opened (2e step 5e): the server decided
   * nothing, and the tab reloads, so the version waiting now is what's reviewed.
   */
  private _hadChanged(res: { changed?: boolean; error?: string }): boolean {
    if (!res.changed) return false;
    this._toast(res.error || 'This submission changed after it was opened. Review the version waiting now.');
    this._closeReview();
    this._loadTab(this._tab);
    return true;
  }

  // Send an Approved or Rejected workspace back into the Pending review
  // queue. Server-side: drops the workspace from public + featured
  // indexes, pushes a queue:review entry, appends 'pending' state row.
  private async _requeue(workspaceId: string): Promise<void> {
    await this._simpleAction(workspaceId, `/admin/requeue/${encodeURIComponent(workspaceId)}`, 'POST', () => {
      this._approved = this._approved.filter((e) => e.workspaceId !== workspaceId);
      this._rejected = this._rejected.filter((e) => e.workspaceId !== workspaceId);
      this._toast('Sent back to pending review');
    });
  }

  private async _feature(workspaceId: string): Promise<void> {
    await this._simpleAction(workspaceId, `/admin/feature/${encodeURIComponent(workspaceId)}`, 'POST', () => {
      // Approved tab excludes featured workspaces — drop the entry
      // here; it'll show up in the Featured tab after refresh.
      this._approved = this._approved.filter((e) => e.workspaceId !== workspaceId);
      this._toast('Featured');
    });
  }

  private async _unfeature(workspaceId: string): Promise<void> {
    await this._simpleAction(workspaceId, `/admin/feature/${encodeURIComponent(workspaceId)}`, 'DELETE', () => {
      // Workspace falls back to Approved (still public, just not featured).
      this._featured = this._featured.filter((e) => e.workspaceId !== workspaceId);
      this._toast('Removed from featured');
    });
  }

  private async _flagWorkspace(workspaceId: string): Promise<void> {
    await this._simpleAction(workspaceId, `/admin/flag-workspace/${encodeURIComponent(workspaceId)}`, 'POST', () => {
      this._rejected = this._rejected.filter((e) => e.workspaceId !== workspaceId);
      this._toast('Workspace flagged');
    });
  }

  // Unflag the workspace; server transitions it to the Rejected state.
  private async _unflagWorkspace(workspaceId: string): Promise<void> {
    await this._simpleAction(workspaceId, `/admin/flag-workspace/${encodeURIComponent(workspaceId)}`, 'DELETE', () => {
      this._flaggedWorkspaces = this._flaggedWorkspaces.filter((e) => e.workspaceId !== workspaceId);
      this._toast('Unflagged → Rejected');
    });
  }

  // Flag a user. Per the simplified spec, flagging a user from the
  // Flagged Workspaces tab leaves the workspace where it is — we just
  // re-fetch so the "Flagged user" badge appears on the next render.
  // The cross-tab cascade (server-side removes the user's approvals
  // from public + featured indexes) still runs; the background refresh
  // picks up the updated state for every tab.
  private async _flagUser(userId: string): Promise<void> {
    await this._simpleAction(userId, `/admin/flag-user/${encodeURIComponent(userId)}`, 'POST', () => {
      this._toast('User flagged');
    });
  }

  private async _unflagUser(userId: string): Promise<void> {
    await this._simpleAction(userId, `/admin/flag-user/${encodeURIComponent(userId)}`, 'DELETE', () => {
      this._flaggedUsers = this._flaggedUsers.filter((e) => e.userId !== userId);
      this._toast('User unflagged');
    });
  }

  private async _simpleAction(
    key: string,
    path: string,
    method: 'POST' | 'DELETE',
    onSuccess: () => void,
  ): Promise<void> {
    if (this._busy.has(key)) return;
    this._busy.add(key);
    this.render();
    try {
      const res = await this._post(path, method === 'POST' ? {} : null, method);
      if (!res.ok) throw new Error(res.error || 'Request failed');
      onSuccess();
      // State-mutating actions can shift items between tabs (feature →
      // moves Approved → Featured; flag-user → drops entries from every
      // catalog tab; etc.). The onSuccess callback above applies the
      // optimistic mutation to the active tab; we no longer re-fetch
      // every tab here. Other tabs' counts go stale until visited, at
      // which point _loadTab re-fetches them — an accepted trade for
      // avoiding the janky full refresh.
    } catch (err) {
      this._toast(`Action failed: ${(err as Error).message}`, 'error');
    } finally {
      this._busy.delete(key);
      this.render();
    }
  }

  private async _post(
    path: string,
    body: Record<string, unknown> | null,
    method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  ): Promise<{ ok: boolean; error?: string; slug?: string; withdrawn?: boolean; changed?: boolean }> {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== null && method !== 'DELETE') init.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, init);
    let data: { error?: string; slug?: string; withdrawn?: boolean; changed?: boolean } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* empty */
    }
    return { ok: res.ok, ...data };
  }

  // Dispatch to <app-toast> (mounted in app-shell), which listens for
  // 'show-toast' and requires detail.title.
  private _toast(message: string, type: 'success' | 'error' = 'success'): void {
    document.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: { type, title: message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ─── Modal (mini-workspace review) ──────────────────────────────────

  // The modal is made when it opens and lives outside the screen render()
  // rewrites, so a thumbnail finishing behind it never resets the file being
  // read (2e step 5e). Opening another entry, or closing, replaces it.

  /** Open the modal on an entry, replacing any other, saying `waiting` until there's more to show. */
  private _openModal(key: string, title: string, waiting: string): ReviewModal {
    this._closeReview();
    this._shell();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${this._escapeHtml(`Review: ${title}`)}">
        <header class="modal-head">
          <h2>${this._escapeHtml(title)}</h2>
          <button class="ghost" data-action="close-modal">Close</button>
        </header>
        <div class="modal-body"><div class="modal-changes" hidden></div><div class="modal-main"></div></div>
      </div>`;
    // The backdrop or Close; a click inside the dialog stays there.
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || (e.target as Element).closest?.('[data-action="close-modal"]')) this._closeReview();
    });
    const modal: ReviewModal = {
      key,
      backdrop,
      changes: backdrop.querySelector<HTMLElement>('.modal-changes')!,
      main: backdrop.querySelector<HTMLElement>('.modal-main')!,
      viewer: null,
    };
    // The changes box's lines open the files they name.
    modal.changes.addEventListener('click', (e) => {
      const line = (e.target as Element).closest?.<HTMLElement>('[data-file]');
      if (line?.dataset.file) this._modalOpenFile(line.dataset.file);
    });
    this._modal = modal;
    this._modalHost!.replaceChildren(backdrop);
    this._modalMessage(modal, `<div class="modal-compiling">${this._escapeHtml(waiting)}</div>`);
    return modal;
  }

  private _modalMessage(modal: ReviewModal, html: string): void {
    modal.viewer = null;
    modal.main.innerHTML = html;
  }

  /** The drawing with every file, opening on the program drawn. */
  private _modalDrawing(modal: ReviewModal, title: string, svg: string, files: MiniWorkspaceFiles): void {
    const viewer = document.createElement('mini-workspace') as MiniWorkspace;
    viewer.setAttribute('caption', title);
    viewer.setAttribute('code-open', '');
    // Approving publishes every file, and the ↗ would carry one: hidden for
    // every entry until publishing points at a snapshot (note 61, answer 2).
    viewer.setAttribute('hide-playground-link', '');
    // The drawing first: the files' setter reads the size from it. It came
    // from this screen's own compile.
    viewer.innerHTML = svg;
    viewer.sourceFiles = files;
    modal.main.replaceChildren(viewer);
    modal.viewer = viewer;
  }

  /** No drawing (a compile that failed): the reason, and the files to read. */
  private _modalFilesOnly(modal: ReviewModal, reason: string, files: MiniWorkspaceFiles): void {
    modal.main.innerHTML = `<div class="modal-failed"><p class="modal-error">${this._escapeHtml(reason)}</p></div>`;
    const viewer = document.createElement('source-files') as SourceFiles;
    viewer.className = 'modal-files';
    viewer.files = files.files;
    viewer.folders = files.folders;
    viewer.main = files.main;
    viewer.open = files.open;
    viewer.marks = files.marks ?? null;
    modal.main.querySelector('.modal-failed')!.append(viewer);
    modal.viewer = viewer;
  }

  private _modalOpenFile(path: string): void {
    const viewer = this._modal?.viewer;
    if (viewer instanceof SourceFiles) viewer.open = path;
    else viewer?.openFile(path);
  }

  /** A re-review's box: what changed since the approved version, a line each (v12 R3, R4). */
  private _modalChanges(modal: ReviewModal, source: ReviewSource): void {
    const box = modal.changes;
    if (source.changesError) {
      box.innerHTML = `<h4>Couldn’t compare with the approved version, so nothing here says what changed.</h4>`;
      box.hidden = false;
      return;
    }
    if (!source.changes) {
      box.hidden = true;
      return;
    }
    const { counts } = source.changes;
    const quiet = counts.new + counts.changed + counts.removed === 0;
    const when = source.approvedAt
      ? ` <span>(approved ${this._escapeHtml(this._fmtDay(source.approvedAt))})</span>`
      : '';
    const lines = changeLines(source.changes).map((line) => {
      const said = `${markDot(line.mark, MARK_WORD[line.mark])}${line.html}`;
      return `<li>${line.file ? `<button type="button" class="chg-open" data-file="${this._escapeHtml(line.file)}">${said}</button>` : `<span>${said}</span>`}</li>`;
    });
    box.innerHTML = `<h4>What changed since the approved version${when}${quiet ? '<span>. No file’s text changed.</span>' : ''}</h4>${
      lines.length > 0 ? `<ul>${lines.join('')}</ul>` : ''
    }`;
    box.hidden = false;
  }

  // Open the review modal on a queue entry (Pending review / Re-review): its
  // files as submitted, the main compiled with its imports, and for a
  // re-review what changed since the approved version. Files that can't be
  // read are said, in place of the viewer (v12 R6).
  private async _openQueueReview(tab: QueueTab, entry: QueueEntry): Promise<void> {
    const key = this._entryKey(tab, entry);
    const modal = this._openModal(key, entry.name, 'Loading the submitted files…');
    const state = await this._entrySource(tab, entry);
    if (this._modal !== modal) return; // closed, or another opened
    this.render(); // the card's Approve follows the source
    if (state.status !== 'ready' || this._isLost(state)) {
      this._modalMessage(modal, `<div class="why big">${LOST_MODAL}</div>`);
      return;
    }
    const { source } = state;
    this._modalChanges(modal, source);
    if (!this._svg.has(key)) this._modalMessage(modal, '<div class="modal-compiling">Compiling preview…</div>');
    const svg = await this._compileSource(key, source);
    if (this._modal !== modal) return;
    this.render(); // the card's thumbnail
    const files = reviewViewerFiles(source, engine());
    if (svg) this._modalDrawing(modal, entry.name, svg, files);
    else this._modalFilesOnly(modal, 'This drawing didn’t compile, so there’s no preview. Its files are below.', files);
  }

  // Open the review modal from an Approved/Featured card. Fetches the
  // frozen approval record via the admin endpoint so we get its files
  // (immutable, what visitors see) plus approval.svg (when present,
  // pre-rendered by the admin at approval time).
  private async _openReviewFromApprovalRecord(workspaceId: string, name: string): Promise<void> {
    const key = this._svgKey('approved', workspaceId);
    const modal = this._openModal(key, name, 'Loading the approved files…');
    try {
      const res = await fetch(`${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}`, {
        credentials: 'include',
      });
      const answer = (await res.json()) as ApprovalAnswer & { svg?: string };
      if (!res.ok) throw new Error(answer.error || 'Failed to load approval');
      const data = await withFilesRead(answer, adminFileReader(workspaceId));
      if (this._modal !== modal) return;
      // A file whose bytes are lost (2e step 5d) is said, never shown empty.
      const lost = unreadablePath(data);
      if (lost) throw new Error(`${lost} couldn't be read.`);
      const source = sourceFromAnswer(workspaceId, name, data);
      const files = reviewViewerFiles(source, engine());
      // Frozen SVG preferred. If absent (legacy approval), try a
      // background compile; if THAT fails, fall through to the files alone.
      if (data.svg && data.svg.length > 0) {
        this._modalDrawing(modal, name, data.svg, files);
        return;
      }
      this._modalMessage(modal, '<div class="modal-compiling">Compiling preview…</div>');
      const svg = await this._compileSource(key, source);
      if (this._modal !== modal) return;
      if (svg) {
        this._modalDrawing(modal, name, svg, files);
        // Silently backfill approval.svg on the server so the
        // /u/<handle>/<slug> detail page renders the live mini-workspace
        // preview next time someone visits. Best-effort — if the PUT
        // fails (network, KV error, etc.) the modal still works; the
        // backfill just doesn't happen this round.
        fetch(`${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}/svg`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ svg }),
        }).catch(() => null);
      } else if (files.files.length > 0) {
        this._modalFilesOnly(modal, 'No frozen SVG, and the approved files no longer compile. They are below.', files);
      } else {
        this._modalMessage(modal, '<p class="modal-error">Approval record is missing its source code.</p>');
      }
    } catch (err) {
      if (this._modal !== modal) return;
      this._modalMessage(modal, `<p class="modal-error">${this._escapeHtml((err as Error).message)}</p>`);
    }
  }

  // Regenerate the public preview (approval.svg → R2) and the approval's card
  // images (website/api/approval-card.ts) for an Approved/Featured workspace,
  // compiling from the FROZEN approval.code (what visitors actually see — not
  // the possibly-diverged live workspace). Heals entries whose preview was
  // dropped by the old 1 MB cap or that never got a card. The owner's live
  // thumbnail is left alone. The upload rides the session cookie; the card
  // upload (kind=approval) is an admin's.
  // Fetch the frozen approval record and compile it to a full-aspect SVG
  // string. Shared by "Regenerate preview" and "Set thumbnail" — both act
  // on the immutable approval source, never the live workspace code.
  private async _fetchAndCompileApproval(workspaceId: string): Promise<{
    result: Record<string, unknown>;
    svgString: string;
    dims: { viewBox: string; width: string; height: string };
    generateSvg: (r: unknown, o: unknown) => string;
  }> {
    // 1. Frozen approval record → immutable source.
    const res = await fetch(`${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}`, {
      credentials: 'include',
    });
    const answer = (await res.json()) as ApprovalAnswer;
    if (!res.ok) throw new Error(answer.error || 'Failed to load approval');
    const data = await withFilesRead(answer, adminFileReader(workspaceId));
    const lost = unreadablePath(data);
    if (lost) throw new Error(`${lost} couldn't be read, so it can't be compiled.`);
    // The main, compiled with its imports (2e step 5e): what the public page draws.
    const name =
      this._approved.find((x) => x.workspaceId === workspaceId)?.name ??
      this._featured.find((x) => x.workspaceId === workspaceId)?.name ??
      '';
    const input = reviewCompileInput(sourceFromAnswer(workspaceId, name, data));
    if (!input?.text.trim()) throw new Error('Approval record has no source code');

    // 2. Compile once; render the full-aspect preview.
    const id = ++this._compilationCounter;
    const result = (await compilerWorker.compileWithContext(input.text, id, undefined, {
      workspace: input.workspace,
    })) as Record<string, unknown>;
    const lib = (
      window as unknown as { PathogenLang?: { generateSvg?: (r: unknown, o: unknown) => string } }
    ).PathogenLang;
    if (!lib?.generateSvg) throw new Error('Compiler not available (PathogenLang.generateSvg missing)');
    const dims = dimensionsOrDefault(input.text);
    const svgString = lib.generateSvg(result, dims);
    if (!svgString || svgString.length === 0) throw new Error('Compile produced no SVG');
    return { result, svgString, dims, generateSvg: lib.generateSvg.bind(lib) };
  }

  private async _regenerate(workspaceId: string): Promise<void> {
    if (this._busy.has(workspaceId)) return;
    this._busy.add(workspaceId);
    this.render();
    try {
      const { result, svgString: previewSvg, dims, generateSvg } = await this._fetchAndCompileApproval(workspaceId);

      // 3. Preview → R2 (detail-page hero source). Best-effort: a gradient-heavy
      // workspace can bake GPU-rendered raster data into the SVG and exceed the
      // server's size cap (HTTP 400). That must NOT abort the thumbnail below —
      // the PNG thumbnail is the grid image and the detail-page hero fallback,
      // so it's the more important artifact for exactly these large pieces. The
      // backfill endpoint is registered as PUT (not POST) — see adminPutApprovalSvg.
      const put = await this._post(
        `/admin/approval/${encodeURIComponent(workspaceId)}/svg`,
        { svg: previewSvg },
        'PUT',
      );
      const previewOk = put.ok;
      const previewErr = put.ok ? '' : put.error || 'preview not stored';

      // 4. Uncropped, source-aspect hero PNG from the FULL preview SVG. Without
      // it, the detail page falls back to the square card, which distorts
      // non-square artwork (e.g. an 8000×4800 workspace squashed to 1:1). Before
      // the squares, whose new cardAt changes every card's URL. Best-effort: a
      // hero failure must not stop the squares.
      try {
        await thumbnailService.uploadHeroFromSvgString(
          workspaceId,
          previewSvg,
          Number(dims.width) || 0,
          Number(dims.height) || 0,
          { forApproval: true },
        );
      } catch (e) {
        console.warn('[regenerate] hero render failed (card unaffected):', e);
      }

      // 4b. Square-crop SVG → the card's PNGs (used on /explore + /featured).
      // Always attempt this, even if the preview PUT failed.
      const square = this._squareDims(dims.viewBox);
      const squareSvg = generateSvg(result, square);
      const card = (await thumbnailService.generateThumbnail(
        workspaceId,
        null as unknown as SVGElement,
        {},
        undefined,
        { svgString: squareSvg, kind: 'approval' },
      )) as { cardAt?: string } | null;
      const thumbOk = Boolean(card?.cardAt);

      if (!previewOk && !thumbOk) {
        throw new Error(previewErr || 'thumbnail generation was blocked or timed out');
      }

      // 5. Reflect immediately: bust the cached compile + stamp cardAt so
      // the card repaints with the fresh image.
      this._svg.delete(this._svgKey('approved', workspaceId));
      this._svg.delete(this._svgKey('featured', workspaceId));
      const entry =
        this._approved.find((x) => x.workspaceId === workspaceId) ??
        this._featured.find((x) => x.workspaceId === workspaceId);
      if (entry) {
        if (card?.cardAt) entry.cardAt = card.cardAt;
        if (previewOk) entry.hasSvg = true;
      }

      if (previewOk && thumbOk) this._toast('Regenerated preview + thumbnail');
      else if (previewOk) this._toast('Saved preview; thumbnail generation failed', 'error');
      else this._toast(`Updated thumbnail. Preview not stored: ${previewErr}`);
    } catch (err) {
      this._toast(`Regenerate failed: ${(err as Error).message}`, 'error');
    } finally {
      this._busy.delete(workspaceId);
      this.render();
    }
  }

  // "Set thumbnail" — open the interactive crop modal on a render of the
  // frozen approval code, targeting a workspace the admin doesn't own.
  // Saves the approval's card (target 'approval', kind=approval), which the
  // public pages show; the owner's live thumbnail is left alone. The element
  // path also re-uploads the card's hero from the same frozen SVG.
  private async _openSetThumbnail(workspaceId: string): Promise<void> {
    if (this._busy.has(workspaceId)) return;
    // One shared modal instance: don't let a second card's click race an
    // in-flight fetch/compile (last .open() would silently win) or clobber
    // a crop already in progress.
    if (this._setThumbnailOpening || this._cropModal?.isOpen) return;
    this._setThumbnailOpening = true;
    this._busy.add(workspaceId);
    this.render();
    try {
      const { svgString, dims } = await this._fetchAndCompileApproval(workspaceId);

      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Compiled SVG failed to parse');
      const svgEl = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;

      // The crop modal assumes a (0,0) viewBox origin throughout its crop
      // and pan/zoom math, but `define ViewBox` allows any origin — shift
      // the content so the origin lands on (0,0).
      const norm = computeOriginNormalization(dims.viewBox);
      svgEl.setAttribute('viewBox', `0 0 ${norm.width} ${norm.height}`);
      svgEl.setAttribute('width', String(norm.width));
      svgEl.setAttribute('height', String(norm.height));
      if (norm.translate) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', norm.translate);
        while (svgEl.firstChild) g.appendChild(svgEl.firstChild);
        svgEl.appendChild(g);
      }

      // generateSvg output has no background element, so the modal's
      // snapshot background override would no-op while the PNG rasterizer
      // white-fills. Insert an explicit #preview-bg rect so the crop
      // preview is WYSIWYG with the white PNG output.
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('id', 'preview-bg');
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(norm.width));
      bg.setAttribute('height', String(norm.height));
      bg.setAttribute('fill', '#ffffff');
      svgEl.insertBefore(bg, svgEl.firstChild);

      const name =
        this._approved.find((x) => x.workspaceId === workspaceId)?.name ??
        this._featured.find((x) => x.workspaceId === workspaceId)?.name;
      this._ensureCropModal().open(
        svgEl,
        { width: norm.width, height: norm.height, background: '#ffffff' },
        { workspaceId, context: 'admin', title: name, target: 'approval' },
      );
    } catch (err) {
      this._toast(`Set thumbnail failed: ${(err as Error).message}`, 'error');
    } finally {
      this._setThumbnailOpening = false;
      this._busy.delete(workspaceId);
      // Safe: the modal lives on document.body, outside this render cycle.
      this.render();
    }
  }

  // Centered square crop of a "x y w h" viewBox, as generateSvg dims. The
  // raster width/height mirror generateThumbnail's supersampling (≥1024,
  // capped at 4096) so the square PNGs come out crisp.
  private _squareDims(viewBox: string): { viewBox: string; width: string; height: string } {
    const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
    if (![vx, vy, vw, vh].every((n) => Number.isFinite(n)) || vw <= 0 || vh <= 0) {
      return { viewBox, width: '1024', height: '1024' };
    }
    const size = Math.min(vw, vh);
    const cropX = vx + (vw - size) / 2;
    const cropY = vy + (vh - size) / 2;
    const raster = Math.max(1024, Math.min(Math.ceil(size), 4096));
    return { viewBox: `${cropX} ${cropY} ${size} ${size}`, width: `${raster}`, height: `${raster}` };
  }

  private _closeReview(): void {
    this._modal = null;
    this._modalHost?.replaceChildren();
  }

  // ─── Render ─────────────────────────────────────────────────────────

  render(): void {
    const screen = this._shell();
    if (!this._isAdmin()) {
      this._closeReview();
      screen.innerHTML = `
        <main class="container">
          <h1>Moderation</h1>
          <div class="notice">This area is for reviewers only.</div>
        </main>
      `;
      return;
    }

    const tabsHtml = TABS.map((t) => {
      const count = this._tabCount(t.id);
      return `<button
        role="tab"
        aria-selected="${t.id === this._tab}"
        class="tab ${t.id === this._tab ? 'active' : ''}"
        data-tab="${t.id}"
      >${this._escapeHtml(t.label)}${count >= 0 ? ` (${count})` : ''}</button>`;
    }).join('');

    screen.innerHTML = `
      <main class="container">
        <header class="head">
          <h1>Moderation</h1>
          <button class="ghost refresh" data-action="refresh" ${this._loading ? 'disabled' : ''}>
            ${this._loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>
        <nav class="tabs" role="tablist">${tabsHtml}</nav>
        <section class="content">${this._renderTab()}</section>
      </main>
    `;
    this._wireEvents(screen);
  }

  private _tabCount(tab: Tab): number {
    switch (tab) {
      case 'pending': return this._pending.length;
      case 'rereview': return this._rereview.length;
      case 'approved': return this._approved.length;
      case 'featured': return this._featured.length;
      case 'rejected': return this._rejected.length;
      case 'flagged-workspaces': return this._flaggedWorkspaces.length;
      case 'flagged-users': return this._flaggedUsers.length;
    }
  }

  private _renderTab(): string {
    if (this._error) return `<div class="error">${this._escapeHtml(this._error)}</div>`;
    if (this._loading) return `<div class="empty">Loading…</div>`;
    switch (this._tab) {
      case 'pending': return this._renderQueueGrid(this._pending, 'pending');
      case 'rereview': return this._renderQueueGrid(this._rereview, 'rereview');
      case 'approved': return this._renderApprovedGrid();
      case 'featured': return this._renderFeaturedGrid();
      case 'rejected': return this._renderRejectedGrid();
      case 'flagged-workspaces': return this._renderFlaggedWorkspacesGrid();
      case 'flagged-users': return this._renderFlaggedUsersGrid();
    }
  }

  private _renderQueueGrid(entries: QueueEntry[], tab: 'pending' | 'rereview'): string {
    if (entries.length === 0) return `<div class="empty">Nothing to review.</div>`;
    return `<ul class="card-grid">${entries.map((e) => this._renderQueueCard(e, tab)).join('')}</ul>`;
  }

  // Queue card (Pending review + Re-review): two actions — Approve,
  // Reject. Review is reached by clicking the thumbnail. The drawing is the
  // main compiled with its imports; the meta line counts the files; a
  // re-review says what changed. Approve waits for the files, and stays off
  // while they can't be read (v12 R1, R2, R5).
  private _renderQueueCard(e: QueueEntry, tab: QueueTab): string {
    const busy = this._busy.has(e.workspaceId);
    const rejecting = this._rejectingId === e.workspaceId;
    const notesValue = this._rejectionNotes.get(e.workspaceId) || '';
    const state = this._sources.get(this._entryKey(tab, e));
    const lost = this._isLost(state);
    const ready = state?.status === 'ready' && !lost;
    const approveTitle = lost ? LOST_APPROVE : ready ? '' : LOADING_APPROVE;
    return `<li class="card">
      ${this._renderClickableThumb(this._entryKey(tab, e), null, e.workspaceId, tab)}
      <div class="card-body">
        <h2 class="card-title">${this._escapeHtml(e.name)} ${this._badge(e.ownerFlagged)}</h2>
        ${this._renderMeta(e.ownerHandle, e.userId, this._fmtDate(e.submittedAt), e.codeHash, reviewFileCount(e.files))}
        ${e.description ? `<p class="card-desc">${this._escapeHtml(e.description)}</p>` : ''}
        ${tab === 'rereview' ? this._changesLine(e) : ''}
        ${lost ? `<p class="why" id="why-${this._escapeHtml(e.workspaceId)}">${LOST_CARD}</p>` : ''}
        ${
          rejecting
            ? `
          <div class="reject-form">
            <label>Internal notes (not shown to the owner)</label>
            <textarea data-action="reject-notes" data-id="${this._escapeHtml(e.workspaceId)}" rows="3" placeholder="Why was this rejected?">${this._escapeHtml(notesValue)}</textarea>
            <div class="actions">
              <button class="danger" data-action="reject-confirm" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>${busy ? 'Rejecting…' : 'Confirm reject'}</button>
              <button class="ghost" data-action="reject-cancel" data-id="${this._escapeHtml(e.workspaceId)}">Cancel</button>
            </div>
          </div>
        `
            : `
          <div class="actions">
            <button class="primary" data-action="approve" data-id="${this._escapeHtml(e.workspaceId)}" ${busy || !ready ? 'disabled' : ''}${approveTitle ? ` title="${this._escapeHtml(approveTitle)}"` : ''}${lost ? ` aria-describedby="why-${this._escapeHtml(e.workspaceId)}"` : ''}>${busy ? '…' : 'Approve'}</button>
            <button class="danger-outline" data-action="reject-start" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Reject</button>
          </div>
        `
        }
      </div>
    </li>`;
  }

  /** A re-review card's line: what changed since the approved version, counted (v12 R3, R4). */
  private _changesLine(e: QueueEntry): string {
    if (e.changes) {
      return `<p class="card-chg">Since the approved version: <b>${this._escapeHtml(changesSummary(e.changes))}</b></p>`;
    }
    if (e.changesError) return `<p class="card-chg">Couldn’t compare with the approved version.</p>`;
    return '';
  }

  private _renderApprovedGrid(): string {
    if (this._approved.length === 0) return `<div class="empty">No approved workspaces.</div>`;
    return `<ul class="card-grid">${this._approved.map((e) => this._renderCatalogCard(e, 'approved')).join('')}</ul>`;
  }

  private _renderFeaturedGrid(): string {
    if (this._featured.length === 0) return `<div class="empty">Nothing currently featured.</div>`;
    return `<ul class="card-grid">${this._featured.map((e) => this._renderCatalogCard(e, 'featured')).join('')}</ul>`;
  }

  // Catalog card (Approved + Featured).
  //   Approved → 2 actions: "Pending review" (requeue), "Feature"
  //   Featured → 1 action:  "Unfeature"
  // Review is reached by clicking the thumbnail.
  private _renderCatalogCard(e: ApprovedEntry, tab: 'approved' | 'featured'): string {
    const busy = this._busy.has(e.workspaceId);
    return `<li class="card">
      ${this._renderClickableCatalogThumb(this._svgKey(tab, e.workspaceId), e.thumbnailAt, e.workspaceId, e.name, e.cardAt)}
      <div class="card-body">
        <h2 class="card-title">${this._escapeHtml(e.name)} ${tab === 'featured' ? '<span class="badge">★ featured</span>' : ''} ${this._badge(e.ownerFlagged)}</h2>
        ${this._renderMeta(e.ownerHandle, e.userId, `approved ${this._fmtDate(e.approvedAt)}`, e.codeHash)}
        ${e.description ? `<p class="card-desc">${this._escapeHtml(e.description)}</p>` : ''}
        <div class="actions">
          ${
            tab === 'approved'
              ? `
                <button class="ghost" data-action="requeue" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Pending review</button>
                <button class="primary" data-action="feature" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Feature</button>
              `
              : `
                <button class="ghost" data-action="unfeature" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Unfeature</button>
              `
          }
          <button class="ghost" data-action="regenerate" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''} title="Recompile from the frozen approval source and refresh the public preview + thumbnail">${busy ? 'Regenerating…' : 'Regenerate preview'}</button>
          <button class="ghost" data-action="set-thumbnail" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''} title="Crop and set the public card image from the frozen approval render">Set thumbnail</button>
        </div>
      </div>
    </li>`;
  }

  // Rejected card: 2 actions — Flag workspace, Pending review (requeue).
  private _renderRejectedGrid(): string {
    if (this._rejected.length === 0) return `<div class="empty">No rejections on record.</div>`;
    return `<ul class="card-grid">${this._rejected.map((e) => {
      const busy = this._busy.has(e.workspaceId);
      return `<li class="card">
        ${this._renderClickableCatalogThumb(this._svgKey('rejected', e.workspaceId), e.thumbnailAt, e.workspaceId, e.name ?? '(deleted)')}
        <div class="card-body">
          <h2 class="card-title">${this._escapeHtml(e.name ?? '(workspace deleted)')} ${this._badge(e.ownerFlagged)}</h2>
          ${this._renderMeta(e.ownerHandle, e.userId, `rejected ${this._fmtDate(e.rejectedAt)}`, e.codeHash)}
          ${e.internalNotes ? `<p class="card-desc"><strong>Notes:</strong> ${this._escapeHtml(e.internalNotes)}</p>` : ''}
          <div class="actions">
            <button class="ghost" data-action="requeue" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Pending review</button>
            <button class="danger-outline" data-action="flag-workspace" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Flag workspace</button>
          </div>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  // Flagged Workspaces card: 2 actions — Unflag (→ Rejected), Flag user.
  // Per spec, flagging the user keeps the workspace here; the owner-flag
  // badge appears after the background refresh.
  private _renderFlaggedWorkspacesGrid(): string {
    if (this._flaggedWorkspaces.length === 0) return `<div class="empty">No flagged workspaces.</div>`;
    return `<ul class="card-grid">${this._flaggedWorkspaces.map((e) => {
      const busy = this._busy.has(e.workspaceId);
      const userBusy = this._busy.has(e.ownerUserId);
      return `<li class="card">
        ${this._renderClickableCatalogThumb(this._svgKey('flagged-workspaces', e.workspaceId), e.thumbnailAt, e.workspaceId, e.name)}
        <div class="card-body">
          <h2 class="card-title">${this._escapeHtml(e.name)} ${this._badge(e.ownerFlagged)}</h2>
          ${this._renderMeta(e.ownerHandle, e.ownerUserId, null, e.codeHash)}
          <div class="actions">
            <button class="ghost" data-action="unflag-workspace" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>${busy ? 'Unflagging…' : 'Unflag'}</button>
            <button class="danger-outline" data-action="flag-user" data-id="${this._escapeHtml(e.ownerUserId)}" ${userBusy || e.ownerFlagged ? 'disabled' : ''} title="${e.ownerFlagged ? 'User is already flagged' : 'Flag the owner'}">${e.ownerFlagged ? 'User flagged' : 'Flag user'}</button>
          </div>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  private _renderFlaggedUsersGrid(): string {
    if (this._flaggedUsers.length === 0) return `<div class="empty">No flagged users.</div>`;
    return `<ul class="card-grid one-col">${this._flaggedUsers.map((e) => {
      const busy = this._busy.has(e.userId);
      return `<li class="card user-card">
        <div class="card-body">
          <h2 class="card-title">${this._escapeHtml(e.displayName)} <span class="card-meta">@${this._escapeHtml(e.handle)}</span></h2>
          ${e.flagNotes ? `<p class="card-desc">${this._escapeHtml(e.flagNotes)}</p>` : ''}
          <div class="actions">
            <a class="ghost link" href="/u/${this._escapeHtml(e.handle)}" target="_blank" rel="noopener">View profile</a>
            <button class="ghost" data-action="unflag-user" data-id="${this._escapeHtml(e.userId)}" ${busy ? 'disabled' : ''}>${busy ? 'Unflagging…' : 'Unflag user'}</button>
          </div>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  // Renders a thumbnail: compiled SVG when we have one for this card, else
  // the approval's card (cardAt; see ApprovedEntry), else the R2 thumbnail,
  // else a placeholder letter avatar. SVG is inlined; we trust it because it
  // came from our own compile path.
  private _renderThumb(
    svgKey: string,
    thumbnailAt: string | null,
    workspaceId: string,
    cardAt?: string | null,
  ): string {
    const cached = this._svg.get(svgKey);
    if (cached && cached.length > 0) return `<div class="thumb svg-thumb">${cached}</div>`;
    if (cached === '') return `<div class="thumb placeholder"><span>compile failed</span></div>`;
    if (cardAt) {
      return `<div class="thumb"><img src="${thumbnailApi.cardUrl(workspaceId, cardAt)}" alt="" loading="lazy" /></div>`;
    }
    if (thumbnailAt && cardAt === undefined) {
      // API_BASE is the pathogen-api origin (set via the
      // __PATHOGEN_API_BASE__ build define). The thumbnail endpoint
      // lives at /thumbnail/:id/:size on that same origin in both prod
      // (https://api.pathogen.studio) and dev (http://localhost:8787).
      const base = API_BASE.replace(/\/+$/, '');
      // Cache-bust on thumbnailAt so the card repaints after Set thumbnail /
      // Regenerate instead of serving the browser's stale cached PNG.
      const v = Date.parse(thumbnailAt) || 0;
      return `<div class="thumb"><img src="${base}/thumbnail/${encodeURIComponent(workspaceId)}/256?v=${v}" alt="" loading="lazy" /></div>`;
    }
    return `<div class="thumb placeholder"><span>${workspaceId.slice(0, 2).toUpperCase()}</span></div>`;
  }

  // Clickable variant for Pending / Re-review cards: wraps the thumb in
  // a button that opens the review modal with the queue entry's frozen
  // code. The Review action is no longer a card button — clicking the
  // preview is how admins inspect a submission.
  private _renderClickableThumb(
    svgKey: string,
    thumbnailAt: string | null,
    workspaceId: string,
    tab: 'pending' | 'rereview',
  ): string {
    return `<button class="thumb-button" data-action="review" data-id="${this._escapeHtml(workspaceId)}" data-tab="${tab}" title="Review code and preview">
      ${this._renderThumb(svgKey, thumbnailAt, workspaceId)}
    </button>`;
  }

  // Clickable variant for catalog cards (Approved/Featured/Rejected/
  // Flagged-workspaces). Fetches the frozen approval record by id on
  // click rather than passing inline code.
  private _renderClickableCatalogThumb(
    svgKey: string,
    thumbnailAt: string | null,
    workspaceId: string,
    name: string,
    cardAt?: string | null,
  ): string {
    return `<button class="thumb-button" data-action="review-catalog" data-id="${this._escapeHtml(workspaceId)}" data-name="${this._escapeHtml(name)}" title="Review code and preview">
      ${this._renderThumb(svgKey, thumbnailAt, workspaceId, cardAt)}
    </button>`;
  }

  // Shared "⚑ Flagged user" badge. Returns empty string when the owner
  // isn't flagged so the title spacing stays clean.
  private _badge(ownerFlagged: boolean): string {
    if (!ownerFlagged) return '';
    return `<span class="badge badge-flag" title="Owner has been flagged">⚑ Flagged user</span>`;
  }

  // Shared card metadata line: handle, optional date, optional short hash,
  // and how many files when there are several (pathogen.json counted, as the
  // viewer's list counts it).
  private _renderMeta(
    handle: string | null,
    fallbackUserId: string | null | undefined,
    date: string | null,
    codeHash: string | null,
    files = 0,
  ): string {
    const owner = handle ? `@${handle}` : (fallbackUserId ?? '?').slice(0, 8);
    const parts: string[] = [`<span>${this._escapeHtml(owner)}</span>`];
    if (date) parts.push(`<time>${this._escapeHtml(date)}</time>`);
    if (codeHash) parts.push(`<span class="hash">${this._escapeHtml(codeHash.slice(0, 8))}</span>`);
    if (files > 1) parts.push(`<span class="files">${files} files</span>`);
    return `<p class="card-meta">${parts.join('<span class="sep">·</span>')}</p>`;
  }

  // ─── Events ─────────────────────────────────────────────────────────

  // The screen's controls, after each render. The modal wires its own when it opens.
  private _wireEvents(root: HTMLElement): void {
    root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this._loadTab(this._tab));
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as Tab | null;
        if (tab && tab !== this._tab) {
          this._tab = tab;
          this._loadTab(tab);
        }
      });
    });
    root.querySelectorAll('[data-action="review"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as QueueTab;
        const entry = this._queueEntries(tab).find((p) => p.workspaceId === id);
        if (entry) this._openQueueReview(tab, entry);
      });
    });
    root.querySelectorAll('[data-action="review-catalog"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        const name = (e.currentTarget as HTMLElement).getAttribute('data-name') || '';
        this._openReviewFromApprovalRecord(id, name);
      });
    });
    root.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._approve((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="reject-start"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this._rejectingId = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        this.render();
      });
    });
    root.querySelectorAll('[data-action="reject-cancel"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._rejectingId = null;
        this.render();
      });
    });
    root.querySelectorAll('[data-action="reject-notes"]').forEach((ta) => {
      ta.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        this._rejectionNotes.set(id, (e.currentTarget as HTMLTextAreaElement).value);
      });
    });
    root.querySelectorAll('[data-action="reject-confirm"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._reject((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="requeue"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._requeue((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="feature"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._feature((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="regenerate"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._regenerate((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="set-thumbnail"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._openSetThumbnail((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="unfeature"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._unfeature((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="flag-workspace"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._flagWorkspace((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="unflag-workspace"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._unflagWorkspace((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="flag-user"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._flagUser((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
    root.querySelectorAll('[data-action="unflag-user"]').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this._unflagUser((e.currentTarget as HTMLElement).getAttribute('data-id')!),
      );
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private _escapeHtml(text: string | null | undefined): string {
    if (text == null) return '';
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }

  private _fmtDate(iso: string | null | undefined): string {
    // new Date(undefined/'') yields an Invalid Date whose toLocaleString()
    // returns the literal "Invalid Date" (it does not throw), so guard the
    // value explicitly rather than relying on the catch.
    if (!iso) return 'unknown date';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }

  /** A day, for "approved Nov 12, 2026". */
  private _fmtDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private _styles(): string {
    return `
      /* The shell wraps views in a flex container with overflow:hidden so
         the host element itself must scroll when content overflows. */
      :host { display: block; height: 100%; overflow-y: auto; overflow-x: hidden; }
      /* The screen's own colours, light and dark (2e step 5e): the theme has no
         quiet error panel, badge or outlined-danger ink, so they're local. */
      .screen, .modal-host {
        --mod-danger-fill: #b8302c; --mod-danger-line: #b8302c;
        --mod-error-bg: #fff5f5; --mod-error-border: #e07070; --mod-error-text: #a83232;
        --mod-badge-bg: #fef0c7; --mod-badge-text: #92541a;
        --mod-flag-bg: #fde2e2; --mod-flag-text: #a83232;
      }
      .screen.dark, .modal-host.dark {
        --mod-danger-fill: #dc2626; --mod-danger-line: #f87171;
        --mod-error-bg: rgba(239, 68, 68, 0.12); --mod-error-border: rgba(239, 68, 68, 0.45); --mod-error-text: #fca5a5;
        --mod-badge-bg: rgba(224, 168, 64, 0.15); --mod-badge-text: #e0a840;
        --mod-flag-bg: rgba(239, 68, 68, 0.15); --mod-flag-text: #fca5a5;
      }
      .container { max-width: 1200px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
      .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; }
      h1 { margin: 0; font: 600 1.5rem/1.2 var(--font-sans, system-ui); color: var(--text-primary, #111); }
      .refresh { padding: 0.4rem 0.85rem; }

      .tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; border-bottom: 1px solid var(--border-color, #ddd); margin-bottom: 1.25rem; }
      .tab { font: 500 0.85rem/1 var(--font-sans, system-ui); padding: 0.55rem 0.9rem; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--text-secondary, #666); cursor: pointer; }
      .tab.active { color: var(--text-primary, #111); border-bottom-color: var(--accent-color, #5b6bff); }

      .notice, .empty, .error { padding: 1.25rem; background: var(--bg-elevated, #fafafa); border: 1px solid var(--border-color, #ddd); border-radius: var(--radius-md, 6px); color: var(--text-secondary, #666); }
      .error { border-color: var(--mod-error-border); color: var(--mod-error-text); background: var(--mod-error-bg); }

      .card-grid { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1rem; }
      .card-grid.one-col { grid-template-columns: 1fr; }
      .card { display: grid; grid-template-columns: 120px 1fr; gap: 1rem; border: 1px solid var(--border-color, #ddd); border-radius: var(--radius-md, 6px); background: var(--bg-elevated, #fff); padding: 0.85rem; align-items: start; }
      .user-card { grid-template-columns: 1fr; }

      .thumb { width: 120px; height: 120px; border-radius: var(--radius-sm, 4px); overflow: hidden; background: var(--bg-primary, #f6f6f6); border: 1px solid var(--border-color, #e2e2e2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .thumb img, .thumb svg { width: 100%; height: 100%; display: block; object-fit: contain; }
      .thumb.placeholder { font: 600 1.3rem/1 var(--font-sans, system-ui); color: var(--text-secondary, #888); background: var(--bg-tertiary, #f0f0f0); }
      .thumb.svg-thumb { background: #fff; }
      /* The Review action is now reached by clicking the thumbnail —
         wrap it in a transparent button so it's accessible + obviously
         interactive without changing the card layout. */
      .thumb-button { padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: var(--radius-sm, 4px); }
      .thumb-button:focus-visible { outline: 2px solid var(--accent-color, #5b6bff); outline-offset: 2px; }
      .thumb-button:hover .thumb { border-color: var(--accent-color, #5b6bff); }

      .card-body { min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
      .card-title { margin: 0; font: 600 1rem/1.3 var(--font-sans, system-ui); color: var(--text-primary, #111); display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
      .badge { font: 500 0.7rem/1 var(--font-sans, system-ui); padding: 0.2rem 0.45rem; border-radius: 999px; background: var(--mod-badge-bg); color: var(--mod-badge-text); white-space: nowrap; }
      .badge-flag { background: var(--mod-flag-bg); color: var(--mod-flag-text); }
      .card-meta .sep { color: var(--text-tertiary, #aaa); }
      .card-meta { margin: 0; font: 400 0.75rem/1.4 var(--font-sans, system-ui); color: var(--text-secondary, #666); display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
      .card-meta .hash { font-family: var(--font-mono, ui-monospace, monospace); }
      .card-meta .files { color: var(--text-primary, #111); font-weight: 500; }
      .card-desc { margin: 0; font: 400 0.85rem/1.45 var(--font-sans, system-ui); color: var(--text-secondary, #444); }
      /* A re-review's line, and an entry whose files can't be read (2e step 5e; v12 R3 to R6). */
      .card-chg { margin: 0; font: 400 0.78rem/1.4 var(--font-sans, system-ui); color: var(--text-secondary, #666); }
      .card-chg b { color: var(--text-primary, #111); font-weight: 600; }
      .why { margin: 2px 0 0; padding: 7px 10px; border-radius: var(--radius-sm, 4px); border: 1px solid var(--warning-border, #fde68a);
        background: var(--warning-bg, #fffbeb); font: 400 0.78rem/1.45 var(--font-sans, system-ui); color: var(--text-primary, #111); }
      .why.big { margin: 0; padding: 14px 16px; font-size: 0.875rem; }

      .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      .feature-toggle { display: inline-flex; align-items: center; gap: 0.3rem; font: 0.8rem var(--font-sans, system-ui); color: var(--text-secondary, #555); }

      button, .link { font: inherit; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm, 4px); cursor: pointer; border: 1px solid var(--border-color, #ccc); background: transparent; color: var(--text-primary, #111); text-decoration: none; display: inline-flex; align-items: center; }
      button.primary { background: var(--accent-color, #5b6bff); color: var(--accent-text, #fff); border-color: transparent; }
      button.danger { background: var(--mod-danger-fill); color: #fff; border-color: transparent; }
      button.danger-outline { color: var(--mod-danger-line); border-color: var(--mod-danger-line); }
      button.ghost { background: transparent; }
      button.ghost-small { padding: 0.25rem 0.55rem; font-size: 0.78rem; }
      button[disabled] { opacity: 0.55; cursor: default; }

      .reject-form { margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color, #ddd); }
      .reject-form label { display: block; font: 500 0.85rem/1.2 var(--font-sans, system-ui); color: var(--text-secondary, #555); margin-bottom: 0.35rem; }
      .reject-form textarea { width: 100%; min-height: 4rem; padding: 0.5rem 0.65rem; border: 1px solid var(--border-color, #ccc); border-radius: var(--radius-sm, 4px); font: 0.85rem/1.45 var(--font-mono, ui-monospace, monospace); resize: vertical; box-sizing: border-box; background: var(--bg-primary, #fff); color: var(--text-primary, #111); }

      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 2rem; }
      .modal { background: var(--bg-elevated, #fff); border-radius: var(--radius-md, 8px); max-width: 1080px; width: 100%; max-height: 90vh; display: grid; grid-template-rows: auto 1fr; box-shadow: 0 12px 40px rgba(0,0,0,0.35); overflow: hidden; }
      .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border-color, #ddd); }
      .modal-head h2 { margin: 0; font: 600 1.05rem/1.2 var(--font-sans, system-ui); }
      .modal-body { padding: 1rem 1.1rem; overflow: auto; }
      /* Don't override mini-workspace's display — its own host CSS uses
         display:flex+flex-direction:column to size the code + preview
         panels via flex:1. Overriding to block (or constraining via a
         modal-body flex parent that hands it min-height:0) collapses
         the flex layout and leaves content-area at min-height (200px).
         Letting mini-workspace use its own height: 60dvh sizes it
         correctly; the modal-body just scrolls if the content overflows. */
      .modal-compiling { padding: 3rem 1rem; text-align: center; color: var(--text-secondary, #666); }
      .modal-failed { display: flex; flex-direction: column; gap: 0.85rem; }
      .modal-error { margin: 0; padding: 0.75rem 0.95rem; border: 1px solid var(--mod-error-border); background: var(--mod-error-bg); color: var(--mod-error-text); border-radius: var(--radius-sm, 4px); font: 0.85rem/1.45 var(--font-sans, system-ui); }
      /* A compile that failed: the files alone, at the embed's height. */
      .modal-files { display: flex; height: 60dvh; border: 1px solid var(--border-color, #ddd); border-radius: var(--radius-sm, 4px); overflow: hidden; }

      /* What changed since the approved version (v12 R3, R4). The badges are the viewer's. */
      .modal-changes { --sf-mark-chg: ${MARK_CHG_COLOR.light}; margin: 0 0 12px; padding: 10px 14px; border: 1px solid var(--info-border, #bfdbfe);
        background: var(--info-bg, #eff6ff); border-radius: var(--radius-sm, 4px); font: 400 13px/1.5 var(--font-sans, system-ui); color: var(--text-primary, #111); }
      .modal-host.dark .modal-changes { --sf-mark-chg: ${MARK_CHG_COLOR.dark}; }
      .modal-changes[hidden] { display: none; }
      .modal-changes h4 { margin: 0; font-size: 13px; font-weight: 600; }
      .modal-changes h4 span { font-weight: 400; color: var(--text-secondary, #666); }
      .modal-changes ul { margin: 4px 0 0; padding: 0; list-style: none; }
      .modal-changes li { margin: 1px 0; }
      .modal-changes code { font: 12.5px var(--font-mono, ui-monospace, monospace); }
      .modal-changes .mdot { vertical-align: -2px; margin-right: 7px; }
      .modal-changes .chg-open { display: inline; padding: 0; border: 0; border-radius: 2px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
      .modal-changes .chg-open code { text-decoration: underline dotted; text-underline-offset: 3px; }
      .modal-changes .chg-open:hover code { text-decoration-style: solid; }
      .modal-changes .chg-open:focus-visible { outline: 2px solid var(--accent-color, #5b6bff); outline-offset: 2px; }
      ${MARK_DOT_STYLES}
    `;
  }
}

customElements.define('admin-moderation-view', AdminModerationView);
