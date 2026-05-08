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
   * SPA-internal route key (relative to the /pathogen base) used by
   * <app-header> to dispatch the `navigate` event. Omitted for routes
   * that always do a full page load (Docs, Explore, Featured, Blog).
   */
  spaRoute?: string;
  /**
   * Heuristic for active-state matching against the current URL pathname.
   * Active when pathname.startsWith(prefix). The Workspaces tab uses
   * `/pathogen/` exactly so it isn't always active.
   */
  matchPrefix: string;
  /** Whether the primary match requires exact pathname equality. */
  matchExact?: boolean;
  /**
   * Additional prefixes that should also activate this tab. The Workspaces
   * tab uses this so opening a workspace (`/pathogen/workspace/...`) or
   * creating a new one keeps "Workspaces" highlighted — those routes are
   * still inside the Workspaces section even though their pathname doesn't
   * equal `/pathogen/` exactly.
   */
  additionalPrefixes?: string[];
}

export const TOP_NAV_TABS: TopNavTab[] = [
  {
    label: 'Workspaces',
    href: '/pathogen/workspaces',
    spaRoute: '/workspaces',
    matchPrefix: '/pathogen/workspaces',
    additionalPrefixes: ['/pathogen/workspace/'],
  },
  { label: 'Docs', href: '/pathogen/docs', matchPrefix: '/pathogen/docs' },
  { label: 'Explore', href: '/pathogen/explore', matchPrefix: '/pathogen/explore' },
  { label: 'Featured', href: '/pathogen/featured', matchPrefix: '/pathogen/featured' },
  { label: 'Blog', href: '/pathogen/blog', spaRoute: '/blog', matchPrefix: '/pathogen/blog' },
  {
    label: 'Preferences',
    href: '/pathogen/preferences',
    spaRoute: '/preferences',
    matchPrefix: '/pathogen/preferences',
  },
];

/**
 * Returns true if the given tab should render with the active styling
 * for the supplied pathname (e.g. "/pathogen/docs" or "/pathogen/").
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
