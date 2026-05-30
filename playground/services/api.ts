// API client for workspace persistence
// Communicates with CloudFlare Worker endpoints. The base URL is
// substituted at build time (scripts/build-playground.ts) so dev/prod
// can target different origins without code changes.

import { getUserId } from './user-id.js';

// Injected by esbuild's `define` option. Default during dual-running:
// "/pathogen/api" (current Pages worker). Override with PATHOGEN_API_BASE
// env var at build time.
declare const __PATHOGEN_API_BASE__: string;
const API_BASE = __PATHOGEN_API_BASE__;

interface ApiError extends Error {
  kind: 'network' | 'http';
  status?: number;
  data?: unknown;
  apiBase?: string;
  url?: string;
}

function isLocalApiBase(base: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(base);
}

function networkErrorMessage(base: string): string {
  if (isLocalApiBase(base)) {
    return `Could not reach the API at ${base}. Is the dev API Worker running? Try \`npm run dev:api\` or \`npm run dev:stack\` to start both Pages and API together.`;
  }
  return `Could not reach the API at ${base}. Check your network connection and the browser DevTools Network tab for details.`;
}

// Make API request with user ID header
async function apiRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const userId = getUserId();
  const url = `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      // Cross-origin auth (when API_BASE points at api.pathogen.studio) needs
      // explicit credentials mode for the session cookie to ride along. Same
      // flag is harmless for same-origin calls.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        ...options.headers,
      },
    });
  } catch (cause) {
    // `fetch()` throws TypeError before producing a Response when the request
    // never lands (connection refused, CORS preflight rejected, DNS, etc.).
    // Tag the error so the UI can render a useful message instead of the
    // raw "Failed to fetch" string.
    const error: ApiError = Object.assign(new Error(networkErrorMessage(API_BASE)), {
      kind: 'network' as const,
      apiBase: API_BASE,
      url,
      cause,
    });
    throw error;
  }

  // Parse response
  const data = await response.json();

  // Check for errors
  if (!response.ok) {
    const error: ApiError = Object.assign(new Error(data.error || 'API request failed'), {
      kind: 'http' as const,
      status: response.status,
      data,
    });
    throw error;
  }

  return data;
}

// Workspace API
export const workspaceApi = {
  // List all user workspaces
  async list(): Promise<unknown> {
    return apiRequest('/workspaces');
  },

  // Get a single workspace by ID. Pass adminToken to access any workspace.
  async get(id: string, { adminToken }: { adminToken?: string } = {}): Promise<unknown> {
    const tokenParam = adminToken ? `?token=${encodeURIComponent(adminToken)}` : '';
    return apiRequest(`/workspace/${id}${tokenParam}`);
  },

  // Create a new workspace
  async create(workspace: Record<string, unknown>): Promise<unknown> {
    return apiRequest('/workspace', {
      method: 'POST',
      body: JSON.stringify(workspace),
    });
  },

  // Update a workspace (for autosave). Pass keepalive:true on the leave-the-page
  // flush so the browser still delivers the request after the document starts
  // tearing down — a plain fetch issued during unload is otherwise cancelled,
  // which silently drops the final save.
  async update(
    id: string,
    data: Record<string, unknown>,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<unknown> {
    return apiRequest(`/workspace/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      keepalive,
    });
  },

  // Delete a workspace
  async delete(id: string): Promise<unknown> {
    return apiRequest(`/workspace/${id}`, {
      method: 'DELETE',
    });
  },

  // Copy/duplicate a workspace
  async copy(id: string, newName: string | null = null): Promise<unknown> {
    const body = newName ? { name: newName } : {};
    return apiRequest(`/workspace/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

// Preferences API
export const preferencesApi = {
  // Get user preferences
  async get(): Promise<unknown> {
    return apiRequest('/preferences');
  },

  // Save user preferences
  async save(preferences: Record<string, unknown>): Promise<unknown> {
    return apiRequest('/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },
};

export type ThumbnailKind = 'manual' | 'auto';
export type ThumbnailDeleteKind = 'manual' | 'auto' | 'all';

// Thumbnail API
export const thumbnailApi = {
  // Upload thumbnail blobs (3 sizes). kind=manual (default) stores to the manual
  // layer that takes precedence on read; kind=auto stores to the legacy/auto layer
  // that the idle timer + beforeunload generator write to. Pass adminToken to
  // bypass ownership check.
  async upload(
    workspaceId: string,
    blobs: Record<string, Blob>,
    { adminToken, kind = 'manual' }: { adminToken?: string; kind?: ThumbnailKind } = {},
  ): Promise<unknown> {
    const userId = getUserId();
    const formData = new FormData();
    formData.append('1024', blobs['1024'], '1024.png');
    formData.append('512', blobs['512'], '512.png');
    formData.append('256', blobs['256'], '256.png');

    const params = new URLSearchParams();
    if (adminToken) params.set('token', adminToken);
    params.set('kind', kind);
    const response = await fetch(`${API_BASE}/workspace/${workspaceId}/thumbnail?${params}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'X-User-Id': userId },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      const error: ApiError = new Error(data.error || 'Thumbnail upload failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  },

  // Get thumbnail URL for a workspace. The server picks manual over auto.
  url(workspaceId: string, size: number = 256): string {
    return `${API_BASE}/thumbnail/${workspaceId}/${size}`;
  },

  // Delete thumbnails. kind=manual (default) clears just the manual layer,
  // revealing the auto layer if one exists. kind=auto or kind=all delete more.
  async delete(workspaceId: string, { kind = 'manual' }: { kind?: ThumbnailDeleteKind } = {}): Promise<unknown> {
    return apiRequest(`/workspace/${workspaceId}/thumbnail?kind=${kind}`, {
      method: 'DELETE',
    });
  },
};

export default {
  workspaceApi,
  preferencesApi,
  thumbnailApi,
};
