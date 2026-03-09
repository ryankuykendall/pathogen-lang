// App Breadcrumb - Contextual navigation trail with workspace controls
// Shows current location: "Workspaces > My Project"
// On workspace view, includes toggle buttons for Annotated, Console, and Copy Code

import { store } from '../state/store.js';
import { parseWorkspaceSlugId } from '../utils/router.js';

const styles = `
  :host {
    display: block;
    background: var(--bg-primary, #ffffff);
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .breadcrumb-bar {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    min-height: 32px;
    box-sizing: border-box;
    gap: 1rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    font-size: 0.8125rem;
    color: var(--text-secondary, #666);
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
  }

  .breadcrumb-link {
    color: var(--text-secondary, #666);
    text-decoration: none;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    transition: color 0.15s ease;
  }

  .breadcrumb-link:hover {
    color: var(--accent-color, #0066cc);
    text-decoration: underline;
  }

  .breadcrumb-current {
    color: var(--text-primary, #1a1a1a);
    font-weight: 500;
  }

  .separator {
    margin: 0 0.5rem;
    color: var(--text-tertiary, #999);
    user-select: none;
  }

  .workspace-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-id {
    font-size: 0.6875rem;
    color: var(--text-tertiary, #999);
    margin-left: 0.375rem;
    font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  }

  /* Workspace controls container - spans full width after breadcrumb */
  .workspace-controls-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    margin-left: auto;
  }

  /* Left group: buttons positioned to end at center */
  .controls-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    padding-right: 1rem;
  }

  /* Right group: badges positioned to start at center */
  .controls-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 1rem;
  }

  .toggle-bar {
    display: flex;
    align-items: center;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--border-color, #ddd);
    color: var(--text-secondary, #666);
    cursor: pointer;
    transition: all 0.15s;
    border-radius: 0;
    margin-left: -1px;
  }

  .toggle-bar .toggle-btn:first-child {
    border-radius: 4px 0 0 4px;
    margin-left: 0;
  }

  .toggle-bar .toggle-btn:last-child {
    border-radius: 0 4px 4px 0;
  }

  .toggle-btn:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #1a1a1a);
    z-index: 1;
  }

  .toggle-btn.active {
    background: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: var(--accent-text, #ffffff);
    z-index: 2;
  }

  .toggle-btn.active + .toggle-btn.active {
    border-left-color: var(--accent-border, rgba(255, 255, 255, 0.35));
  }

  .secondary-btn {
    padding: 4px 10px;
    font-size: 0.75rem;
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    color: var(--text-secondary, #666);
    cursor: pointer;
    transition: all 0.15s;
  }

  .secondary-btn:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #1a1a1a);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    color: var(--text-secondary, #666);
    cursor: pointer;
    transition: all 0.15s;
  }

  .refresh-btn:hover {
    background: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: var(--accent-text, #ffffff);
  }

  .refresh-btn .refresh-icon {
    transition: transform 0.3s ease;
  }

  .refresh-btn:hover .refresh-icon {
    transform: rotate(180deg);
  }

  .copy-feedback {
    font-size: 0.75rem;
    color: var(--success-color, #28a745);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .copy-feedback.visible {
    opacity: 1;
  }

  .save-status {
    font-size: 0.75rem;
    font-family: var(--font-mono, 'Inconsolata', monospace);
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .save-status.hidden {
    display: none;
  }

  .save-status.modified {
    background: var(--warning-bg, #fff3cd);
    color: var(--warning-color, #856404);
  }

  .save-status.saving {
    background: var(--info-bg, #cce5ff);
    color: var(--info-color, #004085);
  }

  .save-status.saved {
    background: var(--success-bg, #d4edda);
    color: var(--success-color, #155724);
  }

  .save-status.error {
    background: var(--error-bg, #f8d7da);
    color: var(--error-color, #721c24);
    cursor: help;
  }

  .compilation-status {
    font-size: 0.75rem;
    font-family: var(--font-mono, 'Inconsolata', monospace);
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
    margin-right: 0.5rem;
  }

  .compilation-status.hidden {
    display: none;
  }

  .compilation-status.compiling {
    background: var(--info-bg, #cce5ff);
    color: var(--info-color, #004085);
    animation: pulse 1s infinite;
  }

  .compilation-status.rendering {
    background: var(--warning-bg, #fff3cd);
    color: var(--warning-color, #856404);
    animation: pulse 0.5s infinite;
  }

  .compilation-status.completed {
    background: var(--success-bg, #d4edda);
    color: var(--success-color, #155724);
  }

  .compilation-status.error {
    background: var(--error-bg, #f8d7da);
    color: var(--error-color, #721c24);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Hide breadcrumb on landing page */
  :host(.hidden) {
    display: none;
  }

  @media (max-width: 600px) {
    .breadcrumb-bar {
      padding: 0.375rem 0.5rem;
      flex-wrap: wrap;
    }

    .breadcrumb {
      font-size: 0.75rem;
    }

    .workspace-name {
      max-width: 120px;
    }

    .workspace-controls-wrapper {
      flex-wrap: wrap;
      width: 100%;
      justify-content: flex-start;
    }

    .controls-left {
      margin-left: 0;
      padding-right: 0.5rem;
    }

    .controls-right {
      padding-left: 0.5rem;
    }

    .toggle-btn,
    .secondary-btn {
      padding: 3px 8px;
      font-size: 0.6875rem;
    }
  }
`;

// View display names and parent routes
const viewConfig = {
  landing: {
    label: 'Workspaces',
    parent: null,
    showBreadcrumb: false
  },
  'new-workspace': {
    label: 'New Workspace',
    parent: 'landing',
    showBreadcrumb: true
  },
  workspace: {
    label: 'Workspace',
    parent: 'landing',
    showBreadcrumb: true
  },
  preferences: {
    label: 'Preferences',
    parent: 'landing',
    showBreadcrumb: true
  },
  docs: {
    label: 'Documentation',
    parent: 'landing',
    showBreadcrumb: true
  },
  storybook: {
    label: 'Component Storybook',
    parent: 'landing',
    showBreadcrumb: true
  },
  'storybook-detail': {
    label: 'Storybook',
    parent: 'landing',
    showBreadcrumb: true
  },
  blog: {
    label: 'Blog',
    parent: 'landing',
    showBreadcrumb: true
  },
  'blog-post': {
    label: 'Blog Post',
    parent: 'blog',
    showBreadcrumb: true
  }
};

class AppBreadcrumb extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.render();

    // Subscribe to route and workspace changes
    this.unsubscribe = store.subscribe(
      ['currentView', 'routeParams', 'currentFileName', 'workspaces', 'workspaceName', 'workspaceId', 'annotatedOpen', 'consoleOpen', 'inspectorOpen', 'saveStatus', 'saveError', 'compilationStatus', 'calledStdlibFunctions'],
      () => this.render()
    );
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  buildBreadcrumbs() {
    const currentView = store.get('currentView');
    const routeParams = store.get('routeParams') || {};
    const currentFileName = store.get('currentFileName');
    const workspaceName = store.get('workspaceName');
    const workspaceId = store.get('workspaceId');
    const config = viewConfig[currentView] || viewConfig.landing;

    const crumbs = [];

    // Always start with Workspaces (home)
    crumbs.push({
      label: 'Workspaces',
      route: '/',
      isCurrent: currentView === 'landing'
    });

    // Add current view if not landing
    if (currentView !== 'landing') {
      // For blog-post, add Blog as intermediate crumb
      if (currentView === 'blog-post') {
        crumbs.push({
          label: 'Blog',
          route: '/blog',
          isCurrent: false
        });

        // Get post title from slug (we'll show a readable version)
        const slug = routeParams.slug || 'Post';
        // Convert slug to title case (e.g., "my-post" -> "My Post")
        const label = slug.split('-').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        crumbs.push({
          label,
          route: null,
          isCurrent: true
        });
      } else {
        let label = config.label;
        let id = null;

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
              const workspaces = store.get('workspaces') || [];
              const workspace = workspaces.find(w => w.id === parsed.id);
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
          isCurrent: true
        });
      }
    }

    return crumbs;
  }

  getSaveStatusHtml() {
    const status = store.get('saveStatus');
    const error = store.get('saveError');
    const workspaceId = store.get('workspaceId');

    if (!workspaceId) return '';

    let statusClass = status || 'idle';
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

  getCompilationStatusHtml() {
    const status = store.get('compilationStatus');

    let statusClass = status || 'idle';
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

  render() {
    const currentView = store.get('currentView');
    const config = viewConfig[currentView] || viewConfig.landing;
    const isWorkspaceView = currentView === 'workspace';
    const annotatedOpen = store.get('annotatedOpen');
    const consoleOpen = store.get('consoleOpen');
    const inspectorOpen = store.get('inspectorOpen');

    // Derive usesRandom from calledStdlibFunctions
    const calledStdlib = store.get('calledStdlibFunctions') || [];
    const usesRandom = calledStdlib.includes('random') || calledStdlib.includes('randomRange');

    // Hide breadcrumb on landing page
    this.classList.toggle('hidden', !config.showBreadcrumb);

    const crumbs = this.buildBreadcrumbs();

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <div class="breadcrumb-bar">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          ${crumbs.map((crumb, index) => `
            <span class="breadcrumb-item">
              ${index > 0 ? '<span class="separator">/</span>' : ''}
              ${crumb.isCurrent
                ? `<span class="breadcrumb-current ${crumb.route === null ? 'workspace-name' : ''}">${crumb.label}${crumb.id ? `<span class="workspace-id">(${crumb.id})</span>` : ''}</span>`
                : `<button class="breadcrumb-link" data-route="${crumb.route}">${crumb.label}</button>`
              }
            </span>
          `).join('')}
        </nav>

        ${isWorkspaceView ? `
          <div class="workspace-controls-wrapper">
            <div class="controls-left">
              ${this.getCompilationStatusHtml()}
              ${usesRandom ? `
                <button id="refresh-btn" class="refresh-btn" title="Generate new random values">
                  <span class="refresh-icon">&#8635;</span>
                  Refresh
                </button>
              ` : ''}
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
        ` : ''}
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Navigation links
    this.shadowRoot.querySelectorAll('[data-route]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const path = link.dataset.route;
        this.dispatchEvent(new CustomEvent('navigate', {
          bubbles: true,
          composed: true,
          detail: { path }
        }));
      });
    });

    // Toggle buttons
    this.shadowRoot.querySelector('#annotated-toggle')?.addEventListener('click', () => {
      store.set('annotatedOpen', !store.get('annotatedOpen'));
      this.dispatchEvent(new CustomEvent('toggle-annotated', { bubbles: true, composed: true }));
    });

    this.shadowRoot.querySelector('#console-toggle')?.addEventListener('click', () => {
      store.set('consoleOpen', !store.get('consoleOpen'));
      this.dispatchEvent(new CustomEvent('toggle-console', { bubbles: true, composed: true }));
    });

    this.shadowRoot.querySelector('#inspector-toggle')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });

    // Copy code button
    this.shadowRoot.querySelector('#copy-code')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy-code', { bubbles: true, composed: true }));
      this.showCopyFeedback();
    });

    // Refresh button
    this.shadowRoot.querySelector('#refresh-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('refresh-preview', { bubbles: true, composed: true }));
    });
  }

  showCopyFeedback() {
    const feedback = this.shadowRoot.querySelector('#copy-feedback');
    if (feedback) {
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }
}

customElements.define('app-breadcrumb', AppBreadcrumb);

export default AppBreadcrumb;
