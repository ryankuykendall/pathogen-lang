// CRUD helpers for the users table.

import type { AuthEnv, D1Database, UserRow, CurrentUser } from './types.js';
import { computeUserFeatures } from './features.js';
import { findAvailableHandle } from './handle.js';

export function toCurrentUser(row: UserRow, env: AuthEnv): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.display_name,
    features: computeUserFeatures(row, env),
  };
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE email_lower = ?')
    .bind(email.toLowerCase())
    .first<UserRow>();
}

export async function findUserByHandle(db: D1Database, handle: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE handle = ?')
    .bind(handle)
    .first<UserRow>();
}

export async function createUserWithDerivedHandle(
  db: D1Database,
  args: { id: string; email: string; displayName: string },
): Promise<UserRow> {
  const handle = await findAvailableHandle(db, args.displayName);
  const now = Date.now();
  const emailLower = args.email.toLowerCase();
  await db
    .prepare(
      `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(args.id, args.email, emailLower, handle, args.displayName, now, now)
    .run();
  const row = await findUserById(db, args.id);
  if (!row) throw new Error('User insert succeeded but row missing');
  return row;
}

export async function markVerified(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET verified_at = ? WHERE id = ?')
    .bind(Date.now(), userId)
    .run();
}

export async function setUserFlag(
  db: D1Database,
  userId: string,
  flagged: boolean,
  notes: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE users SET flagged = ?, flag_notes = ? WHERE id = ?')
    .bind(flagged ? 1 : 0, flagged ? notes : null, userId)
    .run();
}
