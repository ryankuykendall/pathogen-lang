// Landing View - Workspace list with list/grid toggle
// Route: /

import { snapshotApi, thumbnailApi, workspaceApi } from '../../services/api.js';
import { hasFeature, UserFeature, type CurrentUser } from '../../services/auth.js';
import { autosave } from '../../services/autosave.js';
import {
  precheckWorkspace,
  toastPrivateSuccess,
  toastPublishBlocked,
  toastPublishSuccess,
} from '../../services/publish-precheck.js';
import { workspaceFromAnswer } from '../../services/workspace-files.js';
import { store } from '../../state/store.js';
import { materialIcon } from '../../utils/material-icons.js';
import { buildWorkspaceSlugId, navigateTo } from '../../utils/router.js';
import { NO_PROGRAM_PUBLISH, NO_PROGRAMS } from '../../utils/no-programs.js';
import styles from './landing-view.css';

interface Workspace {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  /** The moderation state ('pending' while a submission waits for review). */
  publicationState?: string;
  updatedAt?: string;
  thumbnailAt?: string;
  /** No program left, so nothing draws (2d, step 9a): the card says so, and Make Public waits. */
  noPrograms?: boolean;
}

class LandingView extends HTMLElement {
  private viewMode: 'grid' | 'list' = 'grid';
  private _unsubscribe: (() => void) | null = null;
  private _loading: boolean = false;
  private _error: string | null = null;
  private _errorKind: 'network' | 'http' = 'http';
  private _openMenuId: string | null = null;
  private _handleThumbnailUpdated: ((e: Event) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();

    // Subscribe to view changes to reload when becoming active. Also
    // re-render when currentUser flips (e.g. /me bootstrap completes
    // after the initial render) so the "Make Public" menu item appears
    // for users with the Publishing feature without a manual refresh.
    this._unsubscribe = store.subscribe(['currentView', 'currentUser'], () => {
      if (store.get('currentView') === 'landing') {
        this.loadWorkspaces();
        this.render();
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
      // Errors thrown by services/api.ts carry a `kind` discriminator. For
      // network failures the message is already a human-readable hint that
      // names the API base; for HTTP errors we keep the legacy "Failed to
      // load workspaces: <server message>" form.
      const e = err as { kind?: 'network' | 'http'; message?: string };
      this._error = e?.message || 'Failed to load workspaces';
      this._errorKind = e?.kind ?? 'http';
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
          if (newIsPublic && workspace.publicationState === 'pending') return; // disabled in the menu

          // Make-public requires the workspace's main to compile, with its
          // imports, as the breadcrumb's does (2e step 5c). The listing
          // carries no files, so the workspace is read first: after the save
          // of any edit left behind in the editor, which is what's submitted.
          if (newIsPublic) {
            await autosave.awaitPendingFlush();
            const full = (await workspaceApi.get(id)) as Parameters<typeof workspaceFromAnswer>[0];
            const files = workspaceFromAnswer(full);
            const precheck = await precheckWorkspace(
              {
                texts: new Map(Object.entries(files.workspaceFiles)),
                folders: files.workspaceFolders,
                entryPoints: files.workspaceEntryPoints,
                openFile: files.openFile,
              },
              workspace.name || 'this workspace',
            );
            if (!precheck.ok) {
              toastPublishBlocked(precheck);
              return;
            }
          }

          const updated = (await workspaceApi.update(id, { isPublic: newIsPublic })) as {
            isPublic?: boolean;
            publicationState?: string;
          };

          // Update local state, as the server answered.
          workspace.isPublic = typeof updated.isPublic === 'boolean' ? updated.isPublic : newIsPublic;
          workspace.publicationState = updated.publicationState ?? (newIsPublic ? 'pending' : 'unpublished');
          store.set('workspaces', [...workspaces]);
          this.render();

          if (newIsPublic) toastPublishSuccess();
          else toastPrivateSuccess();
        } catch (err: unknown) {
          console.error('Failed to update workspace visibility:', err);
          alert(`Failed to update visibility: ${(err as Error).message}`);
        }
        break;

      case 'delete': {
        // Snapshots are deleted with their workspace (docs/snapshots.md), so
        // the confirmation says how many. Signed-out / unavailable → no count.
        let snapshotCount = 0;
        if (store.get('currentUser')) {
          // Bounded wait: a slow network mustn't hold up the confirmation.
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
          try {
            const listed = await Promise.race([snapshotApi.list(id), timeout]);
            snapshotCount = listed?.count ?? 0;
          } catch {
            snapshotCount = 0;
          }
        }
        const snapshotLine =
          snapshotCount > 0
            ? ` This also deletes its ${snapshotCount} snapshot${snapshotCount === 1 ? '' : 's'}; export any you want to keep first.`
            : '';
        if (confirm(`Are you sure you want to delete this workspace?${snapshotLine} This cannot be undone.`)) {
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
      const messageHtml =
        this._errorKind === 'network'
          ? this.escapeHtml(this._error)
          : `Failed to load workspaces: ${this.escapeHtml(this._error)}`;
      content = `
        <div class="error-state">
          <p>${messageHtml}</p>
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
      // "Make Public" is feature-gated like the workspace breadcrumb's
      // counterpart — only verified, non-flagged users see it. "Make
      // Private" is always available (opt-out doesn't need the gate).
      const canPublish = hasFeature(
        store.get('currentUser') as CurrentUser | null,
        UserFeature.Publishing,
      );
      const publishMenuItem = (ws: Workspace): string => {
        if (ws.isPublic) {
          return `<button data-action="toggle-publish">Make Private</button>`;
        }
        // Submitted and waiting, as the breadcrumb says (2e step 5c): Make
        // Public again would only repeat the submission.
        if (ws.publicationState === 'pending') {
          return `<button data-action="toggle-publish" disabled>Pending Review</button>`;
        }
        if (!canPublish) return '';
        // With no program there's nothing to show, so it waits and says why (step 9a).
        if (ws.noPrograms) {
          return `<button data-action="toggle-publish" disabled>Make Public<small>${NO_PROGRAM_PUBLISH}</small></button>`;
        }
        return `<button data-action="toggle-publish">Make Public</button>`;
      };
      const metaBadges = (ws: Workspace): string =>
        (ws.isPublic ? '<span class="public-badge">Public</span>' : '') +
        (ws.noPrograms ? `<span class="no-programs-badge">${NO_PROGRAMS}</span>` : '');
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
                    ${publishMenuItem(ws)}
                    <button data-action="delete" class="danger">Delete</button>
                  </div>
                  <h3>${this.escapeHtml(ws.name)}</h3>
                  <p>${this.escapeHtml(ws.description) || 'No description'}</p>
                  <div class="workspace-meta">
                    <span>Modified: ${this.formatDate(ws.updatedAt)}</span>
                    ${metaBadges(ws)}
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
                    ${publishMenuItem(ws)}
                    <button data-action="delete" class="danger">Delete</button>
                  </div>
                  <h3>${this.escapeHtml(ws.name)}</h3>
                  <p>${this.escapeHtml(ws.description) || 'No description'}</p>
                  <div class="workspace-meta">
                    <span>Modified: ${this.formatDate(ws.updatedAt)}</span>
                    ${metaBadges(ws)}
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
            <button data-view="list" class="${this.viewMode === 'list' ? 'active' : ''}">${materialIcon('list', { size: 14, className: 'toggle-icon' })}<span>List</span></button>
            <button data-view="grid" class="${this.viewMode === 'grid' ? 'active' : ''}">${materialIcon('grid', { size: 14, className: 'toggle-icon' })}<span>Grid</span></button>
          </div>
          <button class="new-btn">${materialIcon('add', { size: 16, className: 'cta-icon' })}<span>New Workspace</span></button>
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
