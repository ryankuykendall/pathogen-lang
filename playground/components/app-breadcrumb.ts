// App Breadcrumb — secondary navigation
// Left: breadcrumb trail. Right (workspace view only): annotated/console
// toggles, Copy Code, save status, and the overflow menu containing
// Export / Format Document / Copy URL / Copy Workspace / Copy SVG /
// Copy Debug Info / Export with Legend / Set Thumbnail and (when signed in)
// Publish/Unpublish workspace.
//
// The overflow menu was relocated here from app-header in Phase 2 so the top
// nav stays visually invariant across routes (anti-shift contract). Workspace
// state (workspaceId, workspaceIsPublic, currentUser) is read directly from
// the store; the menu items dispatch the same custom events that
// workspace-view.ts has been listening for since the previous implementation.

import { workspaceApi } from '../services/api.js';
import { hasFeature, UserFeature, type CurrentUser } from '../services/auth.js';
import {
  precheckCompile,
  toastPrivateSuccess,
  toastPublishBlocked,
  toastPublishSuccess,
} from '../services/publish-precheck.js';
import { store } from '../state/store.js';
import { navigateTo, parseWorkspaceSlugId } from '../utils/router.js';
import { copyURL } from '../utils/url-state.js';
import { materialIcon } from '../utils/material-icons.js';
import styles from './app-breadcrumb.css';

interface ViewConfig {
  label: string;
  parent: string | null;
  showBreadcrumb: boolean;
}

interface BreadcrumbItem {
  label: string;
  id?: string | null;
  route: string | null;
  isCurrent: boolean;
}

const viewConfig: Record<string, ViewConfig> = {
  landing: { label: 'Workspaces', parent: null, showBreadcrumb: false },
  'new-workspace': { label: 'New Workspace', parent: 'landing', showBreadcrumb: true },
  workspace: { label: 'Workspace', parent: 'landing', showBreadcrumb: true },
  preferences: { label: 'Preferences', parent: 'landing', showBreadcrumb: true },
  docs: { label: 'Documentation', parent: 'landing', showBreadcrumb: true },
  storybook: { label: 'Component Storybook', parent: 'landing', showBreadcrumb: true },
  'storybook-detail': { label: 'Storybook', parent: 'landing', showBreadcrumb: true },
  blog: { label: 'Blog', parent: 'landing', showBreadcrumb: true },
  'blog-post': { label: 'Blog Post', parent: 'blog', showBreadcrumb: true },
};

class AppBreadcrumb extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private _menuOpen: boolean = false;
  private _handleOutsideClick: ((e: MouseEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();

    this.unsubscribe = store.subscribe(
      [
        'currentView',
        'routeParams',
        'currentFileName',
        'workspaces',
        'workspaceName',
        'workspaceDescription',
        'workspaceId',
        'workspaceIsPublic',
        'workspacePublicationState',
        'workspaceRereviewPending',
        'workspaceOwnerId',
        'currentUser',
        'annotatedOpen',
        'consoleOpen',
        'saveStatus',
        'saveError',
        'compilationStatus',
        'calledStdlibFunctions',
      ],
      () => this.render(),
    );

    // Outside-click closes the overflow menu
    this._handleOutsideClick = (e: MouseEvent): void => {
      if (!this._menuOpen) return;
      const path = e.composedPath();
      const isMenuClick = path.some((el) => {
        const node = el as HTMLElement;
        return (
          node.classList &&
          (node.classList.contains('menu-btn') ||
            node.classList.contains('menu-dropdown') ||
            node.classList.contains('menu-container'))
        );
      });
      if (!isMenuClick) this.closeMenu();
    };
    document.addEventListener('click', this._handleOutsideClick);

    // Escape key closes the menu
    document.addEventListener('keydown', this._handleEscape);
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    if (this._handleOutsideClick) {
      document.removeEventListener('click', this._handleOutsideClick);
    }
    document.removeEventListener('keydown', this._handleEscape);
  }

  private _handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this._menuOpen) this.closeMenu();
  };

  private closeMenu(): void {
    this._menuOpen = false;
    const dropdown = this.shadowRoot!.querySelector('.menu-dropdown');
    const btn = this.shadowRoot!.querySelector('.menu-btn');
    if (dropdown) dropdown.classList.remove('open');
    if (btn) btn.classList.remove('open');
  }

  private toggleMenu(): void {
    this._menuOpen = !this._menuOpen;
    const dropdown = this.shadowRoot!.querySelector('.menu-dropdown');
    const btn = this.shadowRoot!.querySelector('.menu-btn');
    if (dropdown) dropdown.classList.toggle('open', this._menuOpen);
    if (btn) btn.classList.toggle('open', this._menuOpen);
  }

  buildBreadcrumbs(): BreadcrumbItem[] {
    const currentView = store.get('currentView') as string;
    const routeParams = (store.get('routeParams') || {}) as Record<string, string>;
    const currentFileName = store.get('currentFileName') as string | null;
    const workspaceName = store.get('workspaceName') as string | null;
    const workspaceId = store.get('workspaceId') as string | null;
    const config = viewConfig[currentView] || viewConfig.landing;

    const crumbs: BreadcrumbItem[] = [];

    crumbs.push({ label: 'Workspaces', route: '/', isCurrent: currentView === 'landing' });

    if (currentView !== 'landing') {
      if (currentView === 'blog-post') {
        crumbs.push({ label: 'Blog', route: '/blog', isCurrent: false });
        const slug = routeParams.slug || 'Post';
        const label = slug
          .split('-')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        crumbs.push({ label, route: null, isCurrent: true });
      } else {
        let label = config.label;
        let id: string | null = null;

        if (currentView === 'workspace') {
          if (workspaceName && workspaceId) {
            label = workspaceName;
            id = workspaceId;
          } else if (routeParams.slugId) {
            const parsed = parseWorkspaceSlugId(routeParams.slugId);
            if (parsed.id) {
              const workspaces = (store.get('workspaces') || []) as Array<{ id: string; name: string }>;
              const workspace = workspaces.find((w) => w.id === parsed.id);
              if (workspace) {
                label = workspace.name;
                id = workspace.id;
              } else {
                label = parsed.slug || parsed.id;
                id = parsed.id;
              }
            }
          } else if (currentFileName) {
            label = currentFileName;
          } else {
            label = 'New Workspace';
          }
        }

        crumbs.push({ label, id, route: null, isCurrent: true });
      }
    }

    return crumbs;
  }

  getSaveStatusHtml(): string {
    const status = store.get('saveStatus') as string | null;
    const error = store.get('saveError') as string | null;
    const workspaceId = store.get('workspaceId') as string | null;

    if (!workspaceId) return '';

    let statusClass: string = status || 'idle';
    let statusText = '';

    switch (status) {
      case 'modified':
        statusText = 'Modified';
        break;
      case 'saving':
        statusText = 'Saving...';
        break;
      case 'saved':
        statusText = 'Saved';
        break;
      case 'error':
        statusText = error ? `Error: ${error}` : 'Save failed';
        break;
      default:
        statusClass = 'hidden';
    }

    return `<span class="save-status ${statusClass}" ${error ? `title="${error}"` : ''}>${statusText}</span>`;
  }

  getCompilationStatusHtml(): string {
    const status = store.get('compilationStatus') as string | null;

    let statusClass: string = status || 'idle';
    let statusText = '';

    switch (status) {
      case 'compiling':
        statusText = 'Compiling...';
        break;
      case 'rendering':
        statusText = 'Rendering...';
        break;
      case 'completed':
        statusText = 'Ready';
        break;
      case 'error':
        statusText = 'Error';
        break;
      default:
        statusClass = 'hidden';
    }

    return `<span id="compilation-status" class="compilation-status ${statusClass}">${statusText}</span>`;
  }

  getOverflowMenuHtml(): string {
    const workspaceId = store.get('workspaceId') as string | null;
    const workspaceIsPublic = store.get('workspaceIsPublic') as boolean;
    const workspaceOwnerId = store.get('workspaceOwnerId') as string | null;
    const currentUser = store.get('currentUser') as CurrentUser | null;
    const hasWorkspace = !!workspaceId;
    const isSignedIn = currentUser !== null;
    const isOwner = isSignedIn && !!workspaceOwnerId && currentUser?.id === workspaceOwnerId;
    const canPublish = hasFeature(currentUser, UserFeature.Publishing);

    const menuItems: string[] = [];
    menuItems.push(
      `<button data-action="export-file" title="Export to file (Ctrl+S)">${materialIcon('download', { size: 16, className: 'menu-icon' })}<span>Export</span></button>`,
    );
    menuItems.push(
      `<button data-action="format-document" title="Format the current document (Ctrl/Cmd+Shift+F)">${materialIcon('format-left', { size: 16, className: 'menu-icon' })}<span>Format Document</span></button>`,
    );
    if (hasWorkspace && isOwner) {
      menuItems.push(
        `<button data-action="rename-workspace" title="Edit workspace name and description">${materialIcon('edit', { size: 16, className: 'menu-icon' })}<span>Rename workspace</span></button>`,
      );
    }
    menuItems.push('<div class="menu-divider"></div>');
    menuItems.push(
      `<button data-action="copy-url">${materialIcon('link', { size: 16, className: 'menu-icon' })}<span>Copy URL</span></button>`,
    );
    if (hasWorkspace) {
      menuItems.push(
        `<button data-action="copy-workspace">${materialIcon('content-copy', { size: 16, className: 'menu-icon' })}<span>Copy Workspace</span></button>`,
      );
    }
    menuItems.push(
      `<button data-action="copy-svg">${materialIcon('code', { size: 16, className: 'menu-icon' })}<span>Copy SVG</span></button>`,
    );
    menuItems.push(
      `<button data-action="copy-debug-info">${materialIcon('bug-report', { size: 16, className: 'menu-icon' })}<span>Copy Debug Info</span></button>`,
    );
    menuItems.push('<div class="menu-divider"></div>');
    menuItems.push(
      `<button data-action="export-legend">${materialIcon('share', { size: 16, className: 'menu-icon' })}<span>Export with Legend</span></button>`,
    );
    if (hasWorkspace) {
      menuItems.push(
        `<button data-action="set-thumbnail">${materialIcon('image', { size: 16, className: 'menu-icon' })}<span>Set Thumbnail</span></button>`,
      );
    }
    // Publish toggle reflects the moderation state machine. 'rejected' is
    // shown as 'Submit for review' (silent rejection — owners are never
    // told why their submission did not become public). rereviewPending
    // overlays "Pending re-review" on top of the otherwise-approved state.
    const pubState = (store.get('workspacePublicationState') as string) || 'unpublished';
    const rereviewPending = Boolean(store.get('workspaceRereviewPending'));
    if (isSignedIn && hasWorkspace && (canPublish || workspaceIsPublic || pubState === 'pending')) {
      menuItems.push('<div class="menu-divider"></div>');
      let publishLabel: string;
      let publishIcon: 'public' | 'lock';
      let disabled = false;
      if (pubState === 'pending') {
        publishLabel = 'Pending review';
        publishIcon = 'public';
        disabled = true;
      } else if (workspaceIsPublic || pubState === 'approved') {
        if (rereviewPending) {
          publishLabel = 'Pending re-review';
          publishIcon = 'public';
          disabled = true;
        } else {
          publishLabel = 'Make private';
          publishIcon = 'lock';
        }
      } else {
        publishLabel = 'Make public';
        publishIcon = 'public';
      }
      menuItems.push(
        `<button data-action="toggle-publish" class="publish-item" ${disabled ? 'disabled' : ''}>${materialIcon(publishIcon, { size: 16, className: 'menu-icon' })}<span>${publishLabel}</span></button>`,
      );
    }

    return `
      <div class="menu-container">
        <button class="menu-btn" title="More actions" aria-haspopup="menu" aria-expanded="${this._menuOpen}">
          ${materialIcon('more-vert', { size: 18, className: 'kebab-icon' })}
        </button>
        <div class="menu-dropdown ${this._menuOpen ? 'open' : ''}" role="menu">
          ${menuItems.join('')}
        </div>
        <span class="overflow-feedback"></span>
      </div>
    `;
  }

  render(): void {
    const currentView = store.get('currentView') as string;
    const config = viewConfig[currentView] || viewConfig.landing;
    const isWorkspaceView = currentView === 'workspace';
    const annotatedOpen = store.get('annotatedOpen') as boolean;
    const consoleOpen = store.get('consoleOpen') as boolean;

    const calledStdlib = (store.get('calledStdlibFunctions') || []) as string[];
    const usesRandom = calledStdlib.includes('random') || calledStdlib.includes('randomRange');

    this.classList.toggle('hidden', !config.showBreadcrumb);

    const crumbs = this.buildBreadcrumbs();

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="breadcrumb-bar">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          ${crumbs
            .map(
              (crumb, index) => `
            <span class="breadcrumb-item">
              ${index > 0 ? '<span class="separator">/</span>' : ''}
              ${
                crumb.isCurrent
                  ? `<span class="breadcrumb-current ${crumb.route === null ? 'workspace-name' : ''}">${crumb.label}${crumb.id ? `<span class="workspace-id">(${crumb.id})</span>` : ''}</span>`
                  : `<button class="breadcrumb-link" data-route="${crumb.route}">${crumb.label}</button>`
              }
            </span>
          `,
            )
            .join('')}
        </nav>

        ${
          isWorkspaceView
            ? `
          <div class="workspace-controls-wrapper">
            <div class="controls-left">
              ${this.getCompilationStatusHtml()}
              ${
                usesRandom
                  ? `
                <button id="refresh-btn" class="refresh-btn" title="Generate new random values">
                  <span class="refresh-icon">&#8635;</span>
                  Refresh
                </button>
              `
                  : ''
              }
              <div class="toggle-bar">
                <button id="annotated-toggle" class="toggle-btn ${annotatedOpen ? 'active' : ''}" title="Show annotated output">Annotated</button>
                <button id="console-toggle" class="toggle-btn ${consoleOpen ? 'active' : ''}" title="Show console output">Console</button>
              </div>
              <button id="copy-code" class="secondary-btn" title="Copy code to clipboard">
                Copy Code
              </button>
              <span id="copy-feedback" class="copy-feedback">Copied!</span>
            </div>
            <div class="controls-right">
              ${this.getSaveStatusHtml()}
              ${this.getOverflowMenuHtml()}
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners(): void {
    // Breadcrumb navigation links
    this.shadowRoot!.querySelectorAll('[data-route]').forEach((link) => {
      link.addEventListener('click', (e: Event) => {
        e.preventDefault();
        const path = (link as HTMLElement).dataset.route!;
        this.dispatchEvent(
          new CustomEvent('navigate', { bubbles: true, composed: true, detail: { path } }),
        );
      });
    });

    // Annotated / Console toggles
    this.shadowRoot!.querySelector('#annotated-toggle')?.addEventListener('click', () => {
      store.set('annotatedOpen', !store.get('annotatedOpen'));
      this.dispatchEvent(new CustomEvent('toggle-annotated', { bubbles: true, composed: true }));
    });

    this.shadowRoot!.querySelector('#console-toggle')?.addEventListener('click', () => {
      store.set('consoleOpen', !store.get('consoleOpen'));
      this.dispatchEvent(new CustomEvent('toggle-console', { bubbles: true, composed: true }));
    });

    // Copy code
    this.shadowRoot!.querySelector('#copy-code')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy-code', { bubbles: true, composed: true }));
      this.showCopyFeedback();
    });

    // Refresh button (only present when usesRandom)
    this.shadowRoot!.querySelector('#refresh-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('refresh-preview', { bubbles: true, composed: true }));
    });

    // Overflow menu kebab toggle
    this.shadowRoot!.querySelector('.menu-btn')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Overflow menu actions
    this.shadowRoot!.querySelectorAll('.menu-dropdown [data-action]').forEach((btn) => {
      btn.addEventListener('click', async (e: Event) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action!;
        this.closeMenu();
        await this.handleMenuAction(action);
      });
    });
  }

  async handleMenuAction(action: string): Promise<void> {
    switch (action) {
      case 'export-file':
        this.dispatchEvent(new CustomEvent('export-file', { bubbles: true, composed: true }));
        break;
      case 'format-document':
        this.dispatchEvent(new CustomEvent('format-document', { bubbles: true, composed: true }));
        break;
      case 'copy-url':
        await copyURL(store);
        this.showOverflowFeedback('URL copied!');
        break;
      case 'copy-workspace': {
        const workspaceId = store.get('workspaceId') as string | null;
        if (workspaceId) {
          navigateTo('/workspace/new', { query: { copyFrom: workspaceId } });
        }
        break;
      }
      case 'copy-svg':
        this.dispatchEvent(new CustomEvent('copy-svg', { bubbles: true, composed: true }));
        this.showOverflowFeedback('SVG copied!');
        break;
      case 'copy-debug-info':
        this.dispatchEvent(new CustomEvent('copy-debug-info', { bubbles: true, composed: true }));
        this.showOverflowFeedback('Debug info copied!');
        break;
      case 'export-legend':
        this.dispatchEvent(new CustomEvent('export-legend', { bubbles: true, composed: true }));
        break;
      case 'set-thumbnail':
        this.dispatchEvent(new CustomEvent('set-thumbnail', { bubbles: true, composed: true }));
        break;
      case 'rename-workspace':
        this.dispatchEvent(new CustomEvent('rename-workspace', { bubbles: true, composed: true }));
        break;
      case 'toggle-publish':
        await this.handlePublishToggle();
        break;
    }
  }

  async handlePublishToggle(): Promise<void> {
    const workspaceId = store.get('workspaceId') as string | null;
    const currentlyPublic = store.get('workspaceIsPublic') as boolean;
    const currentState = (store.get('workspacePublicationState') as string) || 'unpublished';
    if (!workspaceId) return;
    if (currentState === 'pending') return; // disabled in the menu, defensive

    const requestPublic = !(currentlyPublic || currentState === 'approved');

    // Make-public path runs through the compile precheck so broken
    // workspaces never reach the moderation queue. The API can't
    // independently enforce this (the compiler bundle doesn't fit in
    // a Worker), so the client is the authority — and the toast tells
    // the user exactly why it was blocked.
    if (requestPublic) {
      const code = (store.get('code') as string | undefined) ?? '';
      const precheck = await precheckCompile(code);
      if (!precheck.ok) {
        toastPublishBlocked(precheck);
        return;
      }
    }

    try {
      const updated = (await workspaceApi.update(workspaceId, { isPublic: requestPublic })) as {
        isPublic?: boolean;
        publicationState?: string;
      };
      const newState = updated.publicationState ?? (requestPublic ? 'pending' : 'unpublished');
      const newIsPublic = Boolean(updated.isPublic);
      store.update({
        workspaceIsPublic: newIsPublic,
        workspacePublicationState: newState,
      });

      const workspaces = (store.get('workspaces') || []) as Array<{ id: string; isPublic: boolean; publicationState?: string }>;
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        workspace.isPublic = newIsPublic;
        workspace.publicationState = newState;
        store.set('workspaces', [...workspaces]);
      }

      if (requestPublic) toastPublishSuccess();
      else toastPrivateSuccess();
    } catch (err: unknown) {
      console.error('Failed to update workspace visibility:', err);
      this.showOverflowFeedback('Publish failed', true);
    }
  }

  showCopyFeedback(): void {
    const feedback = this.shadowRoot!.querySelector('#copy-feedback') as HTMLElement | null;
    if (feedback) {
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }

  showOverflowFeedback(message: string, isError: boolean = false): void {
    const feedback = this.shadowRoot!.querySelector('.overflow-feedback') as HTMLElement | null;
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.add('visible');
    setTimeout(() => feedback.classList.remove('visible'), 2000);
  }
}

customElements.define('app-breadcrumb', AppBreadcrumb);

export default AppBreadcrumb;
