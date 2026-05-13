// Resolve the effective user id for an authenticated/anonymous request.
//
// Order of precedence:
//   1. Valid session cookie -> the session's user id (cannot be spoofed via header).
//   2. X-User-Id header that DOES NOT correspond to a real user row ->
//      the header value (preserves the anonymous nano-ID path for users
//      without an account).
//   3. X-User-Id header that DOES correspond to a real user row, but no
//      valid session -> null. This is the impersonation case we explicitly
//      reject; without this check, anyone who learns a user's id (via
//      /u/:handle, public:workspaces, etc.) could mutate that user's
//      workspaces.
//   4. No header, no session -> null.

import { getSessionUserId, readSessionTokenFromRequest } from './session.js';
import type { AuthEnv } from './types.js';
import { findUserById } from './users.js';

export async function getEffectiveUserId(
  request: Request,
  env: AuthEnv,
): Promise<string | null> {
  const token = readSessionTokenFromRequest(request);
  if (token && env.USERS_DB) {
    try {
      const sessionUserId = await getSessionUserId(env.USERS_DB, token);
      if (sessionUserId) return sessionUserId;
    } catch {
      // D1 query failed (commonly: local dev with no migrations applied).
      // Fall through to the header path so an anonymous user with a stale
      // session cookie can still use the playground.
    }
  }
  const headerId = request.headers.get('X-User-Id');
  if (!headerId) return null;
  if (env.USERS_DB) {
    try {
      const user = await findUserById(env.USERS_DB, headerId);
      if (user) return null;
    } catch {
      // If D1 is unreachable, fall through to header. Keeps the anonymous
      // path working in dev environments where USERS_DB isn't bound yet.
    }
  }
  return headerId;
}
