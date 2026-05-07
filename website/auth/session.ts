// Opaque session tokens persisted in D1 with a session cookie.
//
// Cookie config: HttpOnly + SameSite=Lax + Path=/ + Secure conditional on
// env.PRODUCTION (so localhost over HTTP still works in dev). We deliberately
// don't use the __Host- prefix because that requires Secure unconditionally.

import type { D1Database, AuthEnv, SessionRow } from './types.js';

export const SESSION_COOKIE_NAME = 'pathogen_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  await db
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, userId, now, expiresAt)
    .run();
  return token;
}

export async function getSessionUserId(db: D1Database, token: string): Promise<string | null> {
  if (!token) return null;
  const row = await db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<{ user_id: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await revokeSession(db, token);
    return null;
  }
  return row.user_id;
}

export async function revokeSession(db: D1Database, token: string): Promise<void> {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function revokeAllSessions(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export function readSessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function buildSetSessionCookie(token: string, env: AuthEnv): string {
  const secure = env.PRODUCTION ? '; Secure' : '';
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ') + secure;
}

export function buildClearSessionCookie(env: AuthEnv): string {
  const secure = env.PRODUCTION ? '; Secure' : '';
  return [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; ') + secure;
}

export type { SessionRow };
