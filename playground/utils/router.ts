// History API router for playground
// Pathogen Studio is hosted at the apex of pathogen.studio so BASE_PATH is
// empty in production. Old `/pathogen/*` URLs are 301-redirected by the
// Pages worker for backward compat (see website/_worker.ts).

import { store } from '../state/store.js';

// Base path for the playground app. Set to '/pathogen' if you ever want
// to run the SPA under a sub-path again.
export const BASE_PATH = '';

interface RouteDefinition {
  path: string;
  view: string;
}

interface MatchedRoute {
  path: string;
  view: string;
  params: Record<string, string>;
}

interface CurrentRoute {
  path: string;
  fullPath: string;
  view: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

// Route definitions
// Workspace URLs use format: /workspace/slug--id (e.g., /workspace/my-project--abc123)
export const routes: RouteDefinition[] = [
  // /pathogen/ is server-rendered as the marketing homepage; '/' is kept as
  // a defensive fallback in case the SPA shell is ever served at the root.
  { path: '/', view: 'landing' },
  { path: '/workspaces', view: 'landing' },
  { path: '/workspace/new', view: 'new-workspace' }, // Must be before :slugId route
  { path: '/workspace/:slugId', view: 'workspace' }, // Format: slug--id or just id
  { path: '/preferences', view: 'preferences' },
  // /docs is now a static SEO page served by the worker — no SPA route needed
  { path: '/storybook', view: 'storybook-detail' },
  { path: '/storybook/:component', view: 'storybook-detail' },
  { path: '/blog', view: 'blog' },
  { path: '/blog/:slug', view: 'blog-post' },
  { path: '/admin/thumbnails', view: 'admin-thumbnails' },
];

// Build workspace URL segment from slug and id
export function buildWorkspaceSlugId(slug: string | null, id: string): string {
  if (slug) {
    return `${slug}--${id}`;
  }
  return id;
}

// Parse workspace URL segment into slug and id
export function parseWorkspaceSlugId(slugId: string | null | undefined): { slug: string | null; id: string | null } {
  if (!slugId) return { slug: null, id: null };

  // Find the first occurrence of '--' to split slug and id
  const lastDelimiter = slugId.indexOf('--');
  if (lastDelimiter > 0) {
    return {
      slug: slugId.substring(0, lastDelimiter),
      id: slugId.substring(lastDelimiter + 2),
    };
  }
  // No delimiter, treat entire string as id (backward compatibility)
  return { slug: null, id: slugId };
}

// Parse current URL into path and query params
export function parseLocation(): { path: string; query: Record<string, string> } {
  const fullPath = location.pathname;

  // Remove base path prefix
  let path = fullPath;
  if (fullPath.startsWith(BASE_PATH)) {
    path = fullPath.slice(BASE_PATH.length) || '/';
  }

  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  // Parse query params
  const query: Record<string, string> = {};
  const searchParams = new URLSearchParams(location.search);
  for (const [key, value] of searchParams) {
    query[key] = value;
  }

  return { path, query };
}

// Match a path against route patterns
export function matchRoute(path: string): MatchedRoute {
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params !== null) {
      return { ...route, params };
    }
  }
  // Default to landing if no match
  return { path: '/', view: 'landing', params: {} };
}

// Match path against a pattern, extracting params
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  // Handle root path
  if (patternParts.length === 0 && pathParts.length === 0) {
    return {};
  }

  // Check if lengths match
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // This is a param
      const paramName = patternPart.slice(1);
      params[paramName] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      // Static part doesn't match
      return null;
    }
  }

  return params;
}

// Get current route from URL
export function getCurrentRoute(): CurrentRoute {
  const { path, query } = parseLocation();
  const matched = matchRoute(path);

  return {
    path,
    fullPath: location.pathname,
    view: matched.view,
    params: matched.params,
    query,
  };
}

interface NavigateOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  replace?: boolean;
}

// Navigate to a new route
export function navigateTo(path: string, options: NavigateOptions = {}): void {
  const { params = {}, query = {}, replace = false } = options;

  // Build path with params
  let builtPath = path;
  for (const [key, value] of Object.entries(params)) {
    builtPath = builtPath.replace(`:${key}`, encodeURIComponent(value));
  }

  // Build full URL with base path
  let fullPath = BASE_PATH + builtPath;

  // Normalize double slashes
  fullPath = fullPath.replace(/\/+/g, '/');

  // Build query string
  const queryEntries = Object.entries(query).filter(([_, v]) => v != null);
  if (queryEntries.length > 0) {
    fullPath += `?${new URLSearchParams(queryEntries).toString()}`;
  }

  if (replace) {
    history.replaceState(null, '', fullPath);
  } else {
    history.pushState(null, '', fullPath);
  }

  // Trigger route change
  handleRouteChange();
}

// Handle route changes
function handleRouteChange(): void {
  const route = getCurrentRoute();

  store.update({
    currentRoute: route.path,
    currentView: route.view,
    routeParams: route.params,
    routeQuery: route.query,
  });
}

// Initialize router
export function initRouter(): () => void {
  // Handle browser back/forward
  window.addEventListener('popstate', handleRouteChange);

  // Handle initial route
  handleRouteChange();

  // Return cleanup function
  return () => {
    window.removeEventListener('popstate', handleRouteChange);
  };
}

// Generate URL for a route (without navigating)
export function routeUrl(path: string, options: NavigateOptions = {}): string {
  const { params = {}, query = {} } = options;

  let builtPath = path;
  for (const [key, value] of Object.entries(params)) {
    builtPath = builtPath.replace(`:${key}`, encodeURIComponent(value));
  }

  let fullPath = BASE_PATH + builtPath;
  fullPath = fullPath.replace(/\/+/g, '/');

  const queryEntries = Object.entries(query).filter(([_, v]) => v != null);
  if (queryEntries.length > 0) {
    fullPath += `?${new URLSearchParams(queryEntries).toString()}`;
  }

  return fullPath;
}

// Check if a link should be handled by the router
export function shouldHandleLink(element: HTMLElement): boolean {
  // Only handle links to our app
  const href = element.getAttribute('href');
  if (!href) return false;

  // Skip external links
  if (href.startsWith('http://') || href.startsWith('https://')) return false;

  // Skip javascript: links
  if (href.startsWith('javascript:')) return false;

  // Skip anchor links
  if (href.startsWith('#')) return false;

  // Handle links that start with base path or are relative
  return href.startsWith(BASE_PATH) || href.startsWith('/') || !href.includes('://');
}
