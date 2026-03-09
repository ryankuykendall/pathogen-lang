// History API router for playground
// Uses clean URLs with /svg-path-extended base path

import { store } from '../state/store.js';

// Base path for the playground app
export const BASE_PATH = '/pathogen';

// Route definitions
// Workspace URLs use format: /workspace/slug--id (e.g., /workspace/my-project--abc123)
export const routes = [
  { path: '/', view: 'landing' },
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
export function buildWorkspaceSlugId(slug, id) {
  if (slug) {
    return `${slug}--${id}`;
  }
  return id;
}

// Parse workspace URL segment into slug and id
export function parseWorkspaceSlugId(slugId) {
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
export function parseLocation() {
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
  const query = {};
  const searchParams = new URLSearchParams(location.search);
  for (const [key, value] of searchParams) {
    query[key] = value;
  }

  return { path, query };
}

// Match a path against route patterns
export function matchRoute(path) {
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
function matchPath(pattern, path) {
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

  const params = {};

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
export function getCurrentRoute() {
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

// Navigate to a new route
export function navigateTo(path, options = {}) {
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
function handleRouteChange() {
  const route = getCurrentRoute();

  store.update({
    currentRoute: route.path,
    currentView: route.view,
    routeParams: route.params,
    routeQuery: route.query,
  });
}

// Initialize router
export function initRouter() {
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
export function routeUrl(path, options = {}) {
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
export function shouldHandleLink(element) {
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
