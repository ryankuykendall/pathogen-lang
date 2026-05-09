// Admin Thumbnails View - Backfill screen for generating missing thumbnails
// Route: /admin/thumbnails?token=<admin_token>

import { thumbnailApi, workspaceApi } from '../../services/api.js';
import compilerWorker from '../../services/compiler-worker.js';
import thumbnailService from '../../services/thumbnail-service.js';
import { store } from '../../state/store.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';
import styles from './admin-thumbnails-view.css';

declare const __PATHOGEN_API_BASE__: string;
const API_BASE = __PATHOGEN_API_BASE__;

interface AdminWorkspace {
  id: string;
  slug?: string;
  name: string;
  userId: string;
  updatedAt?: string;
  code?: string;
  preferences?: Record<string, unknown>;
}

type WorkspaceStatus = 'generating' | 'done' | 'error';

interface WorkspaceState {
  [key: string]: unknown;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fillEnabled: boolean;
  fill: string;
  background: string;
  pathData: string;
}

class AdminThumbnailsView extends HTMLElement {
  private _token: string | null = null;
  private _workspaces: AdminWorkspace[] = [];
  private _loading: boolean = false;
  private _unauthorized: boolean = false;
  private _statuses: Record<string, WorkspaceStatus> = {};
  private _bulkRunning: boolean = false;
  private _bulkProgress: number = 0;
  private _bulkTotal: number = 0;
  private _unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._setupEventListeners();

    this._unsubscribe = store.subscribe(['currentView', 'routeQuery'], () => {
      if (store.get('currentView') === 'admin-thumbnails') {
        this._token = ((store.get('routeQuery') as Record<string, string> | undefined) || {}).token || null;
        this._loadWorkspaces();
      }
    });

    if (store.get('currentView') === 'admin-thumbnails') {
      this._token = ((store.get('routeQuery') as Record<string, string> | undefined) || {}).token || null;
      this._loadWorkspaces();
    }
  }

  disconnectedCallback(): void {
    if (this._unsubscribe) this._unsubscribe();
  }

  async _loadWorkspaces(): Promise<void> {
    if (!this._token) {
      this._unauthorized = true;
      this._renderContent();
      return;
    }

    this._loading = true;
    this._unauthorized = false;
    this._renderContent();

    try {
      const response = await fetch(
        `${API_BASE}/admin/workspaces-without-thumbnails?token=${encodeURIComponent(this._token)}`,
        { credentials: 'include' },
      );
      if (response.status === 401) {
        this._unauthorized = true;
        this._loading = false;
        this._renderContent();
        return;
      }
      const data = (await response.json()) as AdminWorkspace[];
      if (!response.ok) throw new Error((data as unknown as { error?: string }).error || 'Failed to load');
      this._workspaces = data;
      this._loading = false;
      this._renderContent();
    } catch (err: unknown) {
      console.error('Admin load failed:', err);
      this._loading = false;
      this._unauthorized = true;
      this._renderContent();
    }
  }

  async _autoGenerateOne(workspaceId: string): Promise<void> {
    this._statuses[workspaceId] = 'generating';
    this._renderContent();

    try {
      // Fetch workspace data (admin token bypasses ownership check)
      const workspace = (await workspaceApi.get(workspaceId, { adminToken: this._token! })) as AdminWorkspace;

      // Compile the code to get path data
      const code = workspace.code || '';
      if (!code.trim()) {
        console.warn(`Workspace ${workspaceId} has no code, skipping`);
        this._statuses[workspaceId] = 'done';
        this._renderContent();
        return;
      }

      const toFixed = (workspace.preferences?.toFixed as number | null) ?? null;
      const compileOptions = toFixed != null ? { toFixed } : undefined;
      const result = (await compilerWorker.compileWithContext(code, 0, () => false, compileOptions)) as {
        path?: string;
      };

      if (!result.path || !result.path.trim()) {
        console.warn(`Workspace ${workspaceId} compiled to empty path, skipping`);
        this._statuses[workspaceId] = 'done';
        this._renderContent();
        return;
      }

      // Build workspace state for thumbnail generation
      const prefs = workspace.preferences || {};
      const wsState: WorkspaceState = {
        width: (prefs.width as number) || 200,
        height: (prefs.height as number) || 200,
        stroke: (prefs.stroke as string) || '#000000',
        strokeWidth: (prefs.strokeWidth as number) || 2,
        fillEnabled: (prefs.fillEnabled as boolean) || false,
        fill: (prefs.fill as string) || '#3498db',
        background: (prefs.background as string) || '#f5f5f5',
        pathData: result.path,
      };

      // Build the SVG string directly — bypasses DOM createElementNS + XMLSerializer
      // which can produce namespace/serialization artifacts that break SVG-as-image rendering.
      const svgString = this._buildSvgString(wsState);

      const uploadResult = await thumbnailService.generateThumbnail(workspaceId, null as any, wsState, undefined, {
        adminToken: this._token!,
        svgString,
      });
      if (!uploadResult) {
        throw new Error('generateThumbnail returned null — generation was blocked or timed out');
      }
      this._statuses[workspaceId] = 'done';
    } catch (err: unknown) {
      console.error(`Auto-generate failed for ${workspaceId}:`, err);
      this._statuses[workspaceId] = 'error';
    }

    this._renderContent();
  }

  _buildSvgString(state: WorkspaceState): string {
    // Compute auto center-crop and raster size (mirrors generateThumbnail logic)
    const w = state.width;
    const h = state.height;
    const cropSize = Math.min(w, h);
    const cropX = (w - cropSize) / 2;
    const cropY = (h - cropSize) / 2;
    const rasterSize = Math.max(1024, Math.min(Math.ceil(cropSize), 4096));
    const fill = state.fillEnabled ? state.fill : 'none';

    // Escape path data for XML attribute (only & and " need escaping in path data)
    const d = (state.pathData || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${rasterSize}" height="${rasterSize}" viewBox="${cropX} ${cropY} ${cropSize} ${cropSize}"><rect width="${w}" height="${h}" fill="${state.background}"/><path d="${d}" stroke="${state.stroke}" stroke-width="${state.strokeWidth}" fill="${fill}"/></svg>`;
  }

  async _autoGenerateAll(): Promise<void> {
    if (this._bulkRunning) return;
    this._bulkRunning = true;

    const remaining = this._workspaces.filter((ws) => this._statuses[ws.id] !== 'done');
    this._bulkTotal = remaining.length;
    this._bulkProgress = 0;
    this._renderContent();

    for (const ws of remaining) {
      await this._autoGenerateOne(ws.id);
      this._bulkProgress++;
      this._renderContent();
    }

    this._bulkRunning = false;
    this._renderContent();
  }

  _setupEventListeners(): void {
    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'generate' && id) {
        this._autoGenerateOne(id);
      } else if (action === 'generate-all') {
        this._autoGenerateAll();
      } else if (action === 'open' && id) {
        const ws = this._workspaces.find((w) => w.id === id);
        const slugId = buildWorkspaceSlugId(ws?.slug ?? null, id);
        navigateTo('/workspace/:slugId', { params: { slugId } });
      }
    });
  }

  _renderContent(): void {
    const container = this.shadowRoot!.querySelector('.content-area') as HTMLElement | null;
    if (!container) return;

    if (this._unauthorized) {
      container.innerHTML = `<div class="unauthorized"><h2>Unauthorized</h2><p>Invalid or missing admin token.</p></div>`;
      return;
    }

    if (this._loading) {
      container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading workspaces...</p></div>`;
      return;
    }

    if (this._workspaces.length === 0) {
      container.innerHTML = `<div class="empty-state"><h2>All workspaces have thumbnails</h2><p>Nothing to backfill.</p></div>`;
      return;
    }

    const progressPercent = this._bulkTotal > 0 ? (this._bulkProgress / this._bulkTotal) * 100 : 0;

    container.innerHTML = `
      <div class="progress-bar ${this._bulkRunning ? 'visible' : ''}">
        <div class="progress-track">
          <div class="progress-fill" style="width:${progressPercent}%"></div>
        </div>
        <div class="progress-label">${this._bulkProgress} / ${this._bulkTotal} completed</div>
      </div>

      <div class="toolbar">
        <span class="count">${this._workspaces.length} workspaces without thumbnails</span>
        <button class="btn primary" data-action="generate-all" ${this._bulkRunning ? 'disabled' : ''}>
          ${this._bulkRunning ? 'Generating...' : 'Auto-generate All'}
        </button>
      </div>

      <div class="workspace-list">
        ${this._workspaces
          .map((ws) => {
            const status = this._statuses[ws.id];
            return `
            <div class="workspace-row">
              <div class="ws-info">
                <div class="ws-name">${this._escapeHtml(ws.name)}</div>
                <div class="ws-meta">ID: ${ws.id} &middot; Owner: ${ws.userId} &middot; Updated: ${ws.updatedAt || 'unknown'}</div>
              </div>
              <div class="ws-actions">
                ${status === 'generating' ? '<span class="status generating">Generating...</span>' : ''}
                ${status === 'done' ? '<span class="status done">Done</span>' : ''}
                ${status === 'error' ? '<span class="status error">Failed</span>' : ''}
                ${
                  !status || status === 'error'
                    ? `
                  <button class="btn" data-action="generate" data-id="${ws.id}" ${this._bulkRunning ? 'disabled' : ''}>Auto-generate</button>
                `
                    : ''
                }
                <button class="btn" data-action="open" data-id="${ws.id}">Open</button>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  }

  _escapeHtml(text: string | undefined): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <h1>Admin: Thumbnail Backfill</h1>
      <p class="subtitle">Generate thumbnails for workspaces that don't have them yet.</p>
      <div class="content-area"></div>
    `;
  }
}

customElements.define('admin-thumbnails-view', AdminThumbnailsView);

export default AdminThumbnailsView;
