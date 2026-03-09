// Admin Thumbnails View - Backfill screen for generating missing thumbnails
// Route: /admin/thumbnails?token=<admin_token>

import { thumbnailApi, workspaceApi } from '../../services/api.js';
import compilerWorker from '../../services/compiler-worker.js';
import thumbnailService from '../../services/thumbnail-service.js';
import { store } from '../../state/store.js';
import { BASE_PATH, buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';

const API_BASE = `${BASE_PATH}/api`;

const styles = `
  :host {
    display: block;
    padding: 2rem;
    overflow-y: auto;
    background: var(--bg-primary, #f8f9fa);
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: var(--text-secondary, #64748b);
    font-size: 0.875rem;
  }

  .unauthorized {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--error-color, #ef4444);
    background: var(--error-bg, #fef2f2);
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--error-border, #fecaca);
  }

  .loading-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary, #64748b);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color, #e2e8f0);
    border-top-color: var(--accent-color, #10b981);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary, #64748b);
    background: var(--bg-secondary, #ffffff);
    border-radius: var(--radius-lg, 12px);
    border: 2px dashed var(--border-color, #e2e8f0);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .count {
    font-size: 0.875rem;
    color: var(--text-secondary, #64748b);
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
  }

  .workspace-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .workspace-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
  }

  .workspace-row .ws-info {
    flex: 1;
    min-width: 0;
  }

  .workspace-row .ws-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text-primary, #1a1a2e);
  }

  .workspace-row .ws-meta {
    font-size: 0.75rem;
    color: var(--text-tertiary, #94a3b8);
    font-family: var(--font-mono, 'Inconsolata', monospace);
    margin-top: 0.25rem;
  }

  .workspace-row .ws-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .workspace-row .status {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.625rem;
    border-radius: var(--radius-sm, 4px);
  }

  .status.generating {
    background: #fef3c7;
    color: #92400e;
  }

  .status.done {
    background: var(--success-bg, #ecfdf5);
    color: var(--success-color, #10b981);
  }

  .status.error {
    background: var(--error-bg, #fef2f2);
    color: var(--error-color, #ef4444);
  }

  /* Progress bar */
  .progress-bar {
    margin-bottom: 1.5rem;
    display: none;
  }

  .progress-bar.visible {
    display: block;
  }

  .progress-track {
    height: 8px;
    background: var(--border-color, #e2e8f0);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-color, #10b981);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #64748b);
    margin-top: 0.375rem;
  }
`;

class AdminThumbnailsView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token = null;
    this._workspaces = [];
    this._loading = false;
    this._unauthorized = false;
    this._statuses = {}; // workspaceId -> 'generating' | 'done' | 'error'
    this._bulkRunning = false;
    this._bulkProgress = 0;
    this._bulkTotal = 0;
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();

    this._unsubscribe = store.subscribe(['currentView', 'routeQuery'], () => {
      if (store.get('currentView') === 'admin-thumbnails') {
        this._token = (store.get('routeQuery') || {}).token || null;
        this._loadWorkspaces();
      }
    });

    if (store.get('currentView') === 'admin-thumbnails') {
      this._token = (store.get('routeQuery') || {}).token || null;
      this._loadWorkspaces();
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  async _loadWorkspaces() {
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
      );
      if (response.status === 401) {
        this._unauthorized = true;
        this._loading = false;
        this._renderContent();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load');
      this._workspaces = data;
      this._loading = false;
      this._renderContent();
    } catch (err) {
      console.error('Admin load failed:', err);
      this._loading = false;
      this._unauthorized = true;
      this._renderContent();
    }
  }

  async _autoGenerateOne(workspaceId) {
    this._statuses[workspaceId] = 'generating';
    this._renderContent();

    try {
      // Fetch workspace data (admin token bypasses ownership check)
      const workspace = await workspaceApi.get(workspaceId, { adminToken: this._token });

      // Compile the code to get path data
      const code = workspace.code || '';
      if (!code.trim()) {
        console.warn(`Workspace ${workspaceId} has no code, skipping`);
        this._statuses[workspaceId] = 'done';
        this._renderContent();
        return;
      }

      const toFixed = workspace.preferences?.toFixed ?? null;
      const compileOptions = toFixed != null ? { toFixed } : undefined;
      const result = await compilerWorker.compileWithContext(code, 0, () => false, compileOptions);

      if (!result.path || !result.path.trim()) {
        console.warn(`Workspace ${workspaceId} compiled to empty path, skipping`);
        this._statuses[workspaceId] = 'done';
        this._renderContent();
        return;
      }

      // Build workspace state for thumbnail generation
      const prefs = workspace.preferences || {};
      const wsState = {
        width: prefs.width || 200,
        height: prefs.height || 200,
        stroke: prefs.stroke || '#000000',
        strokeWidth: prefs.strokeWidth || 2,
        fillEnabled: prefs.fillEnabled || false,
        fill: prefs.fill || '#3498db',
        background: prefs.background || '#f5f5f5',
        pathData: result.path,
      };

      // Build the SVG string directly — bypasses DOM createElementNS + XMLSerializer
      // which can produce namespace/serialization artifacts that break SVG-as-image rendering.
      const svgString = this._buildSvgString(wsState);

      const uploadResult = await thumbnailService.generateThumbnail(workspaceId, null, wsState, null, {
        adminToken: this._token,
        svgString,
      });
      if (!uploadResult) {
        throw new Error('generateThumbnail returned null — generation was blocked or timed out');
      }
      this._statuses[workspaceId] = 'done';
    } catch (err) {
      console.error(`Auto-generate failed for ${workspaceId}:`, err);
      this._statuses[workspaceId] = 'error';
    }

    this._renderContent();
  }

  _buildSvgString(state) {
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

  async _autoGenerateAll() {
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

  _setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'generate' && id) {
        this._autoGenerateOne(id);
      } else if (action === 'generate-all') {
        this._autoGenerateAll();
      } else if (action === 'open' && id) {
        const ws = this._workspaces.find((w) => w.id === id);
        const slugId = buildWorkspaceSlugId(ws?.slug, id);
        navigateTo('/workspace/:slugId', { params: { slugId } });
      }
    });
  }

  _renderContent() {
    const container = this.shadowRoot.querySelector('.content-area');
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

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <h1>Admin: Thumbnail Backfill</h1>
      <p class="subtitle">Generate thumbnails for workspaces that don't have them yet.</p>
      <div class="content-area"></div>
    `;
  }
}

customElements.define('admin-thumbnails-view', AdminThumbnailsView);

export default AdminThumbnailsView;
