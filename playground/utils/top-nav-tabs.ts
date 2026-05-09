// Single source of truth for the global top navigation tabs.
// Both the SPA's <app-header> and the server-rendered static pages
// (scripts/build-docs.ts, scripts/build-blog.ts, website/_worker.ts)
// generate their nav rows from this list so the visible tab order
// and labels are guaranteed to match across all routes.

export interface TopNavTab {
  /** Visible label shown in the tab row. */
  label: string;
  /** Public URL that crawlers and right-click "Open in new tab" use. */
  href: string;
  /**
   * SPA-internal route key used by <app-header> to dispatch the `navigate`
   * event. Omitted for routes that always do a full page load (Docs,
   * Explore, Featured).
   */
  spaRoute?: string;
  /**
   * Heuristic for active-state matching against the current URL pathname.
   * Active when pathname.startsWith(prefix).
   */
  matchPrefix: string;
  /** Whether the primary match requires exact pathname equality. */
  matchExact?: boolean;
  /**
   * Additional prefixes that should also activate this tab. The Workspaces
   * tab uses this so opening a workspace (`/workspace/...`) or creating a
   * new one keeps "Workspaces" highlighted — those routes are still inside
   * the Workspaces section even though their pathname doesn't start with
   * /workspaces.
   */
  additionalPrefixes?: string[];
}

export const TOP_NAV_TABS: TopNavTab[] = [
  {
    label: 'Workspaces',
    href: '/workspaces',
    spaRoute: '/workspaces',
    matchPrefix: '/workspaces',
    additionalPrefixes: ['/workspace/'],
  },
  { label: 'Docs', href: '/docs', matchPrefix: '/docs' },
  { label: 'Explore', href: '/explore', matchPrefix: '/explore' },
  { label: 'Featured', href: '/featured', matchPrefix: '/featured' },
  { label: 'Blog', href: '/blog', spaRoute: '/blog', matchPrefix: '/blog' },
  {
    label: 'Preferences',
    href: '/preferences',
    spaRoute: '/preferences',
    matchPrefix: '/preferences',
  },
];

/**
 * Returns true if the given tab should render with the active styling
 * for the supplied pathname (e.g. "/docs" or "/").
 */
export function isTabActive(tab: TopNavTab, pathname: string): boolean {
  if (tab.matchExact) {
    if (pathname === tab.matchPrefix || pathname === tab.matchPrefix.replace(/\/$/, '')) {
      return true;
    }
  } else if (pathname.startsWith(tab.matchPrefix)) {
    return true;
  }
  if (tab.additionalPrefixes) {
    for (const prefix of tab.additionalPrefixes) {
      if (pathname.startsWith(prefix)) return true;
    }
  }
  return false;
}
