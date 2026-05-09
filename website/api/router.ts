// Workspace, preferences, thumbnail, and admin API handlers + the request
// dispatcher. Auth/identity routes (`/auth/*`, `/me`, `/u/:handle`) are
// dispatched here too but live in the `website/auth/` module — this router
// only adapts them.
//
// Responses returned by every handler are intentionally CORS-naked. Each
// Worker entry point (Pages `_worker.ts` or the new API Worker
// `api/src/index.ts`) wraps the final response with its own CORS policy.

import {
  handleAuthClaim,
  handleAuthLogout,
  handleAuthStart,
  handleAuthVerify,
  handleMe,
  handlePublicProfile,
} from '../auth/handlers.js';
import { getEffectiveUserId } from '../auth/effective-id.js';
import { addToPublicIndex, removeFromPublicIndex, updatePublicIndex } from './public-index.js';
import type { Env, Workspace, WorkspaceListing } from './types.js';
import { errorResponse, generateNanoId, hashContent, jsonResponse, slugify } from './utils.js';

// Each handler signature: (request, env, ...captures) => Promise<Response>.
// `captures` are the regex capture groups from the route match (e.g. workspace id, thumbnail size).
export const apiHandlers: Record<string, (request: Request, env: Env, ...args: string[]) => Promise<Response>> = {
  // GET /api/workspaces — list current user's workspaces (metadata only).
  async listWorkspaces(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    if (!env.WORKSPACES) {
      return errorResponse('KV namespace WORKSPACES not bound. Check Cloudflare Pages settings.', 500);
    }

    try {
      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];

      const workspaces = await Promise.all(
        workspaceIds.map(async (id: string) => {
          const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
          if (!wsJson) return null;
          const ws: Workspace = JSON.parse(wsJson);
          const listing: WorkspaceListing = {
            id: ws.id,
            slug: ws.slug,
            name: ws.name,
            description: ws.description,
            isPublic: ws.isPublic,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            thumbnailAt: ws.thumbnailAt || null,
          };
          return listing;
        }),
      );

      return jsonResponse(workspaces.filter(Boolean));
    } catch (err) {
      return errorResponse('Failed to list workspaces: ' + (err as Error).message, 500);
    }
  },

  // POST /api/workspace — create a new workspace.
  async createWorkspace(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const { name, description, code, isPublic, preferences } = body as {
        name?: string;
        description?: string;
        code?: string;
        isPublic?: boolean;
        preferences?: Record<string, unknown>;
      };

      if (!name?.trim()) return errorResponse('Workspace name is required');

      const id = generateNanoId();
      const slug = slugify(name);
      const now = new Date().toISOString();
      const contentHash = await hashContent(code || '');

      const workspace: Workspace = {
        id,
        slug,
        userId,
        name: name.trim(),
        description: (description as string | undefined)?.trim() || '',
        code: code || '',
        isPublic: Boolean(isPublic),
        preferences: preferences || {},
        createdAt: now,
        updatedAt: now,
        contentHash,
        thumbnailAt: null,
      };

      await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      workspaceIds.unshift(id);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(workspaceIds));

      if (workspace.isPublic) {
        await addToPublicIndex(env, workspace);
      }

      return jsonResponse(workspace, 201);
    } catch (err) {
      return errorResponse('Failed to create workspace: ' + (err as Error).message, 500);
    }
  },

  // GET /api/workspace/:id — load workspace, with public/admin/owner access checks.
  async getWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const workspace: Workspace = JSON.parse(wsJson);
      const userId = await getEffectiveUserId(request, env);
      const url = new URL(request.url);
      const adminToken = url.searchParams.get('token');
      const isAdmin = adminToken && env.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN;

      if (!isAdmin && !workspace.isPublic && workspace.userId !== userId) {
        return errorResponse('Access denied', 403);
      }

      return jsonResponse(workspace);
    } catch (err) {
      return errorResponse('Failed to load workspace: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/workspace/:id — update workspace (autosave). Dirty-checks via contentHash.
  async updateWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      const body = (await request.json()) as Record<string, unknown>;
      const { name, description, code, isPublic, preferences } = body as {
        name?: string;
        description?: string;
        code?: string;
        isPublic?: boolean;
        preferences?: Record<string, unknown>;
      };

      if (code !== undefined) {
        const newHash = await hashContent(code);
        if (newHash === workspace.contentHash) {
          return jsonResponse({ ...workspace, skipped: true });
        }
        workspace.code = code;
        workspace.contentHash = newHash;
      }

      if (name !== undefined) {
        workspace.name = name.trim();
        workspace.slug = slugify(name);
      }
      if (description !== undefined) workspace.description = description.trim();
      if (isPublic !== undefined) workspace.isPublic = Boolean(isPublic);
      if (preferences !== undefined) {
        workspace.preferences = { ...(workspace.preferences || {}), ...preferences };
      }

      workspace.updatedAt = new Date().toISOString();

      await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));
      await updatePublicIndex(env, workspace);

      return jsonResponse(workspace);
    } catch (err) {
      return errorResponse('Failed to update workspace: ' + (err as Error).message, 500);
    }
  },

  // DELETE /api/workspace/:id — owner-only delete; cascades to public index + thumbnails.
  async deleteWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      await env.WORKSPACES.delete(`workspace:${id}`);

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      const updatedIds = workspaceIds.filter((wsId: string) => wsId !== id);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(updatedIds));

      if (workspace.isPublic) {
        await removeFromPublicIndex(env, id);
      }

      return jsonResponse({ success: true });
    } catch (err) {
      return errorResponse('Failed to delete workspace: ' + (err as Error).message, 500);
    }
  },

  // POST /api/workspace/:id/copy — duplicate a workspace into the current user's account.
  async copyWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const original: Workspace = JSON.parse(wsJson);
      if (!original.isPublic && original.userId !== userId) {
        return errorResponse('Access denied', 403);
      }

      const body = ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
      const newName = (body.name as string) || `${original.name} (Copy)`;

      const newId = generateNanoId();
      const now = new Date().toISOString();

      const newWorkspace: Workspace = {
        ...original,
        id: newId,
        slug: slugify(newName),
        userId,
        name: newName,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      };

      await env.WORKSPACES.put(`workspace:${newId}`, JSON.stringify(newWorkspace));

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      workspaceIds.unshift(newId);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(workspaceIds));

      return jsonResponse(newWorkspace, 201);
    } catch (err) {
      return errorResponse('Failed to copy workspace: ' + (err as Error).message, 500);
    }
  },

  // GET /api/preferences
  async getPreferences(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const prefsJson = await env.WORKSPACES.get(`user:${userId}:preferences`);
      const preferences: Record<string, unknown> = prefsJson ? JSON.parse(prefsJson) : null;
      return jsonResponse(preferences || {});
    } catch (err) {
      return errorResponse('Failed to get preferences: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/preferences
  async savePreferences(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const preferences = await request.json();
      await env.WORKSPACES.put(`user:${userId}:preferences`, JSON.stringify(preferences));
      return jsonResponse(preferences);
    } catch (err) {
      return errorResponse('Failed to save preferences: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/workspace/:id/thumbnail — upload three sizes (1024/512/256) via FormData.
  async uploadThumbnail(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    const url = new URL(request.url);
    const adminToken = url.searchParams.get('token');
    const isAdmin = adminToken && env.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN;

    if (!userId && !isAdmin) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);
      if (!isAdmin && workspace.userId !== userId) return errorResponse('Access denied', 403);

      const formData = await request.formData();
      const sizes = ['1024', '512', '256'];

      for (const size of sizes) {
        const file = formData.get(size) as File | null;
        if (!file) return errorResponse(`Missing ${size} thumbnail`, 400);
        await env.THUMBNAILS.put(`${id}/${size}.png`, file.stream(), {
          httpMetadata: { contentType: 'image/png' },
        });
      }

      workspace.thumbnailAt = new Date().toISOString();
      await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));

      return jsonResponse({ thumbnailAt: workspace.thumbnailAt });
    } catch (err) {
      return errorResponse('Failed to upload thumbnail: ' + (err as Error).message, 500);
    }
  },

  // GET /api/thumbnail/:id/:size — public read from R2.
  async getThumbnail(_request: Request, env: Env, id: string, size: string): Promise<Response> {
    try {
      const object = await env.THUMBNAILS.get(`${id}/${size}.png`);
      if (!object) return errorResponse('Thumbnail not found', 404);

      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (err) {
      return errorResponse('Failed to get thumbnail: ' + (err as Error).message, 500);
    }
  },

  // DELETE /api/workspace/:id/thumbnail
  async deleteThumbnail(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      const sizes = ['1024', '512', '256'];
      await Promise.all(sizes.map((s: string) => env.THUMBNAILS.delete(`${id}/${s}.png`)));

      workspace.thumbnailAt = null;
      await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));

      return jsonResponse({ success: true });
    } catch (err) {
      return errorResponse('Failed to delete thumbnail: ' + (err as Error).message, 500);
    }
  },

  // GET /api/admin/workspaces-without-thumbnails — admin-token gated.
  async adminListWithoutThumbnails(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token || token !== env.ADMIN_TOKEN) return errorResponse('Unauthorized', 401);

    try {
      const allKeys: { name: string }[] = [];
      let cursor: string | undefined = undefined;
      do {
        const result = await env.WORKSPACES.list({ prefix: 'workspace:', cursor });
        allKeys.push(...result.keys);
        cursor = result.list_complete ? undefined : result.cursor;
      } while (cursor);

      const workspaces: { id: string; name: string; slug: string; userId: string; updatedAt: string }[] = [];
      for (const key of allKeys) {
        const wsJson = await env.WORKSPACES.get(key.name);
        if (!wsJson) continue;
        const ws: Workspace = JSON.parse(wsJson);
        if (!ws.thumbnailAt) {
          workspaces.push({
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
            userId: ws.userId,
            updatedAt: ws.updatedAt,
          });
        }
      }

      return jsonResponse(workspaces);
    } catch (err) {
      return errorResponse('Failed to list workspaces: ' + (err as Error).message, 500);
    }
  },
};

// Dispatcher. The caller (Worker entry point) is responsible for OPTIONS
// preflight handling and applying the appropriate CORS policy to the
// returned Response.
export async function handleApiRequest(request: Request, env: Env, apiPath: string): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // ─── Auth + identity routes ───────────────────────────────────────
  if (apiPath === '/auth/start' && method === 'POST') return handleAuthStart(request, env);
  if (apiPath === '/auth/verify' && method === 'POST') return handleAuthVerify(request, env);
  if (apiPath === '/auth/logout' && method === 'POST') return handleAuthLogout(request, env);
  if (apiPath === '/auth/claim' && method === 'POST') return handleAuthClaim(request, env);
  if (apiPath === '/me' && method === 'GET') return handleMe(request, env);

  const profileMatch = apiPath.match(/^\/u\/([a-z0-9-]+)$/);
  if (profileMatch && method === 'GET') return handlePublicProfile(request, env, profileMatch[1]);

  // ─── Workspaces ───────────────────────────────────────────────────
  if (apiPath === '/workspaces' && method === 'GET') return apiHandlers.listWorkspaces(request, env);
  if (apiPath === '/workspace' && method === 'POST') return apiHandlers.createWorkspace(request, env);

  // ─── Preferences ──────────────────────────────────────────────────
  if (apiPath === '/preferences' && method === 'GET') return apiHandlers.getPreferences(request, env);
  if (apiPath === '/preferences' && method === 'PUT') return apiHandlers.savePreferences(request, env);

  // ─── Workspace by id ──────────────────────────────────────────────
  const workspaceMatch = apiPath.match(/^\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const id = workspaceMatch[1];
    if (method === 'GET') return apiHandlers.getWorkspace(request, env, id);
    if (method === 'PUT') return apiHandlers.updateWorkspace(request, env, id);
    if (method === 'DELETE') return apiHandlers.deleteWorkspace(request, env, id);
  }

  const copyMatch = apiPath.match(/^\/workspace\/([^/]+)\/copy$/);
  if (copyMatch && method === 'POST') return apiHandlers.copyWorkspace(request, env, copyMatch[1]);

  // ─── Thumbnails ───────────────────────────────────────────────────
  const thumbUploadMatch = apiPath.match(/^\/workspace\/([^/]+)\/thumbnail$/);
  if (thumbUploadMatch) {
    const id = thumbUploadMatch[1];
    if (method === 'PUT') return apiHandlers.uploadThumbnail(request, env, id);
    if (method === 'DELETE') return apiHandlers.deleteThumbnail(request, env, id);
  }

  const thumbGetMatch = apiPath.match(/^\/thumbnail\/([^/]+)\/(\d+)$/);
  if (thumbGetMatch && method === 'GET') {
    return apiHandlers.getThumbnail(request, env, thumbGetMatch[1], thumbGetMatch[2]);
  }

  // ─── Admin ────────────────────────────────────────────────────────
  if (apiPath === '/admin/workspaces-without-thumbnails' && method === 'GET') {
    return apiHandlers.adminListWithoutThumbnails(request, env);
  }

  if (apiPath === '/admin/featured' || apiPath.startsWith('/admin/featured/')) {
    const token = url.searchParams.get('token');
    if (!token || token !== env.ADMIN_TOKEN) return errorResponse('Unauthorized', 401);

    if (apiPath === '/admin/featured' && method === 'GET') {
      try {
        const raw = await env.WORKSPACES.get('featured:workspaces');
        return jsonResponse(raw ? JSON.parse(raw) : []);
      } catch {
        return jsonResponse([]);
      }
    }

    if (apiPath === '/admin/featured' && method === 'POST') {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (!body.id) return errorResponse('Missing workspace id');
        const raw = await env.WORKSPACES.get('featured:workspaces');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.includes(body.id as string)) {
          ids.push(body.id as string);
          await env.WORKSPACES.put('featured:workspaces', JSON.stringify(ids));
        }
        return jsonResponse(ids);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }

    if (apiPath === '/admin/featured' && method === 'PUT') {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (!Array.isArray(body.ids)) return errorResponse('Missing ids array');
        await env.WORKSPACES.put('featured:workspaces', JSON.stringify(body.ids));
        return jsonResponse(body.ids);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }

    const featuredDeleteMatch = apiPath.match(/^\/admin\/featured\/([^/]+)$/);
    if (featuredDeleteMatch && method === 'DELETE') {
      try {
        const removeId = featuredDeleteMatch[1];
        const raw = await env.WORKSPACES.get('featured:workspaces');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const filtered = ids.filter((id: string) => id !== removeId);
        await env.WORKSPACES.put('featured:workspaces', JSON.stringify(filtered));
        return jsonResponse(filtered);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }
  }

  return errorResponse('Not found', 404);
}
