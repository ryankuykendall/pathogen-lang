// Landing View - Workspace list with list/grid toggle
// Route: /

import { thumbnailApi, workspaceApi } from '../../services/api.js';
import { store } from '../../state/store.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';
import styles from './landing-view.css';

interface Workspace {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  updatedAt?: string;
  thumbnailAt?: string;
}

class LandingView extends HTMLElement {
  private viewMode: 'grid' | 'list' = 'grid';
  private _unsubscribe: (() => void) | null = null;
  private _loading: boolean = false;
  private _error: string | null = null;
  private _openMenuId: string | null = null;
  private _handleThumbnailUpdated: ((e: Event) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
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
    this._handleThumbnailUpdated = (e: Event) => {
      const workspaceId = (e as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId;
      if (workspaceId) {
        // Update the specific card's thumbnail (bust cache with timestamp)
        const imgs = this.shadowRoot!.querySelectorAll<HTMLImageElement>(`[data-id="${workspaceId}"] img`);
        const timestamp = Date.now();
        imgs.forEach((img) => {
          const base = img.src.split('?')[0];
          img.src = `${base}?v=${timestamp}`;
        });

        // Also update the workspace data in store so re-renders show the thumbnail
        const workspaces = (store.get('workspaces') as Workspace[] | undefined) || [];
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

  disconnectedCallback(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    document.removeEventListener('click', this._handleOutsideClick);
    if (this._handleThumbnailUpdated) {
      document.removeEventListener('thumbnail-updated', this._handleThumbnailUpdated);
    }
  }

  _handleOutsideClick = (e: MouseEvent): void => {
    if (!this._openMenuId) return;

    // Use composedPath to check clicks across shadow DOM boundaries
    const path = e.composedPath();
    const isMenuClick = path.some(
      (el) =>
        (el as HTMLElement).classList &&
        ((el as HTMLElement).classList.contains('menu-btn') ||
          (el as HTMLElement).classList.contains('menu-dropdown')),
    );

    if (!isMenuClick) {
      const dropdown = this.shadowRoot!.querySelector(
        `.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`,
      );
      if (dropdown) dropdown.classList.remove('open');
      this._openMenuId = null;
    }
  };

  async loadWorkspaces(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.render();

    try {
      const workspaces = (await workspaceApi.list()) as Workspace[];
      store.set('workspaces', workspaces);
      this._loading = false;
      this.render();
    } catch (err: unknown) {
      console.error('Failed to load workspaces:', err);
      this._loading = false;
      this._error = (err as Error).message || 'Failed to load workspaces';
      this.render();
    }
  }

  setupEventListeners(): void {
    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;

      // View toggle
      const toggleBtn = target.closest('.view-toggle button') as HTMLButtonElement | null;
      if (toggleBtn) {
        this.viewMode = toggleBtn.dataset.view as 'grid' | 'list';
        this.render();
        return;
      }

      // New workspace button
      if (target.closest('.new-btn')) {
        navigateTo('/workspace/new');
        return;
      }

      // Menu button
      const menuBtn = target.closest('.menu-btn') as HTMLButtonElement | null;
      if (menuBtn) {
        e.stopPropagation();
        const id = menuBtn.dataset.id!;

        // Close any currently open menu
        if (this._openMenuId && this._openMenuId !== id) {
          const oldDropdown = this.shadowRoot!.querySelector(
            `.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`,
          );
          if (oldDropdown) oldDropdown.classList.remove('open');
        }

        // Toggle the clicked menu
        const dropdown = menuBtn.closest('.workspace-item')!.querySelector('.menu-dropdown');
        if (dropdown) {
          const isOpen = dropdown.classList.toggle('open');
          this._openMenuId = isOpen ? id : null;
        }
        return;
      }

      // Menu actions
      const menuAction = target.closest('.menu-dropdown button') as HTMLButtonElement | null;
      if (menuAction) {
        e.stopPropagation();
        const action = menuAction.dataset.action!;
        const id = (menuAction.closest('.workspace-item') as HTMLElement).dataset.id!;
        this.handleMenuAction(action, id);
        return;
      }

      // Workspace item click (but not on menu)
      const workspaceItem = target.closest('.workspace-item') as HTMLElement | null;
      if (workspaceItem && !target.closest('.menu-btn') && !target.closest('.menu-dropdown')) {
        const id = workspaceItem.dataset.id!;
        const slug = workspaceItem.dataset.slug || '';
        const slugId = buildWorkspaceSlugId(slug, id);
        navigateTo('/workspace/:slugId', { params: { slugId } });
        return;
      }

      // Retry button
      if (target.closest('.retry-btn')) {
        this.loadWorkspaces();
      }
    });
  }

  async handleMenuAction(action: string, id: string): Promise<void> {
    // Close the menu
    const dropdown = this.shadowRoot!.querySelector(
      `.workspace-item[data-id="${this._openMenuId}"] .menu-dropdown`,
    );
    if (dropdown) dropdown.classList.remove('open');
    this._openMenuId = null;

    switch (action) {
      case 'copy':
        navigateTo('/workspace/new', { query: { copyFrom: id } });
        break;

      case 'toggle-publish':
        try {
          const workspaces = ((store.get('workspaces') as Workspace[] | undefined) || []) as Workspace[];
          const workspace = workspaces.find((w) => w.id === id);
          if (!workspace) return;

          const newIsPublic = !workspace.isPublic;
          await workspaceApi.update(id, { isPublic: newIsPublic });

          // Update local state
          workspace.isPublic = newIsPublic;
          store.set('workspaces', [...workspaces]);
          this.render();
        } catch (err: unknown) {
          console.error('Failed to update workspace visibility:', err);
          alert(`Failed to update visibility: ${(err as Error).message}`);
        }
        break;

      case 'delete':
        if (confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
          try {
            await workspaceApi.delete(id);
            // Remove from local state
            const workspaces = ((store.get('workspaces') as Workspace[] | undefined) || []) as Workspace[];
            store.set(
              'workspaces',
              workspaces.filter((w) => w.id !== id),
            );
            this.render();
          } catch (err: unknown) {
            console.error('Failed to delete workspace:', err);
            alert(`Failed to delete workspace: ${(err as Error).message}`);
          }
        }
        break;
    }
  }

  formatDate(isoString: string | undefined): string {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  render(): void {
    const workspaces = ((store.get('workspaces') as Workspace[] | undefined) || []) as Workspace[];

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

    this.shadowRoot!.innerHTML = `
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
  generateColor(id: string): string {
    if (!id) return 'hsl(200, 40%, 60%)';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 55%)`;
  }

  escapeHtml(text: string | undefined): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('landing-view', LandingView);

export default LandingView;
