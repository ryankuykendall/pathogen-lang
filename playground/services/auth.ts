// Client-side auth API.
// Talks to /pathogen/api/auth/* and /pathogen/api/me. The session cookie is
// set/cleared by the server; we just need to send credentials on each request
// (same-origin includes cookies by default; we set credentials anyway for
// clarity and to be robust to future cross-origin previews).

import { store } from '../state/store.js';
import { BASE_PATH } from '../utils/router.js';
import {
  clearAuthenticatedUserId,
  markEverSignedIn,
  setAuthenticatedUserId,
} from './user-id.js';

const API_BASE = `${BASE_PATH}/api`;

export interface CurrentUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
}

export interface VerifyResponse {
  ok: true;
  firstTime: boolean;
  currentUser: CurrentUser;
  claimableWorkspaceCount: number;
}

export interface MeResponse {
  currentUser: CurrentUser | null;
}

export interface ClaimResponse {
  ok: true;
  claimed: number;
  skipped: number;
}

class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* leave null */
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new AuthError(message, res.status);
  }
  return body as T;
}

export const authApi = {
  async start(email: string, displayName: string): Promise<{ ok: true }> {
    return authFetch<{ ok: true }>('/auth/start', {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    });
  },

  async verify(email: string, code: string, anonymousUserId: string | null): Promise<VerifyResponse> {
    return authFetch<VerifyResponse>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, anonymousUserId: anonymousUserId || '' }),
    });
  },

  async logout(): Promise<{ ok: true }> {
    return authFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
  },

  async me(): Promise<MeResponse> {
    return authFetch<MeResponse>('/me', { method: 'GET' });
  },

  async claim(anonymousUserId: string): Promise<ClaimResponse> {
    return authFetch<ClaimResponse>('/auth/claim', {
      method: 'POST',
      body: JSON.stringify({ anonymousUserId }),
    });
  },
};

export { AuthError };

// Sync server-confirmed currentUser into store + localStorage.
function applyCurrentUser(user: CurrentUser | null): void {
  if (user) {
    setAuthenticatedUserId(user.id);
    markEverSignedIn();
    store.set('currentUser', user as unknown);
  } else {
    clearAuthenticatedUserId();
    store.set('currentUser', null);
  }
}

// Called on app boot — best-effort, never throws.
export async function bootstrapCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { currentUser } = await authApi.me();
    applyCurrentUser(currentUser);
    return currentUser;
  } catch {
    applyCurrentUser(null);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    /* server-side may already be gone; clear locally regardless */
  }
  applyCurrentUser(null);
  // Hard reload to /pathogen/ so any in-memory workspace list, autosave
  // state, and stale store data is wiped. Lands the user on the
  // unauthenticated workspaces page with a clean slate.
  window.location.href = `${BASE_PATH}/`;
}

export function applyVerifyResponse(res: VerifyResponse): void {
  applyCurrentUser(res.currentUser);
  if (res.claimableWorkspaceCount > 0) {
    // Snapshot the anon id so the claim prompt can use it even after the
    // header user-id has flipped to the authenticated id.
    store.update({
      pendingClaimCount: res.claimableWorkspaceCount,
    });
  }
}
