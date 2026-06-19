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

import { hasFeature, UserFeature, type CurrentUser } from '../../services/auth.js';
import compilerWorker from '../../services/compiler-worker.js';
import thumbnailService from '../../services/thumbnail-service.js';
import { store } from '../../state/store.js';
import { dimensionsOrDefault } from '../../utils/source-dimensions.js';
// Side-effect import: register the <mini-workspace> custom element so the
// review modal can mount one. The component is already loaded for blog
// pages; pulling it in here keeps the admin route self-sufficient.
import '../blog/mini-workspace.js';

declare const __PATHOGEN_API_BASE__: string;
const API_BASE = __PATHOGEN_API_BASE__;

// ─── Tab + card data shapes ───────────────────────────────────────────

interface QueueEntry {
  workspaceId: string;
  userId: string;
  code: string;
  codeHash: string;
  name: string;
  description: string;
  slug: string;
  submittedAt: string;
  ownerHandle: string | null;
  ownerDisplayName: string | null;
  ownerFlagged: boolean;
}

interface ApprovedEntry {
  workspaceId: string;
  userId: string;
  name: string;
  description: string;
  slug: string;
  ownerHandle: string | null;
  ownerFlagged: boolean;
  codeHash: string;
  approvedAt: string;
  featuredAt: string | null;
  thumbnailAt: string | null;
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
  codeHash: string;
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

  // SVG rendered from each entry's code, used as the card thumbnail and
  // (for queue entries) reused when the admin approves so we don't
  // compile twice. Map keyed by `${tab}:${workspaceId}` because the same
  // workspaceId can appear in Approved + Featured with different code
  // snapshots in theory (in practice they're identical; the key just
  // keeps things scoped).
  private _svg: Map<string, string> = new Map();
  private _svgPending: Set<string> = new Set();
  private _compilationCounter: number = 0;

  // Modal state — open at most one mini-workspace at a time.
  // _modalStatus encodes the lifecycle so the modal never gets stuck on
  // "Compiling…" when the compile fails or the source is missing.
  private _modalKey: string | null = null;
  private _modalCode: string = '';
  private _modalSvg: string | null = null;
  private _modalTitle: string = '';
  private _modalStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private _modalError: string | null = null;

  // Reject form state per workspace.
  private _rejectingId: string | null = null;
  private _rejectionNotes: Map<string, string> = new Map();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._unsubscribe = store.subscribe(['currentView'], () => {
      if (store.get('currentView') === 'admin-moderation') this._loadIfAdmin();
    });
    this._unsubscribeUser = store.subscribe(['currentUser'], () => {
      if (store.get('currentView') === 'admin-moderation') this._loadIfAdmin();
    });
    if (store.get('currentView') === 'admin-moderation') this._loadIfAdmin();
  }

  disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._unsubscribeUser?.();
    this._unsubscribeUser = null;
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

  private async _compileSvg(code: string, key: string): Promise<string | null> {
    if (this._svg.has(key)) return this._svg.get(key) ?? null;
    if (this._svgPending.has(key)) return null;
    // Empty / whitespace-only code can't produce a meaningful render —
    // generateSvg returns an SVG with an empty <path d="" />. Mark it
    // failed up-front so the modal goes straight to the source-and-error
    // state instead of showing a blank preview.
    if (!code.trim()) {
      this._svg.set(key, '');
      return null;
    }
    this._svgPending.add(key);
    try {
      const id = ++this._compilationCounter;
      const result = (await compilerWorker.compileWithContext(code, id, undefined)) as Record<string, unknown>;
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
    } finally {
      this._svgPending.delete(key);
    }
  }

  // Bounded thumbnail compile for the current tab. Only the queue tabs
  // (Pending / Re-review) carry inline `code` to compile — they have no
  // R2 thumbnail to fall back on, so without this a freshly-submitted
  // card shows only a letter avatar until the admin opens it. The
  // catalog tabs (Approved/Featured/Rejected/Flagged) have no `code` on
  // the listing and degrade to the R2 thumbnail or avatar via
  // _renderThumb, so they're skipped entirely.
  //
  // The previous version compiled every queue card eagerly with no
  // ceiling, so a single slow-to-compile workspace (~14s) blocked the
  // whole tab. This version caps concurrency at 2 and races each compile
  // against a ~4s timer: when the timer wins, the slot frees and the
  // card stays on its avatar. The worker call can't truly be cancelled,
  // so the real compile still resolves later, populates `_svg`, and
  // renders the thumbnail late — we just stop blocking on it. The
  // existing `_svg` / `_svgPending` memoization dedups the late finish.
  private _compileThumbnailsForCurrentTab(): void {
    const entries =
      this._tab === 'pending' ? this._pending : this._tab === 'rereview' ? this._rereview : null;
    if (!entries) return;

    const jobs = entries
      .map((e) => ({ key: this._svgKey(this._tab, e.workspaceId), code: e.code }))
      .filter((j) => !this._svg.has(j.key));
    if (jobs.length === 0) return;

    const COMPILE_TIMEOUT_MS = 4000;
    const MAX_CONCURRENT = 2;
    let next = 0;

    const runWorker = async (): Promise<void> => {
      while (next < jobs.length) {
        const job = jobs[next++];
        // Re-render once the real compile finishes regardless of whether
        // we're still waiting on it — late completions paint the thumb.
        const compile = this._compileSvg(job.code, job.key).then(() => this.render());
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
    if (this._busy.has(workspaceId)) return;
    this._busy.add(workspaceId);
    this.render();
    try {
      const entry =
        this._pending.find((e) => e.workspaceId === workspaceId) ||
        this._rereview.find((e) => e.workspaceId === workspaceId);
      const tab: Tab = this._pending.some((e) => e.workspaceId === workspaceId) ? 'pending' : 'rereview';
      const svg = entry ? await this._compileSvg(entry.code, this._svgKey(tab, workspaceId)) : null;
      const body: Record<string, unknown> = { decision: 'approve', feature: false };
      if (svg) body.svg = svg;
      const res = await this._post(`/admin/review/${encodeURIComponent(workspaceId)}`, body);
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
      this._toast(`Approve failed: ${(err as Error).message}`);
    } finally {
      this._busy.delete(workspaceId);
      this.render();
    }
  }

  private async _reject(workspaceId: string): Promise<void> {
    if (this._busy.has(workspaceId)) return;
    const notes = this._rejectionNotes.get(workspaceId) || '';
    this._busy.add(workspaceId);
    this.render();
    try {
      const res = await this._post(`/admin/review/${encodeURIComponent(workspaceId)}`, {
        decision: 'reject',
        internalNotes: notes,
      });
      if (!res.ok) throw new Error(res.error || 'Request failed');
      this._pending = this._pending.filter((e) => e.workspaceId !== workspaceId);
      this._rereview = this._rereview.filter((e) => e.workspaceId !== workspaceId);
      this._rejectingId = null;
      this._rejectionNotes.delete(workspaceId);
      this._toast('Rejected');
      // See _approve: skip the full cross-tab refresh; counts on other
      // tabs self-correct on visit.
    } catch (err) {
      this._toast(`Reject failed: ${(err as Error).message}`);
    } finally {
      this._busy.delete(workspaceId);
      this.render();
    }
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
      this._toast(`Action failed: ${(err as Error).message}`);
    } finally {
      this._busy.delete(key);
      this.render();
    }
  }

  private async _post(
    path: string,
    body: Record<string, unknown> | null,
    method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  ): Promise<{ ok: boolean; error?: string; slug?: string }> {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== null && method !== 'DELETE') init.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, init);
    let data: { error?: string; slug?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* empty */
    }
    return { ok: res.ok, ...data };
  }

  private _toast(message: string): void {
    document.dispatchEvent(
      new CustomEvent('toast', {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ─── Modal (mini-workspace review) ──────────────────────────────────

  // Open the review modal with code from a queue entry (pending /
  // re-review). The code is frozen at submission time. We compile in
  // the background; if compile fails the modal still shows the source
  // plus an error banner.
  private async _openReview(workspaceId: string, tab: Tab, code: string, name: string): Promise<void> {
    this._modalKey = workspaceId;
    this._modalCode = code;
    this._modalTitle = name;
    this._modalError = null;
    const key = this._svgKey(tab, workspaceId);
    const cached = this._svg.get(key);
    if (cached) {
      this._modalSvg = cached;
      this._modalStatus = 'ready';
    } else if (cached === '') {
      this._modalSvg = null;
      this._modalStatus = 'failed';
      this._modalError = 'Compile failed for this submission.';
    } else {
      this._modalSvg = null;
      this._modalStatus = 'loading';
    }
    this.render();
    if (this._modalStatus === 'loading') {
      const svg = await this._compileSvg(code, key);
      if (this._modalKey !== workspaceId) return; // user closed/switched
      if (svg) {
        this._modalSvg = svg;
        this._modalStatus = 'ready';
      } else {
        this._modalSvg = null;
        this._modalStatus = 'failed';
        this._modalError = 'Compile failed — see source below.';
      }
      this.render();
    }
  }

  // Open the review modal from an Approved/Featured card. Fetches the
  // frozen approval record via the admin endpoint so we get
  // approval.code (immutable, what visitors see) plus approval.svg
  // (when present, pre-rendered by the admin at approval time).
  private async _openReviewFromApprovalRecord(workspaceId: string, name: string): Promise<void> {
    this._modalKey = workspaceId;
    this._modalTitle = name;
    this._modalCode = '';
    this._modalSvg = null;
    this._modalStatus = 'loading';
    this._modalError = null;
    this.render();
    try {
      const res = await fetch(`${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { code?: string; svg?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load approval');
      if (this._modalKey !== workspaceId) return;
      this._modalCode = data.code ?? '';
      // Frozen SVG preferred. If absent (legacy approval), try a
      // background compile; if THAT fails, fall through to source-only.
      if (data.svg && data.svg.length > 0) {
        this._modalSvg = data.svg;
        this._modalStatus = 'ready';
        this.render();
        return;
      }
      const key = this._svgKey('approved', workspaceId);
      const svg = await this._compileSvg(data.code ?? '', key);
      if (this._modalKey !== workspaceId) return;
      if (svg) {
        this._modalSvg = svg;
        this._modalStatus = 'ready';
        // Silently backfill approval.svg on the server so the
        // /u/<handle>/<slug> detail page renders the live mini-workspace
        // preview next time someone visits. Best-effort — if the PUT
        // fails (network, KV error, etc.) the modal still works; the
        // backfill just doesn't happen this round.
        void fetch(
          `${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}/svg`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ svg }),
          },
        ).catch(() => null);
      } else {
        this._modalSvg = null;
        this._modalStatus = 'failed';
        this._modalError = data.code
          ? 'No frozen SVG and the source no longer compiles. Source is shown below.'
          : 'Approval record is missing its source code.';
      }
      this.render();
    } catch (err) {
      if (this._modalKey !== workspaceId) return;
      this._modalStatus = 'failed';
      this._modalError = (err as Error).message;
      this.render();
    }
  }

  // Regenerate the public preview (approval.svg → R2) and the grid PNG
  // thumbnails for an Approved/Featured workspace, compiling from the FROZEN
  // approval.code (what visitors actually see — not the possibly-diverged live
  // workspace). Heals entries whose preview was dropped by the old 1 MB cap or
  // that never got a thumbnail. Thumbnail upload rides the session cookie;
  // uploadThumbnail grants session-admins the ownership bypass.
  private async _regenerate(workspaceId: string): Promise<void> {
    if (this._busy.has(workspaceId)) return;
    this._busy.add(workspaceId);
    this.render();
    try {
      // 1. Frozen approval record → immutable source.
      const res = await fetch(`${API_BASE}/admin/approval/${encodeURIComponent(workspaceId)}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load approval');
      const code = (data.code ?? '').trim();
      if (!code) throw new Error('Approval record has no source code');

      // 2. Compile once; render the full-aspect preview + a square-crop variant.
      const id = ++this._compilationCounter;
      const result = (await compilerWorker.compileWithContext(code, id, undefined)) as Record<string, unknown>;
      const lib = (
        window as unknown as { PathogenLang?: { generateSvg?: (r: unknown, o: unknown) => string } }
      ).PathogenLang;
      if (!lib?.generateSvg) throw new Error('Compiler not available (PathogenLang.generateSvg missing)');
      const dims = dimensionsOrDefault(code);
      const previewSvg = lib.generateSvg(result, dims);
      if (!previewSvg || previewSvg.length === 0) throw new Error('Compile produced no SVG');

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

      // 4. Square-crop SVG → PNG grid thumbnails (used on /explore + /featured).
      // Always attempt this, even if the preview PUT failed.
      const square = this._squareDims(dims.viewBox);
      const squareSvg = lib.generateSvg(result, square);
      const thumbOk = Boolean(
        await thumbnailService.generateThumbnail(workspaceId, null as unknown as SVGElement, {}, undefined, {
          svgString: squareSvg,
          kind: 'auto',
        }),
      );

      // 4b. Uncropped, source-aspect hero PNG from the FULL preview SVG. Without
      // it, the detail page falls back to the square thumbnail, which distorts
      // non-square artwork (e.g. an 8000×4800 workspace squashed to 1:1). Best-
      // effort: a hero failure must not fail the (already-uploaded) thumbnail.
      try {
        await thumbnailService.uploadHeroFromSvgString(
          workspaceId,
          previewSvg,
          Number(dims.width) || 0,
          Number(dims.height) || 0,
        );
      } catch (e) {
        console.warn('[regenerate] hero render failed (thumbnail unaffected):', e);
      }

      if (!previewOk && !thumbOk) {
        throw new Error(previewErr || 'thumbnail generation was blocked or timed out');
      }

      // 5. Reflect immediately: bust the cached compile + stamp thumbnailAt so
      // the card repaints with the fresh thumbnail.
      this._svg.delete(this._svgKey('approved', workspaceId));
      this._svg.delete(this._svgKey('featured', workspaceId));
      const stamp = new Date().toISOString();
      const entry =
        this._approved.find((x) => x.workspaceId === workspaceId) ??
        this._featured.find((x) => x.workspaceId === workspaceId);
      if (entry) {
        if (thumbOk) entry.thumbnailAt = stamp;
        if (previewOk) entry.hasSvg = true;
      }

      if (previewOk && thumbOk) this._toast('Regenerated preview + thumbnail');
      else if (previewOk) this._toast('Saved preview; thumbnail generation failed');
      else this._toast(`Updated thumbnail. Preview not stored: ${previewErr}`);
    } catch (err) {
      this._toast(`Regenerate failed: ${(err as Error).message}`);
    } finally {
      this._busy.delete(workspaceId);
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
    this._modalKey = null;
    this._modalCode = '';
    this._modalSvg = null;
    this._modalTitle = '';
    this._modalStatus = 'idle';
    this._modalError = null;
    this.render();
  }

  // ─── Render ─────────────────────────────────────────────────────────

  render(): void {
    if (!this._isAdmin()) {
      this.shadowRoot!.innerHTML = `
        <style>${this._styles()}</style>
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

    this.shadowRoot!.innerHTML = `
      <style>${this._styles()}</style>
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
      ${this._renderModal()}
    `;
    this._wireEvents();
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
  // Reject. Review is reached by clicking the thumbnail.
  private _renderQueueCard(e: QueueEntry, tab: 'pending' | 'rereview'): string {
    const busy = this._busy.has(e.workspaceId);
    const rejecting = this._rejectingId === e.workspaceId;
    const notesValue = this._rejectionNotes.get(e.workspaceId) || '';
    return `<li class="card">
      ${this._renderClickableThumb(this._svgKey(tab, e.workspaceId), null, e.workspaceId, tab)}
      <div class="card-body">
        <h2 class="card-title">${this._escapeHtml(e.name)} ${this._badge(e.ownerFlagged)}</h2>
        ${this._renderMeta(e.ownerHandle, e.userId, this._fmtDate(e.submittedAt), e.codeHash)}
        ${e.description ? `<p class="card-desc">${this._escapeHtml(e.description)}</p>` : ''}
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
            <button class="primary" data-action="approve" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>${busy ? '…' : 'Approve'}</button>
            <button class="danger-outline" data-action="reject-start" data-id="${this._escapeHtml(e.workspaceId)}" ${busy ? 'disabled' : ''}>Reject</button>
          </div>
        `
        }
      </div>
    </li>`;
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
      ${this._renderClickableCatalogThumb(this._svgKey(tab, e.workspaceId), e.thumbnailAt, e.workspaceId, e.name)}
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
  // R2 thumbnail, else a placeholder letter avatar. SVG is inlined; we
  // trust it because it came from our own compile path.
  private _renderThumb(svgKey: string, thumbnailAt: string | null, workspaceId: string): string {
    const cached = this._svg.get(svgKey);
    if (cached && cached.length > 0) return `<div class="thumb svg-thumb">${cached}</div>`;
    if (cached === '') return `<div class="thumb placeholder"><span>compile failed</span></div>`;
    if (thumbnailAt) {
      // API_BASE is the pathogen-api origin (set via the
      // __PATHOGEN_API_BASE__ build define). The thumbnail endpoint
      // lives at /thumbnail/:id/:size on that same origin in both prod
      // (https://api.pathogen.studio) and dev (http://localhost:8787).
      const base = API_BASE.replace(/\/+$/, '');
      return `<div class="thumb"><img src="${base}/thumbnail/${encodeURIComponent(workspaceId)}/256" alt="" loading="lazy" /></div>`;
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
  ): string {
    return `<button class="thumb-button" data-action="review-catalog" data-id="${this._escapeHtml(workspaceId)}" data-name="${this._escapeHtml(name)}" title="Review code and preview">
      ${this._renderThumb(svgKey, thumbnailAt, workspaceId)}
    </button>`;
  }

  // Shared "⚑ Flagged user" badge. Returns empty string when the owner
  // isn't flagged so the title spacing stays clean.
  private _badge(ownerFlagged: boolean): string {
    if (!ownerFlagged) return '';
    return `<span class="badge badge-flag" title="Owner has been flagged">⚑ Flagged user</span>`;
  }

  // Shared card metadata line: handle, optional date, optional short hash.
  private _renderMeta(
    handle: string | null,
    fallbackUserId: string | null | undefined,
    date: string | null,
    codeHash: string | null,
  ): string {
    const owner = handle ? `@${handle}` : (fallbackUserId ?? '?').slice(0, 8);
    const parts: string[] = [`<span>${this._escapeHtml(owner)}</span>`];
    if (date) parts.push(`<time>${this._escapeHtml(date)}</time>`);
    if (codeHash) parts.push(`<span class="hash">${this._escapeHtml(codeHash.slice(0, 8))}</span>`);
    return `<p class="card-meta">${parts.join('<span class="sep">·</span>')}</p>`;
  }

  private _renderModal(): string {
    if (!this._modalKey) return '';
    let body: string;
    if (this._modalStatus === 'loading') {
      body = `<div class="modal-compiling">Compiling preview…</div>`;
    } else if (this._modalStatus === 'ready' && this._modalSvg) {
      body = `<mini-workspace caption="${this._escapeHtml(this._modalTitle)}" code-open>
                <code>${this._escapeHtml(this._modalCode)}</code>
                ${this._modalSvg}
              </mini-workspace>`;
    } else {
      // 'failed' or 'idle' with no svg. Show the error banner + source
      // so the admin can still review the submitted code and decide.
      body = `
        <div class="modal-failed">
          ${
            this._modalError
              ? `<p class="modal-error">${this._escapeHtml(this._modalError)}</p>`
              : ''
          }
          ${
            this._modalCode
              ? `<pre class="modal-code"><code>${this._escapeHtml(this._modalCode)}</code></pre>`
              : `<p class="modal-error">No source available.</p>`
          }
        </div>
      `;
    }
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Workspace review">
          <header class="modal-head">
            <h2>${this._escapeHtml(this._modalTitle)}</h2>
            <button class="ghost" data-action="close-modal">Close</button>
          </header>
          <div class="modal-body">${body}</div>
        </div>
      </div>
    `;
  }

  // ─── Events ─────────────────────────────────────────────────────────

  private _wireEvents(): void {
    const root = this.shadowRoot!;
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
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as 'pending' | 'rereview';
        const entry =
          tab === 'pending'
            ? this._pending.find((p) => p.workspaceId === id)
            : this._rereview.find((p) => p.workspaceId === id);
        if (entry) this._openReview(entry.workspaceId, tab, entry.code, entry.name);
      });
    });
    root.querySelectorAll('[data-action="review-catalog"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        const name = (e.currentTarget as HTMLElement).getAttribute('data-name') || '';
        this._openReviewFromApprovalRecord(id, name);
      });
    });
    root.querySelectorAll('[data-action="close-modal"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Only close when clicking the backdrop or the explicit close
        // button — not when clicking inside the modal body.
        if (e.target === e.currentTarget) this._closeReview();
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

  private _styles(): string {
    return `
      /* The shell wraps views in a flex container with overflow:hidden so
         the host element itself must scroll when content overflows. */
      :host { display: block; height: 100%; overflow-y: auto; overflow-x: hidden; }
      .container { max-width: 1200px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
      .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; }
      h1 { margin: 0; font: 600 1.5rem/1.2 var(--font-sans, system-ui); color: var(--text-primary, #111); }
      .refresh { padding: 0.4rem 0.85rem; }

      .tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; border-bottom: 1px solid var(--border-color, #ddd); margin-bottom: 1.25rem; }
      .tab { font: 500 0.85rem/1 var(--font-sans, system-ui); padding: 0.55rem 0.9rem; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--text-secondary, #666); cursor: pointer; }
      .tab.active { color: var(--text-primary, #111); border-bottom-color: var(--accent-color, #5b6bff); }

      .notice, .empty, .error { padding: 1.25rem; background: var(--bg-elevated, #fafafa); border: 1px solid var(--border-color, #ddd); border-radius: var(--radius-md, 6px); color: var(--text-secondary, #666); }
      .error { border-color: #e07070; color: #a83232; background: #fff5f5; }

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
      .badge { font: 500 0.7rem/1 var(--font-sans, system-ui); padding: 0.2rem 0.45rem; border-radius: 999px; background: #fef0c7; color: #92541a; white-space: nowrap; }
      .badge-flag { background: #fde2e2; color: #a83232; }
      .card-meta .sep { color: var(--text-tertiary, #aaa); }
      .card-meta { margin: 0; font: 400 0.75rem/1.4 var(--font-sans, system-ui); color: var(--text-secondary, #666); display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
      .card-meta .hash { font-family: var(--font-mono, ui-monospace, monospace); }
      .card-desc { margin: 0; font: 400 0.85rem/1.45 var(--font-sans, system-ui); color: var(--text-secondary, #444); }

      .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.4rem; }
      .feature-toggle { display: inline-flex; align-items: center; gap: 0.3rem; font: 0.8rem var(--font-sans, system-ui); color: var(--text-secondary, #555); }

      button, .link { font: inherit; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm, 4px); cursor: pointer; border: 1px solid var(--border-color, #ccc); background: transparent; color: var(--text-primary, #111); text-decoration: none; display: inline-flex; align-items: center; }
      button.primary { background: var(--accent-color, #5b6bff); color: #fff; border-color: transparent; }
      button.danger { background: #b8302c; color: #fff; border-color: transparent; }
      button.danger-outline { color: #b8302c; border-color: #b8302c; }
      button.ghost { background: transparent; }
      button.ghost-small { padding: 0.25rem 0.55rem; font-size: 0.78rem; }
      button[disabled] { opacity: 0.55; cursor: default; }

      .reject-form { margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color, #ddd); }
      .reject-form label { display: block; font: 500 0.85rem/1.2 var(--font-sans, system-ui); color: var(--text-secondary, #555); margin-bottom: 0.35rem; }
      .reject-form textarea { width: 100%; min-height: 4rem; padding: 0.5rem 0.65rem; border: 1px solid var(--border-color, #ccc); border-radius: var(--radius-sm, 4px); font: 0.85rem/1.45 var(--font-mono, ui-monospace, monospace); resize: vertical; box-sizing: border-box; }

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
      .modal-error { margin: 0; padding: 0.75rem 0.95rem; border: 1px solid #e07070; background: #fff5f5; color: #a83232; border-radius: var(--radius-sm, 4px); font: 0.85rem/1.45 var(--font-sans, system-ui); }
      .modal-code { margin: 0; padding: 0.85rem 0.95rem; background: var(--bg-primary, #f6f6f6); border: 1px solid var(--border-color, #ddd); border-radius: var(--radius-sm, 4px); overflow: auto; font: 0.82rem/1.45 var(--font-mono, ui-monospace, monospace); color: var(--text-primary, #222); white-space: pre; max-height: 60vh; }
    `;
  }
}

customElements.define('admin-moderation-view', AdminModerationView);
