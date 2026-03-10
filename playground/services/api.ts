// API client for workspace persistence
// Communicates with CloudFlare Worker endpoints

import { getUserId } from './user-id.js';
import { BASE_PATH } from '../utils/router.js';

// API base URL
const API_BASE = `${BASE_PATH}/api`;

interface ApiError extends Error {
  status?: number;
  data?: unknown;
}

// Make API request with user ID header
async function apiRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const userId = getUserId();
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...options.headers,
    },
  });

  // Parse response
  const data = await response.json();

  // Check for errors
  if (!response.ok) {
    const error: ApiError = new Error(data.error || 'API request failed');
    error.status = response.status;
    error.data = data;
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

  // Update a workspace (for autosave)
  async update(id: string, data: Record<string, unknown>): Promise<unknown> {
    return apiRequest(`/workspace/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
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

// Thumbnail API
export const thumbnailApi = {
  // Upload thumbnail blobs (3 sizes). Pass adminToken to bypass ownership check.
  async upload(
    workspaceId: string,
    blobs: Record<string, Blob>,
    { adminToken }: { adminToken?: string } = {},
  ): Promise<unknown> {
    const userId = getUserId();
    const formData = new FormData();
    formData.append('1024', blobs['1024'], '1024.png');
    formData.append('512', blobs['512'], '512.png');
    formData.append('256', blobs['256'], '256.png');

    const tokenParam = adminToken ? `?token=${encodeURIComponent(adminToken)}` : '';
    const response = await fetch(`${API_BASE}/workspace/${workspaceId}/thumbnail${tokenParam}`, {
      method: 'PUT',
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

  // Get thumbnail URL for a workspace
  url(workspaceId: string, size: number = 256): string {
    return `${API_BASE}/thumbnail/${workspaceId}/${size}`;
  },

  // Delete thumbnails for a workspace
  async delete(workspaceId: string): Promise<unknown> {
    return apiRequest(`/workspace/${workspaceId}/thumbnail`, {
      method: 'DELETE',
    });
  },
};

export default {
  workspaceApi,
  preferencesApi,
  thumbnailApi,
};
