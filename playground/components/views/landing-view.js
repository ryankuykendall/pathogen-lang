// Landing View - Workspace list with list/grid toggle
// Route: /

import { thumbnailApi, workspaceApi } from '../../services/api.js';
import { store } from '../../state/store.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';

const styles = `
  :host {
    display: block;
    padding: 2rem;
    overflow-y: auto;
    background: var(--bg-primary, #f8f9fa);
  }

  .landing-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    background: var(--bg-secondary, #ffffff);
  }

  .view-toggle button {
    padding: 0.5rem 0.875rem;
    border: none;
    background: transparent;
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all var(--transition-base, 0.15s ease);
  }

  .view-toggle button:not(:last-child) {
    border-right: 1px solid var(--border-color, #e2e8f0);
  }

  .view-toggle button.active {
    background: var(--accent-color, #10b981);
    color: var(--accent-text, #ffffff);
  }

  .view-toggle button:hover:not(.active) {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
  }

  .new-btn {
    padding: 0.625rem 1.25rem;
    background: var(--accent-color, #10b981);
    color: var(--accent-text, #ffffff);
    border: none;
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-base, 0.15s ease);
    box-shadow: var(--shadow-sm);
  }

  .new-btn:hover {
    background: var(--accent-hover, #059669);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .new-btn:active {
    transform: translateY(0);
  }

  .workspace-list {
    display: grid;
    gap: 1rem;
  }

  .workspace-list.grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .workspace-list.list {
    grid-template-columns: 1fr;
  }

  /* Grid view: image-on-top layout */
  .workspace-list.grid .workspace-item {
    position: relative;
    padding: 0;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-secondary, #ffffff);
    cursor: pointer;
    transition: all var(--transition-base, 0.15s ease);
    box-shadow: var(--shadow-sm);
  }

  .workspace-list.grid .workspace-item:hover {
    border-color: var(--accent-color, #10b981);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .workspace-thumb {
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: var(--bg-primary, #f1f5f9);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
  }

  .workspace-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
    user-select: none;
  }

  .workspace-list.grid .workspace-info {
    padding: 1rem 1.25rem;
    position: relative;
  }

  /* List view: thumbnail on left, text on right */
  .workspace-list.list .workspace-item {
    position: relative;
    padding: 0;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-secondary, #ffffff);
    cursor: pointer;
    transition: all var(--transition-base, 0.15s ease);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: stretch;
  }

  .workspace-list.list .workspace-item:hover {
    border-color: var(--accent-color, #10b981);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .workspace-thumb-sm {
    width: 128px;
    overflow: hidden;
    background: var(--bg-primary, #f1f5f9);
    flex-shrink: 0;
    border-radius: var(--radius-lg, 12px) 0 0 var(--radius-lg, 12px);
  }

  .workspace-thumb-sm img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-placeholder-sm {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
    user-select: none;
  }

  .workspace-list.list .workspace-info {
    flex: 1;
    min-width: 0;
    position: relative;
    padding: 1rem 1.25rem;
  }

  .workspace-info h3 {
    margin: 0 0 0.375rem 0;
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
    padding-right: 2.5rem;
  }

  .workspace-info p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary, #64748b);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .workspace-meta {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-tertiary, #94a3b8);
    font-family: var(--font-mono, 'Inconsolata', monospace);
  }

  .workspace-meta .public-badge {
    background: var(--success-bg, #ecfdf5);
    color: var(--success-color, #10b981);
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-sm, 4px);
    font-weight: 500;
    border: 1px solid var(--success-border, #a7f3d0);
  }

  /* Overflow menu */
  .menu-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary, #94a3b8);
    transition: all var(--transition-base, 0.15s ease);
  }

  .menu-btn:hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
    color: var(--text-primary, #1a1a2e);
  }

  .menu-dropdown {
    position: absolute;
    top: 3rem;
    right: 0.75rem;
    background: var(--bg-elevated, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-lg);
    min-width: 160px;
    z-index: var(--z-dropdown, 100);
    display: none;
    overflow: hidden;
  }

  .menu-dropdown.open {
    display: block;
    animation: dropdownFadeIn 0.15s ease;
  }

  @keyframes dropdownFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-dropdown button {
    display: block;
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary, #1a1a2e);
    cursor: pointer;
    transition: background var(--transition-fast, 0.1s ease);
  }

  .menu-dropdown button:hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
  }

  .menu-dropdown button.danger {
    color: var(--error-color, #ef4444);
  }

  .menu-dropdown button.danger:hover {
    background: var(--error-bg, #fef2f2);
  }

  /* Loading state */
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

  /* Error state */
  .error-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--error-color, #ef4444);
    background: var(--error-bg, #fef2f2);
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--error-border, #fecaca);
  }

  .error-state button {
    margin-top: 1rem;
    padding: 0.5rem 1.25rem;
    background: var(--bg-secondary, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    font-weight: 500;
    transition: all var(--transition-base, 0.15s ease);
  }

  .error-state button:hover {
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary, #64748b);
    background: var(--bg-secondary, #ffffff);
    border-radius: var(--radius-lg, 12px);
    border: 2px dashed var(--border-color, #e2e8f0);
  }

  .empty-state h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: var(--text-primary, #1a1a2e);
  }

  .empty-state p {
    margin: 0 0 1.5rem 0;
    font-size: 0.9375rem;
  }

  /* Menu positioning in grid view (inside workspace-info) */
  .workspace-list.grid .menu-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .workspace-list.grid .menu-dropdown {
    position: absolute;
    top: 2.5rem;
    right: 0.5rem;
  }

  /* Menu positioning in list view (inside workspace-info) */
  .workspace-list.list .menu-btn {
    position: absolute;
    top: 0;
    right: 0;
  }

  .workspace-list.list .menu-dropdown {
    position: absolute;
    top: 2rem;
    right: 0;
  }

  @media (max-width: 600px) {
    :host {
      padding: 1rem;
    }

    .landing-header {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .controls {
      justify-content: space-between;
    }

    .workspace-list.grid {
      grid-template-columns: 1fr;
    }
  }
`;

class LandingView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.viewMode = 'grid';
    this._unsubscribe = null;
    this._loading = false;
    this._error = null;
    this._openMenuId = null;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();

    // Subscribe to view changes to reload when becoming active
    this._unsubscribe = store.subscribe(['currentView'], () => {
      if (store.get('currentView') === 'landing') {
        this.loadWorkspaces();
      }
    });

    // Initial load if we're on landing
    if (store.get('currentView') === 'landing') {
      this.loadWorkspaces();
    }

    // Close menu on outside click
    document.addEventListener('click', this._handleOutsideClick);

    // Listen for thumbnail updates to refresh cards
    this._handleThumbnailUpdated = (e) => {
      const workspaceId = e.detail?.workspaceId;
      if (workspaceId) {
        // Update the specific card's thumbnail (bust cache with timestamp)
        const imgs = this.shadowRoot.querySelectorAll(`[data-id="${workspaceId}"] img`);
        const timestamp = Date.now();
        imgs.forEach((img) => {
          const base = img.src.split('?')[0];
          img.src = `${base}?v=${timestamp}`;
        });

        // Also update the workspace data in store so re-renders show the thumbnail
        const workspaces = store.get('workspaces') || [];
        const ws = workspaces.find((w) => w.id === workspaceId);
        if (ws && !ws.thumbnailAt) {
          ws.thumbnailAt = new Date().toISOString();
          store.set('workspaces', [...workspaces]);
        }
      } else {
        // Full refresh
        this.loadWorkspaces();
      }
    };
    document.addEventListener('thumbnail-updated', this._handleThumbnailUpdated);
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    document.removeEventListener('click', this._handleOutsideClick);
    if (this._handleThumbnailUpdated) {
      document.removeEventListener('thumbnail-updated', this._handleThumbnailUpdated);
    }
  }

  _handleOutsideClick = (e) => {
    if (!this._openMenuId) return;

    // Use composedPath to check clicks across shadow DOM boundaries
    const path = e.composedPath();
    const isMenuClick = path.some(
      (el) => el.classList && (el.classList.contains('menu-btn') || el.classList.contains('menu-dropdown')),
    );

    if (!isMenuClick) {
      const dropdown = this.shadowRoot.querySelector(`.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`);
      if (dropdown) dropdown.classList.remove('open');
      this._openMenuId = null;
    }
  };

  async loadWorkspaces() {
    this._loading = true;
    this._error = null;
    this.render();

    try {
      const workspaces = await workspaceApi.list();
      store.set('workspaces', workspaces);
      this._loading = false;
      this.render();
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      this._loading = false;
      this._error = err.message || 'Failed to load workspaces';
      this.render();
    }
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      // View toggle
      const toggleBtn = e.target.closest('.view-toggle button');
      if (toggleBtn) {
        this.viewMode = toggleBtn.dataset.view;
        this.render();
        return;
      }

      // New workspace button
      if (e.target.closest('.new-btn')) {
        navigateTo('/workspace/new');
        return;
      }

      // Menu button
      const menuBtn = e.target.closest('.menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        const id = menuBtn.dataset.id;

        // Close any currently open menu
        if (this._openMenuId && this._openMenuId !== id) {
          const oldDropdown = this.shadowRoot.querySelector(
            `.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`,
          );
          if (oldDropdown) oldDropdown.classList.remove('open');
        }

        // Toggle the clicked menu
        const dropdown = menuBtn.closest('.workspace-item').querySelector('.menu-dropdown');
        if (dropdown) {
          const isOpen = dropdown.classList.toggle('open');
          this._openMenuId = isOpen ? id : null;
        }
        return;
      }

      // Menu actions
      const menuAction = e.target.closest('.menu-dropdown button');
      if (menuAction) {
        e.stopPropagation();
        const action = menuAction.dataset.action;
        const id = menuAction.closest('.workspace-item').dataset.id;
        this.handleMenuAction(action, id);
        return;
      }

      // Workspace item click (but not on menu)
      const workspaceItem = e.target.closest('.workspace-item');
      if (workspaceItem && !e.target.closest('.menu-btn') && !e.target.closest('.menu-dropdown')) {
        const id = workspaceItem.dataset.id;
        const slug = workspaceItem.dataset.slug;
        const slugId = buildWorkspaceSlugId(slug, id);
        navigateTo('/workspace/:slugId', { params: { slugId } });
        return;
      }

      // Retry button
      if (e.target.closest('.retry-btn')) {
        this.loadWorkspaces();
      }
    });
  }

  async handleMenuAction(action, id) {
    // Close the menu
    const dropdown = this.shadowRoot.querySelector(`.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`);
    if (dropdown) dropdown.classList.remove('open');
    this._openMenuId = null;

    switch (action) {
      case 'copy':
        navigateTo('/workspace/new', { query: { copyFrom: id } });
        break;

      case 'toggle-publish':
        try {
          const workspaces = store.get('workspaces') || [];
          const workspace = workspaces.find((w) => w.id === id);
          if (!workspace) return;

          const newIsPublic = !workspace.isPublic;
          await workspaceApi.update(id, { isPublic: newIsPublic });

          // Update local state
          workspace.isPublic = newIsPublic;
          store.set('workspaces', [...workspaces]);
          this.render();
        } catch (err) {
          console.error('Failed to update workspace visibility:', err);
          alert(`Failed to update visibility: ${err.message}`);
        }
        break;

      case 'delete':
        if (confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
          try {
            await workspaceApi.delete(id);
            // Remove from local state
            const workspaces = store.get('workspaces') || [];
            store.set(
              'workspaces',
              workspaces.filter((w) => w.id !== id),
            );
            this.render();
          } catch (err) {
            console.error('Failed to delete workspace:', err);
            alert(`Failed to delete workspace: ${err.message}`);
          }
        }
        break;
    }
  }

  formatDate(isoString) {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  render() {
    const workspaces = store.get('workspaces') || [];

    let content = '';

    if (this._loading) {
      content = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading workspaces...</p>
        </div>
      `;
    } else if (this._error) {
      content = `
        <div class="error-state">
          <p>Failed to load workspaces: ${this.escapeHtml(this._error)}</p>
          <button class="retry-btn">Retry</button>
        </div>
      `;
    } else if (workspaces.length === 0) {
      content = `
        <div class="empty-state">
          <h2>No workspaces yet</h2>
          <p>Create your first workspace to start building SVG paths.</p>
          <button class="new-btn">+ New Workspace</button>
        </div>
      `;
    } else {
      content = `
        <div class="workspace-list ${this.viewMode}">
          ${workspaces
            .map((ws) => {
              const initial = (ws.name || '?')[0];
              const color = this.generateColor(ws.id);
              if (this.viewMode === 'grid') {
                return `
              <div class="workspace-item" data-id="${ws.id}" data-slug="${ws.slug || ''}">
                <div class="workspace-thumb">
                  ${
                    ws.thumbnailAt
                      ? `<img src="${thumbnailApi.url(ws.id, 512)}" alt="" loading="lazy" />`
                      : `<div class="thumb-placeholder" style="background:${color}">${this.escapeHtml(initial)}</div>`
                  }
                </div>
                <div class="workspace-info">
                  <button class="menu-btn" data-id="${ws.id}" title="More options">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5"/>
                      <circle cx="8" cy="8" r="1.5"/>
                      <circle cx="8" cy="13" r="1.5"/>
                    </svg>
                  </button>
                  <div class="menu-dropdown ${this._openMenuId === ws.id ? 'open' : ''}">
                    <button data-action="copy">Duplicate</button>
                    <button data-action="toggle-publish">${ws.isPublic ? 'Make Private' : 'Make Public'}</button>
                    <button data-action="delete" class="danger">Delete</button>
                  </div>
                  <h3>${this.escapeHtml(ws.name)}</h3>
                  <p>${this.escapeHtml(ws.description) || 'No description'}</p>
                  <div class="workspace-meta">
                    <span>Modified: ${this.formatDate(ws.updatedAt)}</span>
                    ${ws.isPublic ? '<span class="public-badge">Public</span>' : ''}
                  </div>
                </div>
              </div>`;
              }
              return `
              <div class="workspace-item" data-id="${ws.id}" data-slug="${ws.slug || ''}">
                <div class="workspace-thumb-sm">
                  ${
                    ws.thumbnailAt
                      ? `<img src="${thumbnailApi.url(ws.id, 256)}" alt="" loading="lazy" />`
                      : `<div class="thumb-placeholder-sm" style="background:${color}">${this.escapeHtml(initial)}</div>`
                  }
                </div>
                <div class="workspace-info">
                  <button class="menu-btn" data-id="${ws.id}" title="More options">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5"/>
                      <circle cx="8" cy="8" r="1.5"/>
                      <circle cx="8" cy="13" r="1.5"/>
                    </svg>
                  </button>
                  <div class="menu-dropdown ${this._openMenuId === ws.id ? 'open' : ''}">
                    <button data-action="copy">Duplicate</button>
                    <button data-action="toggle-publish">${ws.isPublic ? 'Make Private' : 'Make Public'}</button>
                    <button data-action="delete" class="danger">Delete</button>
                  </div>
                  <h3>${this.escapeHtml(ws.name)}</h3>
                  <p>${this.escapeHtml(ws.description) || 'No description'}</p>
                  <div class="workspace-meta">
                    <span>Modified: ${this.formatDate(ws.updatedAt)}</span>
                    ${ws.isPublic ? '<span class="public-badge">Public</span>' : ''}
                  </div>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <div class="landing-header">
        <h1>My Workspaces</h1>
        <div class="controls">
          <div class="view-toggle">
            <button data-view="list" class="${this.viewMode === 'list' ? 'active' : ''}">List</button>
            <button data-view="grid" class="${this.viewMode === 'grid' ? 'active' : ''}">Grid</button>
          </div>
          <button class="new-btn">+ New Workspace</button>
        </div>
      </div>

      ${content}
    `;
  }

  // Deterministic color from workspace ID
  generateColor(id) {
    if (!id) return 'hsl(200, 40%, 60%)';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 55%)`;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('landing-view', LandingView);

export default LandingView;
