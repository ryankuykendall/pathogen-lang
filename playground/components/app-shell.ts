// App Shell - Root component with router
// Renders the appropriate view based on current route

import { store } from '../state/store.js';
import { initRouter, navigateTo } from '../utils/router.js';
import './app-header.js';
import './app-breadcrumb.js';
import './views/admin-thumbnails-view.js';
import './views/blog-post-view.js';
import './views/blog-view.js';
import './views/docs-view.js';
import './views/landing-view.js';
import './views/new-workspace-view.js';
import './views/preferences-view.js';
import './views/storybook-view.js';
import './views/storybook-detail-view.js';
import './workspace-view.js';
import styles from './app-shell.css';

interface NavigateDetail {
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

class AppShell extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private cleanupRouter: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupRouter();
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.cleanupRouter) {
      this.cleanupRouter();
    }
  }

  setupRouter(): void {
    // Initialize the router
    this.cleanupRouter = initRouter();

    // Subscribe to route changes
    this.unsubscribe = store.subscribe(['currentView'], () => {
      this.updateActiveView();
    });

    // Initial view update
    this.updateActiveView();
  }

  setupEventListeners(): void {
    // Listen for navigate events from child components
    this.shadowRoot!.addEventListener('navigate', (e: Event) => {
      const { path, params, query } = (e as CustomEvent<NavigateDetail>).detail;
      navigateTo(path, { params, query });
    });

    // Intercept link clicks for SPA navigation
    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (link && this.shouldHandleLink(link)) {
        e.preventDefault();
        const href = link.getAttribute('href')!;
        navigateTo(href);
      }
    });
  }

  shouldHandleLink(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute('href');
    if (!href) return false;
    if (link.target === '_blank') return false;
    if (href.startsWith('http://') || href.startsWith('https://')) return false;
    if (href.startsWith('javascript:')) return false;
    if (href.startsWith('#')) return false;
    // SEO pages are full page loads, not SPA-routed
    const seoPages = ['/pathogen/docs', '/pathogen/explore', '/pathogen/featured'];
    if (seoPages.some((p) => href === p || href.startsWith(`${p}/`))) return false;
    return true;
  }

  updateActiveView(): void {
    const view = store.get('currentView') as string;
    const main = this.shadowRoot!.querySelector('main');

    if (!main) return;

    // Update active class on view components
    const views = main.querySelectorAll(':scope > *');
    views.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      const isActive = this.isViewActive(tagName, view);
      el.classList.toggle('active', isActive);
    });
  }

  isViewActive(tagName: string, currentView: string): boolean {
    // Map tag names to view names
    const mappings: Record<string, string> = {
      'landing-view': 'landing',
      'new-workspace-view': 'new-workspace',
      'workspace-view': 'workspace',
      'preferences-view': 'preferences',
      'docs-view': 'docs',
      'storybook-view': 'storybook',
      'storybook-detail-view': 'storybook-detail',
      'blog-view': 'blog',
      'blog-post-view': 'blog-post',
      'admin-thumbnails-view': 'admin-thumbnails',
    };
    return mappings[tagName] === currentView;
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <link rel="stylesheet" href="styles/shell.css">

      <app-header></app-header>
      <app-breadcrumb></app-breadcrumb>

      <main>
        <landing-view></landing-view>
        <new-workspace-view></new-workspace-view>
        <workspace-view></workspace-view>
        <preferences-view></preferences-view>
        <docs-view></docs-view>
        <storybook-view></storybook-view>
        <storybook-detail-view></storybook-detail-view>
        <blog-view></blog-view>
        <blog-post-view></blog-post-view>
        <admin-thumbnails-view></admin-thumbnails-view>
      </main>
    `;
  }
}

customElements.define('app-shell', AppShell);

export default AppShell;
