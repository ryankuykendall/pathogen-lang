// Pure HTML template for the site-wide top navigation header.
// Used by:
//   • <app-header> (SPA, shadow DOM render path)
//   • scripts/build-docs.ts (static docs pages)
//   • scripts/build-blog.ts (static blog index + posts)
//   • website/_worker.ts (dynamic /pathogen/explore + /pathogen/featured)
//
// Rendering the same HTML in every context guarantees visual + structural
// parity (anti-shift contract) and lets crawlers see the global nav on
// every server-rendered route.

import { TOP_NAV_TABS, isTabActive, type TopNavTab } from './top-nav-tabs.js';

export interface SiteHeaderOptions {
  /**
   * The current URL pathname. For SPA usage, derived from window.location;
   * for static pages, supplied at build time. Used to mark the active tab.
   */
  pathname: string;
  /**
   * `'spa'` makes the active tab a `<button data-route>` for SPA routes
   * (so the SPA router can intercept clicks); `'static'` makes every tab
   * a plain `<a href>` so server-rendered pages always full-reload.
   * The SPA renders 'spa'; the build scripts render 'static'.
   */
  context: 'spa' | 'static';
  /**
   * Whether to render <account-menu>. The SPA has it; static pages opt in
   * if they include the account-menu script tag in their head. Default true
   * so the right cluster width matches across all routes (anti-shift).
   */
  includeAccountMenu?: boolean;
}

function tabHtml(tab: TopNavTab, opts: SiteHeaderOptions): string {
  const active = isTabActive(tab, opts.pathname);
  const cls = active ? 'nav-link active' : 'nav-link';
  // SPA mode + spaRoute → render as button so the SPA router intercepts the
  // click. Static mode (or SPA mode for tabs without an spaRoute) → plain <a>.
  if (opts.context === 'spa' && tab.spaRoute !== undefined) {
    return `<button class="${cls}" data-route="${tab.spaRoute}">${tab.label}</button>`;
  }
  return `<a class="${cls}" href="${tab.href}">${tab.label}</a>`;
}

/**
 * Returns the full <header class="site-header">…</header> HTML string.
 * Caller is responsible for ensuring the corresponding stylesheet
 * (/pathogen/styles/site-header.css) is loaded — either via <link> on
 * static pages or via inline <style> in shadow DOM.
 */
export function siteHeaderHtml(opts: SiteHeaderOptions): string {
  const includeAccountMenu = opts.includeAccountMenu ?? true;
  const tabs = TOP_NAV_TABS.map((tab) => tabHtml(tab, opts)).join('\n          ');

  return `<header class="site-header">
  <div class="site-header-inner">
    <a class="logo" href="/pathogen/">
      <span class="logo-main">Pathogen <em>Studio</em></span>
      <span class="logo-sub">built on svg-path-extended v1.0</span>
    </a>
    <nav class="tabs-wrap" aria-label="Primary">
          ${tabs}
    </nav>
    <div class="actions">
      <theme-toggle></theme-toggle>${includeAccountMenu ? '\n      <account-menu></account-menu>' : ''}
    </div>
  </div>
</header>`;
}
