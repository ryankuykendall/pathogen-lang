// <workspace-snapshots-view> — /workspace/:slugId/snapshots[/:n]
// (docs/snapshots.md "The snapshots page"; mockup v3 screen 3).
//
// The stock <mini-workspace> shows the selected snapshot's stored SVG and
// code — nothing is recompiled. Below it: a quiet name / details / note row,
// then the <snapshot-filmstrip>. The actions (Copy code · Start new
// workspace · Export… · ⋯ Rename / Delete) live in <app-breadcrumb> and reach
// this view as `snapshot-action` events; the breadcrumb reads
// store.snapshotsPage for its trail.
//
// Snapshot files are owner-only behind the session cookie, so they're
// fetched with credentials and handed to <mini-workspace> as a blob: URL —
// the stored SVG is only ever parsed inside mini-preview's script-free
// sandboxed iframe. The Export dialog needs a real element in this document,
// so that path goes through parseSnapshotSvg (utils/sanitize-svg-dom.ts).

import '../blog/mini-workspace.js';
import '../export-modal.js';
import '../shared/snapshot-filmstrip.js';
import type { FilmstripSort, SnapshotFilmstrip } from '../shared/snapshot-filmstrip.js';
import { snapshotApi, workspaceApi } from '../../services/api.js';
import type { SnapshotRecord } from '../../services/api.js';
import { store } from '../../state/store.js';
import { formatBytes } from '../../utils/format-bytes.js';
import { escapeHtml } from '../../utils/html-escape.js';
import { buildWorkspaceSlugId, navigateTo, parseWorkspaceSlugId } from '../../utils/router.js';
import { parseSnapshotSvg } from '../../utils/sanitize-svg-dom.js';

const CARD_FETCH_CONCURRENCY = 4;

interface ApiErrorLike {
  kind?: 'network' | 'http';
  status?: number;
  message?: string;
  data?: { code?: string } | null;
}

function toast(detail: { type?: 'success' | 'error'; title: string; message?: string; image?: string }): void {
  document.dispatchEvent(new CustomEvent('show-toast', { bubbles: true, composed: true, detail }));
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.composedPath()[0] as HTMLElement | undefined;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable || !!el.closest?.('.cm-editor')
  );
}

const styles = `
  :host {
    display: none;
    height: 100%;
    min-height: 0;
    font-family: var(--font-body, var(--font-sans, system-ui, sans-serif));
    color: var(--text-primary, #1c1722);
  }
  :host(.active) { display: grid; grid-template-rows: minmax(0, 1fr) auto auto; }
  .stage { min-height: 0; padding: 14px 18px 10px; }
  .stage mini-workspace { margin: 0; height: 100%; min-height: 0; max-height: none; }
  .detail {
    display: grid;
    grid-template-columns: auto auto minmax(160px, 1fr);
    align-items: center;
    gap: 14px;
    padding: 2px 18px 10px;
  }
  .name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
  .name small { color: var(--text-tertiary, #9087a0); font-weight: 500; font-family: var(--font-mono, monospace); font-size: 12px; margin-left: 6px; }
  .meta { font-size: 12px; color: var(--text-tertiary, #9087a0); white-space: nowrap; }
  .note { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 6px; font-size: 13px; color: var(--text-tertiary, #9087a0); }
  .note label { cursor: pointer; }
  .note input {
    font: inherit;
    border: 1px dashed transparent;
    background: transparent;
    padding: 5px 6px;
    border-radius: var(--radius-sm, 6px);
    color: var(--text-primary, #1c1722);
    min-width: 0;
  }
  .note input:hover, .note input:focus { border-color: var(--border-strong, rgba(28, 23, 34, 0.18)); background: var(--bg-secondary, #fdf6ed); outline: none; }
  .film { border-top: 1px solid var(--border-color, rgba(28, 23, 34, 0.1)); background: var(--bg-secondary, #fdf6ed); padding: 10px 18px 12px; }
  .message { display: grid; place-items: center; text-align: center; padding: 80px 20px; color: var(--text-secondary, #5a4f6a); grid-row: 1 / -1; }
  .message h3 { color: var(--text-primary, #1c1722); margin: 14px 0 6px; font-size: 18px; }
  .message p { max-width: 440px; margin: 0 auto 16px; line-height: 1.5; }
  .icon { width: 60px; height: 60px; border-radius: 16px; background: var(--bg-tertiary, rgba(28, 23, 34, 0.05)); color: var(--text-secondary, #5a4f6a); display: grid; place-items: center; margin: 0 auto; }
  .btn { background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18)); border-radius: var(--radius-sm, 6px); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text-primary, #1c1722); }
  .btn:hover { background: var(--hover-bg, rgba(0, 0, 0, 0.04)); }
  kbd { font-family: var(--font-mono, monospace); font-size: 11px; border: 1px solid var(--border-strong, rgba(28, 23, 34, 0.18)); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--bg-elevated, #ffffff); }
  @media (max-width: 720px) {
    .detail { grid-template-columns: 1fr; gap: 4px; }
    .name { max-width: none; }
  }
`;

const CAMERA_ICON = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;

export class WorkspaceSnapshotsView extends HTMLElement {
  private _unsubscribe: (() => void) | null = null;

  private _workspaceId: string | null = null;

  private _slugId = '';

  private _workspaceName = '';

  private _snapshots: SnapshotRecord[] = [];

  private _currentId: string | null = null;

  private _sort: FilmstripSort = 'newest';

  private _loadToken = 0;

  private _loading = false;

  private _selectToken = 0;

  private _cardUrls = new Map<string, string>();

  private _svgText = new Map<string, string>();

  private _code = new Map<string, string>();

  private _svgUrl: string | null = null;

  private _codeOpen = false;

  private _onKeydown = (e: KeyboardEvent): void => {
    if (!this.classList.contains('active') || !this._currentId) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const ids = this._filmstrip?.orderedIds() ?? [];
    const i = ids.indexOf(this._currentId);
    const next = ids[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      e.preventDefault();
      this._select(next);
    }
  };

  private _onAction = (e: Event): void => {
    if (!this.classList.contains('active')) return;
    void this._runAction((e as CustomEvent<{ action: string }>).detail.action);
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.shadowRoot!.innerHTML = `<style>${styles}</style><div id="root" style="display:contents"></div><export-modal></export-modal>`;
    const unsubRoute = store.subscribe(['currentView', 'routeParams'], () => this._handleRoute());
    // Signing in (or out) changes what this page may show: reload it.
    const unsubUser = store.subscribe('currentUser', () => {
      this._workspaceId = null;
      this._handleRoute();
    });
    this._unsubscribe = (): void => {
      unsubRoute();
      unsubUser();
    };
    document.addEventListener('keydown', this._onKeydown);
    document.addEventListener('snapshot-action', this._onAction);
    this._handleRoute();
  }

  disconnectedCallback(): void {
    this._unsubscribe?.();
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('snapshot-action', this._onAction);
    this._releaseAll();
  }

  private get _root(): HTMLElement {
    return this.shadowRoot!.querySelector('#root') as HTMLElement;
  }

  private get _filmstrip(): SnapshotFilmstrip | null {
    return this.shadowRoot!.querySelector('snapshot-filmstrip') as SnapshotFilmstrip | null;
  }

  private get _current(): SnapshotRecord | null {
    return this._snapshots.find((s) => s.id === this._currentId) ?? null;
  }

  // ─── Routing ───────────────────────────────────────────────────────

  private _handleRoute(): void {
    if (store.get('currentView') !== 'workspace-snapshots') {
      if (this._workspaceId) {
        // Leaving: the breadcrumb must not keep showing snapshot actions.
        store.set('snapshotsPage', null);
        this._workspaceId = null;
        this._releaseAll();
      }
      return;
    }
    const params = (store.get('routeParams') || {}) as Record<string, string>;
    const { id } = parseWorkspaceSlugId(params.slugId);
    if (!id) return;
    if (id !== this._workspaceId) {
      void this._load(id, params.slugId);
      return;
    }
    // Same workspace (a load in flight re-reads the URL when it lands):
    // follow the URL's snapshot number — typed URLs, the "Snapshots" crumb.
    if (this._loading) return;
    const target = this._snapshotForN(params.n);
    if (!target) return;
    if (target.id !== this._currentId) void this._select(target.id, { updateUrl: !params.n });
    else if (!params.n) navigateTo(`/workspace/${this._slugId}/snapshots/${target.n}`, { replace: true });
  }

  private _snapshotForN(n: string | undefined): SnapshotRecord | null {
    if (!this._snapshots.length) return null;
    const num = Number(n);
    if (n && Number.isInteger(num)) return this._snapshots.find((s) => s.n === num) ?? null;
    return [...this._snapshots].sort((a, b) => b.n - a.n)[0];
  }

  private async _load(workspaceId: string, slugId: string): Promise<void> {
    const token = ++this._loadToken;
    this._loading = true;
    this._releaseAll();
    this._workspaceId = workspaceId;
    this._slugId = slugId;
    this._snapshots = [];
    this._currentId = null;
    this._renderMessage('loading');

    try {
      const [workspace, list] = await Promise.all([
        workspaceApi.get(workspaceId) as Promise<{ name: string; slug: string }>,
        snapshotApi.list(workspaceId),
      ]);
      if (token !== this._loadToken) return;
      this._workspaceName = workspace.name;
      this._slugId = buildWorkspaceSlugId(workspace.slug ?? null, workspaceId);
      this._snapshots = list.snapshots;
      store.set('snapshotsPage', { workspaceName: workspace.name, workspaceSlugId: this._slugId, currentName: null });
      if (!this._snapshots.length) {
        this._loading = false;
        this._renderMessage('empty');
        return;
      }
      this._renderPage();
      void this._loadCards(token);
      // Read the URL now, not at load start: the user may have moved on.
      this._loading = false;
      const n = ((store.get('routeParams') || {}) as Record<string, string>).n;
      const target = this._snapshotForN(n) ?? this._snapshotForN(undefined)!;
      await this._select(target.id, { updateUrl: !n || target.n !== Number(n), replace: true });
    } catch (err) {
      if (token !== this._loadToken) return;
      // Let a later visit to this workspace's page try again.
      this._loading = false;
      this._workspaceId = null;
      const e = err as ApiErrorLike;
      store.set('snapshotsPage', {
        workspaceName: this._workspaceName || 'Workspace',
        workspaceSlugId: slugId,
        currentName: null,
      });
      if (e.status === 401 || e.data?.code === 'snapshot-sign-in-required') this._renderMessage('signed-out');
      else if (e.status === 403 || e.status === 404) this._renderMessage('not-found');
      else this._renderMessage('error', e.message);
    }
  }

  private async _loadCards(token: number): Promise<void> {
    const queue = [...this._snapshots].sort((a, b) => b.n - a.n).map((s) => s.id);
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (token !== this._loadToken) return;
        if (this._cardUrls.has(id)) continue;
        try {
          const blob = await snapshotApi.file(id, 'card');
          if (token !== this._loadToken) return;
          this._cardUrls.set(id, URL.createObjectURL(blob));
          if (this._filmstrip) this._filmstrip.cardUrls = this._cardUrls;
        } catch (err) {
          console.warn('Snapshot card failed to load:', err);
        }
      }
    };
    await Promise.all(Array.from({ length: CARD_FETCH_CONCURRENCY }, worker));
  }

  // ─── Selection ─────────────────────────────────────────────────────

  private async _select(id: string, opts: { updateUrl?: boolean; replace?: boolean } = {}): Promise<void> {
    const snap = this._snapshots.find((s) => s.id === id);
    if (!snap) return;
    const token = ++this._selectToken;
    this._currentId = id;
    if (opts.updateUrl !== false) {
      navigateTo(`/workspace/${this._slugId}/snapshots/${snap.n}`, { replace: opts.replace ?? true });
    }
    store.set('snapshotsPage', {
      workspaceName: this._workspaceName,
      workspaceSlugId: this._slugId,
      currentName: snap.name,
    });
    if (this._filmstrip) this._filmstrip.currentId = id;
    this._renderDetail();

    try {
      const [svgText, code] = await Promise.all([this._loadSvg(id), this._loadCode(id)]);
      if (token !== this._selectToken) return;
      this._mountViewer(snap, svgText, code);
    } catch (err) {
      if (token !== this._selectToken) return;
      const stage = this.shadowRoot!.querySelector('.stage');
      if (stage) {
        stage.innerHTML = `<div class="message"><p>Couldn't load this snapshot: ${escapeHtml((err as Error).message)}</p></div>`;
      }
    }
  }

  private async _loadSvg(id: string): Promise<string> {
    const cached = this._svgText.get(id);
    if (cached != null) return cached;
    const text = await (await snapshotApi.file(id, 'svg')).text();
    this._svgText.set(id, text);
    return text;
  }

  private async _loadCode(id: string): Promise<string> {
    const cached = this._code.get(id);
    if (cached != null) return cached;
    const text = await (await snapshotApi.file(id, 'code')).text();
    this._code.set(id, text);
    return text;
  }

  /** Replace the viewer with a fresh stock <mini-workspace> for this snapshot. */
  private _mountViewer(snap: SnapshotRecord, svgText: string, code: string): void {
    const stage = this.shadowRoot!.querySelector('.stage');
    if (!stage) return;
    const previous = stage.querySelector('mini-workspace');
    if (previous) this._codeOpen = previous.hasAttribute('code-open');
    if (this._svgUrl) URL.revokeObjectURL(this._svgUrl);
    this._svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));

    const viewer = document.createElement('mini-workspace');
    viewer.setAttribute('caption', snap.name);
    viewer.setAttribute('svg-src', this._svgUrl);
    if (this._codeOpen) viewer.setAttribute('code-open', '');
    const codeEl = document.createElement('code');
    codeEl.textContent = code;
    viewer.appendChild(codeEl);
    stage.replaceChildren(viewer);
  }

  // ─── Actions (from the breadcrumb) ─────────────────────────────────

  private async _runAction(action: string): Promise<void> {
    const snap = this._current;
    if (!snap) return;
    // Bail out of any continuation if the user has moved to another
    // workspace's snapshots (or off the page) while an action awaited.
    const token = this._loadToken;
    const stillHere = (): boolean => token === this._loadToken && this._workspaceId != null;
    try {
      switch (action) {
        case 'copy-code':
          await navigator.clipboard.writeText(await this._loadCode(snap.id));
          break;
        case 'start-workspace': {
          const ws = await snapshotApi.startWorkspace(snap.id);
          if (!stillHere()) return;
          toast({
            type: 'success',
            title: `Created “${ws.name}”`,
            message: 'Random values draw a fresh variation there.',
          });
          navigateTo('/workspace/:slugId', { params: { slugId: buildWorkspaceSlugId(ws.slug ?? null, ws.id) } });
          break;
        }
        case 'export':
          await this._openExport(snap);
          break;
        case 'rename': {
          const name = window.prompt('Rename snapshot', snap.name);
          if (!name?.trim() || name.trim() === snap.name) return;
          const updated = await snapshotApi.update(snap.id, { name: name.trim() });
          if (stillHere()) this._replace(updated);
          break;
        }
        case 'delete':
          await this._delete(snap, stillHere);
          break;
      }
    } catch (err) {
      toast({ type: 'error', title: 'Something went wrong', message: (err as Error).message });
    }
  }

  private async _openExport(snap: SnapshotRecord): Promise<void> {
    const [svgText, code] = await Promise.all([this._loadSvg(snap.id), this._loadCode(snap.id)]);
    const svg = parseSnapshotSvg(svgText);
    const width = snap.width ?? (Number(svg.getAttribute('width')) || 200);
    const height = snap.height ?? (Number(svg.getAttribute('height')) || 200);
    const modal = this.shadowRoot!.querySelector('export-modal') as HTMLElement & {
      open: (svgElement: SVGSVGElement, state: Record<string, unknown>) => void;
    };
    // The snapshot is the source of truth: its own size, background and code
    // (the legend lists the snapshot's code — docs/snapshots.md). It holds no
    // grid, so the grid option has nothing to add.
    modal.open(svg, {
      width,
      height,
      background: snap.background ?? '#ffffff',
      toFixed: null,
      gridEnabled: false,
      gridColor: '#cccccc',
      gridSize: 10,
      workspaceName: snap.name,
      workspaceDescription: snap.note,
      code,
    });
  }

  private async _delete(snap: SnapshotRecord, stillHere: () => boolean): Promise<void> {
    if (!window.confirm(`Delete “${snap.name}”? This can't be undone.`)) return;
    const ids = this._filmstrip?.orderedIds() ?? [];
    const idx = ids.indexOf(snap.id);
    await snapshotApi.remove(snap.id);
    if (!stillHere()) {
      toast({ type: 'success', title: 'Snapshot deleted' });
      return;
    }
    this._snapshots = this._snapshots.filter((s) => s.id !== snap.id);
    const url = this._cardUrls.get(snap.id);
    if (url) URL.revokeObjectURL(url);
    this._cardUrls.delete(snap.id);
    this._svgText.delete(snap.id);
    this._code.delete(snap.id);
    toast({ type: 'success', title: 'Snapshot deleted' });
    if (!this._snapshots.length) {
      this._currentId = null;
      store.set('snapshotsPage', {
        workspaceName: this._workspaceName,
        workspaceSlugId: this._slugId,
        currentName: null,
      });
      navigateTo(`/workspace/${this._slugId}/snapshots`, { replace: true });
      this._renderMessage('empty');
      return;
    }
    this._renderPage();
    const remaining = ids.filter((id) => id !== snap.id);
    const next = remaining[Math.min(idx, remaining.length - 1)] ?? this._snapshots[0].id;
    await this._select(next);
  }

  /** Swap in an updated record (rename / note) and refresh what shows it. */
  private _replace(updated: SnapshotRecord): void {
    this._snapshots = this._snapshots.map((s) => (s.id === updated.id ? updated : s));
    if (this._filmstrip) this._filmstrip.snapshots = this._filmstripItems();
    if (updated.id === this._currentId) {
      store.set('snapshotsPage', {
        workspaceName: this._workspaceName,
        workspaceSlugId: this._slugId,
        currentName: updated.name,
      });
      this._renderDetail();
      this.shadowRoot!.querySelector('mini-workspace')?.setAttribute('caption', updated.name);
    }
  }

  // ─── Rendering ─────────────────────────────────────────────────────

  private _filmstripItems(): { id: string; n: number; note: string; createdAt: string }[] {
    return this._snapshots.map((s) => ({ id: s.id, n: s.n, note: s.note, createdAt: s.createdAt }));
  }

  private _renderPage(): void {
    this._root.innerHTML = `
      <div class="stage"></div>
      <div class="detail"></div>
      <div class="film"><snapshot-filmstrip></snapshot-filmstrip></div>`;
    const strip = this._filmstrip!;
    strip.sort = this._sort;
    strip.snapshots = this._filmstripItems();
    strip.cardUrls = this._cardUrls;
    strip.currentId = this._currentId;
    strip.addEventListener('snapshot-select', (e) => void this._select((e as CustomEvent<{ id: string }>).detail.id));
    strip.addEventListener('snapshot-sort-change', (e) => {
      this._sort = (e as CustomEvent<{ sort: FilmstripSort }>).detail.sort;
    });
  }

  private _renderDetail(): void {
    const snap = this._current;
    const detail = this.shadowRoot!.querySelector('.detail');
    if (!snap || !detail) return;
    const date = new Date(snap.createdAt);
    const when = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const dims = snap.width && snap.height ? `${snap.width} × ${snap.height} · ` : '';
    detail.innerHTML = `
      <span class="name" title="${escapeHtml(snap.name)}">${escapeHtml(snap.name)}<small>#${snap.n} of ${this._snapshots.length}</small></span>
      <span class="meta">${escapeHtml(when)} · ${dims}${formatBytes(snap.svgBytes)}</span>
      <span class="note"><label for="note" title="Edit note">✎</label><input id="note" maxlength="2000" placeholder="Add a note…" aria-label="Note" value="${escapeHtml(snap.note)}" /></span>`;
    const input = detail.querySelector<HTMLInputElement>('#note')!;
    const commit = async (): Promise<void> => {
      const note = input.value.trim();
      const current = this._snapshots.find((s) => s.id === snap.id);
      if (!current || note === current.note) return;
      const token = this._loadToken;
      try {
        const updated = await snapshotApi.update(snap.id, { note });
        if (token === this._loadToken) this._replace(updated);
      } catch (err) {
        toast({ type: 'error', title: 'Note not saved', message: (err as Error).message });
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = snap.note;
        input.blur();
      }
    });
    input.addEventListener('blur', () => void commit());
  }

  private _renderMessage(kind: 'loading' | 'empty' | 'signed-out' | 'not-found' | 'error', detail?: string): void {
    const back = `<button class="btn" data-go="workspace">← Back to the workspace</button>`;
    const bodies: Record<typeof kind, string> = {
      loading: '<p>Loading snapshots…</p>',
      empty: `<div class="icon">${CAMERA_ICON}</div><h3>No snapshots of ${escapeHtml(this._workspaceName || 'this workspace')} yet</h3>
        <p>In the editor, press <b>Snapshot</b> to keep the image you're looking at together with the code that drew it. They'll collect here, ready to export or to start a new workspace from.</p>${back}`,
      'signed-out': `<div class="icon">${CAMERA_ICON}</div><h3>Sign in to see snapshots</h3><p>Snapshots are stored in your account.</p><button class="btn" data-go="sign-in">Sign in</button>`,
      'not-found': `<h3>Snapshots not available</h3><p>This workspace doesn't exist or isn't yours. Snapshots are private to the workspace's owner.</p>`,
      error: `<h3>Couldn't load snapshots</h3><p>${escapeHtml(detail || 'Something went wrong.')}</p>${back}`,
    };
    this._root.innerHTML = `<div class="message"><div>${bodies[kind]}</div></div>`;
    this._root
      .querySelector('[data-go="workspace"]')
      ?.addEventListener('click', () => navigateTo(`/workspace/${this._slugId}`));
    this._root.querySelector('[data-go="sign-in"]')?.addEventListener('click', () => store.set('authModalOpen', true));
  }

  private _releaseAll(): void {
    for (const url of this._cardUrls.values()) URL.revokeObjectURL(url);
    this._cardUrls = new Map();
    this._svgText.clear();
    this._code.clear();
    if (this._svgUrl) URL.revokeObjectURL(this._svgUrl);
    this._svgUrl = null;
  }
}

customElements.define('workspace-snapshots-view', WorkspaceSnapshotsView);
