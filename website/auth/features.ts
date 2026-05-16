// Capability resolution for the current user. Admin membership and the
// publishing eligibility check are *server-only* — clients receive an
// opaque list of UserFeature strings via /me and SSR, and gate UI on
// includes() rather than on raw row fields.
//
// Admin identity is sourced from ADMIN_EMAILS (comma-separated env var),
// not the users table, so admin elevation cannot be done by mutating a
// row. The set is evaluated fresh on every request.

import type { AuthEnv, UserRow } from './types.js';
import { UserFeature } from './types.js';

function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user: UserRow, env: AuthEnv): boolean {
  if (!user.verified_at) return false;
  if (user.flagged) return false;
  const admins = parseAdminEmails(env.ADMIN_EMAILS);
  return admins.has(user.email_lower);
}

export function computeUserFeatures(user: UserRow, env: AuthEnv): UserFeature[] {
  const features: UserFeature[] = [];
  if (user.verified_at && !user.flagged) {
    features.push(UserFeature.Publishing);
  }
  if (isAdminUser(user, env)) {
    features.push(UserFeature.AdminModeration);
  }
  return features;
}
