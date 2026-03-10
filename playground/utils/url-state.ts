// URL state encoding/decoding for shareable workspace links
// Uses query params with History API: /svg-path-extended/workspace/:id?state=...

import { getCurrentRoute, navigateTo, routeUrl } from './router.js';

interface URLState {
  code?: string;
  w?: number;
  h?: number;
  s?: string;
  f?: string | null;
  bg?: string;
  sw?: number;
  ge?: boolean;
  gc?: string;
  gs?: number;
  ao?: boolean;
  co?: boolean;
  zoom?: number;
  panX?: number;
  panY?: number;
}

interface Storelike {
  getAll(): Record<string, unknown>;
  update(updates: Record<string, unknown>): void;
}

export function encodeState(state: Record<string, unknown>): string {
  const urlState: URLState = {
    code: state.code as string,
    w: state.width as number,
    h: state.height as number,
    s: state.stroke as string,
    f: (state.fillEnabled ? state.fill : null) as string | null,
    bg: state.background as string,
    sw: state.strokeWidth as number,
    ge: state.gridEnabled as boolean,
    gc: state.gridColor as string,
    gs: state.gridSize as number,
    ao: state.annotatedOpen as boolean,
    co: state.consoleOpen as boolean,
    zoom: state.zoomLevel as number,
    panX: state.panX as number,
    panY: state.panY as number,
  };
  return btoa(encodeURIComponent(JSON.stringify(urlState)));
}

export function decodeState(encodedState: string): URLState | null {
  try {
    const json = decodeURIComponent(atob(encodedState));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// Load state from current URL query params
export function loadFromURL(): URLState | null {
  const route = getCurrentRoute();

  // State is stored in query param
  if (route.query?.state) {
    return decodeState(route.query.state);
  }

  return null;
}

export function applyURLState(urlState: URLState | null, store: Storelike): string | null {
  if (!urlState) return null;

  const updates: Record<string, unknown> = {};

  if (urlState.w) updates.width = urlState.w;
  if (urlState.h) updates.height = urlState.h;
  if (urlState.s) updates.stroke = urlState.s;
  if (urlState.f) {
    updates.fillEnabled = true;
    updates.fill = urlState.f;
  }
  if (urlState.bg) updates.background = urlState.bg;
  if (urlState.sw) updates.strokeWidth = urlState.sw;
  if (urlState.ge !== undefined) updates.gridEnabled = urlState.ge;
  if (urlState.gc) updates.gridColor = urlState.gc;
  if (urlState.gs) updates.gridSize = urlState.gs;
  if (urlState.ao) updates.annotatedOpen = urlState.ao;
  if (urlState.co) updates.consoleOpen = urlState.co;
  if (urlState.zoom) updates.zoomLevel = urlState.zoom;
  if (urlState.panX) updates.panX = urlState.panX;
  if (urlState.panY) updates.panY = urlState.panY;

  store.update(updates);

  return urlState.code || null;
}

// Copy shareable URL to clipboard
export function copyURL(store: Storelike): Promise<void> {
  const state = store.getAll();
  const route = getCurrentRoute();
  const encodedState = encodeState(state);

  // Build URL with current workspace ID if available
  const workspaceId = route.params?.id || 'new';
  const url =
    location.origin +
    routeUrl('/workspace/:id', {
      params: { id: workspaceId },
      query: { state: encodedState },
    });

  return navigator.clipboard.writeText(url);
}

// Update URL with current state without adding history entry
export function updateURLState(
  store: Storelike,
  options: { addToHistory?: boolean } = {},
): void {
  const { addToHistory = false } = options;
  const state = store.getAll();
  const encodedState = encodeState(state);
  const route = getCurrentRoute();

  // Only update if we're on the workspace route
  if (route.view === 'workspace') {
    navigateTo('/workspace/:id', {
      params: route.params,
      query: { state: encodedState },
      replace: !addToHistory,
    });
  }
}
