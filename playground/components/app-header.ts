// App Header — top navigation (SPA shadow-DOM render path).
//
// Both the SPA and server-rendered static pages produce an identical
// <header class="site-header"> structure. The HTML template lives in
// playground/utils/site-header-template.ts; the CSS lives in
// playground/styles/site-header.css. This component inlines the CSS
// into its shadow root, queries the template for current pathname,
// and dispatches `navigate` events for SPA-internal tabs (Workspaces,
// Blog, Preferences) that have an `spaRoute` defined.

import { store } from '../state/store.js';
import { themeManager } from '../utils/theme.js';
import { siteHeaderHtml } from '../utils/site-header-template.js';
import './shared/account-menu.js';
import './shared/theme-toggle.js';
import styles from '../styles/site-header.css';

class AppHeader extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private _themeUnsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();

    // Re-render the active-link state when the route changes; the rest of
    // the top nav is invariant across routes (anti-shift contract).
    this.unsubscribe = store.subscribe(['currentView'], () => {
      this.render();
      this.setupEventListeners();
    });

    this._themeUnsubscribe = themeManager.subscribe(() => {});
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this._themeUnsubscribe?.();
  }

  setupEventListeners(): void {
    this.shadowRoot!.addEventListener('theme-change', (e: Event) => {
      themeManager.setPreference((e as CustomEvent<{ preference: string }>).detail.preference as any);
    });

    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const navLink = target.closest('[data-route]') as HTMLElement | null;
      if (!navLink) return;

      e.preventDefault();
      const path = navLink.dataset.route!;
      this.dispatchEvent(
        new CustomEvent('navigate', {
          bubbles: true,
          composed: true,
          detail: { path, params: {} },
        }),
      );
    });
  }

  render(): void {
    const pathname =
      typeof window !== 'undefined' && window.location ? window.location.pathname : '/';

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      ${siteHeaderHtml({ pathname, context: 'spa', includeAccountMenu: true })}
    `;
  }
}

customElements.define('app-header', AppHeader);
