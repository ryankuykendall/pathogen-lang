// URL state encoding/decoding for shareable workspace links
// Uses query params with History API: /svg-path-extended/workspace/:id?state=...

import { getCurrentRoute, navigateTo, routeUrl } from './router.js';

export function encodeState(state) {
  const urlState = {
    code: state.code,
    w: state.width,
    h: state.height,
    s: state.stroke,
    f: state.fillEnabled ? state.fill : null,
    bg: state.background,
    sw: state.strokeWidth,
    ge: state.gridEnabled,
    gc: state.gridColor,
    gs: state.gridSize,
    ao: state.annotatedOpen,
    co: state.consoleOpen,
    zoom: state.zoomLevel,
    panX: state.panX,
    panY: state.panY,
  };
  return btoa(encodeURIComponent(JSON.stringify(urlState)));
}

export function decodeState(encodedState) {
  try {
    const json = decodeURIComponent(atob(encodedState));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// Load state from current URL query params
export function loadFromURL() {
  const route = getCurrentRoute();

  // State is stored in query param
  if (route.query?.state) {
    return decodeState(route.query.state);
  }

  return null;
}

export function applyURLState(urlState, store) {
  if (!urlState) return null;

  const updates = {};

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
export function copyURL(store) {
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
export function updateURLState(store, options = {}) {
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
