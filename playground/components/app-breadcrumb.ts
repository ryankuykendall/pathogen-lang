// App Breadcrumb - Contextual navigation trail with workspace controls
// Shows current location: "Workspaces > My Project"
// On workspace view, includes toggle buttons for Annotated, Console, and Copy Code

import { store } from '../state/store.js';
import { parseWorkspaceSlugId } from '../utils/router.js';
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

// View display names and parent routes
const viewConfig: Record<string, ViewConfig> = {
  landing: {
    label: 'Workspaces',
    parent: null,
    showBreadcrumb: false,
  },
  'new-workspace': {
    label: 'New Workspace',
    parent: 'landing',
    showBreadcrumb: true,
  },
  workspace: {
    label: 'Workspace',
    parent: 'landing',
    showBreadcrumb: true,
  },
  preferences: {
    label: 'Preferences',
    parent: 'landing',
    showBreadcrumb: true,
  },
  docs: {
    label: 'Documentation',
    parent: 'landing',
    showBreadcrumb: true,
  },
  storybook: {
    label: 'Component Storybook',
    parent: 'landing',
    showBreadcrumb: true,
  },
  'storybook-detail': {
    label: 'Storybook',
    parent: 'landing',
    showBreadcrumb: true,
  },
  blog: {
    label: 'Blog',
    parent: 'landing',
    showBreadcrumb: true,
  },
  'blog-post': {
    label: 'Blog Post',
    parent: 'blog',
    showBreadcrumb: true,
  },
};

class AppBreadcrumb extends HTMLElement {
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();

    // Subscribe to route and workspace changes
    this.unsubscribe = store.subscribe(
      [
        'currentView',
        'routeParams',
        'currentFileName',
        'workspaces',
        'workspaceName',
        'workspaceId',
        'annotatedOpen',
        'consoleOpen',
        'inspectorOpen',
        'saveStatus',
        'saveError',
        'compilationStatus',
        'calledStdlibFunctions',
      ],
      () => this.render(),
    );
  }

  disconnectedCallback(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  buildBreadcrumbs(): BreadcrumbItem[] {
    const currentView = store.get('currentView') as string;
    const routeParams = (store.get('routeParams') || {}) as Record<string, string>;
    const currentFileName = store.get('currentFileName') as string | null;
    const workspaceName = store.get('workspaceName') as string | null;
    const workspaceId = store.get('workspaceId') as string | null;
    const config = viewConfig[currentView] || viewConfig.landing;

    const crumbs: BreadcrumbItem[] = [];

    // Always start with Workspaces (home)
    crumbs.push({
      label: 'Workspaces',
      route: '/',
      isCurrent: currentView === 'landing',
    });

    // Add current view if not landing
    if (currentView !== 'landing') {
      // For blog-post, add Blog as intermediate crumb
      if (currentView === 'blog-post') {
        crumbs.push({
          label: 'Blog',
          route: '/blog',
          isCurrent: false,
        });

        // Get post title from slug (we'll show a readable version)
        const slug = routeParams.slug || 'Post';
        // Convert slug to title case (e.g., "my-post" -> "My Post")
        const label = slug
          .split('-')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        crumbs.push({
          label,
          route: null,
          isCurrent: true,
        });
      } else {
        let label = config.label;
        let id: string | null = null;

        // For workspace, show workspace name with ID
        if (currentView === 'workspace') {
          if (workspaceName && workspaceId) {
            // Use the loaded workspace name and ID from store
            label = workspaceName;
            id = workspaceId;
          } else if (routeParams.slugId) {
            // Parse workspace ID from slugId (format: slug--id or just id)
            const parsed = parseWorkspaceSlugId(routeParams.slugId);
            if (parsed.id) {
              // Workspace still loading - try to find from workspaces list
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

        crumbs.push({
          label,
          id,
          route: null, // Current page, no link
          isCurrent: true,
        });
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

  render(): void {
    const currentView = store.get('currentView') as string;
    const config = viewConfig[currentView] || viewConfig.landing;
    const isWorkspaceView = currentView === 'workspace';
    const annotatedOpen = store.get('annotatedOpen') as boolean;
    const consoleOpen = store.get('consoleOpen') as boolean;
    const inspectorOpen = store.get('inspectorOpen') as boolean;

    // Derive usesRandom from calledStdlibFunctions
    const calledStdlib = (store.get('calledStdlibFunctions') || []) as string[];
    const usesRandom = calledStdlib.includes('random') || calledStdlib.includes('randomRange');

    // Hide breadcrumb on landing page
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
                <button id="inspector-toggle" class="toggle-btn ${inspectorOpen ? 'active' : ''}" title="Toggle inspector panel">Inspector</button>
              </div>
              <button id="copy-code" class="secondary-btn" title="Copy code to clipboard">
                Copy Code
              </button>
              <span id="copy-feedback" class="copy-feedback">Copied!</span>
            </div>
            <div class="controls-right">
              ${this.getSaveStatusHtml()}
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
    // Navigation links
    this.shadowRoot!.querySelectorAll('[data-route]').forEach((link) => {
      link.addEventListener('click', (e: Event) => {
        e.preventDefault();
        const path = (link as HTMLElement).dataset.route!;
        this.dispatchEvent(
          new CustomEvent('navigate', {
            bubbles: true,
            composed: true,
            detail: { path },
          }),
        );
      });
    });

    // Toggle buttons
    this.shadowRoot!.querySelector('#annotated-toggle')?.addEventListener('click', () => {
      store.set('annotatedOpen', !store.get('annotatedOpen'));
      this.dispatchEvent(new CustomEvent('toggle-annotated', { bubbles: true, composed: true }));
    });

    this.shadowRoot!.querySelector('#console-toggle')?.addEventListener('click', () => {
      store.set('consoleOpen', !store.get('consoleOpen'));
      this.dispatchEvent(new CustomEvent('toggle-console', { bubbles: true, composed: true }));
    });

    this.shadowRoot!.querySelector('#inspector-toggle')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });

    // Copy code button
    this.shadowRoot!.querySelector('#copy-code')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy-code', { bubbles: true, composed: true }));
      this.showCopyFeedback();
    });

    // Refresh button
    this.shadowRoot!.querySelector('#refresh-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('refresh-preview', { bubbles: true, composed: true }));
    });
  }

  showCopyFeedback(): void {
    const feedback = this.shadowRoot!.querySelector('#copy-feedback') as HTMLElement | null;
    if (feedback) {
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }
}

customElements.define('app-breadcrumb', AppBreadcrumb);

export default AppBreadcrumb;
