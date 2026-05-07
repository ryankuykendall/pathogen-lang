// App Header - Top navigation bar
// Contains logo, main navigation links, theme toggle, and workspace-specific actions

import { workspaceApi } from '../services/api.js';
import { store } from '../state/store.js';
import { buildWorkspaceSlugId, navigateTo, routeUrl } from '../utils/router.js';
import { themeManager } from '../utils/theme.js';
import { copyURL } from '../utils/url-state.js';
import './shared/account-menu.js';
import './shared/theme-toggle.js';
import styles from './app-header.css';

class AppHeader extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private _themeUnsubscribe: (() => void) | null = null;
  private _menuOpen: boolean = false;
  private _copying: boolean = false;
  private _handleOutsideClick: ((e: MouseEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();

    // Subscribe to route and workspace changes
    this.unsubscribe = store.subscribe(['currentView', 'workspaceId'], () => {
      this.updateActiveLink();
      this.updateWorkspaceActions();
    });

    // Subscribe to theme changes (keep themeManager in sync with the component)
    this._themeUnsubscribe = themeManager.subscribe(() => {});

    // Close menu on outside click
    this._handleOutsideClick = (e: MouseEvent): void => {
      if (!this._menuOpen) return;

      // Check if click is on menu button or dropdown using composedPath
      const path = e.composedPath();
      const isMenuClick = path.some(
        (el) =>
          (el as HTMLElement).classList &&
          ((el as HTMLElement).classList.contains('menu-btn') ||
            (el as HTMLElement).classList.contains('menu-dropdown') ||
            (el as HTMLElement).classList.contains('menu-container')),
      );

      if (!isMenuClick) {
        this._menuOpen = false;
        const dropdown = this.shadowRoot!.querySelector('.menu-dropdown');
        if (dropdown) {
          dropdown.classList.remove('open');
        }
      }
    };
    document.addEventListener('click', this._handleOutsideClick);
  }

  disconnectedCallback(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
    if (this._handleOutsideClick) {
      document.removeEventListener('click', this._handleOutsideClick);
    }
  }

  setupEventListeners(): void {
    // Sync theme-toggle component changes back to themeManager
    this.shadowRoot!.addEventListener('theme-change', (e: Event) => {
      themeManager.setPreference((e as CustomEvent<{ preference: string }>).detail.preference as any);
    });

    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;

      // Navigation links
      const navLink = target.closest('[data-route]') as HTMLElement | null;
      if (navLink) {
        e.preventDefault();
        const path = navLink.dataset.route!;
        const params = navLink.dataset.params ? JSON.parse(navLink.dataset.params) : {};
        this.dispatchEvent(
          new CustomEvent('navigate', {
            bubbles: true,
            composed: true,
            detail: { path, params },
          }),
        );
        return;
      }

      // Export button
      if (target.closest('#export-btn')) {
        this.dispatchEvent(new CustomEvent('export-file', { bubbles: true, composed: true }));
        return;
      }

      // Menu toggle
      if (target.closest('.menu-btn')) {
        e.stopPropagation();
        this._menuOpen = !this._menuOpen;
        // Toggle class directly instead of re-rendering to avoid DOM replacement issues
        const dropdown = this.shadowRoot!.querySelector('.menu-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('open', this._menuOpen);
        }
        return;
      }

      // Menu actions
      const menuAction = target.closest('[data-action]') as HTMLElement | null;
      if (menuAction) {
        e.stopPropagation();
        const action = menuAction.dataset.action!;
        this.handleMenuAction(action);
      }
    });
  }

  async handleMenuAction(action: string): Promise<void> {
    // Close the menu
    this._menuOpen = false;
    const dropdown = this.shadowRoot!.querySelector('.menu-dropdown');
    if (dropdown) {
      dropdown.classList.remove('open');
    }

    switch (action) {
      case 'format-document':
        this.dispatchEvent(new CustomEvent('format-document', { bubbles: true, composed: true }));
        break;

      case 'copy-url':
        await copyURL(store);
        this.showFeedback('URL copied!');
        break;

      case 'copy-workspace':
        await this.copyWorkspace();
        break;

      case 'copy-svg':
        this.dispatchEvent(new CustomEvent('copy-svg', { bubbles: true, composed: true }));
        this.showFeedback('SVG copied!');
        break;

      case 'copy-debug-info':
        this.dispatchEvent(new CustomEvent('copy-debug-info', { bubbles: true, composed: true }));
        this.showFeedback('Debug info copied!');
        break;

      case 'export-legend':
        this.dispatchEvent(new CustomEvent('export-legend', { bubbles: true, composed: true }));
        break;

      case 'set-thumbnail':
        this.dispatchEvent(new CustomEvent('set-thumbnail', { bubbles: true, composed: true }));
        break;
    }
  }

  copyWorkspace(): void {
    const workspaceId = store.get('workspaceId') as string | null;
    if (!workspaceId) return;
    navigateTo('/workspace/new', { query: { copyFrom: workspaceId } });
  }

  showFeedback(message: string): void {
    const feedback = this.shadowRoot!.querySelector('.copy-feedback') as HTMLElement | null;
    if (feedback) {
      feedback.textContent = message;
      feedback.classList.add('visible');
      setTimeout(() => feedback.classList.remove('visible'), 2000);
    }
  }

  updateActiveLink(): void {
    const currentView = store.get('currentView') as string;
    const links = this.shadowRoot!.querySelectorAll('.nav-link[data-route]');

    links.forEach((link) => {
      const route = (link as HTMLElement).dataset.route!;
      const isActive = this.isRouteActive(route, currentView);
      link.classList.toggle('active', isActive);
    });
  }

  isRouteActive(route: string, currentView: string): boolean {
    const routeToView: Record<string, string> = {
      '/': 'landing',
      '/workspace/:slugId': 'workspace',
      '/blog': 'blog',
      '/preferences': 'preferences',
    };
    return routeToView[route] === currentView;
  }

  render(): void {
    const currentView = store.get('currentView') as string;
    const workspaceId = store.get('workspaceId') as string | null;
    const isWorkspaceView = currentView === 'workspace';
    const hasWorkspace = isWorkspaceView && workspaceId;

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <header class="header">
        <div class="logo-section">
          <a class="logo" data-route="/">
            <span class="logo-main">Pathogen</span>
            <span class="logo-sub">built on svg-path-extended v1.0</span>
          </a>
        </div>

        <nav>
          <button class="nav-link ${currentView === 'landing' ? 'active' : ''}" data-route="/">
            Workspaces
          </button>
          <a class="nav-link" href="/pathogen/docs">
            Docs
          </a>
          <a class="nav-link" href="/pathogen/explore">
            Explore
          </a>
          <a class="nav-link" href="/pathogen/featured">
            Featured
          </a>
          <button class="nav-link ${currentView === 'blog' ? 'active' : ''}" data-route="/blog">
            Blog
          </button>
          <button class="nav-link ${currentView === 'preferences' ? 'active' : ''}" data-route="/preferences">
            Preferences
          </button>
        </nav>

        <div class="actions">
          <theme-toggle></theme-toggle>
          <account-menu></account-menu>

          ${
            isWorkspaceView
              ? `
            <button id="export-btn" class="action-btn" title="Export to file (Ctrl+S)">Export</button>
            <div class="menu-container">
              <button class="menu-btn" title="More actions">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>
              <div class="menu-dropdown ${this._menuOpen ? 'open' : ''}">
                <button data-action="format-document" title="Format the current document (Ctrl/Cmd+Shift+F)">
                  <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 3zm2 3a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9A.5.5 0 014 6zm-2 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 9zm2 3a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5z"/>
                  </svg>
                  Format Document
                </button>
                <div class="menu-divider"></div>
                <button data-action="copy-url">
                  <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.5 3A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-1a.5.5 0 011 0v1a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7A2.5 2.5 0 014.5 2h1a.5.5 0 010 1h-1z"/>
                    <path d="M6 5.5A1.5 1.5 0 017.5 4h5A1.5 1.5 0 0114 5.5v5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 016 10.5v-5z"/>
                  </svg>
                  Copy URL
                </button>
                ${
                  hasWorkspace
                    ? `
                  <button data-action="copy-workspace">
                    <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 2.5A1.5 1.5 0 014.5 1h5A1.5 1.5 0 0111 2.5v1A1.5 1.5 0 0112.5 5h1A1.5 1.5 0 0115 6.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 015 13.5v-1A1.5 1.5 0 013.5 11h-1A1.5 1.5 0 011 9.5v-7A1.5 1.5 0 012.5 1H3v1.5zM4.5 2a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h1A1.5 1.5 0 017 11.5v1a.5.5 0 00.5.5h5a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5h-1A1.5 1.5 0 0110 3.5v-1a.5.5 0 00-.5-.5h-5z"/>
                    </svg>
                    Copy Workspace
                  </button>
                `
                    : ''
                }
                <button data-action="copy-svg">
                  <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                    <path d="M6.5 5a.5.5 0 00-.5.5v5a.5.5 0 001 0V8h1.5a.5.5 0 000-1H7V6h2a.5.5 0 000-1H6.5z"/>
                  </svg>
                  Copy SVG
                </button>
                <button data-action="copy-debug-info">
                  <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.5 0A2.5 2.5 0 002 2.5V3H1.5a.5.5 0 000 1H2v1H1a.5.5 0 000 1h1v1H.5a.5.5 0 000 1H2v1H1.5a.5.5 0 000 1H2v.5A2.5 2.5 0 004.5 12h7A2.5 2.5 0 0014 9.5V9h.5a.5.5 0 000-1H14V7h1a.5.5 0 000-1h-1V5h.5a.5.5 0 000-1H14V3h.5a.5.5 0 000-1H14v-.5A2.5 2.5 0 0011.5 0h-7zM13 2.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 9.5v-7A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5z"/>
                    <path d="M6 4.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM5.5 6a.5.5 0 000 1h5a.5.5 0 000-1h-5zM5 8.5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z"/>
                  </svg>
                  Copy Debug Info
                </button>
                <div class="menu-divider"></div>
                <button data-action="export-legend">
                  <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                    <path d="M4 4h4v1H4zM4 6.5h6v1H4zM4 9h5v1H4zM4 11.5h3v1H4z"/>
                  </svg>
                  Export with Legend
                </button>
                ${
                  hasWorkspace
                    ? `
                  <div class="menu-divider"></div>
                  <button data-action="set-thumbnail">
                    <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M14.5 3l-6 6-2-2-6 6v1.5h16V3h-2zM2 1a2 2 0 100 4 2 2 0 000-4z"/>
                    </svg>
                    Set Thumbnail
                  </button>
                `
                    : ''
                }
              </div>
              <span class="copy-feedback"></span>
            </div>
          `
              : ''
          }
        </div>
      </header>
    `;

    this.updateActiveLink();
  }

  updateWorkspaceActions(): void {
    const currentView = store.get('currentView') as string;
    const workspaceId = store.get('workspaceId') as string | null;
    const isWorkspaceView = currentView === 'workspace';
    const hasWorkspace = isWorkspaceView && workspaceId;

    const actionsContainer = this.shadowRoot!.querySelector('.actions');
    if (!actionsContainer) return;

    // Update visibility of workspace-specific actions
    actionsContainer.innerHTML = `
      <theme-toggle></theme-toggle>
      <account-menu></account-menu>

      ${
        isWorkspaceView
          ? `
        <button id="export-btn" class="action-btn" title="Export to file (Ctrl+S)">Export</button>
        <div class="menu-container">
          <button class="menu-btn" title="More actions">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5"/>
              <circle cx="8" cy="8" r="1.5"/>
              <circle cx="8" cy="13" r="1.5"/>
            </svg>
          </button>
          <div class="menu-dropdown">
            <button data-action="format-document" title="Format the current document (Ctrl/Cmd+Shift+F)">
              <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 3zm2 3a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9A.5.5 0 014 6zm-2 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 9zm2 3a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5z"/>
              </svg>
              Format Document
            </button>
            <div class="menu-divider"></div>
            <button data-action="copy-url">
              <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 3A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-1a.5.5 0 011 0v1a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7A2.5 2.5 0 014.5 2h1a.5.5 0 010 1h-1z"/>
                <path d="M6 5.5A1.5 1.5 0 017.5 4h5A1.5 1.5 0 0114 5.5v5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 016 10.5v-5z"/>
              </svg>
              Copy URL
            </button>
            ${
              hasWorkspace
                ? `
              <button data-action="copy-workspace">
                <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 2.5A1.5 1.5 0 014.5 1h5A1.5 1.5 0 0111 2.5v1A1.5 1.5 0 0112.5 5h1A1.5 1.5 0 0115 6.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 015 13.5v-1A1.5 1.5 0 013.5 11h-1A1.5 1.5 0 011 9.5v-7A1.5 1.5 0 012.5 1H3v1.5zM4.5 2a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h1A1.5 1.5 0 017 11.5v1a.5.5 0 00.5.5h5a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5h-1A1.5 1.5 0 0110 3.5v-1a.5.5 0 00-.5-.5h-5z"/>
                </svg>
                Copy Workspace
              </button>
            `
                : ''
            }
            <button data-action="copy-svg">
              <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                <path d="M6.5 5a.5.5 0 00-.5.5v5a.5.5 0 001 0V8h1.5a.5.5 0 000-1H7V6h2a.5.5 0 000-1H6.5z"/>
              </svg>
              Copy SVG
            </button>
            <button data-action="copy-debug-info">
              <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 0A2.5 2.5 0 002 2.5V3H1.5a.5.5 0 000 1H2v1H1a.5.5 0 000 1h1v1H.5a.5.5 0 000 1H2v1H1.5a.5.5 0 000 1H2v.5A2.5 2.5 0 004.5 12h7A2.5 2.5 0 0014 9.5V9h.5a.5.5 0 000-1H14V7h1a.5.5 0 000-1h-1V5h.5a.5.5 0 000-1H14V3h.5a.5.5 0 000-1H14v-.5A2.5 2.5 0 0011.5 0h-7zM13 2.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 9.5v-7A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5z"/>
                <path d="M6 4.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM5.5 6a.5.5 0 000 1h5a.5.5 0 000-1h-5zM5 8.5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z"/>
              </svg>
              Copy Debug Info
            </button>
            <div class="menu-divider"></div>
            <button data-action="export-legend">
              <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                <path d="M4 4h4v1H4zM4 6.5h6v1H4zM4 9h5v1H4zM4 11.5h3v1H4z"/>
              </svg>
              Export with Legend
            </button>
            ${
              hasWorkspace
                ? `
              <div class="menu-divider"></div>
              <button data-action="set-thumbnail">
                <svg class="menu-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M14.5 3l-6 6-2-2-6 6v1.5h16V3h-2zM2 1a2 2 0 100 4 2 2 0 000-4z"/>
                </svg>
                Set Thumbnail
              </button>
            `
                : ''
            }
          </div>
          <span class="copy-feedback"></span>
        </div>
      `
          : ''
      }
    `;
  }
}

customElements.define('app-header', AppHeader);

export default AppHeader;
