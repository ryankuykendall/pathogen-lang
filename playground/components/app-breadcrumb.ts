// App Breadcrumb — secondary navigation
// Left: breadcrumb trail. Right (workspace view only): the console
// toggle, Copy Code, save status, and the overflow menu containing
// Export / Format Document / Copy URL / Copy Workspace / Copy SVG /
// Copy Debug Info / Set Thumbnail and (when signed in)
// Publish/Unpublish workspace.
//
// The overflow menu was relocated here from app-header in Phase 2 so the top
// nav stays visually invariant across routes (anti-shift contract). Workspace
// state (workspaceId, workspaceIsPublic, currentUser) is read directly from
// the store; the menu items dispatch the same custom events that
// workspace-view.ts has been listening for since the previous implementation.

import { workspaceApi } from '../services/api.js';
import { getUserId } from '../services/user-id.js';
import { hasFeature, UserFeature } from '../services/auth.js';
import type { CurrentUser } from '../services/auth.js';
import {
  precheckCompile,
  toastPrivateSuccess,
  toastPublishBlocked,
  toastPublishSuccess,
} from '../services/publish-precheck.js';
import { store } from '../state/store.js';
import { navigateTo, parseWorkspaceSlugId } from '../utils/router.js';
import { copyURL } from '../utils/url-state.js';
import { usesRandomValues } from '../utils/uses-random.js';
import { compilationStatusStyles, compilationStatusView } from '../utils/compilation-status.js';
import { materialIcon } from '../utils/material-icons.js';
import { formatBytes } from '../utils/format-bytes.js';
import styles from './app-breadcrumb.css';

// Inline (the material sprite has no camera glyph); same 24-unit stroke style
// as the preview pane's chrome icons.
const CAMERA_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;

/** Shape of store.snapshotsPage, set by workspace-snapshots-view. */
interface SnapshotsPageCrumbs {
  workspaceName: string;
  workspaceSlugId: string;
  currentName: string | null;
}

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
  'workspace-snapshots': { label: 'Snapshots', parent: 'workspace', showBreadcrumb: true },
  preferences: { label: 'Preferences', parent: 'landing', showBreadcrumb: true },
  docs: { label: 'Documentation', parent: 'landing', showBreadcrumb: true },
  storybook: { label: 'Component Storybook', parent: 'landing', showBreadcrumb: true },
  'storybook-detail': { label: 'Storybook', parent: 'landing', showBreadcrumb: true },
  blog: { label: 'Blog', parent: 'landing', showBreadcrumb: true },
  'blog-post': { label: 'Blog Post', parent: 'blog', showBreadcrumb: true },
};

class AppBreadcrumb extends HTMLElement {
  private unsubscribe: (() => void) | null = null;

  // Elapsed-clock ticks patch the chip in place (never a full render).
  private _elapsedUnsubscribe: (() => void) | null = null;

  private _menuOpen = false;

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
        'consoleOpen',
        'saveStatus',
        'saveError',
        'compilationStatus',
        'calledStdlibFunctions',
        'exportSvgBytes',
        'renderedCode',
        'snapshotCount',
        'snapshotsPage',
      ],
      () => this.render(),
    );

    // The "Compiling... MM:SS" clock ticks once a second for the length of a
    // compile. Patch the chip node in place rather than re-rendering: a 1 Hz
    // innerHTML rebuild would close the overflow menu, drop focus, and restart
    // the chip's pulse animation. (A status change still goes through render(),
    // which reads the current elapsed value.)
    this._elapsedUnsubscribe = store.subscribe('compilationElapsedMs', () => this._applyCompilationStatus());

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
    this._elapsedUnsubscribe?.();
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

    if (currentView === 'workspace-snapshots') {
      const page = store.get('snapshotsPage') as SnapshotsPageCrumbs | null;
      const slugId = page?.workspaceSlugId ?? routeParams.slugId ?? '';
      crumbs.push({ label: page?.workspaceName || 'Workspace', route: `/workspace/${slugId}`, isCurrent: false });
      if (page?.currentName) {
        crumbs.push({ label: 'Snapshots', route: `/workspace/${slugId}/snapshots`, isCurrent: false });
        crumbs.push({ label: page.currentName, route: null, isCurrent: true });
      } else {
        crumbs.push({ label: 'Snapshots', route: null, isCurrent: true });
      }
      return crumbs;
    }

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
              const workspaces = (store.get('workspaces') || []) as { id: string; name: string }[];
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
    // Text and class come from _applyCompilationStatus(), called at the end of
    // render() and on every clock tick — one painter, so the two paths can't drift.
    return `<span id="compilation-status" class="compilation-status hidden"></span>`;
  }

  /** Paints the status chip in place; no-op outside workspace view (no chip). */
  private _applyCompilationStatus(): void {
    const el = this.shadowRoot!.querySelector<HTMLElement>('#compilation-status');
    if (!el) return;
    const { text, className } = compilationStatusView(
      store.get('compilationStatus') as string | null,
      store.get('compilationElapsedMs') as number,
    );
    el.textContent = text;
    el.className = `compilation-status ${className}`;
  }

  /**
   * Split Snapshot button (docs/snapshots.md): the left half opens the
   * capture popover (workspace-view owns it), the right half shows this
   * workspace's snapshot count and opens its snapshots page. Shown for the
   * owner's workspaces and scratch buffers; hidden on someone else's
   * workspace. Disabled until there is a successful render to capture.
   */
  getSnapshotButtonHtml(): string {
    const workspaceId = store.get('workspaceId') as string | null;
    const ownerId = store.get('workspaceOwnerId') as string | null;
    const currentUser = store.get('currentUser') as CurrentUser | null;
    const isOwn = !!workspaceId && !!ownerId && (ownerId === getUserId() || ownerId === currentUser?.id);
    if (workspaceId && !isOwn) return '';

    const status = store.get('compilationStatus') as string | null;
    const renderedCode = store.get('renderedCode') as string | null;
    let disabledReason: string | null = null;
    if (status === 'compiling' || status === 'rendering') {
      disabledReason = 'Snapshot is available when this render finishes, so the image and code always match.';
    } else if (status === 'error') {
      disabledReason = 'Fix the error first. A snapshot always pairs the image with code that rendered successfully.';
    } else if (renderedCode == null) {
      disabledReason = 'Snapshot is available once the preview has rendered.';
    }
    const count = store.get('snapshotCount') as number | null;
    const showCount = !!workspaceId && !!currentUser && count != null;
    const snapBtn = `<button id="snapshot-btn" class="snapshot-btn" ${
      disabledReason
        ? `disabled aria-disabled="true" title="${disabledReason}"`
        : 'title="Save this image with the code that drew it"'
    }>${CAMERA_ICON}<span>Snapshot</span></button>`;
    if (!showCount) return `<span class="snapshot-split">${snapBtn}</span>`;
    return `<span class="snapshot-split has-count">${snapBtn}<button id="snapshot-count-btn" class="snapshot-count-btn" title="View snapshots (${count})" aria-label="View snapshots (${count})"><span class="count">${count}</span> ›</button></span>`;
  }

  /** Actions for the snapshots page (the page itself sits below the bar). */
  getSnapshotsPageControlsHtml(): string {
    const page = store.get('snapshotsPage') as SnapshotsPageCrumbs | null;
    if (!page?.currentName) return '';
    return `
      <div class="workspace-controls-wrapper">
        <div class="controls-left">
          <span id="copy-feedback" class="copy-feedback">Copied!</span>
          <button class="secondary-btn" data-snapshot-action="copy-code" title="Copy this snapshot's code">Copy code</button>
          <button class="secondary-btn" data-snapshot-action="start-workspace" title="Create a new workspace with this snapshot's code">+ Start new workspace</button>
          <button class="secondary-btn" data-snapshot-action="export" title="Export this snapshot as SVG, PNG, or PDF">Export…</button>
        </div>
        <div class="controls-right">
          <div class="menu-container">
            <button class="menu-btn" title="More actions" aria-haspopup="menu" aria-expanded="${this._menuOpen}">
              ${materialIcon('more-vert', { size: 18, className: 'kebab-icon' })}
            </button>
            <div class="menu-dropdown ${this._menuOpen ? 'open' : ''}" role="menu">
              <button data-action="snapshot-rename">${materialIcon('edit', { size: 16, className: 'menu-icon' })}<span>Rename</span></button>
              <div class="menu-divider"></div>
              <button data-action="snapshot-delete" class="danger-item"><span class="menu-icon-spacer"></span><span>Delete snapshot</span></button>
            </div>
            <span class="overflow-feedback"></span>
          </div>
        </div>
      </div>`;
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
      `<button data-action="export" title="Export as SVG, PNG, or PDF (Ctrl+Shift+E)">${materialIcon('download', { size: 16, className: 'menu-icon' })}<span>Export</span></button>`,
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
    const consoleOpen = store.get('consoleOpen') as boolean;

    const calledStdlib = (store.get('calledStdlibFunctions') || []) as string[];
    const usesRandom = usesRandomValues(calledStdlib);
    // The Cancel control lives only while a compile is in the worker. A
    // status change re-renders (compilationStatus is in the subscription), so
    // this is enough to show/hide it; the 1 Hz clock tick never re-renders.
    const isCompiling = store.get('compilationStatus') === 'compiling';

    this.classList.toggle('hidden', !config.showBreadcrumb);

    const crumbs = this.buildBreadcrumbs();

    // Estimated Export → SVG size (default settings), shown after the
    // ellipsis-truncated title. Must be a SIBLING of .breadcrumb-current —
    // anything inside .workspace-name is clipped when the title is long.
    const exportBytes = store.get('exportSvgBytes') as number | null;
    const sizeHtml =
      isWorkspaceView && exportBytes != null
        ? `<span class="workspace-size" title="${exportBytes.toLocaleString('en-US')} bytes — Export SVG size with default settings">(${formatBytes(exportBytes)})</span>`
        : '';

    this.shadowRoot!.innerHTML = `
      <style>${styles}${compilationStatusStyles()}</style>

      <div class="breadcrumb-bar">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          ${crumbs
            .map(
              (crumb, index) => `
            <span class="breadcrumb-item">
              ${index > 0 ? '<span class="separator">/</span>' : ''}
              ${
                crumb.isCurrent
                  ? `<span class="breadcrumb-current ${crumb.route === null ? 'workspace-name' : ''}">${crumb.label}${crumb.id ? `<span class="workspace-id">(${crumb.id})</span>` : ''}</span>${sizeHtml}`
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
                isCompiling
                  ? `<button id="cancel-compile-btn" class="cancel-compile-btn" aria-label="Cancel compile" title="Stop the running compile">Cancel</button>`
                  : ''
              }
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
              ${this.getSnapshotButtonHtml()}
              <div class="toggle-bar">
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
        ${currentView === 'workspace-snapshots' ? this.getSnapshotsPageControlsHtml() : ''}
      </div>
    `;

    this.setupEventListeners();
    this._applyCompilationStatus();
  }

  setupEventListeners(): void {
    // Breadcrumb navigation links
    this.shadowRoot!.querySelectorAll('[data-route]').forEach((link) => {
      link.addEventListener('click', (e: Event) => {
        e.preventDefault();
        const path = (link as HTMLElement).dataset.route!;
        this.dispatchEvent(new CustomEvent('navigate', { bubbles: true, composed: true, detail: { path } }));
      });
    });

    // Console toggle
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

    // Snapshot split button: capture (workspace-view opens the popover at
    // this rect) and the count half → the workspace's snapshots page.
    const snapshotBtn = this.shadowRoot!.querySelector<HTMLButtonElement>('#snapshot-btn');
    snapshotBtn?.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('capture-snapshot', {
          bubbles: true,
          composed: true,
          detail: { anchor: snapshotBtn.getBoundingClientRect(), placement: 'below', anchorEl: snapshotBtn },
        }),
      );
    });
    this.shadowRoot!.querySelector('#snapshot-count-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-snapshots', { bubbles: true, composed: true }));
    });

    // Snapshots page actions; workspace-snapshots-view handles them.
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-snapshot-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.snapshotAction!;
        this.dispatchEvent(new CustomEvent('snapshot-action', { bubbles: true, composed: true, detail: { action } }));
        if (action === 'copy-code') this.showCopyFeedback();
      });
    });

    // Cancel button (only present while compiling); workspace-view handles it
    this.shadowRoot!.querySelector('#cancel-compile-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('cancel-compile', { bubbles: true, composed: true }));
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
      case 'export':
        this.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));
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
      case 'set-thumbnail':
        this.dispatchEvent(new CustomEvent('set-thumbnail', { bubbles: true, composed: true }));
        break;
      case 'rename-workspace':
        this.dispatchEvent(new CustomEvent('rename-workspace', { bubbles: true, composed: true }));
        break;
      case 'toggle-publish':
        await this.handlePublishToggle();
        break;
      case 'snapshot-rename':
      case 'snapshot-delete':
        this.dispatchEvent(
          new CustomEvent('snapshot-action', {
            bubbles: true,
            composed: true,
            detail: { action: action === 'snapshot-rename' ? 'rename' : 'delete' },
          }),
        );
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

      const workspaces = (store.get('workspaces') || []) as {
        id: string;
        isPublic: boolean;
        publicationState?: string;
      }[];
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
    const feedback = this.shadowRoot!.querySelector('#copy-feedback');
    if (feedback) {
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }

  showOverflowFeedback(message: string, isError = false): void {
    const feedback = this.shadowRoot!.querySelector('.overflow-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.add('visible');
    setTimeout(() => feedback.classList.remove('visible'), 2000);
  }
}

customElements.define('app-breadcrumb', AppBreadcrumb);

export default AppBreadcrumb;
