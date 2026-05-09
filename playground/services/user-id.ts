// User ID service.
//
// Returns the X-User-Id sent on every API call. Order of preference:
//   1. Authenticated user id (set after a successful /auth/verify, kept in
//      localStorage so the header stays consistent across page loads).
//   2. Anonymous nano-ID (the original behaviour). Generated on first use
//      and persisted; kept *forever* so signing out restores access to any
//      anonymous workspaces created before signing in.
//
// The session cookie (pathogen_session) is what actually authenticates the
// user server-side — the header alone never grants access to a real account
// (the server cross-checks the user id against the D1 users table).

import { generateNanoId } from '../utils/nano-id.js';

const ANON_KEY = 'pathogen-lang:userId';
const AUTHED_KEY = 'pathogen:authedUserId';
const EVER_SIGNED_IN_KEY = 'pathogen:hasSignedInBefore';
const ID_LENGTH = 21;

function isValidAnonId(id: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length !== ID_LENGTH) return false;
  return /^[0-9A-Za-z_~-]+$/.test(id);
}

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable */
  }
}

function deleteLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
}

export function getAnonymousUserId(): string {
  let userId = readLocalStorage(ANON_KEY);
  if (!isValidAnonId(userId)) {
    userId = generateNanoId();
    writeLocalStorage(ANON_KEY, userId);
  }
  return userId!;
}

export function getAuthenticatedUserId(): string | null {
  const id = readLocalStorage(AUTHED_KEY);
  return id && id.length > 0 ? id : null;
}

export function setAuthenticatedUserId(id: string): void {
  writeLocalStorage(AUTHED_KEY, id);
}

export function clearAuthenticatedUserId(): void {
  deleteLocalStorage(AUTHED_KEY);
}

// "Ever signed in on this browser" — survives sign-out, so the auth modal
// knows it can hide the display-name field for a returning user (the server
// already has their display name from the first signin).
export function markEverSignedIn(): void {
  writeLocalStorage(EVER_SIGNED_IN_KEY, '1');
}

export function hasEverSignedIn(): boolean {
  return readLocalStorage(EVER_SIGNED_IN_KEY) === '1';
}

// Returns the effective user id used for the X-User-Id header.
export function getUserId(): string {
  const authed = getAuthenticatedUserId();
  if (authed) return authed;
  return getAnonymousUserId();
}

// Used by the claim flow — it needs to know the anon id even after sign-in.
export function peekAnonymousUserId(): string | null {
  const id = readLocalStorage(ANON_KEY);
  return isValidAnonId(id) ? id : null;
}

export function clearUserId(): void {
  deleteLocalStorage(ANON_KEY);
  deleteLocalStorage(AUTHED_KEY);
  deleteLocalStorage(EVER_SIGNED_IN_KEY);
}

export function hasUserId(): boolean {
  return getAuthenticatedUserId() !== null || isValidAnonId(readLocalStorage(ANON_KEY));
}

export default {
  getUserId,
  getAnonymousUserId,
  getAuthenticatedUserId,
  setAuthenticatedUserId,
  clearAuthenticatedUserId,
  markEverSignedIn,
  hasEverSignedIn,
  peekAnonymousUserId,
  clearUserId,
  hasUserId,
};
